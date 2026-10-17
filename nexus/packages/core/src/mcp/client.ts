import { AbortError, isAbort, sleep } from '../http';
import { parseSSE } from '../sse';
import type { FetchLike } from '../types';

export const MCP_PROTOCOL_VERSION = '2025-06-18';
const SUPPORTED_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];

export interface McpTool {
  name: string;
  title?: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; title?: string };
}

export interface McpResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface McpPrompt {
  name: string;
  description?: string;
  arguments?: { name: string; description?: string; required?: boolean }[];
}

export type McpContent =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string }
  | { type: 'audio'; data: string; mimeType: string }
  | { type: 'resource'; resource: { uri: string; text?: string; blob?: string; mimeType?: string } }
  | { type: 'resource_link'; uri: string; name?: string };

export interface McpCallResult {
  content: McpContent[];
  isError?: boolean;
  structuredContent?: unknown;
}

export interface McpServerInfo {
  name: string;
  version: string;
  protocolVersion: string;
  instructions?: string;
  capabilities: Record<string, unknown>;
}

export class McpError extends Error {
  constructor(
    message: string,
    readonly code: number,
    readonly data?: unknown,
  ) {
    super(message);
    this.name = 'McpError';
  }
}

export class McpAuthRequiredError extends Error {
  constructor(
    readonly resourceMetadataUrl: string | undefined,
    readonly wwwAuthenticate: string | null,
  ) {
    super('Требуется авторизация на MCP-сервере');
    this.name = 'McpAuthRequiredError';
  }
}

export interface McpClientOptions {
  url: string;
  transport: 'http' | 'sse';
  headers?: Record<string, string>;
  /** Called per request so refreshed OAuth tokens are picked up. */
  authHeader?: () => Promise<string | undefined>;
  fetch: FetchLike;
  clientName?: string;
  clientVersion?: string;
  timeoutMs?: number;
  onNotification?: (method: string, params: unknown) => void;
}

interface JsonRpcMessage {
  jsonrpc: '2.0';
  id?: number | string | null;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
}

function parseResourceMetadata(h: string | null): string | undefined {
  if (!h) return undefined;
  const m = /resource_metadata="?([^",\s]+)"?/i.exec(h);
  return m?.[1];
}

export class McpClient {
  private nextId = 1;
  private sessionId: string | undefined;
  private protocolVersion = MCP_PROTOCOL_VERSION;
  private info: McpServerInfo | undefined;
  private sseEndpoint: string | undefined;
  private sseAbort: AbortController | undefined;
  private readonly pending = new Map<number | string, Pending>();
  private connected = false;

  constructor(private readonly o: McpClientOptions) {}

  get serverInfo(): McpServerInfo | undefined {
    return this.info;
  }

  get isConnected(): boolean {
    return this.connected;
  }

  private async baseHeaders(): Promise<Record<string, string>> {
    const h: Record<string, string> = { ...(this.o.headers ?? {}) };
    const auth = await this.o.authHeader?.();
    if (auth) h.Authorization = auth;
    return h;
  }

  async connect(signal?: AbortSignal): Promise<McpServerInfo> {
    if (this.o.transport === 'sse') await this.openLegacySse(signal);
    const result = (await this.request(
      'initialize',
      {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: { roots: { listChanged: false } },
        clientInfo: { name: this.o.clientName ?? 'nexus-mobile', version: this.o.clientVersion ?? '1.0.0' },
      },
      signal,
      true,
    )) as { protocolVersion: string; serverInfo?: { name: string; version: string }; capabilities?: Record<string, unknown>; instructions?: string };
    if (!SUPPORTED_VERSIONS.includes(result.protocolVersion)) {
      throw new McpError(`Неподдерживаемая версия протокола MCP: ${result.protocolVersion}`, -32600);
    }
    this.protocolVersion = result.protocolVersion;
    this.info = {
      name: result.serverInfo?.name ?? 'MCP',
      version: result.serverInfo?.version ?? '',
      protocolVersion: result.protocolVersion,
      instructions: result.instructions,
      capabilities: result.capabilities ?? {},
    };
    await this.notify('notifications/initialized');
    this.connected = true;
    return this.info;
  }

  async listTools(signal?: AbortSignal): Promise<McpTool[]> {
    if (this.info && !this.info.capabilities.tools) return [];
    return this.paginate<McpTool>('tools/list', 'tools', signal);
  }

  async listResources(signal?: AbortSignal): Promise<McpResource[]> {
    if (!this.info?.capabilities.resources) return [];
    return this.paginate<McpResource>('resources/list', 'resources', signal);
  }

  async readResource(uri: string, signal?: AbortSignal): Promise<{ contents: { uri: string; text?: string; blob?: string; mimeType?: string }[] }> {
    return (await this.request('resources/read', { uri }, signal)) as { contents: { uri: string; text?: string; blob?: string; mimeType?: string }[] };
  }

  async listPrompts(signal?: AbortSignal): Promise<McpPrompt[]> {
    if (!this.info?.capabilities.prompts) return [];
    return this.paginate<McpPrompt>('prompts/list', 'prompts', signal);
  }

  async getPrompt(name: string, args: Record<string, string>, signal?: AbortSignal): Promise<{ messages: { role: string; content: McpContent }[] }> {
    return (await this.request('prompts/get', { name, arguments: args }, signal)) as { messages: { role: string; content: McpContent }[] };
  }

  async callTool(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<McpCallResult> {
    const r = (await this.request('tools/call', { name, arguments: args }, signal)) as McpCallResult;
    return { content: Array.isArray(r?.content) ? r.content : [], isError: !!r?.isError, structuredContent: r?.structuredContent };
  }

  async ping(signal?: AbortSignal): Promise<void> {
    await this.request('ping', {}, signal);
  }

  async close(): Promise<void> {
    this.connected = false;
    this.sseAbort?.abort();
    this.sseAbort = undefined;
    for (const p of this.pending.values()) p.reject(new AbortError());
    this.pending.clear();
    if (this.o.transport === 'http' && this.sessionId) {
      try {
        await this.o.fetch(this.o.url, { method: 'DELETE', headers: { ...(await this.baseHeaders()), 'Mcp-Session-Id': this.sessionId } });
      } catch {
        // best effort
      }
    }
    this.sessionId = undefined;
  }

  private async paginate<T>(method: string, key: string, signal?: AbortSignal): Promise<T[]> {
    const out: T[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 50; page++) {
      const r = (await this.request(method, cursor ? { cursor } : {}, signal)) as Record<string, unknown>;
      const items = r[key];
      if (Array.isArray(items)) out.push(...(items as T[]));
      cursor = typeof r.nextCursor === 'string' && r.nextCursor ? r.nextCursor : undefined;
      if (!cursor) break;
    }
    return out;
  }

  private async notify(method: string, params?: unknown): Promise<void> {
    const msg: JsonRpcMessage = { jsonrpc: '2.0', method, ...(params !== undefined ? { params } : {}) };
    await this.post(msg, undefined, undefined);
  }

  private async request(method: string, params: unknown, signal?: AbortSignal, initializing = false, retried = false): Promise<unknown> {
    const id = this.nextId++;
    const msg: JsonRpcMessage = { jsonrpc: '2.0', id, method, params };
    const timeout = this.o.timeoutMs ?? 120_000;
    const ctrl = new AbortController();
    const onAbort = () => ctrl.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      if (this.o.transport === 'sse') {
        const p = new Promise<unknown>((resolve, reject) => {
          this.pending.set(id, { resolve, reject });
          ctrl.signal.addEventListener('abort', () => reject(signal?.aborted ? new AbortError() : new McpError(`Таймаут ${method}`, -32001)), { once: true });
        });
        p.catch(() => undefined);
        await this.post(msg, ctrl.signal, id);
        return await p;
      }
      return await this.post(msg, ctrl.signal, id);
    } catch (e) {
      if (e instanceof SessionExpiredError && !initializing && !retried) {
        this.sessionId = undefined;
        await this.connect(signal);
        return this.request(method, params, signal, false, true);
      }
      if (isAbort(e) && !signal?.aborted && ctrl.signal.aborted) throw new McpError(`Таймаут запроса ${method}`, -32001);
      if (method !== 'initialize' && method !== 'ping' && (signal?.aborted || ctrl.signal.aborted)) {
        void this.notify('notifications/cancelled', { requestId: id, reason: 'cancelled' }).catch(() => undefined);
      }
      throw e;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      this.pending.delete(id);
    }
  }

  /** Streamable HTTP: POST and read either a JSON body or an SSE stream until our response arrives. */
  private async post(msg: JsonRpcMessage, signal: AbortSignal | undefined, id: number | undefined): Promise<unknown> {
    const url = this.o.transport === 'sse' ? this.sseEndpoint : this.o.url;
    if (!url) throw new McpError('SSE-канал не открыт', -32000);
    const headers: Record<string, string> = {
      ...(await this.baseHeaders()),
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    };
    if (this.o.transport === 'http') {
      if (this.sessionId) headers['Mcp-Session-Id'] = this.sessionId;
      if (msg.method !== 'initialize') headers['MCP-Protocol-Version'] = this.protocolVersion;
    }
    let res: Response;
    try {
      res = await this.o.fetch(url, { method: 'POST', headers, body: JSON.stringify(msg), signal });
    } catch (e) {
      if (isAbort(e) || signal?.aborted) throw new AbortError();
      throw new McpError(`Сервер недоступен: ${(e as Error).message}`, -32000);
    }
    if (res.status === 401 || res.status === 403) {
      const www = res.headers.get('www-authenticate');
      throw new McpAuthRequiredError(parseResourceMetadata(www), www);
    }
    if (res.status === 404 && this.sessionId && this.o.transport === 'http') throw new SessionExpiredError();
    if (!res.ok && res.status !== 202) {
      let detail = '';
      try {
        detail = (await res.text()).slice(0, 300);
      } catch {
        // ignore
      }
      throw new McpError(`HTTP ${res.status}${detail ? `: ${detail}` : ''}`, -32000);
    }
    const sid = res.headers.get('mcp-session-id');
    if (sid) this.sessionId = sid;
    if (id === undefined || this.o.transport === 'sse' || res.status === 202) {
      try {
        await res.text();
      } catch {
        // drained
      }
      return undefined;
    }
    const ctype = res.headers.get('content-type') ?? '';
    if (ctype.includes('text/event-stream')) {
      if (!res.body) throw new McpError('Пустой поток ответа', -32000);
      for await (const ev of parseSSE(res.body)) {
        if (!ev.data) continue;
        const r = this.dispatch(ev.data, id);
        if (r.matched) return r.value;
      }
      throw new McpError('Сервер закрыл поток без ответа', -32000);
    }
    const text = await res.text();
    if (!text.trim()) throw new McpError('Пустой ответ сервера', -32000);
    const r = this.dispatch(text, id);
    if (r.matched) return r.value;
    throw new McpError('Ответ не содержит результата запроса', -32000);
  }

  /** Handles one JSON-RPC payload (single or batch); returns our response if present. */
  private dispatch(data: string, id: number | undefined): { matched: boolean; value?: unknown } {
    let parsed: JsonRpcMessage | JsonRpcMessage[];
    try {
      parsed = JSON.parse(data);
    } catch {
      return { matched: false };
    }
    const list = Array.isArray(parsed) ? parsed : [parsed];
    let out: { matched: boolean; value?: unknown } = { matched: false };
    for (const m of list) {
      if (m.method && m.id != null) {
        void this.answerServerRequest(m);
        continue;
      }
      if (m.method) {
        this.o.onNotification?.(m.method, m.params);
        continue;
      }
      if (m.id == null) continue;
      if (id !== undefined && m.id === id) {
        if (m.error) throw new McpError(m.error.message, m.error.code, m.error.data);
        out = { matched: true, value: m.result };
        continue;
      }
      const p = this.pending.get(m.id);
      if (p) {
        if (m.error) p.reject(new McpError(m.error.message, m.error.code, m.error.data));
        else p.resolve(m.result);
      }
    }
    return out;
  }

  private async answerServerRequest(m: JsonRpcMessage): Promise<void> {
    const reply: JsonRpcMessage =
      m.method === 'ping'
        ? { jsonrpc: '2.0', id: m.id, result: {} }
        : m.method === 'roots/list'
          ? { jsonrpc: '2.0', id: m.id, result: { roots: [] } }
          : { jsonrpc: '2.0', id: m.id, error: { code: -32601, message: `Метод ${m.method} не поддерживается клиентом` } };
    try {
      await this.post(reply, undefined, undefined);
    } catch {
      // server will time out the request
    }
  }

  /** Legacy HTTP+SSE transport (2024-11-05): GET opens the event stream, `endpoint` event gives the POST URL. */
  private async openLegacySse(signal?: AbortSignal): Promise<void> {
    this.sseAbort?.abort();
    const ctrl = new AbortController();
    this.sseAbort = ctrl;
    signal?.addEventListener('abort', () => ctrl.abort(), { once: true });
    const res = await this.o.fetch(this.o.url, { method: 'GET', headers: { ...(await this.baseHeaders()), Accept: 'text/event-stream' }, signal: ctrl.signal });
    if (res.status === 401 || res.status === 403) {
      const www = res.headers.get('www-authenticate');
      throw new McpAuthRequiredError(parseResourceMetadata(www), www);
    }
    if (!res.ok || !res.body) throw new McpError(`SSE: HTTP ${res.status}`, -32000);
    const iterator = parseSSE(res.body)[Symbol.asyncIterator]();
    const endpoint = await Promise.race([
      (async () => {
        for (;;) {
          const { value, done } = await iterator.next();
          if (done) throw new McpError('SSE закрыт до получения endpoint', -32000);
          if (value.event === 'endpoint') return value.data.trim();
        }
      })(),
      sleep(15_000, ctrl.signal).then(() => {
        throw new McpError('Сервер не прислал endpoint', -32000);
      }),
    ]);
    this.sseEndpoint = new URL(endpoint, this.o.url).toString();
    void (async () => {
      try {
        for (;;) {
          const { value, done } = await iterator.next();
          if (done) break;
          if (value.event === 'message' && value.data) {
            try {
              this.dispatch(value.data, undefined);
            } catch {
              // errors for unmatched ids are delivered via pending map
            }
          }
        }
      } catch {
        // stream closed
      } finally {
        this.connected = false;
        for (const p of this.pending.values()) p.reject(new McpError('SSE-соединение закрыто', -32000));
        this.pending.clear();
      }
    })();
  }
}

class SessionExpiredError extends Error {
  constructor() {
    super('MCP session expired');
  }
}

export function mcpContentToText(content: McpContent[]): { text: string; images: { mediaType: string; data: string }[] } {
  const parts: string[] = [];
  const images: { mediaType: string; data: string }[] = [];
  for (const c of content) {
    if (c.type === 'text') parts.push(c.text);
    else if (c.type === 'image') images.push({ mediaType: c.mimeType, data: c.data });
    else if (c.type === 'resource') parts.push(c.resource.text ?? `[ресурс ${c.resource.uri}${c.resource.mimeType ? `, ${c.resource.mimeType}` : ''}]`);
    else if (c.type === 'resource_link') parts.push(`[ссылка на ресурс ${c.name ?? ''} ${c.uri}]`);
    else if (c.type === 'audio') parts.push(`[аудио ${c.mimeType}]`);
  }
  return { text: parts.join('\n'), images };
}

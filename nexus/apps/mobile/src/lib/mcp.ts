import {
  McpAuthRequiredError,
  McpClient,
  ToolRegistry,
  mcpContentToText,
  refreshTokens,
  validateInput,
  type AuthServerMetadata,
  type McpPrompt,
  type McpResource,
  type McpTool,
  type OAuthClient,
  type OAuthTokens,
  type ToolCallBlock,
  type ToolOutput,
  type ToolSpec,
} from '@nexus/core';
import { create } from 'zustand';
import { settings } from '@/store/settings';
import { useApprovals } from '@/store/approvals';
import { appFetch } from './net';
import { PHONE_TOOLS } from './phoneTools';
import * as repo from './repo';
import { RELAY_TOKEN, getSecret, getSecretJson, mcpSecretName, setSecretJson } from './secure';

export const PHONE_SERVER_ID = 'phone';

export interface McpSecret {
  bearer?: string;
  headers?: Record<string, string>;
  oauth?: { meta: AuthServerMetadata; client: OAuthClient; tokens?: OAuthTokens; resource: string; scopes?: string[] };
}

export type ServerStatus = 'idle' | 'connecting' | 'ready' | 'error' | 'auth_required';

interface Conn {
  client: McpClient;
  tools: McpTool[];
  resources: McpResource[];
  prompts: McpPrompt[];
  connectedAt: number;
}

interface McpStatusState {
  status: Record<string, { status: ServerStatus; error?: string; tools: number; resourceMetadataUrl?: string }>;
  setStatus: (id: string, s: McpStatusState['status'][string]) => void;
}

export const useMcpStatus = create<McpStatusState>((set) => ({
  status: {},
  setStatus: (id, s) => set((st) => ({ status: { ...st.status, [id]: s } })),
}));

const conns = new Map<string, Conn>();
const connecting = new Map<string, Promise<Conn>>();

async function authHeaderFor(row: repo.McpServerRow): Promise<string | undefined> {
  if (row.authType === 'relay') {
    const t = await getSecret(RELAY_TOKEN);
    return t ? `Bearer ${t}` : undefined;
  }
  const sec = await getSecretJson<McpSecret>(mcpSecretName(row.id));
  if (row.authType === 'bearer' && sec?.bearer) return `Bearer ${sec.bearer}`;
  if (row.authType === 'oauth' && sec?.oauth?.tokens) {
    let tokens = sec.oauth.tokens;
    if (tokens.expires_at && tokens.expires_at - Date.now() < 60_000 && tokens.refresh_token) {
      try {
        tokens = await refreshTokens(appFetch, sec.oauth.meta, sec.oauth.client, tokens.refresh_token, sec.oauth.resource);
        await setSecretJson(mcpSecretName(row.id), { ...sec, oauth: { ...sec.oauth, tokens } });
      } catch {
        return undefined;
      }
    }
    return `Bearer ${tokens.access_token}`;
  }
  return undefined;
}

export async function connect(row: repo.McpServerRow, force = false): Promise<Conn> {
  if (!force) {
    const c = conns.get(row.id);
    if (c && Date.now() - c.connectedAt < 30 * 60_000) return c;
    const p = connecting.get(row.id);
    if (p) return p;
  }
  const setStatus = useMcpStatus.getState().setStatus;
  const promise = (async () => {
    setStatus(row.id, { status: 'connecting', tools: 0 });
    const old = conns.get(row.id);
    conns.delete(row.id);
    void old?.client.close();
    const sec = row.authType === 'headers' ? await getSecretJson<McpSecret>(mcpSecretName(row.id)) : null;
    const client = new McpClient({
      url: row.url,
      transport: row.transport,
      fetch: appFetch,
      headers: sec?.headers,
      authHeader: () => authHeaderFor(row),
      clientName: 'nexus-mobile',
      clientVersion: '1.0.0',
      timeoutMs: 120_000,
    });
    try {
      await client.connect();
      const [tools, resources, prompts] = await Promise.all([client.listTools(), client.listResources().catch(() => []), client.listPrompts().catch(() => [])]);
      const conn: Conn = { client, tools, resources, prompts, connectedAt: Date.now() };
      conns.set(row.id, conn);
      setStatus(row.id, { status: 'ready', tools: tools.length });
      return conn;
    } catch (e) {
      if (e instanceof McpAuthRequiredError) setStatus(row.id, { status: 'auth_required', tools: 0, error: e.message, resourceMetadataUrl: e.resourceMetadataUrl });
      else setStatus(row.id, { status: 'error', tools: 0, error: (e as Error).message });
      throw e;
    } finally {
      connecting.delete(row.id);
    }
  })();
  connecting.set(row.id, promise);
  return promise;
}

export async function disconnectAll(): Promise<void> {
  const all = [...conns.values()];
  conns.clear();
  await Promise.all(all.map((c) => c.client.close().catch(() => undefined)));
}

export function cached(id: string): Conn | undefined {
  return conns.get(id);
}

interface ToolRef {
  serverId: string;
  serverName: string;
  toolName: string;
  title: string;
  readOnly: boolean;
  destructive: boolean;
  schema: Record<string, unknown>;
}

export interface Toolset {
  specs: ToolSpec[];
  execute: (call: ToolCallBlock, signal?: AbortSignal) => Promise<ToolOutput>;
  describe: (name: string) => { serverName: string; title: string } | undefined;
  errors: string[];
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`${label}: таймаут подключения`)), ms))]);
}

/** Collects tools from the phone and all enabled MCP servers (optionally limited to a project's servers). */
export async function buildToolset(opts: { serverIds?: string[] | null; chatAllowed: Set<string> }): Promise<Toolset> {
  const registry = new ToolRegistry<ToolRef>();
  const prefs = new Map((await repo.listToolPrefs()).map((p) => [`${p.serverId}|${p.toolName}`, p]));
  const errors: string[] = [];
  const isEnabled = (sid: string, tool: string) => prefs.get(`${sid}|${tool}`)?.enabled !== false;

  if (settings().phoneToolsEnabled && (!opts.serverIds || opts.serverIds.includes(PHONE_SERVER_ID))) {
    for (const t of PHONE_TOOLS) {
      if (!isEnabled(PHONE_SERVER_ID, t.name)) continue;
      registry.add('', { name: t.name, description: t.description, inputSchema: t.inputSchema }, { serverId: PHONE_SERVER_ID, serverName: 'Телефон', toolName: t.name, title: t.title, readOnly: t.readOnly, destructive: !t.readOnly, schema: t.inputSchema });
    }
  }

  const servers = (await repo.listMcpServers()).filter((s) => s.enabled && (!opts.serverIds || opts.serverIds.includes(s.id)));
  const results = await Promise.allSettled(servers.map((s) => withTimeout(connect(s), 15_000, s.name).then((c) => ({ s, c }))));
  results.forEach((r, i) => {
    const s = servers[i]!;
    if (r.status === 'rejected') {
      errors.push(`${s.name}: ${(r.reason as Error).message}`);
      return;
    }
    for (const t of r.value.c.tools) {
      if (!isEnabled(s.id, t.name)) continue;
      const prefix = s.authType === 'relay' ? 'pc' : s.name;
      registry.add(
        s.authType === 'relay' && t.name.startsWith('pc_') ? '' : prefix,
        { name: t.name, description: (t.description ?? t.title ?? t.name).slice(0, 1024), inputSchema: t.inputSchema ?? { type: 'object' } },
        { serverId: s.id, serverName: s.name, toolName: t.name, title: t.annotations?.title ?? t.title ?? t.name, readOnly: !!t.annotations?.readOnlyHint, destructive: !!t.annotations?.destructiveHint, schema: t.inputSchema ?? {} },
      );
    }
  });

  const execute = async (call: ToolCallBlock, signal?: AbortSignal): Promise<ToolOutput> => {
    const tool = registry.resolve(call.name);
    if (!tool) return { content: `Инструмент ${call.name} недоступен`, isError: true };
    const ref = tool.ref;
    const invalid = validateInput(tool.spec.inputSchema, call.input ?? {});
    if (invalid) return { content: `Некорректные аргументы: ${invalid}`, isError: true };

    const prefKey = `${ref.serverId}|${ref.toolName}`;
    const approval = prefs.get(prefKey)?.approval ?? 'ask';
    if (approval !== 'always' && !opts.chatAllowed.has(prefKey)) {
      const d = await useApprovals.getState().request({ callId: call.id, serverName: ref.serverName, toolTitle: ref.title, args: call.input ?? {}, destructive: ref.destructive }, signal);
      if (d === 'deny') return { content: 'Пользователь отклонил вызов инструмента', isError: true };
      if (d === 'always') {
        await repo.setToolPref(ref.serverId, ref.toolName, { approval: 'always' });
        prefs.set(prefKey, { serverId: ref.serverId, toolName: ref.toolName, enabled: true, approval: 'always' });
      }
    }

    const started = Date.now();
    let out: ToolOutput;
    try {
      if (ref.serverId === PHONE_SERVER_ID) {
        const t = PHONE_TOOLS.find((x) => x.name === ref.toolName)!;
        out = await t.run(call.input ?? {});
      } else {
        const row = servers.find((s) => s.id === ref.serverId)!;
        let conn = await connect(row);
        let r;
        try {
          r = await conn.client.callTool(ref.toolName, call.input ?? {}, signal);
        } catch (e) {
          if (signal?.aborted) throw e;
          conn = await connect(row, true);
          r = await conn.client.callTool(ref.toolName, call.input ?? {}, signal);
        }
        const { text, images } = mcpContentToText(r.content);
        const structured = !text && r.structuredContent ? JSON.stringify(r.structuredContent, null, 2) : '';
        out = { content: text || structured || '(пустой результат)', isError: r.isError, images: images.length ? images : undefined };
      }
    } catch (e) {
      out = { content: `Ошибка: ${(e as Error).message}`, isError: true };
    }
    void repo.logToolCall({ serverId: ref.serverId, tool: ref.toolName, args: call.input, result: out.content, isError: !!out.isError, durationMs: Date.now() - started });
    return out;
  };

  return {
    specs: registry.specs(),
    execute,
    describe: (name) => {
      const r = registry.resolve(name)?.ref;
      return r ? { serverName: r.serverName, title: r.title } : undefined;
    },
    errors,
  };
}

/** Lists tools of one server for the settings screen (connecting if needed). */
export async function serverTools(id: string): Promise<{ name: string; title: string; description?: string; readOnly: boolean }[]> {
  if (id === PHONE_SERVER_ID) return PHONE_TOOLS.map((t) => ({ name: t.name, title: t.title, description: t.description, readOnly: t.readOnly }));
  const row = (await repo.listMcpServers()).find((s) => s.id === id);
  if (!row) return [];
  const c = await connect(row);
  return c.tools.map((t) => ({ name: t.name, title: t.annotations?.title ?? t.title ?? t.name, description: t.description, readOnly: !!t.annotations?.readOnlyHint }));
}

export async function allResources(): Promise<{ serverId: string; serverName: string; resource: McpResource }[]> {
  const out: { serverId: string; serverName: string; resource: McpResource }[] = [];
  for (const s of (await repo.listMcpServers()).filter((x) => x.enabled)) {
    try {
      const c = await withTimeout(connect(s), 10_000, s.name);
      for (const r of c.resources) out.push({ serverId: s.id, serverName: s.name, resource: r });
    } catch {
      // unreachable servers are skipped
    }
  }
  return out;
}

export async function readResourceText(serverId: string, uri: string): Promise<string> {
  const row = (await repo.listMcpServers()).find((s) => s.id === serverId);
  if (!row) throw new Error('Сервер не найден');
  const c = await connect(row);
  const r = await c.client.readResource(uri);
  return r.contents.map((x) => x.text ?? (x.blob ? `[бинарные данные ${x.mimeType ?? ''}]` : '')).join('\n');
}

export async function allPrompts(): Promise<{ serverId: string; serverName: string; prompt: McpPrompt }[]> {
  const out: { serverId: string; serverName: string; prompt: McpPrompt }[] = [];
  for (const s of (await repo.listMcpServers()).filter((x) => x.enabled)) {
    const c = conns.get(s.id);
    if (c) for (const p of c.prompts) out.push({ serverId: s.id, serverName: s.name, prompt: p });
  }
  return out;
}

export async function getPromptText(serverId: string, name: string, args: Record<string, string>): Promise<string> {
  const row = (await repo.listMcpServers()).find((s) => s.id === serverId);
  if (!row) throw new Error('Сервер не найден');
  const c = await connect(row);
  const r = await c.client.getPrompt(name, args);
  return r.messages.map((m) => (m.content.type === 'text' ? m.content.text : '')).filter(Boolean).join('\n\n');
}

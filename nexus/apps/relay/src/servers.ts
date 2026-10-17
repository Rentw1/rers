import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { ServerEntry } from './config';

export interface ManagedTool {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  annotations?: Record<string, unknown>;
}

interface ManagedServer {
  id: string;
  entry: ServerEntry;
  status: 'starting' | 'ready' | 'error' | 'stopped';
  error?: string;
  client?: Client;
  tools: ManagedTool[];
  restarts: number;
}

export type ToolCallResult = { content: unknown[]; isError?: boolean };

/** Spawns stdio MCP servers (and connects remote ones) on the PC and exposes their tools to paired phones. */
export class ServerManager {
  private readonly servers = new Map<string, ManagedServer>();
  private stopping = false;

  constructor(private readonly log: (msg: string) => void) {}

  async start(entries: Record<string, ServerEntry>): Promise<void> {
    await Promise.all(Object.entries(entries).filter(([, e]) => !e.disabled).map(([id, e]) => this.startOne(id, e)));
  }

  private async startOne(id: string, entry: ServerEntry): Promise<void> {
    const s: ManagedServer = this.servers.get(id) ?? { id, entry, status: 'starting', tools: [], restarts: 0 };
    s.entry = entry;
    s.status = 'starting';
    s.error = undefined;
    this.servers.set(id, s);
    const client = new Client({ name: 'nexus-relay', version: '1.0.0' });
    try {
      const transport =
        'command' in entry
          ? new StdioClientTransport({
              command: entry.command,
              args: entry.args ?? [],
              env: { ...getDefaultEnvironment(), ...(entry.env ?? {}) },
              cwd: entry.cwd,
              stderr: 'pipe',
            })
          : new StreamableHTTPClientTransport(new URL(entry.url), { requestInit: { headers: entry.headers ?? {} } });
      if (transport instanceof StdioClientTransport) {
        transport.stderr?.on('data', (d: Buffer) => {
          const line = d.toString().trim();
          if (line) this.log(`[${id}] ${line.slice(0, 500)}`);
        });
      }
      client.onclose = () => {
        if (this.stopping || s.client !== client) return;
        s.status = 'error';
        s.error = 'Процесс сервера завершился';
        s.tools = [];
        if (s.restarts < 5) {
          s.restarts++;
          const delay = 1000 * 2 ** s.restarts;
          this.log(`[${id}] перезапуск через ${delay / 1000} с`);
          setTimeout(() => void this.startOne(id, s.entry), delay);
        }
      };
      await client.connect(transport);
      s.client = client;
      await this.refreshTools(s);
      s.status = 'ready';
      s.restarts = 0;
      this.log(`[${id}] готов, инструментов: ${s.tools.length}`);
    } catch (e) {
      s.status = 'error';
      s.error = (e as Error).message;
      this.log(`[${id}] ошибка запуска: ${s.error}`);
      try {
        await client.close();
      } catch {
        // ignore
      }
    }
  }

  private async refreshTools(s: ManagedServer): Promise<void> {
    if (!s.client) return;
    const tools: ManagedTool[] = [];
    let cursor: string | undefined;
    do {
      const r = await s.client.listTools(cursor ? { cursor } : undefined);
      for (const t of r.tools) tools.push({ name: t.name, description: t.description, inputSchema: t.inputSchema as Record<string, unknown>, annotations: t.annotations as Record<string, unknown> | undefined });
      cursor = r.nextCursor;
    } while (cursor);
    s.tools = tools;
  }

  /** Starts (or restarts with a new definition) one server at runtime. */
  async upsert(id: string, entry: ServerEntry): Promise<void> {
    await this.remove(id);
    this.stopping = false;
    if (!entry.disabled) await this.startOne(id, entry);
  }

  async remove(id: string): Promise<void> {
    const s = this.servers.get(id);
    if (!s) return;
    this.servers.delete(id);
    const client = s.client;
    s.client = undefined;
    try {
      await client?.close();
    } catch {
      // ignore
    }
  }

  serverTools(id: string): ManagedTool[] {
    return this.servers.get(id)?.tools ?? [];
  }

  status(): { id: string; status: ManagedServer['status']; tools: number; error?: string }[] {
    return [...this.servers.values()].map((s) => ({ id: s.id, status: s.status, tools: s.tools.length, error: s.error }));
  }

  /** Tools prefixed `<serverId>__<tool>` so names stay unique across servers. */
  tools(): ManagedTool[] {
    const out: ManagedTool[] = [];
    for (const s of this.servers.values()) {
      if (s.status !== 'ready') continue;
      for (const t of s.tools) out.push({ ...t, name: `${s.id}__${t.name}`, description: `[${s.id}] ${t.description ?? ''}`.trim() });
    }
    return out;
  }

  owns(name: string): boolean {
    const i = name.indexOf('__');
    return i > 0 && this.servers.has(name.slice(0, i));
  }

  async call(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<ToolCallResult> {
    const i = name.indexOf('__');
    const s = i > 0 ? this.servers.get(name.slice(0, i)) : undefined;
    if (!s?.client || s.status !== 'ready') return { content: [{ type: 'text', text: `Сервер для ${name} не запущен` }], isError: true };
    const r = await s.client.callTool({ name: name.slice(i + 2), arguments: args }, undefined, { signal, timeout: 300_000 });
    return { content: (r.content as unknown[]) ?? [], isError: !!r.isError };
  }

  async restart(id: string): Promise<void> {
    const s = this.servers.get(id);
    if (!s) return;
    const old = s.client;
    s.client = undefined;
    try {
      await old?.close();
    } catch {
      // ignore
    }
    s.restarts = 0;
    await this.startOne(id, s.entry);
  }

  async stop(): Promise<void> {
    this.stopping = true;
    await Promise.all(
      [...this.servers.values()].map(async (s) => {
        try {
          await s.client?.close();
        } catch {
          // ignore
        }
        s.status = 'stopped';
      }),
    );
  }
}

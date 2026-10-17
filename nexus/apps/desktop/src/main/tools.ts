import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { ToolRegistry, mcpContentToText, validateInput, type McpContent, type ToolCallBlock, type ToolOutput, type ToolSpec } from '@nexus/core';
import { BuiltinTools } from '@nexus/relay/builtin';
import type { RelayConfig, ServerEntry } from '@nexus/relay/config';
import { ServerManager } from '@nexus/relay/servers';
import type { ApprovalRequest, McpServerDef, McpServerStatus, Settings, ToolInfo } from '../shared/types';
import type { Store } from './store';

export const PC_SERVER_ID = 'pc';

export type ApprovalDecision = 'once' | 'always' | 'deny';

function toEntry(d: McpServerDef): ServerEntry {
  if (d.type === 'http') return { url: d.url!, headers: d.headers, disabled: !d.enabled };
  return { command: d.command!, args: d.args ?? [], env: d.env, disabled: !d.enabled };
}

export function relayConfigFrom(s: Settings, name: string): RelayConfig {
  const inbox = join(homedir(), 'Nexus', 'inbox');
  for (const d of [...s.allowedDirs, inbox]) {
    try {
      mkdirSync(d, { recursive: true });
    } catch {
      // directory may be on a missing drive
    }
  }
  return {
    name: s.relayName || name,
    port: s.relayPort,
    host: '0.0.0.0',
    mcpServers: {},
    allowedDirs: s.allowedDirs,
    shell: { enabled: s.shellEnabled, allow: s.shellAllow, timeoutMs: 60_000 },
    inboxDir: inbox,
  };
}

/** Owns MCP server processes and PC tools; builds per-request toolsets with approvals. */
export class ToolHub {
  readonly servers: ServerManager;
  builtin: BuiltinTools;
  private readonly pending = new Map<string, (d: ApprovalDecision) => void>();

  constructor(
    private readonly store: Store,
    private readonly hostName: string,
    private readonly requestApproval: (r: ApprovalRequest) => void,
    log: (m: string) => void,
  ) {
    this.servers = new ServerManager(log);
    this.builtin = new BuiltinTools(relayConfigFrom(store.settings.get(), hostName));
  }

  async start(): Promise<void> {
    const entries: Record<string, ServerEntry> = {};
    for (const d of this.store.mcp.get().servers) entries[d.id] = toEntry(d);
    await this.servers.start(entries);
  }

  refreshBuiltin(): void {
    this.builtin = new BuiltinTools(relayConfigFrom(this.store.settings.get(), this.hostName));
  }

  defs(): McpServerDef[] {
    return this.store.mcp.get().servers;
  }

  status(): McpServerStatus[] {
    const st = new Map(this.servers.status().map((s) => [s.id, s]));
    return this.defs().map((d) => st.get(d.id) ?? { id: d.id, status: d.enabled ? 'starting' : 'stopped', tools: 0 });
  }

  async upsert(def: McpServerDef): Promise<void> {
    if (def.type === 'stdio' && !def.command?.trim()) throw new Error('Укажите команду запуска');
    if (def.type === 'http' && !/^https?:\/\//.test(def.url ?? '')) throw new Error('Укажите URL сервера');
    this.store.mcp.update((m) => ({ ...m, servers: [...m.servers.filter((s) => s.id !== def.id), def] }));
    await this.servers.upsert(def.id, toEntry(def));
  }

  async remove(id: string): Promise<void> {
    this.store.mcp.update((m) => ({ servers: m.servers.filter((s) => s.id !== id), prefs: Object.fromEntries(Object.entries(m.prefs).filter(([k]) => !k.startsWith(`${id}|`))) }));
    await this.servers.remove(id);
  }

  tools(serverId: string): ToolInfo[] {
    const prefs = this.store.mcp.get().prefs;
    const list = serverId === PC_SERVER_ID ? this.builtin.list() : this.servers.serverTools(serverId);
    return list.map((t) => {
      const p = prefs[`${serverId}|${t.name}`];
      return { serverId, name: t.name, description: t.description, enabled: p?.enabled !== false, approval: p?.approval ?? 'ask' };
    });
  }

  setPref(serverId: string, tool: string, patch: { enabled?: boolean; approval?: 'ask' | 'always' }): void {
    this.store.mcp.update((m) => {
      const key = `${serverId}|${tool}`;
      const cur = m.prefs[key] ?? { enabled: true, approval: 'ask' as const };
      m.prefs[key] = { ...cur, ...patch };
    });
  }

  decide(callId: string, d: ApprovalDecision): void {
    this.pending.get(callId)?.(d);
  }

  denyAll(): void {
    for (const r of this.pending.values()) r('deny');
  }

  build(chatId: string, chatAllowed: Set<string>): { specs: ToolSpec[]; execute: (call: ToolCallBlock, signal?: AbortSignal) => Promise<ToolOutput> } {
    const s = this.store.settings.get();
    const prefs = this.store.mcp.get().prefs;
    const registry = new ToolRegistry<{ serverId: string; serverName: string; tool: string; destructive: boolean }>();
    if (s.pcToolsEnabled) {
      for (const t of this.builtin.list()) {
        if (prefs[`${PC_SERVER_ID}|${t.name}`]?.enabled === false) continue;
        registry.add('', { name: t.name, description: t.description ?? t.name, inputSchema: t.inputSchema }, { serverId: PC_SERVER_ID, serverName: 'Компьютер', tool: t.name, destructive: !t.annotations?.readOnlyHint });
      }
    }
    const names = new Map(this.defs().map((d) => [d.id, d.name]));
    for (const st of this.servers.status()) {
      if (st.status !== 'ready') continue;
      for (const t of this.servers.serverTools(st.id)) {
        if (prefs[`${st.id}|${t.name}`]?.enabled === false) continue;
        registry.add(names.get(st.id) ?? st.id, { name: t.name, description: (t.description ?? t.name).slice(0, 1024), inputSchema: t.inputSchema }, { serverId: st.id, serverName: names.get(st.id) ?? st.id, tool: t.name, destructive: !t.annotations?.readOnlyHint });
      }
    }

    const execute = async (call: ToolCallBlock, signal?: AbortSignal): Promise<ToolOutput> => {
      const tool = registry.resolve(call.name);
      if (!tool) return { content: `Инструмент ${call.name} недоступен`, isError: true };
      const invalid = validateInput(tool.spec.inputSchema, call.input ?? {});
      if (invalid) return { content: `Некорректные аргументы: ${invalid}`, isError: true };
      const key = `${tool.ref.serverId}|${tool.ref.tool}`;
      const readOnlyPc = tool.ref.serverId === PC_SERVER_ID && !tool.ref.destructive;
      const approval = this.store.mcp.get().prefs[key]?.approval ?? (readOnlyPc ? 'always' : 'ask');
      if (approval !== 'always' && !chatAllowed.has(key)) {
        const decision = await new Promise<ApprovalDecision>((resolve) => {
          const done = (d: ApprovalDecision) => {
            this.pending.delete(call.id);
            signal?.removeEventListener('abort', onAbort);
            resolve(d);
          };
          const onAbort = () => done('deny');
          if (signal?.aborted) return resolve('deny');
          signal?.addEventListener('abort', onAbort, { once: true });
          this.pending.set(call.id, done);
          this.requestApproval({ callId: call.id, chatId, serverName: tool.ref.serverName, toolTitle: tool.ref.tool, args: call.input ?? {}, destructive: tool.ref.destructive });
        });
        if (decision === 'deny') return { content: 'Пользователь отклонил вызов инструмента', isError: true };
        if (decision === 'always') this.setPref(tool.ref.serverId, tool.ref.tool, { approval: 'always' });
      }
      try {
        const r = tool.ref.serverId === PC_SERVER_ID ? await this.builtin.call(tool.ref.tool, call.input ?? {}, signal) : await this.servers.call(`${tool.ref.serverId}__${tool.ref.tool}`, call.input ?? {}, signal);
        const { text, images } = mcpContentToText(r.content as McpContent[]);
        return { content: text || '(пустой результат)', isError: r.isError, images: images.length ? images : undefined };
      } catch (e) {
        return { content: `Ошибка: ${(e as Error).message}`, isError: true };
      }
    };
    return { specs: registry.specs(), execute };
  }

  async stop(): Promise<void> {
    this.denyAll();
    await this.servers.stop();
  }
}

import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { BrowserWindow, app, dialog, ipcMain, shell } from 'electron';
import { claudeDesktopConfigPath } from '@nexus/relay/config';
import type { Attachment, Budget, McpServerDef, Settings, UpdateInfo, UsageReport } from '../shared/types';
import type { Engine } from './engine';
import type { Providers } from './providers';
import type { RelayHost } from './relayHost';
import type { Store } from './store';
import { PC_SERVER_ID, type ApprovalDecision, type ToolHub } from './tools';
import { buildReport, usageCsv } from './usage';

const IMAGE_EXT: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' };

function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.+-]/).map((x) => parseInt(x, 10) || 0);
  const pb = b.split(/[.+-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0) ? 1 : -1;
  return 0;
}

export function registerIpc(ctx: { store: Store; providers: Providers; tools: ToolHub; engine: Engine; relay: RelayHost; win: () => BrowserWindow | null }): void {
  const { store, providers, tools, engine, relay } = ctx;
  const h = <A extends unknown[], R>(channel: string, fn: (...args: A) => R | Promise<R>) => ipcMain.handle(channel, (_e, ...args) => fn(...(args as A)));

  /* settings */
  h('settings:get', () => store.settings.get());
  h('settings:set', async (patch: Partial<Settings>) => {
    const before = store.settings.get();
    const next = store.settings.update((s) => ({ ...s, ...patch }));
    const toolsChanged = ['allowedDirs', 'shellEnabled', 'shellAllow', 'pcToolsEnabled'].some((k) => k in patch);
    if (toolsChanged) tools.refreshBuiltin();
    if (toolsChanged || ['relayEnabled', 'relayPort', 'relayName'].some((k) => k in patch && patch[k as keyof Settings] !== before[k as keyof Settings])) await relay.apply();
    return next;
  });

  /* providers & models */
  h('providers:list', () => providers.list().map((p) => ({ ...p, maskedKey: providers.maskedKey(p.id) })));
  h('providers:save', async (id: string, patch: { apiKey?: string | null; baseUrl?: string; enabled?: boolean; streamUsage?: boolean }) => {
    providers.save(id, patch);
    if (patch.apiKey || patch.enabled) {
      const n = await providers.test(id);
      await providers.syncModels(id).catch(() => undefined);
      return n;
    }
    return null;
  });
  h('providers:test', (id: string) => providers.test(id));
  h('providers:sync', (id: string) => providers.syncModels(id));
  h('providers:addCustom', (name: string, url: string) => providers.addCustom(name, url));
  h('providers:remove', (id: string) => providers.remove(id));
  h('models:list', (providerId?: string) => providers.models(providerId));
  h('models:groups', () => providers.pickerGroups());
  h('models:flags', (providerId: string, id: string, flags: { visible?: boolean; favorite?: boolean }) => providers.setModelFlags(providerId, id, flags));
  h('models:add', (providerId: string, id: string) => providers.addModel(providerId, id));
  h('prices:set', (providerId: string, modelId: string, p: { input: number; output: number; cacheRead?: number } | null) => providers.setUserPrice(providerId, modelId, p));
  h('prices:sync', () => providers.syncOpenRouterPrices());

  /* chats */
  h('chats:list', (q?: string) => engine.listChats(q));
  h('chats:get', (id: string) => ({ chat: engine.getChat(id) ?? null, messages: engine.messages(id), running: engine.isRunning(id) }));
  h('chats:update', (id: string, patch: { title?: string; pinned?: boolean; providerId?: string; modelId?: string }) => engine.updateChat(id, patch));
  h('chats:delete', (id: string) => engine.deleteChat(id));
  h('chats:send', (chatId: string | null, text: string, attachments: Attachment[], model?: { providerId: string; modelId: string }) => engine.send(chatId, text, attachments, model));
  h('chats:regenerate', (chatId: string, userMessageId: string) => void engine.regenerate(chatId, userMessageId));
  h('chats:edit', (chatId: string, messageId: string, text: string) => void engine.edit(chatId, messageId, text));
  h('chats:retry', (chatId: string) => void engine.retry(chatId));
  h('chats:stop', (chatId: string) => engine.stop(chatId));
  h('chats:switch', (chatId: string, messageId: string) => engine.switchBranch(chatId, messageId));
  h('chats:deleteFrom', (chatId: string, messageId: string) => engine.deleteSubtree(chatId, messageId));
  h('chats:export', async (chatId: string) => {
    const chat = engine.getChat(chatId);
    const w = ctx.win();
    const r = await dialog.showSaveDialog(w!, { defaultPath: `${(chat?.title ?? 'chat').replace(/[\\/:*?"<>|]/g, '_')}.md`, filters: [{ name: 'Markdown', extensions: ['md'] }] });
    if (r.canceled || !r.filePath) return null;
    writeFileSync(r.filePath, engine.exportMarkdown(chatId));
    return r.filePath;
  });
  h('chats:markdown', (chatId: string) => engine.exportMarkdown(chatId));

  /* attachments */
  h('files:pick', async (): Promise<Attachment[]> => {
    const r = await dialog.showOpenDialog(ctx.win()!, { properties: ['openFile', 'multiSelections'] });
    if (r.canceled) return [];
    const out: Attachment[] = [];
    for (const p of r.filePaths) {
      const ext = extname(p).toLowerCase();
      const buf = readFileSync(p);
      if (IMAGE_EXT[ext]) {
        if (buf.length > 5_000_000) throw new Error(`${basename(p)}: изображение больше 5 МБ`);
        out.push({ kind: 'image', name: basename(p), mediaType: IMAGE_EXT[ext]!, data: buf.toString('base64') });
      } else {
        if (buf.length > 1_000_000) throw new Error(`${basename(p)}: файл больше 1 МБ`);
        if (buf.includes(0)) throw new Error(`${basename(p)}: бинарный файл не поддерживается`);
        out.push({ kind: 'text', name: basename(p), mediaType: 'text/plain', data: buf.toString('utf8') });
      }
    }
    return out;
  });

  /* tools & MCP */
  h('approval:decide', (callId: string, d: ApprovalDecision) => tools.decide(callId, d));
  h('mcp:list', () => ({ defs: tools.defs(), status: tools.status() }));
  h('mcp:upsert', (def: Omit<McpServerDef, 'id'> & { id?: string }) => tools.upsert({ ...def, id: def.id ?? randomUUID().slice(0, 8) }));
  h('mcp:remove', (id: string) => tools.remove(id));
  h('mcp:restart', (id: string) => tools.servers.restart(id));
  h('mcp:tools', (serverId: string) => tools.tools(serverId));
  h('mcp:pref', (serverId: string, tool: string, patch: { enabled?: boolean; approval?: 'ask' | 'always' }) => tools.setPref(serverId, tool, patch));
  h('mcp:importClaude', async () => {
    const path = claudeDesktopConfigPath();
    let parsed: { mcpServers?: Record<string, { command?: string; args?: string[]; env?: Record<string, string>; url?: string; headers?: Record<string, string> }> };
    try {
      parsed = JSON.parse(readFileSync(path, 'utf8'));
    } catch {
      throw new Error(`Конфигурация Claude Desktop не найдена: ${path}`);
    }
    const existing = new Set(tools.defs().map((d) => d.name));
    const added: string[] = [];
    for (const [name, e] of Object.entries(parsed.mcpServers ?? {})) {
      if (existing.has(name)) continue;
      if (e.command) await tools.upsert({ id: randomUUID().slice(0, 8), name, type: 'stdio', command: e.command, args: e.args, env: e.env, enabled: true });
      else if (e.url) await tools.upsert({ id: randomUUID().slice(0, 8), name, type: 'http', url: e.url, headers: e.headers, enabled: true });
      else continue;
      added.push(name);
    }
    return added;
  });
  h('pc:serverId', () => PC_SERVER_ID);
  h('dialog:pickDir', async () => {
    const r = await dialog.showOpenDialog(ctx.win()!, { properties: ['openDirectory', 'createDirectory'] });
    return r.canceled ? null : (r.filePaths[0] ?? null);
  });

  /* usage */
  h('usage:report', async (range: 'day' | 'week' | 'month' | 'all'): Promise<UsageReport> => {
    const titles = new Map(store.chats.get().map((c) => [c.id, c.title]));
    return { ...buildReport(store.usage.get(), store.budgets.get(), range, (id) => titles.get(id) ?? 'Удалённый чат'), balances: await providers.balances() };
  });
  h('usage:chatCost', (chatId: string) => {
    const map: Record<string, number> = {};
    for (const e of store.usage.get()) if (e.chatId === chatId && e.messageId) map[e.messageId] = (map[e.messageId] ?? 0) + e.costMicro;
    return map;
  });
  h('usage:messageUsage', (chatId: string) => store.usage.get().filter((e) => e.chatId === chatId && e.messageId));
  h('usage:csv', async () => {
    const r = await dialog.showSaveDialog(ctx.win()!, { defaultPath: `nexus-usage-${new Date().toISOString().slice(0, 10)}.csv`, filters: [{ name: 'CSV', extensions: ['csv'] }] });
    if (r.canceled || !r.filePath) return null;
    writeFileSync(r.filePath, usageCsv(store.usage.get()));
    return r.filePath;
  });
  h('budgets:list', () => store.budgets.get());
  h('budgets:save', (b: Budget) => store.budgets.update((list) => [...list.filter((x) => x.id !== b.id), b]));
  h('budgets:remove', (id: string) => store.budgets.update((list) => list.filter((x) => x.id !== id)));

  /* phone relay */
  h('relay:status', () => relay.status());
  h('relay:rotate', () => relay.rotate());
  h('relay:revoke', (id: string) => relay.revoke(id));

  /* app */
  h('app:version', () => app.getVersion());
  h('app:open', (url: string) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
  });
  h('app:openPath', (p: string) => void shell.openPath(p));
  h('app:dataDir', () => store.dir);
  h('app:checkUpdate', async (): Promise<UpdateInfo | null> => {
    const res = await fetch('https://api.github.com/repos/Rentw1/rers/releases?per_page=10', { headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`GitHub: HTTP ${res.status}`);
    const list = (await res.json()) as { tag_name: string; draft: boolean; html_url: string; body?: string }[];
    const rel = list.filter((r) => !r.draft && r.tag_name.startsWith('nexus-v')).sort((a, b) => compareVersions(b.tag_name.slice(7), a.tag_name.slice(7)))[0];
    if (!rel || compareVersions(rel.tag_name.slice(7), app.getVersion()) <= 0) return null;
    return { version: rel.tag_name.slice(7), url: rel.html_url, notes: rel.body ?? '' };
  });
  h('app:claudeConfigPath', () => claudeDesktopConfigPath());
}

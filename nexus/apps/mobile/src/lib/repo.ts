import type { Block, ChatMessage, ModelInfo, ProviderKind, ProviderRaw, Usage } from '@nexus/core';
import { getDb } from './db';
import { uid } from './ids';

/* ---------- settings ---------- */

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', key);
  if (!row) return fallback;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return fallback;
  }
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  const db = await getDb();
  await db.runAsync('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, JSON.stringify(value));
}

export async function allSettings(): Promise<Record<string, unknown>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM settings');
  const out: Record<string, unknown> = {};
  for (const r of rows) {
    try {
      out[r.key] = JSON.parse(r.value);
    } catch {
      // skip corrupt
    }
  }
  return out;
}

/* ---------- providers & models ---------- */

export interface ProviderRow {
  id: string;
  name: string;
  kind: ProviderKind;
  baseUrl: string;
  enabled: boolean;
  isCustom: boolean;
  hasKey: boolean;
  streamUsage: boolean;
  modelsSyncedAt: number | null;
}

interface ProviderDb {
  id: string;
  name: string;
  kind: string;
  base_url: string;
  enabled: number;
  is_custom: number;
  has_key: number;
  stream_usage: number;
  models_synced_at: number | null;
}

const toProvider = (r: ProviderDb): ProviderRow => ({
  id: r.id,
  name: r.name,
  kind: r.kind as ProviderKind,
  baseUrl: r.base_url,
  enabled: !!r.enabled,
  isCustom: !!r.is_custom,
  hasKey: !!r.has_key,
  streamUsage: !!r.stream_usage,
  modelsSyncedAt: r.models_synced_at,
});

export async function listProviders(): Promise<ProviderRow[]> {
  const db = await getDb();
  return (await db.getAllAsync<ProviderDb>('SELECT * FROM providers ORDER BY created_at')).map(toProvider);
}

export async function getProvider(id: string): Promise<ProviderRow | null> {
  const db = await getDb();
  const r = await db.getFirstAsync<ProviderDb>('SELECT * FROM providers WHERE id = ?', id);
  return r ? toProvider(r) : null;
}

export async function upsertProvider(p: Omit<ProviderRow, 'modelsSyncedAt'> & { modelsSyncedAt?: number | null }): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO providers (id, name, kind, base_url, enabled, is_custom, has_key, stream_usage, models_synced_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, kind = excluded.kind, base_url = excluded.base_url, enabled = excluded.enabled,
       is_custom = excluded.is_custom, has_key = excluded.has_key, stream_usage = excluded.stream_usage,
       models_synced_at = COALESCE(excluded.models_synced_at, providers.models_synced_at)`,
    p.id,
    p.name,
    p.kind,
    p.baseUrl,
    p.enabled ? 1 : 0,
    p.isCustom ? 1 : 0,
    p.hasKey ? 1 : 0,
    p.streamUsage ? 1 : 0,
    p.modelsSyncedAt ?? null,
    Date.now(),
  );
}

export async function deleteProvider(id: string): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM providers WHERE id = ?', id);
    await db.runAsync('DELETE FROM models WHERE provider_id = ?', id);
    await db.runAsync("DELETE FROM prices WHERE provider_id = ? AND source <> 'openrouter'", id);
  });
}

export interface ModelRow extends ModelInfo {
  providerId: string;
  visible: boolean;
  favorite: boolean;
}

interface ModelDb {
  provider_id: string;
  id: string;
  name: string;
  context_window: number | null;
  max_output: number | null;
  vision: number;
  tools: number;
  reasoning: number;
  visible: number;
  favorite: number;
}

const toModel = (r: ModelDb): ModelRow => ({
  providerId: r.provider_id,
  id: r.id,
  name: r.name,
  contextWindow: r.context_window ?? undefined,
  maxOutput: r.max_output ?? undefined,
  vision: !!r.vision,
  tools: !!r.tools,
  reasoning: !!r.reasoning,
  visible: !!r.visible,
  favorite: !!r.favorite,
});

export async function listModels(providerId?: string): Promise<ModelRow[]> {
  const db = await getDb();
  const rows = providerId
    ? await db.getAllAsync<ModelDb>('SELECT * FROM models WHERE provider_id = ? ORDER BY favorite DESC, name COLLATE NOCASE', providerId)
    : await db.getAllAsync<ModelDb>('SELECT * FROM models ORDER BY favorite DESC, name COLLATE NOCASE');
  return rows.map(toModel);
}

export async function getModel(providerId: string, id: string): Promise<ModelRow | null> {
  const db = await getDb();
  const r = await db.getFirstAsync<ModelDb>('SELECT * FROM models WHERE provider_id = ? AND id = ?', providerId, id);
  return r ? toModel(r) : null;
}

/** Inserts/updates models; keeps the user's visibility and favorites. New models of large catalogs start hidden. */
export async function upsertModels(providerId: string, models: ModelInfo[], defaultVisible: boolean): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const m of models) {
      await db.runAsync(
        `INSERT INTO models (provider_id, id, name, context_window, max_output, vision, tools, reasoning, visible, favorite)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
         ON CONFLICT(provider_id, id) DO UPDATE SET name = excluded.name,
           context_window = COALESCE(excluded.context_window, models.context_window),
           max_output = COALESCE(excluded.max_output, models.max_output),
           vision = excluded.vision, tools = excluded.tools, reasoning = excluded.reasoning`,
        providerId,
        m.id,
        m.name || m.id,
        m.contextWindow ?? null,
        m.maxOutput ?? null,
        m.vision ? 1 : 0,
        m.tools === false ? 0 : 1,
        m.reasoning ? 1 : 0,
        defaultVisible ? 1 : 0,
      );
    }
    await db.runAsync('UPDATE providers SET models_synced_at = ? WHERE id = ?', Date.now(), providerId);
  });
}

export async function setModelFlags(providerId: string, id: string, flags: { visible?: boolean; favorite?: boolean }): Promise<void> {
  const db = await getDb();
  if (flags.visible !== undefined) await db.runAsync('UPDATE models SET visible = ? WHERE provider_id = ? AND id = ?', flags.visible ? 1 : 0, providerId, id);
  if (flags.favorite !== undefined) await db.runAsync('UPDATE models SET favorite = ? WHERE provider_id = ? AND id = ?', flags.favorite ? 1 : 0, providerId, id);
}

export async function addCustomModel(providerId: string, id: string): Promise<void> {
  await upsertModels(providerId, [{ id, name: id, tools: true }], true);
}

/* ---------- prices ---------- */

export interface PriceRow {
  providerId: string;
  modelId: string;
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
  source: 'seed' | 'openrouter' | 'provider' | 'user';
  updatedAt: string;
}

export async function listPrices(): Promise<PriceRow[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ provider_id: string; model_id: string; input: number; output: number; cache_read: number | null; cache_write: number | null; source: string; updated_at: string }>(
    'SELECT * FROM prices',
  );
  return rows.map((r) => ({
    providerId: r.provider_id,
    modelId: r.model_id,
    input: r.input,
    output: r.output,
    cacheRead: r.cache_read ?? undefined,
    cacheWrite: r.cache_write ?? undefined,
    source: r.source as PriceRow['source'],
    updatedAt: r.updated_at,
  }));
}

export async function savePrices(entries: PriceRow[], replaceSource?: PriceRow['source']): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    if (replaceSource) await db.runAsync('DELETE FROM prices WHERE source = ?', replaceSource);
    for (const e of entries) {
      await db.runAsync(
        `INSERT INTO prices (provider_id, model_id, input, output, cache_read, cache_write, source, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(provider_id, model_id, source) DO UPDATE SET input = excluded.input, output = excluded.output,
           cache_read = excluded.cache_read, cache_write = excluded.cache_write, updated_at = excluded.updated_at`,
        e.providerId,
        e.modelId,
        e.input,
        e.output,
        e.cacheRead ?? null,
        e.cacheWrite ?? null,
        e.source,
        e.updatedAt,
      );
    }
  });
}

export async function deleteUserPrice(providerId: string, modelId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("DELETE FROM prices WHERE provider_id = ? AND model_id = ? AND source = 'user'", providerId, modelId);
}

/* ---------- projects ---------- */

export interface Project {
  id: string;
  name: string;
  instructions: string;
  providerId: string | null;
  modelId: string | null;
  mcpServerIds: string[] | null;
  createdAt: number;
  updatedAt: number;
}

export interface ProjectFile {
  id: string;
  projectId: string;
  name: string;
  content: string;
  createdAt: number;
}

type ProjectDb = { id: string; name: string; instructions: string; provider_id: string | null; model_id: string | null; mcp_server_ids: string | null; created_at: number; updated_at: number };
const toProject = (r: ProjectDb): Project => ({
  id: r.id,
  name: r.name,
  instructions: r.instructions,
  providerId: r.provider_id,
  modelId: r.model_id,
  mcpServerIds: r.mcp_server_ids ? (JSON.parse(r.mcp_server_ids) as string[]) : null,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export async function listProjects(): Promise<Project[]> {
  const db = await getDb();
  return (await db.getAllAsync<ProjectDb>('SELECT * FROM projects ORDER BY updated_at DESC')).map(toProject);
}

export async function getProject(id: string): Promise<Project | null> {
  const db = await getDb();
  const r = await db.getFirstAsync<ProjectDb>('SELECT * FROM projects WHERE id = ?', id);
  return r ? toProject(r) : null;
}

export async function saveProject(p: Omit<Project, 'createdAt' | 'updatedAt'> & { createdAt?: number }): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  await db.runAsync(
    `INSERT INTO projects (id, name, instructions, provider_id, model_id, mcp_server_ids, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, instructions = excluded.instructions, provider_id = excluded.provider_id,
       model_id = excluded.model_id, mcp_server_ids = excluded.mcp_server_ids, updated_at = excluded.updated_at`,
    p.id,
    p.name,
    p.instructions,
    p.providerId,
    p.modelId,
    p.mcpServerIds ? JSON.stringify(p.mcpServerIds) : null,
    p.createdAt ?? now,
    now,
  );
}

export async function deleteProject(id: string): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM project_files WHERE project_id = ?', id);
    await db.runAsync('DELETE FROM projects WHERE id = ?', id);
    await db.runAsync('UPDATE chats SET project_id = NULL WHERE project_id = ?', id);
  });
}

export async function listProjectFiles(projectId: string): Promise<ProjectFile[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ id: string; project_id: string; name: string; content: string; created_at: number }>('SELECT * FROM project_files WHERE project_id = ? ORDER BY created_at', projectId);
  return rows.map((r) => ({ id: r.id, projectId: r.project_id, name: r.name, content: r.content, createdAt: r.created_at }));
}

export async function addProjectFile(projectId: string, name: string, content: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('INSERT INTO project_files (id, project_id, name, content, created_at) VALUES (?, ?, ?, ?, ?)', uid(), projectId, name, content, Date.now());
}

export async function deleteProjectFile(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM project_files WHERE id = ?', id);
}

/* ---------- chats & messages ---------- */

export interface Chat {
  id: string;
  title: string;
  projectId: string | null;
  providerId: string;
  modelId: string;
  activeLeafId: string | null;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
  deleted: boolean;
}

type ChatDb = { id: string; title: string; project_id: string | null; provider_id: string; model_id: string; active_leaf_id: string | null; pinned: number; created_at: number; updated_at: number; deleted: number };
const toChat = (r: ChatDb): Chat => ({
  id: r.id,
  title: r.title,
  projectId: r.project_id,
  providerId: r.provider_id,
  modelId: r.model_id,
  activeLeafId: r.active_leaf_id,
  pinned: !!r.pinned,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  deleted: !!r.deleted,
});

export async function listChats(opts: { query?: string; projectId?: string | null; limit?: number } = {}): Promise<Chat[]> {
  const db = await getDb();
  const where: string[] = ['c.deleted = 0'];
  const params: (string | number)[] = [];
  if (opts.projectId !== undefined) {
    if (opts.projectId === null) where.push('c.project_id IS NULL');
    else {
      where.push('c.project_id = ?');
      params.push(opts.projectId);
    }
  }
  if (opts.query?.trim()) {
    const q = `%${opts.query.trim().replace(/[%_]/g, (m) => `\\${m}`)}%`;
    where.push(`(c.title LIKE ? ESCAPE '\\' OR EXISTS (SELECT 1 FROM messages m WHERE m.chat_id = c.id AND m.deleted = 0 AND m.blocks LIKE ? ESCAPE '\\'))`);
    params.push(q, q);
  }
  params.push(opts.limit ?? 500);
  const rows = await db.getAllAsync<ChatDb>(`SELECT c.* FROM chats c WHERE ${where.join(' AND ')} ORDER BY c.pinned DESC, c.updated_at DESC LIMIT ?`, ...params);
  return rows.map(toChat);
}

export async function getChat(id: string): Promise<Chat | null> {
  const db = await getDb();
  const r = await db.getFirstAsync<ChatDb>('SELECT * FROM chats WHERE id = ?', id);
  return r ? toChat(r) : null;
}

export async function createChat(c: { title: string; projectId: string | null; providerId: string; modelId: string }): Promise<Chat> {
  const db = await getDb();
  const now = Date.now();
  const chat: Chat = { id: uid(), title: c.title, projectId: c.projectId, providerId: c.providerId, modelId: c.modelId, activeLeafId: null, pinned: false, createdAt: now, updatedAt: now, deleted: false };
  await db.runAsync(
    'INSERT INTO chats (id, title, project_id, provider_id, model_id, active_leaf_id, pinned, created_at, updated_at, deleted) VALUES (?, ?, ?, ?, ?, NULL, 0, ?, ?, 0)',
    chat.id,
    chat.title,
    chat.projectId,
    chat.providerId,
    chat.modelId,
    now,
    now,
  );
  return chat;
}

export async function updateChat(id: string, patch: Partial<Pick<Chat, 'title' | 'projectId' | 'providerId' | 'modelId' | 'activeLeafId' | 'pinned' | 'deleted'>>): Promise<void> {
  const db = await getDb();
  const cols: string[] = [];
  const vals: (string | number | null)[] = [];
  const map: Record<string, string> = { title: 'title', projectId: 'project_id', providerId: 'provider_id', modelId: 'model_id', activeLeafId: 'active_leaf_id', pinned: 'pinned', deleted: 'deleted' };
  for (const [k, v] of Object.entries(patch)) {
    const col = map[k];
    if (!col || v === undefined) continue;
    cols.push(`${col} = ?`);
    vals.push(typeof v === 'boolean' ? (v ? 1 : 0) : (v as string | null));
  }
  cols.push('updated_at = ?');
  vals.push(Date.now());
  await db.runAsync(`UPDATE chats SET ${cols.join(', ')} WHERE id = ?`, ...vals, id);
}

export async function deleteChat(id: string): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE chats SET deleted = 1, updated_at = ? WHERE id = ?', now, id);
    await db.runAsync('UPDATE messages SET deleted = 1, updated_at = ? WHERE chat_id = ?', now, id);
  });
}

export interface StoredMessage {
  id: string;
  chatId: string;
  parentId: string | null;
  role: 'user' | 'assistant';
  blocks: Block[];
  raw: ProviderRaw | null;
  providerId: string | null;
  modelId: string | null;
  stopReason: string | null;
  error: string | null;
  createdAt: number;
  updatedAt: number;
}

type MessageDb = { id: string; chat_id: string; parent_id: string | null; role: string; blocks: string; raw: string | null; provider_id: string | null; model_id: string | null; stop_reason: string | null; error: string | null; created_at: number; updated_at: number; deleted: number };

const toMessage = (r: MessageDb): StoredMessage => ({
  id: r.id,
  chatId: r.chat_id,
  parentId: r.parent_id,
  role: r.role as 'user' | 'assistant',
  blocks: JSON.parse(r.blocks) as Block[],
  raw: r.raw ? (JSON.parse(r.raw) as ProviderRaw) : null,
  providerId: r.provider_id,
  modelId: r.model_id,
  stopReason: r.stop_reason,
  error: r.error,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export async function listMessages(chatId: string): Promise<StoredMessage[]> {
  const db = await getDb();
  return (await db.getAllAsync<MessageDb>('SELECT * FROM messages WHERE chat_id = ? AND deleted = 0 ORDER BY created_at, rowid', chatId)).map(toMessage);
}

export async function insertMessage(m: { chatId: string; parentId: string | null; message: ChatMessage; providerId?: string | null; modelId?: string | null; stopReason?: string | null; error?: string | null }): Promise<StoredMessage> {
  const db = await getDb();
  const now = Date.now();
  const row: StoredMessage = {
    id: uid(),
    chatId: m.chatId,
    parentId: m.parentId,
    role: m.message.role,
    blocks: m.message.blocks,
    raw: m.message.raw ?? null,
    providerId: m.providerId ?? null,
    modelId: m.modelId ?? null,
    stopReason: m.stopReason ?? null,
    error: m.error ?? null,
    createdAt: now,
    updatedAt: now,
  };
  await db.runAsync(
    'INSERT INTO messages (id, chat_id, parent_id, role, blocks, raw, provider_id, model_id, stop_reason, error, created_at, updated_at, deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)',
    row.id,
    row.chatId,
    row.parentId,
    row.role,
    JSON.stringify(row.blocks),
    row.raw ? JSON.stringify(row.raw) : null,
    row.providerId,
    row.modelId,
    row.stopReason,
    row.error,
    now,
    now,
  );
  await db.runAsync('UPDATE chats SET active_leaf_id = ?, updated_at = ? WHERE id = ?', row.id, now, m.chatId);
  return row;
}

/** Deletes a message and its whole subtree; returns the parent to fall back to. */
export async function deleteMessageSubtree(chatId: string, messageId: string): Promise<string | null> {
  const db = await getDb();
  const all = await listMessages(chatId);
  const target = all.find((m) => m.id === messageId);
  if (!target) return null;
  const doomed = new Set([messageId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const m of all) if (m.parentId && doomed.has(m.parentId) && !doomed.has(m.id)) {
      doomed.add(m.id);
      grew = true;
    }
  }
  const now = Date.now();
  await db.withTransactionAsync(async () => {
    for (const id of doomed) await db.runAsync('UPDATE messages SET deleted = 1, updated_at = ? WHERE id = ?', now, id);
  });
  return target.parentId;
}

/* ---------- usage ---------- */

export interface UsageEvent {
  id: string;
  chatId: string | null;
  messageId: string | null;
  providerId: string;
  modelId: string;
  usage: Usage;
  costMicro: number;
  kind: 'chat' | 'title' | 'other';
  createdAt: number;
}

export async function insertUsage(e: Omit<UsageEvent, 'id' | 'createdAt'>): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO usage_events (id, chat_id, message_id, provider_id, model_id, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, reasoning_tokens, cost_micro, estimated, kind, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    uid(),
    e.chatId,
    e.messageId,
    e.providerId,
    e.modelId,
    e.usage.inputTokens,
    e.usage.outputTokens,
    e.usage.cacheReadTokens,
    e.usage.cacheWriteTokens,
    e.usage.reasoningTokens,
    e.costMicro,
    e.usage.estimated ? 1 : 0,
    e.kind,
    Date.now(),
  );
}

export interface UsageAgg {
  key: string;
  costMicro: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  requests: number;
}

export async function usageTotals(since: number, scope?: string): Promise<{ costMicro: number; requests: number }> {
  const db = await getDb();
  const r = scope
    ? await db.getFirstAsync<{ c: number | null; n: number }>('SELECT SUM(cost_micro) c, COUNT(*) n FROM usage_events WHERE created_at >= ? AND provider_id = ?', since, scope)
    : await db.getFirstAsync<{ c: number | null; n: number }>('SELECT SUM(cost_micro) c, COUNT(*) n FROM usage_events WHERE created_at >= ?', since);
  return { costMicro: r?.c ?? 0, requests: r?.n ?? 0 };
}

export async function usageGrouped(since: number, by: 'provider' | 'model' | 'chat' | 'day', tzOffsetMin: number): Promise<UsageAgg[]> {
  const db = await getDb();
  const key =
    by === 'provider'
      ? 'provider_id'
      : by === 'model'
        ? "provider_id || '/' || model_id"
        : by === 'chat'
          ? "COALESCE(chat_id, '')"
          : `strftime('%Y-%m-%d', (created_at / 1000) + ${-tzOffsetMin * 60}, 'unixepoch')`;
  const rows = await db.getAllAsync<{ k: string; c: number; i: number; o: number; cr: number; n: number }>(
    `SELECT ${key} k, SUM(cost_micro) c, SUM(input_tokens) i, SUM(output_tokens) o, SUM(cache_read_tokens) cr, COUNT(*) n FROM usage_events WHERE created_at >= ? GROUP BY k ORDER BY ${by === 'day' ? 'k' : 'c DESC'}`,
    since,
  );
  return rows.map((r) => ({ key: r.k, costMicro: r.c ?? 0, inputTokens: r.i ?? 0, outputTokens: r.o ?? 0, cacheReadTokens: r.cr ?? 0, requests: r.n }));
}

export async function usageForMessages(ids: string[]): Promise<Map<string, { costMicro: number; usage: Usage; modelId: string }>> {
  const out = new Map<string, { costMicro: number; usage: Usage; modelId: string }>();
  if (!ids.length) return out;
  const db = await getDb();
  for (let i = 0; i < ids.length; i += 400) {
    const chunk = ids.slice(i, i + 400);
    const rows = await db.getAllAsync<{ message_id: string; model_id: string; cost_micro: number; input_tokens: number; output_tokens: number; cache_read_tokens: number; cache_write_tokens: number; reasoning_tokens: number; estimated: number }>(
      `SELECT * FROM usage_events WHERE message_id IN (${chunk.map(() => '?').join(',')})`,
      ...chunk,
    );
    for (const r of rows) {
      out.set(r.message_id, {
        costMicro: r.cost_micro,
        modelId: r.model_id,
        usage: {
          inputTokens: r.input_tokens,
          outputTokens: r.output_tokens,
          cacheReadTokens: r.cache_read_tokens,
          cacheWriteTokens: r.cache_write_tokens,
          reasoningTokens: r.reasoning_tokens,
          estimated: !!r.estimated,
        },
      });
    }
  }
  return out;
}

export async function chatCost(chatId: string): Promise<number> {
  const db = await getDb();
  const r = await db.getFirstAsync<{ c: number | null }>('SELECT SUM(cost_micro) c FROM usage_events WHERE chat_id = ?', chatId);
  return r?.c ?? 0;
}

export async function exportUsageCsv(): Promise<string> {
  const db = await getDb();
  const rows = await db.getAllAsync<Record<string, string | number | null>>('SELECT * FROM usage_events ORDER BY created_at');
  const cols = ['created_at', 'provider_id', 'model_id', 'kind', 'input_tokens', 'cache_read_tokens', 'cache_write_tokens', 'output_tokens', 'reasoning_tokens', 'cost_micro', 'estimated', 'chat_id'];
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [['date', ...cols.slice(1), 'cost_usd'].join(',')];
  for (const r of rows) {
    lines.push([new Date(Number(r.created_at)).toISOString(), ...cols.slice(1).map((c) => esc(r[c])), (Number(r.cost_micro) / 1e6).toFixed(6)].join(','));
  }
  return lines.join('\n');
}

/* ---------- budgets ---------- */

export interface Budget {
  id: string;
  scope: string;
  period: 'day' | 'month';
  limitMicro: number;
  hard: boolean;
  notifiedAt: number | null;
}

export async function listBudgets(): Promise<Budget[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ id: string; scope: string; period: string; limit_micro: number; hard: number; notified_at: number | null }>('SELECT * FROM budgets ORDER BY period, scope');
  return rows.map((r) => ({ id: r.id, scope: r.scope, period: r.period as 'day' | 'month', limitMicro: r.limit_micro, hard: !!r.hard, notifiedAt: r.notified_at }));
}

export async function saveBudget(b: Omit<Budget, 'notifiedAt'> & { notifiedAt?: number | null }): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO budgets (id, scope, period, limit_micro, hard, notified_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET scope = excluded.scope, period = excluded.period, limit_micro = excluded.limit_micro, hard = excluded.hard, notified_at = excluded.notified_at`,
    b.id,
    b.scope,
    b.period,
    b.limitMicro,
    b.hard ? 1 : 0,
    b.notifiedAt ?? null,
  );
}

export async function deleteBudget(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM budgets WHERE id = ?', id);
}

/* ---------- MCP ---------- */

export type McpAuthType = 'none' | 'bearer' | 'headers' | 'oauth' | 'relay';

export interface McpServerRow {
  id: string;
  name: string;
  url: string;
  transport: 'http' | 'sse';
  authType: McpAuthType;
  enabled: boolean;
  createdAt: number;
}

export async function listMcpServers(): Promise<McpServerRow[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ id: string; name: string; url: string; transport: string; auth_type: string; enabled: number; created_at: number }>('SELECT * FROM mcp_servers ORDER BY created_at');
  return rows.map((r) => ({ id: r.id, name: r.name, url: r.url, transport: r.transport as 'http' | 'sse', authType: r.auth_type as McpAuthType, enabled: !!r.enabled, createdAt: r.created_at }));
}

export async function saveMcpServer(s: Omit<McpServerRow, 'createdAt'> & { createdAt?: number }): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO mcp_servers (id, name, url, transport, auth_type, enabled, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, url = excluded.url, transport = excluded.transport, auth_type = excluded.auth_type, enabled = excluded.enabled`,
    s.id,
    s.name,
    s.url,
    s.transport,
    s.authType,
    s.enabled ? 1 : 0,
    s.createdAt ?? Date.now(),
  );
}

export async function deleteMcpServer(id: string): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM mcp_servers WHERE id = ?', id);
    await db.runAsync('DELETE FROM mcp_tool_prefs WHERE server_id = ?', id);
  });
}

export interface ToolPref {
  serverId: string;
  toolName: string;
  enabled: boolean;
  approval: 'ask' | 'always';
}

export async function listToolPrefs(): Promise<ToolPref[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ server_id: string; tool_name: string; enabled: number; approval: string }>('SELECT * FROM mcp_tool_prefs');
  return rows.map((r) => ({ serverId: r.server_id, toolName: r.tool_name, enabled: !!r.enabled, approval: r.approval as 'ask' | 'always' }));
}

export async function setToolPref(serverId: string, toolName: string, patch: { enabled?: boolean; approval?: 'ask' | 'always' }): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO mcp_tool_prefs (server_id, tool_name, enabled, approval) VALUES (?, ?, ?, ?)
     ON CONFLICT(server_id, tool_name) DO UPDATE SET enabled = COALESCE(?, mcp_tool_prefs.enabled), approval = COALESCE(?, mcp_tool_prefs.approval)`,
    serverId,
    toolName,
    patch.enabled === false ? 0 : 1,
    patch.approval ?? 'ask',
    patch.enabled === undefined ? null : patch.enabled ? 1 : 0,
    patch.approval ?? null,
  );
}

export async function logToolCall(e: { serverId: string; tool: string; args: unknown; result: string; isError: boolean; durationMs: number }): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO tool_log (id, server_id, tool, args, result, is_error, duration_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    uid(),
    e.serverId,
    e.tool,
    JSON.stringify(e.args).slice(0, 4000),
    e.result.slice(0, 4000),
    e.isError ? 1 : 0,
    e.durationMs,
    Date.now(),
  );
  await db.runAsync('DELETE FROM tool_log WHERE created_at < ?', Date.now() - 30 * 86_400_000);
}

export async function listToolLog(serverId: string, limit = 50): Promise<{ tool: string; args: string; result: string; isError: boolean; durationMs: number; createdAt: number }[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ tool: string; args: string; result: string; is_error: number; duration_ms: number; created_at: number }>('SELECT * FROM tool_log WHERE server_id = ? ORDER BY created_at DESC LIMIT ?', serverId, limit);
  return rows.map((r) => ({ tool: r.tool, args: r.args, result: r.result, isError: !!r.is_error, durationMs: r.duration_ms, createdAt: r.created_at }));
}

/* ---------- sync helpers ---------- */

export async function changedSince(since: number): Promise<{ chats: (ChatDb & { deleted: number })[]; messages: MessageDb[] }> {
  const db = await getDb();
  return {
    chats: await db.getAllAsync<ChatDb>('SELECT * FROM chats WHERE updated_at > ?', since),
    messages: await db.getAllAsync<MessageDb>('SELECT * FROM messages WHERE updated_at > ?', since),
  };
}

export async function applyRemote(chats: ChatDb[], messages: MessageDb[]): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const c of chats) {
      await db.runAsync(
        `INSERT INTO chats (id, title, project_id, provider_id, model_id, active_leaf_id, pinned, created_at, updated_at, deleted) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET title = excluded.title, project_id = excluded.project_id, provider_id = excluded.provider_id, model_id = excluded.model_id,
           active_leaf_id = excluded.active_leaf_id, updated_at = excluded.updated_at, deleted = excluded.deleted WHERE excluded.updated_at > chats.updated_at`,
        c.id,
        c.title,
        c.project_id,
        c.provider_id,
        c.model_id,
        c.active_leaf_id,
        c.created_at,
        c.updated_at,
        c.deleted,
      );
    }
    for (const m of messages) {
      await db.runAsync(
        `INSERT INTO messages (id, chat_id, parent_id, role, blocks, raw, provider_id, model_id, stop_reason, error, created_at, updated_at, deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET blocks = excluded.blocks, raw = excluded.raw, updated_at = excluded.updated_at, deleted = excluded.deleted WHERE excluded.updated_at > messages.updated_at`,
        m.id,
        m.chat_id,
        m.parent_id,
        m.role,
        m.blocks,
        m.raw,
        m.provider_id,
        m.model_id,
        m.created_at,
        m.updated_at,
        m.deleted,
      );
    }
  });
}

export type { ChatDb, MessageDb };

/* ---------- wipe ---------- */

export async function wipeAll(): Promise<void> {
  const db = await getDb();
  await db.execAsync(
    'DELETE FROM messages; DELETE FROM chats; DELETE FROM usage_events; DELETE FROM project_files; DELETE FROM projects; DELETE FROM mcp_tool_prefs; DELETE FROM mcp_servers; DELETE FROM tool_log; DELETE FROM budgets; DELETE FROM models; DELETE FROM prices; DELETE FROM providers; DELETE FROM settings;',
  );
}

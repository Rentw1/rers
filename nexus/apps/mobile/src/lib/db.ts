import * as SQLite from 'expo-sqlite';

let db: SQLite.SQLiteDatabase | null = null;

const MIGRATIONS: string[] = [
  `
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS providers (
    id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL, base_url TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1, is_custom INTEGER NOT NULL DEFAULT 0, has_key INTEGER NOT NULL DEFAULT 0,
    stream_usage INTEGER NOT NULL DEFAULT 1, models_synced_at INTEGER, created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS models (
    provider_id TEXT NOT NULL, id TEXT NOT NULL, name TEXT NOT NULL, context_window INTEGER, max_output INTEGER,
    vision INTEGER NOT NULL DEFAULT 0, tools INTEGER NOT NULL DEFAULT 1, reasoning INTEGER NOT NULL DEFAULT 0,
    visible INTEGER NOT NULL DEFAULT 1, favorite INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (provider_id, id)
  );
  CREATE TABLE IF NOT EXISTS prices (
    provider_id TEXT NOT NULL, model_id TEXT NOT NULL, input REAL NOT NULL, output REAL NOT NULL,
    cache_read REAL, cache_write REAL, source TEXT NOT NULL, updated_at TEXT NOT NULL,
    PRIMARY KEY (provider_id, model_id, source)
  );
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, instructions TEXT NOT NULL DEFAULT '',
    provider_id TEXT, model_id TEXT, mcp_server_ids TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS project_files (
    id TEXT PRIMARY KEY NOT NULL, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL, content TEXT NOT NULL, created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS chats (
    id TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL, project_id TEXT, provider_id TEXT NOT NULL, model_id TEXT NOT NULL,
    active_leaf_id TEXT, pinned INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
    deleted INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS chats_updated ON chats(deleted, updated_at DESC);
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY NOT NULL, chat_id TEXT NOT NULL, parent_id TEXT, role TEXT NOT NULL, blocks TEXT NOT NULL,
    raw TEXT, provider_id TEXT, model_id TEXT, stop_reason TEXT, error TEXT,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS messages_chat ON messages(chat_id, created_at);
  CREATE INDEX IF NOT EXISTS messages_parent ON messages(parent_id);
  CREATE INDEX IF NOT EXISTS messages_updated ON messages(updated_at);
  CREATE TABLE IF NOT EXISTS usage_events (
    id TEXT PRIMARY KEY NOT NULL, chat_id TEXT, message_id TEXT, provider_id TEXT NOT NULL, model_id TEXT NOT NULL,
    input_tokens INTEGER NOT NULL, output_tokens INTEGER NOT NULL, cache_read_tokens INTEGER NOT NULL,
    cache_write_tokens INTEGER NOT NULL, reasoning_tokens INTEGER NOT NULL, cost_micro INTEGER NOT NULL,
    estimated INTEGER NOT NULL, kind TEXT NOT NULL DEFAULT 'chat', created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS usage_created ON usage_events(created_at);
  CREATE INDEX IF NOT EXISTS usage_provider ON usage_events(provider_id, created_at);
  CREATE INDEX IF NOT EXISTS usage_message ON usage_events(message_id);
  CREATE TABLE IF NOT EXISTS mcp_servers (
    id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, url TEXT NOT NULL, transport TEXT NOT NULL,
    auth_type TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS mcp_tool_prefs (
    server_id TEXT NOT NULL, tool_name TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, approval TEXT NOT NULL DEFAULT 'ask',
    PRIMARY KEY (server_id, tool_name)
  );
  CREATE TABLE IF NOT EXISTS tool_log (
    id TEXT PRIMARY KEY NOT NULL, server_id TEXT NOT NULL, tool TEXT NOT NULL, args TEXT NOT NULL, result TEXT NOT NULL,
    is_error INTEGER NOT NULL, duration_ms INTEGER NOT NULL, created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS tool_log_created ON tool_log(created_at);
  CREATE TABLE IF NOT EXISTS budgets (
    id TEXT PRIMARY KEY NOT NULL, scope TEXT NOT NULL, period TEXT NOT NULL, limit_micro INTEGER NOT NULL,
    hard INTEGER NOT NULL DEFAULT 1, notified_at INTEGER
  );
  `,
];

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;
  const d = await SQLite.openDatabaseAsync('nexus.db');
  await d.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = await d.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  for (let v = current; v < MIGRATIONS.length; v++) {
    await d.withTransactionAsync(async () => {
      await d.execAsync(MIGRATIONS[v]!);
      await d.execAsync(`PRAGMA user_version = ${v + 1}`);
    });
  }
  db = d;
  return d;
}

export function dbSync(): SQLite.SQLiteDatabase {
  if (!db) throw new Error('База данных ещё не открыта');
  return db;
}

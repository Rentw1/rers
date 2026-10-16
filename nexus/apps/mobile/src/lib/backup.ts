import { getDb } from './db';

const TABLES = ['settings', 'providers', 'models', 'prices', 'projects', 'project_files', 'chats', 'messages', 'usage_events', 'mcp_servers', 'mcp_tool_prefs', 'budgets'] as const;
const FORMAT = 'nexus-backup';

/** Full export without secrets (API keys and tokens live only in the secure store). */
export async function exportBackup(): Promise<string> {
  const db = await getDb();
  const data: Record<string, unknown[]> = {};
  for (const t of TABLES) data[t] = await db.getAllAsync(`SELECT * FROM ${t}`);
  // Providers' has_key flag must not claim a key exists on the target device.
  data.providers = (data.providers as Record<string, unknown>[]).map((p) => ({ ...p, has_key: 0, enabled: p.is_custom || !['deepseek', 'openai', 'anthropic', 'gemini', 'openrouter', 'groq', 'mistral', 'xai', 'qwen', 'moonshot', 'together', 'perplexity'].includes(String(p.id)) ? p.enabled : 0 }));
  data.settings = (data.settings as { key: string }[]).filter((s) => s.key !== 'relay');
  data.mcp_servers = (data.mcp_servers as { auth_type: string }[]).filter((s) => s.auth_type !== 'relay');
  return JSON.stringify({ format: FORMAT, version: 1, exportedAt: new Date().toISOString(), data });
}

export async function importBackup(json: string): Promise<{ chats: number; messages: number }> {
  const parsed = JSON.parse(json) as { format?: string; version?: number; data?: Record<string, Record<string, unknown>[]> };
  if (parsed.format !== FORMAT || !parsed.data) throw new Error('Это не резервная копия Nexus');
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const t of TABLES) {
      const rows = parsed.data![t];
      if (!Array.isArray(rows)) continue;
      const cols = (await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${t})`)).map((c) => c.name);
      for (const r of rows) {
        const keys = Object.keys(r).filter((k) => cols.includes(k));
        if (!keys.length) continue;
        await db.runAsync(`INSERT OR REPLACE INTO ${t} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`, ...keys.map((k) => r[k] as string | number | null));
      }
    }
  });
  return { chats: parsed.data.chats?.length ?? 0, messages: parsed.data.messages?.length ?? 0 };
}

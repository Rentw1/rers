import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir, hostname, platform } from 'node:os';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { RELAY_DEFAULT_PORT } from '@nexus/core';

export const ServerEntry = z.union([
  z.object({
    command: z.string().min(1),
    args: z.array(z.string()).optional(),
    env: z.record(z.string(), z.string()).optional(),
    cwd: z.string().optional(),
    disabled: z.boolean().optional(),
  }),
  z.object({
    url: z.string().url(),
    headers: z.record(z.string(), z.string()).optional(),
    disabled: z.boolean().optional(),
  }),
]);
export type ServerEntry = z.infer<typeof ServerEntry>;

export const RelayConfig = z.object({
  name: z.string().min(1).max(100),
  port: z.number().int().min(1).max(65535),
  host: z.string(),
  mcpServers: z.record(z.string(), ServerEntry),
  allowedDirs: z.array(z.string()),
  shell: z.object({
    enabled: z.boolean(),
    /** Command names allowed for pc_shell_exec; empty with enabled=true means any command. */
    allow: z.array(z.string()),
    timeoutMs: z.number().int().min(1000).max(600_000),
  }),
  inboxDir: z.string(),
});
export type RelayConfig = z.infer<typeof RelayConfig>;

export const DATA_DIR = process.env.NEXUS_RELAY_HOME ?? join(homedir(), '.nexus-relay');
export const CONFIG_PATH = join(DATA_DIR, 'config.json');

export function defaultConfig(): RelayConfig {
  return {
    name: hostname() || 'Мой ПК',
    port: RELAY_DEFAULT_PORT,
    host: '0.0.0.0',
    mcpServers: {},
    allowedDirs: [join(homedir(), 'Nexus')],
    shell: { enabled: false, allow: ['ls', 'dir', 'git', 'node', 'python', 'python3', 'npm', 'pnpm', 'echo', 'cat', 'type', 'pwd', 'whoami', 'date'], timeoutMs: 60_000 },
    inboxDir: join(homedir(), 'Nexus', 'inbox'),
  };
}

export function writeJsonAtomic(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
  renameSync(tmp, path);
}

export function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch (e) {
    throw new Error(`Не удалось прочитать ${path}: ${(e as Error).message}`);
  }
}

export function loadConfig(): RelayConfig {
  const raw = readJson<Partial<RelayConfig>>(CONFIG_PATH, {});
  const merged = { ...defaultConfig(), ...raw, shell: { ...defaultConfig().shell, ...(raw.shell ?? {}) } };
  const parsed = RelayConfig.safeParse(merged);
  if (!parsed.success) throw new Error(`Ошибка в ${CONFIG_PATH}: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  if (!existsSync(CONFIG_PATH)) writeJsonAtomic(CONFIG_PATH, parsed.data);
  for (const d of [...parsed.data.allowedDirs, parsed.data.inboxDir]) mkdirSync(d, { recursive: true });
  return parsed.data;
}

export function saveConfig(cfg: RelayConfig): void {
  writeJsonAtomic(CONFIG_PATH, cfg);
}

export function claudeDesktopConfigPath(): string {
  const p = platform();
  if (p === 'win32') return join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'Claude', 'claude_desktop_config.json');
  if (p === 'darwin') return join(homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
  return join(homedir(), '.config', 'Claude', 'claude_desktop_config.json');
}

/** Merges `mcpServers` from Claude Desktop's config; returns the names that were added. */
export function importClaudeDesktop(cfg: RelayConfig, path = claudeDesktopConfigPath()): string[] {
  const src = readJson<{ mcpServers?: Record<string, unknown> }>(path, {});
  const added: string[] = [];
  for (const [name, entry] of Object.entries(src.mcpServers ?? {})) {
    const parsed = ServerEntry.safeParse(entry);
    if (!parsed.success || cfg.mcpServers[name]) continue;
    cfg.mcpServers[name] = parsed.data;
    added.push(name);
  }
  return added;
}

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Budget, Chat, McpServerDef, ModelRow, ProviderRow, Settings, StoredMessage, UsageEvent } from '../shared/types';
import type { PriceEntry } from '@nexus/core';

function writeAtomic(path: string, data: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, data, { mode: 0o600 });
  renameSync(tmp, path);
}

/** A JSON document cached in memory and persisted with debounced atomic writes. */
export class JsonDoc<T> {
  private value: T;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly path: string,
    fallback: T,
  ) {
    this.value = fallback;
    if (existsSync(path)) {
      try {
        this.value = JSON.parse(readFileSync(path, 'utf8')) as T;
      } catch {
        // Keep a copy of a corrupt file instead of silently losing it.
        renameSync(path, `${path}.corrupt-${Date.now()}`);
      }
    }
  }

  get(): T {
    return this.value;
  }

  set(v: T): void {
    this.value = v;
    this.schedule();
  }

  update(fn: (v: T) => T | void): T {
    const r = fn(this.value);
    if (r !== undefined) this.value = r;
    this.schedule();
    return this.value;
  }

  private schedule(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => this.flush(), 300);
  }

  flush(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    writeAtomic(this.path, JSON.stringify(this.value));
  }
}

export const DEFAULT_SETTINGS = (home: string): Settings => ({
  theme: 'system',
  defaultProviderId: 'deepseek',
  defaultModelId: 'deepseek-chat',
  customInstructions: '',
  currency: 'USD',
  fx: null,
  showCost: true,
  showReasoning: true,
  autoTitle: true,
  temperature: null,
  maxOutputTokens: null,
  pcToolsEnabled: true,
  allowedDirs: [join(home, 'Nexus')],
  shellEnabled: false,
  shellAllow: ['git', 'node', 'npm', 'pnpm', 'python', 'python3', 'ls', 'dir', 'cat', 'type', 'echo', 'pwd', 'whoami', 'date'],
  relayEnabled: false,
  relayPort: 4545,
  relayName: '',
  pricesSyncedAt: 0,
  sendOnEnter: true,
  onboarded: false,
});

export class Store {
  readonly settings: JsonDoc<Settings>;
  readonly providers: JsonDoc<ProviderRow[]>;
  readonly keys: JsonDoc<Record<string, string>>;
  readonly models: JsonDoc<Record<string, ModelRow[]>>;
  readonly prices: JsonDoc<PriceEntry[]>;
  readonly chats: JsonDoc<Chat[]>;
  readonly usage: JsonDoc<UsageEvent[]>;
  readonly mcp: JsonDoc<{ servers: McpServerDef[]; prefs: Record<string, { enabled: boolean; approval: 'ask' | 'always' }> }>;
  readonly budgets: JsonDoc<Budget[]>;
  private readonly messageDocs = new Map<string, JsonDoc<StoredMessage[]>>();

  constructor(
    readonly dir: string,
    home: string,
  ) {
    mkdirSync(join(dir, 'chats'), { recursive: true });
    const d = DEFAULT_SETTINGS(home);
    this.settings = new JsonDoc(join(dir, 'settings.json'), d);
    this.settings.set({ ...d, ...this.settings.get() });
    this.providers = new JsonDoc(join(dir, 'providers.json'), []);
    this.keys = new JsonDoc(join(dir, 'keys.json'), {});
    this.models = new JsonDoc(join(dir, 'models.json'), {});
    this.prices = new JsonDoc(join(dir, 'prices.json'), []);
    this.chats = new JsonDoc(join(dir, 'chats.json'), []);
    this.usage = new JsonDoc(join(dir, 'usage.json'), []);
    this.mcp = new JsonDoc(join(dir, 'mcp.json'), { servers: [], prefs: {} });
    this.budgets = new JsonDoc(join(dir, 'budgets.json'), []);
  }

  messages(chatId: string): JsonDoc<StoredMessage[]> {
    let doc = this.messageDocs.get(chatId);
    if (!doc) {
      if (!/^[A-Za-z0-9-]+$/.test(chatId)) throw new Error('Некорректный id чата');
      doc = new JsonDoc<StoredMessage[]>(join(this.dir, 'chats', `${chatId}.json`), []);
      this.messageDocs.set(chatId, doc);
    }
    return doc;
  }

  deleteChat(chatId: string): void {
    this.chats.update((list) => list.filter((c) => c.id !== chatId));
    const doc = this.messageDocs.get(chatId);
    doc?.flush();
    this.messageDocs.delete(chatId);
    rmSync(join(this.dir, 'chats', `${chatId}.json`), { force: true });
  }

  flushAll(): void {
    for (const d of [this.settings, this.providers, this.keys, this.models, this.prices, this.chats, this.usage, this.mcp, this.budgets]) d.flush();
    for (const d of this.messageDocs.values()) d.flush();
  }
}

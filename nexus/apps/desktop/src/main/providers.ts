import { randomUUID } from 'node:crypto';
import {
  CATALOG,
  PriceBook,
  ProviderError,
  SEED_PRICES,
  catalogEntry,
  checkUrlSecurity,
  costMicroUsd,
  createProvider,
  pricesFromOpenRouter,
  type LLMProvider,
  type ModelInfo,
  type ProviderConfig,
  type ProviderKind,
  type Usage,
} from '@nexus/core';
import type { ModelRow, ProviderRow } from '../shared/types';
import type { Store } from './store';

export interface Secrets {
  encrypt(plain: string): string;
  decrypt(enc: string): string;
}

const fetchFn = (url: string, init?: RequestInit) => fetch(url, init);

export class Providers {
  private book = new PriceBook(SEED_PRICES);

  constructor(
    private readonly store: Store,
    private readonly secrets: Secrets,
  ) {
    this.bootstrap();
    this.refreshBook();
  }

  private bootstrap(): void {
    const existing = new Set(this.store.providers.get().map((p) => p.id));
    for (const c of CATALOG) {
      if (existing.has(c.id)) continue;
      this.store.providers.update((list) => [
        ...list,
        { id: c.id, name: c.name, kind: c.kind, baseUrl: c.baseUrl, enabled: false, isCustom: false, hasKey: false, streamUsage: c.streamUsage, requiresKey: c.requiresKey, editableBaseUrl: c.editableBaseUrl },
      ]);
      if (c.models.length) this.mergeModels(c.id, c.models, true);
    }
  }

  list(): ProviderRow[] {
    return this.store.providers.get().map((p) => {
      const c = catalogEntry(p.id);
      return { ...p, description: c?.description, keyUrl: c?.keyUrl, pricingUrl: c?.pricingUrl, docsUrl: c?.docsUrl, requiresKey: c ? c.requiresKey : false, editableBaseUrl: c ? c.editableBaseUrl : true };
    });
  }

  get(id: string): ProviderRow {
    const p = this.list().find((x) => x.id === id);
    if (!p) throw new Error(`Провайдер «${id}» не найден`);
    return p;
  }

  apiKey(id: string): string {
    const enc = this.store.keys.get()[id];
    if (!enc) return '';
    try {
      return this.secrets.decrypt(enc);
    } catch {
      return '';
    }
  }

  maskedKey(id: string): string | null {
    const k = this.apiKey(id);
    if (!k) return null;
    return k.length <= 8 ? '••••' : `${k.slice(0, 4)}••••${k.slice(-4)}`;
  }

  config(id: string): ProviderConfig {
    const p = this.get(id);
    const key = this.apiKey(id);
    if (p.requiresKey && !key) throw new Error(`Не задан API-ключ для ${p.name}. Откройте Настройки → Провайдеры.`);
    const sec = checkUrlSecurity(p.baseUrl);
    if (sec) throw new Error(`${p.name}: ${sec}`);
    return { id: p.id, kind: p.kind, baseUrl: p.baseUrl, apiKey: key, headers: catalogEntry(id)?.headers, streamUsage: p.streamUsage };
  }

  llm(id: string): LLMProvider {
    return createProvider(this.config(id), fetchFn);
  }

  save(id: string, patch: { apiKey?: string | null; baseUrl?: string; enabled?: boolean; name?: string; streamUsage?: boolean }): void {
    const p = this.get(id);
    if (patch.baseUrl !== undefined) {
      const sec = checkUrlSecurity(patch.baseUrl);
      if (sec) throw new Error(sec);
    }
    let hasKey = p.hasKey;
    if (patch.apiKey !== undefined) {
      const key = patch.apiKey?.trim() ?? '';
      this.store.keys.update((k) => {
        if (key) k[id] = this.secrets.encrypt(key);
        else delete k[id];
      });
      hasKey = !!key;
    }
    this.store.providers.update((list) =>
      list.map((x) =>
        x.id === id
          ? {
              ...x,
              name: patch.name ?? x.name,
              baseUrl: patch.baseUrl?.trim().replace(/\/+$/, '') ?? x.baseUrl,
              streamUsage: patch.streamUsage ?? x.streamUsage,
              hasKey,
              enabled: patch.enabled ?? (p.requiresKey ? hasKey : x.enabled),
            }
          : x,
      ),
    );
  }

  addCustom(name: string, baseUrl: string, kind: ProviderKind = 'openai'): string {
    const sec = checkUrlSecurity(baseUrl);
    if (sec) throw new Error(sec);
    const id = `custom-${randomUUID().slice(0, 8)}`;
    this.store.providers.update((list) => [
      ...list,
      { id, name: name.trim() || 'Свой провайдер', kind, baseUrl: baseUrl.trim().replace(/\/+$/, ''), enabled: true, isCustom: true, hasKey: false, streamUsage: true, requiresKey: false, editableBaseUrl: true },
    ]);
    return id;
  }

  remove(id: string): void {
    this.store.providers.update((list) => list.filter((p) => p.id !== id || !p.isCustom));
    this.store.keys.update((k) => {
      delete k[id];
    });
    this.store.models.update((m) => {
      delete m[id];
    });
  }

  private mergeModels(providerId: string, models: ModelInfo[], visible: boolean): void {
    this.store.models.update((all) => {
      const cur = new Map((all[providerId] ?? []).map((m) => [m.id, m]));
      for (const m of models) {
        const prev = cur.get(m.id);
        cur.set(m.id, {
          providerId,
          id: m.id,
          name: m.name || m.id,
          contextWindow: m.contextWindow ?? prev?.contextWindow,
          maxOutput: m.maxOutput ?? prev?.maxOutput,
          vision: m.vision ?? prev?.vision,
          tools: m.tools ?? prev?.tools ?? true,
          reasoning: m.reasoning ?? prev?.reasoning,
          visible: prev?.visible ?? visible,
          favorite: prev?.favorite ?? false,
        });
      }
      all[providerId] = [...cur.values()];
    });
  }

  async test(id: string): Promise<number> {
    const llm = this.llm(id);
    try {
      return (await llm.listModels()).length;
    } catch (e) {
      if (!(e instanceof ProviderError) || ![404, 405].includes(e.status)) throw e;
      const model = this.models(id)[0]?.id;
      if (!model) throw e;
      for await (const ev of llm.chat({ model, messages: [{ role: 'user', blocks: [{ type: 'text', text: 'ping' }] }], maxOutputTokens: 1 })) if (ev.type === 'done') break;
      return this.models(id).length;
    }
  }

  async syncModels(id: string): Promise<number> {
    let models: ModelInfo[];
    try {
      models = await this.llm(id).listModels();
    } catch (e) {
      if (e instanceof ProviderError && [404, 405].includes(e.status)) return this.models(id).length;
      throw e;
    }
    const seed = new Set(catalogEntry(id)?.models.map((m) => m.id) ?? []);
    const big = models.length > 25;
    this.mergeModels(id, models.filter((m) => !big || seed.has(m.id)), true);
    this.mergeModels(id, models, false);
    const priced = models.filter((m) => m.pricing);
    if (priced.length) {
      const now = new Date().toISOString();
      this.store.prices.update((list) => [...list.filter((p) => !(p.providerId === id && p.source === 'provider')), ...priced.map((m) => ({ providerId: id, modelId: m.id, ...m.pricing!, source: 'provider' as const, updatedAt: now }))]);
      this.refreshBook();
    }
    return models.length;
  }

  models(providerId?: string): ModelRow[] {
    const all = this.store.models.get();
    const rows = providerId ? (all[providerId] ?? []) : Object.values(all).flat();
    return rows
      .map((m) => {
        const p = this.book.find(m.providerId, m.id);
        return { ...m, price: p ? { input: p.input, output: p.output, cacheRead: p.cacheRead, source: p.source } : null };
      })
      .sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name));
  }

  model(providerId: string, id: string): ModelRow {
    return this.models(providerId).find((m) => m.id === id) ?? { providerId, id, name: id, tools: true, visible: true, favorite: false };
  }

  setModelFlags(providerId: string, id: string, flags: { visible?: boolean; favorite?: boolean }): void {
    this.store.models.update((all) => {
      all[providerId] = (all[providerId] ?? []).map((m) => (m.id === id ? { ...m, ...flags } : m));
    });
  }

  addModel(providerId: string, id: string): void {
    this.mergeModels(providerId, [{ id, name: id, tools: true }], true);
  }

  pickerGroups(): { provider: ProviderRow; models: ModelRow[] }[] {
    return this.list()
      .filter((p) => p.enabled)
      .map((p) => ({ provider: p, models: this.models(p.id).filter((m) => m.visible) }))
      .filter((g) => g.models.length);
  }

  /* ---------- prices ---------- */

  refreshBook(): void {
    const b = new PriceBook(SEED_PRICES);
    b.addAll(this.store.prices.get());
    this.book = b;
  }

  cost(providerId: string, modelId: string, usage: Usage): number {
    return costMicroUsd(usage, this.book.find(providerId, modelId));
  }

  setUserPrice(providerId: string, modelId: string, p: { input: number; output: number; cacheRead?: number } | null): void {
    this.store.prices.update((list) => {
      const rest = list.filter((x) => !(x.providerId === providerId && x.modelId === modelId && x.source === 'user'));
      return p ? [...rest, { providerId, modelId, ...p, source: 'user' as const, updatedAt: new Date().toISOString() }] : rest;
    });
    this.refreshBook();
  }

  async syncOpenRouterPrices(): Promise<number> {
    const res = await fetch('https://openrouter.ai/api/v1/models', { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`OpenRouter: HTTP ${res.status}`);
    const j = (await res.json()) as { data?: { id: string; name?: string; pricing?: Record<string, string> }[] };
    const models: ModelInfo[] = [];
    for (const m of j.data ?? []) {
      const p = Number(m.pricing?.prompt);
      const c = Number(m.pricing?.completion);
      if (!Number.isFinite(p) || !Number.isFinite(c) || p < 0 || c < 0) continue;
      const cr = Number(m.pricing?.input_cache_read);
      models.push({ id: m.id, name: m.name ?? m.id, pricing: { input: p * 1e6, output: c * 1e6, cacheRead: m.pricing?.input_cache_read != null && Number.isFinite(cr) ? cr * 1e6 : undefined } });
    }
    const entries = pricesFromOpenRouter(models);
    this.store.prices.update((list) => [...list.filter((x) => x.source !== 'openrouter'), ...entries]);
    this.refreshBook();
    this.store.settings.update((s) => ({ ...s, pricesSyncedAt: Date.now() }));
    return entries.length;
  }

  async syncFx(): Promise<void> {
    const res = await fetch('https://open.er-api.com/v6/latest/USD', { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = (await res.json()) as { rates?: Record<string, number> };
    if (j.rates?.RUB && j.rates.EUR) this.store.settings.update((s) => ({ ...s, fx: { RUB: j.rates!.RUB!, EUR: j.rates!.EUR!, updatedAt: Date.now() } }));
  }

  async balances(): Promise<{ label: string; value: string }[]> {
    const out: { label: string; value: string }[] = [];
    const ds = this.apiKey('deepseek');
    const or = this.apiKey('openrouter');
    await Promise.all([
      ds
        ? fetch('https://api.deepseek.com/user/balance', { headers: { Authorization: `Bearer ${ds}` }, signal: AbortSignal.timeout(10_000) })
            .then(async (r) => {
              if (!r.ok) return;
              const j = (await r.json()) as { balance_infos?: { currency: string; total_balance: string }[] };
              for (const b of j.balance_infos ?? []) out.push({ label: 'DeepSeek', value: `${Number(b.total_balance).toFixed(2)} ${b.currency}` });
            })
            .catch(() => undefined)
        : null,
      or
        ? fetch('https://openrouter.ai/api/v1/credits', { headers: { Authorization: `Bearer ${or}` }, signal: AbortSignal.timeout(10_000) })
            .then(async (r) => {
              if (!r.ok) return;
              const j = (await r.json()) as { data?: { total_credits: number; total_usage: number } };
              if (j.data) out.push({ label: 'OpenRouter', value: `$${(j.data.total_credits - j.data.total_usage).toFixed(2)}` });
            })
            .catch(() => undefined)
        : null,
    ]);
    return out;
  }
}

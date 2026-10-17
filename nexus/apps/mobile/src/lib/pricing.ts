import { PriceBook, SEED_PRICES, costMicroUsd, pricesFromOpenRouter, type ModelInfo, type Usage } from '@nexus/core';
import { settings } from '@/store/settings';
import { fetchWithTimeout } from './net';
import * as repo from './repo';

let book = new PriceBook(SEED_PRICES);

export async function refreshPriceBook(): Promise<void> {
  const b = new PriceBook(SEED_PRICES);
  b.addAll(await repo.listPrices());
  book = b;
}

export const priceBook = () => book;

export function priceFor(providerId: string, modelId: string) {
  return book.find(providerId, modelId);
}

export function costOf(providerId: string, modelId: string, usage: Usage): number {
  return costMicroUsd(usage, priceFor(providerId, modelId));
}

const DAY = 86_400_000;

/** Daily: public OpenRouter catalog → native vendor prices. No key required. */
export async function syncOpenRouterPrices(force = false): Promise<number> {
  const s = settings();
  if (!force && Date.now() - s.pricesSyncedAt < DAY) return 0;
  const res = await fetchWithTimeout('https://openrouter.ai/api/v1/models', { headers: { Accept: 'application/json' } }, 20_000);
  if (!res.ok) throw new Error(`OpenRouter: HTTP ${res.status}`);
  const j = (await res.json()) as { data?: { id: string; name?: string; pricing?: Record<string, string> }[] };
  const models: ModelInfo[] = [];
  for (const m of j.data ?? []) {
    const p = Number(m.pricing?.prompt);
    const c = Number(m.pricing?.completion);
    if (!Number.isFinite(p) || !Number.isFinite(c) || p < 0 || c < 0) continue;
    const cr = Number(m.pricing?.input_cache_read);
    const cw = Number(m.pricing?.input_cache_write);
    models.push({
      id: m.id,
      name: m.name ?? m.id,
      pricing: {
        input: p * 1e6,
        output: c * 1e6,
        cacheRead: Number.isFinite(cr) && m.pricing?.input_cache_read != null ? cr * 1e6 : undefined,
        cacheWrite: Number.isFinite(cw) && m.pricing?.input_cache_write != null ? cw * 1e6 : undefined,
      },
    });
  }
  const entries = pricesFromOpenRouter(models);
  await repo.savePrices(entries, 'openrouter');
  await refreshPriceBook();
  await s.set('pricesSyncedAt', Date.now());
  return entries.length;
}

export async function syncFxRates(force = false): Promise<void> {
  const s = settings();
  if (!force && s.fx && Date.now() - s.fx.updatedAt < DAY) return;
  const res = await fetchWithTimeout('https://open.er-api.com/v6/latest/USD', {}, 15_000);
  if (!res.ok) throw new Error(`Курсы валют: HTTP ${res.status}`);
  const j = (await res.json()) as { rates?: Record<string, number> };
  const RUB = j.rates?.RUB;
  const EUR = j.rates?.EUR;
  if (!RUB || !EUR) throw new Error('Курсы валют недоступны');
  await s.set('fx', { RUB, EUR, updatedAt: Date.now() });
}

export async function setUserPrice(providerId: string, modelId: string, p: { input: number; output: number; cacheRead?: number; cacheWrite?: number }): Promise<void> {
  await repo.savePrices([{ providerId, modelId, ...p, source: 'user', updatedAt: new Date().toISOString() }]);
  await refreshPriceBook();
}

export async function clearUserPrice(providerId: string, modelId: string): Promise<void> {
  await repo.deleteUserPrice(providerId, modelId);
  await refreshPriceBook();
}

import type { ModelInfo, Price, Usage } from './types';

export interface PriceEntry extends Price {
  providerId: string;
  modelId: string;
  source: 'seed' | 'openrouter' | 'provider' | 'user';
  updatedAt: string;
}

const seed = (providerId: string, modelId: string, input: number, output: number, cacheRead?: number, cacheWrite?: number, updatedAt = '2025-10-01'): PriceEntry => ({
  providerId,
  modelId,
  input,
  output,
  cacheRead,
  cacheWrite,
  source: 'seed',
  updatedAt,
});

/** Built-in fallback prices (USD per 1M tokens). Overridden by provider listings, OpenRouter sync and user edits. */
export const SEED_PRICES: PriceEntry[] = [
  seed('deepseek', 'deepseek-chat', 0.28, 0.42, 0.028),
  seed('deepseek', 'deepseek-reasoner', 0.28, 0.42, 0.028),
  seed('openai', 'gpt-5', 1.25, 10, 0.125),
  seed('openai', 'gpt-5-mini', 0.25, 2, 0.025),
  seed('openai', 'gpt-5-nano', 0.05, 0.4, 0.005),
  seed('openai', 'gpt-4.1', 2, 8, 0.5),
  seed('openai', 'gpt-4.1-mini', 0.4, 1.6, 0.1),
  seed('openai', 'gpt-4.1-nano', 0.1, 0.4, 0.025),
  seed('openai', 'gpt-4o', 2.5, 10, 1.25),
  seed('openai', 'gpt-4o-mini', 0.15, 0.6, 0.075),
  seed('openai', 'o4-mini', 1.1, 4.4, 0.275),
  seed('openai', 'o3', 2, 8, 0.5),
  seed('anthropic', 'claude-fable-5-1', 10, 50, 0.25, 12.5, '2026-10-06'),
  seed('anthropic', 'claude-fable-5', 10, 50, 1, 12.5, '2026-10-06'),
  seed('anthropic', 'claude-opus-5-5', 4, 20, 0.2, 5, '2026-10-06'),
  seed('anthropic', 'claude-opus-5', 5, 25, 0.5, 6.25, '2026-10-06'),
  seed('anthropic', 'claude-opus-4-8', 5, 25, 0.5, 6.25, '2026-10-06'),
  seed('anthropic', 'claude-opus-4-7', 5, 25, 0.5, 6.25, '2026-10-06'),
  seed('anthropic', 'claude-opus-4-6', 5, 25, 0.5, 6.25, '2026-10-06'),
  seed('anthropic', 'claude-sonnet-5-5', 2, 10, 0.2, 2.5, '2026-10-06'),
  seed('anthropic', 'claude-sonnet-5', 2, 10, 0.2, 2.5, '2026-10-06'),
  seed('anthropic', 'claude-sonnet-4-6', 3, 15, 0.3, 3.75, '2026-10-06'),
  seed('anthropic', 'claude-haiku-5-5', 0.1, 0.5, 0.01, 0.125, '2026-10-06'),
  seed('anthropic', 'claude-haiku-4-5', 1, 5, 0.1, 1.25, '2026-10-06'),
  seed('gemini', 'gemini-2.5-pro', 1.25, 10, 0.31),
  seed('gemini', 'gemini-2.5-flash', 0.3, 2.5, 0.075),
  seed('gemini', 'gemini-2.5-flash-lite', 0.1, 0.4, 0.025),
  seed('gemini', 'gemini-2.0-flash', 0.1, 0.4, 0.025),
  seed('groq', 'llama-3.3-70b-versatile', 0.59, 0.79),
  seed('groq', 'llama-3.1-8b-instant', 0.05, 0.08),
  seed('groq', 'openai/gpt-oss-120b', 0.15, 0.75),
  seed('mistral', 'mistral-large-latest', 2, 6),
  seed('mistral', 'mistral-medium-latest', 0.4, 2),
  seed('mistral', 'mistral-small-latest', 0.1, 0.3),
  seed('xai', 'grok-4', 3, 15, 0.75),
  seed('xai', 'grok-3-mini', 0.3, 0.5, 0.075),
  seed('qwen', 'qwen-max', 1.6, 6.4),
  seed('qwen', 'qwen-plus', 0.4, 1.2),
  seed('qwen', 'qwen-turbo', 0.05, 0.2),
  seed('moonshot', 'kimi-k2-0905-preview', 0.6, 2.5, 0.15),
  seed('perplexity', 'sonar', 1, 1),
  seed('perplexity', 'sonar-pro', 3, 15),
  seed('perplexity', 'sonar-reasoning', 1, 5),
  seed('ollama', '*', 0, 0),
  seed('lmstudio', '*', 0, 0),
];

/** Maps OpenRouter vendor prefixes onto catalog provider ids. */
const OPENROUTER_VENDORS: Record<string, string> = {
  openai: 'openai',
  anthropic: 'anthropic',
  google: 'gemini',
  deepseek: 'deepseek',
  mistralai: 'mistral',
  'x-ai': 'xai',
  qwen: 'qwen',
  moonshotai: 'moonshot',
  perplexity: 'perplexity',
};

export function normalizeModelId(id: string): string {
  return id
    .toLowerCase()
    .replace(/^models\//, '')
    .replace(/[._:]/g, '-')
    .replace(/-(latest|preview)$/, '')
    .replace(/-\d{8}$/, '');
}

/** Converts an OpenRouter `/models` listing into price entries for both OpenRouter and the native vendors. */
export function pricesFromOpenRouter(models: ModelInfo[], now = new Date().toISOString()): PriceEntry[] {
  const out: PriceEntry[] = [];
  for (const mdl of models) {
    if (!mdl.pricing) continue;
    out.push({ providerId: 'openrouter', modelId: mdl.id, ...mdl.pricing, source: 'openrouter', updatedAt: now });
    const slash = mdl.id.indexOf('/');
    if (slash === -1) continue;
    const vendor = OPENROUTER_VENDORS[mdl.id.slice(0, slash)];
    if (!vendor) continue;
    const native = mdl.id.slice(slash + 1).replace(/:.*$/, '');
    if (mdl.id.endsWith(':free')) continue;
    out.push({ providerId: vendor, modelId: native, ...mdl.pricing, source: 'openrouter', updatedAt: now });
  }
  return out;
}

const SOURCE_RANK: Record<PriceEntry['source'], number> = { user: 4, provider: 3, openrouter: 2, seed: 1 };

export class PriceBook {
  private readonly exact = new Map<string, PriceEntry>();
  private readonly normalized = new Map<string, PriceEntry>();

  constructor(entries: PriceEntry[] = SEED_PRICES) {
    this.addAll(entries);
  }

  addAll(entries: PriceEntry[]): void {
    for (const e of entries) this.add(e);
  }

  add(e: PriceEntry): void {
    const k = `${e.providerId}|${e.modelId}`;
    const cur = this.exact.get(k);
    if (!cur || SOURCE_RANK[e.source] >= SOURCE_RANK[cur.source]) this.exact.set(k, e);
    const nk = `${e.providerId}|${normalizeModelId(e.modelId)}`;
    const ncur = this.normalized.get(nk);
    if (!ncur || SOURCE_RANK[e.source] >= SOURCE_RANK[ncur.source]) this.normalized.set(nk, e);
  }

  entries(): PriceEntry[] {
    return [...this.exact.values()];
  }

  find(providerId: string, modelId: string): PriceEntry | undefined {
    const direct = this.exact.get(`${providerId}|${modelId}`) ?? this.normalized.get(`${providerId}|${normalizeModelId(modelId)}`);
    if (direct) return direct;
    const wildcard = this.exact.get(`${providerId}|*`);
    if (wildcard) return wildcard;
    // Longest normalized prefix match (e.g. dated snapshots "gpt-4o-2024-08-06" → "gpt-4o").
    const n = normalizeModelId(modelId);
    let best: PriceEntry | undefined;
    let bestLen = 0;
    for (const [k, v] of this.normalized) {
      const [p, mid] = k.split('|') as [string, string];
      if (p !== providerId) continue;
      if (n.startsWith(mid + '-') && mid.length > bestLen) {
        best = v;
        bestLen = mid.length;
      }
    }
    return best;
  }
}

/** Cost in micro-USD (1e-6 USD), integer. Price is USD per 1M tokens, so tokens × price is already micro-USD. */
export function costMicroUsd(usage: Usage, price: Price | undefined): number {
  if (!price) return 0;
  const v =
    usage.inputTokens * price.input +
    usage.outputTokens * price.output +
    usage.cacheReadTokens * (price.cacheRead ?? price.input) +
    usage.cacheWriteTokens * (price.cacheWrite ?? price.input);
  return Math.max(0, Math.round(v));
}

export function formatMoney(microUsd: number, currency = 'USD', rate = 1): string {
  const value = (microUsd / 1e6) * rate;
  const symbol = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency === 'RUB' ? '₽' : currency + ' ';
  const abs = Math.abs(value);
  const digits = abs === 0 ? 2 : abs < 0.01 ? 4 : abs < 1 ? 3 : 2;
  const s = value.toFixed(digits);
  return currency === 'RUB' ? `${s} ${symbol}` : `${symbol}${s}`;
}

/** Rough token estimate for providers that omit usage: ~4 chars per token for Latin, ~2 for Cyrillic/CJK. */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  let ascii = 0;
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) < 128) ascii++;
  const other = text.length - ascii;
  return Math.ceil(ascii / 4 + other / 2);
}

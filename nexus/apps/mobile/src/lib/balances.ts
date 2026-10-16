import { fetchWithTimeout } from './net';
import * as repo from './repo';
import { apiKeyName, getSecret } from './secure';

export interface Balance {
  providerId: string;
  label: string;
  value: string;
}

/** Account balances where the provider exposes them (DeepSeek, OpenRouter). */
export async function fetchBalances(): Promise<Balance[]> {
  const out: Balance[] = [];
  const providers = (await repo.listProviders()).filter((p) => p.enabled);
  await Promise.all(
    providers.map(async (p) => {
      const key = await getSecret(apiKeyName(p.id));
      if (!key) return;
      try {
        if (p.id === 'deepseek') {
          const r = await fetchWithTimeout('https://api.deepseek.com/user/balance', { headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' } });
          if (!r.ok) return;
          const j = (await r.json()) as { is_available?: boolean; balance_infos?: { currency: string; total_balance: string }[] };
          for (const b of j.balance_infos ?? []) out.push({ providerId: p.id, label: 'DeepSeek', value: `${Number(b.total_balance).toFixed(2)} ${b.currency}${j.is_available === false ? ' (недостаточно)' : ''}` });
        } else if (p.id === 'openrouter') {
          const r = await fetchWithTimeout('https://openrouter.ai/api/v1/credits', { headers: { Authorization: `Bearer ${key}` } });
          if (!r.ok) return;
          const j = (await r.json()) as { data?: { total_credits: number; total_usage: number } };
          if (j.data) out.push({ providerId: p.id, label: 'OpenRouter', value: `$${(j.data.total_credits - j.data.total_usage).toFixed(2)}` });
        }
      } catch {
        // balance is optional
      }
    }),
  );
  return out;
}

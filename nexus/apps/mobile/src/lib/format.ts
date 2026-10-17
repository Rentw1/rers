import { formatMoney } from '@nexus/core';
import { settings } from '@/store/settings';

export function money(microUsd: number): string {
  const s = settings();
  const cur = s.currency;
  const rate = cur === 'USD' ? 1 : (s.fx?.[cur] ?? null);
  if (rate == null) return formatMoney(microUsd, 'USD', 1);
  return formatMoney(microUsd, cur, rate);
}

export function tokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}K`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

export function relativeTime(ts: number): string {
  const d = Date.now() - ts;
  const lang = settings().language;
  if (d < 60_000) return lang === 'en' ? 'now' : 'сейчас';
  if (d < 3_600_000) return lang === 'en' ? `${Math.floor(d / 60_000)}m` : `${Math.floor(d / 60_000)} мин`;
  if (d < 86_400_000) return lang === 'en' ? `${Math.floor(d / 3_600_000)}h` : `${Math.floor(d / 3_600_000)} ч`;
  const date = new Date(ts);
  return date.toLocaleDateString(lang === 'en' ? 'en-US' : 'ru-RU', { day: 'numeric', month: 'short' });
}

export function startOfDay(ts = Date.now()): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function startOfMonth(ts = Date.now()): number {
  const d = new Date(ts);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

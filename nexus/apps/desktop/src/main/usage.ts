import type { Budget, UsageEvent, UsageReport } from '../shared/types';

const DAY = 86_400_000;

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

const dayKey = (ts: number) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function rangeStart(range: 'day' | 'week' | 'month' | 'all'): number {
  if (range === 'day') return startOfDay();
  if (range === 'week') return startOfDay() - 6 * DAY;
  if (range === 'month') return startOfMonth();
  return 0;
}

export function budgetStates(events: UsageEvent[], budgets: Budget[]): { budget: Budget; spent: number; ratio: number }[] {
  return budgets.map((b) => {
    const since = b.period === 'day' ? startOfDay() : startOfMonth();
    const spent = events.filter((e) => e.createdAt >= since && (b.scope === 'all' || e.providerId === b.scope)).reduce((s, e) => s + e.costMicro, 0);
    return { budget: b, spent, ratio: b.limitMicro > 0 ? spent / b.limitMicro : 0 };
  });
}

export function buildReport(events: UsageEvent[], budgets: Budget[], range: 'day' | 'week' | 'month' | 'all', chatTitle: (id: string) => string): Omit<UsageReport, 'balances'> {
  const since = rangeStart(range);
  const inRange = events.filter((e) => e.createdAt >= since);
  const group = <K extends string>(key: (e: UsageEvent) => K) => {
    const m = new Map<K, UsageEvent[]>();
    for (const e of inRange) m.set(key(e), [...(m.get(key(e)) ?? []), e]);
    return m;
  };
  const sum = (list: UsageEvent[]) => list.reduce((s, e) => s + e.costMicro, 0);
  const days: { day: string; costMicro: number }[] = [];
  const first = startOfDay() - 29 * DAY;
  const byDayMap = new Map<string, number>();
  for (const e of events) if (e.createdAt >= first) byDayMap.set(dayKey(e.createdAt), (byDayMap.get(dayKey(e.createdAt)) ?? 0) + e.costMicro);
  for (let i = 0; i < 30; i++) {
    const k = dayKey(first + i * DAY + 3_600_000);
    days.push({ day: k, costMicro: byDayMap.get(k) ?? 0 });
  }
  return {
    totalMicro: sum(inRange),
    requests: inRange.length,
    byDay: days,
    byProvider: [...group((e) => e.providerId)].map(([key, l]) => ({ key, costMicro: sum(l), requests: l.length })).sort((a, b) => b.costMicro - a.costMicro),
    byModel: [...group((e) => `${e.providerId}/${e.modelId}`)]
      .map(([key, l]) => ({
        key,
        costMicro: sum(l),
        requests: l.length,
        inputTokens: l.reduce((s, e) => s + e.usage.inputTokens, 0),
        outputTokens: l.reduce((s, e) => s + e.usage.outputTokens, 0),
        cacheReadTokens: l.reduce((s, e) => s + e.usage.cacheReadTokens, 0),
      }))
      .sort((a, b) => b.costMicro - a.costMicro)
      .slice(0, 12),
    byChat: [...group((e) => e.chatId ?? '')]
      .filter(([k]) => k)
      .map(([key, l]) => ({ key, title: chatTitle(key), costMicro: sum(l) }))
      .sort((a, b) => b.costMicro - a.costMicro)
      .slice(0, 10),
    budgets: budgetStates(events, budgets),
  };
}

export function usageCsv(events: UsageEvent[]): string {
  const rows = ['date,provider,model,kind,input_tokens,cache_read_tokens,cache_write_tokens,output_tokens,reasoning_tokens,cost_usd,estimated,chat_id'];
  for (const e of events) {
    rows.push(
      [new Date(e.createdAt).toISOString(), e.providerId, e.modelId, e.kind, e.usage.inputTokens, e.usage.cacheReadTokens, e.usage.cacheWriteTokens, e.usage.outputTokens, e.usage.reasoningTokens, (e.costMicro / 1e6).toFixed(6), e.usage.estimated ? 1 : 0, e.chatId ?? '']
        .map((v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v)))
        .join(','),
    );
  }
  return rows.join('\n');
}

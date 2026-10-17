import { describe, expect, it } from 'vitest';
import type { Budget, UsageEvent } from '../src/shared/types';
import { budgetStates, buildReport, rangeStart, startOfDay, startOfMonth, usageCsv } from '../src/main/usage';

const usage = (i: number, o: number) => ({ inputTokens: i, outputTokens: o, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0, estimated: false });
const ev = (p: Partial<UsageEvent>): UsageEvent => ({ chatId: 'c1', messageId: 'm1', providerId: 'deepseek', modelId: 'deepseek-chat', usage: usage(1000, 100), costMicro: 1000, kind: 'chat', createdAt: Date.now(), ...p });

describe('usage', () => {
  it('computes range starts', () => {
    expect(rangeStart('all')).toBe(0);
    expect(rangeStart('day')).toBe(startOfDay());
    expect(rangeStart('month')).toBe(startOfMonth());
    expect(rangeStart('week')).toBeLessThan(startOfDay());
  });

  it('aggregates report by model, provider and chat', () => {
    const old = Date.now() - 40 * 86_400_000;
    const events = [ev({}), ev({ costMicro: 3000, modelId: 'deepseek-reasoner' }), ev({ providerId: 'openai', modelId: 'gpt', chatId: 'c2', costMicro: 500 }), ev({ createdAt: old, costMicro: 99_999 })];
    const r = buildReport(events, [], 'month', (id) => `T-${id}`);
    expect(r.totalMicro).toBe(4500);
    expect(r.requests).toBe(3);
    expect(r.byDay).toHaveLength(30);
    expect(r.byDay.reduce((s, d) => s + d.costMicro, 0)).toBe(4500);
    expect(r.byProvider[0]).toMatchObject({ key: 'deepseek', costMicro: 4000, requests: 2 });
    expect(r.byModel[0]).toMatchObject({ key: 'deepseek/deepseek-reasoner', costMicro: 3000, inputTokens: 1000, outputTokens: 100 });
    expect(r.byChat.find((c) => c.key === 'c2')).toMatchObject({ title: 'T-c2', costMicro: 500 });
    expect(buildReport(events, [], 'all', String).totalMicro).toBe(104_499);
  });

  it('evaluates budgets by scope and period', () => {
    const budgets: Budget[] = [
      { id: 'a', scope: 'all', period: 'month', limitMicro: 2000, hard: true },
      { id: 'b', scope: 'openai', period: 'day', limitMicro: 1000, hard: false },
      { id: 'z', scope: 'all', period: 'day', limitMicro: 0, hard: true },
    ];
    const s = budgetStates([ev({}), ev({ providerId: 'openai', costMicro: 500 })], budgets);
    expect(s[0]).toMatchObject({ spent: 1500, ratio: 0.75 });
    expect(s[1]).toMatchObject({ spent: 500, ratio: 0.5 });
    expect(s[2]!.ratio).toBe(0);
  });

  it('exports CSV with header and escaped values', () => {
    const csv = usageCsv([ev({ modelId: 'a,"b"' })]);
    const lines = csv.trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('"a,""b"""');
  });
});

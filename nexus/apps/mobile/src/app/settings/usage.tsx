import { File, Paths } from 'expo-file-system';
import { router, useFocusEffect } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useCallback, useState } from 'react';
import { Alert, View } from 'react-native';
import { BarChart, Donut } from '@/components/Charts';
import { Button, Chip, Row, Screen, Section, T } from '@/components/ui';
import { budgetStates, type BudgetState } from '@/lib/budget';
import { fetchBalances, type Balance } from '@/lib/balances';
import { money, startOfDay, startOfMonth, tokens } from '@/lib/format';
import * as repo from '@/lib/repo';
import { useTheme } from '@/lib/theme';

type Range = 'day' | 'week' | 'month' | 'all';

function sinceOf(r: Range): number {
  if (r === 'day') return startOfDay();
  if (r === 'week') return startOfDay() - 6 * 86_400_000;
  if (r === 'month') return startOfMonth();
  return 0;
}

function dayLabels(from: number, days: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(from + i * 86_400_000);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }
  return out;
}

export default function UsageScreen() {
  const { c } = useTheme();
  const [range, setRange] = useState<Range>('month');
  const [total, setTotal] = useState({ costMicro: 0, requests: 0 });
  const [byProvider, setByProvider] = useState<repo.UsageAgg[]>([]);
  const [byModel, setByModel] = useState<repo.UsageAgg[]>([]);
  const [byChat, setByChat] = useState<(repo.UsageAgg & { title: string })[]>([]);
  const [days, setDays] = useState<{ label: string; value: number }[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [budgets, setBudgets] = useState<BudgetState[]>([]);

  const load = useCallback(() => {
    void (async () => {
      const since = sinceOf(range);
      const tz = new Date().getTimezoneOffset();
      const [t, prov, mdl, chats, daily, bs] = await Promise.all([
        repo.usageTotals(since),
        repo.usageGrouped(since, 'provider', tz),
        repo.usageGrouped(since, 'model', tz),
        repo.usageGrouped(since, 'chat', tz),
        repo.usageGrouped(startOfDay() - 29 * 86_400_000, 'day', tz),
        budgetStates(),
      ]);
      setTotal(t);
      setByProvider(prov);
      setByModel(mdl.slice(0, 10));
      const titled = await Promise.all(chats.filter((x) => x.key).slice(0, 8).map(async (x) => ({ ...x, title: (await repo.getChat(x.key))?.title ?? 'Удалённый чат' })));
      setByChat(titled);
      const map = new Map(daily.map((d) => [d.key, d.costMicro]));
      setDays(dayLabels(startOfDay() - 29 * 86_400_000, 30).map((k) => ({ label: k.slice(5), value: map.get(k) ?? 0 })));
      setBudgets(bs);
    })();
    void fetchBalances().then(setBalances);
  }, [range]);
  useFocusEffect(load);

  const exportCsv = async () => {
    try {
      const csv = await repo.exportUsageCsv();
      const f = new File(Paths.cache, `nexus-usage-${new Date().toISOString().slice(0, 10)}.csv`);
      if (f.exists) f.delete();
      f.create();
      f.write(csv);
      await Sharing.shareAsync(f.uri, { mimeType: 'text/csv', dialogTitle: 'Экспорт расхода' });
    } catch (e) {
      Alert.alert('Ошибка экспорта', (e as Error).message);
    }
  };

  return (
    <Screen>
      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 16 }}>
        {(
          [
            ['day', 'Сегодня'],
            ['week', '7 дней'],
            ['month', 'Месяц'],
            ['all', 'Всё'],
          ] as const
        ).map(([k, l]) => (
          <Chip key={k} label={l} active={range === k} onPress={() => setRange(k)} />
        ))}
      </View>
      <View style={{ backgroundColor: c.card, borderRadius: 18, padding: 18, marginBottom: 20, borderWidth: 1, borderColor: c.border }}>
        <T v="small">Потрачено</T>
        <T v="title" style={{ fontSize: 34, marginVertical: 4 }}>
          {money(total.costMicro)}
        </T>
        <T v="caption">Запросов: {total.requests}</T>
      </View>

      {balances.length ? (
        <Section title="Баланс у провайдеров">
          {balances.map((b, i) => (
            <Row key={b.label} first={i === 0} icon="wallet-outline" title={b.label} right={<T style={{ fontWeight: '600' }}>{b.value}</T>} />
          ))}
        </Section>
      ) : null}

      {budgets.length ? (
        <Section title="Бюджеты">
          {budgets.map((b, i) => (
            <View key={b.budget.id} style={{ padding: 14, borderTopWidth: i ? 1 : 0, borderTopColor: c.border, gap: 6 }}>
              <View style={{ flexDirection: 'row' }}>
                <T style={{ flex: 1 }}>
                  {b.budget.period === 'day' ? 'День' : 'Месяц'} · {b.budget.scope === 'all' ? 'все провайдеры' : b.budget.scope}
                </T>
                <T v="small">
                  {money(b.spent)} / {money(b.budget.limitMicro)}
                </T>
              </View>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: c.border, overflow: 'hidden' }}>
                <View style={{ width: `${Math.min(b.ratio, 1) * 100}%`, height: '100%', backgroundColor: b.ratio >= 1 ? c.danger : b.ratio >= 0.8 ? c.warning : c.success }} />
              </View>
            </View>
          ))}
        </Section>
      ) : null}

      <Section title="По дням (30 дней)">
        <BarChart data={days} format={money} />
      </Section>

      <Section title="По провайдерам">
        <Donut data={byProvider.map((p) => ({ label: p.key, value: p.costMicro }))} format={money} center={money(byProvider.reduce((s, p) => s + p.costMicro, 0))} />
      </Section>

      <Section title="Топ моделей">
        {byModel.length ? (
          byModel.map((m, i) => <Row key={m.key} first={i === 0} title={m.key.split('/').slice(1).join('/') || m.key} subtitle={`${m.key.split('/')[0]} · ${m.requests} запр. · ${tokens(m.inputTokens + m.cacheReadTokens)} вх. · ${tokens(m.outputTokens)} вых.${m.cacheReadTokens ? ` · кэш ${tokens(m.cacheReadTokens)}` : ''}`} right={<T style={{ fontWeight: '600' }}>{money(m.costMicro)}</T>} />)
        ) : (
          <Row first title="Нет данных за период" />
        )}
      </Section>

      <Section title="Топ чатов">
        {byChat.length ? (
          byChat.map((ch, i) => <Row key={ch.key} first={i === 0} title={ch.title} subtitle={`${ch.requests} запр.`} right={<T style={{ fontWeight: '600' }}>{money(ch.costMicro)}</T>} onPress={() => router.push(`/chat/${ch.key}`)} />)
        ) : (
          <Row first title="Нет данных за период" />
        )}
      </Section>

      <View style={{ gap: 10 }}>
        <Button kind="secondary" icon="wallet-outline" title="Настроить бюджеты" onPress={() => router.push('/settings/budgets')} />
        <Button kind="ghost" icon="download-outline" title="Экспорт CSV" onPress={() => void exportCsv()} />
      </View>
      <T v="caption" style={{ marginTop: 12 }}>
        Стоимость считается по токенам из ответа провайдера и таблице цен (Настройки → Цены моделей). «≈» — оценка, если провайдер не сообщил токены.
      </T>
    </Screen>
  );
}

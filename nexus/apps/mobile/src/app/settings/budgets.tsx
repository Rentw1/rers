import { useFocusEffect } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useCallback, useState } from 'react';
import { Alert, View } from 'react-native';
import { Button, Chip, Field, Row, Screen, Section, Sheet, T, Toggle } from '@/components/ui';
import { budgetStates, type BudgetState } from '@/lib/budget';
import { money } from '@/lib/format';
import { uid } from '@/lib/ids';
import * as repo from '@/lib/repo';
import { useSettings } from '@/store/settings';

export default function Budgets() {
  const currency = useSettings((s) => s.currency);
  const fx = useSettings((s) => s.fx);
  const [list, setList] = useState<BudgetState[]>([]);
  const [providers, setProviders] = useState<repo.ProviderRow[]>([]);
  const [edit, setEdit] = useState<{ id: string; scope: string; period: 'day' | 'month'; amount: string; hard: boolean } | null>(null);

  const rate = currency === 'USD' ? 1 : (fx?.[currency] ?? 1);
  const unit = currency === 'USD' || !fx ? 'USD' : currency;

  const load = useCallback(() => {
    void budgetStates().then(setList);
    void repo.listProviders().then((p) => setProviders(p.filter((x) => x.enabled)));
  }, []);
  useFocusEffect(load);

  const save = async () => {
    if (!edit) return;
    const amount = Number(edit.amount.replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) return Alert.alert('Сумма', 'Введите положительную сумму');
    await repo.saveBudget({ id: edit.id, scope: edit.scope, period: edit.period, limitMicro: Math.round((amount / rate) * 1e6), hard: edit.hard, notifiedAt: null });
    await Notifications.requestPermissionsAsync().catch(() => undefined);
    setEdit(null);
    load();
  };

  return (
    <Screen keyboard>
      <T v="small" style={{ marginBottom: 14 }}>
        При 80% придёт уведомление. Жёсткий лимит при 100% требует подтверждения перед отправкой сообщения.
      </T>
      <Section title="Лимиты">
        {list.length ? (
          list.map((b, i) => (
            <Row
              key={b.budget.id}
              first={i === 0}
              icon="wallet-outline"
              title={`${b.budget.period === 'day' ? 'Дневной' : 'Месячный'} · ${b.budget.scope === 'all' ? 'все провайдеры' : b.budget.scope}`}
              subtitle={`${money(b.spent)} из ${money(b.budget.limitMicro)} (${Math.round(b.ratio * 100)}%)${b.budget.hard ? ' · жёсткий' : ''}`}
              chevron
              onPress={() => setEdit({ id: b.budget.id, scope: b.budget.scope, period: b.budget.period, amount: ((b.budget.limitMicro / 1e6) * rate).toFixed(2), hard: b.budget.hard })}
            />
          ))
        ) : (
          <Row first title="Лимитов нет" />
        )}
      </Section>
      <Button icon="add" title="Добавить лимит" onPress={() => setEdit({ id: uid(), scope: 'all', period: 'month', amount: '', hard: true })} />

      <Sheet visible={!!edit} onClose={() => setEdit(null)} title="Лимит расхода">
        {edit ? (
          <View style={{ paddingHorizontal: 16, gap: 10 }}>
            <T v="small">Период</T>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <Chip label="День" active={edit.period === 'day'} onPress={() => setEdit({ ...edit, period: 'day' })} />
              <Chip label="Месяц" active={edit.period === 'month'} onPress={() => setEdit({ ...edit, period: 'month' })} />
            </View>
            <T v="small">Провайдер</T>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
              <Chip label="Все" active={edit.scope === 'all'} onPress={() => setEdit({ ...edit, scope: 'all' })} />
              {providers.map((p) => (
                <Chip key={p.id} label={p.name} active={edit.scope === p.id} onPress={() => setEdit({ ...edit, scope: p.id })} />
              ))}
            </View>
            <Field label={`Сумма, ${unit}`} value={edit.amount} onChangeText={(v) => setEdit({ ...edit, amount: v })} keyboardType="decimal-pad" placeholder="10" />
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <T style={{ flex: 1 }}>Жёсткий лимит</T>
              <Toggle value={edit.hard} onChange={(v) => setEdit({ ...edit, hard: v })} />
            </View>
            <Button title="Сохранить" onPress={() => void save()} />
            {list.some((b) => b.budget.id === edit.id) ? (
              <Button
                kind="ghost"
                title="Удалить"
                onPress={async () => {
                  await repo.deleteBudget(edit.id);
                  setEdit(null);
                  load();
                }}
              />
            ) : null}
          </View>
        ) : null}
      </Sheet>
    </Screen>
  );
}

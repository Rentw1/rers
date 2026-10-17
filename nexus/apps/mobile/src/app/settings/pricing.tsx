import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, TextInput, View } from 'react-native';
import { Badge, Button, Field, Icon, Row, Screen, Section, Sheet, T } from '@/components/ui';
import { clearUserPrice, priceBook, setUserPrice, syncOpenRouterPrices } from '@/lib/pricing';
import * as repo from '@/lib/repo';
import { radius, useTheme } from '@/lib/theme';
import { useSettings } from '@/store/settings';

const SOURCE: Record<string, string> = { seed: 'встроенная', openrouter: 'OpenRouter', provider: 'провайдер', user: 'ваша' };

export default function Pricing() {
  const { c } = useTheme();
  const syncedAt = useSettings((s) => s.pricesSyncedAt);
  const [models, setModels] = useState<repo.ModelRow[]>([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<{ providerId: string; modelId: string; input: string; output: string; cacheRead: string } | null>(null);
  const [rev, setRev] = useState(0);

  const load = useCallback(() => {
    void (async () => {
      const enabled = new Set((await repo.listProviders()).filter((p) => p.enabled).map((p) => p.id));
      setModels((await repo.listModels()).filter((m) => enabled.has(m.providerId) && m.visible));
    })();
  }, []);
  useFocusEffect(load);

  const rows = useMemo(() => {
    void rev;
    const query = q.trim().toLowerCase();
    return models.filter((m) => !query || `${m.providerId}/${m.id}`.toLowerCase().includes(query)).map((m) => ({ m, p: priceBook().find(m.providerId, m.id) }));
  }, [models, q, rev]);

  return (
    <Screen keyboard>
      <T v="small" style={{ marginBottom: 12 }}>
        Цены в USD за 1 млн токенов. Источники по приоритету: ваши правки → данные провайдера → OpenRouter (обновляется раз в сутки) → встроенная таблица. Проверяйте актуальные цены на сайтах провайдеров.
      </T>
      <Button
        kind="secondary"
        icon="refresh"
        title={`Обновить с OpenRouter${syncedAt ? ` (${new Date(syncedAt).toLocaleDateString('ru-RU')})` : ''}`}
        loading={busy}
        onPress={async () => {
          setBusy(true);
          try {
            const n = await syncOpenRouterPrices(true);
            setRev((r) => r + 1);
            Alert.alert('Готово', `Обновлено цен: ${n}`);
          } catch (e) {
            Alert.alert('Ошибка', (e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, paddingHorizontal: 10, marginVertical: 14, backgroundColor: c.card }}>
        <Icon name="search" size={16} color={c.textFaint} />
        <TextInput value={q} onChangeText={setQ} placeholder="Поиск модели" placeholderTextColor={c.textFaint} style={{ flex: 1, color: c.text, paddingVertical: 9 }} />
      </View>
      <Section title="Модели">
        {rows.map(({ m, p }, i) => (
          <Row
            key={`${m.providerId}/${m.id}`}
            first={i === 0}
            title={m.name}
            subtitle={p ? `вход $${p.input} · выход $${p.output}${p.cacheRead != null ? ` · кэш $${p.cacheRead}` : ''} · ${p.updatedAt.slice(0, 10)}` : 'нет цены — расход не считается'}
            right={p ? <Badge label={SOURCE[p.source] ?? p.source} tone={p.source === 'user' ? 'accent' : 'neutral'} /> : <Badge label="?" tone="warning" />}
            onPress={() => setEdit({ providerId: m.providerId, modelId: m.id, input: String(p?.input ?? ''), output: String(p?.output ?? ''), cacheRead: p?.cacheRead != null ? String(p.cacheRead) : '' })}
          />
        ))}
      </Section>

      <Sheet visible={!!edit} onClose={() => setEdit(null)} title={edit ? `${edit.providerId}/${edit.modelId}` : ''}>
        {edit ? (
          <View style={{ paddingHorizontal: 16 }}>
            <Field label="Вход, $ за 1M" value={edit.input} onChangeText={(v) => setEdit({ ...edit, input: v })} keyboardType="decimal-pad" />
            <Field label="Выход, $ за 1M" value={edit.output} onChangeText={(v) => setEdit({ ...edit, output: v })} keyboardType="decimal-pad" />
            <Field label="Чтение из кэша, $ за 1M (необязательно)" value={edit.cacheRead} onChangeText={(v) => setEdit({ ...edit, cacheRead: v })} keyboardType="decimal-pad" />
            <Button
              title="Сохранить свою цену"
              onPress={async () => {
                const n = (s: string) => Number(s.replace(',', '.'));
                if (!Number.isFinite(n(edit.input)) || !Number.isFinite(n(edit.output)) || n(edit.input) < 0 || n(edit.output) < 0) return Alert.alert('Цена', 'Введите неотрицательные числа');
                await setUserPrice(edit.providerId, edit.modelId, { input: n(edit.input), output: n(edit.output), cacheRead: edit.cacheRead ? n(edit.cacheRead) : undefined });
                setEdit(null);
                setRev((r) => r + 1);
              }}
            />
            <Button
              kind="ghost"
              style={{ marginTop: 8 }}
              title="Сбросить на автоматическую"
              onPress={async () => {
                await clearUserPrice(edit.providerId, edit.modelId);
                setEdit(null);
                setRev((r) => r + 1);
              }}
            />
          </View>
        ) : null}
      </Sheet>
    </Screen>
  );
}

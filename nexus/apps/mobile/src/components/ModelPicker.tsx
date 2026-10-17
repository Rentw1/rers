import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, TextInput, View } from 'react-native';
import { priceFor } from '@/lib/pricing';
import { pickerGroups, type PickerGroup } from '@/lib/providers';
import * as repo from '@/lib/repo';
import { radius, useTheme } from '@/lib/theme';
import { tokens } from '@/lib/format';
import { Badge, Button, Empty, Icon, IconButton, Sheet, T, tap } from './ui';

function priceLabel(providerId: string, modelId: string): string {
  const p = priceFor(providerId, modelId);
  if (!p) return 'цена неизвестна';
  if (p.input === 0 && p.output === 0) return 'бесплатно';
  const f = (n: number) => (n < 1 ? n.toFixed(n < 0.1 ? 3 : 2) : n.toFixed(2));
  return `$${f(p.input)} / $${f(p.output)} за 1M`;
}

type Item = { kind: 'header'; provider: repo.ProviderRow } | { kind: 'model'; model: repo.ModelRow };

export function ModelPicker({ visible, onClose, current, onSelect }: { visible: boolean; onClose: () => void; current: { providerId: string; modelId: string }; onSelect: (providerId: string, modelId: string) => void }) {
  const { c } = useTheme();
  const [groups, setGroups] = useState<PickerGroup[]>([]);
  const [q, setQ] = useState('');
  const [rev, setRev] = useState(0);

  useEffect(() => {
    if (visible) void pickerGroups().then(setGroups);
  }, [visible, rev]);

  const items = useMemo(() => {
    const query = q.trim().toLowerCase();
    const out: Item[] = [];
    for (const g of groups) {
      const models = g.models.filter((m) => !query || m.id.toLowerCase().includes(query) || m.name.toLowerCase().includes(query) || g.provider.name.toLowerCase().includes(query));
      if (!models.length) continue;
      out.push({ kind: 'header', provider: g.provider });
      for (const m of models) out.push({ kind: 'model', model: m });
    }
    return out;
  }, [groups, q]);

  const toggleFav = useCallback(async (m: repo.ModelRow) => {
    await repo.setModelFlags(m.providerId, m.id, { favorite: !m.favorite });
    setRev((r) => r + 1);
  }, []);

  return (
    <Sheet visible={visible} onClose={onClose} title="Выбор модели" full>
      <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.card, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, paddingHorizontal: 12 }}>
          <Icon name="search" size={18} color={c.textFaint} />
          <TextInput value={q} onChangeText={setQ} placeholder="Поиск моделей" placeholderTextColor={c.textFaint} style={{ flex: 1, color: c.text, paddingVertical: 10, fontSize: 16 }} />
        </View>
      </View>
      {items.length === 0 ? (
        <Empty icon="key-outline" title="Нет доступных моделей" text="Добавьте API-ключ хотя бы одного провайдера.">
          <Button
            title="Провайдеры"
            onPress={() => {
              onClose();
              router.push('/settings/providers');
            }}
          />
        </Empty>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => (it.kind === 'header' ? `h:${it.provider.id}` : `m:${it.model.providerId}/${it.model.id}`)}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            if (item.kind === 'header') {
              return (
                <T v="label" style={{ marginTop: 14, marginBottom: 6 }}>
                  {item.provider.name}
                </T>
              );
            }
            const m = item.model;
            const selected = m.providerId === current.providerId && m.id === current.modelId;
            return (
              <Pressable
                onPress={() => {
                  tap();
                  onSelect(m.providerId, m.id);
                  onClose();
                }}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.md, marginBottom: 4, backgroundColor: selected ? c.accentSoft : pressed ? c.surfaceAlt : c.card, borderWidth: 1, borderColor: selected ? c.accent : c.border })}
              >
                <View style={{ flex: 1, gap: 3 }}>
                  <T style={{ fontWeight: '600' }} numberOfLines={1}>
                    {m.name}
                  </T>
                  <T v="caption" numberOfLines={1}>
                    {m.id !== m.name ? `${m.id} · ` : ''}
                    {m.contextWindow ? `${tokens(m.contextWindow)} контекст · ` : ''}
                    {priceLabel(m.providerId, m.id)}
                  </T>
                  <View style={{ flexDirection: 'row', gap: 4 }}>
                    {m.reasoning ? <Badge label="рассуждения" tone="accent" /> : null}
                    {m.vision ? <Badge label="фото" /> : null}
                    {m.tools ? <Badge label="инструменты" /> : <Badge label="без инструментов" tone="warning" />}
                  </View>
                </View>
                <IconButton name={m.favorite ? 'star' : 'star-outline'} color={m.favorite ? c.warning : c.textFaint} label="Избранное" size={18} onPress={() => void toggleFav(m)} />
                {selected ? <Icon name="checkmark-circle" color={c.accent} /> : null}
              </Pressable>
            );
          }}
          ListFooterComponent={
            <Button
              kind="ghost"
              title="Провайдеры и модели"
              icon="settings-outline"
              style={{ marginTop: 12 }}
              onPress={() => {
                onClose();
                router.push('/settings/providers');
              }}
            />
          }
        />
      )}
    </Sheet>
  );
}

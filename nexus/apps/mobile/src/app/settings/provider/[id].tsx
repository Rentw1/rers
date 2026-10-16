import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useMemo, useState } from 'react';
import { Alert, TextInput, View } from 'react-native';
import { catalogEntry } from '@nexus/core';
import { Badge, Button, Field, Icon, Row, Screen, Section, T, Toggle } from '@/components/ui';
import { tokens } from '@/lib/format';
import { priceFor } from '@/lib/pricing';
import { saveProviderSettings, syncModels, testProvider } from '@/lib/providers';
import * as repo from '@/lib/repo';
import { apiKeyName, getSecret, maskKey } from '@/lib/secure';
import { radius, useTheme } from '@/lib/theme';
import { settings } from '@/store/settings';

export default function ProviderScreen() {
  const { c } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const entry = catalogEntry(id);
  const [p, setP] = useState<repo.ProviderRow | null>(null);
  const [models, setModels] = useState<repo.ModelRow[]>([]);
  const [key, setKey] = useState('');
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [baseUrl, setBaseUrl] = useState('');
  const [busy, setBusy] = useState<'test' | 'sync' | 'save' | null>(null);
  const [filter, setFilter] = useState('');
  const [newModel, setNewModel] = useState('');

  const load = useCallback(async () => {
    const row = await repo.getProvider(id);
    setP(row);
    setBaseUrl(row?.baseUrl ?? '');
    setModels(await repo.listModels(id));
    setSavedKey(await getSecret(apiKeyName(id)));
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const visibleModels = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return models.filter((m) => !q || m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q)).slice(0, 300);
  }, [models, filter]);

  if (!p) return <Screen>{null}</Screen>;
  const editableUrl = !entry || entry.editableBaseUrl || p.isCustom;
  const needsKey = entry ? entry.requiresKey : false;

  const save = async () => {
    setBusy('save');
    try {
      await saveProviderSettings(id, { apiKey: key.trim() ? key.trim() : undefined, baseUrl: editableUrl ? baseUrl : undefined, enabled: needsKey ? undefined : true });
      setKey('');
      await load();
      if (key.trim() || !needsKey) {
        setBusy('test');
        const n = await testProvider(id);
        await syncModels(id).catch(() => undefined);
        await load();
        Alert.alert('Готово', `Подключено. Доступно моделей: ${n}.`);
      }
    } catch (e) {
      Alert.alert('Ошибка', (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen keyboard>
      <Stack.Screen options={{ title: p.name }} />
      {entry?.description ? (
        <T v="small" style={{ marginBottom: 14 }}>
          {entry.description}
        </T>
      ) : null}
      {entry ? (
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
          {entry.keyUrl ? <Button small kind="primary" icon="key-outline" title={needsKey ? 'Получить ключ' : 'Скачать'} onPress={() => void WebBrowser.openBrowserAsync(entry.keyUrl!)} /> : null}
          {entry.pricingUrl ? <Button small kind="ghost" icon="pricetags-outline" title="Цены" onPress={() => void WebBrowser.openBrowserAsync(entry.pricingUrl!)} /> : null}
          {entry.docsUrl ? <Button small kind="ghost" icon="book-outline" title="Документация" onPress={() => void WebBrowser.openBrowserAsync(entry.docsUrl!)} /> : null}
        </View>
      ) : null}

      <Section title="Подключение">
        <View style={{ padding: 16 }}>
          {needsKey || p.isCustom ? (
            <>
              <Field
                label={savedKey ? `API-ключ (сохранён: ${showKey ? savedKey : maskKey(savedKey)})` : 'API-ключ'}
                value={key}
                onChangeText={setKey}
                placeholder={savedKey ? 'Новый ключ (оставьте пустым, чтобы не менять)' : 'Вставьте ключ'}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry={!showKey}
              />
              {savedKey ? (
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                  <Button small kind="ghost" icon={showKey ? 'eye-off-outline' : 'eye-outline'} title={showKey ? 'Скрыть' : 'Показать'} onPress={() => setShowKey(!showKey)} />
                  <Button
                    small
                    kind="ghost"
                    icon="trash-outline"
                    title="Удалить ключ"
                    onPress={() =>
                      Alert.alert('Удалить ключ?', p.name, [
                        { text: 'Отмена', style: 'cancel' },
                        {
                          text: 'Удалить',
                          style: 'destructive',
                          onPress: async () => {
                            await saveProviderSettings(id, { apiKey: null });
                            await load();
                          },
                        },
                      ])
                    }
                  />
                </View>
              ) : null}
            </>
          ) : null}
          {editableUrl ? <Field label="Base URL" value={baseUrl} onChangeText={setBaseUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" hint={entry?.id === 'ollama' ? 'На ПК: OLLAMA_HOST=0.0.0.0 ollama serve. Укажите IP компьютера в локальной сети или Tailscale.' : undefined} /> : <T v="caption" style={{ marginBottom: 12 }}>{p.baseUrl}</T>}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button style={{ flex: 1 }} title="Сохранить и проверить" loading={busy === 'save' || busy === 'test'} onPress={() => void save()} />
          </View>
          {!needsKey ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}>
              <T style={{ flex: 1 }}>Включён</T>
              <Toggle
                value={p.enabled}
                onChange={async (v) => {
                  await saveProviderSettings(id, { enabled: v });
                  await load();
                }}
              />
            </View>
          ) : null}
          {p.kind === 'openai' ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}>
              <View style={{ flex: 1 }}>
                <T>Точный учёт токенов в потоке</T>
                <T v="caption">stream_options.include_usage — выключите, если провайдер выдаёт ошибку</T>
              </View>
              <Toggle
                value={p.streamUsage}
                onChange={async (v) => {
                  await saveProviderSettings(id, { streamUsage: v });
                  await load();
                }}
              />
            </View>
          ) : null}
        </View>
      </Section>

      <Section title={`Модели (${models.length})`} footer="Видимые модели появляются в выборе модели. Звёздочка — избранное.">
        <View style={{ padding: 12, gap: 8 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button
              small
              style={{ flex: 1 }}
              kind="secondary"
              icon="refresh"
              title="Обновить список"
              loading={busy === 'sync'}
              disabled={!p.enabled}
              onPress={async () => {
                setBusy('sync');
                try {
                  const list = await syncModels(id);
                  await load();
                  Alert.alert('Готово', `Найдено моделей: ${list.length}`);
                } catch (e) {
                  Alert.alert('Ошибка', (e as Error).message);
                } finally {
                  setBusy(null);
                }
              }}
            />
          </View>
          {models.length > 8 ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, paddingHorizontal: 10 }}>
              <Icon name="search" size={16} color={c.textFaint} />
              <TextInput value={filter} onChangeText={setFilter} placeholder="Фильтр" placeholderTextColor={c.textFaint} style={{ flex: 1, color: c.text, paddingVertical: 8 }} />
            </View>
          ) : null}
        </View>
        {visibleModels.map((m) => {
          const price = priceFor(id, m.id);
          return (
            <Row
              key={m.id}
              title={m.name}
              subtitle={[m.id !== m.name ? m.id : null, m.contextWindow ? `${tokens(m.contextWindow)} контекст` : null, price ? `$${price.input}/$${price.output} за 1M` : 'цена неизвестна'].filter(Boolean).join(' · ')}
              onPress={async () => {
                await settings().set('defaultProviderId', id);
                await settings().set('defaultModelId', m.id);
                Alert.alert('Модель по умолчанию', m.name);
              }}
              onLongPress={async () => {
                await repo.setModelFlags(id, m.id, { favorite: !m.favorite });
                await load();
              }}
              right={
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  {m.favorite ? <Icon name="star" size={16} color={c.warning} /> : null}
                  {m.reasoning ? <Badge label="R" tone="accent" /> : null}
                  <Toggle
                    value={m.visible}
                    onChange={async (v) => {
                      await repo.setModelFlags(id, m.id, { visible: v });
                      await load();
                    }}
                  />
                </View>
              }
            />
          );
        })}
        <View style={{ padding: 12, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <TextInput value={newModel} onChangeText={setNewModel} placeholder="ID модели вручную" placeholderTextColor={c.textFaint} autoCapitalize="none" style={{ flex: 1, color: c.text, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 8 }} />
          <Button
            small
            title="Добавить"
            disabled={!newModel.trim()}
            onPress={async () => {
              await repo.addCustomModel(id, newModel.trim());
              setNewModel('');
              await load();
            }}
          />
        </View>
      </Section>

      {p.isCustom ? (
        <Row
          first
          danger
          icon="trash-outline"
          title="Удалить провайдера"
          onPress={() =>
            Alert.alert('Удалить провайдера?', p.name, [
              { text: 'Отмена', style: 'cancel' },
              {
                text: 'Удалить',
                style: 'destructive',
                onPress: async () => {
                  await saveProviderSettings(id, { apiKey: null });
                  await repo.deleteProvider(id);
                  router.back();
                },
              },
            ])
          }
        />
      ) : null}
    </Screen>
  );
}

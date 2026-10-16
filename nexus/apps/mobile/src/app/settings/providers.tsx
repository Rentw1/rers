import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, View } from 'react-native';
import { catalogEntry } from '@nexus/core';
import { Badge, Button, Field, Row, Screen, Section, Sheet } from '@/components/ui';
import { addCustomProvider } from '@/lib/providers';
import * as repo from '@/lib/repo';

export default function Providers() {
  const [list, setList] = useState<repo.ProviderRow[]>([]);
  const [add, setAdd] = useState<{ name: string; url: string } | null>(null);
  const load = useCallback(() => void repo.listProviders().then(setList), []);
  useFocusEffect(load);

  const connected = list.filter((p) => p.enabled);
  const rest = list.filter((p) => !p.enabled);

  const row = (p: repo.ProviderRow, i: number) => {
    const e = catalogEntry(p.id);
    return (
      <Row
        key={p.id}
        first={i === 0}
        title={p.name}
        subtitle={e?.description ?? p.baseUrl}
        right={p.enabled ? <Badge label="подключён" tone="success" /> : undefined}
        chevron
        onPress={() => router.push(`/settings/provider/${p.id}`)}
      />
    );
  };

  return (
    <Screen>
      {connected.length ? <Section title="Подключённые">{connected.map(row)}</Section> : null}
      <Section title="Доступные" footer="Нажмите на провайдера, чтобы добавить API-ключ. Ссылки на получение ключа и цены — внутри.">
        {rest.map(row)}
      </Section>
      <Button kind="ghost" icon="add" title="Свой OpenAI-совместимый провайдер" onPress={() => setAdd({ name: '', url: 'https://' })} />
      <Sheet visible={!!add} onClose={() => setAdd(null)} title="Свой провайдер">
        <View style={{ paddingHorizontal: 16 }}>
          <Field label="Название" value={add?.name ?? ''} onChangeText={(t) => add && setAdd({ ...add, name: t })} placeholder="Например, vLLM на сервере" />
          <Field
            label="Base URL"
            value={add?.url ?? ''}
            onChangeText={(t) => add && setAdd({ ...add, url: t })}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            hint="Адрес, к которому добавляется /chat/completions и /models. Например https://api.example.com/v1"
          />
          <Button
            title="Добавить"
            onPress={async () => {
              try {
                const id = await addCustomProvider(add!.name, add!.url);
                setAdd(null);
                router.push(`/settings/provider/${id}`);
              } catch (e) {
                Alert.alert('Ошибка', (e as Error).message);
              }
            }}
          />
        </View>
      </Sheet>
    </Screen>
  );
}

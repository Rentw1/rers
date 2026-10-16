import * as DocumentPicker from 'expo-document-picker';
import { router, useFocusEffect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useState } from 'react';
import { Alert, View } from 'react-native';
import type { RelayInfo } from '@nexus/core';
import { Badge, Banner, Button, Row, Screen, Section, T } from '@/components/ui';
import { relativeTime } from '@/lib/format';
import { ensureRelayConnected, getRelay, reachableRelay, sendFileToPc, syncChats, unpair, type RelayState } from '@/lib/relay';
import { runtime } from '@/store/chat';

const RELEASES = 'https://github.com/Rentw1/rers/releases';

export default function RelayScreen() {
  const [state, setState] = useState<RelayState | null>(null);
  const [info, setInfo] = useState<RelayInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    void (async () => {
      const s = await getRelay();
      setState(s);
      if (!s) return;
      try {
        const r = await reachableRelay();
        setInfo(r.info);
        setState(r.state);
        setError(null);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, []);
  useFocusEffect(load);

  const run = async (key: string, fn: () => Promise<string>) => {
    setBusy(key);
    try {
      Alert.alert('Готово', await fn());
    } catch (e) {
      Alert.alert('Ошибка', (e as Error).message);
    } finally {
      setBusy(null);
      load();
    }
  };

  if (!state) {
    return (
      <Screen>
        <T v="title" style={{ marginBottom: 8 }}>
          Подключите компьютер
        </T>
        <T v="small" style={{ marginBottom: 18 }}>
          Nexus Relay — небольшая программа для Windows, macOS и Linux. Она даёт ИИ доступ к файлам в выбранных папках, буферу обмена ПК и запускает локальные MCP-серверы (как в Claude Desktop), а также синхронизирует чаты.
        </T>
        <Section title="Как подключить">
          <Row first icon="download-outline" title="1. Установите Node.js 20+ на ПК" subtitle="nodejs.org" onPress={() => void WebBrowser.openBrowserAsync('https://nodejs.org/en/download')} chevron />
          <Row icon="terminal-outline" title="2. Скачайте и запустите Relay" subtitle="Файл nexus-relay.mjs из релизов → node nexus-relay.mjs" onPress={() => void WebBrowser.openBrowserAsync(RELEASES)} chevron />
          <Row icon="qr-code-outline" title="3. Отсканируйте QR-код" subtitle="QR показывается в терминале и на странице http://localhost:4545" />
        </Section>
        <Button icon="qr-code-outline" title="Сканировать QR" onPress={() => router.push('/scan?mode=relay')} />
        <T v="caption" style={{ marginTop: 14 }}>
          Телефон и ПК должны быть в одной Wi-Fi сети. Для доступа из любой точки и шифрования установите Tailscale на оба устройства (tailscale.com).
        </T>
        <Button kind="ghost" title="Tailscale" icon="open-outline" style={{ marginTop: 10 }} onPress={() => void WebBrowser.openBrowserAsync('https://tailscale.com/download')} />
      </Screen>
    );
  }

  return (
    <Screen>
      {error ? <Banner text={error} action="Повторить" onAction={load} /> : null}
      <Section title="Компьютер">
        <Row first icon="desktop-outline" title={state.name} subtitle={`${state.activeUrl}${info ? ` · ${info.platform} · v${info.version}` : ''}`} right={<Badge label={info ? 'онлайн' : 'офлайн'} tone={info ? 'success' : 'danger'} />} />
        <Row icon="time-outline" title="Синхронизация чатов" subtitle={state.lastSyncAt ? `Последняя: ${relativeTime(state.lastSyncAt)}` : 'Ещё не выполнялась'} />
      </Section>
      {info ? (
        <Section title="Доступно на ПК">
          <Row first icon="construct-outline" title="Встроенные инструменты" subtitle={info.builtinTools.join(', ')} />
          {info.servers.map((s) => (
            <Row key={s.id} icon="server-outline" title={s.id} subtitle={s.error ?? `${s.tools} инструментов`} right={<Badge label={s.status} tone={s.status === 'ready' ? 'success' : s.status === 'error' ? 'danger' : 'neutral'} />} />
          ))}
        </Section>
      ) : null}
      <View style={{ gap: 10 }}>
        <Button
          icon="sync-outline"
          title="Синхронизировать чаты"
          loading={busy === 'sync'}
          onPress={() =>
            void run('sync', async () => {
              const r = await syncChats();
              runtime.bumpList();
              return `Отправлено: ${r.pushed}, получено: ${r.pulled}`;
            })
          }
        />
        <Button
          kind="secondary"
          icon="document-outline"
          title="Отправить файл на ПК"
          loading={busy === 'file'}
          onPress={async () => {
            const r = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
            if (r.canceled || !r.assets[0]) return;
            const a = r.assets[0];
            await run('file', async () => `Сохранено: ${await sendFileToPc(a.uri, a.name)}`);
          }}
        />
        <Button kind="secondary" icon="refresh" title="Переподключить инструменты" loading={busy === 'reconnect'} onPress={() => void run('reconnect', async () => (await ensureRelayConnected(), 'Инструменты ПК подключены'))} />
        <Button kind="ghost" icon="qr-code-outline" title="Сопрячь заново" onPress={() => router.push('/scan?mode=relay')} />
        <Button
          kind="danger"
          icon="unlink-outline"
          title="Отключить компьютер"
          onPress={() =>
            Alert.alert('Отключить компьютер?', 'Токен будет удалён с телефона. На ПК устройство можно отозвать в панели Relay.', [
              { text: 'Отмена', style: 'cancel' },
              {
                text: 'Отключить',
                style: 'destructive',
                onPress: async () => {
                  await unpair();
                  setInfo(null);
                  load();
                },
              },
            ])
          }
        />
      </View>
    </Screen>
  );
}

import * as Clipboard from 'expo-clipboard';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, View } from 'react-native';
import { Badge, Button, Field, Row, Screen, Section, Sheet, T, Toggle } from '@/components/ui';
import { addMcpServers, parseMcpConfig } from '@/lib/links';
import { connect, useMcpStatus, PHONE_SERVER_ID } from '@/lib/mcp';
import { PHONE_TOOLS } from '@/lib/phoneTools';
import * as repo from '@/lib/repo';
import { useSettings } from '@/store/settings';

export default function McpSettings() {
  const [servers, setServers] = useState<repo.McpServerRow[]>([]);
  const [importText, setImportText] = useState<string | null>(null);
  const status = useMcpStatus((s) => s.status);
  const phoneEnabled = useSettings((s) => s.phoneToolsEnabled);
  const setSetting = useSettings((s) => s.set);

  const load = useCallback(() => {
    void repo.listMcpServers().then((list) => {
      setServers(list);
      for (const s of list) if (s.enabled && !status[s.id]) void connect(s).catch(() => undefined);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useFocusEffect(load);

  const badge = (id: string) => {
    const st = status[id];
    if (!st) return <Badge label="—" />;
    if (st.status === 'ready') return <Badge label={`${st.tools} инстр.`} tone="success" />;
    if (st.status === 'connecting') return <Badge label="подключение" />;
    if (st.status === 'auth_required') return <Badge label="нужен вход" tone="warning" />;
    return <Badge label="ошибка" tone="danger" />;
  };

  const doImport = async () => {
    try {
      const { remote, stdio } = parseMcpConfig(importText ?? '');
      if (remote.length) await addMcpServers(remote);
      setImportText(null);
      load();
      Alert.alert(
        'Импорт',
        [remote.length ? `Добавлено: ${remote.map((r) => r.name).join(', ')}` : 'Удалённых серверов не найдено', stdio.length ? `\nЛокальные (stdio) серверы ${stdio.join(', ')} запускаются на компьютере: добавьте их в config.json Nexus Relay или выполните nexus-relay --import-claude.` : ''].join(''),
      );
    } catch (e) {
      Alert.alert('Не удалось разобрать JSON', (e as Error).message);
    }
  };

  return (
    <Screen keyboard>
      <Section title="Встроенные" footer="Инструменты телефона работают без интернета. Каждое действие подтверждается, пока вы не выберете «Всегда».">
        <Row first icon="phone-portrait-outline" title="Телефон" subtitle={`${PHONE_TOOLS.length} инструментов: контакты, календарь, геолокация, файлы…`} right={<Toggle value={phoneEnabled} onChange={(v) => void setSetting('phoneToolsEnabled', v)} />} />
        <Row icon="options-outline" title="Настроить инструменты телефона" chevron onPress={() => router.push(`/settings/mcp-server/${PHONE_SERVER_ID}`)} />
      </Section>

      <Section title="MCP-серверы" footer="Поддерживаются удалённые серверы (Streamable HTTP и SSE) с авторизацией по токену или OAuth. Локальные stdio-серверы запускайте на ПК через Nexus Relay.">
        {servers.length === 0 ? (
          <View style={{ padding: 16 }}>
            <T v="small">Серверов пока нет.</T>
          </View>
        ) : (
          servers.map((s, i) => (
            <Row key={s.id} first={i === 0} icon={s.authType === 'relay' ? 'desktop-outline' : 'server-outline'} title={s.name} subtitle={s.enabled ? (status[s.id]?.error ?? s.url) : 'Выключен'} right={badge(s.id)} chevron onPress={() => router.push(s.authType === 'relay' ? '/settings/relay' : `/settings/mcp-server/${s.id}`)} />
          ))
        )}
      </Section>

      <View style={{ gap: 10 }}>
        <Button icon="add" title="Добавить сервер" onPress={() => router.push('/settings/mcp-server/new')} />
        <Button kind="secondary" icon="qr-code-outline" title="Сканировать QR" onPress={() => router.push('/scan?mode=mcp')} />
        <Button
          kind="ghost"
          icon="code-slash-outline"
          title="Импорт JSON (mcpServers)"
          onPress={async () => {
            const clip = await Clipboard.getStringAsync().catch(() => '');
            setImportText(clip.trim().startsWith('{') || clip.trim().startsWith('[') ? clip : '');
          }}
        />
      </View>

      <Sheet visible={importText !== null} onClose={() => setImportText(null)} title="Импорт конфигурации" full>
        <View style={{ paddingHorizontal: 16, flex: 1 }}>
          <T v="small" style={{ marginBottom: 8 }}>
            Вставьте JSON в формате Claude Desktop / Cursor: {'{"mcpServers": {"имя": {"url": "https://…", "headers": {…}}}}'}
          </T>
          <Field value={importText ?? ''} onChangeText={setImportText} multiline autoCapitalize="none" autoCorrect={false} style={{ minHeight: 220, fontFamily: 'monospace', fontSize: 13 }} />
          <Button title="Импортировать" onPress={() => void doImport()} disabled={!importText?.trim()} />
        </View>
      </Sheet>
    </Screen>
  );
}

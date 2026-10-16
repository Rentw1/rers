import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { checkUrlSecurity } from '@nexus/core';
import { Badge, Banner, Button, Chip, Field, Row, Screen, Section, T, Toggle } from '@/components/ui';
import { relativeTime } from '@/lib/format';
import { uid } from '@/lib/ids';
import { connect, serverTools, useMcpStatus, PHONE_SERVER_ID, type McpSecret } from '@/lib/mcp';
import { authorizeServer } from '@/lib/oauth';
import * as repo from '@/lib/repo';
import { getSecretJson, mcpSecretName, setSecretJson } from '@/lib/secure';
import { useTheme } from '@/lib/theme';

type Tool = { name: string; title: string; description?: string; readOnly: boolean };

export default function McpServerScreen() {
  const { c } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const isPhone = id === PHONE_SERVER_ID;
  const [row, setRow] = useState<repo.McpServerRow | null>(null);
  const [form, setForm] = useState({ name: '', url: 'https://', transport: 'http' as 'http' | 'sse', authType: 'none' as repo.McpAuthType, bearer: '', headers: '' });
  const [tools, setTools] = useState<Tool[]>([]);
  const [prefs, setPrefs] = useState<Map<string, repo.ToolPref>>(new Map());
  const [log, setLog] = useState<Awaited<ReturnType<typeof repo.listToolLog>>>([]);
  const [busy, setBusy] = useState(false);
  const [toolsError, setToolsError] = useState<string | null>(null);
  const status = useMcpStatus((s) => (id ? s.status[id] : undefined));

  const loadTools = useCallback(async () => {
    setToolsError(null);
    try {
      setTools(await serverTools(id));
    } catch (e) {
      setToolsError((e as Error).message);
    }
    setPrefs(new Map((await repo.listToolPrefs()).filter((p) => p.serverId === id).map((p) => [p.toolName, p])));
    setLog(await repo.listToolLog(id, 30));
  }, [id]);

  useEffect(() => {
    void (async () => {
      if (isNew) return;
      if (!isPhone) {
        const r = (await repo.listMcpServers()).find((s) => s.id === id) ?? null;
        setRow(r);
        if (r) {
          const sec = await getSecretJson<McpSecret>(mcpSecretName(r.id));
          setForm({ name: r.name, url: r.url, transport: r.transport, authType: r.authType, bearer: sec?.bearer ?? '', headers: sec?.headers ? Object.entries(sec.headers).map(([k, v]) => `${k}: ${v}`).join('\n') : '' });
        }
      }
      await loadTools();
    })();
  }, [id, isNew, isPhone, loadTools]);

  const parseHeaders = (s: string): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const line of s.split('\n')) {
      const i = line.indexOf(':');
      if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
    return out;
  };

  const save = async () => {
    const sec = checkUrlSecurity(form.url);
    if (sec) return Alert.alert('Адрес', sec);
    if (!form.name.trim()) return Alert.alert('Название', 'Укажите название');
    setBusy(true);
    try {
      const sid = row?.id ?? uid();
      const prev = (await getSecretJson<McpSecret>(mcpSecretName(sid))) ?? {};
      await setSecretJson(mcpSecretName(sid), { ...prev, bearer: form.authType === 'bearer' ? form.bearer.trim() : undefined, headers: form.authType === 'headers' ? parseHeaders(form.headers) : undefined });
      await repo.saveMcpServer({ id: sid, name: form.name.trim(), url: form.url.trim(), transport: form.transport, authType: form.authType, enabled: row?.enabled ?? true });
      const saved = (await repo.listMcpServers()).find((s) => s.id === sid)!;
      setRow(saved);
      try {
        if (form.authType === 'oauth' && !prev.oauth?.tokens) await authorizeServer(saved);
        else await connect(saved, true);
      } catch (e) {
        Alert.alert('Сохранено, но подключиться не удалось', (e as Error).message);
      }
      if (isNew) router.replace(`/settings/mcp-server/${sid}`);
      else await loadTools();
    } finally {
      setBusy(false);
    }
  };

  const toolRows = tools.map((t, i) => {
    const p = prefs.get(t.name);
    const enabled = p?.enabled !== false;
    const always = p?.approval === 'always';
    return (
      <View key={t.name} style={{ paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: c.border, gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <T style={{ fontWeight: '600' }}>{t.title}</T>
            <T v="caption">{t.name}</T>
          </View>
          {t.readOnly ? <Badge label="чтение" /> : null}
          <Toggle
            value={enabled}
            onChange={async (v) => {
              await repo.setToolPref(id, t.name, { enabled: v });
              await loadTools();
            }}
          />
        </View>
        {t.description ? (
          <T v="small" numberOfLines={3}>
            {t.description}
          </T>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <Chip
            label="Спрашивать"
            active={!always}
            onPress={async () => {
              await repo.setToolPref(id, t.name, { approval: 'ask' });
              await loadTools();
            }}
          />
          <Chip
            label="Всегда разрешать"
            active={always}
            onPress={async () => {
              await repo.setToolPref(id, t.name, { approval: 'always' });
              await loadTools();
            }}
          />
        </View>
      </View>
    );
  });

  return (
    <Screen keyboard>
      <Stack.Screen options={{ title: isNew ? 'Новый MCP-сервер' : isPhone ? 'Инструменты телефона' : (row?.name ?? 'MCP-сервер') }} />
      {!isPhone ? (
        <Section title="Сервер">
          <View style={{ padding: 16 }}>
            <Field label="Название" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} placeholder="Например, GitHub" />
            <Field label="URL" value={form.url} onChangeText={(v) => setForm({ ...form, url: v })} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://example.com/mcp" />
            <T v="small" style={{ marginBottom: 6 }}>
              Транспорт
            </T>
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 14 }}>
              <Chip label="Streamable HTTP" active={form.transport === 'http'} onPress={() => setForm({ ...form, transport: 'http' })} />
              <Chip label="SSE (старый)" active={form.transport === 'sse'} onPress={() => setForm({ ...form, transport: 'sse' })} />
            </View>
            <T v="small" style={{ marginBottom: 6 }}>
              Авторизация
            </T>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
              {(
                [
                  ['none', 'Нет'],
                  ['bearer', 'Токен'],
                  ['headers', 'Заголовки'],
                  ['oauth', 'OAuth'],
                ] as const
              ).map(([k, l]) => (
                <Chip key={k} label={l} active={form.authType === k} onPress={() => setForm({ ...form, authType: k })} />
              ))}
            </View>
            {form.authType === 'bearer' ? <Field label="Bearer-токен" value={form.bearer} onChangeText={(v) => setForm({ ...form, bearer: v })} secureTextEntry autoCapitalize="none" autoCorrect={false} /> : null}
            {form.authType === 'headers' ? <Field label="Заголовки (по одному в строке, Имя: значение)" value={form.headers} onChangeText={(v) => setForm({ ...form, headers: v })} multiline autoCapitalize="none" autoCorrect={false} style={{ minHeight: 90, fontFamily: 'monospace' }} /> : null}
            {form.authType === 'oauth' ? <T v="caption" style={{ marginBottom: 12 }}>Откроется страница входа сервиса. Токены хранятся в защищённом хранилище и обновляются автоматически.</T> : null}
            <Button title={isNew ? 'Добавить и подключить' : 'Сохранить и переподключить'} loading={busy} onPress={() => void save()} />
          </View>
        </Section>
      ) : null}

      {status?.status === 'auth_required' && row ? (
        <Banner
          tone="warning"
          text="Сервер требует входа."
          action="Войти"
          onAction={async () => {
            try {
              await repo.saveMcpServer({ ...row, authType: 'oauth' });
              await authorizeServer({ ...row, authType: 'oauth' }, status.resourceMetadataUrl);
              await loadTools();
            } catch (e) {
              Alert.alert('Вход не выполнен', (e as Error).message);
            }
          }}
        />
      ) : null}
      {toolsError && !isNew ? <Banner text={toolsError} action="Повторить" onAction={() => row && void connect(row, true).then(loadTools, (e: Error) => setToolsError(e.message))} /> : null}

      {!isNew && tools.length ? <Section title={`Инструменты (${tools.length})`}>{toolRows}</Section> : null}

      {!isNew && log.length ? (
        <Section title="Последние вызовы">
          {log.map((l, i) => (
            <Row key={i} first={i === 0} icon={l.isError ? 'alert-circle-outline' : 'checkmark-circle-outline'} title={`${l.tool} · ${l.durationMs} мс`} subtitle={`${relativeTime(l.createdAt)} · ${l.result.slice(0, 140)}`} />
          ))}
        </Section>
      ) : null}

      {row ? (
        <Section>
          <Row
            first
            title="Включён"
            right={
              <Toggle
                value={row.enabled}
                onChange={async (v) => {
                  await repo.saveMcpServer({ ...row, enabled: v });
                  setRow({ ...row, enabled: v });
                }}
              />
            }
          />
          <Row
            icon="trash-outline"
            danger
            title="Удалить сервер"
            onPress={() =>
              Alert.alert('Удалить сервер?', row.name, [
                { text: 'Отмена', style: 'cancel' },
                {
                  text: 'Удалить',
                  style: 'destructive',
                  onPress: async () => {
                    await setSecretJson(mcpSecretName(row.id), null);
                    await repo.deleteMcpServer(row.id);
                    router.back();
                  },
                },
              ])
            }
          />
        </Section>
      ) : null}
    </Screen>
  );
}

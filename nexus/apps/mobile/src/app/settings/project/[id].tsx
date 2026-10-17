import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { Button, Chip, Field, Row, Screen, Section, T } from '@/components/ui';
import { ModelPicker } from '@/components/ModelPicker';
import { fileSize } from '@/lib/format';
import { PHONE_SERVER_ID } from '@/lib/mcp';
import { resolveModel } from '@/lib/providers';
import * as repo from '@/lib/repo';
import { runtime } from '@/store/chat';

export default function ProjectScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const isNew = rawId.startsWith('new-');
  const id = isNew ? rawId.slice(4) : rawId;
  const [name, setName] = useState('');
  const [instructions, setInstructions] = useState('');
  const [model, setModel] = useState<{ providerId: string; modelId: string } | null>(null);
  const [modelName, setModelName] = useState('');
  const [servers, setServers] = useState<repo.McpServerRow[]>([]);
  const [serverIds, setServerIds] = useState<string[] | null>(null);
  const [files, setFiles] = useState<repo.ProjectFile[]>([]);
  const [picker, setPicker] = useState(false);
  const [exists, setExists] = useState(!isNew);

  const load = useCallback(async () => {
    setServers(await repo.listMcpServers());
    const p = await repo.getProject(id);
    if (p) {
      setExists(true);
      setName(p.name);
      setInstructions(p.instructions);
      setModel(p.providerId && p.modelId ? { providerId: p.providerId, modelId: p.modelId } : null);
      setServerIds(p.mcpServerIds);
      setFiles(await repo.listProjectFiles(id));
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    if (model) void resolveModel(model.providerId, model.modelId).then((m) => setModelName(m.name));
  }, [model]);

  const save = async (silent = false) => {
    if (!name.trim()) {
      if (!silent) Alert.alert('Название', 'Введите название проекта');
      return false;
    }
    await repo.saveProject({ id, name: name.trim(), instructions, providerId: model?.providerId ?? null, modelId: model?.modelId ?? null, mcpServerIds: serverIds });
    setExists(true);
    runtime.bumpList();
    return true;
  };

  const toggleServer = (sid: string) => {
    const all = [PHONE_SERVER_ID, ...servers.map((s) => s.id)];
    const cur = serverIds ?? all;
    const next = cur.includes(sid) ? cur.filter((x) => x !== sid) : [...cur, sid];
    setServerIds(next.length === all.length ? null : next);
  };
  const isOn = (sid: string) => serverIds === null || serverIds.includes(sid);

  return (
    <Screen keyboard>
      <Stack.Screen options={{ title: exists ? name || 'Проект' : 'Новый проект' }} />
      <Field label="Название" value={name} onChangeText={setName} placeholder="Например, Диплом" />
      <Field label="Инструкции проекта" value={instructions} onChangeText={setInstructions} multiline placeholder="Контекст, роль, стиль ответов для всех чатов проекта" style={{ minHeight: 140 }} />

      <Section title="Модель проекта">
        <Row first icon="sparkles-outline" title={model ? modelName || model.modelId : 'Как по умолчанию'} subtitle={model?.providerId} chevron onPress={() => setPicker(true)} />
        {model ? <Row title="Сбросить" onPress={() => setModel(null)} /> : null}
      </Section>

      <Section title="Инструменты" footer="Какие источники инструментов доступны в чатах проекта.">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, padding: 14 }}>
          <Chip label="Телефон" icon="phone-portrait-outline" active={isOn(PHONE_SERVER_ID)} onPress={() => toggleServer(PHONE_SERVER_ID)} />
          {servers.map((s) => (
            <Chip key={s.id} label={s.name} icon={s.authType === 'relay' ? 'desktop-outline' : 'server-outline'} active={isOn(s.id)} onPress={() => toggleServer(s.id)} />
          ))}
        </View>
      </Section>

      <Section title={`Знания (${files.length})`} footer="Текстовые файлы добавляются в контекст каждого запроса — следите за размером и стоимостью.">
        {files.map((f, i) => (
          <Row
            key={f.id}
            first={i === 0}
            icon="document-text-outline"
            title={f.name}
            subtitle={fileSize(f.content.length)}
            onLongPress={() =>
              Alert.alert('Удалить файл?', f.name, [
                { text: 'Отмена', style: 'cancel' },
                {
                  text: 'Удалить',
                  style: 'destructive',
                  onPress: async () => {
                    await repo.deleteProjectFile(f.id);
                    setFiles(await repo.listProjectFiles(id));
                  },
                },
              ])
            }
          />
        ))}
        <Row
          first={!files.length}
          icon="add"
          title="Добавить файл"
          onPress={async () => {
            if (!(await save())) return;
            const r = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: true });
            if (r.canceled) return;
            for (const a of r.assets) {
              if ((a.size ?? 0) > 500_000) {
                Alert.alert('Файл слишком большой', `${a.name}: максимум 500 КБ`);
                continue;
              }
              const text = await new File(a.uri).text();
              if (text.includes('\u0000')) {
                Alert.alert('Не текстовый файл', a.name);
                continue;
              }
              await repo.addProjectFile(id, a.name, text);
            }
            setFiles(await repo.listProjectFiles(id));
          }}
        />
      </Section>

      <View style={{ gap: 10 }}>
        <Button
          title="Сохранить"
          onPress={async () => {
            if (await save()) router.back();
          }}
        />
        {exists ? (
          <Button
            kind="secondary"
            icon="chatbubble-outline"
            title="Новый чат в проекте"
            onPress={async () => {
              if (await save()) router.navigate(`/?project=${id}&n=${Date.now()}` as never);
            }}
          />
        ) : null}
        {exists ? (
          <Button
            kind="ghost"
            title="Удалить проект"
            onPress={() =>
              Alert.alert('Удалить проект?', 'Чаты останутся, но будут без проекта.', [
                { text: 'Отмена', style: 'cancel' },
                {
                  text: 'Удалить',
                  style: 'destructive',
                  onPress: async () => {
                    await repo.deleteProject(id);
                    runtime.bumpList();
                    router.back();
                  },
                },
              ])
            }
          />
        ) : null}
      </View>
      <T v="caption" style={{ marginTop: 12 }}>
        Чаты проекта используют его инструкции, знания, модель и инструменты.
      </T>

      <ModelPicker visible={picker} onClose={() => setPicker(false)} current={model ?? { providerId: '', modelId: '' }} onSelect={(p, m) => setModel({ providerId: p, modelId: m })} />
    </Screen>
  );
}

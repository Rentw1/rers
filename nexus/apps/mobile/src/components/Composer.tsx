import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Alert, FlatList, Image, Pressable, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Attachment } from '@/lib/engine';
import { allPrompts, allResources, getPromptText, readResourceText } from '@/lib/mcp';
import { radius, useTheme } from '@/lib/theme';
import { Icon, IconButton, Row, Sheet, T, tap } from './ui';
import { useVoiceInput } from './useVoiceInput';

const MAX_IMAGE_B64 = 6_000_000;
const MAX_TEXT = 400_000;

export function Composer({
  running,
  onSend,
  onStop,
  modelLabel,
  onModelPress,
  vision,
  initialText,
}: {
  running: boolean;
  onSend: (text: string, attachments: Attachment[]) => Promise<boolean>;
  onStop: () => void;
  modelLabel: string;
  onModelPress: () => void;
  vision: boolean;
  initialText?: string;
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState(initialText ?? '');
  const [atts, setAtts] = useState<Attachment[]>([]);
  const [menu, setMenu] = useState(false);
  const [picker, setPicker] = useState<null | { kind: 'resource' | 'prompt'; items: { key: string; title: string; subtitle: string; run: () => Promise<void> }[] }>(null);
  const [height, setHeight] = useState(40);
  const voice = useVoiceInput(() => text, setText);

  const add = (a: Attachment[]) => setAtts((prev) => [...prev, ...a].slice(0, 10));

  const pickImages = async (camera: boolean) => {
    setMenu(false);
    if (!vision) Alert.alert('Модель без зрения', 'Текущая модель не принимает изображения. Выберите модель с бейджем «фото».');
    const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert('Нет доступа', camera ? 'Разрешите доступ к камере в настройках.' : 'Разрешите доступ к фото в настройках.');
    const r = camera
      ? await ImagePicker.launchCameraAsync({ base64: true, quality: 0.6, exif: false })
      : await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.6, exif: false, allowsMultipleSelection: true, selectionLimit: 6, mediaTypes: ['images'] });
    if (r.canceled) return;
    const ok: Attachment[] = [];
    for (const a of r.assets) {
      if (!a.base64) continue;
      if (a.base64.length > MAX_IMAGE_B64) {
        Alert.alert('Слишком большое фото', a.fileName ?? 'изображение');
        continue;
      }
      ok.push({ kind: 'image', name: a.fileName ?? 'photo.jpg', mediaType: a.mimeType ?? 'image/jpeg', data: a.base64 });
    }
    add(ok);
  };

  const pickFile = async () => {
    setMenu(false);
    const r = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: true });
    if (r.canceled) return;
    const ok: Attachment[] = [];
    for (const a of r.assets) {
      const isImage = (a.mimeType ?? '').startsWith('image/');
      const f = new File(a.uri);
      if (isImage) {
        if ((a.size ?? 0) > 4_500_000) {
          Alert.alert('Слишком большое изображение', a.name);
          continue;
        }
        ok.push({ kind: 'image', name: a.name, mediaType: a.mimeType ?? 'image/png', data: await f.base64() });
        continue;
      }
      if ((a.size ?? 0) > MAX_TEXT) {
        Alert.alert('Файл слишком большой', `${a.name}: максимум ${Math.round(MAX_TEXT / 1000)} КБ текста.`);
        continue;
      }
      const content = await f.text();
      if (content.includes('\u0000')) {
        Alert.alert('Неподдерживаемый файл', `${a.name} — бинарный файл. Поддерживаются текст, код, CSV, JSON, Markdown и изображения.`);
        continue;
      }
      ok.push({ kind: 'text', name: a.name, mediaType: a.mimeType ?? 'text/plain', data: content });
    }
    add(ok);
  };

  const pickResource = async () => {
    setMenu(false);
    const list = await allResources();
    if (!list.length) return Alert.alert('Нет ресурсов', 'Подключённые MCP-серверы не предоставляют ресурсов.');
    setPicker({
      kind: 'resource',
      items: list.map((r) => ({
        key: `${r.serverId}:${r.resource.uri}`,
        title: r.resource.name,
        subtitle: `${r.serverName} · ${r.resource.uri}`,
        run: async () => {
          const content = await readResourceText(r.serverId, r.resource.uri);
          add([{ kind: 'text', name: r.resource.name, mediaType: r.resource.mimeType ?? 'text/plain', data: content.slice(0, MAX_TEXT) }]);
        },
      })),
    });
  };

  const pickPrompt = async () => {
    setMenu(false);
    const list = await allPrompts();
    if (!list.length) return Alert.alert('Нет шаблонов', 'Подключённые MCP-серверы не предоставляют промптов (или ещё не подключены — отправьте сообщение, чтобы подключить).');
    setPicker({
      kind: 'prompt',
      items: list.map((p) => ({
        key: `${p.serverId}:${p.prompt.name}`,
        title: `/${p.prompt.name}`,
        subtitle: `${p.serverName}${p.prompt.description ? ` · ${p.prompt.description}` : ''}`,
        run: async () => {
          const args: Record<string, string> = {};
          for (const a of p.prompt.arguments ?? []) if (a.required) args[a.name] = text.trim();
          const content = await getPromptText(p.serverId, p.prompt.name, args);
          setText((prev) => (prev ? `${prev}\n\n${content}` : content));
        },
      })),
    });
  };

  const send = async () => {
    if (running) return onStop();
    if (voice.listening) voice.stop();
    if (!text.trim() && !atts.length) return;
    const t = text;
    const a = atts;
    setText('');
    setAtts([]);
    const ok = await onSend(t, a);
    if (!ok) {
      setText(t);
      setAtts(a);
    }
  };

  const canSend = running || !!text.trim() || atts.length > 0;
  return (
    <View style={{ paddingHorizontal: 10, paddingTop: 6, paddingBottom: Math.max(insets.bottom, 8), backgroundColor: c.bg }}>
      <View style={{ backgroundColor: c.card, borderRadius: radius.xl, borderWidth: 1, borderColor: c.border, paddingHorizontal: 8, paddingTop: 6, paddingBottom: 6 }}>
        {atts.length ? (
          <FlatList
            horizontal
            data={atts}
            keyExtractor={(_, i) => String(i)}
            style={{ marginBottom: 6 }}
            contentContainerStyle={{ gap: 6, paddingHorizontal: 4 }}
            renderItem={({ item, index }) => (
              <View style={{ position: 'relative' }}>
                {item.kind === 'image' ? (
                  <Image source={{ uri: `data:${item.mediaType};base64,${item.data}` }} style={{ width: 56, height: 56, borderRadius: 10 }} />
                ) : (
                  <View style={{ width: 120, height: 56, borderRadius: 10, backgroundColor: c.surfaceAlt, padding: 6, justifyContent: 'center' }}>
                    <Icon name="document-text-outline" size={16} color={c.textMuted} />
                    <T v="caption" numberOfLines={2} color={c.text}>
                      {item.name}
                    </T>
                  </View>
                )}
                <Pressable onPress={() => setAtts(atts.filter((_, i) => i !== index))} hitSlop={6} accessibilityLabel="Убрать вложение" style={{ position: 'absolute', top: -6, right: -6, backgroundColor: c.text, borderRadius: 10, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="close" size={14} color={c.bg} />
                </Pressable>
              </View>
            )}
          />
        ) : null}
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={voice.listening ? 'Говорите…' : 'Напишите сообщение…'}
          placeholderTextColor={c.textFaint}
          multiline
          onContentSizeChange={(e) => setHeight(Math.min(Math.max(40, e.nativeEvent.contentSize.height), 160))}
          style={{ color: c.text, fontSize: 16, lineHeight: 22, minHeight: 40, height, maxHeight: 160, paddingHorizontal: 8, paddingVertical: 8, textAlignVertical: 'top' }}
          accessibilityLabel="Поле ввода сообщения"
        />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <IconButton name="add-circle-outline" label="Прикрепить" onPress={() => setMenu(true)} color={c.textMuted} />
          <Pressable onPress={() => (tap(), onModelPress())} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: c.surfaceAlt, flexShrink: 1 }} accessibilityLabel="Выбрать модель">
            <T v="small" numberOfLines={1} style={{ color: c.text, flexShrink: 1 }}>
              {modelLabel}
            </T>
            <Icon name="chevron-down" size={14} color={c.textMuted} />
          </Pressable>
          <View style={{ flex: 1 }} />
          {!running ? (
            <IconButton
              name={voice.listening ? 'mic' : 'mic-outline'}
              label={voice.listening ? 'Остановить диктовку' : 'Голосовой ввод'}
              color={voice.listening ? c.danger : c.textMuted}
              onPress={voice.toggle}
            />
          ) : null}
          <Pressable
            onPress={() => {
              tap();
              void send();
            }}
            disabled={!canSend}
            accessibilityLabel={running ? 'Остановить' : 'Отправить'}
            style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: canSend ? c.accent : c.surfaceAlt }}
          >
            <Icon name={running ? 'stop' : 'arrow-up'} size={20} color={canSend ? c.accentText : c.textFaint} />
          </Pressable>
        </View>
      </View>

      <Sheet visible={menu} onClose={() => setMenu(false)} title="Прикрепить">
        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          <View style={{ backgroundColor: c.card, borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: c.border }}>
            <Row first icon="image-outline" title="Фото из галереи" onPress={() => void pickImages(false)} />
            <Row icon="camera-outline" title="Камера" onPress={() => void pickImages(true)} />
            <Row icon="document-outline" title="Файл" subtitle="Текст, код, CSV, JSON, изображения" onPress={() => void pickFile()} />
            <Row icon="server-outline" title="Ресурс MCP" onPress={() => void pickResource()} />
            <Row icon="flash-outline" title="Шаблон промпта MCP" onPress={() => void pickPrompt()} />
          </View>
        </View>
      </Sheet>

      <Sheet visible={!!picker} onClose={() => setPicker(null)} title={picker?.kind === 'resource' ? 'Ресурсы MCP' : 'Шаблоны MCP'} full>
        <FlatList
          data={picker?.items ?? []}
          keyExtractor={(i) => i.key}
          contentContainerStyle={{ paddingHorizontal: 16 }}
          renderItem={({ item, index }) => (
            <Row
              first={index === 0}
              title={item.title}
              subtitle={item.subtitle}
              onPress={() => {
                setPicker(null);
                item.run().catch((e: Error) => Alert.alert('Ошибка', e.message));
              }}
            />
          )}
        />
      </Sheet>
    </View>
  );
}

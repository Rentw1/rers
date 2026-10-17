import * as Clipboard from 'expo-clipboard';
import * as Notifications from 'expo-notifications';
import { router, useNavigation } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, Share, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { messageText, type ToolResultBlock } from '@nexus/core';
import { blockingBudgets } from '@/lib/budget';
import { createChatFor, editAndResend, isToolResultMessage, pathTo, regenerate, retry, sendMessage, siblingsOf, stop, switchBranch, type Attachment } from '@/lib/engine';
import { chatToMarkdown, shareChatMarkdown } from '@/lib/exportChat';
import { money, tokens } from '@/lib/format';
import { resolveModel } from '@/lib/providers';
import * as repo from '@/lib/repo';
import { toggleSpeak } from '@/lib/speech';
import { useTheme } from '@/lib/theme';
import { runtime, useChatRuntime } from '@/store/chat';
import { settings, useSettings } from '@/store/settings';
import { Composer } from './Composer';
import { AssistantBlocks, LiveBlocks, UserBubble } from './Message';
import { ModelPicker } from './ModelPicker';
import { Banner, Button, Chip, Field, IconButton, Row, Sheet, T, tap } from './ui';

type Item =
  | { kind: 'user'; msg: repo.StoredMessage; siblings: repo.StoredMessage[] }
  | { kind: 'assistant'; key: string; msgs: repo.StoredMessage[]; userId: string | null; results: Map<string, ToolResultBlock>; siblings: repo.StoredMessage[]; first: repo.StoredMessage; last: boolean }
  | { kind: 'live' };

const SUGGESTIONS = ['Объясни простыми словами, как работает MCP', 'Составь план дня по моему календарю', 'Напиши функцию на TypeScript для парсинга CSV', 'Какая погода и что надеть? Узнай моё местоположение'];

function buildItems(all: repo.StoredMessage[], leafId: string | null): Item[] {
  const path = pathTo(all, leafId);
  const items: Item[] = [];
  let turn: Extract<Item, { kind: 'assistant' }> | null = null;
  let lastUserId: string | null = null;
  for (const m of path) {
    if (m.role === 'user' && !isToolResultMessage(m)) {
      turn = null;
      lastUserId = m.id;
      items.push({ kind: 'user', msg: m, siblings: siblingsOf(all, m) });
      continue;
    }
    if (isToolResultMessage(m)) {
      if (turn) for (const b of m.blocks) if (b.type === 'tool_result') turn.results.set(b.toolCallId, b);
      continue;
    }
    if (!turn) {
      turn = { kind: 'assistant', key: m.id, msgs: [], userId: lastUserId, results: new Map(), siblings: siblingsOf(all, m), first: m, last: false };
      items.push(turn);
    }
    turn.msgs.push(m);
  }
  const lastAssistant = [...items].reverse().find((i) => i.kind === 'assistant');
  if (lastAssistant && lastAssistant.kind === 'assistant') lastAssistant.last = true;
  return items;
}

export function ChatScreen({ chatId: initialChatId, projectId }: { chatId: string | null; projectId?: string | null }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [chatId, setChatId] = useState<string | null>(initialChatId);
  const [chat, setChat] = useState<repo.Chat | null>(null);
  const [all, setAll] = useState<repo.StoredMessage[]>([]);
  const [usage, setUsage] = useState<Map<string, { costMicro: number; usage: import('@nexus/core').Usage; modelId: string }>>(new Map());
  const [draftModel, setDraftModel] = useState<{ providerId: string; modelId: string } | null>(null);
  const [modelInfo, setModelInfo] = useState<repo.ModelRow | null>(null);
  const [picker, setPicker] = useState(false);
  const [menu, setMenu] = useState<{ item: Item; text: string } | null>(null);
  const [edit, setEdit] = useState<{ id: string; text: string } | null>(null);
  const [selectText, setSelectText] = useState<string | null>(null);
  const [chatMenu, setChatMenu] = useState(false);
  const [speakingKey, setSpeakingKey] = useState<string | null>(null);
  const [project, setProject] = useState<repo.Project | null>(null);
  const showReasoning = useSettings((s) => s.showReasoning);
  const showCost = useSettings((s) => s.showCost);
  const defaultProviderId = useSettings((s) => s.defaultProviderId);
  const defaultModelId = useSettings((s) => s.defaultModelId);
  const version = useChatRuntime((s) => (chatId ? (s.version[chatId] ?? 0) : 0));
  const live = useChatRuntime((s) => (chatId ? s.live[chatId] : undefined));
  const running = useChatRuntime((s) => (chatId ? !!s.running[chatId] : false));
  const error = useChatRuntime((s) => (chatId ? s.errors[chatId] : null));
  const notices = useChatRuntime((s) => (chatId ? s.notices[chatId] : undefined));

  useEffect(() => {
    if (projectId) void repo.getProject(projectId).then(setProject);
  }, [projectId]);

  useEffect(() => {
    if (!chatId) return;
    let alive = true;
    void (async () => {
      const [ch, msgs] = await Promise.all([repo.getChat(chatId), repo.listMessages(chatId)]);
      if (!alive) return;
      setChat(ch);
      setAll(msgs);
      if (ch?.projectId) void repo.getProject(ch.projectId).then((p) => alive && setProject(p));
      const u = await repo.usageForMessages(msgs.filter((m) => m.role === 'assistant').map((m) => m.id));
      if (alive) setUsage(u);
    })();
    return () => {
      alive = false;
    };
  }, [chatId, version]);

  const current = chat ? { providerId: chat.providerId, modelId: chat.modelId } : (draftModel ?? { providerId: project?.providerId ?? defaultProviderId, modelId: project?.modelId ?? defaultModelId });

  useEffect(() => {
    void resolveModel(current.providerId, current.modelId).then(setModelInfo);
  }, [current.providerId, current.modelId]);

  const items = useMemo(() => {
    const base = buildItems(all, chat?.activeLeafId ?? null);
    if (running) base.push({ kind: 'live' });
    return base.reverse();
  }, [all, chat?.activeLeafId, running]);

  const chatCost = useMemo(() => [...usage.values()].reduce((s, u) => s + u.costMicro, 0), [usage]);

  const selectModel = async (providerId: string, modelId: string) => {
    if (chat) {
      await repo.updateChat(chat.id, { providerId, modelId });
      runtime.bump(chat.id);
    } else setDraftModel({ providerId, modelId });
    await settings().set('defaultProviderId', providerId);
    await settings().set('defaultModelId', modelId);
  };

  const confirmBudget = async (providerId: string): Promise<boolean> => {
    const blocking = await blockingBudgets(providerId);
    if (!blocking.length) return true;
    const b = blocking[0]!;
    return new Promise((resolve) =>
      Alert.alert('Лимит бюджета превышен', `${b.budget.period === 'day' ? 'Дневной' : 'Месячный'} бюджет${b.budget.scope === 'all' ? '' : ` (${b.budget.scope})`}: потрачено ${money(b.spent)} из ${money(b.budget.limitMicro)}.`, [
        { text: 'Отмена', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Отправить всё равно', style: 'destructive', onPress: () => resolve(true) },
      ]),
    );
  };

  const onSend = async (text: string, atts: Attachment[]): Promise<boolean> => {
    try {
      if (!(await confirmBudget(current.providerId))) return false;
      if (!settings().notifAsked) {
        void settings().set('notifAsked', true);
        void Notifications.requestPermissionsAsync().catch(() => undefined);
      }
      let id = chatId;
      if (!id) {
        const created = await createChatFor(project?.id ?? null);
        if (draftModel) await repo.updateChat(created.id, draftModel);
        id = created.id;
        setChatId(id);
        runtime.bumpList();
      }
      void sendMessage(id, text, atts).catch((e: Error) => runtime.setError(id!, e.message));
      return true;
    } catch (e) {
      Alert.alert('Ошибка', (e as Error).message);
      return false;
    }
  };

  const openDrawer = () => (navigation as unknown as { openDrawer?: () => void }).openDrawer?.();

  const turnText = (item: Extract<Item, { kind: 'assistant' }>) => item.msgs.map((m) => messageText({ role: 'assistant', blocks: m.blocks })).filter(Boolean).join('\n\n');

  const renderItem = ({ item }: { item: Item }) => {
    if (item.kind === 'live') {
      return (
        <View style={{ paddingVertical: 4 }}>
          <LiveBlocks blocks={live ?? []} showReasoning={showReasoning} />
        </View>
      );
    }
    if (item.kind === 'user') {
      const text = messageText({ role: 'user', blocks: item.msg.blocks }).replace(/<file name="[^"]+">[\s\S]*?<\/file>\s*/g, '');
      const idx = item.siblings.findIndex((s) => s.id === item.msg.id);
      return (
        <View>
          <UserBubble blocks={item.msg.blocks} onLongPress={() => (tap(), setMenu({ item, text }))} />
          {item.siblings.length > 1 ? <BranchNav idx={idx} total={item.siblings.length} onPick={(i) => chatId && void switchBranch(chatId, item.siblings[i]!.id)} align="flex-end" /> : null}
        </View>
      );
    }
    const turnUsage = item.msgs.map((m) => usage.get(m.id)).filter(Boolean) as { costMicro: number; usage: import('@nexus/core').Usage; modelId: string }[];
    const cost = turnUsage.reduce((s, u) => s + u.costMicro, 0);
    const inTok = turnUsage.reduce((s, u) => s + u.usage.inputTokens + u.usage.cacheReadTokens + u.usage.cacheWriteTokens, 0);
    const outTok = turnUsage.reduce((s, u) => s + u.usage.outputTokens, 0);
    const estimated = turnUsage.some((u) => u.usage.estimated);
    const idx = item.siblings.findIndex((s) => s.id === item.first.id);
    const hideFooter = item.last && running;
    return (
      <Pressable onLongPress={() => (tap(), setMenu({ item, text: turnText(item) }))} delayLongPress={400} style={{ marginVertical: 6 }}>
        {item.msgs.map((m) => (
          <View key={m.id}>
            <AssistantBlocks blocks={m.blocks} results={item.results} showReasoning={showReasoning} />
            {m.stopReason === 'max_tokens' ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <T v="caption" color={c.warning}>
                  Ответ обрезан лимитом токенов.
                </T>
                {item.last && !running && m.id === item.msgs[item.msgs.length - 1]?.id ? <Button small kind="ghost" icon="play-forward-outline" title="Продолжить" onPress={() => chatId && void sendMessage(chatId, 'Продолжи ровно с того места, где ты остановился, без повторов.')} /> : null}
              </View>
            ) : null}
          </View>
        ))}
        {!hideFooter ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2, gap: 2 }}>
            <IconButton name="copy-outline" label="Копировать" size={17} color={c.textMuted} onPress={() => void Clipboard.setStringAsync(turnText(item))} />
            {item.userId ? <IconButton name="refresh" label="Перегенерировать" size={17} color={c.textMuted} disabled={running} onPress={() => chatId && item.userId && void regenerate(chatId, item.userId)} /> : null}
            <IconButton name="share-outline" label="Поделиться" size={17} color={c.textMuted} onPress={() => void Share.share({ message: turnText(item) })} />
            <IconButton name={speakingKey === item.key ? 'stop-circle-outline' : 'volume-high-outline'} label={speakingKey === item.key ? 'Остановить озвучку' : 'Озвучить'} size={17} color={speakingKey === item.key ? c.accent : c.textMuted} onPress={() => toggleSpeak(item.key, turnText(item), setSpeakingKey)} />
            {item.siblings.length > 1 ? <BranchNav idx={idx} total={item.siblings.length} onPick={(i) => chatId && void switchBranch(chatId, item.siblings[i]!.id)} /> : null}
            <View style={{ flex: 1 }} />
            {showCost && turnUsage.length ? (
              <T v="caption" numberOfLines={1}>
                {estimated ? '≈' : ''}
                {tokens(inTok)}→{tokens(outTok)} · {money(cost)}
              </T>
            ) : null}
          </View>
        ) : null}
      </Pressable>
    );
  };

  const title = chat?.title ?? (project ? project.name : 'Новый чат');
  const modelLabel = modelInfo?.name ?? current.modelId;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ paddingTop: insets.top + 4, paddingHorizontal: 6, paddingBottom: 4, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: c.border }}>
        <IconButton name="menu" label="Меню" onPress={openDrawer} />
        <Pressable style={{ flex: 1, alignItems: 'center' }} onPress={() => setPicker(true)} accessibilityLabel="Сменить модель">
          <T v="h2" numberOfLines={1}>
            {title}
          </T>
          <T v="caption" numberOfLines={1}>
            {modelLabel}
            {showCost && chatCost > 0 ? ` · ${money(chatCost)}` : ''}
          </T>
        </Pressable>
        <IconButton name="create-outline" label="Новый чат" onPress={() => router.navigate((chat?.projectId ? `/?project=${chat.projectId}&n=${Date.now()}` : `/?n=${Date.now()}`) as never)} />
        {chatId ? <IconButton name="ellipsis-vertical" label="Действия с чатом" onPress={() => setChatMenu(true)} /> : null}
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {items.length === 0 ? (
          <View style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 16 }}>
            <T v="title" style={{ textAlign: 'center', fontSize: 28 }}>
              {project ? project.name : 'Чем могу помочь?'}
            </T>
            {project?.instructions ? (
              <T v="small" style={{ textAlign: 'center' }} numberOfLines={3}>
                {project.instructions}
              </T>
            ) : null}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
              {SUGGESTIONS.map((s) => (
                <Chip key={s} label={s} onPress={() => void onSend(s, [])} />
              ))}
            </View>
          </View>
        ) : (
          <FlatList
            inverted
            data={items}
            keyExtractor={(it) => (it.kind === 'user' ? it.msg.id : it.kind === 'assistant' ? it.key : 'live')}
            renderItem={renderItem}
            contentContainerStyle={{ paddingHorizontal: 14, paddingVertical: 12 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            ListHeaderComponent={
              <View>
                {notices?.length ? <Banner tone="warning" text={`Не все инструменты доступны:\n${notices.join('\n')}`} onClose={() => chatId && runtime.setNotices(chatId, undefined)} /> : null}
                {error ? <Banner text={error} action="Повторить" onAction={() => chatId && void retry(chatId)} onClose={() => chatId && runtime.setError(chatId, null)} /> : null}
              </View>
            }
          />
        )}
        <Composer running={running} onSend={onSend} onStop={() => chatId && stop(chatId)} modelLabel={modelLabel} onModelPress={() => setPicker(true)} vision={modelInfo?.vision !== false} />
      </KeyboardAvoidingView>

      <ModelPicker visible={picker} onClose={() => setPicker(false)} current={current} onSelect={(p, m) => void selectModel(p, m)} />

      <Sheet visible={!!menu} onClose={() => setMenu(null)}>
        {menu ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
            <View style={{ backgroundColor: c.card, borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: c.border }}>
              <Row first icon="copy-outline" title="Копировать" onPress={() => (void Clipboard.setStringAsync(menu.text), setMenu(null))} />
              <Row icon="text-outline" title="Выделить текст" onPress={() => (setSelectText(menu.text), setMenu(null))} />
              <Row icon="share-outline" title="Поделиться" onPress={() => (void Share.share({ message: menu.text }), setMenu(null))} />
              {menu.item.kind === 'user' ? <Row icon="pencil" title="Редактировать и отправить" onPress={() => (setEdit({ id: (menu.item as Extract<Item, { kind: 'user' }>).msg.id, text: menu.text }), setMenu(null))} /> : null}
              {menu.item.kind === 'assistant' && menu.item.userId ? (
                <Row
                  icon="refresh"
                  title="Перегенерировать"
                  onPress={() => {
                    const it = menu.item as Extract<Item, { kind: 'assistant' }>;
                    setMenu(null);
                    if (chatId && it.userId && !running) void regenerate(chatId, it.userId);
                  }}
                />
              ) : null}
              <Row
                icon="trash-outline"
                title="Удалить ветку отсюда"
                danger
                onPress={() => {
                  const it = menu.item;
                  setMenu(null);
                  if (it.kind === 'live') return;
                  const id = it.kind === 'user' ? it.msg.id : it.first.id;
                  const parentOf = it.kind === 'user' ? it.msg.parentId : it.first.parentId;
                  if (!chatId || running) return;
                  Alert.alert('Удалить сообщения?', 'Это сообщение и все ответы после него будут удалены.', [
                    { text: 'Отмена', style: 'cancel' },
                    {
                      text: 'Удалить',
                      style: 'destructive',
                      onPress: async () => {
                        const parent = await repo.deleteMessageSubtree(chatId, id);
                        const rest = await repo.listMessages(chatId);
                        const sibling = rest.filter((m) => m.parentId === parentOf).sort((a, b) => b.createdAt - a.createdAt)[0];
                        if (sibling) await switchBranch(chatId, sibling.id);
                        else {
                          await repo.updateChat(chatId, { activeLeafId: parent });
                          runtime.bump(chatId);
                        }
                      },
                    },
                  ]);
                }}
              />
            </View>
          </View>
        ) : null}
      </Sheet>

      <Sheet visible={selectText !== null} onClose={() => setSelectText(null)} title="Выделите текст" full>
        <ScrollView style={{ paddingHorizontal: 16 }} contentContainerStyle={{ paddingBottom: 24 }}>
          <Text selectable style={{ color: c.text, fontSize: 16, lineHeight: 24 }}>
            {selectText}
          </Text>
        </ScrollView>
      </Sheet>

      <Sheet visible={chatMenu} onClose={() => setChatMenu(false)} title={chat?.title}>
        <View style={{ paddingHorizontal: 16 }}>
          <View style={{ backgroundColor: c.card, borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: c.border }}>
            <Row
              first
              icon="document-text-outline"
              title="Экспорт в Markdown"
              onPress={() => {
                setChatMenu(false);
                if (chatId) shareChatMarkdown(chatId).catch((e: Error) => Alert.alert('Ошибка', e.message));
              }}
            />
            <Row
              icon="copy-outline"
              title="Скопировать весь чат"
              onPress={() => {
                setChatMenu(false);
                if (chatId) void chatToMarkdown(chatId).then((r) => Clipboard.setStringAsync(r.markdown));
              }}
            />
            <Row icon="sparkles-outline" title="Сменить модель" onPress={() => (setChatMenu(false), setPicker(true))} />
          </View>
        </View>
      </Sheet>

      <Sheet visible={!!edit} onClose={() => setEdit(null)} title="Редактировать сообщение">
        <View style={{ paddingHorizontal: 16 }}>
          <Field value={edit?.text ?? ''} onChangeText={(t) => edit && setEdit({ ...edit, text: t })} multiline style={{ minHeight: 120, maxHeight: 280 }} autoFocus />
          <Button
            title="Отправить"
            icon="arrow-up"
            onPress={() => {
              const e = edit;
              setEdit(null);
              if (e && chatId && e.text.trim() && !running) void editAndResend(chatId, e.id, e.text.trim()).catch((err: Error) => runtime.setError(chatId, err.message));
            }}
          />
        </View>
      </Sheet>
    </View>
  );
}

function BranchNav({ idx, total, onPick, align }: { idx: number; total: number; onPick: (i: number) => void; align?: 'flex-end' }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: align ?? 'auto' }}>
      <IconButton name="chevron-back" label="Предыдущий вариант" size={15} color={c.textMuted} disabled={idx <= 0} onPress={() => onPick(idx - 1)} />
      <T v="caption">
        {idx + 1}/{total}
      </T>
      <IconButton name="chevron-forward" label="Следующий вариант" size={15} color={c.textMuted} disabled={idx >= total - 1} onPress={() => onPick(idx + 1)} />
    </View>
  );
}


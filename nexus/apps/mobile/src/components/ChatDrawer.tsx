import { router, usePathname } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { money, startOfDay } from '@/lib/format';
import * as repo from '@/lib/repo';
import { radius, useTheme } from '@/lib/theme';
import { runtime, useChatRuntime } from '@/store/chat';
import { Chip, Field, Icon, IconButton, Row, Sheet, T, Button, tap } from './ui';

type Item = { kind: 'section'; title: string } | { kind: 'chat'; chat: repo.Chat };

function groupChats(chats: repo.Chat[]): Item[] {
  const today = startOfDay();
  const yesterday = today - 86_400_000;
  const week = today - 7 * 86_400_000;
  const groups: [string, repo.Chat[]][] = [
    ['Закреплённые', []],
    ['Сегодня', []],
    ['Вчера', []],
    ['На этой неделе', []],
    ['Ранее', []],
  ];
  for (const c of chats) {
    const g = c.pinned ? 0 : c.updatedAt >= today ? 1 : c.updatedAt >= yesterday ? 2 : c.updatedAt >= week ? 3 : 4;
    groups[g]![1].push(c);
  }
  const out: Item[] = [];
  for (const [title, list] of groups) {
    if (!list.length) continue;
    out.push({ kind: 'section', title });
    for (const chat of list) out.push({ kind: 'chat', chat });
  }
  return out;
}

export function ChatDrawer({ close }: { close: () => void }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const listVersion = useChatRuntime((s) => s.chatListVersion);
  const running = useChatRuntime((s) => s.running);
  const [chats, setChats] = useState<repo.Chat[]>([]);
  const [projects, setProjects] = useState<repo.Project[]>([]);
  const [projectFilter, setProjectFilter] = useState<string | undefined>(undefined);
  const [q, setQ] = useState('');
  const [today, setToday] = useState(0);
  const [action, setAction] = useState<repo.Chat | null>(null);
  const [rename, setRename] = useState<{ chat: repo.Chat; title: string } | null>(null);
  const [move, setMove] = useState<repo.Chat | null>(null);

  const load = useCallback(async () => {
    const [list, projs, totals] = await Promise.all([repo.listChats({ query: q, projectId: projectFilter }), repo.listProjects(), repo.usageTotals(startOfDay())]);
    setChats(list);
    setProjects(projs);
    setToday(totals.costMicro);
  }, [q, projectFilter]);

  useEffect(() => {
    const t = setTimeout(() => void load(), q ? 200 : 0);
    return () => clearTimeout(t);
  }, [load, listVersion, q]);

  const items = useMemo(() => groupChats(chats), [chats]);
  const activeId = pathname.startsWith('/chat/') ? pathname.slice(6) : null;

  const open = (path: string) => {
    close();
    router.navigate(path as never);
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.surface, paddingTop: insets.top + 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 8 }}>
        <T v="title" style={{ flex: 1, fontSize: 24 }}>
          Nexus
        </T>
        <IconButton name="create-outline" label="Новый чат" onPress={() => open(projectFilter ? `/?project=${projectFilter}&n=${Date.now()}` : `/?n=${Date.now()}`)} />
      </View>
      <View style={{ paddingHorizontal: 12, paddingBottom: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.card, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, paddingHorizontal: 10 }}>
          <Icon name="search" size={18} color={c.textFaint} />
          <TextInput value={q} onChangeText={setQ} placeholder="Поиск по чатам" placeholderTextColor={c.textFaint} style={{ flex: 1, color: c.text, paddingVertical: 9, fontSize: 15 }} />
          {q ? <IconButton name="close-circle" label="Очистить" size={18} color={c.textFaint} onPress={() => setQ('')} /> : null}
        </View>
      </View>
      {projects.length ? (
        <View style={{ paddingHorizontal: 12, paddingBottom: 8 }}>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={[{ id: '__all', name: 'Все' } as const, ...projects.map((p) => ({ id: p.id, name: p.name }))]}
            keyExtractor={(p) => p.id}
            contentContainerStyle={{ gap: 6 }}
            renderItem={({ item }) => <Chip label={item.name} icon={item.id === '__all' ? undefined : 'folder-outline'} active={item.id === '__all' ? projectFilter === undefined : projectFilter === item.id} onPress={() => setProjectFilter(item.id === '__all' ? undefined : item.id)} />}
          />
        </View>
      ) : null}
      <FlatList
        data={items}
        keyExtractor={(it, i) => (it.kind === 'chat' ? it.chat.id : `s${i}`)}
        contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: 12 }}
        ListEmptyComponent={
          <T v="small" style={{ textAlign: 'center', padding: 24 }}>
            {q ? 'Ничего не найдено' : 'Здесь появятся ваши чаты'}
          </T>
        }
        renderItem={({ item }) => {
          if (item.kind === 'section') {
            return (
              <T v="label" style={{ marginTop: 14, marginBottom: 4, marginLeft: 10, fontSize: 11 }}>
                {item.title}
              </T>
            );
          }
          const chat = item.chat;
          const active = chat.id === activeId;
          return (
            <Pressable
              onPress={() => (tap(), open(`/chat/${chat.id}`))}
              onLongPress={() => (tap(), setAction(chat))}
              delayLongPress={300}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 10, borderRadius: radius.md, backgroundColor: active ? c.surfaceAlt : pressed ? c.surfaceAlt : 'transparent' })}
            >
              {chat.pinned ? <Icon name="pin" size={14} color={c.textFaint} /> : null}
              <T numberOfLines={1} style={{ flex: 1, fontSize: 15 }}>
                {chat.title}
              </T>
              {running[chat.id] ? <Icon name="ellipsis-horizontal" size={16} color={c.accent} /> : null}
            </Pressable>
          );
        }}
      />
      <View style={{ borderTopWidth: 1, borderTopColor: c.border, paddingBottom: insets.bottom + 4 }}>
        <Row first icon="folder-outline" title="Проекты" onPress={() => open('/settings/projects')} chevron />
        <Row icon="stats-chart-outline" title="Расход" subtitle={`Сегодня ${money(today)}`} onPress={() => open('/settings/usage')} chevron />
        <Row icon="settings-outline" title="Настройки" onPress={() => open('/settings')} chevron />
      </View>

      <Sheet visible={!!action} onClose={() => setAction(null)} title={action?.title}>
        {action ? (
          <View style={{ paddingHorizontal: 16 }}>
            <View style={{ backgroundColor: c.card, borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: c.border }}>
              <Row first icon="pencil" title="Переименовать" onPress={() => (setRename({ chat: action, title: action.title }), setAction(null))} />
              <Row
                icon={action.pinned ? 'pin-outline' : 'pin'}
                title={action.pinned ? 'Открепить' : 'Закрепить'}
                onPress={async () => {
                  await repo.updateChat(action.id, { pinned: !action.pinned });
                  setAction(null);
                  runtime.bumpList();
                }}
              />
              <Row icon="folder-outline" title="Переместить в проект" onPress={() => (setMove(action), setAction(null))} />
              <Row
                icon="trash-outline"
                title="Удалить"
                danger
                onPress={() => {
                  const chat = action;
                  setAction(null);
                  Alert.alert('Удалить чат?', chat.title, [
                    { text: 'Отмена', style: 'cancel' },
                    {
                      text: 'Удалить',
                      style: 'destructive',
                      onPress: async () => {
                        await repo.deleteChat(chat.id);
                        runtime.bumpList();
                        if (chat.id === activeId) open('/');
                      },
                    },
                  ]);
                }}
              />
            </View>
          </View>
        ) : null}
      </Sheet>

      <Sheet visible={!!rename} onClose={() => setRename(null)} title="Переименовать">
        <View style={{ paddingHorizontal: 16 }}>
          <Field value={rename?.title ?? ''} onChangeText={(t) => rename && setRename({ ...rename, title: t })} autoFocus maxLength={120} />
          <Button
            title="Сохранить"
            onPress={async () => {
              if (rename?.title.trim()) await repo.updateChat(rename.chat.id, { title: rename.title.trim() });
              setRename(null);
              runtime.bumpList();
            }}
          />
        </View>
      </Sheet>

      <Sheet visible={!!move} onClose={() => setMove(null)} title="Проект">
        <View style={{ paddingHorizontal: 16 }}>
          <View style={{ backgroundColor: c.card, borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: c.border }}>
            <Row
              first
              title="Без проекта"
              right={move?.projectId === null ? <Icon name="checkmark" color={c.accent} /> : undefined}
              onPress={async () => {
                if (move) await repo.updateChat(move.id, { projectId: null });
                setMove(null);
                runtime.bumpList();
              }}
            />
            {projects.map((p) => (
              <Row
                key={p.id}
                icon="folder-outline"
                title={p.name}
                right={move?.projectId === p.id ? <Icon name="checkmark" color={c.accent} /> : undefined}
                onPress={async () => {
                  if (move) await repo.updateChat(move.id, { projectId: p.id });
                  setMove(null);
                  runtime.bumpList();
                }}
              />
            ))}
          </View>
        </View>
      </Sheet>
    </View>
  );
}

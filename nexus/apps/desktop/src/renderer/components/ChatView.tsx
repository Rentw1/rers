import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { isToolResultMessage, pathTo, siblingsOf, type Block, type ToolResultBlock } from '@nexus/core';
import type { ApprovalRequest, Attachment, Chat, LiveBlock, Settings, StoredMessage } from '../../shared/types';
import { api } from '../api';
import { errMsg } from '../ui';
import { money } from '../util';
import { Composer } from './Composer';
import { Icon } from './Icon';
import { AssistantBlocks, LiveBlocks, UserMessage, type ToolState } from './Message';

type Turn = { kind: 'user'; msg: StoredMessage } | { kind: 'assistant'; msgs: StoredMessage[]; userId: string | null };

const SUGGESTIONS = ['Объясни, как работает MCP', 'Напиши скрипт на Python для переименования файлов', 'Какие файлы лежат в моей папке Загрузки?', 'Составь план изучения TypeScript на месяц'];

function blocksText(blocks: Block[]): string {
  return blocks
    .filter((b) => b.type === 'text')
    .map((b) => (b as { text: string }).text)
    .join('\n\n');
}

function buildTurns(path: StoredMessage[]): Turn[] {
  const turns: Turn[] = [];
  let lastUser: string | null = null;
  for (const m of path) {
    if (m.role === 'user' && !isToolResultMessage(m)) {
      turns.push({ kind: 'user', msg: m });
      lastUser = m.id;
      continue;
    }
    const prev = turns[turns.length - 1];
    if (prev?.kind === 'assistant') prev.msgs.push(m);
    else turns.push({ kind: 'assistant', msgs: [m], userId: lastUser });
  }
  return turns;
}

function Branches({ all, msg, chatId, disabled }: { all: StoredMessage[]; msg: StoredMessage; chatId: string; disabled: boolean }) {
  const sibs = siblingsOf(all, msg);
  if (sibs.length < 2) return null;
  const i = sibs.findIndex((s) => s.id === msg.id);
  const go = (j: number) => void api.invoke('chats:switch', chatId, sibs[j]!.id);
  return (
    <span className="branch">
      <button className="icon-btn sm" disabled={disabled || i <= 0} onClick={() => go(i - 1)} title="Предыдущий вариант">
        <Icon name="left" size={14} />
      </button>
      {i + 1}/{sibs.length}
      <button className="icon-btn sm" disabled={disabled || i >= sibs.length - 1} onClick={() => go(i + 1)} title="Следующий вариант">
        <Icon name="right" size={14} />
      </button>
    </span>
  );
}

function CopyBtn({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      className="icon-btn sm"
      title="Копировать"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setOk(true);
          setTimeout(() => setOk(false), 1200);
        });
      }}
    >
      <Icon name={ok ? 'check' : 'copy'} size={15} />
    </button>
  );
}

function UserTurn({ msg, all, chatId, running }: { msg: StoredMessage; all: StoredMessage[]; chatId: string; running: boolean }) {
  const [editing, setEditing] = useState<string | null>(null);
  const text = blocksText(msg.blocks);
  if (editing !== null) {
    return (
      <div className="msg-user">
        <div className="composer" style={{ width: '85%' }}>
          <textarea autoFocus rows={Math.min(12, editing.split('\n').length + 1)} value={editing} onChange={(e) => setEditing(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setEditing(null)} />
          <div className="composer-row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn sm ghost" onClick={() => setEditing(null)}>
              Отмена
            </button>
            <button
              className="btn sm"
              disabled={!editing.trim() || running}
              onClick={() => {
                void api.invoke('chats:edit', chatId, msg.id, editing.trim());
                setEditing(null);
              }}
            >
              Отправить
            </button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="msg-user">
      <UserMessage blocks={msg.blocks} />
      <div className="msg-foot">
        <Branches all={all} msg={msg} chatId={chatId} disabled={running} />
        {text ? <CopyBtn text={text.replace(/<file name="[^"]+">[\s\S]*?<\/file>\s*/g, '').trim()} /> : null}
        <button className="icon-btn sm" title="Изменить" disabled={running} onClick={() => setEditing(text.replace(/<file name="[^"]+">[\s\S]*?<\/file>\s*/g, '').trim())}>
          <Icon name="edit" size={15} />
        </button>
      </div>
    </div>
  );
}

export function ChatView({
  chatId,
  settings,
  approvals,
  draftModel,
  modelName,
  onCreated,
  onPickModel,
  onSettings,
  sidebarOpen,
  onToggleSidebar,
  hasProviders,
}: {
  chatId: string | null;
  settings: Settings;
  approvals: Record<string, ApprovalRequest>;
  draftModel: { providerId: string; modelId: string };
  modelName: (providerId: string, modelId: string) => string;
  onCreated: (id: string) => void;
  onPickModel: () => void;
  onSettings: (tab?: string) => void;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  hasProviders: boolean;
}) {
  const [chat, setChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<StoredMessage[]>([]);
  const [running, setRunning] = useState(false);
  const [live, setLive] = useState<LiveBlock[] | null>(null);
  const [tools, setTools] = useState<Record<string, ToolState>>({});
  const [error, setError] = useState<string | null>(null);
  const [notices, setNotices] = useState<string[] | null>(null);
  const [costs, setCosts] = useState<Record<string, number>>({});
  const [renaming, setRenaming] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const current = useRef(chatId);
  current.current = chatId;

  const load = useCallback(async (id: string) => {
    const [r, c] = await Promise.all([api.invoke<{ chat: Chat | null; messages: StoredMessage[]; running: boolean }>('chats:get', id), api.invoke<Record<string, number>>('usage:chatCost', id)]);
    if (current.current !== id) return;
    setChat(r.chat);
    setMessages(r.messages);
    setRunning(r.running);
    setCosts(c);
  }, []);

  useEffect(() => {
    setLive(null);
    setTools({});
    setError(null);
    setNotices(null);
    setRenaming(null);
    stick.current = true;
    if (!chatId) {
      setChat(null);
      setMessages([]);
      setRunning(false);
      setCosts({});
      return;
    }
    void load(chatId);
  }, [chatId, load]);

  useEffect(
    () =>
      api.onChat((ev) => {
        if (ev.chatId === null || ev.chatId !== current.current) return;
        switch (ev.kind) {
          case 'live':
            setLive(ev.blocks);
            break;
          case 'running':
            setRunning(ev.running);
            if (ev.running) setTools({});
            break;
          case 'changed':
            void load(ev.chatId);
            break;
          case 'error':
            setError(ev.message);
            break;
          case 'notices':
            setNotices(ev.notices);
            break;
          case 'tool':
            setTools((t) => ({ ...t, [ev.callId]: { status: ev.status, result: ev.result } }));
            break;
        }
      }),
    [load],
  );

  const path = useMemo(() => (chat ? pathTo(messages, chat.activeLeafId) : []), [chat, messages]);
  const turns = useMemo(() => buildTurns(path), [path]);
  const results = useMemo(() => {
    const m = new Map<string, ToolResultBlock>();
    for (const msg of path) for (const b of msg.blocks) if (b.type === 'tool_result') m.set(b.toolCallId, b);
    return m;
  }, [path]);
  const chatApprovals = useMemo(() => Object.fromEntries(Object.entries(approvals).filter(([, a]) => a.chatId === chatId)), [approvals, chatId]);
  const toolBusy = Object.keys(chatApprovals).length > 0 || Object.values(tools).some((t) => t.status === 'running');
  const totalCost = useMemo(() => Object.values(costs).reduce((a, b) => a + b, 0), [costs]);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [turns, live, error, notices, chatApprovals]);

  const send = async (text: string, atts: Attachment[]): Promise<boolean> => {
    setError(null);
    try {
      stick.current = true;
      const id = await api.invoke<string>('chats:send', chatId, text, atts, chatId ? undefined : draftModel);
      if (!chatId) onCreated(id);
      return true;
    } catch (e) {
      setError(errMsg(e));
      return false;
    }
  };

  const providerId = chat?.providerId ?? draftModel.providerId;
  const modelId = chat?.modelId ?? draftModel.modelId;
  const modelLabel = modelId ? modelName(providerId, modelId) : 'Выберите модель';

  const composer = (
    <Composer
      running={running}
      sendOnEnter={settings.sendOnEnter}
      modelLabel={modelLabel}
      onModel={onPickModel}
      onSend={send}
      onStop={() => chatId && void api.invoke('chats:stop', chatId)}
      focusKey={chatId ?? 'new'}
    />
  );

  const topbar = (
    <div className="topbar">
      {!sidebarOpen ? (
        <button className="icon-btn" onClick={onToggleSidebar} title="Показать панель">
          <Icon name="sidebar" />
        </button>
      ) : null}
      <div className="title">
        {chat && renaming !== null ? (
          <input
            autoFocus
            value={renaming}
            style={{ width: '60%', textAlign: 'center', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 8px', background: 'var(--card)' }}
            onChange={(e) => setRenaming(e.target.value)}
            onBlur={() => {
              if (renaming.trim() && renaming.trim() !== chat.title) void api.invoke('chats:update', chat.id, { title: renaming.trim() });
              setRenaming(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') setRenaming(null);
            }}
          />
        ) : (
          <b onDoubleClick={() => chat && setRenaming(chat.title)} title={chat ? 'Двойной щелчок — переименовать' : undefined}>
            {chat?.title ?? 'Новый чат'}
          </b>
        )}
        <small>
          {modelLabel}
          {chat && settings.showCost && totalCost > 0 ? ` · ${money(totalCost, settings)}` : ''}
        </small>
      </div>
      {chat ? (
        <>
          <button className="icon-btn" title={chat.pinned ? 'Открепить' : 'Закрепить'} onClick={() => void api.invoke('chats:update', chat.id, { pinned: !chat.pinned })}>
            <Icon name="pin" className={chat.pinned ? 'accent' : ''} />
          </button>
          <button className="icon-btn" title="Экспорт в Markdown" onClick={() => void api.invoke('chats:export', chat.id)}>
            <Icon name="download" />
          </button>
        </>
      ) : null}
    </div>
  );

  if (!chatId) {
    return (
      <div className="main">
        {topbar}
        <div className="empty">
          <div style={{ width: '100%', maxWidth: 780 }}>
            <h1>Чем могу помочь?</h1>
            {!hasProviders ? (
              <div className="banner warning">
                <Icon name="key" />
                <div style={{ flex: 1 }}>Подключите хотя бы одного провайдера ИИ — например, DeepSeek. Нужен только API-ключ.</div>
                <button className="btn sm" onClick={() => onSettings('providers')}>
                  Подключить
                </button>
              </div>
            ) : null}
            {error ? (
              <div className="banner">
                <Icon name="alert" className="err" />
                <div style={{ flex: 1 }}>{error}</div>
              </div>
            ) : null}
            {composer}
            <div className="suggestions" style={{ margin: '14px auto 0' }}>
              {SUGGESTIONS.map((s) => (
                <button key={s} className="chip" onClick={() => void send(s, [])} disabled={!hasProviders}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="main">
      {topbar}
      <div
        className="messages"
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
      >
        <div className="thread">
          {turns.map((t, idx) => {
            if (t.kind === 'user') return <UserTurn key={t.msg.id} msg={t.msg} all={messages} chatId={chatId} running={running} />;
            const head = t.msgs[0]!;
            const isLast = idx === turns.length - 1;
            const hideFoot = isLast && running;
            const assistantMsgs = t.msgs.filter((m) => m.role === 'assistant');
            const cost = assistantMsgs.reduce((a, m) => a + (costs[m.id] ?? 0), 0);
            const text = assistantMsgs.map((m) => blocksText(m.blocks)).filter(Boolean).join('\n\n');
            const model = assistantMsgs[assistantMsgs.length - 1];
            return (
              <div key={head.id} className="msg-assistant">
                {t.msgs.map((m) => (m.role === 'assistant' ? <AssistantBlocks key={m.id} blocks={m.blocks} results={results} tools={tools} approvals={chatApprovals} showReasoning={settings.showReasoning} /> : null))}
                {isLast && live && (live.length || !toolBusy) ? <LiveBlocks blocks={live} tools={tools} approvals={chatApprovals} showReasoning={settings.showReasoning} /> : null}
                {!hideFoot ? (
                  <div className="msg-foot">
                    <Branches all={messages} msg={head} chatId={chatId} disabled={running} />
                    {text ? <CopyBtn text={text} /> : null}
                    {t.userId ? (
                      <button className="icon-btn sm" title="Сгенерировать заново" disabled={running} onClick={() => void api.invoke('chats:regenerate', chatId, t.userId)}>
                        <Icon name="refresh" size={15} />
                      </button>
                    ) : null}
                    <span className="grow" />
                    {model?.modelId ? <span>{modelName(model.providerId ?? '', model.modelId)}</span> : null}
                    {settings.showCost && cost > 0 ? <span>&nbsp;· {money(cost, settings)}</span> : null}
                    {model?.stopReason === 'max_tokens' ? <span className="badge warn">&nbsp;обрезано по лимиту</span> : null}
                  </div>
                ) : null}
              </div>
            );
          })}
          {running && turns[turns.length - 1]?.kind !== 'assistant' ? (
            <div className="msg-assistant">
              <LiveBlocks blocks={live ?? []} tools={tools} approvals={chatApprovals} showReasoning={settings.showReasoning} />
            </div>
          ) : null}
          {notices?.map((n, i) => (
            <div key={i} className="banner warning">
              <Icon name="info" />
              <div style={{ flex: 1 }}>{n}</div>
            </div>
          ))}
          {error ? (
            <div className="banner">
              <Icon name="alert" className="err" />
              <div style={{ flex: 1, whiteSpace: 'pre-wrap' }}>{error}</div>
              {!running ? (
                <button className="btn sm secondary" onClick={() => void api.invoke('chats:retry', chatId)}>
                  <Icon name="refresh" size={14} /> Повторить
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      <div style={{ maxWidth: 868, width: '100%', margin: '0 auto', padding: '0 24px 14px' }}>{composer}</div>
    </div>
  );
}

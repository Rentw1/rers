import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ApprovalRequest, Chat, ModelRow, ProviderRow, Settings as S, UsageReport } from '../shared/types';
import { api } from './api';
import { ChatView } from './components/ChatView';
import { ModelPicker } from './components/ModelPicker';
import { Onboarding } from './components/Onboarding';
import { Sidebar } from './components/Sidebar';
import { Settings, TABS, type Tab } from './settings/Settings';
import { DecideContext, type Decision } from './ui';
import { money } from './util';

type Groups = { provider: ProviderRow; models: ModelRow[] }[];

function useDarkPreference(): boolean {
  const [dark, setDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const fn = (e: MediaQueryListEvent) => setDark(e.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  return dark;
}

export function App() {
  const [settings, setSettings] = useState<S | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [query, setQuery] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [view, setView] = useState<'chat' | 'settings'>('chat');
  const [tab, setTab] = useState<Tab>('general');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [approvals, setApprovals] = useState<Record<string, ApprovalRequest>>({});
  const [running, setRunning] = useState<Set<string>>(() => new Set());
  const [picker, setPicker] = useState<'chat' | 'default' | null>(null);
  const [draft, setDraft] = useState<{ providerId: string; modelId: string } | null>(null);
  const [groups, setGroups] = useState<Groups>([]);
  const [monthSpend, setMonthSpend] = useState<number>(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const systemDark = useDarkPreference();
  const queryRef = useRef(query);
  queryRef.current = query;
  const activeRef = useRef(activeId);
  activeRef.current = activeId;

  const loadChats = useCallback(async () => {
    setChats(await api.invoke<Chat[]>('chats:list', queryRef.current));
  }, []);
  const loadGroups = useCallback(async () => {
    setGroups(await api.invoke<Groups>('models:groups'));
  }, []);
  const loadSpend = useCallback(async () => {
    const r = await api.invoke<UsageReport>('usage:report', 'month');
    setMonthSpend(r.totalMicro);
  }, []);

  useEffect(() => {
    void api.invoke<S>('settings:get').then(setSettings);
    void loadGroups();
    void loadSpend();
  }, [loadGroups, loadSpend]);

  useEffect(() => {
    const t = setTimeout(() => void loadChats(), 120);
    return () => clearTimeout(t);
  }, [query, loadChats]);

  useEffect(() => {
    if (!settings) return;
    document.documentElement.dataset.theme = settings.theme === 'dark' || (settings.theme === 'system' && systemDark) ? 'dark' : 'light';
  }, [settings, systemDark]);

  useEffect(() => {
    const offChat = api.onChat((ev) => {
      if (ev.kind === 'list') {
        void loadChats();
        void loadSpend();
      } else if (ev.kind === 'running') {
        setRunning((s) => {
          const n = new Set(s);
          if (ev.running) n.add(ev.chatId);
          else n.delete(ev.chatId);
          return n;
        });
        if (!ev.running) setApprovals((a) => Object.fromEntries(Object.entries(a).filter(([, r]) => r.chatId !== ev.chatId)));
      } else if (ev.kind === 'tool' && ev.status !== 'running') {
        setApprovals((a) => {
          if (!a[ev.callId]) return a;
          const n = { ...a };
          delete n[ev.callId];
          return n;
        });
      }
    });
    const offApproval = api.onApproval((r) => setApprovals((a) => ({ ...a, [r.callId]: r })));
    const offCmd = api.onCommand((c) => {
      if (c === 'new-chat') {
        setActiveId(null);
        setView('chat');
      } else if (c === 'search') {
        setSidebarOpen(true);
        setView('chat');
        setTimeout(() => searchRef.current?.focus(), 0);
      } else if (c === 'settings') setView('settings');
      else if (c.startsWith('open-chat:')) {
        setActiveId(c.slice('open-chat:'.length));
        setView('chat');
      }
    });
    return () => {
      offChat();
      offApproval();
      offCmd();
    };
  }, [loadChats, loadSpend]);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const k = e.code;
      if (mod && k === 'KeyB') {
        e.preventDefault();
        setSidebarOpen((v) => !v);
      } else if (mod && k === 'Comma') {
        e.preventDefault();
        setView('settings');
      } else if (mod && k === 'KeyN') {
        e.preventDefault();
        setActiveId(null);
        setDraft(null);
        setView('chat');
      } else if (mod && k === 'KeyK') {
        e.preventDefault();
        setSidebarOpen(true);
        setView('chat');
        setTimeout(() => searchRef.current?.focus(), 0);
      } else if (e.key === 'Escape' && !document.querySelector('.modal-back')) {
        if (view === 'settings') setView('chat');
        else if (activeRef.current && running.has(activeRef.current)) void api.invoke('chats:stop', activeRef.current);
      }
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [view, running]);

  const decide = useCallback((callId: string, d: Decision) => {
    void api.invoke('approval:decide', callId, d);
    setApprovals((a) => {
      const n = { ...a };
      delete n[callId];
      return n;
    });
  }, []);

  const update = useCallback(async (patch: Partial<S>) => {
    setSettings(await api.invoke<S>('settings:set', patch));
  }, []);

  const names = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of groups) for (const x of g.models) m.set(`${x.providerId}/${x.id}`, x.name);
    return m;
  }, [groups]);
  const modelName = useCallback((p: string, id: string) => names.get(`${p}/${id}`) ?? id, [names]);

  const draftModel = useMemo(() => {
    if (draft) return draft;
    if (!settings) return { providerId: '', modelId: '' };
    const avail = groups.some((g) => g.provider.id === settings.defaultProviderId && g.models.some((m) => m.id === settings.defaultModelId));
    if (avail || !groups[0]?.models[0]) return { providerId: settings.defaultProviderId, modelId: settings.defaultModelId };
    return { providerId: groups[0].provider.id, modelId: groups[0].models[0].id };
  }, [draft, settings, groups]);

  const activeChat = chats.find((c) => c.id === activeId);

  if (!settings) return null;

  if (!settings.onboarded) {
    return (
      <div className="app">
        <Onboarding
          onDone={async (pid) => {
            const patch: Partial<S> = { onboarded: true };
            if (pid) {
              const g = await api.invoke<Groups>('models:groups');
              setGroups(g);
              const models = g.find((x) => x.provider.id === pid)?.models ?? [];
              if (pid !== settings.defaultProviderId || !models.some((m) => m.id === settings.defaultModelId)) {
                const first = models.find((m) => m.favorite) ?? models[0];
                if (first) Object.assign(patch, { defaultProviderId: pid, defaultModelId: first.id });
              }
            }
            await update(patch);
          }}
        />
      </div>
    );
  }

  const nav = (t = 'general') => {
    setTab((TABS.find(([id]) => id === t)?.[0] ?? 'general') as Tab);
    setView('settings');
  };

  return (
    <DecideContext.Provider value={decide}>
      <div className="app">
        <Sidebar
          ref={searchRef}
          open={sidebarOpen}
          chats={chats}
          activeId={view === 'chat' ? activeId : null}
          running={running}
          query={query}
          onQuery={setQuery}
          onSelect={(id) => {
            setActiveId(id);
            setView('chat');
            if (!id) setDraft(null);
          }}
          onToggle={() => setSidebarOpen(false)}
          onNav={nav}
          monthSpend={settings.showCost && monthSpend > 0 ? money(monthSpend, settings) : null}
          relayOn={settings.relayEnabled}
        />
        {view === 'settings' ? (
          <Settings
            tab={tab}
            onTab={setTab}
            onClose={() => {
              setView('chat');
              void loadGroups();
            }}
            settings={settings}
            update={update}
            defaultModelLabel={`${groups.find((g) => g.provider.id === settings.defaultProviderId)?.provider.name ?? settings.defaultProviderId} · ${modelName(settings.defaultProviderId, settings.defaultModelId)}`}
            onPickDefault={() => {
              void loadGroups();
              setPicker('default');
            }}
            sidebarOpen={sidebarOpen}
            onToggleSidebar={() => setSidebarOpen(true)}
          />
        ) : (
          <ChatView
            chatId={activeId}
            settings={settings}
            approvals={approvals}
            draftModel={draftModel}
            modelName={modelName}
            onCreated={(id) => {
              setActiveId(id);
              setDraft(null);
            }}
            onPickModel={() => {
              void loadGroups();
              setPicker('chat');
            }}
            onSettings={nav}
            sidebarOpen={sidebarOpen}
            onToggleSidebar={() => setSidebarOpen(true)}
            hasProviders={groups.length > 0}
          />
        )}
        {picker ? (
          <ModelPicker
            current={picker === 'default' ? { providerId: settings.defaultProviderId, modelId: settings.defaultModelId } : activeChat ? { providerId: activeChat.providerId, modelId: activeChat.modelId } : draftModel}
            onClose={() => setPicker(null)}
            onManage={() => {
              setPicker(null);
              nav('providers');
            }}
            onSelect={(providerId, modelId) => {
              if (picker === 'default') void update({ defaultProviderId: providerId, defaultModelId: modelId });
              else if (activeId) void api.invoke('chats:update', activeId, { providerId, modelId });
              else setDraft({ providerId, modelId });
            }}
          />
        ) : null}
      </div>
    </DecideContext.Provider>
  );
}

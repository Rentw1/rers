import { forwardRef, useMemo, useState } from 'react';
import type { Chat } from '../../shared/types';
import { api } from '../api';
import { groupChats } from '../util';
import { Icon } from './Icon';

export const Sidebar = forwardRef<HTMLInputElement, { open: boolean; chats: Chat[]; activeId: string | null; running: Set<string>; query: string; onQuery: (q: string) => void; onSelect: (id: string | null) => void; onToggle: () => void; onNav: (tab: string) => void; monthSpend: string | null; relayOn: boolean }>(function Sidebar(
  { open, chats, activeId, running, query, onQuery, onSelect, onToggle, onNav, monthSpend, relayOn },
  searchRef,
) {
  const groups = useMemo(() => groupChats(chats), [chats]);
  const [menu, setMenu] = useState<string | null>(null);

  const remove = async (c: Chat) => {
    setMenu(null);
    if (!window.confirm(`Удалить чат «${c.title}»? Это действие нельзя отменить.`)) return;
    await api.invoke('chats:delete', c.id);
    if (c.id === activeId) onSelect(null);
  };

  const [renaming, setRenaming] = useState<{ id: string; text: string } | null>(null);
  const rename = (c: Chat) => {
    setMenu(null);
    setRenaming({ id: c.id, text: c.title });
  };
  const commitRename = (c: Chat) => {
    const t = renaming?.text.trim();
    setRenaming(null);
    if (t && t !== c.title) void api.invoke('chats:update', c.id, { title: t });
  };

  return (
    <aside className={`sidebar${open ? '' : ' collapsed'}`} onClick={() => menu && setMenu(null)}>
      <div className="sidebar-head">
        <div className="brand">
          <span className="logo">✦</span> Nexus
        </div>
        <button className="icon-btn" onClick={onToggle} title="Скрыть панель">
          <Icon name="sidebar" />
        </button>
      </div>
      <div style={{ padding: '0 12px 4px' }}>
        <button className="btn" style={{ width: '100%', justifyContent: 'center' }} onClick={() => onSelect(null)}>
          <Icon name="plus" size={16} /> Новый чат
        </button>
      </div>
      <div className="search">
        <Icon name="search" size={16} />
        <input ref={searchRef} placeholder="Поиск по чатам" value={query} onChange={(e) => onQuery(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && onQuery('')} />
        {query ? (
          <button className="icon-btn sm" onClick={() => onQuery('')}>
            <Icon name="x" size={14} />
          </button>
        ) : null}
      </div>
      <div className="chat-list">
        {!chats.length ? <div style={{ color: 'var(--faint)', fontSize: 13, padding: '16px 10px' }}>{query ? 'Ничего не найдено' : 'Здесь появятся ваши чаты'}</div> : null}
        {groups.map((g) => (
          <div key={g.title}>
            <div className="group-title">{g.title}</div>
            {g.chats.map((c) => (
              <div key={c.id} className={`chat-item${c.id === activeId ? ' active' : ''}`} onClick={() => onSelect(c.id)} onDoubleClick={() => rename(c)}>
                {running.has(c.id) ? <span className="spin" /> : null}
                {renaming?.id === c.id ? (
                  <input
                    autoFocus
                    className="t"
                    value={renaming.text}
                    style={{ border: '1px solid var(--accent)', borderRadius: 6, padding: '2px 6px', background: 'var(--card)', minWidth: 0 }}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setRenaming({ id: c.id, text: e.target.value })}
                    onBlur={() => commitRename(c)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename(c);
                      if (e.key === 'Escape') setRenaming(null);
                    }}
                  />
                ) : (
                  <span className="t">{c.title}</span>
                )}
                <span style={{ position: 'relative' }}>
                  <button
                    className="icon-btn sm act"
                    title="Действия"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenu(menu === c.id ? null : c.id);
                    }}
                  >
                    <Icon name="more" size={15} />
                  </button>
                  {menu === c.id ? (
                    <div className="menu" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => {
                          setMenu(null);
                          void api.invoke('chats:update', c.id, { pinned: !c.pinned });
                        }}
                      >
                        <Icon name="pin" size={15} /> {c.pinned ? 'Открепить' : 'Закрепить'}
                      </button>
                      <button onClick={() => rename(c)}>
                        <Icon name="edit" size={15} /> Переименовать
                      </button>
                      <button
                        onClick={() => {
                          setMenu(null);
                          void api.invoke('chats:export', c.id);
                        }}
                      >
                        <Icon name="download" size={15} /> Экспорт
                      </button>
                      <button className="danger" onClick={() => void remove(c)}>
                        <Icon name="trash" size={15} /> Удалить
                      </button>
                    </div>
                  ) : null}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="sidebar-foot">
        <button className="nav-btn" onClick={() => onNav('usage')}>
          <Icon name="chart" size={16} /> Расходы {monthSpend ? <small>{monthSpend} / мес</small> : null}
        </button>
        <button className="nav-btn" onClick={() => onNav('tools')}>
          <Icon name="wrench" size={16} /> Инструменты и MCP
        </button>
        <button className="nav-btn" onClick={() => onNav('phone')}>
          <Icon name="phone" size={16} /> Телефон {relayOn ? <small>● вкл.</small> : null}
        </button>
        <button className="nav-btn" onClick={() => onNav('general')}>
          <Icon name="settings" size={16} /> Настройки
        </button>
      </div>
    </aside>
  );
});

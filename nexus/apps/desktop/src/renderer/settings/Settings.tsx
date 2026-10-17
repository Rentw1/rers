import type { Settings as S } from '../../shared/types';
import { Icon } from '../components/Icon';
import { About } from './About';
import { General } from './General';
import { Phone } from './Phone';
import { Providers } from './Providers';
import { Tools } from './Tools';
import { Usage } from './Usage';

export const TABS = [
  ['general', 'Общие', 'settings'],
  ['providers', 'Провайдеры ИИ', 'key'],
  ['tools', 'Инструменты и MCP', 'wrench'],
  ['phone', 'Телефон', 'phone'],
  ['usage', 'Расходы и бюджеты', 'chart'],
  ['about', 'О программе', 'info'],
] as const;
export type Tab = (typeof TABS)[number][0];

export function Settings({ tab, onTab, onClose, settings, update, defaultModelLabel, onPickDefault, sidebarOpen, onToggleSidebar }: { tab: Tab; onTab: (t: Tab) => void; onClose: () => void; settings: S; update: (p: Partial<S>) => Promise<void>; defaultModelLabel: string; onPickDefault: () => void; sidebarOpen: boolean; onToggleSidebar: () => void }) {
  return (
    <div className="main">
      <div className="topbar">
        {!sidebarOpen ? (
          <button className="icon-btn" onClick={onToggleSidebar} title="Показать панель">
            <Icon name="sidebar" />
          </button>
        ) : null}
        <div className="title">
          <b>Настройки</b>
        </div>
        <button className="icon-btn" onClick={onClose} title="Закрыть (Esc)">
          <Icon name="x" />
        </button>
      </div>
      <div className="settings">
        <nav>
          {TABS.map(([id, label, icon]) => (
            <button key={id} className={tab === id ? 'on' : ''} onClick={() => onTab(id)}>
              <span className="inline" style={{ gap: 10 }}>
                <Icon name={icon} size={16} /> {label}
              </span>
            </button>
          ))}
        </nav>
        <div className="pane">
          {tab === 'general' ? <General settings={settings} update={update} defaultModelLabel={defaultModelLabel} onPickDefault={onPickDefault} /> : null}
          {tab === 'providers' ? <Providers /> : null}
          {tab === 'tools' ? <Tools settings={settings} update={update} /> : null}
          {tab === 'phone' ? <Phone settings={settings} update={update} /> : null}
          {tab === 'usage' ? <Usage settings={settings} /> : null}
          {tab === 'about' ? <About /> : null}
        </div>
      </div>
    </div>
  );
}

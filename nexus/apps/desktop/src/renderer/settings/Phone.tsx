import { useCallback, useEffect, useState } from 'react';
import type { RelayStatus, Settings } from '../../shared/types';
import { api } from '../api';
import { Icon } from '../components/Icon';
import { Row, Section, Toggle } from '../ui';
import { relTime } from '../util';

export function Phone({ settings, update }: { settings: Settings; update: (p: Partial<Settings>) => Promise<void> }) {
  const [st, setSt] = useState<RelayStatus | null>(null);
  const [port, setPort] = useState(String(settings.relayPort));
  const [name, setName] = useState(settings.relayName);
  const [now, setNow] = useState(() => Date.now());

  const reload = useCallback(() => void api.invoke<RelayStatus>('relay:status').then(setSt), []);
  useEffect(() => {
    reload();
    const t = setInterval(() => {
      setNow(Date.now());
      reload();
    }, 5000);
    return () => clearInterval(t);
  }, [reload, settings.relayEnabled, settings.relayPort]);

  const left = st?.expiresAt ? Math.max(0, Math.round((st.expiresAt - now) / 60_000)) : null;

  return (
    <div className="pane-inner">
      <h2>Связь с телефоном</h2>
      <p className="lead">Nexus для Android подключается к этому компьютеру по локальной сети: вызывает инструменты ПК и MCP-серверы, присылает файлы и синхронизирует чаты.</p>
      <Section>
        <Row title="Разрешить подключение телефона" sub={st?.running ? `Работает на порту ${st.port}` : st?.error ? <span className="err">{st.error}</span> : 'Выключено'}>
          <Toggle on={settings.relayEnabled} onChange={(v) => void update({ relayEnabled: v }).then(reload)} />
        </Row>
        <div className="sub-pad grid2" style={{ borderTop: '1px solid var(--border)' }}>
          <div className="field" style={{ margin: 0 }}>
            <label>Имя компьютера</label>
            <input value={name} placeholder="по умолчанию — имя компьютера в системе" onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() !== settings.relayName && void update({ relayName: name.trim() }).then(reload)} />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>Порт</label>
            <input
              value={port}
              onChange={(e) => setPort(e.target.value.replace(/\D/g, ''))}
              onBlur={() => {
                const p = Number(port);
                if (p >= 1024 && p <= 65535 && p !== settings.relayPort) void update({ relayPort: p }).then(reload);
                else setPort(String(settings.relayPort));
              }}
            />
          </div>
        </div>
      </Section>

      {st?.running && st.qr ? (
        <Section title="Подключить новый телефон">
          <div className="sub-pad" style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <img className="qr" src={st.qr} alt="QR-код для подключения" />
            <div style={{ flex: 1, minWidth: 220 }}>
              <ol style={{ paddingLeft: 18, margin: '0 0 12px', lineHeight: 1.7 }}>
                <li>Откройте Nexus на телефоне.</li>
                <li>Настройки → Компьютер → «Сканировать QR».</li>
                <li>Наведите камеру на код. Телефон и ПК должны быть в одной сети Wi-Fi.</li>
              </ol>
              <div className="sub" style={{ color: 'var(--muted)', fontSize: 13 }}>
                Адреса: <span className="mono">{st.urls.join(', ') || '—'}</span>
              </div>
              {left !== null ? <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>Код действует ещё {left} мин.</div> : null}
              <div className="inline" style={{ marginTop: 12 }}>
                <button
                  className="btn sm secondary"
                  onClick={async () => {
                    await api.invoke('relay:rotate');
                    reload();
                  }}
                >
                  <Icon name="refresh" size={14} /> Новый код
                </button>
                {st.pairUri ? (
                  <button className="btn sm ghost" onClick={() => void navigator.clipboard.writeText(st.pairUri!)}>
                    <Icon name="copy" size={14} /> Скопировать ссылку
                  </button>
                ) : null}
              </div>
              <p style={{ color: 'var(--faint)', fontSize: 12, marginTop: 12 }}>Если телефон не подключается — разрешите Nexus в брандмауэре Windows для частных сетей.</p>
            </div>
          </div>
        </Section>
      ) : null}

      <Section title="Подключённые устройства">
        {!st?.devices.length ? <div className="sub-pad" style={{ color: 'var(--muted)' }}>Нет подключённых телефонов.</div> : null}
        {st?.devices.map((d) => (
          <Row key={d.id} title={d.name} sub={`Активность: ${d.lastSeenAt ? relTime(d.lastSeenAt) : 'нет'}${d.lastIp ? ` · ${d.lastIp}` : ''}`}>
            <button
              className="btn sm danger"
              onClick={async () => {
                if (!window.confirm(`Отключить «${d.name}»?`)) return;
                await api.invoke('relay:revoke', d.id);
                reload();
              }}
            >
              Отключить
            </button>
          </Row>
        ))}
      </Section>
      <p style={{ color: 'var(--muted)', fontSize: 13 }}>
        Нет приложения на телефоне?{' '}
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            api.open('https://github.com/Rentw1/rers/releases');
          }}
        >
          Скачать APK Nexus для Android
        </a>
      </p>
    </div>
  );
}

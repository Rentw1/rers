import { useEffect, useState } from 'react';
import type { ProviderRow } from '../../shared/types';
import { api } from '../api';
import { errMsg } from '../ui';
import { Icon } from './Icon';

export function Onboarding({ onDone }: { onDone: (providerId: string | null) => void }) {
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [pid, setPid] = useState('deepseek');
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    void api.invoke<ProviderRow[]>('providers:list').then((l) => setProviders(l.filter((p) => p.requiresKey)));
  }, []);
  const p = providers.find((x) => x.id === pid);

  const connect = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api.invoke('providers:save', pid, { apiKey: key.trim() });
      onDone(pid);
    } catch (e) {
      await api.invoke('providers:save', pid, { apiKey: null }).catch(() => undefined);
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="onboard">
      <div className="card">
        <div className="brand" style={{ justifyContent: 'center', fontSize: 34, marginBottom: 6 }}>
          <span className="logo" style={{ width: 40, height: 40, fontSize: 22, borderRadius: 10 }}>
            ✦
          </span>
          Nexus
        </div>
        <p style={{ textAlign: 'center', color: 'var(--muted)', marginTop: 0 }}>ИИ-ассистент для компьютера с любыми моделями</p>
        <div className="feature">
          <div className="ic">
            <Icon name="key" size={17} />
          </div>
          <div>
            <b>Любые модели по API</b>
            <div style={{ color: 'var(--muted)', fontSize: 14 }}>DeepSeek, OpenAI, Claude, Gemini, OpenRouter, локальные Ollama и LM Studio.</div>
          </div>
        </div>
        <div className="feature">
          <div className="ic">
            <Icon name="wrench" size={17} />
          </div>
          <div>
            <b>MCP и файлы компьютера</b>
            <div style={{ color: 'var(--muted)', fontSize: 14 }}>Подключайте MCP-серверы как в Claude Desktop — с подтверждением каждого действия.</div>
          </div>
        </div>
        <div className="feature">
          <div className="ic">
            <Icon name="chart" size={17} />
          </div>
          <div>
            <b>Цены и расходы</b>
            <div style={{ color: 'var(--muted)', fontSize: 14 }}>Стоимость каждого ответа, статистика и бюджеты с лимитами.</div>
          </div>
        </div>
        <div className="feature">
          <div className="ic">
            <Icon name="phone" size={17} />
          </div>
          <div>
            <b>Связь с телефоном</b>
            <div style={{ color: 'var(--muted)', fontSize: 14 }}>Nexus для Android подключается к ПК по QR-коду.</div>
          </div>
        </div>

        <div className="section" style={{ marginTop: 18 }}>
          <div className="sub-pad">
            <div className="field">
              <label>Провайдер</label>
              <select value={pid} onChange={(e) => setPid(e.target.value)}>
                {providers.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
              {p?.description ? <span className="hint2">{p.description}</span> : null}
            </div>
            <div className="field">
              <label>API-ключ</label>
              <input type="password" autoFocus value={key} placeholder="sk-…" onChange={(e) => setKey(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && key.trim() && void connect()} />
              {p?.keyUrl ? (
                <span className="hint2">
                  Нет ключа?{' '}
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      api.open(p.keyUrl!);
                    }}
                  >
                    Получить на сайте {p.name}
                  </a>
                  {p.pricingUrl ? (
                    <>
                      {' · '}
                      <a
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          api.open(p.pricingUrl!);
                        }}
                      >
                        цены
                      </a>
                    </>
                  ) : null}
                </span>
              ) : null}
            </div>
            {err ? <div className="err" style={{ marginBottom: 10 }}>{err}</div> : null}
            <button className="btn" style={{ width: '100%', justifyContent: 'center' }} disabled={!key.trim() || busy} onClick={() => void connect()}>
              {busy ? <span className="spin" /> : null} Подключить и начать
            </button>
          </div>
        </div>
        <button className="btn ghost" style={{ width: '100%', justifyContent: 'center' }} onClick={() => onDone(null)}>
          Пропустить — настрою позже
        </button>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ModelRow, ProviderRow } from '../../shared/types';
import { api } from '../api';
import { Icon } from '../components/Icon';
import { priceLabel } from '../components/ModelPicker';
import { errMsg, Row, Section, Toggle } from '../ui';
import { tokens } from '../util';

type ProviderView = ProviderRow & { maskedKey: string | null };

function PriceEditor({ m, onDone }: { m: ModelRow; onDone: () => void }) {
  const [inp, setInp] = useState(m.price ? String(m.price.input) : '');
  const [out, setOut] = useState(m.price ? String(m.price.output) : '');
  const [cache, setCache] = useState(m.price?.cacheRead !== undefined ? String(m.price.cacheRead) : '');
  const [err, setErr] = useState<string | null>(null);
  const num = (s: string) => Number(s.replace(',', '.'));
  const save = async (reset: boolean) => {
    try {
      if (reset) await api.invoke('prices:set', m.providerId, m.id, null);
      else {
        const p = { input: num(inp), output: num(out), cacheRead: cache.trim() ? num(cache) : undefined };
        if (![p.input, p.output, p.cacheRead ?? 0].every((v) => Number.isFinite(v) && v >= 0)) throw new Error('Цены должны быть неотрицательными числами');
        await api.invoke('prices:set', m.providerId, m.id, p);
      }
      onDone();
    } catch (e) {
      setErr(errMsg(e));
    }
  };
  return (
    <div className="sub-pad" style={{ background: 'var(--surface)' }}>
      <div className="grid2" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
        <div className="field">
          <label>Вход, $ / 1M</label>
          <input value={inp} onChange={(e) => setInp(e.target.value)} />
        </div>
        <div className="field">
          <label>Выход, $ / 1M</label>
          <input value={out} onChange={(e) => setOut(e.target.value)} />
        </div>
        <div className="field">
          <label>Кэш, $ / 1M</label>
          <input value={cache} placeholder="необязательно" onChange={(e) => setCache(e.target.value)} />
        </div>
      </div>
      {err ? <div className="err" style={{ marginBottom: 8 }}>{err}</div> : null}
      <div className="inline">
        <button className="btn sm" onClick={() => void save(false)}>
          Сохранить цену
        </button>
        {m.price?.source === 'user' ? (
          <button className="btn sm ghost" onClick={() => void save(true)}>
            Сбросить к стандартной
          </button>
        ) : null}
        <button className="btn sm ghost" onClick={onDone}>
          Отмена
        </button>
      </div>
    </div>
  );
}

function Models({ provider }: { provider: ProviderView }) {
  const [models, setModels] = useState<ModelRow[]>([]);
  const [q, setQ] = useState('');
  const [onlyVisible, setOnlyVisible] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [newId, setNewId] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const reload = useCallback(() => void api.invoke<ModelRow[]>('models:list', provider.id).then(setModels), [provider.id]);
  useEffect(reload, [reload]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return models.filter((m) => (!onlyVisible || m.visible) && (!s || `${m.id} ${m.name}`.toLowerCase().includes(s))).slice(0, 300);
  }, [models, q, onlyVisible]);

  const flags = async (m: ModelRow, f: { visible?: boolean; favorite?: boolean }) => {
    await api.invoke('models:flags', m.providerId, m.id, f);
    reload();
  };

  return (
    <div style={{ borderTop: '1px solid var(--border)' }}>
      <div className="sub-pad inline">
        <div className="search" style={{ margin: 0, flex: 1, minWidth: 200 }}>
          <Icon name="search" size={15} />
          <input placeholder={`Поиск среди ${models.length} моделей`} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <label className="inline" style={{ fontSize: 13 }}>
          <Toggle on={onlyVisible} onChange={setOnlyVisible} /> только в списке
        </label>
        <button
          className="btn sm secondary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setMsg(null);
            try {
              const n = await api.invoke<number>('providers:sync', provider.id);
              setMsg(`Получено моделей: ${n}`);
              reload();
            } catch (e) {
              setMsg(errMsg(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? <span className="spin" /> : <Icon name="refresh" size={14} />} Обновить список
        </button>
      </div>
      {msg ? <div className="sub-pad" style={{ paddingTop: 0, color: 'var(--muted)', fontSize: 13 }}>{msg}</div> : null}
      {shown.map((m) => (
        <div key={m.id}>
          <div className="row">
            <button className="icon-btn sm" title={m.favorite ? 'Убрать из избранного' : 'В избранное'} onClick={() => void flags(m, { favorite: !m.favorite })} style={{ color: m.favorite ? 'var(--accent)' : 'var(--faint)' }}>
              {m.favorite ? '★' : '☆'}
            </button>
            <div className="grow">
              <div>
                {m.name} {m.reasoning ? <span className="badge accent">рассуждения</span> : null} {m.vision ? <span className="badge">изображения</span> : null}
              </div>
              <div className="sub">
                <span className="mono">{m.id}</span>
                {m.contextWindow ? ` · ${tokens(m.contextWindow)}` : ''} ·{' '}
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    setEditing(editing === m.id ? null : m.id);
                  }}
                >
                  {priceLabel(m.price)}
                  {m.price?.source === 'user' ? ' (своя)' : ''}
                </a>
              </div>
            </div>
            <Toggle on={m.visible} onChange={(v) => void flags(m, { visible: v })} />
          </div>
          {editing === m.id ? (
            <PriceEditor
              m={m}
              onDone={() => {
                setEditing(null);
                reload();
              }}
            />
          ) : null}
        </div>
      ))}
      <div className="sub-pad inline" style={{ borderTop: '1px solid var(--border)' }}>
        <div className="field" style={{ margin: 0, flex: 1 }}>
          <input placeholder="ID модели, которой нет в списке (например deepseek-chat)" value={newId} onChange={(e) => setNewId(e.target.value)} />
        </div>
        <button
          className="btn sm"
          disabled={!newId.trim()}
          onClick={async () => {
            await api.invoke('models:add', provider.id, newId.trim());
            setNewId('');
            reload();
          }}
        >
          <Icon name="plus" size={14} /> Добавить модель
        </button>
      </div>
    </div>
  );
}

function ProviderCard({ p, onChanged }: { p: ProviderView; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState('');
  const [baseUrl, setBaseUrl] = useState(p.baseUrl);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [showModels, setShowModels] = useState(false);

  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    setStatus(null);
    try {
      setStatus({ ok: true, text: await fn() });
    } catch (e) {
      setStatus({ ok: false, text: errMsg(e) });
    } finally {
      setBusy(false);
      onChanged();
    }
  };

  const connected = p.enabled && (p.hasKey || !p.requiresKey);
  return (
    <div className="section">
      <div className="row click" onClick={() => setOpen(!open)}>
        <span className={`dot${connected ? ' ok' : ''}`} />
        <div className="grow">
          <div style={{ fontWeight: 600 }}>
            {p.name} {p.isCustom ? <span className="badge">свой</span> : null}
          </div>
          <div className="sub">{p.description ?? p.baseUrl}</div>
        </div>
        {connected ? <span className="badge ok">подключён</span> : p.requiresKey && !p.hasKey ? <span className="badge">нет ключа</span> : <span className="badge">выключен</span>}
        <Icon name={open ? 'down' : 'right'} size={14} />
      </div>
      {open ? (
        <div className="sub-pad" style={{ borderTop: '1px solid var(--border)' }}>
          <div className="links">
            {p.keyUrl ? (
              <button className="btn sm secondary" onClick={() => api.open(p.keyUrl!)}>
                <Icon name="key" size={14} /> Получить API-ключ
              </button>
            ) : null}
            {p.pricingUrl ? (
              <button className="btn sm ghost" onClick={() => api.open(p.pricingUrl!)}>
                <Icon name="wallet" size={14} /> Цены
              </button>
            ) : null}
            {p.docsUrl ? (
              <button className="btn sm ghost" onClick={() => api.open(p.docsUrl!)}>
                <Icon name="external" size={14} /> Документация
              </button>
            ) : null}
          </div>
          {p.requiresKey || p.isCustom || p.hasKey ? (
            <div className="field">
              <label>API-ключ</label>
              <div className="inline">
                <input style={{ flex: 1 }} type="password" autoComplete="off" placeholder={p.maskedKey ?? 'sk-…'} value={key} onChange={(e) => setKey(e.target.value)} />
                <button
                  className="btn sm"
                  disabled={!key.trim() || busy}
                  onClick={() =>
                    void run(async () => {
                      const n = await api.invoke<number | null>('providers:save', p.id, { apiKey: key.trim() });
                      setKey('');
                      return `Ключ сохранён и проверен${n ? ` · моделей: ${n}` : ''}`;
                    })
                  }
                >
                  Сохранить
                </button>
                {p.hasKey ? (
                  <button className="btn sm ghost" disabled={busy} onClick={() => void run(async () => (await api.invoke('providers:save', p.id, { apiKey: null }), 'Ключ удалён'))}>
                    Удалить ключ
                  </button>
                ) : null}
              </div>
              <span className="hint2">Хранится зашифрованным на этом компьютере и отправляется только провайдеру.</span>
            </div>
          ) : null}
          {p.editableBaseUrl ? (
            <div className="field">
              <label>Адрес API (base URL)</label>
              <div className="inline">
                <input style={{ flex: 1 }} value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
                <button className="btn sm secondary" disabled={busy || baseUrl.trim() === p.baseUrl} onClick={() => void run(async () => (await api.invoke('providers:save', p.id, { baseUrl: baseUrl.trim() }), 'Адрес сохранён'))}>
                  Сохранить
                </button>
              </div>
            </div>
          ) : null}
          <Row title="Включён" sub="Модели провайдера появятся в выборе модели">
            <Toggle on={p.enabled} disabled={busy || (p.requiresKey && !p.hasKey)} onChange={(v) => void run(async () => (await api.invoke('providers:save', p.id, { enabled: v }), v ? 'Провайдер включён' : 'Провайдер выключен'))} />
          </Row>
          <Row title="Учёт токенов в потоке" sub="Выключите, если сервер не поддерживает stream_options">
            <Toggle on={p.streamUsage} onChange={(v) => void run(async () => (await api.invoke('providers:save', p.id, { streamUsage: v }), 'Сохранено'))} />
          </Row>
          {status ? <div className={status.ok ? '' : 'err'} style={{ margin: '8px 0', color: status.ok ? 'var(--muted)' : undefined }}>{status.text}</div> : null}
          <div className="inline" style={{ marginTop: 8 }}>
            <button className="btn sm secondary" disabled={busy || !connected} onClick={() => void run(async () => `Соединение работает · моделей: ${await api.invoke<number>('providers:test', p.id)}`)}>
              {busy ? <span className="spin" /> : <Icon name="check" size={14} />} Проверить соединение
            </button>
            <button className="btn sm ghost" onClick={() => setShowModels(!showModels)}>
              <Icon name={showModels ? 'down' : 'right'} size={14} /> Модели и цены
            </button>
            {p.isCustom ? (
              <button
                className="btn sm danger"
                onClick={async () => {
                  if (!window.confirm(`Удалить провайдера «${p.name}»?`)) return;
                  await api.invoke('providers:remove', p.id);
                  onChanged();
                }}
              >
                <Icon name="trash" size={14} /> Удалить
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      {open && showModels ? <Models provider={p} /> : null}
    </div>
  );
}

export function Providers() {
  const [list, setList] = useState<ProviderView[]>([]);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const reload = useCallback(() => void api.invoke<ProviderView[]>('providers:list').then(setList), []);
  useEffect(reload, [reload]);
  const connected = list.filter((p) => p.enabled && (p.hasKey || !p.requiresKey));
  const rest = list.filter((p) => !connected.includes(p));

  return (
    <div className="pane-inner">
      <h2>Провайдеры ИИ</h2>
      <p className="lead">Подключайте любые модели по API: DeepSeek, OpenAI, Anthropic, Gemini, OpenRouter, локальные Ollama / LM Studio и любой OpenAI-совместимый сервер. У каждого — ссылка, где получить ключ, и цены.</p>
      {connected.length ? <div className="section-title">Подключены</div> : null}
      {connected.map((p) => (
        <ProviderCard key={p.id} p={p} onChanged={reload} />
      ))}
      <div className="section-title">Доступные</div>
      {rest.map((p) => (
        <ProviderCard key={p.id} p={p} onChanged={reload} />
      ))}
      <Section title="Свой OpenAI-совместимый сервер">
        <div className="sub-pad">
          <div className="grid2">
            <div className="field">
              <label>Название</label>
              <input value={name} placeholder="Мой сервер" onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="field">
              <label>Base URL</label>
              <input value={url} placeholder="http://localhost:8000/v1" onChange={(e) => setUrl(e.target.value)} />
            </div>
          </div>
          {err ? <div className="err" style={{ marginBottom: 8 }}>{err}</div> : null}
          <button
            className="btn sm"
            disabled={!url.trim()}
            onClick={async () => {
              setErr(null);
              try {
                await api.invoke('providers:addCustom', name.trim(), url.trim());
                setName('');
                setUrl('');
                reload();
              } catch (e) {
                setErr(errMsg(e));
              }
            }}
          >
            <Icon name="plus" size={14} /> Добавить
          </button>
        </div>
      </Section>
    </div>
  );
}

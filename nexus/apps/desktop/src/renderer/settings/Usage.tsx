import { useCallback, useEffect, useState } from 'react';
import type { Budget, ProviderRow, Settings, UsageReport } from '../../shared/types';
import { api } from '../api';
import { Icon } from '../components/Icon';
import { errMsg, Section, Toggle } from '../ui';
import { money, tokens } from '../util';

const RANGES = [
  ['day', 'Сегодня'],
  ['week', '7 дней'],
  ['month', 'Этот месяц'],
  ['all', 'Всё время'],
] as const;

function BudgetForm({ settings, providers, onDone }: { settings: Settings; providers: ProviderRow[]; onDone: () => void }) {
  const [scope, setScope] = useState('all');
  const [period, setPeriod] = useState<'day' | 'month'>('month');
  const [limit, setLimit] = useState('');
  const [hard, setHard] = useState(false);
  const rate = settings.currency === 'USD' || !settings.fx ? 1 : settings.fx[settings.currency];
  const cur = settings.currency === 'USD' || !settings.fx ? 'USD' : settings.currency;
  const value = Number(limit.replace(',', '.'));
  return (
    <div className="sub-pad">
      <div className="grid2" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
        <div className="field">
          <label>Что ограничить</label>
          <select value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="all">Все провайдеры</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Период</label>
          <select value={period} onChange={(e) => setPeriod(e.target.value as 'day' | 'month')}>
            <option value="day">День</option>
            <option value="month">Месяц</option>
          </select>
        </div>
        <div className="field">
          <label>Лимит, {cur}</label>
          <input value={limit} placeholder="5" onChange={(e) => setLimit(e.target.value)} />
        </div>
      </div>
      <label className="inline" style={{ marginBottom: 10, fontSize: 14 }}>
        <Toggle on={hard} onChange={setHard} /> Жёсткий лимит — блокировать запросы при превышении
      </label>
      <div className="inline">
        <button
          className="btn sm"
          disabled={!(value > 0)}
          onClick={async () => {
            const b: Budget = { id: crypto.randomUUID().slice(0, 8), scope, period, limitMicro: Math.round((value / rate) * 1e6), hard };
            await api.invoke('budgets:save', b);
            onDone();
          }}
        >
          Добавить бюджет
        </button>
        <button className="btn sm ghost" onClick={onDone}>
          Отмена
        </button>
      </div>
    </div>
  );
}

export function Usage({ settings }: { settings: Settings }) {
  const [range, setRange] = useState<'day' | 'week' | 'month' | 'all'>('month');
  const [r, setR] = useState<UsageReport | null>(null);
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const reload = useCallback(() => void api.invoke<UsageReport>('usage:report', range).then(setR), [range]);
  useEffect(reload, [reload]);
  useEffect(() => {
    void api.invoke<ProviderRow[]>('providers:list').then(setProviders);
  }, []);
  const pname = (id: string) => (id === 'all' ? 'Все провайдеры' : (providers.find((p) => p.id === id)?.name ?? id));
  const m = (v: number) => money(v, settings);
  const maxDay = Math.max(...(r?.byDay.map((d) => d.costMicro) ?? [0]), 1);

  return (
    <div className="pane-inner">
      <h2>Расходы</h2>
      <p className="lead">Стоимость считается по токенам из ответов провайдеров и актуальным ценам моделей.</p>
      <div className="tabs">
        {RANGES.map(([k, label]) => (
          <button key={k} className={`chip${range === k ? ' active' : ''}`} onClick={() => setRange(k)}>
            {label}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <button className="btn sm ghost" onClick={() => void api.invoke('usage:csv')}>
          <Icon name="download" size={14} /> CSV
        </button>
      </div>
      {r ? (
        <>
          <div className="cards">
            <div className="card-stat">
              <div className="label">Потрачено</div>
              <div className="value">{m(r.totalMicro)}</div>
            </div>
            <div className="card-stat">
              <div className="label">Запросов</div>
              <div className="value">{r.requests}</div>
            </div>
            {r.balances.map((b) => (
              <div className="card-stat" key={b.label + b.value}>
                <div className="label">Баланс {b.label}</div>
                <div className="value">{b.value}</div>
              </div>
            ))}
          </div>

          <Section title="Последние 30 дней">
            <div className="bars">
              {r.byDay.map((d) => (
                <div key={d.day} className={d.costMicro ? '' : 'zero'} style={{ height: `${Math.max(1, (d.costMicro / maxDay) * 100)}%` }} title={`${d.day}: ${m(d.costMicro)}`} />
              ))}
            </div>
            <div className="bars-labels">
              <span>{r.byDay[0]?.day.slice(5)}</span>
              <span>{r.byDay[r.byDay.length - 1]?.day.slice(5)}</span>
            </div>
          </Section>

          {r.byModel.length ? (
            <Section title="По моделям">
              <table className="table">
                <thead>
                  <tr>
                    <th>Модель</th>
                    <th className="num">Запросы</th>
                    <th className="num">Вход</th>
                    <th className="num">Кэш</th>
                    <th className="num">Выход</th>
                    <th className="num">Сумма</th>
                  </tr>
                </thead>
                <tbody>
                  {r.byModel.map((x) => (
                    <tr key={x.key}>
                      <td>
                        {pname(x.key.slice(0, x.key.indexOf('/')))} · <span className="mono">{x.key.slice(x.key.indexOf('/') + 1)}</span>
                      </td>
                      <td className="num">{x.requests}</td>
                      <td className="num">{tokens(x.inputTokens)}</td>
                      <td className="num">{tokens(x.cacheReadTokens)}</td>
                      <td className="num">{tokens(x.outputTokens)}</td>
                      <td className="num">{m(x.costMicro)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          ) : null}

          {r.byProvider.length ? (
            <Section title="По провайдерам">
              <table className="table">
                <tbody>
                  {r.byProvider.map((x) => (
                    <tr key={x.key}>
                      <td>{pname(x.key)}</td>
                      <td className="num">{x.requests} запр.</td>
                      <td className="num">{m(x.costMicro)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          ) : null}

          {r.byChat.length ? (
            <Section title="Самые дорогие чаты">
              <table className="table">
                <tbody>
                  {r.byChat.slice(0, 10).map((x) => (
                    <tr key={x.key}>
                      <td>{x.title}</td>
                      <td className="num">{m(x.costMicro)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          ) : null}

          <div className="section-title">Бюджеты</div>
          <div className="section">
            {!r.budgets.length && !adding ? <div className="sub-pad" style={{ color: 'var(--muted)' }}>Бюджетов нет. Добавьте лимит, чтобы получать предупреждения при 80% и 100%.</div> : null}
            {r.budgets.map(({ budget: b, spent, ratio }) => (
              <div key={b.id} className="row">
                <div className="grow">
                  <div>
                    {pname(b.scope)} · {b.period === 'day' ? 'в день' : 'в месяц'} {b.hard ? <span className="badge warn">жёсткий</span> : null}
                  </div>
                  <div className="progress" style={{ margin: '6px 0' }}>
                    <div style={{ width: `${Math.min(100, ratio * 100)}%`, background: ratio >= 1 ? 'var(--danger)' : ratio >= 0.8 ? 'var(--warning)' : 'var(--accent)' }} />
                  </div>
                  <div className="sub">
                    {m(spent)} из {m(b.limitMicro)} ({Math.round(ratio * 100)}%)
                  </div>
                </div>
                <button
                  className="icon-btn sm"
                  title="Удалить"
                  onClick={async () => {
                    await api.invoke('budgets:remove', b.id);
                    reload();
                  }}
                >
                  <Icon name="trash" size={15} />
                </button>
              </div>
            ))}
            {adding ? (
              <div style={{ borderTop: r.budgets.length ? '1px solid var(--border)' : undefined }}>
                <BudgetForm
                  settings={settings}
                  providers={providers}
                  onDone={() => {
                    setAdding(false);
                    reload();
                  }}
                />
              </div>
            ) : null}
          </div>
          {!adding ? (
            <button className="btn sm secondary" onClick={() => setAdding(true)}>
              <Icon name="plus" size={14} /> Добавить бюджет
            </button>
          ) : null}

          <div className="section-title" style={{ marginTop: 22 }}>
            Цены
          </div>
          <div className="section">
            <div className="row">
              <div className="grow">
                <div>Актуальные цены моделей</div>
                <div className="sub">{settings.pricesSyncedAt ? `Обновлены ${new Date(settings.pricesSyncedAt).toLocaleString('ru-RU')}` : 'Используются встроенные цены'} · источник: OpenRouter и прайсы провайдеров</div>
              </div>
              <button
                className="btn sm secondary"
                disabled={syncing}
                onClick={async () => {
                  setSyncing(true);
                  setMsg(null);
                  try {
                    setMsg(`Обновлено цен: ${await api.invoke<number>('prices:sync')}`);
                    reload();
                  } catch (e) {
                    setMsg(errMsg(e));
                  } finally {
                    setSyncing(false);
                  }
                }}
              >
                {syncing ? <span className="spin" /> : <Icon name="refresh" size={14} />} Обновить
              </button>
            </div>
            {msg ? <div className="sub-pad" style={{ color: 'var(--muted)', borderTop: '1px solid var(--border)' }}>{msg}</div> : null}
          </div>
        </>
      ) : (
        <span className="spin" />
      )}
    </div>
  );
}

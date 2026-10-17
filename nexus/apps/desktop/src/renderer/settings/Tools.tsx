import { useCallback, useEffect, useState } from 'react';
import type { McpServerDef, McpServerStatus, Settings, ToolInfo } from '../../shared/types';
import { api } from '../api';
import { Icon } from '../components/Icon';
import { errMsg, Row, Section, Toggle } from '../ui';

const PC = 'pc';

function ToolList({ serverId, version }: { serverId: string; version: number }) {
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const reload = useCallback(() => void api.invoke<ToolInfo[]>('mcp:tools', serverId).then(setTools), [serverId]);
  useEffect(reload, [reload, version]);
  if (!tools.length) return <div className="sub-pad" style={{ color: 'var(--muted)', fontSize: 13 }}>Инструментов пока нет.</div>;
  const pref = async (t: ToolInfo, patch: { enabled?: boolean; approval?: 'ask' | 'always' }) => {
    await api.invoke('mcp:pref', serverId, t.name, patch);
    reload();
  };
  return (
    <>
      {tools.map((t) => (
        <Row key={t.name} title={<span className="mono">{t.name}</span>} sub={t.description?.split('\n')[0]?.slice(0, 160)}>
          <select className="field-select" value={t.approval} disabled={!t.enabled} onChange={(e) => void pref(t, { approval: e.target.value as 'ask' | 'always' })} title="Подтверждение вызова">
            <option value="ask">Спрашивать</option>
            <option value="always">Разрешено</option>
          </select>
          <Toggle on={t.enabled} onChange={(v) => void pref(t, { enabled: v })} />
        </Row>
      ))}
    </>
  );
}

const lines = (s: string) =>
  s
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
const kv = (s: string, sep: string) => Object.fromEntries(lines(s).map((l) => [l.slice(0, l.indexOf(sep)).trim(), l.slice(l.indexOf(sep) + 1).trim()]).filter(([k]) => k));
const unkv = (o: Record<string, string> | undefined, sep: string) => Object.entries(o ?? {}).map(([k, v]) => `${k}${sep}${v}`).join('\n');

function ServerForm({ initial, onDone }: { initial?: McpServerDef; onDone: () => void }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [type, setType] = useState<'stdio' | 'http'>(initial?.type ?? 'stdio');
  const [command, setCommand] = useState(initial?.command ?? '');
  const [args, setArgs] = useState((initial?.args ?? []).join('\n'));
  const [env, setEnv] = useState(unkv(initial?.env, '='));
  const [url, setUrl] = useState(initial?.url ?? '');
  const [headers, setHeaders] = useState(unkv(initial?.headers, ':'));
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setErr(null);
    setBusy(true);
    try {
      if (!name.trim()) throw new Error('Укажите название');
      const def: Omit<McpServerDef, 'id'> & { id?: string } = { id: initial?.id, name: name.trim(), type, enabled: initial?.enabled ?? true };
      if (type === 'stdio') Object.assign(def, { command: command.trim(), args: lines(args), env: kv(env, '=') });
      else Object.assign(def, { url: url.trim(), headers: kv(headers, ':') });
      await api.invoke('mcp:upsert', def);
      onDone();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="sub-pad">
      <div className="grid2">
        <div className="field">
          <label>Название</label>
          <input value={name} placeholder="filesystem" onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label>Тип</label>
          <select value={type} onChange={(e) => setType(e.target.value as 'stdio' | 'http')}>
            <option value="stdio">Локальная команда (stdio)</option>
            <option value="http">Удалённый сервер (HTTP)</option>
          </select>
        </div>
      </div>
      {type === 'stdio' ? (
        <>
          <div className="field">
            <label>Команда</label>
            <input value={command} className="mono" placeholder="npx" onChange={(e) => setCommand(e.target.value)} />
          </div>
          <div className="grid2">
            <div className="field">
              <label>Аргументы (по одному в строке)</label>
              <textarea rows={4} className="mono" value={args} placeholder={'-y\n@modelcontextprotocol/server-filesystem\nC:\\Users\\me\\Documents'} onChange={(e) => setArgs(e.target.value)} />
            </div>
            <div className="field">
              <label>Переменные окружения (KEY=value)</label>
              <textarea rows={4} className="mono" value={env} placeholder="API_TOKEN=…" onChange={(e) => setEnv(e.target.value)} />
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="field">
            <label>URL</label>
            <input value={url} className="mono" placeholder="https://example.com/mcp" onChange={(e) => setUrl(e.target.value)} />
          </div>
          <div className="field">
            <label>Заголовки (Name: value)</label>
            <textarea rows={3} className="mono" value={headers} placeholder="Authorization: Bearer …" onChange={(e) => setHeaders(e.target.value)} />
          </div>
        </>
      )}
      {err ? <div className="err" style={{ marginBottom: 8 }}>{err}</div> : null}
      <div className="inline">
        <button className="btn sm" disabled={busy} onClick={() => void save()}>
          {busy ? <span className="spin" /> : null} {initial ? 'Сохранить' : 'Добавить сервер'}
        </button>
        <button className="btn sm ghost" onClick={onDone}>
          Отмена
        </button>
      </div>
    </div>
  );
}

function statusText(s: McpServerStatus | undefined): { dot: string; text: string } {
  if (!s) return { dot: '', text: '' };
  if (s.status === 'ready') return { dot: 'ok', text: `работает · инструментов: ${s.tools}` };
  if (s.status === 'error') return { dot: 'err', text: s.error ?? 'ошибка' };
  if (s.status === 'starting') return { dot: 'wait', text: 'запускается…' };
  return { dot: '', text: 'выключен' };
}

export function Tools({ settings, update }: { settings: Settings; update: (p: Partial<Settings>) => Promise<void> }) {
  const [defs, setDefs] = useState<McpServerDef[]>([]);
  const [status, setStatus] = useState<McpServerStatus[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [form, setForm] = useState<McpServerDef | 'new' | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [shellAllow, setShellAllow] = useState(settings.shellAllow.join(', '));

  const reload = useCallback(async () => {
    const r = await api.invoke<{ defs: McpServerDef[]; status: McpServerStatus[] }>('mcp:list');
    setDefs(r.defs);
    setStatus(r.status);
    setVersion((v) => v + 1);
  }, []);
  useEffect(() => {
    void reload();
    const t = setInterval(() => void reload(), 3000);
    return () => clearInterval(t);
  }, [reload]);

  const addDir = async () => {
    const d = await api.invoke<string | null>('dialog:pickDir');
    if (d && !settings.allowedDirs.includes(d)) await update({ allowedDirs: [...settings.allowedDirs, d] });
    setVersion((v) => v + 1);
  };

  return (
    <div className="pane-inner">
      <h2>Инструменты и MCP</h2>
      <p className="lead">Модель может работать с файлами компьютера и подключёнными MCP-серверами. Действия, меняющие данные, требуют вашего подтверждения.</p>

      <Section title="Компьютер">
        <Row title="Инструменты компьютера" sub="Чтение и запись файлов в разрешённых папках, системная информация, буфер обмена">
          <Toggle on={settings.pcToolsEnabled} onChange={(v) => void update({ pcToolsEnabled: v }).then(() => setVersion((x) => x + 1))} />
        </Row>
        {settings.pcToolsEnabled ? (
          <>
            {settings.allowedDirs.map((d) => (
              <Row key={d} title={<span className="mono">{d}</span>} sub="Разрешённая папка">
                <button className="icon-btn sm" title="Открыть" onClick={() => void api.invoke('app:openPath', d)}>
                  <Icon name="folder" size={15} />
                </button>
                <button className="icon-btn sm" title="Убрать" onClick={() => void update({ allowedDirs: settings.allowedDirs.filter((x) => x !== d) }).then(() => setVersion((x) => x + 1))}>
                  <Icon name="x" size={15} />
                </button>
              </Row>
            ))}
            <Row title="Добавить папку" sub="Модель увидит только содержимое этих папок">
              <button className="btn sm secondary" onClick={() => void addDir()}>
                <Icon name="folder" size={14} /> Выбрать…
              </button>
            </Row>
            <Row title="Выполнение команд" sub="Инструмент pc_shell_exec: команды из списка ниже (пустой список — любые), каждый запуск с подтверждением">
              <Toggle on={settings.shellEnabled} onChange={(v) => void update({ shellEnabled: v }).then(() => setVersion((x) => x + 1))} />
            </Row>
            {settings.shellEnabled ? (
              <div className="sub-pad" style={{ borderTop: '1px solid var(--border)' }}>
                <div className="field" style={{ margin: 0 }}>
                  <label>Разрешённые команды (через запятую)</label>
                  <input
                    className="mono"
                    value={shellAllow}
                    onChange={(e) => setShellAllow(e.target.value)}
                    onBlur={() =>
                      void update({
                        shellAllow: shellAllow
                          .split(',')
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                </div>
              </div>
            ) : null}
            <div className="row click" onClick={() => setOpen(open === PC ? null : PC)}>
              <div className="grow">Инструменты компьютера: разрешения</div>
              <Icon name={open === PC ? 'down' : 'right'} size={14} />
            </div>
            {open === PC ? <ToolList serverId={PC} version={version} /> : null}
          </>
        ) : null}
      </Section>

      <div className="section-title inline" style={{ justifyContent: 'space-between' }}>
        <span>MCP-серверы</span>
      </div>
      <div className="section">
        {defs.length === 0 && form !== 'new' ? <div className="sub-pad" style={{ color: 'var(--muted)' }}>Серверов пока нет. Добавьте свой или импортируйте из Claude Desktop.</div> : null}
        {defs.map((d) => {
          const st = statusText(status.find((s) => s.id === d.id));
          return (
            <div key={d.id}>
              <div className="row">
                <span className={`dot ${st.dot}`} />
                <div className="grow" style={{ cursor: 'pointer' }} onClick={() => setOpen(open === d.id ? null : d.id)}>
                  <div style={{ fontWeight: 600 }}>
                    {d.name} <span className="badge">{d.type === 'stdio' ? 'локальный' : 'HTTP'}</span>
                  </div>
                  <div className="sub" style={{ color: st.dot === 'err' ? 'var(--danger)' : undefined }}>
                    {st.text}
                  </div>
                </div>
                <button className="icon-btn sm" title="Перезапустить" onClick={() => void api.invoke('mcp:restart', d.id).then(reload)}>
                  <Icon name="refresh" size={15} />
                </button>
                <button className="icon-btn sm" title="Изменить" onClick={() => setForm(d)}>
                  <Icon name="edit" size={15} />
                </button>
                <button
                  className="icon-btn sm"
                  title="Удалить"
                  onClick={async () => {
                    if (!window.confirm(`Удалить MCP-сервер «${d.name}»?`)) return;
                    await api.invoke('mcp:remove', d.id);
                    void reload();
                  }}
                >
                  <Icon name="trash" size={15} />
                </button>
                <Toggle on={d.enabled} onChange={(v) => void api.invoke('mcp:upsert', { ...d, enabled: v }).then(reload)} />
              </div>
              {form !== 'new' && form?.id === d.id ? (
                <ServerForm
                  initial={d}
                  onDone={() => {
                    setForm(null);
                    void reload();
                  }}
                />
              ) : null}
              {open === d.id ? <ToolList serverId={d.id} version={version} /> : null}
            </div>
          );
        })}
        {form === 'new' ? (
          <div style={{ borderTop: defs.length ? '1px solid var(--border)' : undefined }}>
            <ServerForm
              onDone={() => {
                setForm(null);
                void reload();
              }}
            />
          </div>
        ) : null}
      </div>
      <div className="inline">
        <button className="btn sm" onClick={() => setForm('new')}>
          <Icon name="plus" size={14} /> Добавить сервер
        </button>
        <button
          className="btn sm secondary"
          onClick={async () => {
            setMsg(null);
            try {
              const added = await api.invoke<string[]>('mcp:importClaude');
              setMsg(added.length ? `Импортировано: ${added.join(', ')}` : 'Новых серверов не найдено');
              void reload();
            } catch (e) {
              setMsg(errMsg(e));
            }
          }}
        >
          <Icon name="download" size={14} /> Импорт из Claude Desktop
        </button>
        <button className="btn sm ghost" onClick={() => api.open('https://github.com/modelcontextprotocol/servers')}>
          <Icon name="external" size={14} /> Каталог серверов
        </button>
      </div>
      {msg ? <p style={{ color: 'var(--muted)' }}>{msg}</p> : null}
    </div>
  );
}

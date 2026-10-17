import { useEffect, useState } from 'react';
import type { UpdateInfo } from '../../shared/types';
import { api } from '../api';
import { Icon } from '../components/Icon';
import { errMsg, Row, Section } from '../ui';

export function About() {
  const [version, setVersion] = useState('');
  const [state, setState] = useState<{ busy: boolean; update?: UpdateInfo | null; error?: string }>({ busy: false });
  useEffect(() => {
    void api.invoke<string>('app:version').then(setVersion);
  }, []);
  const check = async () => {
    setState({ busy: true });
    try {
      setState({ busy: false, update: await api.invoke<UpdateInfo | null>('app:checkUpdate') });
    } catch (e) {
      setState({ busy: false, error: errMsg(e) });
    }
  };
  return (
    <div className="pane-inner">
      <h2>О программе</h2>
      <p className="lead">Nexus — настольный ИИ-ассистент: любые модели по API, MCP-инструменты, учёт расходов и связь с телефоном.</p>
      <Section>
        <Row title="Версия" sub={`Nexus Desktop ${version} · ${window.nexus.platform}`}>
          <button className="btn sm secondary" disabled={state.busy} onClick={() => void check()}>
            {state.busy ? <span className="spin" /> : <Icon name="refresh" size={14} />} Проверить обновления
          </button>
        </Row>
        {state.update === null ? <Row title="Установлена последняя версия" /> : null}
        {state.update ? (
          <Row title={`Доступна версия ${state.update.version}`} sub={state.update.notes.split('\n')[0]}>
            <button className="btn sm" onClick={() => api.open(state.update!.url)}>
              <Icon name="download" size={14} /> Скачать
            </button>
          </Row>
        ) : null}
        {state.error ? <Row title={<span className="err">Не удалось проверить: {state.error}</span>} /> : null}
      </Section>
      <Section title="Горячие клавиши">
        <Row title="Новый чат">
          <span className="kbd">Ctrl+N</span>
        </Row>
        <Row title="Поиск по чатам">
          <span className="kbd">Ctrl+K</span>
        </Row>
        <Row title="Настройки">
          <span className="kbd">Ctrl+,</span>
        </Row>
        <Row title="Остановить генерацию">
          <span className="kbd">Esc</span>
        </Row>
        <Row title="Скрыть/показать панель">
          <span className="kbd">Ctrl+B</span>
        </Row>
      </Section>
      <Section title="Ссылки">
        <Row title="Исходный код и релизы" sub="github.com/Rentw1/rers" onClick={() => api.open('https://github.com/Rentw1/rers')}>
          <Icon name="external" size={15} />
        </Row>
        <Row title="Model Context Protocol" sub="modelcontextprotocol.io" onClick={() => api.open('https://modelcontextprotocol.io')}>
          <Icon name="external" size={15} />
        </Row>
      </Section>
    </div>
  );
}

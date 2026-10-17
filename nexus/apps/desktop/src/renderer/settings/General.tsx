import { useEffect, useState } from 'react';
import type { Settings } from '../../shared/types';
import { api } from '../api';
import { Row, Section, Toggle } from '../ui';

export function General({ settings, update, defaultModelLabel, onPickDefault }: { settings: Settings; update: (p: Partial<Settings>) => Promise<void>; defaultModelLabel: string; onPickDefault: () => void }) {
  const [instructions, setInstructions] = useState(settings.customInstructions);
  const [temp, setTemp] = useState(settings.temperature === null ? '' : String(settings.temperature));
  const [maxOut, setMaxOut] = useState(settings.maxOutputTokens === null ? '' : String(settings.maxOutputTokens));
  const [dataDir, setDataDir] = useState('');

  useEffect(() => {
    void api.invoke<string>('app:dataDir').then(setDataDir);
  }, []);

  const saveTemp = () => {
    const v = temp.trim() === '' ? null : Number(temp.replace(',', '.'));
    if (v !== null && (!Number.isFinite(v) || v < 0 || v > 2)) {
      setTemp(settings.temperature === null ? '' : String(settings.temperature));
      return;
    }
    void update({ temperature: v });
  };
  const saveMax = () => {
    const v = maxOut.trim() === '' ? null : Math.round(Number(maxOut));
    if (v !== null && (!Number.isFinite(v) || v < 1 || v > 1_000_000)) {
      setMaxOut(settings.maxOutputTokens === null ? '' : String(settings.maxOutputTokens));
      return;
    }
    void update({ maxOutputTokens: v });
  };

  return (
    <div className="pane-inner">
      <h2>Общие</h2>
      <p className="lead">Внешний вид, модель по умолчанию и поведение чата.</p>
      <Section title="Внешний вид">
        <Row title="Тема">
          <select value={settings.theme} onChange={(e) => void update({ theme: e.target.value as Settings['theme'] })} className="field-select">
            <option value="system">Как в системе</option>
            <option value="light">Светлая</option>
            <option value="dark">Тёмная</option>
          </select>
        </Row>
        <Row title="Валюта расходов" sub={settings.fx ? `Курс: 1 $ = ${settings.fx.RUB.toFixed(2)} ₽ = ${settings.fx.EUR.toFixed(3)} €` : 'Курс загрузится при подключении к интернету'}>
          <select value={settings.currency} onChange={(e) => void update({ currency: e.target.value as Settings['currency'] })} className="field-select">
            <option value="USD">USD $</option>
            <option value="RUB">RUB ₽</option>
            <option value="EUR">EUR €</option>
          </select>
        </Row>
      </Section>
      <Section title="Чат">
        <Row title="Модель по умолчанию" sub={defaultModelLabel}>
          <button className="btn sm secondary" onClick={onPickDefault}>
            Изменить
          </button>
        </Row>
        <Row title="Отправка по Enter" sub={settings.sendOnEnter ? 'Shift+Enter — новая строка' : 'Ctrl+Enter — отправить'}>
          <Toggle on={settings.sendOnEnter} onChange={(v) => void update({ sendOnEnter: v })} />
        </Row>
        <Row title="Показывать размышления модели" sub="Для моделей с режимом рассуждений (DeepSeek R1, o-серия, Claude thinking)">
          <Toggle on={settings.showReasoning} onChange={(v) => void update({ showReasoning: v })} />
        </Row>
        <Row title="Показывать стоимость ответов">
          <Toggle on={settings.showCost} onChange={(v) => void update({ showCost: v })} />
        </Row>
        <Row title="Автоназвание чатов" sub="Короткий дополнительный запрос к модели после первого ответа">
          <Toggle on={settings.autoTitle} onChange={(v) => void update({ autoTitle: v })} />
        </Row>
      </Section>
      <Section title="Инструкции для модели">
        <div className="sub-pad">
          <div className="field" style={{ margin: 0 }}>
            <textarea rows={5} value={instructions} placeholder="Например: отвечай кратко, по-русски; я разработчик на TypeScript." onChange={(e) => setInstructions(e.target.value)} onBlur={() => instructions !== settings.customInstructions && void update({ customInstructions: instructions })} />
            <span className="hint2">Добавляются к системному промпту каждого чата.</span>
          </div>
        </div>
      </Section>
      <Section title="Параметры генерации">
        <div className="sub-pad grid2">
          <div className="field">
            <label>Температура (0–2)</label>
            <input value={temp} placeholder="по умолчанию модели" onChange={(e) => setTemp(e.target.value)} onBlur={saveTemp} />
          </div>
          <div className="field">
            <label>Макс. токенов ответа</label>
            <input value={maxOut} placeholder="по умолчанию модели" onChange={(e) => setMaxOut(e.target.value.replace(/\D/g, ''))} onBlur={saveMax} />
          </div>
        </div>
      </Section>
      <Section title="Данные">
        <Row title="Папка данных" sub={<span className="mono">{dataDir}</span>}>
          <button className="btn sm secondary" onClick={() => void api.invoke('app:openPath', dataDir)}>
            Открыть
          </button>
        </Row>
        <Row title="Хранение" sub="Чаты, настройки и статистика хранятся только на этом компьютере. API-ключи зашифрованы средствами ОС." />
      </Section>
    </div>
  );
}

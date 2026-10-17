import { useEffect, useRef, useState } from 'react';
import type { Attachment } from '../../shared/types';
import { api } from '../api';
import { readFileAsAttachment } from '../util';
import { Icon } from './Icon';

export function Composer({ running, sendOnEnter, modelLabel, onModel, onSend, onStop, focusKey }: { running: boolean; sendOnEnter: boolean; modelLabel: string; onModel: () => void; onSend: (text: string, atts: Attachment[]) => Promise<boolean>; onStop: () => void; focusKey: string }) {
  const [text, setText] = useState('');
  const [atts, setAtts] = useState<Attachment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const ta = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    ta.current?.focus();
  }, [focusKey]);

  useEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 260)}px`;
  }, [text]);

  const addFiles = async (files: File[]) => {
    setError(null);
    try {
      const list = await Promise.all(files.map(readFileAsAttachment));
      setAtts((a) => [...a, ...list].slice(0, 10));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const send = async () => {
    if (running) return onStop();
    if (!text.trim() && !atts.length) return;
    const t = text;
    const a = atts;
    setText('');
    setAtts([]);
    if (!(await onSend(t, a))) {
      setText(t);
      setAtts(a);
    }
  };

  const canSend = running || !!text.trim() || atts.length > 0;
  return (
    <div
      className="composer-wrap"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        void addFiles([...e.dataTransfer.files]);
      }}
    >
      <div className="composer">
        {atts.length ? (
          <div className="atts">
            {atts.map((a, i) => (
              <div key={i} className="att">
                {a.kind === 'image' ? <img src={`data:${a.mediaType};base64,${a.data}`} alt="" /> : <div className="file">📎 {a.name}</div>}
                <button className="x" onClick={() => setAtts(atts.filter((_, j) => j !== i))}>
                  ✕
                </button>
              </div>
            ))}
          </div>
        ) : null}
        <textarea
          ref={ta}
          rows={1}
          value={text}
          placeholder="Напишите сообщение…"
          onChange={(e) => setText(e.target.value)}
          onPaste={(e) => {
            const files = [...e.clipboardData.files];
            if (files.length) {
              e.preventDefault();
              void addFiles(files);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing && (sendOnEnter ? !e.shiftKey : e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <div className="composer-row">
          <button
            className="icon-btn"
            title="Прикрепить файл"
            onClick={async () => {
              setError(null);
              try {
                const list = await api.invoke<Attachment[]>('files:pick');
                setAtts((a) => [...a, ...list].slice(0, 10));
              } catch (e) {
                setError((e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
              }
            }}
          >
            <Icon name="clip" />
          </button>
          <button className="model-btn" onClick={onModel} title="Выбрать модель">
            {modelLabel} ▾
          </button>
          <div style={{ flex: 1 }} />
          {error ? <small className="err">{error}</small> : null}
          <button className="send" disabled={!canSend} onClick={() => void send()} title={running ? 'Остановить' : 'Отправить'}>
            <Icon name={running ? 'stop' : 'up'} />
          </button>
        </div>
      </div>
      <div className="hint">
        {sendOnEnter ? (
          <>
            <span className="kbd">Enter</span> — отправить, <span className="kbd">Shift+Enter</span> — новая строка
          </>
        ) : (
          <>
            <span className="kbd">Ctrl+Enter</span> — отправить
          </>
        )}{' '}
        · можно перетащить или вставить файлы и изображения
      </div>
    </div>
  );
}

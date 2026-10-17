import { useState } from 'react';
import type { Block, ToolResultBlock } from '@nexus/core';
import type { ApprovalRequest, LiveBlock } from '../../shared/types';
import { useDecide } from '../ui';
import { Icon } from './Icon';
import { Markdown } from './Markdown';

export type ToolState = { status: 'running' | 'done' | 'error'; result?: ToolResultBlock };

export function toolLabel(name: string): { server: string; title: string } {
  if (name.startsWith('pc_')) return { server: 'Компьютер', title: name.slice(3).replace(/_/g, ' ') };
  const i = name.indexOf('__');
  if (i > 0) return { server: name.slice(0, i).replace(/_/g, ' '), title: name.slice(i + 2).replace(/_/g, ' ') };
  return { server: 'MCP', title: name.replace(/_/g, ' ') };
}

export function Reasoning({ text, live }: { text: string; live?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="reasoning">
      <button onClick={() => setOpen(!open)}>
        <Icon name="bulb" size={14} /> {live ? 'Размышляет…' : 'Размышления'} {live ? <span className="spin" /> : null} <Icon name={open ? 'down' : 'right'} size={12} />
      </button>
      {open ? <div className="body">{text.trim() || '…'}</div> : null}
    </div>
  );
}

function pretty(v: unknown, fallback?: string): string {
  if (v === undefined && fallback !== undefined) return fallback;
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

export function ToolCard({ id, name, input, argsText, result, state, approval }: { id: string; name: string; input?: Record<string, unknown>; argsText?: string; result?: ToolResultBlock; state?: ToolState; approval?: ApprovalRequest }) {
  const [open, setOpen] = useState(false);
  const decide = useDecide();
  const res = result ?? state?.result;
  const status = approval ? 'awaiting' : res ? (res.isError ? 'error' : 'done') : state?.status === 'running' ? 'running' : argsText !== undefined ? 'preparing' : 'done';
  const { server, title } = toolLabel(name);
  const statusText = { awaiting: 'ждёт разрешения', running: 'выполняется…', preparing: 'готовит вызов…', done: '', error: res?.content === 'Пользователь отклонил вызов инструмента' ? 'отклонено' : 'ошибка' }[status];
  return (
    <div className={`tool${status === 'awaiting' ? ' awaiting' : ''}`}>
      <div className="tool-head" onClick={() => setOpen(!open)}>
        <Icon name={server === 'Компьютер' ? 'monitor' : 'wrench'} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="name">{title}</div>
          <div className="sub">
            {server}
            {statusText ? ` · ${statusText}` : ''}
          </div>
        </div>
        {status === 'running' || status === 'preparing' ? <span className="spin" /> : <Icon name={status === 'error' ? 'alert' : status === 'awaiting' ? 'info' : 'check'} className={status === 'error' ? 'err' : ''} />}
        <Icon name={open ? 'down' : 'right'} size={14} />
      </div>
      {approval ? (
        <div className="tool-approve">
          <pre>{pretty(approval.args)}</pre>
          {approval.destructive ? <small style={{ color: 'var(--warning)' }}>Инструмент может изменить данные или выполнить действие на компьютере.</small> : null}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn sm" onClick={() => decide(id, 'once')}>
              <Icon name="check" size={14} /> Разрешить
            </button>
            <button className="btn sm secondary" onClick={() => decide(id, 'always')}>
              Всегда
            </button>
            <button className="btn sm ghost" onClick={() => decide(id, 'deny')}>
              Отклонить
            </button>
          </div>
        </div>
      ) : null}
      {open && !approval ? (
        <div className="tool-body">
          <b>Аргументы</b>
          {'\n'}
          {pretty(input, argsText)}
          {res ? (
            <>
              {'\n\n'}
              <b>Результат</b>
              {'\n'}
              <span className={res.isError ? 'err' : ''}>{res.content}</span>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function AssistantBlocks({ blocks, results, tools, approvals, showReasoning }: { blocks: Block[]; results: Map<string, ToolResultBlock>; tools: Record<string, ToolState>; approvals: Record<string, ApprovalRequest>; showReasoning: boolean }) {
  return (
    <>
      {blocks.map((b, i) => {
        if (b.type === 'reasoning') return showReasoning ? <Reasoning key={i} text={b.text} /> : null;
        if (b.type === 'text') return <Markdown key={i} text={b.text} />;
        if (b.type === 'tool_call') return <ToolCard key={b.id} id={b.id} name={b.name} input={b.input} result={results.get(b.id)} state={tools[b.id]} approval={approvals[b.id]} />;
        return null;
      })}
    </>
  );
}

export function LiveBlocks({ blocks, tools, approvals, showReasoning }: { blocks: LiveBlock[]; tools: Record<string, ToolState>; approvals: Record<string, ApprovalRequest>; showReasoning: boolean }) {
  if (!blocks.length) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)' }}>
        <span className="spin" /> Думает…
      </div>
    );
  }
  return (
    <>
      {blocks.map((b, i) => {
        if (b.type === 'reasoning') return showReasoning ? <Reasoning key={i} text={b.text} live={i === blocks.length - 1} /> : null;
        if (b.type === 'text') return <Markdown key={i} text={b.text} streaming={i === blocks.length - 1} />;
        return <ToolCard key={b.id} id={b.id} name={b.name} argsText={b.argsText} state={tools[b.id]} approval={approvals[b.id]} />;
      })}
    </>
  );
}

export function UserMessage({ blocks }: { blocks: Block[] }) {
  const text = blocks
    .filter((b) => b.type === 'text')
    .map((b) => (b as { text: string }).text)
    .join('\n');
  const files = [...text.matchAll(/<file name="([^"]+)">/g)].map((m) => m[1]);
  const visible = text.replace(/<file name="[^"]+">[\s\S]*?<\/file>\s*/g, '').trim();
  const images = blocks.filter((b): b is Extract<Block, { type: 'image' }> => b.type === 'image');
  return (
    <>
      {images.length || files.length ? (
        <div className="attach-row">
          {images.map((img, i) => (
            <img key={i} src={`data:${img.mediaType};base64,${img.data}`} alt="" />
          ))}
          {files.map((f, i) => (
            <span key={i} className="file-pill">
              📎 {f}
            </span>
          ))}
        </div>
      ) : null}
      {visible ? <div className="bubble">{visible}</div> : null}
    </>
  );
}

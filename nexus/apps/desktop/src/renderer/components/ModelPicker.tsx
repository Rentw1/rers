import { useEffect, useMemo, useState } from 'react';
import type { ModelRow, ProviderRow } from '../../shared/types';
import { api } from '../api';
import { tokens } from '../util';
import { Icon } from './Icon';

export function priceLabel(p: ModelRow['price']): string {
  if (!p) return 'цена неизвестна';
  if (p.input === 0 && p.output === 0) return 'бесплатно';
  const f = (n: number) => (n < 1 ? n.toFixed(n < 0.1 ? 3 : 2) : n.toFixed(2));
  return `$${f(p.input)} / $${f(p.output)} за 1M`;
}

export function ModelPicker({ current, onSelect, onClose, onManage }: { current: { providerId: string; modelId: string }; onSelect: (providerId: string, modelId: string) => void; onClose: () => void; onManage: () => void }) {
  const [groups, setGroups] = useState<{ provider: ProviderRow; models: ModelRow[] }[]>([]);
  const [q, setQ] = useState('');
  useEffect(() => {
    void api.invoke<{ provider: ProviderRow; models: ModelRow[] }[]>('models:groups').then(setGroups);
  }, []);
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return groups.map((g) => ({ ...g, models: g.models.filter((m) => !s || `${g.provider.name} ${m.id} ${m.name}`.toLowerCase().includes(s)) })).filter((g) => g.models.length);
  }, [groups, q]);
  return (
    <div className="modal-back" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Выбор модели</h3>
          <button className="icon-btn" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <div className="modal-body">
          <div className="search" style={{ margin: '0 0 10px' }}>
            <Icon name="search" size={16} />
            <input autoFocus placeholder="Поиск моделей" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 20 }}>
              <p>Нет доступных моделей. Добавьте API-ключ провайдера.</p>
              <button className="btn" onClick={onManage}>
                Провайдеры
              </button>
            </div>
          ) : (
            filtered.map((g) => (
              <div key={g.provider.id}>
                <div className="group-title">{g.provider.name}</div>
                {g.models.map((m) => {
                  const sel = m.providerId === current.providerId && m.id === current.modelId;
                  return (
                    <div
                      key={m.id}
                      className={`picker-item${sel ? ' sel' : ''}`}
                      onClick={() => {
                        onSelect(m.providerId, m.id);
                        onClose();
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600 }}>
                          {m.favorite ? '★ ' : ''}
                          {m.name}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                          {m.id !== m.name ? `${m.id} · ` : ''}
                          {m.contextWindow ? `${tokens(m.contextWindow)} контекст · ` : ''}
                          {priceLabel(m.price)}
                        </div>
                        <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                          {m.reasoning ? <span className="badge accent">рассуждения</span> : null}
                          {m.vision ? <span className="badge">изображения</span> : null}
                          {m.tools !== false ? <span className="badge">инструменты</span> : <span className="badge warn">без инструментов</span>}
                        </div>
                      </div>
                      {sel ? <Icon name="check" /> : null}
                    </div>
                  );
                })}
              </div>
            ))
          )}
          <button className="btn ghost" style={{ marginTop: 10 }} onClick={onManage}>
            <Icon name="settings" size={15} /> Провайдеры и модели
          </button>
        </div>
      </div>
    </div>
  );
}

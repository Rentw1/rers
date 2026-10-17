import { formatMoney } from '@nexus/core';
import type { Chat, Settings } from '../shared/types';

export function money(micro: number, s: Settings | null): string {
  if (!s || s.currency === 'USD' || !s.fx) return formatMoney(micro, 'USD', 1);
  return formatMoney(micro, s.currency, s.fx[s.currency]);
}

export function tokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}K`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

export function groupChats(chats: Chat[]): { title: string; chats: Chat[] }[] {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const today = d.getTime();
  const groups: { title: string; chats: Chat[] }[] = [
    { title: 'Закреплённые', chats: [] },
    { title: 'Сегодня', chats: [] },
    { title: 'Вчера', chats: [] },
    { title: 'На этой неделе', chats: [] },
    { title: 'Ранее', chats: [] },
  ];
  for (const c of chats) {
    const g = c.pinned ? 0 : c.updatedAt >= today ? 1 : c.updatedAt >= today - 86_400_000 ? 2 : c.updatedAt >= today - 7 * 86_400_000 ? 3 : 4;
    groups[g]!.chats.push(c);
  }
  return groups.filter((g) => g.chats.length);
}

export function relTime(ts: number): string {
  const d = Date.now() - ts;
  if (d < 60_000) return 'сейчас';
  if (d < 3_600_000) return `${Math.floor(d / 60_000)} мин назад`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)} ч назад`;
  return new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

export function readFileAsAttachment(f: File): Promise<{ kind: 'image' | 'text'; name: string; mediaType: string; data: string }> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    const isImage = f.type.startsWith('image/');
    if (isImage && f.size > 5_000_000) return reject(new Error(`${f.name}: изображение больше 5 МБ`));
    if (!isImage && f.size > 1_000_000) return reject(new Error(`${f.name}: файл больше 1 МБ`));
    r.onerror = () => reject(r.error ?? new Error('Не удалось прочитать файл'));
    r.onload = () => {
      if (isImage) resolve({ kind: 'image', name: f.name || 'image.png', mediaType: f.type, data: String(r.result).split(',')[1] ?? '' });
      else {
        const text = String(r.result);
        if (text.includes('\u0000')) reject(new Error(`${f.name}: бинарный файл не поддерживается`));
        else resolve({ kind: 'text', name: f.name, mediaType: f.type || 'text/plain', data: text });
      }
    };
    if (isImage) r.readAsDataURL(f);
    else r.readAsText(f);
  });
}

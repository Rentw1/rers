import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { JsonDoc, Store } from '../src/main/store';

const tmp = () => mkdtempSync(join(tmpdir(), 'nexus-store-'));

describe('store', () => {
  it('persists documents atomically and reloads them', () => {
    const dir = tmp();
    const doc = new JsonDoc<{ n: number }>(join(dir, 'a.json'), { n: 0 });
    doc.update((v) => ({ n: v.n + 2 }));
    doc.flush();
    expect(new JsonDoc(join(dir, 'a.json'), { n: 0 }).get()).toEqual({ n: 2 });
    expect(readdirSync(dir).filter((f) => f.endsWith('.tmp'))).toHaveLength(0);
  });

  it('keeps a corrupt file aside and falls back', () => {
    const dir = tmp();
    writeFileSync(join(dir, 'b.json'), '{broken');
    const doc = new JsonDoc(join(dir, 'b.json'), [1]);
    expect(doc.get()).toEqual([1]);
    expect(readdirSync(dir).some((f) => f.startsWith('b.json.corrupt-'))).toBe(true);
  });

  it('merges new default settings into old files', () => {
    const dir = tmp();
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({ theme: 'dark' }));
    const s = new Store(dir, '/home/x').settings.get();
    expect(s.theme).toBe('dark');
    expect(s.relayPort).toBeGreaterThan(0);
    expect(typeof s.sendOnEnter).toBe('boolean');
  });

  it('stores messages per chat and deletes them', () => {
    const dir = tmp();
    const store = new Store(dir, '/home/x');
    store.chats.set([{ id: 'c-1', title: 't', providerId: 'p', modelId: 'm', activeLeafId: null, pinned: false, createdAt: 1, updatedAt: 1 }]);
    store.messages('c-1').set([{ id: 'm1', chatId: 'c-1', parentId: null, role: 'user', blocks: [{ type: 'text', text: 'hi' }], raw: null, providerId: null, modelId: null, stopReason: null, createdAt: 1 }]);
    store.flushAll();
    const file = join(dir, 'chats', 'c-1.json');
    expect(JSON.parse(readFileSync(file, 'utf8'))).toHaveLength(1);
    store.deleteChat('c-1');
    expect(existsSync(file)).toBe(false);
    expect(store.chats.get()).toHaveLength(0);
    expect(() => store.messages('../evil')).toThrow();
  });
});

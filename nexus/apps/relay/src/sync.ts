import { join } from 'node:path';
import { mergeLww, type SyncChat, type SyncMessage, type SyncRequest, type SyncResponse } from '@nexus/core';
import { DATA_DIR, readJson, writeJsonAtomic } from './config';

interface SyncFile {
  chats: (SyncChat & { serverTs: number })[];
  messages: (SyncMessage & { serverTs: number })[];
}

/** Stores chats from all paired devices on the PC; last write wins, `serverTs` drives incremental pulls. */
export class SyncStore {
  private readonly path: string;
  private readonly chats = new Map<string, SyncChat & { serverTs: number }>();
  private readonly messages = new Map<string, SyncMessage & { serverTs: number }>();
  private clock = 0;
  private saveTimer: NodeJS.Timeout | undefined;

  constructor(dir = DATA_DIR) {
    this.path = join(dir, 'sync.json');
    const f = readJson<SyncFile>(this.path, { chats: [], messages: [] });
    for (const c of f.chats) this.chats.set(c.id, c);
    for (const m of f.messages) this.messages.set(m.id, m);
    for (const x of [...f.chats, ...f.messages]) this.clock = Math.max(this.clock, x.serverTs);
  }

  private tick(): number {
    this.clock = Math.max(this.clock + 1, Date.now());
    return this.clock;
  }

  apply(req: SyncRequest): SyncResponse {
    const ts = this.tick();
    const changedChats = mergeLww(this.chats, req.chats.map((c) => ({ ...c, serverTs: ts })));
    const changedMsgs = mergeLww(this.messages, req.messages.map((m) => ({ ...m, serverTs: ts })));
    if (changedChats.length || changedMsgs.length) this.scheduleSave();
    const pushedChats = new Set(req.chats.map((c) => `${c.id}:${c.updatedAt}`));
    const pushedMsgs = new Set(req.messages.map((m) => `${m.id}:${m.updatedAt}`));
    const strip = <T extends { serverTs: number }>({ serverTs: _s, ...rest }: T) => rest;
    return {
      now: ts,
      chats: [...this.chats.values()].filter((c) => c.serverTs > req.since && !pushedChats.has(`${c.id}:${c.updatedAt}`)).map(strip),
      messages: [...this.messages.values()].filter((m) => m.serverTs > req.since && !pushedMsgs.has(`${m.id}:${m.updatedAt}`)).map(strip),
    };
  }

  summary(): { id: string; title: string; updatedAt: number; messages: number }[] {
    const counts = new Map<string, number>();
    for (const m of this.messages.values()) if (!m.deleted) counts.set(m.chatId, (counts.get(m.chatId) ?? 0) + 1);
    return [...this.chats.values()]
      .filter((c) => !c.deleted)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((c) => ({ id: c.id, title: c.title, updatedAt: c.updatedAt, messages: counts.get(c.id) ?? 0 }));
  }

  transcript(chatId: string): { role: string; text: string; createdAt: number }[] {
    return [...this.messages.values()]
      .filter((m) => m.chatId === chatId && !m.deleted)
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((m) => {
        let t = '';
        try {
          const blocks = JSON.parse(m.blocks) as { type: string; text?: string; name?: string; content?: string }[];
          t = blocks.map((b) => (b.type === 'text' ? b.text : b.type === 'tool_call' ? `🔧 ${b.name}` : b.type === 'tool_result' ? `↳ ${(b.content ?? '').slice(0, 200)}` : '')).filter(Boolean).join('\n');
        } catch {
          t = m.blocks;
        }
        return { role: m.role, text: t, createdAt: m.createdAt };
      });
  }

  private scheduleSave(): void {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => this.flush(), 500);
  }

  flush(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = undefined;
    writeJsonAtomic(this.path, { chats: [...this.chats.values()], messages: [...this.messages.values()] } satisfies SyncFile);
  }
}

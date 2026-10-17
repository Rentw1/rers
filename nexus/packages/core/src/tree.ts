import type { Block } from './types';

/** Minimal message shape for tree navigation (StoredMessage satisfies it). */
export interface TreeMessage {
  id: string;
  parentId: string | null;
  role: 'user' | 'assistant';
  blocks: Block[];
  createdAt: number;
}

export function pathTo<T extends TreeMessage>(messages: T[], leafId: string | null): T[] {
  if (!leafId) return [];
  const byId = new Map(messages.map((m) => [m.id, m]));
  const out: T[] = [];
  let cur = byId.get(leafId);
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    out.push(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return out.reverse();
}

export const isToolResultMessage = (m: { role: string; blocks: Block[] }) => m.role === 'user' && m.blocks.length > 0 && m.blocks.every((b) => b.type === 'tool_result');

export function siblingsOf<T extends TreeMessage>(messages: T[], m: T): T[] {
  return messages.filter((x) => x.parentId === m.parentId && x.role === m.role && !isToolResultMessage(x)).sort((a, b) => a.createdAt - b.createdAt);
}

/** Deepest descendant following the newest child at each step. */
export function latestLeaf<T extends TreeMessage>(messages: T[], fromId: string): string {
  let cur = fromId;
  for (;;) {
    const kids = messages.filter((m) => m.parentId === cur).sort((a, b) => b.createdAt - a.createdAt);
    if (!kids[0]) return cur;
    cur = kids[0].id;
  }
}


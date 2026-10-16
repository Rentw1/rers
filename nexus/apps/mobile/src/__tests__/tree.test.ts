import { isToolResultMessage, latestLeaf, pathTo, siblingsOf, type TreeMessage } from '../lib/tree';

const msg = (id: string, parentId: string | null, role: 'user' | 'assistant', createdAt: number, toolResult = false): TreeMessage => ({
  id,
  parentId,
  role,
  createdAt,
  blocks: toolResult ? [{ type: 'tool_result', toolCallId: 'c', name: 'n', content: 'ok' }] : [{ type: 'text', text: id }],
});

// u1 → a1 → u2 → a2
//    ↘ a1b (regenerated)    u2 has an edited sibling u2b → a2b
const all = [msg('u1', null, 'user', 1), msg('a1', 'u1', 'assistant', 2), msg('u2', 'a1', 'user', 3), msg('a2', 'u2', 'assistant', 4), msg('a1b', 'u1', 'assistant', 5), msg('u2b', 'a1', 'user', 6), msg('a2b', 'u2b', 'assistant', 7), msg('t1', 'a2', 'user', 8, true)];

describe('message tree', () => {
  it('walks from leaf to root', () => {
    expect(pathTo(all, 'a2').map((m) => m.id)).toEqual(['u1', 'a1', 'u2', 'a2']);
    expect(pathTo(all, null)).toEqual([]);
  });

  it('survives cycles', () => {
    const cyc = [msg('x', 'y', 'user', 1), msg('y', 'x', 'assistant', 2)];
    expect(pathTo(cyc, 'x').length).toBe(2);
  });

  it('finds siblings in creation order, ignoring tool results', () => {
    expect(siblingsOf(all, all[1]!).map((m) => m.id)).toEqual(['a1', 'a1b']);
    expect(siblingsOf(all, all[2]!).map((m) => m.id)).toEqual(['u2', 'u2b']);
    expect(isToolResultMessage(all[7]!)).toBe(true);
  });

  it('follows the newest child to the deepest leaf', () => {
    expect(latestLeaf(all, 'a1')).toBe('a2b');
    expect(latestLeaf(all, 'a2')).toBe('t1');
    expect(latestLeaf(all, 'a1b')).toBe('a1b');
  });
});

import { describe, expect, it } from 'vitest';
import { trimHistory, type ChatMessage } from '../src';

const user = (t: string): ChatMessage => ({ role: 'user', blocks: [{ type: 'text', text: t }] });
const asst = (t: string): ChatMessage => ({ role: 'assistant', blocks: [{ type: 'text', text: t }] });
const call = (id: string): ChatMessage => ({ role: 'assistant', blocks: [{ type: 'tool_call', id, name: 'x', input: {} }] });
const result = (id: string): ChatMessage => ({ role: 'user', blocks: [{ type: 'tool_result', toolCallId: id, name: 'x', content: 'r'.repeat(400) }] });

describe('trimHistory', () => {
  const big = 'a'.repeat(4000);
  const history = [user(big), call('c1'), result('c1'), asst(big), user(big), asst(big), user('last')];

  it('keeps everything that fits', () => {
    expect(trimHistory(history, 1_000_000).dropped).toBe(0);
  });

  it('drops whole oldest turns and never splits tool pairs', () => {
    const r = trimHistory(history, 2100);
    expect(r.dropped).toBe(4);
    expect(r.messages[0]).toEqual(user(big));
    const tight = trimHistory(history, 10);
    expect(tight.messages).toEqual([user('last')]);
    expect(tight.messages.some((m) => m.blocks.some((b) => b.type === 'tool_result'))).toBe(false);
  });
});

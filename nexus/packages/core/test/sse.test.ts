import { describe, expect, it } from 'vitest';
import { parseSSE, lines } from '../src/sse';
import { collect } from './helpers';

async function* from(parts: string[]) {
  for (const p of parts) yield new TextEncoder().encode(p);
}

describe('sse', () => {
  it('parses events split across arbitrary chunks and CRLF', async () => {
    const msgs = await collect(parseSSE(from(['event: a\r', '\ndata: {"x":', '1}\r\n\r\n: comment\n', 'data: line1\ndata: line2\n\n', 'data: tail'])));
    expect(msgs).toEqual([
      { event: 'a', data: '{"x":1}', id: undefined },
      { event: 'message', data: 'line1\nline2', id: undefined },
      { event: 'message', data: 'tail', id: undefined },
    ]);
  });

  it('decodes multi-byte UTF-8 split between chunks', async () => {
    const bytes = new TextEncoder().encode('привет\n');
    async function* split() {
      yield bytes.slice(0, 3);
      yield bytes.slice(3);
    }
    expect(await collect(lines(split()))).toEqual(['привет']);
  });
});

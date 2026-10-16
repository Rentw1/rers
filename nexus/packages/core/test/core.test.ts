import { describe, expect, it } from 'vitest';
import {
  PriceBook,
  costMicroUsd,
  formatMoney,
  pricesFromOpenRouter,
  ToolRegistry,
  validateInput,
  runAgent,
  emptyUsage,
  isPrivateHost,
  checkUrlSecurity,
  encodePairingUri,
  decodePairingUri,
  mergeLww,
  base64UrlFromBytes,
  base64UrlToBytes,
  type LLMProvider,
  type StreamEvent,
  type AgentEvent,
} from '../src';

describe('pricing', () => {
  it('computes micro-USD with cache rates', () => {
    const book = new PriceBook();
    const p = book.find('deepseek', 'deepseek-chat');
    expect(p).toBeDefined();
    const cost = costMicroUsd({ ...emptyUsage(), inputTokens: 1_000_000, cacheReadTokens: 1_000_000, outputTokens: 1_000_000 }, p);
    expect(cost).toBe(Math.round(0.28e6 + 0.028e6 + 0.42e6));
  });

  it('matches dated snapshots and ranks user overrides above seeds', () => {
    const book = new PriceBook();
    expect(book.find('openai', 'gpt-4o-2024-08-06')?.modelId).toBe('gpt-4o');
    book.add({ providerId: 'openai', modelId: 'gpt-4o', input: 1, output: 2, source: 'user', updatedAt: 'x' });
    expect(book.find('openai', 'gpt-4o')?.input).toBe(1);
    book.add({ providerId: 'openai', modelId: 'gpt-4o', input: 9, output: 9, source: 'openrouter', updatedAt: 'y' });
    expect(book.find('openai', 'gpt-4o')?.input).toBe(1);
    expect(book.find('ollama', 'llama3')?.input).toBe(0);
  });

  it('maps OpenRouter vendors to native providers', () => {
    const entries = pricesFromOpenRouter([{ id: 'anthropic/claude-sonnet-5.5', name: 'x', pricing: { input: 2, output: 10 } }]);
    const book = new PriceBook([]);
    book.addAll(entries);
    expect(book.find('anthropic', 'claude-sonnet-5-5')?.output).toBe(10);
    expect(book.find('openrouter', 'anthropic/claude-sonnet-5.5')?.input).toBe(2);
  });

  it('formats money', () => {
    expect(formatMoney(700)).toBe('$0.0007');
    expect(formatMoney(1_234_567)).toBe('$1.23');
    expect(formatMoney(1_000_000, 'RUB', 90)).toBe('90.00 ₽');
  });
});

describe('tools', () => {
  it('sanitizes and de-duplicates names', () => {
    const r = new ToolRegistry<string>();
    const a = r.add('my.server', { name: 'read file', description: '', inputSchema: {} }, 'a');
    const b = r.add('my.server', { name: 'read:file', description: '', inputSchema: {} }, 'b');
    expect(a).toBe('my_server__read_file');
    expect(b).toBe('my_server__read_file_2');
    expect(r.resolve(b)?.ref).toBe('b');
    expect(r.specs()[0]!.inputSchema).toEqual({ type: 'object', properties: {} });
  });

  it('validates input', () => {
    const schema = { type: 'object', properties: { n: { type: 'integer' }, mode: { type: 'string', enum: ['a', 'b'] } }, required: ['n'] };
    expect(validateInput(schema, { n: 1, mode: 'a' })).toBeNull();
    expect(validateInput(schema, {})).toMatch(/n/);
    expect(validateInput(schema, { n: 1.5 })).toMatch(/integer/);
    expect(validateInput(schema, { n: 1, mode: 'c' })).toMatch(/одним из/);
    expect(validateInput(schema, { __invalid_json: '{' })).toMatch(/JSON/);
  });
});

function scriptedProvider(turns: Extract<StreamEvent, { type: 'done' }>[]): LLMProvider {
  let i = 0;
  return {
    config: { id: 'fake', kind: 'openai', baseUrl: '', apiKey: '' },
    async *chat() {
      const t = turns[i++]!;
      for (const b of t.message.blocks) if (b.type === 'text') yield { type: 'text', delta: b.text } as StreamEvent;
      yield t;
    },
    async listModels() {
      return [];
    },
  };
}

describe('agent loop', () => {
  it('runs tools until the model finishes and sums usage', async () => {
    const u = { ...emptyUsage(), inputTokens: 10, outputTokens: 5 };
    const provider = scriptedProvider([
      { type: 'done', stopReason: 'tool_use', usage: u, message: { role: 'assistant', blocks: [{ type: 'tool_call', id: 't1', name: 'echo', input: { s: 'hi' } }] } },
      { type: 'done', stopReason: 'end', usage: u, message: { role: 'assistant', blocks: [{ type: 'text', text: 'готово' }] } },
    ]);
    const events: AgentEvent['type'][] = [];
    const res = await runAgent({
      provider,
      model: 'm',
      history: [{ role: 'user', blocks: [{ type: 'text', text: 'go' }] }],
      tools: [{ name: 'echo', description: '', inputSchema: {} }],
      executeTool: async (c) => ({ content: String(c.input.s) }),
      onEvent: (e) => events.push(e.type),
    });
    expect(res.stopReason).toBe('end');
    expect(res.messages).toHaveLength(3);
    expect(res.messages[1]!.blocks[0]).toMatchObject({ type: 'tool_result', toolCallId: 't1', content: 'hi' });
    expect(res.usage.inputTokens).toBe(20);
    expect(events).toContain('tool_end');
  });

  it('keeps partial text on abort', async () => {
    const ctrl = new AbortController();
    const provider: LLMProvider = {
      config: { id: 'f', kind: 'openai', baseUrl: '', apiKey: '' },
      async *chat() {
        yield { type: 'text', delta: 'част' };
        ctrl.abort();
        throw Object.assign(new Error('aborted'), { name: 'AbortError' });
      },
      async listModels() {
        return [];
      },
    };
    const res = await runAgent({ provider, model: 'm', history: [], tools: [], executeTool: async () => ({ content: '' }), onEvent: () => undefined, signal: ctrl.signal });
    expect(res.stopReason).toBe('aborted');
    expect(res.messages[0]!.blocks).toEqual([{ type: 'text', text: 'част' }]);
    expect(res.usage.estimated).toBe(true);
  });
});

describe('net & protocol', () => {
  it('classifies private hosts', () => {
    expect(isPrivateHost('192.168.1.5')).toBe(true);
    expect(isPrivateHost('100.101.1.2')).toBe(true);
    expect(isPrivateHost('my-pc.tail1234.ts.net')).toBe(true);
    expect(isPrivateHost('8.8.8.8')).toBe(false);
    expect(checkUrlSecurity('http://example.com')).not.toBeNull();
    expect(checkUrlSecurity('http://10.0.0.2:4545')).toBeNull();
  });

  it('round-trips pairing payloads', () => {
    const payload = { v: 1 as const, name: 'ПК', urls: ['http://192.168.1.2:4545'], code: 'abcdefgh12345678', exp: Date.now() + 60_000 };
    expect(decodePairingUri(encodePairingUri(payload))).toEqual(payload);
    expect(() => decodePairingUri(encodePairingUri({ ...payload, exp: 1 }))).toThrow(/истёк/);
  });

  it('base64url round-trips all lengths', () => {
    for (let n = 0; n < 10; n++) {
      const bytes = new Uint8Array(n).map((_, i) => (i * 37 + 11) & 255);
      expect([...base64UrlToBytes(base64UrlFromBytes(bytes))]).toEqual([...bytes]);
    }
  });

  it('merges last-write-wins', () => {
    const cur = new Map([['a', { id: 'a', updatedAt: 5, v: 1 }]]);
    const changed = mergeLww(cur, [
      { id: 'a', updatedAt: 4, v: 2 },
      { id: 'b', updatedAt: 1, v: 3 },
    ]);
    expect(changed.map((c) => c.id)).toEqual(['b']);
    expect(cur.get('a')!.v).toBe(1);
  });
});

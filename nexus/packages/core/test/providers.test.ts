import { describe, expect, it } from 'vitest';
import { createProvider, toOpenAIMessages, toAnthropicMessages, toGeminiContents, ProviderError, type ChatMessage, type StreamEvent } from '../src';
import { collect, jsonResponse, mockFetch, sseResponse } from './helpers';

const history: ChatMessage[] = [
  { role: 'user', blocks: [{ type: 'text', text: 'Сколько времени?' }] },
  {
    role: 'assistant',
    blocks: [
      { type: 'reasoning', text: 'нужен инструмент' },
      { type: 'tool_call', id: 'c1', name: 'clock', input: { tz: 'UTC' } },
    ],
  },
  { role: 'user', blocks: [{ type: 'tool_result', toolCallId: 'c1', name: 'clock', content: '12:00' }] },
];

describe('OpenAI-compatible (DeepSeek)', () => {
  it('streams reasoning, text, tool calls and cache-aware usage', async () => {
    const { fetch, calls } = mockFetch(() =>
      sseResponse([
        JSON.stringify({ choices: [{ delta: { reasoning_content: 'думаю' } }] }),
        JSON.stringify({ choices: [{ delta: { content: 'Привет' } }] }),
        JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_a', function: { name: 'get_time', arguments: '{"tz":' } }] } }] }),
        JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"UTC"}' } }] }, finish_reason: 'tool_calls' }] }),
        JSON.stringify({ choices: [], usage: { prompt_tokens: 100, completion_tokens: 20, prompt_cache_hit_tokens: 60, prompt_cache_miss_tokens: 40, completion_tokens_details: { reasoning_tokens: 5 } } }),
        '[DONE]',
      ]),
    );
    const p = createProvider({ id: 'deepseek', kind: 'openai', baseUrl: 'https://api.deepseek.com', apiKey: 'sk-test', streamUsage: true }, fetch);
    const events = await collect(p.chat({ model: 'deepseek-reasoner', system: 'sys', messages: history, tools: [{ name: 'get_time', description: 'time', inputSchema: { type: 'object', properties: {} } }] }));
    const done = events.at(-1) as Extract<StreamEvent, { type: 'done' }>;
    expect(done.type).toBe('done');
    expect(done.stopReason).toBe('tool_use');
    expect(done.usage).toMatchObject({ inputTokens: 40, cacheReadTokens: 60, outputTokens: 20, reasoningTokens: 5, estimated: false });
    expect(done.message.blocks).toEqual([
      { type: 'reasoning', text: 'думаю' },
      { type: 'text', text: 'Привет' },
      { type: 'tool_call', id: 'call_a', name: 'get_time', input: { tz: 'UTC' } },
    ]);
    expect(calls[0]!.url).toBe('https://api.deepseek.com/chat/completions');
    const body = calls[0]!.body as { messages: { role: string; reasoning_content?: string; tool_call_id?: string }[]; stream_options: unknown; tools: unknown[] };
    expect(body.messages.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'tool']);
    expect(body.messages[2]!.reasoning_content).toBe('нужен инструмент');
    expect(body.messages[3]!.tool_call_id).toBe('c1');
    expect(body.stream_options).toEqual({ include_usage: true });
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test');
  });

  it('retries 429 then surfaces non-retryable errors', async () => {
    let n = 0;
    const { fetch } = mockFetch(() => {
      n++;
      if (n === 1) return jsonResponse({ error: { message: 'slow down' } }, 429, { 'retry-after': '0' });
      return jsonResponse({ error: { message: 'Authentication Fails' } }, 401);
    });
    const p = createProvider({ id: 'deepseek', kind: 'openai', baseUrl: 'https://x', apiKey: 'k' }, fetch);
    await expect(collect(p.chat({ model: 'm', messages: history }))).rejects.toBeInstanceOf(ProviderError);
    expect(n).toBe(2);
  });

  it('omits reasoning echo for non-DeepSeek and splits images', () => {
    const msgs = toOpenAIMessages(undefined, [{ role: 'user', blocks: [{ type: 'text', text: 'a' }, { type: 'image', mediaType: 'image/png', data: 'AAA' }] }, ...history.slice(1)], 'openai');
    expect(Array.isArray(msgs[0]!.content)).toBe(true);
    expect(msgs[1]!.reasoning_content).toBeUndefined();
  });

  it('parses OpenRouter model listing with pricing', async () => {
    const { fetch } = mockFetch(() =>
      jsonResponse({ data: [{ id: 'deepseek/deepseek-chat', name: 'DeepSeek V3', context_length: 128000, pricing: { prompt: '0.00000028', completion: '0.00000042' }, supported_parameters: ['tools'] }, { id: 'openai/text-embedding-3-small', pricing: { prompt: '0', completion: '0' } }] }),
    );
    const p = createProvider({ id: 'openrouter', kind: 'openai', baseUrl: 'https://openrouter.ai/api/v1', apiKey: 'k' }, fetch);
    const models = await p.listModels();
    expect(models).toHaveLength(1);
    expect(models[0]).toMatchObject({ id: 'deepseek/deepseek-chat', contextWindow: 128000, tools: true, pricing: { input: 0.28, output: 0.42 } });
  });
});

describe('Anthropic', () => {
  it('maps history and replays raw content verbatim', () => {
    const raw = [{ type: 'thinking', thinking: 't', signature: 'sig' }, { type: 'tool_use', id: 'c1', name: 'clock', input: {} }];
    const msgs = toAnthropicMessages([history[0]!, { ...history[1]!, raw: { kind: 'anthropic', providerId: 'anthropic', modelId: 'claude-opus-5-5', content: raw } }, history[2]!], 'anthropic');
    expect(msgs[1]!.content).toBe(raw);
    expect(msgs[2]!.content).toEqual([{ type: 'tool_result', tool_use_id: 'c1', content: [{ type: 'text', text: '12:00' }], is_error: undefined }]);
  });

  it('streams thinking, text and tool_use through the SDK', async () => {
    const msgStart = { type: 'message_start', message: { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 50, output_tokens: 1, cache_read_input_tokens: 10, cache_creation_input_tokens: 0 } } };
    const { fetch, calls } = mockFetch(() =>
      sseResponse([
        { event: 'message_start', data: msgStart },
        { event: 'content_block_start', data: { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } } },
        { event: 'content_block_delta', data: { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'хм' } } },
        { event: 'content_block_delta', data: { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'SIG' } } },
        { event: 'content_block_stop', data: { type: 'content_block_stop', index: 0 } },
        { event: 'content_block_start', data: { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } } },
        { event: 'content_block_delta', data: { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'Ок' } } },
        { event: 'content_block_stop', data: { type: 'content_block_stop', index: 1 } },
        { event: 'content_block_start', data: { type: 'content_block_start', index: 2, content_block: { type: 'tool_use', id: 'tu_1', name: 'clock', input: {} } } },
        { event: 'content_block_delta', data: { type: 'content_block_delta', index: 2, delta: { type: 'input_json_delta', partial_json: '{"tz":"UTC"}' } } },
        { event: 'content_block_stop', data: { type: 'content_block_stop', index: 2 } },
        { event: 'message_delta', data: { type: 'message_delta', delta: { stop_reason: 'tool_use', stop_sequence: null }, usage: { output_tokens: 30 } } },
        { event: 'message_stop', data: { type: 'message_stop' } },
      ]),
    );
    const p = createProvider({ id: 'anthropic', kind: 'anthropic', baseUrl: 'https://api.anthropic.com', apiKey: 'sk-ant' }, fetch);
    const events = await collect(p.chat({ model: 'claude-opus-5-5', system: 's', messages: [history[0]!], tools: [{ name: 'clock', description: 'd', inputSchema: { type: 'object', properties: { tz: { type: 'string' } } } }] }));
    const done = events.at(-1) as Extract<StreamEvent, { type: 'done' }>;
    expect(events.some((e) => e.type === 'reasoning')).toBe(true);
    expect(done.stopReason).toBe('tool_use');
    expect(done.usage).toMatchObject({ inputTokens: 50, outputTokens: 30, cacheReadTokens: 10 });
    expect(done.message.blocks).toContainEqual({ type: 'tool_call', id: 'tu_1', name: 'clock', input: { tz: 'UTC' } });
    expect(done.message.raw?.kind).toBe('anthropic');
    const body = calls[0]!.body as Record<string, unknown>;
    expect(body.thinking).toEqual({ type: 'adaptive', display: 'summarized' });
    expect(body.fallbacks).toBe('default');
    expect((body.tools as { eager_input_streaming: boolean }[])[0]!.eager_input_streaming).toBe(true);
    expect(String((calls[0]!.init.headers as Headers).get?.('anthropic-beta') ?? '')).toContain('server-side-fallback');
  });
});

describe('Gemini', () => {
  it('streams thoughts, text and function calls and keeps signatures for replay', async () => {
    const { fetch, calls } = mockFetch(() =>
      sseResponse([
        JSON.stringify({ candidates: [{ content: { parts: [{ text: 'думаю', thought: true }] } }] }),
        JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Отв' }] } }] }),
        JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ет', thoughtSignature: 'S1' }] } }] }),
        JSON.stringify({ candidates: [{ content: { parts: [{ functionCall: { name: 'clock', args: { tz: 'UTC' } }, thoughtSignature: 'S2' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 4, thoughtsTokenCount: 3 } }),
      ]),
    );
    const p = createProvider({ id: 'gemini', kind: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com', apiKey: 'g' }, fetch);
    const events = await collect(p.chat({ model: 'gemini-2.5-flash', messages: [history[0]!], tools: [{ name: 'clock', description: 'd', inputSchema: { type: 'object', properties: {}, additionalProperties: false } }] }));
    const done = events.at(-1) as Extract<StreamEvent, { type: 'done' }>;
    expect(done.stopReason).toBe('tool_use');
    expect(done.usage).toMatchObject({ inputTokens: 12, outputTokens: 7, reasoningTokens: 3 });
    expect(done.message.blocks[0]).toEqual({ type: 'reasoning', text: 'думаю' });
    expect(done.message.blocks[1]).toEqual({ type: 'text', text: 'Ответ' });
    const raw = done.message.raw!.content as { text?: string; thoughtSignature?: string }[];
    expect(raw[1]).toEqual({ text: 'Ответ', thoughtSignature: 'S1' });
    expect(raw[2]!.thoughtSignature).toBe('S2');
    expect(calls[0]!.url).toContain('gemini-2.5-flash:streamGenerateContent?alt=sse');
    const body = calls[0]!.body as { tools: { functionDeclarations: { parameters: Record<string, unknown> }[] }[] };
    expect(body.tools[0]!.functionDeclarations[0]!.parameters.additionalProperties).toBeUndefined();
    const replay = toGeminiContents([history[0]!, done.message]);
    expect(replay[1]!.parts).toBe(done.message.raw!.content);
  });
});

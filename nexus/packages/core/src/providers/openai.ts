import { joinUrl, request, ProviderError, AbortError } from '../http';
import { parseSSE } from '../sse';
import {
  emptyUsage,
  type ChatMessage,
  type ChatRequest,
  type FetchLike,
  type LLMProvider,
  type ModelInfo,
  type ProviderConfig,
  type StopReason,
  type StreamEvent,
  type ToolCallBlock,
  type Usage,
  type Block,
} from '../types';

type OAIContent = string | ({ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } })[];

interface OAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: OAIContent | null;
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
  reasoning_content?: string;
}

export function toOpenAIMessages(system: string | undefined, messages: ChatMessage[], providerId: string): OAIMessage[] {
  const out: OAIMessage[] = [];
  if (system) out.push({ role: 'system', content: system });
  let lastUser = -1;
  messages.forEach((m, i) => {
    if (m.role === 'user' && m.blocks.some((b) => b.type !== 'tool_result')) lastUser = i;
  });
  messages.forEach((m, idx) => {
    if (m.role === 'assistant') {
      const text = m.blocks.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('');
      const calls = m.blocks.filter((b): b is ToolCallBlock => b.type === 'tool_call');
      const msg: OAIMessage = { role: 'assistant', content: text || (calls.length ? null : '') };
      if (calls.length) {
        msg.tool_calls = calls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.input ?? {}) } }));
        // DeepSeek thinking mode expects the reasoning of tool-call sub-turns within the current turn to be echoed back.
        if (providerId === 'deepseek' && idx > lastUser) {
          const reasoning = m.blocks.filter((b) => b.type === 'reasoning').map((b) => (b as { text: string }).text).join('');
          if (reasoning) msg.reasoning_content = reasoning;
        }
      }
      out.push(msg);
      return;
    }
    const parts: Exclude<OAIContent, string> = [];
    for (const b of m.blocks) {
      if (b.type === 'tool_result') {
        out.push({ role: 'tool', tool_call_id: b.toolCallId, content: b.isError ? `ERROR: ${b.content}` : b.content });
        if (b.images?.length) {
          for (const img of b.images) parts.push({ type: 'image_url', image_url: { url: `data:${img.mediaType};base64,${img.data}` } });
        }
      } else if (b.type === 'text') parts.push({ type: 'text', text: b.text });
      else if (b.type === 'image') parts.push({ type: 'image_url', image_url: { url: `data:${b.mediaType};base64,${b.data}` } });
    }
    if (parts.length) {
      const onlyText = parts.every((p) => p.type === 'text');
      out.push({ role: 'user', content: onlyText ? parts.map((p) => (p as { text: string }).text).join('\n\n') : parts });
    }
  });
  return out;
}

interface OAIUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_cache_hit_tokens?: number;
  prompt_cache_miss_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
  completion_tokens_details?: { reasoning_tokens?: number };
}

export function normalizeOpenAIUsage(u: OAIUsage): Usage {
  const usage = emptyUsage();
  const prompt = u.prompt_tokens ?? 0;
  if (u.prompt_cache_hit_tokens != null || u.prompt_cache_miss_tokens != null) {
    usage.cacheReadTokens = u.prompt_cache_hit_tokens ?? 0;
    usage.inputTokens = u.prompt_cache_miss_tokens ?? Math.max(prompt - usage.cacheReadTokens, 0);
  } else {
    usage.cacheReadTokens = u.prompt_tokens_details?.cached_tokens ?? 0;
    usage.inputTokens = Math.max(prompt - usage.cacheReadTokens, 0);
  }
  usage.outputTokens = u.completion_tokens ?? 0;
  usage.reasoningTokens = u.completion_tokens_details?.reasoning_tokens ?? 0;
  return usage;
}

function mapFinish(reason: string | null | undefined, hasCalls: boolean): StopReason {
  if (reason === 'tool_calls' || reason === 'function_call') return 'tool_use';
  if (reason === 'length') return 'max_tokens';
  if (reason === 'content_filter') return 'content_filter';
  return hasCalls ? 'tool_use' : 'end';
}

function safeParse(s: string): Record<string, unknown> {
  if (!s.trim()) return {};
  try {
    const v = JSON.parse(s) as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : { value: v };
  } catch {
    return { __invalid_json: s };
  }
}

export class OpenAICompatibleProvider implements LLMProvider {
  constructor(
    readonly config: ProviderConfig,
    private readonly fetchFn: FetchLike,
  ) {}

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'text/event-stream', ...(this.config.headers ?? {}) };
    if (this.config.apiKey) h.Authorization = `Bearer ${this.config.apiKey}`;
    return h;
  }

  async *chat(req: ChatRequest, signal?: AbortSignal): AsyncGenerator<StreamEvent> {
    const body: Record<string, unknown> = {
      model: req.model,
      messages: toOpenAIMessages(req.system, req.messages, this.config.id),
      stream: true,
    };
    if (this.config.streamUsage !== false) body.stream_options = { include_usage: true };
    if (req.tools?.length) {
      body.tools = req.tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.inputSchema } }));
    }
    if (req.maxOutputTokens) body.max_tokens = req.maxOutputTokens;
    if (req.temperature != null) body.temperature = req.temperature;

    const res = await request(this.fetchFn, joinUrl(this.config.baseUrl, 'chat/completions'), {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
      signal,
    });
    if (!res.body) throw new ProviderError('Пустой ответ сервера', res.status, true);

    let text = '';
    let reasoning = '';
    const calls = new Map<number, { id: string; name: string; args: string }>();
    let finish: string | null | undefined;
    let usage: Usage | null = null;

    try {
      for await (const ev of parseSSE(res.body)) {
        if (ev.data === '[DONE]') break;
        let chunk: {
          choices?: { delta?: Record<string, unknown>; finish_reason?: string | null }[];
          usage?: OAIUsage | null;
          error?: { message?: string };
        };
        try {
          chunk = JSON.parse(ev.data);
        } catch {
          continue;
        }
        if (chunk.error) throw new ProviderError(chunk.error.message ?? 'Ошибка провайдера', 500, false);
        if (chunk.usage) {
          usage = normalizeOpenAIUsage(chunk.usage);
          yield { type: 'usage', usage };
        }
        const choice = chunk.choices?.[0];
        if (!choice) continue;
        const d = choice.delta ?? {};
        const r = (typeof d.reasoning_content === 'string' ? d.reasoning_content : typeof d.reasoning === 'string' ? d.reasoning : '') as string;
        if (r) {
          reasoning += r;
          yield { type: 'reasoning', delta: r };
        }
        if (typeof d.content === 'string' && d.content) {
          text += d.content;
          yield { type: 'text', delta: d.content };
        }
        const tcs = d.tool_calls as { index?: number; id?: string; function?: { name?: string; arguments?: string } }[] | undefined;
        if (Array.isArray(tcs)) {
          for (const tc of tcs) {
            const index = tc.index ?? calls.size;
            let cur = calls.get(index);
            if (!cur) {
              cur = { id: tc.id || `call_${index}_${Date.now().toString(36)}`, name: tc.function?.name ?? '', args: '' };
              calls.set(index, cur);
              yield { type: 'tool_call_start', id: cur.id, name: cur.name };
            } else if (tc.function?.name && !cur.name) cur.name = tc.function.name;
            if (tc.function?.arguments) {
              cur.args += tc.function.arguments;
              yield { type: 'tool_call_delta', id: cur.id, delta: tc.function.arguments };
            }
          }
        }
        if (choice.finish_reason) finish = choice.finish_reason;
      }
    } catch (e) {
      if (signal?.aborted) throw new AbortError();
      throw e;
    }

    const blocks: Block[] = [];
    if (reasoning) blocks.push({ type: 'reasoning', text: reasoning });
    if (text) blocks.push({ type: 'text', text });
    for (const c of [...calls.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v)) {
      blocks.push({ type: 'tool_call', id: c.id, name: c.name, input: safeParse(c.args) });
    }
    const finalUsage = usage ?? { ...emptyUsage(), estimated: true };
    yield {
      type: 'done',
      message: { role: 'assistant', blocks },
      stopReason: mapFinish(finish, calls.size > 0),
      usage: finalUsage,
    };
  }

  async listModels(signal?: AbortSignal): Promise<ModelInfo[]> {
    const res = await request(this.fetchFn, joinUrl(this.config.baseUrl, 'models'), { method: 'GET', headers: this.headers(), signal }, 1);
    const j = (await res.json()) as { data?: Record<string, unknown>[]; models?: Record<string, unknown>[] };
    const list = j.data ?? j.models ?? [];
    return list
      .map((x): ModelInfo | null => {
        const id = typeof x.id === 'string' ? x.id : typeof x.name === 'string' ? x.name : null;
        if (!id) return null;
        const info: ModelInfo = { id, name: typeof x.name === 'string' && this.config.id === 'openrouter' ? x.name : id };
        const ctx = x.context_length ?? x.context_window ?? x.max_context_length;
        if (typeof ctx === 'number') info.contextWindow = ctx;
        const pricing = x.pricing as Record<string, string> | undefined;
        if (pricing && pricing.prompt != null && pricing.completion != null) {
          const p = Number(pricing.prompt) * 1e6;
          const c = Number(pricing.completion) * 1e6;
          if (Number.isFinite(p) && Number.isFinite(c) && p >= 0 && c >= 0) {
            info.pricing = { input: round6(p), output: round6(c) };
            const cr = Number(pricing.input_cache_read);
            if (pricing.input_cache_read != null && Number.isFinite(cr)) info.pricing.cacheRead = round6(cr * 1e6);
            const cw = Number(pricing.input_cache_write);
            if (pricing.input_cache_write != null && Number.isFinite(cw)) info.pricing.cacheWrite = round6(cw * 1e6);
          }
        }
        const arch = x.architecture as { input_modalities?: string[] } | undefined;
        if (arch?.input_modalities) info.vision = arch.input_modalities.includes('image');
        const params = x.supported_parameters as string[] | undefined;
        if (params) {
          info.tools = params.includes('tools');
          info.reasoning = params.includes('reasoning');
        }
        return info;
      })
      .filter((x): x is ModelInfo => !!x && !/embed|whisper|tts|dall-e|moderation|audio|transcribe|image|rerank/i.test(x.id))
      .sort((a, b) => a.id.localeCompare(b.id));
  }
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

import { AbortError, joinUrl, request, ProviderError } from '../http';
import { parseSSE } from '../sse';
import {
  emptyUsage,
  type Block,
  type ChatMessage,
  type ChatRequest,
  type FetchLike,
  type LLMProvider,
  type ModelInfo,
  type ProviderConfig,
  type StopReason,
  type StreamEvent,
  type Usage,
} from '../types';

export interface GeminiPart {
  text?: string;
  thought?: boolean;
  thoughtSignature?: string;
  inlineData?: { mimeType: string; data: string };
  functionCall?: { name: string; args?: Record<string, unknown>; id?: string };
  functionResponse?: { name: string; response: Record<string, unknown>; id?: string };
}

interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

export function supportsThinking(model: string): boolean {
  return /gemini-(2\.5|[3-9])/.test(model) && !/flash-lite|image|tts|live/.test(model);
}

export function toGeminiContents(messages: ChatMessage[]): GeminiContent[] {
  const out: GeminiContent[] = [];
  for (const m of messages) {
    let parts: GeminiPart[] = [];
    if (m.role === 'assistant' && m.raw?.kind === 'gemini' && Array.isArray(m.raw.content)) {
      parts = m.raw.content as GeminiPart[];
    } else {
      for (const b of m.blocks) {
        if (b.type === 'text' && b.text) parts.push({ text: b.text });
        else if (b.type === 'image') parts.push({ inlineData: { mimeType: b.mediaType, data: b.data } });
        else if (b.type === 'tool_call') parts.push({ functionCall: { name: b.name, args: b.input ?? {} } });
        else if (b.type === 'tool_result') {
          parts.push({
            functionResponse: {
              name: b.name,
              response: b.isError ? { error: b.content } : { result: b.content },
              ...(b.toolCallId && !b.toolCallId.startsWith('gcall_') ? { id: b.toolCallId } : {}),
            },
          });
          for (const img of b.images ?? []) parts.push({ inlineData: { mimeType: img.mediaType, data: img.data } });
        }
      }
    }
    if (!parts.length) continue;
    const role = m.role === 'assistant' ? 'model' : 'user';
    const prev = out[out.length - 1];
    if (prev && prev.role === role) prev.parts.push(...parts);
    else out.push({ role, parts });
  }
  return out;
}

/** Strips JSON-Schema keywords Gemini's function declarations reject. */
export function sanitizeSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(sanitizeSchema);
  if (!schema || typeof schema !== 'object') return schema;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(schema as Record<string, unknown>)) {
    if (k === '$schema' || k === '$id' || k === 'additionalProperties' || k === '$defs' || k === 'definitions' || k === 'examples' || k === 'default' && typeof v === 'object') continue;
    out[k] = sanitizeSchema(v);
  }
  return out;
}

function mapFinish(r: string | undefined, hasCalls: boolean): StopReason {
  if (hasCalls) return 'tool_use';
  if (r === 'MAX_TOKENS') return 'max_tokens';
  if (r === 'SAFETY' || r === 'RECITATION' || r === 'PROHIBITED_CONTENT' || r === 'BLOCKLIST' || r === 'SPII') return 'content_filter';
  return 'end';
}

export class GeminiProvider implements LLMProvider {
  constructor(
    readonly config: ProviderConfig,
    private readonly fetchFn: FetchLike,
  ) {}

  private headers(): Record<string, string> {
    return { 'Content-Type': 'application/json', 'x-goog-api-key': this.config.apiKey, ...(this.config.headers ?? {}) };
  }

  async *chat(req: ChatRequest, signal?: AbortSignal): AsyncGenerator<StreamEvent> {
    const body: Record<string, unknown> = { contents: toGeminiContents(req.messages) };
    if (req.system) body.systemInstruction = { parts: [{ text: req.system }] };
    if (req.tools?.length) {
      body.tools = [
        {
          functionDeclarations: req.tools.map((t) => ({ name: t.name, description: t.description, parameters: sanitizeSchema({ type: 'object', ...t.inputSchema }) })),
        },
      ];
    }
    const generationConfig: Record<string, unknown> = {};
    if (req.maxOutputTokens) generationConfig.maxOutputTokens = req.maxOutputTokens;
    if (req.temperature != null) generationConfig.temperature = req.temperature;
    if (supportsThinking(req.model)) generationConfig.thinkingConfig = { includeThoughts: true };
    if (Object.keys(generationConfig).length) body.generationConfig = generationConfig;

    const model = req.model.replace(/^models\//, '');
    const res = await request(this.fetchFn, joinUrl(this.config.baseUrl, `v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`), {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
      signal,
    });
    if (!res.body) throw new ProviderError('Пустой ответ сервера', res.status, true);

    const parts: GeminiPart[] = [];
    let finish: string | undefined;
    let usage: Usage | null = null;
    let callSeq = 0;
    const blockReason: string[] = [];

    try {
      for await (const ev of parseSSE(res.body)) {
        let chunk: {
          candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[];
          usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number; cachedContentTokenCount?: number; toolUsePromptTokenCount?: number };
          promptFeedback?: { blockReason?: string };
          error?: { message?: string; code?: number };
        };
        try {
          chunk = JSON.parse(ev.data);
        } catch {
          continue;
        }
        if (chunk.error) throw new ProviderError(chunk.error.message ?? 'Gemini error', chunk.error.code ?? 500, false);
        if (chunk.promptFeedback?.blockReason) blockReason.push(chunk.promptFeedback.blockReason);
        const u = chunk.usageMetadata;
        if (u) {
          const cached = u.cachedContentTokenCount ?? 0;
          usage = {
            ...emptyUsage(),
            inputTokens: Math.max((u.promptTokenCount ?? 0) + (u.toolUsePromptTokenCount ?? 0) - cached, 0),
            cacheReadTokens: cached,
            outputTokens: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0),
            reasoningTokens: u.thoughtsTokenCount ?? 0,
          };
          yield { type: 'usage', usage };
        }
        const cand = chunk.candidates?.[0];
        if (!cand) continue;
        if (cand.finishReason) finish = cand.finishReason;
        for (const p of cand.content?.parts ?? []) {
          if (p.functionCall) {
            const id = p.functionCall.id ?? `gcall_${callSeq++}_${Date.now().toString(36)}`;
            parts.push({ ...p, functionCall: { ...p.functionCall, id: p.functionCall.id } });
            (parts[parts.length - 1] as GeminiPart & { _id?: string })._id = id;
            yield { type: 'tool_call_start', id, name: p.functionCall.name };
            yield { type: 'tool_call_delta', id, delta: JSON.stringify(p.functionCall.args ?? {}) };
            continue;
          }
          if (typeof p.text === 'string') {
            if (p.thought) yield { type: 'reasoning', delta: p.text };
            else if (p.text) yield { type: 'text', delta: p.text };
            const last = parts[parts.length - 1];
            if (last && typeof last.text === 'string' && !!last.thought === !!p.thought && !last.thoughtSignature && !last.functionCall) {
              last.text += p.text;
              if (p.thoughtSignature) last.thoughtSignature = p.thoughtSignature;
            } else parts.push({ ...p });
            continue;
          }
          parts.push({ ...p });
        }
      }
    } catch (e) {
      if (signal?.aborted) throw new AbortError();
      throw e;
    }

    const blocks: Block[] = [];
    let reasoning = '';
    let text = '';
    for (const p of parts) {
      if (p.functionCall) {
        blocks.push({ type: 'tool_call', id: (p as GeminiPart & { _id?: string })._id ?? p.functionCall.name, name: p.functionCall.name, input: p.functionCall.args ?? {} });
      } else if (typeof p.text === 'string') {
        if (p.thought) reasoning += p.text;
        else text += p.text;
      }
    }
    if (text) blocks.unshift({ type: 'text', text });
    if (reasoning) blocks.unshift({ type: 'reasoning', text: reasoning });
    const raw = parts.map((p) => {
      const { _id, ...rest } = p as GeminiPart & { _id?: string };
      void _id;
      return rest;
    });
    const hasCalls = blocks.some((b) => b.type === 'tool_call');
    yield {
      type: 'done',
      message: { role: 'assistant', blocks, raw: { kind: 'gemini', providerId: this.config.id, modelId: req.model, content: raw } },
      stopReason: blockReason.length ? 'content_filter' : mapFinish(finish, hasCalls),
      usage: usage ?? { ...emptyUsage(), estimated: true },
      detail: blockReason.length ? blockReason.join(', ') : undefined,
    };
  }

  async listModels(signal?: AbortSignal): Promise<ModelInfo[]> {
    const out: ModelInfo[] = [];
    let pageToken: string | undefined;
    do {
      const url = joinUrl(this.config.baseUrl, `v1beta/models?pageSize=1000${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`);
      const res = await request(this.fetchFn, url, { method: 'GET', headers: this.headers(), signal }, 1);
      const j = (await res.json()) as {
        models?: { name: string; displayName?: string; inputTokenLimit?: number; outputTokenLimit?: number; supportedGenerationMethods?: string[]; thinking?: boolean }[];
        nextPageToken?: string;
      };
      for (const x of j.models ?? []) {
        if (!x.supportedGenerationMethods?.includes('generateContent')) continue;
        const id = x.name.replace(/^models\//, '');
        if (/embedding|aqa|imagen|veo|tts|native-audio/.test(id)) continue;
        out.push({
          id,
          name: x.displayName ?? id,
          contextWindow: x.inputTokenLimit,
          maxOutput: x.outputTokenLimit,
          vision: true,
          tools: !/gemma/.test(id),
          reasoning: x.thinking ?? supportsThinking(id),
        });
      }
      pageToken = j.nextPageToken;
    } while (pageToken);
    return out.sort((a, b) => b.id.localeCompare(a.id));
  }
}

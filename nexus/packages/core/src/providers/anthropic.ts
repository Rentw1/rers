import Anthropic from '@anthropic-ai/sdk';
import { AbortError, ProviderError } from '../http';
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

type ContentParam = Anthropic.Beta.Messages.BetaContentBlockParam;
type MessageParam = Anthropic.Beta.Messages.BetaMessageParam;

/** Claude models that accept `thinking: {type: "adaptive"}` (4.6 and newer). */
export function supportsAdaptiveThinking(model: string): boolean {
  return /claude-(opus|sonnet|haiku|fable|mythos)-(4-[6-9]|[5-9])/.test(model) || /claude-(fable|mythos)-\d/.test(model);
}

/** Models that take the server-side refusal fallback in its `"default"` form. */
export function supportsDefaultFallback(model: string): boolean {
  return ['claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5'].includes(model);
}

export function toAnthropicMessages(messages: ChatMessage[], providerId: string): MessageParam[] {
  const out: MessageParam[] = [];
  for (const m of messages) {
    let content: ContentParam[];
    if (m.role === 'assistant' && m.raw?.kind === 'anthropic' && Array.isArray(m.raw.content)) {
      // Replay Claude's own content verbatim (thinking blocks with signatures, tool_use ids).
      content = m.raw.content as ContentParam[];
    } else {
      content = [];
      for (const b of m.blocks) {
        if (b.type === 'text') {
          if (b.text) content.push({ type: 'text', text: b.text });
        } else if (b.type === 'image') {
          content.push({
            type: 'image',
            source: { type: 'base64', media_type: b.mediaType as 'image/png', data: b.data },
          });
        } else if (b.type === 'tool_call') {
          content.push({ type: 'tool_use', id: b.id, name: b.name, input: b.input ?? {} });
        } else if (b.type === 'tool_result') {
          const inner: Anthropic.Beta.Messages.BetaToolResultBlockParam['content'] = [{ type: 'text', text: b.content || '(пусто)' }];
          for (const img of b.images ?? []) {
            (inner as ContentParam[]).push({ type: 'image', source: { type: 'base64', media_type: img.mediaType as 'image/png', data: img.data } });
          }
          content.push({ type: 'tool_result', tool_use_id: b.toolCallId, content: inner, is_error: b.isError || undefined });
        }
        // Reasoning from other providers is not replayable to Claude and is dropped.
      }
    }
    if (!content.length) continue;
    const prev = out[out.length - 1];
    if (prev && prev.role === m.role) {
      const prevContent: ContentParam[] = typeof prev.content === 'string' ? [{ type: 'text', text: prev.content }] : [...prev.content];
      // tool_result blocks must lead a user turn.
      prev.content = m.role === 'user' ? [...prevContent.filter((c) => c.type === 'tool_result'), ...content.filter((c) => c.type === 'tool_result'), ...prevContent.filter((c) => c.type !== 'tool_result'), ...content.filter((c) => c.type !== 'tool_result')] : [...prevContent, ...content];
    } else out.push({ role: m.role, content });
  }
  void providerId;
  return out;
}

function normalizeUsage(u: Anthropic.Beta.Messages.BetaUsage | Anthropic.Beta.Messages.BetaMessageDeltaUsage | undefined): Usage {
  const usage = emptyUsage();
  if (!u) return usage;
  usage.inputTokens = u.input_tokens ?? 0;
  usage.outputTokens = u.output_tokens ?? 0;
  usage.cacheReadTokens = u.cache_read_input_tokens ?? 0;
  usage.cacheWriteTokens = u.cache_creation_input_tokens ?? 0;
  const details = (u as { output_tokens_details?: { thinking_tokens?: number; reasoning_tokens?: number } | null }).output_tokens_details;
  usage.reasoningTokens = details?.thinking_tokens ?? details?.reasoning_tokens ?? 0;
  return usage;
}

function mapStop(r: string | null | undefined): StopReason {
  switch (r) {
    case 'tool_use':
      return 'tool_use';
    case 'max_tokens':
    case 'model_context_window_exceeded':
      return 'max_tokens';
    case 'refusal':
      return 'refusal';
    default:
      return 'end';
  }
}

export class AnthropicProvider implements LLMProvider {
  private readonly client: Anthropic;

  constructor(
    readonly config: ProviderConfig,
    fetchFn: FetchLike,
  ) {
    this.client = new Anthropic({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
      fetch: fetchFn as unknown as typeof fetch,
      dangerouslyAllowBrowser: true,
      maxRetries: 3,
      defaultHeaders: config.headers,
    });
  }

  async *chat(req: ChatRequest, signal?: AbortSignal): AsyncGenerator<StreamEvent> {
    const params: Anthropic.Beta.Messages.MessageCreateParamsStreaming = {
      model: req.model,
      max_tokens: req.maxOutputTokens ?? (supportsAdaptiveThinking(req.model) ? 64_000 : 8_192),
      messages: toAnthropicMessages(req.messages, this.config.id),
      stream: true,
    };
    if (req.system) params.system = req.system;
    if (req.tools?.length) {
      params.tools = req.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: { type: 'object', ...t.inputSchema } as Anthropic.Beta.Messages.BetaTool.InputSchema,
        eager_input_streaming: true,
      }));
    }
    if (supportsAdaptiveThinking(req.model)) params.thinking = { type: 'adaptive', display: 'summarized' };
    if (supportsDefaultFallback(req.model)) {
      params.betas = ['server-side-fallback-2026-07-01'];
      (params as unknown as { fallbacks: string }).fallbacks = 'default';
    }

    const stream = this.client.beta.messages.stream(params, { signal });
    const toolIds = new Map<number, string>();
    let usage = emptyUsage();
    try {
      for await (const ev of stream) {
        switch (ev.type) {
          case 'message_start':
            usage = normalizeUsage(ev.message.usage);
            break;
          case 'content_block_start':
            if (ev.content_block.type === 'tool_use') {
              toolIds.set(ev.index, ev.content_block.id);
              yield { type: 'tool_call_start', id: ev.content_block.id, name: ev.content_block.name };
            }
            break;
          case 'content_block_delta':
            if (ev.delta.type === 'text_delta') yield { type: 'text', delta: ev.delta.text };
            else if (ev.delta.type === 'thinking_delta') yield { type: 'reasoning', delta: ev.delta.thinking };
            else if (ev.delta.type === 'input_json_delta') {
              const id = toolIds.get(ev.index);
              if (id) yield { type: 'tool_call_delta', id, delta: ev.delta.partial_json };
            }
            break;
          case 'message_delta': {
            const d = normalizeUsage(ev.usage as Anthropic.Beta.Messages.BetaMessageDeltaUsage);
            usage = {
              ...usage,
              outputTokens: d.outputTokens || usage.outputTokens,
              inputTokens: d.inputTokens || usage.inputTokens,
              cacheReadTokens: d.cacheReadTokens || usage.cacheReadTokens,
              cacheWriteTokens: d.cacheWriteTokens || usage.cacheWriteTokens,
              reasoningTokens: d.reasoningTokens || usage.reasoningTokens,
            };
            yield { type: 'usage', usage };
            break;
          }
          default:
            break;
        }
      }
    } catch (e) {
      throw translateError(e, signal);
    }
    let final: Anthropic.Beta.Messages.BetaMessage;
    try {
      final = await stream.finalMessage();
    } catch (e) {
      throw translateError(e, signal);
    }
    usage = { ...normalizeUsage(final.usage), estimated: false };

    const blocks: Block[] = [];
    const replay: unknown[] = [];
    let hasToolUse = false;
    for (const c of final.content) {
      replay.push(c);
      if (c.type === 'text') blocks.push({ type: 'text', text: c.text });
      else if (c.type === 'thinking') {
        if (c.thinking) blocks.push({ type: 'reasoning', text: c.thinking });
      } else if (c.type === 'tool_use') {
        hasToolUse = true;
        const input = c.input && typeof c.input === 'object' ? (c.input as Record<string, unknown>) : {};
        blocks.push({ type: 'tool_call', id: c.id, name: c.name, input });
      }
    }
    let stopReason = mapStop(final.stop_reason);
    // A tool call cut off by max_tokens may carry a truncated input: never run it.
    if (stopReason === 'max_tokens' && hasToolUse) {
      for (const b of blocks) if (b.type === 'tool_call') b.input = { __truncated: true };
    }
    if (stopReason === 'end' && hasToolUse) stopReason = 'tool_use';
    const details = (final as unknown as { stop_details?: { category?: string | null; explanation?: string | null } | null }).stop_details;
    yield {
      type: 'done',
      message: { role: 'assistant', blocks, raw: { kind: 'anthropic', providerId: this.config.id, modelId: final.model, content: replay } },
      stopReason,
      usage,
      detail: stopReason === 'refusal' ? [details?.category, details?.explanation].filter(Boolean).join(': ') || undefined : undefined,
    };
  }

  async listModels(signal?: AbortSignal): Promise<ModelInfo[]> {
    const out: ModelInfo[] = [];
    try {
      for await (const mdl of this.client.models.list({ limit: 100 }, { signal })) {
        const x = mdl as unknown as { id: string; display_name?: string; max_input_tokens?: number; max_tokens?: number };
        out.push({
          id: x.id,
          name: x.display_name ?? x.id,
          contextWindow: x.max_input_tokens,
          maxOutput: x.max_tokens,
          vision: true,
          tools: true,
          reasoning: supportsAdaptiveThinking(x.id),
        });
      }
    } catch (e) {
      throw translateError(e, signal);
    }
    return out;
  }
}

function translateError(e: unknown, signal?: AbortSignal): Error {
  if (signal?.aborted || e instanceof Anthropic.APIUserAbortError) return new AbortError();
  if (e instanceof Anthropic.APIError) {
    const status = typeof e.status === 'number' ? e.status : 0;
    const body = e.error as { error?: { message?: string; type?: string } } | undefined;
    const msg = body?.error?.message ?? e.message;
    return new ProviderError(`${status || ''}${status ? ': ' : ''}${msg}`, status, status === 429 || status >= 500 || status === 0, body?.error?.type);
  }
  return e instanceof Error ? e : new Error(String(e));
}

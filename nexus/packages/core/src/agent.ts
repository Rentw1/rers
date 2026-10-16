import { isAbort } from './http';
import { estimateTokens } from './pricing';
import { addUsage, emptyUsage, type ChatMessage, type LLMProvider, type StopReason, type StreamEvent, type ToolCallBlock, type ToolResultBlock, type ToolSpec, type Usage, type Block } from './types';

export interface ToolOutput {
  content: string;
  isError?: boolean;
  images?: { mediaType: string; data: string }[];
}

export type AgentEvent =
  | { type: 'iteration_start'; index: number }
  | { type: 'stream'; event: Exclude<StreamEvent, { type: 'done' }> }
  | { type: 'assistant_message'; message: ChatMessage; usage: Usage; stopReason: StopReason; detail?: string }
  | { type: 'tool_start'; call: ToolCallBlock }
  | { type: 'tool_end'; call: ToolCallBlock; result: ToolResultBlock }
  | { type: 'tool_results'; message: ChatMessage };

export interface AgentOptions {
  provider: LLMProvider;
  model: string;
  system?: string;
  history: ChatMessage[];
  tools: ToolSpec[];
  maxOutputTokens?: number;
  temperature?: number;
  maxIterations?: number;
  executeTool: (call: ToolCallBlock, signal?: AbortSignal) => Promise<ToolOutput>;
  onEvent: (ev: AgentEvent) => void;
  signal?: AbortSignal;
}

export interface AgentResult {
  messages: ChatMessage[];
  usage: Usage;
  stopReason: StopReason;
  detail?: string;
}

const MAX_TOOL_OUTPUT = 60_000;

export function clipToolOutput(s: string): string {
  if (s.length <= MAX_TOOL_OUTPUT) return s;
  return s.slice(0, MAX_TOOL_OUTPUT) + `\n…[обрезано ${s.length - MAX_TOOL_OUTPUT} символов]`;
}

export async function runAgent(o: AgentOptions): Promise<AgentResult> {
  const maxIterations = o.maxIterations ?? 25;
  const added: ChatMessage[] = [];
  let total = emptyUsage();
  let stopReason: StopReason = 'end';
  let detail: string | undefined;

  for (let i = 0; i < maxIterations; i++) {
    o.onEvent({ type: 'iteration_start', index: i });
    let text = '';
    let reasoning = '';
    let done: Extract<StreamEvent, { type: 'done' }> | null = null;
    try {
      for await (const ev of o.provider.chat(
        {
          model: o.model,
          system: o.system,
          messages: [...o.history, ...added],
          tools: o.tools.length ? o.tools : undefined,
          maxOutputTokens: o.maxOutputTokens,
          temperature: o.temperature,
        },
        o.signal,
      )) {
        if (ev.type === 'done') {
          done = ev;
          break;
        }
        if (ev.type === 'text') text += ev.delta;
        else if (ev.type === 'reasoning') reasoning += ev.delta;
        o.onEvent({ type: 'stream', event: ev });
      }
    } catch (e) {
      if (!isAbort(e) && !o.signal?.aborted) throw e;
      const blocks: Block[] = [];
      if (reasoning) blocks.push({ type: 'reasoning', text: reasoning });
      if (text) blocks.push({ type: 'text', text });
      const usage: Usage = { ...emptyUsage(), inputTokens: estimateTokens(JSON.stringify([...o.history, ...added])), outputTokens: estimateTokens(text + reasoning), estimated: true };
      total = addUsage(total, usage);
      if (blocks.length) {
        const message: ChatMessage = { role: 'assistant', blocks };
        added.push(message);
        o.onEvent({ type: 'assistant_message', message, usage, stopReason: 'aborted' });
      }
      return { messages: added, usage: total, stopReason: 'aborted' };
    }
    if (!done) throw new Error('Поток ответа оборвался без завершения');

    let usage = done.usage;
    if (usage.estimated && usage.inputTokens === 0 && usage.outputTokens === 0) {
      usage = { ...usage, inputTokens: estimateTokens(JSON.stringify([...o.history, ...added])), outputTokens: estimateTokens(text + reasoning) };
    }
    total = addUsage(total, usage);
    added.push(done.message);
    stopReason = done.stopReason;
    detail = done.detail;
    o.onEvent({ type: 'assistant_message', message: done.message, usage, stopReason, detail });

    const calls = done.message.blocks.filter((b): b is ToolCallBlock => b.type === 'tool_call');
    if (!calls.length || (stopReason !== 'tool_use' && stopReason !== 'max_tokens')) break;

    const results: ToolResultBlock[] = [];
    for (const call of calls) {
      if (o.signal?.aborted) {
        results.push({ type: 'tool_result', toolCallId: call.id, name: call.name, content: 'Отменено пользователем', isError: true });
        continue;
      }
      o.onEvent({ type: 'tool_start', call });
      let out: ToolOutput;
      try {
        out = await o.executeTool(call, o.signal);
      } catch (e) {
        out = { content: isAbort(e) ? 'Отменено пользователем' : `Ошибка: ${(e as Error).message}`, isError: true };
      }
      const result: ToolResultBlock = {
        type: 'tool_result',
        toolCallId: call.id,
        name: call.name,
        content: clipToolOutput(out.content),
        isError: out.isError,
        images: out.images,
      };
      results.push(result);
      o.onEvent({ type: 'tool_end', call, result });
    }
    const toolMsg: ChatMessage = { role: 'user', blocks: results };
    added.push(toolMsg);
    o.onEvent({ type: 'tool_results', message: toolMsg });
    if (o.signal?.aborted) return { messages: added, usage: total, stopReason: 'aborted' };
    if (stopReason === 'max_tokens') break;
    if (i === maxIterations - 1) {
      detail = `Достигнут лимит ${maxIterations} шагов с инструментами`;
      stopReason = 'max_tokens';
    }
  }
  return { messages: added, usage: total, stopReason, detail };
}

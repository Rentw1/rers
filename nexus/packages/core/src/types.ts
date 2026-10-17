export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type Role = 'user' | 'assistant';

export interface TextBlock {
  type: 'text';
  text: string;
}

export interface ImageBlock {
  type: 'image';
  mediaType: string;
  data: string;
}

export interface ReasoningBlock {
  type: 'reasoning';
  text: string;
}

export interface ToolCallBlock {
  type: 'tool_call';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultBlock {
  type: 'tool_result';
  toolCallId: string;
  name: string;
  content: string;
  isError?: boolean;
  images?: { mediaType: string; data: string }[];
}

export type Block = TextBlock | ImageBlock | ReasoningBlock | ToolCallBlock | ToolResultBlock;

/** Provider-native content kept verbatim so reasoning signatures survive replay. */
export interface ProviderRaw {
  kind: ProviderKind;
  providerId: string;
  modelId: string;
  content: unknown;
}

export interface ChatMessage {
  role: Role;
  blocks: Block[];
  raw?: ProviderRaw;
}

export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
  estimated: boolean;
}

export type StopReason = 'end' | 'tool_use' | 'max_tokens' | 'refusal' | 'content_filter' | 'aborted';

export type StreamEvent =
  | { type: 'text'; delta: string }
  | { type: 'reasoning'; delta: string }
  | { type: 'tool_call_start'; id: string; name: string }
  | { type: 'tool_call_delta'; id: string; delta: string }
  | { type: 'usage'; usage: Usage }
  | { type: 'done'; message: ChatMessage; stopReason: StopReason; usage: Usage; detail?: string };

export type ProviderKind = 'openai' | 'anthropic' | 'gemini';

export interface ModelInfo {
  id: string;
  name: string;
  contextWindow?: number;
  maxOutput?: number;
  vision?: boolean;
  tools?: boolean;
  reasoning?: boolean;
  /** USD per 1M tokens when the listing endpoint reports it (OpenRouter). */
  pricing?: Price;
}

export interface Price {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
}

export interface ProviderConfig {
  id: string;
  kind: ProviderKind;
  baseUrl: string;
  apiKey: string;
  headers?: Record<string, string>;
  streamUsage?: boolean;
}

export interface ChatRequest {
  model: string;
  system?: string;
  messages: ChatMessage[];
  tools?: ToolSpec[];
  maxOutputTokens?: number;
  temperature?: number;
}

export interface LLMProvider {
  readonly config: ProviderConfig;
  chat(req: ChatRequest, signal?: AbortSignal): AsyncIterable<StreamEvent>;
  listModels(signal?: AbortSignal): Promise<ModelInfo[]>;
}

export const emptyUsage = (): Usage => ({
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  reasoningTokens: 0,
  estimated: false,
});

export function addUsage(a: Usage, b: Usage): Usage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
    reasoningTokens: a.reasoningTokens + b.reasoningTokens,
    estimated: a.estimated || b.estimated,
  };
}

export function messageText(m: ChatMessage): string {
  return m.blocks
    .filter((b): b is TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
}

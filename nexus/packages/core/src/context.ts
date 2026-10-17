import { estimateTokens } from './pricing';
import type { ChatMessage } from './types';

const IMAGE_TOKENS = 1600;

export function estimateMessageTokens(m: ChatMessage): number {
  let n = 4;
  for (const b of m.blocks) {
    if (b.type === 'text' || b.type === 'reasoning') n += estimateTokens(b.text);
    else if (b.type === 'image') n += IMAGE_TOKENS;
    else if (b.type === 'tool_call') n += estimateTokens(b.name + JSON.stringify(b.input ?? {}));
    else if (b.type === 'tool_result') n += estimateTokens(b.content) + (b.images?.length ?? 0) * IMAGE_TOKENS;
  }
  return n;
}

const isTurnStart = (m: ChatMessage) => m.role === 'user' && m.blocks.some((b) => b.type !== 'tool_result');

/**
 * Drops the oldest whole turns (a user message with everything that answers it) until the history fits.
 * Turn boundaries keep tool_call/tool_result pairs intact. The latest turn is always kept.
 */
export function trimHistory(messages: ChatMessage[], budgetTokens: number, fixedTokens = 0): { messages: ChatMessage[]; dropped: number } {
  const sizes = messages.map(estimateMessageTokens);
  let total = fixedTokens + sizes.reduce((a, b) => a + b, 0);
  if (total <= budgetTokens) return { messages, dropped: 0 };
  const starts = messages.map((m, i) => (isTurnStart(m) ? i : -1)).filter((i) => i >= 0);
  let cut = 0;
  for (let k = 1; k < starts.length && total > budgetTokens; k++) {
    const next = starts[k]!;
    for (let i = cut; i < next; i++) total -= sizes[i]!;
    cut = next;
  }
  return { messages: messages.slice(cut), dropped: cut };
}

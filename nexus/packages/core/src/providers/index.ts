import type { FetchLike, LLMProvider, ProviderConfig } from '../types';
import { AnthropicProvider } from './anthropic';
import { GeminiProvider } from './gemini';
import { OpenAICompatibleProvider } from './openai';

export function createProvider(config: ProviderConfig, fetchFn: FetchLike): LLMProvider {
  switch (config.kind) {
    case 'anthropic':
      return new AnthropicProvider(config, fetchFn);
    case 'gemini':
      return new GeminiProvider(config, fetchFn);
    case 'openai':
      return new OpenAICompatibleProvider(config, fetchFn);
  }
}

export * from './catalog';
export { OpenAICompatibleProvider, toOpenAIMessages, normalizeOpenAIUsage } from './openai';
export { AnthropicProvider, toAnthropicMessages, supportsAdaptiveThinking, supportsDefaultFallback } from './anthropic';
export { GeminiProvider, toGeminiContents, sanitizeSchema } from './gemini';

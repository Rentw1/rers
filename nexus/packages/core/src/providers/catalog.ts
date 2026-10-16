import type { ModelInfo, ProviderKind } from '../types';

export interface CatalogEntry {
  id: string;
  name: string;
  kind: ProviderKind;
  baseUrl: string;
  keyUrl?: string;
  pricingUrl?: string;
  docsUrl?: string;
  requiresKey: boolean;
  /** Base URL is user-supplied (local servers, custom endpoints). */
  editableBaseUrl: boolean;
  streamUsage: boolean;
  headers?: Record<string, string>;
  description: string;
  models: ModelInfo[];
}

const m = (id: string, name: string, extra: Partial<ModelInfo> = {}): ModelInfo => ({ id, name, tools: true, ...extra });

export const CATALOG: CatalogEntry[] = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    kind: 'openai',
    baseUrl: 'https://api.deepseek.com',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    pricingUrl: 'https://api-docs.deepseek.com/quick_start/pricing',
    docsUrl: 'https://api-docs.deepseek.com',
    requiresKey: true,
    editableBaseUrl: false,
    streamUsage: true,
    description: 'Основной провайдер. Дёшево, сильные модели, кэш контекста.',
    models: [
      m('deepseek-chat', 'DeepSeek Chat', { contextWindow: 128_000, maxOutput: 8_192 }),
      m('deepseek-reasoner', 'DeepSeek Reasoner', { contextWindow: 128_000, maxOutput: 64_000, reasoning: true }),
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    kind: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    keyUrl: 'https://platform.openai.com/api-keys',
    pricingUrl: 'https://openai.com/api/pricing',
    docsUrl: 'https://platform.openai.com/docs',
    requiresKey: true,
    editableBaseUrl: false,
    streamUsage: true,
    description: 'GPT-модели.',
    models: [
      m('gpt-5', 'GPT-5', { contextWindow: 400_000, vision: true, reasoning: true }),
      m('gpt-5-mini', 'GPT-5 mini', { contextWindow: 400_000, vision: true, reasoning: true }),
      m('gpt-4.1', 'GPT-4.1', { contextWindow: 1_047_576, vision: true }),
      m('gpt-4o-mini', 'GPT-4o mini', { contextWindow: 128_000, vision: true }),
    ],
  },
  {
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    kind: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    pricingUrl: 'https://www.anthropic.com/pricing#api',
    docsUrl: 'https://docs.anthropic.com',
    requiresKey: true,
    editableBaseUrl: false,
    streamUsage: true,
    description: 'Модели Claude.',
    models: [
      m('claude-opus-5-5', 'Claude Opus 5.5', { contextWindow: 1_000_000, maxOutput: 128_000, vision: true, reasoning: true }),
      m('claude-sonnet-5-5', 'Claude Sonnet 5.5', { contextWindow: 1_000_000, maxOutput: 128_000, vision: true, reasoning: true }),
      m('claude-haiku-5-5', 'Claude Haiku 5.5', { contextWindow: 1_000_000, maxOutput: 128_000, vision: true, reasoning: true }),
      m('claude-fable-5-1', 'Claude Fable 5.1', { contextWindow: 1_000_000, maxOutput: 128_000, vision: true, reasoning: true }),
    ],
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    kind: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com',
    keyUrl: 'https://aistudio.google.com/apikey',
    pricingUrl: 'https://ai.google.dev/gemini-api/docs/pricing',
    docsUrl: 'https://ai.google.dev/gemini-api/docs',
    requiresKey: true,
    editableBaseUrl: false,
    streamUsage: true,
    description: 'Gemini, есть бесплатный тариф.',
    models: [
      m('gemini-2.5-pro', 'Gemini 2.5 Pro', { contextWindow: 1_048_576, vision: true, reasoning: true }),
      m('gemini-2.5-flash', 'Gemini 2.5 Flash', { contextWindow: 1_048_576, vision: true, reasoning: true }),
      m('gemini-2.5-flash-lite', 'Gemini 2.5 Flash-Lite', { contextWindow: 1_048_576, vision: true }),
    ],
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    kind: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    keyUrl: 'https://openrouter.ai/settings/keys',
    pricingUrl: 'https://openrouter.ai/models',
    docsUrl: 'https://openrouter.ai/docs',
    requiresKey: true,
    editableBaseUrl: false,
    streamUsage: true,
    headers: { 'HTTP-Referer': 'https://github.com/Rentw1/rers', 'X-Title': 'Nexus' },
    description: 'Сотни моделей одним ключом, цены подтягиваются автоматически.',
    models: [
      m('deepseek/deepseek-chat', 'DeepSeek Chat'),
      m('openai/gpt-5-mini', 'GPT-5 mini', { vision: true }),
      m('google/gemini-2.5-flash', 'Gemini 2.5 Flash', { vision: true }),
      m('meta-llama/llama-3.3-70b-instruct', 'Llama 3.3 70B'),
    ],
  },
  {
    id: 'groq',
    name: 'Groq',
    kind: 'openai',
    baseUrl: 'https://api.groq.com/openai/v1',
    keyUrl: 'https://console.groq.com/keys',
    pricingUrl: 'https://groq.com/pricing',
    docsUrl: 'https://console.groq.com/docs',
    requiresKey: true,
    editableBaseUrl: false,
    streamUsage: true,
    description: 'Очень быстрый инференс открытых моделей.',
    models: [
      m('llama-3.3-70b-versatile', 'Llama 3.3 70B', { contextWindow: 131_072 }),
      m('llama-3.1-8b-instant', 'Llama 3.1 8B', { contextWindow: 131_072 }),
      m('openai/gpt-oss-120b', 'GPT-OSS 120B', { contextWindow: 131_072, reasoning: true }),
    ],
  },
  {
    id: 'mistral',
    name: 'Mistral',
    kind: 'openai',
    baseUrl: 'https://api.mistral.ai/v1',
    keyUrl: 'https://console.mistral.ai/api-keys',
    pricingUrl: 'https://mistral.ai/pricing',
    docsUrl: 'https://docs.mistral.ai',
    requiresKey: true,
    editableBaseUrl: false,
    streamUsage: false,
    description: 'Европейские модели Mistral.',
    models: [
      m('mistral-large-latest', 'Mistral Large', { contextWindow: 128_000 }),
      m('mistral-medium-latest', 'Mistral Medium', { contextWindow: 128_000, vision: true }),
      m('mistral-small-latest', 'Mistral Small', { contextWindow: 128_000, vision: true }),
    ],
  },
  {
    id: 'xai',
    name: 'xAI (Grok)',
    kind: 'openai',
    baseUrl: 'https://api.x.ai/v1',
    keyUrl: 'https://console.x.ai',
    pricingUrl: 'https://docs.x.ai/docs/models',
    docsUrl: 'https://docs.x.ai',
    requiresKey: true,
    editableBaseUrl: false,
    streamUsage: true,
    description: 'Модели Grok.',
    models: [m('grok-4', 'Grok 4', { contextWindow: 256_000, vision: true, reasoning: true }), m('grok-3-mini', 'Grok 3 mini', { reasoning: true })],
  },
  {
    id: 'qwen',
    name: 'Qwen (Alibaba)',
    kind: 'openai',
    baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    keyUrl: 'https://bailian.console.alibabacloud.com/?apiKey=1',
    pricingUrl: 'https://www.alibabacloud.com/help/en/model-studio/models',
    docsUrl: 'https://www.alibabacloud.com/help/en/model-studio',
    requiresKey: true,
    editableBaseUrl: false,
    streamUsage: true,
    description: 'Модели Qwen.',
    models: [m('qwen-max', 'Qwen Max'), m('qwen-plus', 'Qwen Plus'), m('qwen-turbo', 'Qwen Turbo')],
  },
  {
    id: 'moonshot',
    name: 'Moonshot (Kimi)',
    kind: 'openai',
    baseUrl: 'https://api.moonshot.ai/v1',
    keyUrl: 'https://platform.moonshot.ai/console/api-keys',
    pricingUrl: 'https://platform.moonshot.ai/docs/pricing',
    docsUrl: 'https://platform.moonshot.ai/docs',
    requiresKey: true,
    editableBaseUrl: false,
    streamUsage: true,
    description: 'Модели Kimi.',
    models: [m('kimi-k2-0905-preview', 'Kimi K2', { contextWindow: 256_000 })],
  },
  {
    id: 'together',
    name: 'Together AI',
    kind: 'openai',
    baseUrl: 'https://api.together.xyz/v1',
    keyUrl: 'https://api.together.ai/settings/api-keys',
    pricingUrl: 'https://www.together.ai/pricing',
    docsUrl: 'https://docs.together.ai',
    requiresKey: true,
    editableBaseUrl: false,
    streamUsage: true,
    description: 'Открытые модели в облаке.',
    models: [m('meta-llama/Llama-3.3-70B-Instruct-Turbo', 'Llama 3.3 70B Turbo'), m('deepseek-ai/DeepSeek-V3', 'DeepSeek V3')],
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    kind: 'openai',
    baseUrl: 'https://api.perplexity.ai',
    keyUrl: 'https://www.perplexity.ai/settings/api',
    pricingUrl: 'https://docs.perplexity.ai/guides/pricing',
    docsUrl: 'https://docs.perplexity.ai',
    requiresKey: true,
    editableBaseUrl: false,
    streamUsage: false,
    description: 'Модели с поиском по интернету.',
    models: [m('sonar', 'Sonar', { tools: false }), m('sonar-pro', 'Sonar Pro', { tools: false }), m('sonar-reasoning', 'Sonar Reasoning', { tools: false, reasoning: true })],
  },
  {
    id: 'ollama',
    name: 'Ollama (локально)',
    kind: 'openai',
    baseUrl: 'http://192.168.1.10:11434/v1',
    keyUrl: 'https://ollama.com/download',
    docsUrl: 'https://github.com/ollama/ollama/blob/main/docs/openai.md',
    requiresKey: false,
    editableBaseUrl: true,
    streamUsage: true,
    description: 'Модели на вашем ПК. Запустите Ollama с OLLAMA_HOST=0.0.0.0 и укажите IP компьютера.',
    models: [],
  },
  {
    id: 'lmstudio',
    name: 'LM Studio (локально)',
    kind: 'openai',
    baseUrl: 'http://192.168.1.10:1234/v1',
    keyUrl: 'https://lmstudio.ai',
    docsUrl: 'https://lmstudio.ai/docs/app/api',
    requiresKey: false,
    editableBaseUrl: true,
    streamUsage: true,
    description: 'Локальный сервер LM Studio (включите «Serve on Local Network»).',
    models: [],
  },
];

export const CUSTOM_PROVIDER_PREFIX = 'custom-';

export function catalogEntry(id: string): CatalogEntry | undefined {
  return CATALOG.find((c) => c.id === id);
}

export const DEFAULT_PROVIDER_ID = 'deepseek';
export const DEFAULT_MODEL_ID = 'deepseek-chat';

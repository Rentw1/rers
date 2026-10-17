import type { Block, ProviderKind, ProviderRaw, ToolResultBlock, Usage } from '@nexus/core';

export interface Chat {
  id: string;
  title: string;
  providerId: string;
  modelId: string;
  activeLeafId: string | null;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface StoredMessage {
  id: string;
  chatId: string;
  parentId: string | null;
  role: 'user' | 'assistant';
  blocks: Block[];
  raw: ProviderRaw | null;
  providerId: string | null;
  modelId: string | null;
  stopReason: string | null;
  createdAt: number;
}

export interface ProviderRow {
  id: string;
  name: string;
  kind: ProviderKind;
  baseUrl: string;
  enabled: boolean;
  isCustom: boolean;
  hasKey: boolean;
  streamUsage: boolean;
  description?: string;
  keyUrl?: string;
  pricingUrl?: string;
  docsUrl?: string;
  requiresKey: boolean;
  editableBaseUrl: boolean;
}

export interface ModelRow {
  providerId: string;
  id: string;
  name: string;
  contextWindow?: number;
  maxOutput?: number;
  vision?: boolean;
  tools?: boolean;
  reasoning?: boolean;
  visible: boolean;
  favorite: boolean;
  price?: { input: number; output: number; cacheRead?: number; source: string } | null;
}

export interface McpServerDef {
  id: string;
  name: string;
  type: 'stdio' | 'http';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  enabled: boolean;
}

export interface McpServerStatus {
  id: string;
  status: 'starting' | 'ready' | 'error' | 'stopped';
  tools: number;
  error?: string;
}

export interface ToolInfo {
  serverId: string;
  name: string;
  description?: string;
  enabled: boolean;
  approval: 'ask' | 'always';
}

export interface Settings {
  theme: 'system' | 'light' | 'dark';
  defaultProviderId: string;
  defaultModelId: string;
  customInstructions: string;
  currency: 'USD' | 'RUB' | 'EUR';
  fx: { RUB: number; EUR: number; updatedAt: number } | null;
  showCost: boolean;
  showReasoning: boolean;
  autoTitle: boolean;
  temperature: number | null;
  maxOutputTokens: number | null;
  pcToolsEnabled: boolean;
  allowedDirs: string[];
  shellEnabled: boolean;
  shellAllow: string[];
  relayEnabled: boolean;
  relayPort: number;
  relayName: string;
  pricesSyncedAt: number;
  sendOnEnter: boolean;
  onboarded: boolean;
}

export interface Budget {
  id: string;
  scope: string;
  period: 'day' | 'month';
  limitMicro: number;
  hard: boolean;
}

export interface UsageEvent {
  chatId: string | null;
  messageId: string | null;
  providerId: string;
  modelId: string;
  usage: Usage;
  costMicro: number;
  kind: 'chat' | 'title';
  createdAt: number;
}

export interface UsageReport {
  totalMicro: number;
  requests: number;
  byDay: { day: string; costMicro: number }[];
  byProvider: { key: string; costMicro: number; requests: number }[];
  byModel: { key: string; costMicro: number; requests: number; inputTokens: number; outputTokens: number; cacheReadTokens: number }[];
  byChat: { key: string; title: string; costMicro: number }[];
  budgets: { budget: Budget; spent: number; ratio: number }[];
  balances: { label: string; value: string }[];
}

export interface Attachment {
  kind: 'image' | 'text';
  name: string;
  mediaType: string;
  data: string;
}

export type LiveBlock = { type: 'text'; text: string } | { type: 'reasoning'; text: string } | { type: 'tool_call'; id: string; name: string; argsText: string };

export type ChatEvent =
  | { chatId: string; kind: 'live'; blocks: LiveBlock[] | null }
  | { chatId: string; kind: 'running'; running: boolean }
  | { chatId: string; kind: 'changed' }
  | { chatId: string; kind: 'error'; message: string | null }
  | { chatId: string; kind: 'notices'; notices: string[] | null }
  | { chatId: string; kind: 'tool'; callId: string; status: 'running' | 'done' | 'error'; result?: ToolResultBlock }
  | { chatId: null; kind: 'list' };

export interface ApprovalRequest {
  callId: string;
  chatId: string;
  serverName: string;
  toolTitle: string;
  args: Record<string, unknown>;
  destructive: boolean;
}

export interface RelayStatus {
  enabled: boolean;
  running: boolean;
  port: number;
  urls: string[];
  qr: string | null;
  pairUri: string | null;
  expiresAt: number | null;
  devices: { id: string; name: string; lastSeenAt: number; lastIp?: string }[];
  error?: string;
}

export interface UpdateInfo {
  version: string;
  url: string;
  notes: string;
}

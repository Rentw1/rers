import { create } from 'zustand';
import type { ToolResultBlock } from '@nexus/core';

export type LiveBlock = { type: 'text'; text: string } | { type: 'reasoning'; text: string } | { type: 'tool_call'; id: string; name: string; argsText: string };

export type ToolStatus = 'running' | 'done' | 'error';

export interface ToolState {
  status: ToolStatus;
  result?: ToolResultBlock;
  startedAt: number;
  finishedAt?: number;
}

interface ChatRuntime {
  live: Record<string, LiveBlock[] | undefined>;
  running: Record<string, AbortController | undefined>;
  tools: Record<string, ToolState | undefined>;
  version: Record<string, number>;
  errors: Record<string, string | null | undefined>;
  notices: Record<string, string[] | undefined>;
  chatListVersion: number;
}

export const useChatRuntime = create<ChatRuntime>(() => ({ live: {}, running: {}, tools: {}, version: {}, errors: {}, notices: {}, chatListVersion: 0 }));

export const runtime = {
  get: () => useChatRuntime.getState(),
  setLive: (chatId: string, blocks: LiveBlock[] | undefined) => useChatRuntime.setState((s) => ({ live: { ...s.live, [chatId]: blocks } })),
  setRunning: (chatId: string, c: AbortController | undefined) => useChatRuntime.setState((s) => ({ running: { ...s.running, [chatId]: c } })),
  setTool: (callId: string, t: ToolState) => useChatRuntime.setState((s) => ({ tools: { ...s.tools, [callId]: t } })),
  bump: (chatId: string) => useChatRuntime.setState((s) => ({ version: { ...s.version, [chatId]: (s.version[chatId] ?? 0) + 1 } })),
  bumpList: () => useChatRuntime.setState((s) => ({ chatListVersion: s.chatListVersion + 1 })),
  setError: (chatId: string, e: string | null) => useChatRuntime.setState((s) => ({ errors: { ...s.errors, [chatId]: e } })),
  setNotices: (chatId: string, n: string[] | undefined) => useChatRuntime.setState((s) => ({ notices: { ...s.notices, [chatId]: n } })),
};

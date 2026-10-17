import type { ApprovalRequest, ChatEvent } from '../shared/types';

interface Bridge {
  invoke: <T = unknown>(channel: string, ...args: unknown[]) => Promise<T>;
  on: (channel: 'chat:event' | 'approval:request' | 'app:command', fn: (payload: unknown) => void) => () => void;
  platform: string;
}

declare global {
  interface Window {
    nexus: Bridge;
  }
}

export const api = {
  invoke: <T = unknown>(channel: string, ...args: unknown[]) => window.nexus.invoke<T>(channel, ...args),
  onChat: (fn: (e: ChatEvent) => void) => window.nexus.on('chat:event', (p) => fn(p as ChatEvent)),
  onApproval: (fn: (r: ApprovalRequest) => void) => window.nexus.on('approval:request', (p) => fn(p as ApprovalRequest)),
  onCommand: (fn: (c: string) => void) => window.nexus.on('app:command', (p) => fn(p as string)),
  open: (url: string) => void window.nexus.invoke('app:open', url),
};

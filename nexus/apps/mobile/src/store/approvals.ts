import { create } from 'zustand';

export type ApprovalDecision = 'once' | 'always' | 'deny';

export interface PendingApproval {
  callId: string;
  serverName: string;
  toolTitle: string;
  args: Record<string, unknown>;
  destructive: boolean;
  resolve: (d: ApprovalDecision) => void;
}

interface ApprovalState {
  pending: Record<string, PendingApproval>;
  request: (p: Omit<PendingApproval, 'resolve'>, signal?: AbortSignal) => Promise<ApprovalDecision>;
  decide: (callId: string, d: ApprovalDecision) => void;
  denyAll: () => void;
}

export const useApprovals = create<ApprovalState>((set, get) => ({
  pending: {},
  request: (p, signal) =>
    new Promise<ApprovalDecision>((resolve) => {
      const done = (d: ApprovalDecision) => {
        signal?.removeEventListener('abort', onAbort);
        set((s) => {
          const next = { ...s.pending };
          delete next[p.callId];
          return { pending: next };
        });
        resolve(d);
      };
      const onAbort = () => done('deny');
      if (signal?.aborted) return resolve('deny');
      signal?.addEventListener('abort', onAbort, { once: true });
      set((s) => ({ pending: { ...s.pending, [p.callId]: { ...p, resolve: done } } }));
    }),
  decide: (callId, d) => get().pending[callId]?.resolve(d),
  denyAll: () => {
    for (const p of Object.values(get().pending)) p.resolve('deny');
  },
}));

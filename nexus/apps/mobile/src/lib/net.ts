import { fetch as expoFetch } from 'expo/fetch';
import type { FetchLike } from '@nexus/core';

/** Streaming-capable fetch (ReadableStream bodies) for providers and MCP. */
export const appFetch: FetchLike = (url, init) => expoFetch(url, init as Parameters<typeof expoFetch>[1]) as unknown as Promise<Response>;

/** fetch with a timeout, for short control requests. */
export async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 8000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  const outer = init.signal;
  const onAbort = () => ctrl.abort();
  outer?.addEventListener('abort', onAbort, { once: true });
  try {
    return await appFetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
    outer?.removeEventListener('abort', onAbort);
  }
}

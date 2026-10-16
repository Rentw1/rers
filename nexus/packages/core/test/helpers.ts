import type { FetchLike } from '../src/types';

export function sseBody(events: (string | { event?: string; data: unknown })[], chunkSize = 7): ReadableStream<Uint8Array> {
  const text = events
    .map((e) => {
      if (typeof e === 'string') return `data: ${e}\n\n`;
      const data = typeof e.data === 'string' ? e.data : JSON.stringify(e.data);
      return `${e.event ? `event: ${e.event}\n` : ''}data: ${data}\n\n`;
    })
    .join('');
  const bytes = new TextEncoder().encode(text);
  let i = 0;
  return new ReadableStream({
    pull(ctrl) {
      if (i >= bytes.length) return ctrl.close();
      ctrl.enqueue(bytes.slice(i, i + chunkSize));
      i += chunkSize;
    },
  });
}

export interface Captured {
  url: string;
  init: RequestInit;
  body: unknown;
}

export function mockFetch(handler: (url: string, init: RequestInit, body: unknown) => Response | Promise<Response>): { fetch: FetchLike; calls: Captured[] } {
  const calls: Captured[] = [];
  const fetchFn: FetchLike = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : String(input);
    let body: unknown = init.body;
    if (typeof init.body === 'string') {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }
    calls.push({ url, init, body });
    return handler(url, init, body);
  };
  return { fetch: fetchFn, calls };
}

export function sseResponse(events: (string | { event?: string; data: unknown })[], headers: Record<string, string> = {}): Response {
  return new Response(sseBody(events), { status: 200, headers: { 'content-type': 'text/event-stream', ...headers } });
}

export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

export async function collect<T>(it: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const x of it) out.push(x);
  return out;
}

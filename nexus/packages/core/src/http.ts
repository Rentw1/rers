import type { FetchLike } from './types';

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryable: boolean,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export class AbortError extends Error {
  constructor() {
    super('Aborted');
    this.name = 'AbortError';
  }
}

export function isAbort(e: unknown): boolean {
  return e instanceof AbortError || (e instanceof Error && (e.name === 'AbortError' || /abort/i.test(e.message)));
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new AbortError());
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new AbortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export function retryAfterMs(res: Response, attempt: number): number {
  const h = res.headers.get('retry-after');
  if (h) {
    const s = Number(h);
    if (Number.isFinite(s)) return Math.min(s * 1000, 60_000);
    const d = Date.parse(h);
    if (!Number.isNaN(d)) return Math.min(Math.max(d - Date.now(), 0), 60_000);
  }
  return Math.min(1000 * 2 ** attempt + Math.floor(Math.random() * 250), 20_000);
}

async function errorFrom(res: Response): Promise<ProviderError> {
  let text = '';
  try {
    text = await res.text();
  } catch {
    // body unavailable
  }
  let message = text.slice(0, 500) || res.statusText || `HTTP ${res.status}`;
  let code: string | undefined;
  try {
    const j = JSON.parse(text) as Record<string, unknown>;
    const err = (Array.isArray(j) ? j[0]?.error : j.error) as Record<string, unknown> | string | undefined;
    if (typeof err === 'string') message = err;
    else if (err && typeof err.message === 'string') {
      message = err.message;
      code = typeof err.code === 'string' ? err.code : typeof err.type === 'string' ? err.type : typeof err.status === 'string' ? err.status : undefined;
    } else if (typeof j.message === 'string') message = j.message;
    else if (typeof j.detail === 'string') message = j.detail;
  } catch {
    // not json
  }
  const retryable = res.status === 408 || res.status === 409 || res.status === 429 || res.status >= 500;
  return new ProviderError(`${res.status}: ${message}`, res.status, retryable, code);
}

/** Sends a request, retrying 408/409/429/5xx and network failures before any body is consumed. */
export async function request(
  fetchFn: FetchLike,
  url: string,
  init: RequestInit & { signal?: AbortSignal },
  maxRetries = 3,
): Promise<Response> {
  let attempt = 0;
  for (;;) {
    if (init.signal?.aborted) throw new AbortError();
    let res: Response;
    try {
      res = await fetchFn(url, init);
    } catch (e) {
      if (isAbort(e) || init.signal?.aborted) throw new AbortError();
      if (attempt >= maxRetries) throw new ProviderError(`Network error: ${(e as Error).message}`, 0, true);
      await sleep(Math.min(1000 * 2 ** attempt, 8000), init.signal);
      attempt++;
      continue;
    }
    if (res.ok) return res;
    const err = await errorFrom(res);
    if (!err.retryable || attempt >= maxRetries) throw err;
    await sleep(retryAfterMs(res, attempt), init.signal);
    attempt++;
  }
}

export function joinUrl(base: string, path: string): string {
  return base.replace(/\/+$/, '') + '/' + path.replace(/^\/+/, '');
}

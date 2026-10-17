export interface SSEMessage {
  event: string;
  data: string;
  id?: string;
}

type ByteSource = ReadableStream<Uint8Array> | AsyncIterable<Uint8Array | string>;

async function* chunks(source: ByteSource): AsyncGenerator<Uint8Array | string> {
  if (typeof (source as ReadableStream<Uint8Array>).getReader === 'function') {
    const reader = (source as ReadableStream<Uint8Array>).getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        if (value) yield value;
      }
    } finally {
      try {
        await reader.cancel();
      } catch {
        // already closed
      }
      reader.releaseLock?.();
    }
  } else {
    yield* source as AsyncIterable<Uint8Array | string>;
  }
}

/** Splits a byte stream into lines, tolerant of \n, \r\n and \r terminators and of multi-byte chars split across chunks. */
export async function* lines(source: ByteSource): AsyncGenerator<string> {
  const decoder = new TextDecoder('utf-8');
  let buf = '';
  let lastWasCR = false;
  for await (const chunk of chunks(source)) {
    buf += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
    let start = 0;
    for (let i = 0; i < buf.length; i++) {
      const c = buf.charCodeAt(i);
      if (c === 10) {
        if (lastWasCR && i === start) {
          start = i + 1;
          lastWasCR = false;
          continue;
        }
        yield buf.slice(start, i);
        start = i + 1;
        lastWasCR = false;
      } else if (c === 13) {
        yield buf.slice(start, i);
        start = i + 1;
        lastWasCR = true;
      } else {
        lastWasCR = false;
      }
    }
    buf = buf.slice(start);
  }
  buf += decoder.decode();
  if (buf.length) yield buf;
}

export async function* parseSSE(source: ByteSource): AsyncGenerator<SSEMessage> {
  let event = '';
  let data: string[] = [];
  let id: string | undefined;
  const flush = (): SSEMessage | null => {
    if (!data.length) {
      event = '';
      return null;
    }
    const msg: SSEMessage = { event: event || 'message', data: data.join('\n'), id };
    event = '';
    data = [];
    return msg;
  };
  for await (const line of lines(source)) {
    if (line === '') {
      const msg = flush();
      if (msg) yield msg;
      continue;
    }
    if (line.startsWith(':')) continue;
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'data') data.push(value);
    else if (field === 'event') event = value;
    else if (field === 'id') id = value;
  }
  const msg = flush();
  if (msg) yield msg;
}

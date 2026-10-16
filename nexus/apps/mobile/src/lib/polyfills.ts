/** Streaming UTF-8 TextDecoder, installed only when the runtime lacks one (SSE parsing and the Anthropic SDK need it). */
class Utf8Decoder {
  readonly encoding = 'utf-8';
  readonly fatal = false;
  readonly ignoreBOM = false;
  private pending: number[] = [];

  decode(input?: ArrayBuffer | ArrayBufferView, options?: { stream?: boolean }): string {
    const bytes = input === undefined ? new Uint8Array(0) : input instanceof ArrayBuffer ? new Uint8Array(input) : new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    const data = this.pending.length ? Uint8Array.from([...this.pending, ...bytes]) : bytes;
    this.pending = [];
    let out = '';
    let i = 0;
    while (i < data.length) {
      const b = data[i]!;
      const need = b < 0x80 ? 0 : b < 0xc0 ? -1 : b < 0xe0 ? 1 : b < 0xf0 ? 2 : b < 0xf8 ? 3 : -1;
      if (need < 0) {
        out += '�';
        i++;
        continue;
      }
      if (need > 0 && i + need >= data.length) {
        if (options?.stream) {
          this.pending = Array.from(data.subarray(i));
          break;
        }
        out += '�';
        break;
      }
      let cp = need === 0 ? b : need === 1 ? b & 0x1f : need === 2 ? b & 0x0f : b & 0x07;
      let ok = true;
      for (let k = 1; k <= need; k++) {
        const c = data[i + k]!;
        if ((c & 0xc0) !== 0x80) {
          ok = false;
          break;
        }
        cp = (cp << 6) | (c & 0x3f);
      }
      if (!ok) {
        out += '�';
        i++;
        continue;
      }
      out += String.fromCodePoint(cp);
      i += need + 1;
    }
    return out;
  }
}

const g = globalThis as unknown as { TextDecoder?: unknown };
if (typeof g.TextDecoder === 'undefined') g.TextDecoder = Utf8Decoder;

export { Utf8Decoder };

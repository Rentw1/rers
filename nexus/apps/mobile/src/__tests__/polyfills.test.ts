import { Utf8Decoder } from '../lib/polyfills';

describe('Utf8Decoder', () => {
  it('decodes multi-byte text split across stream chunks', () => {
    const bytes = new TextEncoder().encode('Привет, 世界 🙂!');
    const d = new Utf8Decoder();
    let out = '';
    for (let i = 0; i < bytes.length; i += 3) out += d.decode(bytes.subarray(i, i + 3), { stream: true });
    out += d.decode();
    expect(out).toBe('Привет, 世界 🙂!');
  });

  it('replaces invalid and truncated sequences', () => {
    const d = new Utf8Decoder();
    expect(d.decode(new Uint8Array([0x61, 0xff, 0x62]))).toBe('a�b');
    expect(d.decode(new Uint8Array([0xe4, 0xb8]))).toBe('�');
  });
});

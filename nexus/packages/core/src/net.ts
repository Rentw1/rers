/** True for loopback, RFC1918, link-local, CGNAT/Tailscale (100.64/10), .local and .ts.net hosts. */
export function isPrivateHost(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, '').toLowerCase();
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.ts.net') || h.endsWith('.lan') || h.endsWith('.home.arpa')) return true;
  if (h === '::1' || h.startsWith('fe80:') || h.startsWith('fc') || h.startsWith('fd')) return true;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if ([a, b, Number(m[3]), Number(m[4])].some((n) => n > 255)) return false;
  return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127);
}

/** Rejects plain-HTTP URLs to public hosts so secrets never travel unencrypted over the internet. */
export function checkUrlSecurity(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return 'Некорректный URL';
  }
  if (u.protocol === 'https:') return null;
  if (u.protocol === 'http:') return isPrivateHost(u.hostname) ? null : 'HTTP без шифрования разрешён только для локальной сети и Tailscale. Используйте https://';
  return 'Поддерживаются только http(s) адреса';
}

import { randomBytes, scryptSync, timingSafeEqual, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { DATA_DIR, readJson, writeJsonAtomic } from './config';

export interface Device {
  id: string;
  name: string;
  salt: string;
  hash: string;
  createdAt: number;
  lastSeenAt: number;
  lastIp?: string;
}

const PAIR_TTL_MS = 10 * 60_000;

function hashSecret(secret: string, salt: string): string {
  return scryptSync(secret, salt, 32, { N: 16384, r: 8, p: 1 }).toString('hex');
}

export class DeviceStore {
  private devices: Device[];
  private pairCode = '';
  private pairExpires = 0;
  private readonly path: string;

  constructor(dir = DATA_DIR) {
    this.path = join(dir, 'devices.json');
    this.devices = readJson<Device[]>(this.path, []);
    this.rotatePairCode();
  }

  list(): Omit<Device, 'salt' | 'hash'>[] {
    return this.devices.map(({ salt: _s, hash: _h, ...d }) => d);
  }

  rotatePairCode(): { code: string; exp: number } {
    this.pairCode = randomBytes(12).toString('base64url');
    this.pairExpires = Date.now() + PAIR_TTL_MS;
    return { code: this.pairCode, exp: this.pairExpires };
  }

  currentPairCode(): { code: string; exp: number } {
    if (Date.now() > this.pairExpires - 30_000) return this.rotatePairCode();
    return { code: this.pairCode, exp: this.pairExpires };
  }

  /** Exchanges a one-time pairing code for a device token `<deviceId>.<secret>`. */
  pair(code: string, deviceName: string, ip?: string): { deviceId: string; token: string } | null {
    const a = Buffer.from(code);
    const b = Buffer.from(this.pairCode);
    if (Date.now() > this.pairExpires || a.length !== b.length || !timingSafeEqual(a, b)) return null;
    this.rotatePairCode();
    const id = randomUUID();
    const secret = randomBytes(32).toString('base64url');
    const salt = randomBytes(16).toString('hex');
    this.devices.push({ id, name: deviceName.slice(0, 100), salt, hash: hashSecret(secret, salt), createdAt: Date.now(), lastSeenAt: Date.now(), lastIp: ip });
    this.save();
    return { deviceId: id, token: `${id}.${secret}` };
  }

  private readonly verified = new Map<string, number>();

  verify(token: string | undefined, ip?: string): Device | null {
    if (!token) return null;
    const dot = token.indexOf('.');
    if (dot <= 0) return null;
    const id = token.slice(0, dot);
    const secret = token.slice(dot + 1);
    const d = this.devices.find((x) => x.id === id);
    if (!d) return null;
    // scrypt is deliberately slow; cache successful verifications briefly.
    const cached = this.verified.get(token);
    if (!cached || cached < Date.now()) {
      const h = Buffer.from(hashSecret(secret, d.salt), 'hex');
      const ok = h.length === 32 && timingSafeEqual(h, Buffer.from(d.hash, 'hex'));
      if (!ok) return null;
      this.verified.set(token, Date.now() + 5 * 60_000);
    }
    if (Date.now() - d.lastSeenAt > 60_000 || d.lastIp !== ip) {
      d.lastSeenAt = Date.now();
      d.lastIp = ip;
      this.save();
    }
    return d;
  }

  revoke(id: string): boolean {
    const before = this.devices.length;
    this.devices = this.devices.filter((d) => d.id !== id);
    for (const k of this.verified.keys()) if (k.startsWith(`${id}.`)) this.verified.delete(k);
    this.save();
    return this.devices.length !== before;
  }

  private save(): void {
    writeJsonAtomic(this.path, this.devices);
  }
}

/** Fixed-window per-key rate limiter. */
export class RateLimiter {
  private readonly hits = new Map<string, { n: number; reset: number }>();
  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  allow(key: string): boolean {
    const now = Date.now();
    const cur = this.hits.get(key);
    if (!cur || cur.reset < now) {
      this.hits.set(key, { n: 1, reset: now + this.windowMs });
      if (this.hits.size > 10_000) for (const [k, v] of this.hits) if (v.reset < now) this.hits.delete(k);
      return true;
    }
    cur.n++;
    return cur.n <= this.limit;
  }

  exceeded(key: string): boolean {
    const cur = this.hits.get(key);
    return !!cur && cur.reset >= Date.now() && cur.n >= this.limit;
  }
}

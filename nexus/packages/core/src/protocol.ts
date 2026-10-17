import { z } from 'zod';
import { base64UrlFromBytes } from './mcp/oauth';

export const RELAY_DEFAULT_PORT = 4545;

export const PairingPayload = z.object({
  v: z.literal(1),
  name: z.string().min(1).max(100),
  urls: z.array(z.string().url()).min(1).max(10),
  code: z.string().min(8).max(128),
  exp: z.number().int(),
});
export type PairingPayload = z.infer<typeof PairingPayload>;

export const PairRequest = z.object({ code: z.string().min(8).max(128), deviceName: z.string().min(1).max(100) });
export const PairResponse = z.object({ deviceId: z.string(), token: z.string().min(32), relayName: z.string() });
export type PairResponse = z.infer<typeof PairResponse>;

export const RelayInfo = z.object({
  name: z.string(),
  version: z.string(),
  platform: z.string(),
  servers: z.array(z.object({ id: z.string(), status: z.enum(['starting', 'ready', 'error', 'stopped']), tools: z.number(), error: z.string().optional() })),
  builtinTools: z.array(z.string()),
});
export type RelayInfo = z.infer<typeof RelayInfo>;

export const SyncChat = z.object({
  id: z.string(),
  title: z.string(),
  projectId: z.string().nullable(),
  providerId: z.string(),
  modelId: z.string(),
  activeLeafId: z.string().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
  deleted: z.boolean(),
});
export type SyncChat = z.infer<typeof SyncChat>;

export const SyncMessage = z.object({
  id: z.string(),
  chatId: z.string(),
  parentId: z.string().nullable(),
  role: z.enum(['user', 'assistant']),
  blocks: z.string(),
  raw: z.string().nullable(),
  providerId: z.string().nullable(),
  modelId: z.string().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
  deleted: z.boolean(),
});
export type SyncMessage = z.infer<typeof SyncMessage>;

export const SyncRequest = z.object({
  since: z.number().int().nonnegative(),
  chats: z.array(SyncChat).max(5000),
  messages: z.array(SyncMessage).max(50000),
});
export type SyncRequest = z.infer<typeof SyncRequest>;

export const SyncResponse = z.object({ now: z.number(), chats: z.array(SyncChat), messages: z.array(SyncMessage) });
export type SyncResponse = z.infer<typeof SyncResponse>;

export function encodePairingUri(p: PairingPayload): string {
  const bytes = new TextEncoder().encode(JSON.stringify(p));
  return `nexus://pair?d=${base64UrlFromBytes(bytes)}`;
}

export function base64UrlToBytes(s: string): Uint8Array {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const clean = s.replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  const out: number[] = [];
  let buf = 0;
  let bits = 0;
  for (const ch of clean) {
    const v = chars.indexOf(ch);
    if (v === -1) throw new Error('Некорректный base64url');
    buf = (buf << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buf >> bits) & 0xff);
    }
  }
  return new Uint8Array(out);
}

export function decodePairingUri(uri: string): PairingPayload {
  const m = /[?&]d=([A-Za-z0-9_\-+/=]+)/.exec(uri.trim());
  if (!m?.[1]) throw new Error('QR-код не похож на код сопряжения Nexus Relay');
  const json = new TextDecoder().decode(base64UrlToBytes(m[1]));
  const parsed = PairingPayload.safeParse(JSON.parse(json));
  if (!parsed.success) throw new Error('Повреждённые данные сопряжения');
  if (parsed.data.exp < Date.now()) throw new Error('Код сопряжения истёк — обновите QR на компьютере');
  return parsed.data;
}

/** Last-write-wins merge keyed by id. */
export function mergeLww<T extends { id: string; updatedAt: number }>(current: Map<string, T>, incoming: T[]): T[] {
  const changed: T[] = [];
  for (const item of incoming) {
    const cur = current.get(item.id);
    if (!cur || item.updatedAt > cur.updatedAt) {
      current.set(item.id, item);
      changed.push(item);
    }
  }
  return changed;
}

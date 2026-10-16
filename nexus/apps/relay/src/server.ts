import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { access, mkdir, rename, unlink } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { networkInterfaces, platform } from 'node:os';
import { basename, join } from 'node:path';
import QRCode from 'qrcode';
import { encodePairingUri, PairRequest, SyncRequest, type PairingPayload, type RelayInfo } from '@nexus/core';
import type { BuiltinTools } from './builtin';
import type { RelayConfig } from './config';
import type { DeviceStore } from './devices';
import { RateLimiter } from './devices';
import { panelHtml } from './panel';
import type { ServerManager } from './servers';
import type { SyncStore } from './sync';

export const RELAY_VERSION = '1.0.0';
const MAX_JSON = 20 * 1024 * 1024;
const MAX_UPLOAD = 200 * 1024 * 1024;

export interface RelayDeps {
  cfg: RelayConfig;
  devices: DeviceStore;
  servers: ServerManager;
  builtin: BuiltinTools;
  sync: SyncStore;
  log: (m: string) => void;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function lanUrls(port: number): string[] {
  const urls: string[] = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      urls.push(`http://${a.address}:${port}`);
    }
  }
  // Tailscale (100.64/10) first: it works from anywhere and is encrypted.
  return urls.sort((a, b) => Number(!/\/\/100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(a)) - Number(!/\/\/100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(b)));
}

export function pairingPayload(deps: RelayDeps): PairingPayload {
  const { code, exp } = deps.devices.currentPairCode();
  const urls = lanUrls(deps.cfg.port);
  return { v: 1, name: deps.cfg.name, urls: urls.length ? urls.slice(0, 10) : [`http://127.0.0.1:${deps.cfg.port}`], code, exp };
}

function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        reject(new HttpError(413, 'Слишком большой запрос'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const buf = await readBody(req, MAX_JSON);
  try {
    return JSON.parse(buf.toString('utf8') || 'null');
  } catch {
    throw new HttpError(400, 'Некорректный JSON');
  }
}

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  const isText = typeof body === 'string';
  res.writeHead(status, { 'Content-Type': isText ? 'text/html; charset=utf-8' : 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers });
  res.end(isText ? body : JSON.stringify(body));
}

const isLoopback = (ip: string | undefined) => !!ip && (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1');

interface Rpc {
  jsonrpc: '2.0';
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

export function createRelayServer(deps: RelayDeps): Server {
  const pairLimiter = new RateLimiter(10, 60_000);
  const authFailLimiter = new RateLimiter(30, 60_000);
  const inflight = new Map<string, AbortController>();

  const allTools = () => [...deps.builtin.list(), ...deps.servers.tools()];

  async function handleRpc(msg: Rpc, deviceId: string): Promise<Rpc | null> {
    const reply = (result: unknown): Rpc => ({ jsonrpc: '2.0', id: msg.id ?? null, ...{ result } });
    const fail = (code: number, message: string): Rpc => ({ jsonrpc: '2.0', id: msg.id ?? null, ...{ error: { code, message } } });
    if (!msg.method) return null;
    if (msg.id === undefined || msg.id === null) {
      if (msg.method === 'notifications/cancelled') {
        const rid = String(msg.params?.requestId ?? '');
        inflight.get(`${deviceId}:${rid}`)?.abort();
      }
      return null;
    }
    switch (msg.method) {
      case 'initialize': {
        const requested = String(msg.params?.protocolVersion ?? '2025-06-18');
        const supported = ['2025-06-18', '2025-03-26', '2024-11-05'];
        return reply({
          protocolVersion: supported.includes(requested) ? requested : '2025-06-18',
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: `Nexus Relay (${deps.cfg.name})`, version: RELAY_VERSION },
          instructions: 'Инструменты компьютера пользователя: файлы в разрешённых папках, буфер обмена и MCP-серверы, запущенные на ПК.',
        });
      }
      case 'ping':
        return reply({});
      case 'tools/list':
        return reply({ tools: allTools() });
      case 'tools/call': {
        const name = String(msg.params?.name ?? '');
        const args = (msg.params?.arguments ?? {}) as Record<string, unknown>;
        const ctrl = new AbortController();
        const key = `${deviceId}:${String(msg.id)}`;
        inflight.set(key, ctrl);
        try {
          deps.log(`→ ${name}`);
          const r = deps.builtin.owns(name) ? await deps.builtin.call(name, args, ctrl.signal) : deps.servers.owns(name) ? await deps.servers.call(name, args, ctrl.signal) : null;
          if (!r) return fail(-32602, `Неизвестный инструмент: ${name}`);
          return reply(r);
        } catch (e) {
          return reply({ content: [{ type: 'text', text: (e as Error).message }], isError: true });
        } finally {
          inflight.delete(key);
        }
      }
      default:
        return fail(-32601, `Метод ${msg.method} не поддерживается`);
    }
  }

  async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://relay');
    const ip = req.socket.remoteAddress;
    const path = url.pathname;

    // Local control panel: loopback only.
    if (path === '/' || path.startsWith('/api/panel')) {
      if (!isLoopback(ip)) throw new HttpError(403, 'Панель доступна только с этого компьютера');
      if (req.headers.origin && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.origin)) throw new HttpError(403, 'Запрещённый источник');
      if (path === '/' && req.method === 'GET') return send(res, 200, panelHtml());
      if (path === '/api/panel' && req.method === 'GET') {
        const payload = pairingPayload(deps);
        const uri = encodePairingUri(payload);
        return send(res, 200, {
          name: deps.cfg.name,
          version: RELAY_VERSION,
          pairing: { uri, exp: payload.exp, urls: payload.urls, qr: await QRCode.toDataURL(uri, { margin: 1, width: 320 }) },
          devices: deps.devices.list(),
          servers: deps.servers.status(),
          builtin: deps.builtin.list().map((t) => t.name),
          chats: deps.sync.summary().slice(0, 200),
          config: { allowedDirs: deps.cfg.allowedDirs, inboxDir: deps.cfg.inboxDir, shell: deps.cfg.shell.enabled },
        });
      }
      if (path === '/api/panel/revoke' && req.method === 'POST') {
        const b = (await readJsonBody(req)) as { deviceId?: string };
        return send(res, 200, { ok: deps.devices.revoke(String(b?.deviceId ?? '')) });
      }
      if (path === '/api/panel/rotate' && req.method === 'POST') {
        deps.devices.rotatePairCode();
        return send(res, 200, { ok: true });
      }
      if (path === '/api/panel/restart' && req.method === 'POST') {
        const b = (await readJsonBody(req)) as { id?: string };
        await deps.servers.restart(String(b?.id ?? ''));
        return send(res, 200, { ok: true });
      }
      if (path === '/api/panel/chat' && req.method === 'GET') return send(res, 200, deps.sync.transcript(url.searchParams.get('id') ?? ''));
      throw new HttpError(404, 'Не найдено');
    }

    if (path === '/api/pair' && req.method === 'POST') {
      if (!pairLimiter.allow(ip ?? '?')) throw new HttpError(429, 'Слишком много попыток');
      const parsed = PairRequest.safeParse(await readJsonBody(req));
      if (!parsed.success) throw new HttpError(400, 'Некорректный запрос');
      const r = deps.devices.pair(parsed.data.code, parsed.data.deviceName, ip);
      if (!r) throw new HttpError(401, 'Код сопряжения неверный или истёк');
      deps.log(`📱 Сопряжено устройство: ${parsed.data.deviceName}`);
      return send(res, 200, { ...r, relayName: deps.cfg.name });
    }

    // Everything below requires a device token.
    const auth = req.headers.authorization;
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : undefined;
    if (authFailLimiter.exceeded(ip ?? '?')) throw new HttpError(429, 'Слишком много неудачных попыток, подождите минуту');
    const device = deps.devices.verify(token, ip);
    if (!device) {
      authFailLimiter.allow(ip ?? '?');
      throw new HttpError(401, 'Устройство не авторизовано — выполните сопряжение заново');
    }

    if (path === '/api/info' && req.method === 'GET') {
      const info: RelayInfo = { name: deps.cfg.name, version: RELAY_VERSION, platform: platform(), servers: deps.servers.status(), builtinTools: deps.builtin.list().map((t) => t.name) };
      return send(res, 200, info);
    }

    if (path === '/mcp') {
      if (req.method === 'GET') return send(res, 405, { error: 'SSE stream not offered' }, { Allow: 'POST, DELETE' });
      if (req.method === 'DELETE') return send(res, 200, {});
      if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');
      const body = (await readJsonBody(req)) as Rpc | Rpc[];
      if (Array.isArray(body)) {
        const out = (await Promise.all(body.map((m) => handleRpc(m, device.id)))).filter((x): x is Rpc => !!x);
        return out.length ? send(res, 200, out) : send(res, 202, {});
      }
      const out = await handleRpc(body, device.id);
      return out ? send(res, 200, out) : send(res, 202, {});
    }

    if (path === '/api/sync' && req.method === 'POST') {
      const parsed = SyncRequest.safeParse(await readJsonBody(req));
      if (!parsed.success) throw new HttpError(400, `Некорректные данные синхронизации: ${parsed.error.issues[0]?.message ?? ''}`);
      return send(res, 200, deps.sync.apply(parsed.data));
    }

    if (path === '/api/files' && req.method === 'POST') {
      const name = basename(url.searchParams.get('name') ?? '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 200) || `file-${Date.now()}`;
      const expected = String(req.headers['x-sha256'] ?? '').toLowerCase();
      await mkdir(deps.cfg.inboxDir, { recursive: true });
      const tmp = join(deps.cfg.inboxDir, `.${name}.${Date.now()}.part`);
      const hash = createHash('sha256');
      let size = 0;
      await new Promise<void>((resolve, reject) => {
        const out = createWriteStream(tmp);
        req.on('data', (c: Buffer) => {
          size += c.length;
          if (size > MAX_UPLOAD) {
            req.destroy();
            out.destroy();
            reject(new HttpError(413, 'Файл больше 200 МБ'));
            return;
          }
          hash.update(c);
        });
        req.pipe(out);
        out.on('finish', resolve);
        out.on('error', reject);
        req.on('error', reject);
      }).catch(async (e) => {
        await unlink(tmp).catch(() => undefined);
        throw e;
      });
      const digest = hash.digest('hex');
      if (expected && expected !== digest) {
        await unlink(tmp).catch(() => undefined);
        throw new HttpError(422, 'Контрольная сумма не совпала — файл повреждён при передаче');
      }
      let dest = join(deps.cfg.inboxDir, name);
      for (let i = 1; await access(dest).then(() => true, () => false); i++) {
        const dot = name.lastIndexOf('.');
        dest = join(deps.cfg.inboxDir, dot > 0 ? `${name.slice(0, dot)} (${i})${name.slice(dot)}` : `${name} (${i})`);
      }
      await rename(tmp, dest);
      deps.log(`📥 Получен файл ${dest} (${size} Б) от ${device.name}`);
      return send(res, 200, { path: dest, size, sha256: digest });
    }

    throw new HttpError(404, 'Не найдено');
  }

  return createServer((req, res) => {
    route(req, res).catch((e: unknown) => {
      const status = e instanceof HttpError ? e.status : 500;
      if (status === 500) deps.log(`Ошибка: ${(e as Error).stack ?? e}`);
      if (!res.headersSent) send(res, status, { error: (e as Error).message });
      else res.end();
    });
  });
}

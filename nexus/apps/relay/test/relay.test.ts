import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { McpClient, decodePairingUri, encodePairingUri, type FetchLike } from '@nexus/core';
import { BuiltinTools, splitArgs } from '../src/builtin';
import { defaultConfig, type RelayConfig } from '../src/config';
import { DeviceStore } from '../src/devices';
import { createRelayServer, pairingPayload } from '../src/server';
import { ServerManager } from '../src/servers';
import { SyncStore } from '../src/sync';

const dir = mkdtempSync(join(tmpdir(), 'relay-'));
const work = mkdtempSync(join(tmpdir(), 'relay-work-'));
const cfg: RelayConfig = {
  ...defaultConfig(),
  name: 'Test PC',
  port: 0,
  host: '127.0.0.1',
  allowedDirs: [work],
  inboxDir: join(work, 'inbox'),
  shell: { enabled: true, allow: ['node'], timeoutMs: 10_000 },
  mcpServers: { echo: { command: process.execPath, args: [join(__dirname, 'fixtures', 'echo-server.mjs')] } },
};
const logs: string[] = [];
const devices = new DeviceStore(dir);
const servers = new ServerManager((m) => logs.push(m));
const deps = { cfg, devices, servers, builtin: new BuiltinTools(cfg), sync: new SyncStore(dir), log: (m: string) => logs.push(m) };
const server = createRelayServer(deps);
let base = '';
let token = '';

beforeAll(async () => {
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  await servers.start(cfg.mcpServers);
});

afterAll(async () => {
  server.close();
  await servers.stop();
});

const authed: FetchLike = (url, init = {}) => fetch(url, { ...init, headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${token}` } });

describe('relay', () => {
  it('pairs once with the QR code and rejects reuse', async () => {
    const payload = decodePairingUri(encodePairingUri(pairingPayload(deps)));
    const r = await fetch(`${base}/api/pair`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: payload.code, deviceName: 'Pixel' }) });
    expect(r.status).toBe(200);
    token = ((await r.json()) as { token: string }).token;
    const again = await fetch(`${base}/api/pair`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: payload.code, deviceName: 'X' }) });
    expect(again.status).toBe(401);
    expect((await fetch(`${base}/api/info`)).status).toBe(401);
    const info = await authed(`${base}/api/info`);
    expect(((await info.json()) as { name: string }).name).toBe('Test PC');
  });

  it('serves builtin and stdio MCP tools over Streamable HTTP', async () => {
    const c = new McpClient({ url: `${base}/mcp`, transport: 'http', fetch: authed });
    await c.connect();
    const names = (await c.listTools()).map((t) => t.name);
    expect(names).toContain('pc_read_file');
    expect(names).toContain('echo__shout');
    expect((await c.callTool('echo__shout', { text: 'привет' })).content).toEqual([{ type: 'text', text: 'ПРИВЕТ' }]);
    expect((await c.callTool('pc_write_file', { path: 'a/b.txt', content: 'hi' })).isError).toBe(false);
    expect((await c.callTool('pc_read_file', { path: 'a/b.txt' })).content).toEqual([{ type: 'text', text: 'hi' }]);
    const escape = await c.callTool('pc_read_file', { path: '../../etc/passwd' });
    expect(escape.isError).toBe(true);
    const shell = await c.callTool('pc_shell_exec', { command: 'node -e "console.log(6*7)"' });
    expect(JSON.stringify(shell.content)).toContain('42');
    const denied = await c.callTool('pc_shell_exec', { command: 'rm -rf /' });
    expect(denied.isError).toBe(true);
    await c.close();
  });

  it('syncs chats last-write-wins between devices', async () => {
    const chat = { id: 'c1', title: 'Чат', projectId: null, providerId: 'deepseek', modelId: 'deepseek-chat', activeLeafId: null, createdAt: 1, updatedAt: 10, deleted: false };
    const r1 = await authed(`${base}/api/sync`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ since: 0, chats: [chat], messages: [] }) });
    const s1 = (await r1.json()) as { now: number; chats: unknown[] };
    expect(s1.chats).toHaveLength(0);
    const r2 = await authed(`${base}/api/sync`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ since: 0, chats: [], messages: [] }) });
    expect(((await r2.json()) as { chats: { id: string }[] }).chats.map((c) => c.id)).toEqual(['c1']);
    const r3 = await authed(`${base}/api/sync`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ since: s1.now, chats: [], messages: [] }) });
    expect(((await r3.json()) as { chats: unknown[] }).chats).toHaveLength(0);
  });

  it('receives files with checksum verification', async () => {
    const data = Buffer.from('файл');
    const sha = createHash('sha256').update(data).digest('hex');
    const ok = await authed(`${base}/api/files?name=../../evil.txt`, { method: 'POST', headers: { 'x-sha256': sha }, body: data });
    const j = (await ok.json()) as { path: string };
    expect(j.path.startsWith(cfg.inboxDir)).toBe(true);
    expect(readFileSync(j.path, 'utf8')).toBe('файл');
    const bad = await authed(`${base}/api/files?name=x.txt`, { method: 'POST', headers: { 'x-sha256': '0'.repeat(64) }, body: data });
    expect(bad.status).toBe(422);
  });

  it('revoked devices lose access', async () => {
    const id = token.split('.')[0]!;
    expect(devices.revoke(id)).toBe(true);
    expect((await authed(`${base}/api/info`)).status).toBe(401);
  });

  it('splits command lines without a shell', () => {
    expect(splitArgs(`git commit -m "hello world" 'a b'`)).toEqual(['git', 'commit', '-m', 'hello world', 'a b']);
    expect(() => splitArgs('echo "x')).toThrow();
  });
});

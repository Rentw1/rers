import * as Crypto from 'expo-crypto';
import * as Device from 'expo-device';
import { File } from 'expo-file-system';
import { PairResponse, RelayInfo, SyncResponse, decodePairingUri, type SyncChat, type SyncMessage } from '@nexus/core';
import { connect } from './mcp';
import { fetchWithTimeout } from './net';
import * as repo from './repo';
import { RELAY_TOKEN, getSecret, setSecret } from './secure';

export const RELAY_SERVER_ID = 'relay';

export interface RelayState {
  name: string;
  urls: string[];
  activeUrl: string;
  deviceId: string;
  pairedAt: number;
  serverSince: number;
  localSince: number;
  lastSyncAt: number;
}

export const getRelay = () => repo.getSetting<RelayState | null>('relay', null);
const saveRelay = (s: RelayState | null) => repo.setSetting('relay', s);

export async function pairWithUri(uri: string): Promise<RelayState> {
  const payload = decodePairingUri(uri);
  const deviceName = `${Device.manufacturer ?? ''} ${Device.modelName ?? 'Android'}`.trim() || 'Телефон';
  const errors: string[] = [];
  for (const url of payload.urls) {
    try {
      const res = await fetchWithTimeout(`${url}/api/pair`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: payload.code, deviceName }) }, 6000);
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        errors.push(`${url}: ${body.error ?? `HTTP ${res.status}`}`);
        if (res.status === 401) break;
        continue;
      }
      const r = PairResponse.parse(body);
      await setSecret(RELAY_TOKEN, r.token);
      const state: RelayState = { name: r.relayName, urls: payload.urls, activeUrl: url, deviceId: r.deviceId, pairedAt: Date.now(), serverSince: 0, localSince: 0, lastSyncAt: 0 };
      await saveRelay(state);
      await repo.saveMcpServer({ id: RELAY_SERVER_ID, name: `ПК: ${r.relayName}`, url: `${url}/mcp`, transport: 'http', authType: 'relay', enabled: true });
      return state;
    } catch (e) {
      errors.push(`${url}: ${(e as Error).message}`);
    }
  }
  throw new Error(`Не удалось связаться с компьютером. Телефон и ПК должны быть в одной сети (или в Tailscale).\n${errors.join('\n')}`);
}

async function authHeaders(): Promise<Record<string, string>> {
  const t = await getSecret(RELAY_TOKEN);
  if (!t) throw new Error('Компьютер не сопряжён');
  return { Authorization: `Bearer ${t}` };
}

/** Finds a reachable relay address (LAN or Tailscale), updating the MCP endpoint if it moved. */
export async function reachableRelay(): Promise<{ state: RelayState; info: RelayInfo }> {
  const state = await getRelay();
  if (!state) throw new Error('Компьютер не сопряжён');
  const headers = await authHeaders();
  const order = [state.activeUrl, ...state.urls.filter((u) => u !== state.activeUrl)];
  let lastErr = '';
  for (const url of order) {
    try {
      const res = await fetchWithTimeout(`${url}/api/info`, { headers }, 3500);
      if (res.status === 401) throw new Error('Компьютер отозвал доступ — выполните сопряжение заново');
      if (!res.ok) {
        lastErr = `HTTP ${res.status}`;
        continue;
      }
      const info = RelayInfo.parse(await res.json());
      if (url !== state.activeUrl) {
        state.activeUrl = url;
        await saveRelay(state);
        await repo.saveMcpServer({ id: RELAY_SERVER_ID, name: `ПК: ${state.name}`, url: `${url}/mcp`, transport: 'http', authType: 'relay', enabled: true });
      }
      return { state, info };
    } catch (e) {
      lastErr = (e as Error).message;
      if (/отозвал/.test(lastErr)) throw e;
    }
  }
  throw new Error(`Компьютер недоступен (${lastErr}). Проверьте, что Nexus Relay запущен.`);
}

export async function unpair(): Promise<void> {
  await setSecret(RELAY_TOKEN, null);
  await saveRelay(null);
  await repo.deleteMcpServer(RELAY_SERVER_ID);
}

const toSyncChat = (c: repo.ChatDb): SyncChat => ({
  id: c.id,
  title: c.title,
  projectId: c.project_id,
  providerId: c.provider_id,
  modelId: c.model_id,
  activeLeafId: c.active_leaf_id,
  createdAt: c.created_at,
  updatedAt: c.updated_at,
  deleted: !!c.deleted,
});
const toSyncMessage = (m: repo.MessageDb): SyncMessage => ({
  id: m.id,
  chatId: m.chat_id,
  parentId: m.parent_id,
  role: m.role as 'user' | 'assistant',
  blocks: m.blocks,
  raw: m.raw,
  providerId: m.provider_id,
  modelId: m.model_id,
  createdAt: m.created_at,
  updatedAt: m.updated_at,
  deleted: !!m.deleted,
});

/** Pushes local changes and pulls changes from other devices (last write wins). */
export async function syncChats(): Promise<{ pushed: number; pulled: number }> {
  const { state } = await reachableRelay();
  const headers = await authHeaders();
  const startedAt = Date.now();
  const local = await repo.changedSince(state.localSince);
  const res = await fetchWithTimeout(
    `${state.activeUrl}/api/sync`,
    { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ since: state.serverSince, chats: local.chats.map(toSyncChat), messages: local.messages.map(toSyncMessage) }) },
    60_000,
  );
  if (!res.ok) throw new Error(`Синхронизация: HTTP ${res.status}`);
  const r = SyncResponse.parse(await res.json());
  await repo.applyRemote(
    r.chats.map((c) => ({ id: c.id, title: c.title, project_id: c.projectId, provider_id: c.providerId, model_id: c.modelId, active_leaf_id: c.activeLeafId, pinned: 0, created_at: c.createdAt, updated_at: c.updatedAt, deleted: c.deleted ? 1 : 0 })),
    r.messages.map((m) => ({ id: m.id, chat_id: m.chatId, parent_id: m.parentId, role: m.role, blocks: m.blocks, raw: m.raw, provider_id: m.providerId, model_id: m.modelId, stop_reason: null, error: null, created_at: m.createdAt, updated_at: m.updatedAt, deleted: m.deleted ? 1 : 0 })),
  );
  await saveRelay({ ...state, serverSince: r.now, localSince: startedAt, lastSyncAt: Date.now() });
  return { pushed: local.chats.length + local.messages.length, pulled: r.chats.length + r.messages.length };
}

/** Sends a phone file to the PC inbox with SHA-256 verification. */
export async function sendFileToPc(uri: string, name: string): Promise<string> {
  const { state } = await reachableRelay();
  const headers = await authHeaders();
  const file = new File(uri);
  if (file.size > 100 * 1024 * 1024) throw new Error('Файл больше 100 МБ');
  const bytes = await file.bytes();
  const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes);
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  const res = await fetchWithTimeout(`${state.activeUrl}/api/files?name=${encodeURIComponent(name)}`, { method: 'POST', headers: { ...headers, 'x-sha256': hex, 'Content-Type': 'application/octet-stream' }, body: bytes }, 300_000);
  const j = (await res.json().catch(() => ({}))) as { path?: string; error?: string };
  if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
  return j.path ?? '';
}

export async function ensureRelayConnected(): Promise<void> {
  const servers = await repo.listMcpServers();
  const row = servers.find((s) => s.id === RELAY_SERVER_ID);
  if (!row) return;
  await reachableRelay();
  const fresh = (await repo.listMcpServers()).find((s) => s.id === RELAY_SERVER_ID)!;
  await connect(fresh, true);
}

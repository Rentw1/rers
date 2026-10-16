import { router } from 'expo-router';
import { Alert } from 'react-native';
import { base64UrlToBytes, checkUrlSecurity } from '@nexus/core';
import { uid } from './ids';
import { connect } from './mcp';
import { pairWithUri, ensureRelayConnected } from './relay';
import * as repo from './repo';
import { parseMcpConfig, type McpImport } from './mcpConfig';
import { mcpSecretName, setSecretJson } from './secure';

export { parseMcpConfig, type McpImport };

export async function addMcpServers(list: McpImport[]): Promise<string[]> {
  const ids: string[] = [];
  for (const s of list) {
    const sec = checkUrlSecurity(s.url);
    if (sec) throw new Error(`${s.name}: ${sec}`);
    const id = uid();
    const authType: repo.McpAuthType = s.oauth ? 'oauth' : s.bearer ? 'bearer' : s.headers && Object.keys(s.headers).length ? 'headers' : 'none';
    if (s.bearer || s.headers) await setSecretJson(mcpSecretName(id), { bearer: s.bearer, headers: s.headers });
    await repo.saveMcpServer({ id, name: s.name, url: s.url, transport: s.transport ?? 'http', authType, enabled: true });
    ids.push(id);
    const row = (await repo.listMcpServers()).find((r) => r.id === id)!;
    void connect(row).catch(() => undefined);
  }
  return ids;
}

/** Handles nexus://pair, nexus://mcp/add and plain MCP URLs (from QR codes or deep links). Returns false if unrecognized. */
export async function handleIncomingLink(data: string, mode?: 'relay' | 'mcp'): Promise<boolean> {
  const s = data.trim();
  if (/^nexus:\/\/pair\b/i.test(s)) {
    const state = await pairWithUri(s);
    await ensureRelayConnected().catch(() => undefined);
    Alert.alert('Компьютер подключён', `«${state.name}» сопряжён. Его инструменты доступны в чатах.`);
    router.replace('/settings/relay');
    return true;
  }
  if (mode === 'relay') return false;
  const m = /^nexus:\/\/mcp\/add\?config=([A-Za-z0-9_\-+/=%]+)/i.exec(s);
  if (m?.[1]) {
    const json = new TextDecoder().decode(base64UrlToBytes(decodeURIComponent(m[1])));
    const { remote, stdio } = parseMcpConfig(json);
    if (!remote.length) throw new Error(stdio.length ? 'Локальные (stdio) серверы запускаются на компьютере через Nexus Relay' : 'В ссылке нет MCP-серверов');
    await addMcpServers(remote);
    Alert.alert('Добавлено', remote.map((r) => r.name).join(', '));
    router.replace('/settings/mcp');
    return true;
  }
  if (/^https?:\/\//i.test(s)) {
    const name = new URL(s).hostname;
    await addMcpServers([{ name, url: s, transport: /\/sse\/?$/.test(s) ? 'sse' : 'http' }]);
    Alert.alert('MCP-сервер добавлен', name);
    router.replace('/settings/mcp');
    return true;
  }
  if (s.startsWith('{') || s.startsWith('[')) {
    const { remote } = parseMcpConfig(s);
    if (!remote.length) return false;
    await addMcpServers(remote);
    router.replace('/settings/mcp');
    return true;
  }
  return false;
}

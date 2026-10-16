import * as SecureStore from 'expo-secure-store';

const OPTS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
const cache = new Map<string, string | null>();

const safeKey = (k: string) => k.replace(/[^A-Za-z0-9._-]/g, '_');

export async function getSecret(key: string): Promise<string | null> {
  const k = safeKey(key);
  if (cache.has(k)) return cache.get(k) ?? null;
  const v = await SecureStore.getItemAsync(k, OPTS);
  cache.set(k, v);
  return v;
}

export async function setSecret(key: string, value: string | null): Promise<void> {
  const k = safeKey(key);
  if (value == null || value === '') {
    await SecureStore.deleteItemAsync(k, OPTS);
    cache.set(k, null);
  } else {
    await SecureStore.setItemAsync(k, value, OPTS);
    cache.set(k, value);
  }
}

export async function getSecretJson<T>(key: string): Promise<T | null> {
  const v = await getSecret(key);
  if (!v) return null;
  try {
    return JSON.parse(v) as T;
  } catch {
    return null;
  }
}

export const setSecretJson = (key: string, value: unknown) => setSecret(key, value == null ? null : JSON.stringify(value));

export const apiKeyName = (providerId: string) => `apikey.${providerId}`;
export const mcpSecretName = (serverId: string) => `mcp.${serverId}`;
export const RELAY_TOKEN = 'relay.token';

export function maskKey(k: string): string {
  if (k.length <= 8) return '••••';
  return `${k.slice(0, 4)}••••${k.slice(-4)}`;
}

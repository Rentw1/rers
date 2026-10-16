import type { FetchLike } from '../types';

export interface AuthServerMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint?: string;
  scopes_supported?: string[];
  code_challenge_methods_supported?: string[];
}

export interface OAuthDiscovery {
  resource: string;
  authServer: AuthServerMetadata;
  scopes?: string[];
}

export interface OAuthClient {
  client_id: string;
  client_secret?: string;
}

export interface OAuthTokens {
  access_token: string;
  token_type: string;
  refresh_token?: string;
  expires_at?: number;
  scope?: string;
}

async function getJson<T>(fetchFn: FetchLike, url: string): Promise<T | null> {
  try {
    const res = await fetchFn(url, { headers: { Accept: 'application/json', 'MCP-Protocol-Version': '2025-06-18' } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Canonical resource URI per RFC 8707: scheme + host + path, no fragment, no trailing slash. */
export function canonicalResource(serverUrl: string): string {
  const u = new URL(serverUrl);
  u.hash = '';
  return u.toString().replace(/\/$/, '');
}

/** MCP Authorization discovery: protected resource metadata (RFC 9728) → authorization server metadata (RFC 8414 / OIDC). */
export async function discoverOAuth(fetchFn: FetchLike, serverUrl: string, resourceMetadataUrl?: string): Promise<OAuthDiscovery> {
  const server = new URL(serverUrl);
  const prmCandidates = [
    resourceMetadataUrl,
    `${server.origin}/.well-known/oauth-protected-resource${server.pathname !== '/' ? server.pathname.replace(/\/$/, '') : ''}`,
    `${server.origin}/.well-known/oauth-protected-resource`,
  ].filter((x): x is string => !!x);
  let prm: { resource?: string; authorization_servers?: string[]; scopes_supported?: string[] } | null = null;
  for (const c of prmCandidates) {
    prm = await getJson(fetchFn, c);
    if (prm?.authorization_servers?.length) break;
  }
  const issuer = prm?.authorization_servers?.[0] ?? server.origin;
  const iss = new URL(issuer);
  const path = iss.pathname !== '/' ? iss.pathname.replace(/\/$/, '') : '';
  const asCandidates = path
    ? [`${iss.origin}/.well-known/oauth-authorization-server${path}`, `${iss.origin}/.well-known/openid-configuration${path}`, `${iss.origin}${path}/.well-known/openid-configuration`]
    : [`${iss.origin}/.well-known/oauth-authorization-server`, `${iss.origin}/.well-known/openid-configuration`];
  let meta: AuthServerMetadata | null = null;
  for (const c of asCandidates) {
    meta = await getJson<AuthServerMetadata>(fetchFn, c);
    if (meta?.authorization_endpoint && meta.token_endpoint) break;
    meta = null;
  }
  if (!meta) {
    meta = { issuer: iss.origin, authorization_endpoint: `${iss.origin}/authorize`, token_endpoint: `${iss.origin}/token`, registration_endpoint: `${iss.origin}/register` };
  }
  return { resource: prm?.resource ?? canonicalResource(serverUrl), authServer: meta, scopes: prm?.scopes_supported ?? meta.scopes_supported };
}

/** Dynamic Client Registration (RFC 7591) for a public native client. */
export async function registerClient(fetchFn: FetchLike, meta: AuthServerMetadata, redirectUri: string, clientName = 'Nexus'): Promise<OAuthClient> {
  if (!meta.registration_endpoint) throw new Error('Сервер не поддерживает автоматическую регистрацию клиента — укажите client_id вручную');
  const res = await fetchFn(meta.registration_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_name: clientName,
      redirect_uris: [redirectUri],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      application_type: 'native',
    }),
  });
  if (!res.ok) throw new Error(`Регистрация клиента не удалась: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  const j = (await res.json()) as OAuthClient;
  if (!j.client_id) throw new Error('Сервер не вернул client_id');
  return j;
}

export function buildAuthorizeUrl(p: {
  meta: AuthServerMetadata;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state: string;
  resource: string;
  scopes?: string[];
}): string {
  const u = new URL(p.meta.authorization_endpoint);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('client_id', p.clientId);
  u.searchParams.set('redirect_uri', p.redirectUri);
  u.searchParams.set('code_challenge', p.codeChallenge);
  u.searchParams.set('code_challenge_method', 'S256');
  u.searchParams.set('state', p.state);
  u.searchParams.set('resource', p.resource);
  if (p.scopes?.length) u.searchParams.set('scope', p.scopes.join(' '));
  return u.toString();
}

async function tokenRequest(fetchFn: FetchLike, meta: AuthServerMetadata, client: OAuthClient, form: Record<string, string>): Promise<OAuthTokens> {
  const body = new URLSearchParams({ ...form, client_id: client.client_id });
  if (client.client_secret) body.set('client_secret', client.client_secret);
  const res = await fetchFn(meta.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: body.toString(),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Ошибка получения токена: HTTP ${res.status} ${text.slice(0, 200)}`);
  const j = JSON.parse(text) as { access_token?: string; token_type?: string; refresh_token?: string; expires_in?: number; scope?: string };
  if (!j.access_token) throw new Error('Сервер не вернул access_token');
  return {
    access_token: j.access_token,
    token_type: j.token_type ?? 'Bearer',
    refresh_token: j.refresh_token,
    scope: j.scope,
    expires_at: j.expires_in ? Date.now() + j.expires_in * 1000 : undefined,
  };
}

export function exchangeCode(fetchFn: FetchLike, meta: AuthServerMetadata, client: OAuthClient, p: { code: string; redirectUri: string; codeVerifier: string; resource: string }): Promise<OAuthTokens> {
  return tokenRequest(fetchFn, meta, client, {
    grant_type: 'authorization_code',
    code: p.code,
    redirect_uri: p.redirectUri,
    code_verifier: p.codeVerifier,
    resource: p.resource,
  });
}

export async function refreshTokens(fetchFn: FetchLike, meta: AuthServerMetadata, client: OAuthClient, refreshToken: string, resource: string): Promise<OAuthTokens> {
  const t = await tokenRequest(fetchFn, meta, client, { grant_type: 'refresh_token', refresh_token: refreshToken, resource });
  return { ...t, refresh_token: t.refresh_token ?? refreshToken };
}

export function base64UrlFromBytes(bytes: Uint8Array): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
    out += chars[(n >> 18) & 63]! + chars[(n >> 12) & 63]! + chars[(n >> 6) & 63]! + chars[n & 63]!;
  }
  if (i < bytes.length) {
    const n = (bytes[i]! << 16) | ((bytes[i + 1] ?? 0) << 8);
    out += chars[(n >> 18) & 63]! + chars[(n >> 12) & 63]!;
    if (i + 1 < bytes.length) out += chars[(n >> 6) & 63]!;
  }
  return out;
}

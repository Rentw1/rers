import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { buildAuthorizeUrl, discoverOAuth, exchangeCode, registerClient } from '@nexus/core';
import { connect, type McpSecret } from './mcp';
import { appFetch } from './net';
import type { McpServerRow } from './repo';
import { getSecretJson, mcpSecretName, setSecretJson } from './secure';
import { randomBase64Url, sha256Base64Url } from './ids';

/** Full MCP OAuth 2.1 flow: discovery → dynamic registration → PKCE authorize in a Custom Tab → token exchange. */
export async function authorizeServer(row: McpServerRow, resourceMetadataUrl?: string): Promise<void> {
  const redirectUri = Linking.createURL('oauth/callback');
  const discovery = await discoverOAuth(appFetch, row.url, resourceMetadataUrl);
  const prev = await getSecretJson<McpSecret>(mcpSecretName(row.id));
  const client = prev?.oauth?.client && prev.oauth.meta.issuer === discovery.authServer.issuer ? prev.oauth.client : await registerClient(appFetch, discovery.authServer, redirectUri);
  const verifier = randomBase64Url(48);
  const challenge = await sha256Base64Url(verifier);
  const state = randomBase64Url(16);
  const url = buildAuthorizeUrl({ meta: discovery.authServer, clientId: client.client_id, redirectUri, codeChallenge: challenge, state, resource: discovery.resource, scopes: discovery.scopes });
  const res = await WebBrowser.openAuthSessionAsync(url, redirectUri);
  if (res.type !== 'success') throw new Error('Авторизация отменена');
  const params = new URL(res.url).searchParams;
  const err = params.get('error');
  if (err) throw new Error(`Сервер отказал: ${params.get('error_description') ?? err}`);
  if (params.get('state') !== state) throw new Error('Ответ авторизации не прошёл проверку (state)');
  const code = params.get('code');
  if (!code) throw new Error('Сервер не вернул код авторизации');
  const tokens = await exchangeCode(appFetch, discovery.authServer, client, { code, redirectUri, codeVerifier: verifier, resource: discovery.resource });
  await setSecretJson(mcpSecretName(row.id), { ...(prev ?? {}), oauth: { meta: discovery.authServer, client, tokens, resource: discovery.resource, scopes: discovery.scopes } } satisfies McpSecret);
  await connect(row, true);
}

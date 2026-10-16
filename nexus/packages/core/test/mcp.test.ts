import { describe, expect, it } from 'vitest';
import { McpClient, McpAuthRequiredError, discoverOAuth, buildAuthorizeUrl, mcpContentToText } from '../src';
import { jsonResponse, mockFetch, sseResponse } from './helpers';

interface Rpc {
  id?: number;
  method: string;
  params?: Record<string, unknown>;
}

describe('McpClient (Streamable HTTP)', () => {
  it('initializes, keeps the session id and handles JSON and SSE responses', async () => {
    const notifications: string[] = [];
    const { fetch, calls } = mockFetch((_url, init, body) => {
      const rpc = body as Rpc;
      const headers = init.headers as Record<string, string>;
      if (init.method === 'DELETE') return new Response(null, { status: 204 });
      if (rpc.method === 'initialize') {
        return jsonResponse({ jsonrpc: '2.0', id: rpc.id, result: { protocolVersion: '2025-06-18', serverInfo: { name: 'srv', version: '1' }, capabilities: { tools: {} } } }, 200, { 'mcp-session-id': 'S1' });
      }
      expect(headers['Mcp-Session-Id']).toBe('S1');
      expect(headers['MCP-Protocol-Version']).toBe('2025-06-18');
      if (rpc.method === 'notifications/initialized') return new Response(null, { status: 202 });
      if (rpc.method === 'tools/list') {
        if (!rpc.params?.cursor) return jsonResponse({ jsonrpc: '2.0', id: rpc.id, result: { tools: [{ name: 'a', inputSchema: { type: 'object' } }], nextCursor: 'p2' } });
        return jsonResponse({ jsonrpc: '2.0', id: rpc.id, result: { tools: [{ name: 'b', inputSchema: { type: 'object' } }] } });
      }
      if (rpc.method === 'tools/call') {
        return sseResponse([
          JSON.stringify({ jsonrpc: '2.0', method: 'notifications/progress', params: { progress: 1 } }),
          JSON.stringify({ jsonrpc: '2.0', id: rpc.id, result: { content: [{ type: 'text', text: 'ok' }, { type: 'image', data: 'AA', mimeType: 'image/png' }] } }),
        ]);
      }
      return jsonResponse({ jsonrpc: '2.0', id: rpc.id, error: { code: -32601, message: 'nope' } });
    });
    const c = new McpClient({ url: 'https://mcp.example.com/mcp', transport: 'http', fetch, onNotification: (m) => notifications.push(m) });
    const info = await c.connect();
    expect(info.name).toBe('srv');
    expect((await c.listTools()).map((t) => t.name)).toEqual(['a', 'b']);
    const r = await c.callTool('a', {});
    expect(mcpContentToText(r.content)).toEqual({ text: 'ok', images: [{ mediaType: 'image/png', data: 'AA' }] });
    expect(notifications).toContain('notifications/progress');
    await c.close();
    expect(calls.at(-1)!.init.method).toBe('DELETE');
  });

  it('raises auth errors with resource metadata', async () => {
    const { fetch } = mockFetch(() => new Response('', { status: 401, headers: { 'www-authenticate': 'Bearer resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource"' } }));
    const c = new McpClient({ url: 'https://mcp.example.com/mcp', transport: 'http', fetch });
    const err = await c.connect().catch((e) => e);
    expect(err).toBeInstanceOf(McpAuthRequiredError);
    expect(err.resourceMetadataUrl).toBe('https://mcp.example.com/.well-known/oauth-protected-resource');
  });

  it('re-initializes after a 404 session expiry', async () => {
    let inits = 0;
    let expired = false;
    const { fetch } = mockFetch((_u, _init, body) => {
      const rpc = body as Rpc;
      if (rpc.method === 'initialize') {
        inits++;
        return jsonResponse({ jsonrpc: '2.0', id: rpc.id, result: { protocolVersion: '2025-03-26', capabilities: { tools: {} } } }, 200, { 'mcp-session-id': `S${inits}` });
      }
      if (rpc.method === 'notifications/initialized') return new Response(null, { status: 202 });
      if (!expired) {
        expired = true;
        return new Response('gone', { status: 404 });
      }
      return jsonResponse({ jsonrpc: '2.0', id: rpc.id, result: { tools: [] } });
    });
    const c = new McpClient({ url: 'https://m/mcp', transport: 'http', fetch });
    await c.connect();
    await expect(c.listTools()).resolves.toEqual([]);
    expect(inits).toBe(2);
  });
});

describe('McpClient (legacy SSE)', () => {
  it('opens the stream, posts to the endpoint and resolves from stream messages', async () => {
    let push: ((s: string) => void) | undefined;
    const stream = new ReadableStream<Uint8Array>({
      start(ctrl) {
        push = (s) => ctrl.enqueue(new TextEncoder().encode(s));
        push('event: endpoint\ndata: /messages?sid=1\n\n');
      },
    });
    const { fetch } = mockFetch((url, init, body) => {
      if (init.method === 'GET') return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
      expect(url).toBe('https://legacy.example.com/messages?sid=1');
      const rpc = body as Rpc;
      if (rpc.id != null) {
        const result = rpc.method === 'initialize' ? { protocolVersion: '2024-11-05', capabilities: { tools: {} } } : { tools: [{ name: 'x', inputSchema: {} }] };
        setTimeout(() => push!(`event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: rpc.id, result })}\n\n`), 5);
      }
      return new Response('Accepted', { status: 202 });
    });
    const c = new McpClient({ url: 'https://legacy.example.com/sse', transport: 'sse', fetch });
    await c.connect();
    expect((await c.listTools()).map((t) => t.name)).toEqual(['x']);
    await c.close();
  });
});

describe('OAuth discovery', () => {
  it('follows protected resource metadata to the authorization server', async () => {
    const { fetch } = mockFetch((url) => {
      if (url === 'https://mcp.example.com/.well-known/oauth-protected-resource/mcp') return new Response('', { status: 404 });
      if (url === 'https://mcp.example.com/.well-known/oauth-protected-resource') return jsonResponse({ resource: 'https://mcp.example.com/mcp', authorization_servers: ['https://auth.example.com'] });
      if (url === 'https://auth.example.com/.well-known/oauth-authorization-server')
        return jsonResponse({ issuer: 'https://auth.example.com', authorization_endpoint: 'https://auth.example.com/authorize', token_endpoint: 'https://auth.example.com/token', registration_endpoint: 'https://auth.example.com/register' });
      return new Response('', { status: 404 });
    });
    const d = await discoverOAuth(fetch, 'https://mcp.example.com/mcp');
    expect(d.authServer.token_endpoint).toBe('https://auth.example.com/token');
    const url = new URL(buildAuthorizeUrl({ meta: d.authServer, clientId: 'cid', redirectUri: 'nexus://oauth', codeChallenge: 'cc', state: 'st', resource: d.resource }));
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('resource')).toBe('https://mcp.example.com/mcp');
  });
});

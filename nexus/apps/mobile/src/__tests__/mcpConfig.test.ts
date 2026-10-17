import { parseMcpConfig } from '../lib/mcpConfig';

describe('parseMcpConfig', () => {
  it('reads Claude Desktop style configs and separates stdio servers', () => {
    const r = parseMcpConfig(
      JSON.stringify({
        mcpServers: {
          github: { url: 'https://api.githubcopilot.com/mcp/', headers: { Authorization: 'Bearer x' } },
          legacy: { url: 'https://example.com/sse' },
          files: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'] },
        },
      }),
    );
    expect(r.remote.map((x) => [x.name, x.transport])).toEqual([
      ['github', 'http'],
      ['legacy', 'sse'],
    ]);
    expect(r.remote[0]!.headers).toEqual({ Authorization: 'Bearer x' });
    expect(r.stdio).toEqual(['files']);
  });

  it('accepts a single server object and arrays', () => {
    expect(parseMcpConfig('{"name":"A","url":"https://a.dev/mcp","bearer":"t"}').remote[0]).toMatchObject({ name: 'A', bearer: 't' });
    expect(parseMcpConfig('[{"url":"https://b.dev/mcp"}]').remote[0]!.name).toBe('Сервер 1');
  });

  it('throws on invalid JSON', () => {
    expect(() => parseMcpConfig('{oops')).toThrow();
  });
});

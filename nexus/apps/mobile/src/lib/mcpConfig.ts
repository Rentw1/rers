export interface McpImport {
  name: string;
  url: string;
  transport?: 'http' | 'sse';
  headers?: Record<string, string>;
  bearer?: string;
  oauth?: boolean;
}

/** Accepts `{name,url,...}`, `{mcpServers:{name:{url|serverUrl, headers}}}` or a list. stdio entries are returned separately. */
export function parseMcpConfig(json: string): { remote: McpImport[]; stdio: string[] } {
  const v = JSON.parse(json) as unknown;
  const remote: McpImport[] = [];
  const stdio: string[] = [];
  const push = (name: string, e: Record<string, unknown>) => {
    const url = (e.url ?? e.serverUrl) as string | undefined;
    if (typeof e.command === 'string') return stdio.push(name);
    if (!url) return;
    const type = String(e.type ?? e.transport ?? '');
    remote.push({ name, url, transport: type === 'sse' || /\/sse\/?$/.test(url) ? 'sse' : 'http', headers: e.headers as Record<string, string> | undefined, bearer: typeof e.bearer === 'string' ? e.bearer : undefined, oauth: e.oauth === true });
  };
  if (Array.isArray(v)) v.forEach((e, i) => push(String((e as Record<string, unknown>).name ?? `Сервер ${i + 1}`), e as Record<string, unknown>));
  else if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const servers = (o.mcpServers ?? o.servers) as Record<string, Record<string, unknown>> | undefined;
    if (servers) for (const [name, e] of Object.entries(servers)) push(name, e);
    else push(String(o.name ?? 'MCP'), o);
  }
  return { remote, stdio };
}


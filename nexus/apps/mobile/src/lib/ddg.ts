export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

const clean = (t: string) =>
  t
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const attr = (attrs: string, name: string) => new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(attrs);
const attrValue = (attrs: string, name: string) => {
  const m = attr(attrs, name);
  return m ? (m[1] ?? m[2] ?? '') : null;
};
const hasClass = (attrs: string, cls: string) => (attrValue(attrs, 'class') ?? '').split(/\s+/).includes(cls);

export function resolveDdgUrl(href: string): string | null {
  const h = href.replace(/&amp;/g, '&');
  const m = /[?&]uddg=([^&]+)/.exec(h);
  let url: string;
  try {
    url = m ? decodeURIComponent(m[1]!) : h.startsWith('//') ? `https:${h}` : h;
  } catch {
    return null;
  }
  if (!/^https?:\/\//.test(url) || /duckduckgo\.com\/y\.js|ad_provider|ad_domain/.test(url)) return null;
  return url;
}

/** Splits HTML into result chunks starting at each anchor carrying `linkClass`, independent of attribute order. */
function parse(html: string, max: number, linkClass: string, snippetClass: string): SearchResult[] {
  const anchors: { index: number; end: number; attrs: string; inner: string }[] = [];
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (hasClass(m[1]!, linkClass)) anchors.push({ index: m.index, end: re.lastIndex, attrs: m[1]!, inner: m[2]! });
  }
  const out: SearchResult[] = [];
  for (let i = 0; i < anchors.length && out.length < max; i++) {
    const a = anchors[i]!;
    const url = resolveDdgUrl(attrValue(a.attrs, 'href') ?? '');
    if (!url || out.some((r) => r.url === url)) continue;
    const tail = html.slice(a.end, anchors[i + 1]?.index ?? html.length);
    const sm = new RegExp(`<(a|td|div|span)\\b[^>]*class\\s*=\\s*["'][^"']*\\b${snippetClass}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/\\1>`, 'i').exec(tail);
    out.push({ title: clean(a.inner), url, snippet: sm ? clean(sm[2]!) : '' });
  }
  return out;
}

/** html.duckduckgo.com results page. */
export const parseDdgHtml = (html: string, max: number) => parse(html, max, 'result__a', 'result__snippet');

/** lite.duckduckgo.com results page (fallback). */
export const parseDdgLite = (html: string, max: number) => parse(html, max, 'result-link', 'result-snippet');

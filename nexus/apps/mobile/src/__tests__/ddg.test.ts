import { parseDdgHtml, parseDdgLite, resolveDdgUrl } from '../lib/ddg';

const html = `
<div class="result results_links web-result">
  <h2 class="result__title"><a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fdocs.expo.dev%2Frouter%2F&amp;rut=x">Expo <b>Router</b> &amp; docs</a></h2>
  <a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fdocs.expo.dev%2Frouter%2F">File-based <b>routing</b> for React Native.</a>
</div>
<div class="result result--ad"><a href="https://duckduckgo.com/y.js?ad_provider=x" class="result__a">Ad</a></div>
<div class="result"><a href="https://example.com/b" rel="nofollow" class="result__a">Second</a><div class="result__snippet">Snippet two</div></div>
<div class="result"><a class="result__a" href="https://example.com/b">Duplicate</a></div>`;

const lite = `<table><tr><td><a rel="nofollow" href="https://lite.example/a" class='result-link'>Lite A</a></td></tr>
<tr><td class='result-snippet'>Lite snippet</td></tr>
<tr><td><a href="//duckduckgo.com/l/?uddg=https%3A%2F%2Flite.example%2Fb" class='result-link'>Lite B</a></td></tr></table>`;

describe('DuckDuckGo parsing', () => {
  it('parses results regardless of attribute order, skipping ads and duplicates', () => {
    expect(parseDdgHtml(html, 10)).toEqual([
      { title: 'Expo Router & docs', url: 'https://docs.expo.dev/router/', snippet: 'File-based routing for React Native.' },
      { title: 'Second', url: 'https://example.com/b', snippet: 'Snippet two' },
    ]);
    expect(parseDdgHtml(html, 1)).toHaveLength(1);
  });

  it('parses the lite page', () => {
    expect(parseDdgLite(lite, 10)).toEqual([
      { title: 'Lite A', url: 'https://lite.example/a', snippet: 'Lite snippet' },
      { title: 'Lite B', url: 'https://lite.example/b', snippet: '' },
    ]);
  });

  it('rejects non-http and malformed redirects', () => {
    expect(resolveDdgUrl('javascript:alert(1)')).toBeNull();
    expect(resolveDdgUrl('//duckduckgo.com/l/?uddg=%E0%A4%A')).toBeNull();
  });
});

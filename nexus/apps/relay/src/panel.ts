export function panelHtml(): string {
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Nexus Relay</title>
<style>
:root{--bg:#f5f1ea;--card:#fffdf9;--fg:#2b2622;--muted:#7a7069;--accent:#c96442;--line:#e6ded3;--ok:#3b8a5a;--err:#b3412e}
@media (prefers-color-scheme:dark){:root{--bg:#1f1d1a;--card:#2a2723;--fg:#ece6dd;--muted:#a59b90;--line:#3a3530}}
*{box-sizing:border-box}body{margin:0;font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:var(--bg);color:var(--fg)}
main{max-width:980px;margin:0 auto;padding:24px 16px}h1{font:600 26px Georgia,serif;margin:0 0 4px}h2{font-size:16px;margin:0 0 12px}
.muted{color:var(--muted)}.grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));margin-top:20px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px}
.qr{width:100%;max-width:320px;border-radius:10px;background:#fff;padding:6px;display:block;margin:0 auto}
button{background:var(--accent);color:#fff;border:0;border-radius:8px;padding:6px 12px;font:inherit;cursor:pointer}button.ghost{background:transparent;color:var(--accent);border:1px solid var(--accent)}
ul{list-style:none;padding:0;margin:0}li{padding:8px 0;border-top:1px solid var(--line);display:flex;justify-content:space-between;gap:8px;align-items:center}li:first-child{border-top:0}
.dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px}.ready{background:var(--ok)}.error{background:var(--err)}.starting,.stopped{background:var(--muted)}
code{font-size:13px;word-break:break-all}pre{white-space:pre-wrap;font:13px/1.45 ui-monospace,monospace;max-height:360px;overflow:auto;background:var(--bg);padding:10px;border-radius:8px}
</style>
</head>
<body><main>
<h1>Nexus Relay</h1><div class="muted" id="sub">загрузка…</div>
<div class="grid">
<section class="card"><h2>Сопряжение телефона</h2><img class="qr" id="qr" alt="QR-код сопряжения">
<p class="muted">Nexus на телефоне → Настройки → Компьютер → «Сканировать QR». Код одноразовый и действует 10 минут.</p>
<div class="muted" id="urls"></div><p><button class="ghost" onclick="post('/api/panel/rotate').then(load)">Новый код</button></p></section>
<section class="card"><h2>Устройства</h2><ul id="devices"></ul></section>
<section class="card"><h2>MCP-серверы</h2><ul id="servers"></ul><p class="muted">Добавляйте серверы в <code>~/.nexus-relay/config.json</code> (формат <code>mcpServers</code> как в Claude Desktop) и перезапустите Relay.</p><h2>Встроенные инструменты</h2><div class="muted" id="builtin"></div></section>
<section class="card"><h2>Синхронизированные чаты</h2><ul id="chats"></ul><pre id="transcript" hidden></pre></section>
</div></main>
<script>
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function post(u,b){const r=await fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b||{})});return r.json()}
async function load(){
 const d=await (await fetch('/api/panel')).json();
 $('sub').textContent=d.name+' · v'+d.version+' · папки: '+d.config.allowedDirs.join(', ')+(d.config.shell?' · команды разрешены':'');
 $('qr').src=d.pairing.qr;$('urls').innerHTML='Адреса: '+d.pairing.urls.map(u=>'<code>'+esc(u)+'</code>').join(', ');
 $('devices').innerHTML=d.devices.length?d.devices.map(x=>'<li><span>📱 '+esc(x.name)+'<br><small class="muted">был '+new Date(x.lastSeenAt).toLocaleString()+(x.lastIp?' · '+esc(x.lastIp):'')+'</small></span><button class="ghost" data-revoke="'+esc(x.id)+'">Отключить</button></li>').join(''):'<li class="muted">Нет устройств</li>';
 $('servers').innerHTML=d.servers.length?d.servers.map(s=>'<li><span><span class="dot '+s.status+'"></span>'+esc(s.id)+' <small class="muted">'+s.tools+' инстр.'+(s.error?' · '+esc(s.error):'')+'</small></span><button class="ghost" data-restart="'+esc(s.id)+'">↻</button></li>').join(''):'<li class="muted">Серверы не настроены</li>';
 $('builtin').textContent=d.builtin.join(', ');
 $('chats').innerHTML=d.chats.length?d.chats.map(c=>'<li><a href="#" data-chat="'+esc(c.id)+'">'+esc(c.title||'Без названия')+'</a><small class="muted">'+c.messages+' сообщ.</small></li>').join(''):'<li class="muted">Пока пусто</li>';
}
document.addEventListener('click',async e=>{const t=e.target;
 if(t.dataset.revoke&&confirm('Отключить устройство?')){await post('/api/panel/revoke',{deviceId:t.dataset.revoke});load()}
 if(t.dataset.restart){await post('/api/panel/restart',{id:t.dataset.restart});load()}
 if(t.dataset.chat){e.preventDefault();const m=await (await fetch('/api/panel/chat?id='+encodeURIComponent(t.dataset.chat))).json();const p=$('transcript');p.hidden=false;p.textContent=m.map(x=>(x.role==='user'?'Вы: ':'ИИ: ')+x.text).join('\\n\\n')}
});
load();setInterval(load,15000);
</script></body></html>`;
}

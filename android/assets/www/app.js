'use strict';
/* UI, подключение нейросетей по API, картинки, экспорт Word/PDF, история. */

const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const NATIVE = typeof window.Android !== 'undefined' && !!window.Android.http;

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { toast('Недостаточно памяти для сохранения'); return false; } }
};

function toast(msg, ms) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), ms || 2600);
}

/* ===== HTTP через нативный мост (без CORS) или fetch в браузере ===== */
const pending = {};
let reqSeq = 0;
window.__nativeHttp = (id, ok, status, body) => {
  const p = pending[id];
  if (!p) return;
  delete pending[id];
  clearTimeout(p.timer);
  p.resolve({ ok: !!ok, status: status | 0, body: body == null ? '' : String(body) });
};
function blobToDataUrl(b) { return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(b); }); }
function http(method, url, headers, body, timeout, asBase64) {
  const to = timeout || 120000;
  if (NATIVE) {
    return new Promise(resolve => {
      const id = 'r' + (++reqSeq);
      pending[id] = { resolve, timer: setTimeout(() => { if (pending[id]) { delete pending[id]; resolve({ ok: false, status: 0, body: 'Превышено время ожидания' }); } }, to + 5000) };
      window.Android.http(id, method, url, JSON.stringify(headers || {}), body || '', to, !!asBase64);
    });
  }
  const ctl = new AbortController();
  const tm = setTimeout(() => ctl.abort(), to);
  return fetch(url, { method, headers: headers || {}, body: body || undefined, signal: ctl.signal })
    .then(async r => ({ ok: r.ok, status: r.status, body: asBase64 && r.ok ? await blobToDataUrl(await r.blob()) : await r.text() }))
    .catch(e => ({ ok: false, status: 0, body: String(e && e.message || e) }))
    .finally(() => clearTimeout(tm));
}

/* ===== Настройки ===== */
const PROVIDERS = {
  deepseek: { name: 'DeepSeek', base: 'https://api.deepseek.com', model: 'deepseek-chat', key: 'https://platform.deepseek.com/api_keys' },
  openrouter: { name: 'OpenRouter', base: 'https://openrouter.ai/api/v1', model: 'deepseek/deepseek-chat', key: 'https://openrouter.ai/keys' },
  openai: { name: 'OpenAI', base: 'https://api.openai.com/v1', model: 'gpt-4o-mini', key: 'https://platform.openai.com/api-keys' },
  gemini: { name: 'Google Gemini', base: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.5-flash', key: 'https://aistudio.google.com/apikey' },
  groq: { name: 'Groq', base: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', key: 'https://console.groq.com/keys' },
  mistral: { name: 'Mistral', base: 'https://api.mistral.ai/v1', model: 'mistral-large-latest', key: 'https://console.mistral.ai/api-keys' },
  custom: { name: 'Свой сервис (OpenAI-совместимый)', base: '', model: '', key: '' }
};
const POLL_DEFAULT = 'https://image.pollinations.ai/prompt/{prompt}?width=512&height=512&nologo=true&seed={seed}';
const DEF_SETTINGS = {
  org: '', city: '', author: '', position: '', font: '14', caps: true,
  prov: 'deepseek', base: PROVIDERS.deepseek.base, model: PROVIDERS.deepseek.model, key: '', temp: 0.7,
  img: 'emoji', pollUrl: POLL_DEFAULT, pollKey: '', imgBase: 'https://api.openai.com/v1', imgModel: 'dall-e-3', imgKey: '', imgSize: '1024x1024', imgStyle: 'color', translate: true, gemKey: '', gemModel: 'gemini-2.5-flash-image'
};
let S = Object.assign({}, DEF_SETTINGS, store.get('settings', {}));

const DEF_PARAMS = { themeId: 'sad', custom: { name: '', words: '' }, age: 'old', month: 0, week: 1, dir: 'complex', logo: 70, group: 'Логопедическая (компенсирующая)', concl: 'ОНР III уровня', sound: 'Р', lessonType: 'new', form: 'подгрупповая', count: 8, wish: '', seed: 1 };
let state = store.get('current', null) || { params: Object.assign({}, DEF_PARAMS), tasks: [], ai: {}, tab: 'sheet' };
state.params = Object.assign({}, DEF_PARAMS, state.params);
state.ai = state.ai || {};
let answers = true;

function themeOf(p) {
  if (p.themeId === 'custom') return themeFromCustom(p.custom.name, p.custom.words);
  return THEMES.find(t => t.id === p.themeId) || THEMES[0];
}
function ctxOf(p) {
  return makeCtx({ theme: themeOf(p), age: p.age, month: +p.month, week: +p.week, dir: p.dir, logo: +p.logo, concl: p.concl, sound: p.sound, lessonType: p.lessonType, seed: p.seed });
}
function docSettings(p) { return { org: S.org, city: S.city, author: S.author, position: S.position, groupType: p.group, form: p.form }; }

/* ===== Навигация ===== */
const navStack = [];
function show(scr, push) {
  const cur = $('.scr.active');
  if (cur && push !== false && cur.id !== 'scr-' + scr) navStack.push(cur.id.slice(4));
  $$('.scr').forEach(e => e.classList.toggle('active', e.id === 'scr-' + scr));
  $$('#nav button').forEach(b => b.classList.toggle('on', b.dataset.scr === scr));
  window.scrollTo(0, 0);
  if (scr === 'history') renderHistory();
  if (scr === 'plan') renderPlan();
  if (scr === 'prompt') renderPrompt();
  if (scr === 'result') renderResult();
}
window.onAndroidBack = () => {
  if (!$('#busy').classList.contains('hidden')) { cancelBusy(); return true; }
  const prev = navStack.pop();
  if (prev) { show(prev, false); return true; }
  if (!$('#scr-build').classList.contains('active')) { show('build', false); return true; }
  return false;
};

/* ===== Форма конструктора ===== */
function fillSelect(sel, items, val) {
  sel.innerHTML = items.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join('');
  if (val != null) sel.value = val;
}
function initForm() {
  fillSelect($('#fMonth'), MONTHS.map((m, i) => [i, m]));
  const opts = [];
  MONTHS.forEach((m, i) => THEMES.filter(t => t.m === i).forEach(t => opts.push([t.id, `${m.slice(0, 3)}, ${t.wk} нед. — ${t.name}`])));
  opts.push(['custom', '✏️ Своя тема…']);
  fillSelect($('#fTheme'), opts);
  fillSelect($('#fConcl'), CONCLUSIONS.map(c => [c, c]));
  fillSelect($('#fSound'), Object.keys(SOUNDS).map(s => [s, `[${s}]`]));
  fillSelect($('#fDir'), Object.entries(DIRECTIONS));
  const p = state.params;
  $('#fMonth').value = p.month; $('#fWeek').value = p.week; $('#fTheme').value = p.themeId;
  $('#fCustomName').value = p.custom.name || ''; $('#fCustomWords').value = p.custom.words || '';
  $('#fGroup').value = p.group; $('#fLogo').value = p.logo; $('#fConcl').value = p.concl; $('#fSound').value = p.sound;
  $('#fDir').value = p.dir; $('#fType').value = p.lessonType; $('#fForm').value = p.form; $('#fCount').value = p.count; $('#fWish').value = p.wish || '';
  setAge(p.age, false);
  syncForm();

  $('#fMonth').onchange = $('#fWeek').onchange = () => {
    const m = +$('#fMonth').value, w = +$('#fWeek').value;
    const t = THEMES.find(x => x.m === m && x.wk === w) || THEMES.filter(x => x.m === m).sort((a, b) => Math.abs(a.wk - w) - Math.abs(b.wk - w))[0];
    if (t && $('#fTheme').value !== 'custom') $('#fTheme').value = t.id;
    syncForm();
  };
  $('#fTheme').onchange = () => {
    const t = THEMES.find(x => x.id === $('#fTheme').value);
    if (t) { $('#fMonth').value = t.m; $('#fWeek').value = t.wk; }
    syncForm();
  };
  $('#fGroup').onchange = () => {
    const g = $('#fGroup').value;
    $('#fLogo').value = g.startsWith('Общ') ? 0 : g.startsWith('Комб') ? 40 : 70;
    syncForm();
  };
  ['#fLogo', '#fCount', '#fCustomName', '#fCustomWords', '#fConcl', '#fSound', '#fDir', '#fType', '#fForm', '#fWish'].forEach(s => { $(s).oninput = syncForm; $(s).onchange = syncForm; });
  $$('#fAge button').forEach(b => b.onclick = () => { setAge(b.dataset.v, true); syncForm(); });
}
function setAge(a, resetCount) {
  $$('#fAge button').forEach(b => b.classList.toggle('on', b.dataset.v === a));
  $('#fAge').dataset.v = a;
  if (resetCount) $('#fCount').value = AGES[a].tasks;
}
function readForm() {
  const p = state.params;
  p.month = +$('#fMonth').value; p.week = +$('#fWeek').value; p.themeId = $('#fTheme').value;
  p.custom = { name: $('#fCustomName').value.trim(), words: $('#fCustomWords').value };
  p.age = $('#fAge').dataset.v || 'old'; p.group = $('#fGroup').value; p.logo = +$('#fLogo').value;
  p.concl = $('#fConcl').value; p.sound = $('#fSound').value; p.dir = $('#fDir').value; p.lessonType = $('#fType').value;
  p.form = $('#fForm').value; p.count = +$('#fCount').value; p.wish = $('#fWish').value.trim();
  return p;
}
function syncForm() {
  const p = readForm();
  $('#customBox').classList.toggle('hidden', p.themeId !== 'custom');
  $('#logoVal').textContent = p.logo + '%';
  $('#cntVal').textContent = p.count;
  $('#logoOpts').style.opacity = p.logo > 0 ? 1 : 0.45;
  const step = p.month * 4 + p.week;
  $('#lvlFill').style.width = (step / 36 * 100) + '%';
  $('#lvlText').textContent = `Сложность ${step}/36 · ${MATH_PLAN[p.age][p.month].max <= 5 ? 'начальный' : step < 18 ? 'средний' : 'повышенный'} уровень`;
}

/* ===== Сборка занятия ===== */
function buildLesson() {
  const p = readForm();
  if (p.themeId === 'custom' && themeOf(p).words.length < 3) { toast('Введите минимум 3 слова своей темы'); return; }
  p.seed = (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0;
  const c = ctxOf(p);
  const ids = chooseTasks(c, p.count);
  state.tasks = ids.map((id, i) => ({ id, seed: (p.seed + (i + 1) * 7919) >>> 0 }));
  state.ai = {};
  state.tab = 'sheet';
  saveCurrent();
  addHistory();
  show('result');
}
function saveCurrent() { store.set('current', state); }

let renderedTasks = [];
function currentTasks() {
  const c = ctxOf(state.params);
  renderedTasks = [];
  const out = [];
  state.tasks.forEach((t, i) => { const x = genTask(c, t.id, t.seed); if (x) { out.push(x); renderedTasks.push(i); } });
  return { c, tasks: out };
}
function docHtml(tab) {
  if (!state.tasks.length) return '<p class="note center">Соберите занятие в «Конструкторе».</p>';
  const { c, tasks } = currentTasks();
  const ds = docSettings(state.params);
  if (state.ai[tab]) return `<div class="doc md">${mdToHtml(state.ai[tab], c)}<p class="ai-mark">Сгенерировано ИИ (${esc(S.model)})</p></div>`;
  if (tab === 'sheet') return buildWorksheet(c, tasks, ds, true);
  if (tab === 'konspekt') return buildKonspekt(c, tasks, ds);
  return buildParents(c, tasks, ds);
}
function renderResult() {
  $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === state.tab));
  const out = $('#out');
  out.innerHTML = docHtml(state.tab);
  out.classList.toggle('hide-answers', !answers);
  out.classList.toggle('nocaps', !S.caps);
  $('#addRow').classList.toggle('hidden', state.tab !== 'sheet' || !!state.ai.sheet || !state.tasks.length);
  $('#btnRevert').classList.toggle('hidden', !state.ai[state.tab]);
  if (state.tab === 'sheet' && state.tasks.length) fillAddSelect();
  hydratePics(out);
}
function fillAddSelect() {
  const c = ctxOf(state.params);
  const names = { speech: 'Речь', math: 'Математика', world: 'Окружающий мир', gram: 'Грамота', logo: 'Логопедия', motor: 'Моторика' };
  const groups = {};
  Object.values(T).forEach(t => { let ok = false; try { ok = !!t.ok(c); } catch (e) { ok = false; } if (ok) (groups[t.dir] = groups[t.dir] || []).push(t); });
  $('#addSel').innerHTML = Object.keys(names).filter(d => groups[d]).map(d => `<optgroup label="${names[d]}">${groups[d].map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</optgroup>`).join('');
}
function onTaskTool(e) {
  const b = e.target.closest('button[data-act]');
  if (!b) return;
  const vi = +b.dataset.i;
  const i = renderedTasks[vi];
  if (i == null) return;
  const act = b.dataset.act;
  const y = window.scrollY;
  if (act === 'regen') state.tasks[i].seed = (state.tasks[i].seed * 1103515245 + 12345 + Date.now()) >>> 0;
  if (act === 'del') state.tasks.splice(i, 1);
  if (act === 'up' && i > 0) [state.tasks[i - 1], state.tasks[i]] = [state.tasks[i], state.tasks[i - 1]];
  if (act === 'down' && i < state.tasks.length - 1) [state.tasks[i + 1], state.tasks[i]] = [state.tasks[i], state.tasks[i + 1]];
  saveCurrent(); updateHistory();
  renderResult();
  window.scrollTo(0, y);
}

/* ===== Markdown → HTML (для ответов ИИ) ===== */
function inlineMd(s, c) {
  let h = esc(s);
  h = h.replace(/\[\[\s*(?:картинка|рисунок|image)\s*:\s*([^\]]+?)\s*\]\]/gi, (_, w) => {
    const word = w.trim().toLowerCase();
    const found = c && c.words.find(x => x.nom === word) || THEMES.flatMap(t => t.words).find(x => x.nom === word);
    return pic({ nom: word, e: found ? found.e : '' }, { size: 44 });
  });
  h = h.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1<i>$2</i>').replace(/`([^`]+)`/g, '<code>$1</code>');
  return h;
}
function mdToHtml(md, c) {
  const lines = String(md || '').replace(/\r/g, '').split('\n');
  let h = '', list = null, para = [];
  const flushP = () => { if (para.length) { h += `<p>${para.map(x => inlineMd(x, c)).join('<br>')}</p>`; para = []; } };
  const flushL = () => { if (list) { h += `</${list}>`; list = null; } };
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    const t = ln.trim();
    if (!t) { flushP(); flushL(); continue; }
    let m;
    if ((m = t.match(/^(#{1,4})\s+(.*)$/))) { flushP(); flushL(); const lv = Math.min(3, m[1].length); h += `<h${lv}>${inlineMd(m[2], c)}</h${lv}>`; continue; }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) { flushP(); flushL(); h += '<hr>'; continue; }
    if (t.startsWith('|') && i + 1 < lines.length && /^\|?\s*:?-{2,}/.test(lines[i + 1].trim())) {
      flushP(); flushL();
      const row = r => r.trim().replace(/^\||\|$/g, '').split('|').map(x => x.trim());
      const head = row(t); i += 1;
      let tb = `<table class="md"><tr>${head.map(x => `<th>${inlineMd(x, c)}</th>`).join('')}</tr>`;
      while (i + 1 < lines.length && lines[i + 1].trim().startsWith('|')) { i++; tb += `<tr>${row(lines[i]).map(x => `<td>${inlineMd(x, c)}</td>`).join('')}</tr>`; }
      h += tb + '</table>'; continue;
    }
    if ((m = t.match(/^(\d+)[.)]\s+(.*)$/))) { flushP(); if (list !== 'ol') { flushL(); h += '<ol>'; list = 'ol'; } h += `<li>${inlineMd(m[2], c)}</li>`; continue; }
    if ((m = t.match(/^[-*•]\s+(.*)$/))) { flushP(); if (list !== 'ul') { flushL(); h += '<ul>'; list = 'ul'; } h += `<li>${inlineMd(m[1], c)}</li>`; continue; }
    if (t.startsWith('>')) { flushP(); flushL(); h += `<blockquote>${inlineMd(t.replace(/^>\s?/, ''), c)}</blockquote>`; continue; }
    flushL(); para.push(t);
  }
  flushP(); flushL();
  return h;
}
function htmlToText(html) {
  const d = document.createElement('div');
  d.innerHTML = html.replace(/<(br|\/p|\/li|\/h\d|\/tr|\/div)>/gi, '\n$&');
  d.querySelectorAll('.task-tools, svg, style').forEach(e => e.remove());
  d.querySelectorAll('.pic').forEach(e => { e.textContent = `[[картинка: ${e.dataset.q}]] `; });
  return d.textContent.replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
}

/* ===== Текстовая нейросеть ===== */
let busyCancel = null;
function busy(on, text) {
  $('#busy').classList.toggle('hidden', !on);
  if (text) $('#busyText').textContent = text;
}
function cancelBusy() { if (busyCancel) busyCancel(); busyCancel = null; busy(false); }
function aiReady() { return !!(S.key && S.base && S.model); }
function updateBadge() {
  const b = $('#aiBadge');
  b.textContent = aiReady() ? `ИИ: ${PROVIDERS[S.prov] ? PROVIDERS[S.prov].name : 'API'}` : 'ИИ: не подключён';
  b.classList.toggle('on', aiReady());
}
function parseErr(r) {
  try { const j = JSON.parse(r.body); const m = j.error && (j.error.message || j.error) || j.message; if (m) return `${r.status}: ${typeof m === 'string' ? m : JSON.stringify(m)}`; } catch (e) { /* не JSON */ }
  if (r.status === 401) return '401: неверный API-ключ';
  if (r.status === 402) return '402: на балансе нет средств';
  if (r.status === 429) return '429: слишком много запросов, подождите';
  return (r.status ? r.status + ': ' : '') + String(r.body || 'нет ответа').slice(0, 200);
}
async function chat(messages, maxTokens, timeout) {
  if (!aiReady()) throw new Error('Подключите нейросеть: Настройки → API-ключ');
  const url = S.base.replace(/\/+$/, '') + '/chat/completions';
  const headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + S.key };
  if (S.prov === 'openrouter') { headers['HTTP-Referer'] = 'https://konstruktor-dou.app'; headers['X-Title'] = 'Konstruktor DOU'; }
  const body = JSON.stringify({ model: S.model, messages, temperature: +S.temp, max_tokens: maxTokens || 8000, stream: false });
  let cancelled = false;
  const pr = http('POST', url, headers, body, timeout || 240000);
  busyCancel = () => { cancelled = true; };
  const r = await pr;
  if (cancelled) throw new Error('Отменено');
  if (!r.ok) throw new Error(parseErr(r));
  let j;
  try { j = JSON.parse(r.body); } catch (e) { throw new Error('Сервер вернул не JSON'); }
  const msg = j.choices && j.choices[0] && j.choices[0].message;
  const txt = msg && (msg.content || '');
  if (!txt) throw new Error('Пустой ответ нейросети');
  return txt.replace(/^```(?:markdown|md)?\s*/i, '').replace(/```\s*$/, '').trim();
}

const TAB_NAMES = { sheet: 'Рабочий лист', konspekt: 'Конспект занятия', parents: 'Задание для родителей (4–5 упражнений на дом)' };
function userPrompt(tab) {
  const p = state.params;
  const c = ctxOf(p);
  const a = AGES[p.age];
  const draft = state.tasks.length ? htmlToText(tab === 'sheet' ? buildWorksheet(c, currentTasks().tasks, docSettings(p), true) : tab === 'konspekt' ? buildKonspekt(c, currentTasks().tasks, docSettings(p)) : buildParents(c, currentTasks().tasks, docSettings(p))).slice(0, 7000) : '';
  return `Параметры занятия:
- Лексическая тема: «${c.theme.name}» (обобщающее понятие: ${c.theme.gen})
- Слова темы: ${c.words.map(w => w.nom).join(', ')}
- Группа: ${a.name} (${a.years}), длительность ${a.minutes} мин
- Период: ${MONTHS[p.month]}, ${p.week}-я неделя — уровень сложности ${c.step + 1} из 36 (${c.step < 12 ? 'начало' : c.step < 24 ? 'середина' : 'конец'} учебного года)
- Направление: ${DIRECTIONS[p.dir]}
- Направленность группы: ${p.group}; логопедическая составляющая: ${p.logo}%${p.logo > 0 ? `; речевое заключение: ${p.concl}; звук для автоматизации: [${p.sound}]` : ' (коррекционные задачи не нужны)'}
- Тип занятия: ${{ new: 'изучение нового', fix: 'закрепление', final: 'итоговое' }[p.lessonType]}; форма: ${p.form}
- Количество заданий в рабочем листе: ${p.count}
- Программа месяца: математика — ${c.math.topic}; грамота — ${c.gram.topic}; речь — ${c.speech.topic}; окружающий мир — ${c.world}
${p.wish ? `- Пожелания педагога: ${p.wish}\n` : ''}
${draft ? `Черновик из конструктора (возьми за основу, исправь, улучши и дополни, сохрани уровень сложности):\n"""\n${draft}\n"""\n` : ''}
Задание: составь документ «${TAB_NAMES[tab]}» полностью и готовым к печати. ${tab === 'sheet' ? 'Для картинок используй метки [[картинка: слово]]. После каждого задания — строка «**Для педагога:** …».' : ''}${tab === 'parents' ? `Ровно ${p.logo > 0 ? 5 : 4} упражнений.` : ''}${tab === 'konspekt' ? ' Технологическую карту не составляй.' : ''}`;
}
async function aiGenerate(tabs) {
  if (!state.tasks.length) { toast('Сначала соберите занятие'); return; }
  if (!aiReady()) { toast('Подключите нейросеть в Настройках'); show('settings'); return; }
  try {
    for (let i = 0; i < tabs.length; i++) {
      const tab = tabs[i];
      busy(true, `ИИ составляет: ${TAB_NAMES[tab]}${tabs.length > 1 ? ` (${i + 1}/${tabs.length})` : ''}…\nЭто занимает 20–90 секунд.`);
      const txt = await chat([{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userPrompt(tab) }]);
      state.ai[tab] = txt;
      saveCurrent(); updateHistory();
    }
    busy(false);
    toast('Готово');
    renderResult();
  } catch (e) {
    busy(false);
    if (e.message !== 'Отменено') toast('Ошибка ИИ: ' + e.message, 6000);
    renderResult();
  }
}

/* ===== Картинки ===== */
const imgMem = {};
let idb = null;
function idbOpen() {
  if (idb) return idb;
  idb = new Promise(res => {
    try {
      const rq = indexedDB.open('kdou-img', 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore('img');
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => res(null);
    } catch (e) { res(null); }
  });
  return idb;
}
async function idbGet(k) { const db = await idbOpen(); if (!db) return null; return new Promise(res => { try { const r = db.transaction('img').objectStore('img').get(k); r.onsuccess = () => res(r.result || null); r.onerror = () => res(null); } catch (e) { res(null); } }); }
async function idbSet(k, v) { const db = await idbOpen(); if (!db) return; try { db.transaction('img', 'readwrite').objectStore('img').put(v, k); } catch (e) { /* квота */ } }
async function idbDel(k) { const db = await idbOpen(); if (!db) return; try { db.transaction('img', 'readwrite').objectStore('img').delete(k); } catch (e) { /* нет базы */ } }
async function idbClearCache() {
  const db = await idbOpen(); if (!db) return;
  await new Promise(res => {
    try {
      const rq = db.transaction('img', 'readwrite').objectStore('img').openCursor();
      rq.onsuccess = () => { const c = rq.result; if (!c) return res(); if (!String(c.key).startsWith('own|')) c.delete(); c.continue(); };
      rq.onerror = () => res();
    } catch (e) { res(); }
  });
}
const ownPics = () => new Set(store.get('ownPics', []));

function hashStr(s) { let h = 2166136261; for (const ch of s) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
async function translateWords(words) {
  const tr = store.get('tr', {});
  const need = words.filter(w => !tr[w]);
  if (need.length && S.translate && aiReady()) {
    try {
      const txt = await chat([{ role: 'system', content: 'Ты переводчик. Отвечай только JSON-объектом без пояснений.' }, { role: 'user', content: 'Переведи русские слова на английский (одно-два слова, предмет для картинки). Верни JSON {"слово":"word"}: ' + JSON.stringify(need) }], 800, 60000);
      const j = JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1));
      Object.keys(j).forEach(k => { if (typeof j[k] === 'string') tr[k.toLowerCase()] = j[k]; });
      store.set('tr', tr);
    } catch (e) { /* без перевода */ }
  }
  return w => tr[w] || w;
}
function imgPrompt(word) { return (S.imgStyle === 'coloring' ? IMAGE_PROMPT_COLORING : IMAGE_PROMPT_DEFAULT).replace('{word}', word); }
function geminiPrompt(word) {
  const p = state.params;
  return GEMINI_IMAGE_PROMPT.replace('{word}', word).replace('{theme}', themeOf(p).name).replace('{age}', AGES[p.age].years)
    .replace('{style}', S.imgStyle === 'coloring' ? GEMINI_STYLE_COLORING : GEMINI_STYLE_COLOR);
}
function geminiErr(r) {
  const m = parseErr(r);
  if (/location is not supported|FAILED_PRECONDITION/i.test(m)) return 'Gemini API недоступен из вашего региона — включите VPN на телефоне (страна из списка Google) и повторите';
  if (/billing|free_tier|limit: 0|quota/i.test(m)) return 'Для картинок Gemini нужен платёжный аккаунт или кредиты Google Cloud (см. Настройки → Gemini). ' + m.slice(0, 120);
  return m;
}

async function resolveImage(word, tr) {
  const key = `${S.img}|${S.imgStyle}|${S.img === 'openai' ? S.imgModel : S.img === 'gemini' ? S.gemModel : ''}|${word}`;
  if (ownPics().has(word)) { const own = await idbGet('own|' + word); if (own) return own; }
  if (imgMem[key] !== undefined) return imgMem[key];
  let url = null;
  if (S.img === 'gemini') {
    const cached = await idbGet(key);
    const gk = S.gemKey || (S.prov === 'gemini' ? S.key : '');
    if (cached) url = cached;
    else if (gk) {
      const body = { contents: [{ parts: [{ text: geminiPrompt(word) }] }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio: '1:1' } } };
      const r = await http('POST', `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(S.gemModel || 'gemini-2.5-flash-image')}:generateContent`, { 'Content-Type': 'application/json', 'x-goog-api-key': gk }, JSON.stringify(body), 180000);
      if (r.ok) {
        try {
          const parts = JSON.parse(r.body).candidates[0].content.parts;
          const im = parts.map(x => x.inlineData || x.inline_data).find(Boolean);
          if (im && im.data) url = `data:${im.mimeType || im.mime_type || 'image/png'};base64,${im.data}`;
        } catch (e) { url = null; }
        if (url) await idbSet(key, url);
      } else if (!resolveImage._warned) { resolveImage._warned = 1; toast('Gemini: ' + geminiErr(r), 7000); }
    }
  } else if (S.img === 'arasaac') {
    const ids = store.get('arasaac', {});
    if (ids[word] === undefined) {
      const r = await http('GET', 'https://api.arasaac.org/v1/pictograms/ru/search/' + encodeURIComponent(word), {}, '', 20000);
      let id = 0;
      if (r.ok) { try { const j = JSON.parse(r.body); if (Array.isArray(j) && j.length) id = j[0]._id; } catch (e) { id = 0; } }
      if (r.ok || r.status === 404) { ids[word] = id; store.set('arasaac', ids); }
    }
    if (ids[word]) url = `https://static.arasaac.org/pictograms/${ids[word]}/${ids[word]}_300.png`;
  } else if (S.img === 'pollinations') {
    const tpl = S.pollUrl || POLL_DEFAULT;
    url = tpl.replace('{prompt}', encodeURIComponent(imgPrompt(tr(word)))).replace('{seed}', hashStr(word) % 100000);
    if (S.pollKey) url += (url.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(S.pollKey);
  } else if (S.img === 'openai') {
    const cached = await idbGet(key);
    if (cached) url = cached;
    else if (S.imgKey && S.imgBase) {
      const body = { model: S.imgModel, prompt: imgPrompt(tr(word)), n: 1, size: S.imgSize };
      if (/dall-e/i.test(S.imgModel)) body.response_format = 'b64_json';
      const r = await http('POST', S.imgBase.replace(/\/+$/, '') + '/images/generations', { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + S.imgKey }, JSON.stringify(body), 180000);
      if (r.ok) {
        try {
          const d = JSON.parse(r.body).data[0];
          if (d.b64_json) url = 'data:image/png;base64,' + d.b64_json;
          else if (d.url) { const b = await http('GET', d.url, {}, '', 60000, true); url = b.ok ? b.body : d.url; }
        } catch (e) { url = null; }
        if (url) await idbSet(key, url);
      } else if (!resolveImage._warned) { resolveImage._warned = 1; toast('Картинки: ' + parseErr(r), 5000); }
    }
  }
  imgMem[key] = url;
  return url;
}
let hydrateRun = 0;
async function hydratePics(root) {
  const run = ++hydrateRun;
  const els = Array.from(root.querySelectorAll('.pic[data-q]'));
  const own = ownPics();
  const words = [...new Set(els.map(e => e.dataset.q))].filter(w => S.img !== 'emoji' || own.has(w));
  if (!words.length) return;
  const tr = (S.img === 'pollinations' || S.img === 'openai') ? await translateWords(words) : (w => w);
  const queue = words.slice();
  const apply = (w, url) => {
    if (!url || run !== hydrateRun) return;
    root.querySelectorAll(`.pic[data-q="${CSS.escape(w)}"]`).forEach(e => {
      const emo = e.querySelector('.emo');
      const old = e.querySelector('img');
      if (old) { old.src = url; return; }
      if (!emo) return;
      const img = new Image();
      img.alt = w;
      img.loading = 'lazy';
      img.onload = () => { if (emo.parentNode) emo.replaceWith(img); };
      img.src = url;
    });
  };
  const workers = Array.from({ length: S.img === 'openai' || S.img === 'gemini' ? 2 : 4 }, async () => {
    while (queue.length && run === hydrateRun) {
      const w = queue.shift();
      try { apply(w, await resolveImage(w, tr)); } catch (e) { /* эмодзи остаётся */ }
    }
  });
  await Promise.all(workers);
}

/* ===== Свои картинки (например, из приложения Gemini) ===== */
let replaceWord = null;
function onPicTap(e) {
  if (!$('#tReplace').checked) return;
  const p = e.target.closest('.pic[data-q]');
  if (!p) return;
  e.preventDefault();
  replaceWord = p.dataset.q;
  $('#fOwnPic').click();
}
function resizeImage(file) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onerror = () => rej(new Error('Не удалось прочитать файл'));
    fr.onload = () => {
      const im = new Image();
      im.onerror = () => rej(new Error('Это не картинка'));
      im.onload = () => {
        const k = Math.min(1, 360 / Math.max(im.width, im.height));
        const cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(im.width * k)); cv.height = Math.max(1, Math.round(im.height * k));
        const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(im, 0, 0, cv.width, cv.height);
        res(cv.toDataURL('image/jpeg', 0.88));
      };
      im.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}
async function onOwnPic(file) {
  if (!file || !replaceWord) return;
  if (file.size > 25 * 1024 * 1024) { toast('Файл слишком большой'); return; }
  try {
    const data = await resizeImage(file);
    await idbSet('own|' + replaceWord, data);
    const set = ownPics(); set.add(replaceWord); store.set('ownPics', [...set]);
    toast(`Картинка для «${replaceWord}» сохранена`);
    renderResult();
  } catch (e) { toast(e.message, 4000); }
}
async function clearOwnPics() {
  const set = ownPics();
  for (const w of set) await idbDel('own|' + w);
  store.set('ownPics', []);
  toast('Свои картинки удалены: ' + set.size);
  renderResult();
}
function geminiManualPrompt() {
  if (!state.tasks.length) return 'Соберите занятие, чтобы получить список картинок.';
  const d = document.createElement('div');
  d.innerHTML = docHtml('sheet');
  const words = [...new Set(Array.from(d.querySelectorAll('.pic[data-q]')).map(e => e.dataset.q))];
  const p = state.params;
  return GEMINI_MANUAL_PROMPT.replace('{theme}', themeOf(p).name).replace('{age}', AGES[p.age].years)
    .replace('{style}', S.imgStyle === 'coloring' ? GEMINI_STYLE_COLORING : GEMINI_STYLE_COLOR)
    .replace('{count}', words.length).replace('{words}', words.map((w, i) => `${i + 1}. ${w}`).join('\n'))
    .replace('{grid}', words.slice(0, 9).join(', '));
}

/* ===== Экспорт: Word (MHT с картинками), PDF (печать), отправка ===== */
function fileBase() {
  const c = ctxOf(state.params);
  const n = { sheet: 'Рабочий лист', konspekt: 'Конспект', parents: 'Родителям' }[state.tab];
  return `${n} - ${c.theme.name} - ${AGES[state.params.age].name}`.replace(/[\\/:*?"<>|«»]/g, '').slice(0, 90);
}
function exportClone() {
  const d = document.createElement('div');
  d.innerHTML = $('#out').innerHTML;
  d.querySelectorAll('.task-tools, .no-print').forEach(e => e.remove());
  if (!answers) d.querySelectorAll('.answer').forEach(e => e.remove());
  if (!S.caps) d.querySelectorAll('.pic .cap').forEach(e => e.remove());
  return d;
}
async function buildDocx() {
  const d = exportClone();
  const host = document.createElement('div');
  host.className = 'out' + (S.caps ? '' : ' nocaps');
  host.style.cssText = 'position:absolute;left:-10000px;top:0;width:760px';
  host.appendChild(d);
  document.body.appendChild(host);
  try {
    const fetcher = async url => { const r = await http('GET', url, {}, '', 30000, true); return r.ok && r.body.startsWith('data:') ? r.body : null; };
    return await htmlToDocx(d, { fs: +S.font || 14, title: fileBase(), fetcher });
  } finally { host.remove(); }
}
async function printHtml() {
  const d = exportClone();
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(fileBase())}</title><link rel="stylesheet" href="doc.css"><style>body{margin:0;padding:0;background:#fff} @page{size:A4;margin:12mm}</style></head><body>${d.innerHTML}</body></html>`;
}
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
async function exportWord(share) {
  if (!state.tasks.length) { toast('Сначала соберите занятие'); return; }
  busy(true, 'Готовлю документ Word…');
  try {
    const bytes = await buildDocx();
    const name = fileBase() + '.docx';
    if (NATIVE) {
      const b64 = u8ToB64(bytes);
      const res = JSON.parse(share ? window.Android.shareFile(name, DOCX_MIME, b64, true) : window.Android.saveFile(name, DOCX_MIME, b64, true));
      busy(false);
      if (res.ok) toast(share ? 'Выберите, куда отправить' : 'Сохранено: ' + res.path, 4000); else toast('Ошибка: ' + res.error, 5000);
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([bytes], { type: DOCX_MIME }));
      a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      busy(false);
    }
  } catch (e) { busy(false); toast('Ошибка экспорта: ' + e.message, 5000); }
}
async function exportPdf() {
  if (!state.tasks.length) { toast('Сначала соберите занятие'); return; }
  const html = await printHtml();
  if (NATIVE && window.Android.print) { window.Android.print(html, fileBase()); toast('В окне печати выберите «Сохранить как PDF»', 4000); }
  else { const w = window.open('', '_blank'); if (w) { w.document.write(html.replace('href="doc.css"', 'href="' + location.href.replace(/[^/]*$/, '') + 'doc.css"')); w.document.close(); setTimeout(() => w.print(), 500); } }
}

/* ===== История ===== */
function lessonTitle(p) { return `${themeOf(p).name} · ${AGES[p.age].name}`; }
function addHistory() {
  const h = store.get('history', []);
  state.hid = Date.now();
  h.unshift({ id: state.hid, date: new Date().toISOString(), title: lessonTitle(state.params), params: JSON.parse(JSON.stringify(state.params)), tasks: state.tasks, ai: state.ai });
  while (h.length > 60) h.pop();
  if (!store.set('history', h)) { h.length = Math.min(h.length, 20); store.set('history', h); }
  saveCurrent();
}
function updateHistory() {
  if (!state.hid) return;
  const h = store.get('history', []);
  const x = h.find(e => e.id === state.hid);
  if (x) { x.tasks = state.tasks; x.ai = state.ai; store.set('history', h); }
}
function renderHistory() {
  const h = store.get('history', []);
  $('#histList').innerHTML = h.length ? h.map(x => `<div class="hist"><div><b>${esc(x.title)}</b><small>${new Date(x.date).toLocaleString('ru-RU')} · ${MONTHS[x.params.month]}, ${x.params.week} нед. · логопедия ${x.params.logo}%${x.ai && Object.keys(x.ai).length ? ' · ✨ИИ' : ''}</small></div><div class="btns"><button data-open="${x.id}">Открыть</button><button data-del="${x.id}">✕</button></div></div>`).join('') : '<p class="note">Пока пусто. Соберите первое занятие.</p>';
}
function onHistoryClick(e) {
  const o = e.target.closest('[data-open]'), d = e.target.closest('[data-del]');
  const h = store.get('history', []);
  if (o) {
    const x = h.find(v => v.id === +o.dataset.open);
    if (!x) return;
    state = { params: Object.assign({}, DEF_PARAMS, x.params), tasks: x.tasks || [], ai: x.ai || {}, tab: 'sheet', hid: x.id };
    saveCurrent(); initForm(); show('result');
  }
  if (d) { store.set('history', h.filter(v => v.id !== +d.dataset.del)); renderHistory(); }
}
function exportAll() {
  const data = JSON.stringify({ app: 'konstruktor-dou', v: 1, settings: Object.assign({}, S, { key: '', imgKey: '', pollKey: '' }), history: store.get('history', []) }, null, 1);
  const name = 'konstruktor-dou-backup-' + new Date().toISOString().slice(0, 10) + '.json';
  if (NATIVE) { const r = JSON.parse(window.Android.saveFile(name, 'application/json', data, false)); toast(r.ok ? 'Сохранено: ' + r.path : 'Ошибка: ' + r.error, 4000); }
  else { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' })); a.download = name; a.click(); }
}
function importAll(file) {
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) { toast('Файл слишком большой'); return; }
  const fr = new FileReader();
  fr.onload = () => {
    try {
      const j = JSON.parse(fr.result);
      if (j.app !== 'konstruktor-dou' || !Array.isArray(j.history)) throw new Error('Это не резервная копия приложения');
      const cur = store.get('history', []);
      const ids = new Set(cur.map(x => x.id));
      const merged = cur.concat(j.history.filter(x => x && x.id && x.params && !ids.has(x.id))).sort((a, b) => b.id - a.id).slice(0, 60);
      store.set('history', merged);
      if (j.settings) { const keep = { key: S.key, imgKey: S.imgKey, pollKey: S.pollKey }; S = Object.assign({}, DEF_SETTINGS, j.settings, keep); store.set('settings', S); initSettings(); }
      renderHistory(); toast('Загружено занятий: ' + merged.length);
    } catch (e) { toast('Ошибка: ' + e.message, 5000); }
  };
  fr.readAsText(file);
}

/* ===== План года ===== */
function renderPlan(age) {
  const a = age || ($('#planAge .on') || {}).dataset && $('#planAge .on').dataset.v || 'mid';
  $$('#planAge button').forEach(b => b.classList.toggle('on', b.dataset.v === a));
  $('#planOut').innerHTML = `<p class="note">${AGES[a].name} (${AGES[a].years}): ${AGES[a].minutes} мин. Задания автоматически усложняются от сентября к маю.</p><table class="plan-t"><tr><th>Месяц / темы</th><th>Математика</th><th>Грамота</th><th>Речь</th><th>Окружающий мир</th></tr>${MONTHS.map((m, i) => `<tr><td><b>${m}</b><br>${THEMES.filter(t => t.m === i).map(t => esc(t.name)).join('<br>')}</td><td>${esc(MATH_PLAN[a][i].topic)}</td><td>${esc(GRAM_PLAN[a][i].topic)}</td><td>${esc(SPEECH_PLAN[a][i].topic)}</td><td>${esc(WORLD_PLAN[a][i])}</td></tr>`).join('')}</table>`;
}

/* ===== Промпт ===== */
function renderPrompt() {
  $('#promptText').textContent = SYSTEM_PROMPT;
  $('#userPromptText').textContent = state.tasks.length ? userPrompt(state.tab || 'konspekt') : 'Соберите занятие, чтобы увидеть запрос.';
  $('#gemPromptText').textContent = geminiManualPrompt();
}
function copyText(t) {
  const fallback = () => { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); toast('Скопировано'); } catch (e) { toast('Не удалось скопировать'); } ta.remove(); };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(() => toast('Скопировано'), fallback); else fallback();
}

/* ===== Настройки ===== */
function initSettings() {
  fillSelect($('#sProv'), Object.entries(PROVIDERS).map(([k, v]) => [k, v.name]), S.prov);
  const map = { sGemKey: 'gemKey', sGemModel: 'gemModel', sOrg: 'org', sCity: 'city', sAuthor: 'author', sPosition: 'position', sFont: 'font', sBase: 'base', sModel: 'model', sKey: 'key', sTemp: 'temp', sImg: 'img', sPollUrl: 'pollUrl', sPollKey: 'pollKey', sImgBase: 'imgBase', sImgModel: 'imgModel', sImgKey: 'imgKey', sImgSize: 'imgSize', sImgStyle: 'imgStyle' };
  Object.entries(map).forEach(([id, k]) => {
    const el = $('#' + id);
    el.value = S[k];
    el.onchange = el.oninput = () => { S[k] = el.type === 'range' ? +el.value : el.value.trim(); saveSettings(); };
  });
  $('#sCaps').checked = !!S.caps; $('#sCaps').onchange = () => { S.caps = $('#sCaps').checked; saveSettings(); };
  $('#sTranslate').checked = !!S.translate; $('#sTranslate').onchange = () => { S.translate = $('#sTranslate').checked; saveSettings(); };
  $('#sProv').onchange = () => {
    S.prov = $('#sProv').value;
    const pv = PROVIDERS[S.prov];
    if (pv.base) { S.base = pv.base; S.model = pv.model; $('#sBase').value = S.base; $('#sModel').value = S.model; }
    saveSettings();
  };
  saveSettings(true);
}
function saveSettings(silent) {
  $('#tempVal').textContent = (+S.temp).toFixed(1);
  $('#imgPoll').classList.toggle('hidden', S.img !== 'pollinations');
  $('#imgApi').classList.toggle('hidden', S.img !== 'openai');
  $('#imgGem').classList.toggle('hidden', S.img !== 'gemini');
  store.set('settings', S);
  updateBadge();
  if (!silent) Object.keys(imgMem).forEach(k => delete imgMem[k]);
}
async function testAi() {
  $('#testRes').textContent = 'Проверяю…';
  try {
    busy(true, 'Проверка подключения…');
    const t = await chat([{ role: 'user', content: 'Ответь одним словом: Готово' }], 20, 60000);
    busy(false);
    $('#testRes').textContent = '✅ Подключено. Ответ: ' + t.slice(0, 60);
  } catch (e) { busy(false); $('#testRes').textContent = '❌ ' + e.message; }
}
async function testImg() {
  if (S.img === 'emoji') { $('#imgTestOut').innerHTML = '<p class="note">Выбран режим эмодзи: картинки без интернета.</p>'; return; }
  busy(true, 'Получаю картинку…');
  try {
    Object.keys(imgMem).forEach(k => delete imgMem[k]);
    if (S.img === 'gemini' && !(S.gemKey || (S.prov === 'gemini' && S.key))) { busy(false); $('#imgTestOut').innerHTML = '<p class="note">❌ Вставьте API-ключ Gemini.</p>'; return; }
    resolveImage._warned = 0;
    const tr = (S.img === 'pollinations' || S.img === 'openai') ? await translateWords(['яблоко']) : (w => w);
    const url = await resolveImage('яблоко', tr);
    busy(false);
    $('#imgTestOut').innerHTML = url ? `<img src="${esc(url)}" alt="яблоко" onerror="this.replaceWith(document.createTextNode('❌ Картинка не загрузилась — проверьте ссылку/ключ'))">` : '<p class="note">❌ Не удалось получить картинку. Проверьте интернет, ссылку и ключ.</p>';
  } catch (e) { busy(false); $('#imgTestOut').textContent = '❌ ' + e.message; }
}

/* ===== Запуск ===== */
function bind() {
  $$('#nav button').forEach(b => b.onclick = () => show(b.dataset.scr));
  $('#btnBuild').onclick = buildLesson;
  $$('#tabs button').forEach(b => b.onclick = () => { state.tab = b.dataset.tab; saveCurrent(); renderResult(); });
  $('#out').addEventListener('click', onTaskTool);
  $('#tAnswers').onchange = () => { answers = $('#tAnswers').checked; $('#out').classList.toggle('hide-answers', !answers); };
  $('#btnAi').onclick = () => aiGenerate([state.tab]);
  $('#btnAiAll').onclick = () => aiGenerate(['sheet', 'konspekt', 'parents']);
  $('#btnRevert').onclick = () => { delete state.ai[state.tab]; saveCurrent(); updateHistory(); renderResult(); };
  $('#btnWord').onclick = () => exportWord(false);
  $('#btnShare').onclick = () => exportWord(true);
  $('#btnPdf').onclick = exportPdf;
  $('#btnAdd').onclick = () => { const id = $('#addSel').value; if (!id) return; state.tasks.push({ id, seed: (Date.now() * 31) >>> 0 }); saveCurrent(); updateHistory(); renderResult(); setTimeout(() => window.scrollTo(0, document.body.scrollHeight), 50); };
  $('#btnNewVar').onclick = () => { state.tasks.forEach((t, i) => { t.seed = (t.seed ^ (Date.now() + i * 977)) >>> 0; }); saveCurrent(); updateHistory(); renderResult(); };
  $('#histList').addEventListener('click', onHistoryClick);
  $('#btnExport').onclick = exportAll;
  $('#fImport').onchange = e => { importAll(e.target.files[0]); e.target.value = ''; };
  $$('#planAge button').forEach(b => b.onclick = () => renderPlan(b.dataset.v));
  $('#btnTest').onclick = testAi;
  $('#btnKeyLink').onclick = () => { const u = (PROVIDERS[S.prov] || {}).key || 'https://platform.deepseek.com/api_keys'; if (NATIVE) window.Android.openUrl(u); else window.open(u, '_blank'); };
  $('#btnImgTest').onclick = testImg;
  $('#btnImgClear').onclick = async () => { await idbClearCache(); store.set('arasaac', {}); store.set('tr', {}); Object.keys(imgMem).forEach(k => delete imgMem[k]); toast('Кэш картинок очищен (свои картинки сохранены)'); };
  $('#btnOwnClear').onclick = clearOwnPics;
  $('#btnGemKey').onclick = () => { const u = 'https://aistudio.google.com/apikey'; if (NATIVE) window.Android.openUrl(u); else window.open(u, '_blank'); };
  $('#btnGemCredits').onclick = () => { const u = 'https://developers.google.com/program/my-benefits'; if (NATIVE) window.Android.openUrl(u); else window.open(u, '_blank'); };
  $('#out').addEventListener('click', onPicTap, true);
  $('#fOwnPic').onchange = e => { onOwnPic(e.target.files[0]); e.target.value = ''; };
  $('#btnGemPrompt').onclick = () => { show('prompt'); setTimeout(() => $('#gemPromptText').scrollIntoView({ block: 'start' }), 50); };
  $('#btnCopyGem').onclick = () => copyText(geminiManualPrompt());
  $('#btnShareGem').onclick = () => { if (NATIVE) window.Android.shareText(geminiManualPrompt(), 'Промпт для Gemini'); else copyText(geminiManualPrompt()); };
  $('#btnShowPrompt').onclick = () => show('prompt');
  $('#btnCopyPrompt').onclick = () => copyText(SYSTEM_PROMPT);
  $('#btnSharePrompt').onclick = () => { if (NATIVE) window.Android.shareText(SYSTEM_PROMPT, 'Промпт: Конструктор занятий ДОУ'); else copyText(SYSTEM_PROMPT); };
  $('#btnCancel').onclick = cancelBusy;
  $('#ver').textContent = 'Версия ' + (NATIVE && window.Android.version ? window.Android.version() : '1.0.0') + ' · данные хранятся только на устройстве';
}
function start() {
  initForm();
  initSettings();
  bind();
  if (state.tasks.length) $$('#nav button')[1].classList.remove('hidden');
}
document.addEventListener('DOMContentLoaded', start);
window.addEventListener('error', e => { try { toast('Ошибка: ' + (e.message || 'неизвестно'), 4000); } catch (x) { /* нет UI */ } });

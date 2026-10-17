'use strict';
/* Генератор: рабочий лист, программные задачи, конспект, задания родителям. Сложность = возраст × месяц × неделя. */

function rng(seed) {
  let a = (seed >>> 0) || 1;
  const f = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.int = (lo, hi) => lo + Math.floor(f() * (hi - lo + 1));
  f.pick = arr => arr[Math.floor(f() * arr.length)];
  f.shuffle = arr => { const r = arr.slice(); for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(f() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };
  f.sample = (arr, n) => f.shuffle(arr).slice(0, Math.max(0, Math.min(n, arr.length)));
  return f;
}

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
const VOW = 'аеёиоуыэюя';
const sylCount = w => [...w.toLowerCase()].filter(c => VOW.includes(c)).length;
const isSingle = w => /^[а-яё]+$/i.test(w.nom);

function plural(n, one, few, many) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}
const agree = (n, w) => plural(n, w.nom, w.gen, w.gpl);
const nameGen = n => n.replace(/[ая]$/, 'и');
function acc(w, animate) {
  if (w.g === 'f') return w.nom.replace(/а$/, 'у').replace(/я$/, 'ю');
  if (w.g === 'm' && animate) return w.gen;
  return w.nom;
}
const accPl = (w, animate) => animate ? w.gpl : w.pl;

/* Звуковой анализ: v — гласный, h — твёрдый согласный, s — мягкий согласный */
function soundsOf(word) {
  const w = word.toLowerCase().replace(/[^а-яё]/g, '');
  const iot = { 'я': 'а', 'ё': 'о', 'ю': 'у', 'е': 'э' };
  const res = [];
  for (let i = 0; i < w.length; i++) {
    const c = w[i], prev = w[i - 1], next = w[i + 1];
    if (c === 'ь' || c === 'ъ') continue;
    if (VOW.includes(c)) {
      if (iot[c] && (i === 0 || VOW.includes(prev) || prev === 'ь' || prev === 'ъ')) res.push({ t: 's', ch: 'й' });
      res.push({ t: 'v', ch: iot[c] || c });
    } else {
      let soft = 'чщй'.includes(c) || (!'жшц'.includes(c) && next && 'яёюеиь'.includes(next));
      res.push({ t: soft ? 's' : 'h', ch: c });
    }
  }
  return res;
}
function firstSound(word) {
  const s = soundsOf(word)[0];
  if (!s) return '';
  return '[' + s.ch + (s.t === 's' && s.ch !== 'й' && s.ch !== 'ч' && s.ch !== 'щ' ? '’' : '') + ']';
}
function hasSound(word, snd) {
  const base = snd[0].toLowerCase(), soft = snd.length > 1;
  return soundsOf(word).some(s => s.ch === base && (soft ? s.t === 's' : (s.t !== 's' || 'чщ'.includes(base))));
}
function soundPlace(word, snd) {
  const base = snd[0].toLowerCase(), soft = snd.length > 1;
  const ss = soundsOf(word);
  const idx = ss.findIndex(s => s.ch === base && (soft ? s.t === 's' : (s.t !== 's' || 'чщ'.includes(base))));
  if (idx < 0) return null;
  return idx === 0 ? 'начало' : idx === ss.length - 1 ? 'конец' : 'середина';
}

const VOWEL_WORDS = ['аист|🪿', 'утка|🦆', 'окно|🪟', 'ухо|👂', 'облако|☁️', 'арбуз|🍉', 'ослик|🫏', 'иголка|🪡', 'улитка|🐌', 'ананас|🍍', 'индюк|🦃', 'апельсин|🍊', 'остров|🏝️', 'удочка|🎣', 'игла|🪡', 'овощи|🥕'].map(s => { const [nom, e] = s.split('|'); return { nom, e }; });
const RELATED = { 'лес': ['лесок', 'лесник', 'лесной', 'перелесок'], 'гриб': ['грибок', 'грибник', 'грибной', 'грибница'], 'снег': ['снежок', 'снежинка', 'снеговик', 'снежный'], 'рыба': ['рыбка', 'рыбак', 'рыбный', 'рыбалка'], 'сад': ['садик', 'садовник', 'садовый', 'садовод'], 'дом': ['домик', 'домишко', 'домашний', 'домовой'], 'зима': ['зимушка', 'зимний', 'зимовать', 'зимовье'], 'цветок': ['цветочек', 'цветник', 'цветочный', 'цветочница'], 'вода': ['водичка', 'водный', 'водяной', 'подводный'], 'кот': ['котик', 'котёнок', 'кошка', 'кошачий'], 'берёза': ['берёзка', 'березняк', 'берёзовый', 'подберёзовик'], 'хлеб': ['хлебушек', 'хлебница', 'хлебный', 'хлебороб'], 'школа': ['школьник', 'школьный', 'школьница', 'дошкольник'], 'мороз': ['морозный', 'морозец', 'Дед Мороз', 'заморозки'], 'море': ['морской', 'моряк', 'приморье', 'заморский'], 'солнце': ['солнышко', 'солнечный', 'подсолнух', 'солнцепёк'], 'чай': ['чайник', 'чайный', 'чаепитие', 'чаинка'], 'игра': ['игрушка', 'игровой', 'играть', 'игрок'], 'птица': ['птичка', 'птичник', 'птичий', 'птенец'], 'звезда': ['звёздочка', 'звёздный', 'звездопад', 'созвездие'] };
const SHAPE_SVG = {
  'круг': c => `<circle cx="20" cy="20" r="15" fill="${c}"/>`,
  'квадрат': c => `<rect x="6" y="6" width="28" height="28" fill="${c}"/>`,
  'треугольник': c => `<polygon points="20,4 36,35 4,35" fill="${c}"/>`,
  'прямоугольник': c => `<rect x="3" y="11" width="34" height="18" fill="${c}"/>`,
  'овал': c => `<ellipse cx="20" cy="20" rx="17" ry="10" fill="${c}"/>`,
  'ромб': c => `<polygon points="20,3 36,20 20,37 4,20" fill="${c}"/>`,
  'трапеция': c => `<polygon points="11,8 29,8 37,32 3,32" fill="${c}"/>`
};
const shapeSvg = (name, color, size) => `<svg class="shape" width="${size || 40}" height="${size || 40}" viewBox="0 0 40 40">${(SHAPE_SVG[name] || SHAPE_SVG['круг'])(color || 'none')}</svg>`;
const shapeOutline = (name, size) => `<svg class="shape" width="${size || 40}" height="${size || 40}" viewBox="0 0 40 40" style="fill:none;stroke:#333;stroke-width:2">${(SHAPE_SVG[name] || SHAPE_SVG['круг'])('none').replace(/fill="none"/, '')}</svg>`;

const pic = (w, opt) => {
  const o = opt || {};
  return `<span class="pic${o.cls ? ' ' + o.cls : ''}" data-q="${esc(w.nom)}"${o.size ? ` style="--s:${o.size}px"` : ''}><span class="emo">${w.e || '🖼️'}</span>${o.nocap ? '' : `<span class="cap">${esc(w.nom)}</span>`}</span>`;
};
const box = (n, cls) => `<span class="boxes">${Array.from({ length: n }, () => `<span class="box ${cls || ''}"></span>`).join('')}</span>`;
const line = (w) => `<span class="wline" style="width:${w || 120}px"></span>`;

/* Контекст занятия */
function makeCtx(p) {
  const theme = p.theme;
  const step = Math.max(0, Math.min(35, p.month * 4 + (p.week - 1)));
  const ctx = {
    theme, age: p.age, month: p.month, week: p.week, step, prog: step / 35,
    dir: p.dir, logo: p.logo, concl: p.concl, sound: p.sound, lessonType: p.lessonType,
    math: MATH_PLAN[p.age][p.month], gram: GRAM_PLAN[p.age][p.month], speech: SPEECH_PLAN[p.age][p.month], world: WORLD_PLAN[p.age][p.month],
    ageInfo: AGES[p.age], seed: p.seed >>> 0
  };
  ctx.words = theme.words.filter(w => w && w.nom);
  ctx.countable = ctx.words.filter(w => w.g !== 'pl' && w.gen && w.gpl);
  ctx.single = ctx.words.filter(isSingle);
  ctx.ageIdx = { mid: 0, old: 1, prep: 2 }[p.age];
  ctx.level = ctx.ageIdx * 9 + p.month;
  ctx.nItems = (lo, hi) => Math.round(lo + (hi - lo) * Math.min(1, (ctx.ageIdx * 0.5 + ctx.prog) / 1.5));
  ctx.others = THEMES.filter(t => t.id !== theme.id && t.gen !== theme.gen);
  return ctx;
}

/* ===== Каталог заданий ===== */
const T = {};
function def(id, dir, name, ok, gen, goal) { T[id] = { id, dir, name, ok, gen, goal }; }

// ---- РЕЧЬ ----
def('name', 'speech', 'Назови и покажи', c => c.words.length >= 4, (c, r) => {
  const ws = r.sample(c.words, c.nItems(4, 8));
  return { title: 'Назови и покажи', instr: `Рассмотри картинки. Назови каждый предмет. Как назвать их одним словом? Обведи ${ws.length > 4 ? 'три любых' : 'два любых'} предмета.`,
    body: `<div class="grid">${ws.map(w => pic(w)).join('')}</div>`, answer: `${ws.map(w => w.nom).join(', ')} — это ${c.theme.gen}.` };
}, 'уточнять и активизировать словарь по теме, закреплять обобщающее понятие');

def('plural', 'speech', 'Один — много', c => c.countable.length >= 3, (c, r) => {
  const ws = r.sample(c.countable, c.nItems(3, 6));
  return { title: 'Один — много', instr: 'Назови один предмет, а потом — когда их много. Нарисуй рядом ещё два таких же предмета.',
    body: `<table class="tbl">${ws.map(w => `<tr><td>${pic(w)}</td><td>${pic(w, { nocap: true })}${pic(w, { nocap: true })}${pic(w, { nocap: true })}</td></tr>`).join('')}</table>`,
    answer: ws.map(w => `${w.nom} — ${w.pl}`).join('; ') };
}, 'учить образовывать множественное число существительных в именительном падеже');

def('gplural', 'speech', 'Много чего? Нет чего?', c => c.countable.length >= 3, (c, r) => {
  const ws = r.sample(c.countable, c.nItems(3, 7));
  const neg = c.ageIdx > 0 && c.prog > 0.3;
  return { title: neg ? 'Чего не стало?' : 'Много чего?', instr: neg ? 'Посмотри на картинки, закрой их ладошкой и скажи: «Нет чего?» — «Нет …». Потом скажи: «Много …».' : 'Назови, чего много: «Много …». Раскрась картинки.',
    body: `<div class="grid">${ws.map(w => `<div class="cell">${pic(w, { nocap: true })}${pic(w, { nocap: true })}${pic(w, { nocap: true })}<div class="cap2">много ${line(80)}</div></div>`).join('')}</div>`,
    answer: ws.map(w => `много ${w.gpl}` + (neg ? ` / нет ${w.gen}` : '')).join('; ') };
}, 'учить употреблять существительные во множественном числе родительного падежа');

def('dim', 'speech', 'Назови ласково', c => c.words.filter(w => w.dim).length >= 3, (c, r) => {
  const ws = r.sample(c.words.filter(w => w.dim), c.nItems(3, 7));
  return { title: 'Назови ласково', instr: 'Большой предмет назови обычно, а маленький — ласково. Соедини большой предмет с маленьким.',
    body: `<div class="pairs"><div class="col">${ws.map(w => pic(w, { size: 56 })).join('')}</div><div class="col">${r.shuffle(ws).map(w => pic(w, { size: 30, nocap: true })).join('')}</div></div>`,
    answer: ws.map(w => `${w.nom} — ${w.dim}`).join('; ') };
}, 'учить образовывать существительные с уменьшительно-ласкательными суффиксами');

def('count', 'speech', 'Посчитай: 1, 2, 5', c => c.countable.length >= 3 && c.ageIdx > 0, (c, r) => {
  const ws = r.sample(c.countable, c.nItems(3, 5));
  const nums = c.ageIdx === 2 ? [1, 2, 5, 7, 10] : [1, 2, 5];
  return { title: 'Посчитай предметы', instr: `Посчитай предметы: ${nums.join(', ')}. Говори правильно: «Один …, два …, пять …».`,
    body: `<table class="tbl"><tr><th></th>${nums.map(n => `<th>${n}</th>`).join('')}</tr>${ws.map(w => `<tr><td>${pic(w)}</td>${nums.map(() => `<td>${line(60)}</td>`).join('')}</tr>`).join('')}</table>`,
    answer: ws.map(w => nums.map(n => `${n} ${agree(n, w)}`).join(', ')).join('; ') };
}, 'учить согласовывать числительные с существительными');

def('adj', 'speech', 'Какой? Какая? Подбери признаки', c => c.theme.adj && c.theme.adj.length >= 3, (c, r) => {
  const ws = r.sample(c.single.length ? c.single : c.words, c.nItems(2, 4));
  const k = c.ageIdx + 2;
  return { title: 'Подбери признаки', instr: `Скажи, какой предмет: подбери ${k} слова-признака (цвет, форма, величина, вкус, материал). Раскрась предмет.`,
    body: `<div class="grid">${ws.map(w => `<div class="cell">${pic(w, { size: 64 })}<div>${Array.from({ length: k }, () => line(90)).join('<br>')}</div></div>`).join('')}</div>`,
    answer: `Образец признаков: ${c.theme.adj.join(', ')}.` };
}, 'учить подбирать прилагательные к существительным, согласовывать их в роде и числе');

def('verbs', 'speech', 'Что делает? Что можно делать?', c => c.theme.verbs && c.theme.verbs.length >= 3, (c, r) => {
  const ws = r.sample(c.words, 3);
  return { title: 'Что можно делать?', instr: `Расскажи, что можно делать с предметами или что они делают. Используй слова-действия.${c.ageIdx > 0 ? ' Придумай слова с приставками: при-, у-, вы-, за-.' : ''}`,
    body: `<div class="grid">${ws.map(w => `<div class="cell">${pic(w, { size: 56 })}${line(140)}</div>`).join('')}</div>`,
    answer: `Слова-действия по теме: ${c.theme.verbs.join(', ')}.` + (c.ageIdx > 0 ? ' С приставками: при-, у-, вы-, за- (например: прилетел — улетел — вылетел — залетел).' : '') };
}, 'расширять глагольный словарь');

def('prep', 'speech', 'Где? Предлоги', c => c.single.filter(w => w.g !== 'pl').length >= 2, (c, r) => {
  const pool = PREPS[c.age].slice(0, c.ageIdx === 0 ? 2 + Math.round(c.prog * 2) : PREPS[c.age].length);
  const S = { 'в': ['находится', 'коробке', '📦'], 'на': ['находится', 'столе', '🪑'], 'под': ['находится', 'столом', '🪑'], 'за': ['находится', 'шкафом', '🗄️'], 'над': ['висит', 'столом', '🪑'], 'перед': ['находится', 'домом', '🏠'], 'около': ['находится', 'окна', '🪟'], 'между': ['находится', 'стульями', '🪑'], 'из-под': ['достали', 'дивана', '🛋️'], 'из-за': ['достали', 'шкафа', '🗄️'] };
  const preps = r.sample(pool, Math.min(pool.length, c.nItems(2, 5)));
  const ws = r.shuffle(c.single.filter(w => w.g !== 'pl'));
  const rows = preps.map((p, i) => { const w = ws[i % ws.length]; const [v, obj, e] = S[p]; return { w, p, text: `${cap(w.nom)} ${v} ${line(50)} ${obj}.`, full: `${cap(w.nom)} ${v} ${p} ${obj}.`, e }; });
  return { title: 'Где находится предмет?', instr: `Вставь пропущенное маленькое слово (предлог): ${pool.join(', ')}.`,
    body: `<ol class="list">${rows.map(x => `<li>${pic(x.w, { nocap: true, size: 34 })} <span class="emo-s">${x.e}</span> ${x.text}</li>`).join('')}</ol>`,
    answer: rows.map(x => x.full).join(' ') };
}, 'учить понимать и употреблять предлоги');

def('riddle', 'speech', 'Отгадай загадку', c => c.theme.riddles && c.theme.riddles.length > 0, (c, r) => {
  const rs = r.sample(c.theme.riddles, c.ageIdx === 0 ? 1 : 2);
  return { title: 'Отгадай загадку', instr: 'Послушай загадку. Нарисуй отгадку в рамке. Объясни, почему ты так думаешь.',
    body: rs.map(x => `<div class="riddle"><p>${esc(x[0]).replace(/\n/g, '<br>')}</p><div class="frame"></div></div>`).join(''),
    answer: rs.map(x => x[1]).join('; ') };
}, 'развивать логическое мышление, умение отгадывать загадки и доказывать отгадку');

def('story', 'speech', 'Рассказ по схеме', c => c.words.length >= 1, (c, r) => {
  const w = r.pick(c.single.length ? c.single : c.words);
  const animal = !!c.theme.animals;
  const qs = animal ? [['❓', 'Кто это?'], ['🏠', 'Где живёт?'], ['🐾', 'Какой он (она) внешне? Чем покрыто тело?'], ['🍽️', 'Чем питается?'], ['👶', 'Как называют детёныша?'], ['💬', 'Какой у него характер?'], ['🛡️', 'Как спасается от врагов?'], ['❤️', 'Как человек заботится о нём?']]
    : [['❓', 'Что это?'], ['🎨', 'Какого цвета?'], ['🔷', 'Какой формы?'], ['📏', 'Какой величины?'], ['✋', 'Какой на ощупь (на вкус)?'], ['📍', 'Где находится (растёт)?'], ['🛠️', 'Что с ним делают?'], ['💛', 'Почему он тебе нравится?']];
  const n = [3, 4, 5, 5, 6, 6, 7, 8][Math.min(7, Math.floor(c.ageIdx * 2 + c.prog * 3))];
  const use = qs.slice(0, n);
  let sample;
  if (animal) {
    const b = (c.theme.babies || {})[w.nom], h = (c.theme.homes || {})[w.nom], f = (c.theme.foods || {})[w.nom];
    sample = `Это ${w.nom}. ${h ? `Живёт: ${h}. ` : ''}${f ? `Питается: ${f}. ` : ''}${b ? `Детёныш — ${b}. ` : ''}${c.theme.adj ? `Он(а) ${c.theme.adj.slice(0, 2).join(', ')}.` : ''}`;
  } else {
    sample = `Это ${w.nom}. ${c.theme.place ? `Растёт ${c.theme.place}. ` : ''}Признаки: ${(c.theme.adj || []).slice(0, 3).join(', ')}. С ним можно: ${(c.theme.verbs || []).slice(0, 3).join(', ')}.`;
  }
  return { title: 'Расскажи по схеме', instr: `Составь рассказ-описание о предмете по схеме (${n} ${plural(n, 'вопрос', 'вопроса', 'вопросов')}). Говори полными предложениями.`,
    body: `<div class="story">${pic(w, { size: 80 })}<div class="mnemo">${use.map((q, i) => `<div class="mn"><span class="mn-i">${q[0]}</span><span class="mn-n">${i + 1}</span><span class="mn-t">${q[1]}</span></div>`).join('')}</div></div>`,
    answer: 'Образец рассказа: ' + sample };
}, 'учить составлять описательный рассказ по схеме (мнемотаблице)');

def('babies', 'speech', 'Мама и детёныш', c => c.theme.babies && Object.keys(c.theme.babies).length >= 3, (c, r) => {
  const ws = r.sample(c.words.filter(w => c.theme.babies[w.nom]), c.nItems(3, 6));
  const bs = r.shuffle(ws.map(w => c.theme.babies[w.nom]));
  return { title: 'Кто у кого?', instr: 'Назови маму и её детёныша. Соедини линией маму с именем детёныша.',
    body: `<div class="pairs"><div class="col">${ws.map(w => pic(w)).join('')}</div><div class="col">${bs.map(b => `<span class="tag">${esc(b)}</span>`).join('')}</div></div>`,
    answer: ws.map(w => `у ${w.gen} — ${c.theme.babies[w.nom]}`).join('; ') };
}, 'учить образовывать названия детёнышей животных');

def('poss', 'speech', 'Чей? Чья? Чьё?', c => c.theme.poss && Object.keys(c.theme.poss).length >= 3 && c.ageIdx > 0, (c, r) => {
  const parts = [['хвост', 'хвост'], ['след', 'след'], ['нос', 'нос']];
  const ws = r.sample(c.words.filter(w => c.theme.poss[w.nom]), c.nItems(3, 6));
  return { title: 'Чей это?', instr: 'Ответь, чей это хвост (след, нос). Говори правильно: «Это лисий хвост».',
    body: `<ol class="list">${ws.map((w, i) => `<li>${pic(w)} — чей ${parts[i % parts.length][0]}? ${line(140)}</li>`).join('')}</ol>`,
    answer: ws.map((w, i) => `${c.theme.poss[w.nom]} ${parts[i % parts.length][1]}`).join('; ') };
}, 'учить образовывать притяжательные прилагательные');

def('antonym', 'speech', 'Скажи наоборот', c => c.ageIdx > 0 || c.prog > 0.6, (c, r) => {
  const ps = r.sample(ANTONYMS, c.nItems(4, 8));
  return { title: 'Скажи наоборот', instr: 'Я скажу слово, а ты скажи наоборот (слово с противоположным значением). Нарисуй одну пару.',
    body: `<table class="tbl">${ps.map(p => `<tr><td>${esc(p[0])}</td><td>—</td><td>${line(120)}</td></tr>`).join('')}</table><div class="frame small"></div>`,
    answer: ps.map(p => `${p[0]} — ${p[1]}`).join('; ') };
}, 'учить подбирать антонимы');

def('sentence', 'speech', 'Составь предложение', c => c.single.length >= 2 && c.ageIdx > 0, (c, r) => {
  const n = c.ageIdx === 2 ? 3 : 2;
  const rows = Array.from({ length: c.nItems(2, 3) }, () => r.sample(c.single, n));
  const verb = r.pick(c.theme.verbs || ['видеть']);
  return { title: 'Составь предложение', instr: `Составь предложение по картинкам. ${c.ageIdx === 2 ? 'Используй союз «и» или «а».' : ''} Подсказка — слово-действие: «${verb}».`,
    body: rows.map(ws => `<div class="row">${ws.map(w => pic(w)).join('<span class="plus">+</span>')} <span class="plus">→</span> ${line(160)}</div>`).join(''),
    answer: 'Образец: ' + rows.map(ws => `${NAMES[0]} видит ${ws.map(w => acc(w, !!c.theme.animals)).join(' и ')}.`).join(' ') };
}, 'учить составлять распространённые предложения по картинкам');

def('because', 'speech', 'Закончи предложение', c => c.ageIdx === 2 || (c.ageIdx === 1 && c.prog > 0.7), (c, r) => {
  const w = r.pick(c.countable.length ? c.countable : c.words);
  const t = c.theme;
  const starts = [`Нам нужны ${w.pl}, потому что`, `Я люблю тему «${t.name}», потому что`, `Мне интересно узнавать новое по теме «${t.name}», потому что`, `Я нарисую ${w.pl}, чтобы`, `Мы бережём ${t.gen}, потому что`];
  const ss = r.sample(starts, 3);
  return { title: 'Закончи предложение', instr: 'Закончи предложения. Объясни свою мысль словами «потому что», «чтобы».',
    body: `<ol class="list">${ss.map(s => `<li>${esc(s)} ${line(180)}</li>`).join('')}</ol>`, answer: 'Ответы детей; следить за правильным построением сложноподчинённых предложений.' };
}, 'учить составлять сложноподчинённые предложения с союзами «потому что», «чтобы»');

def('related', 'speech', 'Родственные слова', c => c.ageIdx === 2, (c, r) => {
  const keys = Object.keys(RELATED);
  const themed = keys.filter(k => c.words.some(w => w.nom.startsWith(k.slice(0, 3))) || c.theme.name.toLowerCase().includes(k.slice(0, 4)));
  const ks = (themed.length >= 2 ? r.sample(themed, 2) : []).concat(r.sample(keys.filter(k => !themed.includes(k)), 2)).slice(0, 3);
  return { title: 'Родственные слова', instr: 'Подбери к слову родственные слова — они похожи и имеют общую часть.',
    body: `<table class="tbl">${ks.map(k => `<tr><td><b>${esc(k)}</b></td><td>${line(60)} ${line(60)} ${line(60)}</td></tr>`).join('')}</table>`,
    answer: ks.map(k => `${k}: ${RELATED[k].join(', ')}`).join('; ') };
}, 'учить подбирать однокоренные слова');

def('deformed', 'speech', 'Слова перепутались', c => c.ageIdx === 2 && c.countable.length > 0, (c, r) => {
  const animate = !!c.theme.animals;
  const ws = r.sample(c.countable.filter(isSingle), 2);
  const sents = ws.map(w => `Вечером дети рисуют ${accPl(w, animate)} в альбоме`);
  return { title: 'Слова перепутались', instr: 'Слова в предложении перепутались. Составь правильное предложение.',
    body: sents.map(s => `<p class="deformed">${r.shuffle(s.toLowerCase().split(' ')).map(x => `<span class="tag">${esc(x)}</span>`).join(' ')}</p>`).join(''),
    answer: sents.join('. ') + '.' };
}, 'учить составлять предложения из деформированных фраз');

// ---- МАТЕМАТИКА ----
def('countWrite', 'math', 'Посчитай и запиши', c => c.single.length >= 2, (c, r) => {
  const mx = c.math.max;
  const rows = r.sample(c.words, Math.min(c.words.length, c.nItems(3, 5))).map(w => ({ w, n: r.int(1, Math.min(mx, 10)) }));
  const digits = c.math.digits || c.ageIdx > 0;
  return { title: 'Посчитай', instr: digits ? 'Посчитай предметы в каждом ряду. Запиши цифру в окошко.' : 'Посчитай предметы. Нарисуй в окошке столько же кружков.',
    body: rows.map(x => `<div class="row count">${Array.from({ length: x.n }, () => pic(x.w, { nocap: true, size: 30 })).join('')}<span class="box ${digits ? '' : 'wide'}"></span></div>`).join(''),
    answer: rows.map(x => `${x.w.nom}: ${x.n}`).join('; ') };
}, c => `закреплять счёт в пределах ${c.math.max}`);

def('countConnect', 'math', 'Соедини с цифрой', c => (c.math.digits || c.ageIdx > 0) && c.words.length >= 3, (c, r) => {
  const mx = Math.min(c.math.max, 10);
  const nums = r.sample(Array.from({ length: mx }, (_, i) => i + 1), Math.min(mx, c.nItems(3, 5)));
  const ws = r.sample(c.words, nums.length);
  return { title: 'Сосчитай и соедини', instr: 'Посчитай предметы и соедини каждую группу с нужной цифрой.',
    body: `<div class="pairs"><div class="col">${nums.map((n, i) => `<div class="grp">${Array.from({ length: n }, () => pic(ws[i], { nocap: true, size: 24 })).join('')}</div>`).join('')}</div><div class="col">${r.shuffle(nums).map(n => `<span class="digit">${n}</span>`).join('')}</div></div>`,
    answer: nums.map((n, i) => `${ws[i].nom}: ${n}`).join('; ') };
}, c => `учить соотносить количество предметов с цифрой (в пределах ${Math.min(c.math.max, 10)})`);

def('compare', 'math', 'Больше, меньше, поровну', c => c.words.length >= 2, (c, r) => {
  const mx = Math.min(c.math.max, 10);
  const k = c.nItems(2, 4);
  const rows = Array.from({ length: k }, () => { const [a, b] = r.sample(c.words, 2); let x = r.int(1, mx), y = r.int(1, mx); if (r() < 0.25) y = x; return { a, b, x, y }; });
  const signs = c.math.signs;
  const sign = (x, y) => x > y ? '>' : x < y ? '<' : '=';
  return { title: signs ? 'Сравни: >, <, =' : 'Где больше?', instr: signs ? 'Посчитай предметы в каждой группе и поставь знак >, < или =.' : 'Посчитай предметы. Обведи группу, где предметов больше. Если поровну — обведи обе.',
    body: rows.map(x => `<div class="row cmp"><span class="grp">${Array.from({ length: x.x }, () => pic(x.a, { nocap: true, size: 24 })).join('')}</span><span class="box sign"></span><span class="grp">${Array.from({ length: x.y }, () => pic(x.b, { nocap: true, size: 24 })).join('')}</span></div>`).join(''),
    answer: rows.map(x => signs ? `${x.x} ${sign(x.x, x.y)} ${x.y}` : (x.x === x.y ? `поровну (${x.x})` : `больше ${x.x > x.y ? x.a.gpl : x.b.gpl} (${Math.max(x.x, x.y)})`)).join('; ') };
}, c => c.math.signs ? 'учить сравнивать числа и группы предметов, использовать знаки >, <, =' : 'учить сравнивать группы предметов: больше, меньше, поровну');

def('ordinal', 'math', 'Какой по счёту?', c => c.math.ord && c.words.length >= 3, (c, r) => {
  const n = Math.min(c.math.ord, c.words.length, 10);
  const row = r.sample(c.words, n);
  const ordW = ['первый', 'второй', 'третий', 'четвёртый', 'пятый', 'шестой', 'седьмой', 'восьмой', 'девятый', 'десятый'];
  const ordF = ['первая', 'вторая', 'третья', 'четвёртая', 'пятая', 'шестая', 'седьмая', 'восьмая', 'девятая', 'десятая'];
  const ordN = ['первое', 'второе', 'третье', 'четвёртое', 'пятое', 'шестое', 'седьмое', 'восьмое', 'девятое', 'десятое'];
  const ord = (i, g) => (g === 'f' ? ordF : g === 'n' ? ordN : ordW)[i];
  const qs = r.sample(row.map((w, i) => ({ w, i })), Math.min(3, n));
  return { title: 'Какой по счёту?', instr: `Посчитай слева направо. Ответь: какой по счёту ${qs.map(q => q.w.nom).join(', ')}? Раскрась ${ordW[qs[0].i]} по счёту предмет.`,
    body: `<div class="row ord">${row.map((w, i) => `<span class="ordcell">${pic(w, { size: 40 })}<span class="ordn">${c.ageIdx > 0 ? '' : i + 1}</span></span>`).join('')}</div>`,
    answer: qs.map(q => `${q.w.nom} — ${ord(q.i, q.w.g)}`).join('; ') + `; раскрасить ${row[qs[0].i].nom}.` };
}, c => `учить порядковому счёту в пределах ${c.math.ord}`);

def('pattern', 'math', 'Продолжи ряд', c => !!c.math.pattern || c.ageIdx > 0, (c, r) => {
  const period = Math.max(2, c.math.pattern || (c.ageIdx + 2));
  const items = c.words.length >= period ? r.sample(c.words, period) : r.sample(THEMES[0].words, period);
  const motifs = { 2: [[0, 1]], 3: [[0, 1, 2], [0, 0, 1], [0, 1, 1]], 4: [[0, 1, 2, 3], [0, 0, 1, 2], [0, 1, 1, 2], [0, 1, 2, 2]] };
  const motif = r.pick(motifs[Math.min(4, period)]);
  const shown = motif.length * 2 + r.int(0, motif.length - 1);
  const seq = Array.from({ length: shown + 3 }, (_, i) => items[motif[i % motif.length]]);
  return { title: 'Продолжи ряд', instr: 'Найди закономерность. Нарисуй, какие предметы будут дальше в пустых окошках.',
    body: `<div class="row seq">${seq.slice(0, shown).map(w => pic(w, { nocap: true, size: 34 })).join('')}${'<span class="box big"></span>'.repeat(3)}</div>`,
    answer: seq.slice(shown).map(w => w.nom).join(', ') };
}, 'развивать умение находить закономерность и продолжать ряд');

def('shapes', 'math', 'Геометрические фигуры', c => !!c.math.shapes, (c, r) => {
  const names = c.math.shapes.slice(0, Math.max(2, c.nItems(2, c.math.shapes.length)));
  const total = c.nItems(6, 14);
  const items = Array.from({ length: total }, () => ({ s: r.pick(names), col: r.pick(COLORS) }));
  const counts = names.map(n => ({ n, k: items.filter(i => i.s === n).length }));
  return { title: 'Найди и посчитай фигуры', instr: `Посчитай фигуры каждого вида (${names.join(', ')}). Запиши количество в таблицу.`,
    body: `<div class="shapes">${items.map(i => shapeSvg(i.s, i.col[1], r.int(28, 46))).join('')}</div><table class="tbl">${names.map(n => `<tr><td>${shapeOutline(n, 28)}</td><td>${esc(n)}</td><td><span class="box"></span></td></tr>`).join('')}</table>`,
    answer: counts.map(x => `${x.n}: ${x.k}`).join('; ') };
}, c => `закреплять знание геометрических фигур: ${(c.math.shapes || []).join(', ')}`);

def('size', 'math', 'Большой — средний — маленький', c => c.math.size || c.ageIdx === 0 || (c.ageIdx === 1 && c.month < 4), (c, r) => {
  const k = c.ageIdx === 0 ? 3 : c.ageIdx === 1 ? 4 : 5;
  const w = r.pick(c.words);
  const sizes = [22, 32, 44, 56, 70].slice(0, k);
  const order = r.shuffle(sizes.map((s, i) => ({ s, i })));
  return { title: 'Разложи по величине', instr: `Посмотри на предметы разной величины. Пронумеруй их от самого маленького (1) до самого большого (${k}).`,
    body: `<div class="row sizes">${order.map(o => `<span class="ordcell">${pic(w, { nocap: true, size: o.s })}<span class="box"></span></span>`).join('')}</div>`,
    answer: 'Слева направо: ' + order.map(o => o.i + 1).join(', ') };
}, 'учить сравнивать предметы по величине, раскладывать в убывающем и возрастающем порядке');

def('neighbors', 'math', 'Соседи числа', c => !!c.math.neighbors, (c, r) => {
  const mx = c.math.max;
  const ns = r.sample(Array.from({ length: mx - 2 }, (_, i) => i + 2), c.nItems(3, 6));
  return { title: 'Соседи числа', instr: 'Запиши соседей каждого числа: число, которое на 1 меньше, и число, которое на 1 больше.',
    body: `<div class="grid">${ns.map(n => `<div class="nb"><span class="box"></span><span class="digit">${n}</span><span class="box"></span></div>`).join('')}</div>`,
    answer: ns.map(n => `${n - 1} — ${n} — ${n + 1}`).join('; ') };
}, c => `учить называть соседние числа в пределах ${c.math.max}`);

def('composition', 'math', 'Состав числа', c => !!c.math.comp, (c, r) => {
  const mx = c.math.comp;
  const nums = r.sample(Array.from({ length: mx - 2 }, (_, i) => i + 3), Math.min(c.nItems(1, 3), mx - 2));
  const houses = nums.map(n => { const rows = r.sample(Array.from({ length: n + 1 }, (_, i) => i), Math.min(n + 1, c.nItems(3, 5))).sort((a, b) => a - b); return { n, rows }; });
  return { title: 'Числовые домики', instr: 'Засели домики: на каждом этаже вместе должно получиться число на крыше. Допиши недостающее число.',
    body: `<div class="houses">${houses.map(h => `<div class="house"><div class="roof">${h.n}</div>${h.rows.map(a => `<div class="floor"><span>${a}</span><span class="box"></span></div>`).join('')}</div>`).join('')}</div>`,
    answer: houses.map(h => `${h.n}: ` + h.rows.map(a => `${a}+${h.n - a}`).join(', ')).join('; ') };
}, c => `знакомить с составом числа из двух меньших (в пределах ${c.math.comp})`);

def('examples', 'math', 'Реши примеры', c => !!c.math.ex, (c, r) => {
  const { max, ops } = c.math.ex;
  const k = c.nItems(4, 8);
  const ex = [];
  let guard = 0;
  while (ex.length < k && guard++ < 200) {
    const op = r.pick(ops.split(''));
    let a, b;
    if (op === '+') { a = r.int(0, max - 1); b = r.int(1, max - a); } else { a = r.int(1, max); b = r.int(0, a); }
    const s = `${a} ${op === '-' ? '−' : '+'} ${b}`;
    if (!ex.some(e => e.s === s)) ex.push({ s, v: op === '+' ? a + b : a - b });
  }
  return { title: 'Реши примеры', instr: `Реши примеры. Можно считать на пальчиках или на счётных палочках.`,
    body: `<div class="grid ex">${ex.map(e => `<span class="exm">${e.s} = <span class="box"></span></span>`).join('')}</div>`,
    answer: ex.map(e => `${e.s} = ${e.v}`).join('; ') };
}, c => `учить решать примеры на ${c.math.ex.ops.includes('-') ? 'сложение и вычитание' : 'сложение'} в пределах ${c.math.ex.max}`);

def('problems', 'math', 'Реши задачу', c => !!c.math.tasks && c.countable.length > 0, (c, r) => {
  const max = c.math.ex ? c.math.ex.max : 10;
  const ops = c.math.tasks === 'oral' ? '+' : c.math.tasks.replace('oral', '+');
  const k = c.ageIdx === 2 ? 2 : 1;
  const ps = Array.from({ length: k }, () => {
    const w = r.pick(c.countable.filter(isSingle).length ? c.countable.filter(isSingle) : c.countable);
    const nm = r.pick(NAMES);
    const op = r.pick(ops.split(''));
    let a, b, text, v;
    if (op === '+') { a = r.int(1, Math.min(9, max - 1)); b = r.int(1, Math.min(9, max - a)); v = a + b; text = `У ${nameGen(nm)} было ${a} ${agree(a, w)}. Ей (ему) дали ещё ${b}. Сколько ${w.gpl} стало у ${nameGen(nm)}?`; }
    else { a = r.int(2, Math.min(10, max)); b = r.int(1, a - 1); v = a - b; text = `На столе лежало ${a} ${agree(a, w)}. Потом ${b} ${agree(b, w)} взяли. Сколько ${w.gpl} осталось?`; }
    return { w, text, a, b, op, v };
  });
  return { title: 'Реши задачу', instr: c.math.tasks === 'oral' ? 'Послушай задачу. Выложи ответ фишками или нарисуй кружки.' : 'Прочитай (послушай) задачу. Назови условие и вопрос. Запиши решение и ответ.',
    body: ps.map(p => `<div class="problem"><p>${esc(p.text)}</p><div class="row">${Array.from({ length: p.a }, () => pic(p.w, { nocap: true, size: 22 })).join('')}<span class="plus">${p.op === '+' ? '+' : '−'}</span>${Array.from({ length: p.b }, () => pic(p.w, { nocap: true, size: 22 })).join('')}</div><div>Решение: <span class="box"></span> ${p.op === '+' ? '+' : '−'} <span class="box"></span> = <span class="box"></span></div></div>`).join(''),
    answer: ps.map(p => `${p.a} ${p.op === '+' ? '+' : '−'} ${p.b} = ${p.v}`).join('; ') };
}, 'учить составлять и решать простые арифметические задачи');

def('clock', 'math', 'Который час?', c => !!c.math.clock, (c, r) => {
  const half = c.ageIdx === 2;
  const ts = Array.from({ length: c.nItems(2, 4) }, () => ({ h: r.int(1, 12), m: half && r() < 0.5 ? 30 : 0 }));
  const clock = (h, m, hands) => { const ha = ((h % 12) + m / 60) * 30 - 90, ma = m * 6 - 90, rad = d => d * Math.PI / 180;
    const ticks = Array.from({ length: 12 }, (_, i) => { const a = rad(i * 30 - 60); return `<text x="${50 + 36 * Math.cos(a)}" y="${54 + 36 * Math.sin(a)}" font-size="10" text-anchor="middle">${i + 1}</text>`; }).join('');
    return `<svg width="100" height="100" viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" fill="#fff" stroke="#333" stroke-width="2"/>${ticks}${hands ? `<line x1="50" y1="50" x2="${50 + 22 * Math.cos(rad(ha))}" y2="${50 + 22 * Math.sin(rad(ha))}" stroke="#333" stroke-width="4" stroke-linecap="round"/><line x1="50" y1="50" x2="${50 + 34 * Math.cos(rad(ma))}" y2="${50 + 34 * Math.sin(rad(ma))}" stroke="#E53935" stroke-width="2" stroke-linecap="round"/>` : ''}<circle cx="50" cy="50" r="3"/></svg>`; };
  const fmt = t => `${t.h}:${t.m ? '30' : '00'}`;
  const draw = ts.slice(Math.ceil(ts.length / 2));
  const read = ts.slice(0, Math.ceil(ts.length / 2));
  return { title: 'Который час?', instr: 'Посмотри на часы и запиши время. На пустых часах нарисуй стрелки, чтобы они показывали заданное время.',
    body: `<div class="grid">${read.map(t => `<div class="cell">${clock(t.h, t.m, true)}<span class="box wide"></span></div>`).join('')}${draw.map(t => `<div class="cell">${clock(0, 0, false)}<b>${fmt(t)}</b></div>`).join('')}</div>`,
    answer: read.map(fmt).join(', ') + (draw.length ? '; нарисовать: ' + draw.map(fmt).join(', ') : '') };
}, c => c.ageIdx === 2 ? 'учить определять время по часам с точностью до получаса' : 'учить определять время по часам с точностью до часа');

const DICT_MOTIFS = {
  1: [[['r', 2], ['u', 2], ['r', 2], ['d', 2]], [['r', 1], ['u', 1], ['r', 1], ['d', 1]]],
  2: [[['u', 2], ['r', 1], ['d', 2], ['r', 1]], [['r', 1], ['u', 1], ['r', 1], ['u', 1], ['r', 1], ['d', 2]]],
  3: [[['u', 2], ['r', 1], ['d', 1], ['r', 1], ['u', 1], ['r', 1], ['d', 2], ['r', 1]], [['u', 1], ['r', 1], ['u', 1], ['r', 2], ['d', 1], ['r', 1], ['d', 1], ['r', 1]]],
  4: [[['u', 3], ['r', 1], ['d', 1], ['r', 1], ['d', 1], ['r', 1], ['d', 1], ['r', 1]], [['u', 2], ['r', 2], ['u', 1], ['r', 1], ['d', 3], ['r', 1]], [['r', 1], ['u', 3], ['r', 1], ['d', 1], ['r', 1], ['u', 1], ['r', 1], ['d', 3], ['r', 1]]]
};
def('dict', 'math', 'Графический диктант', c => !!c.math.dict, (c, r) => {
  const lvl = Math.min(4, c.math.dict + (c.ageIdx === 2 ? 0 : -0));
  const motif = r.pick(DICT_MOTIFS[lvl]);
  const reps = lvl >= 3 ? 2 : 3;
  const steps = [].concat(...Array.from({ length: reps }, () => motif));
  const arrow = { r: '→', u: '↑', d: '↓', l: '←' };
  let x = 1, y = 0, minY = 0, maxY = 0, maxX = 1, pts = [[x, y]];
  steps.forEach(([d, n]) => { if (d === 'r') x += n; if (d === 'l') x -= n; if (d === 'u') y -= n; if (d === 'd') y += n; pts.push([x, y]); minY = Math.min(minY, y); maxY = Math.max(maxY, y); maxX = Math.max(maxX, x); });
  const cell = 14, W = (maxX + 2) * cell, H = (maxY - minY + 3) * cell, oy = (-minY + 1);
  const grid = (draw) => `<svg class="dict" width="${Math.max(W, 220)}" height="${H}" viewBox="0 0 ${Math.max(W, 220)} ${H}"><defs><pattern id="g${draw ? 'a' : 'b'}" width="${cell}" height="${cell}" patternUnits="userSpaceOnUse"><path d="M ${cell} 0 L 0 0 0 ${cell}" fill="none" stroke="#9ab" stroke-width="0.6"/></pattern></defs><rect width="100%" height="100%" fill="url(#g${draw ? 'a' : 'b'})"/><circle cx="${cell}" cy="${oy * cell}" r="3" fill="#E53935"/>${draw ? `<polyline fill="none" stroke="#1E3A8A" stroke-width="2.5" points="${pts.map(([px, py]) => `${px * cell},${(py + oy) * cell}`).join(' ')}"/>` : ''}</svg>`;
  return { title: 'Графический диктант', instr: `Поставь карандаш на красную точку. Рисуй линии по клеточкам: ${motif.map(([d, n]) => n + arrow[d]).join(' ')} — и повтори узор ещё ${reps - 1} ${plural(reps - 1, 'раз', 'раза', 'раз')}.`,
    body: grid(false), answer: 'Образец узора: ' + grid(true), answerHtml: true };
}, 'учить ориентироваться на листе в клетку, развивать произвольное внимание и мелкую моторику');

def('orient', 'math', 'Ориентировка на листе', c => !!c.math.orient || c.ageIdx > 0, (c, r) => {
  const nine = (c.math.orient || 9) >= 9;
  const names9 = ['в верхнем левом углу', 'вверху посередине', 'в верхнем правом углу', 'слева посередине', 'в центре', 'справа посередине', 'в нижнем левом углу', 'внизу посередине', 'в нижнем правом углу'];
  const names4 = ['вверху слева', 'вверху справа', 'внизу слева', 'внизу справа'];
  const names = nine ? names9 : names4;
  const n = nine ? 9 : 4;
  const filled = r.sample(Array.from({ length: n }, (_, i) => i), nine ? c.nItems(3, 6) : 2);
  const ws = r.sample(c.words, filled.length);
  const empty = Array.from({ length: n }, (_, i) => i).filter(i => !filled.includes(i));
  const drawAt = r.sample(empty, Math.min(2, empty.length));
  const sh = r.sample(Object.keys(SHAPE_SVG).slice(0, 3), drawAt.length);
  const cells = Array.from({ length: n }, (_, i) => { const k = filled.indexOf(i); return `<div class="oc">${k >= 0 ? pic(ws[k], { nocap: true, size: 34 }) : ''}</div>`; }).join('');
  const qs = filled.slice(0, 2).map(i => ws[filled.indexOf(i)]);
  return { title: 'Ориентировка на листе', instr: `Ответь: где находится ${qs.map(w => w.nom).join(', где — ')}? Нарисуй ${drawAt.map((i, k) => `${sh[k]} ${names[i]}`).join(', а ')}.`,
    body: `<div class="orient o${nine ? 3 : 2}">${cells}</div>`,
    answer: filled.slice(0, 2).map(i => `${ws[filled.indexOf(i)].nom} — ${names[i]}`).join('; ') };
}, 'учить ориентироваться на листе бумаги, понимать слова: вверху, внизу, слева, справа, в углу');

def('partsDay', 'math', 'Части суток', c => (c.ageIdx === 0 && c.math.parts) || (c.ageIdx === 1 && c.month === 3), (c, r) => {
  const parts = [['утро', '🌅'], ['день', '☀️'], ['вечер', '🌇'], ['ночь', '🌙']];
  const sh = r.shuffle(parts);
  return { title: 'Части суток', instr: 'Назови части суток. Пронумеруй картинки по порядку: что бывает сначала, что потом (начни с утра).',
    body: `<div class="row">${sh.map(p => `<span class="ordcell"><span class="emo big">${p[1]}</span><span class="box"></span></span>`).join('')}</div>`,
    answer: sh.map(p => `${p[0]} — ${parts.findIndex(x => x[0] === p[0]) + 1}`).join('; ') };
}, 'закреплять представления о частях суток и их последовательности');

function makeMaze(r, n) {
  const W = Array.from({ length: n }, () => Array.from({ length: n }, () => ({ t: 1, r: 1, b: 1, l: 1, v: 0 })));
  const st = [[0, 0]]; W[0][0].v = 1;
  while (st.length) {
    const [x, y] = st[st.length - 1];
    const nb = [[x, y - 1, 't', 'b'], [x + 1, y, 'r', 'l'], [x, y + 1, 'b', 't'], [x - 1, y, 'l', 'r']].filter(([a, b]) => a >= 0 && b >= 0 && a < n && b < n && !W[b][a].v);
    if (!nb.length) { st.pop(); continue; }
    const [a, b, w1, w2] = r.pick(nb);
    W[y][x][w1] = 0; W[b][a][w2] = 0; W[b][a].v = 1; st.push([a, b]);
  }
  const prev = {}; const q = [[0, 0]]; const seen = { '0,0': 1 };
  while (q.length) { const [x, y] = q.shift(); if (x === n - 1 && y === n - 1) break;
    [[0, -1, 't'], [1, 0, 'r'], [0, 1, 'b'], [-1, 0, 'l']].forEach(([dx, dy, w]) => { const a = x + dx, b = y + dy; if (!W[y][x][w] && !seen[a + ',' + b]) { seen[a + ',' + b] = 1; prev[a + ',' + b] = [x, y]; q.push([a, b]); } }); }
  const path = []; let cur = [n - 1, n - 1]; while (cur) { path.unshift(cur); cur = prev[cur[0] + ',' + cur[1]]; }
  return { W, path };
}
def('maze', 'motor', 'Лабиринт', c => true, (c, r) => {
  const n = [4, 5, 6, 7, 8, 9][Math.min(5, Math.floor(c.ageIdx * 1.5 + c.prog * 2.5))];
  const { W, path } = makeMaze(r, n);
  const cs = 26, S = n * cs + 4;
  const [a, b] = c.words.length >= 2 ? r.sample(c.words, 2) : [THEMES[1].words[0], THEMES[1].words[1]];
  const walls = W.map((row, y) => row.map((cl, x) => { const X = x * cs + 2, Y = y * cs + 2; let s = '';
    if (cl.t && !(x === 0 && y === 0)) s += `M${X} ${Y}h${cs}`; if (cl.l) s += `M${X} ${Y}v${cs}`;
    if (cl.b && !(x === n - 1 && y === n - 1)) s += `M${X} ${Y + cs}h${cs}`; if (cl.r) s += `M${X + cs} ${Y}v${cs}`; return s; }).join('')).join('');
  const svg = sol => `<svg class="maze" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}"><path d="${walls}" stroke="#333" stroke-width="2" fill="none" stroke-linecap="round"/>${sol ? `<polyline fill="none" stroke="#E53935" stroke-width="3" points="${path.map(([x, y]) => `${x * cs + 2 + cs / 2},${y * cs + 2 + cs / 2}`).join(' ')}"/>` : ''}</svg>`;
  return { title: 'Лабиринт', instr: `Помоги найти дорогу: проведи линию от «${a.nom}» к «${b.nom}», не пересекая стенки.`,
    body: `<div class="mazewrap">${pic(a, { nocap: true, size: 34 })}${svg(false)}${pic(b, { nocap: true, size: 34 })}</div>`, answer: 'Путь: ' + svg(true), answerHtml: true };
}, 'развивать зрительно-моторную координацию, пространственное мышление');

def('trace', 'motor', 'Проведи дорожку', c => c.words.length >= 2, (c, r) => {
  const lvl = Math.min(4, Math.floor(c.ageIdx * 1.3 + c.prog * 2));
  const types = ['straight', 'wave', 'zigzag', 'arch', 'loop'];
  const rows = r.sample(c.words, Math.min(3, c.words.length)).map((w, i) => ({ w, t: types[Math.min(4, lvl + (i % 2))] }));
  const path = t => { const W = 220, H = 40; let d = 'M5 20';
    if (t === 'straight') d += ` L${W - 5} 20`;
    if (t === 'wave') for (let x = 5; x < W - 5; x += 30) d += ` q15 -18 30 0`;
    if (t === 'zigzag') for (let x = 5, k = 0; x < W - 20; x += 20, k++) d += ` l20 ${k % 2 ? 14 : -14}`;
    if (t === 'arch') for (let x = 5; x < W - 5; x += 30) d += ` a15 15 0 0 1 30 0`;
    if (t === 'loop') for (let x = 5; x < W - 25; x += 26) d += ` c10 -26 26 -10 13 5 c-8 9 0 15 13 -5`;
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><path d="${d}" fill="none" stroke="#888" stroke-width="2" stroke-dasharray="4 4"/></svg>`; };
  return { title: 'Проведи дорожку', instr: 'Обведи пунктирные дорожки карандашом, не отрывая руки. Старайся не выходить за линию.',
    body: rows.map(x => `<div class="row trace">${pic(x.w, { nocap: true, size: 30 })}${path(x.t)}<span class="emo">🏠</span></div>`).join(''), answer: 'Оценить точность и непрерывность линии.' };
}, 'развивать мелкую моторику, готовить руку к письму');

// ---- ОКРУЖАЮЩИЙ МИР ----
def('odd', 'world', 'Четвёртый лишний', c => c.words.length >= 3, (c, r) => {
  const rows = Array.from({ length: c.nItems(2, 4) }, () => { const own = r.sample(c.words, 3); const ot = r.pick(c.others); const odd = r.pick(ot.words); const all = r.shuffle(own.concat([odd])); return { all, odd, ot }; });
  return { title: 'Что лишнее?', instr: 'Найди в каждом ряду лишний предмет и зачеркни его. Объясни, почему он лишний.',
    body: rows.map(x => `<div class="row">${x.all.map(w => pic(w, { size: 44 })).join('')}</div>`).join(''),
    answer: rows.map(x => `лишний — ${x.odd.nom} (это ${x.ot.gen}, остальные — ${c.theme.gen})`).join('; ') };
}, 'развивать логическое мышление, учить классифицировать предметы и обосновывать ответ');

def('classify', 'world', 'Разложи по группам', c => c.words.length >= 3, (c, r) => {
  const ot = r.pick(c.others);
  const k = c.nItems(3, 4);
  const a = r.sample(c.words, k), b = r.sample(ot.words, k);
  const mixed = r.shuffle(a.concat(b));
  return { title: 'Разложи по группам', instr: `Раскрась кружок под предметом: красным — если это ${c.theme.gen}, синим — если это ${ot.gen}.`,
    body: `<div class="grid">${mixed.map(w => `<div class="cell">${pic(w, { size: 42 })}<span class="circle"></span></div>`).join('')}</div>`,
    answer: `Красным: ${a.map(w => w.nom).join(', ')}; синим: ${b.map(w => w.nom).join(', ')}.` };
}, 'учить классифицировать предметы по существенному признаку');

def('generalize', 'world', 'Назови одним словом', c => true, (c, r) => {
  const ts = [c.theme].concat(r.sample(c.others, c.nItems(1, 3)));
  return { title: 'Назови одним словом', instr: 'Рассмотри каждую группу картинок и назови её одним словом.',
    body: ts.map(t => `<div class="row">${r.sample(t.words, 3).map(w => pic(w, { size: 40 })).join('')} <span class="plus">—</span> ${line(140)}</div>`).join(''),
    answer: ts.map(t => t.gen).join('; ') };
}, 'закреплять обобщающие понятия');

def('habitat', 'world', 'Кто где живёт? Кто что ест?', c => c.theme.homes || c.theme.foods, (c, r) => {
  const map = c.theme.homes && (!c.theme.foods || r() < 0.5) ? ['homes', 'Кто где живёт?', 'живёт'] : ['foods', 'Кто что ест?', 'ест'];
  const ws = r.sample(c.words.filter(w => c.theme[map[0]][w.nom]), c.nItems(3, 6));
  const vals = r.shuffle(ws.map(w => c.theme[map[0]][w.nom]));
  return { title: map[1], instr: `Соедини животное с тем, где оно ${map[2] === 'живёт' ? 'живёт' : 'питается'}. Расскажи полным предложением.`,
    body: `<div class="pairs"><div class="col">${ws.map(w => pic(w)).join('')}</div><div class="col">${vals.map(v => `<span class="tag">${esc(v)}</span>`).join('')}</div></div>`,
    answer: ws.map(w => `${w.nom} — ${c.theme[map[0]][w.nom]}`).join('; ') };
}, 'закреплять знания о жилищах и питании животных, устанавливать связи в природе');

def('tools', 'world', 'Кому что нужно для работы?', c => !!c.theme.tools, (c, r) => {
  const ws = r.sample(c.words.filter(w => c.theme.tools[w.nom]), c.nItems(3, 6));
  const vals = r.shuffle(ws.map(w => c.theme.tools[w.nom]));
  return { title: 'Кому что нужно?', instr: 'Соедини человека с предметом, который нужен ему для работы.',
    body: `<div class="pairs"><div class="col">${ws.map(w => pic(w)).join('')}</div><div class="col">${vals.map(v => `<span class="tag">${esc(v)}</span>`).join('')}</div></div>`,
    answer: ws.map(w => `${w.nom} — ${c.theme.tools[w.nom]}`).join('; ') };
}, 'закреплять знания о профессиях и орудиях труда');

def('season', 'world', 'Признаки времени года', c => !!THEMES.find(t => t.season === c.theme.season && t.signs), (c, r) => {
  const own = THEMES.find(t => t.season === c.theme.season && t.signs);
  const other = r.pick(THEMES.filter(t => t.signs && t.season !== c.theme.season));
  const sn = { autumn: 'осени', winter: 'зимы', spring: 'весны', summer: 'лета' };
  const a = r.sample(own.signs, c.nItems(2, 4)), b = r.sample(other.signs, c.nItems(1, 3));
  const all = r.shuffle(a.map(s => ({ s, ok: 1 })).concat(b.map(s => ({ s, ok: 0 }))));
  return { title: `Признаки ${sn[own.season]}`, instr: `Послушай (прочитай). Поставь галочку рядом с признаками ${sn[own.season]}.`,
    body: `<ul class="checks">${all.map(x => `<li><span class="box"></span> ${esc(x.s)}</li>`).join('')}</ul>`,
    answer: 'Признаки: ' + a.join('; ') + '. Не подходят: ' + b.join('; ') + '.' };
}, 'закреплять представления о сезонных изменениях в природе');

// ---- ГРАМОТА ----
def('firstSound', 'gram', 'Первый звук', c => !!c.gram.first, (c, r) => {
  const pool = c.gram.first === 'vowel' ? VOWEL_WORDS : c.single;
  const ws = r.sample(pool, c.nItems(3, 6));
  return { title: 'Первый звук', instr: 'Назови картинку. Какой первый звук ты слышишь? ' + (c.ageIdx > 0 ? 'Запиши (нарисуй) его в окошке.' : 'Произнеси его громко.'),
    body: `<div class="grid">${ws.map(w => `<div class="cell">${pic(w, { size: 48 })}<span class="box"></span></div>`).join('')}</div>`,
    answer: ws.map(w => `${w.nom} — ${firstSound(w.nom)}`).join('; ') };
}, 'учить выделять первый звук в слове');

def('syllables', 'gram', 'Сколько слогов?', c => !!c.gram.syl, (c, r) => {
  const mx = c.gram.syl;
  const pool = c.single.filter(w => sylCount(w.nom) <= mx);
  const ws = r.sample(pool.length >= 3 ? pool : c.single, c.nItems(3, 6));
  return { title: 'Сколько слогов?', instr: 'Назови картинку, прохлопай слово по слогам. Закрась столько клеточек, сколько слогов в слове.',
    body: `<div class="grid">${ws.map(w => `<div class="cell">${pic(w, { size: 46 })}${box(mx, 'sm')}</div>`).join('')}</div>`,
    answer: ws.map(w => `${w.nom} — ${sylCount(w.nom)}`).join('; ') };
}, 'учить делить слова на слоги');

def('soundPlace', 'gram', 'Где спрятался звук?', c => !!c.gram.place, (c, r) => {
  const snd = (c.sound && SOUNDS[c.sound]) ? c.sound : 'С';
  const bank = SOUNDS[snd].map(s => { const [nom, e] = s.split('|'); return { nom, e }; }).concat(c.single);
  const ws = r.sample(bank.filter(w => soundPlace(w.nom, snd) && (c.gram.place > 2 || soundPlace(w.nom, snd) !== 'середина')), c.nItems(3, 6));
  const cells = c.gram.place > 2 ? 3 : 2;
  return { title: `Где звук [${snd}]?`, instr: `Назови картинку. Где слышится звук [${snd}]: в начале, ${cells > 2 ? 'в середине или в конце слова' : 'или нет'}? Закрась нужную клеточку.`,
    body: `<div class="grid">${ws.map(w => `<div class="cell">${pic(w, { size: 46 })}${box(cells, 'sm')}</div>`).join('')}</div>`,
    answer: ws.map(w => `${w.nom} — ${soundPlace(w.nom, snd)}`).join('; ') };
}, c => `учить определять место звука в слове`);

def('scheme', 'gram', 'Звуковая схема слова', c => !!c.gram.scheme, (c, r) => {
  const mx = c.gram.scheme;
  let pool = c.single.filter(w => { const n = soundsOf(w.nom).length; return n >= 3 && n <= mx; });
  if (pool.length < 2) pool = Object.values(SOUNDS).flat().map(s => { const [nom, e] = s.split('|'); return { nom, e }; }).filter(w => { const n = soundsOf(w.nom).length; return n >= 3 && n <= mx; });
  const ws = r.sample(pool, c.nItems(2, 3));
  const col = s => s.t === 'v' ? '#E53935' : s.t === 's' && c.gram.soft ? '#43A047' : '#1E88E5';
  return { title: 'Звуковая схема', instr: `Назови слово, произнеси каждый звук. Раскрась клеточки: гласный — красным, согласный ${c.gram.soft ? 'твёрдый — синим, мягкий — зелёным' : '— синим'}.`,
    body: ws.map(w => `<div class="row">${pic(w, { size: 46 })}${box(soundsOf(w.nom).length, 'snd')}</div>`).join(''),
    answer: ws.map(w => `${w.nom}: ` + soundsOf(w.nom).map(s => `<span class="sq" style="background:${col(s)}">${s.ch}</span>`).join('')).join('<br>'), answerHtml: true };
}, c => `учить проводить звуковой анализ слов${c.gram.soft ? ', различать твёрдые и мягкие согласные' : ''}`);

def('letters', 'gram', 'Найди букву', c => !!c.gram.letters, (c, r) => {
  const L = c.gram.letters.split('');
  const target = L[L.length - 1 - r.int(0, Math.min(4, L.length - 1))];
  const n = c.nItems(18, 30);
  const arr = Array.from({ length: n }, () => r() < 0.25 ? target : r.pick(L));
  const k = arr.filter(x => x === target).length;
  return { title: `Найди букву ${target}`, instr: `Найди и обведи все буквы ${target}. Посчитай, сколько их.`,
    body: `<div class="letters">${arr.map(x => `<span>${x}</span>`).join('')}</div><div>Всего: <span class="box"></span></div>`,
    answer: `Букв ${target}: ${k}` };
}, 'учить узнавать буквы, развивать зрительное внимание');

def('read', 'gram', 'Прочитай', c => !!c.gram.read, (c, r) => {
  const L = c.gram.letters;
  const cons = L.split('').filter(x => !'АОУЫИЕЁЮЯЭЬЪЙ'.includes(x));
  const vows = L.split('').filter(x => 'АОУЫИЕЁЮЯЭ'.includes(x));
  const syl = r.sample(cons, 3).map(cc => r.sample(vows, 4).map(v => cc + v));
  const readable = c.words.concat(...THEMES.map(t => t.words)).filter(w => isSingle(w) && w.nom.length <= 6 && [...w.nom.toUpperCase()].every(ch => L.includes(ch)));
  const uniq = [...new Map(readable.map(w => [w.nom, w])).values()];
  const ws = r.sample(uniq, c.nItems(2, 5));
  return { title: 'Прочитай', instr: 'Прочитай слоги по строчкам. Затем прочитай слова и соедини слово с картинкой.',
    body: `<div class="syl">${syl.map(row => `<div>${row.join(' &nbsp; ')}</div>`).join('')}</div>${ws.length ? `<div class="pairs"><div class="col">${ws.map(w => `<span class="tag big">${w.nom.toUpperCase()}</span>`).join('')}</div><div class="col">${r.shuffle(ws).map(w => pic(w, { nocap: true, size: 40 })).join('')}</div></div>` : ''}`,
    answer: ws.length ? ws.map(w => w.nom).join(', ') : 'Чтение слогов.' };
}, 'учить читать слоги и короткие слова');

def('sentScheme', 'gram', 'Схема предложения', c => !!c.gram.sent, (c, r) => {
  const animate = !!c.theme.animals;
  const ws = c.countable.filter(isSingle);
  const pool = ws.length ? ws : c.single;
  const mk = {
    3: () => { const w = r.pick(pool); return `${r.pick(NAMES)} любит ${acc(w, animate)}.`; },
    4: () => { const w = r.pick(pool); return `У ${nameGen(r.pick(NAMES))} есть ${w.nom}.`; },
    5: () => { const w = r.pick(pool); return `Дети нашли ${acc(w, animate)} в группе.`; },
    6: () => { const w = r.pick(pool); return `Вечером дети рисуют ${accPl(w, animate)} в альбоме.`; },
    7: () => { const w = r.pick(pool); const [a, b] = r.sample(NAMES, 2); return `Сегодня утром ${a} и ${b} увидели ${acc(w, animate)}.`; }
  };
  const lens = r.sample([3, 4, 5, 6, 7].filter(n => n <= c.gram.sent), c.nItems(2, 3));
  const ss = lens.map(n => mk[n]());
  return { title: 'Сколько слов в предложении?', instr: 'Послушай предложение. Посчитай слова. Нарисуй схему: первое слово — с уголком (большая буква), в конце — точка.',
    body: ss.map(s => `<div class="row"><span class="emo">🗣️</span> ${c.ageIdx === 2 ? esc(s) : '(предложение читает педагог)'} <span class="sline"></span></div>`).join(''),
    answer: ss.map(s => `«${s}» — ${s.replace('.', '').split(' ').length} ${plural(s.split(' ').length, 'слово', 'слова', 'слов')}`).join('; ') };
}, 'учить определять количество слов в предложении, составлять схему предложения');

def('build', 'gram', 'Составь слово', c => !!c.gram.build, (c, r) => {
  const ws = r.sample(c.single.filter(w => w.nom.length >= 3 && w.nom.length <= (c.month > 5 ? 7 : 5)), c.nItems(2, 4));
  return { title: 'Составь слово из букв', instr: 'Буквы перепутались. Составь из них слово и запиши его в клеточки.',
    body: ws.map(w => `<div class="row">${pic(w, { nocap: true, size: 40 })}<span class="tag big">${r.shuffle(w.nom.toUpperCase().split('')).join(' ')}</span>${box(w.nom.length)}</div>`).join(''),
    answer: ws.map(w => w.nom.toUpperCase()).join(', ') };
}, 'учить составлять слова из букв, развивать навыки звуко-буквенного анализа');

// ---- ЛОГОПЕДИЯ ----
const sndBank = s => SOUNDS[s] ? SOUNDS[s].map(x => { const [nom, e] = x.split('|'); return { nom, e }; }) : [];
def('autoSound', 'logo', 'Автоматизация звука', c => !!SOUNDS[c.sound], (c, r) => {
  const s = c.sound, low = s[0].toLowerCase(), soft = s.length > 1;
  const ws = r.sample(sndBank(s), c.nItems(4, 8));
  const V = soft ? ['я', 'ё', 'ю', 'и', 'е'] : ['а', 'о', 'у', 'ы', 'э'];
  const lv = Math.min(3, Math.floor(c.ageIdx + c.prog * 2));
  const rows = [V.map(v => low + v).join('-'), V.map(v => v + low + (soft ? 'ь' : '')).join('-'), V.map(v => 'а' + low + v).join('-'), V.map(v => low + 'т' + v).join('-')].slice(0, lv + 1);
  const phrase = c.ageIdx > 0 ? `<p><b>Повтори фразы:</b> ${ws.slice(0, 2).map(w => `У ${nameGen(r.pick(NAMES))} есть ${w.nom}.`).join(' ')}</p>` : '';
  return { title: `Звук [${s}]`, instr: `Повтори слоги, чётко произнося звук [${s}]. Назови картинки. Раскрась те, где звук [${s}] в начале слова.`,
    body: `<div class="syl">${rows.map(x => `<div>${esc(x)}</div>`).join('')}</div><div class="grid">${ws.map(w => pic(w, { size: 44 })).join('')}</div>${phrase}`,
    answer: 'Звук в начале: ' + ws.filter(w => soundPlace(w.nom, s) === 'начало').map(w => w.nom).join(', ') };
}, c => `автоматизировать звук [${c.sound}] в слогах, словах${c.ageIdx > 0 ? ' и фразах' : ''}`);

def('catchSound', 'logo', 'Поймай звук', c => !!SOUNDS[c.sound], (c, r) => {
  const s = c.sound;
  const pair = (SOUND_PAIRS.find(p => p.includes(s)) || [s, 'М']).find(x => x !== s);
  const yes = r.sample(sndBank(s), 5).map(w => w.nom), no = r.sample(sndBank(pair).length ? sndBank(pair) : THEMES[0].words, 5).map(w => w.nom);
  const list = r.shuffle(yes.concat(no));
  return { title: `Поймай звук [${s}]`, instr: `Хлопни в ладоши, когда услышишь звук [${s}]. Закрась кружок под номером слова, где есть звук.`,
    body: `<div class="row">${list.map((_, i) => `<span class="ordcell"><span class="circle"></span><span class="ordn">${i + 1}</span></span>`).join('')}</div>`,
    answer: 'Педагог читает: ' + list.map((w, i) => `${i + 1}) ${w}${yes.includes(w) ? ' ✓' : ''}`).join(', ') };
}, c => `развивать фонематический слух, учить выделять звук [${c.sound}] из ряда слов`);

def('diff', 'logo', 'Дифференциация звуков', c => !!SOUND_PAIRS.find(p => p.includes(c.sound) && SOUNDS[p[0]] && SOUNDS[p[1]]) || c.ageIdx > 0, (c, r) => {
  const pair = SOUND_PAIRS.find(p => p.includes(c.sound) && SOUNDS[p[0]] && SOUNDS[p[1]]) || ['С', 'Ш'];
  const a = r.sample(sndBank(pair[0]).filter(w => !hasSound(w.nom, pair[1])), 3), b = r.sample(sndBank(pair[1]).filter(w => !hasSound(w.nom, pair[0])), 3);
  const all = r.shuffle(a.concat(b));
  return { title: `[${pair[0]}] или [${pair[1]}]?`, instr: `Назови картинки. Соедини картинку со звуком [${pair[0]}] с левым домиком, а со звуком [${pair[1]}] — с правым.`,
    body: `<div class="grid">${all.map(w => pic(w, { size: 42 })).join('')}</div><div class="row houses2"><div class="h2">🏠 [${pair[0]}]</div><div class="h2">🏠 [${pair[1]}]</div></div>`,
    answer: `[${pair[0]}]: ${a.map(w => w.nom).join(', ')}; [${pair[1]}]: ${b.map(w => w.nom).join(', ')}` };
}, 'учить дифференцировать близкие по звучанию звуки');

def('sylStruct', 'logo', 'Слоговая структура', c => true, (c, r) => {
  const lv = Math.min(4, Math.floor(c.ageIdx * 1.4 + c.prog * 2));
  const sets = [['па-па-па', 'та-та-та', 'ма-ма-ба', 'ка-ка-га'], ['па-та', 'та-ка', 'па-та-ка', 'ба-да-га'], ['па-та-ка', 'та-ка-па', 'ап-ат-ак', 'кот-ток-тук'], ['кта-кто-кту', 'пта-пто-пту', 'стра-стро-стру', 'на-ста-на'], ['скворечник', 'сковорода', 'велосипедист', 'регулировщик', 'экскурсовод']];
  const words = c.single.filter(w => sylCount(w.nom) >= 2 + Math.min(2, c.ageIdx)).slice(0, 4);
  return { title: 'Повтори правильно', instr: 'Повтори за взрослым цепочки слогов, отхлопывая ритм. Затем повтори слова, не пропуская слогов.',
    body: `<div class="syl">${sets[lv].map(x => `<div>${esc(x)}</div>`).join('')}</div>${words.length ? `<div class="grid">${words.map(w => pic(w, { size: 40 })).join('')}</div>` : ''}`,
    answer: 'Следить за сохранением количества и порядка слогов.' };
}, 'формировать слоговую структуру слова, развивать слухоречевую память');

/* ===== Подбор заданий ===== */
const PRIORITY = {
  speech: c => c.speech.k.concat(['name', 'riddle', 'story']),
  math: c => ['countWrite', 'compare', 'ordinal', 'shapes', 'size', 'partsDay', 'neighbors', 'composition', 'examples', 'problems', 'clock', 'dict', 'pattern', 'countConnect', 'orient'],
  world: c => ['odd', 'classify', 'habitat', 'tools', 'season', 'generalize'],
  gram: c => ['firstSound', 'syllables', 'soundPlace', 'scheme', 'letters', 'read', 'sentScheme', 'build'],
  logo: c => ['autoSound', 'catchSound', 'diff', 'sylStruct'],
  motor: c => ['maze', 'trace']
};
const SPEECH_K2T = { name: 'name', plural: 'plural', gplural: 'gplural', dim: 'dim', count: 'count', adj: 'adj', verbs: 'verbs', prep: 'prep', riddle: 'riddle', story: 'story', babies: 'babies', poss: 'poss', antonym: 'antonym', sentence: 'sentence', because: 'because', related: 'related', deformed: 'deformed' };

function available(c, dir) {
  const ids = PRIORITY[dir](c).map(k => SPEECH_K2T[k] || k);
  const uniq = [...new Set(ids)].filter(id => T[id] && T[id].dir === dir && safeOk(id, c));
  if (dir === 'math') {
    const late = ['examples', 'problems', 'clock', 'dict', 'composition', 'neighbors'];
    uniq.sort((a, b) => (late.includes(b) ? 1 : 0) - (late.includes(a) ? 1 : 0));
  }
  return uniq;
}
function safeOk(id, c) { try { return !!T[id].ok(c); } catch (e) { return false; } }

function chooseTasks(c, total) {
  const r = rng(c.seed ^ 0x5bd1e995);
  const logoN = c.logo <= 0 ? 0 : Math.max(1, Math.min(total - 1, Math.round(total * c.logo / 100)));
  const rest = total - logoN;
  let quotas = {};
  if (c.dir === 'complex') {
    const dirs = ['speech', 'math', 'world', 'gram'];
    dirs.forEach(d => quotas[d] = 0);
    for (let i = 0; i < rest; i++) quotas[dirs[i % dirs.length]]++;
    if (rest >= 7) { quotas.motor = 1; quotas.world = Math.max(0, quotas.world - 1); }
  } else {
    const main = Math.max(1, Math.round(rest * 0.7));
    quotas[c.dir] = main;
    const sec = { speech: ['world', 'gram'], math: ['motor', 'world'], world: ['speech', 'math'], gram: ['speech', 'motor'] }[c.dir];
    for (let i = 0; i < rest - main; i++) quotas[sec[i % 2]] = (quotas[sec[i % 2]] || 0) + 1;
  }
  if (logoN) quotas.logo = logoN;
  const picked = [];
  Object.keys(quotas).forEach(d => {
    let av = available(c, d);
    if (d !== 'math' && d !== 'speech') av = r.shuffle(av);
    if (d === 'speech') av = c.speech.k.map(k => SPEECH_K2T[k]).filter(id => av.includes(id)).concat(r.shuffle(av.filter(id => !c.speech.k.map(k => SPEECH_K2T[k]).includes(id))));
    if (d === 'math') { const late = av.filter(x => ['examples', 'problems', 'clock', 'dict', 'composition', 'neighbors'].includes(x)); av = late.concat(r.shuffle(av.filter(x => !late.includes(x)))); }
    av.filter(id => !picked.includes(id)).slice(0, quotas[d]).forEach(id => picked.push(id));
  });
  const fill = ['speech', 'world', 'motor', 'math', 'gram'].map(d => available(c, d)).flat().filter(id => !picked.includes(id));
  while (picked.length < total && fill.length) picked.push(fill.shift());
  const order = ['logo', 'speech', 'gram', 'math', 'world', 'motor'];
  const lo = picked.filter(id => T[id].dir === 'logo');
  const other = picked.filter(id => T[id].dir !== 'logo').sort((a, b) => order.indexOf(T[a].dir) - order.indexOf(T[b].dir));
  if (lo.length > 1) return [lo[0]].concat(other.slice(0, Math.ceil(other.length / 2)), lo.slice(1), other.slice(Math.ceil(other.length / 2)));
  return lo.concat(other);
}

function genTask(c, id, seed) {
  const t = T[id];
  if (!t) return null;
  try {
    const out = t.gen(c, rng(seed));
    if (!out) return null;
    out.id = id; out.dir = t.dir; out.seed = seed;
    out.goal = typeof t.goal === 'function' ? t.goal(c) : t.goal;
    return out;
  } catch (e) {
    console.error('task', id, e);
    return null;
  }
}

/* ===== Программные задачи ===== */
function programGoals(c, tasks) {
  const dirs = new Set(tasks.map(t => t.dir));
  const edu = [`уточнить, расширить и активизировать словарь по теме «${c.theme.name}»`];
  if (dirs.has('speech')) edu.push(`развитие речи: ${c.speech.topic.charAt(0).toLowerCase() + c.speech.topic.slice(1)}`);
  if (dirs.has('math')) edu.push(`ФЭМП: ${c.math.topic.charAt(0).toLowerCase() + c.math.topic.slice(1)}`);
  if (dirs.has('gram')) edu.push(`подготовка к обучению грамоте: ${c.gram.topic.charAt(0).toLowerCase() + c.gram.topic.slice(1)}`);
  if (dirs.has('world')) edu.push(`окружающий мир: ${c.world}`);
  tasks.forEach(t => { if (t.goal && !edu.includes(t.goal) && t.dir !== 'logo' && edu.length < 9) edu.push(t.goal); });
  const dev = ['развивать зрительное и слуховое внимание, память', 'развивать мелкую и общую моторику, координацию речи с движением'];
  if (tasks.some(t => ['odd', 'classify', 'pattern', 'riddle', 'generalize'].includes(t.id))) dev.push('развивать логическое мышление: анализ, сравнение, обобщение, классификацию');
  if (tasks.some(t => ['maze', 'trace', 'dict', 'orient'].includes(t.id))) dev.push('развивать зрительно-моторную координацию и пространственную ориентировку');
  if (tasks.some(t => ['story', 'sentence', 'because', 'deformed'].includes(t.id))) dev.push('развивать связную речь, умение отвечать полным предложением');
  if (dirs.has('gram')) dev.push('развивать фонематический слух и навыки звукового анализа');
  const vos = [c.theme.vosp, 'воспитывать навыки сотрудничества, умение слушать педагога и сверстников, доводить начатое до конца'];
  const cor = [];
  if (c.logo > 0) {
    cor.push('развивать артикуляционную моторику, речевое дыхание');
    if (SOUNDS[c.sound]) cor.push(`автоматизировать звук [${c.sound}] в слогах, словах${c.ageIdx > 0 ? ', фразах' : ''}`);
    const cn = c.concl || '';
    if (/ОНР|ТНР|ЗРР/.test(cn)) cor.push('формировать лексико-грамматический строй речи, преодолевать аграмматизмы');
    if (/ФФНР|ОНР|ТНР/.test(cn)) cor.push('развивать фонематическое восприятие, навыки звукового анализа и синтеза');
    if (/ФНР|дизартр/.test(cn)) cor.push('корригировать звукопроизношение, формировать правильный артикуляционный уклад');
    cor.push('формировать навык самоконтроля за речью');
  }
  return { edu, dev, vos, cor };
}

/* ===== Конспект ===== */
const CHARACTERS = { sad: 'Незнайка', toys: 'Мишка', autumn: 'Осень', veg: 'Бабушка-огородница', fruit: 'Садовник', forest: 'Лесовичок', trees: 'Старичок-Лесовичок', migr: 'Скворушка', russia: 'Почтальон Печкин', clothes: 'Кукла Маша', pets: 'Бабушка Арина', wild: 'Ёжик', winter: 'Снегирь', furn: 'Мастер Самоделкин', dish: 'Федора', ny: 'Дед Мороз', wfun: 'Снеговик', north: 'Пингвинёнок Лоло', south: 'Доктор Айболит', food: 'Повар', trans: 'Светофорчик', army: 'Солдат', prof: 'Почемучка', spring: 'Весна-красна', family: 'Мама-кошка', plants: 'Фея цветов', fish: 'Золотая рыбка', house: 'Фиксик', space: 'Космонавт', insect: 'Муравьишка', tools: 'Мастер Самоделкин', victory: 'Ветеран', flowers: 'Пчёлка Майя', summer: 'Солнышко', school: 'Буратино' };
const DIR_ACT = { speech: 'Игра', math: 'Математическое задание', world: 'Дидактическая игра', gram: 'Звуковая игра', logo: 'Логопедическое упражнение', motor: 'Задание на развитие моторики' };

function plainAnswer(t) { return t.answerHtml ? (t.id === 'scheme' ? t.answer.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ') : 'см. образец в рабочем листе') : t.answer; }

function buildKonspekt(c, tasks, s) {
  const a = c.ageInfo, th = c.theme;
  const goals = programGoals(c, tasks);
  const ch = CHARACTERS[th.id] || 'Незнайка';
  const groupKind = s.groupType;
  const total = a.minutes;
  const hasLogo = c.logo > 0;
  const artic = hasLogo ? (ARTIC_BY_SOUND[c.sound] || [0, 1, 3, 6, 7]).slice(0, c.ageIdx === 0 ? 4 : 5).map(i => ARTIC[i]) : [];
  const breath = BREATH[(c.step + c.ageIdx) % BREATH.length];
  const intro = 2, motiv = 1, fiz = 2, fin = 2;
  const logoTime = hasLogo ? Math.max(2, Math.round(3 * c.logo / 100) + 1) : 0;
  const main = Math.max(tasks.length, total - intro - motiv - fiz - fin - logoTime);
  const per = Math.max(1, Math.floor(main / Math.max(1, tasks.length)));
  const mid = Math.ceil(tasks.length / 2);
  const equip = new Set(['предметные картинки по теме', `рабочие листы (${tasks.length} ${plural(tasks.length, 'задание', 'задания', 'заданий')})`, 'цветные и простые карандаши', `игрушка-персонаж (${ch})`]);
  tasks.forEach(t => { if (t.dir === 'math') equip.add('счётные палочки, карточки с цифрами'); if (t.dir === 'gram') equip.add('звуковые фишки (красные, синие, зелёные)'); if (t.dir === 'logo') equip.add('индивидуальные зеркала'); if (t.id === 'dict') equip.add('листы в клетку'); if (t.id === 'clock') equip.add('модель часов'); if (t.id === 'story') equip.add('мнемотаблица'); });
  if (hasLogo) equip.add('материал для дыхательной гимнастики');
  equip.add('мяч');
  const ol = arr => `<ol>${arr.map(x => `<li>${esc(x)}</li>`).join('')}</ol>`;
  let h = `<div class="doc konspekt">`;
  h += `<p class="center small">${esc(s.org || '')}${s.city ? ', ' + esc(s.city) : ''}</p>`;
  h += `<h1>Конспект ${c.lessonType === 'final' ? 'итогового ' : ''}занятия</h1>`;
  h += `<p class="center">по направлению «${esc(DIRECTIONS[c.dir])}»<br>${esc(a.name)} (${a.years}), ${esc(groupKind.toLowerCase())} направленности</p>`;
  h += `<p class="center"><b>Тема: «${esc(th.name)}»</b></p>`;
  h += `<table class="meta"><tr><td>Период</td><td>${MONTHS[c.month]}, ${c.week}-я неделя (уровень сложности ${c.step + 1} из 36)</td></tr>`;
  h += `<tr><td>Тип занятия</td><td>${{ new: 'изучение нового материала', fix: 'закрепление', final: 'итоговое (контрольное)' }[c.lessonType] || 'комбинированное'}</td></tr>`;
  h += `<tr><td>Форма</td><td>${esc(s.form)}</td></tr><tr><td>Длительность</td><td>${total} минут (СанПиН 1.2.3685-21)</td></tr>`;
  if (hasLogo) h += `<tr><td>Логопедическая составляющая</td><td>${c.logo}%${c.concl && c.concl !== CONCLUSIONS[0] ? '; речевое заключение: ' + esc(c.concl) : ''}${SOUNDS[c.sound] ? `; звук [${esc(c.sound)}]` : ''}</td></tr>`;
  h += `<tr><td>Интеграция областей</td><td>речевое, познавательное, социально-коммуникативное, физическое, художественно-эстетическое развитие</td></tr>`;
  if (s.author) h += `<tr><td>Составитель</td><td>${esc(s.author)}${s.position ? ', ' + esc(s.position) : ''}</td></tr>`;
  h += `</table>`;
  h += `<h2>Программные задачи</h2><h3>Образовательные</h3>${ol(goals.edu)}<h3>Развивающие</h3>${ol(goals.dev)}`;
  if (goals.cor.length) h += `<h3>Коррекционные</h3>${ol(goals.cor)}`;
  h += `<h3>Воспитательные</h3>${ol(goals.vos)}`;
  h += `<h2>Оборудование</h2><p>${esc([...equip].join('; '))}.</p>`;
  h += `<h2>Предварительная работа</h2><p>Рассматривание иллюстраций по теме «${esc(th.name)}», беседы (${esc(th.talk.join(' '))}), чтение художественной литературы, разучивание физминутки и пальчиковой гимнастики, дидактические игры по теме.</p>`;
  h += `<h2>Ход занятия</h2>`;
  let n = 1;
  h += `<h3>${n++}. Организационный момент (${intro} мин)</h3><p><b>Педагог:</b> Здравствуйте, ребята! Встанем в круг, улыбнёмся друг другу. Сядет тот, кто назовёт ${c.ageIdx === 0 ? 'предмет' : 'слово'} по теме «${esc(th.name)}».</p><p><i>Дети называют: ${esc(c.words.slice(0, 6).map(w => w.nom).join(', '))}…</i></p>`;
  h += `<h3>${n++}. Мотивация (${motiv} мин)</h3><p><b>Педагог:</b> К нам в гости пришёл(-ла) ${esc(ch)}. Он(а) принёс(-ла) конверт с заданиями и просит нас помочь. Поможем? За каждое выполненное задание ${esc(ch)} подарит нам фишку, а в конце занятия мы узнаем сюрприз!</p>`;
  h += `<p><b>Беседа:</b> ${esc(th.talk.join(' '))}</p>`;
  if (hasLogo) {
    h += `<h3>${n++}. Логопедическая разминка (${logoTime} мин)</h3><p><b>Артикуляционная гимнастика</b> (перед зеркалом, каждое упражнение 5–7 раз):</p><ol>${artic.map(x => `<li><b>«${esc(x[0])}»</b> — ${esc(x[1])}</li>`).join('')}</ol>`;
    h += `<p><b>Дыхательное упражнение:</b> ${esc(breath)}</p>`;
    h += `<p><b>Пальчиковая гимнастика:</b><br>${esc(th.finger).replace(/\n/g, '<br>')}</p>`;
  } else {
    h += `<h3>${n++}. Пальчиковая гимнастика (1 мин)</h3><p>${esc(th.finger).replace(/\n/g, '<br>')}</p>`;
  }
  h += `<h3>${n++}. Основная часть</h3>`;
  tasks.forEach((t, i) => {
    if (i === mid) h += `<h3>${n++}. Физминутка (${fiz} мин)</h3><p>${esc(th.fiz).replace(/\n/g, '<br>')}</p><h3>${n++}. Продолжение основной части</h3>`;
    h += `<div class="step"><p><b>${DIR_ACT[t.dir]} «${esc(t.title)}» (${per} мин).</b></p><p><b>Педагог:</b> ${esc(t.instr)}</p><p><i>Ожидаемые ответы / образец:</i> ${esc(plainAnswer(t))}</p><p class="small"><i>Задача:</i> ${esc(t.goal)}.</p></div>`;
  });
  if (tasks.length < 2) h += `<h3>${n++}. Физминутка (${fiz} мин)</h3><p>${esc(th.fiz).replace(/\n/g, '<br>')}</p>`;
  h += `<h3>${n++}. Итог занятия. Рефлексия (${fin} мин)</h3><p><b>Педагог:</b> Ребята, кому мы сегодня помогали? Какие задания выполняли? Что было самым интересным? Что было трудным? ${esc(ch)} благодарит вас и дарит сюрприз!</p><p>Дети оценивают свою работу: выбирают смайлик (😊 — всё получилось, 😐 — были трудности). Педагог отмечает активность каждого ребёнка${hasLogo ? ', правильное произношение звука' : ''}.</p>`;
  h += `</div>`;
  return h;
}

/* ===== Задания родителям ===== */
function buildParents(c, tasks, s) {
  const r = rng(c.seed ^ 0x2545F491);
  const th = c.theme, w = c.countable.length ? c.countable : c.words;
  const items = [];
  items.push(['Беседа по теме', `Рассмотрите с ребёнком картинки или реальные предметы по теме «${th.name}». Назовите их: ${c.words.map(x => x.nom).join(', ')}. Обсудите вопросы: ${th.talk.join(' ')} Помогите запомнить обобщающее слово — «${th.gen}».`]);
  const sk = c.speech.k;
  if (sk.includes('count') && w.length) { const x = r.sample(w, 3); items.push(['Игра «Посчитай»', `Посчитайте предметы вместе, правильно согласуя слова: ${x.map(y => `один ${y.nom}, два ${y.gen}, пять ${y.gpl}`).join('; ')}.`]); }
  else if (sk.includes('gplural') && w.length) { const x = r.sample(w, 4); items.push(['Игра «Один — много»', `Вы называете один предмет, ребёнок — много: ${x.map(y => `${y.nom} — много ${y.gpl}`).join('; ')}.`]); }
  else if (sk.includes('poss') && th.poss) { const x = r.sample(Object.keys(th.poss), 3); items.push(['Игра «Чей хвост?»', `Спросите: «Чей хвост у ${x.map(y => y).join(', у ')}?» Ответы: ${x.map(y => th.poss[y] + ' хвост').join(', ')}.`]); }
  else { const x = r.sample(c.words.filter(y => y.dim), 4); items.push(['Игра «Назови ласково»', x.length ? `Вы называете предмет, ребёнок — ласково: ${x.map(y => `${y.nom} — ${y.dim}`).join('; ')}.` : `Придумайте вместе ласковые слова о предметах по теме «${th.name}».`]); }
  const m = c.math;
  if (m.ex) items.push(['Математика', `Решайте примеры в пределах ${m.ex.max} на предметах по теме (${w[0] ? w[0].gpl : 'предметах'}): сначала выложите, потом посчитайте. Примеры: ${[1, 2, 3].map(() => { const a = r.int(1, Math.min(9, m.ex.max - 1)); const b = r.int(1, Math.min(9, m.ex.max - a)); return `${a} + ${b}`; }).join(', ')}. ${m.tasks ? 'Придумайте вместе задачу о предметах по теме.' : ''}`]);
  else if (m.comp) items.push(['Математика', `Поиграйте в «Числовой домик»: разложите ${m.comp} пуговиц (конфет) на две кучки всеми способами и назовите состав числа ${m.comp}. Повторите порядковый и обратный счёт до ${m.max}.`]);
  else items.push(['Математика', `Посчитайте предметы по теме дома (до ${m.max}). Сравните две группы: где больше, где меньше, где поровну? ${m.shapes ? 'Найдите вокруг предметы, похожие на ' + m.shapes.slice(0, 3).join(', ') + '.' : ''}`]);
  const g = c.gram;
  if (g.read) items.push(['Грамота', `Читайте слоги и короткие слова с изученными буквами (${g.letters.slice(-5).split('').join(', ')}). Составьте слово из букв магнитной азбуки: ${r.sample(c.single.filter(x => x.nom.length <= 5), 2).map(x => x.nom.toUpperCase()).join(', ') || 'КОТ, ДОМ'}.`]);
  else if (g.scheme) items.push(['Звуковой анализ', `Выложите звуковые схемы слов фишками (гласный — красный, согласный — синий${g.soft ? ', мягкий — зелёный' : ''}): ${r.sample(c.single.filter(x => soundsOf(x.nom).length <= g.scheme), 2).map(x => x.nom).join(', ') || 'кот, дом'}.`]);
  else items.push(['Звуки и слоги', `Прохлопайте слова по слогам: ${r.sample(c.single, 4).map(x => x.nom).join(', ')}. Назовите первый звук в каждом слове.`]);
  if (c.logo > 0) {
    const art = (ARTIC_BY_SOUND[c.sound] || [0, 1, 3]).slice(0, 4).map(i => ARTIC[i][0]);
    items.push(['Логопедическое задание', `Ежедневно выполняйте перед зеркалом артикуляционную гимнастику (5–7 минут): ${art.map(x => '«' + x + '»').join(', ')}.${SOUNDS[c.sound] ? ` Закрепляйте звук [${c.sound}]: повторяйте слова ${r.sample(sndBank(c.sound), 5).map(x => x.nom).join(', ')}. Следите за правильным произношением звука в речи ребёнка.` : ''}`]);
  } else {
    items.push(['Пальчиковая гимнастика и творчество', `Разучите пальчиковую гимнастику:\n${th.finger}\nНарисуйте (вылепите) с ребёнком предмет по теме и составьте о нём рассказ из ${c.ageIdx + 3} предложений.`]);
  }
  const lst = items.slice(0, c.logo > 0 ? 5 : 4);
  let h = `<div class="doc parents"><h1>Задание для родителей</h1><p class="center">Тема недели: <b>«${esc(th.name)}»</b><br>${esc(c.ageInfo.name)} (${c.ageInfo.years}) · ${MONTHS[c.month]}, ${c.week}-я неделя</p>`;
  h += `<p>Уважаемые родители! На этой неделе мы изучаем тему «${esc(th.name)}». Пожалуйста, выполните с ребёнком упражнения (10–15 минут в день, в игровой форме, хвалите ребёнка за старание).</p><ol class="parents-list">`;
  h += lst.map(x => `<li><b>${esc(x[0])}.</b> ${esc(x[1]).replace(/\n/g, '<br>')}</li>`).join('');
  h += `</ol><p class="small">${s.author ? 'Педагог: ' + esc(s.author) : ''}${s.position ? ', ' + esc(s.position) : ''}</p></div>`;
  return h;
}

/* ===== Рабочий лист ===== */
function buildWorksheet(c, tasks, s, teacher) {
  let h = `<div class="doc sheet"><div class="sheet-head"><h1>Рабочий лист</h1><p class="center">Тема: <b>«${esc(c.theme.name)}»</b> · ${esc(c.ageInfo.name)} · ${MONTHS[c.month]}, ${c.week}-я неделя</p><p>Имя, фамилия ребёнка: ${line(220)} &nbsp; Дата: ${line(90)}</p></div>`;
  tasks.forEach((t, i) => {
    h += `<section class="task" data-i="${i}"><div class="task-h"><span class="num">${i + 1}</span><h2>${esc(t.title)}</h2><span class="dirtag d-${t.dir}">${{ speech: 'речь', math: 'математика', world: 'окр. мир', gram: 'грамота', logo: 'логопедия', motor: 'моторика' }[t.dir]}</span></div>`;
    h += `<p class="instr">${esc(t.instr)}</p><div class="tbody">${t.body}</div>`;
    if (teacher) h += `<div class="answer"><b>Для педагога:</b> ${t.answerHtml ? t.answer : esc(t.answer)}</div>`;
    h += `<div class="task-tools no-print"><button data-act="regen" data-i="${i}">↻ Другой вариант</button><button data-act="up" data-i="${i}">↑</button><button data-act="down" data-i="${i}">↓</button><button data-act="del" data-i="${i}">✕ Удалить</button></div></section>`;
  });
  h += `</div>`;
  return h;
}

function themeFromCustom(name, text) {
  const words = String(text || '').split(/[\n,;]+/).map(s => s.trim()).filter(Boolean).slice(0, 14).map(s => {
    const parts = s.split('|').map(x => x.trim());
    if (parts.length >= 7) return W(parts.join('|'));
    const nom = parts[0].toLowerCase();
    const e = parts.find((x, i) => i > 0 && /\p{Extended_Pictographic}/u.test(x)) || '';
    return { nom, gen: '', pl: '', gpl: '', dim: '', g: '', e };
  });
  return { id: 'custom', m: 0, wk: 1, name: name || 'Своя тема', gen: 'предметы по теме', season: 'autumn', words, adj: [], verbs: [], riddles: [], fiz: THEMES[1].fiz, finger: THEMES[1].finger, vosp: 'воспитывать интерес к окружающему миру', talk: ['Что вы знаете об этих предметах?', 'Где их можно встретить?', 'Для чего они нужны?'] };
}

if (typeof module !== 'undefined') module.exports = { rng, makeCtx, chooseTasks, genTask, available, T, buildWorksheet, buildKonspekt, buildParents, programGoals, soundsOf, firstSound, soundPlace, sylCount, agree, themeFromCustom };

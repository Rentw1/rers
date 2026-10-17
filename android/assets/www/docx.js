'use strict';
/* HTML → настоящий .docx (WordprocessingML) с картинками PNG. Открывается в Word, WPS, Google Docs, LibreOffice. */

const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(u8) { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC_T[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

function zipStore(files) {
  const enc = new TextEncoder();
  const chunks = [], central = [];
  let off = 0;
  files.forEach(f => {
    const name = enc.encode(f.name);
    const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
    const crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
    h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true);
    chunks.push(new Uint8Array(h.buffer), name, data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
    c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
    central.push(new Uint8Array(c.buffer), name);
    off += 30 + name.length + data.length;
  });
  const csize = central.reduce((s, a) => s + a.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, csize, true); e.setUint32(16, off, true);
  const all = chunks.concat(central, [new Uint8Array(e.buffer)]);
  const out = new Uint8Array(all.reduce((s, a) => s + a.length, 0));
  let p = 0; all.forEach(a => { out.set(a, p); p += a.length; });
  return out;
}
function u8ToB64(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
function b64ToU8(b) { const s = atob(b); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
const xesc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

function loadImg(src) { return new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; }); }
async function toPng(src, w, h) {
  const im = await loadImg(src);
  if (!im) return null;
  const W = Math.max(1, Math.round(w || im.naturalWidth || 64)), H = Math.max(1, Math.round(h || im.naturalHeight || 64));
  const cv = document.createElement('canvas'); cv.width = W * 2; cv.height = H * 2;
  const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(im, 0, 0, cv.width, cv.height);
  try { return { b64: cv.toDataURL('image/png').split(',')[1], w: W, h: H }; } catch (e) { return null; }
}
function emojiPng(ch, px) {
  const cv = document.createElement('canvas'); const S = 96; cv.width = S; cv.height = S;
  const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, S, S);
  g.font = '76px "Noto Color Emoji","Apple Color Emoji","Segoe UI Emoji",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ch, S / 2, S / 2 + 4);
  try { return { b64: cv.toDataURL('image/png').split(',')[1], w: px, h: px }; } catch (e) { return null; }
}
function svgSrc(svg) {
  let xml = new XMLSerializer().serializeToString(svg);
  if (!xml.includes('xmlns="http://www.w3.org/2000/svg"')) xml = xml.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(xml)));
}

const BLOCK_TAGS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'LI', 'DIV', 'SECTION', 'BLOCKQUOTE', 'UL', 'OL', 'HR', 'TABLE']);

class DocxBuilder {
  constructor(opt) { this.opt = opt || {}; this.media = []; this.body = []; this.para = null; this.fetcher = this.opt.fetcher; }
  pOpen(style) { if (!this.para) this.para = { runs: [], style: style || {} }; return this.para; }
  pFlush(target) { if (this.para) { if (this.para.runs.length) (target || this.body).push({ p: this.para }); this.para = null; } }
  text(t, f) { if (!t) return; const p = this.pOpen(); p.runs.push(Object.assign({ t }, f)); }
  async image(src, w, h) {
    let png = null;
    if (src.startsWith('emoji:')) png = emojiPng(src.slice(6), w);
    else {
      let s = src;
      if (/^https?:/.test(s) && this.fetcher) { const d = await this.fetcher(s); s = d || ''; }
      if (s) png = await toPng(s, w, h);
    }
    if (!png) return false;
    const id = this.media.length + 1;
    this.media.push({ id, b64: png.b64 });
    this.pOpen().runs.push({ img: id, w: w || png.w, h: h || png.h });
    return true;
  }
  async walk(node, f, target) {
    for (const n of Array.from(node.childNodes)) {
      if (n.nodeType === 3) { const t = n.nodeValue.replace(/\s+/g, ' '); if (t.trim() || (this.para && this.para.runs.length)) this.text(t, f); continue; }
      if (n.nodeType !== 1) continue;
      const el = n, tag = el.tagName.toUpperCase(), cls = el.classList;
      if (getComputedStyle(el).display === 'none') continue;
      if (tag === 'BR') { this.pOpen().runs.push({ br: 1 }); continue; }
      if (tag === 'SVG' || el.namespaceURI === 'http://www.w3.org/2000/svg') {
        const w = +el.getAttribute('width') || 120, h = +el.getAttribute('height') || 60;
        const k = Math.min(1, 440 / w);
        await this.image(svgSrc(el), w * k, h * k); continue;
      }
      if (tag === 'IMG') { const sz = Math.min(220, el.width || 56); await this.image(el.src, sz, sz * ((el.naturalHeight || 1) / (el.naturalWidth || 1))); continue; }
      if (cls.contains('pic')) {
        const s = parseFloat(getComputedStyle(el).getPropertyValue('--s')) || 46;
        const img = el.querySelector('img'), emo = el.querySelector('.emo'), capEl = el.querySelector('.cap');
        const sz = Math.min(80, Math.max(22, s * 0.85));
        let ok = false;
        if (img) ok = await this.image(img.src, sz, sz);
        else if (emo && emo.textContent.trim()) ok = await this.image('emoji:' + emo.textContent.trim(), sz, sz);
        if (!ok && emo) this.text(emo.textContent, f);
        if (capEl && getComputedStyle(capEl).display !== 'none') this.text(' ' + capEl.textContent + '  ', Object.assign({}, f, { sz: 9 }));
        else this.text(' ', f);
        continue;
      }
      if (cls.contains('box') || cls.contains('circle')) { this.text(cls.contains('circle') ? '◯ ' : cls.contains('sm') ? '☐' : '☐ ', Object.assign({}, f, { sz: cls.contains('sm') ? 14 : 20 })); continue; }
      if (cls.contains('wline') || cls.contains('sline')) { this.text('_'.repeat(Math.max(6, Math.round((parseInt(el.style.width) || 160) / 9))) + ' ', f); continue; }
      if (cls.contains('sq')) { this.text(el.textContent, Object.assign({}, f, { b: 1, shade: rgbHex(getComputedStyle(el).backgroundColor), color: 'FFFFFF' })); this.text(' ', f); continue; }
      if (cls.contains('task-tools') || cls.contains('no-print') || cls.contains('dirtag')) continue;
      if (cls.contains('mn-n')) { this.text(el.textContent + '. ', Object.assign({}, f, { b: 1 })); continue; }
      if (cls.contains('house')) {
        this.pFlush(target);
        const roof = el.querySelector('.roof');
        this.pOpen();
        this.text(`Домик ${roof ? roof.textContent : ''}: `, Object.assign({}, f, { b: 1 }));
        el.querySelectorAll('.floor').forEach(fl => { const a = fl.querySelector('span'); this.text(`${a ? a.textContent : ''} + `, f); this.text('☐   ', Object.assign({}, f, { sz: 20 })); });
        this.pFlush(target);
        continue;
      }
      if (cls.contains('task-h')) {
        this.pFlush(target);
        const num = el.querySelector('.num'), h = el.querySelector('h2');
        this.pOpen({ shade: 'E8EAF6' });
        this.text(`${num ? num.textContent + '. ' : ''}${h ? h.textContent : ''}`, Object.assign({}, f, { b: 1, sz: (this.opt.fs || 14) + 1 }));
        this.pFlush(target);
        continue;
      }
      if (tag === 'TABLE' || cls.contains('pairs') || cls.contains('orient')) { await this.table(el, f, target); continue; }
      const nf = Object.assign({}, f);
      if (tag === 'B' || tag === 'STRONG' || tag === 'TH') nf.b = 1;
      if (tag === 'I' || tag === 'EM') nf.i = 1;
      if (cls.contains('tag') || cls.contains('digit')) { this.text(' ' + el.textContent.trim() + ' ', Object.assign({}, nf, { b: 1, box: 1 })); this.text(' ', f); continue; }
      if (cls.contains('cell') || cls.contains('ordcell') || cls.contains('nb') || cls.contains('mn') || cls.contains('grp') || cls.contains('exm')) { await this.walk(el, nf, target); this.text('    ', f); continue; }
      const isBlock = BLOCK_TAGS.has(tag) && !cls.contains('cell');
      if (!isBlock) { await this.walk(el, nf, target); continue; }
      this.pFlush(target);
      if (tag === 'HR') { (target || this.body).push({ p: { runs: [{ t: '' }], style: { hr: 1 } } }); continue; }
      const st = {};
      if (tag === 'H1') { nf.b = 1; nf.sz = (this.opt.fs || 14) + 4; st.center = 1; }
      if (tag === 'H2') { nf.b = 1; nf.sz = (this.opt.fs || 14) + 2; }
      if (tag === 'H3' || tag === 'H4') { nf.b = 1; }
      if (cls.contains('center')) st.center = 1;
      if (cls.contains('answer')) { st.shade = 'FFF8D6'; nf.sz = Math.max(9, (this.opt.fs || 14) - 3); }
      if (cls.contains('mn-n')) { this.text(el.textContent + '. ', Object.assign({}, f, { b: 1 })); continue; }
      if (cls.contains('house')) {
        this.pFlush(target);
        const roof = el.querySelector('.roof');
        this.pOpen();
        this.text(`Домик ${roof ? roof.textContent : ''}: `, Object.assign({}, f, { b: 1 }));
        el.querySelectorAll('.floor').forEach(fl => { const a = fl.querySelector('span'); this.text(`${a ? a.textContent : ''} + `, f); this.text('☐   ', Object.assign({}, f, { sz: 20 })); });
        this.pFlush(target);
        continue;
      }
      if (cls.contains('task-h')) { st.shade = 'E8EAF6'; nf.b = 1; }
      if (cls.contains('instr')) nf.i = 1;
      if (cls.contains('dirtag')) continue;
      if (tag === 'LI') {
        const par = el.parentElement;
        const idx = Array.from(par.children).indexOf(el) + 1;
        st.ind = 360;
        this.pOpen(st); this.text(par.tagName === 'OL' ? idx + '. ' : '• ', nf);
      } else if (cls.contains('num')) {
        this.text(el.textContent + '. ', nf); continue;
      }
      this.pOpen(st);
      await this.walk(el, nf, target);
      this.pFlush(target);
    }
  }
  async table(el, f, target) {
    this.pFlush(target);
    let rows;
    if (el.tagName === 'TABLE') rows = Array.from(el.rows).map(r => Array.from(r.cells));
    else if (el.classList.contains('pairs')) rows = [Array.from(el.children)];
    else { const cells = Array.from(el.children); const n = el.classList.contains('o3') ? 3 : 2; rows = []; for (let i = 0; i < cells.length; i += n) rows.push(cells.slice(i, i + n)); }
    const tb = { tbl: [] };
    for (const r of rows) {
      const row = [];
      for (const cell of r) {
        const blocks = [];
        if (el.classList.contains('pairs')) {
          for (const ch of Array.from(cell.children)) { this.pOpen({ center: 1 }); await this.walk({ childNodes: [ch] }, f, blocks); this.pFlush(blocks); }
        } else {
          await this.walk(cell, Object.assign({}, f, cell.tagName === 'TH' ? { b: 1 } : {}), blocks);
          this.pFlush(blocks);
        }
        if (!blocks.length) blocks.push({ p: { runs: [{ t: el.classList.contains('orient') ? ' ' : '' }], style: el.classList.contains('orient') ? { tall: 1 } : {} } });
        row.push(blocks);
      }
      tb.tbl.push(row);
    }
    (target || this.body).push(tb);
  }
  runXml(r) {
    if (r.br) return '<w:r><w:br/></w:r>';
    if (r.img) {
      const cx = Math.round(r.w * 9525), cy = Math.round(r.h * 9525);
      return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${r.img}" name="Рисунок ${r.img}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${r.img}" name="image${r.img}.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdImg${r.img}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
    }
    let pr = '';
    if (r.b) pr += '<w:b/>';
    if (r.i) pr += '<w:i/>';
    if (r.color) pr += `<w:color w:val="${r.color}"/>`;
    if (r.sz) pr += `<w:sz w:val="${Math.round(r.sz * 2)}"/>`;
    if (r.box) pr += '<w:bdr w:val="single" w:sz="6" w:space="0" w:color="555555"/>';
    if (r.shade) pr += `<w:shd w:val="clear" w:color="auto" w:fill="${r.shade}"/>`;
    return `<w:r>${pr ? `<w:rPr>${pr}</w:rPr>` : ''}<w:t xml:space="preserve">${xesc(r.t)}</w:t></w:r>`;
  }
  pXml(p) {
    const s = p.style || {};
    let pr = '<w:spacing w:after="80" w:line="264" w:lineRule="auto"/>';
    if (s.center) pr += '<w:jc w:val="center"/>';
    if (s.ind) pr += `<w:ind w:left="${s.ind}"/>`;
    if (s.shade) pr += `<w:shd w:val="clear" w:color="auto" w:fill="${s.shade}"/>`;
    if (s.hr) pr += '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="999999"/></w:pBdr>';
    if (s.tall) pr += '<w:spacing w:before="400" w:after="400"/>';
    const runs = p.runs.slice();
    while (runs.length && runs[runs.length - 1].t !== undefined && !runs[runs.length - 1].t.trim() && runs.length > 1) runs.pop();
    return `<w:p><w:pPr>${pr}</w:pPr>${runs.map(r => this.runXml(r)).join('')}</w:p>`;
  }
  blocksXml(bs) {
    return bs.map(b => b.p ? this.pXml(b.p) : this.tblXml(b.tbl)).join('');
  }
  tblXml(rows) {
    const cols = Math.max(1, ...rows.map(r => r.length));
    const w = Math.floor(9600 / cols);
    const bd = '<w:tblBorders>' + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(x => `<w:${x} w:val="single" w:sz="4" w:space="0" w:color="999999"/>`).join('') + '</w:tblBorders>';
    return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>${bd}<w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${Array.from({ length: cols }, () => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${rows.map(r => `<w:tr>${r.map(c => `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/></w:tcPr>${this.blocksXml(c) || '<w:p/>'}</w:tc>`).join('')}${Array.from({ length: cols - r.length }, () => `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/></w:tcPr><w:p/></w:tc>`).join('')}</w:tr>`).join('')}</w:tbl><w:p/>`;
  }
  build(title) {
    const fs = this.opt.fs || 14;
    const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
    const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${this.blocksXml(this.body)}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="850" w:right="850" w:bottom="850" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>`;
    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="Times New Roman" w:cs="Times New Roman"/><w:sz w:val="${fs * 2}"/><w:szCs w:val="${fs * 2}"/><w:lang w:val="ru-RU"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="80"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`;
    const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${this.media.map(m => `<Relationship Id="rIdImg${m.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image${m.id}.png"/>`).join('')}</Relationships>`;
    const ct = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`;
    const root = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`;
    const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xesc(title || 'Документ')}</dc:title><dc:creator>Конструктор занятий ДОУ</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created></cp:coreProperties>`;
    const files = [{ name: '[Content_Types].xml', data: ct }, { name: '_rels/.rels', data: root }, { name: 'docProps/core.xml', data: core }, { name: 'word/document.xml', data: doc }, { name: 'word/styles.xml', data: styles }, { name: 'word/_rels/document.xml.rels', data: rels }];
    this.media.forEach(m => files.push({ name: `word/media/image${m.id}.png`, data: b64ToU8(m.b64) }));
    return zipStore(files);
  }
}
function rgbHex(c) { const m = String(c).match(/\d+/g); if (!m || m.length < 3) return '1E88E5'; return m.slice(0, 3).map(x => (+x).toString(16).padStart(2, '0')).join('').toUpperCase(); }

async function htmlToDocx(rootEl, opt) {
  const b = new DocxBuilder(opt);
  await b.walk(rootEl, {}, null);
  b.pFlush();
  return b.build(opt && opt.title);
}

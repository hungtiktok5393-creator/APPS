/* =====================================================================
 * Spelling Mastery – app.js
 * SPA tĩnh (GitHub Pages), Vanilla JS ES6+. Các module trong file:
 *  1. Tiện ích (Utils, toast, Modal)      7. Scoring (chấm điểm)
 *  2. Store & Settings                    8. API & Sync (Apps Script, hàng đợi)
 *  3. Parser & IO (nhập/xuất)             9. Views: Home, Run, Result, Assign
 *  4. Norm (chuẩn hóa đáp án)            10. Views: Settings, Stats, Export
 *  5. TTS (speechSynthesis)              11. Router & khởi động
 *  6. Sfx (Web Audio)
 * ===================================================================== */
(() => {
'use strict';

/* ===================== 1. TIỆN ÍCH ===================== */
const $ = (s, r = document) => r.querySelector(s);
/* Ghi đè replaceChildren để hành vi giống nhau trên mọi trình duyệt (kể cả bản cũ chưa có):
   bỏ qua null/false, nhận cả mảng lồng nhau (bản gốc sẽ in chữ "null"). */
Object.defineProperty(Element.prototype, 'replaceChildren', { configurable: true, writable: true, value: function () {
  while (this.firstChild) this.removeChild(this.firstChild);
  Array.prototype.slice.call(arguments).reduce((a, x) => a.concat(x), []).forEach(x => {
    if (x == null || x === false) return;
    this.appendChild(x.nodeType ? x : document.createTextNode(String(x)));
  });
} });

/** Tạo phần tử DOM: h('div', {class:'x', onclick:fn}, con1, con2...) – dùng textContent nên an toàn XSS */
function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, '');
    else e.setAttribute(k, v);
  }
  kids.flat(Infinity).forEach(c => { if (c == null || c === false) return; e.append(c.nodeType ? c : document.createTextNode(String(c))); });
  return e;
}
const uid = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));
const shortId = () => { const a = new Uint32Array(2); if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(a); else { a[0] = Math.random() * 4294967296; a[1] = Math.random() * 4294967296; } return (a[0].toString(36) + a[1].toString(36)).padEnd(10, '0').slice(0, 10); };
/** Fisher-Yates */
const shuffle = arr => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const fmtTime = ms => { const s = Math.round(ms / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const fmtDate = ts => ts ? new Date(ts).toLocaleString('vi-VN') : '—';
const toLocalInput = ts => new Date(ts - new Date(ts).getTimezoneOffset() * 60000).toISOString().slice(0, 16);
const loading = t => h('div', { class: 'center', role: 'status' }, h('div', { class: 'spinner' }), h('p', { class: 'muted', text: t || 'Đang tải…' }));
const errorPanel = (msg, extra) => h('div', { class: 'card stack', role: 'alert' }, h('h1', { text: 'Có lỗi xảy ra' }), h('p', { class: 'err', text: msg }), extra || h('a', { class: 'btn primary', href: '#/' }, 'Về trang chủ'));

function download(name, data, type) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: type || 'text/plain' });
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
async function copyText(text, inputEl) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch (_) { try { inputEl.select(); return document.execCommand('copy'); } catch (e) { return false; } }
}
/** Chống CSV/Excel injection: ô bắt đầu bằng = + - @ */
const safeCell = v => (typeof v === 'string' && /^[=+\-@]/.test(v)) ? "'" + v : v;

function toast(msg, type, action) {
  const t = h('div', { class: 'toast ' + (type || 'info'), role: type === 'error' ? 'alert' : 'status' }, h('span', { text: msg }));
  let timer;
  const close = () => { clearTimeout(timer); t.remove(); };
  if (action) t.append(h('button', { class: 'btn small', onclick: () => { action.onClick(); close(); } }, action.label));
  $('#toasts').append(t);
  timer = setTimeout(close, action ? 9000 : 4500);
}

const Modal = {
  open(title, body, onClose) {
    const tid = 'mt' + uid().slice(0, 6);
    const d = h('dialog', { class: 'modal', 'aria-labelledby': tid },
      h('div', { class: 'modal-head' }, h('h2', { id: tid, text: title }),
        h('button', { class: 'icon-btn', 'aria-label': 'Đóng hộp thoại', onclick: () => d.close() }, '✕')),
      h('div', { class: 'modal-body' }, body));
    d.addEventListener('close', () => { d.remove(); if (onClose) onClose(); });
    document.body.append(d);
    if (typeof d.showModal === 'function') d.showModal();
    else {
      d.classList.add('fallback'); d.setAttribute('open', '');
      d.close = () => { if (!d.hasAttribute('open')) return; d.removeAttribute('open'); d.dispatchEvent(new Event('close')); };
    }
    return d;
  },
  confirm(msg, okLabel, danger) {
    return new Promise(res => {
      let result = false;
      const d = Modal.open('Xác nhận', h('div', null, h('p', { text: msg }),
        h('div', { class: 'row end' },
          h('button', { class: 'btn', onclick: () => d.close() }, 'Hủy'),
          h('button', { class: 'btn ' + (danger ? 'danger' : 'primary'), onclick: () => { result = true; d.close(); } }, okLabel || 'Đồng ý'))),
        () => res(result));
    });
  }
};

/* ===================== 2. STORE & SETTINGS ===================== */
const Store = {
  get(k, d) { try { const v = localStorage.getItem('sm_' + k); return v ? JSON.parse(v) : d; } catch (_) { return d; } },
  set(k, v) {
    try { localStorage.setItem('sm_' + k, JSON.stringify(v)); return true; }
    catch (_) { toast('Không lưu được dữ liệu (bộ nhớ đầy hoặc trình duyệt chặn lưu trữ).', 'error'); return false; }
  }
};
const Settings = {
  data: null,
  load() {
    this.data = Object.assign({ scriptUrl: '', teacherKey: '', teacherOk: false, theme: 'auto', sfx: true, autoRead: true, autoSync: false }, Store.get('settings', {}));
    this.apply();
  },
  save(patch) { Object.assign(this.data, patch); Store.set('settings', this.data); this.apply(); },
  apply() {
    const t = this.data.theme;
    if (t === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
  }
};
const Sets = {
  list: [],
  load() { this.list = Store.get('sets', []); },
  save() { return Store.set('sets', this.list); },
  get(id) { return this.list.find(s => s.id === id); }
};
const newTts = () => ({ lang: 'en-US', voice: '', rate: 1 });

/* ===================== 4. NORM (chuẩn hóa đáp án) ===================== */
const Norm = {
  text: s => String(s == null ? '' : s).normalize('NFC')
    .replace(/[\u2018\u2019\u201B\u02BC]/g, "'").replace(/[\u201C\u201D]/g, '"')
    .replace(/\s+/g, ' ').trim(),
  eq(a, b) { return Norm.text(a).toLowerCase() === Norm.text(b).toLowerCase(); }
};

/* ===================== 3. PARSER & IO ===================== */
const Parser = {
  /** Trả về {cards, errors, warnings}. Dòng dạng "English - Tiếng Việt" */
  parse(text) {
    const cards = [], errors = [], warnings = [], seen = new Set();
    String(text || '').split(/\r?\n/).forEach((raw, i) => {
      const line = raw.replace(/\u00a0/g, ' ').trim();
      if (!line) return;
      let en, vi, m;
      if (line.includes('\t')) { const k = line.indexOf('\t'); en = line.slice(0, k); vi = line.slice(k + 1); }
      else if ((m = line.match(/^(.*?)\s+[-–—]\s+(.*)$/))) { en = m[1]; vi = m[2]; }   // chỉ tách ở " - " có khoảng trắng → giữ "well-known"
      else if (line.includes(',')) { const k = line.indexOf(','); en = line.slice(0, k); vi = line.slice(k + 1); }
      else { errors.push({ line: i + 1, text: line, msg: 'Thiếu dấu phân tách (dùng " - ", Tab hoặc dấu phẩy).' }); return; }
      en = Norm.text(en); vi = Norm.text(vi);
      if (!en) { errors.push({ line: i + 1, text: line, msg: 'Thiếu từ tiếng Anh.' }); return; }
      if (!vi) { errors.push({ line: i + 1, text: line, msg: 'Thiếu nghĩa tiếng Việt.' }); return; }
      if (en.length > 100 || vi.length > 200) { errors.push({ line: i + 1, text: line, msg: 'Dòng quá dài (tối đa 100 ký tự Anh / 200 ký tự Việt).' }); return; }
      const key = en.toLowerCase();
      if (seen.has(key)) warnings.push({ line: i + 1, text: line, msg: 'Từ bị trùng.' });
      seen.add(key);
      cards.push({ en, vi });
    });
    return { cards, errors, warnings };
  }
};
const IO = {
  rowsToText(rows) {
    let r = rows.filter(x => Array.isArray(x) && x.length && String(x[0] == null ? '' : x[0]).trim() !== '');
    if (r.length && /^(english|en|word|từ|từ vựng)$/i.test(String(r[0][0]).trim())) r = r.slice(1);
    const clean = v => String(v == null ? '' : v).replace(/[\t\r\n]+/g, ' ').trim();
    return r.map(c => c.length === 1 ? clean(c[0]) : clean(c[0]) + '\t' + clean(c[1])).join('\n');
  },
  /** Đọc file CSV / XLSX / TXT → text nhiều dòng */
  file(file) {
    return new Promise((resolve, reject) => {
      const name = file.name.toLowerCase();
      const readAs = (how, fn) => { const fr = new FileReader(); fr.onload = () => { try { resolve(fn(fr.result)); } catch (e) { reject(e); } }; fr.onerror = () => reject(fr.error); fr[how](file); };
      if (/\.(csv|tsv)$/.test(name)) {
        if (!window.Papa) return reject(new Error('Thư viện CSV chưa tải được – hãy kiểm tra kết nối mạng.'));
        Papa.parse(file, { skipEmptyLines: true, complete: r => resolve(IO.rowsToText(r.data)), error: e => reject(e) });
      } else if (/\.xlsx?$/.test(name)) {
        if (!window.XLSX) return reject(new Error('Thư viện Excel chưa tải được – hãy kiểm tra kết nối mạng.'));
        readAs('readAsArrayBuffer', buf => { const wb = XLSX.read(buf, { type: 'array' }); return IO.rowsToText(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' })); });
      } else if (/\.txt$/.test(name)) readAs('readAsText', t => t);
      else reject(new Error('Chỉ hỗ trợ .csv, .xlsx, .xls, .txt'));
    });
  },
  validateJSON(obj) {
    const errs = [];
    if (!obj || typeof obj !== 'object') return ['Tệp không phải đối tượng JSON hợp lệ.'];
    if (obj.version !== 1 && obj.version !== 2) errs.push('Trường "version" phải là 1 hoặc 2 (nhận: ' + obj.version + ').');
    if (!Array.isArray(obj.sets)) errs.push('Thiếu mảng "sets".');
    else obj.sets.forEach((s, i) => {
      if (!s || typeof s.name !== 'string' || !s.name.trim()) errs.push(`sets[${i}]: thiếu "name".`);
      if (!s || !Array.isArray(s.cards)) errs.push(`sets[${i}]: thiếu mảng "cards".`);
      else s.cards.forEach((c, j) => { if (!c || typeof c.en !== 'string' || !c.en.trim() || typeof c.vi !== 'string' || !c.vi.trim()) errs.push(`sets[${i}].cards[${j}]: cần "en" và "vi" là chuỗi không rỗng.`); });
    });
    return errs;
  },
  setFromJSON(s) {
    const t = s.tts || {};
    return { id: (typeof s.id === 'string' && /^[\w-]{3,64}$/.test(s.id)) ? s.id : uid(),   // giữ nguyên id để đồng bộ theo mã
      name: Norm.text(s.name).slice(0, 80), cards: s.cards.map(c => ({ en: Norm.text(c.en), vi: Norm.text(c.vi) })),
      tts: { lang: ['en-US', 'en-GB'].includes(t.lang) ? t.lang : 'en-US', voice: typeof t.voice === 'string' ? t.voice.slice(0, 200) : '', rate: clamp(Number(t.rate) || 1, 0.5, 1.5) },
      shuffle: !!s.shuffle, updatedAt: Number(s.updatedAt) || Date.now() };
  }
};
const SAMPLE_TEXT = [
  'well-known - nổi tiếng', 'airport - sân bay', 'luggage - hành lý', 'passport - hộ chiếu',
  'delicious - ngon', "it's a deal - đồng ý nhé", 'look forward to – mong đợi', 'make up your mind — quyết định'
].join('\n');

/* ===================== 5. TTS ===================== */
const TTS = {
  supported: 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window,
  voices: [],
  init() {
    if (!this.supported) return;
    const load = () => { this.voices = speechSynthesis.getVoices().filter(v => /^en/i.test(v.lang)); };
    load();
    if (speechSynthesis.addEventListener) speechSynthesis.addEventListener('voiceschanged', load);
    else speechSynthesis.onvoiceschanged = load;
  },
  norm: l => String(l || '').replace('_', '-').toLowerCase(),
  voicesFor(lang) { return this.voices.filter(v => this.norm(v.lang) === this.norm(lang)); },
  pick(cfg) {
    if (!this.supported) return null;
    const byName = cfg.voice && this.voices.find(v => v.voiceURI === cfg.voice);
    return byName || this.voicesFor(cfg.lang)[0] || null;      // null → trình duyệt dùng giọng mặc định theo utterance.lang
  },
  hasEnglish() { return this.voices.length > 0; },
  _t: null, _u: null,
  speak(text, cfg) {
    if (!this.supported) return false;
    cfg = cfg || newTts();
    clearTimeout(this._t);
    speechSynthesis.cancel();                                   // không phát chồng
    const u = new SpeechSynthesisUtterance(text);
    u.lang = cfg.lang || 'en-US';
    u.rate = clamp(Number(cfg.rate) || 1, 0.5, 1.5);
    const v = this.pick(cfg); if (v) u.voice = v;
    this._u = u;                                                // giữ tham chiếu (tránh bị GC trên Chrome)
    this._t = setTimeout(() => { try { speechSynthesis.resume(); speechSynthesis.speak(u); } catch (_) {} }, 80);
    return true;
  },
  cancel() { clearTimeout(this._t); if (this.supported) speechSynthesis.cancel(); }
};

/* ===================== 6. SFX (Web Audio) ===================== */
const Sfx = {
  ctx: null,
  ensure() {
    if (!this.ctx) { const C = window.AudioContext || window.webkitAudioContext; if (C) this.ctx = new C(); }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  },
  tone(freq, t0, dur, type, gain, freqEnd) {
    const c = this.ensure(); if (!c) return;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, c.currentTime + t0);
    if (freqEnd) o.frequency.linearRampToValueAtTime(freqEnd, c.currentTime + t0 + dur);
    g.gain.setValueAtTime(gain, c.currentTime + t0);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + t0 + dur);
    o.connect(g).connect(c.destination); o.start(c.currentTime + t0); o.stop(c.currentTime + t0 + dur + 0.02);
  },
  ting() { if (!Settings.data.sfx) return; this.tone(880, 0, .25, 'sine', .25); this.tone(1320, .09, .35, 'sine', .22); },
  oops() { if (!Settings.data.sfx) return; this.tone(260, 0, .3, 'sawtooth', .15, 140); }
};

/* ===================== 7. SCORING ===================== */
const Scoring = {
  /** Điểm từ = max(0, 10 − 2×(views−1)); views ≥ 5 → 0 */
  wordScore: views => views >= 5 ? 0 : Math.max(0, 10 - 2 * (views - 1)),
  /** Điểm bài = tổng điểm từng từ (mỗi từ tối đa 10) */
  total(words) { return words.reduce((s, w) => s + w.score, 0); },
  max(words) { return words.length * 10; },
  needsWork: w => w.wrongCount >= 1 || w.views >= 3
};

/* ===================== 8. API & SYNC ===================== */
/** Đóng gói dữ liệu vào link: lz-string → base64url (chỉ A-Z a-z 0-9 - _ nên Zalo/Messenger không làm hỏng) */
const Link = {
  pack(obj) { return LZString.compressToBase64(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); },
  unpack(t) { try { t = String(t).replace(/-/g, '+').replace(/_/g, '/'); while (t.length % 4) t += '='; return LZString.decompressFromBase64(t); } catch (_) { return null; } }
};
const API = {
  validUrl(u) { try { const x = new URL(u); return x.protocol === 'https:' && x.hostname === 'script.google.com' && x.pathname.endsWith('/exec'); } catch (_) { return false; } },
  async _fetch(url, opts) {
    const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 20000);
    try {
      const res = await fetch(url, Object.assign({ signal: ac.signal }, opts));
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } catch (e) {
      if (e.name === 'AbortError') throw new Error('Máy chủ phản hồi quá lâu (hết thời gian chờ).');
      if (e instanceof TypeError) throw new Error('Không kết nối được mạng hoặc URL Apps Script không đúng.');
      if (e instanceof SyntaxError) throw new Error('Máy chủ trả về dữ liệu không hợp lệ (kiểm tra lại cách Deploy: Anyone).');
      throw e;
    } finally { clearTimeout(t); }
  },
  /** POST dạng text/plain để tránh CORS preflight */
  post(url, body) { return this._fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) }); },
  get(url, params) { const u = new URL(url); Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v)); return this._fetch(u.toString()); }
};

const Sync = {
  listeners: new Set(), status: {}, busy: false,
  queue: () => Store.get('queue', []),
  emit(id, st, msg) { this.status[id] = { st, msg }; this.listeners.forEach(fn => fn(id)); },
  enqueue(item) { const q = this.queue(); q.push(item); Store.set('queue', q); this.emit(item.submissionId, 'sending'); this.flush(); },
  async flush() {
    if (this.busy) return; this.busy = true;
    try {
      for (const item of this.queue()) {
        this.emit(item.submissionId, 'sending');
        try {
          const r = await API.post(item.url, item.payload);
          if (r.ok) { this.remove(item.submissionId); this.emit(item.submissionId, 'sent'); }
          else if (['expired', 'max_attempts', 'bad_request', 'too_large'].includes(r.error)) { this.remove(item.submissionId); this.emit(item.submissionId, 'rejected', r.message || r.error); }
          else this.emit(item.submissionId, 'error', r.message || r.error || 'Lỗi máy chủ');
        } catch (e) { this.emit(item.submissionId, 'error', e.message); break; }   // mất mạng → dừng, thử lại sau
      }
    } finally { this.busy = false; }
  },
  remove(id) { Store.set('queue', this.queue().filter(x => x.submissionId !== id)); }
};

/** Chip trạng thái nộp bài (tự cập nhật) */
function statusChip(sid) {
  const el = h('span', { class: 'status', role: 'status' });
  let attached = false;
  const draw = () => {
    const s = Sync.status[sid] || { st: 'sending' };
    el.replaceChildren();
    if (s.st === 'sent') el.append(h('span', { class: 'ok', text: '✓ Đã nộp bài' }));
    else if (s.st === 'sending') el.append('⏳ Đang gửi…');
    else if (s.st === 'rejected') el.append(h('span', { class: 'err', text: '✗ Không nhận bài: ' + (s.msg || '') }));
    else el.append(h('span', { class: 'err', text: '⚠ Lỗi – chưa gửi được (' + (s.msg || 'không rõ') + ') ' }),
      h('button', { class: 'btn small', onclick: () => Sync.flush() }, 'Thử lại'));
  };
  const fn = () => {
    if (el.isConnected) attached = true; else if (attached) { Sync.listeners.delete(fn); return; }
    draw();
  };
  Sync.listeners.add(fn); draw();
  return el;
}

/* ===================== 8b. XUẤT / NHẬP / ĐỒNG BỘ data.json (version 2) ===================== */
/** Toàn bộ bộ từ + thiết lập. Teacher Key chỉ xuất khi được yêu cầu. */
function buildExport(includeKey) {
  const s = Settings.data;
  const settings = { theme: s.theme, sfx: s.sfx, autoRead: s.autoRead, scriptUrl: s.scriptUrl };
  if (includeKey) settings.teacherKey = s.teacherKey;
  return { app: 'spelling-mastery', version: 2, exportedAt: new Date().toISOString(), settings,
    sets: Sets.list.map(x => { const t = x.tts || newTts(); return { id: x.id, name: x.name, cards: x.cards, tts: { lang: t.lang, voice: t.voice || '', rate: t.rate }, shuffle: !!x.shuffle, updatedAt: x.updatedAt || 0 }; }) };
}
function applySettingsFrom(st) {
  const p = {}, cur = Settings.data;
  if (['auto', 'light', 'dark'].includes(st.theme)) p.theme = st.theme;
  if (typeof st.sfx === 'boolean') p.sfx = st.sfx;
  if (typeof st.autoRead === 'boolean') p.autoRead = st.autoRead;
  if (typeof st.scriptUrl === 'string' && (st.scriptUrl === '' || API.validUrl(st.scriptUrl))) p.scriptUrl = st.scriptUrl;
  if (typeof st.teacherKey === 'string') p.teacherKey = st.teacherKey;
  if ((p.scriptUrl !== undefined && p.scriptUrl !== cur.scriptUrl) || (p.teacherKey !== undefined && p.teacherKey !== cur.teacherKey)) p.teacherOk = false;
  Settings.save(p); renderNav();
}
/** mode: 'replace' = đồng bộ chính xác; 'merge' = gộp theo id (bản cũ hơn không đè bản mới) */
function applyData(obj, mode, withSettings) {
  const incoming = obj.sets.map(IO.setFromJSON);
  if (mode === 'replace') Sets.list = incoming;
  else incoming.forEach(n => {
    let i = Sets.list.findIndex(x => x.id === n.id);
    if (i < 0 && obj.version < 2) i = Sets.list.findIndex(x => x.name.toLowerCase() === n.name.toLowerCase());
    if (i < 0) Sets.list.push(n);
    else if (obj.version < 2) { const have = new Set(Sets.list[i].cards.map(c => c.en.toLowerCase())); n.cards.forEach(c => { if (!have.has(c.en.toLowerCase())) Sets.list[i].cards.push(c); }); }
    else if (n.updatedAt >= (Sets.list[i].updatedAt || 0)) Sets.list[i] = n;
  });
  Sets.save();
  if (withSettings && obj.settings && typeof obj.settings === 'object') applySettingsFrom(obj.settings);
}
const RepoSync = {
  url: () => new URL('data.json', location.href.split('#')[0]).href,
  applied: () => Store.get('sync', {}).applied || '',
  mark(iso) { Store.set('sync', { applied: iso, at: Date.now() }); },
  isNewer(d) { return !this.applied() || String(d.exportedAt || '') > this.applied(); },
  async fetchRemote() {
    const r = await fetch(this.url() + '?v=' + Date.now(), { cache: 'no-store' });   // ?v= để tránh cache CDN/trình duyệt
    if (r.status === 404) return { missing: true };
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();
    const errs = IO.validateJSON(data);
    if (errs.length) throw new Error('data.json không hợp lệ: ' + errs[0]);
    return { data };
  }
};
/** Kiểm tra data.json trên repo. manual = người dùng bấm nút; ngược lại chạy ngầm khi mở trang chủ */
async function repoCheck(o) {
  o = o || {};
  if (location.protocol === 'file:') { if (o.manual) toast('Đang mở bằng file:// nên không đọc được data.json. Hãy mở bản trên GitHub Pages hoặc chạy máy chủ cục bộ (python -m http.server).', 'error'); return; }
  try {
    const r = await RepoSync.fetchRemote();
    if (r.missing) { if (o.manual) toast('Repo chưa có tệp data.json.'); return; }
    const d = r.data;
    if (o.manual) return importDialog(d, { source: 'repo', onDone: o.onApplied });
    if (!RepoSync.isNewer(d)) return;
    if (Settings.data.autoSync && (RepoSync.applied() || !Sets.list.length)) {
      applyData(d, 'replace', true); RepoSync.mark(d.exportedAt); if (o.onApplied) o.onApplied(); toast(`Đã tự động đồng bộ ${d.sets.length} bộ từ từ data.json.`); return;
    }
    if (o.onOffer) o.onOffer(d);
  } catch (e) { if (o.manual) toast('Không đồng bộ được: ' + e.message, 'error'); }
}
function importDialog(obj, opts) {
  opts = opts || {};
  const hasSt = !!(obj.settings && typeof obj.settings === 'object');
  const cb = h('input', { type: 'checkbox', id: 'im-st', checked: true });
  const done = msg => { if (opts.source === 'repo' && obj.exportedAt) RepoSync.mark(obj.exportedAt); if (opts.onDone) opts.onDone(); toast(msg); };
  const d = Modal.open(opts.source === 'repo' ? 'Dữ liệu từ data.json' : 'Nhập JSON', h('div', { class: 'stack' },
    h('p', { text: `Tệp có ${obj.sets.length} bộ từ` + (obj.exportedAt ? ` (xuất lúc ${fmtDate(obj.exportedAt)})` : '') + `. Máy này đang có ${Sets.list.length} bộ.` }),
    hasSt ? h('label', { class: 'check', for: 'im-st' }, cb, 'Áp dụng cả thiết lập trong tệp') : null,
    h('div', { class: 'box', text: 'Gộp: thêm bộ mới, cập nhật bộ trùng (theo mã/tên), giữ lại bộ chỉ có trên máy này. Ghi đè: thay toàn bộ bộ từ trên máy bằng nội dung tệp (đồng bộ chính xác).' }),
    h('div', { class: 'row wrap' },
      h('button', { class: 'btn primary', onclick: () => { applyData(obj, 'merge', hasSt && cb.checked); d.close(); done('Đã gộp dữ liệu.'); } }, 'Gộp'),
      h('button', { class: 'btn danger', onclick: async () => { if (!await Modal.confirm('Ghi đè sẽ XÓA các bộ từ hiện có trên máy này và thay bằng nội dung tệp. Tiếp tục?', 'Ghi đè', true)) return; applyData(obj, 'replace', hasSt && cb.checked); d.close(); done('Đã ghi đè dữ liệu.'); } }, 'Ghi đè'),
      h('button', { class: 'btn', onclick: () => d.close() }, 'Hủy'))));
}
function importFile(input, onDone) {
  const f = input.files[0]; input.value = ''; if (!f) return;
  const fr = new FileReader();
  fr.onload = () => {
    let obj; try { obj = JSON.parse(fr.result); } catch (_) { return toast('Tệp JSON bị lỗi cú pháp.', 'error'); }
    const errs = IO.validateJSON(obj);
    if (errs.length) return Modal.open('Tệp JSON không hợp lệ', h('div', null, h('ul', null, errs.slice(0, 8).map(e => h('li', { text: e }))), errs.length > 8 ? h('p', { class: 'muted', text: `…và ${errs.length - 8} lỗi khác.` }) : null));
    importDialog(obj, { onDone });
  };
  fr.onerror = () => toast('Không đọc được tệp.', 'error');
  fr.readAsText(f);
}
function openExport() {
  const key = h('input', { type: 'checkbox', id: 'ex-key' });
  const d = Modal.open('Xuất JSON', h('div', { class: 'stack' },
    h('p', { text: `Tệp chứa ${Sets.list.length} bộ từ cùng thiết lập (giao diện, âm thanh, Apps Script URL).` }),
    h('label', { class: 'check', for: 'ex-key' }, key, 'Kèm Teacher Key'),
    h('div', { class: 'box warn', text: 'Không đưa tệp có Teacher Key lên repo công khai: ai cũng đọc được và xem được kết quả học sinh. Chỉ tick khi sao lưu riêng tư.' }),
    h('p', { class: 'hint', text: 'Để đồng bộ với GitHub: tải tệp data.json này lên thư mục gốc của repo (cùng chỗ với index.html).' }),
    h('div', { class: 'row end' }, h('button', { class: 'btn', onclick: () => d.close() }, 'Hủy'),
      h('button', { class: 'btn primary', onclick: () => { const data = buildExport(key.checked); download('data.json', JSON.stringify(data, null, 2), 'application/json'); RepoSync.mark(data.exportedAt); d.close(); toast('Đã tạo data.json.'); } }, '⬇ Tải data.json'))));
}

/* ===================== 9a. HOME VIEW ===================== */
function HomeView(root) {
  let offer = null, alive = true;   // offer: dữ liệu mới phát hiện trong data.json
  const banner = () => h('div', { class: 'box sync-banner', role: 'status' },
    h('p', { text: `Có bản dữ liệu mới trong data.json (${offer.sets.length} bộ từ` + (offer.exportedAt ? `, xuất lúc ${fmtDate(offer.exportedAt)}` : '') + ').' }),
    h('div', { class: 'row wrap' },
      h('button', { class: 'btn primary small', onclick: () => importDialog(offer, { source: 'repo', onDone: () => { offer = null; render(); } }) }, 'Xem & cập nhật'),
      h('button', { class: 'btn small', onclick: () => { offer = null; render(); } }, 'Để sau')));
  function render() {
    root.replaceChildren(
      h('div', { class: 'page-head' },
        h('h1', { text: 'Bộ từ vựng của tôi' }),
        h('div', { class: 'row wrap' },
          h('button', { class: 'btn primary', onclick: () => openEditor(null) }, '＋ Tạo bộ từ'),
          h('label', { class: 'btn', style: 'margin:0;cursor:pointer' }, '⬆ Nhập JSON',
            h('input', { type: 'file', accept: '.json,application/json', style: 'display:none', onchange: e => importFile(e.target, render) })),
          h('button', { class: 'btn', onclick: () => openExport() }, '⬇ Xuất JSON'),
          h('button', { class: 'btn', onclick: () => repoCheck({ manual: true, onApplied: render }) }, '⟳ Đồng bộ'))),
      offer ? banner() : null,
      Sets.list.length ? h('div', { class: 'grid' }, Sets.list.map(card))
        : h('div', { class: 'card empty' }, h('h2', { text: 'Chưa có bộ từ nào' }),
          h('p', { class: 'muted', text: 'Tạo bộ từ mới, nhập CSV/Excel, hoặc thử nhanh với 8 từ mẫu.' }),
          h('div', { class: 'row wrap', style: 'justify-content:center' },
            h('button', { class: 'btn primary', onclick: () => openEditor(null) }, '＋ Tạo bộ từ'),
            h('button', { class: 'btn', onclick: addSample }, 'Thêm dữ liệu mẫu'))));
  }
  function card(s) {
    s.tts = s.tts || newTts();
    return h('article', { class: 'card', 'aria-label': 'Bộ từ ' + s.name },
      h('h2', { text: s.name }),
      h('p', { class: 'muted small-text', text: `${s.cards.length} từ · ${s.tts.lang} · ${s.tts.rate}x${s.shuffle ? ' · trộn từ' : ''}` }),
      h('div', { class: 'actions' },
        h('a', { class: 'btn primary', href: '#/practice/' + s.id, 'aria-label': 'Làm thử bộ ' + s.name }, '▶ Làm thử'),
        h('button', { class: 'btn', onclick: () => openAssign(s) }, '📤 Giao bài'),
        h('button', { class: 'btn', onclick: () => openVoice(s) }, '🔊 Giọng đọc'),
        h('button', { class: 'btn', 'aria-pressed': String(!!s.shuffle), onclick: () => { s.shuffle = !s.shuffle; s.updatedAt = Date.now(); Sets.save(); render(); } }, '🔀 Trộn từ: ' + (s.shuffle ? 'Bật' : 'Tắt'))),
      h('div', { class: 'actions-2' },
        h('button', { class: 'btn small ghost', onclick: () => openEditor(s) }, '✎ Sửa'),
        h('button', { class: 'btn small ghost', onclick: () => remove(s) }, '🗑 Xóa')));
  }
  function addSample() {
    const { cards } = Parser.parse(SAMPLE_TEXT);
    Sets.list.push({ id: uid(), name: 'Từ vựng mẫu – Du lịch', cards, tts: newTts(), shuffle: false, updatedAt: Date.now() });
    Sets.save(); render(); toast('Đã thêm bộ từ mẫu (8 từ).');
  }
  async function remove(s) {
    if (!await Modal.confirm(`Xóa bộ từ "${s.name}" (${s.cards.length} từ)?`, 'Xóa', true)) return;
    const idx = Sets.list.indexOf(s);
    Sets.list.splice(idx, 1); Sets.save(); render();
    toast('Đã xóa bộ từ.', 'info', { label: 'Hoàn tác', onClick: () => { Sets.list.splice(Math.min(idx, Sets.list.length), 0, s); Sets.save(); render(); } });
  }
  /* --- Soạn / sửa bộ từ --- */
  function openEditor(s) {
    const name = h('input', { type: 'text', id: 'ed-name', maxlength: 80, value: s ? s.name : '', autocomplete: 'off' });
    const ta = h('textarea', { id: 'ed-text', 'aria-describedby': 'ed-help', spellcheck: 'false', placeholder: 'well-known - nổi tiếng\nairport - sân bay' });
    ta.value = s ? s.cards.map(c => c.en + ' - ' + c.vi).join('\n') : '';
    const info = h('div', { 'aria-live': 'polite' });
    const saveBtn = h('button', { class: 'btn primary', onclick: save }, 'Lưu');
    const upd = () => {
      const r = Parser.parse(ta.value);
      info.replaceChildren(
        h('p', { class: r.cards.length ? 'ok' : 'muted', text: `✓ ${r.cards.length} từ hợp lệ` + (r.warnings.length ? ` · ${r.warnings.length} từ trùng` : '') }),
        r.errors.length ? h('div', { class: 'box error' }, h('strong', { text: `${r.errors.length} dòng lỗi (sẽ bị bỏ qua):` }),
          h('ul', null, r.errors.slice(0, 6).map(e => h('li', { text: `Dòng ${e.line}: ${e.msg} → "${e.text.slice(0, 40)}"` })))) : null);
      return r;
    };
    ta.addEventListener('input', upd);
    const file = h('input', { type: 'file', id: 'ed-file', accept: '.csv,.tsv,.xlsx,.xls,.txt', onchange: async e => {
      const f = e.target.files[0]; if (!f) return;
      try { const t = await IO.file(f); ta.value = (ta.value.trim() ? ta.value.trim() + '\n' : '') + t; if (!name.value.trim()) name.value = f.name.replace(/\.[^.]+$/, ''); upd(); toast('Đã đọc tệp – hãy kiểm tra rồi bấm Lưu.'); }
      catch (err) { toast('Lỗi đọc tệp: ' + err.message, 'error'); }
      e.target.value = '';
    } });
    const d = Modal.open(s ? 'Sửa bộ từ' : 'Tạo bộ từ', h('div', null,
      h('label', { for: 'ed-name', text: 'Tên bộ từ' }), name,
      h('label', { for: 'ed-text', text: 'Danh sách từ (mỗi dòng: English - Tiếng Việt)' }), ta,
      h('p', { id: 'ed-help', class: 'hint', text: 'Tách ở " - " (có khoảng trắng), dấu – —, Tab hoặc dấu phẩy. "well-known - nổi tiếng" vẫn đúng. Có thể dán từ Excel (2 cột).' }),
      h('label', { for: 'ed-file', text: 'Hoặc tải CSV / Excel (2 cột)' }), file, info,
      h('div', { class: 'row end' }, h('button', { class: 'btn', onclick: () => d.close() }, 'Hủy'), saveBtn)));
    upd(); name.focus();
    async function save() {
      const r = upd(); const nm = Norm.text(name.value);
      if (!nm) return toast('Hãy nhập tên bộ từ.', 'error');
      if (!r.cards.length) return toast('Chưa có từ hợp lệ nào.', 'error');
      if (r.errors.length && !await Modal.confirm(`Có ${r.errors.length} dòng lỗi sẽ bị bỏ qua. Vẫn lưu ${r.cards.length} từ hợp lệ?`, 'Vẫn lưu')) return;
      if (s) { s.name = nm; s.cards = r.cards; s.updatedAt = Date.now(); }
      else Sets.list.unshift({ id: uid(), name: nm, cards: r.cards, tts: newTts(), shuffle: false, updatedAt: Date.now() });
      if (Sets.save()) { d.close(); render(); toast('Đã lưu bộ từ.'); }
    }
  }

  /* --- Giọng đọc --- */
  function openVoice(s) {
    if (!TTS.supported) return Modal.open('Giọng đọc', h('p', { class: 'err', text: 'Trình duyệt này không hỗ trợ đọc văn bản (speechSynthesis). Hãy dùng Chrome, Edge hoặc Safari bản mới.' }));
    const t = s.tts = s.tts || newTts();
    const lang = h('select', { id: 'v-lang', onchange: () => { t.lang = lang.value; t.voice = ''; fill(); } },
      ['en-US', 'en-GB'].map(l => h('option', { value: l, selected: l === t.lang }, l === 'en-US' ? 'Tiếng Anh – Mỹ (en-US)' : 'Tiếng Anh – Anh (en-GB)')));
    const voice = h('select', { id: 'v-voice', onchange: () => { t.voice = voice.value; } });
    const note = h('div', { 'aria-live': 'polite' });
    const rateOut = h('output', { for: 'v-rate', text: t.rate + 'x' });
    const rate = h('input', { type: 'range', id: 'v-rate', min: .5, max: 1.5, step: .1, value: t.rate, oninput: () => { t.rate = Number(rate.value); rateOut.textContent = t.rate + 'x'; } });
    function fill() {
      const list = TTS.voicesFor(t.lang);
      voice.replaceChildren(h('option', { value: '' }, 'Tự động (mặc định của thiết bị)'), list.map(v => h('option', { value: v.voiceURI, selected: v.voiceURI === t.voice }, v.name)));
      note.replaceChildren(list.length ? null : h('div', { class: 'box warn', text: TTS.hasEnglish()
        ? `Thiết bị không có giọng ${t.lang}; sẽ dùng giọng tiếng Anh khác hoặc mặc định.`
        : 'Thiết bị chưa có giọng tiếng Anh (hoặc đang tải danh sách). Hãy cài giọng trong cài đặt hệ điều hành; ứng dụng sẽ dùng giọng mặc định nếu có.' }));
    }
    const d = Modal.open('Giọng đọc – ' + s.name, h('div', null,
      h('label', { for: 'v-lang', text: 'Giọng' }), lang, h('label', { for: 'v-voice', text: 'Voice cụ thể' }), voice, note,
      h('label', { for: 'v-rate' }, 'Tốc độ: ', rateOut), rate,
      h('div', { class: 'row end' },
        h('button', { class: 'btn', onclick: () => TTS.speak(s.cards[0] ? s.cards[0].en : 'Spelling Mastery', t) }, '▶ Nghe thử'),
        h('button', { class: 'btn primary', onclick: () => d.close() }, 'Xong'))),
      () => { s.updatedAt = Date.now(); Sets.save(); render(); });
    fill();
    setTimeout(fill, 600);      // voices có thể nạp muộn
  }

  /* --- Giao bài --- */
  function openAssign(s) {
    const due = h('input', { type: 'datetime-local', id: 'a-due', value: toLocalInput(Date.now() + 7 * 864e5) });
    const max = h('input', { type: 'number', id: 'a-max', min: 0, max: 20, value: 0 });
    const req = h('input', { type: 'checkbox', id: 'a-req', checked: true });
    const out = h('div', { 'aria-live': 'polite', class: 'stack' });
    const go = h('button', { class: 'btn primary', onclick: create }, 'Tạo link giao bài');
    Modal.open('Giao bài – ' + s.name, h('div', null,
      h('label', { for: 'a-due', text: 'Hạn nộp (giờ máy bạn)' }), due,
      h('label', { for: 'a-max', text: 'Số lần làm tối đa (0 = không giới hạn)' }), max,
      h('label', { class: 'check', for: 'a-req' }, req, 'Bắt buộc nhập Họ tên và Lớp'),
      h('div', { class: 'row end' }, go), out));
    async function create() {
      const dueMs = new Date(due.value).getTime();
      if (!dueMs || dueMs <= Date.now()) return out.replaceChildren(h('p', { class: 'err', text: 'Hạn nộp phải ở tương lai.' }));
      if (!window.LZString) return out.replaceChildren(h('p', { class: 'err', text: 'Thư viện nén (lz-string) chưa tải được – kiểm tra mạng rồi thử lại.' }));
      go.disabled = true; out.replaceChildren(loading('Đang tạo link…'));
      const st = Settings.data, url = st.scriptUrl, canSheet = API.validUrl(url) && !!st.teacherKey;
      const a = { id: shortId(), name: s.name, words: s.cards, tts: { lang: s.tts.lang, rate: s.tts.rate }, due: dueMs, shuffle: !!s.shuffle, max: clamp(parseInt(max.value, 10) || 0, 0, 20), req: req.checked };
      const payload = { v: 1, id: a.id, n: a.name, w: a.words.map(c => [c.en, c.vi]), t: { l: a.tts.lang, r: a.tts.rate }, due: a.due, sh: a.shuffle ? 1 : 0, max: a.max, req: a.req ? 1 : 0, u: API.validUrl(url) ? url : '' };
      const base = location.href.split('#')[0];
      let link = base + '#/assign?d=' + Link.pack(payload);
      let mode = 'inline', notes = [];
      if (link.length > 2000) {
        if (canSheet) {
          try { const r = await API.post(url, { action: 'saveAssignment', teacherKey: st.teacherKey, assignment: a }); if (!r.ok) throw new Error(r.message || r.error);
            link = base + '#/assign?id=' + a.id + '&s=' + encodeURIComponent(url); mode = 'sheet'; }
          catch (e) { mode = 'inline-long'; notes.push('Không lưu được bộ từ lên Google Sheet (' + e.message + '). Đang dùng link dài.'); }
        } else { mode = 'inline-long'; notes.push('Link dài hơn 2000 ký tự. Hãy cấu hình Apps Script URL + Teacher Key trong Cài đặt để dùng link ngắn (lưu bộ từ lên Sheet).'); }
      } else if (canSheet) {   // đăng ký hạn nộp / số lần ở máy chủ (nguồn quyết định), không gửi danh sách từ
        try { const r = await API.post(url, { action: 'saveAssignment', teacherKey: st.teacherKey, assignment: Object.assign({}, a, { words: null }) }); if (!r.ok) throw new Error(r.message || r.error); }
        catch (e) { notes.push('Chưa đăng ký hạn nộp lên máy chủ (' + e.message + '). Máy chủ sẽ dùng hạn nộp trong link.'); }
      } else notes.push('Chưa cấu hình Apps Script: học sinh làm được bài nhưng kết quả sẽ không được ghi về Sheet.');
      const box = h('textarea', { readonly: true, 'aria-label': 'Link giao bài', style: 'min-height:90px;font-size:.8rem', onfocus: e => e.target.select() });
      box.value = link;
      const canvas = h('canvas', { 'aria-label': 'Mã QR của link giao bài', role: 'img' });
      out.replaceChildren(
        h('p', { class: 'ok', text: mode === 'sheet' ? '✓ Link ngắn (bộ từ đã lưu trên Google Sheet).' : '✓ Link chứa toàn bộ dữ liệu bài.' }),
        h('p', { class: 'hint', text: `Độ dài link: ${link.length} ký tự · Hạn: ${fmtDate(dueMs)}` }),
        ...notes.map(n => h('div', { class: 'box warn', text: n })),
        box,
        h('div', { class: 'row wrap' },
          h('button', { class: 'btn primary', onclick: async () => toast(await copyText(link, box) ? 'Đã sao chép link.' : 'Không sao chép được – hãy chọn và copy thủ công.') }, '📋 Copy link'),
          h('button', { class: 'btn', onclick: () => { try { download('qr-' + a.id + '.png', new Blob([Uint8Array.from(atob(canvas.toDataURL('image/png').split(',')[1]), c => c.charCodeAt(0))], { type: 'image/png' })); } catch (_) { toast('Không tải được QR.', 'error'); } } }, '⬇ Tải QR (PNG)')),
        h('div', { class: 'qr' }, canvas));
      if (window.QRCode) QRCode.toCanvas(canvas, link, { width: 260, margin: 2, errorCorrectionLevel: 'L' }, err => { if (err) { canvas.replaceWith(h('p', { class: 'err', text: 'Link quá dài để tạo mã QR. Hãy dùng link ngắn qua Google Sheet.' })); } });
      else canvas.replaceWith(h('p', { class: 'err', text: 'Thư viện QR chưa tải được.' }));
      go.disabled = false;
    }
  }
  render();
  repoCheck({ manual: false, onApplied: () => { if (alive) render(); }, onOffer: d => { if (alive) { offer = d; render(); } } });
  return { destroy() { alive = false; } };
}

/* ===================== 9b. RUN VIEW (state machine) ===================== */
/** 3 trạng thái cho mỗi từ: SHOW → TYPE ⇄ RECALL */
const TRANSITIONS = { SHOW: { advance: 'TYPE' }, TYPE: { forget: 'RECALL' }, RECALL: { advance: 'TYPE' } };

function RunView(root, cfg) {
  const words = cfg.words.map(w => ({ en: w.en, vi: w.vi, views: 1, wrongCount: 0, timeMs: 0 }));
  const tts = cfg.tts || newTts();
  const S = { idx: 0, state: 'SHOW', started: false, paused: false, hidden: document.hidden, locked: false, combo: 0, tickAt: 0, totalMs: 0 };
  let readTimer = null, nextTimer = null, uiTimer = null, destroyed = false, draft = '';

  const isRunning = () => S.started && !S.paused && !S.hidden && !S.locked && !destroyed;
  /** Cộng dồn thời gian: chỉ tính khi đang chạy (không Pause / tab ẩn / đang khóa) */
  function accrue() {
    const now = performance.now();
    if (S.tickAt) { const d = now - S.tickAt; words[S.idx].timeMs += d; S.totalMs += d; }
    S.tickAt = isRunning() ? now : 0;
  }
  function set(patch) { accrue(); Object.assign(S, patch); accrue(); }

  /* Âm thanh đọc từ */
  const stopRead = () => { clearInterval(readTimer); readTimer = null; };
  const speakNow = () => { if (isRunning() && Settings.data.autoRead) TTS.speak(words[S.idx].en, tts); };
  function startRead() { stopRead(); if (!Settings.data.autoRead || !isRunning()) return; speakNow(); readTimer = setInterval(speakNow, 3000); }

  /* DOM cố định */
  const hudPos = h('span', { class: 'pill' }), hudTime = h('span', { class: 'pill', 'aria-label': 'Thời gian' }), hudCombo = h('span', { class: 'pill', 'aria-live': 'polite' });
  const bar = h('span'), stage = h('div', { class: 'stage' });
  const sfxBtn = h('button', { class: 'btn small', onclick: () => { Settings.save({ sfx: !Settings.data.sfx }); drawHud(); } });
  const readBtn = h('button', { class: 'btn small', onclick: () => { Settings.save({ autoRead: !Settings.data.autoRead }); if (Settings.data.autoRead) startRead(); else { stopRead(); TTS.cancel(); } drawHud(); } });
  const pauseBtn = h('button', { class: 'btn small', onclick: () => togglePause() });
  const hud = h('div', { class: 'hud' }, h('div', { class: 'grp' }, hudPos, hudTime, hudCombo), h('div', { class: 'grp' }, sfxBtn, readBtn, pauseBtn));
  root.replaceChildren(h('div', { class: 'run' }, h('h1', { class: 'small-text muted', text: cfg.title }), hud, h('div', { class: 'progress', role: 'progressbar', 'aria-label': 'Tiến độ' }, bar), stage));

  function drawHud() {
    hudPos.textContent = S.started ? `Từ ${S.idx + 1}/${words.length}` : `${words.length} từ`;
    hudTime.textContent = '⏱ ' + fmtTime(S.totalMs + (S.tickAt ? performance.now() - S.tickAt : 0));
    hudCombo.textContent = S.combo >= 3 ? `🔥 Combo x${S.combo}` : '';
    hudCombo.style.display = S.combo >= 3 ? '' : 'none';
    bar.style.width = (S.started ? S.idx / words.length * 100 : 0) + '%';
    sfxBtn.textContent = Settings.data.sfx ? '🔔 Hiệu ứng: Bật' : '🔕 Hiệu ứng: Tắt'; sfxBtn.setAttribute('aria-pressed', String(Settings.data.sfx));
    readBtn.textContent = Settings.data.autoRead ? '🗣 Tự đọc: Bật' : '🗣 Tự đọc: Tắt'; readBtn.setAttribute('aria-pressed', String(Settings.data.autoRead));
    pauseBtn.textContent = S.paused ? '▶ Tiếp tục' : '⏸ Tạm dừng (Esc)';
    pauseBtn.style.display = S.started ? '' : 'none';
  }

  function renderIntro() {
    stage.replaceChildren(h('div', { class: 'overlay-card' },
      h('h2', { text: cfg.title }),
      h('p', { class: 'muted', text: `${words.length} từ. Nghe – nhìn – rồi gõ lại đúng chính tả.` }),
      !TTS.supported ? h('div', { class: 'box warn', text: 'Trình duyệt không hỗ trợ đọc văn bản – bạn vẫn làm bài được nhưng sẽ không nghe thấy từ.' })
        : (!TTS.hasEnglish() ? h('div', { class: 'box warn', text: 'Thiết bị chưa có giọng tiếng Anh riêng; sẽ dùng giọng mặc định.' }) : null),
      h('p', { class: 'hint' }, h('kbd', null, 'Space'), '/bấm = ẩn từ · ', h('kbd', null, 'Enter'), ' = nộp · ', h('kbd', null, 'Tab'), ' = quên · ', h('kbd', null, 'Esc'), ' = tạm dừng'),
      h('button', { class: 'btn primary big', onclick: start }, '▶ Bắt đầu')));
  }
  function start() { Sfx.ensure(); set({ started: true }); render(); startRead(); }

  function render() {
    drawHud();
    if (!S.started) return renderIntro();
    const w = words[S.idx];
    stage.replaceChildren();
    if (S.paused) {
      stage.append(h('div', { class: 'overlay-card' }, h('h2', { text: '⏸ Đã tạm dừng' }), h('p', { class: 'muted', text: 'Đồng hồ đã dừng.' }),
        h('button', { class: 'btn primary big', onclick: () => togglePause() }, '▶ Tiếp tục')));
      return;
    }
    const listen = h('button', { class: 'btn', onclick: () => TTS.speak(w.en, tts) }, '🔊 Nghe lại');
    if (S.state === 'SHOW' || S.state === 'RECALL') {
      stage.append(h('div', { class: 'word-card' },
        h('p', { class: 'label', text: S.state === 'SHOW' ? 'Ghi nhớ từ này' : `Xem lại (lần xem thứ ${w.views})` }),
        h('p', { class: 'en', lang: 'en', text: w.en }), h('p', { class: 'vi', lang: 'vi', text: w.vi }),
        h('div', { class: 'row wrap', style: 'justify-content:center' },
          h('button', { class: 'btn primary big', onclick: () => dispatch('advance') }, 'Ẩn từ & gõ lại (Space)'), listen)));
    } else {
      const input = h('input', { type: 'text', id: 'ans', 'aria-label': 'Gõ lại từ tiếng Anh', autocomplete: 'off', autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false', enterkeyhint: 'done', value: draft,
        oninput: e => { draft = e.target.value; } });
      const fb = h('div', { class: 'feedback', 'aria-live': 'assertive', id: 'fb' });
      stage.append(h('div', { class: 'word-card' },
        h('p', { class: 'label', text: 'Gõ từ tiếng Anh bạn vừa nghe/nhớ' }),
        h('p', { class: 'vi', lang: 'vi', text: w.vi }),
        h('form', { class: 'type-form', onsubmit: e => { e.preventDefault(); submit(); } }, input, fb,
          h('div', { class: 'row wrap', style: 'justify-content:center' },
            h('button', { type: 'submit', class: 'btn primary' }, 'Nộp (Enter)'),
            h('button', { type: 'button', class: 'btn', onclick: () => dispatch('forget') }, 'Quên / Xem lại (Tab)'), listen)),
        h('p', { class: 'hint' }, 'Space là ký tự thường · ', h('kbd', null, 'Tab'), ' hoặc ', h('kbd', null, 'Ctrl'), '+', h('kbd', null, 'Space'), ' = Quên · ', h('kbd', null, 'Esc'), ' = tạm dừng')));
      input.focus();
      setTimeout(() => { if (input.isConnected && document.activeElement === input) { try { input.scrollIntoView({ block: 'center' }); } catch (_) {} } }, 300);
    }
  }

  /** Máy trạng thái tường minh */
  function dispatch(evt) {
    if (!S.started || S.paused || S.locked || destroyed) return;
    const to = TRANSITIONS[S.state][evt]; if (!to) return;
    if (to === 'RECALL') words[S.idx].views++;          // mỗi lần vào RECALL: +1 lượt xem
    if (to === 'TYPE') draft = '';                       // ô input rỗng
    set({ state: to }); render();
  }
  function submit() {
    if (S.locked || S.state !== 'TYPE' || S.paused) return;
    const input = $('#ans', stage); if (!input || !input.value.trim()) return;
    const w = words[S.idx], fb = $('#fb', stage);
    if (Norm.eq(input.value, w.en)) {
      set({ locked: true, combo: S.combo + 1 });
      stopRead(); TTS.cancel(); Sfx.ting();
      input.disabled = true; fb.className = 'feedback good'; fb.textContent = '✓ Chính xác!';
      drawHud();
      nextTimer = setTimeout(next, 600);
    } else {
      w.wrongCount++; S.combo = 0; Sfx.oops(); drawHud();
      input.classList.remove('shake'); void input.offsetWidth; input.classList.add('shake');
      fb.className = 'feedback bad'; fb.textContent = 'Oops! Thử lại nhé'; input.select();
    }
  }
  function next() {
    if (destroyed) return;
    if (S.idx + 1 >= words.length) return finish();
    draft = ''; set({ idx: S.idx + 1, state: 'SHOW', locked: false });
    render(); startRead();
  }
  function togglePause() {
    if (!S.started) return;
    set({ paused: !S.paused });
    if (S.paused) { stopRead(); TTS.cancel(); } else startRead();
    render();
  }
  function finish() {
    accrue(); stopRead(); TTS.cancel();
    const out = words.map(w => ({ word: w.en, views: w.views, wrongCount: w.wrongCount, score: Scoring.wordScore(w.views), timeMs: Math.round(w.timeMs) }));
    cfg.onFinish({ words: out, score: Scoring.total(out), maxScore: Scoring.max(out), totalMs: Math.round(S.totalMs) });
  }

  /* Phím tắt */
  function onKey(e) {
    if (!S.started) return;
    if (e.key === 'Escape') { e.preventDefault(); togglePause(); return; }
    if (S.paused || S.locked) return;
    if (S.state === 'TYPE') {      // Space là ký tự thường
      if ((e.key === 'Tab' && !e.shiftKey) || (e.ctrlKey && e.code === 'Space')) { e.preventDefault(); dispatch('forget'); }
      return;
    }
    if ((e.code === 'Space' || e.key === 'Enter') && !e.target.closest('button,a,input,textarea,select')) { e.preventDefault(); dispatch('advance'); }
  }
  function onVis() {   // tab ẩn: dừng đồng hồ + giọng đọc
    set({ hidden: document.hidden });
    if (document.hidden) { stopRead(); TTS.cancel(); } else startRead();
  }
  stage.addEventListener('click', e => { if (e.target.closest('button,input,form')) return; if (S.started && (S.state === 'SHOW' || S.state === 'RECALL')) dispatch('advance'); });
  document.addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', onVis);
  uiTimer = setInterval(() => { if (S.started && !S.paused) drawHud(); }, 250);
  render();

  return { destroy() {   // dọn dẹp: interval, timeout, listener, giọng đọc
    destroyed = true; stopRead(); clearInterval(uiTimer); clearTimeout(nextTimer);
    document.removeEventListener('keydown', onKey); document.removeEventListener('visibilitychange', onVis); TTS.cancel();
  } };
}

/* ===================== 9c. RESULT VIEW & FLOW ===================== */
function ResultView(root, o) {
  const r = o.res, weak = r.words.filter(Scoring.needsWork);
  const viMap = new Map(o.words.map(w => [w.en, w.vi]));
  root.replaceChildren(h('div', { class: 'stack' },
    h('h1', { text: 'Kết quả – ' + o.title }),
    h('div', { class: 'card row wrap', style: 'justify-content:space-around;text-align:center' },
      h('div', null, h('div', { class: 'score-big', text: r.score + '/' + r.maxScore }), h('div', { class: 'muted', text: 'Tổng điểm (mỗi từ tối đa 10)' })),
      h('div', null, h('div', { class: 'score-big', style: 'font-size:2.2rem', text: fmtTime(r.totalMs) }), h('div', { class: 'muted', text: 'Tổng thời gian' }))),
    o.mode === 'assign' ? h('div', { class: 'card' }, o.status) : h('div', { class: 'box', text: 'Chế độ làm thử – kết quả không được gửi đi.' }),
    h('div', { class: 'card' }, h('h2', { text: 'Điểm từng từ' }),
      h('div', { class: 'chart', role: 'img', 'aria-label': 'Biểu đồ điểm từng từ' }, r.words.map(w => h('div', { class: 'bar' + (w.score < 6 ? ' low' : ''), title: `${w.word}: ${w.score}`, style: `height:${Math.max(4, w.score * 10)}%` })))),
    h('div', { class: 'card' }, h('h2', { text: `Cần cải thiện (${weak.length})` }),
      weak.length ? h('div', { class: 'chips' }, weak.map(w => h('span', { class: 'chip', text: w.word }))) : h('p', { class: 'ok', text: '🎉 Không có từ nào cần cải thiện!' })),
    h('div', { class: 'table-wrap' }, h('table', null, h('caption', { class: 'center muted', text: 'Chi tiết từng từ' }),
      h('thead', null, h('tr', null, ['Từ', 'Lượt xem', 'Gõ sai', 'Điểm', 'Thời gian'].map((t, i) => h('th', { class: i ? 'num' : '', scope: 'col', text: t })))),
      h('tbody', null, r.words.map(w => h('tr', null, h('td', { text: w.word }), h('td', { class: 'num', text: w.views }), h('td', { class: 'num', text: w.wrongCount }), h('td', { class: 'num', text: w.score }), h('td', { class: 'num', text: (w.timeMs / 1000).toFixed(1) + 's' })))))),
    h('div', { class: 'row wrap' },
      h('button', { class: 'btn primary', disabled: !weak.length, onclick: () => o.onRetry(weak.map(w => ({ en: w.word, vi: viMap.get(w.word) || '' }))) }, '↻ Làm lại chỉ các từ yếu'),
      h('button', { class: 'btn', onclick: () => o.onRetry(o.words) }, o.mode === 'assign' ? 'Làm thử lại (không tính điểm)' : 'Làm lại tất cả'),
      o.backHref ? h('a', { class: 'btn', href: o.backHref }, 'Về trang chủ') : null)));
  window.scrollTo(0, 0);
}
/** Điều phối: chạy bài → kết quả → làm lại từ yếu */
function runFlow(root, cfg) {
  let cur = null;
  const begin = (words, mode) => {
    if (cur) cur.destroy();
    const list = cfg.shuffle ? shuffle(words) : words.slice();
    cur = RunView(root, { title: cfg.title, words: list, tts: cfg.tts, onFinish: res => {
      cur.destroy(); cur = null;
      ResultView(root, { res, title: cfg.title, mode, words: cfg.words, backHref: cfg.backHref, status: mode === 'assign' ? cfg.onAssignFinish(res) : null, onRetry: ws => begin(ws, 'practice') });
    } });
  };
  begin(cfg.words, cfg.mode);
  return { destroy() { if (cur) cur.destroy(); } };
}
function PracticeView(root, id) {
  const s = Sets.get(id);
  if (!s) { root.replaceChildren(errorPanel('Không tìm thấy bộ từ này (có thể đã bị xóa).')); return {}; }
  return runFlow(root, { title: s.name, words: s.cards, tts: s.tts, shuffle: s.shuffle, mode: 'practice', backHref: '#/' });
}

/* ===================== 9d. ASSIGN VIEW (học sinh) ===================== */
function decodeAssignment(d) {
  let p;
  try {
    const json = Link.unpack(d) || LZString.decompressFromEncodedURIComponent(d);   // link cũ vẫn đọc được
    if (!json) throw new Error('empty');
    p = JSON.parse(json);
    if (p.v !== 1 || !Array.isArray(p.w) || !p.w.length || !p.id) throw new Error('schema');
    p.w.forEach(x => { if (typeof x[0] !== 'string' || typeof x[1] !== 'string') throw new Error('schema'); });
  } catch (_) { throw new Error('Link bài tập bị hỏng hoặc không giải nén được. Hãy xin giáo viên gửi lại link đầy đủ (link có thể đã bị cắt khi sao chép).'); }
  return { id: String(p.id), name: String(p.n || 'Bài chính tả'), words: p.w.map(x => ({ en: x[0], vi: x[1] })), tts: { lang: (p.t && p.t.l) || 'en-US', voice: '', rate: clamp(Number(p.t && p.t.r) || 1, .5, 1.5) },
    due: Number(p.due) || 0, shuffle: !!p.sh, max: Number(p.max) || 0, req: !!p.req, scriptUrl: p.u || '' };
}
async function loadAssignment(q) {
  if (q.d) {
    if (!window.LZString) throw new Error('Thư viện giải nén chưa tải được – hãy kiểm tra kết nối mạng và tải lại trang.');
    return decodeAssignment(q.d);
  }
  if (q.id && q.s) {
    if (!API.validUrl(q.s)) throw new Error('Link không hợp lệ: địa chỉ máy chủ không đúng.');
    const r = await API.get(q.s, { action: 'getAssignment', id: q.id });
    if (!r.ok) throw new Error(r.error === 'not_found' ? 'Không tìm thấy bài tập này trên máy chủ (mã sai hoặc đã bị xóa).' : (r.message || 'Không tải được bài tập.'));
    const a = r.assignment;
    if (!a.words || !a.words.length) throw new Error('Bài tập chưa có danh sách từ.');
    return { id: a.id, name: a.name, words: a.words, tts: { lang: (a.tts && a.tts.lang) || 'en-US', voice: '', rate: clamp(Number(a.tts && a.tts.rate) || 1, .5, 1.5) }, due: Number(a.due) || 0, shuffle: !!a.shuffle, max: Number(a.max) || 0, req: !!a.req, scriptUrl: q.s };
  }
  throw new Error('Link thiếu dữ liệu bài tập. Hãy kiểm tra lại đường dẫn.');
}
function AssignView(root, q) {
  let timer = null, flow = null, dead = false;
  root.replaceChildren(loading('Đang tải bài tập…'));
  (async () => {
    let a;
    try { a = await loadAssignment(q); } catch (e) { if (!dead) root.replaceChildren(errorPanel(e.message, h('button', { class: 'btn primary', onclick: () => location.reload() }, 'Thử lại'))); return; }
    if (!dead) gate(a);
  })();

  function gate(a) {
    const stu = Store.get('student', { name: '', cls: '' });
    const attempts = () => (Store.get('attempts', {})[a.id] || 0);
    const name = h('input', { type: 'text', id: 's-name', maxlength: 60, autocomplete: 'name', value: stu.name, 'aria-describedby': 's-err' });
    const cls = h('input', { type: 'text', id: 's-cls', maxlength: 20, autocomplete: 'off', value: stu.cls, 'aria-describedby': 's-err' });
    const err = h('p', { class: 'err', id: 's-err', role: 'alert' });
    const cd = h('strong', { 'aria-live': 'off' });
    const startBtn = h('button', { class: 'btn primary big', onclick: begin }, '▶ Vào làm bài');
    const lock = h('div', { class: 'box error', role: 'alert', style: 'display:none' });
    const tick = () => {
      const left = a.due - Date.now();
      if (!a.due) { cd.textContent = 'Không giới hạn'; return; }
      if (left <= 0) { cd.textContent = 'Đã hết hạn'; startBtn.disabled = true; lock.style.display = ''; lock.textContent = 'Bài này đã hết hạn nộp nên bị khóa.'; clearInterval(timer); return; }
      const s = Math.floor(left / 1000), d = Math.floor(s / 86400);
      cd.textContent = (d ? d + ' ngày ' : '') + [Math.floor(s % 86400 / 3600), Math.floor(s % 3600 / 60), s % 60].map(n => String(n).padStart(2, '0')).join(':');
    };
    if (a.max && attempts() >= a.max) { startBtn.disabled = true; lock.style.display = ''; lock.textContent = `Bạn đã dùng hết ${a.max} lần làm bài.`; }
    root.replaceChildren(h('div', { class: 'card stack', style: 'max-width:560px;margin:0 auto' },
      h('h1', { text: a.name }),
      h('p', { class: 'muted', text: `${a.words.length} từ · Hạn nộp: ${fmtDate(a.due)}` }),
      h('p', null, 'Còn lại: ', cd),
      a.max ? h('p', { class: 'muted', text: `Số lần làm: ${attempts()}/${a.max}` }) : null,
      !a.scriptUrl ? h('div', { class: 'box warn', text: 'Bài này chưa có nơi nhận kết quả – điểm sẽ không được gửi cho giáo viên.' }) : null,
      lock,
      h('label', { for: 's-name', text: 'Họ và tên' + (a.req ? ' *' : '') }), name,
      h('label', { for: 's-cls', text: 'Lớp' + (a.req ? ' *' : '') }), cls, err, startBtn));
    tick(); timer = setInterval(tick, 1000);

    function begin() {
      const nm = Norm.text(name.value), cl = Norm.text(cls.value);
      const bad = /[\u0000-\u001f<>]/;
      if (a.req && nm.length < 2) { err.textContent = 'Vui lòng nhập Họ và tên (ít nhất 2 ký tự).'; return name.focus(); }
      if (a.req && !cl) { err.textContent = 'Vui lòng nhập Lớp.'; return cls.focus(); }
      if (bad.test(nm) || bad.test(cl)) { err.textContent = 'Họ tên/Lớp chứa ký tự không hợp lệ.'; return; }
      err.textContent = '';
      Store.set('student', { name: nm, cls: cl });
      clearInterval(timer);
      flow = runFlow(root, { title: a.name, words: a.words, tts: a.tts, shuffle: a.shuffle, mode: 'assign', backHref: null,
        onAssignFinish: res => submitResult(a, nm || 'Ẩn danh', cl, res) });
    }
  }
  function submitResult(a, name, cls, res) {
    const att = Store.get('attempts', {}); att[a.id] = (att[a.id] || 0) + 1; Store.set('attempts', att);
    const sid = uid();
    if (!API.validUrl(a.scriptUrl)) { Sync.emit(sid, 'rejected', 'Bài chưa cấu hình nơi nhận kết quả.'); return statusChip(sid); }
    Sync.enqueue({ submissionId: sid, url: a.scriptUrl, payload: { action: 'submit', submissionId: sid, assignmentId: a.id, assignmentName: a.name, name, cls, score: res.score, maxScore: res.maxScore, totalMs: res.totalMs,
      details: res.words, submittedAt: new Date().toISOString(), userAgent: navigator.userAgent, due: a.due, max: a.max } });
    return statusChip(sid);
  }
  return { destroy() { dead = true; clearInterval(timer); if (flow) flow.destroy(); } };
}

/* ===================== 10a. SETTINGS VIEW ===================== */
function SettingsView(root) {
  const s = Settings.data;
  const url = h('input', { type: 'url', id: 'st-url', value: s.scriptUrl, placeholder: 'https://script.google.com/macros/s/…/exec', autocomplete: 'off', spellcheck: 'false' });
  const key = h('input', { type: 'password', id: 'st-key', value: s.teacherKey, autocomplete: 'off' });
  const theme = h('select', { id: 'st-theme' }, [['auto', 'Tự động (theo thiết bị)'], ['light', 'Sáng'], ['dark', 'Tối']].map(([v, t]) => h('option', { value: v, selected: v === s.theme }, t)));
  const sfx = h('input', { type: 'checkbox', id: 'st-sfx', checked: s.sfx });
  const read = h('input', { type: 'checkbox', id: 'st-read', checked: s.autoRead });
  const asy = h('input', { type: 'checkbox', id: 'st-sync', checked: s.autoSync });
  const res = h('div', { 'aria-live': 'polite' });
  const collect = () => ({ scriptUrl: url.value.trim(), teacherKey: key.value.trim(), theme: theme.value, sfx: sfx.checked, autoRead: read.checked, autoSync: asy.checked });
  async function test() {
    const v = collect();
    if (!API.validUrl(v.scriptUrl)) return res.replaceChildren(h('p', { class: 'err', text: 'URL phải có dạng https://script.google.com/macros/s/…/exec' }));
    res.replaceChildren(loading('Đang kiểm tra…'));
    try {
      const r = await API.get(v.scriptUrl, { action: 'ping', teacherKey: v.teacherKey });
      if (!r.ok) throw new Error(r.message || r.error);
      Settings.save(Object.assign(v, { teacherOk: !!r.teacher }));
      res.replaceChildren(h('p', { class: r.teacher ? 'ok' : 'err', text: r.teacher ? '✓ Kết nối thành công và Teacher Key hợp lệ.' : '⚠ Kết nối được máy chủ nhưng Teacher Key trống hoặc sai – chưa mở được Bảng thống kê.' }));
      renderNav();
    } catch (e) { res.replaceChildren(h('p', { class: 'err', text: 'Không kết nối được: ' + e.message })); }
  }
  function save() {
    const v = collect();
    if (v.scriptUrl && !API.validUrl(v.scriptUrl)) return toast('URL Apps Script không đúng định dạng.', 'error');
    if (v.scriptUrl !== s.scriptUrl || v.teacherKey !== s.teacherKey) v.teacherOk = false;
    Settings.save(v); renderNav(); toast('Đã lưu cài đặt.');
  }
  async function wipe() {
    if (!await Modal.confirm('Xóa TOÀN BỘ dữ liệu trên máy này (bộ từ, cài đặt, hàng đợi nộp bài)? Không thể hoàn tác.', 'Xóa hết', true)) return;
    Object.keys(localStorage).filter(k => k.startsWith('sm_')).forEach(k => localStorage.removeItem(k));
    location.hash = '#/'; location.reload();
  }
  root.replaceChildren(h('div', { class: 'stack', style: 'max-width:640px' }, h('h1', { text: 'Cài đặt' }),
    h('section', { class: 'card' }, h('h2', { text: 'Kết nối Google Apps Script' }),
      h('label', { for: 'st-url', text: 'Apps Script URL (Web app)' }), url,
      h('label', { for: 'st-key', text: 'Teacher Key' }), key,
      h('p', { class: 'hint', text: 'Teacher Key chỉ lưu trên máy này và chỉ để xem thống kê / tạo link ngắn. Không bao giờ được đưa vào link giao bài.' }),
      h('div', { class: 'row wrap' }, h('button', { class: 'btn', onclick: test }, 'Kiểm tra kết nối')), res),
    h('section', { class: 'card' }, h('h2', { text: 'Giao diện & âm thanh' }),
      h('label', { for: 'st-theme', text: 'Chế độ màu' }), theme,
      h('label', { class: 'check', for: 'st-sfx' }, sfx, 'Hiệu ứng âm thanh (Ting / Oops)'),
      h('label', { class: 'check', for: 'st-read' }, read, 'Tự đọc từ mỗi 3 giây khi làm bài')),
    h('section', { class: 'card' }, h('h2', { text: 'Đồng bộ với GitHub (data.json)' }),
      h('label', { class: 'check', for: 'st-sync' }, asy, 'Tự động ghi đè bộ từ + thiết lập khi data.json trên repo có bản mới'),
      h('p', { class: 'hint', text: 'Đồng bộ một chiều: repo → máy này. Nếu bật, mọi chỉnh sửa chưa xuất ra data.json trên máy này sẽ bị ghi đè khi repo có bản mới. Nhớ bấm "Lưu cài đặt".' }),
      h('button', { class: 'btn', onclick: () => repoCheck({ manual: true }) }, '⟳ Đồng bộ ngay')),
    h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: save }, 'Lưu cài đặt')),
    h('section', { class: 'card' }, h('h2', { text: 'Dữ liệu trên máy' }), h('button', { class: 'btn danger', onclick: wipe }, '🗑 Xóa dữ liệu local'))));
  return { destroy() {} };
}

/* ===================== 10b. STATS VIEW (giáo viên) ===================== */
function StatsView(root) {
  const st = Settings.data;
  if (!st.teacherOk || !API.validUrl(st.scriptUrl)) {
    root.replaceChildren(h('div', { class: 'card empty' }, h('h1', { text: 'Bảng thống kê' }), h('p', { class: 'muted', text: 'Cần nhập Apps Script URL + Teacher Key hợp lệ (bấm "Kiểm tra kết nối") để xem thống kê.' }), h('a', { class: 'btn primary', href: '#/settings' }, 'Mở Cài đặt')));
    return {};
  }
  const PAGE = 10;
  const M = { rows: [], f: { name: '', cls: '', min: '', max: '' }, sort: { key: 'submittedAt', dir: -1 }, page: 1, cur: null };
  const cols = [['name', 'Họ tên'], ['cls', 'Lớp'], ['score', 'Tổng điểm'], ['max', 'Tối đa'], ['totalMs', 'Thời gian'], ['weak', 'Từ yếu'], ['submittedAt', 'Nộp lúc']];
  const body = h('div', { class: 'stack' }), picker = h('select', { id: 'sx-as', onchange: () => loadResults(picker.value) });
  root.replaceChildren(h('div', { class: 'stack' }, h('h1', { text: 'Bảng thống kê' }), h('div', null, h('label', { for: 'sx-as', text: 'Chọn bài đã giao' }), picker), body));
  body.append(loading('Đang tải danh sách bài…'));
  (async () => {
    try {
      const r = await API.get(st.scriptUrl, { action: 'assignments', teacherKey: st.teacherKey });
      if (!r.ok) throw new Error(r.error === 'unauthorized' ? 'Teacher Key không đúng.' : (r.message || r.error));
      if (!r.assignments.length) { body.replaceChildren(h('div', { class: 'card empty', text: 'Chưa có bài nào được giao / chưa có kết quả.' })); return; }
      picker.replaceChildren(h('option', { value: '' }, '— Chọn —'), r.assignments.map(a => h('option', { value: a.id }, `${a.name} · ${a.count} bài nộp · hạn ${fmtDate(a.due)}`)));
      body.replaceChildren(h('p', { class: 'muted', text: 'Hãy chọn một bài ở trên.' }));
    } catch (e) { body.replaceChildren(errorPanel(e.message, h('button', { class: 'btn primary', onclick: () => StatsView(root) }, 'Thử lại'))); }
  })();

  async function loadResults(id) {
    if (!id) return;
    body.replaceChildren(loading('Đang tải kết quả…'));
    try {
      const r = await API.get(st.scriptUrl, { action: 'results', id, teacherKey: st.teacherKey });
      if (!r.ok) throw new Error(r.message || r.error);
      M.cur = r.assignment || { id, name: id };
      M.rows = r.results.map(x => ({ name: x.name, cls: x.cls, score: Number(x.score), max: (x.details || []).length * 10, totalMs: Number(x.totalMs), submittedAt: x.submittedAt, details: x.details || [], weak: (x.details || []).filter(Scoring.needsWork).length, late: x.late }));
      M.page = 1; layout();
    } catch (e) { body.replaceChildren(errorPanel(e.message, h('button', { class: 'btn', onclick: () => loadResults(id) }, 'Thử lại'))); }
  }
  const filtered = () => {
    const f = M.f, mn = f.min === '' ? -1 : Number(f.min), mx = f.max === '' ? Infinity : Number(f.max);
    const rows = M.rows.filter(r => (!f.name || r.name.toLowerCase().includes(f.name.toLowerCase())) && (!f.cls || r.cls === f.cls) && r.score >= mn && r.score <= mx);
    const { key, dir } = M.sort;
    return rows.sort((a, b) => (typeof a[key] === 'number' ? a[key] - b[key] : String(a[key]).localeCompare(String(b[key]), 'vi')) * dir);
  };
  function topWords(rows) {
    const m = new Map();
    rows.forEach(r => r.details.forEach(d => { const e = m.get(d.word) || { word: d.word, wrong: 0, extra: 0, n: 0 }; e.wrong += d.wrongCount; e.extra += Math.max(0, d.views - 1); e.n++; m.set(d.word, e); }));
    return [...m.values()].filter(e => e.wrong + e.extra > 0).sort((a, b) => (b.wrong + b.extra) - (a.wrong + a.extra)).slice(0, 10);
  }
  const tableHost = h('div'), topHost = h('div');
  function layout() {
    const classes = [...new Set(M.rows.map(r => r.cls))].filter(Boolean).sort();
    const inp = (id, label, k, type) => h('div', null, h('label', { for: id, text: label }), h('input', { type: type || 'text', id, value: M.f[k], oninput: e => { M.f[k] = e.target.value; M.page = 1; draw(); } }));
    body.replaceChildren(
      h('div', { class: 'filters' }, inp('f-name', 'Lọc theo tên', 'name'),
        h('div', null, h('label', { for: 'f-cls', text: 'Lớp' }), h('select', { id: 'f-cls', onchange: e => { M.f.cls = e.target.value; M.page = 1; draw(); } }, h('option', { value: '' }, 'Tất cả'), classes.map(c => h('option', { value: c, selected: c === M.f.cls }, c)))),
        inp('f-min', 'Tổng điểm từ', 'min', 'number'), inp('f-max', 'Đến', 'max', 'number')),
      h('div', { class: 'row wrap' },
        h('button', { class: 'btn', onclick: () => Exporter.csv(M.cur, filtered(), topWords(filtered())) }, '⬇ CSV'),
        h('button', { class: 'btn', onclick: () => Exporter.xlsx(M.cur, filtered(), topWords(filtered())) }, '⬇ Excel'),
        h('button', { class: 'btn', onclick: () => Exporter.pdf(M.cur, filtered(), topWords(filtered())) }, '⬇ PDF')),
      tableHost, h('h2', { text: 'Top từ bị gõ sai / xem lại nhiều nhất' }), topHost);
    draw();
  }
  function draw() {
    const rows = filtered(), pages = Math.max(1, Math.ceil(rows.length / PAGE)); M.page = clamp(M.page, 1, pages);
    const slice = rows.slice((M.page - 1) * PAGE, M.page * PAGE);
    const avg = rows.length ? (rows.reduce((s, r) => s + r.score, 0) / rows.length).toFixed(1) : '—';
    const avgMax = rows.length ? (rows.reduce((s, r) => s + r.max, 0) / rows.length).toFixed(0) : '—';
    tableHost.replaceChildren(
      h('p', { class: 'muted', text: `${rows.length} bài nộp · tổng điểm trung bình ${avg}/${avgMax}` }),
      rows.length ? h('div', { class: 'table-wrap' }, h('table', null, h('caption', { class: 'center muted', text: M.cur ? M.cur.name : '' }),
        h('thead', null, h('tr', null, cols.map(([k, t]) => h('th', { scope: 'col', 'aria-sort': M.sort.key === k ? (M.sort.dir > 0 ? 'ascending' : 'descending') : 'none' },
          h('button', { onclick: () => { M.sort = { key: k, dir: M.sort.key === k ? -M.sort.dir : 1 }; draw(); } }, t + (M.sort.key === k ? (M.sort.dir > 0 ? ' ▲' : ' ▼') : '')))))),
        h('tbody', null, slice.map(r => h('tr', null, h('td', { text: r.name }), h('td', { text: r.cls }), h('td', { class: 'num', text: r.score }), h('td', { class: 'num', text: r.max }), h('td', { class: 'num', text: fmtTime(r.totalMs) }), h('td', { class: 'num', text: r.weak }), h('td', { text: fmtDate(r.submittedAt) + (r.late ? ' (trễ)' : '') }))))))
        : h('div', { class: 'card empty', text: 'Không có kết quả phù hợp bộ lọc.' }),
      h('div', { class: 'pager' }, h('button', { class: 'btn small', disabled: M.page <= 1, onclick: () => { M.page--; draw(); } }, '‹ Trước'),
        h('span', { text: `Trang ${M.page}/${pages}` }), h('button', { class: 'btn small', disabled: M.page >= pages, onclick: () => { M.page++; draw(); } }, 'Sau ›')));
    const top = topWords(rows), mx = Math.max(1, ...top.map(t => t.wrong + t.extra));
    topHost.replaceChildren(top.length ? h('div', { class: 'stack' },
      h('p', { class: 'hint' }, h('span', { style: 'color:var(--danger)', text: '■ Gõ sai ' }), h('span', { style: 'color:var(--warn)', text: '■ Lượt xem thêm' })),
      h('div', { class: 'table-wrap' }, h('table', null, h('thead', null, h('tr', null, ['Từ', 'Gõ sai', 'Xem thêm', 'Số HS', 'Biểu đồ'].map((t, i) => h('th', { scope: 'col', class: i && i < 4 ? 'num' : '', text: t })))),
        h('tbody', null, top.map(t => h('tr', null, h('td', { text: t.word }), h('td', { class: 'num', text: t.wrong }), h('td', { class: 'num', text: t.extra }), h('td', { class: 'num', text: t.n }),
          h('td', null, h('div', { class: 'hbar', role: 'img', 'aria-label': `${t.word}: ${t.wrong} lần sai, ${t.extra} lượt xem thêm`, style: `width:${Math.max(8, (t.wrong + t.extra) / mx * 100)}%` },
            h('span', { class: 'w', style: `flex:${t.wrong}` }), h('span', { class: 'v', style: `flex:${t.extra}` }))))))))) : h('p', { class: 'muted', text: 'Chưa có từ nào bị sai hoặc xem lại.' }));
  }
  return { destroy() {} };
}

/* ===================== 10c. EXPORTER (CSV / Excel / PDF) ===================== */
const Exporter = {
  fname(a, ext) { return 'ketqua_' + String((a && a.name) || 'bai').replace(/[^\w\u00C0-\u1EF9-]+/g, '_').slice(0, 40) + '_' + new Date().toISOString().slice(0, 10) + '.' + ext; },
  resultRows: rows => rows.map(r => ({ 'Họ tên': safeCell(r.name), 'Lớp': safeCell(r.cls), 'Tổng điểm': r.score, 'Điểm tối đa': r.max, 'Thời gian (giây)': Math.round(r.totalMs / 1000), 'Số từ yếu': r.weak, 'Nộp lúc': fmtDate(r.submittedAt) })),
  wordRows: top => top.map(t => ({ 'Từ': safeCell(t.word), 'Gõ sai': t.wrong, 'Lượt xem thêm': t.extra, 'Số học sinh': t.n })),
  csv(a, rows, top) {
    if (!window.Papa) return toast('Thư viện CSV chưa tải được.', 'error');
    download(this.fname(a, 'csv'), '\uFEFF' + Papa.unparse(this.resultRows(rows)), 'text/csv;charset=utf-8');
  },
  xlsx(a, rows, top) {
    if (!window.XLSX) return toast('Thư viện Excel chưa tải được.', 'error');
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(this.resultRows(rows)), 'Kết quả');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(this.wordRows(top)), 'Top từ khó');
    XLSX.writeFile(wb, this.fname(a, 'xlsx'));
  },
  /** PDF Unicode: vẽ bảng bằng canvas (font hệ thống có tiếng Việt) rồi nhúng ảnh vào jsPDF */
  pdf(a, rows, top) {
    if (!window.jspdf) return toast('Thư viện PDF chưa tải được.', 'error');
    const doc = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pages = [
      ...this.tablePages('Kết quả: ' + ((a && a.name) || ''), ['Họ tên', 'Lớp', 'Tổng điểm', 'Tối đa', 'Thời gian', 'Từ yếu', 'Nộp lúc'], [.25, .1, .11, .08, .11, .09, .26],
        rows.map(r => [r.name, r.cls, String(r.score), String(r.max), fmtTime(r.totalMs), String(r.weak), fmtDate(r.submittedAt)])),
      ...this.tablePages('Top từ gõ sai / xem lại nhiều nhất', ['Từ', 'Gõ sai', 'Xem thêm', 'Số HS'], [.46, .18, .18, .18], top.map(t => [t.word, String(t.wrong), String(t.extra), String(t.n)]))
    ];
    pages.forEach((c, i) => { if (i) doc.addPage(); doc.addImage(c.toDataURL('image/jpeg', .92), 'JPEG', 0, 0, 297, 210); });
    doc.save(this.fname(a, 'pdf'));
  },
  tablePages(title, heads, fr, data) {
    const W = 1754, H = 1240, M = 70, RH = 46, font = '26px system-ui,"Segoe UI",Roboto,Arial,sans-serif';
    const per = Math.floor((H - 2 * M - 130) / RH), out = [], n = Math.max(1, Math.ceil(data.length / per));
    const widths = fr.map(f => f * (W - 2 * M));
    for (let p = 0; p < n; p++) {
      const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.fillStyle = '#111'; g.textBaseline = 'middle';
      g.font = 'bold 36px ' + font.slice(5); g.fillText(title, M, M + 10);
      const fit = (t, w) => { g.font = font; if (g.measureText(t).width <= w - 16) return t; while (t.length > 1 && g.measureText(t + '…').width > w - 16) t = t.slice(0, -1); return t + '…'; };
      const row = (cells, y, bold, bg) => { if (bg) { g.fillStyle = bg; g.fillRect(M, y - RH / 2, W - 2 * M, RH); g.fillStyle = '#111'; }
        let x = M; cells.forEach((t, i) => { g.font = (bold ? 'bold ' : '') + font; g.fillText(fit(String(t), widths[i]), x + 8, y); x += widths[i]; });
        g.strokeStyle = '#ccc'; g.beginPath(); g.moveTo(M, y + RH / 2); g.lineTo(W - M, y + RH / 2); g.stroke(); };
      row(heads, M + 90, true, '#e5e7f5');
      data.slice(p * per, (p + 1) * per).forEach((r, i) => row(r, M + 90 + RH * (i + 1), false));
      if (!data.length) { g.font = font; g.fillText('(Không có dữ liệu)', M, M + 90 + RH); }
      g.font = '20px ' + font.slice(5); g.fillStyle = '#555'; g.fillText(`Spelling Mastery · ${new Date().toLocaleString('vi-VN')} · Trang ${p + 1}/${n}`, M, H - 40);
      out.push(c);
    }
    return out;
  }
};

/* ===================== 11. ROUTER & KHỞI ĐỘNG ===================== */
function renderNav() {
  const path = location.hash.replace(/^#/, '').split('?')[0] || '/';
  const items = [['#/', 'Trang chủ', '/'], Settings.data.teacherOk ? ['#/stats', 'Thống kê', '/stats'] : null, ['#/settings', 'Cài đặt', '/settings']].filter(Boolean);
  $('#nav').replaceChildren(...items.map(([href, t, p]) => h('a', { href, 'aria-current': path === p ? 'page' : null }, t)));
}
const Router = {
  cur: null,
  render() {
    if (this.cur && this.cur.destroy) this.cur.destroy();
    const raw = location.hash.replace(/^#/, '') || '/';
    const k = raw.indexOf('?'), path = k < 0 ? raw : raw.slice(0, k), query = k < 0 ? '' : raw.slice(k + 1);
    const root = $('#app');
    document.body.dataset.route = path === '/assign' ? 'assign' : 'app';
    document.title = 'Spelling Mastery – Chính tả từ vựng';
    renderNav(); window.scrollTo(0, 0);
    try {
      if (path === '/' || path === '') this.cur = HomeView(root);
      else if (path === '/settings') this.cur = SettingsView(root);
      else if (path === '/stats') this.cur = StatsView(root);
      else if (path === '/assign') {
        const pick = key => { const m = query.match(new RegExp('(?:^|&)' + key + '=([^&]*)')); return m ? m[1] : ''; };
        const dec = v => { try { return decodeURIComponent(v); } catch (_) { return v; } };
        this.cur = AssignView(root, { d: dec(pick('d')).replace(/ /g, '+'), id: dec(pick('id')), s: dec(pick('s')) });
      } else if (path.startsWith('/practice/')) this.cur = PracticeView(root, path.slice(10));
      else { root.replaceChildren(errorPanel('Không tìm thấy trang này.')); this.cur = null; }
    } catch (e) { console.error(e); root.replaceChildren(errorPanel('Đã xảy ra lỗi: ' + e.message)); this.cur = null; }
    if (!(path === '/' || path === '')) root.focus({ preventScroll: true });
  }
};
function init() {
  Settings.load(); Sets.load(); TTS.init();
  window.addEventListener('hashchange', () => Router.render());
  window.addEventListener('online', () => Sync.flush());
  window.addEventListener('unhandledrejection', e => { console.error(e.reason); toast('Có lỗi không mong muốn: ' + ((e.reason && e.reason.message) || e.reason), 'error'); });
  Sync.flush();
  Router.render();
}
window.__SM_TEST__ = { Parser, Scoring, Norm, IO };
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();

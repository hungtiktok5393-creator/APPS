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
/** Dữ liệu lớn (bộ từ, bài test) lưu nén bằng lz-string (UTF-16) để chứa được nhiều gấp 3–5 lần trong ~5 MB localStorage.
 *  Đọc được cả bản chưa nén cũ. Nếu không đọc được thì chặn ghi để không đè mất dữ liệu. */
Store.zFail = {};
Store.getZ = function (k, d) {
  try {
    const raw = localStorage.getItem('sm_' + k); if (!raw) return d;
    if (raw.slice(0, 3) === 'z1:') {
      if (!window.LZString) { Store.zFail[k] = true; toast('Thư viện nén chưa tải được nên chưa đọc được dữ liệu. Hãy kiểm tra mạng rồi tải lại trang (dữ liệu vẫn an toàn).', 'error'); return d; }
      return JSON.parse(LZString.decompressFromUTF16(raw.slice(3)));
    }
    return JSON.parse(raw);
  } catch (_) { Store.zFail[k] = true; return d; }
};
Store.setZ = function (k, v) {
  if (Store.zFail[k]) { toast('Không lưu để tránh ghi đè dữ liệu chưa đọc được. Hãy tải lại trang.', 'error'); return false; }
  try { const js = JSON.stringify(v); localStorage.setItem('sm_' + k, window.LZString ? 'z1:' + LZString.compressToUTF16(js) : js); return true; }
  catch (_) { toast('Bộ nhớ trình duyệt đã đầy – hãy Xuất JSON để sao lưu rồi xóa bớt bộ từ/bài test.', 'error'); return false; }
};
function storageInfo() {
  let b = 0; try { Object.keys(localStorage).filter(k => k.startsWith('sm_')).forEach(k => { b += (k.length + (localStorage.getItem(k) || '').length) * 2; }); } catch (_) {}
  return { mb: (b / 1048576).toFixed(2), words: Sets.list.reduce((n, x) => n + x.cards.length, 0), qs: Tests.list.reduce((n, t) => n + qCount(t), 0) };
}
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
  load() { this.list = Store.getZ('sets', []); },
  save() { return Store.setZ('sets', this.list); },
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
  /** Từ bỏ qua, gõ sai ≥ 1 lần hoặc xem ≥ 3 lần → "Cần cải thiện" */
  needsWork: w => !!w.skipped || w.wrongCount >= 1 || w.views >= 3
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
  /** Mỗi lần làm có 1 submissionId cố định: lưu nhiều lần (tạm → cuối) thì bản mới nhất thay bản cũ */
  upsert(item, opt) {
    opt = opt || {};
    const q = this.queue(), i = q.findIndex(x => x.submissionId === item.submissionId);
    item.rev = (i >= 0 ? (q[i].rev || 0) : 0) + 1;
    if (i >= 0) q[i] = item; else q.push(item);
    Store.set('queue', q);                       // lưu bền trước: tắt app cũng không mất, lần mở sau sẽ gửi lại
    this.emit(item.submissionId, 'sending');
    if (opt.beacon) this.beacon(item); else this.flush();
  },
  enqueue(item) { this.upsert(item); },
  /** Gửi "fire-and-forget" khi trang đang đóng/ẩn (fetch thường có thể bị hủy) */
  beacon(item) {
    try {
      const body = JSON.stringify(item.payload);
      if (navigator.sendBeacon && navigator.sendBeacon(item.url, new Blob([body], { type: 'text/plain;charset=UTF-8' }))) return;
      fetch(item.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body, keepalive: true }).catch(() => {});
    } catch (_) { /* bỏ qua – bản trong hàng đợi sẽ được gửi lại sau */ }
  },
  async flush() {
    if (this.busy) return; this.busy = true;
    try {
      for (let round = 0; round < 3; round++) {
        let again = false;
        for (const item of this.queue()) {
          this.emit(item.submissionId, 'sending');
          try {
            const r = await API.post(item.url, item.payload);
            if (!r.ok && r.error === 'bad_request' && /Hành động/.test(r.message || '')) this.emit(item.submissionId, 'error', 'Apps Script chưa cập nhật bản mới (cần Deploy → New version). Bài vẫn được giữ trên máy, bấm Thử lại sau khi cập nhật.');
            else if (r.ok) { if (this.remove(item.submissionId, item.rev)) this.emit(item.submissionId, 'sent'); else again = true; }
            else if (['expired', 'max_attempts', 'bad_request', 'too_large'].includes(r.error)) { this.remove(item.submissionId, item.rev); this.emit(item.submissionId, 'rejected', r.message || r.error); }
            else this.emit(item.submissionId, 'error', r.message || r.error || 'Lỗi máy chủ');
          } catch (e) { this.emit(item.submissionId, 'error', e.message); return; }   // mất mạng → dừng, thử lại sau
        }
        if (!again) break;
      }
    } finally { this.busy = false; }
  },
  /** Chỉ xóa khỏi hàng đợi nếu chưa có bản mới hơn được lưu trong lúc đang gửi */
  remove(id, rev) {
    const q = this.queue(), it = q.find(x => x.submissionId === id);
    if (it && rev !== undefined && (it.rev || 0) !== (rev || 0)) return false;
    Store.set('queue', q.filter(x => x.submissionId !== id)); return true;
  }
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
    sets: Sets.list.map(x => { const t = x.tts || newTts(); return { id: x.id, name: x.name, cards: x.cards, tts: { lang: t.lang, voice: t.voice || '', rate: t.rate }, shuffle: !!x.shuffle, updatedAt: x.updatedAt || 0 }; }), tests: Tests.list };
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
  if (Array.isArray(obj.tests)) {
    const inc = obj.tests.filter(x => x && typeof x.name === 'string' && (Array.isArray(x.questions) || Array.isArray(x.sections))).map(x => normTest(Object.assign({}, x, { id: (typeof x.id === 'string' && /^[\w-]{3,64}$/.test(x.id)) ? x.id : uid(), updatedAt: Number(x.updatedAt) || Date.now() })));
    if (mode === 'replace') Tests.list = inc;
    else inc.forEach(n => { const i = Tests.list.findIndex(x => x.id === n.id); if (i < 0) Tests.list.push(n); else if (n.updatedAt >= (Tests.list[i].updatedAt || 0)) Tests.list[i] = n; });
    Tests.save();
  }
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
      h('button', { class: 'btn primary', onclick: () => { const data = buildExport(key.checked); download('data.json', JSON.stringify(data), 'application/json'); RepoSync.mark(data.exportedAt); d.close(); toast('Đã tạo data.json.'); } }, '⬇ Tải data.json'))));
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
          h('a', { class: 'btn primary', href: '#/test-edit/new' }, '📝 Tạo bài test'),
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
            h('button', { class: 'btn', onclick: addSample }, 'Thêm dữ liệu mẫu'))),
      TestHomeSection(render));
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
        h('button', { class: 'btn small ghost', onclick: () => dup(s) }, '⧉ Nhân bản'),
        h('button', { class: 'btn small ghost', onclick: () => join(s) }, '⛓ Gộp'),
        h('button', { class: 'btn small ghost', onclick: () => remove(s) }, '🗑 Xóa')));
  }
  function dup(s) {
    const c = { id: uid(), name: (s.name + ' (bản sao)').slice(0, 80), cards: s.cards.map(x => ({ en: x.en, vi: x.vi })), tts: Object.assign({}, s.tts || newTts()), shuffle: !!s.shuffle, updatedAt: Date.now() };
    Sets.list.splice(Sets.list.indexOf(s) + 1, 0, c);
    if (Sets.save()) { render(); toast(`Đã nhân bản thành "${c.name}".`); }
  }
  function join(cur) {
    if (Sets.list.length < 2) return toast('Cần ít nhất 2 bộ từ để gộp.', 'error');
    joinDialog({ kind: 'bộ từ', unit: 'từ', dedupe: 'Bỏ từ tiếng Anh bị trùng (giữ từ xuất hiện trước)', list: Sets.list, cur, count: x => x.cards.length,
      make(sel, nm, dd, del) {
        const seen = new Set(), cards = []; let dups = 0;
        sel.forEach(x => x.cards.forEach(c => { const k = c.en.toLowerCase(); if (dd && seen.has(k)) { dups++; return; } seen.add(k); cards.push({ en: c.en, vi: c.vi }); }));
        const n = { id: uid(), name: nm, cards, tts: Object.assign({}, cur.tts || newTts()), shuffle: !!cur.shuffle, updatedAt: Date.now() };
        const keep = del ? Sets.list.filter(x => sel.indexOf(x) < 0) : Sets.list.slice(); keep.unshift(n);
        const old = Sets.list; Sets.list = keep;
        if (!Sets.save()) { Sets.list = old; return; }
        render(); toast(`Đã gộp thành "${nm}" (${cards.length.toLocaleString('vi-VN')} từ${dups ? `, bỏ ${dups} từ trùng` : ''}).`);
      } });
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
    const nameIn = h('input', { type: 'text', id: 'a-name', maxlength: 80, value: s.name, autocomplete: 'off' });
    const out = h('div', { 'aria-live': 'polite', class: 'stack' });
    const go = h('button', { class: 'btn primary', onclick: create }, 'Tạo link giao bài');
    Modal.open('Giao bài – ' + s.name, h('div', null,
      h('label', { for: 'a-name', text: 'Tên bài giao (học sinh thấy tên này, và hiện trong Thống kê)' }), nameIn,
      h('p', { class: 'hint', text: 'Đổi tên ở đây không làm đổi tên thẻ bộ từ. Để trống = dùng tên thẻ.' }),
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
      const a = { id: shortId(), name: Norm.text(nameIn.value).slice(0, 80) || s.name, link: '', words: s.cards, tts: { lang: s.tts.lang, rate: s.tts.rate }, due: dueMs, shuffle: !!s.shuffle, max: clamp(parseInt(max.value, 10) || 0, 0, 20), req: req.checked };
      const payload = { v: 1, id: a.id, n: a.name, w: a.words.map(c => [c.en, c.vi]), t: { l: a.tts.lang, r: a.tts.rate }, due: a.due, sh: a.shuffle ? 1 : 0, max: a.max, req: a.req ? 1 : 0, u: API.validUrl(url) ? url : '' };
      const base = location.href.split('#')[0];
      let link = base + '#/assign?d=' + Link.pack(payload);
      const shortLink = base + '#/assign?id=' + a.id + '&s=' + encodeURIComponent(url);
      a.link = link;       // lưu link lên Sheet để xem/copy lại trong Thống kê
      let mode = 'inline', notes = [];
      if (link.length > 2000) {
        if (canSheet) {
          a.link = shortLink;
          try { const r = await API.post(url, { action: 'saveAssignment', teacherKey: st.teacherKey, assignment: a }); if (!r.ok) throw new Error(r.message || r.error);
            link = shortLink; mode = 'sheet'; }
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
  const words = cfg.words.map(w => ({ en: w.en, vi: w.vi, views: 1, wrongCount: 0, timeMs: 0, done: false, skipped: false }));
  const tts = cfg.tts || newTts();
  const STOP_AFTER = 10, SAVE_EVERY = cfg.words.length > 300 ? 50 : 10;     // đúng đủ 10 từ thì hiện nút "Dừng lại"
  const S = { idx: 0, state: 'SHOW', started: false, paused: false, stopAsk: false, finished: false, hidden: document.hidden, locked: false, combo: 0, tickAt: 0, totalMs: 0 };
  let readTimer = null, nextTimer = null, uiTimer = null, skipTimer = null, idleTimer = null, destroyed = false, draft = '', lastAct = Date.now(), lastSavedN = 0;
  const doneN = () => words.filter(w => w.done).length;                       // từ đã xử lý (đúng hoặc bỏ qua)
  const correctN = () => words.filter(w => w.done && !w.skipped).length;      // từ gõ đúng

  const isRunning = () => S.started && !S.paused && !S.hidden && !S.locked && !destroyed;
  /** Cộng dồn thời gian: chỉ tính khi đang chạy (không Pause / tab ẩn / đang khóa) */
  function accrue() {
    const now = performance.now();
    if (S.tickAt) { const d = now - S.tickAt; words[S.idx].timeMs += d; S.totalMs += d; }
    S.tickAt = isRunning() ? now : 0;
  }
  function set(patch) { accrue(); Object.assign(S, patch); accrue(); }
  /** Kết quả tính trên CÁC TỪ ĐÃ LÀM (từ bỏ qua = 0 điểm; từ chưa làm không tính vào điểm lẫn điểm tối đa) */
  function snapshot(reason) {
    accrue();
    const out = words.filter(w => w.done).map(w => ({ word: w.en, views: w.views, wrongCount: w.wrongCount, score: w.skipped ? 0 : Scoring.wordScore(w.views), timeMs: Math.round(w.timeMs), skipped: w.skipped }));
    return { words: out, score: Scoring.total(out), maxScore: Scoring.max(out), totalWords: words.length, totalMs: Math.round(S.totalMs), reason };
  }

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
  const stopBtn = h('button', { class: 'btn small danger', onclick: () => askStop() }, '⏹ Dừng lại & lưu điểm');
  const hud = h('div', { class: 'hud' }, h('div', { class: 'grp' }, hudPos, hudTime, hudCombo), h('div', { class: 'grp' }, stopBtn, sfxBtn, readBtn, pauseBtn));
  root.replaceChildren(h('div', { class: 'run' }, h('h1', { class: 'small-text muted', text: cfg.title }), hud, h('div', { class: 'progress', role: 'progressbar', 'aria-label': 'Tiến độ' }, bar), stage));

  function drawHud() {
    hudPos.textContent = S.started ? `Từ ${Math.min(S.idx + 1, words.length)}/${words.length} · ✓ ${correctN()} đúng` : `${words.length} từ`;
    hudTime.textContent = '⏱ ' + fmtTime(S.totalMs + (S.tickAt ? performance.now() - S.tickAt : 0));
    hudCombo.textContent = S.combo >= 3 ? `🔥 Combo x${S.combo}` : '';
    hudCombo.style.display = S.combo >= 3 ? '' : 'none';
    bar.style.width = (S.started ? doneN() / words.length * 100 : 0) + '%';
    sfxBtn.textContent = Settings.data.sfx ? '🔔 Hiệu ứng: Bật' : '🔕 Hiệu ứng: Tắt'; sfxBtn.setAttribute('aria-pressed', String(Settings.data.sfx));
    readBtn.textContent = Settings.data.autoRead ? '🗣 Tự đọc: Bật' : '🗣 Tự đọc: Tắt'; readBtn.setAttribute('aria-pressed', String(Settings.data.autoRead));
    pauseBtn.textContent = S.paused ? '▶ Tiếp tục' : '⏸ Tạm dừng (Esc)';
    pauseBtn.style.display = S.started ? '' : 'none';
    stopBtn.style.display = (S.started && !S.paused && correctN() >= STOP_AFTER && doneN() < words.length) ? '' : 'none';
  }

  function renderIntro() {
    stage.replaceChildren(h('div', { class: 'overlay-card' },
      h('h2', { text: cfg.title }),
      h('p', { class: 'muted', text: `${words.length} từ. Nghe – nhìn – rồi gõ lại đúng chính tả.` }),
      h('p', { class: 'hint', text: `Từ quá khó có thể bấm "Bỏ qua" (tính 0 điểm). Sau khi gõ đúng ${STOP_AFTER} từ, bạn có thể bấm "Dừng lại" – điểm tính theo số từ đã làm.` }),
      !TTS.supported ? h('div', { class: 'box warn', text: 'Trình duyệt không hỗ trợ đọc văn bản – bạn vẫn làm bài được nhưng sẽ không nghe thấy từ.' })
        : (!TTS.hasEnglish() ? h('div', { class: 'box warn', text: 'Thiết bị chưa có giọng tiếng Anh riêng; sẽ dùng giọng mặc định.' }) : null),
      h('p', { class: 'hint' }, h('kbd', null, 'Space'), '/bấm = ẩn từ · ', h('kbd', null, 'Enter'), ' = nộp · ', h('kbd', null, 'Tab'), ' = quên · ', h('kbd', null, 'Esc'), ' = tạm dừng'),
      h('button', { class: 'btn primary big', onclick: start }, '▶ Bắt đầu')));
  }
  function start() { Sfx.ensure(); lastAct = Date.now(); set({ started: true }); render(); startRead(); }

  /** Nút Bỏ qua: bấm 2 lần (lần 1 hỏi lại, tự hủy sau 3 giây) để tránh bấm nhầm */
  function skipButton() {
    const label = '⏭ Bỏ qua (0 điểm)';
    const b = h('button', { type: 'button', class: 'btn ghost', onclick: () => {
      if (b.dataset.arm) { clearTimeout(skipTimer); skipWord(); return; }
      b.dataset.arm = '1'; b.textContent = 'Bấm lần nữa để bỏ qua';
      skipTimer = setTimeout(() => { if (b.isConnected) { delete b.dataset.arm; b.textContent = label; } }, 3000);
    } }, label);
    return b;
  }

  function render() {
    drawHud();
    if (!S.started) return renderIntro();
    const w = words[S.idx];
    stage.replaceChildren();
    if (S.paused) {
      if (S.stopAsk) {
        const sn = snapshot();
        stage.append(h('div', { class: 'overlay-card' }, h('h2', { text: '⏹ Dừng lại và lưu điểm?' }),
          h('p', { class: 'muted', text: `Bạn đã làm ${sn.words.length}/${words.length} từ, được ${sn.score}/${sn.maxScore} điểm. Các từ chưa làm sẽ không được tính.` }),
          h('div', { class: 'row wrap', style: 'justify-content:center' },
            h('button', { class: 'btn danger big', onclick: () => finish('stopped') }, 'Dừng & lưu điểm'),
            h('button', { class: 'btn big', onclick: () => togglePause() }, 'Tiếp tục làm'))));
        return;
      }
      stage.append(h('div', { class: 'overlay-card' }, h('h2', { text: '⏸ Đã tạm dừng' }), h('p', { class: 'muted', text: 'Đồng hồ đã dừng.' }),
        h('button', { class: 'btn primary big', onclick: () => togglePause() }, '▶ Tiếp tục')));
      return;
    }
    const listen = h('button', { type: 'button', class: 'btn', onclick: () => TTS.speak(w.en, tts) }, '🔊 Nghe lại');
    if (S.state === 'SHOW' || S.state === 'RECALL') {
      stage.append(h('div', { class: 'word-card' },
        h('p', { class: 'label', text: S.state === 'SHOW' ? 'Ghi nhớ từ này' : `Xem lại (lần xem thứ ${w.views})` }),
        h('p', { class: 'en', lang: 'en', text: w.en }), h('p', { class: 'vi', lang: 'vi', text: w.vi }),
        h('div', { class: 'row wrap', style: 'justify-content:center' },
          h('button', { class: 'btn primary big', onclick: () => dispatch('advance') }, 'Ẩn từ & gõ lại (Space)'), listen, skipButton())));
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
            h('button', { type: 'button', class: 'btn', onclick: () => dispatch('forget') }, 'Quên / Xem lại (Tab)'), listen, skipButton())),
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
      w.done = true; w.skipped = false;
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
  /** Bỏ qua từ khó: từ này tính 0 điểm */
  function skipWord() {
    if (!S.started || S.paused || S.locked || destroyed || S.finished) return;
    const w = words[S.idx]; w.skipped = true; w.done = true; S.combo = 0;
    stopRead(); TTS.cancel(); next();
  }
  function next() {
    if (destroyed || S.finished) return;
    if (S.idx + 1 >= words.length) return finish('done');
    const n = doneN();
    if (cfg.onAutosave && n % SAVE_EVERY === 0 && n !== lastSavedN) { lastSavedN = n; cfg.onAutosave(snapshot('partial'), { beacon: false }); }   // lưu tạm mỗi 10 từ
    draft = ''; set({ idx: S.idx + 1, state: 'SHOW', locked: false });
    render(); startRead();
  }
  function togglePause() {
    if (!S.started || S.finished) return;
    S.stopAsk = false;
    set({ paused: !S.paused });
    if (S.paused) { stopRead(); TTS.cancel(); } else startRead();
    render();
  }
  function askStop() {
    if (!S.started || S.paused || S.locked || destroyed || S.finished) return;
    set({ paused: true }); S.stopAsk = true; stopRead(); TTS.cancel(); render();
  }
  /** reason: 'done' (hết bộ từ) | 'stopped' (bấm Dừng lại) | 'timeout' (30 phút không thao tác) */
  function finish(reason) {
    if (destroyed || S.finished) return;
    S.finished = true; clearTimeout(nextTimer); stopRead(); TTS.cancel();
    cfg.onFinish(snapshot(reason || 'done'));
  }
  /** Lưu tạm khi thoát/ẩn trang (tắt app, chuyển tab, khóa máy…) – chỉ gửi khi có thêm từ mới so với lần lưu trước */
  function leaveSave() {
    if (!cfg.onAutosave || destroyed || S.finished || !S.started) return;
    const n = doneN(); if (!n || n === lastSavedN) return;
    lastSavedN = n; cfg.onAutosave(snapshot('partial'), { beacon: true });
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
  function checkIdle() { if (cfg.idleMs && S.started && !S.finished && !destroyed && Date.now() - lastAct >= cfg.idleMs) finish('timeout'); }
  function onVis() {   // tab ẩn: dừng đồng hồ + giọng đọc + lưu tạm
    set({ hidden: document.hidden });
    if (document.hidden) { stopRead(); TTS.cancel(); leaveSave(); } else { checkIdle(); startRead(); }
  }
  const touch = () => { lastAct = Date.now(); };
  const ACT = ['pointerdown', 'keydown', 'input', 'touchstart'];
  stage.addEventListener('click', e => { if (e.target.closest('button,input,form')) return; if (S.started && (S.state === 'SHOW' || S.state === 'RECALL')) dispatch('advance'); });
  document.addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', onVis);
  window.addEventListener('pagehide', leaveSave);
  ACT.forEach(ev => document.addEventListener(ev, touch, true));
  uiTimer = setInterval(() => { if (S.started && !S.paused) drawHud(); }, 250);
  idleTimer = setInterval(checkIdle, 10000);
  render();

  return { destroy() {   // dọn dẹp: lưu tạm nếu đang làm dở, rồi xóa interval/timeout/listener/giọng đọc
    leaveSave();
    destroyed = true; stopRead(); clearInterval(uiTimer); clearInterval(idleTimer); clearTimeout(nextTimer); clearTimeout(skipTimer);
    document.removeEventListener('keydown', onKey); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('pagehide', leaveSave);
    ACT.forEach(ev => document.removeEventListener(ev, touch, true)); TTS.cancel();
  } };
}

/* ===================== 9c. RESULT VIEW & FLOW ===================== */
function ResultView(root, o) {
  const r = o.res, weak = r.words.filter(Scoring.needsWork), skipped = r.words.filter(w => w.skipped).length;
  const viMap = new Map(o.words.map(w => [w.en, w.vi]));
  const note = r.reason === 'stopped' ? `Bạn đã dừng sau ${r.words.length}/${r.totalWords} từ. Điểm chỉ tính trên các từ đã làm.`
    : r.reason === 'timeout' ? `Bài được tự động lưu vì không có thao tác trong 30 phút (đã làm ${r.words.length}/${r.totalWords} từ). Điểm tính trên các từ đã làm.` : null;
  root.replaceChildren(h('div', { class: 'stack' },
    h('h1', { text: 'Kết quả – ' + o.title }),
    h('div', { class: 'card row wrap', style: 'justify-content:space-around;text-align:center' },
      h('div', null, h('div', { class: 'score-big', text: r.score + '/' + r.maxScore }), h('div', { class: 'muted', text: 'Tổng điểm (mỗi từ tối đa 10)' })),
      h('div', null, h('div', { class: 'score-big', style: 'font-size:2.2rem', text: r.words.length + '/' + r.totalWords }), h('div', { class: 'muted', text: 'Từ đã làm' + (skipped ? ` · ${skipped} bỏ qua` : '') })),
      h('div', null, h('div', { class: 'score-big', style: 'font-size:2.2rem', text: fmtTime(r.totalMs) }), h('div', { class: 'muted', text: 'Tổng thời gian' }))),
    note ? h('div', { class: 'box warn', role: 'status', text: note }) : null,
    o.mode === 'assign' ? h('div', { class: 'card' }, o.status || 'Chưa làm từ nào nên không có điểm để lưu.') : h('div', { class: 'box', text: 'Chế độ làm thử – kết quả không được gửi đi.' }),
    r.words.length ? h('div', { class: 'card' }, h('h2', { text: 'Điểm từng từ' }),
      h('div', { class: 'chart', role: 'img', 'aria-label': 'Biểu đồ điểm từng từ' }, r.words.map(w => h('div', { class: 'bar' + (w.score < 6 ? ' low' : ''), title: `${w.word}: ${w.score}`, style: `height:${Math.max(4, w.score * 10)}%` })))) : null,
    h('div', { class: 'card' }, h('h2', { text: `Cần cải thiện (${weak.length})` }),
      weak.length ? h('div', { class: 'chips' }, weak.map(w => h('span', { class: 'chip', text: w.word }))) : h('p', { class: 'ok', text: r.words.length ? '🎉 Không có từ nào cần cải thiện!' : '—' })),
    r.words.length ? h('div', { class: 'table-wrap' }, h('table', null, h('caption', { class: 'center muted', text: 'Chi tiết từng từ' }),
      h('thead', null, h('tr', null, ['Từ', 'Lượt xem', 'Gõ sai', 'Điểm', 'Thời gian', 'Ghi chú'].map((t, i) => h('th', { class: i && i < 5 ? 'num' : '', scope: 'col', text: t })))),
      h('tbody', null, r.words.map(w => h('tr', null, h('td', { text: w.word }), h('td', { class: 'num', text: w.views }), h('td', { class: 'num', text: w.wrongCount }), h('td', { class: 'num', text: w.score }), h('td', { class: 'num', text: (w.timeMs / 1000).toFixed(1) + 's' }), h('td', { text: w.skipped ? 'Bỏ qua' : '' })))))) : null,
    h('div', { class: 'row wrap' },
      h('button', { class: 'btn primary', disabled: !weak.length, onclick: () => o.onRetry(weak.map(w => ({ en: w.word, vi: viMap.get(w.word) || '' }))) }, '↻ Làm lại chỉ các từ yếu'),
      h('button', { class: 'btn', onclick: () => o.onRetry(o.words) }, o.mode === 'assign' ? 'Làm thử lại (không tính điểm)' : 'Làm lại tất cả'),
      o.backHref ? h('a', { class: 'btn', href: o.backHref }, 'Về trang chủ') : null)));
  window.scrollTo(0, 0);
}
/** Điều phối: chạy bài → kết quả → làm lại từ yếu. Chỉ lần chạy đầu của bài giao (mode 'assign') mới lưu điểm & có giới hạn 30 phút */
function runFlow(root, cfg) {
  let cur = null;
  const begin = (words, mode) => {
    if (cur) cur.destroy();
    const list = cfg.shuffle ? shuffle(words) : words.slice();
    cur = RunView(root, { title: cfg.title, words: list, tts: cfg.tts, idleMs: mode === 'assign' ? cfg.idleMs : 0, onAutosave: mode === 'assign' ? cfg.onAutosave : null, onFinish: res => {
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
  if (q.kind === 'test') { const a = await loadTestAssignment(q); a.words = []; return a; }
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
      h('p', { class: 'muted', text: `${a.test ? qCount(a.test) + ' câu' + (a.test.limit ? ' · ' + a.test.limit + ' phút' : '') : a.words.length + ' từ'} · Hạn nộp: ${fmtDate(a.due)}` }),
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
      if (a.req && !nm) { err.textContent = 'Vui lòng nhập Họ và tên.'; return name.focus(); }
      if (a.req && !cl) { err.textContent = 'Vui lòng nhập Lớp.'; return cls.focus(); }
      if (bad.test(nm) || bad.test(cl)) { err.textContent = 'Họ tên/Lớp chứa ký tự không hợp lệ.'; return; }
      err.textContent = '';
      Store.set('student', { name: nm, cls: cl });
      clearInterval(timer);
      const sid = uid(), who = nm || 'Ẩn danh';   // mỗi lần làm có 1 mã cố định → lưu tạm/lưu cuối cùng cùng 1 dòng trên Sheet
      if (a.test) { flow = testFlow(root, { title: a.name, test: a.test, mode: 'assign', backHref: null, onAssignFinish: res => saveTestAttempt(a, who, cl, res, sid) }); return; }
      flow = runFlow(root, { title: a.name, words: a.words, tts: a.tts, shuffle: a.shuffle, mode: 'assign', backHref: null, idleMs: 30 * 60 * 1000,
        onAutosave: (res, opt) => saveAttempt(a, who, cl, res, 'partial', sid, opt),
        onAssignFinish: res => saveAttempt(a, who, cl, res, res.reason || 'done', sid, {}) ? statusChip(sid) : null });
    }
  }
  const counted = new Set();
  /** Lưu điểm của một lần làm (đầy đủ hoặc dở dang). Trả về false nếu chưa có từ nào để lưu */
  function saveAttempt(a, name, cls, res, status, sid, opt) {
    if (!res.words.length) return false;
    if (!counted.has(sid)) { counted.add(sid); const att = Store.get('attempts', {}); att[a.id] = (att[a.id] || 0) + 1; Store.set('attempts', att); }
    if (!API.validUrl(a.scriptUrl)) { Sync.emit(sid, 'rejected', 'Bài chưa cấu hình nơi nhận kết quả.'); return true; }
    Sync.upsert({ submissionId: sid, url: a.scriptUrl, payload: { action: 'submit', submissionId: sid, assignmentId: a.id, assignmentName: a.name, name, cls, score: res.score, maxScore: res.maxScore, totalMs: res.totalMs,
      details: res.words, totalWords: res.totalWords, status, submittedAt: new Date().toISOString(), userAgent: navigator.userAgent, due: a.due, max: a.max } }, opt);
    return true;
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
      res.replaceChildren(h('p', { class: r.teacher ? 'ok' : 'err', text: r.teacher ? '✓ Kết nối thành công và Teacher Key hợp lệ.' : '⚠ Kết nối được máy chủ nhưng Teacher Key trống hoặc sai – chưa mở được Bảng thống kê.' }),
        (r.v || 0) < 5 ? h('p', { class: 'err', text: '⚠ Apps Script chưa phải bản mới nhất (thiếu hỗ trợ đặt tên bài giao, lưu link, xóa dữ liệu bài hết hạn). Dán lại Code.gs rồi Deploy → Manage deployments → ✎ → Version: New version.' }) : null);
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
    (() => { const i = storageInfo(); return h('section', { class: 'card' }, h('h2', { text: 'Bộ nhớ trên máy' }),
      h('p', { text: `${Sets.list.length} bộ từ (${i.words.toLocaleString('vi-VN')} từ) · ${Tests.list.length} bài test (${i.qs.toLocaleString('vi-VN')} câu)` }),
      h('p', { class: 'hint', text: `Đang dùng khoảng ${i.mb} MB. Trình duyệt thường cho phép ~5 MB mỗi trang (dữ liệu được nén nên chứa được khoảng vài trăm nghìn từ). Hãy xuất data.json thường xuyên để sao lưu.` })); })(),
    h('section', { class: 'card' }, h('h2', { text: 'Dữ liệu trên máy' }), h('button', { class: 'btn danger', onclick: wipe }, '🗑 Xóa dữ liệu local'))));
  return { destroy() {} };
}

/* ===================== 10b. STATS VIEW (giáo viên) ===================== */
const STATUS_LABEL = { done: 'Hoàn thành', stopped: 'Dừng sớm', timeout: 'Tự lưu (30 phút)', partial: 'Tự lưu (thoát)' };
/** Tổng điểm các lần làm của từng học sinh, gom theo TÊN (không phân biệt hoa/thường, bỏ khoảng trắng thừa). split=true: tách thêm theo lớp */
function statsByStudent(rows, split) {
  const m = new Map();
  rows.forEach(r => {
    const key = Norm.text(r.name).toLowerCase() + (split ? '|' + Norm.text(r.cls).toLowerCase() : '');
    let e = m.get(key);
    if (!e) { e = { name: r.name, classes: new Set(), attempts: 0, total: 0, max: 0, best: 0, words: 0, time: 0, last: '' }; m.set(key, e); }
    e.attempts++; e.total += r.score; e.max += r.max; e.best = Math.max(e.best, r.score); e.words += r.words; e.time += r.totalMs;
    if (r.cls) e.classes.add(r.cls);
    if (String(r.submittedAt) > e.last) e.last = String(r.submittedAt);
  });
  return [...m.values()].map(e => ({ name: e.name, cls: [...e.classes].join(', '), attempts: e.attempts, total: e.total, max: e.max, best: e.best, words: e.words, time: e.time, last: e.last }));
}
function statsTopWords(rows) {
  const m = new Map();
  rows.forEach(r => r.details.forEach(d => {
    const e = m.get(d.word) || { word: d.word, wrong: 0, extra: 0, skip: 0, n: 0 };
    e.wrong += d.wrongCount; e.extra += Math.max(0, d.views - 1); e.skip += d.skipped ? 1 : 0; e.n++; m.set(d.word, e);
  }));
  return [...m.values()].filter(e => e.wrong + e.extra + e.skip > 0).sort((a, b) => (b.wrong + b.extra + b.skip) - (a.wrong + a.extra + a.skip)).slice(0, 10);
}
const STUDENT_COLS = [
  { k: 'name', label: 'Học sinh', get: r => r.name }, { k: 'cls', label: 'Lớp', get: r => r.cls },
  { k: 'attempts', label: 'Số lần làm', num: 1, get: r => r.attempts }, { k: 'total', label: 'Tổng điểm', num: 1, get: r => r.total },
  { k: 'max', label: 'Tổng tối đa', num: 1, get: r => r.max }, { k: 'best', label: 'Điểm cao nhất', num: 1, get: r => r.best },
  { k: 'words', label: 'Từ đã làm', num: 1, get: r => r.words }, { k: 'time', label: 'Tổng thời gian', num: 1, get: r => fmtTime(r.time) },
  { k: 'last', label: 'Lần gần nhất', get: r => fmtDate(r.last) }];
const sortRows = (rows, sort) => rows.slice().sort((a, b) => { const x = a[sort.key], y = b[sort.key]; return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'vi')) * sort.dir; });
const nextSort = (sort, k, textKeys) => ({ key: k, dir: sort.key === k ? -sort.dir : (textKeys.includes(k) ? 1 : -1) });
function sortTable(cap, cols, rows, sort, onSort) {
  return h('div', { class: 'table-wrap' }, h('table', null, h('caption', { class: 'center muted', text: cap }),
    h('thead', null, h('tr', null, cols.map(c => h('th', { scope: 'col', class: c.num ? 'num' : '', 'aria-sort': sort.key === c.k ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none' },
      h('button', { onclick: () => onSort(c.k) }, c.label + (sort.key === c.k ? (sort.dir > 0 ? ' ▲' : ' ▼') : '')))))),
    h('tbody', null, rows.map(r => h('tr', null, cols.map(c => h('td', { class: c.num ? 'num' : '', text: String(c.get(r)) })))))));
}
const pager = (page, pages, go) => h('div', { class: 'pager' }, h('button', { class: 'btn small', disabled: page <= 1, onclick: () => go(page - 1) }, '‹ Trước'),
  h('span', { text: `Trang ${page}/${pages}` }), h('button', { class: 'btn small', disabled: page >= pages, onclick: () => go(page + 1) }, 'Sau ›'));

/* ---------- Thông tin bài giao trong Thống kê: link copy lại được + xóa dữ liệu khi hết hạn ---------- */
function purgeLocalAssignment(id) {            // dọn dữ liệu của bài này đang lưu trong trình duyệt (số lần làm, hàng đợi gửi kết quả)
  const att = Store.get('attempts', {}); if (att && att[id] != null) { delete att[id]; Store.set('attempts', att); }
  const q = Sync.queue(), q2 = q.filter(x => !(x && x.payload && x.payload.assignmentId === id));
  if (q2.length !== q.length) Store.set('queue', q2);
}
function confirmPurge(a) {
  return new Promise(res => {
    let ok = false;
    const d = Modal.open('Xóa dữ liệu bài giao', h('div', { class: 'stack' },
      h('p', null, 'Bạn sắp xóa vĩnh viễn dữ liệu của bài giao ', h('strong', { text: a.name }), ':'),
      h('ul', null, h('li', { text: `${a.count || 0} lượt nộp / kết quả trên Google Sheet` }), h('li', { text: 'Dòng đăng ký bài (hạn nộp, link) và đề / bộ từ đã lưu trên Sheet' }), h('li', { text: 'Dữ liệu của bài này lưu trong trình duyệt (số lần làm, hàng đợi gửi)' })),
      h('p', { class: 'hint', text: 'Không thể hoàn tác. Thẻ bộ từ / bài test của bạn không bị xóa. Hãy xuất CSV/Excel trước nếu cần giữ điểm. Link đã giao sẽ không còn dùng được.' }),
      h('div', { class: 'row end' }, h('button', { class: 'btn', onclick: () => d.close() }, 'Hủy'), h('button', { class: 'btn danger', onclick: () => { ok = true; d.close(); } }, '🗑 Xóa vĩnh viễn'))), () => res(ok));
  });
}
function assignInfoCard(a, kind, onDeleted) {
  const st = Settings.data, expired = a.due > 0 && Date.now() > a.due;
  let link = a.link || '';
  if (!link && a.hasData && API.validUrl(st.scriptUrl)) link = location.href.split('#')[0] + (kind === 'test' ? '#/taketest?id=' : '#/assign?id=') + a.id + '&s=' + encodeURIComponent(st.scriptUrl);
  const box = h('textarea', { readonly: true, 'aria-label': 'Link giao bài', style: 'min-height:70px;font-size:.8rem', onfocus: e => e.target.select() }); box.value = link;
  const msg = h('p', { class: 'small-text', role: 'status' });
  const del = h('button', { class: 'btn danger', type: 'button', disabled: !!a.due && !expired, onclick: remove }, '🗑 Xóa dữ liệu bài này');
  async function remove() {
    if (!(await confirmPurge(a))) return;
    del.disabled = true; msg.className = 'muted small-text'; msg.textContent = 'Đang xóa…';
    try {
      const r = await API.post(st.scriptUrl, { action: 'deleteAssignment', teacherKey: st.teacherKey, id: a.id });
      if (!r.ok) throw new Error(r.message || r.error);
      purgeLocalAssignment(a.id); toast('Đã xóa dữ liệu bài “' + a.name + '”.'); onDeleted();
    } catch (e) { del.disabled = false; msg.className = 'err small-text'; msg.textContent = /Hành động/.test(e.message) ? 'Apps Script chưa được cập nhật. Dán lại Code.gs rồi Deploy → Manage deployments → ✎ → New version.' : e.message; }
  }
  return h('div', { class: 'card stack' },
    h('h2', { text: 'Thông tin bài giao' }),
    h('p', { class: 'muted', text: `${a.name} · Hạn nộp: ${a.due ? fmtDate(a.due) : '—'}` + (a.due ? (expired ? ' · đã hết hạn' : ' · còn hạn') : '') }),
    link ? h('div', { class: 'stack' }, h('label', { text: 'Link giao bài (copy lại để gửi học sinh)' }), box,
        h('div', { class: 'row wrap' }, h('button', { class: 'btn primary', type: 'button', onclick: async () => toast(await copyText(link, box) ? 'Đã sao chép link.' : 'Hãy chọn và copy thủ công.') }, '📋 Copy link')))
      : h('p', { class: 'hint', text: 'Link của bài này chưa được lưu (bài giao từ phiên bản cũ). Hãy tạo lại link từ thẻ ở trang chủ nếu cần.' }),
    h('div', { class: 'row wrap' }, del),
    h('p', { class: 'hint', text: a.due && !expired ? 'Nút xóa chỉ dùng được sau khi bài hết hạn nộp.' : 'Xóa toàn bộ kết quả, đăng ký bài và đề đã lưu của bài này (trên Google Sheet và trong app).' }), msg);
}

function StatsView(root) {
  const st = Settings.data;
  if (!st.teacherOk || !API.validUrl(st.scriptUrl)) {
    root.replaceChildren(h('div', { class: 'card empty' }, h('h1', { text: 'Bảng thống kê' }), h('p', { class: 'muted', text: 'Cần nhập Apps Script URL + Teacher Key hợp lệ (bấm "Kiểm tra kết nối") để xem thống kê.' }), h('a', { class: 'btn primary', href: '#/settings' }, 'Mở Cài đặt')));
    return {};
  }
  const PAGE = 10;
  const M = { rows: [], f: { name: '', cls: '', min: '', max: '' }, sort: { key: 'submittedAt', dir: -1 }, page: 1, cur: null, all: false, split: false, ssort: { key: 'total', dir: -1 }, spage: 1 };
  const resCols = () => [
    { k: 'name', label: 'Họ tên', get: r => r.name }, { k: 'cls', label: 'Lớp', get: r => r.cls },
    ...(M.all ? [{ k: 'an', label: 'Bài', get: r => r.an }] : []),
    { k: 'score', label: 'Tổng điểm', num: 1, get: r => r.score }, { k: 'max', label: 'Tối đa', num: 1, get: r => r.max },
    { k: 'words', label: 'Từ đã làm', num: 1, get: r => r.totalWords ? r.words + '/' + r.totalWords : r.words },
    { k: 'status', label: 'Trạng thái', get: r => STATUS_LABEL[r.status] || '—' },
    { k: 'totalMs', label: 'Thời gian', num: 1, get: r => fmtTime(r.totalMs) }, { k: 'weak', label: 'Từ yếu', num: 1, get: r => r.weak },
    { k: 'submittedAt', label: 'Nộp lúc', get: r => fmtDate(r.submittedAt) + (r.late ? ' (trễ)' : '') }];
  const body = h('div', { class: 'stack' }), picker = h('select', { id: 'sx-as', onchange: () => loadResults(picker.value) }), infoHost = h('div');
  root.replaceChildren(h('div', { class: 'stack' }, h('h1', { text: 'Bảng thống kê' }), h('div', null, h('label', { for: 'sx-as', text: 'Chọn bài đã giao' }), picker), infoHost, body));
  body.append(loading('Đang tải danh sách bài…'));
  (async () => {
    try {
      const r = await API.get(st.scriptUrl, { action: 'assignments', teacherKey: st.teacherKey });
      if (!r.ok) throw new Error(r.error === 'unauthorized' ? 'Teacher Key không đúng.' : (r.message || r.error));
      if (!r.assignments.length) { body.replaceChildren(h('div', { class: 'card empty', text: 'Chưa có bài nào được giao / chưa có kết quả.' })); return; }
      M.list = r.assignments;
      picker.replaceChildren(h('option', { value: '' }, '— Chọn —'), h('option', { value: 'all' }, '★ Tất cả các bài (tổng theo học sinh)'),
        r.assignments.map(a => h('option', { value: a.id }, `${a.name} · ${a.count} lượt nộp · hạn ${fmtDate(a.due)}`)));
      body.replaceChildren(h('p', { class: 'muted', text: 'Hãy chọn một bài ở trên.' }));
    } catch (e) { body.replaceChildren(errorPanel(e.message, h('button', { class: 'btn primary', onclick: () => StatsView(root) }, 'Thử lại'))); }
  })();

  function drawInfo(id) {
    const a = M.list && M.list.find(x => x.id === id);
    infoHost.replaceChildren(a ? assignInfoCard(a, 'vocab', () => StatsView(root)) : null);
  }
  async function loadResults(id) {
    drawInfo(id);
    if (!id) return;
    body.replaceChildren(loading('Đang tải kết quả…'));
    try {
      const r = await API.get(st.scriptUrl, { action: 'results', id, teacherKey: st.teacherKey });
      if (!r.ok) throw new Error(r.message || r.error);
      M.cur = r.assignment || { id, name: id }; M.all = id === 'all';
      M.rows = r.results.map(x => { const det = x.details || []; return { name: x.name, cls: x.cls, an: x.assignmentName || '', score: Number(x.score), max: det.length * 10, words: det.length, totalWords: Number(x.totalWords) || 0, status: x.status || '',
        totalMs: Number(x.totalMs), weak: det.filter(Scoring.needsWork).length, submittedAt: x.submittedAt, details: det, late: x.late }; });
      M.page = 1; M.spage = 1; layout();
    } catch (e) { body.replaceChildren(errorPanel(e.message, h('button', { class: 'btn', onclick: () => loadResults(id) }, 'Thử lại'))); }
  }
  const filtered = () => {
    const f = M.f, mn = f.min === '' ? -Infinity : Number(f.min), mx = f.max === '' ? Infinity : Number(f.max);
    return M.rows.filter(r => (!f.name || r.name.toLowerCase().includes(f.name.toLowerCase())) && (!f.cls || r.cls === f.cls) && r.score >= mn && r.score <= mx);
  };
  const view = () => { const rows = filtered(); return { rows: sortRows(rows, M.sort), studs: sortRows(statsByStudent(rows, M.split), M.ssort), top: statsTopWords(rows) }; };
  const tableHost = h('div'), studentHost = h('div'), topHost = h('div');
  function layout() {
    const classes = [...new Set(M.rows.map(r => r.cls))].filter(Boolean).sort();
    const inp = (id, label, k, type) => h('div', null, h('label', { for: id, text: label }), h('input', { type: type || 'text', id, value: M.f[k], oninput: e => { M.f[k] = e.target.value; M.page = 1; M.spage = 1; draw(); } }));
    body.replaceChildren(
      h('div', { class: 'filters' }, inp('f-name', 'Lọc theo tên', 'name'),
        h('div', null, h('label', { for: 'f-cls', text: 'Lớp' }), h('select', { id: 'f-cls', onchange: e => { M.f.cls = e.target.value; M.page = 1; M.spage = 1; draw(); } }, h('option', { value: '' }, 'Tất cả'), classes.map(c => h('option', { value: c, selected: c === M.f.cls }, c)))),
        inp('f-min', 'Tổng điểm từ', 'min', 'number'), inp('f-max', 'Đến', 'max', 'number')),
      h('div', { class: 'row wrap' },
        h('button', { class: 'btn', onclick: () => Exporter.csv(M.cur, view().rows) }, '⬇ CSV kết quả'),
        h('button', { class: 'btn', onclick: () => Exporter.csvStudents(M.cur, view().studs) }, '⬇ CSV tổng theo HS'),
        h('button', { class: 'btn', onclick: () => { const v = view(); Exporter.xlsx(M.cur, v.rows, v.top, v.studs); } }, '⬇ Excel'),
        h('button', { class: 'btn', onclick: () => { const v = view(); Exporter.pdf(M.cur, v.rows, v.top, v.studs); } }, '⬇ PDF')),
      h('h2', { text: 'Tổng điểm theo học sinh' }),
      h('p', { class: 'hint', text: 'Cộng điểm của mọi lần làm (kể cả lần dừng sớm/tự lưu) của cùng một tên học sinh (không phân biệt hoa/thường). Học sinh nên dùng đúng một tên cho mọi lần làm.' }),
      h('label', { class: 'check', for: 'f-split' }, h('input', { type: 'checkbox', id: 'f-split', checked: M.split, onchange: e => { M.split = e.target.checked; M.spage = 1; draw(); } }), 'Tách theo lớp (cùng tên nhưng khác lớp là hai học sinh)'),
      studentHost,
      h('h2', { text: 'Kết quả từng lần làm' }), tableHost,
      h('h2', { text: 'Top từ bị gõ sai / xem lại / bỏ qua nhiều nhất' }), topHost);
    draw();
  }
  function draw() {
    const rows = filtered(), v = view(), pages = Math.max(1, Math.ceil(rows.length / PAGE)); M.page = clamp(M.page, 1, pages);
    const avg = rows.length ? (rows.reduce((s, r) => s + r.score, 0) / rows.length).toFixed(1) : '—';
    const avgMax = rows.length ? (rows.reduce((s, r) => s + r.max, 0) / rows.length).toFixed(0) : '—';
    tableHost.replaceChildren(
      h('p', { class: 'muted', text: `${rows.length} lượt nộp · tổng điểm trung bình mỗi lượt ${avg}/${avgMax}` }),
      rows.length ? sortTable(M.cur ? M.cur.name : '', resCols(), v.rows.slice((M.page - 1) * PAGE, M.page * PAGE), M.sort, k => { M.sort = nextSort(M.sort, k, ['name', 'cls', 'an', 'status', 'submittedAt']); draw(); })
        : h('div', { class: 'card empty', text: 'Không có kết quả phù hợp bộ lọc.' }),
      rows.length > PAGE ? pager(M.page, pages, p => { M.page = p; draw(); }) : null);
    const sp = Math.max(1, Math.ceil(v.studs.length / PAGE)); M.spage = clamp(M.spage, 1, sp);
    studentHost.replaceChildren(
      v.studs.length ? sortTable('Tổng điểm theo học sinh', STUDENT_COLS, v.studs.slice((M.spage - 1) * PAGE, M.spage * PAGE), M.ssort, k => { M.ssort = nextSort(M.ssort, k, ['name', 'cls', 'last']); draw(); }) : h('p', { class: 'muted', text: 'Chưa có dữ liệu.' }),
      v.studs.length > PAGE ? pager(M.spage, sp, p => { M.spage = p; draw(); }) : null);
    const top = v.top, mx = Math.max(1, ...top.map(t => t.wrong + t.extra + t.skip));
    topHost.replaceChildren(top.length ? h('div', { class: 'stack' },
      h('p', { class: 'hint' }, h('span', { style: 'color:var(--danger)', text: '■ Gõ sai ' }), h('span', { style: 'color:var(--warn)', text: '■ Lượt xem thêm ' }), h('span', { style: 'color:var(--muted)', text: '■ Bỏ qua' })),
      h('div', { class: 'table-wrap' }, h('table', null, h('thead', null, h('tr', null, ['Từ', 'Gõ sai', 'Xem thêm', 'Bỏ qua', 'Số HS', 'Biểu đồ'].map((t, i) => h('th', { scope: 'col', class: i && i < 5 ? 'num' : '', text: t })))),
        h('tbody', null, top.map(t => h('tr', null, h('td', { text: t.word }), h('td', { class: 'num', text: t.wrong }), h('td', { class: 'num', text: t.extra }), h('td', { class: 'num', text: t.skip }), h('td', { class: 'num', text: t.n }),
          h('td', null, h('div', { class: 'hbar', role: 'img', 'aria-label': `${t.word}: ${t.wrong} lần sai, ${t.extra} lượt xem thêm, ${t.skip} lần bỏ qua`, style: `width:${Math.max(8, (t.wrong + t.extra + t.skip) / mx * 100)}%` },
            h('span', { class: 'w', style: `flex:${t.wrong}` }), h('span', { class: 'v', style: `flex:${t.extra}` }), h('span', { class: 's', style: `flex:${t.skip}` }))))))))) : h('p', { class: 'muted', text: 'Chưa có từ nào bị sai, xem lại hoặc bỏ qua.' }));
  }
  return { destroy() {} };
}

/* ===================== 10c. EXPORTER (CSV / Excel / PDF) ===================== */
const Exporter = {
  fname(a, ext) { return 'ketqua_' + String((a && a.name) || 'bai').replace(/[^\w\u00C0-\u1EF9-]+/g, '_').slice(0, 40) + '_' + new Date().toISOString().slice(0, 10) + '.' + ext; },
  resultRows: rows => rows.map(r => Object.assign({ 'Họ tên': safeCell(r.name), 'Lớp': safeCell(r.cls) }, r.an ? { 'Bài': safeCell(r.an) } : {},
    { 'Tổng điểm': r.score, 'Điểm tối đa': r.max, 'Từ đã làm': r.words, 'Tổng số từ': r.totalWords || '', 'Trạng thái': STATUS_LABEL[r.status] || '', 'Thời gian (giây)': Math.round(r.totalMs / 1000), 'Số từ yếu': r.weak, 'Nộp lúc': fmtDate(r.submittedAt) })),
  studentRows: st => st.map(e => ({ 'Học sinh': safeCell(e.name), 'Lớp': safeCell(e.cls), 'Số lần làm': e.attempts, 'Tổng điểm': e.total, 'Tổng tối đa': e.max, 'Điểm cao nhất': e.best, 'Từ đã làm': e.words, 'Tổng thời gian (giây)': Math.round(e.time / 1000), 'Lần gần nhất': fmtDate(e.last) })),
  wordRows: top => top.map(t => ({ 'Từ': safeCell(t.word), 'Gõ sai': t.wrong, 'Lượt xem thêm': t.extra, 'Bỏ qua': t.skip, 'Số học sinh': t.n })),
  csv(a, rows) {
    if (!window.Papa) return toast('Thư viện CSV chưa tải được.', 'error');
    download(this.fname(a, 'csv'), '\uFEFF' + Papa.unparse(this.resultRows(rows)), 'text/csv;charset=utf-8');
  },
  csvStudents(a, studs) {
    if (!window.Papa) return toast('Thư viện CSV chưa tải được.', 'error');
    download(this.fname(a, 'tong-theo-hs.csv').replace('.tong-theo-hs.csv', '_tong-theo-hs.csv'), '\uFEFF' + Papa.unparse(this.studentRows(studs)), 'text/csv;charset=utf-8');
  },
  xlsx(a, rows, top, studs) {
    if (!window.XLSX) return toast('Thư viện Excel chưa tải được.', 'error');
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(this.resultRows(rows)), 'Kết quả');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(this.studentRows(studs)), 'Tổng theo học sinh');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(this.wordRows(top)), 'Top từ khó');
    XLSX.writeFile(wb, this.fname(a, 'xlsx'));
  },
  /** PDF Unicode: vẽ bảng bằng canvas (font hệ thống có tiếng Việt) rồi nhúng ảnh vào jsPDF */
  pdf(a, rows, top, studs) {
    if (!window.jspdf) return toast('Thư viện PDF chưa tải được.', 'error');
    const doc = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const nm = (a && a.name) || '';
    const pages = [
      ...this.tablePages('Tổng điểm theo học sinh: ' + nm, ['Học sinh', 'Lớp', 'Số lần', 'Tổng điểm', 'Tổng tối đa', 'Cao nhất', 'Từ đã làm'], [.28, .14, .1, .12, .12, .12, .12],
        studs.map(e => [e.name, e.cls, String(e.attempts), String(e.total), String(e.max), String(e.best), String(e.words)])),
      ...this.tablePages('Kết quả từng lần làm: ' + nm, ['Họ tên', 'Lớp', 'Tổng điểm', 'Tối đa', 'Từ làm', 'Trạng thái', 'Thời gian', 'Nộp lúc'], [.22, .09, .1, .07, .09, .15, .1, .18],
        rows.map(r => [r.name, r.cls, String(r.score), String(r.max), String(r.words), STATUS_LABEL[r.status] || '—', fmtTime(r.totalMs), fmtDate(r.submittedAt)])),
      ...this.tablePages('Top từ gõ sai / xem lại / bỏ qua nhiều nhất', ['Từ', 'Gõ sai', 'Xem thêm', 'Bỏ qua', 'Số HS'], [.4, .15, .15, .15, .15], top.map(t => [t.word, String(t.wrong), String(t.extra), String(t.skip), String(t.n)]))
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
/** Khóa chế độ học sinh: mở link giao bài xong thì tab này chỉ được ở trang làm bài (giao diện giáo viên không truy cập được) */
/* ===================== 9e. BÀI TEST (đề kiểm tra nhiều dạng câu hỏi) ===================== */
const QTYPES = { mcq: 'Trắc nghiệm (1 đáp án)', multi: 'Nhiều đáp án đúng', tf: 'Đúng / Sai', short: 'Trả lời ngắn', fill: 'Điền vào chỗ trống', match: 'Nối cặp', order: 'Sắp xếp thứ tự', essay: 'Tự luận (giáo viên chấm)' };
const Tests = {
  list: [],
  load() { this.list = Store.getZ('tests', []).map(normTest); },
  save() { return Store.setZ('tests', this.list); },
  get(id) { return this.list.find(t => t.id === id); }
};
const cl = (s, n) => String(s == null ? '' : s).slice(0, n);
const round2 = n => Math.round(n * 100) / 100;
const cmp = s => Norm.text(s).toLowerCase().replace(/[.,!?;:]+$/, '');

/* ---------- YouTube (học sinh chỉ nghe, không điều khiển được) ---------- */
const Yt = {
  id(u) {
    u = String(u || '').trim(); if (!u) return '';
    const m = u.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/))([\w-]{11})/);
    return m ? m[1] : (/^[\w-]{11}$/.test(u) ? u : '');
  },
  time(v) {                                   // 90 | "90" | "1:30" | "0:01:30" → giây
    if (v == null || v === '') return 0;
    if (typeof v === 'number') return Math.max(0, v);
    const p = String(v).trim().split(':').map(Number);
    return p.some(isNaN) ? 0 : Math.max(0, p.reduce((a, x) => a * 60 + x, 0));
  },
  _p: null,
  api() {
    if (window.YT && window.YT.Player) return Promise.resolve();
    if (this._p) return this._p;
    this._p = new Promise((res, rej) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { if (prev) prev(); res(); };
      const s = h('script', { src: 'https://www.youtube.com/iframe_api' });
      s.onerror = () => { Yt._p = null; rej(new Error('Không tải được YouTube – kiểm tra kết nối mạng.')); };
      document.head.append(s);
    });
    return this._p;
  }
};
/** Nhận MỌI loại link âm thanh / video: YouTube, Vimeo, Google Drive, Dropbox, file .mp3/.mp4…, hoặc bất kỳ link https khác.
 *  Dữ liệu cũ (chỉ lưu mã YouTube 11 ký tự) vẫn đọc được. */
const Media = {
  EXT: /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac|weba|mp4|m4v|webm|mov|ogv)$/i,
  VID: /\.(mp4|m4v|webm|mov|ogv)$/i,
  NOEMBED: /(^|\.)(facebook\.com|fb\.watch|fb\.com|tiktok\.com|instagram\.com|zalo\.me|twitter\.com|x\.com)$/,
  parse(u) {
    u = String(u == null ? '' : u).trim(); if (!u) return null;
    const yid = Yt.id(u); if (yid) return { kind: 'yt', id: yid, url: u };
    if (/^\/\//.test(u)) u = 'https:' + u;
    else if (!/^[a-z][a-z0-9+.\-]*:/i.test(u) && /^[\w-]+(\.[\w-]+)+([\/?#]|$)/.test(u)) u = 'https://' + u;
    let x; try { x = new URL(u); } catch (_) { return null; }
    if (x.protocol === 'http:') x.protocol = 'https:';          // trang chạy https nên link http sẽ bị trình duyệt chặn → nâng lên https
    if (x.protocol !== 'https:' || x.href.length > 1000) return null;
    const host = x.hostname.toLowerCase().replace(/^www\./, '');
    if (host === 'drive.google.com' || host === 'docs.google.com' || host === 'drive.usercontent.google.com') {
      const id = (x.pathname.match(/\/d\/([\w-]{10,})/) || [])[1] || x.searchParams.get('id');
      if (id && /^[\w-]{10,}$/.test(id)) return { kind: 'drive', id, url: 'https://drive.google.com/file/d/' + id + '/view' };
    }
    if (/(^|\.)dropbox\.com$/.test(host)) { x.searchParams.delete('dl'); x.searchParams.set('raw', '1'); return { kind: 'file', url: x.href, video: Media.VID.test(x.pathname) }; }
    if (host === 'vimeo.com' || host === 'player.vimeo.com') {
      const m = x.pathname.match(/(\d{5,})(?:\/(\w+))?/), hh = (m && m[2]) || x.searchParams.get('h');
      if (m) return { kind: 'embed', url: x.href, embed: 'https://player.vimeo.com/video/' + m[1] + (hh ? '?h=' + hh : '') };
    }
    if (Media.NOEMBED.test(host)) return { kind: 'ext', url: x.href };
    if (Media.EXT.test(x.pathname)) return { kind: 'file', url: x.href, video: Media.VID.test(x.pathname) };
    return { kind: 'auto', url: x.href };                       // chưa rõ: thử phát như file, không được thì đưa nút mở tab mới
  },
  ok(u) { return !!Media.parse(u); },
  store(u) { const p = Media.parse(u); return p ? (p.kind === 'yt' ? p.id : p.url) : ''; },     // dạng lưu vào đề / link (YouTube giữ mã 11 ký tự như cũ)
  show(u) { const p = Media.parse(u); return !p ? String(u || '') : (p.kind === 'yt' ? 'https://youtu.be/' + p.id : p.url); },
  openUrl(p) { return p.kind === 'yt' ? 'https://www.youtube.com/watch?v=' + p.id : (p.url || '#'); }
};
/** Khung nghe: video bị phủ lớp chặn chuột, tắt phím tắt; chỉ có nút "Nghe" (giới hạn số lượt). review=true → nghe tự do.
 *  Nguồn: YouTube (IFrame API) · file âm thanh/video (thẻ audio/video) · Google Drive (file, dự phòng khung xem) · Vimeo (khung riêng) ·
 *  link khác → thử phát trực tiếp, không được thì hiện nút "Mở trong tab mới". */
function AudioClip(q, used, review, label) {
  const y = q.yt, start = y.start || 0, end = y.end || 0, max = review ? 0 : (y.plays || 0);
  const med = Media.parse(y.url) || { kind: 'ext', url: String(y.url || '') };
  const compact = !!y.hide || (med.kind === 'file' && !med.video);
  const verb = y.hide ? 'Nghe' : 'Xem';
  let eng = null, ready = false, playing = false, poll = null, dead = false, failed = false, free = false;
  const host = h('div', { class: 'yt-host' });
  const info = h('span', { class: 'muted small-text', role: 'status' });
  const btn = h('button', { class: 'btn primary', type: 'button', onclick: play }, '⏳ Đang tải…');
  const ext = h('a', { class: 'btn small', href: Media.openUrl(med), target: '_blank', rel: 'noopener noreferrer', style: 'display:none' }, '↗ Mở trong tab mới');
  const cover = h('div', { class: 'yt-cover' + (compact ? ' hide' : ''), 'aria-hidden': 'true' }, compact ? h('span', { class: 'yt-ico', text: '🎧' }) : null);
  const box = h('div', { class: 'yt-box' + (compact ? ' compact' : '') }, host, cover);
  const left = () => max ? Math.max(0, max - (used[q.id] || 0)) : Infinity;
  const refresh = () => {
    if (free) return;
    btn.disabled = failed || !ready || playing || left() === 0;
    btn.textContent = playing ? '🔊 Đang phát…' : (ready || failed ? '▶ ' + verb : '⏳ Đang tải…');
    if (!failed) info.textContent = max ? `Còn ${left()}/${max} lượt ${verb.toLowerCase()}` : `${verb} không giới hạn số lần`;
  };
  function killEngine() { clearInterval(poll); playing = false; if (eng) { try { eng.destroy(); } catch (_) {} eng = null; } host.replaceChildren(); }
  const giveUp = m => { if (dead) return; failed = true; killEngine(); info.textContent = '⚠ ' + m; info.className = 'err small-text'; ext.style.display = ''; refresh(); };
  function setFree(src, note) {                       // khung phát riêng: học sinh tự điều khiển, không đếm lượt
    killEngine(); free = true; ready = true; failed = false;
    box.classList.remove('compact'); box.classList.add('free'); cover.style.display = 'none';
    host.append(h('iframe', { src, title: 'Video', allow: 'autoplay; fullscreen; encrypted-media; picture-in-picture', allowfullscreen: true, referrerpolicy: 'strict-origin-when-cross-origin' }));
    btn.style.display = 'none'; info.className = 'muted small-text'; info.textContent = note || 'Video chạy trong khung riêng – không giới hạn số lượt nghe.'; ext.style.display = '';
  }
  function stop() { clearInterval(poll); if (playing) { playing = false; try { eng.pause(); } catch (_) {} } refresh(); }
  function play() {
    if (!ready || playing || free || failed || !eng || left() === 0) return;
    used[q.id] = (used[q.id] || 0) + 1; playing = true;
    let r; try { r = eng.play(); } catch (_) { playing = false; }
    if (r && r.catch) r.catch(() => { if (playing) { playing = false; used[q.id] = Math.max(0, (used[q.id] || 1) - 1); clearInterval(poll); info.textContent = '⚠ Trình duyệt không cho phát – hãy bấm lại.'; refresh(); } });
    clearInterval(poll);
    poll = setInterval(() => { try { if (end && eng.time() >= end) stop(); } catch (_) {} }, 250);
    refresh();
  }
  const ytErr = c => (c === 101 || c === 150 || c === 153) ? 'Chủ video không cho phép nhúng nên không phát ngay trong bài được. Bấm “Mở trong tab mới” để nghe/xem trên YouTube (hoặc nhờ giáo viên dùng link mp3/mp4, Google Drive).'
    : c === 100 ? 'Video đã bị xóa hoặc đang để chế độ riêng tư.' : 'Không phát được video này. Hãy báo giáo viên.';
  function mountYt() {
    Yt.api().then(() => {
      if (dead || failed) return;
      const ph = h('div'); host.append(ph);
      const pv = { controls: 0, disablekb: 1, fs: 0, rel: 0, modestbranding: 1, playsinline: 1, iv_load_policy: 3, start: Math.floor(start) };
      if (/^https?:/.test(location.protocol)) pv.origin = location.origin;
      const player = new window.YT.Player(ph, { videoId: med.id, width: '100%', height: '100%', playerVars: pv, events: {
        onReady: () => { ready = true; refresh(); },
        onStateChange: e => { if (e.data === 0) stop(); else if (e.data === 2 && playing) { try { player.playVideo(); } catch (_) {} } },   // chống tạm dừng
        onError: e => setTimeout(() => giveUp(ytErr(e && e.data)), 0) } });
      eng = { play() { player.seekTo(start, true); player.playVideo(); }, pause() { player.pauseVideo(); }, time: () => player.getCurrentTime(), destroy() { if (player.destroy) player.destroy(); } };
    }).catch(e => giveUp(e.message));
  }
  function mountMedia(src, isVideo, onFail) {
    const el = document.createElement(isVideo ? 'video' : 'audio');
    el.preload = 'auto'; el.controls = false; el.setAttribute('playsinline', ''); if (isVideo) el.className = 'yt-media';
    const t = setTimeout(() => { if (!ready && !dead && !free) onFail(); }, 15000);
    el.addEventListener('loadedmetadata', () => { clearTimeout(t); ready = true; refresh(); });
    el.addEventListener('error', () => { clearTimeout(t); if (!dead && !free) onFail(); });
    el.addEventListener('ended', stop);
    el.addEventListener('pause', () => { if (playing && !el.ended) { try { el.play(); } catch (_) {} } });   // chống tạm dừng
    el.src = src; host.append(el);
    eng = { play() { try { el.currentTime = start; } catch (_) {} return el.play(); }, pause() { el.pause(); }, time: () => el.currentTime,
      destroy() { clearTimeout(t); try { el.pause(); el.removeAttribute('src'); el.load(); } catch (_) {} } };
  }
  function mount() {
    if (med.kind === 'yt') return mountYt();
    if (med.kind === 'embed') return setFree(med.embed);
    if (med.kind === 'drive') return mountMedia('https://drive.google.com/uc?export=download&id=' + med.id, true,
      () => setFree('https://drive.google.com/file/d/' + med.id + '/preview', 'Google Drive phát trong khung riêng – không giới hạn số lượt nghe. (Nếu không có tiếng, giáo viên cần chia sẻ file ở chế độ “Bất kỳ ai có link”.)'));
    if (med.kind === 'file' || med.kind === 'auto') return mountMedia(med.url, med.kind === 'auto' || !!med.video, () => giveUp('Không phát trực tiếp được link này (máy chủ chặn hoặc không phải file âm thanh/video). Bấm “Mở trong tab mới” để xem.'));
    giveUp('Link này không nhúng được vào bài. Bấm “Mở trong tab mới” để xem.');
  }
  refresh(); mount();
  return { isPlaying: () => playing, el: h('div', { class: 'audio' }, label ? h('strong', { class: 'audio-label', text: label }) : null, box,
    h('div', { class: 'row wrap' }, btn, info, ext)),
  destroy() { dead = true; killEngine(); } };
}

/* ---------- Mô hình câu hỏi ---------- */
function newQ(type) {
  const q = { id: shortId(), type, text: '', pre: '', passage: '', img: '', yt: { url: '', start: '', end: '', plays: 2, hide: true }, points: 1, expl: '' };
  if (type === 'mcq') { q.opts = ['', '', '', '']; q.ans = [0]; }
  else if (type === 'multi') { q.opts = ['', '', '', '']; q.ans = []; }
  else if (type === 'tf') q.ans = true;
  else if (type === 'short') q.accept = [];
  else if (type === 'match') q.pairs = [['', ''], ['', ''], ['', '']];
  else if (type === 'order') q.items = ['', '', ''];
  else if (type === 'essay') q.sample = '';
  return q;
}
function normQ(q) {
  const n = Object.assign(newQ(QTYPES[q.type] ? q.type : 'mcq'), JSON.parse(JSON.stringify(q)));
  n.yt = Object.assign({ url: '', start: '', end: '', plays: 2, hide: true }, q.yt || {});
  return n;
}
function fillParts(text) {                    // "I {{am|'m}} here" → [{t:'I '},{a:['am',"'m"]},{t:' here'}]
  text = String(text || ''); const out = []; let last = 0;
  text.replace(/\{\{([^}]*)\}\}/g, (all, inner, off) => {
    if (off > last) out.push({ t: text.slice(last, off) });
    out.push({ a: inner.split('|').map(s => s.trim()).filter(Boolean) }); last = off + all.length; return all;
  });
  if (last < text.length) out.push({ t: text.slice(last) });
  return out;
}
/** Bản gọn, sạch dùng khi làm bài / đóng gói link / lưu lên Sheet */
function slimQ(q) {
  const s = { id: q.id, type: q.type, text: cl(q.text, 2000), points: clamp(Number(q.points) || 1, .25, 100) };
  if (q.pre && q.pre.trim()) s.pre = cl(q.pre, 1500);
  if (q.passage && q.passage.trim()) s.passage = cl(q.passage, 6000);
  if (q.img && /^https:\/\//i.test(q.img)) s.img = cl(q.img, 500);
  if (q.expl && q.expl.trim()) s.expl = cl(q.expl, 1500);
  const vid = q.yt && Media.store(q.yt.url);
  if (vid) s.yt = { url: vid, start: Yt.time(q.yt.start), end: Yt.time(q.yt.end), plays: clamp(parseInt(q.yt.plays, 10) || 0, 0, 20), hide: q.yt.hide !== false };
  if (q.type === 'mcq' || q.type === 'multi') {
    const keep = []; (q.opts || []).forEach((o, i) => { if (String(o).trim()) keep.push(i); });
    s.opts = keep.map(i => cl(Norm.text(q.opts[i]), 300)); s.ans = (q.ans || []).map(a => keep.indexOf(a)).filter(i => i >= 0);
  } else if (q.type === 'tf') s.ans = !!q.ans;
  else if (q.type === 'short') s.accept = (q.accept || []).map(x => cl(Norm.text(x), 200)).filter(Boolean);
  else if (q.type === 'match') s.pairs = (q.pairs || []).filter(p => String(p[0]).trim() && String(p[1]).trim()).map(p => [cl(Norm.text(p[0]), 200), cl(Norm.text(p[1]), 200)]);
  else if (q.type === 'order') s.items = (q.items || []).map(x => cl(Norm.text(x), 300)).filter(Boolean);
  else if (q.type === 'essay') { s.sample = cl(q.sample, 1500); s.points = 0; }
  return s;
}
function qProblem(q) {                        // '' = hợp lệ
  const s = slimQ(q);
  if (q.type !== 'fill' && !s.text.trim()) return 'thiếu nội dung câu hỏi';
  if (q.yt && q.yt.url && !s.yt) return 'link âm thanh/video không hợp lệ (cần bắt đầu bằng https://)';
  switch (q.type) {
    case 'mcq': if (s.opts.length < 2) return 'cần ít nhất 2 lựa chọn'; if (s.ans.length !== 1) return 'chưa chọn đáp án đúng'; break;
    case 'multi': if (s.opts.length < 2) return 'cần ít nhất 2 lựa chọn'; if (!s.ans.length) return 'chưa chọn đáp án đúng'; break;
    case 'short': if (!s.accept.length) return 'chưa có đáp án'; break;
    case 'fill': if (!fillParts(s.text).some(p => p.a && p.a.length)) return 'chưa có chỗ trống dạng {{đáp án}}'; break;
    case 'match': if (s.pairs.length < 2) return 'cần ít nhất 2 cặp'; break;
    case 'order': if (s.items.length < 2) return 'cần ít nhất 2 mục'; break;
  }
  return '';
}
/* ---------- Cấu trúc: Bài test → Phần (đoạn văn / bài nghe dùng chung) → Câu hỏi ---------- */
const defYt = plays => ({ url: '', start: '', end: '', plays: plays == null ? 2 : plays, hide: true });
function newSec(title) { return { id: shortId(), title: title || '', instr: '', passage: '', img: '', yt: defYt(1), questions: [] }; }
function normSec(s) {
  const n = Object.assign(newSec(), JSON.parse(JSON.stringify(s)));
  n.yt = Object.assign(defYt(1), s.yt || {}); n.questions = (s.questions || []).map(normQ); return n;
}
/** Dạng dùng khi soạn: đầy đủ trường. Đề cũ (danh sách câu phẳng) được gói vào một phần. */
function normTest(t) {
  if (!Array.isArray(t.sections)) { const s = newSec(''); s.questions = t.questions || []; t.sections = [s]; }
  delete t.questions; t.sections = t.sections.map(normSec); t.yt = Object.assign(defYt(1), t.yt || {}); return t;
}
/** Dạng dùng khi làm bài (đề gọn từ link/Sheet): chỉ gói đề cũ vào phần, không thêm trường mặc định */
function legacyWrap(t) {
  if (!Array.isArray(t.sections)) { t.sections = [{ id: 's1', title: '', instr: '', questions: t.questions || [] }]; delete t.questions; }
  return t;
}
const qCount = t => (t.sections || []).reduce((n, s) => n + s.questions.length, 0);
function slimYt(y) { const vid = y && Media.store(y.url); return vid ? { url: vid, start: Yt.time(y.start), end: Yt.time(y.end), plays: clamp(parseInt(y.plays, 10) || 0, 0, 20), hide: y.hide !== false } : null; }
function slimSec(s) {
  const o = { id: s.id, title: cl(s.title, 100), instr: cl(s.instr, 1000), questions: s.questions.map(slimQ) };
  if (s.passage && s.passage.trim()) o.passage = cl(s.passage, 30000);
  if (s.img && /^https:\/\//i.test(s.img)) o.img = cl(s.img, 500);
  const y = slimYt(s.yt); if (y) o.yt = y; return o;
}
const slimTest = t => {
  if (!t.sections) normTest(t);
  const o = { name: cl(t.name, 80), desc: cl(t.desc, 500), limit: clamp(parseInt(t.limit, 10) || 0, 0, 300), shuffleQ: !!t.shuffleQ, shuffleOpt: !!t.shuffleOpt, review: t.review !== false, sections: t.sections.slice(0, 50).map(slimSec) };
  const y = slimYt(t.yt); if (y) o.yt = y;
  let left = 500; o.sections.forEach(s => { s.questions = s.questions.slice(0, left); left -= s.questions.length; });
  o.sections = o.sections.filter(s => s.questions.length); return o;
};
function testProblems(t) {
  const out = []; if (!String(t.name || '').trim()) out.push('Chưa đặt tên bài test.');
  if (!qCount(t)) out.push('Bài test chưa có câu hỏi.');
  if (t.yt && t.yt.url && !Media.ok(t.yt.url)) out.push('Âm thanh cả bài: link không hợp lệ (cần bắt đầu bằng https://).');
  let no = 0;
  t.sections.forEach((s, si) => {
    if (!s.questions.length) out.push(`Phần ${si + 1} chưa có câu hỏi.`);
    if (s.yt && s.yt.url && !Media.ok(s.yt.url)) out.push(`Phần ${si + 1}: link âm thanh/video không hợp lệ (cần bắt đầu bằng https://).`);
    s.questions.forEach(q => { no++; const p = qProblem(q); if (p) out.push(`Câu ${no}: ${p}.`); });
  });
  return out;
}

/* ---------- Chấm điểm ---------- */
function blankOk(p, x) { return x != null && cmp(x) !== '' && p.a.some(a => cmp(a) === cmp(x)); }
function grade(q, v) {
  const pts = q.type === 'essay' ? 0 : (Number(q.points) || 1);
  let f = 0, blank = false;
  switch (q.type) {
    case 'mcq': blank = v == null; f = v === q.ans[0] ? 1 : 0; break;
    case 'tf': blank = v == null; f = v === q.ans ? 1 : 0; break;
    case 'multi': { const s = v || [], c = q.ans; blank = !s.length; const r = s.filter(x => c.includes(x)).length; f = Math.max(0, (r - (s.length - r)) / (c.length || 1)); break; }
    case 'short': blank = !cmp(v || ''); f = !blank && q.accept.some(a => cmp(a) === cmp(v)) ? 1 : 0; break;
    case 'fill': { const bl = fillParts(q.text).filter(p => p.a), vs = v || []; blank = !vs.some(x => cmp(x || '')); f = bl.length ? bl.filter((p, i) => blankOk(p, vs[i])).length / bl.length : 0; break; }
    case 'match': { const vs = v || []; blank = !vs.some(x => x != null && x !== ''); f = q.pairs.filter((p, i) => vs[i] != null && vs[i] !== '' && q.pairs[vs[i]][1] === p[1]).length / q.pairs.length; break; }
    case 'order': { blank = !v; const o = v || q.oinit; f = o.filter((x, k) => q.items[x] === q.items[k]).length / q.items.length; break; }
    case 'essay': return { got: 0, max: 0, ok: cmp(v || '') ? 'pending' : 'blank' };
  }
  return { got: round2(f * pts), max: pts, ok: blank ? 'blank' : f >= 1 ? 'right' : f > 0 ? 'partial' : 'wrong' };
}
function ansText(q, v) {
  let s = '';
  switch (q.type) {
    case 'mcq': s = v == null ? '' : q.opts[v]; break;
    case 'multi': s = (v || []).map(i => q.opts[i]).join(' | '); break;
    case 'tf': s = v == null ? '' : (v ? 'Đúng' : 'Sai'); break;
    case 'short': case 'essay': s = v || ''; break;
    case 'fill': s = (v || []).join(' | '); break;
    case 'match': s = q.pairs.map((p, i) => p[0] + '→' + ((v || [])[i] != null && (v || [])[i] !== '' ? q.pairs[v[i]][1] : '?')).join(' | '); break;
    case 'order': s = (v || q.oinit).map(x => q.items[x]).join(' > '); break;
  }
  return String(s == null ? '' : s);
}
function correctText(q) {
  switch (q.type) {
    case 'mcq': case 'multi': return q.ans.map(i => q.opts[i]).join(' | ');
    case 'tf': return q.ans ? 'Đúng' : 'Sai';
    case 'short': return q.accept.join('  /  ');
    case 'fill': return fillParts(q.text).filter(p => p.a).map((p, i) => `(${i + 1}) ${p.a.join(' / ')}`).join('   ');
    case 'match': return q.pairs.map(p => p[0] + ' → ' + p[1]).join('\n');
    case 'order': return q.items.map((x, i) => (i + 1) + '. ' + x).join('\n');
    case 'essay': return q.sample || '';
  }
  return '';
}
/** Chuẩn bị đề khi làm bài: đảo câu (trong từng phần) / lựa chọn / vế phải, xáo thứ tự khởi đầu; đánh số câu liên tục toàn bài */
function prepTest(t) {
  const idx = n => Array.from({ length: n }, (_, i) => i); let no = 0; const flat = [];
  const secs = t.sections.map((s, si) => {
    const base = t.shuffleQ ? shuffle(s.questions) : s.questions.slice();
    const qs = base.map(q => {
      const c = JSON.parse(JSON.stringify(q));
      c.perm = idx((c.opts || []).length); if (t.shuffleOpt && (c.type === 'mcq' || c.type === 'multi')) c.perm = shuffle(c.perm);
      c.rperm = shuffle(idx((c.pairs || []).length));
      let o = idx((c.items || []).length), tries = 0;
      if (o.length > 1) do { o = shuffle(o); } while (o.every((x, i) => c.items[x] === c.items[i]) && ++tries < 10);
      c.oinit = o; c.no = ++no; c.si = si; flat.push(c); return c;
    });
    return Object.assign({}, s, { qs, questions: null });
  });
  return { secs, flat };
}

/* ---------- Giao diện từng dạng câu hỏi (làm bài & xem lại dùng chung) ---------- */
function choiceList(q, items, sel, cor, multi, rv, set) {
  const wrap = h('div', { class: 'opts', role: multi ? 'group' : 'radiogroup' });
  items.forEach((it, k) => {
    const on = sel.has(it.key), isC = !!cor && cor.has(it.key);
    const inp = h('input', { type: multi ? 'checkbox' : 'radio', name: 'q' + q.id, checked: on, disabled: !!rv });
    wrap.append(h('label', { class: 'opt' + (on ? ' on' : '') + (rv ? (isC ? ' right' : on ? ' wrong' : '') : '') }, inp,
      h('span', { class: 'ltr', text: String.fromCharCode(65 + k) }), h('span', { class: 'ot pre', text: it.text }),
      rv && (isC || on) ? h('span', { class: 'mk', text: isC ? '✓' : '✗' }) : null));
  });
  if (!rv) wrap.addEventListener('change', () => {
    const ch = Array.from(wrap.querySelectorAll('input')), keys = ch.map((i, k) => i.checked ? items[k].key : null).filter(x => x !== null);
    ch.forEach(i => i.parentNode.classList.toggle('on', i.checked)); set(multi ? keys : keys[0]);
  });
  return wrap;
}
const R = {
  mcq: (q, v, set, rv) => choiceList(q, q.perm.map(i => ({ key: i, text: q.opts[i] })), new Set(v == null ? [] : [v]), rv ? new Set(q.ans) : null, false, rv, set),
  multi: (q, v, set, rv) => choiceList(q, q.perm.map(i => ({ key: i, text: q.opts[i] })), new Set(v || []), rv ? new Set(q.ans) : null, true, rv, set),
  tf: (q, v, set, rv) => choiceList(q, [{ key: true, text: 'Đúng' }, { key: false, text: 'Sai' }], new Set(v == null ? [] : [v]), rv ? new Set([q.ans]) : null, false, rv, set),
  short(q, v, set, rv) {
    const inp = h('input', { type: 'text', class: 'ans-in' + (rv ? (grade(q, v).ok === 'right' ? ' right' : ' wrong') : ''), value: v || '', disabled: !!rv, maxlength: 300, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', placeholder: 'Nhập câu trả lời…', 'aria-label': 'Câu trả lời' });
    if (!rv) inp.addEventListener('input', () => set(inp.value)); return inp;
  },
  essay(q, v, set, rv) {
    const ta = h('textarea', { class: 'essay', maxlength: 3000, disabled: !!rv, placeholder: 'Viết câu trả lời của bạn…', 'aria-label': 'Bài viết' }); ta.value = v || '';
    if (!rv) ta.addEventListener('input', () => set(ta.value)); return ta;
  },
  fill(q, v, set, rv) {
    const vals = (v || []).slice(), box = h('div', { class: 'fill pre' }); let bi = 0;
    fillParts(q.text).forEach(p => {
      if (p.t != null) return box.append(p.t);
      const i = bi++, inp = h('input', { type: 'text', class: 'blank' + (rv ? (blankOk(p, vals[i]) ? ' right' : ' wrong') : ''), value: vals[i] || '', disabled: !!rv, maxlength: 100,
        style: `width:${clamp(Math.max.apply(null, p.a.concat(['xxxxxx']).map(x => x.length)) + 3, 6, 28)}ch`, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': 'Chỗ trống ' + (i + 1) });
      if (!rv) inp.addEventListener('input', () => { vals[i] = inp.value; set(vals.slice()); });
      box.append(inp);
    });
    return box;
  },
  match(q, v, set, rv) {
    const vals = (v || []).slice(), box = h('div', { class: 'match' });
    q.pairs.forEach((p, i) => {
      const ok = vals[i] != null && vals[i] !== '' && q.pairs[vals[i]][1] === p[1];
      const sel = h('select', { 'aria-label': 'Ghép với: ' + p[0], disabled: !!rv, class: rv ? (ok ? 'right' : 'wrong') : '' },
        h('option', { value: '' }, '— chọn —'), q.rperm.map(j => h('option', { value: String(j), selected: vals[i] === j }, q.pairs[j][1])));
      if (!rv) sel.addEventListener('change', () => { vals[i] = sel.value === '' ? '' : Number(sel.value); set(vals.slice()); });
      box.append(h('div', { class: 'match-row' }, h('span', { class: 'ml pre', text: p[0] }), h('span', { 'aria-hidden': 'true', text: '→' }), sel));
    });
    return box;
  },
  order(q, v, set, rv) {
    let cur = (v && v.length === q.items.length) ? v.slice() : q.oinit.slice();
    const box = h('ol', { class: 'ord' });
    const mv = (k, d) => { const x = cur[k]; cur[k] = cur[k + d]; cur[k + d] = x; set(cur.slice()); draw(); const li = box.children[k + d], bs = li && li.querySelectorAll('button'); if (bs) (bs[d < 0 ? 0 : 1].disabled ? bs[d < 0 ? 1 : 0] : bs[d < 0 ? 0 : 1]).focus(); };
    function draw() {
      box.replaceChildren(cur.map((ix, k) => h('li', { class: rv ? (q.items[ix] === q.items[k] ? 'right' : 'wrong') : '' }, h('span', { class: 'ot pre', text: q.items[ix] }),
        rv ? null : h('span', { class: 'mv' },
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Chuyển lên', disabled: k === 0, onclick: () => mv(k, -1) }, '▲'),
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Chuyển xuống', disabled: k === cur.length - 1, onclick: () => mv(k, 1) }, '▼')))));
    }
    draw(); return box;
  }
};
/* ---------- Xem ảnh phóng to (bấm vào hình): nút +/−, lăn chuột, chụm 2 ngón, chạm đúp, kéo để di chuyển ---------- */
const Lightbox = {
  open(src, alt) {
    const prev = document.activeElement, MAX = 8, prevOv = document.body.style.overflow;
    let scale = 1, tx = 0, ty = 0, moved = false, lastTap = 0, pinch = 0;
    const ptrs = new Map();
    const img = h('img', { class: 'lb-img', src, alt: alt || 'Hình phóng to', draggable: 'false', referrerpolicy: 'no-referrer' });
    const stage = h('div', { class: 'lb-stage' }, img);
    const label = h('span', { class: 'lb-zoom', 'aria-live': 'off', text: '100%' });
    const rect = () => stage.getBoundingClientRect();
    const apply = () => { img.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + scale + ')'; label.textContent = Math.round(scale * 100) + '%'; stage.classList.toggle('pan', scale > 1); };
    const fit = () => { const r = rect(), mx = Math.max(0, (img.offsetWidth * scale - r.width) / 2), my = Math.max(0, (img.offsetHeight * scale - r.height) / 2); tx = clamp(tx, -mx, mx); ty = clamp(ty, -my, my); };
    const zoomAt = (ns, px, py) => { ns = clamp(ns, 1, MAX); const k = ns / scale; tx = px - (px - tx) * k; ty = py - (py - ty) * k; scale = ns; if (scale === 1) { tx = 0; ty = 0; } fit(); apply(); };
    const rel = (cx, cy) => { const r = rect(); return [cx - (r.left + r.width / 2), cy - (r.top + r.height / 2)]; };
    const pts = () => Array.from(ptrs.values());
    const dist = () => { const v = pts(); return Math.hypot(v[0][0] - v[1][0], v[0][1] - v[1][1]); };
    const mid = () => { const v = pts(); return [(v[0][0] + v[1][0]) / 2, (v[0][1] + v[1][1]) / 2]; };
    stage.addEventListener('pointerdown', e => { ptrs.set(e.pointerId, [e.clientX, e.clientY]); moved = false; try { stage.setPointerCapture(e.pointerId); } catch (_) {} if (ptrs.size === 2) pinch = dist(); });
    stage.addEventListener('pointermove', e => {
      const p = ptrs.get(e.pointerId); if (!p) return;
      const dx = e.clientX - p[0], dy = e.clientY - p[1]; p[0] = e.clientX; p[1] = e.clientY;
      if (ptrs.size === 2) { const d = dist(); if (pinch) { const m = mid(), c = rel(m[0], m[1]); zoomAt(scale * d / pinch, c[0], c[1]); } pinch = d; moved = true; }
      else if (scale > 1) { if (Math.abs(dx) + Math.abs(dy) > 1) moved = true; tx += dx; ty += dy; fit(); apply(); }
    });
    const up = e => {
      if (!ptrs.has(e.pointerId)) return; ptrs.delete(e.pointerId); pinch = 0;
      if (e.type === 'pointerup' && ptrs.size === 0 && !moved) {
        if (e.target !== img && scale === 1) return close();            // chạm vùng nền → đóng
        const now = Date.now();
        if (now - lastTap < 320) { const c = rel(e.clientX, e.clientY); zoomAt(scale > 1 ? 1 : 2.5, c[0], c[1]); lastTap = 0; } else lastTap = now;   // chạm đúp: phóng / thu
      }
    };
    stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
    stage.addEventListener('wheel', e => { e.preventDefault(); const c = rel(e.clientX, e.clientY); zoomAt(scale * (e.deltaY < 0 ? 1.2 : 1 / 1.2), c[0], c[1]); }, { passive: false });
    const bt = (txt, lab, fn) => h('button', { type: 'button', 'aria-label': lab, title: lab, onclick: fn }, txt);
    const closeBtn = bt('✕ Đóng', 'Đóng (Esc)', () => close());
    const bar = h('div', { class: 'lb-bar' }, bt('−', 'Thu nhỏ', () => zoomAt(scale / 1.3, 0, 0)), label, bt('+', 'Phóng to', () => zoomAt(scale * 1.3, 0, 0)),
      bt('Vừa khung', 'Về cỡ vừa khung', () => zoomAt(1, 0, 0)), h('a', { href: src, target: '_blank', rel: 'noopener noreferrer', 'aria-label': 'Mở ảnh gốc trong tab mới' }, '↗ Ảnh gốc'), closeBtn);
    const ov = h('div', { class: 'lb', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Xem ảnh phóng to' }, bar, stage);
    const onKey = e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
      else if (e.key === '+' || e.key === '=') zoomAt(scale * 1.25, 0, 0);
      else if (e.key === '-' || e.key === '_') zoomAt(scale / 1.25, 0, 0);
      else if (e.key === '0') zoomAt(1, 0, 0);
      else if (/^Arrow/.test(e.key) && scale > 1) { e.preventDefault(); const st = 60; if (e.key === 'ArrowLeft') tx += st; else if (e.key === 'ArrowRight') tx -= st; else if (e.key === 'ArrowUp') ty += st; else ty -= st; fit(); apply(); }
      else if (e.key === 'Tab') { const f = Array.from(bar.querySelectorAll('button,a')), i = f.indexOf(document.activeElement); e.preventDefault(); f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus(); }
    };
    function close() { document.removeEventListener('keydown', onKey, true); ov.remove(); document.body.style.overflow = prevOv; if (prev && prev.focus) { try { prev.focus(); } catch (_) {} } }
    document.addEventListener('keydown', onKey, true);
    document.body.style.overflow = 'hidden';
    (document.querySelector('dialog.modal[open]:not(.fallback)') || document.body).append(ov);
    closeBtn.focus();
    return { close };
  }
};
/** Hình có thể bấm để phóng to */
function zoomImg(src, alt) {
  const img = h('img', { class: 'q-img', src, alt, loading: 'lazy', referrerpolicy: 'no-referrer' });
  const badge = h('span', { class: 'zoom-badge', 'aria-hidden': 'true', text: '🔍 Phóng to' });
  const wrap = h('div', { class: 'zoom-wrap', role: 'button', tabindex: '0', title: 'Bấm để phóng to', 'aria-label': alt + ' – bấm để phóng to' }, img, badge);
  const open = () => Lightbox.open(src, alt);
  wrap.addEventListener('click', open);
  wrap.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  img.addEventListener('error', () => { badge.remove(); wrap.removeAttribute('role'); wrap.removeAttribute('tabindex'); wrap.classList.add('broken'); });
  return wrap;
}
/** Một câu hỏi hoàn chỉnh. st = { v, set, used, res (có → xem lại), flags, onFlag } */
function QFrame(q, no, st) {
  const rv = st.res || null, kids = [], cleanup = [];
  let flagBtn = null;
  if (!rv && st.flags) {
    const txt = () => st.flags[q.id] ? '🚩 Đã đánh dấu' : '⚑ Đánh dấu xem lại';
    flagBtn = h('button', { class: 'btn small ghost', type: 'button', 'aria-pressed': st.flags[q.id] ? 'true' : 'false', onclick: e => { st.flags[q.id] = !st.flags[q.id]; e.currentTarget.setAttribute('aria-pressed', st.flags[q.id] ? 'true' : 'false'); e.currentTarget.textContent = txt(); if (st.onFlag) st.onFlag(q); } }, txt());
  }
  kids.push(h('div', { class: 'q-head' }, h('span', { class: 'qno', text: String(no) }), h('span', { class: 'muted small-text q-meta', text: QTYPES[q.type] + (q.type === 'essay' ? '' : ` · ${q.points} điểm`) }), flagBtn));
  if (q.pre) kids.unshift(h('div', { class: 'sec-instr pre', text: q.pre }));
  if (q.passage) kids.push(h('div', { class: 'passage pre', text: q.passage }));
  if (q.yt) { const a = AudioClip(q, st.used || {}, !!rv); kids.push(a.el); cleanup.push(a.destroy); }
  if (q.img) kids.push(zoomImg(q.img, 'Hình minh họa'));
  kids.push(q.type === 'fill' ? h('p', { class: 'muted small-text', text: 'Điền vào chỗ trống:' }) : h('h3', { class: 'q-text pre', text: q.text }));
  kids.push(R[q.type](q, st.v, st.set || (() => {}), rv));
  if (rv) {
    const m = { right: ['ok', '✓ Chính xác'], partial: ['mid', '◐ Đúng một phần'], wrong: ['bad', '✗ Chưa đúng'], blank: ['bad', '— Chưa trả lời'], pending: ['mid', '✎ Chờ giáo viên chấm'] }[rv.ok];
    kids.push(h('div', { class: 'verdict ' + m[0], role: 'status', text: m[1] + (q.type === 'essay' ? '' : ` (${rv.got}/${rv.max} điểm)`) }));
    if (rv.ok !== 'right') {
      const ct = correctText(q);
      if (ct) kids.push(h('div', { class: 'box' }, h('strong', { text: q.type === 'essay' ? 'Gợi ý đáp án: ' : 'Đáp án đúng: ' }), h('span', { class: 'pre', text: ct })));
      if (rv.ok !== 'pending' || q.expl) kids.push(h('div', { class: 'box expl' }, h('strong', { text: 'Giải thích: ' }), h('span', { class: 'pre', text: q.expl || 'Giáo viên chưa thêm giải thích cho câu này.' })));
    }
  }
  return { el: h('div', { class: 'stack qf', id: 'qb-' + q.id }, kids), destroy() { cleanup.forEach(f => f()); } };
}

/* ---------- Làm bài: bố cục kiểu IELTS / Cambridge ----------
   Thanh trên: tên bài + đồng hồ · Thanh âm thanh (cố định, học sinh chỉ bấm Nghe) ·
   Giữa: đoạn văn (trái) | các câu của phần (phải), cuộn độc lập · Thanh dưới: các phần + số câu (đã làm / đánh dấu) */
function AudioDock(srcs, used) {
  const el = h('div', { class: 'dock', style: 'display:none', role: 'region', 'aria-label': 'Bài nghe' }), clips = {};
  return {
    el,
    sync(si) {
      let any = false;
      srcs.forEach(s => {
        const c = clips[s.id], vis = s.si === -1 || s.si === si || (c && c.isPlaying());
        if (vis) { any = true; if (!c) { clips[s.id] = AudioClip({ id: s.id, yt: s.yt }, used, false, s.label); el.append(clips[s.id].el); } else c.el.style.display = ''; }
        else if (c) c.el.style.display = 'none';
      });
      el.style.display = any ? '' : 'none';
    },
    destroy() { Object.keys(clips).forEach(k => clips[k].destroy()); }
  };
}
function SectionView(sec, ctx) {
  const rs = ctx.rs, cleanup = [];
  const frames = sec.qs.map(q => QFrame(q, q.no, { v: ctx.ans[q.id], set: v => ctx.set(q, v), used: ctx.used, flags: rs ? null : ctx.flags, onFlag: ctx.onFlag, res: rs ? rs[q.id] : null }));
  frames.forEach(f => cleanup.push(f.destroy));
  const extra = [];
  if (sec.instr) extra.push(h('div', { class: 'sec-instr pre', text: sec.instr }));
  if (rs && sec.yt) { const a = AudioClip({ id: 'rv' + sec.id, yt: sec.yt }, {}, true, '🎧 Nghe lại'); extra.push(a.el); cleanup.push(a.destroy); }
  const pass = (sec.passage || sec.img) ? h('div', { class: 'pane pass', tabindex: '0', role: 'region', 'aria-label': 'Đoạn văn' },
    sec.title ? h('h2', { text: sec.title }) : null, sec.img ? zoomImg(sec.img, 'Hình minh họa của phần') : null,
    sec.passage ? h('div', { class: 'pre passage-text', text: sec.passage }) : null) : null;
  const qpane = h('div', { class: 'pane qs stack', role: 'region', 'aria-label': 'Câu hỏi' }, !pass && sec.title ? h('h2', { text: sec.title }) : null, extra, frames.map(f => f.el));
  return { el: h('div', { class: 'split' + (pass ? '' : ' one') }, pass, qpane), destroy() { cleanup.forEach(f => f()); },
    scrollTo(qid) { const e = qpane.querySelector('#qb-' + qid); if (e) { e.scrollIntoView({ behavior: 'smooth', block: 'center' }); const i = e.querySelector('input,select,textarea'); if (i && i.focus) i.focus({ preventScroll: true }); } } };
}
function TestRun(root, cfg) {
  const t = cfg.test, P = prepTest(t), secs = P.secs, flat = P.flat, N = flat.length, ans = {}, used = {}, flags = {}, done = {}, btns = {};
  const t0 = Date.now(), deadline = t.limit ? t0 + t.limit * 60000 : 0;
  let si = 0, view = null, finished = false, tick = null;
  const srcs = []; if (t.yt) srcs.push({ id: 'test', yt: t.yt, si: -1, label: '🎧 Bài nghe (toàn bài test)' });
  secs.forEach((s, i) => { if (s.yt) srcs.push({ id: 'sec' + s.id, yt: s.yt, si: i, label: '🎧 ' + (s.title || 'Bài nghe của phần ' + (i + 1)) }); });
  const dock = AudioDock(srcs, used);
  const timerEl = h('span', { class: 'pill', role: 'timer' }), prog = h('span', { class: 'pill' }), stage = h('div'), nav = h('nav', { class: 'runnav', 'aria-label': 'Điều hướng các phần và câu hỏi' });
  const answered = q => grade(q, ans[q.id]).ok !== 'blank', cnt = () => flat.filter(q => done[q.id]).length;
  const updBtn = q => { const b = btns[q.id]; if (b) { b.classList.toggle('done', !!done[q.id]); b.classList.toggle('flag', !!flags[q.id]); } };
  const setAns = (q, v) => { ans[q.id] = v; done[q.id] = answered(q); updBtn(q); prog.textContent = `Đã làm ${cnt()}/${N}`; };
  function paintNav() {
    Object.keys(btns).forEach(k => { delete btns[k]; });
    nav.replaceChildren(h('div', { class: 'nav-in' }, secs.map((s, i) => {
      const name = s.title || ('Phần ' + (i + 1));
      if (i !== si) return h('button', { type: 'button', class: 'nav-sec', onclick: () => show(i) }, `${name} · ${s.qs.filter(q => done[q.id]).length}/${s.qs.length}`);
      return h('div', { class: 'nav-sec cur', 'aria-current': 'true' }, h('span', { class: 'nav-t', text: name }),
        s.qs.map(q => { const b = h('button', { type: 'button', class: 'pal-b' + (done[q.id] ? ' done' : '') + (flags[q.id] ? ' flag' : ''), 'aria-label': 'Câu ' + q.no, onclick: () => view.scrollTo(q.id) }, String(q.no)); btns[q.id] = b; return b; }));
    }),
    secs.length > 1 ? h('div', { class: 'nav-arrows' }, h('button', { class: 'btn small', disabled: si === 0, onclick: () => show(si - 1) }, '‹ Phần trước'), h('button', { class: 'btn small', disabled: si === secs.length - 1, onclick: () => show(si + 1) }, 'Phần sau ›')) : null));
  }
  function show(i) {
    if (view) view.destroy(); si = i;
    view = SectionView(secs[i], { ans, set: setAns, used, flags, onFlag: updBtn, rs: null });
    stage.replaceChildren(view.el); dock.sync(i); paintNav(); window.scrollTo(0, 0);
  }
  async function submit(auto) {
    if (finished) return;
    const un = flat.filter(q => !answered(q)).length;
    if (!auto && !await Modal.confirm(un ? `Còn ${un} câu chưa trả lời. Nộp bài ngay?` : 'Nộp bài? Sau khi nộp không thể sửa đáp án.', 'Nộp bài')) return;
    if (finished) return; finished = true; clearInterval(tick); window.onbeforeunload = null; if (view) view.destroy(); dock.destroy();
    const rl = flat.map(q => grade(q, ans[q.id])), rs = {}; flat.forEach((q, i) => { rs[q.id] = rl[i]; });
    cfg.onFinish({ score: round2(rl.reduce((s, r) => s + r.got, 0)), max: round2(rl.reduce((s, r) => s + r.max, 0)), totalMs: Math.min(Date.now() - t0, deadline ? t.limit * 60000 : Infinity), secs, flat, ans, rs, auto: !!auto,
      items: flat.map((q, i) => ({ id: q.id, q: q.text.slice(0, 80), t: q.type, a: ansText(q, ans[q.id]).slice(0, 120), g: rl[i].got, m: rl[i].max, ok: rl[i].ok })) });
  }
  const clock = () => {
    if (!deadline) { timerEl.textContent = '⏱ ' + fmtTime(Date.now() - t0); return; }
    const left = deadline - Date.now(); timerEl.textContent = '⏳ Còn ' + fmtTime(Math.max(0, left)); timerEl.classList.toggle('warn', left < 300000);
    if (left <= 0) submit(true);
  };
  root.classList.add('wide');
  root.replaceChildren(h('div', { class: 'run-test' },
    h('div', { class: 'run-hud' }, h('strong', { class: 'run-title', text: cfg.title }), h('div', { class: 'grp' }, prog, timerEl, h('button', { class: 'btn primary small', onclick: () => submit(false) }, '✔ Nộp bài'))),
    dock.el, stage, nav));
  prog.textContent = `Đã làm 0/${N}`; window.onbeforeunload = () => 'Bài test chưa nộp. Bạn có chắc muốn thoát?';
  clock(); tick = setInterval(clock, 1000); show(0);
  return { destroy() { finished = true; clearInterval(tick); window.onbeforeunload = null; if (view) view.destroy(); dock.destroy(); root.classList.remove('wide'); } };
}
/** Kết quả: điểm từng phần; bấm số câu → mở đúng phần đó (đoạn văn + mọi câu có đúng/sai, đáp án, giải thích) và cuộn tới câu */
function TestResult(root, o) {
  const r = o.res, t = o.test, pct = r.max ? Math.round(r.score / r.max * 100) : 0, N = r.flat.length;
  let view = null, cur = -1, focus = -1;
  const pane = h('div', { class: 'stack', style: 'display:none' }), pal = h('div', { class: 'stack' });
  const cls = x => ({ right: 'ok', wrong: 'bad', blank: 'bad', partial: 'mid', pending: 'pend' })[x.ok];
  const lab = x => ({ right: 'đúng', wrong: 'sai', blank: 'chưa trả lời', partial: 'đúng một phần', pending: 'chờ chấm' })[x.ok];
  function paint() {
    pal.replaceChildren(r.secs.map((s, i) => h('div', { class: 'res-sec' }, h('span', { class: 'nav-t', text: (s.title || 'Phần ' + (i + 1)) + ' · ' + round2(s.qs.reduce((a, q) => a + r.rs[q.id].got, 0)) + '/' + round2(s.qs.reduce((a, q) => a + r.rs[q.id].max, 0)) }),
      h('div', { class: 'pal' }, s.qs.map(q => h('button', { type: 'button', class: 'pal-b ' + cls(r.rs[q.id]) + (r.flat.indexOf(q) === focus ? ' cur' : ''), 'aria-label': `Câu ${q.no}: ${lab(r.rs[q.id])}`, onclick: () => open(q) }, String(q.no)))))));
  }
  function open(q) {
    const i = q.si; focus = r.flat.indexOf(q);
    if (i !== cur) {
      if (view) view.destroy(); cur = i;
      view = SectionView(r.secs[i], { ans: r.ans, rs: r.rs, used: {}, flags: null, set: () => {} });
      pane.replaceChildren(h('div', { class: 'row wrap' },
        h('button', { class: 'btn small', disabled: i === 0, onclick: () => open(r.secs[i - 1].qs[0]) }, '‹ Phần trước'), h('button', { class: 'btn small', disabled: i === r.secs.length - 1, onclick: () => open(r.secs[i + 1].qs[0]) }, 'Phần sau ›'),
        h('button', { class: 'btn small', onclick: () => { for (let k = 1; k <= N; k++) { const j = (focus + k) % N; if (r.rs[r.flat[j].id].ok !== 'right') return open(r.flat[j]); } toast('Không còn câu nào chưa đúng.'); } }, 'Câu chưa đúng tiếp theo ↷')), view.el);
      pane.style.display = '';
    }
    paint(); pane.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); setTimeout(() => view.scrollTo(q.id), 80);
  }
  const counts = { right: 0, partial: 0, wrong: 0 }; r.flat.forEach(q => { const x = r.rs[q.id]; if (x.ok === 'right') counts.right++; else if (x.ok === 'partial') counts.partial++; else if (x.ok !== 'pending') counts.wrong++; });
  const pending = r.flat.filter(q => r.rs[q.id].ok === 'pending').length;
  root.classList.add('wide');
  root.replaceChildren(h('div', { class: 'stack' }, h('h1', { text: 'Kết quả – ' + o.title }),
    h('div', { class: 'card row wrap', style: 'justify-content:space-around;text-align:center' },
      h('div', null, h('div', { class: 'score-big', text: r.score + '/' + r.max }), h('div', { class: 'muted', text: 'Điểm (' + pct + '%)' })),
      h('div', null, h('div', { class: 'score-big', style: 'font-size:2.2rem', text: `${counts.right}✓ ${counts.partial}◐ ${counts.wrong}✗` }), h('div', { class: 'muted', text: 'Đúng · Một phần · Sai' })),
      h('div', null, h('div', { class: 'score-big', style: 'font-size:2.2rem', text: fmtTime(r.totalMs) }), h('div', { class: 'muted', text: 'Thời gian' }))),
    r.auto ? h('div', { class: 'box warn', role: 'status', text: 'Hết giờ – bài đã được nộp tự động.' }) : null,
    pending ? h('div', { class: 'box', text: `${pending} câu tự luận sẽ do giáo viên chấm; chưa tính vào điểm.` }) : null,
    o.mode === 'assign' ? h('div', { class: 'card' }, o.status) : h('div', { class: 'box', text: 'Chế độ làm thử – kết quả không được gửi đi.' }),
    t.review ? h('div', { class: 'card stack' }, h('h2', { text: 'Xem lại từng câu' }), h('p', { class: 'hint', text: 'Bấm vào số câu để mở đúng phần đó, xem đáp án đúng/sai và giải thích ngay tại câu. Xanh = đúng · Vàng = một phần · Đỏ = sai/bỏ trống.' }), pal)
      : h('div', { class: 'box', text: 'Giáo viên đã tắt chế độ xem lại đáp án cho bài này.' }),
    t.review ? pane : null,
    h('div', { class: 'row wrap' }, o.mode === 'practice' ? h('button', { class: 'btn primary', onclick: o.onRetry }, '↻ Làm lại') : null, o.backHref ? h('a', { class: 'btn', href: o.backHref }, 'Về trang chủ') : null)));
  paint(); window.scrollTo(0, 0);
  return { destroy() { if (view) view.destroy(); root.classList.remove('wide'); } };
}
function testFlow(root, cfg) {
  let cur = null;
  const begin = mode => {
    if (cur) cur.destroy();
    cur = TestRun(root, { test: cfg.test, title: cfg.title, onFinish: res => {
      cur.destroy(); const status = mode === 'assign' ? cfg.onAssignFinish(res) : null;
      cur = TestResult(root, { res, test: cfg.test, title: cfg.title, mode, status, backHref: cfg.backHref, onRetry: () => begin('practice') });
    } });
  };
  begin(cfg.mode);
  return { destroy() { if (cur) cur.destroy(); } };
}
function TestPracticeView(root, id) {
  const t = Tests.get(id);
  if (!t) { root.replaceChildren(errorPanel('Không tìm thấy bài test này.')); return {}; }
  const bad = testProblems(t);
  if (bad.length) { root.replaceChildren(errorPanel('Bài test chưa hợp lệ: ' + bad.slice(0, 3).join(' '), h('a', { class: 'btn primary', href: '#/test-edit/' + id }, 'Mở trình soạn'))); return {}; }
  return testFlow(root, { title: t.name, test: slimTest(t), mode: 'practice', backHref: '#/' });
}
function saveTestAttempt(a, name, cls, res, sid) {
  const att = Store.get('attempts', {}); att[a.id] = (att[a.id] || 0) + 1; Store.set('attempts', att);
  if (!API.validUrl(a.scriptUrl)) Sync.emit(sid, 'rejected', 'Bài chưa cấu hình nơi nhận kết quả.');
  else Sync.upsert({ submissionId: sid, url: a.scriptUrl, payload: { action: 'submitTest', submissionId: sid, assignmentId: a.id, assignmentName: a.name, name, cls, score: res.score, maxScore: res.max, totalMs: res.totalMs,
    items: res.items, submittedAt: new Date().toISOString(), userAgent: navigator.userAgent, due: a.due, max: a.max } });
  return statusChip(sid);
}
function decodeTestLink(d) {
  let p;
  try {
    p = JSON.parse(Link.unpack(d) || 'null');
    if (!p || p.v !== 1 || !p.id || !p.test) throw new Error('schema');
    legacyWrap(p.test); if (!qCount(p.test)) throw new Error('schema');
  } catch (_) { throw new Error('Link bài test bị hỏng hoặc không giải nén được. Hãy xin giáo viên gửi lại link đầy đủ.'); }
  return { id: String(p.id), name: String(p.n || p.test.name || 'Bài test'), test: p.test, due: Number(p.due) || 0, max: Number(p.max) || 0, req: !!p.req, scriptUrl: p.u || '' };
}
async function loadTestAssignment(q) {
  if (q.d) { if (!window.LZString) throw new Error('Thư viện giải nén chưa tải được – hãy kiểm tra mạng và tải lại trang.'); return decodeTestLink(q.d); }
  if (q.id && q.s) {
    if (!API.validUrl(q.s)) throw new Error('Link không hợp lệ: địa chỉ máy chủ không đúng.');
    const r = await API.get(q.s, { action: 'getTest', id: q.id });
    if (!r.ok) throw new Error(r.error === 'not_found' ? 'Không tìm thấy bài test này trên máy chủ.' : (r.message || 'Không tải được bài test.'));
    const a = r.assignment; if (!a.test) throw new Error('Bài test chưa có câu hỏi.'); legacyWrap(a.test); if (!qCount(a.test)) throw new Error('Bài test chưa có câu hỏi.');
    return { id: a.id, name: a.name, test: a.test, due: Number(a.due) || 0, max: Number(a.max) || 0, req: !!a.req, scriptUrl: q.s };
  }
  throw new Error('Link thiếu dữ liệu bài test.');
}

/* ---------- Nhập / xuất CSV – Excel ----------
   Thứ tự dòng: [meta] → section → các câu của phần → section → … (câu trước dòng section đầu tiên tự vào "Phần 1") */
const TCOLS = ['type', 'question', 'answer', 'options', 'points', 'explanation', 'passage', 'audio_url', 'audio_start', 'audio_end', 'max_plays', 'hide_video', 'image_url'];
const TestIO = {
  key: k => String(k || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase().trim().replace(/[\s\-]+/g, '_').replace(/^\ufeff/, ''),
  ALIAS: { type: ['type', 'loai', 'loai_cau_hoi', 'dang'], question: ['question', 'cau_hoi', 'text', 'noi_dung', 'title'], answer: ['answer', 'answers', 'dap_an'], options: ['options', 'choices', 'lua_chon'], points: ['points', 'point', 'diem'],
    explanation: ['explanation', 'explain', 'giai_thich'], passage: ['passage', 'reading', 'doan_van'], audio_url: ['audio_url', 'youtube', 'youtube_url', 'video', 'audio', 'link'], audio_start: ['audio_start', 'start', 'bat_dau'],
    audio_end: ['audio_end', 'end', 'ket_thuc'], max_plays: ['max_plays', 'plays', 'so_lan_nghe'], hide_video: ['hide_video', 'audio_only', 'an_hinh'], image_url: ['image_url', 'image', 'anh', 'hinh_anh'] },
  typeOf(s) {
    s = TestIO.key(s).replace(/_/g, ''); if (!s) return '';
    if (/^(meta|info|tieude)/.test(s)) return 'meta';
    if (/^(section|part|phan)/.test(s)) return 'section';
    if (/^(multi|nhieu|checkbox|msq|mrq)/.test(s)) return 'multi';
    if (/^(mcq|mc|single|tracnghiem|choice|multiplechoice)/.test(s)) return 'mcq';
    if (/^(tf|truefalse|dungsai|boolean)/.test(s)) return 'tf';
    if (/^(short|text|tralois?ngan|shortanswer|input)/.test(s)) return 'short';
    if (/^(fill|blank|cloze|dien)/.test(s)) return 'fill';
    if (/^(match|noi|pair)/.test(s)) return 'match';
    if (/^(order|sort|sapxep|ordering|sequence)/.test(s)) return 'order';
    if (/^(essay|tuluan|writing|open)/.test(s)) return 'essay';
    return '?';
  },
  split: s => String(s || '').split(/\||\n/).map(x => x.trim()).filter(Boolean),
  readFile(file) {
    return new Promise((resolve, reject) => {
      const name = file.name.toLowerCase();
      if (/\.(csv|tsv|txt)$/.test(name)) {
        if (!window.Papa) return reject(new Error('Thư viện CSV chưa tải được – kiểm tra mạng.'));
        Papa.parse(file, { header: true, skipEmptyLines: true, delimitersToGuess: [',', ';', '\t'], complete: r => resolve(r.data), error: e => reject(e) });
      } else if (/\.xlsx?$/.test(name)) {
        if (!window.XLSX) return reject(new Error('Thư viện Excel chưa tải được – kiểm tra mạng.'));
        const fr = new FileReader();
        fr.onload = () => { try { const wb = XLSX.read(fr.result, { type: 'array' }); resolve(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' })); } catch (e) { reject(e); } };
        fr.onerror = () => reject(fr.error); fr.readAsArrayBuffer(file);
      } else reject(new Error('Chỉ hỗ trợ .csv, .xlsx, .xls'));
    });
  },
  fromRows(rows) {
    const out = { meta: null, sections: [], questions: [], errors: [], warnings: [] }; let cur = null;
    const open = o => { cur = Object.assign(newSec(), o); out.sections.push(cur); return cur; };
    rows.forEach((r0, i) => {
      const r = {}; Object.keys(r0).forEach(k => { r[TestIO.key(k)] = r0[k] == null ? '' : String(r0[k]).trim(); });
      if (!Object.keys(r).some(k => r[k])) return;
      const ln = i + 2, g = f => { const al = TestIO.ALIAS[f]; for (let k = 0; k < al.length; k++) if (r[al[k]]) return r[al[k]]; return ''; };
      const err = m => out.errors.push({ line: ln, msg: m }), warn = m => out.warnings.push({ line: ln, msg: m });
      const ytOf = def => {
        const u = g('audio_url'); if (!u) return null;
        if (!Media.ok(u)) { warn('Link âm thanh/video không hợp lệ – đã bỏ phần nghe.'); return null; }
        const mp = g('max_plays'); return { url: u, start: g('audio_start'), end: g('audio_end'), plays: mp === '' ? def : (parseInt(mp, 10) || 0), hide: !/^(0|no|false|n|khong|không)$/i.test(g('hide_video')) };
      };
      let type = TestIO.typeOf(g('type')); const text = g('question'), ansS = g('answer'), optS = g('options');
      if (type === 'meta') { out.meta = { name: text, desc: g('explanation'), limit: parseInt(ansS, 10) || 0, yt: ytOf(1) }; return; }
      if (type === 'section') {
        const s = open({ title: text, instr: ansS, passage: g('passage') }), im = g('image_url');
        if (im) { if (/^https:\/\//i.test(im)) s.img = im; else warn('Link ảnh phải bắt đầu bằng https:// – đã bỏ ảnh.'); }
        const y = ytOf(1); if (y) s.yt = Object.assign(defYt(1), y); return;
      }
      if (type === '?') return err('Loại câu hỏi không nhận ra: "' + g('type') + '" (dùng section, mcq, multi, tf, short, fill, match, order, essay).');
      if (!type) {
        if (/\{\{/.test(text)) type = 'fill';
        else if (optS && /=>|->|::/.test(optS)) type = 'match';
        else if (optS) type = TestIO.split(ansS).length > 1 ? 'multi' : 'mcq';
        else if (/^(true|false|đúng|dung|sai)$/i.test(ansS)) type = 'tf';
        else if (ansS) type = 'short'; else return err('Thiếu cột "type" và không đoán được loại câu hỏi.');
      }
      const q = newQ(type); q.text = text; q.passage = g('passage'); q.expl = g('explanation');
      q.points = clamp(parseFloat(String(g('points')).replace(',', '.')) || 1, .25, 100);
      const img = g('image_url'); if (img) { if (/^https:\/\//i.test(img)) q.img = img; else warn('Link ảnh phải bắt đầu bằng https:// – đã bỏ ảnh.'); }
      const y = ytOf(2); if (y) q.yt = y;
      if (type !== 'fill' && !text) return err('Thiếu nội dung câu hỏi.');
      if (type === 'mcq' || type === 'multi') {
        let opts = TestIO.split(optS); if (opts.length && opts.every(o => /^[A-Ha-h][.)]\s+/.test(o))) opts = opts.map(o => o.replace(/^[A-Ha-h][.)]\s+/, ''));
        if (opts.length < 2) return err('Cần ít nhất 2 lựa chọn trong cột "options" (ngăn cách bằng |).');
        const ans = [];
        for (const tk of TestIO.split(ansS)) {
          const k = /^[A-Za-z]$/.test(tk) && tk.toUpperCase().charCodeAt(0) - 65 < opts.length ? tk.toUpperCase().charCodeAt(0) - 65 : opts.findIndex(o => cmp(o) === cmp(tk));
          if (k < 0) return err('Đáp án "' + tk + '" không khớp lựa chọn nào.'); if (ans.indexOf(k) < 0) ans.push(k);
        }
        if (!ans.length) return err('Thiếu đáp án đúng.');
        if (type === 'mcq' && ans.length > 1) { q.type = 'multi'; warn('Có nhiều đáp án đúng – đã chuyển thành "Nhiều đáp án đúng".'); }
        q.opts = opts; q.ans = ans;
      } else if (type === 'tf') {
        if (/^(true|t|dung|đúng|đ|yes|y|1)$/i.test(ansS)) q.ans = true; else if (/^(false|f|sai|s|no|n|0)$/i.test(ansS)) q.ans = false; else return err('Đáp án Đúng/Sai phải là TRUE hoặc FALSE.');
      } else if (type === 'short') { q.accept = TestIO.split(ansS); if (!q.accept.length) return err('Thiếu đáp án chấp nhận.'); }
      else if (type === 'fill') { if (!fillParts(text).some(p => p.a && p.a.length)) return err('Câu điền từ cần chỗ trống dạng {{đáp án}} trong cột "question".'); }
      else if (type === 'match') {
        q.pairs = TestIO.split(optS).map(s => { const m = s.match(/^(.*?)\s*(?:=>|->|::)\s*(.*)$/); return m ? [m[1].trim(), m[2].trim()] : null; });
        if (q.pairs.some(p => !p || !p[0] || !p[1])) return err('Câu nối cặp: mỗi cặp phải có dạng "vế trái=>vế phải", ngăn cách bằng |.');
        if (q.pairs.length < 2) return err('Câu nối cặp cần ít nhất 2 cặp.');
      } else if (type === 'order') { q.items = TestIO.split(optS || ansS); if (q.items.length < 2) return err('Câu sắp xếp cần ít nhất 2 mục trong "options" (đúng thứ tự, ngăn cách bằng |).'); }
      else if (type === 'essay') q.sample = ansS;
      if (!cur) open({});
      cur.questions.push(q); out.questions.push(q);
    });
    out.sections = out.sections.filter(s => { if (s.questions.length) return true; out.warnings.push({ line: '–', msg: 'Phần "' + (s.title || '(không tên)') + '" không có câu hỏi – đã bỏ.' }); return false; });
    return out;
  },
  toRows(t) {
    const sl = slimTest(t), L = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'], p = s => String(s).replace(/\|/g, '/');
    const yrow = (r, y) => { if (y) Object.assign(r, { audio_url: Media.show(y.url), audio_start: y.start || '', audio_end: y.end || '', max_plays: y.plays, hide_video: y.hide ? 1 : 0 }); return r; };
    const rows = [yrow({ type: 'meta', question: sl.name, answer: sl.limit || '', explanation: sl.desc || '' }, sl.yt)];
    sl.sections.forEach(s => {
      rows.push(yrow({ type: 'section', question: s.title, answer: s.instr || '', passage: s.passage || '', image_url: s.img || '' }, s.yt));
      s.questions.forEach(q => {
        const r = yrow({ type: q.type, question: q.text, points: q.type === 'essay' ? '' : q.points, explanation: q.expl || '', passage: q.passage || '', image_url: q.img || '' }, q.yt);
        if (q.type === 'mcq' || q.type === 'multi') { r.options = q.opts.map(p).join('|'); r.answer = q.ans.map(i => L[i]).join('|'); }
        else if (q.type === 'tf') r.answer = q.ans ? 'TRUE' : 'FALSE';
        else if (q.type === 'short') r.answer = q.accept.map(p).join('|');
        else if (q.type === 'match') r.options = q.pairs.map(x => p(x[0]) + '=>' + p(x[1])).join('|');
        else if (q.type === 'order') r.options = q.items.map(p).join('|');
        else if (q.type === 'essay') r.answer = q.sample;
        rows.push(r);
      });
    });
    return rows;
  },
  csv(t) { return '\ufeff' + Papa.unparse({ fields: TCOLS, data: TestIO.toRows(t).map(r => TCOLS.map(c => safeCell(r[c] == null ? '' : r[c]))) }); }
};
const SAMPLE_TEST = (() => {
  const Q = (type, o) => Object.assign(newQ(type), o), S = (o, qs) => Object.assign(newSec(), o, { questions: qs });
  return normTest({ name: 'Bài test mẫu – Reading, Listening & Grammar', desc: 'Đề mẫu gồm nhiều phần, đủ các dạng câu hỏi.', limit: 30, shuffleQ: false, shuffleOpt: false, review: true, yt: defYt(1), sections: [
    S({ title: 'Part 1 – Reading', instr: 'Read the text and answer questions 1–4.', passage: 'Tom lives in Da Nang with his family. Every morning he rides his bicycle to school, which takes about fifteen minutes. After school he plays football with his friends in the park.\n\nOn Sundays, Tom helps his mother cook lunch and then visits his grandparents.' }, [
      Q('mcq', { text: 'Where does Tom live?', opts: ['Hanoi', 'Hue', 'Da Nang'], ans: [2], expl: 'Câu đầu của đoạn văn: Tom lives in Da Nang.' }),
      Q('tf', { text: 'Tom goes to school by bus.', ans: false, expl: 'Anh ấy đi bằng xe đạp (rides his bicycle).' }),
      Q('short', { text: 'How long does it take Tom to get to school?', accept: ['fifteen minutes', '15 minutes'], expl: 'about fifteen minutes.' }),
      Q('multi', { text: 'What does Tom do on Sundays?', opts: ['Helps cook lunch', 'Plays football at school', 'Visits his grandparents'], ans: [0, 2], points: 2, expl: 'Đoạn 2 nêu hai hoạt động ngày Chủ nhật.' })]),
    S({ title: 'Part 2 – Grammar & Vocabulary', instr: 'Choose or type the correct answer.' }, [
      Q('fill', { text: "I {{am|'m}} a student and she {{is|'s}} a teacher.", points: 2, expl: 'I đi với am, she đi với is.' }),
      Q('match', { text: 'Match the word with its meaning.', pairs: [['airport', 'sân bay'], ['luggage', 'hành lý'], ['passport', 'hộ chiếu']], points: 3, expl: 'Ôn từ vựng chủ đề du lịch.' }),
      Q('order', { text: 'Put the words in the correct order.', items: ['I', 'like', 'playing', 'football'], points: 2, expl: 'Cấu trúc: S + like + V-ing + O.' })]),
    S({ title: 'Part 3 – Listening', instr: 'You will hear the recording ONCE. Answer questions 10–11 while you listen.', yt: Object.assign(defYt(1), { url: 'https://youtu.be/XXXXXXXXXXX', start: '0:05', end: '1:30' }) }, [
      Q('mcq', { text: "What is the speaker's job?", opts: ['Teacher', 'Doctor', 'Driver'], ans: [0], expl: 'Người nói tự giới thiệu ở đầu bài nghe.' }),
      Q('short', { text: 'What time does the class start?', accept: ['9 am', '9:00', "9 o'clock"], expl: 'Nghe lại đoạn giữa bài.' })]),
    S({ title: 'Part 4 – Writing' }, [Q('essay', { text: 'Write 2–3 sentences about your weekend.', sample: 'Last weekend I visited my grandparents. We cooked lunch together.' })])] });
})();
async function pickTestFile(file, onUse, canAppend) {
  let rows; try { rows = await TestIO.readFile(file); } catch (e) { return toast('Lỗi đọc tệp: ' + e.message, 'error'); }
  const r = TestIO.fromRows(rows), by = {}; r.questions.forEach(q => { by[q.type] = (by[q.type] || 0) + 1; });
  const d = Modal.open('Nhập bài test từ ' + file.name, h('div', { class: 'stack' },
    h('p', { class: r.questions.length ? 'ok' : 'err', text: `${r.questions.length} câu hợp lệ trong ${r.sections.length} phần` + (r.errors.length ? ` · ${r.errors.length} dòng lỗi (bị bỏ qua)` : '') }),
    r.questions.length ? h('p', { class: 'muted small-text', text: Object.keys(by).map(k => QTYPES[k] + ': ' + by[k]).join(' · ') + (r.meta ? ` · Tiêu đề: ${r.meta.name}` : '') }) : null,
    r.errors.length ? h('div', { class: 'box error' }, h('strong', { text: 'Dòng lỗi:' }), h('ul', null, r.errors.slice(0, 12).map(e => h('li', { text: `Dòng ${e.line}: ${e.msg}` })))) : null,
    r.warnings.length ? h('div', { class: 'box warn' }, h('ul', null, r.warnings.slice(0, 6).map(e => h('li', { text: `Dòng ${e.line}: ${e.msg}` })))) : null,
    h('div', { class: 'row end wrap' }, h('button', { class: 'btn', onclick: () => d.close() }, 'Hủy'),
      canAppend ? h('button', { class: 'btn', disabled: !r.questions.length, onclick: () => { d.close(); onUse(r, 'append'); } }, 'Thêm vào cuối') : null,
      h('button', { class: 'btn primary', disabled: !r.questions.length, onclick: () => { d.close(); onUse(r, 'replace'); } }, canAppend ? 'Thay toàn bộ' : 'Tạo bài test'))));
}
const csvDownload = (name, t) => download(name, TestIO.csv(t), 'text/csv;charset=utf-8');

/* ---------- Hộp thoại Gộp (dùng chung cho bộ từ và bài test) ---------- */
function joinDialog(o) {
  const name = h('input', { type: 'text', id: 'jn-name', maxlength: 80, value: ((o.cur.name || '') + ' (gộp)').slice(0, 80), autocomplete: 'off' });
  const rows = o.list.map(x => ({ x, c: h('input', { type: 'checkbox', checked: x === o.cur, 'aria-label': x.name || '(chưa đặt tên)' }) }));
  const dd = h('input', { type: 'checkbox', id: 'jn-dd', checked: true }), del = h('input', { type: 'checkbox', id: 'jn-del' });
  const info = h('p', { class: 'hint', role: 'status' });
  const sel = () => rows.filter(r => r.c.checked).map(r => r.x);
  const upd = () => { const s = sel(); info.textContent = `Đã chọn ${s.length} ${o.kind} · tổng ${s.reduce((n, x) => n + o.count(x), 0).toLocaleString('vi-VN')} ${o.unit} (trước khi bỏ trùng)`; };
  rows.forEach(r => r.c.addEventListener('change', upd)); upd();
  const d = Modal.open('Gộp ' + o.kind, h('div', { class: 'stack' },
    h('label', { for: 'jn-name', text: 'Tên ' + o.kind + ' mới' }), name,
    h('p', { class: 'hint', text: `Chọn các ${o.kind} cần gộp thành một (thứ tự gộp theo thứ tự trong danh sách):` }),
    h('div', { class: 'box', style: 'max-height:40vh;overflow:auto' }, rows.map(r => h('label', { class: 'check' }, r.c, `${r.x.name || '(chưa đặt tên)'} · ${o.count(r.x).toLocaleString('vi-VN')} ${o.unit}`))), info,
    h('label', { class: 'check', for: 'jn-dd' }, dd, o.dedupe), h('label', { class: 'check', for: 'jn-del' }, del, `Xóa các ${o.kind} gốc sau khi gộp`),
    h('div', { class: 'row end' }, h('button', { class: 'btn', onclick: () => d.close() }, 'Hủy'),
      h('button', { class: 'btn primary', onclick: async () => {
        const s = sel(); if (s.length < 2) return toast('Hãy chọn ít nhất 2 ' + o.kind + ' để gộp.', 'error');
        const nm = Norm.text(name.value).slice(0, 80); if (!nm) return toast('Hãy nhập tên mới.', 'error');
        if (del.checked && !await Modal.confirm(`Sau khi gộp sẽ XÓA ${s.length} ${o.kind} gốc. Tiếp tục?`, 'Gộp và xóa', true)) return;
        d.close(); o.make(s, nm, dd.checked, del.checked);
      } }, '⛓ Gộp'))));
}

/* ---------- Trang chủ: danh sách bài test ---------- */
function TestHomeSection(rerender) {
  function textUse(r) {
    const t = normTest({ id: uid(), name: (r.meta && r.meta.name) || 'Bài test nhập từ văn bản', desc: '', limit: 0, shuffleQ: false, shuffleOpt: false, review: true, yt: defYt(1), sections: r.sections, updatedAt: Date.now() });
    Tests.list.unshift(t); if (Tests.save()) { toast(`Đã tạo bài test ${qCount(t)} câu. Hãy kiểm tra lại trong trình soạn.`); location.hash = '#/test-edit/' + t.id; }
  }
  const fileIn = h('input', { type: 'file', accept: '.csv,.tsv,.xlsx,.xls', style: 'display:none', onchange: e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    pickTestFile(f, r => {
      const t = normTest({ id: uid(), name: (r.meta && r.meta.name) || f.name.replace(/\.[^.]+$/, ''), desc: (r.meta && r.meta.desc) || '', limit: (r.meta && r.meta.limit) || 0, shuffleQ: false, shuffleOpt: false, review: true,
        yt: r.meta && r.meta.yt ? Object.assign(defYt(1), r.meta.yt) : defYt(1), sections: r.sections, updatedAt: Date.now() });
      Tests.list.unshift(t); if (Tests.save()) { toast(`Đã nhập ${qCount(t)} câu.`); location.hash = '#/test-edit/' + t.id; }
    }, false);
  } });
  function dupTest(t) {
    const c = Object.assign(JSON.parse(JSON.stringify(t)), { id: uid(), name: (t.name + ' (bản sao)').slice(0, 80), updatedAt: Date.now() });
    c.sections.forEach(s => { s.id = shortId(); s.questions.forEach(q => { q.id = shortId(); }); });
    Tests.list.splice(Tests.list.indexOf(t) + 1, 0, c);
    if (Tests.save()) { rerender(); toast(`Đã nhân bản thành "${c.name}".`); }
  }
  function joinTest(cur) {
    if (Tests.list.length < 2) return toast('Cần ít nhất 2 bài test để gộp.', 'error');
    joinDialog({ kind: 'bài test', unit: 'câu', dedupe: 'Bỏ câu trùng (cùng loại và cùng nội dung câu hỏi)', list: Tests.list, cur, count: x => qCount(x),
      make(sel, nm, dd, del) {
        const seen = new Set(), secs = []; let dups = 0, total = 0, over = 0;
        sel.forEach(x => x.sections.forEach(s => {
          const ns = normSec(s); ns.id = shortId();
          ns.questions = ns.questions.filter(q => { const k = q.type + '|' + cmp(q.text); if (dd && cmp(q.text) && seen.has(k)) { dups++; return false; } seen.add(k); return true; })
            .filter(() => { if (total >= 500) { over++; return false; } total++; return true; }).map(q => Object.assign(q, { id: shortId() }));
          if (ns.questions.length) secs.push(ns);
        }));
        const n = normTest({ id: uid(), name: nm, desc: cur.desc || '', limit: cur.limit || 0, shuffleQ: !!cur.shuffleQ, shuffleOpt: !!cur.shuffleOpt, review: cur.review !== false, yt: cur.yt, sections: secs, updatedAt: Date.now() });
        const keep = del ? Tests.list.filter(x => sel.indexOf(x) < 0) : Tests.list.slice(); keep.unshift(n);
        const old = Tests.list; Tests.list = keep;
        if (!Tests.save()) { Tests.list = old; return; }
        rerender(); toast(`Đã gộp thành "${nm}" (${total} câu, ${secs.length} phần${dups ? `, bỏ ${dups} câu trùng` : ''}${over ? `, cắt ${over} câu vượt giới hạn 500` : ''}). Thời gian và cài đặt lấy từ "${cur.name || 'bài hiện tại'}".`);
      } });
  }
  async function del(t) {
    if (!await Modal.confirm(`Xóa bài test "${t.name || 'chưa đặt tên'}" (${qCount(t)} câu)?`, 'Xóa', true)) return;
    const i = Tests.list.indexOf(t); Tests.list.splice(i, 1); Tests.save(); rerender();
    toast('Đã xóa bài test.', 'info', { label: 'Hoàn tác', onClick: () => { Tests.list.splice(Math.min(i, Tests.list.length), 0, t); Tests.save(); rerender(); } });
  }
  return h('section', { 'aria-label': 'Bài test', style: 'margin-top:2rem' },
    h('div', { class: 'page-head' }, h('h1', { text: 'Bài test của tôi' }), h('div', { class: 'row wrap' },
      h('a', { class: 'btn primary', href: '#/test-edit/new' }, '📝 Tạo bài test'),
      h('button', { class: 'btn primary', onclick: () => openTextImport(textUse, false) }, '📄 Nhập từ văn bản (dán đề)'),
      h('label', { class: 'btn', style: 'margin:0;cursor:pointer' }, '⬆ Nhập CSV/Excel', fileIn),
      h('button', { class: 'btn', onclick: () => csvDownload('mau-bai-test.csv', SAMPLE_TEST) }, '⬇ File CSV mẫu'))),
    Tests.list.length ? h('div', { class: 'grid' }, Tests.list.map(t => h('article', { class: 'card', 'aria-label': 'Bài test ' + t.name },
      h('h2', { text: t.name || '(chưa đặt tên)' }),
      h('p', { class: 'muted small-text', text: `${t.sections.length} phần · ${qCount(t)} câu · ` + (t.limit ? t.limit + ' phút' : 'không giới hạn giờ') + ((t.yt && t.yt.url) || t.sections.some(s => s.yt && s.yt.url) ? ' · 🎧' : '') }),
      h('div', { class: 'actions' }, h('a', { class: 'btn primary', href: '#/test-practice/' + t.id }, '▶ Làm thử'), h('button', { class: 'btn', onclick: () => openAssignTest(t) }, '📤 Giao bài'),
        h('a', { class: 'btn', href: '#/test-edit/' + t.id }, '✎ Sửa'), h('button', { class: 'btn', onclick: () => del(t) }, '🗑 Xóa')),
      h('div', { class: 'actions-2' }, h('button', { class: 'btn small ghost', onclick: () => dupTest(t) }, '⧉ Nhân bản'), h('button', { class: 'btn small ghost', onclick: () => joinTest(t) }, '⛓ Gộp')))))
      : h('div', { class: 'card empty' }, h('p', { class: 'muted', text: 'Chưa có bài test nào. Bấm “📝 Tạo bài test”, hoặc nhập từ file CSV/Excel (tải file mẫu để xem định dạng).' })));
}

/* ---------- Nhập từ VĂN BẢN (dán nguyên văn đề – không qua AI nên giữ 100% chữ gốc) ----------
   Ứng dụng tự nhận: Phần (Part/Section/Passage…), đoạn văn, nhóm "Questions 1–5 …", câu đánh số (1. / 1) / Q1),
   lựa chọn A. B. C. D. (xuống dòng hoặc cùng dòng), True/False/Not Given, chỗ trống ____, "Answer:", "Explanation:",
   bảng đáp án cuối đề (Answer key / Đáp án), và bảng đáp án dán riêng (mỗi dòng: "số: đáp án | giải thích"). */
const TI = {
  GROUP: /^questions?\s+\d{1,3}(?:\s*(?:[-–—]|to|and|&)\s*\d{1,3})?\b/i,
  PART: /^(?:part|section|passage|reading\s+passage|reading\s+text|text|listening|task|phần|bài\s*đọc|bài\s*nghe|đoạn\s*văn)\s*(?:[0-9]{1,2}|[ivx]{1,4}|[a-e])\b[^.!?]{0,80}$/i,
  INSTR: /^(?:choose|circle|read|write|complete|decide|match|listen|fill|answer|look|select|underline|put|tick|use|you\s+(?:will|should|must)|for\s+questions?|do\s+not|no\s+more|hãy|chọn|đọc|viết|điền|nối|nghe)\b/i,
  KEYHEAD: /^\s*(?:#+\s*)?(?:answer\s*keys?|answers?|đáp\s*án|dap\s*an|keys?|solutions?|answer\s*sheet|lời\s*giải|loi\s*giai)\s*[:：]?\s*$/i,
  BLANK: /_{2,}|\.{4,}|…+|\[\s*\]/,
  splitInline(s) {                               // "xxx A. a B. b C. c" → {text, opts}
    const re = /(?:^|\s)\(?([A-Ha-h])[.)]\s+/g, hits = []; let m;
    while ((m = re.exec(s))) hits.push({ i: m.index, end: re.lastIndex, L: m[1].toUpperCase() });
    const seq = []; let want = 65;
    hits.forEach(x => { if (x.L.charCodeAt(0) === want) { seq.push(x); want++; } });
    if (seq.length < 2 || seq[0].L !== 'A') return null;
    return { text: s.slice(0, seq[0].i).trim(), opts: seq.map((x, k) => s.slice(x.end, k + 1 < seq.length ? seq[k + 1].i : s.length).trim()) };
  },
  optIdx(opts, raw) {                            // đáp án dạng chữ / True-False-Not Given / nội dung lựa chọn → mảng chỉ số
    const N = opts.length, uniq = a => a.filter((x, i) => a.indexOf(x) === i);
    raw = String(raw).trim().replace(/^[(\[]+|[)\]。.]+$/g, '').trim(); const U = raw.toUpperCase();
    if (N === 3 && /^not\s*given$/i.test(opts[2])) {
      if (/^(NG|N\/G|NOT\s*GIVEN)$/.test(U)) return [2];
      const k = opts.findIndex(x => x.toUpperCase() === U || (U.length === 1 && x[0].toUpperCase() === U)); if (k >= 0) return [k];
    }
    const toks = raw.split(/\s*(?:,|;|\/|&|\+|\band\b|\bvà\b)\s*|\s+/i).filter(Boolean);
    if (toks.length && toks.every(t => /^[A-Ha-h]$/.test(t))) { const ix = toks.map(t => t.toUpperCase().charCodeAt(0) - 65); if (ix.every(i => i < N)) return uniq(ix); }
    const m = raw.match(/^([A-Ha-h])[.):\-]\s*(.*)$/); if (m && m[1].toUpperCase().charCodeAt(0) - 65 < N) return [m[1].toUpperCase().charCodeAt(0) - 65];
    if (/^[A-H]{2,6}$/.test(U) && U.split('').every(c => c.charCodeAt(0) - 65 < N)) return uniq(U.split('').map(c => c.charCodeAt(0) - 65));
    const k = opts.findIndex(x => cmp(x) === cmp(raw)); return k >= 0 ? [k] : [];
  },
  parseKey(lines) {                              // → [{no, raw, expl}]
    const out = [], ENT = /^\s*(?:q|câu)?\s*(\d{1,3})\s*[.):\-–—=]\s*(.*)$/i; let last = null;
    lines.forEach(L => {
      const T = L.trim(); if (!T) return;
      const multi = !T.includes('|') && (T.match(/(?:^|\s)\d{1,3}\s*[.):\-–—]\s*[A-Za-z]{1,10}(?=\s|,|;|$)/g) || []).length >= 3;
      const parts = multi ? T.split(/[,;]?\s+(?=\d{1,3}\s*[.):\-–—]\s*\S)/) : [T];
      parts.forEach(p => {
        const m = p.trim().match(ENT);
        if (!m) { if (last && last.expl !== null) last.expl += ' ' + p.trim(); return; }
        let rest = m[2].trim(), expl = '';
        const bar = rest.indexOf('|');
        if (bar >= 0) { expl = rest.slice(bar + 1).trim(); rest = rest.slice(0, bar).trim(); }
        else { const d = rest.match(/^(.{1,60}?)\s+[–—-]\s+(.+)$/); if (d) { rest = d[1]; expl = d[2]; } }
        last = { no: Number(m[1]), raw: rest, expl }; out.push(last);
      });
    });
    return out;
  },
  parse(raw, ansRaw, opt) {
    if (/^@(?:TEST|SECTION|Q)\b/im.test(String(raw || ''))) return TI.parseTagged(raw, ansRaw, opt);
    opt = opt || {}; const rep = [], warn = (m, l) => rep.push({ lvl: l || 'warn', msg: m });
    let lines = String(raw || '').replace(/\r\n?/g, '\n').replace(/[\u00a0\u200b\ufeff]/g, ' ').split('\n').map(l => l.replace(/\s+$/, ''));
    let keyLines = [];
    for (let i = 0; i < lines.length; i++) if (TI.KEYHEAD.test(lines[i])) {
      if (lines.slice(i + 1, i + 30).filter(l => /^\s*(?:q|câu)?\s*\d{1,3}\s*[.):\-–—=]/i.test(l)).length >= 2) { keyLines = lines.slice(i + 1); lines = lines.slice(0, i); break; }
    }
    let name = String(opt.name || '').trim();
    const nz = lines.map((l, i) => i).filter(i => lines[i].trim());
    if (!name && nz.length > 2) {
      const a = lines[nz[0]].trim(), b = lines[nz[1]].trim();
      if (a.length < 100 && !/[.:?!]$/.test(a) && !TI.PART.test(a) && !TI.GROUP.test(a) && !/^(?:#{2,}|={2,})/.test(a) && !/^\d{1,3}\s*[.)]/.test(a) && (TI.PART.test(b) || TI.GROUP.test(b) || /^(?:#{2,}|={2,})/.test(b) || TI.INSTR.test(b))) { name = a.replace(/^#+\s*/, ''); lines[nz[0]] = ''; }
    }
    const secs = []; let sec = null, q = null, lastNo = 0, afterGroup = false, preBuf = [], group = '', inBlock = false;
    const newSecP = title => { q = null; afterGroup = false; preBuf = []; group = ''; sec = { title: title || '', instr: [], pass: [], qs: [] }; secs.push(sec); return sec; };
    const ensure = () => sec || newSecP('');
    const addOpt = (o, t) => {
      t = String(t).trim(); let mk = false;
      if (/^\*\s*/.test(t)) { t = t.replace(/^\*\s*/, ''); mk = true; }
      if (/\s*(?:\*|✓|✔|\((?:correct|đúng)\))\s*$/i.test(t)) { t = t.replace(/\s*(?:\*|✓|✔|\((?:correct|đúng)\))\s*$/i, ''); mk = true; }
      o.opts.push(t); if (mk) o.mark.push(o.opts.length - 1);
    };
    const qStartOf = T => {
      let m = T.match(/^(?:(?:q(?:uestion)?|câu)\s*)?(\d{1,3})\s*[.)\]:]\s*(.*)$/i);
      if (m) { const n = Number(m[1]); if (lastNo === 0 || n === lastNo + 1 || n === 1 || (n > lastNo && n <= lastNo + 5)) return { n, rest: m[2] }; return null; }
      m = T.match(/^(\d{1,3})\s+([A-Z].*)$/);
      if (m && Number(m[1]) === lastNo + 1 && (afterGroup || (sec && sec.qs.length))) return { n: Number(m[1]), rest: m[2] };
      return null;
    };
    for (const L of lines) {
      const T = L.trim();
      if (inBlock) { if (/^\[\/passage\]$/i.test(T)) inBlock = false; else sec.pass.push(L); continue; }
      if (/^\[passage\]$/i.test(T)) { if (!sec || sec.qs.length) newSecP(''); q = null; inBlock = true; continue; }
      if (!T) { if (sec && !q && !afterGroup && !sec.qs.length) sec.pass.push(''); continue; }
      const H = T.match(/^(?:#{2,}|={2,})\s*(.*?)\s*[=#]*$/);
      if (H) { newSecP(H[1]); continue; }
      if (TI.PART.test(T) && T.length < 90) { newSecP(T); continue; }
      if (TI.GROUP.test(T)) { ensure(); q = null; afterGroup = true; group = T; preBuf = [T]; continue; }
      const qs = qStartOf(T);
      if (qs) {
        ensure(); if (afterGroup) group = preBuf.join(' ');
        const o = { no: qs.n, text: '', opts: [], mark: [], pre: afterGroup ? preBuf.join('\n') : '', group, ansRaw: '', expl: '', inExpl: false };
        if (afterGroup) { afterGroup = false; preBuf = []; }
        const sp = TI.splitInline(qs.rest);
        if (sp) { o.text = sp.text; sp.opts.forEach(x => addOpt(o, x)); } else o.text = qs.rest;
        sec.qs.push(o); q = o; lastNo = qs.n; continue;
      }
      if (q) {
        const sp = !q.opts.length ? TI.splitInline(T) : null;
        if (sp) { if (sp.text) q.text += ' ' + sp.text; sp.opts.forEach(x => addOpt(q, x)); q.inExpl = false; continue; }
        const om = T.match(/^\(?([A-Ha-h])[.)]\s*(.*)$/);
        if (om && om[1].toUpperCase() === String.fromCharCode(65 + q.opts.length)) { addOpt(q, om[2]); q.inExpl = false; continue; }
        let m = T.match(/^(?:answer|ans|đáp\s*án|dap\s*an|correct\s*answer|key)\s*[:：=]\s*(.+)$/i); if (m) { q.ansRaw = m[1]; continue; }
        m = T.match(/^(?:explanation|explain|giải\s*thích|giai\s*thich|rationale)\s*[:：]\s*(.*)$/i); if (m) { q.expl = m[1]; q.inExpl = true; continue; }
        if (q.inExpl) q.expl += ' ' + T;
        else if (q.opts.length) { const k = q.opts.length - 1; q.opts[k] += ' ' + T; }
        else q.text += ' ' + T;
        continue;
      }
      if (afterGroup) { preBuf.push(T); continue; }
      ensure();
      if (!sec.qs.length) { if (TI.INSTR.test(T) && T.length < 220 && !sec.pass.some(x => x.trim())) sec.instr.push(T); else sec.pass.push(L); }
      else if (T.length > 120) { newSecP(''); sec.pass.push(L); }
      else { const lq = sec.qs[sec.qs.length - 1]; if (lq.opts.length) lq.opts[lq.opts.length - 1] += ' ' + T; else lq.text += ' ' + T; }
    }
    // ---- đáp án: dấu * < "Answer:" trong câu < bảng đáp án trong đề < bảng đáp án dán riêng ----
    const flat = []; secs.forEach(s => s.qs.forEach(o => flat.push(o)));
    const okSet = new Set(), built = new Map();
    const blank = t => TI.BLANK.test(t);
    flat.forEach(o => {
      const g = o.group || '', ng = /not\s*given/i.test(g), tfng = ng && /\btrue\b/i.test(g) && /\bfalse\b/i.test(g), yng = !tfng && ng && /\byes\b/i.test(g) && /\bno\b/i.test(g), tf2 = !tfng && !yng && /\btrue\b/i.test(g) && /\bfalse\b/i.test(g);
      let opts = o.opts.slice(); if (!opts.length && tfng) opts = ['True', 'False', 'Not Given']; else if (!opts.length && yng) opts = ['Yes', 'No', 'Not Given'];
      let q;
      if (opts.length >= 2) { q = newQ('mcq'); q.opts = opts; q.ans = []; if (o.mark.length) { q.ans = o.mark.slice(); if (q.ans.length > 1) q.type = 'multi'; okSet.add(q); } }
      else if (tf2) q = newQ('tf');
      else q = newQ('short');
      q.text = o.text.trim(); q.pre = o.pre; q.expl = o.expl.trim(); q.no = o.no; built.set(o, q);
    });
    const apply = (o, rawAns, expl) => {
      const q = built.get(o); if (!q) return;
      if (expl) q.expl = expl.trim();
      rawAns = String(rawAns || '').trim(); if (!rawAns) return;
      if (q.type === 'mcq' || q.type === 'multi') { const ix = TI.optIdx(q.opts, rawAns); if (ix.length) { q.ans = ix; q.type = ix.length > 1 ? 'multi' : 'mcq'; okSet.add(q); } }
      else if (q.type === 'tf') { if (/^(true|t|yes|y|đúng|dung)$/i.test(rawAns.replace(/\.$/, ''))) { q.ans = true; okSet.add(q); } else if (/^(false|f|no|n|sai)$/i.test(rawAns.replace(/\.$/, ''))) { q.ans = false; okSet.add(q); } }
      else {
        const acc = rawAns.split(/\s*(?:\/|;|\bor\b)\s*/i).map(x => x.trim()).filter(Boolean);
        if (acc.length) { q.accept = acc; okSet.add(q); }
      }
    };
    flat.forEach(o => { if (o.ansRaw) apply(o, o.ansRaw, ''); });
    const entries = TI.parseKey(keyLines).concat(TI.parseKey(String(ansRaw || '').split('\n')));
    const keyN = TI.parseKey(keyLines).length;
    const uniqueNo = new Set(flat.map(o => o.no)).size === flat.length;
    let unmatched = 0;
    if (entries.length) {
      if (uniqueNo) entries.forEach(e => { const o = flat.find(x => x.no === e.no); if (o) apply(o, e.raw, e.expl); else unmatched++; });
      else if (keyN === flat.length && !String(ansRaw || '').trim()) entries.forEach((e, i) => apply(flat[i], e.raw, e.expl));
      else warn('Số thứ tự câu bị lặp lại giữa các phần nên không khớp được đáp án theo số. Hãy đánh số đáp án nối tiếp theo thứ tự câu hoặc nhập đáp án trong trình soạn.');
    }
    // câu điền chỗ trống ____ → {{đáp án}}
    flat.forEach(o => {
      const q = built.get(o);
      if (q.type === 'short' && okSet.has(q) && blank(q.text)) { q.text = q.text.replace(TI.BLANK, '{{' + q.accept.join('|') + '}}'); const f = newQ('fill'); Object.assign(f, { text: q.text, pre: q.pre, expl: q.expl, no: q.no }); built.set(o, f); okSet.add(f); okSet.delete(q); }
    });
    const unwrap = ls => {
      const out = []; let cur = '';
      ls.forEach(l => { if (!l.trim()) { if (cur) { out.push(cur); cur = ''; } out.push(''); } else cur = cur ? (/[-‐]$/.test(cur) ? cur.slice(0, -1) + l.trim() : cur + ' ' + l.trim()) : l.trim(); });
      if (cur) out.push(cur); return out;
    };
    const outSecs = [], missing = [], missQ = new Set();
    secs.forEach((s, si) => {
      if (!s.qs.length) { if (s.pass.some(x => x.trim())) warn(`"${s.title || 'Phần ' + (si + 1)}" có đoạn văn nhưng không có câu hỏi – đã bỏ.`); return; }
      let pl = opt.unwrap ? unwrap(s.pass) : s.pass.slice();
      const txt = pl.join('\n').replace(/^\s*\n+|\n+\s*$/g, '').replace(/\n{3,}/g, '\n\n');
      const ns = Object.assign(newSec(), { title: s.title, instr: s.instr.join('\n'), passage: txt });
      ns.questions = s.qs.map(o => { const q = built.get(o); if (!okSet.has(q) && q.type !== 'essay') { missing.push(o.no); missQ.add(q); } delete q.no; return q; });
      outSecs.push(ns);
    });
    const total = flat.length;
    if (!total) warn('Không nhận ra câu hỏi nào. Câu hỏi cần bắt đầu bằng số thứ tự (1. / 1) / Q1) và lựa chọn bằng A. B. C. D.', 'err');
    const nums = flat.map(o => o.no); for (let i = 1; i < nums.length; i++) if (nums[i] > nums[i - 1] + 1) { warn(`Thiếu số thứ tự giữa câu ${nums[i - 1]} và ${nums[i]} – có thể bị bỏ sót câu.`); break; }
    if (missing.length) warn(`${missing.length} câu chưa có đáp án: ${missing.slice(0, 20).join(', ')}${missing.length > 20 ? '…' : ''}. Dán bảng đáp án vào ô "Đáp án" hoặc chọn trong trình soạn.`);
    if (unmatched) warn(`${unmatched} dòng đáp án không khớp câu nào (sai số thứ tự?).`);
    return { meta: name ? { name, desc: '', limit: 0, yt: null } : null, sections: outSecs, questions: [].concat.apply([], outSecs.map(s => s.questions)), errors: total ? [] : [{ line: '–', msg: 'Không nhận ra câu hỏi nào.' }], warnings: rep.map(r => ({ line: '–', msg: r.msg })), missing, missQ };
  }
};
/* ---------- ĐỊNH DẠNG CHUẨN (có thẻ @) – NotebookLM/AI chỉ việc sao chép nguyên văn và gắn thẻ; app đọc không cần đoán ---------- */
TI.parseTagged = function (raw, ansRaw, opt) {
  opt = opt || {}; const rep = [], warn = m => rep.push({ lvl: 'warn', msg: m });
  const lines = String(raw || '').replace(/\r\n?/g, '\n').replace(/[\u00a0\u200b\ufeff]/g, ' ').split('\n');
  const meta = { name: String(opt.name || '').trim(), desc: '', limit: 0, yt: null };
  const secs = [], raws = []; let sec = null, q = null, cur = null, group = '', scope = 'test';
  const trimBlank = a => { let i = 0, j = a.length; while (i < j && !a[i].trim()) i++; while (j > i && !a[j - 1].trim()) j--; return a.slice(i, j); };
  const newSecP = title => { sec = { title: title || '', instr: '', pass: '', img: '', yt: null, qs: [] }; secs.push(sec); q = null; group = ''; scope = 'sec'; return sec; };
  const ensure = () => sec || newSecP('');
  const audio = (s, def) => {
    const p = s.split('|').map(x => x.trim()); if (!Media.ok(p[0])) { warn('Link âm thanh/video không hợp lệ: ' + (p[0] || '(trống)')); return null; }
    return { url: p[0], start: p[1] || '', end: p[2] || '', plays: p[3] === undefined || p[3] === '' ? def : (parseInt(p[3], 10) || 0), hide: !/^(show|hien|hiện|visible|1)$/i.test(p[4] || '') };
  };
  const flush = () => {
    if (!cur) return;
    const arr = trimBlank(cur.rest ? [cur.rest].concat(cur.lines) : cur.lines), one = arr.map(x => x.trim()).join(' ').trim(), many = arr.join('\n');
    switch (cur.tag) {
      case 'TEST': { const m = one.match(/^(.*?)\s*\|\s*(\d{1,3})\s*$/); if (!meta.name) meta.name = m ? m[1] : one; if (m) meta.limit = Number(m[2]); break; }
      case 'DESC': meta.desc = many; break;
      case 'TIME': meta.limit = parseInt(one, 10) || 0; break;
      case 'SECTION': newSecP(one); break;
      case 'INSTR': if (scope === 'q') newSecP(''); ensure().instr = many; break;
      case 'PASSAGE': if (scope === 'q') newSecP(''); ensure().pass = many; break;
      case 'IMAGE': if (!/^https:\/\//i.test(one)) warn('Link ảnh phải bắt đầu bằng https:// – đã bỏ: ' + one.slice(0, 40)); else if (scope === 'q' && q) q.img = one; else ensure().img = one; break;
      case 'AUDIO': { const y = audio(one, scope === 'q' ? 2 : 1); if (y) { if (scope === 'test') meta.yt = y; else if (scope === 'q' && q) q.yt = y; else ensure().yt = y; } break; }
      case 'GROUP': group = many; break;
      case 'Q': if (cur.q) cur.q.body = trimBlank(cur.rest ? [cur.rest].concat(cur.lines) : cur.lines); break;
      case 'ANS': if (q) q.ans = many; else warn('@ANS đứng ngoài câu hỏi – đã bỏ.'); break;
      case 'WHY': case 'EXPL': case 'EXPLAIN': if (q) q.why = many; break;
      case 'NOTE': if (many) warn('Ghi chú từ AI: ' + many.slice(0, 200)); break;
      default: warn('Thẻ không nhận ra: @' + cur.tag);
    }
    cur = null;
  };
  const TYPES = { mcq: 'mcq', single: 'mcq', multi: 'multi', msq: 'multi', tf: 'tf', tfng: 'tfng', ynng: 'ynng', short: 'short', fill: 'fill', cloze: 'fill', match: 'match', order: 'order', essay: 'essay', writing: 'essay' };
  for (const L of lines) {
    const m = L.match(/^@([A-Za-z]+)\b[ \t]*(.*)$/);
    if (!m) { if (cur) cur.lines.push(L); continue; }
    flush(); const tag = m[1].toUpperCase();
    if (tag === 'Q') {
      const tk = m[2].trim().split(/\s+/), type = TYPES[(tk[0] || '').toLowerCase()];
      if (!type) { warn('Loại câu không nhận ra: "' + (tk[0] || '') + '" (dùng mcq, multi, tf, tfng, ynng, short, fill, match, order, essay) – đã bỏ câu.'); cur = { tag: 'SKIP', rest: '', lines: [] }; q = null; continue; }
      ensure(); const o = { type, pts: parseFloat((tk[1] || '').replace(',', '.')) || 0, body: [], ans: '', why: '', pre: group, img: '', yt: null }; group = '';
      sec.qs.push(o); raws.push(o); q = o; scope = 'q'; cur = { tag: 'Q', rest: '', lines: [], q: o }; continue;
    }
    cur = { tag, rest: m[2], lines: [] };
  }
  flush();
  // bảng đáp án dán riêng (theo thứ tự câu 1..N) ghi đè
  if (String(ansRaw || '').trim()) TI.parseKey(String(ansRaw).split('\n')).forEach(e => { const o = raws[e.no - 1]; if (o) { o.ans = e.raw; if (e.expl) o.why = e.expl; } });
  const okSet = new Set(), missQ = new Set(); let ai = 0;
  const splitBody = (body, wantOpts) => {
    const text = [], opts = []; let inOpts = false;
    body.forEach(l => {
      const T = l.trim(), om = T.match(/^\(?([A-Ha-h])[.)]\s*(.*)$/);
      if (wantOpts) {
        if (om && om[1].toUpperCase() === String.fromCharCode(65 + opts.length)) { opts.push(om[2].trim()); inOpts = true; return; }
        if (!opts.length) { const sp = TI.splitInline(T); if (sp) { if (sp.text) text.push(sp.text); sp.opts.forEach(x => opts.push(x)); inOpts = true; return; } }
        if (inOpts && T) { opts[opts.length - 1] += ' ' + T; return; }
      }
      text.push(l);
    });
    return { text: trimBlank(text).join('\n'), opts };
  };
  const secOut = [];
  secs.forEach(s => {
    const ns = Object.assign(newSec(), { title: s.title, instr: s.instr, passage: s.pass, img: s.img }); if (s.yt) ns.yt = Object.assign(defYt(1), s.yt);
    s.qs.forEach(o => {
      let q2; const body = o.body, ans = String(o.ans || '').trim();
      switch (o.type) {
        case 'mcq': case 'multi': case 'tfng': case 'ynng': {
          const sb = splitBody(body, true), opts = o.type === 'tfng' ? ['True', 'False', 'Not Given'] : o.type === 'ynng' ? ['Yes', 'No', 'Not Given'] : sb.opts;
          q2 = newQ(o.type === 'multi' ? 'multi' : 'mcq'); q2.text = (o.type === 'tfng' || o.type === 'ynng') ? body.join('\n').trim() : sb.text; q2.opts = opts; q2.ans = [];
          const ix = ans ? TI.optIdx(opts, ans.replace(/\n/g, ', ')) : [];
          if (ix.length) { q2.ans = ix; if (ix.length > 1) q2.type = 'multi'; okSet.add(q2); }
          break;
        }
        case 'tf': {
          q2 = newQ('tf'); q2.text = body.join('\n').trim(); const a = ans.replace(/[.\s]+$/, '');
          if (/^(true|t|yes|y|đúng|dung)$/i.test(a)) { q2.ans = true; okSet.add(q2); } else if (/^(false|f|no|n|sai)$/i.test(a)) { q2.ans = false; okSet.add(q2); }
          break;
        }
        case 'short': { q2 = newQ('short'); q2.text = body.join('\n').trim(); q2.accept = ans.split(/\n|;|\s\/\s|\bor\b/i).map(x => x.trim()).filter(Boolean); if (q2.accept.length) okSet.add(q2); break; }
        case 'fill': {
          q2 = newQ('fill'); let text = body.join('\n').trim();
          if (/\{\{[^}]+\}\}/.test(text)) okSet.add(q2);
          else if (ans) { const parts = ans.split(/\n|;/).map(x => x.trim()).filter(Boolean); let k = 0; const t2 = text.replace(new RegExp(TI.BLANK.source, 'g'), mm => k < parts.length ? '{{' + parts[k++].split(/\s*\/\s*/).join('|') + '}}' : mm); if (k) { text = t2; okSet.add(q2); } }
          q2.text = text; if (!o.pts) q2.points = Math.max(1, fillParts(text).filter(p => p.a).length);
          break;
        }
        case 'match': {
          q2 = newQ('match'); const tx = [], pairs = [];
          body.forEach(l => { const mm = l.trim().match(/^(.*?)\s*(?:=>|->|::)\s*(.*)$/); if (mm && mm[1] && mm[2]) pairs.push([mm[1].trim(), mm[2].trim()]); else tx.push(l); });
          q2.text = trimBlank(tx).join('\n'); q2.pairs = pairs; if (pairs.length >= 2) okSet.add(q2); break;
        }
        case 'order': {
          q2 = newQ('order'); const tx = [], items = [];
          body.forEach(l => { const mm = l.trim().match(/^(?:[-•*]|\d{1,2}[.)])\s+(.*)$/); if (mm) items.push(mm[1].trim()); else tx.push(l); });
          q2.text = trimBlank(tx).join('\n'); q2.items = items; if (items.length >= 2) okSet.add(q2); break;
        }
        default: q2 = newQ('essay'); q2.text = body.join('\n').trim(); q2.sample = ans; okSet.add(q2);
      }
      if (o.pts && q2.type !== 'essay') q2.points = o.pts;
      q2.pre = o.pre; q2.expl = o.why; if (o.img) q2.img = o.img; if (o.yt) q2.yt = Object.assign(defYt(2), o.yt);
      if (/^\s*\[AI tự giải/i.test(o.why)) ai++;
      if (!okSet.has(q2)) missQ.add(q2);
      ns.questions.push(q2);
    });
    if (!ns.questions.length) { if (ns.passage) warn(`"${ns.title || 'Phần'}" có đoạn văn nhưng không có câu hỏi – đã bỏ.`); return; }
    secOut.push(ns);
  });
  const all = [].concat.apply([], secOut.map(s => s.questions));
  if (!all.length) warn('Không có câu hỏi nào. Mỗi câu phải bắt đầu bằng dòng "@Q loại" (vd @Q mcq).');
  if (missQ.size) warn(`${missQ.size} câu chưa có đáp án hợp lệ (đánh dấu ⚠). Bổ sung ở ô "Đáp án" hoặc trong trình soạn.`);
  if (ai) warn(`${ai} câu do AI tự giải (có ghi "[AI tự giải …]" trong giải thích) – hãy kiểm tra lại đáp án.`);
  return { tagged: true, meta: meta.name || meta.limit || meta.yt ? meta : null, sections: secOut, questions: all, errors: all.length ? [] : [{ line: '–', msg: 'Không có câu hỏi.' }], warnings: rep.map(r => ({ line: '–', msg: r.msg })), missing: [], missQ };
};
const NLM_PROMPT = `NHIỆM VỤ
Chuyển TOÀN BỘ đề kiểm tra trong nguồn (PDF, ảnh, văn bản – bất kỳ môn, bất kỳ loại: đọc, nghe, viết, ngữ pháp, từ vựng, chỉ trắc nghiệm, tự luận, đúng/sai…) sang "ĐỊNH DẠNG CHUẨN" dưới đây để ứng dụng đọc được. Bạn là MÁY SAO CHÉP GẮN THẺ, không phải người biên tập.

NGUYÊN TẮC VÀNG
1. Sao chép NGUYÊN VĂN từng chữ, dấu câu, chính tả, số liệu, ký hiệu của đề (đoạn văn, hướng dẫn, câu hỏi, lựa chọn). TUYỆT ĐỐI không diễn đạt lại, tóm tắt, dịch, sửa lỗi, sắp xếp lại, bỏ sót hoặc thêm nội dung vào đề. Chỉ được: (a) thêm các dòng thẻ bắt đầu bằng @; (b) bỏ số thứ tự đầu câu ("1.", "Câu 1:", "Question 1") vì app tự đánh số – nhưng GIỮ nguyên nhãn chỗ trống trong đoạn văn như (14) hay [14]; (c) nối các dòng bị ngắt giữa câu do bố cục PDF; (d) chép bảng thành các dòng chữ, các ô cách nhau bằng " | ".
2. Không bỏ sót: số dòng @Q phải bằng số câu hỏi của đề (mỗi chỗ trống cần điền, mỗi mệnh đề đúng/sai, mỗi mục nối… tính theo mục 4). Đếm lại trước khi trả lời.
3. Chỉ xuất VĂN BẢN THUẦN: không markdown (không **, #, bảng |---|), không khối code, không lời dẫn. Có thể kết thúc bằng một dòng "@NOTE …" ghi điều cần tôi kiểm tra.
4. Đa cột / bố cục lạ: đọc theo đúng thứ tự người làm bài đọc (cột trái trước rồi cột phải; đoạn văn trước, câu hỏi sau).

CÁC THẺ (mỗi thẻ nằm ở ĐẦU DÒNG; nội dung chạy tiếp đến thẻ kế tiếp)
@TEST Tên bài test | số phút        (tùy chọn, 1 lần ở đầu; bỏ "| số phút" nếu đề không ghi)
@AUDIO link | bắt đầu | kết thúc | số lượt nghe | show   (chỉ khi tôi cung cấp link YouTube; xem mục 6)
@SECTION Tiêu đề phần          (mỗi Part / Section / Passage / Task / Bài / PHẦN I… mở một phần mới)
@INSTR hướng dẫn chung của phần (nguyên văn, nhiều dòng được)
@PASSAGE
đoạn văn / ngữ liệu / bài đọc / đề viết dùng chung cho cả phần (nguyên văn, giữ dòng trống giữa các đoạn)
@IMAGE https://…               (chỉ khi tôi cung cấp link ảnh)
@GROUP
hướng dẫn của một NHÓM câu, hiện ngay phía trên câu kế tiếp (vd "Questions 6–10 Choose the correct heading…", ngân hàng từ, ví dụ mẫu, phần dẫn chung của câu đúng/sai)
@Q loại [điểm]                 (mở một câu hỏi; nội dung câu ở các dòng ngay dưới)
@ANS đáp án                    (đáp án đúng – xem quy tắc mục 5)
@WHY giải thích ngắn          (1–2 câu nêu bằng chứng)

CÁC LOẠI CÂU (@Q loại)
mcq    – trắc nghiệm 1 đáp án. Dòng câu hỏi, rồi mỗi lựa chọn một dòng "A. …", "B. …"… (giữ nguyên chữ). @ANS B
multi  – chọn NHIỀU đáp án đúng ("Choose TWO letters"). Như mcq. @ANS A, C
tf     – chỉ hai khả năng Đúng/Sai. @ANS TRUE hoặc FALSE
tfng   – True / False / Not Given (không cần chép lựa chọn). @ANS TRUE | FALSE | NOT GIVEN
ynng   – Yes / No / Not Given. @ANS YES | NO | NOT GIVEN
short  – trả lời ngắn / điền một từ-cụm từ / hoàn thành câu-ghi chú-biểu mẫu-bảng. Chép câu có chỗ trống. @ANS mọi đáp án chấp nhận, cách nhau bằng " / " (vd went / has gone)
fill   – chỗ trống nằm GIỮA câu/đoạn. Chép câu và thay mỗi chỗ trống bằng {{đáp án}}; nhiều đáp án đều đúng: {{am|'m}}. Hoặc để nguyên ____ rồi @ANS đáp án từng chỗ trống theo thứ tự, cách nhau bằng dấu ";"
match  – nối cặp 1-1 (từ–nghĩa, câu hỏi–câu trả lời). Mỗi cặp ĐÚNG một dòng: vế trái => vế phải
order  – sắp xếp từ/cụm/câu/đoạn thành thứ tự đúng. Các mục theo ĐÚNG thứ tự, mỗi mục một dòng bắt đầu bằng "- "
essay  – tự luận / viết đoạn / viết bài / nói / trả lời mở. Chép đề; @ANS là bài mẫu hoặc tiêu chí chấm nếu nguồn có (không có thì bỏ @ANS)

CHỌN LOẠI CÂU CHO TỪNG KIỂU ĐỀ
- Trắc nghiệm A/B/C/D (mọi môn) → mcq. "Chọn 2/3 đáp án" → multi.
- True/False/Not Given, Yes/No/Not Given (IELTS) → tfng / ynng. Đúng/Sai thường → tf.
- Đề kiểu "Đúng/Sai" gồm 1 câu dẫn + các ý a), b), c), d): đặt câu dẫn trong @GROUP, mỗi ý a), b)… là một "@Q tf" (chép nguyên văn ý đó).
- Matching headings / matching information / matching features / ghép người–ý kiến (chọn từ DANH SÁCH CHUNG): mỗi mục cần ghép = một "@Q mcq", mà các lựa chọn là TOÀN BỘ danh sách chung (chép lại danh sách đó cho từng câu, đánh lại A., B., C.… theo thứ tự danh sách; giữ nguyên chữ). Đặt hướng dẫn chung vào @GROUP trước câu đầu tiên của nhóm.
- Ghép từ–nghĩa / câu hỏi–đáp án KHÔNG dùng chung danh sách → một "@Q match" duy nhất chứa tất cả các cặp.
- Sentence/note/summary/flow-chart/table/form completion, short-answer questions → mỗi chỗ trống hoặc mỗi câu là một "@Q short" (chép nguyên câu/dòng có chỗ trống). Nếu có NGÂN HÀNG TỪ chung: đặt ngân hàng từ trong @GROUP.
- Điền vào ĐOẠN VĂN liền mạch có nhiều chỗ trống đánh số (cloze, open cloze, summary): chép cả đoạn vào MỘT "@Q fill" với mỗi chỗ trống viết dạng (14) {{đáp án}}; đặt điểm bằng số chỗ trống (vd "@Q fill 6"). Hoặc nếu đề cho 3–4 lựa chọn cho từng chỗ trống (Cambridge Part 1) → mỗi chỗ trống là một "@Q mcq" với câu hỏi là nhãn chỗ trống, vd (14).
- Chia dạng động từ trong ngoặc, word formation, error identification, viết lại câu (rewrite/transform) → short hoặc fill; liệt kê MỌI cách viết đúng nguồn cho phép trong @ANS, cách nhau " / ".
- Sắp xếp từ thành câu, sắp xếp câu thành đoạn hội thoại → order.
- Writing Task 1/2, viết thư/email, Speaking prompt, đề tự luận mọi môn (Văn, Sử, Địa… nếu có) → essay.
- Toán/Lý/Hóa/Sinh: trắc nghiệm → mcq; điền số/kết quả → short (ghi các dạng viết tương đương, vd 0,5 / 1/2); tự luận chứng minh/giải → essay. Công thức chép ở dạng chữ/LaTeX đúng như nguồn.
- Điểm: nếu đề ghi điểm/mark cho câu thì "@Q loại điểm" (vd "@Q mcq 0.5"); không ghi thì để mặc định (không viết số).

QUY TẮC ĐÁP ÁN VÀ GIẢI THÍCH
- Có bảng đáp án / mark scheme / answer key trong nguồn → dùng NGUYÊN theo đó.
- Nguồn KHÔNG có đáp án → tự giải thật cẩn thận, vẫn ghi @ANS, và bắt đầu @WHY bằng "[AI tự giải – cần kiểm tra] ".
- @WHY: 1–2 câu, nêu bằng chứng (vd "Đoạn 2: 'rides his bicycle'"). Nếu nguồn có lời giải/transcript, dùng nó để viết @WHY. Câu tự luận có thể bỏ @WHY.
- Nhiều đáp án chấp nhận (đáp án mở/số/biến thể chính tả) → @ANS liệt kê hết, cách nhau " / ".

PHẦN NGHE (LISTENING)
- Mỗi Part/Section nghe là một @SECTION. Nếu tôi đưa link YouTube ở cuối prompt, đặt "@AUDIO link | bắt đầu | kết thúc | số lượt nghe" ngay sau @SECTION tương ứng (một file ghi âm chung cho cả bài thì đặt @AUDIO ngay dưới @TEST, trước mọi @SECTION). Số lượt nghe mặc định 1. Không có link → KHÔNG tự bịa, bỏ @AUDIO và thêm vào @NOTE cuối cùng: "Cần link nghe: Part …".
- KHÔNG đưa transcript/tapescript vào @PASSAGE (học sinh sẽ thấy đáp án). Chỉ dùng nó để viết @ANS/@WHY.
- Câu hỏi của phần nghe vẫn chép nguyên văn (kể cả biểu mẫu/ghi chú cần điền).

HÌNH, BIỂU ĐỒ, BẢN ĐỒ
- Không chép được nội dung hình: ghi đúng một dòng "[HÌNH: mô tả ngắn những gì thấy]" tại vị trí hình trong @PASSAGE hoặc câu hỏi, và thêm vào @NOTE "Cần ảnh: …". Nếu tôi cung cấp link ảnh https → dùng @IMAGE.
- Câu hỏi gắn nhãn hình/bản đồ (A–H) → mcq với các lựa chọn là nhãn.

KIỂM TRA TRƯỚC KHI TRẢ LỜI
(a) mọi câu có @Q và @ANS (trừ essay không có đáp án mẫu); (b) mcq/multi có ≥ 2 lựa chọn "A." "B." đúng thứ tự và @ANS là chữ cái nằm trong phạm vi; (c) fill có {{…}} hoặc ____ khớp số đáp án trong @ANS; (d) match ≥ 2 cặp, order ≥ 2 mục; (e) mỗi @SECTION có ít nhất một @Q; (f) văn bản đề giữ NGUYÊN VĂN, không paraphrase; (g) số @Q khớp số câu của đề.

VÍ DỤ ĐỊNH DẠNG (chỉ minh họa cấu trúc – không đưa vào kết quả)
@TEST Kiểm tra tổng hợp | 45
@SECTION Part 1 – Reading
@INSTR Read the text and answer questions 1–6.
@PASSAGE
Tom lives in Da Nang with his family. Every morning he rides his bicycle to school.

On Sundays, Tom helps his mother cook lunch.
@GROUP
Questions 1–2
Do the following statements agree with the information given in the text?
Write TRUE if the statement agrees, FALSE if it contradicts, NOT GIVEN if there is no information.
@Q tfng
Tom goes to school by bus.
@ANS FALSE
@WHY Đoạn 1: he rides his bicycle.
@Q tfng
Tom has two sisters.
@ANS NOT GIVEN
@Q mcq
Where does Tom live?
A. Hanoi
B. Hue
C. Da Nang
@ANS C
@WHY Câu đầu của đoạn 1.
@Q short 2
What does Tom do on Sundays? (Write NO MORE THAN FOUR WORDS)
@ANS helps his mother cook lunch / cooks lunch
@SECTION Part 2 – Listening
@AUDIO https://youtu.be/XXXXXXXXXXX | 0:05 | 1:30 | 1
@Q mcq
What is the speaker's job?
A. Teacher
B. Doctor
C. Driver
@ANS A
@WHY [AI tự giải – cần kiểm tra] Người nói tự giới thiệu ở đầu bài nghe.
@SECTION Part 3 – Grammar & Vocabulary
@INSTR Choose or type the correct answer.
@Q fill 2
I {{am|'m}} a student and she {{is|'s}} a teacher.
@Q match 3
Match the word with its meaning.
airport => sân bay
luggage => hành lý
passport => hộ chiếu
@Q order 2
Put the words in the correct order.
- I
- like
- playing
- football
@Q multi
Choose TWO fruits.
A. Apple
B. Carrot
C. Banana
@ANS A, C
@SECTION Part 4 – Writing
@Q essay
Write 2–3 sentences about your weekend.
@ANS Last weekend I visited my grandparents. We cooked lunch together.
@NOTE Cần link nghe cho Part 2 nếu chưa có.

THÔNG TIN BỔ SUNG TỪ TÔI (nếu có – điền trước khi gửi):
- Link YouTube: Part … = https://…  (bắt đầu 0:00, kết thúc …, số lượt nghe …)
- Link ảnh: …
- Tên bài / thời gian làm bài: …

HÃY CHUYỂN ĐỀ TRONG NGUỒN THEO ĐÚNG ĐỊNH DẠNG TRÊN. Chỉ trả về nội dung đã chuẩn hóa.
`;
const ANS_PROMPT = `Dưới đây là một đề kiểm tra. Hãy GIẢI đề và chỉ trả về BẢNG ĐÁP ÁN – tuyệt đối KHÔNG chép lại, không diễn đạt lại, không tóm tắt đề.
Mỗi câu một dòng, đúng định dạng:   số câu: đáp án | giải thích ngắn
- Trắc nghiệm: đáp án là chữ cái (ví dụ B). Nhiều đáp án đúng: A, C.
- True/False/Not Given: ghi TRUE / FALSE / NOT GIVEN (hoặc YES / NO / NOT GIVEN).
- Điền từ / trả lời ngắn: ghi đáp án; nếu có nhiều đáp án chấp nhận thì ngăn cách bằng " / ".
- Giải thích 1–2 câu, nêu bằng chứng trong đoạn văn / bài nghe.
- Đánh số đúng theo số thứ tự trong đề. Không thêm lời dẫn hay chú thích nào khác.
Ví dụ:
1: B | Câu đầu của đoạn 1 nói rõ ...
2: TRUE | Đoạn 2 cho biết ...
3: went / has gone | go là động từ bất quy tắc.

ĐỀ:
`;
function openTextImport(onUse, canAppend) {
  const txt = h('textarea', { rows: 9, id: 'ti-text', placeholder: 'Dán nguyên văn đề thi (đoạn văn, câu hỏi, lựa chọn…) vào đây – hoặc chọn file .txt bên dưới.', style: 'min-height:160px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.85rem' });
  const ans = h('textarea', { rows: 5, id: 'ti-ans', placeholder: '1: B | giải thích\n2: TRUE | …\n3: went / has gone | …', style: 'min-height:100px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.85rem' });
  const nameEl = h('input', { type: 'text', id: 'ti-name', maxlength: 80, placeholder: '(để trống: tự lấy dòng tiêu đề đầu file)' });
  const unwrap = h('input', { type: 'checkbox', id: 'ti-unwrap' });
  const out = h('div', { class: 'stack', role: 'status' });
  const fileIn = h('input', { type: 'file', accept: '.txt,.md,text/plain', onchange: e => { const f = e.target.files[0]; if (!f) return; const fr = new FileReader(); fr.onload = () => { txt.value = String(fr.result).replace(/^\ufeff/, ''); if (!nameEl.value) nameEl.value = ''; run(); }; fr.readAsText(f, 'utf-8'); } });
  let res = null, timer = null;
  const typeCount = r => { const by = {}; r.questions.forEach(q => { by[q.type] = (by[q.type] || 0) + 1; }); return Object.keys(by).map(k => QTYPES[k] + ': ' + by[k]).join(' · '); };
  function run() {
    clearTimeout(timer); timer = setTimeout(() => {
      if (!txt.value.trim()) { res = null; out.replaceChildren(); useBtns.forEach(b => { b.disabled = true; }); return; }
      res = TI.parse(txt.value, ans.value, { name: nameEl.value, unwrap: unwrap.checked });
      useBtns.forEach(b => { b.disabled = !res.questions.length; });
      out.replaceChildren(
        h('p', { class: res.questions.length ? 'ok' : 'err', text: (res.tagged ? '✓ Định dạng chuẩn · ' : '') + `Nhận ra ${res.sections.length} phần · ${res.questions.length} câu` + (res.missQ.size ? ` · ${res.missQ.size} câu chưa có đáp án` : ' · tất cả đã có đáp án') }),
        res.questions.length ? h('p', { class: 'muted small-text', text: typeCount(res) }) : null,
        res.warnings.length ? h('div', { class: 'box warn' }, h('ul', null, res.warnings.map(w => h('li', { text: w.msg })))) : null,
        h('div', { class: 'box', style: 'max-height:32vh;overflow:auto' }, res.sections.map(s => h('div', { class: 'stack', style: 'margin-bottom:.6rem' },
          h('strong', { text: (s.title || '(phần không tên)') + (s.passage ? `  📄 ${s.passage.length.toLocaleString('vi-VN')} ký tự` : '') }),
          s.instr ? h('div', { class: 'muted small-text', text: 'Hướng dẫn: ' + s.instr.slice(0, 120) }) : null,
          s.questions.map((q, i) => h('div', { class: 'small-text', text: `• ${QTYPES[q.type].split(' (')[0]}: ${q.text.slice(0, 80) || '(chỗ trống)'}${q.type === 'mcq' || q.type === 'multi' ? ` [${q.opts.length} lựa chọn]` : ''} ${res.missQ.has(q) ? '⚠' : ''}` }))))));
    }, 250);
  }
  [txt, ans, nameEl].forEach(el => el.addEventListener('input', run)); unwrap.addEventListener('change', run);
  const mkBtn = (label, how, primary) => h('button', { class: 'btn' + (primary ? ' primary' : ''), disabled: true, onclick: () => { if (!res || !res.questions.length) return; d.close(); const r = res; if (nameEl.value.trim() || r.meta) r.meta = Object.assign({ desc: '', limit: 0, yt: null }, r.meta || {}, nameEl.value.trim() ? { name: nameEl.value.trim() } : {}); onUse(r, how); } }, label);
  const useBtns = canAppend ? [mkBtn('Thêm vào cuối', 'append', false), mkBtn('Thay toàn bộ', 'replace', true)] : [mkBtn('Tạo bài test', 'replace', true)];
  const d = Modal.open('Nhập đề từ văn bản', h('div', { class: 'stack' },
    h('p', { class: 'hint', text: 'Đề được tách trực tiếp từ văn bản bạn dán, không qua AI nên câu hỏi và đoạn văn giữ nguyên 100%. Kiểm tra bản xem trước rồi bấm tạo; mọi chỗ chưa đúng sửa được trong trình soạn.' }),
    h('div', { class: 'box' }, h('strong', { text: 'Bước 1 – NotebookLM: ' }), 'bấm nút bên dưới, dán vào NotebookLM (đã nạp PDF/ảnh đề), rồi copy kết quả vào ô dưới.  ',
      h('button', { class: 'btn small primary', type: 'button', onclick: async () => { const tmp = h('textarea', { style: 'position:fixed;left:-999px' }); tmp.value = NLM_PROMPT; document.body.append(tmp); const ok = await copyText(NLM_PROMPT, tmp); tmp.remove(); toast(ok ? 'Đã copy prompt NotebookLM.' : 'Không copy được – dùng file PROMPT-NOTEBOOKLM.md', ok ? 'info' : 'error'); } }, '📋 Copy prompt cho NotebookLM')),
    h('label', { for: 'ti-text', text: 'Bước 2 – Dán văn bản đề (định dạng chuẩn @… hoặc đề thường)' }), txt, h('div', { class: 'row wrap' }, h('label', { class: 'btn small', style: 'margin:0;cursor:pointer' }, '📄 Chọn file .txt', fileIn)),
    h('label', { for: 'ti-name', text: 'Tên bài test (tùy chọn)' }), nameEl,
    h('label', { class: 'check', for: 'ti-unwrap' }, unwrap, 'Nối các dòng bị ngắt giữa câu (khi copy từ PDF bị xuống dòng lung tung)'),
    h('details', { class: 'box', open: false }, h('summary', { text: 'Bảng đáp án & giải thích riêng (chỉ cần nếu đề chưa có đáp án)' }), h('div', { class: 'stack' },
      h('p', { class: 'hint', text: 'Mỗi dòng:  số câu: đáp án | giải thích. Nếu đề đã có phần "Answer key / Đáp án" ở cuối, app tự nhận – không cần dán ở đây.' }), ans,
      h('button', { class: 'btn small', type: 'button', onclick: async () => { const tmp = h('textarea', { style: 'position:fixed;left:-999px' }); tmp.value = ANS_PROMPT + txt.value; document.body.append(tmp); const ok = await copyText(tmp.value, tmp); tmp.remove(); toast(ok ? 'Đã copy (câu lệnh + đề). Dán vào AI, rồi dán kết quả vào ô này.' : 'Không copy được – hãy copy thủ công.', ok ? 'info' : 'error'); } }, '📋 Copy câu lệnh + đề để hỏi AI đáp án'))),
    out, h('div', { class: 'row end wrap' }, h('button', { class: 'btn', onclick: () => d.close() }, 'Hủy'), useBtns)));
  d.style.maxWidth = 'min(920px,96vw)';
  return d;
}

/* ---------- Giao bài test ---------- */
function openAssignTest(t) {
  const bad = testProblems(t);
  if (bad.length) return Modal.open('Bài test chưa hợp lệ', h('div', null, h('ul', null, bad.slice(0, 10).map(b => h('li', { text: b }))), h('a', { class: 'btn primary', href: '#/test-edit/' + t.id, onclick: () => document.querySelector('dialog.modal') && document.querySelector('dialog.modal').close() }, 'Mở trình soạn')));
  const due = h('input', { type: 'datetime-local', id: 'ta-due', value: toLocalInput(Date.now() + 7 * 864e5) });
  const max = h('input', { type: 'number', id: 'ta-max', min: 0, max: 20, value: 0 });
  const req = h('input', { type: 'checkbox', id: 'ta-req', checked: true });
  const nameIn = h('input', { type: 'text', id: 'ta-name', maxlength: 80, value: t.name, autocomplete: 'off' });
  const out = h('div', { 'aria-live': 'polite', class: 'stack' }), go = h('button', { class: 'btn primary', onclick: create }, 'Tạo link giao bài');
  Modal.open('Giao bài test – ' + t.name, h('div', null,
    h('label', { for: 'ta-name', text: 'Tên bài giao (học sinh thấy tên này, và hiện trong Thống kê test)' }), nameIn,
    h('p', { class: 'hint', text: 'Đổi tên ở đây không làm đổi tên thẻ bài test. Để trống = dùng tên thẻ.' }),
    h('label', { for: 'ta-due', text: 'Hạn nộp (giờ máy bạn)' }), due, h('label', { for: 'ta-max', text: 'Số lần làm tối đa (0 = không giới hạn)' }), max,
    h('label', { class: 'check', for: 'ta-req' }, req, 'Bắt buộc nhập Họ tên và Lớp'), h('div', { class: 'row end' }, go), out));
  async function create() {
    const dueMs = new Date(due.value).getTime();
    if (!dueMs || dueMs <= Date.now()) return out.replaceChildren(h('p', { class: 'err', text: 'Hạn nộp phải ở tương lai.' }));
    if (!window.LZString) return out.replaceChildren(h('p', { class: 'err', text: 'Thư viện nén chưa tải được – kiểm tra mạng.' }));
    go.disabled = true; out.replaceChildren(loading('Đang tạo link…'));
    const st = Settings.data, url = st.scriptUrl, canSheet = API.validUrl(url) && !!st.teacherKey, test = slimTest(t);
    const a = { id: shortId(), name: Norm.text(nameIn.value).slice(0, 80) || t.name, link: '', due: dueMs, max: clamp(parseInt(max.value, 10) || 0, 0, 20), req: req.checked, shuffle: false, tts: {}, words: null };
    const base = location.href.split('#')[0], payload = { v: 1, id: a.id, n: a.name, test, due: a.due, max: a.max, req: a.req ? 1 : 0, u: API.validUrl(url) ? url : '' };
    let link = base + '#/taketest?d=' + Link.pack(payload), mode = 'inline', notes = [];
    const shortLink = base + '#/taketest?id=' + a.id + '&s=' + encodeURIComponent(url);
    a.link = link;       // lưu link lên Sheet để xem/copy lại trong Thống kê test
    const post = body => API.post(url, Object.assign({ action: 'saveTest', teacherKey: st.teacherKey, assignment: a }, body)).then(r => { if (!r.ok) throw new Error(r.message || r.error); });
    if (link.length > 2000) {
      if (canSheet) { a.link = shortLink; try { await post({ test }); link = shortLink; mode = 'sheet'; } catch (e) { mode = 'long'; notes.push('Không lưu được đề lên Google Sheet (' + e.message + '). Đang dùng link dài.'); } }
      else { mode = 'long'; notes.push('Link dài hơn 2000 ký tự. Hãy cấu hình Apps Script URL + Teacher Key (Cài đặt) để dùng link ngắn.'); }
    } else if (canSheet) { try { await post({ test: null }); } catch (e) { notes.push('Chưa đăng ký hạn nộp lên máy chủ (' + e.message + ').'); } }
    else notes.push('Chưa cấu hình Apps Script: học sinh làm được nhưng kết quả sẽ không được ghi về Sheet.');
    const box = h('textarea', { readonly: true, 'aria-label': 'Link giao bài test', style: 'min-height:90px;font-size:.8rem', onfocus: e => e.target.select() }); box.value = link;
    const canvas = h('canvas', { 'aria-label': 'Mã QR', role: 'img' });
    out.replaceChildren(h('p', { class: 'ok', text: mode === 'sheet' ? '✓ Link ngắn (đề đã lưu trên Google Sheet).' : '✓ Link chứa toàn bộ đề.' }),
      h('p', { class: 'hint', text: `Độ dài link: ${link.length} ký tự · Hạn: ${fmtDate(dueMs)}` }), ...notes.map(n => h('div', { class: 'box warn', text: n })),
      h('div', { class: 'box', text: 'Lưu ý: đáp án đúng nằm trong dữ liệu đề (ứng dụng không có máy chủ chấm điểm riêng) – phù hợp bài kiểm tra tại lớp / luyện tập, không phải thi nghiêm ngặt.' }), box,
      h('div', { class: 'row wrap' }, h('button', { class: 'btn primary', onclick: async () => toast(await copyText(link, box) ? 'Đã sao chép link.' : 'Hãy chọn và copy thủ công.') }, '📋 Copy link')), h('div', { class: 'qr' }, canvas));
    if (window.QRCode) QRCode.toCanvas(canvas, link, { width: 260, margin: 2, errorCorrectionLevel: 'L' }, err => { if (err) canvas.replaceWith(h('p', { class: 'err', text: 'Link quá dài để tạo mã QR. Hãy dùng link ngắn qua Google Sheet.' })); });
    else canvas.replaceWith(h('p', { class: 'err', text: 'Thư viện QR chưa tải được.' }));
    go.disabled = false;
  }
}

/* ---------- Trình soạn bài test (Bài test → Phần → Câu hỏi) ---------- */
function TestEditView(root, id) {
  let t = id === 'new' ? null : Tests.get(id), timer = null, dirty = false, secEls = {};
  if (id !== 'new' && !t) { root.replaceChildren(errorPanel('Không tìm thấy bài test này.')); return {}; }
  if (!t) t = { id: uid(), name: '', desc: '', limit: 0, shuffleQ: false, shuffleOpt: false, review: true, yt: defYt(1), sections: [newSec('Phần 1')], updatedAt: Date.now() };
  normTest(t);
  const openSecs = new Set(t.sections.length ? [t.sections[0].id] : []);
  const saved = h('span', { class: 'muted small-text', role: 'status' });
  const persist = () => {
    clearTimeout(timer); if (!t.name.trim() && !qCount(t)) return;
    t.updatedAt = Date.now(); if (!Tests.get(t.id)) Tests.list.unshift(t); if (Tests.save()) { dirty = false; saved.textContent = '✓ Đã lưu ' + new Date().toLocaleTimeString('vi-VN'); }
  };
  const touch = () => { dirty = true; saved.textContent = 'Đang chỉnh sửa…'; clearTimeout(timer); timer = setTimeout(persist, 1000); };
  const bind = (el, obj, key, conv) => { el.addEventListener('input', () => { obj[key] = conv ? conv(el.value) : el.value; touch(); }); return el; };
  const inp = (obj, key, attrs, conv) => bind(h('input', Object.assign({ type: 'text', value: obj[key] == null ? '' : obj[key] }, attrs)), obj, key, conv);
  const area = (obj, key, attrs) => { const el = h('textarea', Object.assign({ rows: 3 }, attrs)); el.value = obj[key] || ''; return bind(el, obj, key); };
  const lab = (text, el) => h('label', null, text, el);
  const list = h('div', { class: 'stack' });
  const flash = (msg) => toast(msg, 'error');
  const ytFields = (yt, note) => h('div', { class: 'stack' }, note ? h('p', { class: 'hint', text: note }) : null,
    lab('Link âm thanh / video (YouTube, Google Drive, Vimeo, file mp3 / mp4… hoặc bất kỳ link https)', inp(yt, 'url', { type: 'url', placeholder: 'Dán link bất kỳ: https://…' })),
    h('p', { class: 'hint', text: 'YouTube và file trực tiếp: học sinh chỉ có nút Nghe (không tua, có đếm lượt). Link không nhúng được (chủ video tắt nhúng, trang web khác…) sẽ hiện nút “Mở trong tab mới” cho học sinh.' }),
    h('div', { class: 'row wrap' }, lab('Bắt đầu (vd 0:05)', inp(yt, 'start', { style: 'width:110px' })), lab('Kết thúc (vd 12:30)', inp(yt, 'end', { style: 'width:110px' })),
      lab('Số lượt nghe (0 = không giới hạn)', inp(yt, 'plays', { type: 'number', min: 0, max: 20, style: 'width:120px' }, v => parseInt(v, 10) || 0))),
    h('div', { class: 'row wrap' }, h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: yt.hide !== false, onchange: e => { yt.hide = e.target.checked; touch(); } }), 'Ẩn hình, chỉ nghe tiếng'),
      h('button', { class: 'btn small', type: 'button', onclick: () => { const y = slimYt(yt); if (!y) return flash('Link chưa hợp lệ (cần bắt đầu bằng https://).'); const a = AudioClip({ id: 'pv', yt: y }, {}, true); Modal.open('Nghe thử', a.el, a.destroy); } }, '▶ Nghe thử')));

  const bodies = {
    mcq: q => optsEd(q), multi: q => optsEd(q),
    tf: q => h('div', { class: 'row wrap' }, [true, false].map(v => h('label', { class: 'check' }, h('input', { type: 'radio', name: 'tf' + q.id, checked: q.ans === v, onchange: () => { q.ans = v; touch(); } }), v ? 'Đáp án: Đúng' : 'Đáp án: Sai'))),
    short: q => { const el = h('textarea', { rows: 3, 'aria-label': 'Đáp án chấp nhận' }); el.value = (q.accept || []).join('\n'); el.addEventListener('input', () => { q.accept = el.value.split('\n').map(s => s.trim()).filter(Boolean); touch(); }); return h('div', null, h('label', null, 'Các đáp án được chấp nhận (mỗi dòng một đáp án; không phân biệt hoa/thường)'), el); },
    fill: () => h('p', { class: 'hint', text: "Đặt đáp án trong {{ }}; nhiều đáp án chấp nhận thì ngăn cách bằng | – ví dụ: I {{am|'m}} a student. Mỗi chỗ trống được chấm riêng." }),
    match: q => pairsEd(q), order: q => orderEd(q),
    essay: q => h('div', null, h('p', { class: 'hint', text: 'Câu tự luận không tự chấm: bài viết của học sinh được gửi về Sheet để bạn xem; không tính vào điểm.' }), lab('Gợi ý đáp án / tiêu chí chấm (hiện cho học sinh khi xem lại)', area(q, 'sample', { rows: 3 })))
  };
  function optsEd(q) {
    const multi = q.type === 'multi', box = h('div', { class: 'stack' });
    const draw = () => box.replaceChildren(h('p', { class: 'hint', text: multi ? 'Tích vào tất cả đáp án đúng.' : 'Chọn một đáp án đúng.' }),
      q.opts.map((o, k) => {
        const c = h('input', { type: multi ? 'checkbox' : 'radio', name: 'c' + q.id, checked: q.ans.includes(k), 'aria-label': 'Là đáp án đúng', onchange: () => { q.ans = multi ? (c.checked ? q.ans.concat(k) : q.ans.filter(x => x !== k)) : [k]; touch(); } });
        const tx = h('input', { type: 'text', value: o, placeholder: 'Lựa chọn ' + String.fromCharCode(65 + k), 'aria-label': 'Lựa chọn ' + String.fromCharCode(65 + k), oninput: () => { q.opts[k] = tx.value; touch(); } });
        return h('div', { class: 'row' }, c, tx, h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Xóa lựa chọn', disabled: q.opts.length <= 2, onclick: () => { q.opts.splice(k, 1); q.ans = q.ans.filter(x => x !== k).map(x => x > k ? x - 1 : x); draw(); touch(); } }, '✕'));
      }), h('button', { class: 'btn small', type: 'button', disabled: q.opts.length >= 8, onclick: () => { q.opts.push(''); draw(); touch(); } }, '＋ Thêm lựa chọn'));
    draw(); return box;
  }
  function pairsEd(q) {
    const box = h('div', { class: 'stack' });
    const draw = () => box.replaceChildren(h('p', { class: 'hint', text: 'Mỗi dòng là một cặp đúng (vế trái – vế phải). Học sinh sẽ thấy vế phải bị xáo trộn.' }),
      q.pairs.map((p, k) => h('div', { class: 'row' }, h('input', { type: 'text', value: p[0], 'aria-label': 'Vế trái ' + (k + 1), placeholder: 'Vế trái', oninput: e => { p[0] = e.target.value; touch(); } }), h('span', { 'aria-hidden': 'true', text: '↔' }),
        h('input', { type: 'text', value: p[1], 'aria-label': 'Vế phải ' + (k + 1), placeholder: 'Vế phải', oninput: e => { p[1] = e.target.value; touch(); } }),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Xóa cặp', disabled: q.pairs.length <= 2, onclick: () => { q.pairs.splice(k, 1); draw(); touch(); } }, '✕'))),
      h('button', { class: 'btn small', type: 'button', disabled: q.pairs.length >= 10, onclick: () => { q.pairs.push(['', '']); draw(); touch(); } }, '＋ Thêm cặp'));
    draw(); return box;
  }
  function orderEd(q) {
    const box = h('div', { class: 'stack' });
    const draw = () => box.replaceChildren(h('p', { class: 'hint', text: 'Nhập các mục theo ĐÚNG thứ tự. Học sinh sẽ thấy thứ tự bị xáo trộn.' }),
      q.items.map((it, k) => h('div', { class: 'row' }, h('span', { class: 'pill', text: String(k + 1) }), h('input', { type: 'text', value: it, 'aria-label': 'Mục ' + (k + 1), oninput: e => { q.items[k] = e.target.value; touch(); } }),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Lên', disabled: k === 0, onclick: () => { q.items.splice(k - 1, 0, q.items.splice(k, 1)[0]); draw(); touch(); } }, '▲'),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Xuống', disabled: k === q.items.length - 1, onclick: () => { q.items.splice(k + 1, 0, q.items.splice(k, 1)[0]); draw(); touch(); } }, '▼'),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Xóa mục', disabled: q.items.length <= 2, onclick: () => { q.items.splice(k, 1); draw(); touch(); } }, '✕'))),
      h('button', { class: 'btn small', type: 'button', disabled: q.items.length >= 10, onclick: () => { q.items.push(''); draw(); touch(); } }, '＋ Thêm mục'));
    draw(); return box;
  }
  function changeType(q, nt) {
    const n = newQ(nt); ['id', 'text', 'pre', 'passage', 'img', 'yt', 'points', 'expl'].forEach(k => { n[k] = q[k]; });
    if ((q.type === 'mcq' || q.type === 'multi') && (nt === 'mcq' || nt === 'multi')) { n.opts = q.opts; n.ans = nt === 'mcq' ? q.ans.slice(0, 1) : q.ans; }
    Object.keys(q).forEach(k => { delete q[k]; }); Object.assign(q, n);
  }
  function qEditor(q, sec, i, no) {
    const typeSel = h('select', { 'aria-label': 'Loại câu hỏi', onchange: () => { changeType(q, typeSel.value); drawAll(); touch(); } }, Object.keys(QTYPES).map(k => h('option', { value: k, selected: k === q.type }, QTYPES[k])));
    const mv = d => { const j = i + d; if (j < 0 || j >= sec.questions.length) return; sec.questions.splice(j, 0, sec.questions.splice(i, 1)[0]); drawAll(); touch(); };
    const secSel = t.sections.length > 1 ? h('select', { 'aria-label': 'Chuyển sang phần', title: 'Chuyển câu này sang phần khác', onchange: () => { const to = t.sections[Number(secSel.value)]; sec.questions.splice(i, 1); to.questions.push(q); openSecs.add(to.id); drawAll(); touch(); } },
      t.sections.map((x, k) => h('option', { value: String(k), selected: x === sec }, 'Phần ' + (k + 1)))) : null;
    const prob = qProblem(q), yt = q.yt;
    return h('section', { class: 'card q-ed', 'aria-label': 'Câu ' + no },
      h('div', { class: 'row wrap q-ed-head' }, h('strong', { class: 'qno', text: String(no) }), typeSel, secSel,
        q.type === 'essay' ? null : h('label', { class: 'pts' }, 'Điểm ', inp(q, 'points', { type: 'number', min: .25, max: 100, step: .25, style: 'width:90px' }, v => parseFloat(v) || 1)), h('span', { style: 'flex:1' }),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Chuyển lên', disabled: i === 0, onclick: () => mv(-1) }, '▲'), h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Chuyển xuống', disabled: i === sec.questions.length - 1, onclick: () => mv(1) }, '▼'),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Nhân đôi câu', onclick: () => { sec.questions.splice(i + 1, 0, Object.assign(normQ(q), { id: shortId() })); drawAll(); touch(); } }, '⧉'),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Xóa câu', onclick: () => { const x = sec.questions.splice(i, 1)[0]; drawAll(); touch(); toast('Đã xóa câu ' + no + '.', 'info', { label: 'Hoàn tác', onClick: () => { sec.questions.splice(Math.min(i, sec.questions.length), 0, x); drawAll(); touch(); } }); } }, '🗑')),
      prob ? h('p', { class: 'err small-text', text: '⚠ ' + prob }) : null,
      lab('Hướng dẫn nhóm câu (hiện phía trên câu này, vd “Questions 6–10 …”) – tùy chọn', area(q, 'pre', { rows: 2 })),
      lab(q.type === 'fill' ? 'Nội dung (đặt đáp án trong {{ }})' : 'Câu hỏi', area(q, 'text', { rows: 2, placeholder: q.type === 'fill' ? "I {{am|'m}} a student." : 'Nhập câu hỏi…' })),
      bodies[q.type](q),
      h('details', { class: 'box', open: !!(q.passage || q.img || yt.url) }, h('summary', { text: 'Riêng cho câu này: đoạn văn · âm thanh · hình ảnh (tùy chọn – nếu dùng chung cả phần hãy đặt ở phần)' }), h('div', { class: 'stack' },
        lab('Đoạn văn riêng của câu', area(q, 'passage', { rows: 3 })), ytFields(yt), lab('Link hình ảnh (https://…)', inp(q, 'img', { type: 'url', placeholder: 'https://…' })))),
      lab('Giải thích (hiện cho học sinh khi làm sai)', area(q, 'expl', { rows: 2 })));
  }
  function secEditor(s, si, offset) {
    const sum = h('summary', { class: 'sec-sum' }), body = h('div', { class: 'stack sec-body' });
    const setSum = () => { sum.textContent = `Phần ${si + 1}${s.title ? ': ' + s.title : ''} · ${s.questions.length} câu` + (s.passage ? ' · 📄' : '') + (s.yt && s.yt.url ? ' · 🎧' : ''); };
    setSum();
    const det = h('details', { class: 'card sec-ed', open: openSecs.has(s.id) }, sum, body); let built = false;
    const mvS = d => { const j = si + d; if (j < 0 || j >= t.sections.length) return; t.sections.splice(j, 0, t.sections.splice(si, 1)[0]); drawAll(); touch(); };
    function build() {
      built = true;
      const ti = inp(s, 'title', { maxlength: 100, placeholder: 'Ví dụ: Part 1 / Reading Passage 1 / Listening – Section 2' }); ti.addEventListener('input', setSum);
      const ps = area(s, 'passage', { rows: 8, class: 'sec-passage', placeholder: 'Dán đoạn văn dùng chung cho cả phần vào đây (nếu có). Giữ nguyên xuống dòng.' }); ps.addEventListener('input', setSum);
      body.replaceChildren(
        h('div', { class: 'row wrap' }, h('strong', { text: 'Thiết lập phần' }), h('span', { style: 'flex:1' }),
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Chuyển phần lên', disabled: si === 0, onclick: () => mvS(-1) }, '▲'), h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Chuyển phần xuống', disabled: si === t.sections.length - 1, onclick: () => mvS(1) }, '▼'),
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Nhân đôi phần', onclick: () => { const c = normSec(s); c.id = shortId(); c.title = (s.title + ' (bản sao)').trim(); c.questions.forEach(q => { q.id = shortId(); }); t.sections.splice(si + 1, 0, c); openSecs.add(c.id); drawAll(); touch(); } }, '⧉'),
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Xóa phần', onclick: async () => { if (s.questions.length && !await Modal.confirm(`Xóa "${s.title || 'Phần ' + (si + 1)}" cùng ${s.questions.length} câu hỏi?`, 'Xóa phần', true)) return; const x = t.sections.splice(si, 1)[0]; if (!t.sections.length) t.sections.push(newSec('Phần 1')); drawAll(); touch(); toast('Đã xóa phần.', 'info', { label: 'Hoàn tác', onClick: () => { t.sections.splice(Math.min(si, t.sections.length), 0, x); drawAll(); touch(); } }); } }, '🗑')),
        lab('Tiêu đề phần', ti), lab('Hướng dẫn làm phần (hiện đầu danh sách câu hỏi)', area(s, 'instr', { rows: 2, placeholder: 'Ví dụ: Read the text and answer questions 1–5.' })),
        lab('Đoạn văn dùng chung – hiện bên trái, các câu hỏi của phần hiện bên phải', ps), lab('Link hình ảnh dùng chung (https://…)', inp(s, 'img', { type: 'url' })),
        h('details', { class: 'box', open: !!s.yt.url }, h('summary', { text: '🎧 Âm thanh / video dùng chung cho cả phần (YouTube, Drive, mp3…)' }), ytFields(s.yt, 'Bài nghe nằm cố định trên đầu màn hình suốt thời gian học sinh làm các câu của phần này; học sinh bấm Nghe một lần, không tạm dừng/tua được.')),
        h('h3', { text: 'Câu hỏi của phần' }), s.questions.length ? s.questions.map((q, i) => qEditor(q, s, i, offset + i + 1)) : h('p', { class: 'muted', text: 'Chưa có câu hỏi trong phần này.' }),
        h('div', { class: 'row wrap' }, Object.keys(QTYPES).map(k => h('button', { class: 'btn small', type: 'button', onclick: () => addQ(s, k) }, '＋ ' + QTYPES[k]))));
    }
    det.addEventListener('toggle', () => { if (det.open) { openSecs.add(s.id); if (!built) build(); } else openSecs.delete(s.id); });
    if (det.open) build();
    return det;
  }
  function drawAll() { let off = 0; secEls = {}; list.replaceChildren(t.sections.map((s, si) => { const el = secEditor(s, si, off); off += s.questions.length; secEls[s.id] = el; return el; })); }
  function addQ(s, type) {
    if (qCount(t) >= 500) return flash('Tối đa 500 câu mỗi bài test.');
    s.questions.push(newQ(type)); openSecs.add(s.id); drawAll(); touch();
    const el = secEls[s.id], qs = el && el.querySelectorAll('.q-ed'), last = qs && qs[qs.length - 1];
    if (last) { last.scrollIntoView({ block: 'center' }); const ta = last.querySelector('textarea'); if (ta) ta.focus({ preventScroll: true }); }
  }
  const applyImport = (r, how, fname) => {
      const ns = r.sections.map(normSec);
      t.sections = how === 'replace' ? ns : t.sections.filter(s => s.questions.length || s.passage || s.title).concat(ns); if (!t.sections.length) t.sections = [newSec('Phần 1')];
      if (r.meta) {
        if (!t.name.trim() && r.meta.name) { t.name = r.meta.name; nameEl.value = t.name; } if (!t.desc && r.meta.desc) { t.desc = r.meta.desc; descEl.value = t.desc; } if (!t.limit && r.meta.limit) { t.limit = r.meta.limit; limEl.value = t.limit; }
        if (!t.yt.url && r.meta.yt) { t.yt = Object.assign(defYt(1), r.meta.yt); ytBox.replaceChildren(ytFields(t.yt, 'Bài nghe chạy suốt toàn bài test, nằm cố định trên đầu màn hình.')); }
      }
      if (!t.name.trim()) { t.name = (fname || 'Bài test nhập vào').replace(/\.[^.]+$/, ''); nameEl.value = t.name; }
      if (qCount(t) > 500) toast('Vượt 500 câu: chỉ 500 câu đầu được dùng khi làm bài.', 'error');
      openSecs.clear(); if (t.sections[0]) openSecs.add(t.sections[0].id); drawAll(); persist(); toast(`Đã nhập ${r.questions.length} câu.`);
  };
  const fileIn = h('input', { type: 'file', accept: '.csv,.tsv,.xlsx,.xls', style: 'display:none', onchange: e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    pickTestFile(f, (r, how) => applyImport(r, how, f.name), true);
  } });
  const nameEl = inp(t, 'name', { id: 'te-name', maxlength: 80, placeholder: 'Ví dụ: Kiểm tra Unit 3' }), descEl = area(t, 'desc', { id: 'te-desc', rows: 2, maxlength: 500 });
  const limEl = inp(t, 'limit', { id: 'te-lim', type: 'number', min: 0, max: 300 }, v => parseInt(v, 10) || 0);
  const chk = (key, text) => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: t[key] !== false && !!t[key], onchange: e => { t[key] = e.target.checked; touch(); } }), text);
  const ytBox = h('div', null, ytFields(t.yt, 'Bài nghe chạy suốt toàn bài test (ví dụ đề IELTS Listening ghi âm liền mạch), nằm cố định trên đầu màn hình ở mọi phần.'));
  root.replaceChildren(h('div', { class: 'stack' },
    h('div', { class: 'page-head' }, h('h1', { text: id === 'new' ? 'Tạo bài test' : 'Sửa bài test' }), h('div', { class: 'row wrap' }, saved,
      h('a', { class: 'btn', href: '#/', onclick: persist }, '‹ Về trang chủ'), h('button', { class: 'btn primary', onclick: () => { persist(); toast('Đã lưu bài test.'); } }, '💾 Lưu'))),
    h('section', { class: 'card' }, h('label', { for: 'te-name', text: 'Tên bài test' }), nameEl, h('label', { for: 'te-desc', text: 'Mô tả / hướng dẫn (tùy chọn)' }), descEl,
      h('label', { for: 'te-lim', text: 'Thời gian làm bài (phút, 0 = không giới hạn)' }), limEl,
      chk('shuffleQ', 'Xáo trộn thứ tự câu hỏi (trong từng phần)'), chk('shuffleOpt', 'Xáo trộn thứ tự lựa chọn (trắc nghiệm)'), chk('review', 'Cho học sinh xem đáp án đúng & giải thích sau khi nộp'),
      h('details', { class: 'box', open: !!t.yt.url, style: 'margin-top:.6rem' }, h('summary', { text: '🎧 Âm thanh cho CẢ bài test (tùy chọn)' }), ytBox)),
    h('p', { class: 'hint', text: 'Mỗi PHẦN gom một đoạn văn / bài nghe dùng chung cho nhiều câu hỏi. Khi làm bài, đoạn văn hiện bên trái, câu hỏi bên phải (như IELTS / Cambridge).' }),
    list,
    h('div', { class: 'row wrap' }, h('button', { class: 'btn primary', onclick: () => { const s = newSec('Phần ' + (t.sections.length + 1)); t.sections.push(s); openSecs.add(s.id); drawAll(); touch(); secEls[s.id].scrollIntoView({ block: 'start' }); } }, '＋ Thêm phần')),
    h('section', { class: 'card' }, h('h2', { text: 'Nhập đề' }), h('div', { class: 'row wrap' },
      h('button', { class: 'btn primary', onclick: () => openTextImport((r, how) => applyImport(r, how, ''), true) }, '📄 Nhập từ văn bản (dán đề)'),
      h('label', { class: 'btn', style: 'margin:0;cursor:pointer' }, '⬆ Nhập từ CSV/Excel', fileIn),
      h('button', { class: 'btn', onclick: () => csvDownload('mau-bai-test.csv', SAMPLE_TEST) }, '⬇ Tải file CSV mẫu'),
      h('button', { class: 'btn', onclick: () => { if (!qCount(t)) return flash('Chưa có câu hỏi.'); csvDownload((t.name || 'bai-test').replace(/[^\w\-]+/g, '_') + '.csv', t); } }, '⬇ Xuất bài này ra CSV'))),
    h('div', { class: 'row wrap' }, h('a', { class: 'btn', href: '#/test-practice/' + t.id, onclick: e => { persist(); if (!Tests.get(t.id)) { e.preventDefault(); flash('Hãy thêm tên hoặc câu hỏi trước.'); } } }, '▶ Làm thử'),
      h('button', { class: 'btn', onclick: () => { persist(); if (Tests.get(t.id)) openAssignTest(t); else flash('Hãy thêm tên hoặc câu hỏi trước.'); } }, '📤 Giao bài'))));
  drawAll();
  return { destroy() { if (dirty) persist(); clearTimeout(timer); } };
}

/* ---------- Thống kê bài test (giáo viên) ---------- */
function TestStatsView(root) {
  const st = Settings.data;
  if (!API.validUrl(st.scriptUrl) || !st.teacherKey) { root.replaceChildren(errorPanel('Hãy cấu hình Apps Script URL và Teacher Key trong Cài đặt.', h('a', { class: 'btn primary', href: '#/settings' }, 'Mở Cài đặt'))); return {}; }
  const statsErr = e => h('div', { class: 'box error', role: 'alert' }, h('p', { text: /Hành động/.test(e.message) ? 'Apps Script chưa được cập nhật bản mới. Dán lại Code.gs rồi Deploy → Manage deployments → ✎ → New version.' : e.message }), h('button', { class: 'btn small', onclick: () => location.reload() }, 'Thử lại'));
  const sel = h('select', { id: 'ts-sel', 'aria-label': 'Chọn bài test', onchange: () => load() }), out = h('div', { class: 'stack' }), info = h('div'); let list = [];
  root.replaceChildren(h('div', { class: 'stack' }, h('h1', { text: 'Thống kê bài test' }), h('div', { class: 'card' }, h('label', { for: 'ts-sel', text: 'Chọn bài test' }), sel,
    h('div', { class: 'row wrap', style: 'margin-top:.5rem' }, h('button', { class: 'btn small', onclick: () => load() }, '⟳ Tải lại'))), info, out));
  (async () => {
    out.replaceChildren(loading());
    try {
      const r = await API.get(st.scriptUrl, { action: 'testAssignments', teacherKey: st.teacherKey }); if (!r.ok) throw new Error(r.message || r.error);
      if (!r.assignments.length) return out.replaceChildren(h('p', { class: 'muted', text: 'Chưa có bài test nào được giao hoặc nộp.' }));
      list = r.assignments; sel.replaceChildren(r.assignments.map(a => h('option', { value: a.id }, `${a.name} (${a.count} bài nộp)`))); load();
    } catch (e) { out.replaceChildren(statsErr(e)); }
  })();
  async function load() {
    const cur = list.find(x => x.id === sel.value);
    info.replaceChildren(cur ? assignInfoCard(cur, 'test', () => TestStatsView(root)) : null);
    out.replaceChildren(loading());
    try {
      const r = await API.get(st.scriptUrl, { action: 'testResults', teacherKey: st.teacherKey, id: sel.value }); if (!r.ok) throw new Error(r.message || r.error);
      const rows = r.results.slice().sort((a, b) => a.submittedAt < b.submittedAt ? 1 : -1);
      if (!rows.length) return out.replaceChildren(h('p', { class: 'muted', text: 'Chưa có học sinh nào nộp bài này.' }));
      const pct = x => x.max ? Math.round(x.score / x.max * 100) : 0, avg = Math.round(rows.reduce((s, x) => s + pct(x), 0) / rows.length);
      const qm = {}, order = []; rows.forEach(x => x.items.forEach(it => { const o = qm[it.id] || (qm[it.id] = { q: it.q, t: it.t, n: 0, right: 0, partial: 0 }); if (!qm[it.id].seen) { order.push(it.id); qm[it.id].seen = 1; } o.n++; if (it.ok === 'right') o.right++; else if (it.ok === 'partial') o.partial++; }));
      const detail = x => Modal.open(`${x.name} – ${x.score}/${x.max}`, h('div', { class: 'table-wrap' }, h('table', null, h('thead', null, h('tr', null, ['Câu hỏi', 'Dạng', 'Trả lời', 'Điểm'].map(c => h('th', { scope: 'col', text: c })))),
        h('tbody', null, x.items.map(it => h('tr', { class: it.ok === 'right' ? '' : 'bad-row' }, h('td', { style: 'white-space:normal;min-width:160px', text: it.q }), h('td', { text: QTYPES[it.t] || it.t }), h('td', { style: 'white-space:normal', text: it.a || '—' }), h('td', { class: 'num', text: it.g + '/' + it.m })))))));
      out.replaceChildren(
        h('div', { class: 'card row wrap', style: 'justify-content:space-around;text-align:center' }, h('div', null, h('div', { class: 'score-big', text: String(rows.length) }), h('div', { class: 'muted', text: 'Bài nộp' })), h('div', null, h('div', { class: 'score-big', text: avg + '%' }), h('div', { class: 'muted', text: 'Điểm TB' })),
          h('div', null, h('div', { class: 'score-big', text: Math.max.apply(null, rows.map(pct)) + '%' }), h('div', { class: 'muted', text: 'Cao nhất' }))),
        h('h2', { text: 'Kết quả từng bài nộp' }),
        h('div', { class: 'table-wrap' }, h('table', null, h('thead', null, h('tr', null, ['Họ tên', 'Lớp', 'Điểm', '%', 'Thời gian', 'Nộp lúc', 'Trễ', ''].map(c => h('th', { scope: 'col', text: c })))),
          h('tbody', null, rows.map(x => h('tr', null, h('td', { text: x.name }), h('td', { text: x.cls }), h('td', { class: 'num', text: x.score + '/' + x.max }), h('td', { class: 'num', text: pct(x) + '%' }), h('td', { class: 'num', text: fmtTime(x.totalMs) }), h('td', { text: fmtDate(x.submittedAt) }), h('td', { text: x.late ? 'Trễ' : '' }),
            h('td', null, h('button', { class: 'btn small', onclick: () => detail(x) }, 'Chi tiết'))))))),
        h('h2', { text: 'Tỉ lệ làm đúng theo câu' }),
        h('div', { class: 'table-wrap' }, h('table', null, h('thead', null, h('tr', null, ['#', 'Câu hỏi', 'Dạng', 'Đúng', 'Một phần', 'Sai/bỏ trống'].map(c => h('th', { scope: 'col', text: c })))),
          h('tbody', null, order.map((k, i) => { const o = qm[k]; return h('tr', null, h('td', { text: String(i + 1) }), h('td', { style: 'white-space:normal;min-width:180px', text: o.q }), h('td', { text: QTYPES[o.t] || o.t }), h('td', { class: 'num', text: Math.round(o.right / o.n * 100) + '%' }), h('td', { class: 'num', text: Math.round(o.partial / o.n * 100) + '%' }), h('td', { class: 'num', text: Math.round((o.n - o.right - o.partial) / o.n * 100) + '%' })); })))),
        h('div', { class: 'row wrap' }, h('button', { class: 'btn', onclick: () => {
          const data = rows.map(x => [x.name, x.cls, x.score, x.max, pct(x), Math.round(x.totalMs / 1000), x.submittedAt, x.late ? 'yes' : ''].map(safeCell));
          download('ket-qua-test.csv', '\ufeff' + Papa.unparse({ fields: ['Họ tên', 'Lớp', 'Điểm', 'Tối đa', '%', 'Giây', 'Nộp lúc', 'Trễ'], data }), 'text/csv;charset=utf-8');
        } }, '⬇ Xuất CSV')));
    } catch (e) { out.replaceChildren(statsErr(e)); }
  }
  return { destroy() {} };
}

const Lock = {
  get() { try { const v = sessionStorage.getItem('sm_lock'); return v && (v.startsWith('#/assign') || v.startsWith('#/taketest')) ? v : ''; } catch (_) { return ''; } },
  set(v) { try { sessionStorage.setItem('sm_lock', v); } catch (_) {} },
  /** Máy đã xác thực giáo viên (Teacher Key hợp lệ) thì không khóa, để giáo viên xem thử link */
  applies() { return !Settings.data.teacherOk; }
};
function renderNav() {
  if (document.body.dataset.route === 'assign') { $('#nav').replaceChildren(); return; }
  const path = location.hash.replace(/^#/, '').split('?')[0] || '/';
  const items = [['#/', 'Trang chủ', '/'], Settings.data.teacherOk ? ['#/stats', 'Thống kê', '/stats'] : null, Settings.data.teacherOk ? ['#/teststats', 'Thống kê test', '/teststats'] : null, ['#/settings', 'Cài đặt', '/settings']].filter(Boolean);
  $('#nav').replaceChildren(...items.map(([href, t, p]) => h('a', { href, 'aria-current': path === p ? 'page' : null }, t)));
}
const Router = {
  cur: null,
  render() {
    if (this.cur && this.cur.destroy) this.cur.destroy();
    const raw = location.hash.replace(/^#/, '') || '/';
    const k = raw.indexOf('?'), path = k < 0 ? raw : raw.slice(0, k), query = k < 0 ? '' : raw.slice(k + 1);
    const root = $('#app'); root.classList.remove('wide');
    const isAssign = path === '/assign' || path === '/taketest', student = Lock.applies();
    if (isAssign && student) Lock.set('#' + raw);
    if (!isAssign && student && Lock.get()) { location.replace(Lock.get()); return; }   // đang ở chế độ học sinh → đưa về bài đang làm
    document.body.dataset.route = isAssign ? 'assign' : 'app';
    const brand = $('.brand');
    if (isAssign && student) brand.removeAttribute('href'); else brand.setAttribute('href', '#/');   // học sinh: tên app không bấm được
    document.title = 'Spelling Mastery – Chính tả từ vựng';
    renderNav(); window.scrollTo(0, 0);
    try {
      if (path === '/' || path === '') this.cur = HomeView(root);
      else if (path === '/settings') this.cur = SettingsView(root);
      else if (path === '/stats') this.cur = StatsView(root);
      else if (path === '/assign' || path === '/taketest') {
        const pick = key => { const m = query.match(new RegExp('(?:^|&)' + key + '=([^&]*)')); return m ? m[1] : ''; };
        const dec = v => { try { return decodeURIComponent(v); } catch (_) { return v; } };
        this.cur = AssignView(root, { d: dec(pick('d')).replace(/ /g, '+'), id: dec(pick('id')), s: dec(pick('s')), kind: path === '/taketest' ? 'test' : '' });
      } else if (path.startsWith('/test-edit/')) this.cur = TestEditView(root, path.slice(11));
      else if (path.startsWith('/test-practice/')) this.cur = TestPracticeView(root, path.slice(15));
      else if (path === '/teststats') this.cur = TestStatsView(root);
      else if (path.startsWith('/practice/')) this.cur = PracticeView(root, path.slice(10));
      else { root.replaceChildren(errorPanel('Không tìm thấy trang này.')); this.cur = null; }
    } catch (e) { console.error(e); root.replaceChildren(errorPanel('Đã xảy ra lỗi: ' + e.message)); this.cur = null; }
    if (!(path === '/' || path === '')) root.focus({ preventScroll: true });
  }
};
function init() {
  Settings.load(); Sets.load(); Tests.load(); TTS.init();
  window.addEventListener('hashchange', () => Router.render());
  window.addEventListener('online', () => Sync.flush());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) Sync.flush(); });   // xác nhận các bản lưu tạm đã gửi
  window.addEventListener('unhandledrejection', e => { console.error(e.reason); toast('Có lỗi không mong muốn: ' + ((e.reason && e.reason.message) || e.reason), 'error'); });
  Sync.flush();
  Router.render();
}
window.__SM_TEST__ = { Parser, Scoring, Norm, IO, statsByStudent };
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();

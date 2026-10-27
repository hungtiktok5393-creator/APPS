/* =====================================================================
 * Nhà Thầy Hưng (Spelling Mastery) – app.js
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
/* Phiên bản = tham số ?v= của thẻ <script src="app.js?v=…"> – đổi ở index.html là service worker tự cập nhật bộ nhớ đệm */
const SM_VER = ((document.currentScript && /[?&]v=([\w.-]+)/.exec(document.currentScript.src)) || [])[1] || '';

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
/** Bỏ dấu tiếng Việt + chữ thường → tìm kiếm "tu vung" khớp "Từ vựng" */
const fold = s => String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase();
/** Điểm riêng của bộ từ / bài giao: ô trống hoặc không phải số → undefined (dùng mặc định chung); số → nguyên 0–1000 */
const cleanPts = v => { if (v === '' || v == null || typeof v === 'boolean') return undefined; const n = Number(v); return isFinite(n) ? Math.max(0, Math.min(1000, Math.round(n))) : undefined; };
const cleanFolder = v => String(v == null ? '' : v).normalize('NFC').replace(/\s+/g, ' ').trim().slice(0, 40);
const cleanTags = v => {
  const seen = new Set(), out = [];
  (Array.isArray(v) ? v : String(v == null ? '' : v).split(',')).forEach(x => {
    const t = String(x == null ? '' : x).normalize('NFC').replace(/[,\s]+/g, ' ').replace(/^#/, '').trim().slice(0, 24), k = fold(t);
    if (t && !seen.has(k) && out.length < 10) { seen.add(k); out.push(t); }
  });
  return out;
};
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
  },
  /** Đóng mọi hộp thoại đang mở (như bấm Hủy) – gọi khi chuyển trang để hộp thoại của màn hình cũ không kẹt lại */
  closeAll() { document.querySelectorAll('dialog.modal').forEach(d => { try { d.close(); } catch (_) { d.remove(); } }); }
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
  let b = 0;
  if (IDB.ok) b = IDB.usage; else try { Object.keys(localStorage).filter(k => k.startsWith('sm_')).forEach(k => { b += (k.length + (localStorage.getItem(k) || '').length) * 2; }); } catch (_) {}
  return { mb: (b / 1048576).toFixed(2), quotaMb: Math.round(IDB.quota / 1048576), idb: IDB.ok, words: Sets.list.reduce((n, x) => n + x.cards.length, 0), qs: Tests.list.reduce((n, t) => n + qCount(t), 0) };
}
const Settings = {
  data: null,
  load() {
    this.data = Object.assign({ scriptUrl: '', teacherKey: '', teacherOk: false, theme: 'auto', sfx: true, autoRead: true, autoSync: false, vk: null }, Store.get('settings', {}));
    if (window.SMTheme) this.data.theme = SMTheme.get();      // nút ☀️/🌙 trên thanh trên cùng (theme.js) là nguồn chính, dùng chung mọi trang
    this.apply();
    document.addEventListener('sm-theme', e => { this.data.theme = e.detail.theme; Store.set('settings', this.data); const sel = document.getElementById('st-theme'); if (sel) sel.value = e.detail.theme; });
  },
  save(patch) { Object.assign(this.data, patch); Store.set('settings', this.data); this.apply(); },
  apply() {
    const t = this.data.theme;
    if (window.SMTheme) { SMTheme.set(t); return; }
    if (t === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
  }
};
/* ---------- IndexedDB: mỗi bộ từ / bài test là MỘT bản ghi riêng ----------
 *  Trước đây cả danh sách nằm trong một key localStorage (~5 MB, nén + ghi lại TOÀN BỘ mỗi lần lưu).
 *  Nay: kho 'sets', 'tests' (keyPath id) + kho 'meta' giữ thứ tự. save() chỉ ghi các bản ghi đã thay đổi / bị xóa.
 *  Danh sách vẫn nằm trong RAM (Sets.list / Tests.list) nên phần còn lại của app không đổi.
 *  Trình duyệt không có IndexedDB → tự quay về chế độ localStorage cũ. */
const IDB = {
  ok: false, db: null, usage: 0, quota: 0, _t: 0,
  open() {
    return new Promise((res, rej) => {
      if (!window.indexedDB) return rej(new Error('Trình duyệt không có IndexedDB'));
      let rq; try { rq = indexedDB.open('spelling-mastery', 1); } catch (e) { return rej(e); }
      rq.onupgradeneeded = () => {
        const d = rq.result;
        ['sets', 'tests'].forEach(n => { if (!d.objectStoreNames.contains(n)) d.createObjectStore(n, { keyPath: 'id' }); });
        if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta');
      };
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => rej(rq.error || new Error('Không mở được IndexedDB'));
      rq.onblocked = () => rej(new Error('IndexedDB đang bị chặn bởi tab khác'));
    });
  },
  req(r) { return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); },
  done(tx) { return new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error || new Error('Giao dịch bị hủy')); }); },
  get(store, key) { return this.req(this.db.transaction(store).objectStore(store).get(key)); },
  all(store) { return this.req(this.db.transaction(store).objectStore(store).getAll()); },
  count(store) { return this.req(this.db.transaction(store).objectStore(store).count()); },
  async init() {
    try {
      this.db = await this.open(); this.ok = true;
      this.db.onversionchange = () => { try { this.db.close(); } catch (_) {} this.ok = false; };
      if (!await this.get('meta', 'migrated')) await this.migrate();
      try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (_) {}   // xin trình duyệt không tự xóa dữ liệu khi thiếu chỗ
      this.estimate();
    } catch (e) {
      console.error(e); this.ok = false;
      toast('Không dùng được kho lưu trữ IndexedDB (' + (e && e.message || e) + ') – app dùng chế độ cũ, giới hạn khoảng 5 MB.', 'error');
    }
  },
  /** Chuyển dữ liệu từ localStorage cũ sang IndexedDB. Chỉ xóa bản cũ SAU KHI đếm lại khớp số bản ghi. */
  async migrate() {
    const oldS = Store.getZ('sets', null), oldT = Store.getZ('tests', null);
    if (Store.zFail.sets || Store.zFail.tests) throw new Error('chưa đọc được dữ liệu cũ');
    const S = (Array.isArray(oldS) ? oldS : []).filter(x => x && typeof x === 'object'), T = (Array.isArray(oldT) ? oldT : []).filter(x => x && typeof x === 'object');
    S.concat(T).forEach(x => { if (!x.id) x.id = uid(); });
    if (S.length || T.length) {
      const tx = this.db.transaction(['sets', 'tests', 'meta'], 'readwrite');
      tx.objectStore('sets').clear(); tx.objectStore('tests').clear();         // chạy lại nhiều lần vẫn đúng
      S.forEach(x => tx.objectStore('sets').put(x)); T.forEach(x => tx.objectStore('tests').put(x));
      tx.objectStore('meta').put(S.map(x => x.id), 'order:sets'); tx.objectStore('meta').put(T.map(x => x.id), 'order:tests');
      await this.done(tx);
      const [cs, ct] = await Promise.all([this.count('sets'), this.count('tests')]);
      if (cs !== new Set(S.map(x => x.id)).size || ct !== new Set(T.map(x => x.id)).size) throw new Error('đếm lại sau khi chuyển dữ liệu không khớp');
    }
    const tx2 = this.db.transaction('meta', 'readwrite'); tx2.objectStore('meta').put(Date.now(), 'migrated'); await this.done(tx2);
    try { localStorage.removeItem('sm_sets'); localStorage.removeItem('sm_tests'); } catch (_) {}
  },
  async estimate() { try { if (navigator.storage && navigator.storage.estimate) { const e = await navigator.storage.estimate(); this.usage = e.usage || 0; this.quota = e.quota || 0; } } catch (_) {} },
  touch() { clearTimeout(this._t); this._t = setTimeout(() => this.estimate(), 1500); },
  wipe() {
    try { if (this.db) this.db.close(); } catch (_) {}
    return new Promise(res => { try { const r = indexedDB.deleteDatabase('spelling-mastery'); r.onsuccess = r.onerror = r.onblocked = () => res(); } catch (_) { res(); } });
  }
};
/** Danh sách có lưu bền. API giữ nguyên: .list (mảng trong RAM), .get(id), .save([mục vừa sửa]) → true/false */
function makeCollection(name, norm, fp) {
  return {
    list: [], known: new Map(), order: '', dirty: new Set(), running: false, again: false, blocked: false,
    async load() {
      this.known.clear(); this.order = ''; this.blocked = false;
      if (!IDB.ok) { this.list = norm(Store.getZ(name, [])); return; }
      try {
        const recs = await IDB.all(name), ord = (await IDB.get('meta', 'order:' + name)) || [];
        const byId = new Map(recs.map(r => [r.id, r])), list = [];
        ord.forEach(id => { if (byId.has(id)) { list.push(byId.get(id)); byId.delete(id); } });
        byId.forEach(r => list.push(r));
        this.list = norm(list);
        this.list.forEach(x => this.known.set(x.id, { ref: x, fp: fp(x) }));
        this.order = this.list.map(x => x.id).join(',');
      } catch (e) {
        console.error(e); this.list = []; this.blocked = true;       // không đọc được → chặn ghi để không đè mất dữ liệu
        toast('Không đọc được dữ liệu đã lưu (' + (e && e.message || e) + '). Hãy tải lại trang – dữ liệu trong trình duyệt vẫn còn nguyên.', 'error');
      }
    },
    get(id) { return this.list.find(x => x.id === id); },
    save(item) {
      if (!IDB.ok) return Store.setZ(name, this.list);
      if (this.blocked) { toast('Không lưu để tránh ghi đè dữ liệu chưa đọc được. Hãy tải lại trang.', 'error'); return false; }
      if (item) this.dirty.add(item);
      this.again = true;
      if (!this.running) { this.running = true; setTimeout(() => this.run(), 0); }   // gom nhiều lần save liên tiếp thành một lần ghi
      return true;
    },
    async run() { try { while (this.again) { this.again = false; await this.flush(); } } finally { this.running = false; } },
    idle() { return new Promise(r => { const t = () => (this.running ? setTimeout(t, 5) : r()); t(); }); },
    async flush() {
      const cur = this.list.slice(), ids = new Set(), writes = [], fps = [];
      cur.forEach(x => {
        if (!x.id) x.id = uid(); ids.add(x.id);
        const k = this.known.get(x.id), f = fp(x);
        if (!k || k.ref !== x || k.fp !== f || this.dirty.has(x)) { writes.push(x); fps.push(f); }
      });
      const dels = []; this.known.forEach((_, id) => { if (!ids.has(id)) dels.push(id); });
      const ord = cur.map(x => x.id).join(',');
      this.dirty.clear();
      if (!writes.length && !dels.length && ord === this.order) return;
      try {
        const tx = IDB.db.transaction([name, 'meta'], 'readwrite'), st = tx.objectStore(name);
        writes.forEach(x => st.put(x)); dels.forEach(id => st.delete(id));
        if (ord !== this.order) tx.objectStore('meta').put(cur.map(x => x.id), 'order:' + name);
        await IDB.done(tx);
        writes.forEach((x, i) => this.known.set(x.id, { ref: x, fp: fps[i] })); dels.forEach(id => this.known.delete(id));
        this.order = ord; IDB.touch();
      } catch (e) {
        console.error(e); writes.forEach(x => this.dirty.add(x));
        const full = e && (e.name === 'QuotaExceededError' || /quota/i.test(e.message || ''));
        toast(full ? 'Bộ nhớ trình duyệt đã đầy – hãy Xuất JSON để sao lưu rồi xóa bớt dữ liệu.' : 'Không lưu được vào trình duyệt: ' + (e && e.message || e), 'error');
      }
    }
  };
}
const Sets = makeCollection('sets', l => l, x => (x.updatedAt || 0) + ':' + (x.cards ? x.cards.length : 0));
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
      shuffle: !!s.shuffle, updatedAt: Number(s.updatedAt) || Date.now(), folder: cleanFolder(s.folder), tags: cleanTags(s.tags), correctPts: cleanPts(s.correctPts), peekPenalty: cleanPts(s.peekPenalty) };
  },
  testFromJSON(x) {
    if (!x || typeof x.name !== 'string' || !(Array.isArray(x.questions) || Array.isArray(x.sections))) return null;
    const t = normTest(Object.assign({}, x, { id: (typeof x.id === 'string' && /^[\w-]{3,64}$/.test(x.id)) ? x.id : uid(), updatedAt: Number(x.updatedAt) || Date.now() }));
    t.folder = cleanFolder(x.folder); t.tags = cleanTags(x.tags); return t;
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
  /** Hằng số mặc định; được ghi đè bằng getPublicConfig khi có mạng (xem Scoring.load) */
  correctPts: 5, peekPenalty: 1, testDefault: 10,      // correctPts / peekPenalty = giá trị ĐANG DÙNG (mặc định chung, hoặc của bài nếu có ghi đè)
  defCP: 5, defPP: 1, _ov: null,                       // defCP / defPP = mặc định chung từ cấu hình; _ov = ghi đè theo bài
  _apply() { const o = this._ov; this.correctPts = o && o.cp != null ? o.cp : this.defCP; this.peekPenalty = o && o.pp != null ? o.pp : this.defPP; },
  setConfig(c) {
    c = c || {}; const n = (v, d) => { v = Number(v); return isFinite(v) && v >= 0 ? v : d; };
    this.defCP = n(c.vocabCorrectPoints, this.defCP); this.defPP = n(c.vocabPeekPenalty, this.defPP); this.testDefault = n(c.testDefaultPoints, this.testDefault) || 10;
    this._apply();
  },
  /** Điểm riêng của bài đang làm (chỉ để HIỂN THỊ; điểm thật do máy chủ tính). null / undefined = dùng mặc định chung */
  useOverride(cp, pp) { const f = v => { const x = cleanPts(v); return x === undefined ? null : x; }; this._ov = { cp: f(cp), pp: f(pp) }; this._apply(); },
  clearOverride() { this._ov = null; this._apply(); },
  async load(url) {
    try { const r = await API.get(url, { action: 'getPublicConfig' }); if (r && r.ok && r.config) this.setConfig(r.config); } catch (_) { /* offline → giữ mặc định 5 / 1 / 10 */ }
  },
  /** Số lần "xem lại" = số lượt xem − 1 (lượt xem đầu tiên là ghi nhớ, không bị trừ) */
  peeks: views => Math.max(0, (Number(views) || 1) - 1),
  /** Điểm từ = (đúng ? +correctPts : 0) − peeks × peekPenalty (có thể âm; khớp công thức server: correct×5 − peeks×1) */
  wordScore: (views, skipped) => (skipped ? 0 : Scoring.correctPts) - Scoring.peeks(views) * Scoring.peekPenalty,
  /** Điểm bài = tổng điểm từng từ */
  total(words) { return words.reduce((s, w) => s + w.score, 0); },
  max(words) { return words.length * Scoring.correctPts; },
  /** Từ bỏ qua, gõ sai ≥ 1 lần hoặc xem ≥ 3 lần → "Cần cải thiện" */
  needsWork: w => !!w.skipped || w.wrongCount >= 1 || w.views >= 3
};

/* ===================== 8. API & SYNC ===================== */
/** Đóng gói dữ liệu vào link: lz-string → base64url (chỉ A-Z a-z 0-9 - _ nên Zalo/Messenger không làm hỏng) */
const Link = {
  pack(obj) { return LZString.compressToBase64(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); },
  unpack(t) { try { t = String(t).replace(/-/g, '+').replace(/_/g, '/'); while (t.length % 4) t += '='; return LZString.decompressFromBase64(t); } catch (_) { return null; } }
};
/** Thử lại vài lần khi mạng / Apps Script chập chờn */
async function withRetry(fn, tries) {
  tries = tries || 3; let err;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); } catch (e) { err = e; if (i < tries - 1) await new Promise(r => setTimeout(r, 700 * (i + 1))); }
  }
  throw err;
}
const API = {
  /** Link giao bài chỉ mang mã triển khai (…/macros/s/<MÃ>/exec) cho ngắn; link cũ mang cả URL vẫn đọc được */
  short(u) { const m = /^https:\/\/script\.google\.com\/macros\/s\/([\w-]{20,})\/exec$/.exec(String(u || '')); return m ? m[1] : u; },
  expand(s) { s = String(s || ''); return /^[\w-]{20,}$/.test(s) ? 'https://script.google.com/macros/s/' + s + '/exec' : s; },
  validUrl(u) { try { const x = new URL(u); return x.protocol === 'https:' && x.hostname === 'script.google.com' && x.pathname.endsWith('/exec'); } catch (_) { return false; } },
  async _fetch(url, opts, ms) {
    const ac = new AbortController(); const t = setTimeout(() => ac.abort(), ms || 20000);
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
  post(url, body, ms) { return this._fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) }, ms); },
  get(url, params) { const u = new URL(url); Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v)); return this._fetch(u.toString()); }
};

/** TỐC ĐỘ 1 – "đánh thức" Apps Script: lượt gọi đầu tiên sau vài phút nghỉ phải khởi động lại máy chủ (1–3 giây). Gọi ping ngầm khi giáo viên vào trang chủ / mở hộp thoại Giao bài để lúc bấm nút máy chủ đã sẵn sàng. */
const warmUp = (() => {
  let last = 0;
  return () => {
    const st = Settings.data;
    if (!st || !API.validUrl(st.scriptUrl) || Date.now() - last < 4 * 60 * 1000) return;
    last = Date.now(); API.get(st.scriptUrl, { action: 'ping' }).catch(() => {});
  };
})();
/** TỐC ĐỘ 2 – stale-while-revalidate: hiện NGAY bản đã tải lần trước (danh sách bài lưu cả trong máy, kết quả lưu trong phiên), đồng thời tải bản mới ở nền;
 *  chỉ vẽ lại khi dữ liệu thật sự đổi. */
const Mem = {};
const pkey = key => 'sm_c_' + key + '_' + String((Settings.data && Settings.data.scriptUrl) || '').slice(-10);
const cacheSet = (key, v, persist) => { Mem[key] = { v, s: JSON.stringify(v) }; if (persist) { try { localStorage.setItem(pkey(key), Mem[key].s); } catch (_) {} } };
async function swr(key, fetcher, onData, persist) {
  let hit = Mem[key];
  if (!hit && persist) { try { const raw = localStorage.getItem(pkey(key)); if (raw) hit = Mem[key] = { v: JSON.parse(raw), s: raw }; } catch (_) {} }
  if (hit) onData(hit.v, true);
  let v;
  try { v = await fetcher(); }
  catch (e) { if (hit) { toast('Không cập nhật được dữ liệu mới – đang hiển thị bản đã tải trước đó.', 'error'); return; } throw e; }
  if (hit && hit.s === JSON.stringify(v)) return;
  cacheSet(key, v, persist); onData(v, false);
}

const Sync = {
  listeners: new Set(), status: {}, replies: {}, busy: false, dirty: false,
  queue: () => Store.get('queue', []),
  emit(id, st, msg) { this.status[id] = { st, msg }; this.listeners.forEach(fn => fn(id)); },
  /** Mỗi lần làm có 1 submissionId cố định: lưu nhiều lần (tạm → cuối) thì bản mới nhất thay bản cũ */
  upsert(item, opt) {
    opt = opt || {};
    const q = this.queue(), i = q.findIndex(x => x.submissionId === item.submissionId);
    item.rev = (i >= 0 ? (q[i].rev || 0) : 0) + 1;
    if (i >= 0) q[i] = item; else q.push(item);
    this.dirty = true; Store.set('queue', q);    // lưu bền trước: tắt app cũng không mất, lần mở sau sẽ gửi lại
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
        let again = false; this.dirty = false;
        for (const item of this.queue()) {
          this.emit(item.submissionId, 'sending');
          try {
            const pl = item.payload;
            if (pl && pl.code && pl.code === normCode(Store.get('studentCode', '')) && Store.get('studentTok', '')) pl.token = Store.get('studentTok', '');   // mật khẩu vừa đổi → dùng token mới nhất trên máy
            const r = await API.post(item.url, pl);
            if (!r.ok && r.error === 'bad_request' && /Hành động/.test(r.message || '')) this.emit(item.submissionId, 'error', 'Apps Script chưa cập nhật bản mới (cần Deploy → New version). Bài vẫn được giữ trên máy, bấm Thử lại sau khi cập nhật.');
            else if (r.ok) { this.replies[item.submissionId] = r; if (this.remove(item.submissionId, item.rev)) this.emit(item.submissionId, 'sent'); else again = true; }
            else if (['expired', 'max_attempts', 'bad_request', 'too_large', 'invalid_code', 'code_disabled'].includes(r.error)) { this.remove(item.submissionId, item.rev); this.emit(item.submissionId, 'rejected', r.message || r.error); }
            else if (['auth_required', 'wrong_password'].includes(r.error)) this.emit(item.submissionId, 'error', 'Cần đăng nhập lại bằng mã và mật khẩu (bài vẫn được giữ trên máy, sẽ tự gửi sau khi đăng nhập).');
            else { this.emit(item.submissionId, 'error', r.message || r.error || 'Lỗi máy chủ'); if (['rate_limited', 'busy'].includes(r.error)) setTimeout(() => Sync.flush(), 2500); }
          } catch (e) { this.emit(item.submissionId, 'error', e.message); return; }   // mất mạng → dừng, thử lại sau
        }
        if (!again && !this.dirty) break;
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

/** Mã học sinh: tự viết hoa, bỏ mọi khoảng trắng */
const normCode = v => String(v == null ? '' : v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);   // giống máy chủ (foldCode_)
const fmtDelta = n => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n);
const codeErrorMsg = r => ({
  invalid_code: 'Mã học sinh không đúng. Hãy kiểm tra lại từng ký tự (mã không có chữ O, I, L và số 0, 1) hoặc hỏi giáo viên.',
  code_disabled: 'Mã học sinh này đã bị xóa hoặc khóa nên không dùng được. Hãy hỏi giáo viên để nhận mã mới.',
  rate_limited: 'Bạn bấm hơi nhanh. Đợi 2–3 giây rồi bấm lại nhé.',
  busy: 'Máy chủ đang bận. Hãy thử lại sau vài giây.',
  bad_request: 'Mã học sinh không hợp lệ. Hãy nhập lại.',
  not_assigned: 'Bài này không được giao cho mã học sinh của bạn. Hãy kiểm tra lại mã hoặc hỏi giáo viên.',
  auth_required: 'Mã này có mật khẩu. Hãy nhập mật khẩu giáo viên đã cho bạn.',
  wrong_password: 'Mật khẩu không đúng. Hãy kiểm tra lại (phân biệt chữ hoa / thường) hoặc hỏi giáo viên.',
  locked: 'Nhập sai mật khẩu quá nhiều lần. Hãy đợi 10 phút rồi thử lại.'
})[r && r.error] || (r && r.message) || 'Không kiểm tra được mã học sinh. Hãy thử lại.';
/** Khung "điểm bài này + số dư mới" (tự cập nhật theo hàng đợi gửi). est = điểm dự kiến tính trên máy */
function pointsPanel(psid, code, est) {
  const el = h('div', { class: 'stack', role: 'status' });
  let attached = false;
  const link = h('a', { class: 'btn', href: 'hoc-sinh.html?code=' + encodeURIComponent(code) }, '🏆 Xem điểm tích luỹ & chơi game');
  const draw = () => {
    const s = Sync.status[psid] || { st: 'sending' }, r = Sync.replies[psid];
    el.replaceChildren();
    if (s.st === 'sent' && r && r.duplicate) el.append(h('p', { class: 'ok', text: '✓ Bài này đã được ghi điểm trước đó (không cộng lại).' }));
    else if (s.st === 'sent' && r) {
      const d = Number(r.delta) || 0, rq = Number(r.requested);
      el.append(h('div', { class: 'row wrap', style: 'justify-content:space-around;text-align:center' },
        h('div', null, h('div', { class: 'score-big', style: 'font-size:2.2rem', text: fmtDelta(d) }), h('div', { class: 'muted', text: 'Điểm bài này' })),
        h('div', null, h('div', { class: 'score-big', style: 'font-size:2.2rem', text: String(r.balance) }), h('div', { class: 'muted', text: 'Số dư mới' }))));
      if (isFinite(rq) && rq !== d) el.append(h('p', { class: 'muted small-text', text: `Điểm tính được là ${fmtDelta(rq)} nhưng số dư không thể xuống dưới 0 nên chỉ áp dụng ${fmtDelta(d)}.` }));
    } else if (s.st === 'sent') el.append(h('p', { class: 'ok', text: '✓ Đã ghi điểm.' }));
    else if (s.st === 'sending') el.append(h('p', { text: '⏳ Đang gửi điểm lên máy chủ…' }));
    else if (s.st === 'rejected') el.append(h('p', { class: 'err', text: '✗ Điểm chưa được ghi: ' + (s.msg || '') }));
    else el.append(h('div', { class: 'box warn' },
      h('p', { text: `📡 Chưa gửi được điểm (${s.msg || 'không rõ lý do'}). Điểm của bạn (dự kiến ${fmtDelta(est)}) đã được lưu trên máy và sẽ TỰ GỬI LẠI khi có mạng. Đừng xóa dữ liệu trình duyệt.` }),
      h('button', { class: 'btn small', onclick: () => Sync.flush() }, 'Gửi lại ngay')));
    el.append(link);
  };
  const fn = id => {
    if (el.isConnected) attached = true; else if (attached) { Sync.listeners.delete(fn); return; }
    if (id === psid || id === undefined) draw();
  };
  Sync.listeners.add(fn); draw();
  return el;
}

/* ===================== 8b. XUẤT / NHẬP / ĐỒNG BỘ data.json (version 2) ===================== */
/** Toàn bộ bộ từ + thiết lập. Teacher Key chỉ xuất khi được yêu cầu. */
const exportSet = x => { const t = x.tts || newTts(); return { id: x.id, name: x.name, cards: x.cards, tts: { lang: t.lang, voice: t.voice || '', rate: t.rate }, shuffle: !!x.shuffle, updatedAt: x.updatedAt || 0, folder: x.folder || '', tags: x.tags || [], correctPts: cleanPts(x.correctPts), peekPenalty: cleanPts(x.peekPenalty) }; };
function buildExport(includeKey) {
  const s = Settings.data;
  const settings = { theme: s.theme, sfx: s.sfx, autoRead: s.autoRead, scriptUrl: s.scriptUrl };
  if (includeKey) settings.teacherKey = s.teacherKey;
  return { app: 'spelling-mastery', version: 2, exportedAt: new Date().toISOString(), settings,
    sets: Sets.list.map(exportSet), tests: Tests.list };
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
    const inc = obj.tests.map(IO.testFromJSON).filter(Boolean);
    if (mode === 'replace') Tests.list = inc;
    else inc.forEach(n => { const i = Tests.list.findIndex(x => x.id === n.id); if (i < 0) Tests.list.push(n); else if (n.updatedAt >= (Tests.list[i].updatedAt || 0)) Tests.list[i] = n; });
    Tests.save();
  }
  if (withSettings && obj.settings && typeof obj.settings === 'object') applySettingsFrom(obj.settings);
}
/* ===== Kho dữ liệu TÁCH FILE (version 3): index.json + data/sets/<id>.json + data/tests/<id>.json =====
 *  index.json chỉ chứa danh mục nhẹ {id, name, updatedAt, n, bytes} cùng thiết lập.
 *  Đồng bộ: so updatedAt trong index với bản trên máy, chỉ tải những tệp mới / đã đổi.
 *  Không có index.json → quay về data.json (1 tệp, kiểu cũ) nên repo cũ vẫn chạy. */
const SAFE_ID = /^[\w-]{3,64}$/;
const repoPath = (kind, id) => 'data/' + (kind === 'set' ? 'sets' : 'tests') + '/' + id + '.json';
const revKey = (kind, id) => (kind === 'set' ? 's:' : 't:') + id;
const RepoSync = {
  url: file => new URL(file, location.href.split('#')[0]).href,
  state: () => Store.get('sync', {}),
  applied() { return this.state().applied || ''; },
  rev() { return this.state().rev || {}; },          // {"s:<id>": updatedAt} = phiên bản của từng mục lần đồng bộ/xuất gần nhất
  mark(iso, rev) { Store.set('sync', { applied: iso, at: Date.now(), rev: rev || {} }); },
  localRev() { const r = {}; Sets.list.forEach(x => { r[revKey('set', x.id)] = x.updatedAt || 0; }); Tests.list.forEach(x => { r[revKey('test', x.id)] = x.updatedAt || 0; }); return r; },
  markIndex(index) {
    const r = {}; index.sets.forEach(e => { r[revKey('set', e.id)] = Number(e.updatedAt) || 0; }); index.tests.forEach(e => { r[revKey('test', e.id)] = Number(e.updatedAt) || 0; });
    this.mark(String(index.exportedAt || new Date().toISOString()), r);
  },
  isNewer(d) { return !this.applied() || String(d.exportedAt || '') > this.applied(); },
  changed() { const rev = this.rev(); return { sets: Sets.list.filter(x => rev[revKey('set', x.id)] !== (x.updatedAt || 0)), tests: Tests.list.filter(x => rev[revKey('test', x.id)] !== (x.updatedAt || 0)) }; },
  orphans() {   // tệp từng có trong repo nhưng mục đã bị xóa trên máy
    const rev = this.rev(), have = new Set(Sets.list.map(x => revKey('set', x.id)).concat(Tests.list.map(x => revKey('test', x.id))));
    return Object.keys(rev).filter(k => !have.has(k)).map(k => repoPath(k[0] === 's' ? 'set' : 'test', k.slice(2)));
  },
  async getJSON(file) {
    const r = await fetch(this.url(file) + '?v=' + Date.now(), { cache: 'no-store' });   // ?v= để tránh cache CDN/trình duyệt
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(file + ': HTTP ' + r.status);
    try { return await r.json(); } catch (_) { throw new Error(file + ' không phải JSON hợp lệ.'); }
  },
  validateIndex(x) {
    if (!x || typeof x !== 'object') return ['không phải đối tượng JSON.'];
    const errs = [];
    if (x.version !== 3) errs.push('trường "version" phải là 3 (nhận: ' + x.version + ').');
    ['sets', 'tests'].forEach(k => {
      if (!Array.isArray(x[k])) errs.push('thiếu mảng "' + k + '".');
      else x[k].forEach((e, i) => {
        if (!e || typeof e.id !== 'string' || !SAFE_ID.test(e.id)) errs.push(k + '[' + i + ']: "id" không hợp lệ.');
        else if (!Number.isFinite(Number(e.updatedAt))) errs.push(k + '[' + i + ']: thiếu "updatedAt".');
      });
    });
    return errs;
  },
  /** Ưu tiên index.json; không có thì dùng data.json cũ */
  async fetchRemote() {
    const idx = await this.getJSON('index.json');
    if (idx) { const errs = this.validateIndex(idx); if (errs.length) throw new Error('index.json không hợp lệ: ' + errs[0]); return { kind: 'index', index: idx }; }
    const data = await this.getJSON('data.json');
    if (!data) return { missing: true };
    const errs = IO.validateJSON(data); if (errs.length) throw new Error('data.json không hợp lệ: ' + errs[0]);
    return { kind: 'legacy', data };
  },
  /** So index với máy này CHỈ bằng updatedAt */
  plan(index) {
    const out = { add: [], upd: [], keepNewer: [], same: [], remove: [], order: { set: [], test: [] } };
    [['set', 'sets', Sets], ['test', 'tests', Tests]].forEach(([kind, key, coll]) => {
      const local = new Map(coll.list.map(x => [x.id, x])), seen = new Set();
      index[key].forEach(e => {
        if (seen.has(e.id)) return; seen.add(e.id);
        const it = { kind, id: e.id, name: e.name || '', remote: Number(e.updatedAt) || 0, bytes: Number(e.bytes) || 0 }, l = local.get(e.id);
        out.order[kind].push(e.id);
        if (!l) out.add.push(it);
        else { const lu = l.updatedAt || 0; if (it.remote > lu) out.upd.push(it); else if (it.remote < lu) out.keepNewer.push(it); else out.same.push(it); }
      });
      coll.list.forEach(x => { if (!seen.has(x.id)) out.remove.push({ kind, id: x.id, name: x.name || '' }); });
    });
    return out;
  },
  needed(plan, mode) { return plan.add.concat(plan.upd, mode === 'replace' ? plan.keepNewer : []); },
  parseItem(kind, raw, id) {
    const file = repoPath(kind, id);
    if (kind === 'set') {
      const errs = IO.validateJSON({ version: 2, sets: [raw] }); if (errs.length) throw new Error(file + ': ' + errs[0]);
      return IO.setFromJSON(Object.assign({}, raw, { id }));
    }
    const t = IO.testFromJSON(Object.assign({}, raw, { id })); if (!t) throw new Error(file + ' không phải bài test hợp lệ.');
    return t;
  },
  /** Tải các tệp cần thiết TRƯỚC, xong hết mới ghi vào máy → lỗi giữa chừng không làm hỏng dữ liệu. mode: 'merge' | 'replace' */
  async apply(index, plan, mode, withSettings, onProgress) {
    const need = this.needed(plan, mode), queue = need.slice(), got = new Map(), warnings = []; let done = 0, dead = false;
    const worker = async () => {
      while (queue.length) {
        const it = queue.shift();
        try {
          const raw = await withRetry(() => this.getJSON(repoPath(it.kind, it.id)), 2);
          if (dead) return;                                  // một tệp đã lỗi → các luồng còn lại dừng, không báo tiến độ nữa
          if (!raw) throw new Error('Thiếu tệp ' + repoPath(it.kind, it.id) + ' trên repo (index.json có nhưng tệp chưa được tải lên).');
          const item = this.parseItem(it.kind, raw, it.id);
          if ((item.updatedAt || 0) < it.remote) warnings.push(`“${it.name || it.id}”: tệp dữ liệu cũ hơn index.json (có thể chưa tải lên đủ).`);
          got.set(it.kind + ':' + it.id, item);
        } catch (e) { dead = true; queue.length = 0; throw e; }
        done++; if (onProgress) onProgress(done, need.length);
      }
    };
    await Promise.all(Array.from({ length: Math.min(6, need.length) }, worker));
    [['set', Sets], ['test', Tests]].forEach(([kind, coll]) => {
      const byId = new Map(coll.list.map(x => [x.id, x]));
      need.filter(it => it.kind === kind).forEach(it => byId.set(it.id, got.get(kind + ':' + it.id)));
      if (mode === 'replace') coll.list = plan.order[kind].map(id => byId.get(id)).filter(Boolean);     // đúng thứ tự trong index, bỏ mục chỉ có trên máy
      else { const next = coll.list.map(x => byId.get(x.id)), have = new Set(next.map(x => x.id)); byId.forEach((x, id) => { if (!have.has(id)) next.push(x); }); coll.list = next; }
      coll.save();
    });
    if (withSettings && index.settings && typeof index.settings === 'object') applySettingsFrom(index.settings);
    this.markIndex(index);
    return { fetched: need.length, warnings, removed: mode === 'replace' ? plan.remove.length : 0 };
  }
};

/* ---------- Gói .zip (không nén – đủ cho JSON, không cần thư viện) ---------- */
const Zip = {
  _t: null,
  crc(u8) {
    if (!this._t) { this._t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; this._t[n] = c >>> 0; } }
    let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = this._t[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  },
  /** files: [{path, text}] → Blob */
  build(files) {
    const enc = new TextEncoder(), parts = [], central = []; let offset = 0;
    const d = new Date(), time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    files.forEach(f => {
      const name = enc.encode(f.path), data = enc.encode(f.text), crc = this.crc(data);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
      lh.setUint16(10, time, true); lh.setUint16(12, date, true); lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true);
      lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      parts.push(lh.buffer, name, data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
      ch.setUint16(12, time, true); ch.setUint16(14, date, true); ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true);
      ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true);
      central.push(ch.buffer, name);
      offset += 30 + name.length + data.length;
    });
    const csize = central.reduce((n, b) => n + b.byteLength, 0), end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, csize, true); end.setUint32(16, offset, true);
    return new Blob(parts.concat(central, [end.buffer]), { type: 'application/zip' });
  }
};

/** Dựng index.json + từng tệp bộ từ/bài test. onlyChanged: chỉ kèm tệp có updatedAt khác lần đồng bộ/xuất gần nhất (index.json luôn đầy đủ). */
function buildRepoFiles(o) {
  o = o || {};
  const s = Settings.data, enc = new TextEncoder(), rev = RepoSync.rev(), files = [], skipped = [];
  const settings = { theme: s.theme, sfx: s.sfx, autoRead: s.autoRead, scriptUrl: s.scriptUrl };
  if (o.includeKey) settings.teacherKey = s.teacherKey;
  const entries = (kind, list, body, count) => list.filter(x => { if (SAFE_ID.test(String(x.id))) return true; skipped.push(x.name || x.id); return false; }).map(x => {
    const text = JSON.stringify(body(x)), e = { id: x.id, name: x.name || '', updatedAt: x.updatedAt || 0, n: count(x), bytes: enc.encode(text).length };
    if (!o.onlyChanged || rev[revKey(kind, x.id)] !== e.updatedAt) files.push({ path: repoPath(kind, x.id), text });
    return e;
  });
  const sets = entries('set', Sets.list, exportSet, x => x.cards.length), tests = entries('test', Tests.list, x => x, qCount);
  const index = { app: 'spelling-mastery', version: 3, exportedAt: new Date().toISOString(), settings, sets, tests };
  files.unshift({ path: 'index.json', text: JSON.stringify(index, null, 1) });
  const orphans = o.onlyChanged ? RepoSync.orphans() : [];
  return { index, files, skipped, orphans };
}

/** Kiểm tra repo. manual = người dùng bấm nút; ngược lại chạy ngầm khi mở trang chủ */
async function repoCheck(o) {
  o = o || {};
  if (location.protocol === 'file:') { if (o.manual) toast('Đang mở bằng file:// nên không đọc được dữ liệu repo. Hãy mở bản trên GitHub Pages hoặc chạy máy chủ cục bộ (python -m http.server).', 'error'); return; }
  try {
    const r = await RepoSync.fetchRemote();
    if (r.missing) { if (o.manual) toast('Repo chưa có index.json (hoặc data.json).'); return; }
    if (r.kind === 'legacy') {
      const d = r.data;
      if (o.manual) return importDialog(d, { source: 'repo', onDone: o.onApplied });
      if (!RepoSync.isNewer(d)) return;
      if (Settings.data.autoSync && (RepoSync.applied() || !Sets.list.length)) {
        applyData(d, 'replace', true); RepoSync.mark(d.exportedAt); if (o.onApplied) o.onApplied(); toast(`Đã tự động đồng bộ ${d.sets.length} bộ từ từ data.json.`); return;
      }
      if (o.onOffer) o.onOffer({ text: `Có bản dữ liệu mới trong data.json (${d.sets.length} bộ từ` + (d.exportedAt ? `, xuất lúc ${fmtDate(d.exportedAt)}` : '') + ').', open: done => importDialog(d, { source: 'repo', onDone: done }) });
      return;
    }
    const idx = r.index;
    if (o.manual) return repoDialog(idx, { onDone: o.onApplied });
    if (!RepoSync.isNewer(idx)) return;
    const plan = RepoSync.plan(idx), nothing = !plan.add.length && !plan.upd.length;
    if (Settings.data.autoSync && (RepoSync.applied() || !Sets.list.length)) {
      if (nothing && !plan.remove.length && !plan.keepNewer.length) { RepoSync.markIndex(idx); return; }
      const res = await RepoSync.apply(idx, plan, 'replace', true);
      if (o.onApplied) o.onApplied(); toast(`Đã tự động đồng bộ: tải ${res.fetched} tệp thay đổi.`); return;
    }
    if (nothing) { RepoSync.markIndex(idx); return; }      // chỉ khác ở mục máy này có thêm → không làm phiền
    if (o.onOffer) o.onOffer({ text: `Repo có thay đổi mới: ${plan.add.length} mục mới, ${plan.upd.length} mục cập nhật (chỉ tải các tệp này).`, open: done => repoDialog(idx, { onDone: done }) });
  } catch (e) { if (o.manual) toast('Không đồng bộ được: ' + e.message, 'error'); }
}
/** Hộp thoại đồng bộ từ index.json: cho thấy cụ thể tải gì, bỏ qua gì */
function repoDialog(index, opts) {
  opts = opts || {};
  const plan = RepoSync.plan(index), mergeN = plan.add.length + plan.upd.length, replN = mergeN + plan.keepNewer.length;
  const hasSt = !!(index.settings && typeof index.settings === 'object');
  const cb = h('input', { type: 'checkbox', id: 'rp-st', checked: true }), out = h('div', { 'aria-live': 'polite' });
  const kb = n => n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : n ? Math.max(1, Math.round(n / 1024)) + ' KB' : '0 KB';
  const size = list => kb(list.reduce((n, x) => n + (x.bytes || 0), 0));
  const same = !mergeN && !plan.keepNewer.length && !plan.remove.length;
  const group = (title, list) => list.length ? h('div', null, h('strong', { text: `${title} (${list.length})` }),
    h('ul', null, list.slice(0, 8).map(x => h('li', { text: (x.kind === 'set' ? '🔤 ' : '📝 ') + (x.name || '(chưa đặt tên)') })), list.length > 8 ? h('li', { class: 'muted', text: `…và ${list.length - 8} mục khác` }) : null)) : null;
  if (same) RepoSync.markIndex(index);
  const run = async mode => {
    if (mode === 'replace' && (plan.remove.length || plan.keepNewer.length) && !await Modal.confirm(`Ghi đè sẽ XÓA ${plan.remove.length} mục chỉ có trên máy này và bỏ ${plan.keepNewer.length} bản sửa mới hơn repo. Tiếp tục?`, 'Ghi đè', true)) return;
    btns.querySelectorAll('button').forEach(b => { b.disabled = true; });
    out.replaceChildren(loading('Đang tải…'));
    try {
      const res = await RepoSync.apply(index, RepoSync.plan(index), mode, hasSt && cb.checked, (n, total) => out.replaceChildren(loading(`Đang tải ${n}/${total} tệp…`)));
      d.close(); if (opts.onDone) opts.onDone();
      toast(res.fetched ? `Đã cập nhật ${res.fetched} tệp từ repo.` : 'Đã đồng bộ – không có tệp nào cần tải.');
      if (res.warnings.length) toast(res.warnings[0] + (res.warnings.length > 1 ? ` (+${res.warnings.length - 1} cảnh báo khác)` : ''), 'error');
    } catch (e) {
      out.replaceChildren(h('p', { class: 'err', text: 'Không đồng bộ được: ' + e.message + ' Dữ liệu trên máy chưa bị thay đổi.' }));
      btns.querySelectorAll('button').forEach(b => { b.disabled = false; });
    }
  };
  const btns = same ? h('div', { class: 'row end' }, h('button', { class: 'btn primary', onclick: () => d.close() }, 'Đóng'))
    : h('div', { class: 'row wrap' },
      h('button', { class: 'btn primary', disabled: !mergeN, onclick: () => run('merge') }, `Gộp – tải ${mergeN} tệp`),
      h('button', { class: 'btn danger', disabled: !replN && !plan.remove.length, onclick: () => run('replace') }, `Ghi đè – tải ${replN} tệp`),
      h('button', { class: 'btn', onclick: () => d.close() }, 'Hủy'));
  const d = Modal.open('Cập nhật từ repo', h('div', { class: 'stack' },
    h('p', { text: `Repo có ${index.sets.length} bộ từ và ${index.tests.length} bài test` + (index.exportedAt ? ` (xuất lúc ${fmtDate(index.exportedAt)})` : '') + `. Máy này có ${Sets.list.length} bộ từ và ${Tests.list.length} bài test.` }),
    same ? h('p', { class: 'ok', text: '✓ Máy này đã khớp với repo – không cần tải gì.' }) : h('div', { class: 'box' },
      h('p', { text: `So theo updatedAt: ${plan.add.length} mới · ${plan.upd.length} repo mới hơn · ${plan.same.length} không đổi (không tải lại).` }),
      h('p', { class: 'hint', text: `Gộp: tải ${mergeN} tệp (~${size(plan.add.concat(plan.upd))}); thêm mục mới, cập nhật mục repo mới hơn, giữ nguyên mục chỉ có trên máy này và mục máy này mới hơn.` }),
      h('p', { class: 'hint', text: `Ghi đè: tải ${replN} tệp (~${size(RepoSync.needed(plan, 'replace'))}); máy này thành bản sao của repo, xóa ${plan.remove.length} mục chỉ có trên máy này.` }),
      h('details', null, h('summary', { text: 'Xem chi tiết' }), group('Mới trên repo', plan.add), group('Repo mới hơn máy này', plan.upd), group('Máy này mới hơn repo (Ghi đè sẽ bỏ)', plan.keepNewer), group('Chỉ có trên máy này', plan.remove))),
    !same && hasSt ? h('label', { class: 'check', for: 'rp-st' }, cb, 'Áp dụng cả thiết lập trong repo') : null,
    out, btns));
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
    if (obj && obj.version === 3 && Array.isArray(obj.sets) && Array.isArray(obj.tests)) return Modal.open('Đây là index.json', h('div', { class: 'stack' }, h('p', { text: 'index.json chỉ là danh mục của kho tách file, không chứa nội dung bộ từ / bài test. Hãy dùng “⟳ Đồng bộ” để tải từ repo, hoặc nhập tệp data.json (1 tệp) của bản cũ.' })));
    const errs = IO.validateJSON(obj);
    if (errs.length) return Modal.open('Tệp JSON không hợp lệ', h('div', null, h('ul', null, errs.slice(0, 8).map(e => h('li', { text: e }))), errs.length > 8 ? h('p', { class: 'muted', text: `…và ${errs.length - 8} lỗi khác.` }) : null));
    importDialog(obj, { onDone });
  };
  fr.onerror = () => toast('Không đọc được tệp.', 'error');
  fr.readAsText(f);
}
function openExport() {
  const key = h('input', { type: 'checkbox', id: 'ex-key' });
  const ch = RepoSync.changed(), nCh = ch.sets.length + ch.tests.length, total = Sets.list.length + Tests.list.length, hasRev = !!Object.keys(RepoSync.rev()).length;
  const only = h('input', { type: 'checkbox', id: 'ex-only', checked: hasRev && nCh < total });
  const d = Modal.open('Xuất gói repo (.zip)', h('div', { class: 'stack' },
    h('p', { text: `${Sets.list.length} bộ từ và ${Tests.list.length} bài test, cùng thiết lập (giao diện, âm thanh, Apps Script URL).` }),
    h('label', { class: 'check', for: 'ex-key' }, key, 'Kèm Teacher Key'),
    h('div', { class: 'box warn', text: 'Không đưa tệp có Teacher Key lên repo công khai: ai cũng đọc được và xem được kết quả học sinh. Chỉ tick khi sao lưu riêng tư.' }),
    h('label', { class: 'check', for: 'ex-only' }, only, hasRev ? `Chỉ kèm tệp đã thay đổi từ lần đồng bộ gần nhất (${nCh}/${total} mục)` : 'Chỉ kèm tệp đã thay đổi (chưa có mốc đồng bộ nên sẽ xuất tất cả)'),
    h('p', { class: 'hint', text: 'Gói .zip gồm index.json và thư mục data/ (mỗi bộ từ / bài test một tệp). Giải nén vào thư mục gốc của repo (cùng chỗ với index.html), chép đè rồi commit. Các máy khác chỉ tải những tệp có updatedAt mới hơn.' }),
    h('div', { class: 'row wrap end' },
      h('button', { class: 'btn', onclick: () => d.close() }, 'Hủy'),
      h('button', { class: 'btn primary', onclick: () => {
        const r = buildRepoFiles({ includeKey: key.checked, onlyChanged: only.checked });
        if (r.orphans.length) r.files.push({ path: '_tep-can-xoa.txt', text: 'Các tệp này không còn trong index.json (đã xóa trên máy). Xóa khỏi repo cho gọn – app bỏ qua chúng nên để lại cũng không sao:\n' + r.orphans.join('\n') + '\n' });
        download('spelling-mastery-data.zip', Zip.build(r.files));
        RepoSync.mark(r.index.exportedAt, RepoSync.localRev()); d.close();
        toast(`Đã tạo gói .zip: index.json + ${r.files.filter(f => f.path.startsWith('data/')).length} tệp dữ liệu.` + (r.skipped.length ? ` Bỏ qua ${r.skipped.length} mục có mã không hợp lệ.` : ''));
      } }, '⬇ Tải gói .zip'))));
}

/* ===================== 9. THƯ VIỆN TRANG CHỦ: tìm kiếm · thư mục · thẻ · yêu thích · gần đây · phân trang ===================== */
const LIB_PAGE = 24;
const blankLib = () => ({ q: '', sort: '', folder: '*', tags: [], fav: false, page: 1 });   // folder: '*' = tất cả, '' = chưa phân loại
const HomeState = { sets: blankLib(), tests: blankLib(), quick: 'recent', tab: 'sets' };   // tab: 'sets' | 'tests' | 'students' | 'points'
/** Yêu thích + dùng gần đây: lưu RIÊNG trên từng máy (không nằm trong data/ nên đồng bộ repo không ghi đè). Thư mục / thẻ thì nằm trong dữ liệu và được đồng bộ. */
const Prefs = {
  d: { fav: {}, recent: [] },
  load() {
    const p = Store.get('prefs', {}) || {};
    this.d = { fav: (p.fav && typeof p.fav === 'object') ? p.fav : {}, recent: (Array.isArray(p.recent) ? p.recent : []).filter(x => x && typeof x.id === 'string' && (x.k === 'set' || x.k === 'test')).slice(0, 40) };
    Object.keys(this.d.fav).forEach(k => { const i = k.indexOf(':'); if (!this.item(k.slice(0, i), k.slice(i + 1))) delete this.d.fav[k]; });   // dọn mục đã xóa (chỉ khi mở app, để "Hoàn tác" xóa vẫn giữ sao)
    this.d.recent = this.d.recent.filter(r => this.item(r.k, r.id));
  },
  save() { Store.set('prefs', this.d); },
  item(k, id) { return k === 'set' ? Sets.get(id) : k === 'test' ? Tests.get(id) : null; },
  isFav(k, id) { return !!this.d.fav[k + ':' + id]; },
  toggleFav(k, id) { const key = k + ':' + id; if (this.d.fav[key]) delete this.d.fav[key]; else this.d.fav[key] = Date.now(); this.save(); },
  touch(k, id) { if (!this.item(k, id)) return; this.d.recent = [{ k, id, t: Date.now() }].concat(this.d.recent.filter(x => !(x.k === k && x.id === id))).slice(0, 40); this.save(); },
  lastUsed(k) { const m = {}; this.d.recent.forEach(x => { if (x.k === k && !m[x.id]) m[x.id] = x.t; }); return m; },
  recents(n) { const out = []; for (const r of this.d.recent) { const x = this.item(r.k, r.id); if (x) out.push({ k: r.k, x }); if (out.length >= n) break; } return out; },
  favs(n) { return Object.keys(this.d.fav).sort((a, b) => this.d.fav[b] - this.d.fav[a]).map(key => { const i = key.indexOf(':'), k = key.slice(0, i); return { k, x: this.item(k, key.slice(i + 1)) }; }).filter(e => e.x).slice(0, n); }
};
const itemUrl = (k, id) => (k === 'set' ? '#/practice/' : '#/test-practice/') + id;
const itemMeta = (k, x) => k === 'set' ? x.cards.length + ' từ' : qCount(x) + ' câu · ' + testPoints(x) + ' điểm';

/** "Mở nhanh": Dùng gần đây / Yêu thích, gộp cả bộ từ và bài test */
function QuickPanel() {
  const host = h('section', { class: 'quick', 'aria-label': 'Mở nhanh' }), LIMIT = 8;
  function draw(focus) {
    const rec = Prefs.recents(LIMIT), favAll = Prefs.favs(1e6);
    if (!rec.length && !favAll.length) { host.hidden = true; host.replaceChildren(); return; }
    host.hidden = false;
    const tab = (id, label) => h('button', { type: 'button', class: 'btn small', 'aria-pressed': String(HomeState.quick === id), onclick: () => { HomeState.quick = id; draw(true); } }, label);
    const list = HomeState.quick === 'fav' ? favAll.slice(0, LIMIT) : rec;
    host.replaceChildren(
      h('div', { class: 'quick-head' }, h('h2', { text: 'Mở nhanh' }),
        h('div', { class: 'seg', role: 'group', 'aria-label': 'Chọn danh sách mở nhanh' }, tab('recent', '🕘 Dùng gần đây'), tab('fav', '★ Yêu thích' + (favAll.length ? ' (' + favAll.length + ')' : '')))),
      list.length ? h('div', { class: 'tiles' }, list.map(e => h('a', { class: 'tile', href: itemUrl(e.k, e.x.id) },
        h('span', { class: 'tile-ico', 'aria-hidden': 'true', text: e.k === 'set' ? '🔤' : '📝' }),
        h('span', { class: 'tile-name', text: e.x.name || '(chưa đặt tên)' }),
        h('span', { class: 'tile-meta', text: itemMeta(e.k, e.x) }))))
        : h('p', { class: 'muted small-text', text: HomeState.quick === 'fav' ? 'Chưa có mục yêu thích. Bấm ☆ trên thẻ bộ từ hoặc bài test để ghim vào đây.' : 'Chưa có mục nào được dùng gần đây.' }));
    if (focus) { const b = host.querySelector('[aria-pressed="true"]'); if (b) b.focus(); }
  }
  draw(); return host;
}
/** Tiêu đề thẻ + nút ★ */
function cardTop(kind, item, rerender) {
  const fav = Prefs.isFav(kind, item.id), title = item.name || '(chưa đặt tên)';
  return h('div', { class: 'card-top' }, h('h2', { text: title }),
    h('button', { type: 'button', class: 'star', 'aria-pressed': String(fav), 'aria-label': 'Yêu thích: ' + title, title: fav ? 'Bỏ yêu thích' : 'Thêm vào yêu thích', 'data-fk': kind + '-' + item.id,
      onclick: () => { Prefs.toggleFav(kind, item.id); rerender(); } }, fav ? '★' : '☆'));
}
/** Thư mục + thẻ của một mục; bấm để lọc */
function cardTags(item, ctx) {
  const tags = item.tags || [];
  if (!item.folder && !tags.length) return null;
  return h('div', { class: 'tags' },
    item.folder ? h('button', { type: 'button', class: 'tag folder', title: 'Lọc theo thư mục này', onclick: () => ctx.folder(item.folder) }, '📁 ' + item.folder) : null,
    tags.map(t => h('button', { type: 'button', class: 'tag', title: 'Lọc theo thẻ này', onclick: () => ctx.tag(t) }, '#' + t)));
}
function openClassify(kind, item, onDone) {
  const coll = kind === 'set' ? Sets : Tests, tagMap = new Map(), folders = new Set();
  coll.list.forEach(x => { if (x.folder) folders.add(x.folder); (x.tags || []).forEach(t => { const k = fold(t), e = tagMap.get(k) || { t, n: 0 }; e.n++; tagMap.set(k, e); }); });
  const known = [...tagMap.values()].sort((a, b) => b.n - a.n || a.t.localeCompare(b.t, 'vi')).slice(0, 30).map(e => e.t);
  const folder = h('input', { type: 'text', id: 'cl-folder', maxlength: 40, value: item.folder || '', list: 'cl-folders', autocomplete: 'off', placeholder: 'VD: Unit 3, Lớp 6A' });
  const tags = h('input', { type: 'text', id: 'cl-tags', value: (item.tags || []).join(', '), autocomplete: 'off', placeholder: 'VD: du lịch, ôn thi, khó' });
  const d = Modal.open('Phân loại – ' + (item.name || '(chưa đặt tên)'), h('div', null,
    h('label', { for: 'cl-folder', text: 'Thư mục' }), folder,
    h('datalist', { id: 'cl-folders' }, [...folders].sort((a, b) => a.localeCompare(b, 'vi')).map(f => h('option', { value: f }))),
    h('p', { class: 'hint', text: 'Mỗi mục thuộc một thư mục. Để trống = chưa phân loại.' }),
    h('label', { for: 'cl-tags', text: 'Thẻ (tag)' }), tags,
    h('p', { class: 'hint', text: 'Ngăn cách bằng dấu phẩy. Tối đa 10 thẻ, mỗi thẻ tối đa 24 ký tự.' }),
    known.length ? h('div', { class: 'tagbar', role: 'group', 'aria-label': 'Thẻ đã dùng' }, known.map(t => h('button', { type: 'button', class: 'tag-btn', onclick: () => { const cur = cleanTags(tags.value); if (!cur.some(x => fold(x) === fold(t))) { cur.push(t); tags.value = cur.join(', '); } } }, '#' + t))) : null,
    h('div', { class: 'row end' }, h('button', { class: 'btn', onclick: () => d.close() }, 'Hủy'),
      h('button', { class: 'btn primary', onclick: () => {
        item.folder = cleanFolder(folder.value); item.tags = cleanTags(tags.value); item.updatedAt = Date.now();
        if (coll.save(item)) { d.close(); if (onDone) onDone(); toast('Đã lưu phân loại.'); }
      } }, 'Lưu'))));
  folder.focus();
}

/** Lưới thẻ: tìm (không phân biệt dấu) + thư mục + thẻ + yêu thích + sắp xếp + phân trang.
 *  state nằm ngoài (HomeState) để giữ nguyên khi trang vẽ lại. o = {state, getItems, makeCard(item, ctx), placeholder, size, sizeLabel} */
function Library(kind, o) {
  const st = o.state, root = h('div', { class: 'lib' }), tools = h('div'), body = h('div'), unit = kind === 'set' ? 'bộ từ' : 'bài test';
  let tm = 0;
  const ctx = {
    tag(t, ref) { const k = fold(t), i = st.tags.findIndex(x => fold(x) === k); if (i >= 0) st.tags.splice(i, 1); else st.tags.push(t); st.page = 1; drawTools(ref); paint(); },
    folder(f) { st.folder = st.folder === f ? '*' : f; st.page = 1; drawTools(); paint(); }
  };
  function stats() {
    const list = o.getItems(), folders = new Map(), tags = new Map(); let none = 0, favs = 0;
    list.forEach(x => {
      if (x.folder) folders.set(x.folder, (folders.get(x.folder) || 0) + 1); else none++;
      (x.tags || []).forEach(t => { const k = fold(t), e = tags.get(k) || { t, n: 0 }; e.n++; tags.set(k, e); });
      if (Prefs.isFav(kind, x.id)) favs++;
    });
    if (st.folder === '' ? !folders.size : (st.folder !== '*' && !folders.has(st.folder))) st.folder = '*';   // bộ lọc trỏ tới thư mục đã không còn → bỏ
    st.tags = st.tags.filter(t => tags.has(fold(t)));
    if (st.fav && !favs) st.fav = false;
    return { list, none, favs, folders: [...folders].sort((a, b) => a[0].localeCompare(b[0], 'vi')), tags: [...tags.values()].sort((a, b) => b.n - a.n || a.t.localeCompare(b.t, 'vi')) };
  }
  const active = () => !!(st.q || st.folder !== '*' || st.tags.length || st.fav);
  function drawTools(refocus) {
    const m = stats();
    if (!(m.list.length > 8 || m.folders.length || m.tags.length || m.favs)) { tools.replaceChildren(); return; }
    const search = h('input', { type: 'search', value: st.q, placeholder: o.placeholder, 'aria-label': o.placeholder, autocomplete: 'off', 'data-f': 'q',
      oninput: e => { clearTimeout(tm); const v = e.target.value; tm = setTimeout(() => { st.q = v; st.page = 1; paint(); }, 200); } });
    const folder = m.folders.length ? h('select', { 'aria-label': 'Lọc theo thư mục', 'data-f': 'folder', onchange: e => { st.folder = e.target.value; st.page = 1; drawTools('folder'); paint(); } },
      h('option', { value: '*', selected: st.folder === '*' }, `Tất cả thư mục (${m.list.length})`),
      m.none ? h('option', { value: '', selected: st.folder === '' }, `Chưa phân loại (${m.none})`) : null,
      m.folders.map(([f, n]) => h('option', { value: f, selected: st.folder === f }, `📁 ${f} (${n})`))) : null;
    const sort = h('select', { 'aria-label': 'Sắp xếp', 'data-f': 'sort', onchange: e => { st.sort = e.target.value; st.page = 1; paint(); } },
      [['', 'Thứ tự của tôi'], ['recent', 'Dùng gần đây'], ['upd', 'Mới sửa gần đây'], ['name', 'Tên A → Z'], ['size', o.sizeLabel]].map(([v, t]) => h('option', { value: v, selected: v === st.sort }, t)));
    const fav = (m.favs || st.fav) ? h('button', { type: 'button', class: 'btn small', 'data-f': 'fav', 'aria-pressed': String(st.fav), onclick: () => { st.fav = !st.fav; st.page = 1; drawTools('fav'); paint(); } }, '★ Yêu thích' + (m.favs ? ` (${m.favs})` : '')) : null;
    const clear = active() ? h('button', { type: 'button', class: 'btn small ghost', 'data-f': 'clear', onclick: () => { Object.assign(st, { q: '', folder: '*', tags: [], fav: false, page: 1 }); drawTools('q'); paint(); } }, '✕ Xóa bộ lọc') : null;
    const tagbar = m.tags.length ? h('div', { class: 'tagbar', role: 'group', 'aria-label': 'Lọc theo thẻ' }, m.tags.slice(0, 24).map(({ t, n }) => {
      const ref = 'tag:' + fold(t), on = st.tags.some(x => fold(x) === fold(t));
      return h('button', { type: 'button', class: 'tag-btn', 'data-f': ref, 'aria-pressed': String(on), onclick: () => ctx.tag(t, ref) }, `#${t} (${n})`);
    })) : null;
    tools.replaceChildren(h('div', { class: 'lib-tools' }, search, folder, sort, fav, clear, h('span', { class: 'muted small-text', text: `${m.list.length.toLocaleString('vi-VN')} ${unit}` })), tagbar);
    if (refocus) { const n = [...tools.querySelectorAll('[data-f]')].find(x => x.dataset.f === refocus) || tools.querySelector('[data-f="q"]'); if (n) n.focus(); }
  }
  function filter(list) {
    const words = fold(Norm.text(st.q)).split(' ').filter(Boolean), tg = st.tags.map(fold);
    let a = list.filter(x => {
      if (st.fav && !Prefs.isFav(kind, x.id)) return false;
      if (st.folder !== '*' && (x.folder || '') !== st.folder) return false;
      if (tg.length) { const xt = (x.tags || []).map(fold); if (!tg.every(t => xt.indexOf(t) >= 0)) return false; }
      if (words.length) { const hay = fold([x.name, x.folder].concat(x.tags || []).join(' ')); if (!words.every(w => hay.indexOf(w) >= 0)) return false; }
      return true;
    });
    if (st.sort === 'recent') { const t = Prefs.lastUsed(kind); a = a.slice().sort((x, y) => (t[y.id] || 0) - (t[x.id] || 0)); }
    else if (st.sort === 'upd') a = a.slice().sort((x, y) => (y.updatedAt || 0) - (x.updatedAt || 0));
    else if (st.sort === 'name') a = a.slice().sort((x, y) => String(x.name || '').localeCompare(String(y.name || ''), 'vi'));
    else if (st.sort === 'size') a = a.slice().sort((x, y) => o.size(y) - o.size(x));
    return a;
  }
  function paint() {
    const a = filter(stats().list), pages = Math.max(1, Math.ceil(a.length / LIB_PAGE));
    st.page = clamp(st.page, 1, pages);
    const from = (st.page - 1) * LIB_PAGE, shown = a.slice(from, from + LIB_PAGE), go = p => { st.page = p; paint(); root.scrollIntoView({ block: 'start' }); };
    body.replaceChildren(
      a.length ? h('div', { class: 'grid' }, shown.map(x => o.makeCard(x, ctx)))
        : h('div', { class: 'center muted' }, h('p', { text: `Không có ${unit} nào khớp bộ lọc.` })),
      pages > 1 ? h('nav', { class: 'pager lib-pager', 'aria-label': 'Phân trang ' + unit },
        h('button', { class: 'btn small', disabled: st.page <= 1, onclick: () => go(st.page - 1) }, '‹ Trước'),
        h('span', { class: 'muted small-text', text: `${(from + 1).toLocaleString('vi-VN')}–${(from + shown.length).toLocaleString('vi-VN')} / ${a.length.toLocaleString('vi-VN')} ${unit}` }),
        pages >= 4 ? h('select', { 'aria-label': 'Chọn trang', onchange: e => go(Number(e.target.value)) }, Array.from({ length: pages }, (_, i) => h('option', { value: i + 1, selected: i + 1 === st.page }, `Trang ${i + 1}/${pages}`))) : h('span', { text: `Trang ${st.page}/${pages}` }),
        h('button', { class: 'btn small', disabled: st.page >= pages, onclick: () => go(st.page + 1) }, 'Sau ›')) : null);
  }
  root.append(tools, body); drawTools(); paint();
  return root;
}

/* ===================== 9a. HOME VIEW ===================== */
function HomeView(root) {
  warmUp();
  let offer = null, alive = true;   // offer: dữ liệu mới phát hiện trong data.json
  const banner = () => h('div', { class: 'box sync-banner', role: 'status' },
    h('p', { text: offer.text }),
    h('div', { class: 'row wrap' },
      h('button', { class: 'btn primary small', onclick: () => offer.open(() => { offer = null; render(); }) }, 'Xem & cập nhật'),
      h('button', { class: 'btn small', onclick: () => { offer = null; render(); } }, 'Để sau')));
  /* ============ DANH SÁCH NÚT CỦA TRANG CHỦ ============
   Muốn thêm nút mới: thêm MỘT dòng vào mảng dưới đây, không cần sửa chỗ khác.
     zone: 'create' → ô lớn ở phần "Tạo mới" · 'data' → nút nhỏ ở thanh "Dữ liệu" góc trên bên phải
     icon, title, hint (chỉ ô lớn dùng)
     run: () => … (bấm là chạy)  |  href: '#/…' (chuyển trang)  |  file: '.json' + onFile(input) (chọn tệp rồi xử lý) */
  const actions = () => [
    { id: 'new-set', zone: 'create', icon: '🔤', title: 'Tạo bộ từ', hint: 'Soạn danh sách từ để luyện chính tả', run: () => { HomeState.tab = 'sets'; openEditor(null); } },
    { id: 'new-test', zone: 'create', icon: '📝', title: 'Tạo bài test', hint: 'Bài nhiều phần, nhiều dạng câu hỏi', href: '#/test-edit/new' },
    { id: 'paste-test', zone: 'create', icon: '📄', title: 'Nhập đề từ văn bản', hint: 'Dán nguyên văn đề, app tự tách câu', run: () => tests.pasteText() },
    { id: 'sync', zone: 'data', icon: '⟳', title: 'Đồng bộ', run: () => repoCheck({ manual: true, onApplied: render }) },
    { id: 'import', zone: 'data', icon: '⬆', title: 'Nhập JSON', file: '.json,application/json', onFile: input => importFile(input, render) },
    { id: 'export', zone: 'data', icon: '⬇', title: 'Xuất gói .zip', run: () => openExport() }
  ];
  const actTile = a => {
    const kids = [h('span', { class: 'act-ico', 'aria-hidden': 'true', text: a.icon }),
      h('span', { class: 'act-text' }, h('span', { class: 'act-title', text: a.title }), a.hint ? h('span', { class: 'act-hint', text: a.hint }) : null)];
    return a.href ? h('a', { class: 'act', href: a.href }, kids) : h('button', { type: 'button', class: 'act', onclick: a.run }, kids);
  };
  const actBtn = a => {
    const kids = [h('span', { 'aria-hidden': 'true', text: a.icon }), a.title];
    if (a.file) {
      const inp = h('input', { type: 'file', accept: a.file, style: 'display:none', tabindex: '-1', 'aria-hidden': 'true', onchange: e => a.onFile(e.target) });
      return h('span', null, h('button', { type: 'button', class: 'btn small', onclick: () => inp.click() }, kids), inp);
    }
    return a.href ? h('a', { class: 'btn small', href: a.href }, kids) : h('button', { type: 'button', class: 'btn small', onclick: a.run }, kids);
  };
  /* ============ CÁC TAB THƯ VIỆN ============ thêm tab mới: thêm một dòng ở đây + một nhánh trong render() */
  const tabs = () => [['sets', '🔤', 'Bộ từ vựng', Sets.list.length], ['tests', '📝', 'Bài test', Tests.list.length], ['students', '🎓', 'Học sinh', Stu.rows ? Stu.rows.length : null], ['parents', '👪', 'Phụ huynh', Par.rows ? Par.rows.length : null], ['points', '⚙️', 'Điểm & trò chơi', null]];
  function tabBar(cur) {
    const defs = tabs();
    return h('div', { class: 'home-tabs', role: 'tablist', 'aria-label': 'Thư viện của tôi' }, defs.map(([id, ico, label, n], i) =>
      h('button', { type: 'button', role: 'tab', id: 'tab-' + id, class: 'home-tab', 'aria-selected': String(cur === id), 'aria-controls': 'home-panel', tabindex: cur === id ? '0' : '-1', 'data-fk': 'tab-' + id,
        onclick: () => { HomeState.tab = id; render('tab-' + id); },
        onkeydown: e => {
          const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0; if (!d) return;
          e.preventDefault(); const to = defs[(i + d + defs.length) % defs.length][0]; HomeState.tab = to; render('tab-' + to);
        } },
        h('span', { 'aria-hidden': 'true', text: ico }), h('span', { text: label }), n == null ? null : h('span', { class: 'home-count', text: n.toLocaleString('vi-VN') }))));
  }
  const setsPanel = () => Sets.list.length
    ? Library('set', { state: HomeState.sets, getItems: () => Sets.list, makeCard: card, placeholder: '🔍 Tìm bộ từ theo tên, thư mục, thẻ…', size: x => x.cards.length, sizeLabel: 'Nhiều từ nhất' })
    : h('div', { class: 'card empty' }, h('h2', { text: 'Chưa có bộ từ nào' }),
      h('p', { class: 'muted', text: 'Tạo bộ từ mới hoặc thử nhanh với 8 từ mẫu.' }),
      h('div', { class: 'row wrap', style: 'justify-content:center' },
        h('button', { class: 'btn primary', onclick: () => openEditor(null) }, '＋ Tạo bộ từ'),
        h('button', { class: 'btn', onclick: addSample }, 'Thêm dữ liệu mẫu')));
  let tests = null;
  function render(focusKey) {
    const ae = document.activeElement, fk = typeof focusKey === 'string' ? focusKey : (ae && ae.dataset && ae.dataset.fk);      // giữ lại vị trí bàn phím khi bấm ★ / đổi tab
    const A = actions(), cur = ['tests', 'students', 'parents', 'points'].includes(HomeState.tab) ? HomeState.tab : 'sets';
    tests = TestHomeSection(render);
    root.replaceChildren(h('div', { class: 'home' },
      h('div', { class: 'home-head' },
        h('div', null, h('h1', { text: 'Trang chủ' }), h('p', { class: 'muted small-text home-sub', text: `${Sets.list.length.toLocaleString('vi-VN')} bộ từ, ${Tests.list.length.toLocaleString('vi-VN')} bài test` })),
        h('div', { class: 'home-tools', role: 'group', 'aria-label': 'Dữ liệu' }, A.filter(a => a.zone === 'data').map(actBtn))),
      offer ? banner() : null,
      h('section', { class: 'home-create', 'aria-label': 'Tạo mới' }, A.filter(a => a.zone === 'create').map(actTile)),
      QuickPanel(),
      tabBar(cur),
      h('div', { class: 'home-panel', id: 'home-panel', role: 'tabpanel', 'aria-labelledby': 'tab-' + cur, tabindex: '-1' }, cur === 'tests' ? tests.panel() : cur === 'students' ? StudentsPanel() : cur === 'parents' ? ParentsPanel() : cur === 'points' ? ConfigPanel() : setsPanel())));
    if (fk) { const n = root.querySelector('[data-fk="' + fk + '"]'); if (n) n.focus({ preventScroll: true }); }
  }
  function card(s, ctx) {
    s.tts = s.tts || newTts();
    return h('article', { class: 'card', 'aria-label': 'Bộ từ ' + s.name },
      cardTop('set', s, render),
      h('p', { class: 'muted small-text', text: `${s.cards.length} từ · ${s.tts.lang} · ${s.tts.rate}x${s.shuffle ? ' · trộn từ' : ''}` }),
      cardTags(s, ctx),
      h('div', { class: 'actions' },
        h('a', { class: 'btn primary', href: '#/practice/' + s.id, 'aria-label': 'Làm thử bộ ' + s.name }, '▶ Làm thử'),
        h('button', { class: 'btn', onclick: () => openAssign(s) }, '📤 Giao bài'),
        h('button', { class: 'btn', onclick: () => openVoice(s) }, '🔊 Giọng đọc'),
        h('button', { class: 'btn', 'aria-pressed': String(!!s.shuffle), onclick: () => { s.shuffle = !s.shuffle; s.updatedAt = Date.now(); Sets.save(); render(); } }, '🔀 Trộn từ: ' + (s.shuffle ? 'Bật' : 'Tắt'))),
      h('div', { class: 'actions-2' },
        h('button', { class: 'btn small ghost', onclick: () => openEditor(s) }, '✎ Sửa'),
        h('button', { class: 'btn small ghost', onclick: () => dup(s) }, '⧉ Nhân bản'),
        h('button', { class: 'btn small ghost', onclick: () => join(s) }, '⛓ Gộp'),
        h('button', { class: 'btn small ghost', onclick: () => openClassify('set', s, render) }, '🏷 Phân loại'),
        h('button', { class: 'btn small ghost', onclick: () => remove(s) }, '🗑 Xóa')));
  }
  function dup(s) {
    const c = { id: uid(), name: (s.name + ' (bản sao)').slice(0, 80), cards: s.cards.map(x => ({ en: x.en, vi: x.vi })), tts: Object.assign({}, s.tts || newTts()), shuffle: !!s.shuffle, updatedAt: Date.now(), folder: s.folder || '', tags: (s.tags || []).slice(), correctPts: cleanPts(s.correctPts), peekPenalty: cleanPts(s.peekPenalty) };
    Sets.list.splice(Sets.list.indexOf(s) + 1, 0, c);
    if (Sets.save()) { render(); toast(`Đã nhân bản thành "${c.name}".`); }
  }
  function join(cur) {
    if (Sets.list.length < 2) return toast('Cần ít nhất 2 bộ từ để gộp.', 'error');
    joinDialog({ kind: 'bộ từ', unit: 'từ', dedupe: 'Bỏ từ tiếng Anh bị trùng (giữ từ xuất hiện trước)', list: Sets.list, cur, count: x => x.cards.length,
      make(sel, nm, dd, del) {
        const seen = new Set(), cards = []; let dups = 0;
        sel.forEach(x => x.cards.forEach(c => { const k = c.en.toLowerCase(); if (dd && seen.has(k)) { dups++; return; } seen.add(k); cards.push({ en: c.en, vi: c.vi }); }));
        const n = { id: uid(), name: nm, cards, tts: Object.assign({}, cur.tts || newTts()), shuffle: !!cur.shuffle, updatedAt: Date.now(), folder: cur.folder || '', tags: (cur.tags || []).slice(), correctPts: cleanPts(cur.correctPts), peekPenalty: cleanPts(cur.peekPenalty) };
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
    const cpIn = h('input', { type: 'number', id: 'ed-cp', min: 0, max: 1000, step: 1, inputmode: 'numeric', placeholder: String(Scoring.defCP), value: s && s.correctPts != null ? s.correctPts : '' });
    const ppIn = h('input', { type: 'number', id: 'ed-pp', min: 0, max: 1000, step: 1, inputmode: 'numeric', placeholder: String(Scoring.defPP), value: s && s.peekPenalty != null ? s.peekPenalty : '' });
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
      h('label', { for: 'ed-cp', text: 'Điểm cộng mỗi từ đúng' }), cpIn,
      h('label', { for: 'ed-pp', text: 'Điểm trừ mỗi lần xem lại' }), ppIn,
      h('p', { class: 'hint', text: 'Để trống = dùng mặc định chung (ô mờ là giá trị mặc định hiện tại). Khi giao bài vẫn đổi riêng được cho từng lần giao.' }),
      h('div', { class: 'row end' }, h('button', { class: 'btn', onclick: () => d.close() }, 'Hủy'), saveBtn)));
    upd(); name.focus();
    async function save() {
      const r = upd(); const nm = Norm.text(name.value);
      if (!nm) return toast('Hãy nhập tên bộ từ.', 'error');
      if (!r.cards.length) return toast('Chưa có từ hợp lệ nào.', 'error');
      if (r.errors.length && !await Modal.confirm(`Có ${r.errors.length} dòng lỗi sẽ bị bỏ qua. Vẫn lưu ${r.cards.length} từ hợp lệ?`, 'Vẫn lưu')) return;
      const cp = cleanPts(cpIn.value), pp = cleanPts(ppIn.value);
      if (s) { s.name = nm; s.cards = r.cards; s.updatedAt = Date.now(); s.correctPts = cp; s.peekPenalty = pp; }
      else Sets.list.unshift({ id: uid(), name: nm, cards: r.cards, tts: newTts(), shuffle: false, updatedAt: Date.now(), correctPts: cp, peekPenalty: pp });
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
        h('button', { class: 'btn', onclick: () => TTS.speak(s.cards[0] ? s.cards[0].en : 'Hello', t) }, '▶ Nghe thử'),
        h('button', { class: 'btn primary', onclick: () => d.close() }, 'Xong'))),
      () => { s.updatedAt = Date.now(); Sets.save(); render(); });
    fill();
    setTimeout(fill, 600);      // voices có thể nạp muộn
  }

  /* --- Giao bài --- */
  function openAssign(s) {
    warmUp(); Prefs.touch('set', s.id);
    const due = h('input', { type: 'datetime-local', id: 'a-due', value: toLocalInput(Date.now() + 7 * 864e5) });
    const max = h('input', { type: 'number', id: 'a-max', min: 0, max: 20, value: 0 });
    const nameIn = h('input', { type: 'text', id: 'a-name', maxlength: 80, value: s.name, autocomplete: 'off' });
    const cpIn = h('input', { type: 'number', id: 'a-cp', min: 0, max: 1000, step: 1, inputmode: 'numeric', placeholder: String(Scoring.defCP), value: s.correctPts != null ? s.correctPts : '' });
    const ppIn = h('input', { type: 'number', id: 'a-pp', min: 0, max: 1000, step: 1, inputmode: 'numeric', placeholder: String(Scoring.defPP), value: s.peekPenalty != null ? s.peekPenalty : '' });
    const out = h('div', { 'aria-live': 'polite', class: 'stack' });
    const tg = targetPicker('a');
    const go = h('button', { class: 'btn primary', onclick: create }, 'Giao bài & tạo link');
    Modal.open('Giao bài – ' + s.name, h('div', null,
      h('label', { for: 'a-name', text: 'Tên bài giao (học sinh thấy tên này, và hiện trong Thống kê)' }), nameIn,
      h('p', { class: 'hint', text: 'Đổi tên ở đây không làm đổi tên thẻ bộ từ. Để trống = dùng tên thẻ.' }),
      h('label', { for: 'a-due', text: 'Hạn nộp (giờ máy bạn)' }), due,
      h('label', { for: 'a-max', text: 'Số lần làm tối đa (0 = không giới hạn)' }), max,
      h('label', { for: 'a-cp', text: 'Điểm cộng mỗi từ đúng (lần giao này)' }), cpIn,
      h('label', { for: 'a-pp', text: 'Điểm trừ mỗi lần xem lại (lần giao này)' }), ppIn,
      h('p', { class: 'hint', text: 'Điền sẵn từ bộ từ. Để trống = dùng mặc định chung. Máy chủ tính điểm thật theo các giá trị này.' }),
      h('p', { class: 'hint', text: 'Học sinh đăng nhập bằng Mã học sinh (tạo ở trang giáo viên), không nhập tên/lớp. Điểm cộng vào tài khoản của mã đó.' }),
      tg.el,
      h('div', { class: 'row end' }, go), out));
    async function create() {
      const dueMs = new Date(due.value).getTime();
      if (!dueMs || dueMs <= Date.now()) return out.replaceChildren(h('p', { class: 'err', text: 'Hạn nộp phải ở tương lai.' }));
      if (!window.LZString) return out.replaceChildren(h('p', { class: 'err', text: 'Thư viện nén (lz-string) chưa tải được – kiểm tra mạng rồi thử lại.' }));
      const st = Settings.data, url = st.scriptUrl, canSheet = API.validUrl(url) && !!st.teacherKey, codes = tg.codes();
      if (tg.personal() && !codes.length) return out.replaceChildren(h('p', { class: 'err', text: 'Hãy nhập hoặc chọn ít nhất một mã học sinh.' }));
      if (tg.personal() && !canSheet) return out.replaceChildren(h('p', { class: 'err', text: 'Giao riêng theo mã cần kết nối Apps Script: vào Cài đặt → dán Apps Script URL + Teacher Key → Kiểm tra kết nối.' }));
      go.disabled = true; out.replaceChildren(loading('Đang tạo link…'));
      const a = { codes, id: shortId(), name: Norm.text(nameIn.value).slice(0, 80) || s.name, link: '', words: s.cards, tts: { lang: s.tts.lang, rate: s.tts.rate }, due: dueMs, shuffle: !!s.shuffle, max: clamp(parseInt(max.value, 10) || 0, 0, 20), req: false, correctPts: cleanPts(cpIn.value), peekPenalty: cleanPts(ppIn.value) };
      const payload = { v: 1, id: a.id, n: a.name, w: a.words.map(c => [c.en, c.vi]), t: { l: a.tts.lang, r: a.tts.rate }, due: a.due, sh: a.shuffle ? 1 : 0, max: a.max, req: a.req ? 1 : 0, u: API.validUrl(url) ? url : '' };
      if (a.correctPts !== undefined) payload.cp = a.correctPts; if (a.peekPenalty !== undefined) payload.pp = a.peekPenalty;   // chỉ để hiển thị; điểm thật do máy chủ
      const base = location.href.split('#')[0];
      let link = base + '#/assign?d=' + Link.pack(payload);
      const shortLink = base + '#/assign?id=' + a.id + '&s=' + encodeURIComponent(API.short(url));
      a.link = link;       // lưu link lên Sheet để xem/copy lại trong Thống kê
      let mode = 'inline', notes = [];
      if (canSheet || link.length > 2000) {
        if (canSheet) {
          a.link = shortLink;
          try { await withRetry(async () => { const r = await API.post(url, { action: 'saveAssignment', teacherKey: st.teacherKey, assignment: a }); if (!r.ok) throw new Error(r.message || r.error); });
            link = shortLink; mode = 'sheet'; }
          catch (e) { mode = 'inline-long'; notes.push('Không lưu được bộ từ lên Google Sheet (' + e.message + '). Đang dùng link dài.' + (codes.length ? ' Bài CHƯA được giao cho các mã đã chọn – hãy bấm “Thử tạo link ngắn lại”.' : '')); }
        } else { mode = 'inline-long'; notes.push('Link đang rất dài vì chưa kết nối Google Apps Script. Vào Cài đặt → dán Apps Script URL + Teacher Key → Kiểm tra kết nối, rồi bấm “Thử tạo link ngắn lại” để có link ngắn chia sẻ được qua Zalo/Messenger.'); }
      } else if (canSheet) {   // đăng ký hạn nộp / số lần ở máy chủ (nguồn quyết định), không gửi danh sách từ
        try { const r = await API.post(url, { action: 'saveAssignment', teacherKey: st.teacherKey, assignment: Object.assign({}, a, { words: null }) }); if (!r.ok) throw new Error(r.message || r.error); }
        catch (e) { notes.push('Chưa đăng ký hạn nộp lên máy chủ (' + e.message + '). Máy chủ sẽ dùng hạn nộp trong link.'); }
      } else notes.push('Chưa cấu hình Apps Script: học sinh làm được bài nhưng kết quả sẽ không được ghi về Sheet.');
      const box = h('textarea', { readonly: true, 'aria-label': 'Link giao bài', style: 'min-height:90px;font-size:.8rem', onfocus: e => e.target.select() });
      box.value = link;
      const canvas = h('canvas', { 'aria-label': 'Mã QR của link giao bài', role: 'img' });
      out.replaceChildren(
        h('p', { class: 'ok', text: mode === 'sheet' ? '✓ Link ngắn (bộ từ đã lưu trên Google Sheet).' : '✓ Link chứa toàn bộ dữ liệu bài.' }),
        mode === 'sheet' ? h('p', { class: 'ok', text: codes.length ? `✓ Đã giao riêng cho ${codes.length} mã học sinh – bài hiện trong tab “Bài được giao” của các mã này.` : '✓ Đã giao cho tất cả mã học sinh – bài hiện trong tab “Bài được giao” ở trang học sinh.' }) : null,
        h('p', { class: 'hint', text: `Độ dài link: ${link.length} ký tự · Hạn: ${fmtDate(dueMs)}` }),
        ...notes.map(n => h('div', { class: 'box warn', text: n })),
        mode === 'inline-long' ? h('div', { class: 'row wrap' }, h('button', { class: 'btn small', onclick: () => create() }, '↻ Thử tạo link ngắn lại')) : null,
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
    const out = words.filter(w => w.done).map(w => ({ word: w.en, views: w.views, wrongCount: w.wrongCount, score: Scoring.wordScore(w.views, w.skipped), max: Scoring.correctPts, timeMs: Math.round(w.timeMs), skipped: w.skipped }));
    const correct = out.filter(w => !w.skipped).length, peeks = out.reduce((a, w) => a + Scoring.peeks(w.views), 0);   // gửi server: correct × 5 − peeks × 1
    return { words: out, score: Scoring.total(out), maxScore: Scoring.max(out), correct, peeks, totalWords: words.length, totalMs: Math.round(S.totalMs), reason };
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
  /* Bàn phím ảo của app: chặn bàn phím hệ điều hành (và gợi ý/đoán từ của nó). Mặc định bật trên thiết bị cảm ứng. */
  const vkOn = () => Settings.data.vk == null ? !!(window.matchMedia && matchMedia('(pointer: coarse)').matches) : !!Settings.data.vk;
  const vkBtn = h('button', { class: 'btn small', onclick: () => { Settings.save({ vk: !vkOn() }); drawHud(); if (S.started && S.state === 'TYPE' && !S.paused) render(); } });
  function vkEl(input) {
    const MAXLEN = 60;
    const edit = fn => {
      if (S.locked || input.disabled) return;
      input.focus(); const v = input.value; let s0 = input.selectionStart, e0 = input.selectionEnd; if (s0 == null) { s0 = e0 = v.length; }
      const r = fn(v, s0, e0); if (!r) return; input.value = r.v; try { input.setSelectionRange(r.c, r.c); } catch (_) {} draft = input.value;
    };
    const ins = ch => edit((v, a, b) => v.length - (b - a) >= MAXLEN ? null : { v: v.slice(0, a) + ch + v.slice(b), c: a + ch.length });
    const del = () => edit((v, a, b) => a !== b ? { v: v.slice(0, a) + v.slice(b), c: a } : a > 0 ? { v: v.slice(0, a - 1) + v.slice(a), c: a - 1 } : null);
    const key = (label, act, cls, aria, repeat) => {
      let t1 = null, t2 = null; const stop = () => { clearTimeout(t1); clearInterval(t2); };
      const b = h('button', { type: 'button', class: 'vk-key ' + (cls || ''), 'aria-label': aria || label,
        onpointerdown: e => { e.preventDefault(); act(); if (repeat) { stop(); t1 = setTimeout(() => { t2 = setInterval(() => { if (b.isConnected) act(); else stop(); }, 70); }, 400); } },
        onpointerup: stop, onpointerleave: stop, onpointercancel: stop,
        onclick: e => { if (e.detail === 0) act(); },
        oncontextmenu: e => e.preventDefault() }, label);
      return b;
    };
    const chars = r => [...r].map(c => key(c, () => ins(c)));
    return h('div', { class: 'vk', role: 'group', 'aria-label': 'Bàn phím ảo' },
      h('div', { class: 'vk-row vk-num' }, chars('1234567890')),
      h('div', { class: 'vk-row' }, chars('qwertyuiop')),
      h('div', { class: 'vk-row' }, chars('asdfghjkl')),
      h('div', { class: 'vk-row' }, chars('zxcvbnm'), key('⌫', del, 'wide', 'Xóa lùi', true)),
      h('div', { class: 'vk-row' }, key('-', () => ins('-')), key("'", () => ins("'")), key('Dấu cách', () => ins(' '), 'space'), key('.', () => ins('.')), key(',', () => ins(',')), key('Nộp', () => submit(), 'enter', 'Nộp bài')));
  }
  const stopBtn = h('button', { class: 'btn small danger', onclick: () => askStop() }, '⏹ Dừng lại & lưu điểm');
  const hud = h('div', { class: 'hud' }, h('div', { class: 'grp' }, hudPos, hudTime, hudCombo), h('div', { class: 'grp' }, stopBtn, vkBtn, sfxBtn, readBtn, pauseBtn));
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
    vkBtn.textContent = vkOn() ? '⌨ Bàn phím: App' : '⌨ Bàn phím: Thiết bị'; vkBtn.setAttribute('aria-pressed', String(vkOn()));
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
      const useVK = vkOn();
      const input = h('input', { type: 'text', id: 'ans', 'aria-label': 'Gõ lại từ tiếng Anh', autocomplete: 'off', autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false', enterkeyhint: 'done', inputmode: useVK ? 'none' : 'text', writingsuggestions: 'false', 'data-gramm': 'false', value: draft,
        oninput: e => { draft = e.target.value; } });
      const fb = h('div', { class: 'feedback', 'aria-live': 'assertive', id: 'fb' });
      stage.append(h('div', { class: 'word-card' },
        h('p', { class: 'label', text: 'Gõ từ tiếng Anh bạn vừa nghe/nhớ' }),
        h('p', { class: 'vi', lang: 'vi', text: w.vi }),
        h('form', { class: 'type-form', onsubmit: e => { e.preventDefault(); submit(); } }, input, fb,
          h('div', { class: 'row wrap', style: 'justify-content:center' },
            h('button', { type: 'submit', class: 'btn primary' }, 'Nộp (Enter)'),
            h('button', { type: 'button', class: 'btn', onclick: () => dispatch('forget') }, `Quên / Xem lại (Tab) · −${Scoring.peekPenalty} điểm`), listen, skipButton())),
        useVK ? vkEl(input) : null,
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
      h('div', null, h('div', { class: 'score-big', text: r.score + '/' + r.maxScore }), h('div', { class: 'muted', text: `Tổng điểm (mỗi từ đúng +${Scoring.correctPts}, mỗi lần xem lại −${Scoring.peekPenalty})` })),
      h('div', null, h('div', { class: 'score-big', style: 'font-size:2.2rem', text: `${r.correct}✓ ${r.peeks}👁` }), h('div', { class: 'muted', text: 'Từ đúng · Lần xem lại' })),
      h('div', null, h('div', { class: 'score-big', style: 'font-size:2.2rem', text: r.words.length + '/' + r.totalWords }), h('div', { class: 'muted', text: 'Từ đã làm' + (skipped ? ` · ${skipped} bỏ qua` : '') })),
      h('div', null, h('div', { class: 'score-big', style: 'font-size:2.2rem', text: fmtTime(r.totalMs) }), h('div', { class: 'muted', text: 'Tổng thời gian' }))),
    note ? h('div', { class: 'box warn', role: 'status', text: note }) : null,
    o.mode === 'assign' ? h('div', { class: 'card' }, o.status || 'Chưa làm từ nào nên không có điểm để lưu.') : h('div', { class: 'box', text: 'Chế độ làm thử – kết quả không được gửi đi.' }),
    r.words.length ? h('div', { class: 'card' }, h('h2', { text: 'Điểm từng từ' }),
      h('div', { class: 'chart', role: 'img', 'aria-label': 'Biểu đồ điểm từng từ' }, r.words.map(w => h('div', { class: 'bar' + (w.score < Scoring.correctPts * .6 ? ' low' : ''), title: `${w.word}: ${w.score}`, style: `height:${Math.max(4, Math.min(100, w.score / (Scoring.correctPts || 1) * 100))}%` })))) : null,
    h('div', { class: 'card' }, h('h2', { text: `Cần cải thiện (${weak.length})` }),
      weak.length ? h('div', { class: 'chips' }, weak.map(w => h('span', { class: 'chip', text: w.word }))) : h('p', { class: 'ok', text: r.words.length ? '🎉 Không có từ nào cần cải thiện!' : '—' })),
    r.words.length ? h('div', { class: 'table-wrap' }, h('table', null, h('caption', { class: 'center muted', text: 'Chi tiết từng từ' }),
      h('thead', null, h('tr', null, ['Từ', 'Xem lại', 'Gõ sai', 'Điểm', 'Thời gian', 'Ghi chú'].map((t, i) => h('th', { class: i && i < 5 ? 'num' : '', scope: 'col', text: t })))),
      h('tbody', null, r.words.map(w => h('tr', null, h('td', { text: w.word }), h('td', { class: 'num', text: Scoring.peeks(w.views) }), h('td', { class: 'num', text: w.wrongCount }), h('td', { class: 'num', text: w.score }), h('td', { class: 'num', text: (w.timeMs / 1000).toFixed(1) + 's' }), h('td', { text: w.skipped ? 'Bỏ qua' : '' })))))) : null,
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
  Scoring.useOverride(s.correctPts, s.peekPenalty);   // làm thử: hiển thị đúng điểm riêng của bộ từ
  const fl = runFlow(root, { title: s.name, words: s.cards, tts: s.tts, shuffle: s.shuffle, mode: 'practice', backHref: '#/' });
  return { destroy() { Scoring.clearOverride(); if (fl && fl.destroy) fl.destroy(); } };
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
    due: Number(p.due) || 0, shuffle: !!p.sh, max: Number(p.max) || 0, req: !!p.req, scriptUrl: p.u || '', correctPts: cleanPts(p.cp), peekPenalty: cleanPts(p.pp) };
}
async function loadAssignment(q) {
  if (q.kind === 'test') { const a = await loadTestAssignment(q); a.words = []; return a; }
  if (q.d) {
    if (!window.LZString) throw new Error('Thư viện giải nén chưa tải được – hãy kiểm tra kết nối mạng và tải lại trang.');
    return decodeAssignment(q.d);
  }
  if (q.id && q.s) {
    if (!API.validUrl(API.expand(q.s))) throw new Error('Link không hợp lệ: địa chỉ máy chủ không đúng.');
    const r = await API.get(API.expand(q.s), { action: 'getAssignment', id: q.id });
    if (!r.ok) throw new Error(r.error === 'not_found' ? 'Không tìm thấy bài tập này trên máy chủ (mã sai hoặc đã bị xóa).' : (r.message || 'Không tải được bài tập.'));
    const a = r.assignment;
    if (!a.words || !a.words.length) throw new Error('Bài tập chưa có danh sách từ.');
    return { id: a.id, name: a.name, words: a.words, tts: { lang: (a.tts && a.tts.lang) || 'en-US', voice: '', rate: clamp(Number(a.tts && a.tts.rate) || 1, .5, 1.5) }, due: Number(a.due) || 0, shuffle: !!a.shuffle, max: Number(a.max) || 0, req: !!a.req, scriptUrl: API.expand(q.s), correctPts: cleanPts(a.correctPts), peekPenalty: cleanPts(a.peekPenalty) };
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
    let code = normCode(Store.get('studentCode', ''));      // mã nhớ trên thiết bị này
    const attempts = () => (Store.get('attempts', {})[a.id] || 0);
    const codeIn = h('input', { type: 'text', id: 's-code', maxlength: 12, autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', placeholder: 'VD: AB3K7M', 'aria-describedby': 's-err',
      oninput: () => { const v = normCode(codeIn.value); if (v !== codeIn.value) codeIn.value = v; } });
    const codeBox = h('div');
    let needPw = false;                                    // máy chủ báo mã này có mật khẩu mà máy chưa có token hợp lệ
    const pwIn = h('input', { type: 'password', id: 's-pw', maxlength: 32, autocomplete: 'current-password', autocapitalize: 'off', spellcheck: 'false', placeholder: 'Mật khẩu giáo viên đã cho', 'aria-describedby': 's-err',
      onkeydown: e => { if (e.key === 'Enter') { e.preventDefault(); begin(); } } });
    const eye = h('button', { type: 'button', class: 'btn small ghost', 'aria-label': 'Hiện mật khẩu', 'aria-pressed': 'false', onclick: () => { const on = pwIn.type === 'password'; pwIn.type = on ? 'text' : 'password'; eye.textContent = on ? '🙈' : '👁'; eye.setAttribute('aria-pressed', String(on)); eye.setAttribute('aria-label', on ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'); } }, '👁');
    const pwBox = () => h('div', null, h('label', { for: 's-pw', text: 'Mật khẩu' }), h('div', { class: 'pw-row' }, pwIn, eye),
      h('p', { class: 'hint', text: needPw ? 'Mã này có mật khẩu. Nhập một lần, máy sẽ nhớ cho các lần sau.' : 'Để trống nếu giáo viên chưa đặt mật khẩu cho bạn.' }));
    const forget = () => { code = ''; needPw = false; pwIn.value = ''; Store.set('studentCode', ''); Store.set('studentTok', ''); err.textContent = ''; drawCode(); codeIn.focus(); };
    const drawCode = () => {
      if (code) codeBox.replaceChildren(h('div', { class: 'row wrap', style: 'align-items:center' }, h('span', null, 'Mã học sinh: ', h('strong', { text: code })),
        h('button', { type: 'button', class: 'btn small', onclick: forget }, 'Đổi mã')), needPw ? pwBox() : null);
      else codeBox.replaceChildren(h('label', { for: 's-code', text: 'Mã học sinh *' }), codeIn, h('p', { class: 'hint', text: 'Nhập mã giáo viên đã phát cho bạn (tự viết hoa, không cần gõ dấu cách).' }), pwBox());
    };
    const err = h('p', { class: 'err', id: 's-err', role: 'alert' });
    const cd = h('strong', { 'aria-live': 'off' });
    const startBtn = h('button', { class: 'btn primary big', onclick: begin }, '▶ Vào làm bài');
    const lock = h('div', { class: 'box error', role: 'alert', style: 'display:none' });
    let expired = false, checking = false;
    const tick = () => {
      const left = a.due - Date.now();
      if (!a.due) { cd.textContent = 'Không giới hạn'; return; }
      if (left <= 0) { expired = true; cd.textContent = 'Đã hết hạn'; startBtn.disabled = true; lock.style.display = ''; lock.textContent = 'Bài này đã hết hạn nộp nên bị khóa.'; clearInterval(timer); return; }
      const s = Math.floor(left / 1000), d = Math.floor(s / 86400);
      cd.textContent = (d ? d + ' ngày ' : '') + [Math.floor(s % 86400 / 3600), Math.floor(s % 3600 / 60), s % 60].map(n => String(n).padStart(2, '0')).join(':');
    };
    if (a.max && attempts() >= a.max) { startBtn.disabled = true; lock.style.display = ''; lock.textContent = `Bạn đã dùng hết ${a.max} lần làm bài.`; }
    drawCode();
    root.replaceChildren(h('div', { class: 'card stack', style: 'max-width:560px;margin:0 auto' },
      h('h1', { text: a.name }),
      h('p', { class: 'muted', text: `${a.test ? qCount(a.test) + ' câu · ' + testPoints(a.test) + ' điểm' + (a.test.limit ? ' · ' + a.test.limit + ' phút' : '') : a.words.length + ' từ'} · Hạn nộp: ${fmtDate(a.due)}` }),
      h('p', null, 'Còn lại: ', cd),
      !a.test && a.words.length ? h('p', { class: 'muted', text: `Điểm: +${a.correctPts != null ? a.correctPts : Scoring.defCP} mỗi từ đúng · −${a.peekPenalty != null ? a.peekPenalty : Scoring.defPP} mỗi lần xem lại` }) : null,
      a.max ? h('p', { class: 'muted', text: `Số lần làm: ${attempts()}/${a.max}` }) : null,
      !a.scriptUrl ? h('div', { class: 'box warn', text: 'Bài này chưa có máy chủ nhận điểm nên chưa thể kiểm tra Mã học sinh. Hãy báo giáo viên tạo lại link.' }) : null,
      lock, codeBox, err, startBtn,
      h('div', { class: 'row wrap', style: 'justify-content:space-between;align-items:center' },
        q.hs ? h('a', { class: 'btn ghost', href: 'hoc-sinh.html#bai-giao' }, '← Về trang học sinh') : h('span'),
        window.SMTheme ? SMTheme.button() : null)));
    tick(); timer = setInterval(tick, 1000);

    async function begin() {
      if (checking || dead) return;
      const c = code || normCode(codeIn.value);
      if (!c) { err.textContent = 'Vui lòng nhập Mã học sinh.'; return codeIn.focus(); }
      if (!/^[A-Z0-9]{3,16}$/.test(c)) { err.textContent = 'Mã học sinh gồm 3–16 chữ hoặc số. Hãy kiểm tra lại.'; return codeIn.focus(); }
      if (!API.validUrl(a.scriptUrl)) { err.textContent = 'Bài này chưa có máy chủ nhận điểm nên không kiểm tra được mã. Hãy báo giáo viên.'; return; }
      err.textContent = ''; checking = true; startBtn.disabled = true; startBtn.textContent = 'Đang kiểm tra mã…';
      const reset = () => { checking = false; startBtn.textContent = '▶ Vào làm bài'; startBtn.disabled = expired || !!(a.max && attempts() >= a.max); };
      let r;
      const pw = pwIn.value.trim(), tok = code && code === normCode(Store.get('studentCode', '')) ? Store.get('studentTok', '') : '';
      const body = { action: 'checkCode', code: c, refId: a.id };
      if (pw) body.password = pw; else if (tok) body.token = tok;
      try { r = await withRetry(() => API.post(a.scriptUrl, body), 2); }
      catch (e) { if (dead) return; err.textContent = 'Không kiểm tra được mã: ' + e.message + ' (cần có mạng để vào làm bài).'; return reset(); }
      if (dead) return;
      if (!r.ok || r.valid === false) {
        err.textContent = codeErrorMsg(r.ok ? { error: 'invalid_code' } : r);
        if (!r.ok && ['auth_required', 'wrong_password', 'locked'].includes(r.error)) {          // giữ mã, chỉ hỏi mật khẩu
          if (!code) { code = c; Store.set('studentCode', c); }
          Store.set('studentTok', ''); const first = !needPw; needPw = true; pwIn.value = '';
          if (first) drawCode(); reset(); return setTimeout(() => pwIn.focus(), 0);
        }
        if (!r.ok ? ['invalid_code', 'code_disabled'].includes(r.error) : true) { Store.set('studentCode', ''); Store.set('studentTok', ''); code = ''; drawCode(); }
        return reset();
      }
      code = normCode(r.code || c); Store.set('studentCode', code); Store.set('studentTok', r.token || '');
      await Scoring.load(a.scriptUrl);                  // hằng số điểm từ server (offline → mặc định 5 / 1 / 10)
      if (dead) return;
      if (a.test) Scoring.clearOverride(); else Scoring.useOverride(a.correctPts, a.peekPenalty);   // điểm riêng của bài (chỉ hiển thị)
      if (expired || (a.due && a.due <= Date.now())) { err.textContent = 'Bài này đã hết hạn nộp.'; return reset(); }
      clearInterval(timer);
      const sid = uid();   // mỗi lần làm có 1 submissionId cố định (UUID) → lưu tạm/lưu cuối cùng cùng 1 dòng, server không cộng điểm 2 lần
      if (a.test) { flow = testFlow(root, { title: a.name, test: a.test, mode: 'assign', backHref: null, onAssignFinish: res => saveTestAttempt(a, code, res, sid) }); return; }
      flow = runFlow(root, { title: a.name, words: a.words, tts: a.tts, shuffle: a.shuffle, mode: 'assign', backHref: null, idleMs: 30 * 60 * 1000,
        onAutosave: (res, opt) => saveAttempt(a, code, res, 'partial', sid, opt),
        onAssignFinish: res => saveAttempt(a, code, res, res.reason || 'done', sid, {}) ? finalStatus(a, code, 'vocab', sid, res.score, { correct: res.correct, peeks: res.peeks }) : null });
    }
  }
  const counted = new Set();
  /** Điểm chính thức (submitResult) chỉ gửi MỘT lần khi kết thúc bài (hoàn thành / dừng / hết 30 phút): server chống trùng theo submissionId nên bản lưu tạm không được gửi bằng action này */
  function finalStatus(a, code, kind, sid, est, body) {
    const psid = sid + '-pts';
    if (API.validUrl(a.scriptUrl)) Sync.upsert({ submissionId: psid, url: a.scriptUrl, payload: Object.assign({ action: 'submitResult', code, token: Store.get('studentTok', ''), kind, refId: a.id, submissionId: sid }, body) });
    else Sync.emit(psid, 'rejected', 'Bài chưa cấu hình máy chủ.');
    return h('div', { class: 'stack' }, pointsPanel(psid, code, est), statusChip(sid));
  }
  /** Lưu bản chi tiết (action cũ `submit`) để giáo viên xem thống kê; trả về false nếu chưa có từ nào để lưu */
  function saveAttempt(a, code, res, status, sid, opt) {
    if (!res.words.length) return false;
    if (!counted.has(sid)) { counted.add(sid); const att = Store.get('attempts', {}); att[a.id] = (att[a.id] || 0) + 1; Store.set('attempts', att); }
    if (!API.validUrl(a.scriptUrl)) { Sync.emit(sid, 'rejected', 'Bài chưa cấu hình nơi nhận kết quả.'); return true; }
    Sync.upsert({ submissionId: sid, url: a.scriptUrl, payload: { action: 'submit', submissionId: sid, code, token: Store.get('studentTok', ''), assignmentId: a.id, assignmentName: a.name, name: code, cls: '', score: res.score, maxScore: res.maxScore, totalMs: res.totalMs,
      details: res.words, totalWords: res.totalWords, status, submittedAt: new Date().toISOString(), userAgent: navigator.userAgent, due: a.due, max: a.max } }, opt);
    return true;
  }
  return { destroy() { dead = true; clearInterval(timer); if (flow) flow.destroy(); Scoring.clearOverride(); } };
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
        (r.v || 0) < 10 ? h('p', { class: 'err', text: '⚠ Apps Script chưa phải bản mới nhất (bản mới có giao bài riêng theo mã học sinh, đọc/ghi Sheet nhanh hơn). Dán lại Code.gs rồi Deploy → Manage deployments → ✎ → Version: New version.' }) : null);
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
    await IDB.wipe();
    location.hash = '#/'; location.reload();
  }
  root.replaceChildren(h('div', { class: 'stack', style: 'max-width:640px' }, h('h1', { text: 'Cài đặt' }),
    h('section', { class: 'card' }, h('h2', { text: 'Kết nối Google Apps Script' }),
      h('label', { for: 'st-url', text: 'Apps Script URL (Web app)' }), url,
      h('label', { for: 'st-key', text: 'Teacher Key' }), key,
      h('p', { class: 'hint', text: 'Teacher Key chỉ lưu trên máy này và chỉ để xem thống kê / tạo link ngắn. Không bao giờ được đưa vào link giao bài.' }),
      h('div', { class: 'row wrap' }, h('button', { class: 'btn', onclick: test }, 'Kiểm tra kết nối')), res),
    Auth.enabled() ? h('section', { class: 'card' }, h('h2', { text: 'Mật khẩu truy cập app' }),
      h('p', { class: 'hint', text: 'App đang bật mật khẩu. Thiết bị này được ghi nhớ đăng nhập; bấm “Đăng xuất” để bắt nhập lại. Muốn đổi mật khẩu: tạo mã mới rồi dán vào index.html (học sinh vào bằng link giao bài không cần mật khẩu).' }),
      h('div', { class: 'row wrap' }, h('a', { class: 'btn', href: '#/tao-mat-khau' }, '🔑 Tạo mã mật khẩu mới'), h('a', { class: 'btn', href: '#/logout' }, 'Đăng xuất'))) : h('section', { class: 'card' }, h('h2', { text: 'Mật khẩu truy cập app' }),
      h('p', { class: 'hint', text: 'Hiện CHƯA bật mật khẩu. Tạo mã mật khẩu rồi dán vào index.html để bật.' }), h('a', { class: 'btn', href: '#/tao-mat-khau' }, '🔑 Tạo mã mật khẩu')),
    h('section', { class: 'card' }, h('h2', { text: 'Giao diện & âm thanh' }),
      h('label', { for: 'st-theme', text: 'Chế độ màu' }), theme,
      h('label', { class: 'check', for: 'st-sfx' }, sfx, 'Hiệu ứng âm thanh (Ting / Oops)'),
      h('label', { class: 'check', for: 'st-read' }, read, 'Tự đọc từ mỗi 3 giây khi làm bài')),
    h('section', { class: 'card' }, h('h2', { text: 'Đồng bộ với GitHub (index.json + data/)' }),
      h('label', { class: 'check', for: 'st-sync' }, asy, 'Tự động ghi đè bộ từ + bài test + thiết lập khi repo có bản mới'),
      h('p', { class: 'hint', text: 'Đồng bộ một chiều: repo → máy này, và chỉ tải các tệp có updatedAt mới hơn. Nếu bật, mọi chỉnh sửa chưa xuất lên repo trên máy này sẽ bị ghi đè khi repo có bản mới. Repo cũ chỉ có data.json vẫn đồng bộ được. Nhớ bấm "Lưu cài đặt".' }),
      h('button', { class: 'btn', onclick: () => repoCheck({ manual: true }) }, '⟳ Đồng bộ ngay')),
    h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: save }, 'Lưu cài đặt')),
    (() => { const i = storageInfo(); return h('section', { class: 'card' }, h('h2', { text: 'Bộ nhớ trên máy' }),
      h('p', { text: `${Sets.list.length} bộ từ (${i.words.toLocaleString('vi-VN')} từ) · ${Tests.list.length} bài test (${i.qs.toLocaleString('vi-VN')} câu)` }),
      h('p', { class: 'hint', text: i.idb
        ? `Lưu bằng IndexedDB (mỗi bộ từ / bài test một bản ghi riêng, không còn giới hạn ~5 MB). Đang dùng khoảng ${i.mb} MB` + (i.quotaMb ? ` trên tối đa khoảng ${i.quotaMb.toLocaleString('vi-VN')} MB trình duyệt cho phép.` : '.') + ' Hãy xuất gói .zip thường xuyên để sao lưu.'
        : `Trình duyệt này không dùng được IndexedDB nên app lưu theo chế độ cũ (localStorage, khoảng 5 MB). Đang dùng khoảng ${i.mb} MB. Hãy xuất gói .zip thường xuyên để sao lưu.` })); })(),
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
function statsTopWords(rows, limit) {
  const m = new Map();
  rows.forEach(r => r.details.forEach(d => {
    const e = m.get(d.word) || { word: d.word, wrong: 0, extra: 0, skip: 0, n: 0 };
    e.wrong += d.wrongCount; e.extra += Math.max(0, d.views - 1); e.skip += d.skipped ? 1 : 0; e.n++; m.set(d.word, e);
  }));
  return [...m.values()].filter(e => e.wrong + e.extra + e.skip > 0).sort((a, b) => (b.wrong + b.extra + b.skip) - (a.wrong + a.extra + a.skip)).slice(0, limit || 10);
}
const STUDENT_COLS = [
  { k: 'name', label: 'Mã HS / Họ tên (cũ)', get: r => r.name }, { k: 'cls', label: 'Lớp (dữ liệu cũ)', get: r => r.cls },
  { k: 'attempts', label: 'Số lần làm', num: 1, get: r => r.attempts }, { k: 'total', label: 'Tổng điểm', num: 1, get: r => r.total },
  { k: 'max', label: 'Tổng tối đa', num: 1, get: r => r.max }, { k: 'best', label: 'Điểm cao nhất', num: 1, get: r => r.best },
  { k: 'words', label: 'Từ đã làm', num: 1, get: r => r.words }, { k: 'time', label: 'Tổng thời gian', num: 1, get: r => fmtTime(r.time) },
  { k: 'last', label: 'Lần gần nhất', get: r => fmtDate(r.last) }];
const sortRows = (rows, sort) => rows.slice().sort((a, b) => { const x = a[sort.key], y = b[sort.key]; return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'vi')) * sort.dir; });
const nextSort = (sort, k, textKeys) => ({ key: k, dir: sort.key === k ? -sort.dir : (textKeys.includes(k) ? 1 : -1) });
function sortTable(cap, cols, rows, sort, onSort) {
  return h('div', { class: 'table-wrap' }, h('table', null, h('caption', { class: 'center muted', text: cap }),
    h('thead', null, h('tr', null, cols.map(c => h('th', { scope: 'col', class: c.num ? 'num' : '', 'aria-sort': c.nosort ? null : (sort.key === c.k ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none') },
      c.nosort ? c.label : h('button', { onclick: () => onSort(c.k) }, c.label + (sort.key === c.k ? (sort.dir > 0 ? ' ▲' : ' ▼') : '')))))),
    h('tbody', null, rows.map(r => h('tr', null, cols.map(c => c.el ? h('td', null, c.el(r)) : h('td', { class: c.num ? 'num' : '', text: String(c.get(r)) })))))));
}
const pager = (page, pages, go) => h('div', { class: 'pager' }, h('button', { class: 'btn small', disabled: page <= 1, onclick: () => go(page - 1) }, '‹ Trước'),
  h('span', { text: `Trang ${page}/${pages}` }), h('button', { class: 'btn small', disabled: page >= pages, onclick: () => go(page + 1) }, 'Sau ›'));

/* ===================== 10c. GIÁO VIÊN: QUẢN LÝ HỌC SINH + CẤU HÌNH ĐIỂM & TRÒ CHƠI =====================
 *  Dùng các action giáo viên của Code.gs v8 (POST + teacherKey): listStudents, createCodes, deleteCode, restoreCode,
 *  adjustPoints, getLedger, getConfig, setConfig. Teacher Key + Apps Script URL dùng chung với trang Cài đặt (Settings.data). */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const TA = {
  ERR: {
    unauthorized: 'Teacher Key không đúng hoặc đã bị đổi. Hãy xóa khóa rồi nhập lại.',
    rate_limited: 'Thao tác hơi nhanh. Đợi 1–2 giây rồi thử lại.',
    busy: 'Máy chủ đang bận. Hãy thử lại sau vài giây.',
    too_large: 'Dữ liệu gửi lên quá lớn.',
    invalid_code: 'Không tìm thấy mã này.',
    not_found: 'Không tìm thấy dữ liệu.',
    code_disabled: 'Mã này đã bị xóa.',
    server_error: 'Máy chủ gặp lỗi. Hãy thử lại sau ít phút.'
  },
  ready() { const s = Settings.data; return API.validUrl(s.scriptUrl) && !!s.teacherKey; },
  msg(r) {
    if (r && r.error === 'bad_request' && /Hành động|action/i.test(r.message || '')) return 'Apps Script chưa cập nhật bản mới (v8). Hãy dán lại Code.gs rồi Deploy → Manage deployments → New version.';
    return (r && (TA.ERR[r.error] || r.message || r.error)) || 'Máy chủ phản hồi không đúng định dạng.';
  },
  /** o: { url, key (ghi đè), retry (chỉ cho thao tác ĐỌC – tránh làm lặp thao tác ghi), ms } · lỗi từ máy chủ có e.code, lỗi mạng thì không */
  async call(action, params, o) {
    o = o || {};
    const s = Settings.data, url = o.url || s.scriptUrl, key = o.key != null ? o.key : s.teacherKey;
    if (!API.validUrl(url)) throw new Error('Chưa có Apps Script URL hợp lệ. Hãy dán URL ở ô bên trên hoặc trong Cài đặt.');
    if (!key) throw new Error('Chưa nhập Teacher Key.');
    const body = Object.assign({}, params, { action, teacherKey: key });
    let err;
    for (let i = 0, n = o.retry ? 2 : 1; i < n; i++) {
      try {
        const r = await API.post(url, body, o.ms || 25000);
        if (r && r.ok) return r;
        const e = new Error(TA.msg(r)); e.code = (r && r.error) || 'error'; throw e;
      } catch (e) { err = e; if (e.code || i === n - 1) break; await new Promise(res => setTimeout(res, 800)); }
    }
    throw err;
  }
};
const tsOf = v => {
  if (v == null || v === '') return 0;
  const n = typeof v === 'number' ? v : (/^\d+(\.\d+)?$/.test(String(v).trim()) ? Number(v) : Date.parse(v));
  return isFinite(n) ? (n > 0 && n < 1e11 ? n * 1000 : n) : 0;
};
const nfmt = n => (Number(n) || 0).toLocaleString('vi-VN');
const studentBase = () => new URL('hoc-sinh.html', location.href).href;
const studentLink = code => studentBase() + '?code=' + encodeURIComponent(code);
/* ---------- "Giao cho": tất cả mã học sinh hoặc chỉ một số mã (bài hiện trong tab "Bài được giao" của trang học sinh) ---------- */
const splitCodes = v => { const seen = new Set(); String(v || '').split(/[,;\r\n]+/).map(normCode).forEach(c => { if (c.length >= 3) seen.add(c); }); return [...seen]; };
function targetPicker(pfx) {
  const sel = new Set(); let students = null;
  const allR = h('input', { type: 'radio', name: pfx + '-tg', id: pfx + '-tg-all', checked: true, onchange: () => upd() });
  const someR = h('input', { type: 'radio', name: pfx + '-tg', id: pfx + '-tg-some', onchange: () => upd() });
  const ta = h('textarea', { id: pfx + '-codes', rows: 3, class: 't-codes', spellcheck: 'false', autocapitalize: 'characters', autocomplete: 'off', placeholder: 'Mỗi mã một dòng hoặc cách nhau dấu phẩy, vd: AB3K7M, 6A01',
    oninput: () => { sel.clear(); splitCodes(ta.value).forEach(c => sel.add(c)); drawList(); count(); } });
  const info = h('p', { class: 'hint', 'aria-live': 'polite' });
  const filter = h('input', { type: 'search', style: 'width:100%', placeholder: 'Lọc theo mã / ghi chú (vd: 6A)', 'aria-label': 'Lọc danh sách mã', oninput: () => drawList() });
  const list = h('div', { class: 'stack', style: 'max-height:240px;overflow:auto;gap:.15rem' });
  const tools = h('div', { class: 'stack', hidden: true }, filter,
    h('div', { class: 'row wrap' }, h('button', { type: 'button', class: 'btn small', onclick: () => bulk(true) }, '☑ Chọn tất cả (đang lọc)'), h('button', { type: 'button', class: 'btn small', onclick: () => bulk(false) }, '☐ Bỏ chọn (đang lọc)')), list);
  const pickBtn = h('button', { type: 'button', class: 'btn small', onclick: load }, '👥 Chọn từ danh sách mã');
  const some = h('div', { class: 'stack', hidden: true }, h('label', { for: pfx + '-codes', text: 'Mã học sinh được giao' }), ta, h('div', { class: 'row wrap' }, pickBtn), tools, info);
  const shown = () => { const f = normCode(filter.value), fn = String(filter.value || '').trim().toLowerCase(); return (students || []).filter(s => s.active !== false && (!fn || s.code.includes(f) || String(s.note || '').toLowerCase().includes(fn))); };
  function writeTa() { ta.value = [...sel].join('\n'); count(); }
  function bulk(on) { shown().forEach(s => on ? sel.add(s.code) : sel.delete(s.code)); writeTa(); drawList(); }
  function drawList() {
    if (!students) return;
    const rows = shown();
    list.replaceChildren(...(rows.length ? rows.slice(0, 500).map(s => h('label', { class: 'check' },
      h('input', { type: 'checkbox', checked: sel.has(s.code), onchange: e => { e.target.checked ? sel.add(s.code) : sel.delete(s.code); writeTa(); } }),
      h('strong', { text: s.code }), s.note ? h('span', { class: 'muted', text: ' · ' + s.note }) : null)) : [h('p', { class: 'muted', text: 'Không có mã nào khớp.' })]));
  }
  async function load() {
    if (!TA.ready()) return toast('Cần Apps Script URL + Teacher Key (Cài đặt) để tải danh sách mã.', 'error');
    pickBtn.disabled = true; pickBtn.textContent = 'Đang tải…';
    try { const r = await TA.call('listStudents', {}, { retry: true }); students = (r.students || []).map(s => ({ code: normCode(s.code), note: s.note, active: s.active })).filter(s => s.code).sort((a, b) => String(a.note || '').localeCompare(String(b.note || ''), 'vi') || a.code.localeCompare(b.code)); tools.hidden = false; drawList(); }
    catch (e) { toast('Không tải được danh sách mã: ' + e.message, 'error'); }
    pickBtn.disabled = false; pickBtn.textContent = '↻ Tải lại danh sách mã';
  }
  function count() { info.textContent = sel.size ? `Đã chọn ${sel.size} mã.` : 'Chưa chọn mã nào.'; }
  function upd() { some.hidden = !someR.checked; if (someR.checked && !students && TA.ready()) load(); count(); }
  const el = h('fieldset', { class: 'stack', style: 'border:1px solid var(--border);border-radius:10px;padding:.6rem .8rem' },
    h('legend', { text: 'Giao cho' }),
    h('label', { class: 'check', for: pfx + '-tg-all' }, allR, 'Tất cả học sinh có mã'),
    h('label', { class: 'check', for: pfx + '-tg-some' }, someR, 'Chỉ một số mã học sinh (giao riêng)'),
    some, h('p', { class: 'hint', text: 'Bài sẽ hiện trong tab “Bài được giao” ở trang học sinh của các mã được giao (cần Apps Script + Teacher Key). Mã không được giao không làm / không nộp được bài này.' }));
  return { el, personal: () => someR.checked, codes: () => someR.checked ? [...sel] : [] };
}
async function copyAny(text) {
  const tmp = h('textarea', { 'aria-hidden': 'true', tabindex: '-1', style: 'position:fixed;left:-9999px;top:0;opacity:0' });
  tmp.value = text; document.body.append(tmp);
  const ok = await copyText(text, tmp); tmp.remove(); return ok;
}
const csvEsc = v => { v = safeCell(String(v == null ? '' : v)); return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
const csvText = rows => '\ufeff' + rows.map(r => r.map(csvEsc).join(',')).join('\r\n');
const dayStamp = () => { const d = new Date(); return d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0'); };
/** Đăng ký hàm vẽ lại vào tập `set`; tự hủy khi phần tử đã bị gỡ khỏi trang (trang chủ vẽ lại) */
function liveView(set, el, fn) {
  let attached = false;
  const f = () => { if (el.isConnected) attached = true; else if (attached) { set.delete(f); return; } fn(); };
  set.add(f); return f;
}
function teacherCss() {
  if (document.getElementById('sm-t-css')) return;
  const st = document.createElement('style'); st.id = 'sm-t-css';
  st.textContent = [
    '.home-tabs{overflow-x:auto;-webkit-overflow-scrolling:touch}.home-tab{white-space:nowrap}',
    '.t-bar{display:flex;flex-wrap:wrap;gap:.5rem;align-items:center}',
    '.t-bar input[type=search]{flex:1 1 200px;min-width:0}.t-bar select{flex:0 1 auto;width:auto;max-width:100%}',
    '.t-copy{display:flex;gap:.5rem;align-items:center}.t-copy input{flex:1 1 auto;min-width:0}',
    '.t-acts{gap:.3rem;flex-wrap:wrap}',
    '.t-code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-weight:700;letter-spacing:.06em}',
    '.t-note{white-space:normal;display:inline-block;min-width:6rem}',
    '.t-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,230px),1fr));gap:.8rem}',
    '.t-field .hint{margin:.2rem 0 0}.t-games{display:grid;gap:.5rem}.t-dim{opacity:.55}',
    '.t-codes{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:1.05rem;letter-spacing:.06em;width:100%}',
    '.pts-total{font-weight:600}',
    '#sm-print{display:none}',
    '@media print{html,body{background:#fff!important}body>*:not(#sm-print){display:none!important}',
    '#sm-print{display:grid!important;grid-template-columns:repeat(3,1fr);gap:5mm;color:#000;background:#fff}',
    '#sm-print .pc-card{border:1px dashed #666;padding:4mm;text-align:center;break-inside:avoid;page-break-inside:avoid;font-family:system-ui,sans-serif}',
    '#sm-print .pc-app{font-size:9pt;font-weight:700}#sm-print img{width:38mm;height:38mm;display:block;margin:2mm auto}',
    '#sm-print .pc-code{font:700 16pt/1.2 ui-monospace,Menlo,Consolas,monospace;letter-spacing:.12em}',
    '#sm-print .pc-pw{font:600 11pt/1.3 ui-monospace,Menlo,Consolas,monospace}#sm-print .pc-note{font-size:9pt;min-height:1.2em}#sm-print .pc-url{font-size:7pt;color:#333;word-break:break-all}',
    '@page{margin:10mm}}'
  ].join('\n');
  document.head.append(st);
}

/* ---------- Nhập / xóa Teacher Key (lưu trên thiết bị, dùng chung với Cài đặt) ---------- */
function teacherKeyBox() {
  const s = Settings.data;
  const url = h('input', { type: 'url', id: 'tk-url', value: s.scriptUrl || '', placeholder: 'https://script.google.com/macros/s/…/exec', autocomplete: 'off', spellcheck: 'false' });
  const key = h('input', { type: 'password', id: 'tk-key', autocomplete: 'off', placeholder: 'Teacher Key' });
  const msg = h('div', { 'aria-live': 'polite' });
  const go = h('button', { class: 'btn primary', type: 'submit' }, 'Lưu & kiểm tra');
  async function submit(e) {
    e.preventDefault();
    const u = url.value.trim(), k = key.value.trim();
    if (!API.validUrl(u)) return msg.replaceChildren(h('p', { class: 'err', text: 'URL phải có dạng https://script.google.com/macros/s/…/exec' }));
    if (!k) return msg.replaceChildren(h('p', { class: 'err', text: 'Hãy nhập Teacher Key.' }));
    go.disabled = true; msg.replaceChildren(loading('Đang kiểm tra khóa…'));
    try {
      const r = await TA.call('listStudents', {}, { url: u, key: k, retry: true });
      Settings.save({ scriptUrl: u, teacherKey: k, teacherOk: true });
      Stu.set(r.students); renderNav(); toast('Đã lưu Teacher Key trên thiết bị này.'); Stu.notify(); Cfg.notify();
    } catch (err) { msg.replaceChildren(h('p', { class: 'err', text: err.message })); go.disabled = false; }
  }
  return h('form', { class: 'card stack', onsubmit: submit, novalidate: true },
    h('h3', { text: '🔑 Nhập Teacher Key' }),
    h('label', { for: 'tk-url', text: 'Apps Script URL (Web app)' }), url,
    h('label', { for: 'tk-key', text: 'Teacher Key' }), key,
    h('p', { class: 'hint', text: 'Chỉ cần nhập một lần. Khóa được lưu trên thiết bị này (không đưa vào link giao bài) và có nút xóa khi cần.' }),
    h('div', { class: 'row wrap' }, go), msg);
}
async function removeTeacherKey() {
  if (!await Modal.confirm('Xóa Teacher Key khỏi thiết bị này? Bạn sẽ không xem được Thống kê và không quản lý được học sinh cho đến khi nhập lại.', 'Xóa khóa', true)) return;
  Settings.save({ teacherKey: '', teacherOk: false });
  Stu.rows = null; Stu.err = ''; Cfg.base = null; Cfg.err = '';
  renderNav(); Stu.notify(); Cfg.notify(); toast('Đã xóa Teacher Key khỏi thiết bị này.');
}
const keyState = () => h('div', { class: 'row wrap', style: 'align-items:center' },
  h('span', { class: 'ok small-text', text: '🔑 Đã lưu Teacher Key trên thiết bị này.' }),
  h('button', { type: 'button', class: 'btn small', onclick: removeTeacherKey }, 'Xóa khóa'));

/* ---------- Danh sách học sinh ---------- */
const normStudent = x => {
  x = x || {};
  const active = !(x.active === false || /^(false|0|no)$/i.test(String(x.active)));
  return { code: String(x.code == null ? '' : x.code), createdAt: tsOf(x.createdAt), note: String(x.note == null ? '' : x.note), active, st: active ? 1 : 0,
    balance: Number(x.balance) || 0, totalEarned: Number(x.totalEarned) || 0, lastActive: tsOf(x.lastActive), password: String(x.password == null ? '' : x.password) };
};
const Stu = {
  rows: null, loading: false, err: '', at: 0, q: '', filter: 'all', sort: { key: 'lastActive', dir: -1 }, page: 1, busy: new Set(), subs: new Set(),
  notify() { Array.from(this.subs).forEach(f => f()); },
  set(list) { this.rows = (Array.isArray(list) ? list : []).filter(x => x && x.code).map(normStudent); this.at = Date.now(); this.err = ''; },
  row(code) { return (this.rows || []).find(r => r.code === code); },
  async load() {
    if (this.loading || !TA.ready()) return;
    this.loading = true; this.err = ''; this.notify();
    try { const r = await TA.call('listStudents', {}, { retry: true }); this.set(r.students); }
    catch (e) { this.err = e.message; }
    finally { this.loading = false; this.notify(); }
  }
};
const STU_PAGE = 50;
const STU_SORTS = [['lastActive:-1', 'Hoạt động gần nhất'], ['totalEarned:-1', 'Tổng điểm cao → thấp'], ['balance:-1', 'Số dư cao → thấp'], ['code:1', 'Mã A → Z'], ['createdAt:-1', 'Mới tạo nhất'], ['note:1', 'Ghi chú A → Z']];

function StudentsPanel() {
  teacherCss();
  const root = h('div', { class: 't-panel stack' }), top = h('div', { class: 'stack' }), list = h('div', { class: 'stack' });
  root.append(top, list);
  let shownReady = null, timer = null;
  const qIn = h('input', { type: 'search', id: 'stu-q', placeholder: '🔍 Tìm theo mã hoặc ghi chú…', value: Stu.q, autocomplete: 'off', 'aria-label': 'Tìm học sinh theo mã hoặc ghi chú',
    oninput: () => { clearTimeout(timer); timer = setTimeout(() => { Stu.q = qIn.value; Stu.page = 1; paintList(); }, 150); } });
  const filt = h('select', { id: 'stu-filter', 'aria-label': 'Lọc theo trạng thái', onchange: () => { Stu.filter = filt.value; Stu.page = 1; paintList(); } },
    [['all', 'Tất cả'], ['active', 'Đang hoạt động'], ['deleted', 'Đã xóa']].map(([v, t]) => h('option', { value: v, selected: Stu.filter === v }, t)));
  const sortSel = h('select', { id: 'stu-sort', 'aria-label': 'Sắp xếp', onchange: () => { if (!sortSel.value) return; const [k, d] = sortSel.value.split(':'); Stu.sort = { key: k, dir: Number(d) }; Stu.page = 1; paintList(); } },
    h('option', { value: '' }, 'Theo cột đã bấm'), STU_SORTS.map(([v, t]) => h('option', { value: v }, t)));
  const view = () => {
    const q = fold(Stu.q.trim());
    const rows = (Stu.rows || []).filter(r => (Stu.filter === 'all' || (Stu.filter === 'active') === r.active) && (!q || fold(r.code + ' ' + r.note).includes(q)));
    return sortRows(rows, Stu.sort);
  };
  const bar = h('div', { class: 't-bar' }, qIn, filt, sortSel,
    h('button', { type: 'button', class: 'btn', onclick: () => Stu.load() }, '↻ Tải lại'),
    h('button', { type: 'button', class: 'btn primary', onclick: () => openCreateCodes() }, '＋ Tạo mã'),
    h('button', { type: 'button', class: 'btn', onclick: () => openBulkPw(view().filter(r => r.active)) }, '🔑 Mật khẩu hàng loạt'),
    h('button', { type: 'button', class: 'btn', onclick: () => exportStudentsCsv(view()) }, '⬇ Tải CSV'),
    h('button', { type: 'button', class: 'btn', onclick: e => printCards(view().filter(r => r.active).map(r => ({ code: r.code, note: r.note, password: r.password })), e.currentTarget) }, '🖨 In thẻ mã'));
  function paintTop() {
    if (!TA.ready()) {
      top.replaceChildren(h('h2', { text: 'Học sinh' }), h('p', { class: 'muted', text: 'Nhập Teacher Key để tạo mã, cộng/trừ điểm và xem sổ điểm của học sinh.' }), teacherKeyBox());
      return;
    }
    const linkIn = h('input', { type: 'text', readonly: true, value: studentBase(), 'aria-label': 'Link trang học sinh', onfocus: e => e.target.select() });
    top.replaceChildren(
      h('section', { class: 'card stack' },
        h('div', { class: 'row wrap', style: 'justify-content:space-between;align-items:center' }, h('h2', { text: 'Học sinh' }), keyState()),
        h('label', { for: 'stu-link', text: 'Link trang học sinh (xem điểm, bảng xếp hạng, chơi game)' }),
        h('div', { class: 't-copy' }, linkIn, h('button', { type: 'button', class: 'btn', onclick: async () => toast(await copyText(linkIn.value, linkIn) ? 'Đã sao chép link trang học sinh.' : 'Không sao chép được – hãy chọn và copy thủ công.') }, '📋 Sao chép')),
        h('p', { class: 'hint', text: 'Gửi link này cho học sinh. Nút 🔗 ở từng dòng sao chép link đã gắn sẵn mã của học sinh đó.' })),
      bar);
    linkIn.id = 'stu-link';
  }
  function paintList() {
    const cur = Stu.sort.key + ':' + Stu.sort.dir; sortSel.value = STU_SORTS.some(x => x[0] === cur) ? cur : '';
    if (!TA.ready()) return list.replaceChildren();
    if (!Stu.rows) {
      if (Stu.loading) return list.replaceChildren(loading('Đang tải danh sách học sinh…'));
      return list.replaceChildren(h('div', { class: 'box error', role: 'alert' }, h('p', { text: Stu.err || 'Chưa tải được danh sách.' }), h('button', { type: 'button', class: 'btn', onclick: () => Stu.load() }, '↻ Thử lại')));
    }
    const all = view(), pages = Math.max(1, Math.ceil(all.length / STU_PAGE)); Stu.page = clamp(Stu.page, 1, pages);
    const total = Stu.rows.length, act = Stu.rows.filter(r => r.active).length;
    const cols = [
      { k: 'code', label: 'Mã', el: r => h('span', { class: 't-code', text: r.code }) },
      { k: 'password', label: 'Mật khẩu', el: r => r.password ? h('span', { class: 't-code', text: r.password }) : h('span', { class: 'muted small-text', text: 'chưa đặt' }) },
      { k: 'balance', label: 'Số dư', num: true, get: r => nfmt(r.balance) },
      { k: 'totalEarned', label: 'Tổng điểm', num: true, get: r => nfmt(r.totalEarned) },
      { k: 'lastActive', label: 'Hoạt động cuối', get: r => r.lastActive ? fmtDate(r.lastActive) : '—' },
      { k: 'note', label: 'Ghi chú', el: r => h('span', { class: 't-note', text: r.note || '—' }) },
      { k: 'st', label: 'Trạng thái', el: r => h('span', { class: r.active ? 'ok' : 'err', text: r.active ? 'Hoạt động' : 'Đã xóa' }) },
      { k: 'act', label: 'Thao tác', nosort: true, el: rowActions }];
    list.replaceChildren(
      h('p', { class: 'muted small-text', role: 'status', text: `${nfmt(total)} mã (${nfmt(act)} hoạt động, ${nfmt(total - act)} đã xóa) · đang hiển thị ${nfmt(all.length)}` + (Stu.loading ? ' · đang cập nhật…' : '') }),
      Stu.err ? h('div', { class: 'box warn', role: 'alert', text: 'Không cập nhật được danh sách mới: ' + Stu.err + ' (đang hiển thị bản đã tải trước đó).' }) : null,
      all.length ? sortTable('Danh sách mã học sinh', cols, all.slice((Stu.page - 1) * STU_PAGE, Stu.page * STU_PAGE), Stu.sort, k => { Stu.sort = nextSort(Stu.sort, k, ['code', 'note']); Stu.page = 1; paintList(); })
        : h('div', { class: 'card empty' }, h('p', { class: 'muted', text: total ? 'Không có mã nào khớp bộ lọc.' : 'Chưa có mã học sinh nào. Bấm “＋ Tạo mã” để tạo.' })),
      pages > 1 ? pager(Stu.page, pages, p => { Stu.page = p; paintList(); }) : null);
  }
  function rowActions(r) {
    const b = Stu.busy.has(r.code);
    return h('div', { class: 'row wrap t-acts' },
      h('button', { type: 'button', class: 'btn small', disabled: b || !r.active, 'aria-label': 'Cộng hoặc trừ điểm cho ' + r.code, onclick: () => openAdjust(r.code) }, '± Điểm'),
      h('button', { type: 'button', class: 'btn small', 'aria-label': 'Đặt mật khẩu cho ' + r.code, onclick: () => openPassword(r.code) }, '🔑'),
      h('button', { type: 'button', class: 'btn small', 'aria-label': 'Xem sổ điểm của ' + r.code, onclick: () => openLedger(r.code) }, '📒 Sổ'),
      h('button', { type: 'button', class: 'btn small', 'aria-label': 'Sao chép link của ' + r.code, onclick: async () => toast(await copyAny(studentLink(r.code)) ? 'Đã sao chép link của ' + r.code + '.' : 'Không sao chép được.', 'info') }, '🔗'),
      r.active ? h('button', { type: 'button', class: 'btn small danger', disabled: b, 'aria-label': 'Xóa mã ' + r.code, onclick: () => toggleActive(r.code, false) }, '🗑 Xóa')
        : h('button', { type: 'button', class: 'btn small', disabled: b, 'aria-label': 'Khôi phục mã ' + r.code, onclick: () => toggleActive(r.code, true) }, '↩ Khôi phục'));
  }
  function paint() {
    const rd = TA.ready();
    if (rd !== shownReady) { shownReady = rd; paintTop(); }
    paintList();
  }
  liveView(Stu.subs, root, paint);
  paint();
  if (TA.ready() && (!Stu.rows || Date.now() - Stu.at > 60000)) Stu.load();     // lần đầu / dữ liệu cũ hơn 1 phút: tải ngầm (vẫn hiện bản cũ trong lúc chờ)
  return root;
}

async function toggleActive(code, active) {
  const ok = await Modal.confirm(active
    ? `Khôi phục mã ${code}? Học sinh sẽ đăng nhập, nộp bài và chơi game lại được.`
    : `Xóa mã ${code}? Học sinh sẽ không đăng nhập, nộp bài hay chơi game được nữa. Điểm và sổ điểm vẫn được giữ, bạn có thể khôi phục sau.`, active ? 'Khôi phục' : 'Xóa mã', !active);
  if (!ok || Stu.busy.has(code)) return;
  Stu.busy.add(code); Stu.notify();
  try {
    await TA.call(active ? 'restoreCode' : 'deleteCode', { code });
    const r = Stu.row(code); if (r) { r.active = active; r.st = active ? 1 : 0; }
    toast(active ? `Đã khôi phục mã ${code}.` : `Đã xóa mã ${code}.`, 'info', active ? null : { label: 'Hoàn tác', onClick: () => toggleActive(code, true) });
  } catch (e) { toast(`Không ${active ? 'khôi phục' : 'xóa'} được mã ${code}: ${e.message}`, 'error'); }
  finally { Stu.busy.delete(code); Stu.notify(); }
}

/* ---------- Mật khẩu học sinh (giáo viên đặt tự do; ô trống = không cần mật khẩu) ---------- */
const randPw = () => { const b = new Uint8Array(4); (crypto || {}).getRandomValues ? crypto.getRandomValues(b) : b.forEach((_, i) => { b[i] = Math.random() * 256; }); return Array.from(b, x => x % 10).join(''); };
async function savePasswords(items) {
  const r = await TA.call('setPasswords', { items }, { ms: 45000 });
  const pws = r.passwords || {};
  Object.keys(pws).forEach(c => { const row = Stu.row(c); if (row) row.password = String(pws[c]); });
  Stu.notify(); return r;
}
function openPassword(code) {
  const r0 = Stu.row(code) || { password: '' };
  const pw = h('input', { type: 'text', id: 'pw-one', maxlength: 32, value: r0.password || '', autocomplete: 'off', spellcheck: 'false', autocapitalize: 'off', class: 't-codes', placeholder: 'Ví dụ: 1234 hoặc an@2015' });
  const err = h('div', { role: 'alert' }), go = h('button', { class: 'btn primary', type: 'submit' }, 'Lưu mật khẩu');
  const d = Modal.open('Mật khẩu – ' + code, h('form', { class: 'stack', novalidate: true, onsubmit: async e => {
    e.preventDefault();
    const v = pw.value.trim();
    if (!v && r0.password && !await Modal.confirm(`Bỏ mật khẩu của ${code}? Ai biết mã cũng vào được trang học sinh và làm bài.`, 'Bỏ mật khẩu', true)) return;
    go.disabled = true; err.replaceChildren(loading('Đang lưu…'));
    try { await savePasswords([{ code, password: v }]); d.close(); toast(v ? `Đã đặt mật khẩu cho ${code}.` : `Đã bỏ mật khẩu của ${code}.`); }
    catch (ex) { go.disabled = false; err.replaceChildren(h('p', { class: 'err', text: ex.message })); }
  } },
    h('p', null, 'Học sinh: ', h('strong', { class: 't-code', text: code })),
    h('label', { for: 'pw-one', text: 'Mật khẩu (tối đa 32 ký tự, phân biệt hoa / thường)' }), pw,
    h('div', { class: 'row wrap' }, h('button', { type: 'button', class: 'btn small', onclick: () => { pw.value = randPw(); pw.focus(); } }, '🎲 Tạo ngẫu nhiên 4 số'),
      h('button', { type: 'button', class: 'btn small', onclick: () => { pw.value = ''; pw.focus(); } }, 'Xóa trắng')),
    h('p', { class: 'hint', text: 'Học sinh dùng mã + mật khẩu này để vào trang học sinh và làm bài được giao. Đổi mật khẩu thì các máy đang đăng nhập phải nhập lại. Để trống = không cần mật khẩu.' }),
    err, h('div', { class: 'row end' }, h('button', { type: 'button', class: 'btn', onclick: () => d.close() }, 'Hủy'), go)));
  pw.focus(); pw.select();
}
function openBulkPw(rows) {
  if (!rows.length) return toast('Không có mã nào (đang lọc) để đặt mật khẩu.', 'error');
  const ta = h('textarea', { id: 'pw-bulk', rows: 8, class: 't-codes', spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off', placeholder: 'AN123 | 1234\nHOA07 | hoa@07' });
  ta.value = rows.map(r => r.code + ' | ' + (r.password || '')).join('\n');
  const info = h('p', { class: 'hint', 'aria-live': 'polite' }), err = h('div', { role: 'alert' }), go = h('button', { class: 'btn primary', type: 'submit' }, 'Lưu tất cả');
  const parse = () => {
    const out = [], seen = new Set(); let bad = 0;
    ta.value.split(/\r?\n/).forEach(l => { if (!l.trim()) return; const i = l.search(/[|\t,;]/), c = normCode(i < 0 ? l : l.slice(0, i)), p = i < 0 ? '' : l.slice(i + 1).trim().slice(0, 32);
      if (c.length < 3) { bad++; return; } if (seen.has(c)) return; seen.add(c); out.push({ code: c, password: p }); });
    return { out, bad };
  };
  const count = () => { const p = parse(), set = p.out.filter(x => x.password).length; info.textContent = `${p.out.length} mã · ${set} có mật khẩu · ${p.out.length - set} để trống (= không cần mật khẩu)` + (p.bad ? ` · ${p.bad} dòng lỗi bị bỏ qua` : ''); };
  ta.addEventListener('input', count);
  const fill = all => { ta.value = parse().out.map(x => x.code + ' | ' + (all || !x.password ? randPw() : x.password)).join('\n'); count(); };
  const d = Modal.open('Đặt mật khẩu hàng loạt', h('form', { class: 'stack', novalidate: true, onsubmit: async e => {
    e.preventDefault();
    const p = parse(); if (!p.out.length) return err.replaceChildren(h('p', { class: 'err', text: 'Chưa có dòng hợp lệ nào.' }));
    const empty = p.out.filter(x => !x.password && (Stu.row(x.code) || {}).password).length;
    if (empty && !await Modal.confirm(`${empty} mã đang có mật khẩu sẽ bị BỎ mật khẩu (dòng để trống). Tiếp tục?`, 'Tiếp tục', true)) return;
    go.disabled = true; err.replaceChildren(loading('Đang lưu…'));
    try {
      const r = await savePasswords(p.out); d.close();
      toast(`Đã cập nhật mật khẩu cho ${r.updated} mã.` + (r.missing && r.missing.length ? ` Không tìm thấy: ${r.missing.slice(0, 5).join(', ')}${r.missing.length > 5 ? '…' : ''}` : ''));
    } catch (ex) { go.disabled = false; err.replaceChildren(h('p', { class: 'err', text: ex.message })); }
  } },
    h('label', { for: 'pw-bulk', text: 'Mỗi dòng: MÃ | mật khẩu' }), ta, info,
    h('div', { class: 'row wrap' },
      h('button', { type: 'button', class: 'btn small', onclick: () => fill(false) }, '🎲 Tạo 4 số cho mã chưa có'),
      h('button', { type: 'button', class: 'btn small', onclick: () => fill(true) }, '🎲 Tạo mới cho tất cả')),
    h('p', { class: 'hint', text: 'Sửa trực tiếp trong ô, có thể dán từ Excel (cột mã và cột mật khẩu). Dòng để trống mật khẩu = mã đó không cần mật khẩu. Sau khi lưu, bấm “🖨 In thẻ mã” để in thẻ có cả mật khẩu.' }),
    err, h('div', { class: 'row end' }, h('button', { type: 'button', class: 'btn', onclick: () => d.close() }, 'Hủy'), go)));
  count(); ta.focus();
}

/* ---------- Phụ huynh: mã + mật khẩu do giáo viên đặt, mỗi phụ huynh gắn với một hoặc nhiều mã học sinh (con) ---------- */
const parentBase = () => new URL('phu-huynh.html', location.href).href;
const parentLink = code => parentBase() + '?code=' + encodeURIComponent(code);
const Par = {
  rows: null, loading: false, err: '', at: 0, q: '', subs: new Set(),
  notify() { Array.from(this.subs).forEach(f => f()); },
  set(list) {
    this.rows = (Array.isArray(list) ? list : []).filter(x => x && x.code).map(x => ({ code: String(x.code), password: String(x.password == null ? '' : x.password), name: String(x.name || ''),
      children: Array.isArray(x.children) ? x.children.map(String) : splitCodes(x.children), note: String(x.note || ''), active: !(x.active === false || /^(false|0)$/i.test(String(x.active))), lastActive: tsOf(x.lastActive), createdAt: tsOf(x.createdAt) }));
    this.at = Date.now(); this.err = '';
  },
  async load() {
    if (this.loading || !TA.ready()) return;
    this.loading = true; this.err = ''; this.notify();
    try { const r = await TA.call('listParents', {}, { retry: true }); this.set(r.parents); }
    catch (e) { this.err = e.message; }
    finally { this.loading = false; this.notify(); }
  }
};
function ParentsPanel() {
  teacherCss();
  const root = h('div', { class: 't-panel stack' }), top = h('div', { class: 'stack' }), list = h('div', { class: 'stack' });
  root.append(top, list);
  let shownReady = null, timer = null;
  const noteOf = c => { const r = Stu.row(c); return r && r.note ? r.note : ''; };
  const qIn = h('input', { type: 'search', placeholder: '🔍 Tìm theo mã, tên phụ huynh, mã con…', value: Par.q, autocomplete: 'off', 'aria-label': 'Tìm phụ huynh',
    oninput: () => { clearTimeout(timer); timer = setTimeout(() => { Par.q = qIn.value; paintList(); }, 150); } });
  const view = () => { const q = fold(Par.q.trim()); return (Par.rows || []).filter(r => !q || fold([r.code, r.name, r.note, r.children.join(' '), r.children.map(noteOf).join(' ')].join(' ')).includes(q)).sort((a, b) => a.name.localeCompare(b.name, 'vi') || a.code.localeCompare(b.code)); };
  function paintTop() {
    if (!TA.ready()) { top.replaceChildren(h('h2', { text: 'Phụ huynh' }), h('p', { class: 'muted', text: 'Nhập Teacher Key để tạo tài khoản phụ huynh.' }), teacherKeyBox()); return; }
    const verBox = h('div');
    checkServerVer(12).then(okV => { if (okV === false) verBox.replaceChildren(h('div', { class: 'box warn', role: 'alert' },
      h('p', { text: '⚠ Apps Script đang chạy bản cũ nên trang phụ huynh có thể chưa tách đúng bài giao riêng / bài giao chung.' }),
      h('p', { text: 'Cách sửa: dán Code.gs mới vào Apps Script → Deploy → Manage deployments → ✎ → Version: New version → Deploy.' }))); });
    const linkIn = h('input', { type: 'text', id: 'par-link', readonly: true, value: parentBase(), 'aria-label': 'Link trang phụ huynh', onfocus: e => e.target.select() });
    top.replaceChildren(
      h('section', { class: 'card stack' },
        h('div', { class: 'row wrap', style: 'justify-content:space-between;align-items:center' }, h('h2', { text: 'Phụ huynh' }), keyState()),
        h('label', { for: 'par-link', text: 'Link trang phụ huynh' }),
        h('div', { class: 't-copy' }, linkIn, h('button', { type: 'button', class: 'btn', onclick: async () => toast(await copyText(linkIn.value, linkIn) ? 'Đã sao chép link trang phụ huynh.' : 'Không sao chép được.') }, '📋 Sao chép')),
        h('p', { class: 'hint', text: 'Phụ huynh đăng nhập MỘT lần bằng mã + mật khẩu và xem được tất cả các con. Trang phụ huynh CHỈ hiện bài giao riêng (bài có chọn mã học sinh); bài giao cho tất cả học sinh là bài tự chọn, phụ huynh không thấy. Một phụ huynh gắn được tối đa 20 mã học sinh.' }), verBox),
      h('div', { class: 't-bar' }, qIn,
        h('button', { type: 'button', class: 'btn', onclick: () => Par.load() }, '↻ Tải lại'),
        h('button', { type: 'button', class: 'btn primary', onclick: () => openParent(null) }, '＋ Thêm phụ huynh'),
        h('button', { type: 'button', class: 'btn', onclick: () => exportParentsCsv(view()) }, '⬇ Tải CSV')));
  }
  function paintList() {
    if (!TA.ready()) return list.replaceChildren();
    if (!Par.rows) {
      if (Par.loading) return list.replaceChildren(loading('Đang tải danh sách phụ huynh…'));
      return list.replaceChildren(h('div', { class: 'box error', role: 'alert' }, h('p', { text: Par.err || 'Chưa tải được danh sách.' }), h('button', { type: 'button', class: 'btn', onclick: () => Par.load() }, '↻ Thử lại')));
    }
    const all = view();
    const kids = r => h('div', { class: 'stack', style: 'gap:.1rem;min-width:9rem' }, r.children.length ? r.children.map(c => h('div', null, h('span', { class: 't-code', text: c }), noteOf(c) ? h('span', { class: 'muted small-text', text: ' · ' + noteOf(c) }) : null, Stu.rows && !Stu.row(c) ? h('span', { class: 'err small-text', text: ' (mã không tồn tại)' }) : null)) : h('span', { class: 'muted', text: '—' }));
    const cols = [
      { nosort: true, k: 'code', label: 'Mã PH', el: r => h('span', { class: 't-code' + (r.active ? '' : ' t-dim'), text: r.code }) },
      { nosort: true, k: 'password', label: 'Mật khẩu', el: r => h('span', { class: 't-code', text: r.password }) },
      { nosort: true, k: 'name', label: 'Phụ huynh', el: r => h('span', { class: 't-note', text: (r.name || '—') + (r.active ? '' : ' (đã khóa)') }) },
      { k: 'children', label: 'Các con', nosort: true, el: kids },
      { nosort: true, k: 'lastActive', label: 'Đăng nhập cuối', get: r => r.lastActive ? fmtDate(r.lastActive) : '—' },
      { k: 'act', label: 'Thao tác', nosort: true, el: r => h('div', { class: 'row wrap t-acts' },
        h('button', { type: 'button', class: 'btn small', 'aria-label': 'Sửa ' + r.code, onclick: () => openParent(r) }, '✏️ Sửa'),
        h('button', { type: 'button', class: 'btn small', 'aria-label': 'Sao chép link + mật khẩu của ' + r.code, onclick: async () => toast(await copyAny(parentInvite(r)) ? 'Đã sao chép lời mời (link + mã + mật khẩu).' : 'Không sao chép được.', 'info') }, '🔗 Lời mời'),
        h('button', { type: 'button', class: 'btn small danger', 'aria-label': 'Xóa ' + r.code, onclick: () => removeParent(r) }, '🗑')) }];
    list.replaceChildren(
      h('p', { class: 'muted small-text', role: 'status', text: `${nfmt(Par.rows.length)} phụ huynh · đang hiển thị ${nfmt(all.length)}` + (Par.loading ? ' · đang cập nhật…' : '') }),
      Par.err ? h('div', { class: 'box warn', role: 'alert', text: 'Không cập nhật được: ' + Par.err }) : null,
      all.length ? sortTable('Danh sách phụ huynh', cols, all, { key: '', dir: 1 }, () => {})
        : h('div', { class: 'card empty' }, h('p', { class: 'muted', text: Par.rows.length ? 'Không có phụ huynh nào khớp.' : 'Chưa có tài khoản phụ huynh. Bấm “＋ Thêm phụ huynh”.' })));
  }
  function paint() { const rd = TA.ready(); if (rd !== shownReady) { shownReady = rd; paintTop(); } paintList(); }
  liveView(Par.subs, root, paint); liveView(Stu.subs, root, paintList);
  paint();
  if (TA.ready() && (!Par.rows || Date.now() - Par.at > 60000)) Par.load();
  if (TA.ready() && !Stu.rows) Stu.load();                     // để hiện tên con (ghi chú của mã học sinh)
  return root;
}
/** Apps Script đã cập nhật tới phiên bản need chưa (ping → v). Lỗi mạng → null (không cảnh báo). */
let _srvVer = null;
async function checkServerVer(need) {
  try { if (_srvVer == null) { const r = await API.get(Settings.data.scriptUrl, { action: 'ping' }); _srvVer = Number(r && r.v) || 0; } return _srvVer >= need; }
  catch (_) { return null; }
}
const parentInvite = r => `Kính gửi phụ huynh${r.name ? ' ' + r.name : ''},\nTheo dõi việc học của con tại: ${parentLink(r.code)}\nMã phụ huynh: ${r.code}\nMật khẩu: ${r.password}\n– Nhà Thầy Hưng`;
function exportParentsCsv(rows) {
  if (!rows.length) return toast('Không có phụ huynh nào để xuất.', 'error');
  download('phu-huynh-' + dayStamp() + '.csv', csvText([['Mã phụ huynh', 'Mật khẩu', 'Tên phụ huynh', 'Mã các con', 'Ghi chú', 'Trạng thái', 'Link']].concat(rows.map(r =>
    [r.code, r.password, r.name, r.children.join(' '), r.note, r.active ? 'Hoạt động' : 'Đã khóa', parentLink(r.code)]))), 'text/csv;charset=utf-8');
  toast(`Đã tải CSV (${rows.length} phụ huynh).`);
}
async function removeParent(r) {
  if (!await Modal.confirm(`Xóa tài khoản phụ huynh ${r.code}${r.name ? ' (' + r.name + ')' : ''}? Phụ huynh sẽ không xem được nữa. Dữ liệu học tập của học sinh KHÔNG bị ảnh hưởng.`, 'Xóa', true)) return;
  try { await TA.call('deleteParent', { code: r.code }); Par.rows = (Par.rows || []).filter(x => x.code !== r.code); Par.notify(); toast('Đã xóa ' + r.code + '.'); }
  catch (e) { toast('Không xóa được: ' + e.message, 'error'); }
}
function openParent(r0) {
  const edit = !!r0;
  const code = h('input', { type: 'text', id: 'pa-code', maxlength: 16, value: edit ? r0.code : '', readonly: edit, class: 't-codes', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', placeholder: 'Ví dụ: PHAN01',
    oninput: () => { const v = normCode(code.value); if (v !== code.value) code.value = v; } });
  const pw = h('input', { type: 'text', id: 'pa-pw', maxlength: 32, value: edit ? r0.password : randPw(), class: 't-codes', autocomplete: 'off', spellcheck: 'false', autocapitalize: 'off' });
  const name = h('input', { type: 'text', id: 'pa-name', maxlength: 80, value: edit ? r0.name : '', autocomplete: 'off', placeholder: 'Ví dụ: Chị Lan (mẹ bé An, bé Bình)' });
  const note = h('input', { type: 'text', id: 'pa-note', maxlength: 150, value: edit ? r0.note : '', autocomplete: 'off', placeholder: 'Ghi chú riêng của giáo viên (phụ huynh không thấy)' });
  const active = h('input', { type: 'checkbox', id: 'pa-act', checked: edit ? r0.active : true });
  const kids = h('textarea', { id: 'pa-kids', rows: 3, class: 't-codes', spellcheck: 'false', autocapitalize: 'characters', autocomplete: 'off', placeholder: 'Mã học sinh của các con, mỗi mã một dòng (vd: AN123)' });
  kids.value = edit ? r0.children.join('\n') : '';
  const kInfo = h('p', { class: 'hint', 'aria-live': 'polite' });
  const filter = h('input', { type: 'search', placeholder: 'Lọc mã / tên học sinh', 'aria-label': 'Lọc danh sách học sinh', style: 'width:100%' });
  const pick = h('div', { class: 'stack', style: 'max-height:200px;overflow:auto;gap:.1rem' });
  const sel = () => new Set(splitCodes(kids.value));
  function drawPick() {
    if (!Stu.rows) { pick.replaceChildren(h('p', { class: 'muted small-text', text: Stu.loading ? 'Đang tải danh sách học sinh…' : 'Chưa tải danh sách học sinh.' })); return; }
    const f = fold(filter.value.trim()), S = sel();
    const rows = Stu.rows.filter(r => r.active && (!f || fold(r.code + ' ' + r.note).includes(f))).slice(0, 300);
    pick.replaceChildren(...(rows.length ? rows.map(r => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: S.has(r.code), onchange: e => { const s2 = sel(); e.target.checked ? s2.add(r.code) : s2.delete(r.code); kids.value = [...s2].join('\n'); count(); } }),
      h('strong', { text: r.code }), r.note ? h('span', { class: 'muted', text: ' · ' + r.note }) : null)) : [h('p', { class: 'muted small-text', text: 'Không có mã nào khớp.' })]));
  }
  function count() {
    const L = splitCodes(kids.value), bad = Stu.rows ? L.filter(c => !Stu.row(c)) : [];
    kInfo.className = 'hint' + (bad.length || L.length > 20 ? ' err' : '');
    kInfo.textContent = `${L.length} con` + (L.length > 20 ? ' – tối đa 20' : '') + (bad.length ? ` · không tìm thấy mã: ${bad.join(', ')}` : '');
  }
  kids.addEventListener('input', () => { count(); drawPick(); }); filter.addEventListener('input', drawPick);
  const err = h('div', { role: 'alert' }), go = h('button', { class: 'btn primary', type: 'submit' }, edit ? 'Lưu' : 'Tạo tài khoản');
  const d = Modal.open(edit ? 'Sửa phụ huynh – ' + r0.code : 'Thêm phụ huynh', h('form', { class: 'stack', novalidate: true, onsubmit: async e => {
    e.preventDefault();
    const c = normCode(code.value), p = pw.value.trim(), L = splitCodes(kids.value);
    if (c.length < 3) return err.replaceChildren(h('p', { class: 'err', text: 'Mã phụ huynh gồm 3–16 chữ hoặc số.' }));
    if (!p) return err.replaceChildren(h('p', { class: 'err', text: 'Hãy đặt mật khẩu cho phụ huynh.' }));
    if (!L.length) return err.replaceChildren(h('p', { class: 'err', text: 'Hãy chọn ít nhất một mã học sinh (con).' }));
    if (L.length > 20) return err.replaceChildren(h('p', { class: 'err', text: 'Mỗi phụ huynh tối đa 20 mã học sinh.' }));
    if (!edit && Stu.row(c)) return err.replaceChildren(h('p', { class: 'err', text: 'Mã này đang là mã học sinh. Hãy chọn mã khác cho phụ huynh (vd: thêm chữ PH).' }));
    go.disabled = true; err.replaceChildren(loading('Đang lưu…'));
    try {
      const r = await TA.call('saveParent', { code: c, password: p, name: name.value.trim(), note: note.value.trim(), children: L, active: active.checked, create: !edit });
      d.close(); Par.load();
      toast(edit ? 'Đã lưu ' + c + '.' : 'Đã tạo tài khoản phụ huynh ' + c + '.', 'info', { label: '📋 Copy lời mời', onClick: async () => toast(await copyAny(parentInvite(r.parent || { code: c, password: p, name: name.value.trim() })) ? 'Đã sao chép lời mời.' : 'Không sao chép được.') });
    } catch (ex) { go.disabled = false; err.replaceChildren(h('p', { class: 'err', text: ex.message })); }
  } },
    h('label', { for: 'pa-code', text: 'Mã phụ huynh' + (edit ? ' (không đổi được)' : '') }), code,
    h('label', { for: 'pa-pw', text: 'Mật khẩu (tự đặt, tối đa 32 ký tự)' }), h('div', { class: 'pw-row' }, pw, h('button', { type: 'button', class: 'btn', 'aria-label': 'Tạo mật khẩu ngẫu nhiên', onclick: () => { pw.value = randPw(); } }, '🎲')),
    h('label', { for: 'pa-name', text: 'Tên phụ huynh (hiện khi phụ huynh đăng nhập)' }), name,
    h('label', { for: 'pa-kids', text: 'Các con (mã học sinh)' }), kids, kInfo,
    h('details', { open: !edit }, h('summary', { text: '👥 Chọn từ danh sách học sinh' }), h('div', { class: 'stack' }, filter, pick)),
    h('label', { for: 'pa-note', text: 'Ghi chú' }), note,
    h('label', { class: 'check', for: 'pa-act' }, active, 'Cho phép đăng nhập'),
    err, h('div', { class: 'row end' }, h('button', { type: 'button', class: 'btn', onclick: () => d.close() }, 'Hủy'), go)));
  count(); drawPick();
  if (!Stu.rows && TA.ready()) Stu.load().then(() => { if (d.isConnected) { count(); drawPick(); } });
  (edit ? pw : code).focus();
}

function exportStudentsCsv(rows) {
  if (!rows.length) return toast('Không có mã nào để xuất.', 'error');
  const data = [['Mã', 'Mật khẩu', 'Số dư', 'Tổng điểm', 'Hoạt động cuối', 'Ghi chú', 'Trạng thái', 'Link']].concat(rows.map(r =>
    [r.code, r.password, r.balance, r.totalEarned, r.lastActive ? new Date(r.lastActive).toISOString() : '', r.note, r.active ? 'Hoạt động' : 'Đã xóa', studentLink(r.code)]));
  download('hoc-sinh-' + dayStamp() + '.csv', csvText(data), 'text/csv;charset=utf-8');
  toast(`Đã tải CSV (${rows.length} mã).`);
}

/* ---------- Tạo mã ---------- */
function openCreateCodes() {
  const mode = h('select', { id: 'cc-mode', 'aria-label': 'Cách tạo mã', onchange: () => paintMode() },
    h('option', { value: 'rand' }, '🎲 Tạo ngẫu nhiên'), h('option', { value: 'own' }, '✍️ Tự đặt mã'));
  const count = h('input', { type: 'number', id: 'cc-n', min: 1, max: 200, step: 1, value: 10, inputmode: 'numeric' });
  const prefix = h('input', { type: 'text', id: 'cc-p', maxlength: 3, placeholder: 'Tùy chọn, vd: 6A', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false',
    oninput: () => { prefix.value = Array.from(prefix.value.toUpperCase()).filter(c => CODE_ALPHABET.includes(c)).join('').slice(0, 3); } });
  const list = h('textarea', { id: 'cc-list', rows: 6, class: 't-codes', autocomplete: 'off', spellcheck: 'false', autocapitalize: 'off',
    placeholder: 'AN123\nBinh2015 | Nguyễn Văn Bình | 2468\nHoa07 | Lớp 6A | hoa@07', oninput: () => paintOwn() });
  const ownHint = h('p', { class: 'hint', 'aria-live': 'polite' });
  const note = h('input', { type: 'text', id: 'cc-note', maxlength: 100, placeholder: 'Vd: Lớp 6A – học kỳ 1', autocomplete: 'off' });
  const rpw = h('input', { type: 'checkbox', id: 'cc-rpw', checked: true });
  const err = h('div', { role: 'alert', 'aria-live': 'polite' });
  const go = h('button', { class: 'btn primary', type: 'submit' }, 'Tạo mã');
  const body = h('div', { class: 'stack' });
  const randBox = h('div', { class: 'stack' },
    h('label', { for: 'cc-n', text: 'Số lượng mã (1–200)' }), count,
    h('label', { for: 'cc-p', text: 'Tiền tố (tối đa 3 ký tự)' }), prefix,
    h('p', { class: 'hint', text: 'Mã gồm 6 ký tự (chữ A–Z trừ I, L, O và số 2–9). Tiền tố chiếm các ký tự đầu, phần còn lại ngẫu nhiên.' }));
  const ownBox = h('div', { class: 'stack' },
    h('label', { for: 'cc-list', text: 'Danh sách mã (mỗi dòng một mã, tối đa 200)' }), list,
    h('p', { class: 'hint', text: 'Ghi mã thế nào cũng được: hệ thống tự bỏ dấu, bỏ khoảng trắng/ký tự đặc biệt và viết hoa (“Bé An 7” → BEAN7). Mã dài 3–16 chữ hoặc số. Cấu trúc mỗi dòng: MÃ | ghi chú | mật khẩu (ghi chú và mật khẩu không bắt buộc, vd: AN123 | Nguyễn Văn An | 1234). Mật khẩu đặt tự do, tối đa 32 ký tự, phân biệt hoa / thường.' }), ownHint);
  const d = Modal.open('Tạo mã học sinh', body);
  const fold = v => String(v == null ? '' : v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').toUpperCase().replace(/[^A-Z0-9]/g, '');
  /** Đọc danh sách tự đặt → { items (đã bỏ trùng), bad (mã sai độ dài), dup (số dòng trùng trong danh sách) } */
  function parseOwn() {
    const seen = new Set(), items = [], bad = []; let dup = 0;
    list.value.split(/\r?\n|;/).forEach(line => {
      line = line.trim(); if (!line) return;
      const parts = line.split(/[|\t]/), raw = parts[0], nt = (parts[1] || '').trim().slice(0, 100), pw = (parts[2] || '').trim().slice(0, 32), c = fold(raw);
      if (c.length < 3 || c.length > 16) return bad.push(raw.trim().slice(0, 30) || '(trống)');
      if (seen.has(c)) return dup++;
      seen.add(c); items.push(nt || pw ? Object.assign({ code: c }, nt ? { note: nt } : null, pw ? { password: pw } : null) : c);
    });
    return { items, bad, dup };
  }
  function paintOwn() {
    const p = parseOwn();
    ownHint.className = 'hint' + (p.bad.length ? ' err' : '');
    ownHint.textContent = `${p.items.length} mã hợp lệ` + (p.dup ? ` · bỏ ${p.dup} dòng trùng` : '') + (p.bad.length ? ` · ${p.bad.length} dòng sai độ dài (3–16 ký tự): ${p.bad.slice(0, 3).join(', ')}${p.bad.length > 3 ? '…' : ''}` : '');
  }
  function paintMode() {
    const own = mode.value === 'own';
    randBox.style.display = own ? 'none' : ''; ownBox.style.display = own ? '' : 'none';
    err.replaceChildren(); if (own) paintOwn();
  }
  async function submit(e) {
    e.preventDefault();
    const own = mode.value === 'own', noteV = note.value.trim().slice(0, 100);
    let n = parseInt(count.value, 10), items = null;
    if (own) {
      const p = parseOwn();
      if (!p.items.length) return err.replaceChildren(h('p', { class: 'err', text: 'Chưa có mã hợp lệ nào. Mỗi dòng một mã, dài 3–16 chữ hoặc số.' }));
      if (p.items.length > 200) return err.replaceChildren(h('p', { class: 'err', text: 'Mỗi lần tối đa 200 mã. Hãy chia thành nhiều đợt.' }));
      if (p.bad.length && !await Modal.confirm(`Có ${p.bad.length} dòng sai độ dài sẽ bị bỏ qua. Vẫn tạo ${p.items.length} mã hợp lệ?`, 'Vẫn tạo')) return;
      items = p.items; n = items.length;
    } else if (!(n >= 1 && n <= 200)) return err.replaceChildren(h('p', { class: 'err', text: 'Số lượng phải từ 1 đến 200.' }));
    go.disabled = true; err.replaceChildren(loading('Đang tạo mã…'));
    try {
      const r = own ? await TA.call('createCodes', { codes: items, note: noteV, randomPw: rpw.checked }, { ms: 45000 })
        : await TA.call('createCodes', { count: n, prefix: prefix.value.trim(), note: noteV, randomPw: rpw.checked }, { ms: 45000 });
      if (own && r.custom !== true) throw Object.assign(new Error('Apps Script chưa có tính năng tự đặt mã. Hãy dán lại Code.gs mới rồi Deploy → Manage deployments → New version. (Máy chủ cũ có thể đã tạo nhầm 1 mã ngẫu nhiên – hãy kiểm tra trong danh sách.)'), { code: 'stale' });
      showResult(r, n, noteV); Stu.page = 1; Stu.load();
    } catch (ex) {
      go.disabled = false;
      err.replaceChildren(h('p', { class: 'err', text: ex.message }), ex.code ? null : h('p', { class: 'hint', text: 'Nếu mạng chập chờn, mã có thể đã được tạo: bấm “↻ Tải lại” ở danh sách để kiểm tra trước khi tạo lại.' }));
    }
  }
  function showResult(r, requested, noteV) {
    const codes = (Array.isArray(r.codes) ? r.codes : []).map(String), exist = (Array.isArray(r.existing) ? r.existing : []).map(String), inval = (Array.isArray(r.invalid) ? r.invalid : []).map(String);
    const pws = (r.passwords && typeof r.passwords === 'object') ? r.passwords : {}, pwOf = c => String(pws[c] == null ? '' : pws[c]);
    const ta = h('textarea', { readonly: true, class: 't-codes', rows: Math.min(10, codes.length + 1), 'aria-label': 'Danh sách mã vừa tạo', onfocus: e => e.target.select() });
    ta.value = codes.map(c => pwOf(c) ? c + ' | mật khẩu: ' + pwOf(c) : c).join('\n');
    const created = Number(r.created); const made = isFinite(created) ? created : codes.length;
    body.replaceChildren(
      h('p', { class: made >= requested ? 'ok' : 'err', role: 'status', text: made >= requested ? `✓ Đã tạo ${made} mã.` : `Chỉ tạo được ${made}/${requested} mã.` }),
      exist.length ? h('p', { class: 'err', text: `Đã tồn tại từ trước (không tạo lại): ${exist.join(', ')}. Nếu mã bị xóa, hãy lọc “Đã xóa” và bấm Khôi phục.` }) : null,
      inval.length ? h('p', { class: 'err', text: `Bỏ qua vì sai độ dài (3–16 ký tự): ${inval.join(', ')}` }) : null,
      made ? h('p', { class: 'hint', text: 'Hãy lưu hoặc in danh sách này – mã cũng luôn xem lại được trong bảng học sinh.' }) : null, made ? ta : null,
      h('div', { class: 'row wrap' },
        made ? h('button', { type: 'button', class: 'btn primary', onclick: async () => toast(await copyText(ta.value, ta) ? 'Đã sao chép danh sách mã.' : 'Không sao chép được – hãy chọn và copy thủ công.') }, '📋 Sao chép') : null,
        made ? h('button', { type: 'button', class: 'btn', onclick: () => { download('ma-hoc-sinh-' + dayStamp() + '.csv', csvText([['Mã', 'Mật khẩu', 'Ghi chú', 'Link']].concat(codes.map(c => [c, pwOf(c), noteV, studentLink(c)]))), 'text/csv;charset=utf-8'); toast('Đã tải CSV.'); } }, '⬇ Tải CSV') : null,
        made ? h('button', { type: 'button', class: 'btn', onclick: e => printCards(codes.map(c => ({ code: c, note: noteV, password: pwOf(c) })), e.currentTarget) }, '🖨 In thẻ mã') : null,
        h('button', { type: 'button', class: 'btn', onclick: () => d.close() }, 'Đóng')));
  }
  body.replaceChildren(h('form', { class: 'stack', onsubmit: submit, novalidate: true },
    h('label', { for: 'cc-mode', text: 'Cách tạo' }), mode, randBox, ownBox,
    h('label', { for: 'cc-note', text: 'Ghi chú (tùy chọn, áp dụng cho cả đợt)' }), note,
    h('label', { class: 'check', for: 'cc-rpw' }, rpw, 'Tự tạo mật khẩu 4 chữ số cho mã chưa ghi mật khẩu'),
    h('p', { class: 'hint', text: 'Học sinh cần mã + mật khẩu để vào trang học sinh và làm bài được giao. Bỏ tích thì mã không cần mật khẩu (có thể đặt sau bằng nút 🔑).' }), err,
    h('div', { class: 'row end' }, h('button', { type: 'button', class: 'btn', onclick: () => d.close() }, 'Hủy'), go)));
  paintMode(); count.focus();
}

/* ---------- In thẻ mã (mỗi thẻ có QR → hoc-sinh.html?code=…) ---------- */
function qrDataUrl(text) {
  const opts = { width: 300, margin: 1, errorCorrectionLevel: 'M' };
  return new Promise((res, rej) => {
    if (typeof QRCode.toDataURL === 'function') QRCode.toDataURL(text, opts, (err, url) => err ? rej(err) : res(url));
    else { const c = document.createElement('canvas'); QRCode.toCanvas(c, text, opts, err => err ? rej(err) : res(c.toDataURL('image/png'))); }
  });
}
async function printCards(items, btn) {
  teacherCss();
  if (!items.length) return toast('Không có mã nào để in.', 'error');
  if (items.length > 300) return toast('Mỗi lần chỉ in tối đa 300 thẻ. Hãy lọc bớt danh sách.', 'error');
  if (!window.QRCode) return toast('Thư viện QR chưa tải được – hãy kiểm tra mạng rồi tải lại trang.', 'error');
  const old = btn && btn.textContent; if (btn) { btn.disabled = true; btn.textContent = '⏳ Đang tạo QR…'; }
  try {
    const wrap = h('div', { id: 'sm-print', 'aria-hidden': 'true' });
    for (let i = 0; i < items.length; i++) {
      const it = items[i], url = await qrDataUrl(studentLink(it.code));
      wrap.append(h('div', { class: 'pc-card' }, h('div', { class: 'pc-app', text: '🏠 Nhà Thầy Hưng' }), h('img', { src: url, alt: 'Mã QR của ' + it.code }),
        h('div', { class: 'pc-code', text: it.code }), it.password ? h('div', { class: 'pc-pw', text: 'Mật khẩu: ' + it.password }) : null,
        h('div', { class: 'pc-note', text: it.note || '' }), h('div', { class: 'pc-url', text: studentBase() })));
      if (i % 20 === 19) await new Promise(r => setTimeout(r));
    }
    const prev = document.getElementById('sm-print'); if (prev) prev.remove();
    document.body.append(wrap);
    await Promise.all(Array.from(wrap.querySelectorAll('img')).map(im => (im.decode ? im.decode().catch(() => {}) : Promise.resolve())));
    window.print();      // hộp thoại in của trình duyệt; thẻ nằm trong #sm-print (ẩn trên màn hình, chỉ hiện khi in)
  } catch (e) { toast('Không tạo được thẻ in: ' + (e && e.message || e), 'error'); }
  finally { if (btn) { btn.disabled = false; btn.textContent = old; } }
}

/* ---------- Cộng / trừ điểm một học sinh ---------- */
function openAdjust(code) {
  const r0 = Stu.row(code); if (!r0) return;
  const sign = h('select', { id: 'ad-sign', 'aria-label': 'Cộng hay trừ' }, h('option', { value: '1' }, '＋ Cộng'), h('option', { value: '-1' }, '− Trừ'));
  const amt = h('input', { type: 'number', id: 'ad-amt', min: -100000, max: 100000, step: 1, inputmode: 'numeric', placeholder: 'Số điểm', 'aria-label': 'Số điểm' });
  const reason = h('input', { type: 'text', id: 'ad-reason', maxlength: 100, autocomplete: 'off', placeholder: 'Ví dụ: thưởng làm bài tốt' });
  const prev = h('p', { class: 'hint', 'aria-live': 'polite' }), err = h('div', { role: 'alert' });
  const go = h('button', { class: 'btn primary', type: 'submit' }, 'Áp dụng');
  const calc = () => { const raw = parseInt(amt.value, 10); return isFinite(raw) ? (raw < 0 ? raw : raw * (Number(sign.value) || 1)) : 0; };
  const upd = () => {
    const dl = calc(), bal = (Stu.row(code) || r0).balance;
    prev.textContent = dl ? `Số dư ${nfmt(bal)} → dự kiến ${nfmt(Math.max(0, bal + dl))}` + (bal + dl < 0 ? ` (số dư không xuống dưới 0 nên chỉ trừ tối đa ${nfmt(bal)})` : '') : `Số dư hiện tại: ${nfmt(bal)}`;
  };
  [amt, sign].forEach(el => el.addEventListener('input', upd)); sign.addEventListener('change', upd);
  const d = Modal.open('Cộng / trừ điểm – ' + code, h('form', { class: 'stack', novalidate: true, onsubmit: async e => {
    e.preventDefault();
    const dl = calc(), why = reason.value.trim();
    if (!dl) return err.replaceChildren(h('p', { class: 'err', text: 'Hãy nhập số điểm khác 0 (số âm = trừ điểm).' }));
    if (Math.abs(dl) > 100000) return err.replaceChildren(h('p', { class: 'err', text: 'Mỗi lần chỉnh tối đa ±100.000 điểm.' }));
    if (!why) return err.replaceChildren(h('p', { class: 'err', text: 'Hãy nhập lý do để lưu vào sổ điểm.' }));
    go.disabled = true; err.replaceChildren(loading('Đang cập nhật điểm…'));
    try {
      const r = await TA.call('adjustPoints', { code, delta: dl, reason: why });
      const cur = Stu.row(code); if (cur) { cur.balance = Number(r.balance) || 0; if (isFinite(Number(r.totalEarned))) cur.totalEarned = Number(r.totalEarned); }
      const ap = isFinite(Number(r.delta)) ? Number(r.delta) : dl;
      d.close(); Stu.notify();
      toast(`Đã ${ap >= 0 ? 'cộng' : 'trừ'} ${nfmt(Math.abs(ap))} điểm cho ${code}. Số dư mới: ${nfmt(r.balance)}.` + (r.clamped ? ' (Đã giới hạn vì số dư không âm.)' : ''));
    } catch (ex) {
      go.disabled = false;
      err.replaceChildren(h('p', { class: 'err', text: ex.message }), ex.code ? null : h('p', { class: 'hint', text: 'Nếu mạng chập chờn, hãy xem “📒 Sổ” trước khi thử lại để tránh cộng trùng.' }));
    }
  } },
    h('p', null, 'Học sinh: ', h('strong', { class: 't-code', text: code })),
    h('div', { class: 'row wrap' }, sign, amt), h('p', { class: 'hint', text: 'Chọn Cộng/Trừ rồi nhập số điểm, hoặc gõ số âm để trừ.' }), prev,
    h('label', { for: 'ad-reason', text: 'Lý do (lưu vào sổ điểm)' }), reason, err,
    h('div', { class: 'row end' }, h('button', { type: 'button', class: 'btn', onclick: () => d.close() }, 'Hủy'), go)));
  upd(); amt.focus();
}

/* ---------- Sổ điểm ---------- */
const LEDGER_REASON = { vocab: 'Từ vựng', test: 'Bài test', game: 'Trò chơi', garden: 'Khu vườn (cũ)', pet: 'Thú cưng', city: 'Nông trại & Thành phố', teacher_adjust: 'Giáo viên chỉnh' };
const LEDGER_KEY = { requested: 'yêu cầu', correct: 'đúng', peeks: 'xem lại', game: 'game', bet: 'cược', note: 'ghi chú', reason: 'lý do' };
function ledgerDetail(x) {
  let d = x.detail;
  if (typeof d === 'string') { if (!d.trim()) d = null; else { try { d = JSON.parse(d); } catch (_) { return d.slice(0, 160); } } }
  const parts = [];
  if (d && typeof d === 'object') Object.keys(d).forEach(k => { const v = d[k]; if (v != null && typeof v !== 'object') parts.push((LEDGER_KEY[k] || k) + ': ' + v); });
  else if (d != null && d !== '') parts.push(String(d));
  if (x.refId) parts.push('mã tham chiếu: ' + x.refId);
  return parts.join(' · ').slice(0, 200);
}
function openLedger(code) {
  let seq = 0;
  const out = h('div', { class: 'stack' });
  const lim = h('select', { id: 'lg-lim', 'aria-label': 'Số dòng', onchange: () => load() }, [50, 200, 1000].map(n => h('option', { value: n, selected: n === 200 }, 'Gần nhất ' + n + ' dòng')));
  const d = Modal.open('Sổ điểm – ' + code, h('div', { class: 'stack' }, h('div', { class: 'row wrap' }, lim, h('button', { type: 'button', class: 'btn small', onclick: () => load() }, '↻ Tải lại')), out));
  async function load() {
    const my = ++seq; out.replaceChildren(loading('Đang tải sổ điểm…'));
    try {
      const r = await TA.call('getLedger', { code, limit: Number(lim.value) || 200 }, { retry: true });
      if (my !== seq || !d.isConnected) return;
      const rows = (Array.isArray(r.ledger) ? r.ledger : []).filter(x => x && (x.code == null || x.code === '' || String(x.code) === code))
        .map(x => Object.assign({}, x, { _t: tsOf(x.t != null ? x.t : x.timestamp) })).sort((a, b) => b._t - a._t);
      if (!rows.length) return out.replaceChildren(h('p', { class: 'muted', text: 'Mã này chưa có giao dịch điểm nào.' }));
      out.replaceChildren(h('p', { class: 'muted small-text', text: `${rows.length} giao dịch (mới nhất trước)` }),
        h('div', { class: 'table-wrap' }, h('table', null,
          h('thead', null, h('tr', null, ['Thời gian', 'Loại', 'Điểm', 'Số dư sau', 'Chi tiết'].map((c, i) => h('th', { scope: 'col', class: i === 2 || i === 3 ? 'num' : '', text: c })))),
          h('tbody', null, rows.map(x => { const dl = Number(x.delta) || 0;
            return h('tr', null, h('td', { text: x._t ? fmtDate(x._t) : '—' }), h('td', { text: LEDGER_REASON[x.reason] || x.reason || '—' }),
              h('td', { class: 'num ' + (dl < 0 ? 'err' : 'ok'), text: fmtDelta(dl) }), h('td', { class: 'num', text: x.balanceAfter == null ? '—' : nfmt(x.balanceAfter) }),
              h('td', { style: 'white-space:normal;min-width:140px', text: ledgerDetail(x) || '—' })); })))));
    } catch (e) {
      if (my !== seq || !d.isConnected) return;
      out.replaceChildren(h('div', { class: 'box error', role: 'alert' }, h('p', { text: 'Không tải được sổ điểm: ' + e.message }), h('button', { type: 'button', class: 'btn', onclick: () => load() }, '↻ Thử lại')));
    }
  }
  load();
}

/* ---------- Cài đặt điểm & trò chơi (getConfig / setConfig) ---------- */
const CFG_NUM = [
  { k: 'vocabCorrectPoints', label: 'Điểm cộng mặc định mỗi từ đúng (khi bộ từ không đặt riêng)', min: 0, max: 1000, def: 5, hint: 'Cộng cho mỗi từ gõ đúng.' },
  { k: 'vocabPeekPenalty', label: 'Điểm trừ mặc định mỗi lần xem lại (khi bộ từ không đặt riêng)', min: 0, max: 1000, def: 1, hint: 'Lượt xem đầu để ghi nhớ không bị trừ.' },
  { k: 'testDefaultPoints', label: 'Điểm test mặc định (mỗi câu)', min: 1, max: 100, def: 10, hint: 'Dùng khi câu hỏi không có điểm riêng.' },
  { k: 'maxBet', label: 'Mức cược tối đa (điểm)', min: 0, max: 1000000, def: 200, hint: 'Áp dụng cho mọi trò chơi.' },
  { k: 'dailyLossLimit', label: 'Giới hạn lỗ mỗi ngày (điểm)', min: 0, max: 1000000, def: 300, hint: 'Mức lỗ tối đa của một học sinh trong ngày khi chơi game.' }];
const CFG_ADV = [
  { k: 'maxBetPct', label: 'Cược tối đa theo % số dư', min: 1, max: 100, def: 25, hint: 'Mỗi lần cược không quá tỉ lệ này của số dư.' },
  { k: 'maxSubmitPoints', label: 'Trần điểm mỗi lần nộp', min: 1, max: 1000000, def: 5000, hint: 'Chống số liệu bất thường từ máy học sinh.' },
  { k: 'cityCostPct', label: 'Nông trại & Thành phố: giá điểm (% so với mặc định)', min: 10, max: 500, def: 100, hint: '100 = giá mặc định; 50 = rẻ một nửa; 200 = đắt gấp đôi.' },
  { k: 'cityActionPts', label: 'Nông trại & Thành phố: điểm tốn cho mỗi thao tác (0 = miễn phí)', min: 0, max: 100, def: 2, hint: 'Mỗi lần gieo/thu hoạch một ô ruộng, thu thuế một nhà, làm/thu sản phẩm, giao đơn, bán hàng, xây, nâng cấp… đều trừ số điểm này.' },
  { k: 'cityDailySpendCap', label: 'Trần chi điểm Nông trại & Thành phố mỗi ngày (0 = không giới hạn)', min: 0, max: 1000000, def: 0, hint: 'Giới hạn số điểm một học sinh được chi cho thành phố trong một ngày.' },
  { k: 'petDailySpendCap', label: 'Trần chi điểm Thú cưng mỗi ngày (0 = không giới hạn)', min: 0, max: 1000000, def: 0, hint: 'Giới hạn số điểm một học sinh được chi cho thú cưng trong một ngày.' }];
const CFG_PET = [{ k: 'petDailyMin', label: 'Thú cưng: điểm chăm sóc tối thiểu mỗi ngày', min: 1, max: 100000, def: 50, hint: 'Hết ngày mà học sinh chi chưa đủ số điểm này cho đồ ăn, chăm sóc, chơi đùa hoặc biểu diễn thì thú cưng mất.' }];
const CFG_GAMES = [['slots', '🎰 Máy xèng (Slots)'], ['wheel', '🎡 Vòng quay'], ['hilo', '🃏 Cao – Thấp (Hi-Lo)'], ['mines', '💣 Dò mìn (Mines)'], ['crash', '🚀 Crash'], ['dice', '🎲 Xúc xắc'], ['plinko', '🔻 Plinko'], ['scratch', '🎟️ Thẻ cào'], ['keno', '🔢 Keno mini'], ['coin', '🪙 Tung xu']];
const CFG_BOOL = [{ k: 'gamesEnabled', label: 'Bật khu trò chơi' }].concat(CFG_GAMES.map(([g, t]) => ({ k: 'game_' + g + '_enabled', label: t }))).concat([{ k: 'cityEnabled', label: 'Bật Nông trại & Thành phố (không tính vào báo cáo phụ huynh)' }, { k: 'petEnabled', label: 'Bật Thú cưng (không tính vào báo cáo phụ huynh)' }]);
const CFG_ALL = CFG_NUM.concat(CFG_ADV, CFG_PET);
const cfgBool = (v, d) => v == null || v === '' ? d : (v === true || /^(true|1|yes)$/i.test(String(v)));
const cfgNum = (v, d) => { if (v == null || v === '') return d; const n = Number(v); return isFinite(n) ? n : d; };
const Cfg = {
  base: null, form: {}, loading: false, saving: false, err: '', subs: new Set(),
  notify() { Array.from(this.subs).forEach(f => f()); },
  fill(config, defaults) {
    config = config || {}; defaults = defaults || {}; this.base = {};
    CFG_ALL.forEach(f => { this.base[f.k] = cfgNum(config[f.k] != null ? config[f.k] : defaults[f.k], f.def); });
    CFG_BOOL.forEach(f => { this.base[f.k] = cfgBool(config[f.k] != null ? config[f.k] : defaults[f.k], true); });
    this.defaults = {}; CFG_ALL.forEach(f => { this.defaults[f.k] = cfgNum(defaults[f.k], f.def); }); CFG_BOOL.forEach(f => { this.defaults[f.k] = cfgBool(defaults[f.k], true); });
    this.revert();
  },
  revert() { this.form = {}; CFG_ALL.forEach(f => { this.form[f.k] = String(this.base[f.k]); }); CFG_BOOL.forEach(f => { this.form[f.k] = !!this.base[f.k]; }); },
  dirty() {
    if (!this.base) return [];
    return CFG_ALL.map(f => f.k).filter(k => String(this.form[k]).trim() === '' || Number(this.form[k]) !== this.base[k]).concat(CFG_BOOL.map(f => f.k).filter(k => !!this.form[k] !== this.base[k]));
  },
  async load() {
    if (this.loading || !TA.ready()) return;
    this.loading = true; this.err = ''; this.notify();
    try { const r = await TA.call('getConfig', {}, { retry: true }); this.fill(r.config, r.defaults); }
    catch (e) { this.err = e.message; }
    finally { this.loading = false; this.notify(); }
  }
};
function ConfigPanel() {
  teacherCss();
  const root = h('div', { class: 't-panel stack' });
  let saveBtn, revBtn, gamesBox;
  const refresh = () => {
    if (!saveBtn) return; const n = Cfg.dirty().length;
    saveBtn.disabled = !n || Cfg.saving; saveBtn.textContent = Cfg.saving ? '⏳ Đang lưu…' : (n ? `💾 Lưu thay đổi (${n})` : '💾 Lưu thay đổi');
    revBtn.disabled = !n || Cfg.saving; if (gamesBox) gamesBox.classList.toggle('t-dim', !Cfg.form.gamesEnabled);
  };
  const numField = f => {
    const inp = h('input', { type: 'number', id: 'cfg-' + f.k, min: f.min, max: f.max, step: 1, inputmode: 'numeric', value: Cfg.form[f.k], disabled: Cfg.saving, oninput: e => { Cfg.form[f.k] = e.target.value; refresh(); } });
    return h('div', { class: 't-field' }, h('label', { for: 'cfg-' + f.k, text: f.label }), inp, h('p', { class: 'hint', text: f.hint + ` (${nfmt(f.min)}–${nfmt(f.max)}; mặc định ${nfmt(f.def)})` }));
  };
  const boolField = f => h('label', { class: 'check', for: 'cfg-' + f.k }, h('input', { type: 'checkbox', id: 'cfg-' + f.k, checked: !!Cfg.form[f.k], disabled: Cfg.saving, onchange: e => { Cfg.form[f.k] = e.target.checked; refresh(); } }), f.label);
  const setOne = async (key, value) => {
    for (let i = 0; ; i++) {
      try { return await TA.call('setConfig', { key, value }); }
      catch (e) { if (i < 2 && (e.code === 'busy' || e.code === 'rate_limited')) { await new Promise(r => setTimeout(r, 1300)); continue; } throw e; }
    }
  };
  async function save() {
    const keys = Cfg.dirty(); if (!keys.length || Cfg.saving) return;
    for (const f of CFG_ALL) {
      if (!keys.includes(f.k)) continue;
      const raw = String(Cfg.form[f.k]).trim(), n = Number(raw);
      if (raw === '' || !Number.isInteger(n) || n < f.min || n > f.max) {
        toast(`“${f.label}” phải là số nguyên từ ${nfmt(f.min)} đến ${nfmt(f.max)}.`, 'error');
        const el = document.getElementById('cfg-' + f.k); if (el) el.focus(); return;
      }
    }
    Cfg.saving = true; Cfg.notify();
    const label = k => (CFG_ALL.concat(CFG_BOOL).find(f => f.k === k) || {}).label || k;
    const failed = []; let done = 0;
    for (const k of keys) {
      const isB = CFG_BOOL.some(f => f.k === k), value = isB ? !!Cfg.form[k] : Number(Cfg.form[k]);
      try { await setOne(k, value); Cfg.base[k] = value; if (!isB) Cfg.form[k] = String(value); done++; }
      catch (e) { failed.push(label(k) + ' (' + e.message + ')'); if (e.code === 'unauthorized') break; }
    }
    Cfg.saving = false;
    Scoring.setConfig({ vocabCorrectPoints: Cfg.base.vocabCorrectPoints, vocabPeekPenalty: Cfg.base.vocabPeekPenalty, testDefaultPoints: Cfg.base.testDefaultPoints });
    if (failed.length) toast(`Đã lưu ${done}/${keys.length} mục. Chưa lưu được: ${failed.join('; ')}`, 'error');
    else toast(`Đã lưu ${done} thay đổi. Học sinh sẽ thấy cấu hình mới sau tối đa khoảng 1 phút.`);
    Cfg.notify();
  }
  function paint() {
    if (!TA.ready()) { root.replaceChildren(h('h2', { text: 'Cài đặt điểm & trò chơi' }), h('p', { class: 'muted', text: 'Nhập Teacher Key để chỉnh điểm và bật/tắt trò chơi.' }), teacherKeyBox()); saveBtn = null; return; }
    if (!Cfg.base) {
      saveBtn = null;
      if (Cfg.loading) return root.replaceChildren(loading('Đang tải cấu hình…'));
      return root.replaceChildren(h('h2', { text: 'Cài đặt điểm & trò chơi' }), h('div', { class: 'box error', role: 'alert' }, h('p', { text: Cfg.err || 'Chưa tải được cấu hình.' }), h('button', { type: 'button', class: 'btn', onclick: () => Cfg.load() }, '↻ Thử lại')));
    }
    gamesBox = h('div', { class: 't-games' }, CFG_GAMES.map(([g]) => boolField(CFG_BOOL.find(f => f.k === 'game_' + g + '_enabled'))));
    saveBtn = h('button', { type: 'button', class: 'btn primary', onclick: save }, '💾 Lưu thay đổi');
    revBtn = h('button', { type: 'button', class: 'btn', onclick: () => { Cfg.revert(); Cfg.notify(); } }, '↶ Hoàn tác thay đổi');
    root.replaceChildren(
      h('section', { class: 'card stack' },
        h('div', { class: 'row wrap', style: 'justify-content:space-between;align-items:center' }, h('h2', { text: 'Cài đặt điểm & trò chơi' }), keyState()),
        h('p', { class: 'hint', text: 'Áp dụng cho mọi học sinh. Học sinh nhận cấu hình mới sau tối đa khoảng 1 phút (bộ nhớ đệm máy chủ).' }),
        Cfg.err ? h('div', { class: 'box warn', role: 'alert', text: Cfg.err }) : null,
        h('h3', { text: 'Điểm' }), h('div', { class: 't-grid' }, CFG_NUM.slice(0, 3).map(numField)),
        h('h3', { text: 'Trò chơi' }), h('div', { class: 't-grid' }, CFG_NUM.slice(3).map(numField)),
        boolField(CFG_BOOL[0]), h('p', { class: 'hint', text: 'Tắt khu trò chơi = học sinh không chơi được trò nào (các công tắc bên dưới giữ nguyên để bật lại sau).' }),
        h('p', { class: 'muted small-text', text: 'Bật/tắt từng trò:' }), gamesBox,
        boolField(CFG_BOOL.find(f => f.k === 'cityEnabled')),
        boolField(CFG_BOOL.find(f => f.k === 'petEnabled')), h('div', { class: 't-grid' }, CFG_PET.map(numField)),
        h('details', { class: 'box' }, h('summary', { text: 'Nâng cao' }), h('div', { class: 't-grid', style: 'margin-top:.6rem' }, CFG_ADV.map(numField))),
        h('div', { class: 'row wrap' }, saveBtn, revBtn,
          h('button', { type: 'button', class: 'btn', disabled: Cfg.saving, onclick: () => { CFG_ALL.forEach(f => { Cfg.form[f.k] = String(Cfg.defaults[f.k]); }); CFG_BOOL.forEach(f => { Cfg.form[f.k] = !!Cfg.defaults[f.k]; }); Cfg.notify(); toast('Đã điền giá trị mặc định – bấm “Lưu thay đổi” để áp dụng.'); } }, 'Đặt về mặc định'),
          h('button', { type: 'button', class: 'btn', disabled: Cfg.saving, onclick: async () => { if (Cfg.dirty().length && !await Modal.confirm('Tải lại sẽ bỏ các thay đổi chưa lưu. Tiếp tục?', 'Tải lại')) return; Cfg.base = null; Cfg.load(); } }, '↻ Tải lại'))));
    refresh();
  }
  liveView(Cfg.subs, root, paint);
  paint();
  if (TA.ready() && !Cfg.base && !Cfg.loading) Cfg.load();
  return root;
}


/* ===================== THỐNG KÊ (giáo viên) – dùng chung cho bài từ vựng (#/stats) và bài test (#/teststats) =====================
 *  #/stats, #/teststats          → danh sách bài giao: tìm kiếm, lọc, sắp xếp, chọn nhiều bài để xóa hàng loạt
 *  #/stats?id=…, #/teststats?id=… → bảng điều khiển của một bài: chỉ số tổng quan, phân bố điểm, tab theo học sinh / từng lượt / từ khó (câu hỏi) */
const STATS_KIND = {
  vocab: { route: '#/stats', cache: 'assignments', action: 'assignments', resKey: 'res:', label: 'Bài từ vựng', icon: '📚' },
  test: { route: '#/teststats', cache: 'testAssignments', action: 'testAssignments', resKey: 'tres:', label: 'Bài test', icon: '📝' }
};
const HubState = {};                              // giữ ô tìm kiếm / bộ lọc / các bài đang chọn khi vào xem chi tiết rồi quay lại
const pct100 = (s, m) => m > 0 ? Math.round(s / m * 100) : 0;
const asStatus = a => !a.due ? 'nodue' : (Date.now() > a.due ? 'expired' : 'open');
const AS_STATUS = { open: 'Còn hạn', expired: 'Hết hạn', nodue: 'Không hạn' };
const fmtShort = ts => { const d = new Date(ts); return isNaN(d) ? '—' : d.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }); };
const fmtDay = ts => { const d = new Date(ts); return isNaN(d) ? '—' : d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }); };
const relSpan = ms => { const x = Math.abs(ms); return x < 3600000 ? Math.max(1, Math.round(x / 60000)) + ' phút' : x < 86400000 ? Math.round(x / 3600000) + ' giờ' : Math.round(x / 86400000) + ' ngày'; };
const dueText = a => { if (!a.due) return ''; const left = a.due - Date.now(); return left > 0 ? `Hạn ${fmtShort(a.due)} · còn ${relSpan(left)}` : `Hết hạn ${fmtShort(a.due)} (${relSpan(left)} trước)`; };
const pctTone = p => p >= 80 ? 'good' : p >= 50 ? 'mid' : 'low';
/** Link giao bài: luôn dùng link ngắn nếu đề đã lưu trên Sheet */
function assignLink(a, kind) {
  const st = Settings.data;
  if (a.hasData && API.validUrl(st.scriptUrl)) return location.href.split('#')[0] + (kind === 'test' ? '#/taketest?id=' : '#/assign?id=') + a.id + '&s=' + encodeURIComponent(API.short(st.scriptUrl));
  return a.link || '';
}
function statsGuard(root) {
  const st = Settings.data;
  if (st.teacherOk && API.validUrl(st.scriptUrl) && st.teacherKey) return true;
  root.replaceChildren(h('div', { class: 'card empty' }, h('h1', { text: 'Thống kê' }), h('p', { class: 'muted', text: 'Cần nhập Apps Script URL + Teacher Key hợp lệ (bấm "Kiểm tra kết nối") để xem thống kê.' }), h('a', { class: 'btn primary', href: '#/settings' }, 'Mở Cài đặt')));
  return false;
}
const statsErrMsg = m => /Hành động/.test(m) ? 'Apps Script chưa được cập nhật bản mới. Dán lại Code.gs rồi Deploy → Manage deployments → ✎ → New version.' : m;
const PendingDel = new Set();                    // bài đang xóa trên Sheet: ẩn khỏi danh sách kể cả khi máy chủ chưa xóa xong
function loadAsList(kind, onData) {
  const st = Settings.data, K = STATS_KIND[kind], live = l => (l || []).filter(a => !PendingDel.has(a.id));
  return swr(K.cache, async () => {
    const r = await API.get(st.scriptUrl, { action: K.action, teacherKey: st.teacherKey });
    if (!r.ok) throw new Error(r.error === 'unauthorized' ? 'Teacher Key không đúng.' : (r.message || r.error));
    return live(r.assignments);
  }, (l, cached) => onData(live(l), cached), true);
}
/* --- Khối giao diện dùng chung --- */
function kindTabs(kind) {
  return h('nav', { class: 'kseg', 'aria-label': 'Loại bài' }, ['vocab', 'test'].map(k =>
    h('a', { href: STATS_KIND[k].route, 'aria-current': k === kind ? 'page' : null }, STATS_KIND[k].icon + ' ' + STATS_KIND[k].label)));
}
const kpi = (label, value, sub, tone) => h('div', { class: 'kpi' + (tone ? ' ' + tone : '') },
  h('div', { class: 'kpi-l', text: label }), h('div', { class: 'kpi-v', text: String(value) }), sub ? h('div', { class: 'kpi-s', text: sub }) : null);
const meter = p => h('span', { class: 'meter ' + pctTone(p), role: 'img', 'aria-label': p + '%' }, h('span', null, h('span', { style: `width:${clamp(p, 0, 100)}%` })), h('b', { text: p + '%' }));
/** Biểu đồ phân bố điểm (% điểm tối đa) */
function histogram(pcts) {
  const bins = [['< 50%', 0, 49, 'low'], ['50–64%', 50, 64, 'mid'], ['65–79%', 65, 79, 'mid'], ['80–89%', 80, 89, 'good'], ['≥ 90%', 90, 100, 'good']];
  const cnt = bins.map(b => pcts.filter(p => p >= b[1] && p <= b[2]).length), mx = Math.max(1, ...cnt);
  return h('div', { class: 'card' }, h('h2', { text: 'Phân bố điểm' }), h('p', { class: 'hint', text: 'Số lượt nộp theo mức % điểm đạt được.' }),
    h('div', { class: 'histo', role: 'img', 'aria-label': 'Phân bố điểm: ' + bins.map((b, i) => `${b[0]}: ${cnt[i]} lượt`).join(', ') },
      bins.map((b, i) => h('div', { class: 'histo-col' }, h('span', { class: 'histo-n', text: String(cnt[i]) }),
        h('div', { class: 'histo-track' }, h('div', { class: 'histo-bar ' + b[3], style: `height:${cnt[i] ? Math.max(4, cnt[i] / mx * 100) : 0}%` })), h('span', { class: 'histo-l', text: b[0] })))));
}
/** Thanh tab; tabs = [{ k, label, n }] */
function tabBar(tabs, cur, go) {
  return h('div', { class: 'tabs', role: 'tablist' }, tabs.map(t => h('button', { type: 'button', role: 'tab', class: 'tab', 'aria-selected': String(t.k === cur), onclick: () => go(t.k) },
    t.label, t.n != null ? h('span', { class: 'tab-n', text: String(t.n) }) : null)));
}
/** Menu "Xuất file" gọn (details/summary) */
function exportMenu(items) {
  const d = h('details', { class: 'menu' }, h('summary', { class: 'btn' }, '⬇ Xuất file ▾'),
    h('div', { class: 'menu-list', role: 'menu' }, items.map(([t, fn]) => h('button', { type: 'button', role: 'menuitem', onclick: () => { d.open = false; fn(); } }, t))));
  return d;
}
document.addEventListener('click', e => document.querySelectorAll('details.menu[open]').forEach(d => { if (!d.contains(e.target)) d.open = false; }));
const wideModal = d => { d.style.maxWidth = 'min(820px, 96vw)'; return d; };
/** Bộ lọc kết quả: tìm mã HS, % điểm từ–đến, lớp (dữ liệu cũ) */
function resultFilters(F, classes, onChange) {
  const inp = (label, k, attrs) => h('div', null, h('label', { text: label }, ), h('input', Object.assign({ value: F[k], oninput: e => { F[k] = e.target.value; onChange(); } }, attrs)));
  const box = h('div', { class: 'filters sx-filters' },
    inp('Tìm mã học sinh / tên', 'q', { type: 'search', placeholder: 'VD: AB12CD' }),
    inp('% điểm từ', 'min', { type: 'number', min: 0, max: 100, inputmode: 'numeric', placeholder: '0' }),
    inp('% điểm đến', 'max', { type: 'number', min: 0, max: 100, inputmode: 'numeric', placeholder: '100' }),
    classes.length ? h('div', null, h('label', { text: 'Lớp (dữ liệu cũ)' }), h('select', { onchange: e => { F.cls = e.target.value; onChange(); } }, h('option', { value: '' }, 'Tất cả'), classes.map(c => h('option', { value: c, selected: c === F.cls }, c)))) : null);
  box.querySelectorAll('label').forEach((l, i) => { const id = 'sxf-' + i; const c = l.nextElementSibling; if (c) { c.id = id; l.setAttribute('for', id); } });
  return box;
}
const applyFilters = (rows, F) => {
  const q = fold(F.q.trim()), mn = F.min === '' ? -Infinity : Number(F.min), mx = F.max === '' ? Infinity : Number(F.max);
  return rows.filter(r => (!q || fold(r.name).includes(q)) && (!F.cls || r.cls === F.cls) && r.pct >= mn && r.pct <= mx);
};
const sameStudent = (r, e, split) => Norm.text(r.name).toLowerCase() === Norm.text(e.name).toLowerCase() && (!split || !e.cls || e.cls.split(', ').includes(r.cls));
/** Bảng có sắp xếp + phân trang trong một host; T = { sort, page } */
function pagedTable(host, cols, rows, T, textKeys, redraw, size) {
  const PAGE = size || 15, pages = Math.max(1, Math.ceil(rows.length / PAGE)); T.page = clamp(T.page || 1, 1, pages);
  host.replaceChildren(rows.length ? sortTable('', cols, sortRows(rows, T.sort).slice((T.page - 1) * PAGE, T.page * PAGE), T.sort, k => { T.sort = nextSort(T.sort, k, textKeys); T.page = 1; redraw(); })
    : h('div', { class: 'empty muted', text: 'Không có kết quả phù hợp bộ lọc.' }),
    rows.length > PAGE ? pager(T.page, pages, p => { T.page = p; redraw(); }) : null);
}

/* --- Xóa bài giao (một hoặc nhiều bài) --- */
function purgeLocalAssignment(id) {            // dọn dữ liệu của bài này đang lưu trong trình duyệt (số lần làm, hàng đợi gửi kết quả)
  const att = Store.get('attempts', {}); if (att && att[id] != null) { delete att[id]; Store.set('attempts', att); }
  const q = Sync.queue(), q2 = q.filter(x => !(x && x.payload && x.payload.assignmentId === id));
  if (q2.length !== q.length) Store.set('queue', q2);
}
function confirmPurgeMany(items) {
  return new Promise(res => {
    let ok = false;
    const subs = items.reduce((s, a) => s + (Number(a.count) || 0), 0), open = items.filter(a => asStatus(a) === 'open').length, one = items.length === 1;
    const go = h('button', { class: 'btn danger', type: 'button', disabled: true, onclick: () => { ok = true; d.close(); } }, one ? '🗑 Xóa vĩnh viễn' : `🗑 Xóa vĩnh viễn ${items.length} bài`);
    const ack = h('input', { type: 'checkbox', id: 'bd-ack', onchange: e => { go.disabled = !e.target.checked; } });
    const d = Modal.open(one ? 'Xóa bài giao' : `Xóa ${items.length} bài giao`, h('div', { class: 'stack' },
      h('p', null, 'Bạn sắp xóa vĩnh viễn ', h('strong', { text: one ? `“${items[0].name}”` : `${items.length} bài giao` }), ' cùng ', h('strong', { text: `${subs} lượt nộp` }), ' của học sinh.'),
      open ? h('div', { class: 'box error', role: 'alert', text: `⚠ ${one ? 'Bài này' : open + ' bài'} vẫn CÒN HẠN nộp: học sinh đang làm sẽ không nộp được nữa và link sẽ hỏng.` }) : null,
      one ? null : h('ul', { class: 'del-list' }, items.slice(0, 100).map(a => h('li', null, h('span', { class: 'del-name', text: a.name }),
        h('span', { class: 'badge ' + asStatus(a), text: AS_STATUS[asStatus(a)] }), h('span', { class: 'muted small-text', text: `${a.count || 0} lượt` }))),
        items.length > 100 ? h('li', { class: 'muted', text: `… và ${items.length - 100} bài khác` }) : null),
      h('p', { class: 'hint', text: 'Sẽ xóa: kết quả trên Google Sheet, dòng đăng ký bài (hạn nộp, link), đề / bộ từ đã lưu trên Sheet và dữ liệu của bài trong trình duyệt. Thẻ bộ từ / bài test gốc ở trang chủ KHÔNG bị xóa. Hãy xuất Excel/CSV trước nếu cần giữ điểm.' }),
      h('label', { class: 'check', for: 'bd-ack' }, ack, 'Tôi hiểu thao tác này không thể hoàn tác'),
      h('div', { class: 'row end' }, h('button', { class: 'btn', type: 'button', onclick: () => d.close() }, 'Hủy'), go)), () => res(ok));
  });
}
/** Xóa trên Google Sheet. Giao diện đã cập nhật ngay (lạc quan); lỗi → báo và gọi onFail để tải lại danh sách.
 *  Apps Script mới: action deleteAssignments (mỗi lượt 25 bài). Apps Script cũ: tự chuyển sang xóa lần lượt từng bài. */
async function runDelete(kind, items, onFail) {
  const st = Settings.data, K = STATS_KIND[kind], ids = items.map(a => a.id), gone = new Set(ids);
  ids.forEach(id => { PendingDel.add(id); purgeLocalAssignment(id); delete Mem[K.resKey + id]; });
  delete Mem['res:all'];
  let cur = Mem[K.cache] && Mem[K.cache].v;
  if (!cur) { try { cur = JSON.parse(localStorage.getItem(pkey(K.cache)) || 'null'); } catch (_) {} }
  if (Array.isArray(cur)) cacheSet(K.cache, cur.filter(x => !gone.has(x.id)), true);
  const t = h('div', { class: 'toast info', role: 'status' }, h('span', { class: 'spin-sm', 'aria-hidden': 'true' }), h('span', { text: ids.length > 1 ? `Đang xóa ${ids.length} bài trên Google Sheet…` : `Đang xóa “${items[0].name}” trên Google Sheet…` }));
  $('#toasts').append(t);
  const say = s => { t.lastChild.textContent = s; };
  const done = [], failed = [], CH = 25, why = r => (r && (r.error === 'unauthorized' ? 'Teacher Key không đúng' : (r.message || r.error))) || 'máy chủ phản hồi không đúng';
  let legacy = false, stop = '';
  for (let i = 0; i < ids.length;) {
    if (stop) { failed.push(...ids.slice(i).map(id => ({ id, msg: stop }))); break; }
    if (!legacy) {
      const chunk = ids.slice(i, i + CH);
      try {
        const r = await API.post(st.scriptUrl, { action: 'deleteAssignments', teacherKey: st.teacherKey, ids: chunk }, 120000);
        if (r && r.ok) done.push(...chunk);
        else if (r && /Hành động/.test(r.message || '')) { legacy = true; continue; }
        else { failed.push(...chunk.map(id => ({ id, msg: why(r) }))); if (r && r.error === 'unauthorized') stop = why(r); }
      } catch (e) { failed.push(...chunk.map(id => ({ id, msg: e.message }))); }
      i += chunk.length;
    } else {
      const id = ids[i++];
      try { const r = await API.post(st.scriptUrl, { action: 'deleteAssignment', teacherKey: st.teacherKey, id }, 60000); if (r && r.ok) done.push(id); else { failed.push({ id, msg: why(r) }); if (r && r.error === 'unauthorized') stop = why(r); } }
      catch (e) { failed.push({ id, msg: e.message }); }
    }
    if (ids.length > 1) say(`Đang xóa trên Google Sheet… ${done.length + failed.length}/${ids.length} bài`);
  }
  t.remove();
  failed.forEach(f => PendingDel.delete(f.id));
  if (!failed.length) toast(ids.length > 1 ? `Đã xóa ${ids.length} bài giao.` : `Đã xóa bài “${items[0].name}”.`);
  else {
    toast((ids.length > 1 ? `Đã xóa ${done.length}/${ids.length} bài. ` : '') + `Chưa xóa được ${failed.length > 1 ? failed.length + ' bài' : ''}: ${failed[0].msg}. Đang tải lại danh sách.`, 'error');
    delete Mem[K.cache]; try { localStorage.removeItem(pkey(K.cache)); } catch (_) {}
    if (onFail) onFail();
  }
}
/** Hộp thoại link giao bài + mã QR */
function shareModal(a, kind) {
  const link = assignLink(a, kind);
  const box = h('textarea', { readonly: true, 'aria-label': 'Link giao bài', style: 'min-height:70px;font-size:.8rem', onfocus: e => e.target.select() }); box.value = link;
  const qrBox = h('div', { class: 'stack', style: 'align-items:center;text-align:center' });
  if (link) {
    const canvas = h('canvas', { 'aria-label': 'Mã QR của link giao bài', role: 'img', style: 'max-width:100%;height:auto;background:#fff;border-radius:8px' });
    const dl = h('button', { class: 'btn', type: 'button', onclick: () => { try { download('qr-' + a.id + '.png', new Blob([Uint8Array.from(atob(canvas.toDataURL('image/png').split(',')[1]), c => c.charCodeAt(0))], { type: 'image/png' })); } catch (_) { toast('Không tải được QR.', 'error'); } } }, '⬇ Tải QR (PNG)');
    qrBox.replaceChildren(canvas, dl);
    if (window.QRCode) QRCode.toCanvas(canvas, link, { width: 240, margin: 2, errorCorrectionLevel: 'L' }, err => { if (err) qrBox.replaceChildren(h('p', { class: 'err', text: 'Link quá dài để tạo mã QR. Hãy dùng link ngắn qua Google Sheet.' })); });
    else qrBox.replaceChildren(h('p', { class: 'err', text: 'Thư viện QR chưa tải được – hãy kiểm tra mạng rồi tải lại trang.' }));
  }
  Modal.open('Link giao bài & mã QR', h('div', { class: 'stack' },
    h('p', { class: 'muted', text: a.name }),
    Array.isArray(a.codes) ? h('p', { class: 'hint', text: a.codes.length ? `Giao riêng cho ${a.codes.length} mã: ${a.codes.slice(0, 80).join(', ')}${a.codes.length > 80 ? '…' : ''}` : 'Giao cho: tất cả học sinh có mã' }) : null,
    link ? [box, h('button', { class: 'btn primary', type: 'button', onclick: async () => toast(await copyText(link, box) ? 'Đã sao chép link.' : 'Hãy chọn và copy thủ công.') }, '📋 Copy link'), qrBox]
      : h('p', { class: 'hint', text: 'Link của bài này chưa được lưu (bài giao từ phiên bản cũ). Hãy tạo lại link từ thẻ ở trang chủ nếu cần.' })));
}

/* --- Danh sách bài giao (có xóa hàng loạt) --- */
function StatsHub(root, kind) {
  const K = STATS_KIND[kind], PAGE = 15;
  const S = HubState[kind] || (HubState[kind] = { q: '', f: 'all', sort: 'new', page: 1, sel: new Set() });
  let list = null, alive = true;
  const kpiHost = h('div', { class: 'kpis' }), chipsHost = h('div', { class: 'chipbar', role: 'group', 'aria-label': 'Lọc theo trạng thái' });
  const selHost = h('div', { class: 'sel-row' }), listHost = h('div', { 'aria-live': 'polite' }), bar = h('div', { class: 'bulkbar', role: 'region', 'aria-label': 'Thao tác với các bài đã chọn' });
  const search = h('input', { type: 'search', id: 'hub-q', placeholder: '🔍 Tìm theo tên bài…', 'aria-label': 'Tìm bài giao theo tên', value: S.q, oninput: e => { S.q = e.target.value; S.page = 1; draw(); } });
  const SORTS = [['new', 'Mới giao gần đây'], ['old', 'Giao lâu nhất'], ['due', 'Hạn nộp gần nhất'], ['most', 'Nhiều lượt nộp nhất'], ['least', 'Ít lượt nộp nhất'], ['name', 'Tên A → Z']];
  const sortSel = h('select', { 'aria-label': 'Sắp xếp', onchange: e => { S.sort = e.target.value; S.page = 1; draw(); } }, SORTS.map(([v, t]) => h('option', { value: v, selected: S.sort === v }, 'Sắp xếp: ' + t)));
  const refreshBtn = h('button', { class: 'btn small', type: 'button', title: 'Tải lại danh sách từ Google Sheet', onclick: () => load(true) }, '⟳ Tải lại');
  root.replaceChildren(h('div', { class: 'stack sx' },
    h('div', { class: 'sx-head' }, h('div', null, h('h1', { text: 'Thống kê & quản lý bài giao' }), h('p', { class: 'muted sx-sub', text: 'Bấm vào một bài để xem kết quả chi tiết. Tích chọn nhiều bài để xóa cùng lúc.' })), refreshBtn),
    kindTabs(kind), kpiHost,
    kind === 'vocab' ? h('a', { class: 'card all-card', href: K.route + '?id=all' }, h('span', { class: 'all-ic', 'aria-hidden': 'true', text: '★' }),
      h('span', null, h('strong', { text: 'Tổng hợp tất cả bài từ vựng' }), h('span', { class: 'muted small-text', text: 'Cộng điểm của mỗi học sinh qua mọi bài đã giao' })), h('span', { class: 'as-go', 'aria-hidden': 'true', text: '›' })) : null,
    h('section', { class: 'card sx-list', 'aria-label': 'Danh sách bài giao' }, h('div', { class: 'toolbar' }, search, sortSel), chipsHost, selHost, listHost), bar));
  listHost.append(loading('Đang tải danh sách bài…'));
  const sortFns = {
    new: (a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')), old: (a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')),
    name: (a, b) => String(a.name).localeCompare(String(b.name), 'vi'), most: (a, b) => (b.count || 0) - (a.count || 0), least: (a, b) => (a.count || 0) - (b.count || 0),
    due: (a, b) => { const k = x => { const s = asStatus(x); return s === 'open' ? x.due : s === 'nodue' ? 1e15 : 4e15 - x.due; }; return k(a) - k(b); }
  };
  const FILTERS = [['all', 'Tất cả', () => true], ['open', 'Đang mở', a => asStatus(a) !== 'expired'], ['expired', 'Hết hạn', a => asStatus(a) === 'expired'], ['empty', 'Chưa ai nộp', a => !a.count]];
  const filtered = () => { const q = fold(S.q.trim()), fn = (FILTERS.find(f => f[0] === S.f) || FILTERS[0])[2]; return (list || []).filter(a => fn(a) && (!q || fold(a.name).includes(q))).sort(sortFns[S.sort] || sortFns.new); };
  function load(manual) {
    if (manual) { refreshBtn.disabled = true; refreshBtn.textContent = '⟳ Đang tải…'; }
    let changed = false;
    loadAsList(kind, (l, cached) => { if (!cached) changed = true; if (!alive) return; list = l; const ids = new Set(l.map(a => a.id)); [...S.sel].forEach(id => { if (!ids.has(id)) S.sel.delete(id); }); draw(); })
      .then(() => { if (manual && alive && !changed) toast('Danh sách đã là mới nhất.'); })
      .catch(e => { if (!alive) return; if (list) toast(e.message, 'error'); else listHost.replaceChildren(h('div', { class: 'box error', role: 'alert' }, h('p', { text: statsErrMsg(e.message) }), h('button', { class: 'btn small', type: 'button', onclick: () => { listHost.replaceChildren(loading()); load(); } }, 'Thử lại'))); })
      .finally(() => { if (alive && manual) { refreshBtn.disabled = false; refreshBtn.textContent = '⟳ Tải lại'; } });
  }
  function row(a) {
    const s = asStatus(a), on = S.sel.has(a.id);
    const cb = h('input', { type: 'checkbox', 'aria-label': 'Chọn bài ' + a.name, checked: on, onchange: e => { if (e.target.checked) S.sel.add(a.id); else S.sel.delete(a.id); li.classList.toggle('sel', e.target.checked); paintSel(); } });
    const li = h('li', { class: 'as-row' + (on ? ' sel' : '') },
      h('label', { class: 'as-cb' }, cb),
      h('div', { class: 'as-main' },
        h('a', { class: 'as-name', href: K.route + '?id=' + encodeURIComponent(a.id), text: a.name || a.id }),
        h('div', { class: 'as-meta' }, h('span', { class: 'badge ' + s, text: AS_STATUS[s] }),
          a.due ? h('span', { text: dueText(a) }) : null,
          Array.isArray(a.codes) ? h('span', { text: a.codes.length ? `👤 Giao riêng ${a.codes.length} mã` : '👥 Giao chung' }) : null,
          a.createdAt ? h('span', { text: 'Giao ngày ' + fmtDay(a.createdAt) }) : null)),
      h('div', { class: 'as-count' + (a.count ? '' : ' zero') }, h('strong', { text: String(a.count || 0) }), h('span', { text: 'lượt nộp' })),
      h('span', { class: 'as-go', 'aria-hidden': 'true', text: '›' }));
    return li;
  }
  function paintSel() {
    const vis = filtered(), n = S.sel.size, allVis = vis.length > 0 && vis.every(a => S.sel.has(a.id)), some = vis.some(a => S.sel.has(a.id));
    const exp = (list || []).filter(a => asStatus(a) === 'expired');
    const all = h('input', { type: 'checkbox', id: 'hub-all', checked: allVis, onchange: e => { vis.forEach(a => { if (e.target.checked) S.sel.add(a.id); else S.sel.delete(a.id); }); draw(); } });
    all.indeterminate = some && !allVis;
    selHost.replaceChildren(vis.length ? h('label', { class: 'check', for: 'hub-all' }, all, allVis ? `Bỏ chọn ${vis.length} bài đang hiện` : `Chọn tất cả ${vis.length} bài đang hiện`) : h('span'),
      exp.length ? h('button', { class: 'btn small ghost', type: 'button', onclick: () => { exp.forEach(a => S.sel.add(a.id)); draw(); } }, `☑ Chọn ${exp.length} bài hết hạn`) : null);
    bar.classList.toggle('on', n > 0);
    const chosen = (list || []).filter(a => S.sel.has(a.id)), subs = chosen.reduce((s, a) => s + (Number(a.count) || 0), 0);
    bar.replaceChildren(n ? h('div', { class: 'bulkbar-in' },
      h('span', { class: 'bulk-n' }, h('strong', { text: `Đã chọn ${n} bài` }), h('span', { class: 'muted small-text', text: ` · ${subs} lượt nộp` })),
      h('div', { class: 'row wrap' }, h('button', { class: 'btn small', type: 'button', onclick: () => { S.sel.clear(); draw(); } }, 'Bỏ chọn'),
        h('button', { class: 'btn small danger', type: 'button', onclick: bulkDelete }, `🗑 Xóa ${n} bài`))) : null);
  }
  function draw() {
    if (!list) return;
    const now = list.length, subs = list.reduce((s, a) => s + (Number(a.count) || 0), 0), open = list.filter(a => asStatus(a) !== 'expired').length;
    kpiHost.replaceChildren(kpi('Bài đã giao', now), kpi('Tổng lượt nộp', subs, now ? 'TB ' + (subs / now).toFixed(1) + ' lượt/bài' : ''), kpi('Đang mở', open, 'còn hạn hoặc không hạn', 'good'), kpi('Hết hạn', now - open, now - open ? 'có thể dọn bớt' : '', now - open ? 'warn' : ''));
    chipsHost.replaceChildren(...FILTERS.map(([k, t, fn]) => h('button', { type: 'button', class: 'tag-btn', 'aria-pressed': String(S.f === k), onclick: () => { S.f = k; S.page = 1; draw(); } }, `${t} (${list.filter(fn).length})`)));
    const vis = filtered(), pages = Math.max(1, Math.ceil(vis.length / PAGE)); S.page = clamp(S.page, 1, pages);
    if (!list.length) listHost.replaceChildren(h('div', { class: 'empty' }, h('p', { class: 'big-ic', text: kind === 'test' ? '📝' : '📚' }), h('p', { class: 'muted', text: kind === 'test' ? 'Chưa có bài test nào được giao hoặc nộp.' : 'Chưa có bài nào được giao / chưa có kết quả.' }), h('a', { class: 'btn primary', href: '#/' }, 'Về trang chủ để giao bài')));
    else if (!vis.length) listHost.replaceChildren(h('div', { class: 'empty muted' }, 'Không có bài nào khớp tìm kiếm / bộ lọc. ', h('button', { class: 'btn small', type: 'button', onclick: () => { S.q = ''; search.value = ''; S.f = 'all'; draw(); } }, 'Xóa bộ lọc')));
    else listHost.replaceChildren(h('ul', { class: 'as-list' }, vis.slice((S.page - 1) * PAGE, S.page * PAGE).map(row)), vis.length > PAGE ? pager(S.page, pages, p => { S.page = p; draw(); }) : null);
    paintSel();
  }
  async function bulkDelete() {
    const chosen = (list || []).filter(a => S.sel.has(a.id)); if (!chosen.length) return;
    if (!(await confirmPurgeMany(chosen))) return;
    const gone = new Set(chosen.map(a => a.id));
    S.sel.clear(); list = list.filter(a => !gone.has(a.id)); draw();
    runDelete(kind, chosen, () => { if (alive) load(); });
  }
  load();
  return { destroy() { alive = false; } };
}

/* --- Bảng điều khiển một bài (từ vựng hoặc test) --- */
function StatsDetail(root, kind, id) {
  const K = STATS_KIND[kind], st = Settings.data, isAll = kind === 'vocab' && id === 'all';
  let alive = true, a = isAll ? { id: 'all', name: 'Tổng hợp tất cả bài từ vựng' } : { id, name: 'Đang tải…', _ph: 1 }, rows = null;
  const D = { tab: 'stud', F: { q: '', min: '', max: '', cls: '' }, split: false, rs: { sort: { key: 'submittedAt', dir: -1 }, page: 1 }, ss: { sort: { key: 'pct', dir: -1 }, page: 1 }, qsort: 'order' };
  const headHost = h('div'), bodyHost = h('div', { class: 'stack' });
  root.classList.add('wide');
  root.replaceChildren(h('div', { class: 'stack sx' }, h('a', { class: 'back-link', href: K.route }, '‹ Danh sách ' + K.label.toLowerCase()), headHost, bodyHost));
  bodyHost.append(loading('Đang tải kết quả…'));
  paintHead();
  if (!isAll) loadAsList(kind, (l, cached) => {
    if (!alive) return; const m = l.find(x => x.id === id);
    if (m) { a = m; paintHead(); } else if (!cached && a._ph && a.name === 'Đang tải…') { a = Object.assign({}, a, { name: 'Bài ' + id }); paintHead(); }
  }).catch(() => {});
  function paintHead() {
    const s = isAll ? null : asStatus(a), link = !isAll && assignLink(a, kind);
    const exp = rows ? exportMenu(kind === 'test' ? testExports() : vocabExports()) : null;
    headHost.replaceChildren(h('div', { class: 'card sx-hero' },
      h('div', { class: 'sx-hero-top' },
        h('div', { class: 'sx-hero-title' }, h('p', { class: 'eyebrow', text: K.icon + ' ' + K.label }), h('h1', { text: a.name || a.id })),
        h('div', { class: 'row wrap sx-actions' },
          !isAll ? h('button', { class: 'btn', type: 'button', disabled: !link && !a.link, onclick: () => shareModal(a, kind) }, '🔗 Link & QR') : null,
          exp,
          h('button', { class: 'btn', type: 'button', title: 'Tải lại kết quả', 'aria-label': 'Tải lại kết quả', onclick: () => loadRes(true) }, '⟳'),
          !isAll ? h('button', { class: 'btn danger', type: 'button', onclick: removeOne }, '🗑 Xóa bài') : null)),
      isAll ? h('p', { class: 'muted', text: 'Cộng điểm mọi lần làm của cùng một mã học sinh qua tất cả các bài từ vựng.' }) : h('div', { class: 'as-meta' },
        h('span', { class: 'badge ' + s, text: AS_STATUS[s] }), a.due ? h('span', { text: dueText(a) }) : h('span', { text: 'Không đặt hạn nộp' }),
        Array.isArray(a.codes) ? h('span', { text: a.codes.length ? `👤 Giao riêng ${a.codes.length} mã` : '👥 Giao chung cho mọi mã' }) : null,
        a.createdAt ? h('span', { text: 'Giao ngày ' + fmtDay(a.createdAt) }) : null)));
  }
  async function removeOne() {
    if (!(await confirmPurgeMany([a]))) return;
    runDelete(kind, [a]);
    location.hash = K.route;
  }
  async function loadRes(manual) {
    if (manual) { rows = null; delete Mem[K.resKey + id]; bodyHost.replaceChildren(loading('Đang tải kết quả…')); }
    try {
      await swr(K.resKey + id, async () => {
        const r = await API.get(st.scriptUrl, kind === 'test' ? { action: 'testResults', teacherKey: st.teacherKey, id } : { action: 'results', id, teacherKey: st.teacherKey });
        if (!r.ok) throw new Error(r.error === 'unauthorized' ? 'Teacher Key không đúng.' : (r.message || r.error));
        return kind === 'test' ? r.results : r;
      }, d => { if (alive) ingest(d); });
    } catch (e) {
      if (alive) bodyHost.replaceChildren(h('div', { class: 'box error', role: 'alert' }, h('p', { text: statsErrMsg(e.message) }), h('button', { class: 'btn small', type: 'button', onclick: () => loadRes(true) }, 'Thử lại')));
    }
  }
  function ingest(d) {
    if (kind === 'test') {
      rows = (d || []).map(x => { const score = Number(x.score) || 0, max = Number(x.max) || 0; return { name: String(x.name || ''), cls: String(x.cls || ''), score, max, pct: pct100(score, max), totalMs: Number(x.totalMs) || 0, submittedAt: x.submittedAt, late: !!x.late, lateN: x.late ? 1 : 0, items: Array.isArray(x.items) ? x.items : [] }; });
    } else {
      if (!isAll && d.assignment && a._ph) a = Object.assign({}, d.assignment, { id, _ph: 1 });
      rows = (d.results || []).map(x => { const det = x.details || [], score = Number(x.score) || 0, max = det.reduce((s, w) => s + (Number(w.max) || 10), 0);
        return { name: String(x.name || ''), cls: String(x.cls || ''), an: x.assignmentName || '', score, max, pct: pct100(score, max), words: det.length, totalWords: Number(x.totalWords) || 0, status: x.status || '',
          totalMs: Number(x.totalMs) || 0, weak: det.filter(Scoring.needsWork).length, submittedAt: x.submittedAt, details: det, late: !!x.late, lateN: x.late ? 1 : 0 }; });
    }
    paintHead(); layout();
  }
  const view = () => applyFilters(rows, D.F);
  const kpiHost = h('div', { class: 'kpis' }), histHost = h('div'), tabsHost = h('div'), tabBody = h('div', { class: 'stack', role: 'tabpanel' });
  function layout() {
    if (!rows.length) return bodyHost.replaceChildren(h('div', { class: 'card empty' }, h('p', { class: 'big-ic', text: '📭' }), h('p', { class: 'muted', text: 'Chưa có học sinh nào nộp bài này.' }),
      !isAll ? h('button', { class: 'btn primary', type: 'button', onclick: () => shareModal(a, kind) }, '🔗 Lấy link giao bài') : null));
    const classes = [...new Set(rows.map(r => r.cls))].filter(Boolean).sort();
    bodyHost.replaceChildren(kpiHost, h('div', { class: 'sx-split' }, histHost, h('div', { class: 'card stack' }, h('h2', { text: 'Bộ lọc' }), resultFilters(D.F, classes, () => { D.rs.page = 1; D.ss.page = 1; draw(); }),
      h('p', { class: 'hint', text: 'Bộ lọc áp dụng cho chỉ số, biểu đồ, các bảng bên dưới và file xuất.' }))),
      h('div', { class: 'card stack' }, tabsHost, tabBody));
    draw();
  }
  function draw() {
    const v = view(), pcts = v.map(r => r.pct), studs = byStud(v), n = v.length;
    const avg = n ? Math.round(pcts.reduce((s, p) => s + p, 0) / n) : 0, late = v.filter(r => r.late).length, avgMs = n ? v.reduce((s, r) => s + r.totalMs, 0) / n : 0;
    const filt = n !== rows.length ? `(lọc ${n}/${rows.length})` : '';
    if (kind === 'test') kpiHost.replaceChildren(kpi('Bài nộp', n, filt), kpi('Học sinh', studs.length), kpi('Điểm trung bình', n ? avg + '%' : '—', '', n ? pctTone(avg) : ''),
      kpi('Cao nhất', n ? Math.max(...pcts) + '%' : '—', n ? 'thấp nhất ' + Math.min(...pcts) + '%' : ''), kpi('Nộp trễ', late, '', late ? 'warn' : ''), kpi('Thời gian TB', n ? fmtTime(avgMs) : '—'));
    else { const done = v.filter(r => r.status === 'done' || !r.status).length;
      kpiHost.replaceChildren(kpi('Lượt nộp', n, filt), kpi('Học sinh', studs.length), kpi('Điểm trung bình', n ? avg + '%' : '—', n ? 'TB ' + (v.reduce((s, r) => s + r.score, 0) / n).toFixed(1) + ' điểm/lượt' : '', n ? pctTone(avg) : ''),
        kpi('Làm hết bài', n ? pct100(done, n) + '%' : '—', `${done}/${n} lượt`), kpi('Nộp trễ', late, '', late ? 'warn' : ''), kpi('Thời gian TB', n ? fmtTime(avgMs) : '—')); }
    histHost.replaceChildren(histogram(pcts));
    const third = kind === 'test' ? { k: 'q', label: '❓ Theo câu hỏi' } : { k: 'w', label: '⚠ Từ khó', n: statsTopWords(v, 30).length };
    tabsHost.replaceChildren(tabBar([{ k: 'stud', label: '👤 Theo học sinh', n: studs.length }, { k: 'res', label: kind === 'test' ? '🧾 Từng bài nộp' : '🧾 Từng lượt làm', n }, third], D.tab, k => { D.tab = k; draw(); }));
    if (D.tab === 'stud') drawStud(v, studs); else if (D.tab === 'res') drawRes(v); else if (D.tab === 'w') drawWords(v); else drawQuestions(v);
  }
  /* Theo học sinh */
  function byStud(v) {
    if (kind === 'test') {
      const m = new Map();
      v.forEach(x => {
        const key = Norm.text(x.name).toLowerCase() + (D.split ? '|' + Norm.text(x.cls).toLowerCase() : '');
        let e = m.get(key); if (!e) { e = { name: x.name, classes: new Set(), attempts: 0, total: 0, max: 0, best: 0, time: 0, last: '' }; m.set(key, e); }
        e.attempts++; e.total += x.score; e.max += x.max; e.best = Math.max(e.best, x.pct); e.time += x.totalMs; if (x.cls) e.classes.add(x.cls);
        if (String(x.submittedAt) > e.last) e.last = String(x.submittedAt);
      });
      return [...m.values()].map(e => ({ name: e.name, cls: [...e.classes].join(', '), attempts: e.attempts, total: round2(e.total), max: round2(e.max), pct: pct100(e.total, e.max), best: e.best, time: e.time, last: e.last }));
    }
    return statsByStudent(v, D.split).map(e => Object.assign(e, { pct: pct100(e.total, e.max) }));
  }
  function drawStud(v, studs) {
    const hasCls = rows.some(r => r.cls), host = h('div');
    const cols = [{ k: 'name', label: 'Mã HS / Họ tên', get: e => e.name }, ...(hasCls ? [{ k: 'cls', label: 'Lớp (cũ)', get: e => e.cls }] : []),
      { k: 'pct', label: '% điểm', el: e => meter(e.pct) }, { k: 'attempts', label: 'Số lần', num: 1, get: e => e.attempts },
      { k: 'total', label: 'Tổng điểm', num: 1, get: e => e.total + '/' + e.max },
      kind === 'test' ? { k: 'best', label: 'Cao nhất', num: 1, get: e => e.best + '%' } : { k: 'best', label: 'Lần cao nhất', num: 1, get: e => e.best },
      ...(kind === 'test' ? [] : [{ k: 'words', label: 'Từ đã làm', num: 1, get: e => e.words }]),
      { k: 'time', label: 'Tổng thời gian', num: 1, get: e => fmtTime(e.time) }, { k: 'last', label: 'Lần gần nhất', get: e => fmtShort(e.last) },
      { nosort: 1, label: '', el: e => h('button', { class: 'btn small', type: 'button', onclick: () => studModal(e, v) }, 'Xem') }];
    const redraw = () => pagedTable(host, cols, studs, D.ss, ['name', 'cls', 'last'], redraw);
    const weak = studs.filter(e => e.pct < 50).length;
    tabBody.replaceChildren(
      h('div', { class: 'row wrap between' }, h('p', { class: 'hint', text: 'Cộng điểm mọi lần làm của cùng một mã học sinh. Bấm tiêu đề cột để sắp xếp.' + (weak ? ` Có ${weak} học sinh dưới 50%.` : '') }),
        hasCls ? h('label', { class: 'check', for: 'sx-split' }, h('input', { type: 'checkbox', id: 'sx-split', checked: D.split, onchange: e => { D.split = e.target.checked; D.ss.page = 1; draw(); } }), 'Tách theo lớp (dữ liệu cũ)') : null),
      host);
    redraw();
  }
  function studModal(e, v) {
    const mine = v.filter(r => sameStudent(r, e, D.split)).sort((x, y) => String(y.submittedAt).localeCompare(String(x.submittedAt)));
    wideModal(Modal.open(e.name + (e.cls ? ' · ' + e.cls : ''), h('div', { class: 'stack' },
      h('div', { class: 'kpis' }, kpi('Số lần', e.attempts), kpi('% tổng', e.pct + '%', '', pctTone(e.pct)), kpi('Tổng thời gian', fmtTime(e.time))),
      h('div', { class: 'table-wrap' }, h('table', null, h('thead', null, h('tr', null, [...(isAll ? ['Bài'] : []), 'Điểm', '%', 'Thời gian', 'Nộp lúc', ''].map(c => h('th', { scope: 'col', text: c })))),
        h('tbody', null, mine.map(r => h('tr', null, isAll ? h('td', { style: 'white-space:normal', text: r.an }) : null, h('td', { class: 'num', text: r.score + '/' + r.max }), h('td', null, meter(r.pct)), h('td', { class: 'num', text: fmtTime(r.totalMs) }),
          h('td', { text: fmtShort(r.submittedAt) + (r.late ? ' (trễ)' : '') }), h('td', null, h('button', { class: 'btn small', type: 'button', onclick: () => attemptModal(r) }, 'Chi tiết'))))))))));
  }
  /* Từng lượt nộp */
  function drawRes(v) {
    const hasCls = rows.some(r => r.cls), host = h('div');
    const cols = [{ k: 'name', label: 'Mã HS / Họ tên', get: r => r.name }, ...(hasCls ? [{ k: 'cls', label: 'Lớp (cũ)', get: r => r.cls }] : []), ...(isAll ? [{ k: 'an', label: 'Bài', get: r => r.an }] : []),
      { k: 'pct', label: '% điểm', el: r => meter(r.pct) }, { k: 'score', label: 'Điểm', num: 1, get: r => r.score + '/' + r.max },
      ...(kind === 'test' ? [] : [{ k: 'words', label: 'Từ đã làm', num: 1, get: r => r.totalWords ? r.words + '/' + r.totalWords : r.words }, { k: 'status', label: 'Trạng thái', get: r => STATUS_LABEL[r.status] || '—' }, { k: 'weak', label: 'Từ yếu', num: 1, get: r => r.weak }]),
      { k: 'totalMs', label: 'Thời gian', num: 1, get: r => fmtTime(r.totalMs) },
      { k: 'submittedAt', label: 'Nộp lúc', el: r => h('span', null, fmtShort(r.submittedAt), r.late ? h('span', { class: 'badge expired', style: 'margin-left:.35rem', text: 'Trễ' }) : null) },
      { nosort: 1, label: '', el: r => h('button', { class: 'btn small', type: 'button', onclick: () => attemptModal(r) }, 'Chi tiết') }];
    const redraw = () => pagedTable(host, cols, v, D.rs, ['name', 'cls', 'an', 'status', 'submittedAt'], redraw);
    tabBody.replaceChildren(h('p', { class: 'hint', text: 'Mỗi dòng là một lần học sinh nộp (kể cả lần dừng sớm / tự lưu). Bấm “Chi tiết” để xem từng ' + (kind === 'test' ? 'câu trả lời.' : 'từ.') }), host);
    redraw();
  }
  function attemptModal(r) {
    const title = `${r.name} – ${r.score}/${r.max} (${r.pct}%)`;
    if (kind === 'test') return wideModal(Modal.open(title, h('div', { class: 'table-wrap' }, h('table', null, h('thead', null, h('tr', null, ['Câu hỏi', 'Dạng', 'Trả lời', 'Điểm'].map(c => h('th', { scope: 'col', text: c })))),
      h('tbody', null, r.items.map(it => h('tr', { class: it.ok === 'right' ? '' : 'bad-row' }, h('td', { style: 'white-space:normal;min-width:160px', text: it.q }), h('td', { text: QTYPES[it.t] || it.t }), h('td', { style: 'white-space:normal', text: it.a || '—' }), h('td', { class: 'num', text: it.g + '/' + it.m }))))))));
    wideModal(Modal.open(title, h('div', { class: 'stack' },
      h('p', { class: 'muted', text: [isAll ? r.an : '', STATUS_LABEL[r.status] || '', `${r.words}${r.totalWords ? '/' + r.totalWords : ''} từ`, fmtTime(r.totalMs), 'nộp ' + fmtShort(r.submittedAt) + (r.late ? ' (trễ)' : '')].filter(Boolean).join(' · ') }),
      r.details.length ? h('div', { class: 'table-wrap' }, h('table', null, h('thead', null, h('tr', null, ['Từ', 'Điểm', 'Gõ sai', 'Lượt xem', 'Bỏ qua', 'Thời gian'].map((c, i) => h('th', { scope: 'col', class: i ? 'num' : '', text: c })))),
        h('tbody', null, r.details.map(w => h('tr', { class: Scoring.needsWork(w) ? 'bad-row' : '' }, h('td', { text: w.word }), h('td', { class: 'num', text: (Number(w.score) || 0) + '/' + (Number(w.max) || 10) }),
          h('td', { class: 'num', text: w.wrongCount || 0 }), h('td', { class: 'num', text: w.views || 0 }), h('td', { class: 'num', text: w.skipped ? '✓' : '' }), h('td', { class: 'num', text: fmtTime(Number(w.timeMs) || 0) })))))) : h('p', { class: 'muted', text: 'Không có chi tiết từng từ.' }),
      h('p', { class: 'hint', text: 'Dòng tô đỏ: từ học sinh còn yếu (gõ sai, xem lại nhiều hoặc bỏ qua).' }))));
  }
  /* Từ khó (từ vựng) */
  function drawWords(v) {
    const top = statsTopWords(v, 30), mx = Math.max(1, ...top.map(t => t.wrong + t.extra + t.skip));
    tabBody.replaceChildren(top.length ? h('div', { class: 'stack' },
      h('p', { class: 'hint' }, 'Các từ học sinh gặp khó nhiều nhất. ', h('span', { class: 'lg w', text: 'Gõ sai' }), h('span', { class: 'lg v', text: 'Xem thêm' }), h('span', { class: 'lg s', text: 'Bỏ qua' })),
      h('div', { class: 'table-wrap' }, h('table', null, h('thead', null, h('tr', null, ['#', 'Từ', 'Gõ sai', 'Xem thêm', 'Bỏ qua', 'Số lượt', 'Mức độ'].map((t, i) => h('th', { scope: 'col', class: i > 1 && i < 6 ? 'num' : '', text: t })))),
        h('tbody', null, top.map((t, i) => h('tr', null, h('td', { class: 'muted', text: String(i + 1) }), h('td', null, h('strong', { text: t.word })), h('td', { class: 'num', text: t.wrong }), h('td', { class: 'num', text: t.extra }), h('td', { class: 'num', text: t.skip }), h('td', { class: 'num', text: t.n }),
          h('td', null, h('div', { class: 'hbar', role: 'img', 'aria-label': `${t.word}: ${t.wrong} lần sai, ${t.extra} lượt xem thêm, ${t.skip} lần bỏ qua`, style: `width:${Math.max(8, (t.wrong + t.extra + t.skip) / mx * 100)}%` },
            h('span', { class: 'w', style: `flex:${t.wrong}` }), h('span', { class: 'v', style: `flex:${t.extra}` }), h('span', { class: 's', style: `flex:${t.skip}` }))))))))) : h('div', { class: 'empty muted', text: '🎉 Chưa có từ nào bị sai, xem lại hoặc bỏ qua.' }));
  }
  /* Theo câu hỏi (test) */
  function qStats(v) {
    const qm = {}, order = [];
    v.forEach(x => x.items.forEach(it => { let o = qm[it.id]; if (!o) { o = qm[it.id] = { id: it.id, q: it.q, t: it.t, n: 0, right: 0, partial: 0 }; order.push(it.id); } o.n++; if (it.ok === 'right') o.right++; else if (it.ok === 'partial') o.partial++; }));
    return order.map((k, i) => { const o = qm[k]; return Object.assign(o, { idx: i + 1, pr: pct100(o.right, o.n), pp: pct100(o.partial, o.n), pw: o.n ? 100 - pct100(o.right, o.n) - pct100(o.partial, o.n) : 0 }); });
  }
  function drawQuestions(v) {
    let qs = qStats(v); if (D.qsort === 'hard') qs = qs.slice().sort((x, y) => x.pr - y.pr || y.pw - x.pw);
    const hard = qs.filter(o => o.pr < 50).length;
    tabBody.replaceChildren(
      h('div', { class: 'row wrap between' }, h('p', { class: 'hint', text: hard ? `${hard} câu có dưới 50% học sinh làm đúng – nên ôn lại.` : 'Tỉ lệ làm đúng của từng câu hỏi.' }),
        h('div', { class: 'kseg small', role: 'group', 'aria-label': 'Thứ tự câu' }, [['order', 'Theo thứ tự đề'], ['hard', 'Khó nhất trước']].map(([k, t]) => h('button', { type: 'button', 'aria-pressed': String(D.qsort === k), onclick: () => { D.qsort = k; draw(); } }, t)))),
      qs.length ? h('div', { class: 'table-wrap' }, h('table', null, h('thead', null, h('tr', null, ['#', 'Câu hỏi', 'Dạng', 'Đúng', 'Tỉ lệ (đúng / một phần / sai)'].map((c, i) => h('th', { scope: 'col', class: i === 3 ? 'num' : '', text: c })))),
        h('tbody', null, qs.map(o => h('tr', { class: o.pr < 50 ? 'bad-row' : '' }, h('td', { class: 'muted', text: String(o.idx) }), h('td', { style: 'white-space:normal;min-width:200px', text: o.q }), h('td', { class: 'small-text', text: QTYPES[o.t] || o.t }),
          h('td', { class: 'num' }, h('strong', { text: o.pr + '%' })),
          h('td', null, h('div', { class: 'hbar qbar', role: 'img', 'aria-label': `Đúng ${o.pr}%, một phần ${o.pp}%, sai hoặc bỏ trống ${o.pw}%` },
            h('span', { class: 'ok', style: `flex:${o.pr}` }), h('span', { class: 'v', style: `flex:${o.pp}` }), h('span', { class: 'w', style: `flex:${o.pw}` })))))))) : h('div', { class: 'empty muted', text: 'Chưa có dữ liệu câu hỏi.' }),
      h('p', { class: 'hint' }, h('span', { class: 'lg ok', text: 'Đúng' }), h('span', { class: 'lg v', text: 'Một phần' }), h('span', { class: 'lg w', text: 'Sai / bỏ trống' })));
  }
  /* Xuất file (theo bộ lọc hiện tại) */
  function vocabExports() {
    const cur = () => ({ id: a.id, name: a.name, due: a.due || 0 }), v = () => { const r = sortRows(view(), D.rs.sort); return { rows: r, studs: sortRows(byStud(r), D.ss.sort), top: statsTopWords(r) }; };
    return [['📄 CSV kết quả từng lượt', () => Exporter.csv(cur(), v().rows)], ['📄 CSV tổng theo học sinh', () => Exporter.csvStudents(cur(), v().studs)],
      ['📊 Excel (3 trang tính)', () => { const x = v(); Exporter.xlsx(cur(), x.rows, x.top, x.studs); }], ['🖨 PDF', () => { const x = v(); Exporter.pdf(cur(), x.rows, x.top, x.studs); }]];
  }
  function testExports() {
    const base = 'ket-qua-test_' + String(a.name || 'bai').replace(/[^\wÀ-ỹ-]+/g, '_').slice(0, 40) + '_' + new Date().toISOString().slice(0, 10);
    const resRows = () => sortRows(view(), D.rs.sort).map(x => ({ 'Mã HS / Họ tên': safeCell(x.name), 'Lớp (cũ)': safeCell(x.cls), 'Điểm': x.score, 'Tối đa': x.max, '%': x.pct, 'Thời gian (giây)': Math.round(x.totalMs / 1000), 'Nộp lúc': fmtDate(x.submittedAt), 'Trễ': x.late ? 'Trễ' : '' }));
    const studRows = () => sortRows(byStud(view()), D.ss.sort).map(e => ({ 'Mã HS / Họ tên': safeCell(e.name), 'Lớp (cũ)': safeCell(e.cls), 'Số lần làm': e.attempts, 'Tổng điểm': e.total, 'Tổng tối đa': e.max, '% tổng': e.pct, '% cao nhất': e.best, 'Tổng thời gian (giây)': Math.round(e.time / 1000), 'Lần gần nhất': fmtDate(e.last) }));
    const qRows = () => qStats(view()).map(o => ({ '#': o.idx, 'Câu hỏi': safeCell(o.q), 'Dạng': QTYPES[o.t] || o.t, 'Số lượt': o.n, '% đúng': o.pr, '% một phần': o.pp, '% sai/bỏ trống': o.pw }));
    const csv = (name, data) => { if (!window.Papa) return toast('Thư viện CSV chưa tải được.', 'error'); download(name, '﻿' + Papa.unparse(data), 'text/csv;charset=utf-8'); };
    return [['📄 CSV kết quả từng bài nộp', () => csv(base + '.csv', resRows())], ['📄 CSV tổng theo học sinh', () => csv(base + '_tong-theo-hs.csv', studRows())],
      ['📊 Excel (3 trang tính)', () => {
        if (!window.XLSX) return toast('Thư viện Excel chưa tải được.', 'error');
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resRows()), 'Kết quả');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(studRows()), 'Tổng theo học sinh');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(qRows()), 'Theo câu hỏi');
        XLSX.writeFile(wb, base + '.xlsx');
      }]];
  }
  loadRes();
  return { destroy() { alive = false; } };
}
function StatsView(root, id) { if (!statsGuard(root)) return {}; return id ? StatsDetail(root, 'vocab', id) : StatsHub(root, 'vocab'); }
function TestStatsView(root, id) { if (!statsGuard(root)) return {}; return id ? StatsDetail(root, 'test', id) : StatsHub(root, 'test'); }

/* ===================== 10c. EXPORTER (CSV / Excel / PDF) ===================== */
const Exporter = {
  fname(a, ext) { return 'ketqua_' + String((a && a.name) || 'bai').replace(/[^\w\u00C0-\u1EF9-]+/g, '_').slice(0, 40) + '_' + new Date().toISOString().slice(0, 10) + '.' + ext; },
  resultRows: rows => rows.map(r => Object.assign({ 'Mã HS / Họ tên': safeCell(r.name) }, rows.some(x => x.cls) ? { 'Lớp (cũ)': safeCell(r.cls) } : {}, r.an ? { 'Bài': safeCell(r.an) } : {},
    { 'Tổng điểm': r.score, 'Điểm tối đa': r.max, 'Từ đã làm': r.words, 'Tổng số từ': r.totalWords || '', 'Trạng thái': STATUS_LABEL[r.status] || '', 'Thời gian (giây)': Math.round(r.totalMs / 1000), 'Số từ yếu': r.weak, 'Nộp lúc': fmtDate(r.submittedAt) })),
  studentRows: st => st.map(e => Object.assign({ 'Mã HS / Họ tên': safeCell(e.name) }, st.some(x => x.cls) ? { 'Lớp (cũ)': safeCell(e.cls) } : {}, { 'Số lần làm': e.attempts, 'Tổng điểm': e.total, 'Tổng tối đa': e.max, 'Điểm cao nhất': e.best, 'Từ đã làm': e.words, 'Tổng thời gian (giây)': Math.round(e.time / 1000), 'Lần gần nhất': fmtDate(e.last) })),
  wordRows: top => top.map(t => ({ 'Từ': safeCell(t.word), 'Gõ sai': t.wrong, 'Số lần xem lại': t.extra, 'Bỏ qua': t.skip, 'Số học sinh': t.n })),
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
    const nm = (a && a.name) || '', hc = rows.some(r => r.cls) || studs.some(e => e.cls);   // cột Lớp chỉ hiện khi có dữ liệu cũ
    const pages = [
      ...this.tablePages('Tổng điểm theo mã học sinh: ' + nm, hc ? ['Mã HS / Họ tên', 'Lớp (cũ)', 'Số lần', 'Tổng điểm', 'Tổng tối đa', 'Cao nhất', 'Từ đã làm'] : ['Mã HS', 'Số lần', 'Tổng điểm', 'Tổng tối đa', 'Cao nhất', 'Từ đã làm'], hc ? [.28, .14, .1, .12, .12, .12, .12] : [.3, .12, .14, .14, .15, .15],
        studs.map(e => (hc ? [e.name, e.cls] : [e.name]).concat([String(e.attempts), String(e.total), String(e.max), String(e.best), String(e.words)]))),
      ...this.tablePages('Kết quả từng lần làm: ' + nm, hc ? ['Mã HS / Họ tên', 'Lớp (cũ)', 'Tổng điểm', 'Tối đa', 'Từ làm', 'Trạng thái', 'Thời gian', 'Nộp lúc'] : ['Mã HS', 'Tổng điểm', 'Tối đa', 'Từ làm', 'Trạng thái', 'Thời gian', 'Nộp lúc'], hc ? [.22, .09, .1, .07, .09, .15, .1, .18] : [.25, .11, .08, .1, .16, .12, .18],
        rows.map(r => (hc ? [r.name, r.cls] : [r.name]).concat([String(r.score), String(r.max), String(r.words), STATUS_LABEL[r.status] || '—', fmtTime(r.totalMs), fmtDate(r.submittedAt)]))),
      ...this.tablePages('Top từ gõ sai / xem lại / bỏ qua nhiều nhất', ['Từ', 'Gõ sai', 'Xem lại', 'Bỏ qua', 'Số HS'], [.4, .15, .15, .15, .15], top.map(t => [t.word, String(t.wrong), String(t.extra), String(t.skip), String(t.n)]))
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
      g.font = '20px ' + font.slice(5); g.fillStyle = '#555'; g.fillText(`Nhà Thầy Hưng · ${new Date().toLocaleString('vi-VN')} · Trang ${p + 1}/${n}`, M, H - 40);
      out.push(c);
    }
    return out;
  }
};

/* ===================== 11. ROUTER & KHỞI ĐỘNG ===================== */
/** Khóa chế độ học sinh: mở link giao bài xong thì tab này chỉ được ở trang làm bài (giao diện giáo viên không truy cập được) */
/* ===================== 9e. BÀI TEST (đề kiểm tra nhiều dạng câu hỏi) ===================== */
const QTYPES = { mcq: 'Trắc nghiệm (1 đáp án)', multi: 'Nhiều đáp án đúng', tf: 'Đúng / Sai', short: 'Trả lời ngắn', fill: 'Điền vào chỗ trống', match: 'Nối cặp', order: 'Sắp xếp thứ tự', essay: 'Tự luận (giáo viên chấm)' };
const Tests = makeCollection('tests', l => l.map(normTest), x => (x.updatedAt || 0) + ':' + (x.sections ? x.sections.length : 0) + ':' + qCount(x));
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
  let eng = null, ready = false, playing = false, poll = null, dead = false, failed = false, free = false, guardOff = null;
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
    used[q.id] = (used[q.id] || 0) + 1; playing = true; lockSession();
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
  /** Chặn điều khiển ở màn hình khóa / thông báo (tua, tạm dừng) trong lúc học sinh đang nghe */
  const lockSession = () => {
    if (review) return;
    try { const ms = navigator.mediaSession; if (!ms) return;
      ['pause', 'stop', 'seekto', 'seekbackward', 'seekforward', 'previoustrack', 'nexttrack'].forEach(a => { try { ms.setActionHandler(a, () => {}); } catch (_) {} }); } catch (_) {}
  };
  /** srcs: một hoặc nhiều địa chỉ dự phòng, thử lần lượt; hết mà không được mới gọi onFail */
  function mountMedia(srcs, isVideo, onFail) {
    srcs = [].concat(srcs); let k = 0, t = null, el = null;
    const drop = () => { clearTimeout(t); if (el) { try { el.pause(); el.removeAttribute('src'); el.load(); } catch (_) {} if (el.remove) el.remove(); el = null; } };
    const next = () => { if (dead || free) return; drop(); if (++k < srcs.length) load(); else onFail(); };
    function load() {
      el = document.createElement(isVideo ? 'video' : 'audio');
      el.preload = 'auto'; el.controls = false; el.setAttribute('playsinline', ''); el.setAttribute('controlsList', 'nodownload noplaybackrate'); el.disablePictureInPicture = true;
      if (isVideo) el.className = 'yt-media';
      const me = el;
      t = setTimeout(() => { if (me === el && !ready && !dead && !free) next(); }, srcs.length > 1 ? 9000 : 15000);
      el.addEventListener('loadedmetadata', () => { if (me !== el) return; clearTimeout(t); ready = true; refresh(); });
      el.addEventListener('error', () => { if (me !== el || dead || free) return; if (ready) { clearTimeout(t); onFail(); } else next(); });
      el.addEventListener('ended', () => { if (me === el) stop(); });
      el.addEventListener('pause', () => { if (me === el && playing && !el.ended) { try { el.play(); } catch (_) {} } });   // chống tạm dừng
      el.src = srcs[k]; host.append(el);
    }
    eng = { play() { try { el.currentTime = start; } catch (_) {} return el.play(); }, pause() { if (el) el.pause(); }, time: () => el ? el.currentTime : 0, destroy() { drop(); } };
    load();
  }
  /** Google Drive không phát trực tiếp được → dùng khung xem của Drive nhưng KHÓA sau khi học sinh bấm ▶:
   *  lớp phủ trong suốt chặn mọi thao tác (không tua / không tạm dừng), bỏ focus khỏi khung để phím Space không dừng được.
   *  Muốn nghe lại phải bấm “Nghe lại” (trừ một lượt). */
  function setGuarded(src) {
    killEngine(); free = true; ready = true; failed = false;
    box.classList.remove('compact'); box.classList.add('free', 'guard');
    cover.className = 'yt-cover'; cover.textContent = ''; cover.style.display = 'none';
    const fr = h('iframe', { src, title: 'Bài nghe', allow: 'autoplay; encrypted-media', referrerpolicy: 'strict-origin-when-cross-origin' });
    host.replaceChildren(fr); ext.style.display = 'none';
    let phase = 'idle';
    const sayLeft = () => max ? `Còn ${left()}/${max} lượt nghe` : 'Nghe không giới hạn số lần';
    function arm() {
      phase = 'idle'; fr.tabIndex = 0;
      if (left() === 0) { phase = 'done'; cover.className = 'yt-cover hide'; cover.style.display = ''; btn.style.display = 'none'; info.className = 'muted small-text'; info.textContent = 'Đã hết lượt nghe.'; return; }
      cover.style.display = 'none'; btn.style.display = 'none'; info.className = 'muted small-text';
      info.textContent = 'Bấm nút ▶ ở giữa khung để nghe (' + sayLeft().toLowerCase() + '). Khi đã bắt đầu sẽ không tạm dừng / tua được.';
    }
    function lock() {
      if (phase !== 'idle') return; phase = 'locked';
      used[q.id] = (used[q.id] || 0) + 1;
      cover.style.display = ''; fr.tabIndex = -1; try { fr.blur(); window.focus(); } catch (_) {}
      btn.className = 'btn small'; btn.disabled = false; btn.textContent = '↺ Nghe lại'; btn.style.display = left() > 0 ? '' : 'none';
      info.textContent = sayLeft();
    }
    btn.onclick = () => { if (phase !== 'locked' || left() === 0) return; fr.src = 'about:blank'; setTimeout(() => { if (!dead) { fr.src = src; arm(); } }, 60); };
    const onBlur = () => setTimeout(() => { if (!dead && phase === 'idle' && document.activeElement === fr) lock(); }, 0);   // học sinh vừa bấm vào khung Drive
    window.addEventListener('blur', onBlur); guardOff = () => window.removeEventListener('blur', onBlur);
    arm();
  }
  function mount() {
    if (med.kind === 'yt') return mountYt();
    if (med.kind === 'embed') return setFree(med.embed);
    if (med.kind === 'drive') return mountMedia(['https://drive.usercontent.google.com/download?id=' + med.id + '&export=download&confirm=t', 'https://drive.google.com/uc?export=download&id=' + med.id], true,
      () => review ? setFree('https://drive.google.com/file/d/' + med.id + '/preview', 'Google Drive phát trong khung riêng. (Nếu không có tiếng, giáo viên cần chia sẻ file ở chế độ “Bất kỳ ai có link”.)') : setGuarded('https://drive.google.com/file/d/' + med.id + '/preview'));
    if (med.kind === 'file' || med.kind === 'auto') return mountMedia(med.url, med.kind === 'auto' || !!med.video, () => giveUp('Không phát trực tiếp được link này (máy chủ chặn hoặc không phải file âm thanh/video). Bấm “Mở trong tab mới” để xem.'));
    giveUp('Link này không nhúng được vào bài. Bấm “Mở trong tab mới” để xem.');
  }
  refresh(); mount();
  return { isPlaying: () => playing, el: h('div', { class: 'audio' }, label ? h('strong', { class: 'audio-label', text: label }) : null, box,
    h('div', { class: 'row wrap' }, btn, info, ext)),
  destroy() { dead = true; if (guardOff) guardOff(); killEngine(); } };
}

/* ---------- Định dạng chữ trong đề (giáo viên bôi đen rồi chọn) ----------
   Lưu thẳng trong chuỗi văn bản bằng thẻ: [b]đậm[/b] [i]nghiêng[/i] [u]gạch chân[/u] [hl]tô vàng[/hl] [hl=g]tô xanh lá[/hl]
   Màu: y vàng · g xanh lá · p hồng · b xanh dương · o cam. Hiển thị bằng rich() (dựng DOM, không dùng innerHTML → an toàn XSS);
   thẻ thiếu đóng thì chỉ có hiệu lực đến hết đoạn, thẻ đóng thừa hiện nguyên văn. plain() bỏ thẻ để dùng cho so khớp / báo cáo. */
const RT_SRC = '\\[(\\/?)(b|i|u|hl)(?:=([ygpbo]))?\\]';
const plain = s => String(s == null ? '' : s).replace(new RegExp(RT_SRC, 'gi'), '');
const hasRich = s => new RegExp(RT_SRC, 'i').test(String(s == null ? '' : s));
/** Trả về DocumentFragment. st = { fmt: [] } (tùy chọn) để giữ định dạng đang mở qua nhiều đoạn văn (vd câu điền chỗ trống bị chia bởi ô nhập). */
function rich(text, st) {
  text = String(text == null ? '' : text);
  const frag = document.createDocumentFragment(), fmt = (st && st.fmt) || [], re = new RegExp(RT_SRC, 'gi');
  const put = s => {
    if (!s) return; let n = document.createTextNode(s);
    for (let k = fmt.length - 1; k >= 0; k--) {
      const f = fmt[k], el = document.createElement(f.t === 'hl' ? 'span' : f.t === 'b' ? 'strong' : f.t === 'i' ? 'em' : 'u');
      if (f.t === 'hl') el.className = 'tm-hl tm-' + f.c;
      el.append(n); n = el;
    }
    frag.append(n);
  };
  let last = 0, m;
  while ((m = re.exec(text))) {
    put(text.slice(last, m.index)); last = m.index + m[0].length;
    const t = m[2].toLowerCase();
    if (!m[1]) { fmt.push({ t, c: (m[3] || 'y').toLowerCase() }); continue; }
    let k = -1; for (let j = fmt.length - 1; j >= 0; j--) if (fmt[j].t === t) { k = j; break; }
    if (k < 0) put(m[0]); else fmt.splice(k, 1);          // thẻ đóng không có thẻ mở → giữ nguyên văn
  }
  put(text.slice(last)); return frag;
}
/** Thanh định dạng cho trình soạn bài test: áp dụng lên ô văn bản [data-rich] đang/đã được chọn gần nhất */
function FmtBar() {
  const COLORS = [['y', 'Vàng', '#fde047'], ['g', 'Xanh lá', '#86efac'], ['p', 'Hồng', '#f9a8d4'], ['b', 'Xanh dương', '#93c5fd'], ['o', 'Cam', '#fdba74']];
  let cur = null;
  const prevLbl = h('strong', { text: 'Xem trước: ' }), prevBody = h('span'), prev = h('div', { class: 'fmt-prev pre', hidden: true, 'aria-live': 'off' }, prevLbl, prevBody);
  const sync = () => {
    const v = cur && cur.isConnected ? cur.value : '', has = hasRich(v);
    prev.hidden = !has; if (has) prevBody.replaceChildren(rich(v));
  };
  /* Dùng execCommand để giữ lịch sử hoàn tác (Ctrl+Z); dự phòng setRangeText + phát sự kiện input */
  const edit = (el, from, to, text, selFrom, selTo) => {
    el.focus({ preventScroll: true }); el.setSelectionRange(from, to);
    const want = el.value.slice(0, from) + text + el.value.slice(to); let ok = false;
    try { ok = document.execCommand('insertText', false, text); } catch (_) { ok = false; }
    if (!ok || el.value !== want) { el.value = want; el.dispatchEvent(new Event('input', { bubbles: true })); }
    el.setSelectionRange(selFrom, selTo); sync();
  };
  function apply(el, kind, color) {
    if (!el || !el.isConnected) return toast('Hãy bấm vào ô soạn (câu hỏi, đoạn văn, lựa chọn…) rồi bôi đen chữ cần định dạng.', 'info');
    const v = el.value, s = el.selectionStart, e = el.selectionEnd;
    if (s == null) return;
    const isHl = kind === 'hl', c = color || 'y', open = isHl ? (c === 'y' ? '[hl]' : '[hl=' + c + ']') : '[' + kind + ']', close = '[/' + kind + ']';
    const openRe = isHl ? '\\[hl(?:=([ygpbo]))?\\]' : '\\[' + kind + '\\]', sel = v.slice(s, e);
    const reIn = new RegExp('^' + openRe, 'i'), reOut = new RegExp(openRe + '$', 'i');
    const sameColor = m => !isHl || (m[1] || 'y').toLowerCase() === c;
    let m;
    // 1) vùng chọn đã gồm cả thẻ mở + thẻ đóng ở hai đầu → bỏ (hoặc đổi màu)
    if ((m = sel.match(reIn)) && sel.toLowerCase().endsWith(close) && sel.length >= m[0].length + close.length) {
      const inner = sel.slice(m[0].length, sel.length - close.length);
      if (sameColor(m)) return edit(el, s, e, inner, s, s + inner.length);
      return edit(el, s, e, open + inner + close, s, s + open.length + inner.length + close.length);
    }
    // 2) thẻ nằm ngay ngoài vùng chọn → bỏ (hoặc đổi màu)
    const b = v.slice(0, s).match(reOut);
    if (b && v.slice(e, e + close.length).toLowerCase() === close) {
      const from = s - b[0].length, to = e + close.length;
      if (sameColor(b)) return edit(el, from, to, sel, from, from + sel.length);
      return edit(el, from, to, open + sel + close, from + open.length, from + open.length + sel.length);
    }
    // 3) thêm mới (đưa khoảng trắng đầu/cuối ra ngoài thẻ)
    const lead = (sel.match(/^\s*/) || [''])[0], core = sel.trim() ? sel.slice(lead.length).replace(/\s+$/, '') : '', trail = core ? sel.slice(lead.length + core.length) : '';
    const out = lead + open + core + close + trail, a = s + lead.length + open.length;
    edit(el, s, e, out, a, a + core.length);
  }
  function clear(el) {
    if (!el || !el.isConnected) return toast('Hãy bấm vào ô soạn rồi bôi đen chữ cần xóa định dạng.', 'info');
    let s = el.selectionStart, e = el.selectionEnd; if (s === e) { s = 0; e = el.value.length; }
    const old = el.value.slice(s, e), t = plain(old); if (t === old) return;
    edit(el, s, e, t, s, s + t.length);
  }
  const btn = (label, title, cls, fn, style) => h('button', { type: 'button', class: 'fmt-btn ' + cls, title, 'aria-label': title, style, onmousedown: ev => ev.preventDefault(), onclick: fn }, label);
  const el = h('div', { class: 'fmt-wrap' },
    h('div', { class: 'fmt-bar', role: 'toolbar', 'aria-label': 'Định dạng chữ' },
      h('span', { class: 'fmt-lbl', text: 'Định dạng chữ:' }),
      btn('B', 'In đậm (Ctrl+B)', 'fb', () => apply(cur, 'b')), btn('I', 'In nghiêng (Ctrl+I)', 'fi', () => apply(cur, 'i')), btn('U', 'Gạch chân (Ctrl+U)', 'fu', () => apply(cur, 'u')),
      h('span', { class: 'fmt-sep', 'aria-hidden': 'true' }),
      COLORS.map(([k, name, bg]) => btn('', 'Tô màu ' + name, 'fmt-sw', () => apply(cur, 'hl', k), 'background:' + bg)),
      h('span', { class: 'fmt-sep', 'aria-hidden': 'true' }),
      btn('✕ Xóa định dạng', 'Xóa định dạng trong vùng chọn (không chọn = cả ô)', 'fx', () => clear(cur))),
    h('p', { class: 'hint fmt-hint', text: 'Bôi đen chữ trong ô soạn (câu hỏi, đoạn văn, lựa chọn…) rồi bấm nút. Bấm lại lần nữa để bỏ. Định dạng hiện đúng khi học sinh làm bài.' }), prev);
  return { el,
    attach(page) {
      page.addEventListener('focusin', ev => { const t = ev.target; if (t && t.matches && t.matches('[data-rich]')) { cur = t; sync(); } });
      page.addEventListener('input', ev => { if (ev.target === cur) sync(); });
      page.addEventListener('keydown', ev => {
        const t = ev.target; if (!(ev.ctrlKey || ev.metaKey) || ev.altKey || ev.shiftKey || !t || !t.matches || !t.matches('[data-rich]')) return;
        const k = String(ev.key).toLowerCase(); if (k === 'b' || k === 'i' || k === 'u') { ev.preventDefault(); cur = t; apply(t, k); }
      });
    } };
}

/* ---------- Mô hình câu hỏi ---------- */
function newQ(type) {
  const q = { id: shortId(), type, text: '', pre: '', passage: '', img: '', yt: { url: '', start: '', end: '', plays: 2, hide: true }, points: Scoring.testDefault, expl: '' };
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
  const s = { id: q.id, type: q.type, text: cl(q.text, 2000), points: clamp(Number(q.points) || Scoring.testDefault, .25, 100) };
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
  delete t.questions; t.sections = t.sections.map(normSec); t.yt = Object.assign(defYt(1), t.yt || {});
  t.defaultPoints = clamp(Number(t.defaultPoints) || Scoring.testDefault || 10, .25, 100);   // điểm mặc định mỗi câu (áp cho câu mới / nút "Áp dụng cho tất cả")
  t.shufflePartsPerAttempt = !!t.shufflePartsPerAttempt;                                      // xáo ngẫu nhiên thứ tự các PHẦN mỗi lượt làm (độc lập với shuffleQ)
  return t;
}
/** Dạng dùng khi làm bài (đề gọn từ link/Sheet): chỉ gói đề cũ vào phần, không thêm trường mặc định */
function legacyWrap(t) {
  if (!Array.isArray(t.sections)) { t.sections = [{ id: 's1', title: '', instr: '', questions: t.questions || [] }]; delete t.questions; }
  return t;
}
const qCount = t => (t.sections || []).reduce((n, s) => n + s.questions.length, 0);
/** Điểm của một câu (tự luận = 0) và tổng điểm bài test, tính theo điểm TỪNG CÂU */
const qPts = (q, d) => q.type === 'essay' ? 0 : clamp(Number(q.points) || Number(d) || Scoring.testDefault || 10, .25, 100);
const testPoints = t => round2((t.sections || []).reduce((n, s) => n + s.questions.reduce((m, q) => m + qPts(q, t.defaultPoints), 0), 0));
function slimYt(y) { const vid = y && Media.store(y.url); return vid ? { url: vid, start: Yt.time(y.start), end: Yt.time(y.end), plays: clamp(parseInt(y.plays, 10) || 0, 0, 20), hide: y.hide !== false } : null; }
function slimSec(s) {
  const o = { id: s.id, title: cl(s.title, 100), instr: cl(s.instr, 1000), questions: s.questions.map(slimQ) };
  if (s.passage && s.passage.trim()) o.passage = cl(s.passage, 30000);
  if (s.img && /^https:\/\//i.test(s.img)) o.img = cl(s.img, 500);
  const y = slimYt(s.yt); if (y) o.yt = y; return o;
}
const slimTest = t => {
  if (!t.sections) normTest(t);
  const o = { name: cl(t.name, 80), desc: cl(t.desc, 500), limit: clamp(parseInt(t.limit, 10) || 0, 0, 300), shuffleQ: !!t.shuffleQ, shufflePartsPerAttempt: !!t.shufflePartsPerAttempt, defaultPoints: clamp(Number(t.defaultPoints) || Scoring.testDefault || 10, .25, 100), shuffleOpt: !!t.shuffleOpt, review: t.review !== false, sections: t.sections.slice(0, 50).map(slimSec) };
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
  const pts = q.type === 'essay' ? 0 : (Number(q.points) || Scoring.testDefault);
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
  s = String(s == null ? '' : s);
  return (q.type === 'short' || q.type === 'essay' || q.type === 'fill') ? s : plain(s);
}
function correctText(q) {
  const t = correctText0(q); return (q.type === 'mcq' || q.type === 'multi' || q.type === 'match' || q.type === 'order') ? plain(t) : t;
}
function correctText0(q) {
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
  /* Mọi thứ map theo id: oi = vị trí GỐC của câu / phần trong đề (để báo cáo & gửi điểm theo thứ tự cố định dù học sinh thấy thứ tự khác) */
  const orig = {}; let k = 0; t.sections.forEach(s => s.questions.forEach(q => { orig[q.id] = k++; }));
  const sOrig = new Map(t.sections.map((s, i) => [s, i]));
  const order = t.shufflePartsPerAttempt && t.sections.length > 1 ? shuffle(t.sections) : t.sections.slice();   // xáo PHẦN (độc lập với xáo câu)
  const secs = order.map((s, si) => {
    const base = t.shuffleQ ? shuffle(s.questions) : s.questions.slice();
    const qs = base.map(q => {
      const c = JSON.parse(JSON.stringify(q));
      c.perm = idx((c.opts || []).length); if (t.shuffleOpt && (c.type === 'mcq' || c.type === 'multi')) c.perm = shuffle(c.perm);
      c.rperm = shuffle(idx((c.pairs || []).length));
      let o = idx((c.items || []).length), tries = 0;
      if (o.length > 1) do { o = shuffle(o); } while (o.every((x, i) => c.items[x] === c.items[i]) && ++tries < 10);
      c.oinit = o; c.no = ++no; c.si = si; c.oi = orig[q.id] != null ? orig[q.id] : 1e6 + no; flat.push(c); return c;
    });
    return Object.assign({}, s, { qs, questions: null, oi: sOrig.get(s) });
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
      h('span', { class: 'ltr', text: String.fromCharCode(65 + k) }), h('span', { class: 'ot pre' }, rich(it.text)),
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
    const vals = (v || []).slice(), box = h('div', { class: 'fill pre' }), rst = { fmt: [] }; let bi = 0;
    fillParts(q.text).forEach(p => {
      if (p.t != null) return box.append(rich(p.t, rst));
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
      const sel = h('select', { 'aria-label': 'Ghép với: ' + plain(p[0]), disabled: !!rv, class: rv ? (ok ? 'right' : 'wrong') : '' },
        h('option', { value: '' }, '— chọn —'), q.rperm.map(j => h('option', { value: String(j), selected: vals[i] === j }, plain(q.pairs[j][1]))));
      if (!rv) sel.addEventListener('change', () => { vals[i] = sel.value === '' ? '' : Number(sel.value); set(vals.slice()); });
      box.append(h('div', { class: 'match-row' }, h('span', { class: 'ml pre' }, rich(p[0])), h('span', { 'aria-hidden': 'true', text: '→' }), sel));
    });
    return box;
  },
  order(q, v, set, rv) {
    let cur = (v && v.length === q.items.length) ? v.slice() : q.oinit.slice();
    const box = h('ol', { class: 'ord' });
    const mv = (k, d) => { const x = cur[k]; cur[k] = cur[k + d]; cur[k + d] = x; set(cur.slice()); draw(); const li = box.children[k + d], bs = li && li.querySelectorAll('button'); if (bs) (bs[d < 0 ? 0 : 1].disabled ? bs[d < 0 ? 1 : 0] : bs[d < 0 ? 0 : 1]).focus(); };
    function draw() {
      box.replaceChildren(cur.map((ix, k) => h('li', { class: rv ? (q.items[ix] === q.items[k] ? 'right' : 'wrong') : '' }, h('span', { class: 'ot pre' }, rich(q.items[ix])),
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
  if (q.pre) kids.unshift(h('div', { class: 'sec-instr pre' }, rich(q.pre)));
  if (q.passage) kids.push(h('div', { class: 'passage pre' }, rich(q.passage)));
  if (q.yt) { const a = AudioClip(q, st.used || {}, !!rv); kids.push(a.el); cleanup.push(a.destroy); }
  if (q.img) kids.push(zoomImg(q.img, 'Hình minh họa'));
  kids.push(q.type === 'fill' ? h('p', { class: 'muted small-text', text: 'Điền vào chỗ trống:' }) : h('h3', { class: 'q-text pre' }, rich(q.text)));
  kids.push(R[q.type](q, st.v, st.set || (() => {}), rv));
  if (rv) {
    const m = { right: ['ok', '✓ Chính xác'], partial: ['mid', '◐ Đúng một phần'], wrong: ['bad', '✗ Chưa đúng'], blank: ['bad', '— Chưa trả lời'], pending: ['mid', '✎ Chờ giáo viên chấm'] }[rv.ok];
    kids.push(h('div', { class: 'verdict ' + m[0], role: 'status', text: m[1] + (q.type === 'essay' ? '' : ` (${rv.got}/${rv.max} điểm)`) }));
    if (rv.ok !== 'right') {   // "Đáp án đúng" chỉ hiện khi chưa đúng
      const ct = correctText(q);
      if (ct) kids.push(h('div', { class: 'box' }, h('strong', { text: q.type === 'essay' ? 'Gợi ý đáp án: ' : 'Đáp án đúng: ' }), h('span', { class: 'pre', text: ct })));
    }
    // Giải thích: LUÔN hiện khi xem lại nếu giáo viên có viết (đúng / một phần / sai / trống / chờ chấm).
    // Câu chưa đúng mà chưa có giải thích → báo chưa có; câu đúng mà chưa có → không hiện khối này.
    if (q.expl) kids.push(h('div', { class: 'box expl' }, h('strong', { text: 'Giải thích: ' }), h('span', { class: 'pre' }, rich(q.expl))));
    else if (rv.ok !== 'right') kids.push(h('div', { class: 'box expl' }, h('strong', { text: 'Giải thích: ' }), h('span', { class: 'pre' }, 'Giáo viên chưa thêm giải thích cho câu này.')));
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
/* ---------- Highlight (bôi màu) văn bản khi làm bài ----------
   Học sinh bôi đen một đoạn chữ → hiện thanh chọn màu; chọn "Bỏ" (hoặc chọn lại đúng màu đang tô) để bỏ highlight.
   Dữ liệu lưu theo vị trí ký tự trong từng khung nên vẫn còn khi chuyển sang phần khác rồi quay lại. */
const HL = (() => {
  const COLORS = [['y', 'Vàng'], ['g', 'Xanh lá'], ['p', 'Hồng'], ['b', 'Xanh dương'], ['o', 'Cam']];
  const SKIP = 'input,textarea,select,option,button,audio,video,canvas,iframe,.zoom-wrap,.qno,.ltr,.mk,.dock';
  const roots = new Set(); let bar = null, pending = null, tmr = 0, hold = 0, bound = false;
  const textNodes = el => { const out = [], w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) out.push(n); return out; };
  const allowed = n => !(n.parentElement && n.parentElement.closest(SKIP));
  const offs = (el, node, off) => { const r = document.createRange(); r.selectNodeContents(el); r.setEnd(node, off); return r.toString().length; };
  const cut = (list, s, e) => { const out = []; list.forEach(x => { if (x.e <= s || x.s >= e) out.push(x); else { if (x.s < s) out.push({ s: x.s, e: s, c: x.c }); if (x.e > e) out.push({ s: e, e: x.e, c: x.c }); } }); return out; };
  const merge = list => { const out = []; list.slice().sort((a, b) => a.s - b.s).forEach(x => { const l = out[out.length - 1]; if (l && l.c === x.c && l.e >= x.s) l.e = Math.max(l.e, x.e); else out.push({ s: x.s, e: x.e, c: x.c }); }); return out; };
  const covered = (list, s, e, c) => { let pos = s; list.filter(x => x.c === c).sort((a, b) => a.s - b.s).forEach(x => { if (x.s <= pos && x.e > pos) pos = x.e; }); return pos >= e; };
  /** Vẽ lại các thẻ <mark> của một khung từ dữ liệu đã lưu */
  function paint(r) {
    const el = r.el;
    el.querySelectorAll('mark.hl').forEach(m => m.replaceWith(...m.childNodes));
    el.normalize();
    const list = merge(r.store[r.key] || []); if (!list.length) return;
    let pos = 0; const segs = [];
    textNodes(el).forEach(n => {
      const a = pos, b = pos + n.length; pos = b; if (!allowed(n)) return;
      const parts = []; list.forEach(x => { const s = Math.max(x.s, a), e = Math.min(x.e, b); if (e > s) parts.push([s - a, e - a, x.c]); });
      if (parts.length) segs.push([n, parts]);
    });
    segs.forEach(([n, parts]) => {
      for (let i = parts.length - 1; i >= 0; i--) {
        const [s, e, c] = parts[i], mid = s > 0 ? n.splitText(s) : n;
        if (e - s < mid.length) mid.splitText(e - s);
        const m = document.createElement('mark'); m.className = 'hl hl-' + c; mid.parentNode.insertBefore(m, mid); m.appendChild(mid);
      }
    });
  }
  function hide() { pending = null; if (bar) bar.hidden = true; }
  function place(rg) {
    const rects = rg.getClientRects(), first = rects.length ? rects[0] : rg.getBoundingClientRect(), last = rects.length ? rects[rects.length - 1] : first;
    const vw = document.documentElement.clientWidth, vh = window.innerHeight;
    if (last.bottom < 0 || first.top > vh) return hide();                         // vùng chọn đã cuộn ra ngoài màn hình
    const bw = bar.offsetWidth, bh = bar.offsetHeight;
    let y = last.bottom + 12; if (y + bh > vh - 8) y = first.top - bh - 12;          // ưu tiên đặt DƯỚI vùng chọn (menu Sao chép của hệ điều hành thường nằm trên)
    bar.style.left = clamp((last.left + last.right) / 2 - bw / 2, 6, vw - bw - 6) + 'px'; bar.style.top = clamp(y, 6, vh - bh - 6) + 'px';
  }
  function sync() {
    if (Date.now() - hold < 600) return;
    const sel = window.getSelection();
    if (!roots.size || !sel || !sel.rangeCount || sel.isCollapsed) return hide();
    const rg = sel.getRangeAt(0), root = Array.from(roots).find(r => r.el.contains(rg.commonAncestorContainer));
    if (!root || !rg.toString().trim()) return hide();
    const s = offs(root.el, rg.startContainer, rg.startOffset), e = offs(root.el, rg.endContainer, rg.endOffset);
    if (e <= s) return hide();
    const has = (root.store[root.key] || []).some(x => x.e > s && x.s < e);
    pending = { root, s, e };
    ensureBar().hidden = false; bar.classList.toggle('has', has); place(rg);
  }
  function applyHL(c) {
    const p = pending; if (!p) return;
    const list = p.root.store[p.root.key] || [];
    const color = c && covered(list, p.s, p.e, c) ? '' : c;                          // bấm lại đúng màu đang tô kín → bỏ highlight
    p.root.store[p.root.key] = merge(cut(list, p.s, p.e).concat(color ? [{ s: p.s, e: p.e, c: color }] : []));
    paint(p.root); const sel = window.getSelection(); if (sel) sel.removeAllRanges(); hide();
  }
  function ensureBar() {
    if (bar) return bar;
    bar = h('div', { class: 'hl-bar', role: 'toolbar', 'aria-label': 'Highlight văn bản', hidden: true },
      COLORS.map(([c, name]) => h('button', { type: 'button', class: 'hl-sw hl-' + c, 'data-c': c, 'aria-label': 'Highlight màu ' + name, title: name })),
      h('button', { type: 'button', class: 'hl-x', 'data-c': '', 'aria-label': 'Bỏ highlight', title: 'Bỏ highlight' }, '✕ Bỏ'));
    bar.addEventListener('pointerdown', e => { hold = Date.now(); e.preventDefault(); });          // giữ nguyên vùng chọn khi bấm nút
    bar.addEventListener('mousedown', e => e.preventDefault());
    bar.addEventListener('click', e => { const b = e.target.closest('button'); if (b) applyHL(b.dataset.c); });
    document.body.append(bar); return bar;
  }
  function bind() {
    if (bound) return; bound = true;
    document.addEventListener('selectionchange', () => { clearTimeout(tmr); tmr = setTimeout(sync, 220); });
    document.addEventListener('scroll', () => { if (bar && !bar.hidden) requestAnimationFrame(() => { hold = 0; sync(); }); }, true);
    window.addEventListener('resize', () => { if (bar && !bar.hidden) sync(); });
  }
  return {
    register(el, store, key) {
      const r = { el, store, key }; roots.add(r); bind(); paint(r);
      return () => { roots.delete(r); if (pending && pending.root === r) hide(); };
    }
  };
})();

/* ---------- Thanh chia giữa khung bài đọc và khung câu hỏi ----------
   Máy tính / ngang: thanh DỌC (kéo trái–phải). Điện thoại / máy tính bảng dọc: thanh NGANG (kéo lên–xuống).
   Kéo bằng chuột, cảm ứng hoặc bàn phím (phím mũi tên); bấm đúp để đặt lại. Chữ trong mỗi khung to / nhỏ theo kích thước khung. */
const SIDE_Q = '(min-width:861px), (max-height:560px) and (orientation:landscape)';   // trùng điều kiện "chia đôi trái–phải" trong style.css
function initSplit(split, pass, qpane, bars) {
  const zp = pass.querySelector('.zin'), zq = qpane.querySelector('.zin'), DEF_PH = 34, LO = 22, HI = 78;
  const mq = window.matchMedia ? window.matchMedia(SIDE_Q) : { matches: true };
  const L = Object.assign({ r: 50, ph: null }, Store.get('layout', {}));
  const side = () => !!mq.matches, save = () => Store.set('layout', { r: L.r, ph: L.ph });
  function apply() {
    split.style.setProperty('--c1', L.r + 'fr'); split.style.setProperty('--c2', (100 - L.r) + 'fr');
    if (L.ph != null) { split.style.setProperty('--ph', L.ph); split.classList.add('sized'); } else { split.style.removeProperty('--ph'); split.classList.remove('sized'); }
    let sp = 1, sq = 1;
    if (side()) { sp = clamp(L.r / 50, .7, 1.6); sq = clamp((100 - L.r) / 50, .7, 1.6); }
    else if (L.ph != null) { sp = clamp(L.ph / DEF_PH, .7, 1.6); sq = clamp((100 - L.ph) / (100 - DEF_PH), .8, 1.4); }
    zp.style.setProperty('--z', sp.toFixed(3)); zq.style.setProperty('--z', sq.toFixed(3));
    bars.forEach(b => b.setAttribute('aria-valuenow', String(Math.round(side() ? L.r : (L.ph == null ? DEF_PH : L.ph)))));
  }
  function start(e) {
    if (e.button > 0) return;
    e.preventDefault();
    const bar = e.currentTarget, isSide = side(), rect = split.getBoundingClientRect();
    try { bar.setPointerCapture(e.pointerId); } catch (_) {}
    bar.classList.add('drag'); document.body.classList.add('dragging-split', isSide ? 'ds-col' : 'ds-row');
    if (!isSide && L.ph == null) L.ph = clamp(pass.getBoundingClientRect().height / window.innerHeight * 100, 12, 72);
    const move = ev => {
      if (isSide) L.r = clamp((ev.clientX - rect.left) / rect.width * 100, LO, HI);
      else L.ph = clamp((ev.clientY - pass.getBoundingClientRect().top) / window.innerHeight * 100, 12, 72);
      apply();
    };
    const end = () => {
      bar.removeEventListener('pointermove', move); bar.removeEventListener('pointerup', end); bar.removeEventListener('pointercancel', end); bar.removeEventListener('lostpointercapture', end);
      bar.classList.remove('drag'); document.body.classList.remove('dragging-split', 'ds-col', 'ds-row'); save();
    };
    bar.addEventListener('pointermove', move); bar.addEventListener('pointerup', end); bar.addEventListener('pointercancel', end); bar.addEventListener('lostpointercapture', end);
  }
  const reset = () => { L.r = 50; L.ph = null; apply(); save(); };
  bars.forEach(b => {
    b.addEventListener('pointerdown', start); b.addEventListener('dblclick', reset);
    b.addEventListener('keydown', e => {
      if (e.key === 'Home' || e.key === 'Escape') { e.preventDefault(); return reset(); }
      const d = (e.key === 'ArrowLeft' || e.key === 'ArrowUp') ? -3 : (e.key === 'ArrowRight' || e.key === 'ArrowDown') ? 3 : 0;
      if (!d) return; e.preventDefault();
      if (side()) L.r = clamp(L.r + d, LO, HI); else L.ph = clamp((L.ph == null ? DEF_PH : L.ph) + d, 12, 72);
      apply(); save();
    });
  });
  apply();
  const on = () => apply();
  if (mq.addEventListener) mq.addEventListener('change', on); else if (mq.addListener) mq.addListener(on);
  return () => { if (mq.removeEventListener) mq.removeEventListener('change', on); else if (mq.removeListener) mq.removeListener(on); };
}

function SectionView(sec, ctx) {
  const rs = ctx.rs, cleanup = [];
  const frames = sec.qs.map(q => QFrame(q, q.no, { v: ctx.ans[q.id], set: v => ctx.set(q, v), used: ctx.used, flags: rs ? null : ctx.flags, onFlag: ctx.onFlag, res: rs ? rs[q.id] : null }));
  frames.forEach(f => cleanup.push(f.destroy));
  const extra = [];
  if (sec.instr) extra.push(h('div', { class: 'sec-instr pre' }, rich(sec.instr)));
  if (rs && sec.yt) { const a = AudioClip({ id: 'rv' + sec.id, yt: sec.yt }, {}, true, '🎧 Nghe lại'); extra.push(a.el); cleanup.push(a.destroy); }
  const pass = (sec.passage || sec.img) ? h('div', { class: 'pane pass', tabindex: '0', role: 'region', 'aria-label': 'Đoạn văn' }, h('div', { class: 'zin' },
    sec.title ? h('h2', { text: sec.title }) : null, sec.img ? zoomImg(sec.img, 'Hình minh họa của phần') : null,
    sec.passage ? h('div', { class: 'pre passage-text' }, rich(sec.passage)) : null)) : null;
  const qpane = h('div', { class: 'pane qs', role: 'region', 'aria-label': 'Câu hỏi' }, h('div', { class: 'zin stack' }, !pass && sec.title ? h('h2', { text: sec.title }) : null, extra, frames.map(f => f.el)));
  const mkBar = dir => h('div', { class: 'split-bar bar-' + dir, role: 'separator', tabindex: '0', 'aria-orientation': dir === 'v' ? 'vertical' : 'horizontal', 'aria-valuemin': '0', 'aria-valuemax': '100',
    'aria-label': 'Thanh chia: kéo để đổi kích thước khung bài đọc và khung câu hỏi (chữ to/nhỏ theo khung). Bấm đúp để đặt lại.', title: 'Kéo để đổi kích thước hai khung · bấm đúp để đặt lại' }, h('span', { class: 'grip' }));
  const barV = pass ? mkBar('v') : null, barH = pass ? mkBar('h') : null;
  const split = h('div', { class: 'split' + (pass ? ' has-bar' : ' one') }, pass ? h('div', { class: 'pass-wrap' }, pass, barH) : null, barV, qpane);
  if (pass) cleanup.push(initSplit(split, pass, qpane, [barV, barH]));
  if (ctx.hl) { cleanup.push(HL.register(qpane.querySelector('.zin'), ctx.hl, sec.id + ':q')); if (pass) cleanup.push(HL.register(pass.querySelector('.zin'), ctx.hl, sec.id + ':p')); }
  return { el: split, destroy() { cleanup.forEach(f => f()); },
    scrollTo(qid) { const e = qpane.querySelector('#qb-' + qid); if (e) { e.scrollIntoView({ behavior: 'smooth', block: 'center' }); const i = e.querySelector('input,select,textarea'); if (i && i.focus) i.focus({ preventScroll: true }); } } };
}
function TestRun(root, cfg) {
  const t = cfg.test, P = prepTest(t), secs = P.secs, flat = P.flat, N = flat.length, ans = {}, used = {}, flags = {}, done = {}, btns = {};
  const t0 = Date.now(), deadline = t.limit ? t0 + t.limit * 60000 : 0, hl = {};   // hl: các đoạn học sinh đã highlight (giữ khi đổi phần)
  let si = 0, view = null, finished = false, tick = null;
  const srcs = []; if (t.yt) srcs.push({ id: 'test', yt: t.yt, si: -1, label: '🎧 Bài nghe (toàn bài test)' });
  secs.forEach((s, i) => { if (s.yt) srcs.push({ id: 'sec' + s.id, yt: s.yt, si: i, label: '🎧 ' + (s.title || 'Bài nghe của phần ' + (i + 1)) }); });
  const dock = AudioDock(srcs, used);
  const timerEl = h('span', { class: 'pill', role: 'timer' }), prog = h('span', { class: 'pill' }), stage = h('div', { class: 'run-stage' }), nav = h('nav', { class: 'runnav', 'aria-label': 'Điều hướng các phần và câu hỏi' });
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
    })),
    secs.length > 1 ? h('div', { class: 'nav-arrows' }, h('button', { class: 'btn small', disabled: si === 0, onclick: () => show(si - 1) }, '‹ Phần trước'), h('button', { class: 'btn small', disabled: si === secs.length - 1, onclick: () => show(si + 1) }, 'Phần sau ›')) : null);
  }
  function show(i) {
    if (view) view.destroy(); si = i;
    view = SectionView(secs[i], { ans, set: setAns, used, flags, onFlag: updBtn, rs: null, hl });
    stage.replaceChildren(view.el); dock.sync(i); paintNav(); window.scrollTo(0, 0);
  }
  async function submit(auto) {
    if (finished) return;
    const un = flat.filter(q => !answered(q)).length;
    if (!auto && !await Modal.confirm(un ? `Còn ${un} câu chưa trả lời. Nộp bài ngay?` : 'Nộp bài? Sau khi nộp không thể sửa đáp án.', 'Nộp bài')) return;
    if (finished) return; finished = true; clearInterval(tick); window.onbeforeunload = null; if (view) view.destroy(); dock.destroy();
    const rl = flat.map(q => grade(q, ans[q.id])), rs = {}; flat.forEach((q, i) => { rs[q.id] = rl[i]; });
    cfg.onFinish({ score: round2(rl.reduce((s, r) => s + r.got, 0)), max: round2(rl.reduce((s, r) => s + r.max, 0)), totalMs: Math.min(Date.now() - t0, deadline ? t.limit * 60000 : Infinity), secs, flat, ans, rs, auto: !!auto,
      items: flat.map((q, i) => ({ q, r: rl[i] })).sort((a, b) => a.q.oi - b.q.oi).map(({ q, r }) => ({ id: q.id, q: plain(q.text).slice(0, 80), t: q.type, a: ansText(q, ans[q.id]).slice(0, 120), g: r.got, m: r.max, ok: r.ok })) });   // theo thứ tự GỐC của đề (không theo thứ tự học sinh thấy)
  }
  const clock = () => {
    if (!deadline) { timerEl.textContent = '⏱ ' + fmtTime(Date.now() - t0); return; }
    const left = deadline - Date.now(); timerEl.textContent = '⏳ Còn ' + fmtTime(Math.max(0, left)); timerEl.classList.toggle('warn', left < 300000);
    if (left <= 0) submit(true);
  };
  root.classList.add('wide');
  const de = document.documentElement, fsOK = !!(de.requestFullscreen || de.webkitRequestFullscreen), fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
  const fsBtn = fsOK ? h('button', { type: 'button', class: 'btn small', onclick: toggleFs }) : null;
  function paintFs() { if (!fsBtn) return; const on = !!fsEl(); fsBtn.textContent = on ? '🗗' : '⛶'; const l = on ? 'Thoát toàn màn hình' : 'Toàn màn hình'; fsBtn.title = l; fsBtn.setAttribute('aria-label', l); fsBtn.setAttribute('aria-pressed', String(on)); }
  function toggleFs() {
    const fail = () => toast('Thiết bị không cho phép toàn màn hình.', 'error');
    try {
      if (fsEl()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      else { const p = (de.requestFullscreen || de.webkitRequestFullscreen).call(de); if (p && p.catch) p.catch(fail); }
    } catch (_) { fail(); }
  }
  ['fullscreenchange', 'webkitfullscreenchange'].forEach(ev => document.addEventListener(ev, paintFs)); paintFs();
  const hud = h('div', { class: 'run-hud' }, h('strong', { class: 'run-title', text: cfg.title }), h('div', { class: 'grp' }, prog, timerEl, fsBtn, h('button', { class: 'btn primary small', onclick: () => submit(false) }, '✔ Nộp bài')));
  const runEl = h('div', { class: 'run-test' }, hud, dock.el, stage, nav);
  root.replaceChildren(runEl);
  /* Đo chiều cao thanh trên / thanh dưới → CSS dùng để (1) ghim đoạn văn ngay dưới thanh trên (điện thoại dọc),
     (2) tính chiều cao khung chia đôi (các chế độ còn lại) mà không bị thanh dưới che. */
  const fit = () => {
    const top = parseFloat(getComputedStyle(hud).top) || 0;
    runEl.style.setProperty('--hud-h', hud.offsetHeight + 'px');
    runEl.style.setProperty('--nav-h', nav.offsetHeight + 'px');
    runEl.style.setProperty('--stick-top', (top + hud.offsetHeight + 6) + 'px');
  };
  let ro = null; try { if (window.ResizeObserver) { ro = new ResizeObserver(fit); ro.observe(hud); ro.observe(nav); } } catch (_) { ro = null; }
  window.addEventListener('resize', fit); window.addEventListener('orientationchange', fit);
  prog.textContent = `Đã làm 0/${N}`; window.onbeforeunload = () => 'Bài test chưa nộp. Bạn có chắc muốn thoát?';
  clock(); tick = setInterval(clock, 1000); show(0); fit();
  return { destroy() { finished = true; clearInterval(tick); window.onbeforeunload = null; if (ro) ro.disconnect();
    ['fullscreenchange', 'webkitfullscreenchange'].forEach(ev => document.removeEventListener(ev, paintFs)); try { if (fsEl()) (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch (_) {} window.removeEventListener('resize', fit); window.removeEventListener('orientationchange', fit); if (view) view.destroy(); dock.destroy(); root.classList.remove('wide'); } };
}
/** Kết quả: điểm từng phần; bấm số câu → mở đúng phần đó (đoạn văn + mọi câu có đúng/sai, đáp án, giải thích) và cuộn tới câu */
function TestResult(root, o) {
  const r = o.res, t = o.test, pct = r.max ? Math.round(r.score / r.max * 100) : 0, N = r.flat.length;
  let view = null, cur = -1, focus = -1; const hlStore = {};
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
      view = SectionView(r.secs[i], { ans: r.ans, rs: r.rs, used: {}, flags: null, set: () => {}, hl: hlStore });
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
function saveTestAttempt(a, code, res, sid) {
  const att = Store.get('attempts', {}); att[a.id] = (att[a.id] || 0) + 1; Store.set('attempts', att);
  const psid = sid + '-pts', est = Math.round(res.score);
  if (!API.validUrl(a.scriptUrl)) { Sync.emit(sid, 'rejected', 'Bài chưa cấu hình nơi nhận kết quả.'); Sync.emit(psid, 'rejected', 'Bài chưa cấu hình máy chủ.'); }
  else {
    // điểm từng câu (đúng một phần → làm tròn), essay chờ chấm = 0; thứ tự theo đề
    /* Điểm từng câu theo thứ tự GỐC (tra theo id). Làm tròn dồn để tổng các phần tử = tổng điểm đã làm tròn (điểm câu có thể lẻ 0,25) */
    let cum = 0, prevR = 0;
    const correctPoints = res.flat.slice().sort((a, b) => (a.oi || 0) - (b.oi || 0)).map(q => { cum += Number(res.rs[q.id] && res.rs[q.id].got) || 0; const r = Math.round(cum), dd = r - prevR; prevR = r; return clamp(dd, 0, 100); });
    const correct = res.flat.filter(q => res.rs[q.id] && res.rs[q.id].ok === 'right').length;
    // Gửi bài làm TRƯỚC, điểm SAU: máy chủ chỉ cộng điểm khi đã có bài nộp cùng submissionId (hàng đợi gửi lần lượt theo thứ tự này)
    Sync.upsert({ submissionId: sid, url: a.scriptUrl, payload: { action: 'submitTest', submissionId: sid, code, token: Store.get('studentTok', ''), assignmentId: a.id, assignmentName: a.name, name: code, cls: '', score: res.score, maxScore: res.max, totalMs: res.totalMs,
      items: res.items, submittedAt: new Date().toISOString(), userAgent: navigator.userAgent, due: a.due, max: a.max } });
    Sync.upsert({ submissionId: psid, url: a.scriptUrl, payload: { action: 'submitResult', code, token: Store.get('studentTok', ''), kind: 'test', refId: a.id, submissionId: sid, correct, peeks: 0, correctPoints } });
  }
  return h('div', { class: 'stack' }, pointsPanel(psid, code, est), statusChip(sid));
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
    if (!API.validUrl(API.expand(q.s))) throw new Error('Link không hợp lệ: địa chỉ máy chủ không đúng.');
    const r = await API.get(API.expand(q.s), { action: 'getTest', id: q.id });
    if (!r.ok) throw new Error(r.error === 'not_found' ? 'Không tìm thấy bài test này trên máy chủ.' : (r.message || 'Không tải được bài test.'));
    const a = r.assignment; if (!a.test) throw new Error('Bài test chưa có câu hỏi.'); legacyWrap(a.test); if (!qCount(a.test)) throw new Error('Bài test chưa có câu hỏi.');
    return { id: a.id, name: a.name, test: a.test, due: Number(a.due) || 0, max: Number(a.max) || 0, req: !!a.req, scriptUrl: API.expand(q.s) };
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
      q.points = clamp(parseFloat(String(g('points')).replace(',', '.')) || Scoring.testDefault, .25, 100);
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
        const n = normTest({ id: uid(), name: nm, folder: cur.folder || '', tags: (cur.tags || []).slice(), desc: cur.desc || '', limit: cur.limit || 0, shuffleQ: !!cur.shuffleQ, shufflePartsPerAttempt: !!cur.shufflePartsPerAttempt, defaultPoints: cur.defaultPoints, shuffleOpt: !!cur.shuffleOpt, review: cur.review !== false, yt: cur.yt, sections: secs, updatedAt: Date.now() });
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
  const panel = () => Tests.list.length ? Library('test', { state: HomeState.tests, getItems: () => Tests.list, placeholder: '🔍 Tìm bài test theo tên, thư mục, thẻ…', size: x => qCount(x), sizeLabel: 'Nhiều câu nhất',
      makeCard: (t, ctx) => h('article', { class: 'card', 'aria-label': 'Bài test ' + t.name },
        cardTop('test', t, rerender),
        h('p', { class: 'muted small-text', text: `${t.sections.length} phần · ${qCount(t)} câu · ${testPoints(t)} điểm · ` + (t.limit ? t.limit + ' phút' : 'không giới hạn giờ') + ((t.yt && t.yt.url) || t.sections.some(s => s.yt && s.yt.url) ? ' · 🎧' : '') }),
        cardTags(t, ctx),
        h('div', { class: 'actions' }, h('a', { class: 'btn primary', href: '#/test-practice/' + t.id }, '▶ Làm thử'), h('button', { class: 'btn', onclick: () => openAssignTest(t) }, '📤 Giao bài'),
          h('a', { class: 'btn', href: '#/test-edit/' + t.id }, '✎ Sửa'), h('button', { class: 'btn', onclick: () => del(t) }, '🗑 Xóa')),
        h('div', { class: 'actions-2' }, h('button', { class: 'btn small ghost', onclick: () => dupTest(t) }, '⧉ Nhân bản'), h('button', { class: 'btn small ghost', onclick: () => joinTest(t) }, '⛓ Gộp'),
          h('button', { class: 'btn small ghost', onclick: () => openClassify('test', t, rerender) }, '🏷 Phân loại'))) })
      : h('div', { class: 'card empty' }, h('h2', { text: 'Chưa có bài test nào' }),
        h('p', { class: 'muted', text: 'Tạo bài test mới hoặc dán nguyên văn đề để app tự tách câu.' }),
        h('div', { class: 'row wrap', style: 'justify-content:center' },
          h('a', { class: 'btn primary', href: '#/test-edit/new' }, '📝 Tạo bài test'),
          h('button', { class: 'btn', onclick: () => openTextImport(textUse, false) }, '📄 Nhập đề từ văn bản')));
  return { panel, pasteText: () => openTextImport(textUse, false) };
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
          q2.text = text; if (!o.pts) q2.points = Scoring.testDefault;
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
          s.instr ? h('div', { class: 'muted small-text', text: 'Hướng dẫn: ' + plain(s.instr).slice(0, 120) }) : null,
          s.questions.map((q, i) => h('div', { class: 'small-text', text: `• ${QTYPES[q.type].split(' (')[0]}: ${plain(q.text).slice(0, 80) || '(chỗ trống)'}${q.type === 'mcq' || q.type === 'multi' ? ` [${q.opts.length} lựa chọn]` : ''} ${res.missQ.has(q) ? '⚠' : ''}` }))))));
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
  Prefs.touch('test', t.id);
  warmUp();
  const bad = testProblems(t);
  if (bad.length) return Modal.open('Bài test chưa hợp lệ', h('div', null, h('ul', null, bad.slice(0, 10).map(b => h('li', { text: b }))), h('a', { class: 'btn primary', href: '#/test-edit/' + t.id, onclick: () => document.querySelector('dialog.modal') && document.querySelector('dialog.modal').close() }, 'Mở trình soạn')));
  const due = h('input', { type: 'datetime-local', id: 'ta-due', value: toLocalInput(Date.now() + 7 * 864e5) });
  const max = h('input', { type: 'number', id: 'ta-max', min: 0, max: 20, value: 0 });
  const nameIn = h('input', { type: 'text', id: 'ta-name', maxlength: 80, value: t.name, autocomplete: 'off' });
  const out = h('div', { 'aria-live': 'polite', class: 'stack' }), go = h('button', { class: 'btn primary', onclick: create }, 'Giao bài & tạo link'), tg = targetPicker('ta');
  Modal.open('Giao bài test – ' + t.name, h('div', null,
    h('label', { for: 'ta-name', text: 'Tên bài giao (học sinh thấy tên này, và hiện trong Thống kê test)' }), nameIn,
    h('p', { class: 'hint', text: 'Đổi tên ở đây không làm đổi tên thẻ bài test. Để trống = dùng tên thẻ.' }),
    h('label', { for: 'ta-due', text: 'Hạn nộp (giờ máy bạn)' }), due, h('label', { for: 'ta-max', text: 'Số lần làm tối đa (0 = không giới hạn)' }), max,
    h('p', { class: 'hint', text: 'Học sinh đăng nhập bằng Mã học sinh (không nhập tên/lớp). Mỗi câu đúng được cộng điểm của câu (đặt trong trình soạn, mặc định 10).' }), tg.el, h('div', { class: 'row end' }, go), out));
  async function create() {
    const dueMs = new Date(due.value).getTime();
    if (!dueMs || dueMs <= Date.now()) return out.replaceChildren(h('p', { class: 'err', text: 'Hạn nộp phải ở tương lai.' }));
    if (!window.LZString) return out.replaceChildren(h('p', { class: 'err', text: 'Thư viện nén chưa tải được – kiểm tra mạng.' }));
    const st = Settings.data, url = st.scriptUrl, canSheet = API.validUrl(url) && !!st.teacherKey, test = slimTest(t), codes = tg.codes();
    if (tg.personal() && !codes.length) return out.replaceChildren(h('p', { class: 'err', text: 'Hãy nhập hoặc chọn ít nhất một mã học sinh.' }));
    if (tg.personal() && !canSheet) return out.replaceChildren(h('p', { class: 'err', text: 'Giao riêng theo mã cần kết nối Apps Script: vào Cài đặt → dán Apps Script URL + Teacher Key → Kiểm tra kết nối.' }));
    go.disabled = true; out.replaceChildren(loading('Đang tạo link…'));
    const a = { codes, id: shortId(), name: Norm.text(nameIn.value).slice(0, 80) || t.name, link: '', due: dueMs, max: clamp(parseInt(max.value, 10) || 0, 0, 20), req: false, shuffle: false, tts: {}, words: null };
    const base = location.href.split('#')[0], payload = { v: 1, id: a.id, n: a.name, test, due: a.due, max: a.max, req: a.req ? 1 : 0, u: API.validUrl(url) ? url : '' };
    let link = base + '#/taketest?d=' + Link.pack(payload), mode = 'inline', notes = [];
    const shortLink = base + '#/taketest?id=' + a.id + '&s=' + encodeURIComponent(API.short(url));
    a.link = link;       // lưu link lên Sheet để xem/copy lại trong Thống kê test
    const post = body => API.post(url, Object.assign({ action: 'saveTest', teacherKey: st.teacherKey, assignment: a }, body)).then(r => { if (!r.ok) throw new Error(r.message || r.error); });
    if (canSheet || link.length > 2000) {
      if (canSheet) { a.link = shortLink; try { await withRetry(() => post({ test })); link = shortLink; mode = 'sheet'; } catch (e) { mode = 'long'; notes.push('Không lưu được đề lên Google Sheet (' + e.message + '). Đang dùng link dài.' + (codes.length ? ' Bài CHƯA được giao cho các mã đã chọn – hãy bấm “Thử tạo link ngắn lại”.' : '')); } }
      else { mode = 'long'; notes.push('Link đang rất dài vì chưa kết nối Google Apps Script. Vào Cài đặt → dán Apps Script URL + Teacher Key → Kiểm tra kết nối, rồi bấm “Thử tạo link ngắn lại” để có link ngắn chia sẻ được qua Zalo/Messenger.'); }
    } else if (canSheet) { try { await post({ test: null }); } catch (e) { notes.push('Chưa đăng ký hạn nộp lên máy chủ (' + e.message + ').'); } }
    else notes.push('Chưa cấu hình Apps Script: học sinh làm được nhưng kết quả sẽ không được ghi về Sheet.');
    const box = h('textarea', { readonly: true, 'aria-label': 'Link giao bài test', style: 'min-height:90px;font-size:.8rem', onfocus: e => e.target.select() }); box.value = link;
    const canvas = h('canvas', { 'aria-label': 'Mã QR', role: 'img' });
    out.replaceChildren(h('p', { class: 'ok', text: mode === 'sheet' ? '✓ Link ngắn (đề đã lưu trên Google Sheet).' : '✓ Link chứa toàn bộ đề.' }),
      mode === 'sheet' ? h('p', { class: 'ok', text: codes.length ? `✓ Đã giao riêng cho ${codes.length} mã học sinh – bài hiện trong tab “Bài được giao” của các mã này.` : '✓ Đã giao cho tất cả mã học sinh – bài hiện trong tab “Bài được giao” ở trang học sinh.' }) : null,
      h('p', { class: 'hint', text: `Độ dài link: ${link.length} ký tự · Hạn: ${fmtDate(dueMs)}` }), ...notes.map(n => h('div', { class: 'box warn', text: n })),
      mode === 'long' ? h('div', { class: 'row wrap' }, h('button', { class: 'btn small', onclick: () => create() }, '↻ Thử tạo link ngắn lại')) : null,
      h('div', { class: 'box', text: 'Lưu ý: đáp án đúng nằm trong dữ liệu đề (ứng dụng không có máy chủ chấm điểm riêng) – phù hợp bài kiểm tra tại lớp / luyện tập, không phải thi nghiêm ngặt.' }), box,
      h('div', { class: 'row wrap' }, h('button', { class: 'btn primary', onclick: async () => toast(await copyText(link, box) ? 'Đã sao chép link.' : 'Hãy chọn và copy thủ công.') }, '📋 Copy link')), h('div', { class: 'qr' }, canvas));
    if (window.QRCode) QRCode.toCanvas(canvas, link, { width: 260, margin: 2, errorCorrectionLevel: 'L' }, err => { if (err) canvas.replaceWith(h('p', { class: 'err', text: 'Link quá dài để tạo mã QR. Hãy dùng link ngắn qua Google Sheet.' })); });
    else canvas.replaceWith(h('p', { class: 'err', text: 'Thư viện QR chưa tải được.' }));
    go.disabled = false;
  }
}

/* ---------- Trình soạn bài test (Bài test → Phần → Câu hỏi) ---------- */
function TestEditView(root, id) {
  let t = id === 'new' ? null : Tests.get(id), timer = null, dirty = false, secEls = {}, sumFns = [];
  if (id !== 'new' && !t) { root.replaceChildren(errorPanel('Không tìm thấy bài test này.')); return {}; }
  if (!t) t = { id: uid(), name: '', desc: '', limit: 0, shuffleQ: false, shuffleOpt: false, review: true, yt: defYt(1), sections: [newSec('Phần 1')], updatedAt: Date.now() };
  normTest(t);
  const openSecs = new Set(t.sections.length ? [t.sections[0].id] : []);
  const saved = h('span', { class: 'muted small-text', role: 'status' });
  const persist = () => {
    clearTimeout(timer); if (!t.name.trim() && !qCount(t)) return;
    t.updatedAt = Date.now(); if (!Tests.get(t.id)) Tests.list.unshift(t); if (Tests.save(t)) { dirty = false; saved.textContent = '✓ Đã lưu ' + new Date().toLocaleTimeString('vi-VN'); }
  };
  const touch = () => { dirty = true; saved.textContent = 'Đang chỉnh sửa…'; clearTimeout(timer); timer = setTimeout(persist, 1000); updTotals(); };
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
        const tx = h('input', { type: 'text', 'data-rich': '1', value: o, placeholder: 'Lựa chọn ' + String.fromCharCode(65 + k), 'aria-label': 'Lựa chọn ' + String.fromCharCode(65 + k), oninput: () => { q.opts[k] = tx.value; touch(); } });
        return h('div', { class: 'row' }, c, tx, h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Xóa lựa chọn', disabled: q.opts.length <= 2, onclick: () => { q.opts.splice(k, 1); q.ans = q.ans.filter(x => x !== k).map(x => x > k ? x - 1 : x); draw(); touch(); } }, '✕'));
      }), h('button', { class: 'btn small', type: 'button', disabled: q.opts.length >= 8, onclick: () => { q.opts.push(''); draw(); touch(); } }, '＋ Thêm lựa chọn'));
    draw(); return box;
  }
  function pairsEd(q) {
    const box = h('div', { class: 'stack' });
    const draw = () => box.replaceChildren(h('p', { class: 'hint', text: 'Mỗi dòng là một cặp đúng (vế trái – vế phải). Học sinh sẽ thấy vế phải bị xáo trộn.' }),
      q.pairs.map((p, k) => h('div', { class: 'row' }, h('input', { type: 'text', 'data-rich': '1', value: p[0], 'aria-label': 'Vế trái ' + (k + 1), placeholder: 'Vế trái', oninput: e => { p[0] = e.target.value; touch(); } }), h('span', { 'aria-hidden': 'true', text: '↔' }),
        h('input', { type: 'text', value: p[1], 'aria-label': 'Vế phải ' + (k + 1), placeholder: 'Vế phải', oninput: e => { p[1] = e.target.value; touch(); } }),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Xóa cặp', disabled: q.pairs.length <= 2, onclick: () => { q.pairs.splice(k, 1); draw(); touch(); } }, '✕'))),
      h('button', { class: 'btn small', type: 'button', disabled: q.pairs.length >= 10, onclick: () => { q.pairs.push(['', '']); draw(); touch(); } }, '＋ Thêm cặp'));
    draw(); return box;
  }
  function orderEd(q) {
    const box = h('div', { class: 'stack' });
    const draw = () => box.replaceChildren(h('p', { class: 'hint', text: 'Nhập các mục theo ĐÚNG thứ tự. Học sinh sẽ thấy thứ tự bị xáo trộn.' }),
      q.items.map((it, k) => h('div', { class: 'row' }, h('span', { class: 'pill', text: String(k + 1) }), h('input', { type: 'text', 'data-rich': '1', value: it, 'aria-label': 'Mục ' + (k + 1), oninput: e => { q.items[k] = e.target.value; touch(); } }),
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
        q.type === 'essay' ? null : h('label', { class: 'pts' }, 'Điểm ', inp(q, 'points', { type: 'number', min: .25, max: 100, step: .25, inputmode: 'decimal', style: 'width:90px' }, v => parseFloat(v) || t.defaultPoints)), h('span', { style: 'flex:1' }),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Chuyển lên', disabled: i === 0, onclick: () => mv(-1) }, '▲'), h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Chuyển xuống', disabled: i === sec.questions.length - 1, onclick: () => mv(1) }, '▼'),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Nhân đôi câu', onclick: () => { sec.questions.splice(i + 1, 0, Object.assign(normQ(q), { id: shortId() })); drawAll(); touch(); } }, '⧉'),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Xóa câu', onclick: () => { const x = sec.questions.splice(i, 1)[0]; drawAll(); touch(); toast('Đã xóa câu ' + no + '.', 'info', { label: 'Hoàn tác', onClick: () => { sec.questions.splice(Math.min(i, sec.questions.length), 0, x); drawAll(); touch(); } }); } }, '🗑')),
      prob ? h('p', { class: 'err small-text', text: '⚠ ' + prob }) : null,
      lab('Hướng dẫn nhóm câu (hiện phía trên câu này, vd “Questions 6–10 …”) – tùy chọn', area(q, 'pre', { rows: 2, 'data-rich': '1' })),
      lab(q.type === 'fill' ? 'Nội dung (đặt đáp án trong {{ }})' : 'Câu hỏi', area(q, 'text', { rows: 2, 'data-rich': '1', placeholder: q.type === 'fill' ? "I {{am|'m}} a student." : 'Nhập câu hỏi…' })),
      bodies[q.type](q),
      h('details', { class: 'box', open: !!(q.passage || q.img || yt.url) }, h('summary', { text: 'Riêng cho câu này: đoạn văn · âm thanh · hình ảnh (tùy chọn – nếu dùng chung cả phần hãy đặt ở phần)' }), h('div', { class: 'stack' },
        lab('Đoạn văn riêng của câu', area(q, 'passage', { rows: 3, 'data-rich': '1' })), ytFields(yt), lab('Link hình ảnh (https://…)', inp(q, 'img', { type: 'url', placeholder: 'https://…' })))),
      lab('Giải thích (hiện cho học sinh khi xem lại bài, cả câu đúng lẫn sai)', area(q, 'expl', { rows: 2, 'data-rich': '1' })));
  }
  function secEditor(s, si, offset) {
    const sum = h('summary', { class: 'sec-sum' }), body = h('div', { class: 'stack sec-body' });
    const setSum = () => { sum.textContent = `Phần ${si + 1}${s.title ? ': ' + s.title : ''} · ${s.questions.length} câu · ${round2(s.questions.reduce((m, q) => m + qPts(q, t.defaultPoints), 0))} điểm` + (s.passage ? ' · 📄' : '') + (s.yt && s.yt.url ? ' · 🎧' : ''); };
    setSum(); sumFns.push(setSum);
    const det = h('details', { class: 'card sec-ed', open: openSecs.has(s.id) }, sum, body); let built = false;
    const mvS = d => { const j = si + d; if (j < 0 || j >= t.sections.length) return; t.sections.splice(j, 0, t.sections.splice(si, 1)[0]); drawAll(); touch(); };
    function build() {
      built = true;
      const ti = inp(s, 'title', { maxlength: 100, placeholder: 'Ví dụ: Part 1 / Reading Passage 1 / Listening – Section 2' }); ti.addEventListener('input', setSum);
      const ps = area(s, 'passage', { rows: 8, 'data-rich': '1', class: 'sec-passage', placeholder: 'Dán đoạn văn dùng chung cho cả phần vào đây (nếu có). Giữ nguyên xuống dòng.' }); ps.addEventListener('input', setSum);
      body.replaceChildren(
        h('div', { class: 'row wrap' }, h('strong', { text: 'Thiết lập phần' }), h('span', { style: 'flex:1' }),
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Chuyển phần lên', disabled: si === 0, onclick: () => mvS(-1) }, '▲'), h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Chuyển phần xuống', disabled: si === t.sections.length - 1, onclick: () => mvS(1) }, '▼'),
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Nhân đôi phần', onclick: () => { const c = normSec(s); c.id = shortId(); c.title = (s.title + ' (bản sao)').trim(); c.questions.forEach(q => { q.id = shortId(); }); t.sections.splice(si + 1, 0, c); openSecs.add(c.id); drawAll(); touch(); } }, '⧉'),
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Xóa phần', onclick: async () => { if (s.questions.length && !await Modal.confirm(`Xóa "${s.title || 'Phần ' + (si + 1)}" cùng ${s.questions.length} câu hỏi?`, 'Xóa phần', true)) return; const x = t.sections.splice(si, 1)[0]; if (!t.sections.length) t.sections.push(newSec('Phần 1')); drawAll(); touch(); toast('Đã xóa phần.', 'info', { label: 'Hoàn tác', onClick: () => { t.sections.splice(Math.min(si, t.sections.length), 0, x); drawAll(); touch(); } }); } }, '🗑')),
        lab('Tiêu đề phần', ti), lab('Hướng dẫn làm phần (hiện đầu danh sách câu hỏi)', area(s, 'instr', { rows: 2, 'data-rich': '1', placeholder: 'Ví dụ: Read the text and answer questions 1–5.' })),
        lab('Đoạn văn dùng chung – hiện bên trái, các câu hỏi của phần hiện bên phải', ps), lab('Link hình ảnh dùng chung (https://…)', inp(s, 'img', { type: 'url' })),
        h('details', { class: 'box', open: !!s.yt.url }, h('summary', { text: '🎧 Âm thanh / video dùng chung cho cả phần (YouTube, Drive, mp3…)' }), ytFields(s.yt, 'Bài nghe nằm cố định trên đầu màn hình suốt thời gian học sinh làm các câu của phần này; học sinh bấm Nghe một lần, không tạm dừng/tua được.')),
        h('h3', { text: 'Câu hỏi của phần' }), s.questions.length ? s.questions.map((q, i) => qEditor(q, s, i, offset + i + 1)) : h('p', { class: 'muted', text: 'Chưa có câu hỏi trong phần này.' }),
        h('div', { class: 'row wrap' }, Object.keys(QTYPES).map(k => h('button', { class: 'btn small', type: 'button', onclick: () => addQ(s, k) }, '＋ ' + QTYPES[k]))));
    }
    det.addEventListener('toggle', () => { if (det.open) { openSecs.add(s.id); if (!built) build(); } else openSecs.delete(s.id); });
    if (det.open) build();
    return det;
  }
  function drawAll() { let off = 0; secEls = {}; sumFns = []; list.replaceChildren(t.sections.map((s, si) => { const el = secEditor(s, si, off); off += s.questions.length; secEls[s.id] = el; return el; })); shufBtn.disabled = t.sections.length < 2; updTotals(); }
  function addQ(s, type) {
    if (qCount(t) >= 500) return flash('Tối đa 500 câu mỗi bài test.');
    const nq = newQ(type); nq.points = t.defaultPoints; s.questions.push(nq); openSecs.add(s.id); drawAll(); touch();
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
  /* --- Điểm mặc định mỗi câu + tổng điểm --- */
  const ptsEl = h('input', { type: 'number', id: 'te-pts', min: .25, max: 100, step: .25, inputmode: 'decimal', value: t.defaultPoints, style: 'width:110px' });
  ptsEl.addEventListener('input', () => { const n = parseFloat(String(ptsEl.value).replace(',', '.')); if (n > 0) { t.defaultPoints = clamp(n, .25, 100); touch(); } });
  ptsEl.addEventListener('change', () => { ptsEl.value = t.defaultPoints; });
  const totalEl = h('p', { class: 'pts-total', role: 'status', 'aria-live': 'polite' });
  function updTotals() {
    const es = t.sections.reduce((a, s) => a + s.questions.filter(q => q.type === 'essay').length, 0);
    totalEl.textContent = `Tổng điểm: ${testPoints(t)} điểm · ${qCount(t)} câu` + (es ? ` (${es} câu tự luận không tính điểm)` : '');
    sumFns.forEach(f => f());
  }
  const applyPts = h('button', { class: 'btn', type: 'button', onclick: async () => {
    const qs = []; t.sections.forEach(s => s.questions.forEach(q => { if (q.type !== 'essay') qs.push(q); }));
    if (!qs.length) return flash('Chưa có câu hỏi nào để áp dụng.');
    const diff = qs.filter(q => Number(q.points) !== t.defaultPoints).length;
    if (!diff) return toast(`Tất cả ${qs.length} câu đã có ${t.defaultPoints} điểm.`);
    if (!await Modal.confirm(`Đặt ${t.defaultPoints} điểm cho tất cả ${qs.length} câu? ${diff} câu đang có điểm khác sẽ bị ghi đè.`, 'Áp dụng')) return;
    const old = qs.map(q => q.points); qs.forEach(q => { q.points = t.defaultPoints; }); drawAll(); touch();
    toast(`Đã đặt ${t.defaultPoints} điểm cho ${qs.length} câu.`, 'info', { label: 'Hoàn tác', onClick: () => { qs.forEach((q, i) => { q.points = old[i]; }); drawAll(); touch(); } });
  } }, '↳ Áp dụng cho tất cả câu');
  /* --- Xáo trộn thứ tự các PHẦN (đổi cố định trong đề) --- */
  const shufBtn = h('button', { class: 'btn', type: 'button', onclick: () => {
    if (t.sections.length < 2) return;
    const before = t.sections.slice(), titles = new Map(before.map(s => [s, s.title]));
    let next = shuffle(before), tries = 0; while (next.every((s, i) => s === before[i]) && ++tries < 10) next = shuffle(before);
    t.sections = next; t.sections.forEach((s, i) => { if (/^Phần \d+$/.test(s.title || '')) s.title = 'Phần ' + (i + 1); });   // tiêu đề mặc định "Phần N" đánh số lại theo thứ tự mới
    drawAll(); touch();
    toast(`Đã xáo trộn thứ tự ${t.sections.length} phần.`, 'info', { label: 'Hoàn tác', onClick: () => { t.sections = before; before.forEach(s => { s.title = titles.get(s); }); drawAll(); touch(); } });
  } }, '🔀 Xáo trộn phần');
  const fmt = FmtBar();
  root.replaceChildren(h('div', { class: 'stack' },
    h('div', { class: 'page-head' }, h('h1', { text: id === 'new' ? 'Tạo bài test' : 'Sửa bài test' }), h('div', { class: 'row wrap' }, saved,
      h('a', { class: 'btn', href: '#/', onclick: persist }, '‹ Về trang chủ'), h('button', { class: 'btn primary', onclick: () => { persist(); toast('Đã lưu bài test.'); } }, '💾 Lưu'))),
    fmt.el,
    h('section', { class: 'card' }, h('label', { for: 'te-name', text: 'Tên bài test' }), nameEl, h('label', { for: 'te-desc', text: 'Mô tả / hướng dẫn (tùy chọn)' }), descEl,
      h('label', { for: 'te-lim', text: 'Thời gian làm bài (phút, 0 = không giới hạn)' }), limEl,
      h('label', { for: 'te-pts', text: 'Điểm mặc định mỗi câu' }), h('div', { class: 'row wrap' }, ptsEl, applyPts),
      h('p', { class: 'hint', text: 'Câu mới thêm sẽ có số điểm này; sửa riêng từng câu ở ô “Điểm” của câu. Tự luận không tính điểm.' }), totalEl,
      chk('shuffleQ', 'Xáo trộn thứ tự câu hỏi (trong từng phần)'), chk('shufflePartsPerAttempt', 'Xáo trộn ngẫu nhiên thứ tự các phần mỗi lượt làm'),
      h('p', { class: 'hint', text: 'Hai tùy chọn xáo trộn câu / xáo trộn phần hoạt động độc lập. Nếu bài có âm thanh chạy liền cho cả bài, nên tắt xáo trộn phần.' }), chk('shuffleOpt', 'Xáo trộn thứ tự lựa chọn (trắc nghiệm)'), chk('review', 'Cho học sinh xem đáp án đúng & giải thích sau khi nộp'),
      h('details', { class: 'box', open: !!t.yt.url, style: 'margin-top:.6rem' }, h('summary', { text: '🎧 Âm thanh cho CẢ bài test (tùy chọn)' }), ytBox)),
    h('p', { class: 'hint', text: 'Mỗi PHẦN gom một đoạn văn / bài nghe dùng chung cho nhiều câu hỏi. Khi làm bài, đoạn văn hiện bên trái, câu hỏi bên phải (như IELTS / Cambridge).' }),
    list,
    h('div', { class: 'row wrap' }, shufBtn, h('button', { class: 'btn primary', onclick: () => { const s = newSec('Phần ' + (t.sections.length + 1)); t.sections.push(s); openSecs.add(s.id); drawAll(); touch(); secEls[s.id].scrollIntoView({ block: 'start' }); } }, '＋ Thêm phần')),
    h('section', { class: 'card' }, h('h2', { text: 'Nhập đề' }), h('div', { class: 'row wrap' },
      h('button', { class: 'btn primary', onclick: () => openTextImport((r, how) => applyImport(r, how, ''), true) }, '📄 Nhập từ văn bản (dán đề)'),
      h('label', { class: 'btn', style: 'margin:0;cursor:pointer' }, '⬆ Nhập từ CSV/Excel', fileIn),
      h('button', { class: 'btn', onclick: () => csvDownload('mau-bai-test.csv', SAMPLE_TEST) }, '⬇ Tải file CSV mẫu'),
      h('button', { class: 'btn', onclick: () => { if (!qCount(t)) return flash('Chưa có câu hỏi.'); csvDownload((t.name || 'bai-test').replace(/[^\w\-]+/g, '_') + '.csv', t); } }, '⬇ Xuất bài này ra CSV'))),
    h('div', { class: 'row wrap' }, h('a', { class: 'btn', href: '#/test-practice/' + t.id, onclick: e => { persist(); if (!Tests.get(t.id)) { e.preventDefault(); flash('Hãy thêm tên hoặc câu hỏi trước.'); } } }, '▶ Làm thử'),
      h('button', { class: 'btn', onclick: () => { persist(); if (Tests.get(t.id)) openAssignTest(t); else flash('Hãy thêm tên hoặc câu hỏi trước.'); } }, '📤 Giao bài'))));
  drawAll(); fmt.attach(root.firstElementChild);
  return { destroy() { if (dirty) persist(); clearTimeout(timer); } };
}

/* ===================== 10d. MẬT KHẨU TRUY CẬP APP ===================== */
/** SHA-256 thuần JS (không phụ thuộc crypto.subtle nên chạy cả khi mở file trực tiếp / http). */
const sha256 = (() => {
  const K = [], H0 = [];
  for (let n = 2, c = 0; c < 64; n++) {
    let p = true; for (let i = 2; i * i <= n; i++) if (n % i === 0) { p = false; break; }
    if (!p) continue;
    if (c < 8) H0[c] = (Math.pow(n, 1 / 2) % 1) * 4294967296 | 0;
    K[c++] = (Math.pow(n, 1 / 3) % 1) * 4294967296 | 0;
  }
  return msg => {
    const b = new TextEncoder().encode(String(msg)), l = b.length, n = ((l + 9 + 63) >> 6) << 4, w = new Uint32Array(n), W = new Uint32Array(64);
    for (let i = 0; i < l; i++) w[i >> 2] |= b[i] << (24 - (i % 4) * 8);
    w[l >> 2] |= 0x80 << (24 - (l % 4) * 8); w[n - 1] = (l * 8) >>> 0; w[n - 2] = Math.floor(l * 8 / 4294967296);
    let H = H0.slice();
    for (let o = 0; o < n; o += 16) {
      for (let i = 0; i < 16; i++) W[i] = w[o + i];
      for (let i = 16; i < 64; i++) {
        const x = W[i - 15], y = W[i - 2];
        W[i] = (W[i - 16] + (((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3)) + W[i - 7] + (((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10))) | 0;
      }
      let [a, b2, c, d, e, f, g, hh] = H;
      for (let i = 0; i < 64; i++) {
        const t1 = (hh + (((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))) + ((e & f) ^ (~e & g)) + K[i] + W[i]) | 0;
        const t2 = ((((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))) + ((a & b2) ^ (a & c) ^ (b2 & c))) | 0;
        hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b2; b2 = a; a = (t1 + t2) | 0;
      }
      H = [H[0] + a | 0, H[1] + b2 | 0, H[2] + c | 0, H[3] + d | 0, H[4] + e | 0, H[5] + f | 0, H[6] + g | 0, H[7] + hh | 0];
    }
    return H.map(x => (x >>> 0).toString(16).padStart(8, '0')).join('');
  };
})();
/** Mật khẩu đơn giản: mã băm SHA-256 nằm ở index.html (window.SM_PASS_HASH). Để trống = không đặt mật khẩu.
 *  Ghi nhớ đăng nhập: lưu mã băm + hạn vào localStorage; đổi mật khẩu ở index.html thì mọi thiết bị tự bị đăng xuất.
 *  Lưu ý: đây là "cửa chắn" phía trình duyệt (ngăn người lạ dùng app), không phải bảo mật cứng – dữ liệu thật trên Google Sheet vẫn được bảo vệ bằng Teacher Key ở máy chủ. */
const Auth = {
  DAYS: 30,
  hash() { return String(window.SM_PASS_HASH || '').trim().toLowerCase(); },
  enabled() { return /^[0-9a-f]{64}$/.test(this.hash()); },
  ok() {
    if (!this.enabled()) return true;
    const hs = this.hash();
    for (const S of ['localStorage', 'sessionStorage']) {
      try { const v = JSON.parse(window[S].getItem('sm_auth') || 'null'); if (v && v.h === hs && (!v.exp || v.exp > Date.now())) return true; } catch (_) {}
    }
    return false;
  },
  login(pw, remember) {
    const hs = this.hash(); if (sha256(pw) !== hs) return false;
    const val = JSON.stringify({ h: hs, exp: remember ? Date.now() + this.DAYS * 864e5 : 0 });
    try { window[remember ? 'localStorage' : 'sessionStorage'].setItem('sm_auth', val); window[remember ? 'sessionStorage' : 'localStorage'].removeItem('sm_auth'); } catch (_) {}
    return true;
  },
  logout() { ['localStorage', 'sessionStorage'].forEach(S => { try { window[S].removeItem('sm_auth'); } catch (_) {} }); }
};
function LoginView(root) {
  let fails = 0, wait = 0, timer = null;
  const pw = h('input', { type: 'password', id: 'lg-pw', autocomplete: 'current-password', autocapitalize: 'off', spellcheck: 'false', 'aria-describedby': 'lg-err' });
  const rem = h('input', { type: 'checkbox', id: 'lg-rem', checked: true });
  const err = h('p', { class: 'err', id: 'lg-err', role: 'alert' });
  const go = h('button', { class: 'btn primary big', type: 'submit' }, 'Đăng nhập');
  const eye = h('button', { class: 'btn', type: 'button', 'aria-pressed': 'false', 'aria-label': 'Hiện mật khẩu', title: 'Hiện / ẩn mật khẩu', onclick: () => {
    const on = pw.type === 'password'; pw.type = on ? 'text' : 'password'; eye.setAttribute('aria-pressed', String(on)); eye.setAttribute('aria-label', on ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'); eye.textContent = on ? '🙈' : '👁'; } }, '👁');
  function lock(sec) {
    wait = Date.now() + sec * 1000; go.disabled = true; clearInterval(timer);
    timer = setInterval(() => { const left = Math.ceil((wait - Date.now()) / 1000); if (left <= 0) { clearInterval(timer); go.disabled = false; err.textContent = ''; } else err.textContent = `Sai mật khẩu. Thử lại sau ${left} giây.`; }, 250);
  }
  function submit(e) {
    e.preventDefault();
    if (Date.now() < wait) return;
    if (Auth.login(pw.value, rem.checked)) { clearInterval(timer); Router.render(); return; }
    fails++; pw.value = ''; pw.focus();
    if (fails >= 3) lock(Math.min(30, 2 * (fails - 2))); else err.textContent = 'Sai mật khẩu. Vui lòng thử lại.';
  }
  root.replaceChildren(h('form', { class: 'card stack login-card', onsubmit: submit, novalidate: true },
    h('h1', { text: '🔐 Đăng nhập' }),
    h('p', { class: 'muted', text: 'Nhập mật khẩu để vào Nhà Thầy Hưng.' }),
    h('label', { for: 'lg-pw', text: 'Mật khẩu' }), h('div', { class: 'pw-row' }, pw, eye),
    h('label', { class: 'check', for: 'lg-rem' }, rem, `Ghi nhớ đăng nhập trên thiết bị này (${Auth.DAYS} ngày)`),
    err, go,
    h('p', { class: 'hint', text: 'Học sinh vào bằng link giao bài thì không cần mật khẩu.' })));
  setTimeout(() => pw.focus(), 0);
  return { destroy() { clearInterval(timer); } };
}
/** Công cụ tạo mã mật khẩu (băm SHA-256) để dán vào index.html – mở bằng #/tao-mat-khau */
function PassTool(root) {
  const pw = h('input', { type: 'text', id: 'pt-pw', autocomplete: 'off', spellcheck: 'false', placeholder: 'Nhập mật khẩu mới' });
  const out = h('textarea', { readonly: true, 'aria-label': 'Đoạn mã dán vào index.html', style: 'min-height:84px;font-size:.8rem', onfocus: e => e.target.select() });
  const upd = () => { out.value = pw.value ? `<script>window.SM_PASS_HASH = "${sha256(pw.value)}";</script>` : ''; };
  pw.addEventListener('input', upd);
  root.replaceChildren(h('div', { class: 'card stack', style: 'max-width:640px;margin:0 auto' },
    h('h1', { text: '🔑 Tạo mã mật khẩu' }),
    h('p', { class: 'muted', text: 'Gõ mật khẩu mong muốn, sao chép đoạn mã bên dưới và thay vào dòng <script>window.SM_PASS_HASH = …</script> trong index.html (rồi đăng lại lên host). Mật khẩu không được lưu ở đâu – chỉ mã băm một chiều nằm trong index.html.' }),
    h('label', { for: 'pt-pw', text: 'Mật khẩu mới' }), pw, out,
    h('div', { class: 'row wrap' }, h('button', { class: 'btn primary', type: 'button', onclick: async () => { if (!out.value) return; toast(await copyText(out.value, out) ? 'Đã sao chép.' : 'Hãy chọn và copy thủ công.'); } }, '📋 Copy đoạn mã'), h('a', { class: 'btn', href: '#/' }, 'Về trang chủ')),
    h('p', { class: 'hint', text: 'Để trống mã (SM_PASS_HASH = "") nếu muốn tắt mật khẩu. Đổi mã thì mọi thiết bị đang ghi nhớ đăng nhập sẽ tự bị đăng xuất.' })));
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
  const items = [['#/', 'Trang chủ', '/'], Settings.data.teacherOk ? ['#/stats', 'Thống kê', '/stats'] : null, ['#/settings', 'Cài đặt', '/settings'], Auth.enabled() ? ['#/logout', 'Đăng xuất', '/logout'] : null].filter(Boolean);
  $('#nav').replaceChildren(...items.map(([href, t, p]) => h('a', { href, 'aria-current': path === p || (p === '/stats' && path === '/teststats') ? 'page' : null }, t)));
}
const Router = {
  cur: null,
  render() {
    Modal.closeAll();
    if (this.cur && this.cur.destroy) this.cur.destroy();
    const raw = location.hash.replace(/^#/, '') || '/';
    const k = raw.indexOf('?'), path = k < 0 ? raw : raw.slice(0, k), query = k < 0 ? '' : raw.slice(k + 1);
    const root = $('#app'); root.classList.remove('wide');
    const isAssign = path === '/assign' || path === '/taketest', student = Lock.applies();
    if (isAssign && student) Lock.set('#' + raw);
    if (!isAssign && student && Lock.get()) { location.replace(Lock.get()); return; }   // đang ở chế độ học sinh → đưa về bài đang làm
    if (path === '/logout') { Auth.logout(); history.replaceState(null, '', '#/'); this.render(); return; }
    if (!isAssign && path !== '/tao-mat-khau' && !Auth.ok()) {       // chưa đăng nhập → chỉ hiện màn hình mật khẩu (link giao bài của học sinh luôn mở được)
      document.body.dataset.route = 'app'; $('#nav').replaceChildren(); $('.brand').setAttribute('href', '#/'); document.title = 'Đăng nhập – Nhà Thầy Hưng';
      this.cur = LoginView(root); return;
    }
    document.body.dataset.route = isAssign ? 'assign' : 'app';
    const brand = $('.brand');
    const fromHs = isAssign && /(?:^|&)hs=1(?:&|$)/.test(query);              // mở từ tab "Bài được giao" ở trang học sinh
    if (fromHs) brand.setAttribute('href', 'hoc-sinh.html#bai-giao'); else if (isAssign && student) brand.removeAttribute('href'); else brand.setAttribute('href', '#/');   // học sinh: tên app không bấm được
    document.title = 'Nhà Thầy Hưng – Học từ vựng tiếng Anh';
    const used = !isAssign && /^\/(practice|test-practice|test-edit)\/([\w-]+)$/.exec(path);      // ghi nhận "dùng gần đây"
    if (used) Prefs.touch(used[1] === 'practice' ? 'set' : 'test', used[2]);
    renderNav(); window.scrollTo(0, 0);
    try {
      if (path === '/' || path === '') this.cur = HomeView(root);
      else if (path === '/settings') this.cur = SettingsView(root);
      else if (path === '/tao-mat-khau') this.cur = PassTool(root);
      else if (path === '/stats' || path === '/teststats') {
        const m = query.match(/(?:^|&)id=([^&]*)/); let sid = m ? m[1] : '';
        try { sid = decodeURIComponent(sid); } catch (_) {}
        this.cur = (path === '/stats' ? StatsView : TestStatsView)(root, /^[\w-]{1,64}$/.test(sid) ? sid : '');
      }
      else if (path === '/assign' || path === '/taketest') {
        const pick = key => { const m = query.match(new RegExp('(?:^|&)' + key + '=([^&]*)')); return m ? m[1] : ''; };
        const dec = v => { try { return decodeURIComponent(v); } catch (_) { return v; } };
        this.cur = AssignView(root, { d: dec(pick('d')).replace(/ /g, '+'), id: dec(pick('id')), s: dec(pick('s')), kind: path === '/taketest' ? 'test' : '', hs: pick('hs') === '1' });
      } else if (path.startsWith('/test-edit/')) this.cur = TestEditView(root, path.slice(11));
      else if (path.startsWith('/test-practice/')) this.cur = TestPracticeView(root, path.slice(15));
      else if (path.startsWith('/practice/')) this.cur = PracticeView(root, path.slice(10));
      else { root.replaceChildren(errorPanel('Không tìm thấy trang này.')); this.cur = null; }
    } catch (e) { console.error(e); root.replaceChildren(errorPanel('Đã xảy ra lỗi: ' + e.message)); this.cur = null; }
    if (!(path === '/' || path === '')) root.focus({ preventScroll: true });
  }
};
/** Service worker: lưu vỏ ứng dụng + thư viện để mở được khi không có mạng. Chỉ chạy trên https hoặc localhost. */
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:' && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) return;
  const first = !navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js?v=' + encodeURIComponent(SM_VER)).then(reg => {
    if (!first) return;
    const w = reg.installing || reg.waiting; if (!w) return;
    w.addEventListener('statechange', () => { if (w.state === 'activated' && document.body.dataset.route !== 'assign' && !Store.get('sw_ready', false)) { Store.set('sw_ready', true); toast('Đã lưu ứng dụng vào máy – lần sau mở được cả khi không có mạng.'); } });
  }).catch(e => console.warn('Service worker:', e));
}
async function init() {
  Settings.load();
  await IDB.init();                                   // mở kho + chuyển dữ liệu localStorage cũ (một lần)
  await Promise.all([Sets.load(), Tests.load()]);
  Prefs.load();
  TTS.init();
  window.addEventListener('hashchange', () => Router.render());
  window.addEventListener('online', () => Sync.flush());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) Sync.flush(); });   // xác nhận các bản lưu tạm đã gửi
  window.addEventListener('unhandledrejection', e => { console.error(e.reason); toast('Có lỗi không mong muốn: ' + ((e.reason && e.reason.message) || e.reason), 'error'); });
  Sync.flush();
  Router.render();
  registerSW();
}
window.__SM_TEST__ = { prepTest, slimTest, testPoints, TA, Stu, Cfg, grade, Parser, Scoring, Norm, IO, statsByStudent, HL, SectionView, Auth, sha256, RepoSync, Zip, Prefs, Sets, Tests, buildRepoFiles, fold, cleanTags, cleanFolder, repoCheck, HomeState };
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();

/* Spelling Mastery – Khu vườn: ENGINE hiển thị + thao tác (garden.js) v1.0.0
 * Đồ họa: đẳng cự 2:1 vẽ bằng canvas. Máy chủ quyết mọi giá/điểm/thời gian (GARDEN_SPEC.md); client dự đoán lạc quan rồi đối chiếu.
 * API: window.SMGarden – xem GARDEN_UI_NOTES.md. */
(function (root) {
'use strict';
const VERSION = '1.0.1';
const TW = 64, TH = 32, HW = TW / 2, HH = TH / 2, CH = 8;               // ô đẳng cự 2:1; mảnh 8×8 ô
const PERF = { dprMax: 2, zoomMin: .4, zoomMax: 2.6, maxFlushOps: 40, maxCellsOp: 64, maxCellsBatch: 400, debounceMs: 400,
  chunkCache: 48, spriteCache: 400, chunkBuildPerFrame: 3, lowFps: 24, retryMs: [2000, 4000, 8000, 15000], reduceFps: .5 };
const FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
const hasDoc = typeof document !== 'undefined';
const LS = { get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} } };
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const key = (x, y) => x + ',' + y;
const cdiv = v => Math.floor(v / CH);
const cloneJ = o => JSON.parse(JSON.stringify(o));
function hash(x, y, s) { let h = (x * 374761393 + y * 668265263 + (s || 0) * 1442695041) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

/* ---- Định dạng số lớn gọn: K M B T aa ab … vô hạn ---- */
function unitName(i) {
  if (i < 5) return ['', 'K', 'M', 'B', 'T'][i];
  let n = i - 5, L = 2, c = 676; while (n >= c) { n -= c; L++; c *= 26; }
  let s = ''; for (let k = 0; k < L; k++) { s = String.fromCharCode(97 + n % 26) + s; n = Math.floor(n / 26); } return s;
}
function fmt(v) {
  v = Number(v); if (isNaN(v)) return '0'; if (!isFinite(v)) return v > 0 ? '∞' : '-∞';
  const neg = v < 0 ? '-' : ''; v = Math.abs(v); if (v < 1000) return neg + String(Math.round(v));
  let i = Math.floor(Math.log10(v) / 3), m = v / Math.pow(1000, i);
  if (m >= 1000) { m /= 1000; i++; } if (m < 1) { m *= 1000; i--; }
  let s = m.toFixed(m < 10 ? 2 : m < 100 ? 1 : 0);
  if (parseFloat(s) >= 1000) { s = (m / 1000).toFixed(2); i++; }
  if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return neg + s.replace('.', ',') + unitName(i);
}
function fmtTime(ms) { const s = Math.max(0, Math.ceil(ms / 1000)); if (s < 60) return s + ' giây'; const m = Math.floor(s / 60); if (m < 60) return m + ' phút' + (s % 60 && m < 10 ? ' ' + (s % 60) + ' giây' : ''); const h = Math.floor(m / 60); return h + ' giờ' + (m % 60 ? ' ' + (m % 60) + ' phút' : ''); }

/* ---- Hình học đẳng cự (thuần, kiểm thử được bằng node) ---- */
const iso = (x, y) => [(x - y) * HW, (x + y) * HH];                      // đỉnh trên của ô (x,y)
const grid = (ix, iy) => [(ix / HW + iy / HH) / 2, (iy / HH - ix / HW) / 2]; // liên tục; floor → ô
const cellAt = (ix, iy) => { const g = grid(ix, iy); return [Math.floor(g[0]), Math.floor(g[1])]; };
function chunkRange(x0, y0, x1, y1) {                                      // khung iso → khoảng mảnh cần vẽ
  const cs = [cellAt(x0, y0), cellAt(x1, y0), cellAt(x0, y1), cellAt(x1, y1)];
  let a = 1e9, b = 1e9, c = -1e9, d = -1e9; for (const p of cs) { a = Math.min(a, p[0]); b = Math.min(b, p[1]); c = Math.max(c, p[0]); d = Math.max(d, p[1]); }
  return { cx0: cdiv(a) - 0, cy0: cdiv(b), cx1: cdiv(c), cy1: cdiv(d) };
}

/* ---- Danh mục (gardenInfo) chuẩn hoá phòng thủ ---- */
const BLD_EMOJI = { gieng: '⛲', chuongga: '🐔', kho: '📦', nhakinh: '🏡', tongong: '🐝', chuongbo: '🐄', coixay: '🛖', aoca: '🐟', lobanh: '🥖' };
const BLD_NAME = { gieng: 'Giếng', chuongga: 'Chuồng gà', kho: 'Kho', nhakinh: 'Nhà kính', tongong: 'Tổ ong', chuongbo: 'Chuồng bò', coixay: 'Cối xay', aoca: 'Ao cá', lobanh: 'Lò bánh' };
const pk = (o, ns, d) => { for (const n of ns) if (o && o[n] != null) return o[n]; return d; };
function normList(x, f) { if (!x) return []; return Array.isArray(x) ? x.map((v, i) => f(v, i, null)) : Object.keys(x).map((k, i) => f(x[k], i, k)); }
function normCrop(c, i, k) {
  if (Array.isArray(c)) return { i, id: c[0], name: String(c[1] != null ? c[1] : c[0]), emoji: typeof c[2] === 'string' ? c[2] : '🌱', g: +c[3] || 60, seed: +c[4] || 0, y: +c[5] || 0, lvl: +c[6] || 1 };
  c = c || {}; return { i, id: k != null ? k : pk(c, ['id', 'k'], i), name: String(pk(c, ['name', 'n', 'ten'], k != null ? k : i)), emoji: pk(c, ['emoji', 'e', 'ic'], '🌱'), g: +pk(c, ['g', 'time', 'sec'], 60), seed: +pk(c, ['seed', 'seedPrice', 'price', 'cost', 'gh'], 0), y: +pk(c, ['y', 'yield'], 0), lvl: +pk(c, ['lvl', 'lv', 'level', 'need', 'cap'], 1) };
}
function normBld(b, i, k) {
  if (Array.isArray(b)) b = { id: b[0], name: b[1], emoji: b[2], price: b[3] };
  b = b || {}; const id = k != null ? k : pk(b, ['id'], i);
  return { id, name: pk(b, ['name', 'n', 'ten'], BLD_NAME[id] || id), emoji: pk(b, ['emoji', 'e'], BLD_EMOJI[id] || '🏠'), price: +pk(b, ['price', 'cost', 'gia'], 0), w: +pk(b, ['w', 'width'], 1) || 1, h: +pk(b, ['h', 'height'], 1) || 1, lvl: +pk(b, ['lvl', 'lv', 'level'], 1) };
}
let CAT = null;
function setCatalog(info) {
  if (!info) return;
  const crops = normList(info.crops, normCrop), blds = normList(info.buildings, normBld);
  const decos = (info.decos || []).map(d => Array.isArray(d) ? { id: d[0], name: d[1], emoji: d[2], theme: d[3], price: +d[4] || 0, aes: +d[5] || 0 } : { id: d.id, name: d.name, emoji: d.emoji, theme: d.theme, price: +d.price || 0, aes: +d.aes || 0 });
  const cropById = {}, bldById = {}, decoById = {}; crops.forEach(c => cropById[c.id] = c); blds.forEach(b => bldById[b.id] = b); decos.forEach(d => decoById[d.id] = d);
  CAT = { raw: info, catVer: info.catVer, crops, blds, decos, cropById, bldById, decoById };
}
const cropOf = k => CAT ? (CAT.cropById[k] || CAT.crops[+k]) : null;
const bldOf = id => CAT ? CAT.bldById[id] : null;
function decoOf(id) { if (!CAT || id == null) return null; const s = String(id), p = s.split('~'), b = CAT.decoById[p[0]]; return b ? Object.assign({}, b, { tier: +p[1] || 0, fullId: s }) : null; }

/* ---- Trạng thái & thao tác lạc quan ---- */
let ctx = null, alive = false, errMap = null, forceCalm = false;
const S = { server: null, view: null, derived: null, v: 0, offset: 0, q: [], inflight: null, timer: 0, retryT: 0, tries: 0, status: 'idle', fatal: null, rev: 0 };
const chCache = new WeakMap();
function ownedSet(st) { let s = chCache.get(st); if (!s) { s = new Set(st.ch || []); chCache.set(st, s); } return s; }
const isOwned = (st, x, y) => ownedSet(st).has(cdiv(x) + ',' + cdiv(y));
const nowMs = () => Date.now() + S.offset;
const costMul = () => { const c = S.derived && +S.derived.costPct; return c ? (c > 5 ? c / 100 : c) : 1; };
function norm(st) { for (const k of ['f', 'b', 'd', 'iv', 'up']) if (!st[k] || typeof st[k] !== 'object') st[k] = {}; if (!Array.isArray(st.ch)) st.ch = []; st.xu = +st.xu || 0; st.es = +st.es || 0; st.xp = +st.xp || 0; return st; }
function growMs(c, st) {
  const G = (st.b && st.b.gieng && +st.b.gieng.l) || 0; let L = 0; for (const k in st.up) if (/phan|bon|fert/i.test(k)) L = +st.up[k] || 0;
  return Math.max(5000, c.g * 1000 * (1 - .35 * G / (G + 15)) * (1 - .5 * L / (L + 25)));
}
function bldFoot(b, info) { const w = (info && info.w) || 1, h = (info && info.h) || 1; return [w, h]; }
function occupied(st, x, y) {
  const k = key(x, y); if (st.f[k] !== undefined || st.d[k] !== undefined) return true;
  for (const id in st.b) { const b = st.b[id], f = bldFoot(b, bldOf(id)); if (x >= b.x && x < b.x + f[0] && y >= b.y && y < b.y + f[1]) return true; }
  return false;
}
const cellsOf = op => op.cells ? op.cells : [[op.x, op.y]];
function applyOp(st, op) {                                       // trả null nếu ổn, hoặc chuỗi lỗi tiếng Việt
  const t = op.op, now = nowMs();
  if (t === 'plant') {
    const c = cropOf(op.k); if (!c) return 'Chưa có dữ liệu loại cây này.';
    const price = Math.round(c.seed * (+(S.derived && S.derived.seedMul) || 1)), cells = cellsOf(op);
    if (CAT && c.lvl > gardenLevel(st).lv) return 'Cây này cần vườn cấp ' + c.lvl + '.';
    let need = 0;
    for (const [x, y] of cells) { if (!isOwned(st, x, y)) return 'Ô này chưa mở khóa.'; const f = st.f[key(x, y)]; if (f === undefined) return 'Cần cuốc đất trước khi trồng.'; if (f !== 0) return 'Ô đang có cây.'; need += price; }
    if (st.xu < need) return 'Không đủ Xu để mua hạt.';
    st.xu -= need; for (const [x, y] of cells) st.f[key(x, y)] = [op.k, now + growMs(c, st)]; return null;
  }
  if (t === 'harvest') {
    const cells = cellsOf(op); for (const [x, y] of cells) { const f = st.f[key(x, y)]; if (!Array.isArray(f)) return 'Ô này chưa có cây.'; if (f[1] > now) return 'Cây chưa chín.'; }
    for (const [x, y] of cells) st.f[key(x, y)] = 0; return null;
  }
  if (t === 'harvestAll') { for (const k in st.f) if (Array.isArray(st.f[k]) && st.f[k][1] <= now) st.f[k] = 0; return null; }
  if (t === 'till') {
    const cells = cellsOf(op); let n = Object.keys(st.f).length, need = 0;
    for (const [x, y] of cells) { if (!isOwned(st, x, y)) return 'Ô này chưa mở khóa.'; if (occupied(st, x, y)) return 'Ô đang có vật khác.'; need += Math.round(15 * Math.pow(1.05, n++)); }
    if (st.xu < need) return 'Không đủ Xu để cuốc đất.';
    st.xu -= need; for (const [x, y] of cells) st.f[key(x, y)] = 0; return null;
  }
  if (t === 'decorate') {
    if (op.act === 'place') {
      if (!isOwned(st, op.x, op.y)) return 'Ô này chưa mở khóa.'; if (occupied(st, op.x, op.y)) return 'Ô đang có vật khác.';
      if (st.iv[op.id] > 0) st.iv[op.id]--; else { const d = decoOf(op.id), cost = d ? Math.ceil(d.price * Math.pow(2.6, d.tier) * costMul()) : 0; if (ctx && ctx.getBalance() < cost) return 'Không đủ điểm để mua.'; }
      st.d[key(op.x, op.y)] = op.id; return null;
    }
    if (op.act === 'move') { const k = key(op.x, op.y), id = st.d[k]; if (id === undefined) return 'Không có vật trang trí ở ô này.'; if (!isOwned(st, op.nx, op.ny) || occupied(st, op.nx, op.ny)) return 'Không thể dời đến ô đó.'; delete st.d[k]; st.d[key(op.nx, op.ny)] = id; return null; }
    if (op.act === 'remove') { const k = key(op.x, op.y), id = st.d[k]; if (id === undefined) return 'Không có vật trang trí ở ô này.'; delete st.d[k]; st.iv[id] = (st.iv[id] || 0) + 1; return null; }
    return null;
  }
  if (t === 'buyPlot') { const k = key(op.cx, op.cy); if (st.ch.indexOf(k) < 0) { st.ch.push(k); chCache.delete(st); } return null; }
  if (t === 'build') { if (st.b[op.id]) return 'Đã có công trình này.'; if (!isOwned(st, op.x, op.y) || occupied(st, op.x, op.y)) return 'Không thể xây ở ô đó.'; st.b[op.id] = { x: op.x, y: op.y, l: 1, ct: now }; return null; }
  if (t === 'boost') { const f = st.f[key(op.x, op.y)]; if (!Array.isArray(f)) return 'Ô này chưa có cây.'; f[1] = now; return null; }
  if (t === 'collect') { if (op.all) for (const id in st.b) st.b[id].ct = now; else if (st.b[op.id]) st.b[op.id].ct = now; return null; }
  return null;                                                    // op khác: máy chủ quyết, chờ phản hồi
}
function gardenLevel(st) {
  const d = S.derived || {}, lv0 = d.lv != null ? d.lv : d.level;
  if (lv0 != null) { const need = +(d.xpNeed || d.need || 0), into = +(d.xpInto != null ? d.xpInto : d.xpIn != null ? d.xpIn : 0); return { lv: +lv0, into, need, frac: need ? clamp(into / need, 0, 1) : 0 }; }
  let l = 1, x = st.xp || 0, need = 60; for (let n = 0; n < 5000; n++) { need = Math.round(60 * Math.pow(1.2, l - 1)); if (x < need) break; x -= need; l++; }
  return { lv: l, into: x, need, frac: clamp(x / need, 0, 1) };
}
function rebuildView() {
  if (!S.server) return; const v = norm(cloneJ(S.server)); S.rev++;
  for (const it of S.inflight ? S.inflight.items : []) applyOp(v, it.op);
  for (const it of S.q) applyOp(v, it.op);
  S.view = v;
}

/* ---- Sự kiện ---- */
const LST = {};
const on = (e, f) => { (LST[e] = LST[e] || []).push(f); };
const off = (e, f) => { if (LST[e]) LST[e] = LST[e].filter(x => x !== f); };
const emit = (e, d) => { (LST[e] || []).slice().forEach(f => { try { f(d); } catch (err) { console.error('SMGarden:', err); } }); };
const toast = (m, err) => { try { ctx && ctx.toast && ctx.toast(m, !!err); } catch (_) {} };
const sfx = n => { try { ctx && ctx.sfx && ctx.sfx(n); } catch (_) {} };

/* ---- Đồng bộ máy chủ ---- */
function setStatus(s) { if (S.status === s) return; S.status = s; emit('sync', { status: s }); if (alive) hudSync(); }
function changed() { if (!alive) return; S.rev++; if (R) R.wake(); hudUpdate(); emit('state', { state: S.view, derived: S.derived }); }
function adopt(r, t1) {
  if (r.state) S.server = norm(r.state);
  if (r.derived) S.derived = r.derived;
  if (r.v != null) S.v = r.v;
  if (r.serverTime) S.offset = r.serverTime - (t1 || Date.now());     // an toàn: nếu lệch thì cây hiện chín trễ chứ không chín sớm
  if (typeof r.balance === 'number' && ctx && ctx.setBalance) ctx.setBalance(r.balance);
}
function queueOp(op, opt) {
  opt = opt || {};
  return new Promise((res, rej) => {
    if (!S.view || S.fatal) { const m = S.fatal || 'Vườn chưa sẵn sàng.'; if (!opt.silent) toast(m, true); return rej(Object.assign(new Error(m), { code: 'client' })); }
    const err = applyOp(S.view, op);
    if (err) { if (!opt.silent) { toast(err, true); sfx('error'); } announce(err); return rej(Object.assign(new Error(err), { code: 'client' })); }
    if (op.op === 'harvest' || op.op === 'harvestAll' || op.op === 'collect') S.fxCell = op.op === 'harvest' ? cellsOf(op)[0] : (S.fxCell || null);
    S.q.push({ op, res, rej }); setStatus('sync'); changed();
    scheduleFlush(!!opt.immediate || S.q.length >= PERF.maxFlushOps);
  });
}
function scheduleFlush(now) { clearTimeout(S.timer); if (now) flush(); else S.timer = setTimeout(flush, PERF.debounceMs); }
function buildBatch() {
  const items = [], ops = []; let cells = 0;
  while (S.q.length && ops.length < PERF.maxFlushOps) {
    const it = S.q[0], op = it.op, merge = /^(plant|harvest|till)$/.test(op.op), n = cellsOf(op).length;
    if (items.length && cells + n > PERF.maxCellsBatch) break;
    S.q.shift(); items.push(it); cells += n;
    const last = ops[ops.length - 1];
    if (merge && last && last._m && last.op === op.op && last.k === op.k && last.cells.length + n <= PERF.maxCellsOp) cellsOf(op).forEach(c => last.cells.push([c[0], c[1]]));
    else { const w = Object.assign({}, op); if (merge) { w.cells = cellsOf(op).map(c => [c[0], c[1]]); delete w.x; delete w.y; w._m = 1; } ops.push(w); }
  }
  ops.forEach(o => { delete o._m; });
  return { items, ops };
}
function flush() {
  clearTimeout(S.timer); if (S.inflight || !S.q.length || !S.server || S.fatal) return;
  const b = buildBatch(); b.rid = ctx.requestId(); S.inflight = b; S.tries = 0; send();
}
async function send() {
  const b = S.inflight; if (!b || !ctx) return;
  setStatus(S.tries && navigator.onLine === false ? 'offline' : 'sync');
  let r; try { r = await ctx.api('gardenAct', { ops: b.ops, requestId: b.rid, baseV: S.v }); } catch (e) { return fail(b, e); }
  if (S.inflight !== b) return;
  if (r && r.ok === false) return fail(b, Object.assign(new Error(r.message || 'Lỗi'), { code: r.error, raw: r }));
  const before = S.server ? S.server.xu : 0; adopt(r, Date.now());
  S.inflight = null; S.tries = 0;
  const gain = S.server ? S.server.xu - before : 0, hv = b.ops.some(o => /^(harvest|harvestAll|collect)$/.test(o.op));
  b.items.forEach(i => i.res(r));
  if (alive) {
    if (hv && gain > 0 && R) { const c = S.fxCell; R.floatCell(c ? c[0] : null, c ? c[1] : null, '+' + fmt(gain) + ' 🪙', '#ffd23f'); sfx('coin'); }
    if (r.levelUps && (r.levelUps.length || r.levelUps > 0)) { toast('🎉 Vườn lên cấp mới!'); sfx('win'); }
    if (r.achievements && r.achievements.length) { toast('🏆 Thành tựu mới!'); emit('achievement', r.achievements); }
  }
  emit('result', r); rebuildView(); changed();
  if (S.q.length) { setStatus('sync'); scheduleFlush(true); } else setStatus('saved');
}
function fail(b, e) {
  if (S.inflight !== b) return;
  const raw = e && e.raw || null, code = (e && e.code) || (raw && raw.error) || '';
  let msg = (raw && raw.message) || (e && e.message) || 'Có lỗi xảy ra.';
  if (errMap) { try { msg = errMap(code, msg, raw) || msg; } catch (_) {} }   // garden-ui.js đổi mã lỗi thành lời tiếng Việt thân thiện
  if ((raw && raw.applied === false || /^garden_/.test(code) || code === 'bad_request') && code !== 'busy') {   // máy chủ từ chối cả lô: hoàn tác, đồng bộ lại bản gốc
    S.inflight = null; S.tries = 0;
    if (raw && raw.state) adopt(raw, Date.now());
    if (code === 'garden_disabled') { S.fatal = msg; hudOverlay(msg); }
    toast(msg, true); sfx('error'); announce(msg);
    const er = Object.assign(new Error(msg), { code, raw }); b.items.forEach(i => i.rej(er));
    emit('rejected', { code, message: msg, opIndex: raw && raw.opIndex }); rebuildView(); changed();
    if (S.q.length && !S.fatal) { setStatus('sync'); scheduleFlush(true); } else setStatus('saved'); return;
  }
  if (code === 'invalid_code' || code === 'code_disabled' || code === 'no_url') { S.inflight = null; S.fatal = msg; hudOverlay(msg); b.items.forEach(i => i.rej(e)); setStatus('error'); return; }
  setStatus(code === 'network' || navigator.onLine === false ? 'offline' : 'sync');   // tạm thời: giữ hàng đợi, thử lại cùng requestId
  const d = PERF.retryMs[Math.min(S.tries++, PERF.retryMs.length - 1)];
  clearTimeout(S.retryT); S.retryT = setTimeout(() => { S.retryT = 0; send(); }, d);
}
function retryNow() { if (S.inflight && S.retryT) { clearTimeout(S.retryT); S.retryT = 0; send(); } else if (!S.inflight && S.q.length) flush(); }
const settle = async () => { for (let i = 0; i < 150 && (S.inflight || S.q.length); i++) { if (!S.inflight) flush(); await new Promise(r => setTimeout(r, 100)); } };
async function loadCatalog(want) {
  let cached = null; try { cached = JSON.parse(LS.get('sm_garden_cat') || 'null'); } catch (_) {}
  if (cached && (want == null || cached.catVer === want)) return setCatalog(cached);
  try {
    const info = await ctx.api('gardenInfo', { catVer: cached && cached.catVer });
    if (info.same && cached) return setCatalog(cached);
    setCatalog(info); LS.set('sm_garden_cat', JSON.stringify(info));
  } catch (e) { if (cached) setCatalog(cached); else throw e; }
}
async function loadState() {
  if (S.fatal) return;
  const t1 = Date.now(), r = await ctx.api('gardenGet', {}); if (!alive) return;
  const keepQ = S.inflight || S.q.length; adopt(r, Date.now()); void t1;
  if (!CAT || (r.catVer != null && CAT.catVer !== r.catVer)) await loadCatalog(r.catVer);
  S.server = norm(S.server || r.state); rebuildView(); changed();
  if (!keepQ) setStatus(navigator.onLine === false ? 'offline' : 'saved');
}
async function refresh() { if (!alive) return; try { await settle(); await loadState(); emit('refresh', {}); } catch (e) { if (e && e.code === 'garden_disabled') { S.fatal = e.message; hudOverlay(e.message); } else { setStatus('offline'); toast(e && e.message || 'Không làm mới được.', true); } } }

/* ===== Bộ vẽ (canvas đẳng cự 2:1) ===== */
let R = null;
const mkCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };
const QUAL = { low: { chunkScale: 1, fps: 0, crit: 0, sway: false, shadow: false, weather: false }, mid: { chunkScale: 1.5, fps: 20, crit: 6, sway: true, shadow: true, weather: true }, high: { chunkScale: 2, fps: 30, crit: 14, sway: true, shadow: true, weather: true } };
const SKY = [[0, [27, 42, 90], .55], [5, [65, 64, 122], .45], [6.5, [255, 177, 132], .18], [8, [255, 242, 207], 0], [16, [255, 242, 207], 0], [17, [255, 227, 176], .1], [18.3, [255, 154, 106], .22], [19.7, [58, 56, 128], .42], [21, [27, 42, 90], .55], [24, [27, 42, 90], .55]];
function skyAt(h) {
  for (let i = 1; i < SKY.length; i++) if (h <= SKY[i][0]) { const a = SKY[i - 1], b = SKY[i], t = (h - a[0]) / (b[0] - a[0] || 1); return { rgb: a[1].map((v, k) => v + (b[1][k] - v) * t), a: a[2] + (b[2] - a[2]) * t }; }
  return { rgb: SKY[0][1], a: .5 };
}
const rd = (r, g, b, a) => 'rgba(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ',' + a + ')';
const noise = (x, y, s) => { const fx = Math.floor(x), fy = Math.floor(y), tx = x - fx, ty = y - fy, sm = t => t * t * (3 - 2 * t), a = hash(fx, fy, s), b = hash(fx + 1, fy, s), c = hash(fx, fy + 1, s), d = hash(fx + 1, fy + 1, s); return (a + (b - a) * sm(tx)) * (1 - sm(ty)) + (c + (d - c) * sm(tx)) * sm(ty); };
const isWater = (x, y) => noise(x / 5, y / 5, 7) > .7;
const isPath = (x, y) => Math.abs(Math.sin(x * .16 + Math.cos(y * .1) * 2)) < .06 || Math.abs(Math.sin(y * .18 + Math.cos(x * .12) * 2)) < .06;

function createRenderer(host) {
  const cv = document.createElement('canvas'); cv.className = 'gd-canvas'; cv.tabIndex = 0; cv.setAttribute('role', 'application');
  cv.setAttribute('aria-label', 'Khu vườn. Dùng mũi tên để di chuyển con trỏ, Enter để chọn ô, dấu cộng và trừ để thu phóng, Esc để bỏ chọn.');
  host.appendChild(cv); const g = cv.getContext('2d');
  const reduced = root.matchMedia ? root.matchMedia('(prefers-reduced-motion:reduce)') : { matches: false };
  const q0 = LS.get('sm_garden_q') || 'auto';
  const r = {
    cv, g, W: 300, H: 300, dpr: 1, cam: { x: 0, y: 0, z: 1 }, tgt: null, vel: { x: 0, y: 0 }, qSetting: q0, quality: q0 === 'auto' ? 'mid' : q0,
    chunks: new Map(), sprites: new Map(), fx: [], parts: [], animals: [], ents: [], entsRev: -1, rev: 0, raf: 0, lastT: 0, lastAmb: 0, ft: [], run: true, sky: null, skyAt: 0,
    hover: null, sel: null, kc: null, ghost: null, brush: new Set(), ghostOk: true, lockHit: [], slowT: 0, lowSince: 0
  };
  r.reduced = () => reduced.matches || forceCalm;
  r.q = () => QUAL[r.quality];
  r.resize = () => {
    const b = host.getBoundingClientRect(); r.W = Math.max(1, b.width); r.H = Math.max(1, b.height); r.dpr = Math.min(PERF.dprMax, root.devicePixelRatio || 1);
    cv.width = Math.round(r.W * r.dpr); cv.height = Math.round(r.H * r.dpr); r.wake();
  };
  r.wake = () => { r.need = true; if (!r.raf && r.run && alive) r.raf = requestAnimationFrame(r.frame); };
  r.setQuality = s => { r.qSetting = s; LS.set('sm_garden_q', s); r.quality = s === 'auto' ? (r.quality === 'low' ? 'mid' : r.quality) : s; r.chunks.clear(); r.sprites.clear(); r.parts = []; r.wake(); };
  r.toScreen = (x, y) => { const p = iso(x + .5, y + .5); return [(p[0] - r.cam.x) * r.cam.z + r.W / 2, (p[1] - r.cam.y) * r.cam.z + r.H / 2]; };
  r.pick = (px, py) => { const ix = (px - r.W / 2) / r.cam.z + r.cam.x, iy = (py - r.H / 2) / r.cam.z + r.cam.y; return cellAt(ix, iy); };
  r.bounds = () => {                                                      // giới hạn camera: bao các mảnh đã mở + lề
    const ch = (S.view && S.view.ch) || ['0,0']; let a = 1e9, b = 1e9, c = -1e9, d = -1e9;
    for (const k of ch) { const p = k.split(',').map(Number); a = Math.min(a, p[0]); b = Math.min(b, p[1]); c = Math.max(c, p[0]); d = Math.max(d, p[1]); }
    const m = 3, p = [iso((a - m) * CH, (b - m) * CH), iso((c + m + 1) * CH, (b - m) * CH), iso((a - m) * CH, (d + m + 1) * CH), iso((c + m + 1) * CH, (d + m + 1) * CH)];
    return { x0: Math.min(...p.map(v => v[0])), x1: Math.max(...p.map(v => v[0])), y0: Math.min(...p.map(v => v[1])), y1: Math.max(...p.map(v => v[1])) };
  };
  r.clampCam = c => { const b = r.bounds(); c.x = clamp(c.x, b.x0, b.x1); c.y = clamp(c.y, b.y0, b.y1); c.z = clamp(c.z, PERF.zoomMin, PERF.zoomMax); return c; };
  r.zoomAt = (nz, px, py) => {
    nz = clamp(nz, PERF.zoomMin, PERF.zoomMax); const c = r.cam, ix = (px - r.W / 2) / c.z + c.x, iy = (py - r.H / 2) / c.z + c.y;
    c.z = nz; c.x = ix - (px - r.W / 2) / nz; c.y = iy - (py - r.H / 2) / nz; r.clampCam(c); r.tgt = null; r.wake();
  };
  r.goTo = (x, y, z) => { const p = iso(x + .5, y + .5); r.tgt = r.clampCam({ x: p[0], y: p[1] + HH, z: z || r.cam.z }); r.vel.x = r.vel.y = 0; r.wake(); };
  r.center = () => {
    const f = S.view && S.view.f, ch = (S.view && S.view.ch[0] || '0,0').split(',').map(Number); let sx = 0, sy = 0, n = 0;
    for (const k in f || {}) { const p = k.split(',').map(Number); sx += p[0]; sy += p[1]; n++; }
    const x = n ? sx / n : ch[0] * CH + CH / 2, y = n ? sy / n : ch[1] * CH + CH / 2; r.goTo(Math.floor(x), Math.floor(y), r.W < 500 ? 1.05 : 1.2);
  };
  /* --- Sprite emoji (cache theo (ký tự, cỡ)) --- */
  r.emoji = (ch, px) => {
    const k = ch + '|' + px; let c = r.sprites.get(k); if (c) return c;
    if (r.sprites.size > PERF.spriteCache) r.sprites.clear();
    c = mkCanvas(px * 1.4, px * 1.4); const x = c.getContext('2d'); x.font = px + 'px ' + FONT; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(ch, c.width / 2, c.height / 2 + px * .06);
    r.sprites.set(k, c); return c;
  };
  r.drawEmoji = (ch, wx, wy, base, o) => {                                // neo đáy-giữa tại (wx,wy) toạ độ iso
    o = o || {}; const z = r.cam.z * r.dpr, px = Math.max(10, Math.round(base * z / 6) * 6), c = r.emoji(ch, px), w = c.width / z;
    g.save(); g.translate(wx, wy); if (o.rot) g.rotate(o.rot); if (o.sc) g.scale(o.sc, o.sc); if (o.alpha != null) g.globalAlpha = o.alpha;
    g.drawImage(c, -w / 2, -w * .8, w, w); g.restore();
  };
  /* --- Nền từng mảnh (cache) --- */
  r.chunkSig = (cx, cy) => {
    const st = S.view, own = ownedSet(st); let s = own.has(cx + ',' + cy) ? 'O' : 'u';
    s += (own.has((cx + 1) + ',' + cy) ? 1 : 0) + '' + (own.has(cx + ',' + (cy + 1)) ? 1 : 0) + (own.has((cx - 1) + ',' + cy) ? 1 : 0) + (own.has(cx + ',' + (cy - 1)) ? 1 : 0);
    if (s[0] === 'O') for (let j = 0; j < CH; j++) for (let i = 0; i < CH; i++) s += st.f[key(cx * CH + i, cy * CH + j)] !== undefined ? 1 : 0;
    return s;
  };
  r.buildChunk = (cx, cy, sig, ch) => {
    const sc = r.q().chunkScale, w = CH * TW, h = CH * TH + 10; let cvs = ch && ch.cv && ch.sc === sc ? ch.cv : mkCanvas(w * sc, h * sc), x = cvs.getContext('2d');
    x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, cvs.width, cvs.height); x.scale(sc, sc);
    const st = S.view, own = ownedSet(st), mine = own.has(cx + ',' + cy), ox = w / 2;
    for (let s = 0; s < CH * 2 - 1; s++) for (let j = 0; j < CH; j++) { const i = s - j; if (i < 0 || i >= CH) continue;
      const wx = cx * CH + i, wy = cy * CH + j, tx = (i - j) * HW + ox, ty = (i + j) * HH, hh = hash(wx, wy, 3); let col, kind = 'g';
      if (mine) { if (st.f[key(wx, wy)] !== undefined) { kind = 's'; col = hh > .5 ? '#7a5230' : '#85593a'; } else col = hh < .33 ? '#6fae52' : hh < .66 ? '#68a74d' : '#74b457'; }
      else if (isWater(wx, wy)) { kind = 'w'; col = hh > .5 ? '#5aaed4' : '#4d9fc7'; } else if (isPath(wx, wy)) { kind = 'p'; col = hh > .5 ? '#c9b182' : '#bfa675'; } else col = hh < .5 ? '#7d9a6b' : '#789565';
      x.fillStyle = col; x.beginPath(); x.moveTo(tx, ty); x.lineTo(tx + HW, ty + HH); x.lineTo(tx, ty + TH); x.lineTo(tx - HW, ty + HH); x.closePath(); x.fill();
      x.strokeStyle = 'rgba(0,0,0,.07)'; x.lineWidth = 1; x.stroke();
      if (kind === 'g' && hh > .55) { x.strokeStyle = 'rgba(40,90,30,.35)'; x.lineWidth = 1.2; for (let k = 0; k < 3; k++) { const px = tx + (hash(wx, wy, 10 + k) - .5) * 30, py = ty + HH + (hash(wx, wy, 20 + k) - .5) * 12; x.beginPath(); x.moveTo(px, py); x.lineTo(px - 1, py - 4); x.moveTo(px, py); x.lineTo(px + 2, py - 3); x.stroke(); } }
      if (kind === 'g' && mine && hh > .93) { x.fillStyle = ['#ffd6e7', '#fff3a8', '#fff'][(hh * 100 | 0) % 3]; x.beginPath(); x.arc(tx + (hh - .96) * 300, ty + HH, 1.8, 0, 7); x.fill(); }
      if (kind === 's') { x.strokeStyle = 'rgba(60,35,15,.5)'; x.lineWidth = 1.4; for (let k = -1; k <= 1; k++) { x.beginPath(); x.moveTo(tx - 16 + k * 6, ty + HH + 5 + k * 3 - 2); x.lineTo(tx + 6 + k * 6, ty + HH - 6 + k * 3 + 1); x.stroke(); } }
      if (kind === 'w') { x.strokeStyle = 'rgba(255,255,255,.4)'; x.lineWidth = 1.2; x.beginPath(); x.moveTo(tx - 8, ty + HH); x.quadraticCurveTo(tx - 3, ty + HH - 3, tx + 2, ty + HH); x.stroke(); }
      if (kind === 'p') { x.fillStyle = 'rgba(120,100,70,.5)'; x.beginPath(); x.arc(tx + (hh - .5) * 30, ty + HH, 1.5, 0, 7); x.fill(); }
      if (!mine) { x.fillStyle = 'rgba(200,215,205,.22)'; x.fill(); }
      if (mine) {                                                       // viền đất nổi + hàng rào ở mép vườn
        const e1 = !own.has(cdiv(wx) + ',' + cdiv(wy + 1)) && j === CH - 1, e2 = !own.has(cdiv(wx + 1) + ',' + cdiv(wy)) && i === CH - 1;
        if (e1) { x.fillStyle = '#5b3d27'; x.beginPath(); x.moveTo(tx - HW, ty + HH); x.lineTo(tx, ty + TH); x.lineTo(tx, ty + TH + 8); x.lineTo(tx - HW, ty + HH + 8); x.fill(); fence(x, tx - HW, ty + HH, tx, ty + TH); }
        if (e2) { x.fillStyle = '#4a3020'; x.beginPath(); x.moveTo(tx, ty + TH); x.lineTo(tx + HW, ty + HH); x.lineTo(tx + HW, ty + HH + 8); x.lineTo(tx, ty + TH + 8); x.fill(); fence(x, tx, ty + TH, tx + HW, ty + HH); }
        if (!own.has(cdiv(wx) + ',' + cdiv(wy - 1)) && j === 0) fence(x, tx - HW, ty + HH, tx, ty);
        if (!own.has(cdiv(wx - 1) + ',' + cdiv(wy)) && i === 0) fence(x, tx, ty, tx + HW, ty + HH);
      }
    }
    return { cv: cvs, sc, sig, rev: S.rev, used: r.frameNo };
  };
  function fence(x, x0, y0, x1, y1) {
    x.strokeStyle = '#a8794a'; x.lineWidth = 2; x.beginPath(); x.moveTo(x0, y0 - 5); x.lineTo(x1, y1 - 5); x.stroke();
    x.strokeStyle = '#8a5f37'; x.lineWidth = 3; for (const t of [0, .5, 1]) { const px = x0 + (x1 - x0) * t, py = y0 + (y1 - y0) * t; x.beginPath(); x.moveTo(px, py); x.lineTo(px, py - 8); x.stroke(); }
  }
  r.getChunk = (cx, cy, budget) => {
    const k = cx + ',' + cy; let c = r.chunks.get(k);
    if (c && c.rev === S.rev) { c.used = r.frameNo; return c; }
    const sig = r.chunkSig(cx, cy); if (c && c.sig === sig && c.sc === r.q().chunkScale) { c.rev = S.rev; c.used = r.frameNo; return c; }
    if (c && budget.n <= 0) return c; if (!c && budget.n <= 0) return null; budget.n--;
    c = r.buildChunk(cx, cy, sig, c); r.chunks.set(k, c);
    if (r.chunks.size > PERF.chunkCache) { let oldK = null, oldU = 1e18; for (const [kk, v] of r.chunks) if (v.used < oldU && kk !== k) { oldU = v.used; oldK = kk; } if (oldK) r.chunks.delete(oldK); }
    return c;
  };
  /* --- Thực thể (cây, công trình, trang trí) --- */
  r.buildEnts = () => {
    const st = S.view, out = []; r.entsRev = S.rev;
    for (const k in st.f) { const p = k.split(','), x = +p[0], y = +p[1], f = st.f[k]; if (Array.isArray(f)) out.push({ t: 'p', x, y, f, d: x + y }); }
    for (const k in st.d) { const p = k.split(','), x = +p[0], y = +p[1]; out.push({ t: 'd', x, y, id: st.d[k], d: x + y }); }
    for (const id in st.b) { const b = st.b[id], f = bldFoot(b, bldOf(id)); out.push({ t: 'b', x: b.x, y: b.y, id, b, w: f[0], h: f[1], d: b.x + b.y + (f[0] + f[1]) / 2 - .5 }); }
    out.sort((a, b) => a.d - b.d); r.ents = out;
    const an = []; for (const id in st.b) { const b = st.b[id], n = id === 'chuongga' ? 3 : id === 'chuongbo' ? 2 : 0; for (let i = 0; i < n; i++) { const o = r.animals.find(a => a.id === id && a.i === i); an.push(o || { id, i, e: id === 'chuongga' ? '🐔' : '🐄', x: b.x + 1 + i * .6, y: b.y + 1.2, tx: b.x + 1, ty: b.y + 1, w: 0, b }); } }
    r.animals = an;
  };
  r.floatCell = (x, y, text, color) => { let p; if (x == null) { const c = r.pick(r.W / 2, r.H / 2); x = c[0]; y = c[1]; } p = iso(x + .5, y + .5); r.fx.push({ x: p[0], y: p[1] - 18, text, color: color || '#fff', t0: performance.now(), dur: 1300 }); r.wake(); };
  r.burst = (x, y, col) => { if (r.reduced() || r.quality === 'low') return; const p = iso(x + .5, y + .5); for (let i = 0; i < 8; i++) r.parts.push({ k: 'b', x: p[0], y: p[1] - 8, vx: (Math.random() - .5) * 90, vy: -30 - Math.random() * 70, life: 0, max: .7, col: col || '#ffe36b' }); r.wake(); };
  r.skyNow = t => { if (!r.sky || t - r.skyAt > 20000) { const d = new Date(), h = d.getHours() + d.getMinutes() / 60, s = skyAt(h), day = Math.floor(Date.now() / 864e5), wr = hash(day, 5, 9); r.sky = { h, rgb: s.rgb, a: s.a, night: clamp((s.a - .2) / .3, 0, 1), weather: wr < .16 ? 'rain' : wr < .32 ? 'leaves' : 'clear' }; r.skyAt = t; } return r.sky; };
  r.frameNo = 0;
  return r;
}

/* --- Vòng lặp & vẽ khung hình --- */
function installLoop(r) {
  const g = r.g;
  const dia = (x, y, w, h, fill, stroke, lw) => {
    const a = iso(x, y), b = iso(x + w, y), c = iso(x + w, y + h), d = iso(x, y + h);
    g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(c[0], c[1]); g.lineTo(d[0], d[1]); g.closePath();
    if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw || 2; g.stroke(); }
  };
  r.frame = t => {
    r.raf = 0; if (!alive || !r.run || !S.view) return;
    const dt = Math.min(.1, r.lastT ? (t - r.lastT) / 1000 : .016); r.lastT = t; r.frameNo++;
    let active = false; const c = r.cam, red = r.reduced();
    if (r.tgt) { const k = red ? 1 : 1 - Math.exp(-dt * 10); c.x += (r.tgt.x - c.x) * k; c.y += (r.tgt.y - c.y) * k; c.z += (r.tgt.z - c.z) * k; if (Math.abs(r.tgt.x - c.x) + Math.abs(r.tgt.y - c.y) < .5 && Math.abs(r.tgt.z - c.z) < .003) { c.x = r.tgt.x; c.y = r.tgt.y; c.z = r.tgt.z; r.tgt = null; } active = true; }
    if (r.vel.x * r.vel.x + r.vel.y * r.vel.y > 25) { c.x += r.vel.x * dt; c.y += r.vel.y * dt; const k = Math.exp(-dt * 4.2); r.vel.x *= k; r.vel.y *= k; r.clampCam(c); active = true; } else r.vel.x = r.vel.y = 0;
    if (r.fx.length || r.pulse) active = true;
    const q = r.q(), amb = q.fps > 0 && !red, ambDue = amb && t - r.lastAmb >= 1000 / q.fps;
    if (active || r.need || ambDue) {
      if (ambDue) r.lastAmb = t; const t0 = performance.now(); r.need = false; draw(t, dt, amb); r.cost = performance.now() - t0;
      if (active) { r.ft.push(dt * 1000); if (r.ft.length > 45) { r.ft.shift(); const avg = r.ft.reduce((a, b) => a + b, 0) / r.ft.length; if (avg > 1000 / PERF.lowFps + 6 && r.qSetting === 'auto' && r.quality !== 'low') { r.quality = r.quality === 'high' ? 'mid' : 'low'; r.chunks.clear(); r.sprites.clear(); r.parts = []; r.ft = []; emit('quality', { quality: r.quality }); } } } else r.ft = [];
    }
    if (active || r.need) r.raf = requestAnimationFrame(r.frame);
    else { clearTimeout(r.slowT); const ms = amb ? Math.max(0, 1000 / q.fps - (t - r.lastAmb)) : (red ? 2000 : 1000); r.slowT = setTimeout(() => { r.slowT = 0; if (alive) { r.need = true; r.wake(); } }, Math.max(16, ms)); }
  };
  function draw(t, dt, amb) {
    const W = r.W, H = r.H, dpr = r.dpr, c = r.cam, z = c.z, q = r.q(), st = S.view, now = nowMs(), sky = r.skyNow(t), anim = amb && !r.reduced();
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = '#4b7a45'; g.fillRect(0, 0, W, H);
    g.setTransform(dpr * z, 0, 0, dpr * z, (W / 2 - c.x * z) * dpr, (H / 2 - c.y * z) * dpr);
    const vx0 = c.x - W / 2 / z - 30, vx1 = c.x + W / 2 / z + 30, vy0 = c.y - H / 2 / z - 130, vy1 = c.y + H / 2 / z + 30;
    const cr = chunkRange(vx0, vy0 + 100, vx1, vy1), list = [], budget = { n: PERF.chunkBuildPerFrame };
    for (let cy = cr.cy0 - 1; cy <= cr.cy1 + 1; cy++) for (let cx = cr.cx0 - 1; cx <= cr.cx1 + 1; cx++) { const p = iso(cx * CH, cy * CH); if (p[0] + CH * HW < vx0 || p[0] - CH * HW > vx1 || p[1] > vy1 || p[1] + CH * TH + 10 < vy0) continue; list.push([cx, cy, p]); }
    if (list.length > 60) list.length = 60; list.sort((a, b) => a[0] + a[1] - b[0] - b[1]);
    if (r.entsRev !== S.rev) { r.buildEnts(); r.lockCh = null; }
    for (const [cx, cy, p] of list) { const ch = r.getChunk(cx, cy, budget); if (ch) g.drawImage(ch.cv, p[0] - CH * HW, p[1], CH * TW, CH * TH + 10); else { dia(cx * CH, cy * CH, CH, CH, '#6d8a62'); r.need = true; } }
    /* mảnh khóa kề vườn */
    if (!r.lockCh) { const own = ownedSet(st), seen = new Set(), out = [], n = st.ch.length; for (const k of st.ch) { const p = k.split(',').map(Number); for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nk = (p[0] + d[0]) + ',' + (p[1] + d[1]); if (!own.has(nk) && !seen.has(nk)) { seen.add(nk); out.push({ cx: p[0] + d[0], cy: p[1] + d[1] }); } } } r.lockCh = out; r.lockCost = Math.ceil(Math.round(40 * Math.pow(1.3, Math.max(0, n - 1))) * costMul()); }
    for (const L of r.lockCh) {
      const p = iso(L.cx * CH + CH / 2, L.cy * CH + CH / 2); if (p[0] < vx0 - 200 || p[0] > vx1 + 200 || p[1] < vy0 - 100 || p[1] > vy1 + 100) continue;
      dia(L.cx * CH, L.cy * CH, CH, CH, 'rgba(20,30,20,.18)', 'rgba(255,255,255,.55)', 2);
      const pu = anim ? 1 + .06 * Math.sin(t / 380) : 1; r.drawEmoji('🔒', p[0], p[1] + 14, 46, { sc: pu });
      g.font = 'bold 15px ' + FONT; g.textAlign = 'center'; g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.6)'; g.fillStyle = '#fff'; const lb = 'Mở rộng · ' + fmt(r.lockCost) + ' 💰'; g.strokeText(lb, p[0], p[1] + 34); g.fillText(lb, p[0], p[1] + 34);
    }
    /* vùng đang chọn / con trỏ / cọ */
    for (const k of r.brush) { const p = k.split(','); dia(+p[0], +p[1], 1, 1, 'rgba(255,255,255,.3)', '#fff', 2); }
    if (r.sel) dia(r.sel.x, r.sel.y, 1, 1, 'rgba(255,255,255,.18)', '#fff', 3 + (anim ? Math.sin(t / 250) : 0));
    if (r.kc && r.cv === document.activeElement) dia(r.kc.x, r.kc.y, 1, 1, null, '#ffd23f', 3);
    else if (r.hover && !r.ghost) dia(r.hover.x, r.hover.y, 1, 1, null, 'rgba(255,255,255,.65)', 2);
    if (r.ghost) { const gh = r.ghost; dia(gh.x, gh.y, gh.w || 1, gh.h || 1, gh.ok ? 'rgba(60,200,90,.45)' : 'rgba(230,60,60,.45)', gh.ok ? '#2fd163' : '#ef4444', 2); }
    /* thực thể xếp theo độ sâu */
    const items = [], pad = 90;
    for (const e of r.ents) { const p = iso(e.x + .5, e.y + .5); if (p[0] < vx0 - pad || p[0] > vx1 + pad || p[1] < vy0 - pad + 100 || p[1] > vy1 + pad) continue; items.push(e); }
    for (const a of r.animals) {
      if (anim) { const d = Math.hypot(a.tx - a.x, a.ty - a.y); if (d < .1) { if ((a.w -= dt) <= 0) { a.tx = a.b.x + .5 + Math.random() * 4 - 1.5; a.ty = a.b.y + .5 + Math.random() * 4 - 1.5; if (!isOwned(st, Math.floor(a.tx), Math.floor(a.ty))) { a.tx = a.x; a.ty = a.y; } a.w = 1 + Math.random() * 3; } } else { a.x += (a.tx - a.x) / d * Math.min(d, .7 * dt); a.y += (a.ty - a.y) / d * Math.min(d, .7 * dt); } }
      items.push({ t: 'a', a, x: a.x - .5, y: a.y - .5, d: a.x + a.y - 1 });
    }
    items.sort((a, b) => a.d - b.d);
    const sway = q.sway && !r.reduced(), shadow = q.shadow;
    for (const e of items) {
      const p = iso(e.x + .5, e.y + .5);
      if (e.t === 'p') {
        const cr2 = cropOf(e.f[0]), rem = e.f[1] - now, tot = cr2 ? growMs(cr2, st) : 60000, fr = 1 - rem / tot, stg = rem <= 0 ? 3 : fr < .25 ? 0 : fr < .62 ? 1 : 2, em = cr2 ? cr2.emoji : '❓';
        if (shadow && stg > 0) { g.fillStyle = 'rgba(0,0,0,.2)'; g.beginPath(); g.ellipse(p[0], p[1] + 1, 10 + stg * 2, 5, 0, 0, 7); g.fill(); }
        if (stg === 0) { g.fillStyle = '#5a3b22'; g.beginPath(); g.ellipse(p[0], p[1] + 1, 9, 4.5, 0, 0, 7); g.fill(); g.fillStyle = '#8bc34a'; g.beginPath(); g.arc(p[0], p[1] - 1, 2.2, 0, 7); g.fill(); }
        else { const rot = sway ? Math.sin(t / 900 + e.x * .7 + e.y * .5) * .045 : 0;
          if (stg === 1) r.drawEmoji('🌱', p[0], p[1] + 4, 26, { rot });
          else if (stg === 2) r.drawEmoji(em, p[0], p[1] + 4, 30, { rot });
          else { if (anim) { g.fillStyle = rd(255, 232, 120, .18 + .1 * Math.sin(t / 300)); g.beginPath(); g.ellipse(p[0], p[1], 20, 10, 0, 0, 7); g.fill(); }
            r.drawEmoji(em, p[0], p[1] + 4 - (anim ? Math.abs(Math.sin(t / 380 + e.x)) * 3 : 0), 40, { rot }); if (anim) r.drawEmoji('✨', p[0] + 12, p[1] - 28, 15, { alpha: .6 + .4 * Math.sin(t / 200 + e.y) }); } }
      } else if (e.t === 'd') {
        const d = decoOf(e.id); if (shadow) { g.fillStyle = 'rgba(0,0,0,.2)'; g.beginPath(); g.ellipse(p[0], p[1] + 2, 12, 6, 0, 0, 7); g.fill(); }
        if (d && d.tier > 0) { g.strokeStyle = 'hsl(' + ((d.tier * 47) % 360) + ' 85% 62%)'; g.lineWidth = 2; g.beginPath(); g.ellipse(p[0], p[1] + 2, 15, 7.5, 0, 0, 7); g.stroke(); }
        r.drawEmoji(d ? d.emoji : '🎀', p[0], p[1] + 4, 38, {});
      } else if (e.t === 'b') {
        const info = bldOf(e.id), w = e.w, h = e.h, cp = iso(e.x + w / 2, e.y + h / 2); dia(e.x + .06, e.y + .06, w - .12, h - .12, '#c8b48c', 'rgba(90,70,40,.6)', 1.5);
        if (shadow) { g.fillStyle = 'rgba(0,0,0,.2)'; g.beginPath(); g.ellipse(cp[0], cp[1] + 4, 22 * Math.max(w, h), 10 * Math.max(w, h), 0, 0, 7); g.fill(); }
        r.drawEmoji(info ? info.emoji : '🏠', cp[0], cp[1] + 10, 56 + 14 * Math.max(w, h), {});
        g.font = 'bold 11px ' + FONT; g.textAlign = 'center'; g.fillStyle = '#fff'; g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 3; const lt = 'Cấp ' + (e.b.l || 1); g.strokeText(lt, cp[0], cp[1] + 22); g.fillText(lt, cp[0], cp[1] + 22);
        if (e.b.ct && now - e.b.ct > 3600000) r.drawEmoji('🪙', cp[0], cp[1] - 52 - (anim ? Math.abs(Math.sin(t / 400)) * 4 : 0), 22, {});
      } else if (e.t === 'a') {
        const hop = anim ? Math.abs(Math.sin(t / 220 + e.a.i)) * 3 : 0; if (shadow) { g.fillStyle = 'rgba(0,0,0,.18)'; g.beginPath(); g.ellipse(p[0], p[1] + 2, 8, 4, 0, 0, 7); g.fill(); } r.drawEmoji(e.a.e, p[0], p[1] + 4 - hop, e.a.e === '🐄' ? 34 : 24, {});
      }
    }
    if (r.ghost && r.ghost.emoji) r.drawEmoji(r.ghost.emoji, ...(() => { const p = iso(r.ghost.x + (r.ghost.w || 1) / 2, r.ghost.y + (r.ghost.h || 1) / 2); return [p[0], p[1] + 6]; })(), 42 + 10 * ((r.ghost.w || 1) - 1), { alpha: .8 });
    /* đèn ban đêm */
    if (sky.night > .15 && q.shadow) {
      g.globalCompositeOperation = 'lighter'; let n = 0;
      for (const e of r.ents) { if (n > 14) break; let lamp = e.t === 'b'; if (e.t === 'd') { const d = decoOf(e.id); lamp = d && /[🏮💡🕯🔦]/u.test(d.emoji); } if (!lamp) continue; const p = iso(e.x + .5, e.y + .5); if (p[0] < vx0 - 80 || p[0] > vx1 + 80 || p[1] < vy0 || p[1] > vy1 + 80) continue; n++;
        const gr = g.createRadialGradient(p[0], p[1] - 14, 2, p[0], p[1] - 14, 78); gr.addColorStop(0, rd(255, 190, 90, .42 * sky.night)); gr.addColorStop(1, rd(255, 190, 90, 0)); g.fillStyle = gr; g.fillRect(p[0] - 80, p[1] - 94, 160, 160); }
      g.globalCompositeOperation = 'source-over';
    }
    /* hiệu ứng nổ + chữ bay (toạ độ thế giới) */
    for (let i = r.parts.length - 1; i >= 0; i--) { const s = r.parts[i]; if (s.k !== 'b') continue; s.life += dt; if (s.life > s.max) { r.parts.splice(i, 1); continue; } s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 160 * dt; g.fillStyle = s.col; g.globalAlpha = 1 - s.life / s.max; g.beginPath(); g.arc(s.x, s.y, 2.4, 0, 7); g.fill(); g.globalAlpha = 1; }
    const nw = performance.now();
    for (let i = r.fx.length - 1; i >= 0; i--) { const f = r.fx[i], a = (nw - f.t0) / f.dur; if (a >= 1) { r.fx.splice(i, 1); continue; } g.globalAlpha = 1 - a * a; g.font = 'bold ' + (17 / z) + 'px ' + FONT; g.textAlign = 'center'; g.lineWidth = 4 / z; g.strokeStyle = 'rgba(0,0,0,.7)'; g.fillStyle = f.color; const fy = f.y - a * 46; g.strokeText(f.text, f.x, fy); g.fillText(f.text, f.x, fy); g.globalAlpha = 1; }
    /* ánh sáng theo giờ + thời tiết + sinh vật nền (toạ độ màn hình) */
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const wea = q.weather ? sky.weather : 'clear', a = sky.a + (wea === 'rain' ? .1 : 0), m = sky.rgb.map(v => 255 + (v - 255) * a);
    if (a > .01) { g.globalCompositeOperation = 'multiply'; g.fillStyle = rd(wea === 'rain' ? m[0] * .93 : m[0], wea === 'rain' ? m[1] * .95 : m[1], m[2], 1); g.fillRect(0, 0, W, H); g.globalCompositeOperation = 'source-over'; }
    const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .45, W / 2, H / 2, Math.max(W, H) * .8); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.2)'); g.fillStyle = vg; g.fillRect(0, 0, W, H);
    if (anim && q.crit > 0) ambient(t, dt, sky, wea, q);
  }
  function ambient(t, dt, sky, wea, q) {
    const W = r.W, H = r.H, P = r.parts, want = q.crit, cnt = {};
    for (const s of P) cnt[s.k] = (cnt[s.k] || 0) + 1;
    const kind = sky.night > .4 ? 'ff' : 'bf'; if ((cnt[kind] || 0) < want) P.push({ k: kind, x: Math.random() * W, y: H * (.2 + Math.random() * .6), vx: 10 + Math.random() * 14, vy: 0, ph: Math.random() * 7, c: ['#ffb3d1', '#ffd166', '#a0c4ff', '#caffbf'][P.length % 4] });
    if (wea === 'rain' && (cnt.rain || 0) < want * 5) for (let i = 0; i < 3; i++) P.push({ k: 'rain', x: Math.random() * W, y: -10, vx: -40, vy: 520 + Math.random() * 120 });
    if (wea === 'leaves' && (cnt.leaf || 0) < want) P.push({ k: 'leaf', x: Math.random() * W, y: -10, vx: 20, vy: 30 + Math.random() * 30, ph: Math.random() * 7, c: ['#d98a2b', '#c4572a', '#9aa83a'][P.length % 3] });
    if (sky.night < .3 && (cnt.bird || 0) < 1 && Math.random() < .004 * (1000 / q.fps) / 33) P.push({ k: 'bird', x: -20, y: H * (.1 + Math.random() * .3), vx: 50 + Math.random() * 30, ph: Math.random() * 7 });
    g.lineCap = 'round';
    for (let i = P.length - 1; i >= 0; i--) {
      const s = P[i]; if (s.k === 'b') continue; s.ph = (s.ph || 0) + dt * 6;
      if (s.k === 'bf' || s.k === 'ff') { s.x += (s.vx + Math.sin(s.ph * .5) * 14) * dt; s.y += Math.cos(s.ph * .37) * 22 * dt; if (s.x > W + 20) { s.x = -20; s.y = H * (.2 + Math.random() * .6); } if (s.k === 'bf') { const f = Math.abs(Math.sin(s.ph * 2)) * 5 + 1; g.fillStyle = s.c; g.beginPath(); g.ellipse(s.x - 3, s.y, f, 4, -.4, 0, 7); g.ellipse(s.x + 3, s.y, f, 4, .4, 0, 7); g.fill(); } else { g.fillStyle = rd(255, 240, 120, .5 + .5 * Math.sin(s.ph)); g.beginPath(); g.arc(s.x, s.y, 2.2, 0, 7); g.fill(); } }
      else if (s.k === 'rain') { s.x += s.vx * dt; s.y += s.vy * dt; if (s.y > H) { P.splice(i, 1); continue; } g.strokeStyle = 'rgba(190,215,255,.55)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(s.x, s.y); g.lineTo(s.x + 2.4, s.y - 12); g.stroke(); }
      else if (s.k === 'leaf') { s.x += (s.vx + Math.sin(s.ph) * 20) * dt; s.y += s.vy * dt; if (s.y > H + 10) { P.splice(i, 1); continue; } g.fillStyle = s.c; g.beginPath(); g.ellipse(s.x, s.y, 4, 2.2, s.ph, 0, 7); g.fill(); }
      else if (s.k === 'bird') { s.x += s.vx * dt; if (s.x > W + 30) { P.splice(i, 1); continue; } const w = Math.sin(s.ph * 2) * 4; g.strokeStyle = 'rgba(40,40,60,.7)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(s.x - 7, s.y - w); g.quadraticCurveTo(s.x - 3, s.y - 3, s.x, s.y); g.quadraticCurveTo(s.x + 3, s.y - 3, s.x + 7, s.y - w); g.stroke(); }
    }
  }
}

/* ===== Công cụ & thao tác chạm ===== */
const T = { tool: 'select', arg: null, seed: null, carry: null };
const PAN = {};                                                         // panel đăng ký bởi garden-ui.js
let H = null, cleanups = [];
const noop = () => {};
function announce(m) { if (H && H.live) { H.live.textContent = ''; setTimeout(() => { if (H && H.live) H.live.textContent = m; }, 30); } }
function describeCell(x, y) {
  const st = S.view; if (!st) return ''; const k = key(x, y), p = 'Ô ' + x + ',' + y + ': ';
  if (!isOwned(st, x, y)) return p + 'chưa mở khóa.';
  const f = st.f[k]; if (Array.isArray(f)) { const c = cropOf(f[0]), rem = f[1] - nowMs(); return p + (c ? c.name : 'cây') + (rem <= 0 ? ', đã chín.' : ', còn ' + fmtTime(rem) + '.'); }
  if (f === 0) return p + 'đất trống.'; if (st.d[k] != null) { const d = decoOf(st.d[k]); return p + (d ? d.name : 'trang trí') + '.'; }
  for (const id in st.b) { const b = st.b[id], fp = bldFoot(b, bldOf(id)); if (x >= b.x && x < b.x + fp[0] && y >= b.y && y < b.y + fp[1]) { const i = bldOf(id); return p + (i ? i.name : id) + ' cấp ' + (b.l || 1) + '.'; } }
  return p + 'cỏ, có thể cuốc đất.';
}
function cellItem(x, y) {
  const st = S.view, k = key(x, y), f = st.f[k];
  if (Array.isArray(f)) return { type: 'plant', crop: cropOf(f[0]), k: f[0], readyAt: f[1], ripe: f[1] <= nowMs() };
  if (st.d[k] != null) return { type: 'deco', id: st.d[k], info: decoOf(st.d[k]) };
  for (const id in st.b) { const b = st.b[id], fp = bldFoot(b, bldOf(id)); if (x >= b.x && x < b.x + fp[0] && y >= b.y && y < b.y + fp[1]) return { type: 'building', id, b, info: bldOf(id) }; }
  return null;
}
function selectCell(x, y) {
  R.sel = { x, y }; R.kc = { x, y }; const item = cellItem(x, y), owned = isOwned(S.view, x, y);
  emit('select', { x, y, item, cell: { owned, soil: S.view.f[key(x, y)] !== undefined } }); announce(describeCell(x, y)); hudCard(); R.wake();
}
function footprintOk(st, x, y, w, h, ignore) { for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) { if (!isOwned(st, x + i, y + j)) return false; const k = key(x + i, y + j); if (st.f[k] !== undefined || (st.d[k] !== undefined && k !== ignore)) return false; } if (w === 1 && h === 1) return !occupied(st, x, y) || key(x, y) === ignore; for (const id in st.b) { const b = st.b[id], fp = bldFoot(b, bldOf(id)); if (x < b.x + fp[0] && x + w > b.x && y < b.y + fp[1] && y + h > b.y) return false; } return true; }
function setGhost(x, y) {
  const arg = T.carry ? T.carry.id : T.arg, bi = !T.carry && bldOf(arg), di = bi ? null : decoOf(arg); if (!arg) return;
  const w = bi ? bi.w : 1, h = bi ? bi.h : 1, ok = footprintOk(S.view, x, y, w, h, T.carry ? key(T.carry.x, T.carry.y) : null);
  R.ghost = { x, y, w, h, ok, emoji: bi ? bi.emoji : di ? di.emoji : '🎀' }; hudConfirm(); R.wake();
}
function confirmPlace() {
  const gh = R.ghost; if (!gh) return; if (!gh.ok) { toast('Không đặt được ở ô này.', true); sfx('error'); return; }
  let p;
  if (T.carry) { p = queueOp({ op: 'decorate', act: 'move', x: T.carry.x, y: T.carry.y, nx: gh.x, ny: gh.y }); T.carry = null; R.ghost = null; setTool('move'); }
  else if (bldOf(T.arg)) { p = queueOp({ op: 'build', id: T.arg, x: gh.x, y: gh.y }, { immediate: true }); R.ghost = null; setTool('select'); toast('Đang xây…'); }
  else { p = queueOp({ op: 'decorate', act: 'place', id: T.arg, x: gh.x, y: gh.y }); R.ghost = null; }
  p.then(() => { sfx('coin'); R.burst(gh.x, gh.y, '#9be37a'); }, noop); hudConfirm(); R.wake(); announce('Đã đặt.');
}
function cancelPlace() { R.ghost = null; T.carry = null; hudConfirm(); R.wake(); }
function setTool(tool, arg) {
  if (!['select', 'plant', 'harvest', 'till', 'place', 'move', 'remove'].includes(tool)) tool = 'select';
  T.tool = tool; T.carry = null; R && (R.ghost = null, R.brush.clear());
  if (tool === 'plant' && arg != null) { T.seed = arg; LS.set('sm_garden_seed', String(arg)); }
  if (tool === 'place') T.arg = arg != null ? arg : T.arg;
  if (!(tool === 'place' || tool === 'plant')) T.arg = arg != null ? arg : null;
  emit('tool', { tool, arg: tool === 'plant' ? T.seed : T.arg }); hudUpdate(); hudConfirm(); R && R.wake();
}
const canPlantAt = (x, y) => T.seed != null && isOwned(S.view, x, y) && S.view.f[key(x, y)] === 0;
const ripeAt = (x, y) => { const f = S.view.f[key(x, y)]; return Array.isArray(f) && f[1] <= nowMs(); };
function brushable(x, y) {
  if (T.tool === 'plant') return canPlantAt(x, y); if (T.tool === 'harvest') return ripeAt(x, y);
  if (T.tool === 'till') return isOwned(S.view, x, y) && !occupied(S.view, x, y); return false;
}
function paintCell(x, y) {
  const k = key(x, y); if (R.brush.has(k) || !brushable(x, y)) return; R.brush.add(k);
  let p; if (T.tool === 'plant') p = queueOp({ op: 'plant', k: T.seed, x, y }, { silent: true }); else if (T.tool === 'harvest') p = queueOp({ op: 'harvest', x, y }, { silent: true }); else p = queueOp({ op: 'till', x, y }, { silent: true });
  p.catch(noop); R.burst(x, y, T.tool === 'harvest' ? '#ffe36b' : '#9be37a'); sfx('click');
  if (T.tool === 'harvest') R.floatCell(x, y, '✓', '#fff');
}
function tapCell(x, y, ptype) {
  const st = S.view; if (!st) return;
  if (!isOwned(st, x, y)) {                                              // ô khóa: chỉ phát sự kiện, không tự mua
    const cx = cdiv(x), cy = cdiv(y), L = (R.lockCh || []).find(l => l.cx === cx && l.cy === cy);
    if (L) { emit('expand', { cx, cy, cost: R.lockCost }); toast('Mở rộng vườn ở mảnh (' + cx + ',' + cy + ') cần ' + fmt(R.lockCost) + ' điểm.'); sfx('click'); announce('Mảnh đất chưa mở. Mở rộng cần ' + fmt(R.lockCost) + ' điểm.'); }
    else { toast('Hãy mở các mảnh đất kề vườn trước.'); }
    return;
  }
  R.kc = { x, y };
  switch (T.tool) {
    case 'select': selectCell(x, y); break;
    case 'plant': {
      if (T.seed == null) { toast('Hãy chọn hạt giống trước.'); hudSeeds(true); break; }
      if (st.f[key(x, y)] === undefined) { toast('Cần cuốc đất trước khi trồng (công cụ ⛏️).'); sfx('error'); break; }
      queueOp({ op: 'plant', k: T.seed, x, y }).then(() => {}, noop).then(noop); R.burst(x, y, '#9be37a'); sfx('click'); announce('Đã trồng.'); break; }
    case 'harvest': {
      const f = st.f[key(x, y)]; if (!Array.isArray(f)) { toast('Ô này chưa có cây.'); break; }
      if (f[1] > nowMs()) { toast('Chưa chín, còn ' + fmtTime(f[1] - nowMs()) + '.'); sfx('error'); break; }
      queueOp({ op: 'harvest', x, y }).catch(noop); R.burst(x, y); R.floatCell(x, y, '✓', '#fff'); sfx('click'); announce('Đã thu hoạch.'); break; }
    case 'till': queueOp({ op: 'till', x, y }).catch(noop); R.burst(x, y, '#d9a066'); sfx('click'); break;
    case 'remove': { const id = st.d[key(x, y)]; if (id == null) { toast('Chạm vào vật trang trí để gỡ.'); break; } queueOp({ op: 'decorate', act: 'remove', x, y }).then(() => toast('Đã cất vào kho.'), noop); sfx('click'); break; }
    case 'move': {
      if (!T.carry) { const id = st.d[key(x, y)]; if (id == null) { toast('Chạm vào vật trang trí để dời.'); break; } T.carry = { x, y, id }; setGhost(x, y); toast('Chạm ô mới để đặt.'); break; }
      setGhost(x, y); if (ptype === 'mouse') confirmPlace(); break; }
    case 'place': setGhost(x, y); if (ptype === 'mouse') confirmPlace(); break;
  }
}

/* ===== Điều khiển: kéo / chụm / lăn / bàn phím ===== */
function bindInput(r) {
  const cv = r.cv, ptrs = new Map(); let down = null, pinch = null, samples = [];
  cv.style.touchAction = 'none';
  const pos = e => { const b = cv.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; };
  const L = (t, f, o) => { cv.addEventListener(t, f, o); cleanups.push(() => cv.removeEventListener(t, f, o)); };
  L('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button > 1) return; try { cv.setPointerCapture(e.pointerId); } catch (_) {}
    const p = pos(e); ptrs.set(e.pointerId, p); r.vel.x = r.vel.y = 0; r.tgt = null;
    if (ptrs.size === 2) { const a = [...ptrs.values()]; pinch = { d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y), z: r.cam.z, mx: (a[0].x + a[1].x) / 2, my: (a[0].y + a[1].y) / 2 }; down = null; r.brush.clear(); return; }
    const c = r.pick(p.x, p.y); down = { id: e.pointerId, x: p.x, y: p.y, lx: p.x, ly: p.y, moved: false, type: e.pointerType, paint: ['plant', 'harvest', 'till'].includes(T.tool) && S.view && brushable(c[0], c[1]) && e.button !== 1, c };
    samples = [{ x: p.x, y: p.y, t: performance.now() }]; r.hover = e.pointerType === 'mouse' ? { x: c[0], y: c[1] } : null; if (r.run) cv.focus({ preventScroll: true });
  });
  L('pointermove', e => {
    const p = pos(e); if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, p);
    if (pinch && ptrs.size >= 2) { const a = [...ptrs.values()], d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y), mx = (a[0].x + a[1].x) / 2, my = (a[0].y + a[1].y) / 2; r.cam.x -= (mx - pinch.mx) / r.cam.z; r.cam.y -= (my - pinch.my) / r.cam.z; pinch.mx = mx; pinch.my = my; r.zoomAt(pinch.z * d / (pinch.d || 1), mx, my); return; }
    if (e.pointerType === 'mouse' && !down) { const c = r.pick(p.x, p.y); if (!r.hover || r.hover.x !== c[0] || r.hover.y !== c[1]) { r.hover = { x: c[0], y: c[1] }; if (r.ghost && ['place', 'move'].includes(T.tool) && S.view) setGhost(c[0], c[1]); r.wake(); } return; }
    if (!down || down.id !== e.pointerId) return;
    if (!down.moved && Math.hypot(p.x - down.x, p.y - down.y) > (down.type === 'mouse' ? 4 : 8)) down.moved = true;
    if (!down.moved) return;
    if (down.paint) { const n = Math.max(1, Math.ceil(Math.hypot(p.x - down.lx, p.y - down.ly) / (TH * r.cam.z * .35))); for (let i = 1; i <= n; i++) { const c = r.pick(down.lx + (p.x - down.lx) * i / n, down.ly + (p.y - down.ly) * i / n); if (S.view) paintCell(c[0], c[1]); } if (!down.painted) { const c = down.c; paintCell(c[0], c[1]); down.painted = true; } r.wake(); }
    else { r.cam.x -= (p.x - down.lx) / r.cam.z; r.cam.y -= (p.y - down.ly) / r.cam.z; r.clampCam(r.cam); const now = performance.now(); samples.push({ x: p.x, y: p.y, t: now }); while (samples.length > 2 && now - samples[0].t > 90) samples.shift(); r.wake(); }
    down.lx = p.x; down.ly = p.y;
  });
  const up = e => {
    const had = ptrs.has(e.pointerId); ptrs.delete(e.pointerId); if (!had) return;
    if (pinch) { if (ptrs.size < 2) pinch = null; if (ptrs.size === 0) down = null; return; }
    const d = down; down = null; if (!d || d.id !== e.pointerId) return;
    if (d.paint && d.moved) { r.brush.clear(); announce('Đã áp dụng thao tác kéo.'); r.wake(); return; }
    if (!d.moved) { r.brush.clear(); const c = r.pick(d.x, d.y); if (S.view && e.type !== 'pointercancel') tapCell(c[0], c[1], d.type); return; }
    if (!r.reduced() && samples.length > 1) { const a = samples[0], b = samples[samples.length - 1], dt = (b.t - a.t) / 1000; if (dt > .005) { const vx = -(b.x - a.x) / r.cam.z / dt, vy = -(b.y - a.y) / r.cam.z / dt, sp = Math.hypot(vx, vy); if (sp > 60) { const k = Math.min(1, 1600 / sp); r.vel.x = vx * k; r.vel.y = vy * k; r.wake(); } } }
  };
  L('pointerup', up); L('pointercancel', up);
  L('pointerleave', e => { if (e.pointerType === 'mouse') { r.hover = null; r.wake(); } });
  L('wheel', e => { e.preventDefault(); const p = pos(e); r.zoomAt(r.cam.z * Math.exp(-e.deltaY * (e.ctrlKey ? .01 : .0015)), p.x, p.y); }, { passive: false });
  L('contextmenu', e => e.preventDefault());
  L('keydown', e => {
    if (!S.view) return; const k = e.key, st = r.kc || r.sel || (() => { const c = r.pick(r.W / 2, r.H / 2); return { x: c[0], y: c[1] }; })();
    const D = { ArrowUp: [-1, -1], ArrowDown: [1, 1], ArrowLeft: [-1, 1], ArrowRight: [1, -1] };
    if (D[k]) { e.preventDefault(); if (e.shiftKey) { r.cam.x += D[k][0] === D[k][1] ? 0 : (D[k][0] > 0 ? 90 : -90) / r.cam.z; r.cam.y += D[k][0] === D[k][1] ? (D[k][0] > 0 ? 90 : -90) / r.cam.z : 0; r.clampCam(r.cam); r.wake(); return; }
      r.kc = { x: st.x + D[k][0], y: st.y + D[k][1] }; const s = r.toScreen(r.kc.x, r.kc.y); if (s[0] < 30 || s[0] > r.W - 30 || s[1] < 30 || s[1] > r.H - 30) r.goTo(r.kc.x, r.kc.y); if (r.ghost) setGhost(r.kc.x, r.kc.y); announce(describeCell(r.kc.x, r.kc.y)); r.wake(); }
    else if (k === 'Enter' || k === ' ') { e.preventDefault(); if (r.ghost && r.kc && r.ghost.x === r.kc.x && r.ghost.y === r.kc.y) confirmPlace(); else tapCell(st.x, st.y, 'key'); }
    else if (k === '+' || k === '=') r.zoomAt(r.cam.z * 1.25, r.W / 2, r.H / 2); else if (k === '-' || k === '_') r.zoomAt(r.cam.z / 1.25, r.W / 2, r.H / 2);
    else if (k === '0') r.center();
    else if (k === 'Escape') { if (r.ghost || T.carry) cancelPlace(); else { r.sel = null; r.brush.clear(); hudCard(); } r.wake(); }
  });
  L('focus', () => { if (!r.kc) { const c = r.sel || (() => { const p = r.pick(r.W / 2, r.H / 2); return { x: p[0], y: p[1] }; })(); r.kc = { x: c.x, y: c.y }; } r.wake(); });
  L('blur', () => r.wake());
}

/* ===== HUD (DOM) ===== */
const el = (tag, cls, text, attrs) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
const btn = (cls, text, label, fn) => { const b = el('button', 'gd-btn ' + (cls || ''), text, { type: 'button', 'aria-label': label || text }); if (fn) b.addEventListener('click', fn); return b; };
const SYNC_TXT = { saved: 'Đã lưu', sync: 'Đang đồng bộ…', offline: 'Ngoại tuyến', error: 'Lỗi đồng bộ', idle: '' };
const MENU = [['shop', '🛒', 'Cửa hàng'], ['upgrades', '⬆️', 'Nâng cấp'], ['quests', '📜', 'Nhiệm vụ'], ['prestige', '🌟', 'Sang mùa'], ['stats', '📊', 'Thống kê'], ['settings', '⚙️', 'Cài đặt']];
const TOOLS = [['select', '👆', 'Chọn'], ['harvest', '🧺', 'Thu hoạch'], ['till', '⛏️', 'Cuốc đất'], ['move', '✥', 'Dời'], ['remove', '🗑️', 'Gỡ']];
let curPanel = null;

function buildHud(stage) {
  H = { live: el('div', 'gd-sr', '', { 'aria-live': 'polite', role: 'status' }), tools: {} };
  const top = el('div', 'gd-top'), pills = el('div', 'gd-pills');
  const pill = (ic, label) => { const p = el('span', 'gd-pill', null, { 'aria-label': label }); p.append(el('span', 'gd-ic', ic, { 'aria-hidden': 'true' })); const b = el('b', '', '0'); p.append(b); pills.append(p); return b; };
  H.bal = pill('💰', 'Số dư điểm'); H.xu = pill('🪙', 'Xu vườn'); H.es = pill('🌸', 'Tinh hoa');
  H.dot = el('span', 'gd-sync', null, { role: 'status' }); H.dot.append(el('i', 'gd-dot'), H.dotT = el('span', '', '')); pills.append(H.dot);
  const lv = el('div', 'gd-lv'); H.lvT = el('span', 'gd-lvt', 'Cấp 1'); const bar = el('div', 'gd-bar', null, { role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': 'Kinh nghiệm vườn' }); H.bar = el('i'); bar.append(H.bar); H.barEl = bar; lv.append(H.lvT, bar);
  top.append(pills, lv);
  const zoom = el('div', 'gd-zoom'); zoom.append(btn('', '+', 'Phóng to', () => R.zoomAt(R.cam.z * 1.3, R.W / 2, R.H / 2)), btn('', '−', 'Thu nhỏ', () => R.zoomAt(R.cam.z / 1.3, R.W / 2, R.H / 2)), btn('', '◎', 'Căn giữa vườn', () => R.center()));
  H.card = el('div', 'gd-card', null, { role: 'group', 'aria-label': 'Thông tin ô' }); H.card.hidden = true;
  H.confirm = el('div', 'gd-confirm'); H.confirm.hidden = true; H.confT = el('span', 'gd-conft', ''); H.confirm.append(H.confT, btn('ok', '✔ Đặt', 'Đặt vật phẩm', confirmPlace), btn('no', '✖', 'Hủy', cancelPlace));
  const tb = el('div', 'gd-toolbar', null, { role: 'toolbar', 'aria-label': 'Công cụ vườn' }), r1 = el('div', 'gd-row');
  H.seed = btn('seed', '🌱', 'Chọn hạt giống', () => hudSeeds()); H.seedT = el('small', '', 'Hạt'); H.seed.append(H.seedT); r1.append(H.seed);
  for (const [id, ic, lb] of TOOLS) { const b = btn('tool', ic, lb, () => { setTool(id); sfx('click'); announce('Công cụ: ' + lb); }); b.append(el('small', '', lb)); b.setAttribute('aria-pressed', 'false'); H.tools[id] = b; r1.append(b); }
  const r2 = el('div', 'gd-row'); H.all = btn('wide', '🧺 Thu hoạch tất cả', 'Thu hoạch tất cả cây đã chín', () => { if (!H.ripeN) { toast('Chưa có cây nào chín.'); return; } queueOp({ op: 'harvestAll' }, { immediate: true }).catch(noop); R.burst(R.kc ? R.kc.x : 0, R.kc ? R.kc.y : 0); sfx('click'); announce('Đang thu hoạch tất cả.'); });
  H.allN = el('span', 'gd-badge', '0'); H.all.append(H.allN); H.menuB = btn('menu', '☰ Menu', 'Mở menu vườn', () => toggleMenu()); H.menuB.setAttribute('aria-haspopup', 'true'); r2.append(H.all, H.menuB); tb.append(r1, r2);
  H.seedPop = el('div', 'gd-pop gd-seedpop', null, { role: 'dialog', 'aria-label': 'Chọn hạt giống' }); H.seedPop.hidden = true;
  H.menu = el('div', 'gd-pop gd-menu', null, { role: 'menu' }); H.menu.hidden = true;
  for (const [id, ic, lb] of MENU) { const b = el('button', 'gd-mi', ic + ' ' + lb, { type: 'button', role: 'menuitem' }); b.addEventListener('click', () => { H.menu.hidden = true; openPanel(id); }); H.menu.append(b); }
  H.sheet = el('div', 'gd-sheet', null, { role: 'dialog', 'aria-modal': 'false' }); H.sheet.hidden = true;
  H.ov = el('div', 'gd-ov', null, { role: 'status' }); H.ov.hidden = true;
  stage.append(top, zoom, H.card, H.confirm, tb, H.seedPop, H.menu, H.sheet, H.ov, H.live);
  H.tickT = setInterval(hudTick, 1000); cleanups.push(() => clearInterval(H.tickT));
}
function hudOverlay(msg, retry) {
  if (!H) return; if (!msg) { H.ov.hidden = true; return; } H.ov.replaceChildren(el('p', '', msg)); if (retry) H.ov.append(btn('ok', 'Thử lại', 'Thử lại', retry)); H.ov.hidden = false;
}
function hudSync() { if (!H) return; H.dot.dataset.s = S.status; H.dotT.textContent = SYNC_TXT[S.status] || ''; }
function ripeCount() { let n = 0; const now = nowMs(); if (S.view) for (const k in S.view.f) { const f = S.view.f[k]; if (Array.isArray(f) && f[1] <= now) n++; } return n; }
function hudUpdate() {
  if (!H || !S.view) return; const st = S.view, lv = gardenLevel(st);
  H.bal.textContent = fmt(ctx && ctx.getBalance ? ctx.getBalance() : 0); H.xu.textContent = fmt(st.xu); H.es.textContent = fmt(st.es);
  H.lvT.textContent = 'Cấp ' + lv.lv; H.bar.style.width = Math.round(lv.frac * 100) + '%'; H.barEl.setAttribute('aria-valuenow', Math.round(lv.frac * 100)); H.barEl.title = lv.need ? fmt(lv.into) + ' / ' + fmt(lv.need) + ' XP' : '';
  for (const id in H.tools) { const on = T.tool === id; H.tools[id].setAttribute('aria-pressed', on); H.tools[id].classList.toggle('on', on); }
  const c = T.seed != null ? cropOf(T.seed) : null; H.seed.classList.toggle('on', T.tool === 'plant'); H.seed.setAttribute('aria-pressed', T.tool === 'plant');
  H.seed.firstChild.textContent = c ? c.emoji : '🌱'; H.seedT.textContent = c ? c.name : 'Hạt';
  H.ripeN = ripeCount(); H.allN.textContent = H.ripeN; H.allN.hidden = !H.ripeN; H.all.classList.toggle('ready', !!H.ripeN);
  hudSync(); hudCard(true); if (curPanel && curPanel.inst && curPanel.inst.update) try { curPanel.inst.update(api()); } catch (_) {}
}
function hudTick() { if (!alive || !S.view) return; const n = ripeCount(); if (n !== H.ripeN) { H.ripeN = n; H.allN.textContent = n; H.allN.hidden = !n; H.all.classList.toggle('ready', !!n); if (R) R.wake(); } hudCard(true); }
function hudConfirm() {
  if (!H) return; const gh = R && R.ghost, show = !!gh && !!(T.carry || T.tool === 'place'); H.confirm.hidden = !show; if (!show) return;
  const id = T.carry ? T.carry.id : T.arg, d = decoOf(id), b = bldOf(id), inv = S.view && S.view.iv[id] > 0;
  H.confT.textContent = (b ? b.name : d ? d.name : 'Vật phẩm') + (T.carry ? ' · Dời' : inv ? ' · Từ kho' : d ? ' · ~' + fmt(Math.ceil(d.price * Math.pow(2.6, d.tier) * costMul())) + ' 💰' : b ? ' · ' + fmt(Math.ceil(b.price * costMul())) + ' 💰' : '') + (gh.ok ? '' : ' · ô không hợp lệ');
}
function hudCard(soft) {
  if (!H) return; const c = H.card, sel = R && R.sel; if (!sel || !S.view) { c.hidden = true; c.dataset.k = ''; return; }
  const st = S.view, it = cellItem(sel.x, sel.y), owned = isOwned(st, sel.x, sel.y), now = nowMs(), sig = sel.x + ',' + sel.y + (it ? it.type + (it.ripe ? 'r' : '') : '') + (it && it.b ? it.b.l : '') + (st.f[key(sel.x, sel.y)] === 0 ? 's' : '') + owned;
  let line;
  if (it && it.type === 'plant') line = (it.crop ? it.crop.emoji + ' ' + it.crop.name : 'Cây') + (it.ripe ? ' · Đã chín!' : ' · Còn ' + fmtTime(it.readyAt - now));
  if (soft && c.dataset.k === sig && c.hidden === false) { if (line) c.firstChild.firstChild.textContent = line; return; }
  c.dataset.k = sig; c.hidden = false; c.replaceChildren();
  const head = el('div', 'gd-ch'), tt = el('span', 'gd-ct', ''); head.append(tt, btn('x', '✖', 'Đóng', () => { R.sel = null; hudCard(); R.wake(); })); c.append(head); const acts = el('div', 'gd-ca'); c.append(acts);
  if (!owned) { tt.textContent = 'Ô chưa mở khóa'; return; }
  if (it && it.type === 'plant') {
    tt.textContent = line;
    if (it.ripe) acts.append(btn('ok', '🧺 Thu hoạch', 'Thu hoạch', () => { queueOp({ op: 'harvest', x: sel.x, y: sel.y }).catch(noop); R.burst(sel.x, sel.y); sfx('click'); }));
    else { const rem = (it.readyAt - now) / 1000, cost = Math.max(1, Math.ceil(rem / 300 * (+(S.derived && S.derived.boostMul) || 1))), pts = Math.ceil(cost * costMul()); acts.append(btn('', '⚡ Tăng tốc ~' + fmt(pts) + ' 💰', 'Tăng tốc cây, khoảng ' + pts + ' điểm', () => { queueOp({ op: 'boost', x: sel.x, y: sel.y }, { immediate: true }).catch(noop); sfx('click'); })); }
  } else if (it && it.type === 'building') {
    tt.textContent = (it.info ? it.info.emoji + ' ' + it.info.name : it.id) + ' · Cấp ' + (it.b.l || 1);
    acts.append(btn('ok', '🪙 Thu sản vật', 'Thu sản vật', () => { queueOp({ op: 'collect', id: it.id }, { immediate: true }).catch(noop); }), btn('', '⬆️ Nâng cấp', 'Nâng cấp công trình', () => { emit('openpanel', { panel: 'upgrades', id: it.id }); openPanel('upgrades', { id: it.id }, true); }));
  } else if (it && it.type === 'deco') {
    tt.textContent = (it.info ? it.info.emoji + ' ' + it.info.name : 'Trang trí') + (it.info && it.info.tier ? ' · Bậc ' + it.info.tier : '');
    acts.append(btn('', '✥ Dời', 'Dời vật trang trí', () => { setTool('move'); T.carry = { x: sel.x, y: sel.y, id: it.id }; setGhost(sel.x, sel.y); }), btn('no', '🗑️ Gỡ', 'Cất vào kho', () => { queueOp({ op: 'decorate', act: 'remove', x: sel.x, y: sel.y }).then(() => toast('Đã cất vào kho.'), noop); R.sel = null; hudCard(); }));
  } else if (st.f[key(sel.x, sel.y)] === 0) {
    tt.textContent = 'Đất trống'; acts.append(btn('ok', '🌱 Trồng', 'Trồng cây', () => { if (T.seed == null) hudSeeds(true); else { setTool('plant'); tapCell(sel.x, sel.y, 'touch'); } }));
  } else { tt.textContent = 'Cỏ · ô trống'; acts.append(btn('', '⛏️ Cuốc đất', 'Cuốc đất ô này', () => { queueOp({ op: 'till', x: sel.x, y: sel.y }).catch(noop); sfx('click'); })); }
}
function hudSeeds(forceOpen) {
  if (!H) return; const p = H.seedPop; if (!forceOpen && !p.hidden) { p.hidden = true; return; } H.menu.hidden = true; p.replaceChildren();
  const hd = el('div', 'gd-ph'); hd.append(el('b', '', 'Chọn hạt giống'), btn('x', '✖', 'Đóng', () => { p.hidden = true; })); p.append(hd);
  const gr = el('div', 'gd-grid'), lvl = gardenLevel(S.view).lv, mul = +(S.derived && S.derived.seedMul) || 1;
  if (!CAT || !CAT.crops.length) gr.append(el('p', 'gd-muted', 'Chưa tải được danh sách hạt giống.'));
  for (const c of (CAT ? CAT.crops : [])) { const locked = c.lvl > lvl, b = el('button', 'gd-seed' + (c.i === +T.seed || c.id === T.seed ? ' on' : ''), null, { type: 'button', 'aria-label': c.name + ', ' + fmt(Math.round(c.seed * mul)) + ' xu, thời gian ' + fmtTime(c.g * 1000) + (locked ? ', cần cấp ' + c.lvl : '') }); b.disabled = locked;
    b.append(el('span', 'gd-se', c.emoji), el('span', 'gd-sn', c.name), el('small', '', locked ? '🔒 Cấp ' + c.lvl : fmt(Math.round(c.seed * mul)) + ' 🪙 · ' + fmtTime(c.g * 1000)));
    b.addEventListener('click', () => { setTool('plant', c.id); p.hidden = true; sfx('click'); announce('Đã chọn hạt ' + c.name); }); gr.append(b); }
  p.append(gr); p.hidden = false;
}
function toggleMenu() { if (!H) return; H.seedPop.hidden = true; H.menu.hidden = !H.menu.hidden; H.menuB.setAttribute('aria-expanded', !H.menu.hidden); }

/* ---- Panel (do garden-ui.js đăng ký) ---- */
function closePanel() { if (curPanel) { try { curPanel.inst && curPanel.inst.destroy && curPanel.inst.destroy(); } catch (_) {} curPanel = null; } if (H) { H.sheet.hidden = true; H.sheet.replaceChildren(); } }
function openPanel(name, data, silent) {
  if (!silent) emit('openpanel', { panel: name, data: data || null });
  if (!H) return; closePanel(); const f = PAN[name] || (name === 'settings' ? settingsPanel : null);
  if (!f) { if (!LST.openpanel || !LST.openpanel.length) toast('Tính năng này sẽ có trong bản cập nhật tới.'); return; }
  const lb = (MENU.find(m => m[0] === name) || [0, '', name])[2], hd = el('div', 'gd-sh'), body = el('div', 'gd-sb'); hd.append(el('b', '', lb), btn('x', '✖', 'Đóng bảng', closePanel)); H.sheet.setAttribute('aria-label', lb); H.sheet.replaceChildren(hd, body); H.sheet.hidden = false;
  curPanel = { name, inst: null }; try { curPanel.inst = f(body, api(), data) || null; } catch (e) { console.error(e); toast('Không mở được bảng này.', true); closePanel(); }
}
function settingsPanel(body) {
  const a = el('div', 'gd-set'); a.append(el('p', 'gd-muted', 'Chất lượng đồ họa (Tự động sẽ giảm khi máy yếu):'));
  const g = el('div', 'gd-seg', null, { role: 'group', 'aria-label': 'Chất lượng đồ họa' });
  for (const [k, lb] of [['auto', 'Tự động'], ['low', 'Thấp'], ['mid', 'Vừa'], ['high', 'Cao']]) { const b = btn(R && R.qSetting === k ? 'on' : '', lb, lb, () => { R.setQuality(k); g.querySelectorAll('button').forEach(x => x.classList.remove('on')); b.classList.add('on'); }); g.append(b); }
  a.append(g, btn('', '◎ Căn giữa vườn', 'Căn giữa vườn', () => R.center()), btn('', '🔄 Đồng bộ lại với máy chủ', 'Đồng bộ lại', () => refresh()), el('p', 'gd-muted', 'Phiên bản engine ' + VERSION + (R ? ' · chất lượng đang dùng: ' + ({ low: 'Thấp', mid: 'Vừa', high: 'Cao' })[R.quality] : '')));
  body.append(a);
}

/* ===== Mount / unmount & API công khai ===== */
const api = () => API;
function mount(rootEl, c) {
  if (!hasDoc) return; if (alive) unmount(); ctx = c; alive = true; S.fatal = null; S.server = S.view = null; S.status = 'idle'; cleanups = [];
  const seed = LS.get('sm_garden_seed'); T.tool = 'select'; T.carry = null; T.seed = seed != null && seed !== '' ? (isNaN(+seed) ? seed : +seed) : null;
  rootEl.replaceChildren(); const wrap = el('div', 'gd-root'), stage = el('div', 'gd-stage'); wrap.append(stage); rootEl.append(wrap); wrap._host = rootEl;
  R = createRenderer(stage); installLoop(R); bindInput(R); buildHud(stage); H.wrap = wrap; R.stage = stage;
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { const b = stage.getBoundingClientRect(); R.run = b.width > 0 && b.height > 0 && !document.hidden; if (R.run) { R.resize(); } }) : null;
  if (ro) { ro.observe(stage); cleanups.push(() => ro.disconnect()); } else { R.resize(); const f = () => R.resize(); root.addEventListener('resize', f); cleanups.push(() => root.removeEventListener('resize', f)); }
  const G = (t, f, o, tg) => { (tg || document).addEventListener(t, f, o); cleanups.push(() => (tg || document).removeEventListener(t, f, o)); };
  let hiddenAt = 0;
  G('visibilitychange', () => { if (document.hidden) { hiddenAt = Date.now(); flush(); R.run = false; } else { R.run = true; R.wake(); if (hiddenAt && Date.now() - hiddenAt > 20000) refresh(); hiddenAt = 0; } });
  G('pagehide', () => flush(), null, root); G('online', () => { retryNow(); if (S.status === 'offline') refresh(); }, null, root); G('offline', () => setStatus('offline'), null, root);
  G('pointerdown', e => { if (H && !H.menu.hidden && !H.menu.contains(e.target) && e.target !== H.menuB) H.menu.hidden = true; if (H && !H.seedPop.hidden && !H.seedPop.contains(e.target) && !H.seed.contains(e.target)) H.seedPop.hidden = true; });
  G('keydown', e => { if (e.key === 'Escape' && H && !H.sheet.hidden) closePanel(); });
  hudOverlay('Đang tải khu vườn…'); hudSync();
  const boot = async () => {
    try { await settle(); hudOverlay('Đang tải khu vườn…'); await loadState(); if (!alive) return; hudOverlay(null); R.resize(); R.center(); hudUpdate(); emit('ready', { state: S.view, derived: S.derived }); if (!S.fatal) refreshSoon(); }
    catch (e) { if (!alive) return; if (e && e.code === 'garden_disabled') { S.fatal = e.message; hudOverlay(e.message || 'Khu vườn đang tắt.'); } else hudOverlay((e && e.message) || 'Không tải được khu vườn.', boot); }
  };
  boot();
}
function refreshSoon() { /* chỗ dành cho tải nền sau mount (hiện không cần) */ }
function unmount() {
  if (!alive) return; try { flush(); } catch (_) {}
  alive = false; closePanel(); clearTimeout(S.timer);
  if (R) { cancelAnimationFrame(R.raf); clearTimeout(R.slowT); R.run = false; R.chunks.clear(); R.sprites.clear(); R.cv.width = R.cv.height = 0; }
  cleanups.forEach(f => { try { f(); } catch (_) {} }); cleanups = [];
  if (H && H.wrap && H.wrap._host) H.wrap._host.replaceChildren(); H = null; R = null; emit('unmount', {});
}
function act(ops, opt) {
  opt = opt || {}; const arr = Array.isArray(ops) ? ops : [ops], po = Object.assign({}, opt, { immediate: false });
  const ps = arr.map(o => queueOp(o, po)); if (opt.immediate) scheduleFlush(true); return Promise.all(ps).then(r => r[r.length - 1]);
}
const scene = {
  get camera() { return R ? { x: R.cam.x, y: R.cam.y, zoom: R.cam.z } : null; }, get quality() { return R ? R.quality : null; },
  goTo(x, y, z) { R && R.goTo(x, y, z); }, center() { R && R.center(); }, zoomBy(f) { R && R.zoomAt(R.cam.z * f, R.W / 2, R.H / 2); },
  pick(px, py) { return R ? R.pick(px, py) : null; }, toScreen(x, y) { return R ? R.toScreen(x, y) : null; },
  flash(x, y, text, color) { R && R.floatCell(x, y, text, color); }, burst(x, y, c) { R && R.burst(x, y, c); }, invalidate() { if (R) { R.chunks.clear(); R.wake(); } },
  setQuality(q) { R && R.setQuality(q); }, select(x, y) { if (R && S.view) selectCell(x, y); }
};
const API = {
  version: VERSION, mount, unmount, scene, on, off, fmt, fmtTime, act, refresh, setTool,
  getState: () => S.view ? cloneJ(S.view) : null, getDerived: () => S.derived ? cloneJ(S.derived) : null,
  getTool: () => ({ tool: T.tool, arg: T.tool === 'plant' ? T.seed : T.arg }), getCatalog: () => CAT ? CAT.raw : null,
  getStatus: () => S.status, serverNow: nowMs, level: () => S.view ? gardenLevel(S.view) : null, cropInfo: cropOf, buildingInfo: bldOf, decoInfo: decoOf,
  registerPanel(name, factory) { PAN[name] = factory; }, setErrorMapper(f) { errMap = typeof f === 'function' ? f : null; }, setCalm(b) { forceCalm = !!b; R && R.wake(); }, openPanel, closePanel, setQuality(q) { R && R.setQuality(q); }, flush: () => settle(),
  constants: PERF, _t: { fmt, iso, grid, cellAt, chunkRange, hash, applyOp, normCrop, buildBatch, setCatalog, S, TW, TH, CH, key }
};
root.SMGarden = API;
})(typeof window !== 'undefined' ? window : globalThis);

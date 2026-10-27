/* Spelling Mastery – Khu vườn: GIAO DIỆN (garden-ui.js) v1.1.0
 * Gắn vào engine garden.js qua SMGarden.registerPanel / on('openpanel'…). Nạp SAU garden.js.
 * Máy chủ quyết giá, thưởng, điều kiện (GARDEN_SPEC.md); file này chỉ hiển thị, tính trước để xem, và xin xác nhận.
 * Điểm (💰) chỉ để chi; Xu 🪙 / Tinh hoa 🌸 không đổi ngược thành điểm. Chi ≥ 25% số dư hoặc ≥ 200 điểm luôn hỏi xác nhận (chỉ là tiện ích, máy chủ mới quyết định).
 * Các tên trường catalog mà SPEC không nêu (perms, ach, themes, tiers, quest) được đọc phòng thủ – xem pk()/norm* bên dưới. */
(function (root) {
'use strict';
const G = root.SMGarden;
if (!G || typeof G.registerPanel !== 'function' || typeof document === 'undefined') return;

/* ===== Tiện ích ===== */
const LS = { get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }, set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (_) {} } };
const K_UI = 'sm_garden_ui', K_SEEN = 'sm_garden_seen', K_SND = 'sm_garden_snd';
const cfg = (() => { let o = {}; try { o = JSON.parse(LS.get(K_UI) || '{}') || {}; } catch (_) {} return Object.assign({ fmt: 'short', calm: false }, o); })();
const saveCfg = () => LS.set(K_UI, JSON.stringify(cfg));
const F = n => { n = Number(n) || 0; return cfg.fmt === 'full' && Math.abs(n) < 1e15 ? Math.round(n).toLocaleString('vi-VN') : G.fmt(n); };
const el = (t, c, x, a) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; if (a) for (const k in a) e.setAttribute(k, a[k]); return e; };
const btn = (cls, text, label, fn) => { const b = el('button', 'gd-btn' + (cls ? ' ' + cls : ''), text, { type: 'button' }); if (label) b.setAttribute('aria-label', label); if (fn) b.addEventListener('click', fn); return b; };
const $ = (s, r) => (r || document).querySelector(s);
const pk = (o, ns, d) => { for (const n of ns) if (o && o[n] != null) return o[n]; return d; };
const SG = () => root.SMGame || {};
const bal = () => +(SG().getBalance && SG().getBalance()) || 0;
const toastG = (m, bad) => { try { SG().toast && SG().toast(m, !!bad); } catch (_) {} };
const sfx = n => { try { SG().sfx && SG().sfx(n); } catch (_) {} };
const fold = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
const cm = () => { const d = G.getDerived(), c = d && +d.costPct; return c ? (c > 5 ? c / 100 : c) : 1; };    // hệ số giá điểm (100 hoặc 1.0 đều hiểu)
const lvl = () => (G.level() || { lv: 1 }).lv;
const big = c => c > 0 && (c >= 200 || c >= .25 * bal());                                                    // ngưỡng hộp xác nhận chi điểm
const FX = n => Math.round(Number(n) || 0).toLocaleString('vi-VN');                                          // số đầy đủ cho hộp xác nhận
function capInfo() { const d = G.getDerived(), sp = d && d.spend; if (!sp || !(+sp.cap > 0)) return null; const today = +sp.today || 0; return { today, cap: +sp.cap, remaining: sp.remaining == null ? Math.max(0, +sp.cap - today) : +sp.remaining }; }
const wdE = id => { const d = G.getDerived(); if (!d || !Array.isArray(d.wd)) return null; for (const e of d.wd) if (e && e.id === id) return e; return null; };
function capLine() { const c = capInfo(); return c ? el('p', 'gdu-capline', 'Hôm nay đã dùng ' + FX(c.today) + '/' + FX(c.cap) + ' điểm cho vườn', { role: 'status' }) : null; }
function repBox() {
  const r = G.rep(); if (!r.has) return null; const s = el('section', 'gdu-rep'), pc = Math.round(r.frac * 100);
  const bar = el('div', 'gdu-bar', null, { role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': pc, 'aria-label': 'Tiến độ lên hạng Danh vọng kế tiếp' }), i = el('i'); i.style.width = pc + '%'; bar.append(i);
  s.append(el('b', 'gdu-rephd', '🏅 Danh vọng ' + r.lv + (r.title ? ' · ' + r.title : '')), bar,
    el('span', 'gdu-sub', (r.next == null ? 'Bạn đã đạt hạng Danh vọng cao nhất. ' : 'Còn ' + FX(Math.max(0, r.next - r.cur)) + ' điểm dùng cho vườn nữa để lên hạng ' + (r.lv + 1) + '. ') + 'Danh vọng mở Kỳ quan và trang trí bậc cao. Cứ thong thả, không cần vội.'));
  return s;
}
const IC = { pt: '💰', xu: '🪙', es: '🌸' }, NM = { pt: 'điểm', xu: 'Xu', es: 'Tinh hoa' };
const money = (kind, n) => { const s = el('span', 'gdu-cost', null, { 'aria-label': F(n) + ' ' + NM[kind] }); s.append(el('span', '', IC[kind], { 'aria-hidden': 'true' }), document.createTextNode(' ' + F(n))); return s; };
function sprite(ch, size) {                                       // cùng cách vẽ emoji như engine (font + canvas), để thẻ trông giống trên bản đồ
  size = size || 34; const dpr = Math.min(2, root.devicePixelRatio || 1), w = Math.ceil(size * 1.4), c = document.createElement('canvas');
  c.width = c.height = Math.ceil(w * dpr); c.style.width = c.style.height = w + 'px'; c.setAttribute('aria-hidden', 'true'); c.className = 'gdu-sp';
  const x = c.getContext('2d'); if (x) { x.font = (size * dpr) + 'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(ch || '🌱'), c.width / 2, c.height / 2 + size * dpr * .06); }
  return c;
}
const vnDay = () => { const t = new Date(G.serverNow() + 7 * 3600000); return { iso: t.toISOString().slice(0, 10), idx: Math.floor(t.getTime() / 864e5) }; };
const sameDay = v => { if (v == null) return false; const d = vnDay(); return String(v) === d.iso || +v === d.idx || String(v).replace(/-/g, '') === d.iso.replace(/-/g, ''); };

/* ===== Lỗi → lời thân thiện ===== */
const FRIENDLY = {
  garden_disabled: 'Giáo viên đang tắt Khu vườn. Hãy quay lại sau nhé.',
  garden_not_enough_points: 'Bạn chưa đủ điểm. Làm thêm bài từ vựng để kiếm điểm rồi quay lại.',
  garden_not_enough_xu: 'Chưa đủ Xu 🪙. Thu hoạch thêm rồi thử lại.',
  garden_daily_cap: 'Hôm nay bạn đã dùng hết số điểm giáo viên cho phép chi cho vườn. Điểm của bạn không bị trừ. Mai chơi tiếp nhé.',
  garden_maxed: 'Mục này đã đạt mức tối đa rồi nên không nâng thêm được. Điểm của bạn không bị trừ.',
  garden_locked: 'Chưa mở khóa: cần thêm Danh vọng, cấp vườn hoặc mùa phù hợp.',
  garden_cell_busy: 'Ô này đang có vật khác.', garden_bad_cell: 'Ô này chưa mở hoặc không hợp lệ.',
  garden_not_ready: 'Cây chưa chín.', garden_no_crop: 'Ô này chưa có cây.',
  garden_already: 'Bạn đã nhận phần này rồi.', garden_nothing: 'Chưa có gì để nhận lúc này.', garden_not_done: 'Chưa đủ tiến độ để nhận thưởng.',
  garden_limit: 'Vườn đã chạm giới hạn của mục này.', garden_full: 'Vườn đã quá lớn. Hãy cất bớt vật trang trí.',
  garden_too_many_ops: 'Bạn thao tác quá nhiều cùng lúc. Thử từng chút một.', garden_too_many_cells: 'Chọn quá nhiều ô cùng lúc. Thử ít ô hơn.',
  garden_unknown_op: 'Máy chủ chưa hỗ trợ thao tác này. Hãy báo giáo viên cập nhật.',
  garden_bad_request: 'Yêu cầu không hợp lệ. Bấm Làm mới và thử lại.', garden_corrupt: 'Dữ liệu vườn có lỗi. Bấm Làm mới; nếu vẫn lỗi hãy báo giáo viên.',
  busy: 'Máy chủ đang bận, sẽ tự thử lại.', network: 'Mạng yếu hoặc mất kết nối. Thao tác sẽ được gửi lại khi có mạng.', rate_limited: 'Bạn thao tác quá nhanh, chờ một giây.'
};
const STALE = /stale|version|conflict|outdated|baseV/i;
function friendly(code, msg) {
  if (STALE.test(code + ' ' + (msg || ''))) { setTimeout(() => G.refresh(), 50); return 'Dữ liệu vườn đã đổi ở nơi khác. Đang làm mới…'; }
  return FRIENDLY[code] || msg || 'Có lỗi xảy ra. Thử lại sau nhé.';
}
if (G.setErrorMapper) G.setErrorMapper(friendly);

/* ===== Thông báo trong bảng, hộp xác nhận ===== */
let note = null;
function say(m, bad) { if (note && note.isConnected) { note.textContent = m; note.className = 'gdu-note' + (bad ? ' bad' : ''); note.hidden = false; } else toastG(m, bad); }
const stage = () => $('.gd-stage');
const focusables = r => Array.from(r.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),[href],[tabindex]:not([tabindex="-1"])')).filter(e => !e.hidden && e.offsetParent !== null);
function trap(root_, e, onEsc) {
  if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); onEsc && onEsc(); return; }
  if (e.key !== 'Tab') return; const f = focusables(root_); if (!f.length) return; const a = f[0], z = f[f.length - 1];
  if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
}
function ask(title, msg, okText, extra) {
  return new Promise(res => {
    const host = stage() || document.body, back = document.activeElement, ov = el('div', 'gdu-ov', null, { role: 'alertdialog', 'aria-modal': 'true', 'aria-label': title });
    const box = el('div', 'gdu-dlg'); box.append(el('b', 'gdu-dt', title), el('p', '', msg)); if (extra) box.append(extra);
    const done = v => { ov.remove(); try { back && back.focus && back.focus(); } catch (_) {} res(v); };
    const no = btn('', 'Hủy', 'Hủy, không làm', () => done(false)), ok = btn('ok', okText || 'Đồng ý', okText || 'Đồng ý', () => done(true));
    const row = el('div', 'gdu-row2'); row.append(no, ok); box.append(row); ov.append(box); ov.addEventListener('keydown', e => trap(ov, e, () => done(false)));
    host.append(ov); no.focus();
  });
}
async function spend(cost, title, msg, okText) {                  // true = được phép chi điểm
  const b = bal(); if (cost > b) { say('Bạn chưa đủ điểm: cần khoảng ' + FX(cost) + ', đang có ' + FX(b) + '. Làm thêm bài từ vựng để kiếm điểm nhé.', true); return false; }
  const ci = capInfo(), over = !!ci && cost > ci.remaining;
  if (!big(cost) && !over) return true;
  const ex = over ? el('p', 'gdu-note bad', 'Hôm nay giáo viên cho phép dùng tối đa ' + FX(ci.cap) + ' điểm cho vườn, bạn còn ' + FX(ci.remaining) + ' điểm. Lần này có thể bị từ chối.') : null;
  return ask(title, (msg ? msg + ' ' : '') + 'Bạn sẽ dùng ' + FX(cost) + ' điểm, còn lại ' + FX(b - cost) + ' điểm.', okText || 'Đồng ý', ex);
}
function run(ops, opt) {                                          // gửi thao tác; lỗi → báo ngay trong bảng
  return G.act(ops, Object.assign({ immediate: true, silent: true }, opt)).catch(e => { say(friendly(e && e.code, e && e.message), true); throw e; });
}

/* ===== Đọc danh mục (đoán phòng thủ khi SPEC không nêu cấu trúc) ===== */
const listOf = x => !x ? [] : Array.isArray(x) ? x.map((v, i) => ({ id: Array.isArray(v) ? v[0] : (v && typeof v === 'object' ? (v.id != null ? v.id : v.k != null ? v.k : i) : v), raw: v, i })) : Object.keys(x).map((k, i) => ({ id: k, raw: x[k], i }));
const cat = () => G.getCatalog() || {};
const crops = () => listOf(cat().crops).map(e => G.cropInfo(e.id) || G.cropInfo(e.i)).filter(Boolean);
const blds = () => listOf(cat().buildings).map(e => { const i = G.buildingInfo(e.id); if (!i) return null; const r = e.raw; return Object.assign({}, i, { ux: Array.isArray(r) ? (+r[4] || 0) : (+pk(r, ['ux', 'up', 'upc', 'upgrade'], 0) || 0), desc: Array.isArray(r) ? '' : String(pk(r, ['desc', 'd', 'mota'], '')) }); }).filter(Boolean);
function perms() {
  return listOf(cat().perms).map(e => { const r = e.raw;
    if (Array.isArray(r)) return { id: r[0], name: String(r[1] != null ? r[1] : r[0]), emoji: r[2] || '⬆️', base: +r[3], rate: +r[4], desc: String(r[5] || '') };
    return { id: e.id, name: String(pk(r, ['name', 'n', 'ten'], e.id)), emoji: pk(r, ['emoji', 'e'], '⬆️'), base: +pk(r, ['base', 'b', 'price'], NaN), rate: +pk(r, ['rate', 'r', 'mul'], NaN), desc: String(pk(r, ['desc', 'd', 'mota', 'eff'], '')), lmax: +pk(r, ['lmax', 'max'], 0) || 0 }; });
}
function achs() {
  return listOf(cat().ach).map(e => { const r = e.raw;
    if (Array.isArray(r)) return { id: r[0], name: String(r[1] != null ? r[1] : r[0]), emoji: r[2] || '🏆', stat: r[3], base: +r[4] || 1, mul: +r[5] || 2, desc: String(r[6] || '') };
    return { id: e.id, name: String(pk(r, ['name', 'n', 'ten'], e.id)), emoji: pk(r, ['emoji', 'e'], '🏆'), stat: pk(r, ['stat', 's', 'key'], null), base: +pk(r, ['base', 'b'], 1) || 1, mul: +pk(r, ['mul', 'm', 'rate'], 2) || 2, desc: String(pk(r, ['desc', 'd', 'mota'], '')) }; });
}
let dbK = null, dbV = [];
function decoBase() { const raw = cat().decos; if (raw === dbK) return dbV; dbK = raw; dbV = (raw || []).map(d => Array.isArray(d) ? { id: d[0], name: String(d[1]), emoji: d[2], theme: d[3], price: +d[4] || 0, aes: +d[5] || 0 } : { id: d.id, name: String(d.name), emoji: d.emoji, theme: d.theme, price: +d.price || 0, aes: +d.aes || 0 }); return dbV; }
function themeLabel(v) {
  for (const e of listOf(cat().themes)) { const r = e.raw, id = typeof r === 'string' ? r : Array.isArray(r) ? r[0] : pk(r, ['id'], e.id), nm = typeof r === 'string' ? r : Array.isArray(r) ? r[1] : pk(r, ['name', 'n'], e.id), em = Array.isArray(r) ? (r[2] || '') : typeof r === 'object' ? pk(r, ['emoji', 'e'], '') : '';
    if (String(id) === String(v) || (typeof v === 'number' && e.i === v)) return (em ? em + ' ' : '') + (nm || v); }
  return String(v);
}
function tierMat(t) { if (!t) return ''; const e = listOf(cat().tiers)[t]; if (!e) return ''; const r = e.raw; return String(typeof r === 'string' ? r : Array.isArray(r) ? (r[1] != null ? r[1] : r[0]) : pk(r, ['name', 'n', 'mat', 'material'], '')); }
const tierCap = st => { const d = G.getDerived() || {}; if (d.maxTier != null && isFinite(+d.maxTier)) return Math.min(60, Math.max(0, Math.floor(+d.maxTier))); return Math.min(60, Math.max(0, (st.sn | 0) + Math.floor(lvl() / 20) + G.rep().lv)); };   // máy chủ: Mùa + cấp/20 + Danh vọng
const decoId = (b, t) => t ? b.id + '~' + t : b.id;
const decoPrice = (b, t) => Math.ceil(b.price * Math.pow(2.6, t) * cm());
const decoAes = (b, t) => b.aes * Math.pow(2.2, t);
const PETS = ['chuongga', 'chuongbo', 'tongong', 'aoca'];

/* ===== Khung bảng: skeleton, ghi chú, cập nhật ===== */
function skeleton() { const s = el('div', 'gdu-sk', null, { 'aria-busy': 'true', role: 'status' }); s.append(el('p', 'gd-sr', 'Đang tải…')); for (let i = 0; i < 4; i++) s.append(el('div', 'gdu-skr')); return s; }
function guarded(build) {
  return (body, g, data) => {
    body.classList.add('gdu'); let inst = null, dead = false; const sk = skeleton(); body.append(sk);
    const late = setTimeout(() => { if (!inst && !dead) { sk.replaceChildren(el('p', 'gd-muted', 'Chưa tải được dữ liệu vườn.'), btn('ok', '🔄 Làm mới', 'Làm mới dữ liệu vườn', () => G.refresh())); } }, 9000);
    const go = () => { if (inst || !G.getState() || !G.getCatalog()) return; sk.remove(); clearTimeout(late); inst = build(body, G, data) || {}; };
    go();
    return { update(gg) { if (!inst) go(); else if (inst.update) inst.update(gg); }, destroy() { dead = true; clearTimeout(late); if (note && note.isConnected && body.contains(note)) note = null; if (inst && inst.destroy) inst.destroy(); } };
  };
}
const mkNote = () => { const n = el('p', 'gdu-note', null, { role: 'status', 'aria-live': 'polite' }); n.hidden = true; note = n; return n; };
const empty = (t, a) => { const d = el('div', 'gdu-empty'); d.append(el('p', '', t)); if (a) d.append(a); return d; };
function selectBox(label, opts, cur, fn) {
  const w = el('label', 'gdu-sel'), s = el('select', 'gdu-in'); w.append(el('span', '', label), s);
  opts.forEach(([v, t]) => { const o = el('option', '', t); o.value = v; s.append(o); }); s.value = cur; s.addEventListener('change', () => fn(s.value)); return w;
}
function card(o) {
  const c = el('div', 'gdu-item' + (o.lock ? ' locked' : '') + (o.on ? ' on' : ''), null, { role: 'listitem' });
  const pv = el('span', 'gdu-prev'); if (o.tier) pv.style.setProperty('--t', o.tier); if (o.swatch) pv.style.background = 'linear-gradient(135deg,' + o.swatch[0] + ' 0 50%,' + o.swatch[1] + ' 50% 100%)'; pv.append(sprite(o.emoji, 30)); c.append(pv);
  const inf = el('div', 'gdu-info'); inf.append(el('b', 'gdu-nm', o.name)); if (o.desc) inf.append(el('span', 'gdu-sub', o.desc));
  const row = el('div', 'gdu-meta'); if (o.cost) row.append(money(o.cost.kind, o.cost.n)); if (o.lock) row.append(el('span', 'gdu-lock', '🔒 ' + o.lock)); if (o.badge) row.append(el('span', 'gdu-tag', o.badge)); inf.append(row); c.append(inf);
  const ac = el('div', 'gdu-act'); (o.actions || []).forEach(a => { const b = btn(a.cls || '', a.label, a.aria || a.label, a.fn); if (a.off) b.disabled = true; ac.append(b); }); c.append(ac);
  return c;
}

/* ===== CỬA HÀNG ===== */
const SHOP_TABS = [['seed', '🌱 Hạt giống'], ['land', '🟫 Đất & mở rộng'], ['bld', '🏠 Công trình'], ['wonder', '🏛️ Kỳ quan'], ['ground', '🌄 Nền đất'], ['deco', '🎀 Trang trí'], ['pet', '🐔 Vật nuôi']];
const PAGE = 24;
async function startPlace(id, cost, name) {
  if (cost > 0 && cost > bal()) { say('Bạn chưa đủ điểm: cần khoảng ' + FX(cost) + ', đang có ' + FX(bal()) + '. Làm thêm bài từ vựng để kiếm điểm nhé.', true); return; }
  G.setTool('place', id); G.closePanel(); toastG('Chạm vào bản đồ để chọn chỗ, rồi bấm ✔ Đặt.' + (cost > 0 ? ' Điểm chỉ bị trừ khi bạn bấm ✔ Đặt.' : ''));
}
function expandCandidates(st) {
  const own = new Set(st.ch || []), c = {}, out = [];
  for (const k of st.ch || []) { const p = k.split(',').map(Number); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const q = (p[0] + dx) + ',' + (p[1] + dy); if (!own.has(q) && !c[q]) { c[q] = 1; out.push([p[0] + dx, p[1] + dy]); } } }
  return out.sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1])).slice(0, 12);
}
const plotCost = st => G.plotCost((st.ch || []).length);
async function expand(cx, cy, cost) {
  if (!(await spend(cost, 'Mở rộng vườn', 'Mở mảnh đất (' + cx + ', ' + cy + ').', 'Mở rộng'))) return;
  try { await run({ op: 'buyPlot', cx, cy }); say('Đã mở thêm một mảnh đất. Điểm được trừ theo máy chủ.'); sfx('coin'); } catch (_) {}
}
const wonderState = (st, w) => { const pl = st.b[w.id], stored = +(st.wi && st.wi[w.id]) || 0; return { placed: pl || null, stored, l: pl ? (+pl.l || 1) : stored }; };
function wdRows(st) {                                              // Kỳ quan đã đặt, dùng cho bảng Nâng cấp (mỗi lần 1 giai đoạn)
  const out = []; for (const w of G.wonders()) { const ws = wonderState(st, w); if (!ws.placed) continue; const l = ws.l, e = wdE(w.id);
    out.push({ what: 'wonder', id: w.id, emoji: w.emoji, name: w.name, L: l, lmax: 5, unit: 'Giai đoạn', maxed: l >= 5 || !!(e && e.maxed), kind: 'pt', know: true, have: bal,
      desc: w.w + '×' + w.h + ' ô' + (w.desc ? ' · ' + w.desc : '') + ' · Mỗi lần nâng 1 giai đoạn (tối đa 5).', cost: n => G.wonderCost(w.id, l + 1 + n) }); }
  return out;
}
function upWonderFrom(w, st) { const r = wdRows(st).filter(x => x.id === w.id)[0]; if (r) buyUp(r, 1); }
function shopItems(tab, st, S) {
  const out = [], xu = st.xu, b = bal(), L = lvl();
  if (tab === 'seed') {
    const mul = +((G.getDerived() || {}).seedMul) || 1;
    for (const c of crops()) { const p = Math.round(c.seed * mul), lock = c.lvl > L ? 'Cần vườn cấp ' + c.lvl : '';
      out.push({ key: 'c' + c.id, emoji: c.emoji, name: c.name, desc: 'Lớn trong ' + G.fmtTime(c.g * 1000) + (c.y ? ' · sản lượng gốc ' + F(c.y) : ''), cost: { kind: 'xu', n: p }, lock, afford: xu >= p, price: p, on: String(G.getTool().arg) === String(c.id) && G.getTool().tool === 'plant',
        actions: [{ label: '🌱 Chọn trồng', cls: 'ok', off: !!lock, aria: 'Chọn trồng ' + c.name, fn: () => { G.setTool('plant', c.id); G.closePanel(); toastG('Chạm ô đất trống để trồng ' + c.name + '.'); } }] }); }
  } else if (tab === 'land') {
    const n = (st.ch || []).length, cost = plotCost(st);
    out.push({ key: 'till', emoji: '⛏️', name: 'Cuốc đất', desc: 'Biến ô cỏ thành đất canh tác. Giá tăng nhẹ theo số ô đất (trả bằng Xu).', cost: null, lock: '', afford: true, price: 0, actions: [{ label: '⛏️ Dùng cuốc', cls: 'ok', fn: () => { G.setTool('till'); G.closePanel(); toastG('Chạm hoặc kéo trên ô cỏ để cuốc.'); } }] });
    if (n >= 400) out.push({ key: 'full', emoji: '🗺️', name: 'Đã mở tối đa 400 mảnh', desc: '', lock: '', afford: true, price: 0, actions: [] });
    else for (const [cx, cy] of expandCandidates(st)) out.push({ key: 'p' + cx + ',' + cy, emoji: '🟩', name: 'Mảnh đất (' + cx + ', ' + cy + ')', desc: 'Mở thêm 8×8 ô, liền kề vườn hiện có.', cost: { kind: 'pt', n: cost }, lock: '', afford: b >= cost, price: cost,
      actions: [{ label: '🧭 Xem', aria: 'Xem mảnh đất trên bản đồ', fn: () => { G.closePanel(); G.scene.goTo(cx * 8 + 4, cy * 8 + 4); } }, { label: 'Mở rộng', cls: 'ok', aria: 'Mở rộng mảnh (' + cx + ',' + cy + ')', fn: () => expand(cx, cy, cost) }] });
  } else if (tab === 'wonder') {
    const rp = G.rep();
    for (const w of G.wonders()) { const ws = wonderState(st, w), e = wdE(w.id), l = ws.l, maxed = l >= 5 || !!(e && e.maxed), needRep = e && e.needRep != null ? +e.needRep : w.rep;
      const locked = !ws.placed && !ws.stored && (e && e.locked != null ? !!e.locked : needRep > rp.lv), nextCost = maxed ? 0 : G.wonderCost(w.id, ws.placed ? l + 1 : 1);
      const aesNow = l > 0 ? (e && e.aes != null ? +e.aes : w.aes[l - 1]) : 0, aesNext = !maxed ? w.aes[l] : null;
      const desc = w.w + '×' + w.h + ' ô' + (w.desc ? ' · ' + w.desc : '') + (isFinite(aesNow) || isFinite(aesNext) ? ' · Thẩm mỹ ' + F(aesNow || 0) + (aesNext != null && isFinite(aesNext) ? ' → ' + F(aesNext) : '') : '');
      let badge = ''; if (ws.placed) badge = (maxed ? 'Đã đạt tối đa' : 'Đã đặt') + ' · giai đoạn ' + l + '/5'; else if (ws.stored) badge = 'Trong kho · giai đoạn ' + l + '/5';
      const acts = [];
      if (!ws.placed) acts.push({ label: ws.stored ? '📍 Đặt lại (miễn phí)' : '📍 Đặt', cls: 'ok', off: locked, aria: (ws.stored ? 'Đặt lại miễn phí ' : 'Đặt ') + w.name, fn: () => startPlace(w.id, ws.stored ? 0 : nextCost, w.name) });
      else acts.push({ label: '🧭 Xem', aria: 'Xem ' + w.name + ' trên bản đồ', fn: () => { G.closePanel(); G.scene.goTo(ws.placed.x + w.w / 2, ws.placed.y + w.h / 2); } }, { label: '✥ Dời', aria: 'Dời ' + w.name + ', miễn phí', fn: () => G.carryBuilding(w.id) },
        { label: '📦 Cất', aria: 'Cất ' + w.name + ' vào kho, đặt lại miễn phí', fn: () => run({ op: 'wonder', act: 'store', id: w.id }).then(() => say(w.name + ' đã vào kho. Đặt lại miễn phí bất cứ lúc nào.')).catch(() => {}) },
        { label: maxed ? '✔ Đã đạt tối đa' : '⬆️ Nâng giai đoạn', cls: maxed ? '' : 'ok', off: maxed, aria: maxed ? w.name + ' đã đạt tối đa' : 'Nâng ' + w.name + ' lên giai đoạn ' + (l + 1), fn: () => upWonderFrom(w, st) });
      out.push({ key: 'w' + w.id, emoji: w.emoji, name: w.name, desc, cost: (!ws.stored && !maxed) ? { kind: 'pt', n: nextCost } : null, lock: locked ? 'Cần Danh vọng ' + needRep : '', afford: !locked && (ws.stored || maxed || b >= nextCost), price: nextCost, badge, actions: acts,
        tier: l || 0 });
    }
    if (!out.length) out.push({ key: 'wnone', emoji: '🏛️', name: 'Chưa có Kỳ quan', desc: 'Danh sách Kỳ quan chưa tải được hoặc máy chủ chưa hỗ trợ. Bấm Làm mới trong Cài đặt.', cost: null, lock: '', afford: true, price: 0, actions: [] });
  } else if (tab === 'ground') {
    const cur = st.gr || '', owned = new Set(st.go || []), gl = G.grounds();
    const apply = (id, nm, cost) => async () => { if (cost > 0 && !(await spend(cost, 'Mua nền đất ' + nm, 'Bạn đang mua nền đất “' + nm + '”.', 'Mua & dùng'))) return; try { await run({ op: 'ground', id }); say(id === 'default' ? 'Đã dùng lại nền đất mặc định.' : 'Đã dùng nền đất ' + nm + '.'); sfx('click'); } catch (_) {} };
    out.push({ key: 'g-default', emoji: '🟩', name: 'Nền mặc định', desc: 'Cỏ xanh quen thuộc. Đổi lại lúc nào cũng miễn phí.', cost: null, lock: '', afford: true, price: 0, on: cur === '', badge: cur === '' ? 'Đang dùng' : '', actions: [{ label: cur === '' ? '✔ Đang dùng' : 'Dùng lại', cls: cur === '' ? '' : 'ok', off: cur === '', fn: apply('default', 'mặc định', 0) }] });
    for (const gd of gl) { const have = owned.has(gd.id) || cur === gd.id, cost = have ? 0 : G.groundCost(gd.id), on = cur === gd.id;
      out.push({ key: 'g' + gd.id, emoji: gd.emoji, swatch: [gd.c1, gd.c2], name: gd.name, desc: have ? 'Bạn đã sở hữu. Đổi qua lại miễn phí.' : 'Nền đất mới, mua một lần dùng mãi.', cost: have ? null : { kind: 'pt', n: cost }, lock: '', afford: have || b >= cost, price: cost, on, badge: on ? 'Đang dùng' : have ? 'Đã sở hữu' : '',
        actions: [{ label: on ? '✔ Đang dùng' : have ? 'Áp dụng' : 'Mua & dùng', cls: on ? '' : 'ok', off: on, aria: (on ? 'Đang dùng ' : have ? 'Áp dụng ' : 'Mua và dùng ') + 'nền đất ' + gd.name, fn: apply(gd.id, gd.name, cost) }] }); }
    if (!gl.length) out.push({ key: 'gnone', emoji: '🌄', name: 'Chưa có nền đất để mua', desc: 'Danh sách nền đất chưa tải được hoặc máy chủ chưa hỗ trợ.', cost: null, lock: '', afford: true, price: 0, actions: [] });
  } else {
    const pet = tab === 'pet';
    for (const bi of blds()) { if (PETS.includes(bi.id) !== pet) continue; const owned = !!st.b[bi.id], cost = Math.ceil(bi.price * cm()), lock = !owned && bi.lvl > L ? 'Cần vườn cấp ' + bi.lvl : '';
      out.push({ key: 'b' + bi.id, emoji: bi.emoji, name: bi.name, desc: (bi.desc ? bi.desc + ' · ' : '') + 'Mỗi loại chỉ có 1 cái. Cho Xu theo thời gian, thu bằng nút “Thu sản vật”.', cost: owned ? null : { kind: 'pt', n: cost }, lock, afford: owned || b >= cost, price: cost, badge: owned ? 'Đã có · cấp ' + (st.b[bi.id].l || 1) : '',
        actions: owned ? [{ label: '⬆️ Nâng cấp', fn: () => G.openPanel('upgrades', { id: bi.id }) }] : [{ label: '📍 Đặt', cls: 'ok', off: !!lock, aria: 'Đặt ' + bi.name, fn: () => startPlace(bi.id, cost, bi.name) }] }); }
  }
  return out;
}
function decoQuery(st, S) {                                     // danh sách (mục, bậc) đã lọc + sắp, KHÔNG dựng DOM
  const cap = tierCap(st), q = fold(S.q), b = bal(), rows = [];
  for (const d of decoBase()) { if (S.theme !== 'all' && String(d.theme) !== S.theme) continue; if (q && fold(d.name).indexOf(q) < 0) continue;
    for (let t = 0; t <= cap; t++) { const id = decoId(d, t), inv = st.iv[id] || 0, p = decoPrice(d, t);
      if (S.stat === 'buy' && !(inv > 0 || p <= b)) continue; if (S.stat === 'locked') continue; rows.push({ d, t, id, inv, p, a: decoAes(d, t) }); } }
  if (S.sort === 'p1') rows.sort((x, y) => x.p - y.p); else if (S.sort === 'p2') rows.sort((x, y) => y.p - x.p); else if (S.sort === 'a2') rows.sort((x, y) => y.a - x.a);
  else rows.sort((x, y) => y.t - x.t);
  return { rows, cap };
}
const shop = guarded((body, g, data) => {
  const S = { tab: (data && data.tab) || 'seed', q: '', theme: 'all', stat: 'all', sort: 'def', n: PAGE };
  const nt = mkNote(), head = el('div', 'gdu-head'), tabs = el('div', 'gdu-tabs', null, { role: 'tablist', 'aria-label': 'Nhóm cửa hàng' }), tools = el('div', 'gdu-tools'), list = el('div', 'gdu-list', null, { role: 'list' }), foot = el('div', 'gdu-foot');
  const q = el('input', 'gdu-in gdu-q', null, { type: 'search', placeholder: 'Tìm theo tên…', 'aria-label': 'Tìm trong cửa hàng', autocomplete: 'off' });
  const more = btn('', 'Hiện thêm', 'Hiện thêm vật phẩm', () => { S.n += PAGE; draw(); }), cnt = el('span', 'gd-muted', '');
  let bar = null; foot.append(cnt, more);
  const tb = {}; SHOP_TABS.forEach(([k, t]) => { const b = el('button', 'gdu-tab', t, { type: 'button', role: 'tab', id: 'gdu-t-' + k }); b.addEventListener('click', () => { S.tab = k; S.n = PAGE; S.theme = 'all'; S.sort = 'def'; S.stat = 'all'; q.value = ''; S.q = ''; buildTools(); draw(); b.focus(); }); b.addEventListener('keydown', e => { const i = SHOP_TABS.findIndex(x => x[0] === S.tab), n = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : null; if (n != null) { e.preventDefault(); const t2 = SHOP_TABS[(n + SHOP_TABS.length) % SHOP_TABS.length][0]; tb[t2].click(); } }); tb[k] = b; tabs.append(b); });
  q.addEventListener('input', () => { S.q = q.value; S.n = PAGE; draw(); });
  function buildTools() {
    tools.replaceChildren(q); const t = S.tab;
    if (t === 'deco') { const th = [['all', 'Tất cả chủ đề']]; const seen = new Set(); decoBase().forEach(d => { const k = String(d.theme); if (!seen.has(k)) { seen.add(k); th.push([k, themeLabel(d.theme)]); } }); tools.append(selectBox('Chủ đề', th, S.theme, v => { S.theme = v; S.n = PAGE; draw(); })); }
    tools.append(selectBox('Trạng thái', t === 'deco' ? [['all', 'Tất cả'], ['buy', 'Mua được']] : t === 'ground' ? [['all', 'Tất cả'], ['buy', 'Mua được']] : [['all', 'Tất cả'], ['open', 'Đã mở khóa'], ['locked', 'Đang khóa'], ['buy', 'Mua được']], S.stat, v => { S.stat = v; S.n = PAGE; draw(); }));
    tools.append(selectBox('Sắp xếp', t === 'deco' ? [['def', 'Theo bậc (cao → thấp)'], ['p1', 'Giá tăng dần'], ['p2', 'Giá giảm dần'], ['a2', 'Điểm đẹp cao']] : [['def', 'Mặc định'], ['p1', 'Giá tăng dần'], ['p2', 'Giá giảm dần']], S.sort, v => { S.sort = v; S.n = PAGE; draw(); }));
  }
  function draw() {
    const st = g.getState(); if (!st) return; const keepTop = body.parentElement ? body.parentElement.scrollTop : 0;
    for (const k in tb) { tb[k].setAttribute('aria-selected', k === S.tab); tb[k].tabIndex = k === S.tab ? 0 : -1; tb[k].classList.toggle('on', k === S.tab); }
    head.replaceChildren(...[repBox(), capLine()].filter(Boolean)); list.setAttribute('aria-labelledby', 'gdu-t-' + S.tab); list.replaceChildren(); let total = 0, shown = 0;
    if (S.tab === 'deco') {
      const { rows, cap } = decoQuery(st, S); total = rows.length; let lastT = -1;
      rows.slice(0, S.n).forEach(r => { if (S.sort === 'def' && r.t !== lastT) { lastT = r.t; list.append(el('h3', 'gdu-gh', 'Bậc ' + r.t + (tierMat(r.t) ? ' · ' + tierMat(r.t) : ''))); }
        const pl = () => startPlace(r.id, r.inv > 0 ? 0 : r.p, r.d.name);
        list.append(card({ emoji: r.d.emoji, tier: r.t, name: r.d.name + (r.t ? ' · bậc ' + r.t : ''), desc: themeLabel(r.d.theme) + ' · đẹp +' + F(r.a), cost: r.inv > 0 ? null : { kind: 'pt', n: r.p }, badge: r.inv > 0 ? 'Trong kho: ' + r.inv + ' (miễn phí)' : '', actions: [{ label: r.inv > 0 ? '📍 Đặt từ kho' : '📍 Mua & đặt', cls: 'ok', aria: (r.inv > 0 ? 'Đặt từ kho ' : 'Mua và đặt ') + r.d.name, fn: pl }] })); shown++; });
      if (cap < 60) { const rp = G.rep();
        if (rp.has) list.append(card({ emoji: '🔒', name: 'Bậc ' + (cap + 1) + (tierMat(cap + 1) ? ' · ' + tierMat(cap + 1) : ''), desc: 'Mở khi Danh vọng lên hạng ' + (rp.lv + 1) + ', hoặc vườn lên cấp ' + (Math.floor(lvl() / 20) + 1) * 20 + ', hoặc khi Sang mùa mới.', lock: 'Cần Danh vọng ' + (rp.lv + 1), actions: [] }));
        else list.append(el('p', 'gd-muted', 'Bậc ' + (cap + 1) + ' sẽ mở khi vườn lên cấp ' + Math.max(1, (cap + 1 - (st.sn | 0)) * 20) + ' hoặc khi bạn Sang mùa mới.')); }
    } else {
      let items = shopItems(S.tab, st, S); const qq = fold(S.q);
      if (qq) items = items.filter(i => fold(i.name).indexOf(qq) >= 0);
      if (S.stat === 'open') items = items.filter(i => !i.lock); else if (S.stat === 'locked') items = items.filter(i => i.lock); else if (S.stat === 'buy') items = items.filter(i => !i.lock && i.afford);
      if (S.sort === 'p1') items.sort((a, b) => a.price - b.price); else if (S.sort === 'p2') items.sort((a, b) => b.price - a.price);
      total = items.length; items.slice(0, S.n).forEach(i => { list.append(card(i)); shown++; });
    }
    if (!total) list.append(empty(S.q || S.stat !== 'all' || S.theme !== 'all' ? 'Không có mục nào khớp bộ lọc.' : 'Chưa có mục nào trong nhóm này.', (S.q || S.stat !== 'all' || S.theme !== 'all') ? btn('', 'Xóa bộ lọc', 'Xóa bộ lọc', () => { S.q = ''; S.stat = 'all'; S.theme = 'all'; q.value = ''; buildTools(); draw(); }) : null));
    cnt.textContent = total ? 'Hiển thị ' + shown + ' / ' + total : ''; more.hidden = shown >= total;
    if (body.parentElement) body.parentElement.scrollTop = keepTop;
  }
  body.append(nt, head, tabs, tools, list, foot); buildTools(); draw();
  if (root.IntersectionObserver) { const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting) && !more.hidden) { S.n += PAGE; draw(); } }, { root: body.parentElement || null, rootMargin: '120px' }); io.observe(more); bar = io; }
  let raf = 0;
  return { update() { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); }, destroy() { cancelAnimationFrame(raf); bar && bar.disconnect(); } };
});

/* ===== NÂNG CẤP (vô hạn cấp) ===== */
const MAXBUY = 25;
function upRows(st) {
  const rows = [], d = cm(), dpm = (G.getDerived() || {}).perms || {};
  for (const bi of blds()) { const o = st.b[bi.id]; if (!o) continue; const L = +o.l || 1, cost = n => Math.round(bi.ux * Math.pow(1.32, L - 1 + n));
    rows.push({ what: 'bld', id: bi.id, emoji: bi.emoji, name: bi.name, L, unit: 'Cấp', desc: (bi.desc ? bi.desc + ' · ' : '') + 'Tăng sản vật/giờ ×(1 + 0,7 × (cấp − 1)) (máy chủ tính chính xác).', kind: 'xu', know: bi.ux > 0, cost, have: () => st.xu }); }
  rows.push(...wdRows(st));
  for (const p of perms()) {
    const dp = dpm && typeof dpm === 'object' ? dpm[p.id] || null : null, L = dp && dp.l != null ? +dp.l || 0 : +st.up[p.id] || 0, lmax = dp && +dp.lmax > 0 ? +dp.lmax : (+p.lmax > 0 ? +p.lmax : 0);
    const maxed = dp && dp.maxed != null ? !!dp.maxed : (lmax > 0 && L >= lmax), dpc = dp && dp.cost != null && isFinite(+dp.cost) ? +dp.cost : null, rate = isFinite(p.rate) && p.rate > 0 ? p.rate : 1.2;
    const know = dpc != null || (isFinite(p.base) && isFinite(p.rate) && p.base > 0), cost = n => dpc != null ? Math.round(dpc * Math.pow(rate, n)) : Math.ceil(Math.round(p.base * Math.pow(p.rate, L + n)) * d);
    rows.push({ what: 'perm', id: p.id, emoji: p.emoji, name: p.name, L, lmax, unit: 'Cấp', maxed, room: lmax > 0 ? Math.max(0, lmax - L) : Infinity, desc: p.desc || 'Nâng cấp vĩnh viễn, giữ nguyên khi Sang mùa mới.', kind: 'pt', know, cost, have: bal });
  }
  return rows;
}
function maxAffordable(r) { if (r.maxed || !r.know) return 0; let have = r.have(), n = 0, sum = 0; const lim = Math.min(MAXBUY, r.room != null ? r.room : MAXBUY); while (n < lim) { const c = r.cost(n); if (sum + c > have) break; sum += c; n++; } return n; }
const sumCost = (r, n) => { let s = 0; for (let i = 0; i < n; i++) s += r.cost(i); return s; };
async function buyUp(r, n) {
  if (r.maxed) { say(friendly('garden_maxed'), true); return; }
  if (r.room != null && n > r.room) n = r.room; if (n < 1) return;
  const ops = []; for (let i = 0; i < n; i++) ops.push({ op: 'upgrade', what: r.what, id: r.id });
  if (r.kind === 'pt') {
    if (r.know) { const c = sumCost(r, n); if (!(await spend(c, 'Nâng cấp ' + r.name, 'Nâng ' + r.name + ' thêm ' + n + (r.unit === 'Giai đoạn' ? ' giai đoạn.' : ' cấp.'), 'Nâng cấp'))) return; }
    else if (!(await ask('Nâng cấp ' + r.name, 'Nâng ' + n + ' cấp (giá do máy chủ tính, có thể trừ điểm). Bạn đang có ' + FX(bal()) + ' điểm.', 'Nâng cấp'))) return; }
  else if (r.know && sumCost(r, n) > r.have()) { say('Chưa đủ Xu 🪙: cần khoảng ' + F(sumCost(r, n)) + '. Thu hoạch thêm rồi quay lại.', true); return; }
  try { await run(ops); const st = G.getState(), L = r.what === 'bld' || r.what === 'wonder' ? (st.b[r.id] && st.b[r.id].l) : st.up[r.id]; say('Đã nâng ' + r.name + ' lên ' + (r.unit === 'Giai đoạn' ? 'giai đoạn ' : 'cấp ') + L + '.'); sfx('win'); } catch (_) {}
}
const upgrades = guarded((body, g, data) => {
  const nt = mkNote(), list = el('div', 'gdu-list', null, { role: 'list' }), want = data && data.id; body.append(nt, list); let pend = false;
  function draw() {
    const st = g.getState(); if (!st) return; const top = body.parentElement ? body.parentElement.scrollTop : 0; list.replaceChildren(); const rows = upRows(st);
    if (!rows.length) list.append(empty('Chưa có nâng cấp nào. Hãy xây một công trình trong Cửa hàng trước.', btn('ok', '🛒 Mở cửa hàng', 'Mở cửa hàng', () => g.openPanel('shop', { tab: 'bld' }))));
    const HD = { bld: 'Công trình (trả bằng Xu 🪙)', wonder: 'Kỳ quan (trả bằng điểm 💰, tối đa 5 giai đoạn)', perm: 'Nâng cấp vĩnh viễn (trả bằng điểm 💰)' }, cp = capLine(); if (cp && rows.some(r => r.kind === 'pt')) list.append(cp);
    ['bld', 'wonder', 'perm'].forEach(w => { const rs = rows.filter(r => r.what === w); if (!rs.length) return; list.append(el('h3', 'gdu-gh', HD[w]));
      rs.forEach(r => { const maxed = !!r.maxed, next = r.know && !maxed ? r.cost(0) : 0, mx = maxAffordable(r), lv = r.unit === 'Giai đoạn' ? 'Giai đoạn ' : 'Cấp ';
        const acts = maxed ? [{ label: '✔ Đã đạt tối đa', aria: r.name + ' đã đạt mức tối đa', off: true }]
          : r.what === 'wonder' ? [{ label: '⬆️ Nâng 1 giai đoạn', cls: 'ok', aria: 'Nâng ' + r.name + ' một giai đoạn', fn: () => buyUp(r, 1) }]
          : [{ label: 'Mua 1', cls: 'ok', aria: 'Nâng cấp ' + r.name + ' một cấp', fn: () => buyUp(r, 1) }, { label: 'Tối đa' + (mx > 1 ? ' (' + mx + ')' : ''), aria: 'Nâng cấp ' + r.name + ' tối đa có thể', off: mx < 1, fn: () => buyUp(r, mx) }];
        const c = card({ emoji: r.emoji, name: r.name, on: want === r.id, desc: r.desc, badge: maxed ? 'Đã đạt tối đa · ' + lv.toLowerCase() + r.L + (r.lmax ? '/' + r.lmax : '') : lv + r.L + (r.lmax ? '/' + r.lmax : '') + ' → ' + (r.L + 1), cost: r.know && !maxed ? { kind: r.kind, n: next } : null, actions: acts });
        if (!r.know && !maxed) c.querySelector('.gdu-meta').append(el('span', 'gdu-sub', 'Giá do máy chủ tính')); list.append(c); if (want === r.id && !pend) { pend = true; setTimeout(() => c.scrollIntoView({ block: 'center' }), 60); } }); });
    if (body.parentElement && !pend) body.parentElement.scrollTop = top;
  }
  draw(); let raf = 0; return { update() { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); }, destroy() { cancelAnimationFrame(raf); } };
});

/* ===== NHIỆM VỤ, THÀNH TỰU, QUÀ HẰNG NGÀY ===== */
let dailyDone = '';
const dailyReady = st => !(st.dl && sameDay(st.dl.d)) && dailyDone !== vnDay().iso;
function questList(st) {
  const d = G.getDerived() || {}, q = st.q || {}, P = q.p, C = q.c, res = [];
  const dq = d.quests || d.dailyQuests || null;
  for (let i = 0; i < 3; i++) {
    let r = Array.isArray(dq) ? dq[i] : null, L = Array.isArray(q.l) ? q.l[i] : q.l && q.l['q' + i];
    const need = +pk(r, ['need', 'goal', 'target', 'n'], pk(L, ['need', 'goal', 'target', 'n'], Array.isArray(L) ? L[1] : NaN)), prog = +pk(r, ['prog', 'progress', 'p'], Array.isArray(P) ? P[i] : P && P['q' + i] != null ? P['q' + i] : 0) || 0;
    const done = !!(Array.isArray(C) ? C[i] : C && (C['q' + i] || C[i]));
    res.push({ id: 'q' + i, name: String(pk(r, ['name', 'desc', 'text', 'ten'], pk(L, ['name', 'desc', 'text', 'ten'], 'Nhiệm vụ ngày ' + (i + 1)))), need: isFinite(need) && need > 0 ? need : 0, prog, done,
      reward: pk(r, ['reward', 'xu'], pk(L, ['reward', 'xu'], Array.isArray(L) ? L[2] : null)) });
  }
  return res;
}
function claimables(st) { let n = dailyReady(st) ? 1 : 0; for (const q of questList(st)) if (!q.done && q.need && q.prog >= q.need) n++; return n; }
async function claim(op, okMsg) { try { await run(op); say(okMsg); sfx('coin'); } catch (e) { if (e && e.code === 'garden_already' && op.op === 'claimDaily') { dailyDone = vnDay().iso; dots(); } } }
const quests = guarded((body, g) => {
  const nt = mkNote(), box = el('div', 'gdu-stack'); body.append(nt, box);
  function draw() {
    const st = g.getState(); if (!st) return; const top = body.parentElement ? body.parentElement.scrollTop : 0; box.replaceChildren();
    /* quà ngày */
    const ds = el('section', 'gdu-sec'), streak = +(st.dl && st.dl.s) || 0, ready = dailyReady(st);
    ds.append(el('h3', 'gdu-gh', '🎁 Quà hằng ngày'), el('p', 'gd-muted', 'Chuỗi ngày liên tiếp: ' + streak + '. Mỗi chuỗi 7 ngày có thêm Tinh hoa 🌸. Quà là Xu, không phải điểm.'));
    const dp = el('div', 'gdu-bar', null, { role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 7, 'aria-valuenow': streak % 7, 'aria-label': 'Chuỗi ' + (streak % 7) + ' trên 7 ngày' }); const di = el('i'); di.style.width = (streak % 7) / 7 * 100 + '%'; dp.append(di);
    ds.append(dp, btn(ready ? 'ok' : '', ready ? '🎁 Nhận quà hôm nay' : '✔ Hôm nay đã nhận', 'Nhận quà hằng ngày', () => claim({ op: 'claimDaily' }, 'Đã nhận quà hôm nay.'))); ds.lastChild.disabled = !ready; box.append(ds);
    /* nhiệm vụ ngày */
    const qs = el('section', 'gdu-sec'); qs.append(el('h3', 'gdu-gh', '📜 Nhiệm vụ hôm nay'), el('p', 'gd-muted', 'Làm mới mỗi ngày. Máy chủ kiểm tra tiến độ khi bạn bấm Nhận.'));
    questList(st).forEach(q => { const c = el('div', 'gdu-item' + (q.done ? ' locked' : ''), null, { role: 'listitem' }), inf = el('div', 'gdu-info'); inf.append(el('b', 'gdu-nm', q.name));
      if (q.need) { const b = el('div', 'gdu-bar', null, { role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': q.need, 'aria-valuenow': Math.min(q.prog, q.need), 'aria-label': 'Tiến độ ' + q.name }), i = el('i'); i.style.width = Math.min(100, q.prog / q.need * 100) + '%'; b.append(i); inf.append(b, el('span', 'gdu-sub', F(Math.min(q.prog, q.need)) + ' / ' + F(q.need))); }
      else inf.append(el('span', 'gdu-sub', q.prog ? 'Đã làm: ' + F(q.prog) : 'Chưa có số liệu tiến độ'));
      c.append(inf); const ok = q.need ? q.prog >= q.need : true, b = btn(!q.done && ok && q.need ? 'ok' : '', q.done ? 'Đã nhận' : 'Nhận thưởng', 'Nhận thưởng ' + q.name, () => claim({ op: 'claimQuest', id: q.id }, 'Đã nhận thưởng nhiệm vụ.')); b.disabled = q.done || (!!q.need && !ok); const a = el('div', 'gdu-act'); a.append(b); c.append(a); qs.append(c); });
    box.append(qs);
    /* thành tựu */
    const as = el('section', 'gdu-sec'), A = achs(); as.append(el('h3', 'gdu-gh', '🏆 Thành tựu'), el('p', 'gd-muted', 'Bậc không giới hạn. Thưởng được tự cộng khi đạt bậc; cứ 5 bậc có thêm 1 Tinh hoa.'));
    if (!A.length) as.append(empty('Chưa có danh sách thành tựu từ máy chủ.')); 
    A.forEach(a => { const k = +(st.ac && st.ac[a.id]) || 0, target = Math.round(a.base * Math.pow(a.mul, k)), cur = a.stat != null && st.s ? +st.s[a.stat] || 0 : null, reward = Math.round(100 * Math.pow(1.8, k));
      const c = el('div', 'gdu-item', null, { role: 'listitem' }), pv = el('span', 'gdu-prev'); pv.append(sprite(a.emoji, 28)); const inf = el('div', 'gdu-info'); inf.append(el('b', 'gdu-nm', a.name + ' · bậc ' + k));
      if (a.desc) inf.append(el('span', 'gdu-sub', a.desc)); if (cur != null) { const b = el('div', 'gdu-bar', null, { role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': target, 'aria-valuenow': Math.min(cur, target), 'aria-label': 'Tiến độ ' + a.name }), i = el('i'); i.style.width = Math.min(100, cur / target * 100) + '%'; b.append(i); inf.append(b); }
      inf.append(el('span', 'gdu-sub', 'Bậc kế: ' + (cur != null ? F(Math.min(cur, target)) + ' / ' : 'mục tiêu ') + F(target) + ' · thưởng ≈ ' + F(reward) + ' 🪙')); c.append(pv, inf); as.append(c); });
    box.append(as); if (body.parentElement) body.parentElement.scrollTop = top;
  }
  draw(); let raf = 0; return { update() { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); }, destroy() { cancelAnimationFrame(raf); } };
});

/* ===== SANG MÙA MỚI (prestige) ===== */
function celebrate() {
  const host = stage(); if (!host) return; if (cfg.calm || (root.matchMedia && root.matchMedia('(prefers-reduced-motion:reduce)').matches)) { toastG('🌟 Chào mùa mới!'); return; }
  const c = el('div', 'gdu-conf', null, { 'aria-hidden': 'true' }); for (let i = 0; i < 18; i++) { const s = el('span', '', ['🌸', '✨', '🌟', '🌱'][i % 4]); s.style.left = (5 + i * 5) + '%'; s.style.animationDelay = (i % 6) * .12 + 's'; c.append(s); } host.append(c); setTimeout(() => c.remove(), 3200);
}
const prestige = guarded((body, g) => {
  const nt = mkNote(), box = el('div', 'gdu-stack'); body.append(nt, box); let armed = false;
  function draw() {
    const st = g.getState(); if (!st) return; box.replaceChildren(); const lv = lvl(), xs = +st.xs || 0, gain = Math.floor(Math.sqrt(xs / 1500)), season = (st.sn | 0) + 1, next = season + 1, ok = lv >= 10 && gain >= 1;
    const hd = el('section', 'gdu-sec'); hd.append(el('h3', 'gdu-gh', '🌟 Sang mùa mới'), el('p', '', 'Bắt đầu lại khu vườn để nhận Tinh hoa 🌸. Tinh hoa tăng sản lượng vĩnh viễn: mỗi 1 🌸 cộng 3% sản lượng.'));
    const gr = el('dl', 'gdu-kv'); [['Mùa hiện tại', season], ['Cấp vườn', lv + (lv < 10 ? ' (cần ≥ 10)' : '')], ['Xu kiếm được trong mùa', F(xs)], ['Tinh hoa đang có', F(st.es)], ['Tinh hoa sẽ nhận', gain >= 1 ? '+' + F(gain) : 'chưa đủ (cần ≥ 1.500 Xu kiếm trong mùa)'], ['Hệ số sản lượng', '×' + (1 + .03 * (+st.es || 0)).toFixed(2) + ' → ×' + (1 + .03 * ((+st.es || 0) + gain)).toFixed(2)]].forEach(([k, v]) => { const r = el('div'); r.append(el('dt', '', k), el('dd', '', v)); gr.append(r); }); hd.append(gr, el('p', 'gd-muted', 'Số Tinh hoa tính theo công thức √(Xu kiếm trong mùa ÷ 1.500). Con số cuối cùng do máy chủ quyết định.')); box.append(hd);
    const kp = el('section', 'gdu-sec gdu-two'), a = el('div'), b = el('div'); a.append(el('h4', '', '✅ Được giữ'));
    ['Nâng cấp vĩnh viễn (mua bằng điểm)', 'Kinh nghiệm (XP), thống kê, thành tựu', 'Tinh hoa 🌸 đã nhận', 'Một số trang trí đẹp nhất: 8 + 4 × ' + next + ' món (cất vào kho, phải đặt lại)'].forEach(t => a.append(el('p', 'gdu-li', t)));
    b.append(el('h4', '', '⚠️ Bị mất')); ['Đất canh tác, cây đang trồng, các mảnh đất đã mở', 'Công trình (giếng, chuồng…) và Xu 🪙', 'Trang trí còn lại', 'Xu khởi đầu mùa mới: 60 + 40 × ' + next].forEach(t => b.append(el('p', 'gdu-li', t))); kp.append(a, b); box.append(kp);
    const act = el('section', 'gdu-sec');
    if (!ok) act.append(el('p', 'gdu-note bad', lv < 10 ? 'Cần vườn cấp 10 trở lên. Bạn đang ở cấp ' + lv + '.' : 'Cần kiếm thêm Xu trong mùa này để nhận ít nhất 1 Tinh hoa.'));
    else if (!armed) act.append(btn('ok', 'Tôi đã đọc, tiếp tục', 'Tiếp tục sang bước xác nhận', () => { armed = true; draw(); const c = $('.gdu-chk', body); c && c.focus(); }));
    else { const lb = el('label', 'gdu-chkl'), ck = el('input', 'gdu-chk', null, { type: 'checkbox' }); lb.append(ck, el('span', '', 'Tôi hiểu đất, công trình và Xu sẽ bị xóa, chỉ giữ những thứ ở mục “Được giữ”.'));
      const go = btn('ok', '🌟 Xác nhận Sang mùa mới', 'Xác nhận sang mùa mới', async () => { if (!(await ask('Sang mùa mới?', 'Bước cuối: vườn sẽ được làm lại. Bạn sẽ nhận khoảng +' + F(gain) + ' Tinh hoa. Không hoàn tác được.', 'Sang mùa mới'))) return; try { await run({ op: 'prestige', confirm: true }); armed = false; say('Đã sang mùa mới! Chúc bạn một mùa bội thu.'); sfx('win'); celebrate(); G.scene.center(); } catch (_) { armed = false; draw(); } });
      go.disabled = true; ck.addEventListener('change', () => { go.disabled = !ck.checked; }); act.append(lb, go, btn('', 'Quay lại', 'Hủy sang mùa mới', () => { armed = false; draw(); })); }
    box.append(act);
  }
  draw(); let raf = 0; return { update() { if (armed) return; cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); }, destroy() { cancelAnimationFrame(raf); } };
});

/* ===== THỐNG KÊ, NHẬT KÝ, XẾP HẠNG, CHỤP ẢNH ===== */
const STATS = [['Tổng thu hoạch', ['h', 'harv', 'harvest', 'harvested', 'th'], F], ['Điểm đã chi', ['sp', 'spent', 'pts', 'diem'], F], ['Xu đã kiếm', ['xu', 'xuTotal', 'earned'], F], ['Thời gian chơi', ['t', 'time', 'play', 'playMs', 'tm'], v => { v = +v || 0; const s = v > 1e7 ? v / 1000 : v; return s >= 3600 ? Math.floor(s / 3600) + ' giờ ' + Math.floor(s % 3600 / 60) + ' phút' : Math.floor(s / 60) + ' phút'; }], ['Cây trồng nhiều nhất', ['fav', 'favCrop', 'top'], v => { const c = G.cropInfo(v); return c ? c.emoji + ' ' + c.name : String(v); }]];
function aesScore(st) { const d = G.getDerived() || {}; if (d.aes != null) return +d.aes; let a = 0; for (const k in st.d) { const i = G.decoInfo(st.d[k]); if (i) a += decoAes(i, i.tier || 0); } for (const w of G.wonders()) { const b = st.b[w.id]; if (b && isFinite(w.aes[(+b.l || 1) - 1])) a += w.aes[(+b.l || 1) - 1]; } return Math.round(a); }
function logText(x) { if (x == null) return ''; if (typeof x === 'string') return x; if (Array.isArray(x)) return x.filter(v => typeof v !== 'number' || v < 1e11).join(' · '); return String(pk(x, ['m', 'msg', 'text', 't', 'detail'], '')) || JSON.stringify(x); }
function shot() {
  const cv = $('.gd-canvas'); if (!cv) { say('Chưa có khu vườn để chụp.', true); return; }
  try { cv.toBlob(async b => { if (!b) { say('Không chụp được ảnh. Thử lại sau.', true); return; } const f = typeof File === 'function' ? new File([b], 'khu-vuon.png', { type: 'image/png' }) : null;
    try { if (f && navigator.canShare && navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], title: 'Khu vườn của mình' }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
    const u = URL.createObjectURL(b), a = el('a'); a.href = u; a.download = 'khu-vuon.png'; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); say('Đã lưu ảnh khu vườn (khu-vuon.png).'); }, 'image/png'); }
  catch (_) { say('Trình duyệt không cho chụp ảnh khu vườn.', true); }
}
const stats = guarded((body, g) => {
  const nt = mkNote(), box = el('div', 'gdu-stack'), bd = el('div', 'gdu-board'); body.append(nt, box); let loaded = false;
  function board() { bd.replaceChildren(el('p', 'gd-muted', 'Đang tải xếp hạng…'));
    if (!SG().api) { bd.replaceChildren(el('p', 'gd-muted', 'Chưa kết nối máy chủ.')); return; }
    SG().api('gardenBoard', {}).then(r => { loaded = true; bd.replaceChildren(); const rows = (r && r.board) || []; if (!rows.length) { bd.append(empty('Chưa có ai trên bảng vườn.')); return; }
      const ol = el('ol', 'gdu-ol'); rows.forEach(x => { const li = el('li', x.me ? 'me' : ''), md = ['🥇', '🥈', '🥉'][x.rank - 1]; li.append(el('span', 'rk', md || x.rank), el('span', 'cd', String(x.who) + (x.me ? ' (bạn)' : '')), el('span', 'gdu-sub', 'Cấp ' + F(x.lv) + ' · mùa ' + ((+x.sn || 0) + 1) + (x.rep != null ? ' · Danh vọng ' + F(x.rep) + (x.rt ? ' (' + x.rt + ')' : '') : '')), el('b', '', F(x.aes) + ' ✨')); ol.append(li); }); bd.append(ol);
      if (r.me && !rows.some(x => x.me)) bd.append(el('p', 'gd-muted', 'Bạn đứng hạng ' + F(r.me.rank) + (r.total ? ' / ' + F(r.total) : '') + (r.me.rep != null ? ' · Danh vọng ' + F(r.me.rep) + (r.me.rt ? ' (' + r.me.rt + ')' : '') : '') + '.')); bd.append(el('p', 'gd-muted', 'Thứ tự do máy chủ tính. Mã đã được che.')); },
      e => { bd.replaceChildren(el('p', 'gdu-note bad', friendly(e && e.code, e && e.message))); }); }
  function draw() {
    const st = g.getState(); if (!st) return; const top = body.parentElement ? body.parentElement.scrollTop : 0; box.replaceChildren(); const s = st.s || {};
    const rb = repBox(), cl = capLine(); if (rb) box.append(rb); if (cl) box.append(cl);
    const sec = el('section', 'gdu-sec'); sec.append(el('h3', 'gdu-gh', '📊 Thống kê'));
    const gr = el('dl', 'gdu-kv'); const add = (k, v) => { const r = el('div'); r.append(el('dt', '', k), el('dd', '', v)); gr.append(r); };
    add('Cấp vườn', lvl()); add('Mùa', (st.sn | 0) + 1); add('Điểm thẩm mỹ', F(aesScore(st)));
    for (const [lb, keys, fm] of STATS) { let v = null; for (const k of keys) if (s[k] != null) { v = s[k]; break; } add(lb, v == null ? '—' : fm(v)); }
    sec.append(gr, btn('', '📷 Chụp ảnh khu vườn', 'Chụp ảnh khu vườn', shot)); box.append(sec);
    const lg = el('section', 'gdu-sec'); lg.append(el('h3', 'gdu-gh', '🕘 Hoạt động gần đây')); const L = (Array.isArray(st.lg) ? st.lg : []).slice(-12).reverse();
    if (!L.length) lg.append(empty('Chưa có hoạt động nào được ghi.')); else { const ul = el('ul', 'gdu-log'); L.forEach(x => ul.append(el('li', '', logText(x)))); lg.append(ul); } box.append(lg);
    const bs = el('section', 'gdu-sec'); bs.append(el('h3', 'gdu-gh', '🏅 Bảng xếp hạng vườn')); if (!loaded && !bd.childNodes.length) bs.append(btn('', 'Xem bảng xếp hạng', 'Tải bảng xếp hạng vườn', () => { board(); })); bs.append(bd); box.append(bs);
    if (body.parentElement) body.parentElement.scrollTop = top;
  }
  draw(); let raf = 0; return { update() { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); }, destroy() { cancelAnimationFrame(raf); } };
});

/* ===== CÀI ĐẶT ===== */
function applyCalm() { const r = $('.gd-root'); if (r) r.classList.toggle('gd-calm', !!cfg.calm); if (G.setCalm) G.setCalm(!!cfg.calm); }
function settings(body) {
  body.classList.add('gdu'); const nt = mkNote(), box = el('div', 'gdu-stack'); body.append(nt, box);
  const seg = (label, opts, cur, fn) => { const w = el('div', 'gdu-set'); w.append(el('b', '', label)); const g = el('div', 'gd-seg', null, { role: 'group', 'aria-label': label }); opts.forEach(([v, t]) => { const b = btn(String(v) === String(cur) ? 'on' : '', t, t, () => { fn(v); g.querySelectorAll('button').forEach(x => x.classList.remove('on')); b.classList.add('on'); b.setAttribute('aria-pressed', 'true'); }); b.setAttribute('aria-pressed', String(v) === String(cur)); g.append(b); }); w.append(g); return w; };
  const q = (G.scene && G.scene.quality) || 'mid', cl0 = capLine(); if (cl0) box.append(cl0);
  box.append(seg('Chất lượng đồ họa', [['auto', 'Tự động'], ['low', 'Thấp'], ['mid', 'Vừa'], ['high', 'Cao']], LS.get('sm_garden_q') || 'auto', v => G.setQuality(v)), el('p', 'gd-muted', 'Đang dùng: ' + ({ low: 'Thấp', mid: 'Vừa', high: 'Cao' }[q] || q) + '. Chọn Thấp nếu máy chậm hoặc nóng.'));
  box.append(seg('Âm thanh vườn', [['1', 'Bật'], ['0', 'Tắt']], LS.get(K_SND) === '0' ? '0' : '1', v => { LS.set(K_SND, v); if (v === '1') sfx('click'); }));
  box.append(seg('Giảm chuyển động', [['0', 'Bình thường'], ['1', 'Giảm']], cfg.calm ? '1' : '0', v => { cfg.calm = v === '1'; saveCfg(); applyCalm(); }), el('p', 'gd-muted', 'Luôn giảm sẵn nếu thiết bị của bạn đã bật “giảm chuyển động”.'));
  box.append(seg('Định dạng số', [['short', 'Gọn (1,2K)'], ['full', 'Đầy đủ (1.200)']], cfg.fmt, v => { cfg.fmt = v; saveCfg(); say('Đã đổi. Các bảng sẽ dùng cách viết số mới.'); }));
  const ac = el('div', 'gdu-set'); ac.append(btn('', '🔄 Làm mới từ máy chủ', 'Làm mới từ máy chủ', async () => { say('Đang làm mới…'); await G.refresh(); say('Đã làm mới dữ liệu vườn.'); }), btn('', '◎ Căn giữa vườn', 'Căn giữa vườn', () => { G.scene.center(); G.closePanel(); }), btn('', '❓ Xem lại hướng dẫn', 'Xem lại hướng dẫn', () => { G.closePanel(); setTimeout(() => guide(true), 80); })); box.append(ac);
  return {};
}

/* ===== HƯỚNG DẪN LẦN ĐẦU ===== */
const GUIDE = [
  ['🌱', 'Chào mừng đến Khu vườn', 'Kéo ngón tay để di chuyển, chụm hai ngón (hoặc lăn chuột) để phóng to. Nút ◎ đưa bạn về giữa vườn.'],
  ['⛏️', 'Cuốc đất, chọn hạt', 'Chọn ⛏️ Cuốc đất rồi chạm hoặc kéo qua ô cỏ. Sau đó bấm 🌱 Hạt để chọn cây và chạm ô đất trống để trồng.'],
  ['🪙', 'Xu và điểm khác nhau', 'Điểm 💰 kiếm từ làm bài, dùng để mua Kỳ quan, mở rộng đất và trang trí. Xu 🪙 kiếm từ trồng trọt, dùng mua hạt giống và cuốc đất. Hai thứ không đổi cho nhau.'],
  ['🧺', 'Chờ chín rồi thu hoạch', 'Mỗi cây có đồng hồ riêng. Cây chín thì bấm 🧺 Thu hoạch tất cả, hoặc chạm từng ô.'],
  ['🛒', 'Cửa hàng và nâng cấp', 'Menu ☰ có Cửa hàng, Nâng cấp, Nhiệm vụ. Giá luôn hiện trước, và khoản trừ điểm lớn sẽ được hỏi lại. Bạn không cần mua hết mọi thứ.'],
  ['🏛️', 'Danh vọng và Kỳ quan', 'Dùng điểm cho vườn thì Danh vọng 🏅 tăng dần. Danh vọng mở Kỳ quan lớn (5 giai đoạn), nền đất mới và trang trí bậc cao. Kỳ quan chưa mở sẽ ghi rõ cần Danh vọng mấy.'],
  ['🌟', 'Nhiệm vụ và Sang mùa mới', 'Nhận quà và nhiệm vụ mỗi ngày. Khi vườn đủ lớn, Sang mùa mới giúp bạn nhận Tinh hoa 🌸 để vườn lời hơn.']
];
let gOpen = null;
function guide(force) {
  if (gOpen || !stage()) return; if (!force && LS.get(K_SEEN) === '1') return; let i = 0; const back = document.activeElement;
  const ov = el('div', 'gdu-ov gdu-guide', null, { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'gdu-gt' }), box = el('div', 'gdu-dlg'); ov.append(box); gOpen = ov;
  const end = () => { LS.set(K_SEEN, '1'); ov.remove(); gOpen = null; try { back && back.focus && back.focus(); } catch (_) {} };
  function draw() { const s = GUIDE[i]; box.replaceChildren(); box.append(el('div', 'gdu-gi', s[0], { 'aria-hidden': 'true' }), el('b', 'gdu-dt', s[1], { id: 'gdu-gt' }), el('p', '', s[2]), el('p', 'gd-muted', 'Bước ' + (i + 1) + ' / ' + GUIDE.length));
    const row = el('div', 'gdu-row2'); row.append(btn('', 'Bỏ qua', 'Bỏ qua hướng dẫn', end)); if (i) row.append(btn('', 'Trước', 'Bước trước', () => { i--; draw(); })); row.append(btn('ok', i === GUIDE.length - 1 ? 'Bắt đầu chơi' : 'Tiếp', i === GUIDE.length - 1 ? 'Xong hướng dẫn' : 'Bước tiếp', () => { if (i === GUIDE.length - 1) end(); else { i++; draw(); } })); box.append(row); row.lastChild.focus(); }
  ov.addEventListener('keydown', e => trap(ov, e, end)); stage().append(ov); draw();
}

/* ===== Việc nên làm tiếp, chấm đỏ, menu ===== */
let hintEl = null, hintOff = '', tickT = 0;
function nextTodo(st) {
  const now = G.serverNow(); let ripe = 0, soil = 0, planted = 0; for (const k in st.f) { const f = st.f[k]; if (Array.isArray(f)) { planted++; if (f[1] <= now) ripe++; } else soil++; }
  if (ripe) return { id: 'ripe', t: '🧺 ' + ripe + ' cây đã chín, sẵn sàng thu hoạch.', b: 'Thu hoạch tất cả', fn: () => run({ op: 'harvestAll' }).catch(() => {}) };
  if (dailyReady(st)) return { id: 'daily', t: '🎁 Quà hằng ngày đang chờ bạn.', b: 'Mở', fn: () => G.openPanel('quests') };
  if (!soil && !planted) return { id: 'till', t: '⛏️ Chưa có đất trồng. Dùng Cuốc đất để chuẩn bị vài ô.', b: 'Dùng cuốc', fn: () => G.setTool('till') };
  if (soil && !planted) return { id: 'plant', t: '🌱 Chọn hạt rồi chạm ô đất trống để trồng.', b: 'Chọn hạt', fn: () => G.openPanel('shop', { tab: 'seed' }) };
  const pc = plotCost(st); if ((st.ch || []).length < 400 && bal() >= pc && pc > 0) return { id: 'expand', t: '🟩 Bạn đủ điểm để mở thêm một mảnh đất (khoảng ' + F(pc) + ' điểm). Cân nhắc nếu muốn.', b: 'Xem', fn: () => G.openPanel('shop', { tab: 'land' }) };
  if (lvl() >= 10 && Math.floor(Math.sqrt((+st.xs || 0) / 1500)) >= 1) return { id: 'prestige', t: '🌟 Vườn đã đủ điều kiện Sang mùa mới.', b: 'Xem', fn: () => G.openPanel('prestige') };
  if (LS.get('sm_garden_hint_wd') !== '1' && G.rep().has && !Object.keys(st.b).some(k => /^wd_/.test(k)) && !Object.keys(st.wi || {}).length) return { id: 'wonder', t: '🏛️ Điểm kiếm từ làm bài dùng được cho Kỳ quan, đất và trang trí. Xem khi nào bạn muốn nhé.', b: 'Xem Kỳ quan', fn: () => G.openPanel('shop', { tab: 'wonder' }) };
  return null;
}
function hint() {
  const host = stage(), st = G.getState(); if (!host || !st) return;
  if (!hintEl || !hintEl.isConnected) { hintEl = el('div', 'gd-hint', null, { role: 'status' }); host.append(hintEl); }
  const t = nextTodo(st); if (!t || t.id === hintOff) { hintEl.hidden = true; return; }
  if (hintEl.dataset.k === t.id + t.t) { hintEl.hidden = false; return; }
  hintEl.dataset.k = t.id + t.t; hintEl.replaceChildren(el('span', 'gd-ht', t.t), btn('ok', t.b, t.b, () => { if (t.id === 'wonder') LS.set('sm_garden_hint_wd', '1'); t.fn(); }), btn('x', '✖', 'Ẩn gợi ý', () => { hintOff = t.id; if (t.id === 'wonder') LS.set('sm_garden_hint_wd', '1'); hintEl.hidden = true; })); hintEl.hidden = false;
}
function dots() {
  const st = G.getState(); if (!st) return; const n = claimables(st), mb = $('.gd-toolbar .menu'); if (!mb) return;
  const mark = (host, on, label) => { let d = $('.gdu-dot', host); if (on && !d) { d = el('span', 'gdu-dot', null, { 'aria-hidden': 'true' }); host.append(d); } else if (!on && d) d.remove(); };
  mark(mb, n > 0); mb.setAttribute('aria-label', n > 0 ? 'Mở menu vườn, có ' + n + ' phần thưởng chờ nhận' : 'Mở menu vườn');
  document.querySelectorAll('.gd-menu .gd-mi').forEach(m => { if (/Nhiệm vụ/.test(m.textContent)) mark(m, n > 0); });
}
function injectMenu() {
  const m = $('.gd-menu'); if (!m || m.querySelector('[data-gdu]')) return;
  const b = el('button', 'gd-mi', '❓ Hướng dẫn', { type: 'button', role: 'menuitem', 'data-gdu': '1' }); b.addEventListener('click', () => { m.hidden = true; guide(true); }); m.append(b);
}

/* ===== Bảng trượt: khóa cuộn nền, focus, kéo xuống để đóng ===== */
let sheetObs = null, lastFocus = null;
function enhanceSheet() {
  const sh = $('.gd-sheet'); if (!sh || sh._gdu) return; sh._gdu = 1;
  const lock = on => document.documentElement.classList.toggle('gd-lockscroll', on);
  const onKey = e => { if (!sh.hidden) trap(sh, e, () => G.closePanel()); };
  sh.addEventListener('keydown', onKey);
  const sync = () => { if (!sh.hidden) { lastFocus = document.activeElement !== document.body ? document.activeElement : lastFocus; sh.setAttribute('aria-modal', 'true'); sh.style.transform = ''; lock(true); setTimeout(() => { const c = sh.querySelector('.gd-sh .gd-btn') || focusables(sh)[0]; c && c.focus({ preventScroll: true }); }, 30); sh.scrollTop = 0; } else { lock(false); sh.style.transform = ''; try { lastFocus && lastFocus.isConnected && lastFocus.focus({ preventScroll: true }); } catch (_) {} lastFocus = null; } };
  sheetObs = new MutationObserver(sync); sheetObs.observe(sh, { attributes: true, attributeFilter: ['hidden'] });
  let sy = null, dy = 0, pid = null;                                                       // kéo thanh tiêu đề xuống > 90px thì đóng (chỉ khi bảng nằm đáy màn hình)
  sh.addEventListener('pointerdown', e => { const hd = e.target.closest && e.target.closest('.gd-sh'); if (!hd || e.target.closest('button') || root.innerWidth >= 700) return; sy = e.clientY; dy = 0; pid = e.pointerId; try { hd.setPointerCapture(pid); } catch (_) {} });
  sh.addEventListener('pointermove', e => { if (sy == null || e.pointerId !== pid) return; dy = Math.max(0, e.clientY - sy); sh.style.transform = 'translateY(' + dy + 'px)'; });
  const end = e => { if (sy == null || (e && e.pointerId !== pid)) return; const d = dy; sy = null; dy = 0; if (d > 90) G.closePanel(); else sh.style.transform = ''; };
  sh.addEventListener('pointerup', end); sh.addEventListener('pointercancel', end);
  const hdObs = new MutationObserver(() => { const h = sh.querySelector('.gd-sh'); if (h && !h.querySelector('.gdu-grip')) h.prepend(el('span', 'gdu-grip', null, { 'aria-hidden': 'true' })); }); hdObs.observe(sh, { childList: true });
}

/* ===== Đăng ký & sự kiện ===== */
G.registerPanel('shop', shop); G.registerPanel('upgrades', upgrades); G.registerPanel('quests', quests);
G.registerPanel('prestige', prestige); G.registerPanel('stats', stats); G.registerPanel('settings', settings);

if (G.setSpendGuard) G.setSpendGuard((cost, title, msg) => spend(cost, title, msg, 'Đồng ý'));
G.on('rejected', e => { if (e && (e.code === 'garden_daily_cap' || e.code === 'garden_maxed')) setTimeout(() => G.refresh(), 400); });   // đồng bộ lại để dòng "đã dùng A/B" và trạng thái tối đa luôn đúng
G.on('expand', e => { if (e && e.cost != null) expand(e.cx, e.cy, +e.cost || 0); });
G.on('achievement', () => dots());
G.on('state', () => { hint(); dots(); });
G.on('openpanel', e => { setTimeout(enhanceSheet, 0); if (e && e.panel === 'quests') dots(); });
G.on('result', r => { if (r && r.levelUps && (r.levelUps.length || r.levelUps > 0)) sfx('win'); });
function onReady() { enhanceSheet(); injectMenu(); applyCalm(); hint(); dots(); clearInterval(tickT); tickT = setInterval(() => { hint(); dots(); }, 5000); guide(false); }
G.on('ready', onReady);
G.on('unmount', () => { clearInterval(tickT); tickT = 0; if (sheetObs) { sheetObs.disconnect(); sheetObs = null; } hintEl = null; gOpen = null; note = null; document.documentElement.classList.remove('gd-lockscroll'); });
if (G.getState && G.getState()) onReady();
})(typeof window !== 'undefined' ? window : globalThis);

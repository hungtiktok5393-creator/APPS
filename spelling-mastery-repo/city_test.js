// Kiểm thử City.gs: nạp HÀM THẬT từ Code.gs (applyDelta_, findRow_, withLock_...) + City.gs, giả lập Sheet/Cache/Lock/Utilities.
// Chạy: node city_test.js
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path'), zlib = require('zlib');
const dir = __dirname, code = fs.readFileSync(path.join(dir, 'Code.gs'), 'utf8');
function extract(name) {
  const i = code.search(new RegExp('^function ' + name + '\\(', 'm'));
  if (i < 0) throw new Error('missing ' + name);
  let d = 0, j = code.indexOf('{', i), started = false;
  for (; j < code.length; j++) { const ch = code[j]; if (ch === '{') { d++; started = true; } else if (ch === '}') { d--; if (started && d === 0) break; } }
  return code.slice(i, j + 1);
}
let T = Date.UTC(2026, 9, 27, 3, 0, 0);   // 10:00 giờ VN
class FakeDate extends Date { constructor(...a) { if (a.length === 0) super(T); else super(...a); } static now() { return T; } }
class Sheet {
  constructor(headers) { this.d = [headers.slice()]; }
  getLastRow() { return this.d.length; } getMaxRows() { return Math.max(this.d.length, 1000); } insertRowsAfter() {}
  getRange(r, c, nr, nc) {
    const s = this; nr = nr || 1; nc = nc || 1;
    return { getValues() { const o = []; for (let i = 0; i < nr; i++) { const row = []; for (let k = 0; k < nc; k++) { const v = (s.d[r - 1 + i] || [])[c - 1 + k]; row.push(v === undefined ? '' : v); } o.push(row); } return o; },
      setValues(v) { for (let i = 0; i < nr; i++) { while (s.d.length < r + i) s.d.push([]); for (let k = 0; k < nc; k++) { const val = v[i][k]; if (typeof val === 'string' && val.length > 50000) throw new Error('CELL > 50000'); s.d[r - 1 + i][c - 1 + k] = val; } } }, setNumberFormat() {} };
  }
  appendRow(row) { this.d.push(row); }
}
const blob = b => ({ getBytes: () => b, getDataAsString: () => Buffer.from(b).toString('utf8') });
const Utilities = {
  newBlob: (data) => blob(typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.from(data)),
  gzip: b => blob(zlib.gzipSync(Buffer.from(b.getBytes()))), ungzip: b => blob(zlib.gunzipSync(Buffer.from(b.getBytes()))),
  base64Encode: b => Buffer.from(b).toString('base64'), base64Decode: s => Buffer.from(s, 'base64')
};
const sheets = {}, cache = new Map();
const sandbox = { console, Math, JSON, Date: FakeDate, Object, Array, String, Number, isFinite, parseInt, RegExp, Error, Buffer, Utilities,
  CacheService: { getScriptCache: () => ({ get: k => cache.has(k) ? cache.get(k) : null, put: (k, v) => cache.set(k, v) }) },
  LockService: (() => { let held = false; return { getScriptLock: () => ({ hasLock: () => held, waitLock() { held = true; }, releaseLock() { held = false; } }) }; })(),
  _cfg: { cityEnabled: true, cityCostPct: 100, cityDailySpendCap: 0, cityActionPts: 0 } };   // mục 1–13: tắt phí thao tác; mục 14 kiểm riêng
vm.createContext(sandbox);
const pre = ['foldCode_', 'normCode_', 'isActive_', 'iso_', 'safe_', 'findRow_', 'cols_', 'clampInt_', 'apiError_', 'withLock_', 'maskCode_', 'appendRows_', 'applyDelta_', 'cget_', 'cput_', 'cfgNum_', 'cfgBool_', 'getStudent_', 'okWrap_', 'pwStr_'].map(extract).join('\n');
const reasons = /const LEDGER_REASONS = (\[[^\]]*\])/.exec(code)[1];
vm.runInContext(`const CODE_MIN=3, CODE_MAX=16, PW_MAX=32; const LEDGER_REASONS=${reasons};
function getConfigValue_(k,d){const v=_cfg[k];return v===undefined?d:v;}
function stSh_(){return __sh('Students');} function ldSh_(){return __sh('Ledger');}
function sheetT_(n,h,t){return __sh(n,h);}
function requireStudent_(c){ const s=getStudent_(c); if(!s) throw apiError_('invalid_code','x'); return s; }
${pre}`, sandbox);
sandbox.__sh = (n, h) => sheets[n] || (sheets[n] = new Sheet(h || (n === 'Students' ? ['code', 'createdAt', 'note', 'active', 'balance', 'totalEarned', 'lastActive'] : ['t', 'code', 'delta', 'reason', 'refId', 'balanceAfter', 'detail'])));
const cityGs = fs.readFileSync(path.join(dir, 'City.gs'), 'utf8');
vm.runInContext(cityGs + '\nconst CITY_ACTIONS = {}; registerCityActions_(CITY_ACTIONS); this.CityCore = CityCore;', sandbox);
const C = sandbox.CityCore;
const run = s => vm.runInContext(s, sandbox);
function call(action, params) {
  sandbox.__p = params; sandbox.__a = action;
  try { return run(`(function(){ const s = requireStudent_(__p.code); if(!cfgBool_('cityEnabled',true)) throw apiError_('city_disabled','x'); return okWrap_(CITY_ACTIONS[__a](__p, s)); })()`); }
  catch (e) { if (e.apiCode) return { ok: false, error: e.apiCode, message: e.message }; throw e; }
}
let rid = 0; const R = () => 'req-' + String(++rid).padStart(8, '0');
const act = (c, ops, r) => call('cityAct', { code: c, ops: Array.isArray(ops) ? ops : [ops], requestId: r || R() });
const bal = c => run(`getStudent_('${c}')`).balance;
const addStudent = (c, b) => sandbox.__sh('Students').d.push([c, '', '', true, b, b, '']);
const H = 3600000, D = 24 * H, M = 60000;
let pass = 0, fail = 0;
function ok(name, cond, info) { if (cond) { pass++; console.log('  PASS', name); } else { fail++; console.log('  FAIL', name, info !== undefined ? JSON.stringify(info).slice(0, 500) : ''); } }
const sc = n => console.log('\n# ' + n);
const ids = (st, t) => Object.keys(st.b).filter(i => st.b[i].t === t);
const free = (st, d) => {   // tìm ô trống (đã dọn) cho công trình d
  const O = C.occupancy(st), chs = C.ownedSet(st), w = C.B_BY[d].w;
  for (let y = 0; y < 400; y++) for (let x = -50; x < 400; x++) {
    let good = true;
    for (let i = 0; i < w && good; i++) for (let j = 0; j < w && good; j++) { const k = (x + i) + ',' + (y + j); if (!C.cellOwned(chs, x + i, y + j) || O[k] || st.o[k]) good = false; }
    if (good) return [x, y];
  }
  return null;
};

// 0) City.gs khớp nguồn
ok('City.gs đúng bằng bản build từ city-core.js + city-server.js', cityGs === require('./build-city.js')(), 'chạy: node build-city.js');

addStudent('HS1', 5000); addStudent('HS2', 10); addStudent('HS3', 1000000);

sc('1. Khởi đầu');
let g = call('cityGet', { code: 'HS1' });
ok('cityGet tạo thành phố mới', g.ok && g.state && g.state.ch.length === 4 && g.balance === 5000 && g.derived.lv === 1, g);
ok('có công trình đặc biệt', ['toathi', 'kho', 'donhang', 'cho'].every(t => ids(g.state, t).length === 1));
ok('có ruộng chín sẵn + đơn hàng', ids(g.state, 'ruong').length === 9 && g.state.od.length === 6, g.state.od.length);
ok('có chướng ngại để dọn', Object.keys(g.state.o).length > 5);
ok('derived đủ trường', ['pop', 'hap', 'cap', 'used', 'quests', 'chunkCost', 'perms', 'rank'].every(k => g.derived[k] !== undefined), Object.keys(g.derived));
const g2 = call('cityGet', { code: 'HS1' });
ok('gọi lại không tạo dòng mới', sheets.City.d.length === 2 && g2.v === 1);

sc('2. Ruộng: thu hoạch, gieo, tăng tốc');
let st = g.state, F = ids(st, 'ruong');
let r = act('HS1', { op: 'harvest', ids: F });
ok('thu hoạch 3 ruộng chín → +6 lúa', r.ok && r.results[0].n === 6 && r.state.inv.lua === 12, r);
ok('không chi điểm', bal('HS1') === 5000 && r.spent === 0);
r = act('HS1', { op: 'harvest', ids: F });
ok('thu lại → not_ready', !r.ok && r.error === 'city_not_ready', r);
const xu0 = r.state.xu;
r = act('HS1', { op: 'plant', c: 'lua', ids: F });
ok('gieo 9 ruộng -9 xu', r.ok && r.results[0].n === 9 && r.state.xu === xu0 - 9, r.results);
r = act('HS1', { op: 'plant', c: 'carot', ids: F });
ok('cây chưa mở cấp → locked', !r.ok && r.error === 'city_locked', r);
r = act('HS1', { op: 'plant', c: 'xoai', ids: F });
ok('giống quý chưa mua → locked', !r.ok && r.error === 'city_locked');
T += 60 * 1000;
r = act('HS1', { op: 'speed', ids: F });
ok('tăng tốc 9 ruộng tốn điểm', r.ok && r.spent >= 1 && bal('HS1') === 5000 - r.spent, r.spent);
r = act('HS1', { op: 'harvest', ids: F });
ok('sau tăng tốc thu được 18 lúa', r.ok && r.results[0].n === 18, r.results);
const led = sheets.Ledger.d.slice(1);
ok('ledger ghi reason city', led.length === 1 && led[0][3] === 'city' && led[0][2] < 0, led);

sc('3. Bán, đơn hàng, thuế');
st = r.state;
const lua = st.inv.lua;
r = act('HS1', { op: 'sell', k: 'lua', n: 2 });
ok('bán 2 lúa = 6 xu', r.ok && r.results[0].xu === 6 && r.state.inv.lua === lua - 2, r.results);
r = act('HS1', { op: 'sell', k: 'lua', n: 9999 });
ok('bán quá số có → not_enough_items', !r.ok && r.error === 'city_not_enough_items');
st = r.state;
const oi = st.od.findIndex(o => Object.keys(o.it).every(k => (st.inv[k] || 0) >= o.it[k]));
r = act('HS1', { op: 'order', i: oi });
ok('giao đơn hàng nhận xu + đơn mới', oi >= 0 && r.ok && r.results[0].xu > 0 && r.state.s.od === 1, r);
r = act('HS1', { op: 'discard', i: 0 });
ok('bỏ đơn → xe tới sau 1 phút', r.ok && r.state.od[0].w > T);
r = act('HS1', { op: 'order', i: 0 });
ok('đơn đang chờ → not_ready', !r.ok && r.error === 'city_not_ready');
T += 2 * H;
const houses = ids(r.state, 'nhago');
r = act('HS1', { op: 'tax', ids: houses });
ok('thu thuế 2 nhà', r.ok && r.results[0].xu > 0 && r.results[0].n === 2, r.results);
const tx1 = r.results[0].xu;
T += 30 * D;
r = act('HS1', { op: 'tax', ids: houses });
ok('thuế dừng ở 6 giờ khi chưa có Robot', r.ok && r.results[0].xu <= Math.ceil(tx1 / 4 * 6) + 2, [tx1, r.results[0].xu]);

sc('4. Xây dựng, di chuyển, cất kho');
st = r.state;
let p = free(st, 'nhago');
r = act('HS1', { op: 'place', t: 'nhago', x: p[0], y: p[1] });
ok('xây nhà gỗ -30 xu', r.ok && r.state.xu === st.xu - 30 + 0 && ids(r.state, 'nhago').length === 3, [st.xu, r.state && r.state.xu]);
const hid = r.results[0].id;
r = act('HS1', { op: 'place', t: 'nhago', x: p[0], y: p[1] });
ok('đặt chồng → cell_busy', !r.ok && r.error === 'city_cell_busy');
r = act('HS1', { op: 'place', t: 'nhago', x: -5, y: -5 });
ok('đặt ngoài đất → bad_cell', !r.ok && r.error === 'city_bad_cell');
const ob = Object.keys(r.state.o)[0];
r = act('HS1', { op: 'place', t: 'nhago', x: +ob.split(',')[0], y: +ob.split(',')[1] });
ok('đặt lên cây/đá → cell_busy', !r.ok && r.error === 'city_cell_busy');
r = act('HS1', { op: 'place', t: 'bietthu', x: 0, y: 0 });
ok('chưa đủ cấp → locked', !r.ok && r.error === 'city_locked');
r = act('HS1', { op: 'place', t: 'toathi', x: 0, y: 0 });
ok('không xây thêm công trình đặc biệt', !r.ok && r.error === 'city_bad_request');
st = r.state; p = free(st, 'nhago');
r = act('HS1', { op: 'move', id: hid, x: p[0], y: p[1] });
ok('di chuyển miễn phí', r.ok && r.state.b[hid].x === p[0] && r.state.xu === st.xu);
r = act('HS1', { op: 'upgrade', id: hid });
ok('nâng cấp nhà cần gỗ', r.ok ? r.state.b[hid].l === 2 : r.error === 'city_not_enough_items', r);
r = act('HS1', [{ op: 'store', id: hid }]);
ok('cất nhà vào kho công trình', r.ok && !r.state.b[hid] && r.state.bi.length === 1);
st = r.state; p = free(st, 'nhago');
r = act('HS1', { op: 'place', t: 'nhago', x: p[0], y: p[1], inv: 0 });
ok('đặt lại từ kho miễn phí, giữ cấp', r.ok && r.state.xu === st.xu && r.state.bi.length === 0 && r.state.b[r.results[0].id].l === st.bi[0].l, r);

sc('5. Dọn chướng ngại');
st = r.state;
const okeys = Object.keys(st.o).filter(k => C.cellOwned(C.ownedSet(st), +k.split(',')[0], +k.split(',')[1]));
const ok1 = okeys[0], ot = st.o[ok1];
r = act('HS1', { op: 'clear', x: +ok1.split(',')[0], y: +ok1.split(',')[1] });
ok('dọn ' + ot + ' tốn xu, nhận vật liệu', r.ok && !r.state.o[ok1] && r.state.xu === st.xu - C.OBS[ot].xu, r);
r = act('HS1', { op: 'clear', x: +ok1.split(',')[0], y: +ok1.split(',')[1] });
ok('dọn lại → not_found', !r.ok && r.error === 'city_not_found');

sc('6. Nguyên tử & idempotent');
st = r.state;
const xuB = st.xu;
r = act('HS1', [{ op: 'sell', k: 'lua', n: 1 }, { op: 'place', t: 'nhago', x: -9, y: -9 }]);
ok('lỗi ở op 2 → hoàn tác cả lô', !r.ok && r.opIndex === 1 && r.state.xu === xuB && r.state.inv.lua === st.inv.lua, r);
const rq = R();
r = act('HS1', { op: 'sell', k: 'lua', n: 1 }, rq);
const r2 = act('HS1', { op: 'sell', k: 'lua', n: 1 }, rq);
ok('cùng requestId không bán 2 lần', r.ok && r2.ok && r2.replay && r2.state.inv.lua === r.state.inv.lua, [r.state.inv.lua, r2.state && r2.state.inv.lua]);
r = act('HS1', [{ op: 'fly' }]);
ok('op lạ → unknown_op', !r.ok && r.error === 'city_unknown_op');
r = call('cityAct', { code: 'HS1', ops: [], requestId: R() });
ok('ops rỗng → bad_request', !r.ok && r.error === 'city_bad_request');
r = call('cityAct', { code: 'HS1', ops: Array(41).fill({ op: 'night', v: 1 }), requestId: R() });
ok('> 40 op → too_many_ops', !r.ok && r.error === 'city_too_many_ops');

sc('7. Cửa hàng điểm');
let b0 = bal('HS1');
r = act('HS1', { op: 'buyChunk', cx: 2, cy: 0 });
ok('mua đất 60 điểm (gấp đôi), sinh chướng ngại', r.ok && r.spent === 60 && bal('HS1') === b0 - 60 && r.state.ch.length === 5, r.spent);
r = act('HS1', { op: 'buyChunk', cx: 9, cy: 9 });
ok('đất không liền kề → bad_request', !r.ok && r.error === 'city_bad_request');
r = act('HS1', { op: 'buyChunk', cx: 2, cy: 0 });
ok('mua lại → already', !r.ok && r.error === 'city_already');
b0 = bal('HS1');
r = act('HS1', { op: 'buyChunk', cx: 3, cy: 0 });
ok('mảnh thứ 2 đắt hơn (85)', r.ok && r.spent === 85, r.spent);
r = act('HS2', { op: 'buyChunk', cx: 2, cy: 0 });
ok('HS2 thiếu điểm → not_enough_points, giữ điểm', !r.ok && r.error === 'city_not_enough_points' && bal('HS2') === 10);
b0 = bal('HS1');
r = act('HS1', { op: 'exchange', n: 10 });
ok('đổi 10 điểm → xu', r.ok && r.spent === 10 && r.results[0].xu === 10 * C.exRate(r.derived.lv) && C.exRate(1) === 6, r.results);
r = act('HS1', { op: 'exchange', n: 7 });
ok('gói đổi lạ → bad_request', !r.ok && r.error === 'city_bad_request');
r = act('HS1', { op: 'helper', k: 'maygat' });
ok('thuê máy gặt', r.ok && r.state.hp.maygat === 1 && r.spent === C.HELP_BY.maygat.pts && C.HELP_BY.maygat.pts > 120 * 2, C.HELP_BY.maygat.pts);
r = act('HS1', { op: 'helper', k: 'maygat' });
ok('thuê lại → already', !r.ok && r.error === 'city_already');
r = act('HS1', { op: 'perm', k: 'kho' });
const cap0 = r.derived && r.derived.cap;
ok('nâng kho vĩnh viễn +100', r.ok && r.state.pm.kho === 1 && r.derived.cap === 250, r.derived && r.derived.cap);
r = act('HS1', { op: 'perm', k: 'kho' });
ok('cấp 2 đắt hơn cấp 1', r.ok && r.spent > 50, r.spent);
r = act('HS1', { op: 'boost', k: 'x2thu', h: 2 });
ok('bùa x2 thu hoạch 2 giờ = 100 điểm', r.ok && r.spent === 100 && r.state.bo.x2thu[1] === T + 2 * H);
r = act('HS1', { op: 'boost', k: 'x2thu', h: 23 });
ok('bùa quá 24 giờ → limit', !r.ok && r.error === 'city_limit');
r = act('HS1', { op: 'plant', c: 'lua', ids: ids(r.state, 'ruong') });
ok('gieo khi có bùa → mỗi ô 4 nông sản', r.ok && Object.values(r.state.b).filter(b => b.t === 'ruong' && b.c).every(b => b.n === 4));
r = act('HS1', { op: 'rare', k: 'xoai' });
ok('giống quý cần cấp 4', !r.ok && r.error === 'city_locked');
r = act('HS1', { op: 'rare', k: 'huongduong' });
ok('mua giống hướng dương ' + C.CROP_BY.huongduong.rare + ' điểm (>80)', r.ok && r.spent === C.CROP_BY.huongduong.rare && r.spent > 80 && r.state.rc.indexOf('huongduong') >= 0);
r = act('HS1', { op: 'theme', k: 'dong' });
ok('mua chủ đề tuyết', r.ok && r.state.th.g === 'dong' && r.spent === C.GROUND_BY.dong.pts && r.spent >= 200);
r = act('HS1', { op: 'theme', k: '' });
ok('đổi về mặc định miễn phí', r.ok && r.state.th.g === '' && r.spent === 0);
r = act('HS1', { op: 'theme', k: 'dong' });
ok('dùng lại chủ đề đã mua miễn phí', r.ok && r.spent === 0 && r.state.th.g === 'dong');
r = act('HS1', { op: 'effect', k: 'phaohoa' });
ok('mua pháo hoa → bật', r.ok && r.spent === C.FX_BY.phaohoa.pts && r.spent === 450 && r.state.th.fx.indexOf('phaohoa') >= 0);
r = act('HS1', { op: 'effect', k: 'phaohoa' });
ok('bấm lại → tắt, không tốn điểm', r.ok && r.spent === 0 && r.state.th.fx.indexOf('phaohoa') < 0);
r = act('HS1', { op: 'vehicle', k: 'rong' });
ok('mua rồng bay', r.ok && r.state.vh.rong === 1 && r.spent === C.VEH_BY.rong.pts && r.spent === 1200);
st = r.state; p = free(st, 'anhdao');
r = act('HS1', { op: 'place', t: 'anhdao', x: p[0], y: p[1] });
ok('trang trí cao cấp tốn điểm, +hạnh phúc', r.ok && r.spent === C.B_BY.anhdao.pts && r.spent === 30 && r.derived.hap > g.derived.hap, [r.spent, r.derived && r.derived.hap]);

sc('8. Hệ số giá & trần chi ngày (giáo viên)');
sandbox._cfg.cityCostPct = 50;
r = act('HS1', { op: 'vehicle', k: 'taxi' });
ok('cityCostPct=50 → taxi ' + Math.round(C.VEH_BY.taxi.pts / 2) + ' điểm', r.ok && r.spent === Math.round(C.VEH_BY.taxi.pts / 2), r.spent);
sandbox._cfg.cityCostPct = 100; sandbox._cfg.cityDailySpendCap = 1;
r = act('HS1', { op: 'vehicle', k: 'taxi' });
ok('chạm trần chi ngày → daily_cap', !r.ok && r.error === 'city_daily_cap', r);
sandbox._cfg.cityDailySpendCap = 0;
sandbox._cfg.cityEnabled = false;
r = call('cityGet', { code: 'HS1' });
ok('cityEnabled=false → city_disabled', !r.ok && r.error === 'city_disabled');
sandbox._cfg.cityEnabled = true;

sc('9. Nhà máy & chuồng (HS3 – nhiều điểm)');
call('cityGet', { code: 'HS3' });
r = act('HS3', { op: 'exchange', n: 500 });
ok('HS3 đổi 500 điểm lấy xu', r.ok && r.state.xu >= 250 + 500 * C.exRate(1), r.state && r.state.xu);
// lên cấp nhanh: giao nhiều đơn / thu hoạch – dùng bùa XP + tăng tốc lặp lại
let s3 = r.state;
for (let k = 0; k < 40 && C.level(s3.xp).lv < 8; k++) {
  const fs3 = ids(s3, 'ruong');
  let q = act('HS3', [{ op: 'plant', c: 'lua', ids: fs3 }]); if (!q.ok) { q = act('HS3', { op: 'harvest', ids: fs3 }); }
  q = act('HS3', { op: 'speed', ids: fs3 }); q = act('HS3', { op: 'harvest', ids: fs3 });
  if (q.ok) { s3 = q.state; const n = (s3.inv.lua || 0); if (n > 4) { const q2 = act('HS3', { op: 'sell', k: 'lua', n: n - 4 }); if (q2.ok) s3 = q2.state; } }
  const q3 = act('HS3', { op: 'boost', k: 'x2xp', h: 1 }); if (q3.ok) s3 = q3.state;
  // giao mọi đơn làm được
  for (let i = 0; i < s3.od.length; i++) { const o = s3.od[i]; if (!o.w && Object.keys(o.it).every(kk => (s3.inv[kk] || 0) >= o.it[kk])) { const q4 = act('HS3', { op: 'order', i }); if (q4.ok) s3 = q4.state; } }
}
ok('HS3 lên được cấp ≥ 3', C.level(s3.xp).lv >= 3, C.level(s3.xp));
p = free(s3, 'xuongthucan');
r = act('HS3', { op: 'place', t: 'xuongthucan', x: p[0], y: p[1] });
ok('xây xưởng thức ăn', r.ok, r);
const fid = r.results && r.results[0].id;
s3 = r.state; s3.inv.lua = s3.inv.lua || 0;
r = act('HS3', { op: 'queue', id: fid, r: 0, n: 2 });
ok('xếp hàng làm thức ăn gà (hoặc thiếu nguyên liệu)', r.ok ? r.state.b[fid].q.length >= 1 : r.error === 'city_not_enough_items', r);
if (r.ok) {
  r = act('HS3', { op: 'collect', id: fid });
  ok('chưa xong → not_ready', !r.ok && r.error === 'city_not_ready');
  T += 20 * M;
  r = act('HS3', { op: 'collect', id: fid });
  ok('thu thức ăn gà', r.ok && r.state.inv.tag >= 3, r);
}
r = act('HS3', { op: 'place', t: 'xuongthucan', x: free(r.state, 'xuongthucan')[0], y: free(r.state, 'xuongthucan')[1] });
ok('bản thứ 2 tốn điểm', r.ok && r.spent > 0, r);

sc('10. Bảng xếp hạng, thăm, thả tim');
r = call('cityBoard', { code: 'HS1' });
ok('cityBoard có ≥ 2 thành phố', r.ok && r.board.length >= 2 && r.me && r.me.who === 'HS1', r);
r = call('cityVisit', { code: 'HS2', who: 'HS1' });
ok('HS2 thăm thành phố HS1', r.ok && r.state.b && r.derived.pop > 0 && !r.liked, r.derived);
ok('không lộ state nhạy cảm (inv, xu)', r.ok && r.state.inv === undefined && r.state.xu === undefined);
r = call('cityLike', { code: 'HS2', who: 'HS1' });
ok('thả tim', r.ok && r.likes === 1);
r = call('cityLike', { code: 'HS2', who: 'HS1' });
ok('thả tim lần 2 cùng ngày → already', !r.ok && r.error === 'city_already');
r = call('cityLike', { code: 'HS1', who: 'HS1' });
ok('tự thả tim → bad_request', !r.ok && r.error === 'city_bad_request');
r = call('cityVisit', { code: 'HS1', who: 'NOBODY' });
ok('thăm mã chưa có → not_found', !r.ok && r.error === 'city_not_found');
r = call('cityGet', { code: 'HS1' });
ok('likes hiện trong derived', r.ok && r.derived.likes === 1);

sc('11. Nhiệm vụ, quà ngày, thành tích');
r = call('cityGet', { code: 'HS1' });
ok('3 nhiệm vụ ngày', r.derived.quests.length === 3);
r = act('HS1', { op: 'daily' });
ok('nhận quà ngày', r.ok && r.results[0].xu > 0);
r = act('HS1', { op: 'daily' });
ok('nhận lại trong ngày → already', !r.ok && r.error === 'city_already');
T += D;
r = act('HS1', { op: 'daily' });
ok('ngày mới nhận tiếp, số ngày cộng dồn', r.ok && r.results[0].n >= 2, r.results);
const qd = r.derived.quests.find(q => q.done && !q.claimed);
if (qd) { r = act('HS1', { op: 'claimQuest', i: qd.i }); ok('nhận thưởng nhiệm vụ', r.ok && r.results[0].xu > 0); }
else { r = act('HS1', { op: 'claimQuest', i: 0 }); ok('nhiệm vụ chưa xong → not_ready', !r.ok && r.error === 'city_not_ready'); }

sc('12. Lưu trữ lớn (gzip nhiều ô)');
r = call('cityGet', { code: 'HS3' });
const big = r.state;
for (let i = 0; i < 3000; i++) big.b['x' + i] = { t: 'duong', x: 1000 + i, y: 1000, l: 1 };
big.lg = big.lg.concat(Array(30).fill([T, 'x'.repeat(100)]));
const enc = run('ctEncode_')(big);
ok('state lớn được nén và chia ô ≤ 45.000 ký tự', enc.parts[0].slice(0, 2) === 'z:' && enc.parts.every(s => s.length <= 45000), enc.parts.map(s => s.length).filter(Boolean));
ok('giải nén ra đúng state', JSON.parse(run('ctDecode_')(enc.parts)).b.x2999.x === 3999);

sc('13. Kinh tế: không có đường sinh điểm');
const before = bal('HS1');
r = act('HS1', [{ op: 'sell', k: 'lua', n: 1 }]);
ok('mọi thao tác chỉ chi, không cộng điểm', sheets.Ledger.d.slice(1).every(l => l[3] !== 'city' || Number(l[2]) <= 0 || /hoàn/.test(l[6])) && bal('HS1') <= before);
ok('không ghi sheet GameLog', !sheets.GameLog);

sc('14. Phí thao tác (cityActionPts, mặc định 2 ⭐)');
delete sandbox._cfg.cityActionPts;                       // không cấu hình → dùng mặc định 2
addStudent('HS5', 100);
g = call('cityGet', { code: 'HS5' });
ok('derived.actPts mặc định = 2', g.ok && g.derived.actPts === 2 && C.ACT_PTS === 2, g.derived && g.derived.actPts);
let F5 = ids(g.state, 'ruong');
r = act('HS5', { op: 'harvest', ids: F5 });
ok('thu hoạch 3 ô chín → 3 thao tác = 6 ⭐', r.ok && r.results[0].n === 6 && r.spent === 6 && bal('HS5') === 94, [r.spent, bal('HS5')]);
r = act('HS5', [{ op: 'plant', c: 'lua', ids: F5.slice(0, 4) }, { op: 'plant', c: 'lua', ids: F5.slice(4) }]);
ok('gieo 9 ô (2 lệnh) → 18 ⭐ – tính theo ô, gộp lệnh không đổi giá', r.ok && r.spent === 18 && bal('HS5') === 76, r.spent);
const L5 = sheets.Ledger.d.slice(1).filter(l => l[1] === 'HS5');
ok('sổ điểm ghi "Thao tác ×9"', L5.length === 2 && /Thao tác ×9/.test(L5[1][6]), L5);
T += 30 * 1000;   // lúa 120 giây → còn 90 giây × 9 ô = 810 giây → 1 ⭐ / 5 phút → 3 ⭐
r = act('HS5', { op: 'speed', ids: F5 });
ok('tăng tốc: 1 ⭐ / 5 phút còn lại (gấp đôi), không cộng phí thao tác', r.ok && C.SPEED_MIN_PER_PT === 5 && r.spent === 3, r.spent);
r = act('HS5', { op: 'move', id: ids(r.state, 'nhago')[0], x: free(r.state, 'nhago')[0], y: free(r.state, 'nhago')[1] });
ok('di chuyển công trình miễn phí', r.ok && r.spent === 0, r);
r = act('HS5', { op: 'night', v: 0 });
ok('đổi ngày/đêm miễn phí', r.ok && r.spent === 0);
r = act('HS5', { op: 'sell', k: 'lua', n: 2 });
ok('bán ở chợ 1 lần = 2 ⭐', r.ok && r.spent === 2, r.spent);
addStudent('HS6', 5); g = call('cityGet', { code: 'HS6' });
r = act('HS6', { op: 'harvest', ids: ids(g.state, 'ruong') });
ok('thiếu điểm → not_enough_points, không thu được gì, giữ điểm', !r.ok && r.error === 'city_not_enough_points' && /thao tác/.test(r.message) && bal('HS6') === 5 && !r.state.inv.lua || (!r.ok && r.error === 'city_not_enough_points' && bal('HS6') === 5), r);
sandbox._cfg.cityActionPts = 0;
r = act('HS6', { op: 'harvest', ids: ids(g.state, 'ruong') });
ok('giáo viên đặt cityActionPts = 0 → miễn phí', r.ok && r.spent === 0 && bal('HS6') === 5, r);
sandbox._cfg.cityActionPts = 5;
r = act('HS5', { op: 'sell', k: 'lua', n: 1 });
ok('cityActionPts = 5 → 5 ⭐ mỗi thao tác', r.ok && r.spent === 5 && r.derived.actPts === 5, r.spent);
// collectAll không được nuốt lỗi thiếu điểm
const cst = C.migrate(JSON.parse(JSON.stringify(r.state))); cst.hp.quandoc = 1;
const fx = { t: 'xuongthucan', x: 0, y: 0, l: 1, q: [[0, 1]] }; cst.b['999'] = fx;
const cst0 = JSON.stringify(cst);
let thrown = null; try { C.applyOps(C.migrate(JSON.parse(cst0)), [{ op: 'collectAll' }], T, { act: 2, balance: 1 }); } catch (e) { thrown = e.apiCode; }
ok('Thu SP (Quản đốc) thiếu điểm → báo not_enough_points (không im lặng)', thrown === 'city_not_enough_points', thrown);
const R2 = C.applyOps(C.migrate(JSON.parse(cst0)), [{ op: 'collectAll' }], T, { act: 2, balance: 100 });
ok('Thu SP 1 nhà máy = 2 ⭐, trả fee riêng', R2.spend === 2 && R2.fee === 2, R2);
delete sandbox._cfg.cityActionPts;

console.log('\n' + pass + ' PASS, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);

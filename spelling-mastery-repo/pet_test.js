// Kiểm thử Pet.gs: nạp HÀM THẬT từ Code.gs (applyDelta_, findRow_, withLock_...) + Pet.gs, giả lập Sheet/Cache/Lock.
// Chạy: node pet_test.js
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
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
      setValues(v) { for (let i = 0; i < nr; i++) { while (s.d.length < r + i) s.d.push([]); for (let k = 0; k < nc; k++) s.d[r - 1 + i][c - 1 + k] = v[i][k]; } }, setNumberFormat() {} };
  }
  appendRow(row) { this.d.push(row); }
}
const sheets = {}, cache = new Map();
const sandbox = { console, Math, JSON, Date: FakeDate, Object, Array, String, Number, isFinite, parseInt, RegExp, Error,
  CacheService: { getScriptCache: () => ({ get: k => cache.has(k) ? cache.get(k) : null, put: (k, v) => cache.set(k, v) }) },
  LockService: (() => { let held = false; return { getScriptLock: () => ({ hasLock: () => held, waitLock() { held = true; }, releaseLock() { held = false; } }) }; })(),
  _cfg: { petEnabled: true, petDailyMin: 50, petDailySpendCap: 0 } };
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
vm.runInContext(fs.readFileSync(path.join(dir, 'Pet.gs'), 'utf8') + '\nconst PET_ACTIONS = {}; registerPetActions_(PET_ACTIONS);', sandbox);
const run = s => vm.runInContext(s, sandbox);
function call(action, params) {
  sandbox.__p = params; sandbox.__a = action;
  try { return run(`(function(){ const s = requireStudent_(__p.code); if(!cfgBool_('petEnabled',true)) throw apiError_('pet_disabled','x'); return okWrap_(PET_ACTIONS[__a](__p, s)); })()`); }
  catch (e) { if (e.apiCode) return { ok: false, error: e.apiCode, message: e.message }; throw e; }
}
let rid = 0; const R = () => 'req-' + String(++rid).padStart(8, '0');
const act = (c, ops, r) => call('petAct', { code: c, ops: Array.isArray(ops) ? ops : [ops], requestId: r || R() });
const bal = c => run(`getStudent_('${c}')`).balance;
const addStudent = (c, b) => sandbox.__sh('Students').d.push([c, '', '', true, b, b, '']);
const H = 3600000, D = 24 * H;
let pass = 0, fail = 0;
function ok(name, cond, info) { if (cond) { pass++; console.log('  PASS', name); } else { fail++; console.log('  FAIL', name, info !== undefined ? JSON.stringify(info).slice(0, 400) : ''); } }
const sc = n => console.log('\n# ' + n);

addStudent('HS1', 5000); addStudent('HS2', 20); addStudent('HS3', 100000);

sc('1. Khởi đầu & danh mục');
let g = call('petGet', { code: 'HS1' });
ok('petGet tạo hồ sơ trống', g.ok && g.state.pet === null && g.derived.min === 50 && g.balance === 5000, g);
const info = call('petInfo', { code: 'HS1' });
ok('petInfo đủ danh mục', info.species.length === 12 && info.foods.length >= 15 && info.acc.length >= 20 && info.rooms.length === 10 && info.games.length === 3, Object.keys(info));
ok('petInfo cache theo catVer', call('petInfo', { code: 'HS1', catVer: info.catVer }).same === true);
ok('petInfo < 30KB', JSON.stringify(info).length < 30000, JSON.stringify(info).length);
const PR = {}; ['species', 'foods', 'care', 'toys', 'acc', 'colors', 'rooms', 'furn', 'tricks', 'games'].forEach(k => info[k].forEach(x => { PR[k + ':' + x.id] = x; }));
const $ = (k, id) => PR[k + ':' + id].p;
ok('giá gấp đôi: đồ thường ×2, đồ cấp cao đắt hơn nữa', $('foods', 'tao') === 8 && $('acc', 'no') === 80 && $('acc', 'canhTien') > 4000 * 2 && $('species', 'phuong') > 3000 * 2 && PR['foods:tao'].b === 4, [$('foods', 'tao'), $('acc', 'canhTien'), $('species', 'phuong')]);
ok('đồ chơi & kỹ năng có giá mỗi lần chơi/diễn, không còn hồi chiêu', info.toys.every(t => t.pp > 0 && t.cd == null) && info.tricks.every(t => t.sp > 0), info.toys[0]);
ok('vé mini game 10 điểm, đổi tên 20', $('games', 'hung') === 10 && info.rules.rename === 20);

sc('2. Nhận nuôi');
let r = act('HS1', { op: 'feed', id: 'tao' });
ok('chưa có thú → no_pet', !r.ok && r.error === 'pet_no_pet', r);
r = act('HS1', { op: 'adopt', sp: 'khunglong' });
ok('loài lạ → bad_request', !r.ok && r.error === 'pet_bad_request');
r = act('HS2', { op: 'adopt', sp: 'kylan' });
ok('thiếu điểm → not_enough_points, giữ điểm', !r.ok && r.error === 'pet_not_enough_points' && bal('HS2') === 20, r);
r = act('HS1', { op: 'adopt', sp: 'meo', name: '  Mi<b>u  ' });
ok('nhận nuôi mèo -50 điểm', r.ok && bal('HS1') === 4950 && r.state.pet.sp === 'meo' && r.state.pet.nm === 'Mibu', r.state && r.state.pet);
ok('ngày nhận nuôi là ân hạn', r.derived.grace === true && r.derived.lv === 1 && r.derived.fedToday === 0, r.derived);
r = act('HS1', { op: 'adopt', sp: 'cun' });
ok('đang nuôi → has_pet', !r.ok && r.error === 'pet_has_pet');
const led = sandbox.__sh('Ledger').d.slice(1);
ok('ledger ghi reason pet', led.length === 1 && led[0][3] === 'pet' && led[0][2] === -50, led);

sc('3. Cho ăn & khẩu phần ngày');
r = act('HS1', [{ op: 'feed', id: 'ca' }, { op: 'feed', id: 'pizza' }]);
ok('cho ăn 14+30 = 44 điểm, tính khẩu phần', r.ok && r.derived.fedToday === 44 && !r.derived.safe && bal('HS1') === 4950 - 44, r.derived);
ok('XP tăng', r.state.pet.xp > 0 && r.results[0].xp > 0, r.results);
r = act('HS1', { op: 'feed', id: 'pizza' });
ok('no căng (h ≥ 100) → full', !r.ok && r.error === 'pet_full' && bal('HS1') === 4906, r.state && r.state.pet.h);
r = act('HS1', { op: 'care', id: 'tam' });
ok('tắm 8 điểm → đủ 52/50, an toàn', r.ok && r.derived.fedToday === 52 && r.derived.safe && r.derived.streakNow === 1, r.derived);
r = act('HS1', { op: 'feed', id: 'sushi' });
ok('món cần cấp → locked', !r.ok && r.error === 'pet_locked', r);
r = act('HS1', { op: 'care', id: 'thuoc' });
ok('khoẻ thì không uống thuốc', !r.ok && r.error === 'pet_not_sick');
r = act('HS1', { op: 'buy', kind: 'acc', id: 'no' });
ok('mua phụ kiện KHÔNG tính khẩu phần, tự đeo', r.ok && r.derived.fedToday === 52 && r.state.eq.hat === 'no' && r.state.own.a.includes('no'), r.derived);

sc('4. Qua ngày: đủ khẩu phần → chuỗi; thiếu → chết');
T += D;                                          // ngày 2
g = call('petGet', { code: 'HS1' });
ok('qua ngày đủ → chuỗi 1, còn sống', g.ok && !g.state.pet.dead && g.derived.streak === 1 && g.derived.grace === false, g.derived);
ok('chỉ số giảm theo thời gian', g.state.pet.h < 100 && g.state.pet.j < 100, g.state.pet);
r = act('HS1', { op: 'feed', id: 'tao' });   // chỉ 8 điểm ngày 2
ok('ngày 2 cho ăn 8 điểm', r.ok && r.derived.fedToday === 8, r.derived);
T += D;                                          // ngày 3: ngày 2 thiếu → chết
g = call('petGet', { code: 'HS1' });
ok('petGet thấy thú đã mất (chưa lưu)', g.ok && g.state.pet.dead > 0 && g.derived.mood === 'dead' && g.derived.dead.fed === 8 && g.derived.dead.canRevive, g.derived);
r = act('HS1', { op: 'feed', id: 'tao' });
ok('thú mất → không cho ăn được (dead)', !r.ok && r.error === 'pet_dead', r);
r = act('HS1', { op: 'buy', kind: 'room', id: 'vuon' });
ok('lần ghi đầu tiên sau khi chết: died=true, chuỗi 0', r.ok && r.died === true && r.state.sr === 0 && r.state.s.die === 1, { died: r.died, sr: r.state && r.state.sr });

sc('5. Hồi sinh');
const before = bal('HS1'), cost = r.derived.dead.reviveCost;
r = act('HS1', { op: 'revive' });
ok('hồi sinh trừ ' + cost + ' điểm, ngày ân hạn mới', r.ok && bal('HS1') === before - cost && !r.state.pet.dead && r.derived.grace, r.derived);
T += D;                                          // ngày hồi sinh là ân hạn → không chết dù 0 điểm
g = call('petGet', { code: 'HS1' });
ok('ngày hồi sinh không bị chết', !g.state.pet.dead, g.state.pet);
T += D;
g = call('petGet', { code: 'HS1' });
ok('ngày sau đó 0 điểm → chết', g.state.pet.dead > 0, g.state.pet);
T += 8 * D;
r = act('HS1', { op: 'revive' });
ok('quá 7 ngày → too_late', !r.ok && r.error === 'pet_too_late', r);
r = act('HS1', { op: 'release' });
ok('tiễn vào album', r.ok && r.state.pet === null && r.state.al.length === 1 && r.state.al[0].nm === 'Mibu', r.state && r.state.al);

sc('6. Nuôi tiếp, chuỗi dài, đồ chơi, kỹ năng, game');
r = act('HS3', [{ op: 'adopt', sp: 'rong', name: 'Lửa' }, { op: 'feed', id: 'pizza' }, { op: 'feed', id: 'banhquy' }, { op: 'care', id: 'tam' }, { op: 'care', id: 'chai' }]);
ok('lô nhiều thao tác', r.ok && r.derived.fedToday === 30 + 6 + 8 + 12 && bal('HS3') === 100000 - $('species', 'rong') - 56, [r.derived && r.derived.fedToday, bal('HS3')]);
for (let i = 0; i < 5; i++) { T += D; r = act('HS3', [{ op: 'feed', id: 'pizza' }, { op: 'feed', id: 'com' }, { op: 'care', id: 'tam' }, { op: 'care', id: 'ngu' }]); }
ok('5 ngày đủ → chuỗi 5 (+ hôm nay = 6)', r.ok && r.derived.streak === 5 && r.derived.streakNow === 6 && r.state.sb === 5, r.derived);
r = act('HS3', { op: 'play', id: 'bong' });
ok('chưa mua đồ chơi → not_owned', !r.ok && r.error === 'pet_not_owned');
let bx = bal('HS3');
r = act('HS3', [{ op: 'buy', kind: 'toy', id: 'bong' }, { op: 'play', id: 'bong' }]);
ok('mua + chơi ngay (trả giá mua + giá 1 lần chơi)', r.ok && r.state.s.pl === 1 && bal('HS3') === bx - $('toys', 'bong') - PR['toys:bong'].pp, [bx, bal('HS3')]);
bx = bal('HS3'); const fd0 = r.derived.fedToday;
r = act('HS3', { op: 'play', id: 'bong' });
ok('chơi lại ngay không phải chờ, tốn điểm, tính vào phần chăm', r.ok && r.state.s.pl === 2 && bal('HS3') === bx - PR['toys:bong'].pp && r.derived.fedToday === fd0 + PR['toys:bong'].pp, r.message || r.derived);
// đẩy cấp lên để học kỹ năng
r = act('HS3', [{ op: 'buy', kind: 'col', id: 'phale' }]);
ok('màu cần cấp 22 → locked', !r.ok && r.error === 'pet_locked', [r.error, r.derived && r.derived.lv]);
for (let i = 0; i < 12; i++) act('HS3', [{ op: 'buy', kind: 'acc', id: ['no', 'muTiec', 'hoa', 'muLen', 'kinhTron', 'kinhRam', 'noCo', 'chuong', 'khan', 'balo', 'muCao', 'muCaoBoi'][i] }]);
g = call('petGet', { code: 'HS3' });
ok('mua đồ cho XP → lên cấp', g.derived.lv >= 8, g.derived.lv);
r = act('HS3', [{ op: 'learn', id: 'nhay' }, { op: 'trick', id: 'nhay' }]);
ok('học + diễn', r.ok && r.state.pet.k.includes('nhay') && r.state.s.tk === 1, r.message);
bx = bal('HS3');
r = act('HS3', { op: 'trick', id: 'nhay' });
ok('diễn lại ngay không phải chờ, tốn điểm', r.ok && r.state.s.tk === 2 && bal('HS3') === bx - PR['tricks:nhay'].sp, r.message);
r = act('HS3', { op: 'trick', id: 'bay' });
ok('kỹ năng chưa học', !r.ok && r.error === 'pet_not_learned');
const b0 = bal('HS3');
r = act('HS3', { op: 'gameStart', g: 'hung' });
ok('vé mini game 10 điểm', r.ok && bal('HS3') === b0 - 10 && r.state.gm && r.state.gm.g === 'hung', r.message);
T += 30000;
r = act('HS3', { op: 'gameEnd', g: 'hung', score: 99999 });
ok('kết thúc: điểm kẹp smax, XP ≤ xmax, không cộng điểm', r.ok && r.results[0].score === 600 && r.results[0].xp <= 150 * 2 && bal('HS3') === b0 - 10 && !r.state.gm, r.results);
r = act('HS3', { op: 'gameEnd', g: 'hung', score: 5 });
ok('không có ván → no_game', !r.ok && r.error === 'pet_no_game');
act('HS3', { op: 'gameStart', g: 'nho' }); T += 1000;
r = act('HS3', { op: 'gameEnd', g: 'nho', score: 100 });
ok('kết thúc quá nhanh → XP ≤ 10×hệ số', r.ok && r.results[0].xp <= 20, r.results);

sc('7. Trang bị, đổi tên, nhiệm vụ');
r = act('HS3', { op: 'equip', slot: 'hat', id: 'vuongMien' });
ok('chưa có → not_owned', !r.ok && r.error === 'pet_not_owned');
r = act('HS3', { op: 'equip', slot: 'eyes', id: 'no' });
ok('sai vị trí → bad_request', !r.ok && r.error === 'pet_bad_request');
r = act('HS3', { op: 'equip', slot: 'hat', id: '' });
ok('tháo mũ', r.ok && r.state.eq.hat === '');
r = act('HS3', { op: 'rename', name: 'Lửa Nhỏ' });
ok('đổi tên 20 điểm', r.ok && r.state.pet.nm === 'Lửa Nhỏ');
ok('có 3 nhiệm vụ', r.derived.quests.length === 3, r.derived.quests);
const q = r.derived.quests.find(x => !x.done);
if (q) { r = act('HS3', { op: 'claim', id: q.id }); ok('nhiệm vụ chưa xong → not_done', !r.ok && r.error === 'pet_not_done', r); }
r = act('HS3', { op: 'claim', id: 'abc' });
ok('id nhiệm vụ rác', !r.ok && r.error === 'pet_bad_request');

sc('8. Idempotent & nguyên tử');
const b1 = bal('HS3'), id = R();
const r1 = act('HS3', { op: 'care', id: 'vitamin' }, id), r2 = act('HS3', { op: 'care', id: 'vitamin' }, id);
ok('gửi lại cùng requestId không trừ 2 lần', r1.ok && r2.ok && r2.replay && bal('HS3') === b1 - 20, [b1, bal('HS3')]);
const b2 = bal('HS3');
r = act('HS3', [{ op: 'care', id: 'vitamin' }, { op: 'feed', id: 'xxx' }]);
ok('lỗi ở op #2 → không áp dụng gì', !r.ok && r.opIndex === 1 && bal('HS3') === b2, r);
r = act('HS3', Array(21).fill({ op: 'pat', n: 1 }));
ok('quá 20 op', !r.ok && r.error === 'pet_too_many_ops');
r = act('HS3', { op: 'hack' });
ok('op lạ', !r.ok && r.error === 'pet_unknown_op');
r = call('petAct', { code: 'HS3', ops: [{ op: 'pat' }], requestId: 'x' });
ok('requestId xấu', !r.ok && r.error === 'pet_bad_request');

sc('9. Giới hạn chi ngày + cấu hình');
sandbox._cfg.petDailySpendCap = 50; T += D;
r = act('HS3', [{ op: 'feed', id: 'pizza' }, { op: 'feed', id: 'com' }]);
ok('trong trần 50', r.ok, r.message);
r = act('HS3', { op: 'buy', kind: 'room', id: 'bien' });
ok('vượt trần → daily_cap', !r.ok && r.error === 'pet_daily_cap', r);
sandbox._cfg.petDailySpendCap = 0;
sandbox._cfg.petDailyMin = 60; T += D;
g = call('petGet', { code: 'HS3' });
ok('khẩu phần theo cấu hình 60 (ngày trước 50 → chết)', g.derived.min === 60 && g.state.pet.dead > 0, g.derived);
sandbox._cfg.petDailyMin = 50;
sandbox._cfg.petEnabled = false;
r = call('petGet', { code: 'HS3' });
ok('tắt game → pet_disabled', !r.ok && r.error === 'pet_disabled');
sandbox._cfg.petEnabled = true;

sc('10. Ốm & thành tích & bảng xếp hạng');
addStudent('HS4', 5000);
act('HS4', { op: 'adopt', sp: 'tho' });
T += 30 * H;     // > 25 giờ không ăn → ốm (ngày nhận nuôi ân hạn; sang ngày 2 vẫn sống)
g = call('petGet', { code: 'HS4' });
ok('đói lâu → ốm', g.state.pet.sick === 1 && g.derived.mood === 'sick' && !g.state.pet.dead, g.state.pet);
r = act('HS4', { op: 'play', id: 'bong' });
r = act('HS4', [{ op: 'care', id: 'thuoc' }, { op: 'feed', id: 'com' }]);
ok('uống thuốc khỏi ốm, thuốc tính khẩu phần', r.ok && r.state.pet.sick === 0 && r.derived.fedToday === 50 && r.derived.safe, r.derived);
const b = call('petBoard', { code: 'HS4' });
ok('bảng xếp hạng', b.ok && b.board.length >= 2 && b.me && b.board[0].alive, b);
ok('thành tích có danh sách', r.derived.ach.length === 8);

console.log('\n' + pass + ' PASS, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);

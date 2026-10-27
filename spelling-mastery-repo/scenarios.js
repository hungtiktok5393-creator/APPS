const H = require('./harness.js'); const { call, act, bal, ledger, ok, adv, addStudent, sandbox, run, sheets } = H;
addStudent('HS001', 1000); addStudent('HS002', 5);
function edit(code, fn) { sandbox.__c = code; const L = run(`gdLoad_(__sh('Garden'), __c)`); fn(L.st); sandbox.__L = L; run(`gdSave_(__sh('Garden'), __L, __L.st, __L.v, Date.now(), __L.lastReqId, __L.lastResp)`); }
const sc = n => console.log('\n# ' + n);

sc('1. Vườn khởi đầu');
let g = call('gardenGet', { code: 'HS001' });
ok('tạo vườn mới', g.ok && g.state.xu === 60 && Object.keys(g.state.f).length === 6 && g.state.ch.length === 1, g);
ok('có serverTime/v/balance', g.serverTime > 0 && g.v === 1 && g.balance === 1000);
let info = call('gardenInfo', { code: 'HS001' });
ok('info: ≥20 cây, ≥150 trang trí', info.crops.length >= 20 && info.decos.length >= 150, [info.crops.length, info.decos.length]);
ok('info cache catVer', call('gardenInfo', { code: 'HS001', catVer: info.catVer }).same === true);
const sz = JSON.stringify(info).length; ok('info < 100KB (' + sz + ')', sz < 100000);

sc('2. Trồng → chờ → thu hoạch');
let r = act('HS001', [{ op: 'plant', k: 'caixanh', cells: [[2, 2], [3, 2]] }]);
ok('trồng 2 cải', r.ok && r.state.xu === 60 - 8, r.message);
r = act('HS001', [{ op: 'harvest', x: 2, y: 2 }]);
ok('thu hoạch sớm bị từ chối not_ready', !r.ok && r.error === 'garden_not_ready' && r.opIndex === 0, r);
adv(61000);
r = act('HS001', [{ op: 'harvestAll' }]);
ok('chờ 61s rồi harvestAll', r.ok && r.results[0].n === 2 && r.state.xu === 52 + 14 && r.state.xp > 0, r.results);

sc('3. Thiếu Xu / thiếu điểm / không hợp lệ');
r = act('HS001', [{ op: 'plant', k: 'ot', x: 2, y: 3 }]);
ok('chưa đủ cấp vườn → locked', !r.ok && r.error === 'garden_locked', r.message);
g = call('gardenGet', { code: 'HS001' });
r = act('HS002', [{ op: 'buyPlot', cx: 1, cy: 0 }]);
ok('thiếu điểm → not_enough_points, điểm giữ nguyên', !r.ok && r.error === 'garden_not_enough_points' && bal('HS002') === 5, r.message);
r = act('HS001', [{ op: 'xoa_het' }]);
ok('op lạ → unknown_op kèm chỉ số', !r.ok && r.error === 'garden_unknown_op' && r.opIndex === 0, r);
r = act('HS001', Array(41).fill({ op: 'harvestAll' }));
ok('41 ops → too_many_ops', !r.ok && r.error === 'garden_too_many_ops', r);
r = call('gardenAct', { code: 'HS001', ops: [{ op: 'harvestAll' }], requestId: 'x' });
ok('requestId xấu', !r.ok && r.error === 'garden_bad_request');
r = act('HS001', [{ op: 'plant', k: 'caixanh', x: 'abc', y: 1e12 }]);
ok('toạ độ rác', !r.ok && r.error === 'garden_bad_request');
r = act('HS001', [{ op: 'plant', k: 'caixanh', x: 100, y: 100 }]);
ok('ô ngoài đất → bad_cell', !r.ok && r.error === 'garden_bad_cell');

sc('4. Atomic toàn lô');
const xu0 = call('gardenGet', { code: 'HS001' }).state.xu, b0 = bal('HS001');
r = act('HS001', [{ op: 'plant', k: 'caixanh', x: 4, y: 2 }, { op: 'buyPlot', cx: 1, cy: 0 }, { op: 'harvest', x: 2, y: 2 }]);
ok('op #3 sai → không áp dụng op #1,#2', !r.ok && r.opIndex === 2 && r.applied === false, r.message);
const g2 = call('gardenGet', { code: 'HS001' });
ok('Xu & điểm & đất không đổi', g2.state.xu === xu0 && bal('HS001') === b0 && g2.state.ch.length === 1 && g2.state.f['4,2'] === 0, [g2.state.xu, xu0]);
ok('phản hồi lỗi chứa state gốc', r.state.xu === xu0 && r.state.f['4,2'] === 0);

sc('5. Idempotent requestId');
const rq = 'dup-request-0001';
let a1 = call('gardenAct', { code: 'HS001', requestId: rq, ops: [{ op: 'buyPlot', cx: 1, cy: 0 }] });
const bAfter = bal('HS001');
let a2 = call('gardenAct', { code: 'HS001', requestId: rq, ops: [{ op: 'buyPlot', cx: 1, cy: 0 }] });
ok('lần 1 mua mảnh 40 điểm', a1.ok && a1.spent === 40 && bAfter === b0 - 40, a1.message);
ok('lần 2 trùng → replay, không trừ thêm', a2.ok && a2.replay === true && bal('HS001') === bAfter && a2.state.ch.length === 2, a2);
H.cache.clear();
let a3 = call('gardenAct', { code: 'HS001', requestId: rq, ops: [{ op: 'buyPlot', cx: 1, cy: 0 }] });
ok('mất cache vẫn replay nhờ lastReqId trong sheet', a3.ok && a3.replay && bal('HS001') === bAfter);
ok('Ledger ghi reason garden, -40', ledger().some(l => l[3] === 'garden' && l[2] === -40 && /buyPlot/.test(l[6])), ledger());

sc('6. Mở rộng, xây, nâng cấp, tăng tốc, trang trí');
r = act('HS001', [{ op: 'buyPlot', cx: 5, cy: 5 }]);
ok('mảnh không liền kề bị từ chối', !r.ok && r.error === 'garden_bad_cell');
r = act('HS001', [{ op: 'buyPlot', cx: -1, cy: 0 }, { op: 'buyPlot', cx: -1, cy: 1 }]);
ok('mua 2 mảnh: 52 + 68 điểm', r.ok && r.spent === 52 + 68, [r.spent, r.message]);
r = act('HS001', [{ op: 'build', id: 'gieng', x: 0, y: 0 }]);
ok('xây Giếng 30 điểm', r.ok && r.spent === 30 && r.state.b.gieng.l === 1, r.message);
r = act('HS001', [{ op: 'build', id: 'gieng', x: 1, y: 1 }]);
ok('xây lần 2 → already', !r.ok && r.error === 'garden_already');
r = act('HS001', [{ op: 'build', id: 'lobanh', x: 1, y: 1 }]);
ok('công trình chưa đủ cấp → locked', !r.ok && r.error === 'garden_locked');
r = act('HS001', [{ op: 'plant', k: 'caixanh', x: 2, y: 2 }]);
const ready = r.results[0].readyAt - H.getT();
ok('Giếng rút ngắn thời gian (<60s)', ready < 60000 && ready >= 55000, ready);
r = act('HS001', [{ op: 'boost', x: 2, y: 2 }]);
ok('tăng tốc bằng điểm (1 điểm)', r.ok && r.spent === 1, r.message);
r = act('HS001', [{ op: 'harvest', x: 2, y: 2 }]);
ok('thu hoạch ngay sau tăng tốc', r.ok && r.results[0].xu >= 7);
r = act('HS001', [{ op: 'upgrade', what: 'perm', id: 'yld' }, { op: 'upgrade', what: 'perm', id: 'yld' }]);
ok('nâng cấp vĩnh viễn 30 + 39 điểm', r.ok && r.spent === 30 + 39 && r.state.up.yld === 2, [r.spent, r.message]);
r = act('HS001', [{ op: 'upgrade', what: 'bld', id: 'gieng' }]);
ok('nâng cấp Giếng bằng Xu (150) thiếu Xu → từ chối', !r.ok && r.error === 'garden_not_enough_xu', r.message);
r = act('HS001', [{ op: 'decorate', act: 'place', id: 'hoa1', x: 1, y: 0 }, { op: 'decorate', act: 'place', id: 'hoa2', x: 1, y: 1 }, { op: 'decorate', act: 'move', x: 1, y: 1, nx: 1, ny: 2 }]);
ok('đặt+di chuyển trang trí, trả điểm thẩm mỹ', r.ok && r.derived.aes > 0 && r.state.d['1,2'] === 'hoa2', r.message);
const spendHoa = r.spent;
r = act('HS001', [{ op: 'decorate', act: 'remove', x: 1, y: 0 }]);
ok('gỡ trang trí vào kho (không hoàn điểm)', r.ok && r.state.iv.hoa1 === 1 && r.spent === 0);
r = act('HS001', [{ op: 'decorate', act: 'place', id: 'hoa1', x: 1, y: 0 }]);
ok('đặt lại từ kho miễn phí', r.ok && r.spent === 0);
r = act('HS001', [{ op: 'decorate', act: 'place', id: 'hoa1~1', x: 0, y: 1 }]);
ok('bậc 1 chưa mở → locked', !r.ok && r.error === 'garden_locked', r.message);
r = act('HS001', [{ op: 'till', x: 0, y: 2 }]);
ok('cuốc đất bằng Xu', r.ok || r.error === 'garden_not_enough_xu', r.message);

sc('7. Nhiệm vụ, quà ngày, chuỗi');
g = call('gardenGet', { code: 'HS001' });
ok('có 3 nhiệm vụ', g.derived.quests.length === 3);
r = act('HS001', [{ op: 'claimQuest', id: 'q0' }]);
ok('nhiệm vụ chưa xong → not_done', !r.ok && r.error === 'garden_not_done', r.message);
const b1 = bal('HS001');
r = act('HS001', [{ op: 'claimDaily' }]);
ok('quà ngày: Xu, KHÔNG điểm', r.ok && r.results[0].xu > 0 && bal('HS001') === b1 && r.state.dl.s === 1, r.message);
r = act('HS001', [{ op: 'claimDaily' }]);
ok('nhận 2 lần/ngày → already', !r.ok && r.error === 'garden_already');
adv(86400000);
r = act('HS001', [{ op: 'claimDaily' }]);
ok('hôm sau: chuỗi 2', r.ok && r.results[0].streak === 2);
adv(3 * 86400000);
r = act('HS001', [{ op: 'claimDaily' }]);
ok('bỏ ngày: chuỗi về 1', r.ok && r.results[0].streak === 1);
g = call('gardenGet', { code: 'HS001' });
ok('nhiệm vụ mới sinh theo ngày', g.derived.quests.length === 3);

sc('8. Làm nhiệm vụ & thành tựu');
for (let i = 0; i < 6; i++) { act('HS001', [{ op: 'plant', k: 'caixanh', cells: [[2, 2], [3, 2], [4, 2], [2, 3], [3, 3], [4, 3]] }]); adv(61000); act('HS001', [{ op: 'harvestAll' }]); }
g = call('gardenGet', { code: 'HS001' });
ok('thu hoạch đã cộng thống kê', g.state.s.hv >= 36, g.state.s);
ok('thành tựu hv tự trao (bậc ≥1)', g.state.ac.hv >= 1 && g.derived.lv >= 2, [g.state.ac, g.derived.lv]);
const q = g.derived.quests.find(x => x.done && !x.claimed);
if (q) { r = act('HS001', [{ op: 'claimQuest', id: q.id }]); ok('nhận thưởng nhiệm vụ xong', r.ok, r.message); r = act('HS001', [{ op: 'claimQuest', id: q.id }]); ok('nhận lại → already', !r.ok && r.error === 'garden_already'); }
else ok('(không có nhiệm vụ hoàn thành hôm nay – bỏ qua)', true);

sc('9. Sản vật công trình (offline ≤ 24h)');
H.setT(H.getT()); sandbox.__x = 0;
run(`(function(){})()`);
// cấp vườn đủ để xây Chuồng gà: nâng xp trực tiếp qua sheet
const sh = sheets['Garden']; let row = sh.d[1]; let st = JSON.parse(row[1]); st.xp = 400; st.xu = 500; row[1] = JSON.stringify(st);
r = act('HS001', [{ op: 'build', id: 'chuongga', x: 0, y: 1 }]);
ok('xây Chuồng gà (50 điểm)', r.ok && r.spent === 50, r.message);
adv(3600000);
r = act('HS001', [{ op: 'collect', id: 'chuongga' }]);
ok('thu sản vật sau 1 giờ ≈ 30 Xu', r.ok && r.results[0].xu >= 30 && r.results[0].xu <= 40, r.results && r.results[0]);
adv(100 * 3600000);
r = act('HS001', [{ op: 'collect', all: true }]);
ok('offline 100 giờ chỉ tính 24 giờ (≈720)', r.ok && r.results[0].xu >= 720 && r.results[0].xu <= 900, r.results[0]);
r = act('HS001', [{ op: 'collect', id: 'chuongga' }]);
ok('thu liền lại → nothing', !r.ok && r.error === 'garden_nothing');

sc('10. Giới hạn chi tiêu ngày');
sandbox._cfg.gardenDailySpendCap = 100; run('_cfg_reset=1'); 
// cache cấu hình của Code.gs không dùng trong harness (đọc thẳng _cfg)
const spentSoFar = call('gardenGet', { code: 'HS001' }).derived.spend.today;
r = act('HS001', [{ op: 'upgrade', what: 'perm', id: 'spd' }, { op: 'upgrade', what: 'perm', id: 'spd' }, { op: 'upgrade', what: 'perm', id: 'xp' }, { op: 'upgrade', what: 'perm', id: 'xp' }, { op: 'upgrade', what: 'perm', id: 'xp' }, { op: 'upgrade', what: 'perm', id: 'xp' }]);
ok('vượt trần ngày → daily_cap, không trừ gì', !r.ok && r.error === 'garden_daily_cap' && bal('HS001') === call('gardenGet', { code: 'HS001' }).balance, r.message);
sandbox._cfg.gardenDailySpendCap = 0;

sc('11. gardenCostPct');
sandbox._cfg.gardenCostPct = 200; const bb = bal('HS001');
r = act('HS001', [{ op: 'upgrade', what: 'perm', id: 'dly' }]);
ok('giá ×2 (15→30)', r.ok && r.spent === 30 && bb - bal('HS001') === 30, r.spent);
sandbox._cfg.gardenCostPct = 100;

sc('12. Tắt Khu vườn');
sandbox._cfg.gardenEnabled = false;
r = call('gardenGet', { code: 'HS001' });
ok('garden_disabled', !r.ok && r.error === 'garden_disabled' && r.message === 'Khu vườn đang tắt.', r);
sandbox._cfg.gardenEnabled = true;

sc('13. Prestige');
r = act('HS001', [{ op: 'prestige', confirm: true }]);
ok('chưa đủ điều kiện → locked', !r.ok && r.error === 'garden_locked', r.message);
sh.d[1][1] = (function () { const s = JSON.parse(sh.d[1][1]); s.xp = 1e6; s.xs = 150000; return JSON.stringify(s); })();
r = act('HS001', [{ op: 'prestige' }]);
ok('thiếu confirm → bad_request', !r.ok && r.error === 'garden_bad_request');
const decoBefore = Object.keys(call('gardenGet', { code: 'HS001' }).state.d).length;
const pb = bal('HS001');
r = act('HS001', [{ op: 'prestige', confirm: true }]);
ok('Sang mùa mới: +Tinh hoa, reset đất/công trình', r.ok && r.state.sn === 1 && r.state.es === 10 && r.state.ch.length === 1 && Object.keys(r.state.b).length === 0 && r.state.xu >= 100, r.message || [r.state.sn, r.state.es]);
ok('giữ nâng cấp vĩnh viễn & trang trí (kho)', r.state.up.yld === 2 && Object.values(r.state.iv).reduce((a, b) => a + b, 0) === decoBefore, r.state.iv);
ok('điểm không đổi khi prestige', bal('HS001') === pb);
ok('hệ số 1.30 & bậc trang trí mở thêm', Math.abs(r.derived.mult - 1.3) < 1e-9 && r.derived.maxTier >= 1, [r.derived.mult, r.derived.maxTier]);
r = act('HS001', [{ op: 'decorate', act: 'place', id: 'hoa1~1', x: 1, y: 1 }]);
ok('mua trang trí bậc 1 sau prestige', r.ok && r.spent === Math.round(8 * 2.6), [r.spent, r.message]);
ok('tên bậc ghép', require('./harness.js').run(`gdDecoGet_('hoa1~11').n`) === 'Hoa cúc Đồng Cổ điển', run(`gdDecoGet_('hoa1~11').n`));

sc('14. State lớn → nén gzip & ô ≤ 50.000');
addStudent('BIG01', 1e12);
call('gardenGet', { code: 'BIG01' });
{ const bs = sheets['Garden'].d.find(x => x[0] === 'BIG01'); const s = JSON.parse(bs[1]);
  for (let cx = -3; cx <= 3; cx++) for (let cy = -3; cy <= 3; cy++) s.ch.push(cx + ',' + cy);
  s.ch = [...new Set(s.ch)];
  for (let x = -24; x < 24; x++) for (let y = -24; y < 24; y++) { const k = x + ',' + y; if (k === '0,0') continue; if ((x + y) % 3) s.f[k] = [1, 1e13]; else s.d[k] = 'hoa' + (1 + ((x * y + 100) % 13)) + '~' + (1 + ((x + 30) % 9)); }
  bs[1] = JSON.stringify(s); }
r = act('BIG01', [{ op: 'harvestAll' }]);
const brow = sheets['Garden'].d.find(x => x[0] === 'BIG01');
ok('lưu nén (Z:) và ô < 50.000', r.ok && /^Z:/.test(brow[1]) && brow[1].length <= 45002, [r.message, brow[1].slice(0, 10), brow[1].length]);
const g3 = call('gardenGet', { code: 'BIG01' });
ok('đọc lại giải nén đúng', g3.ok && Object.keys(g3.state.d).length > 500, g3.message);
ok('derived ready/aes', g3.derived.aes > 0);

sc('15. Bảng xếp hạng');
r = call('gardenBoard', { code: 'HS001' });
ok('board che mã & có me', r.ok && r.board.length >= 2 && /\*\*$/.test(r.board[0].who) && r.me && r.me.rank >= 1, r);

sc('16. Số lớn');
edit('BIG01', s => { s.xu = 8.99e15; s.up.yld = 5000; });
r = act('BIG01', [{ op: 'claimDaily' }, { op: 'claimDaily' }]);
r = act('BIG01', [{ op: 'upgrade', what: 'perm', id: 'xp' }]);
ok('chi điểm lớn không NaN', r.ok && isFinite(r.balance) && isFinite(r.derived.perms.xp.cost), r.message);
ok('xu ≤ 9e15', call('gardenGet', { code: 'BIG01' }).state.xu <= 9e15);
r = act('HS001', [{ op: 'plant', k: 'caixanh', x: { a: { b: { c: { d: { e: { f: { g: 1 } } } } } } }, y: 1 }]);
ok('JSON lồng sâu bị chặn', !r.ok && r.error === 'garden_bad_request');

console.log('\n=== KẾT QUẢ: ' + H.res().pass + ' pass, ' + H.res().fail + ' fail ===');
process.exit(H.res().fail ? 1 : 0);

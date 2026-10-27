// Mô phỏng kinh tế Khu vườn: 3 hồ sơ học sinh (1.000 / 10.000 / 50.000 điểm) mua theo chiến lược "hợp lý".
// Chạy:  node sim_economy.js   (cần harness.js cùng thư mục; harness đọc /mnt/user-data/outputs/Garden.gs và /mnt/user-data/uploads/Code.gs)
const H = require('./harness.js'); const { call, act, bal, addStudent, sandbox, run, sheets } = H;

addStudent('SIMX', 1); const INFO = call('gardenInfo', { code: 'SIMX' });
const WEIGHT = { wonder: 3, building: 2, ground: 1.5, plot: 1, perm: 1, deco: 0.8 };   // người chơi thích kỳ quan > công trình > nền đất
const MAX_PLOTS = 30, MAX_DECOS = 40;

function setLevel(code, lv) { const L = run(`gdLoad_(__sh('Garden'), '${code}')`); let xp = 0; for (let l = 1; l < lv; l++) xp += Math.round(60 * Math.pow(1.2, l - 1)); L.st.xp = xp; sandbox.__L = L; run(`gdSave_(__sh('Garden'), __L, __L.st, __L.v, Date.now(), __L.lastReqId, __L.lastResp)`); }
function occupied(st) {
  const o = {}; Object.keys(st.f).forEach(k => o[k] = 1); Object.keys(st.d).forEach(k => o[k] = 1);
  Object.keys(st.b).forEach(id => { const b = st.b[id], w = INFO.wonders.find(x => x.id === id); if (w) { for (let dx = 0; dx < w.w; dx++) for (let dy = 0; dy < w.h; dy++) o[(b.x + dx) + ',' + (b.y + dy)] = 1; } else o[b.x + ',' + b.y] = 1; });
  return o;
}
function findRect(st, w, h) {
  const occ = occupied(st), own = {}; st.ch.forEach(k => own[k] = 1);
  for (const ck of st.ch) { const [cx, cy] = ck.split(',').map(Number);
    for (let x = cx * 8; x < cx * 8 + 8; x++) for (let y = cy * 8; y < cy * 8 + 8; y++) {
      let ok = true;
      for (let dx = 0; dx < w && ok; dx++) for (let dy = 0; dy < h && ok; dy++) { const X = x + dx, Y = y + dy; if (!own[Math.floor(X / 8) + ',' + Math.floor(Y / 8)] || occ[X + ',' + Y]) ok = false; }
      if (ok) return [x, y]; } }
  return null;
}
function candidates(code, g) {
  const st = g.state, d = g.derived, c = [];
  if (st.ch.length < MAX_PLOTS && d.frontier.length) c.push({ cat: 'plot', name: 'mảnh đất #' + (st.ch.length + 1), cost: d.next.chunkCost, op: () => [{ op: 'buyPlot', cx: Number(d.frontier[0].split(',')[0]), cy: Number(d.frontier[0].split(',')[1]) }] });
  INFO.buildings.forEach(b => { if (!st.b[b.id] && d.lv >= b.lv) { const p = findRect(st, 1, 1); if (p) c.push({ cat: 'building', name: b.name, cost: b.p, op: () => [{ op: 'build', id: b.id, x: p[0], y: p[1] }] }); } });
  INFO.grounds.forEach(gr => { if (st.go.indexOf(gr.id) < 0) c.push({ cat: 'ground', name: 'Nền ' + gr.name, cost: d.gr.cost[gr.id], op: () => [{ op: 'ground', id: gr.id }] }); });
  INFO.wonders.forEach(w => { const wd = d.wd.find(x => x.id === w.id);
    if (wd.maxed || wd.locked) return;
    if (!wd.placed) { const p = findRect(st, w.w, w.h); if (p) c.push({ cat: 'wonder', name: w.name + ' gđ1', cost: wd.next, op: () => [{ op: 'build', id: w.id, x: p[0], y: p[1] }] }); }
    else c.push({ cat: 'wonder', name: w.name + ' gđ' + (wd.l + 1), cost: wd.next, op: () => [{ op: 'upgrade', what: 'wonder', id: w.id }] }); });
  INFO.perms.forEach(p => { const pp = d.perms[p.id]; if (!pp.maxed) c.push({ cat: 'perm', name: p.name + ' c' + (pp.l + 1), cost: pp.cost, op: () => [{ op: 'upgrade', what: 'perm', id: p.id }] }); });
  if (Object.keys(st.d).length + 0 < MAX_DECOS) INFO.decos.slice().sort((a, b) => a[4] - b[4]).forEach(dc => { if (!st._seen || !st._seen[dc[0]]) { const k = findRect(st, 1, 1); if (k) c.push({ cat: 'deco', name: dc[1], id: dc[0], cost: dc[4], op: () => [{ op: 'decorate', act: 'place', id: dc[0], x: k[0], y: k[1] }] }); } });
  return c;
}
function runProfile(label, points, gardenLv) {
  const code = 'SIM' + points; addStudent(code, points); call('gardenGet', { code }); setLevel(code, gardenLv);
  const bought = {}, items = []; let seenDecos = {}, stuck = 0;
  for (let it = 0; it < 2000; it++) {
    const g = call('gardenGet', { code }); g.state._seen = seenDecos;
    const b = bal(code), cs = candidates(code, g).filter(x => x.cost > 0 && x.cost <= b);
    if (!cs.length) break;
    cs.sort((a, b2) => (a.cost / WEIGHT[a.cat]) - (b2.cost / WEIGHT[b2.cat]));
    const pick = cs[0], r = act(code, pick.op());
    if (!r.ok) { if (pick.id) seenDecos[pick.id] = 1; if (++stuck > 50) break; continue; }
    if (pick.id) seenDecos[pick.id] = 1; stuck = 0;
    bought[pick.cat] = (bought[pick.cat] || 0) + 1; items.push(pick.name + ' (' + pick.cost + ')');
  }
  const g = call('gardenGet', { code }), d = g.derived, st = g.state;
  const remaining = candidates(code, g).filter(x => x.cat !== 'deco');
  const distinct = new Set(items.map(n => n.replace(/ (c|gđ)\d+ \(\d+\)$/, '').replace(/ \(\d+\)$/, '').replace(/^mảnh đất.*/, 'mảnh đất')));
  return { label, points, left: bal(code), spent: points - bal(code), bought, distinct: distinct.size, items, rep: d.rep, maxTier: d.maxTier, aes: d.aes, plots: st.ch.length, wonders: d.wd.filter(w => w.l > 0).map(w => w.id + ':' + w.l).join(' '), grounds: st.go.length, goalsLeft: remaining.length,
    nextWonder: (d.wd.find(w => !w.maxed) || {}).next, nextPlot: d.next.chunkCost, nextLocked: d.wd.filter(w => w.locked).length };
}
// tổng "hoàn thiện mùa 1" (gardenCostPct=100): mọi kỳ quan mọi giai đoạn + nâng cấp vĩnh viễn tới tối đa + mọi nền đất + công trình + 30 mảnh + 156 trang trí cơ bản
const sum = a => a.reduce((x, y) => x + y, 0);
const total = {
  wonders: sum(INFO.wonders.map(w => sum(w.cost))),
  perms: sum(INFO.perms.map(p => { let t = 0; for (let l = 0; l < p.lmax; l++) t += Math.round(p.base * Math.pow(p.rate, l)); return t; })),
  grounds: sum(INFO.grounds.map(g => g.p)), buildings: sum(INFO.buildings.map(b => b.p)),
  plots: (() => { let t = 0; for (let n = 1; n < MAX_PLOTS; n++) t += Math.round(40 * Math.pow(1.18, n - 1)); return t; })(), decos: sum(INFO.decos.map(d => d[4]))
};
total.all = sum(Object.values(total));
const out = [runProfile('1.000', 1000, 12), runProfile('10.000', 10000, 25), runProfile('50.000', 50000, 40)];
console.log('=== MÔ PHỎNG KINH TẾ KHU VƯỜN (gardenCostPct=100, không trần ngày) ===');
out.forEach(o => {
  console.log('\n--- ' + o.label + ' điểm (cấp vườn giả định: ' + (o.points === 1000 ? 12 : o.points === 10000 ? 25 : 40) + ') ---');
  console.log('Đã chi ' + o.spent + ', còn ' + o.left + ' | ' + o.distinct + ' loại khác nhau | số lần mua theo nhóm:', JSON.stringify(o.bought));
  console.log('Danh vọng ' + o.rep.lv + ' (' + o.rep.title + ') | mở bậc trang trí ' + o.maxTier + ' | thẩm mỹ ' + o.aes + ' | mảnh đất ' + o.plots + ' | nền đất ' + o.grounds);
  console.log('Kỳ quan: ' + (o.wonders || '(chưa có)') + ' | kỳ quan còn khoá: ' + o.nextLocked + ' | mục tiêu (không tính trang trí) còn mua được trong tương lai: ' + o.goalsLeft + ' | mảnh đất kế tiếp ' + o.nextPlot + ' điểm');
  if (process.argv[2] === '-v') console.log(o.items.join('; '));
});
console.log('\nTỔNG HOÀN THIỆN MÙA 1:', JSON.stringify(total));
const fails = [];
if (out[0].distinct < 6) fails.push('1.000 điểm mua <6 thứ khác nhau (' + out[0].distinct + ')');
if (out[0].goalsLeft < 5) fails.push('1.000 điểm cạn mục tiêu');
if (out[1].goalsLeft < 10) fails.push('10.000 điểm còn quá ít mục tiêu');
if (out[2].spent >= total.all || out[2].nextLocked === 0 && out[2].goalsLeft === 0) fails.push('50.000 điểm đã hoàn thiện');
if (total.all < 150000) fails.push('tổng hoàn thiện < 150.000');
if (out[0].maxTier < 2 || out[0].maxTier > 3) fails.push('1.000 điểm: mở bậc ngoài 2–3 (' + out[0].maxTier + ')');
if (out[1].maxTier < 8 || out[1].maxTier > 10) fails.push('10.000 điểm: mở bậc ngoài 8–10 (' + out[1].maxTier + ')');
const r100k = run('gdRep_({ s: { ps: 100000 } }).lv'); console.log('Danh vọng khi đã chi 100.000 điểm = ' + r100k + ' (mục tiêu ~25)');
if (r100k < 23 || r100k > 27) fails.push('100.000 điểm: Danh vọng ngoài 23–27');
console.log(fails.length ? '\nCHƯA ĐẠT: ' + fails.join(' | ') : '\nĐẠT MỌI MỤC TIÊU MÔ PHỎNG.');
process.exit(fails.length ? 1 : 0);

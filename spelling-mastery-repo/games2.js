/* Spelling Mastery – 5 trò mới: Xúc xắc (dice), Plinko, Thẻ cào (scratch), Keno mini, Tung xu (coin).
 * Dùng SMGameKit (xuất từ games.js): cùng ctx, requestId idempotent, khoá bấm đúp, thử lại an toàn.
 * Kết quả LUÔN do máy chủ trả; client chỉ diễn hoạt (transform/opacity/canvas). Văn bản từ máy chủ dùng textContent.
 * Cược được trừ trên màn hình ngay khi bấm (số thật do máy chủ trả). Không có nút tự lặp cược. */
(() => {
  'use strict';
  const G = window.SMGame, K = window.SMGameKit;
  if (!G || !K) { console.warn('games2.js: thiếu SMGame/SMGameKit (student.js, games.js chưa nạp).'); return; }
  const { el, btn, nf, sg, fx, ls } = K;
  const NAMES2 = { dice: 'Xúc xắc', plinko: 'Plinko', scratch: 'Thẻ cào', keno: 'Keno mini', coin: 'Tung xu' };
  const betOf = c => (c.pend ? c.pend.params.bet : c.bet());

  /* ================= 1. XÚC XẮC TRÊN–DƯỚI ================= */
  const dMult = ch => Math.floor(0.9 * 100 / ch * 100 + 1e-9) / 100;   // giống gR2_(G_RTP*100/chance) ở máy chủ
  function buildDice(c) {
    const D = { dir: ls.get('sm_dice_dir') === 'over' ? 'over' : 'under', target: Math.floor(+ls.get('sm_dice_t')) || 50 };
    const roll = el('div', 'dc-roll', '—', { 'aria-live': 'polite', 'aria-label': 'Số vừa lăn' });
    const track = el('div', 'dc-track', null, { 'aria-hidden': 'true' }), zone = el('div', 'dc-zone'), mark = el('div', 'dc-mark');
    track.append(zone, mark);
    const up = btn('dc-dir', '⬆ Trên', () => setDir('over'), { 'aria-label': 'Thắng nếu số lăn lớn hơn ngưỡng' });
    const dn = btn('dc-dir', '⬇ Dưới', () => setDir('under'), { 'aria-label': 'Thắng nếu số lăn nhỏ hơn ngưỡng' });
    const dirs = el('div', 'dc-dirs'); dirs.append(dn, up);
    const sl = el('input', 'dc-slider', null, { type: 'range', min: 2, max: 98, step: 1, 'aria-label': 'Ngưỡng từ 2 đến 98' });
    const info = el('p', 'gm-info'), go = btn('primary big gm-go', 'Lăn xúc xắc', () => c.run(play));
    const ctl = el('div', 'gm-ctl'); ctl.append(dirs, sl, go); c.zones.push(ctl);
    c.root.append(roll, track, info, c.res, ctl);

    const lim = () => D.dir === 'under' ? [6, 96] : [5, 95];
    const chance = () => D.dir === 'under' ? D.target - 1 : 100 - D.target;
    function paint() {
      const [lo, hi] = lim(); D.target = Math.max(lo, Math.min(hi, D.target)); sl.min = lo; sl.max = hi; sl.value = D.target;
      dn.setAttribute('aria-pressed', D.dir === 'under'); up.setAttribute('aria-pressed', D.dir === 'over');
      const ch = chance(), m = dMult(ch), bet = G.betValue();
      zone.style.left = (D.dir === 'under' ? 0 : D.target) + '%'; zone.style.width = (D.dir === 'under' ? D.target - 1 : 100 - D.target) + '%';
      info.textContent = 'Thắng nếu số lăn ' + (D.dir === 'under' ? '< ' : '> ') + D.target + ' · Tỉ lệ thắng ' + ch + '% · Hệ số ' + fx(m, true) + (bet > 0 ? ' · Thắng nhận ' + nf(Math.round(bet * m)) : '');
      sl.setAttribute('aria-valuetext', 'Ngưỡng ' + D.target + ', tỉ lệ thắng ' + ch + ' phần trăm, hệ số ' + m);
    }
    function setDir(d) { D.dir = d; ls.set('sm_dice_dir', d); G.sfx('click'); paint(); }
    sl.oninput = () => { D.target = +sl.value; ls.set('sm_dice_t', String(D.target)); paint(); };
    const bi = document.getElementById('bet'); if (bi) { bi.addEventListener('input', paint); c.cleanup = () => bi.removeEventListener('input', paint); }
    async function play() {
      const P = c.pend ? c.pend.params : { bet: c.bet(), target: D.target, dir: D.dir }; if (!P.bet) return;
      c.res.hidden = true; c.say(''); c.begin(); const before = c.hold(P.bet);
      const t = c.every(() => { roll.textContent = String(1 + Math.floor(Math.random() * 100)); }, 55); G.sfx('spin');
      let r;
      try { r = await c.send('diceRoll', P, { hold: before - P.bet }); }
      catch (e) { c.clear(t); c.active = false; c.unhold(before); roll.textContent = '—'; throw e; }
      c.clear(t); roll.textContent = String(r.roll); roll.classList.toggle('win', +r.net > 0);
      mark.hidden = false; mark.style.transform = 'translateX(' + (+r.roll - 0.5) + '%)';
      c.finish(r, 'Số lăn ' + r.roll + ' · ' + (r.dir === 'under' ? 'dưới ' : 'trên ') + r.target + ' · Hệ số ' + fx(r.mult, true));
    }
    mark.hidden = true; paint();
  }

  /* ================= 2. PLINKO ================= */
  const PK = { low: [7.6, 2.9, 1.4, 1, 0.8, 0.6, 0.8, 1, 1.4, 2.9, 7.6], mid: [20.2, 5.5, 2, 1.1, 0.6, 0.3, 0.6, 1.1, 2, 5.5, 20.2], high: [43.8, 10.2, 2.9, 0.9, 0.3, 0.1, 0.3, 0.9, 2.9, 10.2, 43.8] };
  const RISKN = { low: 'Thấp', mid: 'Vừa', high: 'Cao' };
  function buildPlinko(c) {
    const Pk = { risk: ['low', 'mid', 'high'].includes(ls.get('sm_plinko_risk')) ? ls.get('sm_plinko_risk') : 'mid', tbl: null, ball: null, hot: -1 };
    const W = 600, H = 470, CX = 300, DX = 44, Y0 = 34, DY = 38;
    const wrap = el('div', 'pk-wrap'), cv = el('canvas', 'pk-cv', null, { width: W, height: H, 'aria-label': 'Bảng Plinko 10 hàng', role: 'img' });
    wrap.append(cv);
    const slots = el('div', 'pk-slots', null, { 'aria-label': 'Hệ số 11 ô cuối' }), cellEls = [];
    for (let i = 0; i < 11; i++) { const s = el('span', 'pk-slot'); slots.append(s); cellEls.push(s); }
    const rk = el('div', 'pk-risk', null, { role: 'group', 'aria-label': 'Mức rủi ro' }), rbs = {};
    ['low', 'mid', 'high'].forEach(k => { const b = btn('pk-rb', RISKN[k], () => { Pk.risk = k; ls.set('sm_plinko_risk', k); G.sfx('click'); paint(); }); rbs[k] = b; rk.append(b); });
    const info = el('p', 'gm-info'), go = btn('primary big gm-go', 'Thả bóng', () => c.run(play));
    const ctl = el('div', 'gm-ctl'); ctl.append(rk, go); c.zones.push(ctl);
    c.root.append(wrap, slots, info, c.res, ctl);
    const px = (i, j) => CX + (j - i / 2) * DX, py = i => Y0 + i * DY;
    function draw() {
      const g = cv.getContext('2d'); if (!g) return;
      const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#0b1233'); gr.addColorStop(1, '#26337a'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
      g.fillStyle = 'rgba(255,255,255,.75)';
      for (let i = 0; i < 10; i++) for (let j = 0; j <= i; j++) { g.beginPath(); g.arc(px(i, j), py(i), 5, 0, 6.2832); g.fill(); }
      if (Pk.ball) { g.fillStyle = '#fbbf24'; g.beginPath(); g.arc(Pk.ball[0], Pk.ball[1], 11, 0, 6.2832); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke(); }
    }
    function paint() {
      const t = Pk.tbl && Pk.tbl.risk === Pk.risk ? Pk.tbl.t : PK[Pk.risk];
      t.forEach((m, i) => { const s = cellEls[i]; s.textContent = (+m).toLocaleString('vi-VN', { maximumFractionDigits: 2 }); s.className = 'pk-slot ' + (m >= 3 ? 'big' : m >= 1 ? 'mid' : 'low') + (i === Pk.hot ? ' hot' : ''); });
      Object.keys(rbs).forEach(k => rbs[k].setAttribute('aria-pressed', k === Pk.risk));
      info.textContent = 'Rủi ro ' + RISKN[Pk.risk] + ': ô giữa ít điểm nhất, hai mép nhiều điểm nhất. Bóng rơi 10 hàng, mỗi hàng trái/phải 50%.';
      draw();
    }
    function drop(path, ms) {
      return new Promise(res => {
        if (G.reducedMotion || ms <= 0) { Pk.ball = null; return res(); }
        let R = 0; const pts = [[px(0, 0), py(0) - 28]]; const xs = [px(0, 0)];
        path.forEach((b, i) => { R += b; pts.push([px(i + 1, R), i + 1 < 10 ? py(i + 1) : py(9) + 60]); });
        const t0 = performance.now(), n = path.length;
        c.loop(now => {
          const k = Math.min(1, (now - t0) / ms), pos = k * n, i = Math.min(n - 1, Math.floor(pos)), u = pos - i, a = pts[i], b = pts[i + 1];
          Pk.ball = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u * u + (u < .5 ? -Math.sin(u * 3.1416) * 8 : 0)];
          draw();
          if (k >= 1) { c.stopLoop(); res(); }
        });
      });
    }
    async function play() {
      const P = c.pend ? c.pend.params : { bet: c.bet(), risk: Pk.risk }; if (!P.bet) return;
      c.res.hidden = true; c.say(''); c.begin(); Pk.hot = -1; Pk.ball = null; paint(); const before = c.hold(P.bet); G.sfx('click');
      let r;
      try { r = await c.send('plinkoDrop', P, { hold: before - P.bet }); } catch (e) { c.active = false; c.unhold(before); throw e; }
      if (Array.isArray(r.table) && r.table.length === 11) Pk.tbl = { risk: r.risk, t: r.table.map(Number) };
      await drop((r.path || []).map(x => (x ? 1 : 0)), G.fast ? 350 : 1100);
      Pk.hot = Math.max(0, Math.min(10, Math.floor(+r.slot) || 0)); Pk.ball = [px(10, Pk.hot), py(9) + 60]; paint();
      c.finish(r, 'Ô số ' + (Pk.hot + 1) + ' · Hệ số ' + fx(r.mult));
    }
    c.cleanup = () => { Pk.ball = null; };
    paint();
  }

  /* ================= 3. THẺ CÀO ================= */
  const SCR = { cherry: '🍒', lemon: '🍋', orange: '🍊', grape: '🍇', melon: '🍉', peach: '🍑', bell: '🔔', clover: '🍀', heart: '❤️', moon: '🌙', star: '⭐', rainbow: '🌈', gem: '💠', crown: '👑', diamond: '💎', seven: '7️⃣' };
  const scr = k => SCR[k] || String(k);
  function buildScratch(c) {
    const T = { r: null, shown: new Set(), done: true };
    const grid = el('div', 'sc-grid', null, { role: 'group', 'aria-label': 'Thẻ cào 9 ô' });
    const cells = Array.from({ length: 9 }, (_, i) => { const b = el('button', 'sc-cell', '', { type: 'button' }); b.onclick = () => reveal(i); grid.append(b); return b; });
    const info = el('p', 'gm-info'), all = btn('sc-all', 'Cào hết', () => revealAll());
    const buy = btn('primary big gm-go', 'Mua thẻ', () => c.run(play));
    const ctl = el('div', 'gm-ctl'); ctl.append(buy); c.zones.push(ctl);
    c.root.append(grid, all, info, c.res, ctl);
    function blank() { cells.forEach((b, i) => { b.className = 'sc-cell'; b.textContent = ''; b.disabled = true; b.setAttribute('aria-label', 'Ô ' + (i + 1) + ': chưa mua thẻ'); }); all.hidden = true; }
    function cover() { cells.forEach((b, i) => { b.className = 'sc-cell cov'; b.textContent = '▒'; b.disabled = false; b.setAttribute('aria-label', 'Ô ' + (i + 1) + ': chưa cào, bấm để cào'); }); all.hidden = false; }
    function conclude() {
      if (!T.r || T.done) return; T.done = true; const r = T.r; all.hidden = true;
      if (r.win) cells.forEach((b, i) => { if (r.cells[i] === r.win.symbol) b.classList.add('win'); });
      c.finish(r, r.win ? r.win.count + ' × ' + scr(r.win.symbol) + ' · Hệ số ' + fx(r.mult, true) : 'Không có biểu tượng nào xuất hiện ≥3 lần');
    }
    function reveal(i) {
      if (!T.r || T.shown.has(i)) return; T.shown.add(i);
      const b = cells[i], k = T.r.cells[i]; b.className = 'sc-cell open'; b.textContent = scr(k); b.disabled = true; b.setAttribute('aria-label', 'Ô ' + (i + 1) + ': ' + k);
      c.anim(b, [{ transform: 'scale(.7)', opacity: .3 }, { transform: 'scale(1)', opacity: 1 }], { duration: 120 }); G.sfx('tick');
      if (T.shown.size >= 9) conclude();
    }
    function revealAll() { for (let i = 0; i < 9; i++) reveal(i); }
    async function play() {
      if (T.r && !T.done) revealAll();                       // thẻ cũ chưa cào hết: chốt kết quả (đã tính từ máy chủ) rồi mới mua thẻ mới
      const P = c.pend ? c.pend.params : { bet: c.bet() }; if (!P.bet) return;
      c.res.hidden = true; c.say(''); c.begin(); const before = c.hold(P.bet); G.sfx('click');
      let r;
      try { r = await c.send('scratchBuy', P, { hold: before - P.bet }); } catch (e) { c.active = false; c.unhold(before); throw e; }
      T.r = r; T.shown = new Set(); T.done = false; cover();
      info.textContent = 'Bấm từng ô để cào, hoặc bấm “Cào hết”. Kết quả đã chốt từ trước khi cào; không bắt buộc cào hết mới tính.';
    }
    c.cleanup = () => { if (T.r && !T.done) { G.settle({ delta: +T.r.net || 0, balance: T.r.balance }); T.done = true; } };   // rời trò khi chưa cào hết: vẫn ghi nhận kết quả đã chốt
    c.onIdle = () => { T.r = null; T.done = true; blank(); info.textContent = 'Mua thẻ rồi cào 9 ô. Trúng nếu có một biểu tượng xuất hiện từ 3 lần trở lên.'; };
    c.onIdle();
  }

  /* ================= 4. KENO MINI ================= */
  const KN = { 1: [0, 2.25], 2: [0, 0, 6.1], 3: [0, 0, 1.5, 9.25], 4: [0, 0, 0.55, 2.4, 24.5], 5: [0, 0, 0.4, 1, 5, 62.9] };
  function buildKeno(c) {
    const Kn = { pick: new Set((ls.get('sm_keno') || '').split(',').map(Number).filter(n => n >= 1 && n <= 20).slice(0, 5)) };
    const grid = el('div', 'kn-grid', null, { role: 'group', 'aria-label': 'Bảng số 1 đến 20, chọn tối đa 5 số' });
    const cells = Array.from({ length: 20 }, (_, i) => { const b = el('button', 'kn-cell', String(i + 1), { type: 'button' }); b.onclick = () => toggle(i + 1); grid.append(b); return b; });
    const pay = el('div', 'kn-pay', null, { 'aria-label': 'Bảng trả thưởng' }), info = el('p', 'gm-info');
    const clr = btn('small ghost', 'Xóa chọn', () => { Kn.pick.clear(); save(); paint(); G.sfx('click'); });
    const go = btn('primary big gm-go', 'Chơi', () => c.run(play));
    const ctl = el('div', 'gm-ctl'); ctl.append(grid, clr, go); c.zones.push(ctl);
    c.root.append(info, ctl, pay, c.res);
    const save = () => ls.set('sm_keno', Array.from(Kn.pick).join(','));
    function toggle(n) {
      if (Kn.pick.has(n)) Kn.pick.delete(n); else if (Kn.pick.size < 5) Kn.pick.add(n); else { c.say('Tối đa 5 số. Bỏ một số rồi chọn số khác.', 'warn'); return; }
      c.say(''); save(); G.sfx('tick'); paint();
    }
    function paint(draw, hits) {
      cells.forEach((b, i) => {
        const n = i + 1, p = Kn.pick.has(n), d = draw && draw.includes(n);
        b.className = 'kn-cell' + (p ? ' pick' : '') + (d ? (p ? ' hit' : ' drawn') : '');
        b.setAttribute('aria-pressed', p); b.setAttribute('aria-label', 'Số ' + n + (p ? ', đã chọn' : '') + (d ? (p ? ', trúng' : ', được rút') : ''));
      });
      const k = Kn.pick.size; go.disabled = k < 1; clr.disabled = k < 1;
      info.textContent = k ? 'Đã chọn ' + k + '/5 số. Máy rút 8 số trong 20.' : 'Chọn từ 1 đến 5 số rồi bấm Chơi. Máy rút 8 số trong 20.';
      pay.replaceChildren();
      if (k) { pay.append(el('b', '', 'Trúng bao nhiêu số → hệ số (chọn ' + k + ' số)')); const t = el('div', 'kn-rows'); KN[k].forEach((m, h) => { if (!m) return; const r = el('span', 'kn-row' + (hits === h ? ' on' : '')); r.textContent = h + ' số: ' + fx(m, true); t.append(r); }); pay.append(t); }
    }
    async function play() {
      const P = c.pend ? c.pend.params : { bet: c.bet(), picks: Array.from(Kn.pick).sort((a, b) => a - b) }; if (!P.bet) return;
      c.res.hidden = true; c.say(''); c.begin(); paint(); const before = c.hold(P.bet); G.sfx('spin');
      let r;
      try { r = await c.send('kenoPlay', P, { hold: before - P.bet }); } catch (e) { c.active = false; c.unhold(before); throw e; }
      const dr = (r.draw || []).map(Number), shown = [];
      for (const n of dr) { shown.push(n); paint(shown); G.sfx('tick'); await c.wait(45); }
      paint(dr, r.hits);
      c.finish(r, 'Trúng ' + r.hits + '/' + P.picks.length + ' số · Hệ số ' + fx(r.mult, true));
    }
    paint();
  }

  /* ================= 5. TUNG XU LIÊN TIẾP ================= */
  function buildCoin(c) {
    const C = { bet: 0, steps: 0, mult: null, next: 1.8, pay: null };
    const coin = el('div', 'cn-coin', '🪙', { role: 'img', 'aria-label': 'Đồng xu' });
    const stage = el('div', 'cn-stage'); stage.append(coin);
    const chips = el('div', 'cn-chain', null, { 'aria-label': 'Chuỗi thắng' }), info = el('p', 'gm-info');
    const go = btn('primary big gm-go', 'Bắt đầu ván', () => c.run(start));
    const flip = btn('primary big', 'Tung (bạn chọn Ngửa)', () => c.run(doFlip));
    const cash = btn('big cn-cash', 'Rút', () => c.run(cashout));
    const ctl = el('div', 'gm-ctl'); ctl.append(go, flip, cash); c.zones.push(ctl);
    c.root.append(stage, chips, info, c.res, ctl);
    const face = s => { coin.textContent = s === 'heads' ? 'NGỬA' : s === 'tails' ? 'SẤP' : '🪙'; coin.className = 'cn-coin' + (s === 'heads' ? ' h' : s === 'tails' ? ' t' : ''); coin.setAttribute('aria-label', s === 'heads' ? 'Ra mặt ngửa' : s === 'tails' ? 'Ra mặt sấp' : 'Đồng xu'); };
    function paint() {
      const live = c.active; go.hidden = live; flip.hidden = !live; cash.hidden = !live;
      chips.replaceChildren(); for (let i = 0; i < Math.min(C.steps, 12); i++) chips.append(el('span', 'cn-chip', '✔'));
      if (!live) { info.textContent = 'Mỗi lần tung thắng 50% (ra Ngửa). Thắng liên tiếp để nhân hệ số, thua là mất cược.'; return; }
      const pay = C.pay != null ? C.pay : Math.round(C.bet * (C.mult || 0));
      cash.disabled = C.steps < 1; cash.textContent = C.steps > 0 ? 'Rút ' + nf(pay) + ' điểm (' + fx(C.mult, true) + ')' : 'Rút (cần thắng ít nhất 1 lần)';
      info.textContent = 'Cược ' + nf(C.bet) + ' · Chuỗi thắng ' + C.steps + ' · Hệ số ' + (C.mult == null ? '—' : fx(C.mult, true)) + ' · Thắng tiếp → ' + fx(C.next, true);
    }
    function load(r) { C.steps = Math.floor(+r.steps) || 0; C.mult = r.mult == null ? null : +r.mult; C.next = +r.nextMult || 1.8; C.pay = typeof r.payoutNow === 'number' ? r.payoutNow : null; paint(); }
    async function start() {
      if (c.active) return;
      const P = c.pend ? c.pend.params : { bet: c.bet() }; if (!P.bet) return;
      c.res.hidden = true; c.say(''); face(''); const before = c.hold(P.bet);
      let r; try { r = await c.send('coinStart', P); } catch (e) { c.unhold(before); throw e; }
      C.bet = +r.bet || P.bet; c.begin(); G.sfx('click'); load(r);
    }
    async function doFlip() {
      if (!c.active) return;
      coin.classList.add('spin'); G.sfx('spin');
      let r; try { r = await c.send('coinFlip', {}); } finally { coin.classList.remove('spin'); }
      face(r.side);
      await c.anim(coin, [{ transform: 'rotateY(90deg)' }, { transform: 'rotateY(0)' }], { duration: 140 });
      if (r.active === false) {
        const lose = r.result === 'lose';
        c.finish(Object.assign({ bet: C.bet, payout: 0 }, r), lose ? 'Ra Sấp sau ' + C.steps + ' lần thắng' : 'Đạt hệ số tối đa, tự rút ' + fx(r.mult, true)); paint();
      } else { G.sfx('coin'); load(r); }
    }
    async function cashout() {
      if (!c.active) return;
      const r = await c.send('coinCashout', {});
      c.finish(Object.assign({ bet: C.bet }, r), 'Rút ở ' + fx(r.mult, true) + ' sau ' + C.steps + ' lần thắng'); paint();
    }
    c.onIdle = () => { c.active = false; C.steps = 0; C.mult = null; C.next = 1.8; face(''); paint(); };
    c.onRestore = (kind, r) => { C.bet = +r.bet || 0; c.begin(); face(''); load(r); c.say('Đã khôi phục ván đang chơi dở.', 'ok'); };
    paint();
  }

  /* ================= Luật chơi ================= */
  G.setRules('dice', ['Máy chủ lăn một số từ 1 đến 100. Chọn “Dưới” (thắng nếu số < ngưỡng) hoặc “Trên” (thắng nếu số > ngưỡng); ngưỡng 2–98, tỉ lệ thắng từ 5% đến 95%.', 'Hệ số = 90 ÷ tỉ lệ thắng (làm tròn xuống 2 số lẻ). Tỉ lệ thắng càng thấp, hệ số càng cao.', 'Hoàn trả lý thuyết ≈ 89–90% với mọi ngưỡng.']);
  G.setRules('plinko', ['Bóng rơi qua 10 hàng chốt, mỗi hàng sang trái hoặc phải với xác suất 50%. Ô cuối (0–10) quyết định hệ số; ô ở giữa dễ trúng nhất.', 'Ba mức rủi ro: Thấp (tối đa ×7,6), Vừa (tối đa ×20,2), Cao (tối đa ×43,8; nhiều ô dưới ×1).', 'Hoàn trả lý thuyết ≈ 90% cho cả ba mức.']);
  G.setRules('scratch', ['Thẻ có 9 ô, mỗi ô là một biểu tượng chọn độc lập. Trúng nếu có biểu tượng xuất hiện từ 3 lần trở lên; nếu nhiều biểu tượng cùng đủ 3 lần, tính hệ số cao nhất.', 'Hệ số = hệ số biểu tượng × hệ số số lần (3 ô ×1, 4 ô ×3, 5 ô ×10, 6 ô ×30, 7 ô ×60, 8 ô ×100, 9 ô ×200). Hệ số biểu tượng: 🍒🍋🍊🍇🍉🍑 ×1,7 · 🔔🍀 ×2,05 · ❤️ ×2,4 · 🌙 ×2,7 · ⭐ ×3,4 · 🌈 ×5,1 · 💠 ×6,8 · 👑 ×10,2 · 💎 ×17 · 7️⃣ ×42,5.', 'Kết quả đã chốt ở máy chủ trước khi cào; không cần cào hết mới tính. Khoảng 31,6% số thẻ trúng; hoàn trả lý thuyết ≈ 90%.']);
  G.setRules('keno', ['Chọn 1–5 số trong 1–20. Máy chủ rút 8 số khác nhau trong 20; hệ số tùy số bạn chọn và số trúng (bảng hiện ngay dưới nút Chơi).', 'Chọn càng nhiều số thì hệ số khi trúng hết càng cao nhưng càng khó.', 'Hoàn trả lý thuyết ≈ 88–90% với mọi số lượng số chọn.']);
  G.setRules('coin', ['Bấm Bắt đầu rồi Tung: bạn luôn chọn Ngửa, mỗi lần thắng 50%. Thắng k lần liên tiếp có hệ số 1,8 × 2^(k−1) (×1,8, ×3,6, ×7,2, …), trần ×100 thì tự rút.', 'Rút bất cứ lúc nào sau lần thắng đầu tiên; thua một lần là mất cược. Ván dở được khôi phục khi tải lại trang.', 'Hoàn trả lý thuyết 90% với mọi lúc rút (trừ khi chạm trần ×100).']);

  /* ================= Đăng ký ================= */
  const B2 = { dice: buildDice, plinko: buildPlinko, scratch: buildScratch, keno: buildKeno, coin: buildCoin };
  Object.keys(B2).forEach(n => {
    K.BUILD[n] = B2[n];
    G.register(n, { mount(stage) { K.mountGame(n, stage); }, unmount() { K.unmountGame(n); }, resume() { K.resumeGame(n); } });
  });
})();

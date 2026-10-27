/* Spelling Mastery – 5 trò mới: Xúc xắc (dice), Plinko, Thẻ cào (scratch), Keno mini, Tung xu (coin).
 * Dùng SMGameKit (xuất từ games.js): cùng ctx, requestId idempotent, khoá bấm đúp, thử lại an toàn.
 * Kết quả LUÔN do máy chủ trả; client chỉ diễn hoạt (transform/opacity/canvas). Văn bản từ máy chủ dùng textContent.
 * Cược được trừ trên màn hình ngay khi bấm (số thật do máy chủ trả). Không có nút tự lặp cược.
 * Nhịp nhanh: mỗi ván một lần bấm (hoặc phím Space = c.hot); tỷ lệ thắng mục tiêu ≈ 45% (bảng ở Games.gs). */
(() => {
  'use strict';
  const G = window.SMGame, K = window.SMGameKit;
  if (!G || !K) { console.warn('games2.js: thiếu SMGame/SMGameKit (student.js, games.js chưa nạp).'); return; }
  const { el, btn, nf, sg, fx, ls, autoBox } = K;
  const NAMES2 = { dice: 'Xúc xắc', plinko: 'Plinko', scratch: 'Thẻ cào', keno: 'Keno mini', coin: 'Tung xu' };
  const betOf = c => (c.pend ? c.pend.params.bet : c.bet());

  /* ================= 1. XÚC XẮC TRÊN–DƯỚI ================= */
  /* Tỷ lệ thắng cố định 45%, hệ số ×2 (giống G_DICE ở máy chủ). Bấm Dưới / Trên là lăn luôn: 1 lần bấm = 1 ván. */
  const DC = { under: 46, over: 55, chance: 45, mult: 2 };
  function buildDice(c) {
    const D = { dir: ls.get('sm_dice_dir') === 'over' ? 'over' : 'under' };
    const roll = el('div', 'dc-roll', '—', { 'aria-live': 'polite', 'aria-label': 'Số vừa lăn' });
    const track = el('div', 'dc-track', null, { 'aria-hidden': 'true' }), zLo = el('div', 'dc-zone'), zHi = el('div', 'dc-zone'), mark = el('div', 'dc-mark');
    zLo.style.left = '0%'; zLo.style.width = (DC.under - 1) + '%'; zHi.style.left = DC.over + '%'; zHi.style.width = (100 - DC.over) + '%';
    track.append(zLo, zHi, mark);
    const dn = btn('primary big dc-dir', '⬇ Dưới (1–' + (DC.under - 1) + ')', () => c.run(() => play('under')), { 'aria-label': 'Lăn: thắng nếu số nhỏ hơn ' + DC.under });
    const up = btn('primary big dc-dir', '⬆ Trên (' + (DC.over + 1) + '–100)', () => c.run(() => play('over')), { 'aria-label': 'Lăn: thắng nếu số lớn hơn ' + DC.over });
    const dirs = el('div', 'dc-dirs'); dirs.append(dn, up);
    const info = el('p', 'gm-info');
    const ctl = el('div', 'gm-ctl'); ctl.append(dirs); c.zones.push(ctl);
    c.root.append(roll, track, info, c.res, ctl);
    c.hot = () => c.run(() => play(D.dir));   // Space/Enter: lăn lại theo hướng vừa chọn
    function paint() {
      dn.setAttribute('aria-pressed', D.dir === 'under'); up.setAttribute('aria-pressed', D.dir === 'over');
      zLo.classList.toggle('off', D.dir !== 'under'); zHi.classList.toggle('off', D.dir !== 'over');
      const bet = G.betValue();
      info.textContent = 'Bấm Dưới hoặc Trên là lăn ngay · Tỷ lệ thắng ' + DC.chance + '% · Hệ số ' + fx(DC.mult, true) + (bet > 0 ? ' · Thắng nhận ' + nf(Math.round(bet * DC.mult)) : '') + ' · Space = lăn lại';
    }
    const bi = document.getElementById('bet'); if (bi) { bi.addEventListener('input', paint); c.cleanup = () => bi.removeEventListener('input', paint); }
    async function play(dir) {
      const P = c.pend ? c.pend.params : { bet: c.bet(), dir }; if (!P.bet) return;
      D.dir = P.dir; ls.set('sm_dice_dir', D.dir); paint();
      c.res.hidden = true; c.say(''); c.begin(); const before = c.hold(P.bet); roll.classList.remove('win');
      const t = c.every(() => { roll.textContent = String(1 + Math.floor(Math.random() * 100)); }, 45); G.sfx('spin');
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
  const PROWS = 16;   // giống G_PLINKO_ROWS: 17 ô cuối, 3 ô giữa < ×1, 14 ô còn lại ≥ ×1,5 → thắng 45,45%
  const PK = {
    low:  [4, 2.7, 2.1, 1.8, 1.6, 1.5, 1.5, 0.4, 0.3, 0.4, 1.5, 1.5, 1.6, 1.8, 2.1, 2.7, 4],
    mid:  [23, 9.9, 4.7, 2.7, 1.9, 1.6, 1.5, 0.3, 0.2, 0.3, 1.5, 1.6, 1.9, 2.7, 4.7, 9.9, 23],
    high: [80, 25, 8.7, 3.6, 2.1, 1.6, 1.5, 0.2, 0.1, 0.2, 1.5, 1.6, 2.1, 3.6, 8.7, 25, 80]
  };
  const RISKN = { low: 'Thấp', mid: 'Vừa', high: 'Cao' };
  function buildPlinko(c) {
    const Pk = { risk: ['low', 'mid', 'high'].includes(ls.get('sm_plinko_risk')) ? ls.get('sm_plinko_risk') : 'mid', tbl: null, ball: null, hot: -1 };
    const W = 600, H = 470, CX = 300, DX = 33, Y0 = 26, DY = 25;
    const wrap = el('div', 'pk-wrap'), cv = el('canvas', 'pk-cv', null, { width: W, height: H, 'aria-label': 'Bảng Plinko ' + PROWS + ' hàng', role: 'img' });
    wrap.append(cv);
    const slots = el('div', 'pk-slots', null, { 'aria-label': 'Hệ số ' + (PROWS + 1) + ' ô cuối' }), cellEls = [];
    for (let i = 0; i <= PROWS; i++) { const s = el('span', 'pk-slot'); slots.append(s); cellEls.push(s); }
    const rk = el('div', 'pk-risk', null, { role: 'group', 'aria-label': 'Mức rủi ro' }), rbs = {};
    ['low', 'mid', 'high'].forEach(k => { const b = btn('pk-rb', RISKN[k], () => { Pk.risk = k; ls.set('sm_plinko_risk', k); G.sfx('click'); paint(); }); rbs[k] = b; rk.append(b); });
    const info = el('p', 'gm-info'), go = btn('primary big gm-go', 'Thả bóng', () => c.run(play));
    const ctl = el('div', 'gm-ctl'); ctl.append(rk, go); c.zones.push(ctl);
    c.root.append(wrap, slots, info, c.res, ctl);
    c.hot = () => c.run(play);
    const px = (i, j) => CX + (j - i / 2) * DX, py = i => Y0 + i * DY;
    function draw() {
      const g = cv.getContext('2d'); if (!g) return;
      const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#0b1233'); gr.addColorStop(1, '#26337a'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
      g.fillStyle = 'rgba(255,255,255,.75)';
      for (let i = 0; i < PROWS; i++) for (let j = 0; j <= i; j++) { g.beginPath(); g.arc(px(i, j), py(i), 4, 0, 6.2832); g.fill(); }
      if (Pk.ball) { g.fillStyle = '#fbbf24'; g.beginPath(); g.arc(Pk.ball[0], Pk.ball[1], 9, 0, 6.2832); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke(); }
    }
    function paint() {
      const t = Pk.tbl && Pk.tbl.risk === Pk.risk ? Pk.tbl.t : PK[Pk.risk];
      t.forEach((m, i) => { const s = cellEls[i]; s.textContent = (+m).toLocaleString('vi-VN', { maximumFractionDigits: 2 }); s.className = 'pk-slot ' + (m >= 3 ? 'big' : m >= 1 ? 'mid' : 'low') + (i === Pk.hot ? ' hot' : ''); });
      Object.keys(rbs).forEach(k => rbs[k].setAttribute('aria-pressed', k === Pk.risk));
      info.textContent = 'Rủi ro ' + RISKN[Pk.risk] + ': chỉ 3 ô giữa dưới ×1, mọi ô khác đều lãi (thắng ≈ 45%). Bóng rơi ' + PROWS + ' hàng, mỗi hàng trái/phải 50%. Space = thả tiếp.';
      draw();
    }
    function drop(path, ms) {
      return new Promise(res => {
        if (G.reducedMotion || ms <= 0) { Pk.ball = null; return res(); }
        let R = 0; const pts = [[px(0, 0), py(0) - 28]]; const xs = [px(0, 0)];
        path.forEach((b, i) => { R += b; pts.push([px(i + 1, R), i + 1 < PROWS ? py(i + 1) : py(PROWS - 1) + 40]); });
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
      if (Array.isArray(r.table) && r.table.length === PROWS + 1) Pk.tbl = { risk: r.risk, t: r.table.map(Number) };
      await drop((r.path || []).map(x => (x ? 1 : 0)), G.fast ? 250 : 700);
      Pk.hot = Math.max(0, Math.min(PROWS, Math.floor(+r.slot) || 0)); Pk.ball = [px(PROWS, Pk.hot), py(PROWS - 1) + 40]; paint();
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
    const buy = btn('primary big gm-go', 'Mua & cào thẻ', () => c.run(play));
    const ctl = el('div', 'gm-ctl'); ctl.append(buy); c.zones.push(ctl);
    c.root.append(grid, all, info, c.res, ctl);
    c.hot = () => c.run(play);
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
      c.anim(b, [{ transform: 'scale(.7)', opacity: .3 }, { transform: 'scale(1)', opacity: 1 }], { duration: 90 }); G.sfx('tick');
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
      info.textContent = 'Thẻ tự cào. Kết quả đã chốt ở máy chủ từ trước khi cào.';
      for (let i = 0; i < 9 && !T.done; i++) { reveal(i); if (i < 8) await c.wait(35); }   // tự cào nhanh cả 9 ô → ván kết thúc ngay, bấm tiếp được luôn
      revealAll();
    }
    c.cleanup = () => { if (T.r && !T.done) { G.settle({ delta: +T.r.net || 0, balance: T.r.balance }); T.done = true; } };   // rời trò khi chưa cào hết: vẫn ghi nhận kết quả đã chốt
    c.onIdle = () => { T.r = null; T.done = true; blank(); info.textContent = 'Bấm Mua & cào (hoặc Space): thẻ tự cào 9 ô. Trúng nếu có một biểu tượng xuất hiện từ 3 lần trở lên (≈ 45% số thẻ).'; };
    c.onIdle();
  }

  /* ================= 4. KENO MINI ================= */
  /* Giống máy chủ: 22 số, số bóng rút tuỳ số đã chọn để tỷ lệ thắng ≈ 45% với mọi lựa chọn */
  const KN_N = 22, KN_D = { 1: 10, 2: 15, 3: 17, 4: 13, 5: 19 };
  const KN = { 1: [0, 1.98], 2: [0, 0, 1.98], 3: [0, 0, 0, 2.04], 4: [0, 0, 0, 1.4, 4.19], 5: [0, 0, 0, 0, 0, 2.04] };
  function buildKeno(c) {
    const Kn = { pick: new Set((ls.get('sm_keno') || '').split(',').map(Number).filter(n => n >= 1 && n <= KN_N).slice(0, 5)) };
    const grid = el('div', 'kn-grid', null, { role: 'group', 'aria-label': 'Bảng số 1 đến ' + KN_N + ', chọn tối đa 5 số' });
    const cells = Array.from({ length: KN_N }, (_, i) => { const b = el('button', 'kn-cell', String(i + 1), { type: 'button' }); b.onclick = () => toggle(i + 1); grid.append(b); return b; });
    const pay = el('div', 'kn-pay', null, { 'aria-label': 'Bảng trả thưởng' }), info = el('p', 'gm-info');
    const clr = btn('small ghost', 'Xóa chọn', () => { Kn.pick.clear(); save(); paint(); G.sfx('click'); });
    const rnd = btn('small ghost', 'Chọn nhanh', () => { const k = Math.max(1, Kn.pick.size || 3), a = Array.from({ length: KN_N }, (_, i) => i + 1); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } Kn.pick = new Set(a.slice(0, k)); save(); paint(); G.sfx('click'); });
    const go = btn('primary big gm-go', 'Chơi', () => c.run(play));
    const tools = el('div', 'kn-tools'); tools.append(rnd, clr);
    const ctl = el('div', 'gm-ctl'); ctl.append(grid, tools, go); c.zones.push(ctl);
    c.root.append(info, ctl, pay, c.res);
    c.hot = () => { if (Kn.pick.size) c.run(play); };
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
      info.textContent = k ? 'Đã chọn ' + k + '/5 số. Máy rút ' + KN_D[k] + ' số trong ' + KN_N + ' · thắng ≈ 45% · Space = chơi tiếp.' : 'Chọn 1–5 số (hoặc Chọn nhanh) rồi bấm Chơi. Máy rút số bóng tuỳ số bạn chọn.';
      pay.replaceChildren();
      if (k) { pay.append(el('b', '', 'Trúng bao nhiêu số → hệ số (chọn ' + k + ' số)')); const t = el('div', 'kn-rows'); KN[k].forEach((m, h) => { if (!m) return; const r = el('span', 'kn-row' + (hits === h ? ' on' : '')); r.textContent = h + ' số: ' + fx(m, true); t.append(r); }); pay.append(t); }
    }
    async function play() {
      const P = c.pend ? c.pend.params : { bet: c.bet(), picks: Array.from(Kn.pick).sort((a, b) => a - b) }; if (!P.bet) return;
      c.res.hidden = true; c.say(''); c.begin(); paint(); const before = c.hold(P.bet); G.sfx('spin');
      let r;
      try { r = await c.send('kenoPlay', P, { hold: before - P.bet }); } catch (e) { c.active = false; c.unhold(before); throw e; }
      const dr = (r.draw || []).map(Number), shown = [];
      for (const n of dr) { shown.push(n); paint(shown); G.sfx('tick'); await c.wait(18); }
      paint(dr, r.hits);
      c.finish(r, 'Trúng ' + r.hits + '/' + P.picks.length + ' số · Hệ số ' + fx(r.mult, true));
    }
    paint();
  }

  /* ================= 5. TUNG XU LIÊN TIẾP ================= */
  function buildCoin(c) {
    const C = { bet: 0, steps: 0, mult: null, next: 2, pay: null, auto: 0, p: 0.45 };
    const coin = el('div', 'cn-coin', '🪙', { role: 'img', 'aria-label': 'Đồng xu' });
    const stage = el('div', 'cn-stage'); stage.append(coin);
    const chips = el('div', 'cn-chain', null, { 'aria-label': 'Chuỗi thắng' }), info = el('p', 'gm-info');
    const go = btn('primary big gm-go', 'Tung (bạn chọn Ngửa)', () => c.run(start));
    const flip = btn('primary big', 'Tung tiếp', () => c.run(doFlip));
    const cash = btn('big cn-cash', 'Rút', () => c.run(cashout));
    const auto = autoBox('coin', () => paint());
    const ctl = el('div', 'gm-ctl'); ctl.append(auto.box, go, flip, cash); c.zones.push(ctl);
    c.root.append(stage, chips, info, c.res, ctl);
    c.hot = () => c.run(c.active ? doFlip : start);   // Space/Enter: tung
    const face = s => { coin.textContent = s === 'heads' ? 'NGỬA' : s === 'tails' ? 'SẤP' : '🪙'; coin.className = 'cn-coin' + (s === 'heads' ? ' h' : s === 'tails' ? ' t' : ''); coin.setAttribute('aria-label', s === 'heads' ? 'Ra mặt ngửa' : s === 'tails' ? 'Ra mặt sấp' : 'Đồng xu'); };
    function paint() {
      const live = c.active; go.hidden = live; flip.hidden = !live; cash.hidden = !live; auto.box.hidden = live;
      chips.replaceChildren(); for (let i = 0; i < Math.min(C.steps, 12); i++) chips.append(el('span', 'cn-chip', '✔'));
      if (!live) {
        const a = auto.get(); let k = 0; if (a) { k = 1; while (k < 20 && Math.min(100, 0.9 / Math.pow(0.45, k)) < a) k++; }
        info.textContent = 'Mỗi lần tung thắng 45% (ra Ngửa), lần đầu ×2. Một lần bấm = mở ván + tung.' + (a ? ' Tự rút ở ' + fx(a, true) + ' (sau ' + k + ' lần thắng) · tỷ lệ thắng ≈ ' + Math.round(100 * Math.pow(0.45, k)) + '%.' : '');
        return;
      }
      const pay = C.pay != null ? C.pay : Math.round(C.bet * (C.mult || 0));
      cash.disabled = C.steps < 1; cash.textContent = C.steps > 0 ? 'Rút ' + nf(pay) + ' điểm (' + fx(C.mult, true) + ')' : 'Rút (cần thắng ít nhất 1 lần)';
      info.textContent = 'Cược ' + nf(C.bet) + ' · Chuỗi thắng ' + C.steps + ' · Hệ số ' + (C.mult == null ? '—' : fx(C.mult, true)) + ' · Thắng tiếp → ' + fx(C.next, true) + (C.auto ? ' · Tự rút ở ' + fx(C.auto, true) : '');
    }
    function load(r) { C.steps = Math.floor(+r.steps) || 0; C.mult = r.mult == null ? null : +r.mult; C.next = +r.nextMult || 2; C.pay = typeof r.payoutNow === 'number' ? r.payoutNow : null; if (r.auto != null) C.auto = +r.auto || 0; paint(); }
    async function start() {   // mở ván + tung lần đầu trong MỘT yêu cầu (coinStart flip:true)
      if (c.active) return;
      const P = c.pend ? c.pend.params : { bet: c.bet(), flip: true, auto: auto.get() }; if (!P.bet) return;
      c.res.hidden = true; c.say(''); face(''); const before = c.hold(P.bet);
      coin.classList.add('spin'); G.sfx('spin');
      let r; try { r = await c.send('coinStart', P); } catch (e) { c.unhold(before); throw e; } finally { coin.classList.remove('spin'); }
      C.bet = +r.bet || P.bet; C.steps = 0; C.auto = +r.auto || P.auto || 0; c.begin();
      if (!r.side) { G.sfx('click'); load(r); return; }   // máy chủ cũ (chưa hỗ trợ flip) → ván mở, chưa tung
      return landed(r);
    }
    async function doFlip() {
      if (!c.active) return;
      coin.classList.add('spin'); G.sfx('spin');
      let r; try { r = await c.send('coinFlip', {}); } finally { coin.classList.remove('spin'); }
      return landed(r);
    }
    async function landed(r) {
      face(r.side);
      await c.anim(coin, [{ transform: 'rotateY(90deg)' }, { transform: 'rotateY(0)' }], { duration: 100 });
      if (r.active === false) {
        const lose = r.result === 'lose';
        c.finish(Object.assign({ bet: C.bet, payout: 0 }, r), lose ? 'Ra Sấp sau ' + C.steps + ' lần thắng' : 'Tự rút ' + fx(r.mult, true) + ' sau ' + r.steps + ' lần thắng'); paint();
      } else { G.sfx('coin'); load(r); }
    }
    async function cashout() {
      if (!c.active) return;
      const r = await c.send('coinCashout', {});
      c.finish(Object.assign({ bet: C.bet }, r), 'Rút ở ' + fx(r.mult, true) + ' sau ' + C.steps + ' lần thắng'); paint();
    }
    c.onIdle = () => { c.active = false; C.steps = 0; C.mult = null; C.next = 2; face(''); paint(); };
    c.onRestore = (kind, r) => { C.bet = +r.bet || 0; c.begin(); face(''); load(r); c.say('Đã khôi phục ván đang chơi dở.', 'ok'); };
    paint();
  }

  /* ================= Luật chơi ================= */
  G.setRules('dice', ['Máy chủ lăn một số từ 1 đến 100. Bấm “Dưới” (thắng nếu số ≤ 45) hoặc “Trên” (thắng nếu số ≥ 56) là lăn ngay.', 'Tỷ lệ thắng cố định 45%, thắng nhận cược × 2. Phím Space = lăn lại theo hướng vừa chọn.', 'Hoàn trả lý thuyết 90%.']);
  G.setRules('plinko', ['Bóng rơi qua 16 hàng chốt, mỗi hàng sang trái hoặc phải với xác suất 50%. Ô cuối (0–16) quyết định hệ số.', 'Chỉ 3 ô giữa dưới ×1; 14 ô còn lại đều lãi (từ ×1,5) → thắng ≈ 45% ở cả ba mức. Rủi ro Thấp (tối đa ×4), Vừa (tối đa ×23), Cao (tối đa ×80).', 'Hoàn trả lý thuyết ≈ 89–90% cho cả ba mức. Phím Space = thả tiếp.']);
  G.setRules('scratch', ['Thẻ có 9 ô, mỗi ô là một biểu tượng chọn độc lập; thẻ tự cào ngay khi mua. Trúng nếu có biểu tượng xuất hiện từ 3 lần trở lên; nếu nhiều biểu tượng cùng đủ 3 lần, tính hệ số cao nhất.', 'Hệ số = hệ số biểu tượng × hệ số số lần (3 ô ×1, 4 ô ×3, 5 ô ×10, 6 ô ×30, 7 ô ×60, 8 ô ×100, 9 ô ×200). Hệ số biểu tượng: 🍒🍋🍊🍇🍉🍑 ×1,2 · 🔔🍀 ×1,45 · ❤️ ×1,7 · 🌙 ×1,9 · ⭐ ×2,4 · 🌈 ×3,6 · 💠 ×4,8 · 👑 ×7,2 · 💎 ×12 · 7️⃣ ×30.', 'Kết quả đã chốt ở máy chủ trước khi cào. Khoảng 45% số thẻ trúng; hoàn trả lý thuyết ≈ 89–90%.']);
  G.setRules('keno', ['Chọn 1–5 số trong 1–22 (hoặc bấm Chọn nhanh). Máy chủ rút một số bóng khác nhau tuỳ số bạn chọn: chọn 1 → rút 10, 2 → 15, 3 → 17, 4 → 13, 5 → 19.', 'Thắng khi: chọn 1 trúng 1 (×1,98) · chọn 2 trúng cả 2 (×1,98) · chọn 3 trúng cả 3 (×2,04) · chọn 4 trúng 3 (×1,4) hoặc 4 (×4,19) · chọn 5 trúng cả 5 (×2,04).', 'Với mọi lựa chọn, tỷ lệ thắng ≈ 44–45% và hoàn trả ≈ 90%. Phím Space = chơi tiếp với các số đang chọn.']);
  G.setRules('coin', ['Bấm Tung: máy chủ mở ván và tung luôn; bạn luôn chọn Ngửa, mỗi lần thắng 45%. Thắng k lần liên tiếp có hệ số 0,9 ÷ 0,45^k (×2, ×4,44, ×9,88, …), trần ×100.', '“Tự rút ở ×X” (mặc định ×2 = rút sau 1 lần thắng, thắng 45%). Đặt 0 để tự quyết định Tung tiếp / Rút; thua một lần là mất cược.', 'Hoàn trả lý thuyết 90% với mọi lúc rút. Ván dở được khôi phục khi tải lại trang.']);

  /* ================= Đăng ký ================= */
  const B2 = { dice: buildDice, plinko: buildPlinko, scratch: buildScratch, keno: buildKeno, coin: buildCoin };
  Object.keys(B2).forEach(n => {
    K.BUILD[n] = B2[n];
    G.register(n, { mount(stage) { K.mountGame(n, stage); }, unmount() { K.unmountGame(n); }, resume() { K.resumeGame(n); } });
  });
})();

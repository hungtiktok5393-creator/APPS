/* Spelling Mastery – 5 trò chơi điểm ảo (slots, wheel, hilo, mines, crash) gắn vào window.SMGame. Xuất window.SMGameKit cho games2.js (5 trò mới).
 * Tốc độ: trừ cược trên màn hình ngay khi bấm; quay tự do bắt đầu tức thì; chế độ Nhanh (SMGame.fast) rút gần hết diễn hoạt.
 * Nguyên tắc: kết quả LUÔN do máy chủ trả (API_SPEC_GAMES.md); client chỉ diễn hoạt bằng CSS/WAAPI/canvas.
 * Mọi dữ liệu từ máy chủ hiển thị bằng textContent (không innerHTML). Không thư viện ngoài.
 * Quyết định tự chọn (ghi lại):
 *  - Khoá tên biểu tượng slots: cherry/lemon/bell/star/diamond/seven (không biết thì hiện nguyên chữ).
 *  - Hilo: suit 0–3 hiển thị ♠ ♥ ♦ ♣; hệ số bước kế tự tính theo công thức trong spec (ưu tiên giá trị `next` nếu khớp).
 *  - Thao tác ghi: mỗi thao tác logic có 1 requestId; lỗi mạng/bận → giữ nguyên requestId + tham số để "Thử lại" (replay an toàn).
 *  - Ván dở: mọi trò tự gọi getActiveGame khi gắn; ván của trò khác → nút chuyển sang trò đó.
 *  - Khi rời khu trò chơi (smgame:stop) trò bị dọn; quay lại sẽ tự gắn lại và đồng bộ từ máy chủ.
 *  - Nhịp nhanh, liên tục: phím Space/Enter = chơi ván kế (c.hot); diễn hoạt ngắn; ván nhiều bước có "Tự rút ở ×X" (máy chủ tự chốt, bớt một lần bấm).
 *  - Tỷ lệ thắng mục tiêu ≈ 45% mỗi ván (bảng hệ số ở Games.gs). */
(() => {
  'use strict';
  const G = window.SMGame;
  if (!G) { console.warn('games.js: không thấy window.SMGame (student.js chưa nạp).'); return; }

  /* ================= Tiện ích ================= */
  const FOREVER = new Promise(() => {}); // treo mãi: dùng để dừng chuỗi async của trò đã bị dọn
  const nf = n => Number(n || 0).toLocaleString('vi-VN');
  const sg = n => (n > 0 ? '+' : n < 0 ? '−' : '') + nf(Math.abs(n));
  const fx = (m, fixed) => '×' + (+m || 0).toLocaleString('vi-VN', { minimumFractionDigits: fixed ? 2 : 0, maximumFractionDigits: 2 });
  const el = (tag, cls, text, attrs) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  };
  const btn = (cls, text, fn, attrs) => { const b = el('button', 'btn ' + cls, text, Object.assign({ type: 'button' }, attrs)); if (fn) b.onclick = fn; return b; };
  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} }
  };
  const ORDER = ['slots', 'wheel', 'hilo', 'mines', 'crash', 'dice', 'plinko', 'scratch', 'keno', 'coin'];
  const NAMES = { slots: 'Máy quay', wheel: 'Vòng quay', hilo: 'Cao–Thấp', mines: 'Dò mìn', crash: 'Tên lửa', dice: 'Xúc xắc', plinko: 'Plinko', scratch: 'Thẻ cào', keno: 'Keno mini', coin: 'Tung xu' };
  const INSTANT = new Set(['slots', 'wheel', 'dice', 'plinko', 'scratch', 'keno']); // ván một phát: không có trạng thái dở
  function gotoGame(n) { const t = document.querySelector('#gtabs [data-game="' + n + '"]'); if (t) t.click(); }
  function unlockStage() { const s = G.stage; if (s) s.inert = false; const l = document.getElementById('game-lock'); if (l) l.hidden = true; }

  const MSG = {
    daily_limit: 'Hôm nay bạn đã chạm hạn mức lỗ. Hẹn gặp lại ngày mai nhé!',
    bet_too_high: 'Mức cược cao quá so với luật hiện tại. Hãy giảm cược rồi thử lại.',
    insufficient: 'Số dư không đủ cho mức cược này.',
    insufficient_balance: 'Số dư không đủ cho mức cược này.',
    insufficient_funds: 'Số dư không đủ cho mức cược này.',
    game_active: 'Bạn đang có một ván dở. Hãy chơi tiếp hoặc kết thúc ván đó trước.',
    no_game: 'Không có ván nào đang mở để thao tác. Hãy kiểm tra lại ván.',
    games_disabled: 'Giáo viên đang tắt trò này (hoặc cả khu trò chơi). Hãy thử lại sau.',
    game_disabled: 'Giáo viên đang tắt trò này. Hãy thử trò khác.',
    bad_request: 'Yêu cầu chưa hợp lệ. Kiểm tra mức cược rồi thử lại.',
    rate_limited: 'Bạn thao tác hơi nhanh. Chờ một giây rồi thử lại.',
    busy: 'Máy chủ đang bận. Thử lại sau ít giây.',
    server_error: 'Máy chủ gặp lỗi. Thử lại sau ít giây.'
  };
  const RETRY = new Set(['network', 'busy', 'server_error', 'rate_limited']);
  const friendly = e => MSG[e && e.code] || (e && /^(network|no_url|invalid_code|code_disabled)$/.test(e.code) ? e.message : 'Có lỗi xảy ra. Thử lại nhé.');

  /* Ô "Tự rút ở ×X" cho ván nhiều bước (hilo, mines, crash, coin). 0 hoặc để trống = tắt. Lưu theo trò trong localStorage. */
  const AUTO_DEF = { hilo: 1.55, mines: 1.55, crash: 2, coin: 2 };
  function autoBox(game, onChange) {
    const key = 'sm_auto_' + game, raw = ls.get(key), v0 = raw == null ? AUTO_DEF[game] : (+raw || 0);
    const inp = el('input', 'gm-auto-in', null, { type: 'number', min: '0', max: '100', step: '0.05', inputmode: 'decimal', 'aria-label': 'Tự rút khi hệ số đạt (0 = tắt)' });
    inp.value = v0 ? String(v0) : '0';
    const box = el('label', 'gm-auto'); box.append(el('span', '', 'Tự rút ở ×'), inp, el('small', 'gm-auto-h', '(0 = tắt)'));
    const get = () => { const a = +String(inp.value).replace(',', '.'); return isFinite(a) && a >= 1.01 ? Math.min(100, Math.floor(a * 100 + 1e-9) / 100) : 0; };
    inp.addEventListener('change', () => { const a = get(); inp.value = String(a); ls.set(key, String(a)); if (onChange) onChange(a); });
    inp.addEventListener('input', () => { if (onChange) onChange(get()); });
    return { box, get, set: a => { inp.value = String(a || 0); }, inp };
  }

  /* Phím tắt: Space / Enter (khi không gõ trong ô nhập, không đứng trên nút) = thao tác chính của trò đang mở → chơi liên tục không cần chuột */
  document.addEventListener('keydown', e => {
    if (e.repeat || e.altKey || e.ctrlKey || e.metaKey || (e.key !== ' ' && e.key !== 'Enter')) return;
    const c = current && insts[current]; if (!c || !c.hot || !c.alive) return;
    const t = e.target; if (t && t.closest && t.closest('input,textarea,select,button,a,[contenteditable="true"],dialog')) return;
    const panel = document.getElementById('p-tro-choi'); if (panel && panel.hidden) return;
    e.preventDefault(); c.hot();
  });

  /* Nếu ván đã xong mà trò đã bị dọn (đổi tab giữa chừng) thì vẫn ghi nhận vào thống kê phiên */
  function late(c, r) {
    if (!r) return;
    if (typeof r.net === 'number') G.settle({ delta: r.net, balance: r.balance });
    else if (r.result === 'crash') G.settle({ delta: -(+r.bet || c.bet0 || 0), balance: r.balance });
  }

  /* ================= Bối cảnh (ctx) mỗi lần gắn một trò ================= */
  const insts = {};
  let current = null, needRemount = null;

  function makeCtx(name) {
    const c = { name, alive: true, busy: false, active: false, pend: null, lastFn: null, otherActive: null, syncStarted: false, bet0: 0, rtt: 0, zones: [], timers: new Set(), anims: new Set(), raf: 0, focus: null };
    c.root = el('div', 'gm gm-' + name);
    c.note = el('div', 'gm-note', null, { role: 'status' }); c.note.hidden = true;
    c.res = el('div', 'gm-result', null, { role: 'status' }); c.res.hidden = true;
    c.root.append(c.note);
    c.onIdle = () => {};
    c.onRestore = () => c.onIdle();

    c.wait = ms => new Promise(res => {
      if (!c.alive) return;
      const t = setTimeout(() => { c.timers.delete(t); res(); }, G.reducedMotion ? Math.min(ms, 120) : G.fast ? Math.round(ms * .3) : ms);
      c.timers.add(t);
    });
    c.every = (fn, ms) => { const t = setInterval(fn, ms); c.timers.add(t); return t; };
    c.clear = t => { clearTimeout(t); clearInterval(t); c.timers.delete(t); };
    c.stopLoop = () => { if (c.raf) cancelAnimationFrame(c.raf); c.raf = 0; };
    c.loop = fn => { c.stopLoop(); const step = t => { if (!c.alive) return; c.raf = requestAnimationFrame(step); fn(t); }; c.raf = requestAnimationFrame(step); };
    c.anim = (e, kf, o) => {
      if (!c.alive) return FOREVER;
      if (G.reducedMotion || !e.animate) return Promise.resolve();
      const a = e.animate(kf, G.fast && o && o.duration ? Object.assign({}, o, { duration: Math.max(40, Math.round(o.duration * .25)) }) : o); c.anims.add(a);
      return a.finished.catch(() => {}).then(() => { c.anims.delete(a); return c.alive ? undefined : FOREVER; });
    };
    c.dispose = () => {
      if (c.cleanup) { try { c.cleanup(); } catch (_) {} }   // trò có thể cần chốt sổ trước khi bị dọn (ví dụ thẻ cào chưa cào hết)
      c.alive = false;
      c.timers.forEach(t => { clearTimeout(t); clearInterval(t); }); c.timers.clear();
      c.stopLoop();
      c.anims.forEach(a => { try { a.cancel(); } catch (_) {} }); c.anims.clear();
    };

    /* Khoá các vùng thao tác khi đang gọi API hoặc đang chờ "Thử lại" (chống bấm đúp) */
    c.lock = () => {
      const on = c.busy || !!c.pend;
      if (on && !c.focus) { const a = document.activeElement; if (a && c.root.contains(a)) c.focus = a; }
      c.zones.forEach(z => { z.inert = on; z.classList.toggle('is-busy', on); });
      c.root.setAttribute('aria-busy', on ? 'true' : 'false');
      if (!on && c.focus) { const f = c.focus; c.focus = null; if (f.isConnected && !f.disabled) { try { f.focus({ preventScroll: true }); } catch (_) {} } }
    };
    c.run = async fn => {
      if (c.busy || !c.alive) return;
      c.busy = true; c.lastFn = fn; c.lock();
      try { await fn(); }
      catch (e) { if (c.alive) c.fail(e); }
      finally { if (c.alive) { c.busy = false; c.lock(); } }
    };
    c.say = (msg, kind) => {
      c.note.className = 'gm-note' + (kind ? ' ' + kind : ''); c.note.replaceChildren();
      c.note.hidden = !msg; if (msg) c.note.append(el('span', '', msg));
    };
    c.fail = e => {
      G.sfx('error'); c.say(friendly(e), 'err');
      const row = el('div', 'gm-note-act');
      if (c.pend && RETRY.has(e.code)) {
        row.append(btn('small primary', 'Thử lại', () => c.run(c.lastFn)),
          btn('small ghost', 'Kiểm tra ván', () => { c.pend = null; c.lock(); c.sync(); }));
      } else if (e.code === 'game_active' || e.code === 'no_game') row.append(btn('small', 'Kiểm tra ván', () => c.sync()));
      if (row.children.length) c.note.append(row);
    };
    c.begin = () => { c.active = true; unlockStage(); };
    /* Trừ cược trên màn hình ngay (số thật vẫn do máy chủ trả); lỗi → khôi phục */
    c.hold = bet => { const before = G.getBalance(); c.setBal(Math.max(0, before - bet)); return before; };
    c.unhold = before => { if (c.alive) G.setBalance(before); };
    c.setBal = n => { G.setBalance(n); if (c.active) unlockStage(); };
    c.bet = () => {
      if (c.otherActive) { c.say('Bạn đang có ván ' + (NAMES[c.otherActive] || 'khác') + ' dở. Hãy chơi tiếp ván đó trước.', 'warn'); return 0; }
      const p = G.canPlay(); if (!p.ok) { c.say(p.reason, 'err'); return 0; }
      const b = G.betValue();
      if (b < 1) { c.say('Hãy nhập mức cược từ 1 điểm trở lên.', 'err'); return 0; }
      if (b > G.getBalance()) { c.say(MSG.insufficient, 'err'); return 0; }
      c.bet0 = b; return b;
    };

    /* Gọi API thường (đọc) */
    c.api = async (action, params) => {
      const r = await G.api(action, params || {});
      if (!c.alive) { late(c, r); await FOREVER; }
      if (c.active) unlockStage();
      return r;
    };
    /* Gọi API ghi: requestId idempotent, giữ nguyên khi phải thử lại */
    c.send = async (action, params, o) => {
      if (!c.pend || c.pend.action !== action) c.pend = { action, params: params || {}, rid: G.requestId() };
      const p = c.pend; let r;
      try { r = await G.api(action, Object.assign({}, p.params, { requestId: p.rid })); }
      catch (e) { if (!RETRY.has(e.code)) c.pend = null; throw e; }
      c.pend = null;
      if (!c.alive) { late(c, r); await FOREVER; }
      if (o && o.hold != null) c.setBal(o.hold); // giữ số dư cũ tới khi diễn hoạt xong (không lộ kết quả sớm)
      else if (c.active) unlockStage();
      return r;
    };

    /* Kết thúc ván: banner kết quả + sfx + ghi nhận phiên */
    /* near: dòng "suýt trúng" – CHỈ mô tả kết quả thật máy chủ đã trả (không sắp đặt kết quả) */
    c.finish = (r, title, near) => {
      const bet = +r.bet || 0, payout = +r.payout || 0, net = typeof r.net === 'number' ? r.net : payout - bet;
      c.active = false;
      c.res.hidden = false; c.res.className = 'gm-result ' + (net > 0 ? 'win' : net < 0 ? 'lose' : 'even') + (near ? ' near' : '');
      c.res.replaceChildren(
        el('b', 'gm-r1', (net > 0 ? 'Thắng ' : net < 0 ? 'Thua ' : 'Hòa vốn ') + (net ? sg(net) + ' điểm' : '')),
        el('span', 'gm-r2', [title, 'Cược ' + nf(bet) + ' → nhận ' + nf(payout)].filter(Boolean).join(' · ')));
      if (near) {
        const n = el('span', 'gm-near', near); c.res.append(n);
        c.anim(n, [{ transform: 'scale(.8)', opacity: 0 }, { transform: 'scale(1.08)', opacity: 1 }, { transform: 'scale(1)' }], { duration: 260 });
      }
      G.sfx(near && net <= 0 ? 'near' : net > 0 ? 'win' : net < 0 ? 'lose' : 'coin');
      G.settle({ delta: net, balance: r.balance });
      c.lock();
    };

    /* Đồng bộ ván đang mở từ máy chủ */
    c.sync = () => {
      c.syncStarted = true;
      return c.run(async () => {
        c.pend = null; c.say('');
        const t0 = performance.now(), r = await c.api('getActiveGame', {});
        c.rtt = performance.now() - t0; c.otherActive = null;
        const crashed = r.result === 'crash', act = !crashed && r.active && r.game ? String(r.game) : null;
        if (crashed && c.name === 'crash') return c.onRestore('crash', r);
        if (r.game === 'crash' && r.result === 'cashout' && r.active === false) {   // ván Tên lửa đã được máy chủ tự rút khi bạn vắng mặt
          if (c.name === 'crash' && +r.bet > 0) { c.bet0 = +r.bet; return c.onRestore('cashed', r); }
          late(c, r); G.toast('Ván Tên lửa trước đã tự rút ở ' + fx(r.mult, true) + ' (+' + nf(r.net) + ' điểm).');
        }
        if (act === c.name) return c.onRestore('view', r);
        if (crashed) {
          late(c, r);
          G.toast('Ván Tên lửa trước đó đã nổ' + (r.crashPoint != null ? ' ở ' + fx(r.crashPoint, true) : '') + '.');
        } else if (act && !INSTANT.has(act)) {
          c.otherActive = act;
          c.say('Bạn đang có ván ' + (NAMES[act] || act) + ' dở.', 'warn');
          const row = el('div', 'gm-note-act');
          row.append(btn('small primary', 'Chơi tiếp ' + (NAMES[act] || ''), () => gotoGame(act)));
          c.note.append(row);
        }
        c.onIdle();
      });
    };
    return c;
  }

  /* ================= 1. MÁY QUAY (slots) ================= */
  const SYM = { cherry: '🍒', lemon: '🍋', bell: '🔔', star: '⭐', diamond: '💎', gem: '💎', seven: '7️⃣', '7': '7️⃣' };
  const SYM_LIST = ['🍒', '🍋', '🔔', '⭐', '💎', '7️⃣'];
  const sym = k => SYM[String(k).toLowerCase()] || String(k);
  const TRIPLE = { cherry: 4, lemon: 5, bell: 6, star: 9, diamond: 18, seven: 45 };   // giống G_SLOT_TRIPLE (chỉ để viết dòng "suýt trúng")

  function buildSlots(c) {
    const reels = [0, 1, 2].map(() => { const win = el('div', 'sl-reel'), strip = el('div', 'sl-strip'); win.append(strip); return { win, strip, face: '❔' }; });
    const machine = el('div', 'sl-machine', null, { role: 'img', 'aria-label': 'Máy quay ba cuộn' });
    reels.forEach(rl => { rl.strip.append(el('span', 'sl-sym', rl.face)); machine.append(rl.win); });
    const go = btn('primary big gm-go', 'Quay', () => c.run(spin));
    const zone = el('div', 'gm-ctl'); zone.append(go); c.zones.push(zone);
    const pay = el('p', 'hint gm-pay', '3 giống: 🍒×4 · 🍋×5 · 🔔×6 · ⭐×9 · 💎×18 · 7️⃣×45. 2 giống: 🍒🍋×1,2 · 🔔×1,3 · ⭐×1,4 · 💎×1,6 · 7️⃣×2. Còn lại: ×0.');
    c.root.append(machine, c.res, zone, pay);
    c.hot = () => c.run(spin);

    const rnd = () => SYM_LIST[Math.floor(Math.random() * SYM_LIST.length)];
    const fill = (rl, list) => rl.strip.replaceChildren(...list.map(s => el('span', 'sl-sym', s)));
    function spinning(rl) {
      if (G.reducedMotion) { fill(rl, ['…']); return; }
      const a = Array.from({ length: 6 }, rnd); fill(rl, a.concat(a)); rl.strip.classList.add('spinning');
    }
    function show(rl, s) { rl.strip.classList.remove('spinning'); fill(rl, [s]); rl.face = s; }
    async function land(rl, s) {
      rl.strip.classList.remove('spinning');
      fill(rl, [s].concat(Array.from({ length: 5 }, rnd))); rl.face = s;
      await c.anim(rl.strip, [{ transform: 'translateY(-83.3333%)' }, { transform: 'translateY(0)' }], { duration: 200, easing: 'cubic-bezier(.2,.8,.25,1)' });
      fill(rl, [s]);
    }
    async function spin() {
      const bet = c.pend ? c.pend.params.bet : c.bet(); if (!bet) return;
      c.res.hidden = true; c.say(''); c.begin();
      const before = c.hold(bet);
      reels.forEach(rl => { rl.win.classList.remove('win'); spinning(rl); });
      G.sfx('spin');
      let r;
      try { r = await c.send('slotsSpin', { bet }, { hold: before - bet }); }
      catch (e) { c.active = false; c.unhold(before); reels.forEach(rl => show(rl, rl.face)); throw e; }
      const raw = (r.reels || []).slice(0, 3).map(String), keys = raw.map(sym);
      await Promise.all(reels.map((rl, i) => c.wait(i * 60).then(() => land(rl, keys[i] || '❔')).then(() => G.sfx('tick'))));
      if (+r.mult > 0 && raw.length === 3) { // chỉ tô sáng ô thật sự được trả thưởng
        let w = [];
        if (raw[0] === raw[1] && raw[1] === raw[2]) w = [0, 1, 2];
        else if (raw[0] === raw[1]) w = [0, 1]; else if (raw[1] === raw[2]) w = [1, 2]; else if (raw[0] === raw[2]) w = [0, 2];
        w.forEach(i => reels[i].win.classList.add('win'));
      }
      let near = '';   // đúng 2 giống → thêm 1 nữa là bộ ba
      if (raw.length === 3 && !(raw[0] === raw[1] && raw[1] === raw[2])) {
        const p = raw[0] === raw[1] || raw[0] === raw[2] ? raw[0] : raw[1] === raw[2] ? raw[1] : null;
        if (p && TRIPLE[p]) near = 'Suýt nổ hũ! Thêm 1 ' + sym(p) + ' nữa là ' + fx(TRIPLE[p]);
      }
      c.finish(r, 'Hệ số ' + fx(r.mult), near);
    }
  }

  /* ================= 2. VÒNG QUAY (wheel) ================= */
  const WCOL = { 0: '#475569', 0.5: '#b45309', 1.5: '#15803d', 2: '#1d4ed8', 3: '#1d4ed8', 5: '#7e22ce', 10: '#7e22ce' };
  const wcol = m => WCOL[m] || '#0f766e';
  function defaultSegs() { // bố cục tạm trước lần quay đầu (xác suất đúng như luật; thứ tự thật lấy từ máy chủ)
    const spec = [[5, 1], [2, 3], [0.5, 8], [1.5, 14], [0, 14]], out = new Array(40).fill(null);
    spec.forEach(([m, n], si) => { for (let k = 0; k < n; k++) { let p = Math.round((k + 0.5 + si * 0.13) * 40 / n) % 40; while (out[p] !== null) p = (p + 1) % 40; out[p] = m; } });
    return out;
  }
  function drawWheel(cv, segs) {
    const g = cv.getContext('2d'); if (!g) return;
    const S = cv.width, C = S / 2, R = C - 6, A = 2 * Math.PI / segs.length;
    g.clearRect(0, 0, S, S); g.lineWidth = 2; g.font = 'bold 26px system-ui, sans-serif'; g.textAlign = 'right'; g.textBaseline = 'middle';
    segs.forEach((m, i) => {
      const a0 = -Math.PI / 2 + i * A;
      g.beginPath(); g.moveTo(C, C); g.arc(C, C, R, a0, a0 + A); g.closePath();
      g.fillStyle = wcol(m); g.fill(); g.strokeStyle = 'rgba(255,255,255,.85)'; g.stroke();
      g.save(); g.translate(C, C); g.rotate(a0 + A / 2); g.fillStyle = '#fff'; g.fillText(fx(m), R - 14, 0); g.restore();
    });
    g.beginPath(); g.arc(C, C, R, 0, 2 * Math.PI); g.lineWidth = 6; g.strokeStyle = '#1e293b'; g.stroke();
  }

  function buildWheel(c) {
    let segs = defaultSegs(), ang = 0, mode = 'idle';
    const W_OM = 540; // độ/giây khi quay tự do
    const wrap = el('div', 'wh-wrap'), cv = el('canvas', 'wh-cv', null, { width: 600, height: 600, 'aria-hidden': 'true' });
    const hub = el('div', 'wh-hub', '🎡'); wrap.append(cv, el('div', 'wh-ptr'), hub);
    const legend = el('ul', 'wh-legend');
    const go = btn('primary big gm-go', 'Quay vòng', () => c.run(spin));
    const zone = el('div', 'gm-ctl'); zone.append(go); c.zones.push(zone);
    c.root.append(wrap, legend, c.res, zone);
    c.hot = () => c.run(spin);

    function paint() {
      drawWheel(cv, segs);
      const cnt = {}; segs.forEach(m => { cnt[m] = (cnt[m] || 0) + 1; });
      legend.replaceChildren();
      Object.keys(cnt).map(Number).sort((a, b) => a - b).forEach(m => {
        const li = el('li'), dot = el('span', 'wh-dot'); dot.style.background = wcol(m);
        li.append(dot, el('span', '', fx(m) + ' · ' + cnt[m] + ' ô')); legend.append(li);
      });
    }
    function setAng(a) { ang = a; cv.style.transform = 'rotate(' + a.toFixed(2) + 'deg)'; }
    function free() {
      if (G.reducedMotion) return;
      mode = 'free'; let last = 0;
      c.loop(t => { if (mode !== 'free') return; if (last) setAng(ang + W_OM * (t - last) / 1000); last = t; });
    }
    function halt() { mode = 'idle'; c.stopLoop(); }
    function landOn(idx) {
      return new Promise(res => {
        const per = 360 / segs.length, target = -((idx + 0.5) * per);
        ang = ((ang % 360) + 360) % 360;
        if (G.reducedMotion) { setAng(((target % 360) + 360) % 360); return res(); }
        const dur = G.fast ? 300 : 800, d0 = W_OM * dur / 3000, need = (((target - ang) % 360) + 360) % 360;
        const d = d0 + ((((need - d0) % 360) + 360) % 360); // đủ vòng, dừng đúng giữa ô `idx` ngay dưới kim
        const t0 = performance.now(), a0 = ang; let lastTick = 0, lastSeg = -1; mode = 'dec';
        c.loop(t => {
          const k = Math.max(0, Math.min(1, (t - t0) / dur)), a = a0 + d * (1 - Math.pow(1 - k, 3));
          setAng(a);
          const si = Math.floor(a / per);
          if (si !== lastSeg && t - lastTick > 90 && k < 1) { G.sfx('tick'); lastTick = t; }
          lastSeg = si;
          if (k >= 1) { mode = 'idle'; c.stopLoop(); res(); }
        });
      });
    }
    async function spin() {
      const bet = c.pend ? c.pend.params.bet : c.bet(); if (!bet) return;
      c.res.hidden = true; c.say(''); c.begin(); hub.textContent = '…'; G.sfx('spin'); free();
      const before = c.hold(bet);
      let r;
      try { r = await c.send('wheelSpin', { bet }, { hold: before - bet }); }
      catch (e) { c.active = false; c.unhold(before); halt(); hub.textContent = '🎡'; throw e; }
      let L = Array.isArray(r.segments) && r.segments.length >= 2 ? r.segments.map(Number) : segs.slice();
      const idx = Math.min(L.length - 1, Math.max(0, Math.floor(+r.index) || 0));
      if (L[idx] !== +r.mult) { L = L.slice(); L[idx] = +r.mult; } // luôn khớp hệ số máy chủ báo
      if (L.length !== segs.length || L.some((m, i) => m !== segs[i])) { segs = L; paint(); }
      await landOn(idx);
      hub.textContent = fx(r.mult);
      const nb = Math.max(segs[(idx + 1) % segs.length], segs[(idx - 1 + segs.length) % segs.length]);
      c.finish(r, 'Ô số ' + (idx + 1) + ' · Hệ số ' + fx(r.mult), +r.mult < 1 && nb >= 2 ? 'Suýt trúng! Kim dừng sát ô ' + fx(nb) : '');
    }
    paint();
  }

  /* ================= 3. CAO–THẤP (hilo) ================= */
  const RANK = [null, 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const SUIT = ['♠', '♥', '♦', '♣'], SUITN = ['bích', 'cơ', 'rô', 'chuồn'];
  const cardName = cd => (cd ? (RANK[cd.rank] || '?') + ' ' + (SUITN[cd.suit] || '') : '');
  function setCard(e, cd) {
    e.className = 'pc'; e.replaceChildren();
    if (!cd) { e.classList.add('back'); e.append(el('span', 'pc-q', '?')); e.setAttribute('aria-label', 'Lá bài úp'); return; }
    e.classList.add(cd.suit === 1 || cd.suit === 2 ? 'red' : 'blk');
    e.append(el('span', 'pc-r', RANK[cd.rank] || '?'), el('span', 'pc-s', SUIT[cd.suit] || ''));
    e.setAttribute('aria-label', 'Lá ' + cardName(cd));
  }

  function buildHilo(c) {
    const H = { bet: 0, card: null, steps: 0, mult: null, pay: null, srv: null, trail: [] };
    const cur = el('div', 'pc'), nxt = el('div', 'pc'); setCard(cur, null); setCard(nxt, null);
    const table = el('div', 'hi-table'); table.append(cur, el('span', 'hi-vs', '→', { 'aria-hidden': 'true' }), nxt);
    const trail = el('div', 'hi-trail', null, { 'aria-label': 'Các lá đã qua' });
    const info = el('p', 'gm-info');
    const gb = (dir, label) => { const b = el('button', 'btn hi-g', null, { type: 'button' }); b.append(el('b', '', label), el('small', '', '')); b.onclick = () => c.run(() => guess(dir)); return b; };
    const hi = gb('higher', '▲ Cao hơn'), lo = gb('lower', '▼ Thấp hơn');
    const go = btn('primary big gm-go', 'Bắt đầu ván', () => c.run(start));
    const cash = btn('big hi-cash', 'Rút', () => c.run(cashout));
    const guesses = el('div', 'hi-guess'); guesses.append(hi, lo);
    const auto = autoBox('hilo', () => paint());
    const zone = el('div', 'gm-ctl'); zone.append(go, auto.box, guesses, cash); c.zones.push(zone);
    c.root.append(table, trail, info, c.res, zone);
    /* Space/Enter: chưa có ván → bắt đầu; đang chơi → đoán phía có nhiều lá thắng hơn */
    c.hot = () => { if (!c.active) return c.run(start); if (!H.card) return; const rk = H.card.rank; c.run(() => guess(13 - rk >= rk - 1 ? 'higher' : 'lower')); };

    const srv = (side, calc) => { // ưu tiên hệ số máy chủ báo nếu khớp công thức
      const v = H.srv && H.srv[side], s = typeof v === 'number' ? v : v && typeof v === 'object' ? (v.mult != null ? v.mult : v.multiplier) : null;
      return typeof s === 'number' && Math.abs(s - calc) <= Math.max(0.03, calc * 0.02) ? s : calc;
    };
    function paintTrail() { trail.replaceChildren(); H.trail.slice(-8).forEach(cd => { const t = el('span', 'hi-chip' + (cd.suit === 1 || cd.suit === 2 ? ' red' : ''), (RANK[cd.rank] || '?') + (SUIT[cd.suit] || '')); t.setAttribute('aria-label', cardName(cd)); trail.append(t); }); }
    function paint() {
      const live = c.active;
      go.hidden = live; guesses.hidden = !live; cash.hidden = !live; auto.box.hidden = live;
      if (!live || !H.card) { const a = auto.get(); info.textContent = 'Bấm Bắt đầu (hoặc phím Space). Lá bằng nhau tính là thua.' + (a ? ' Tự rút khi đạt ' + fx(a) + '.' : ''); return; }
      const rk = H.card.rank, nHi = 13 - rk, nLo = rk - 1, base = H.mult == null ? 0.9 : H.mult;
      const mh = nHi > 0 ? srv('higher', base * 13 / nHi) : null, ml = nLo > 0 ? srv('lower', base * 13 / nLo) : null;
      hi.lastChild.textContent = nHi > 0 ? nHi + '/13 lá · ' + fx(mh) : 'Không thể'; hi.disabled = nHi <= 0;
      lo.lastChild.textContent = nLo > 0 ? nLo + '/13 lá · ' + fx(ml) : 'Không thể'; lo.disabled = nLo <= 0;
      const pay = H.pay != null ? H.pay : Math.round(H.bet * (H.mult || 0));
      cash.disabled = H.steps < 1;
      cash.textContent = H.steps > 0 ? 'Rút ' + nf(pay) + ' điểm (' + fx(H.mult) + ')' : 'Rút (cần đoán đúng ít nhất 1 lần)';
      info.textContent = 'Cược ' + nf(H.bet) + ' · Hệ số hiện tại ' + (H.mult == null ? '—' : fx(H.mult)) + ' · Đã đúng ' + H.steps + ' lần' + (H.auto ? ' · Tự rút ở ' + fx(H.auto) : '');
    }
    function load(r) {
      if (!r.card) throw Object.assign(new Error('x'), { code: 'server_error' });
      H.card = r.card; H.steps = Math.floor(+r.steps) || 0; H.mult = r.mult == null ? null : +r.mult;
      H.pay = typeof r.payoutNow === 'number' ? r.payoutNow : null; H.srv = r.next || null; H.auto = +r.auto || 0;
      setCard(cur, r.card); setCard(nxt, null); paintTrail(); paint();
    }
    async function flip(e, cd) {
      await c.anim(e, [{ transform: 'rotateY(0)' }, { transform: 'rotateY(90deg)' }], { duration: 50, easing: 'ease-in' });
      setCard(e, cd);
      await c.anim(e, [{ transform: 'rotateY(-90deg)' }, { transform: 'rotateY(0)' }], { duration: 60, easing: 'ease-out' });
    }
    async function start() {
      if (c.active) return;
      const bet = c.pend ? c.pend.params.bet : c.bet(); if (!bet) return;
      c.say(''); c.res.hidden = true;
      const r = await c.send('hiloStart', c.pend ? c.pend.params : { bet, auto: auto.get() });
      H.bet = +r.bet || bet; H.trail = []; c.begin(); G.sfx('click'); load(r);
      c.anim(cur, [{ transform: 'scale(.85)', opacity: .4 }, { transform: 'scale(1)', opacity: 1 }], { duration: 120 });
    }
    async function guess(dir) {
      if (!c.active) return;
      nxt.classList.add('wait'); G.sfx('click');
      let r; try { r = await c.send('hiloGuess', { guess: dir }); } finally { nxt.classList.remove('wait'); }
      await flip(nxt, r.card);
      if (r.active === false) { // thua, hoặc đạt trần ×100 tự rút
        if (r.prev && typeof r.prev === 'object') setCard(cur, r.prev);
        const lose = r.result === 'lose';
        const prevRank = typeof r.prev === 'object' && r.prev ? r.prev.rank : r.prev;
        const near = !lose ? '' : r.card && +prevRank === +r.card.rank ? 'Sát nút! Lá bằng nhau' : H.auto && H.steps >= 1 && (H.mult || 0) * 13 / 12 >= H.auto * 0.97 ? 'Chỉ còn 1 lần đoán đúng nữa là tự rút!' : '';
        c.finish(Object.assign({ bet: H.bet, payout: 0 }, r), lose ? 'Lá kế là ' + cardName(r.card) : 'Tự rút ' + fx(r.mult) + ' sau ' + r.steps + ' lần đoán đúng', near);
        paint();
      } else {
        G.sfx('coin'); H.trail.push(H.card); load(r);
        c.anim(cur, [{ transform: 'scale(.9)' }, { transform: 'scale(1)' }], { duration: 100 });
      }
    }
    async function cashout() {
      if (!c.active) return;
      const r = await c.send('hiloCashout', {});
      c.finish(Object.assign({ bet: H.bet }, r), 'Rút ở ' + fx(r.mult) + ' sau ' + H.steps + ' lần đoán đúng'); paint();
    }
    c.onIdle = () => { c.active = false; H.card = null; H.trail = []; setCard(cur, null); setCard(nxt, null); paintTrail(); paint(); };
    c.onRestore = (kind, r) => { H.bet = +r.bet || 0; H.trail = []; c.begin(); load(r); c.say('Đã khôi phục ván đang chơi dở.', 'ok'); };
    paint();
  }

  /* ================= 4. DÒ MÌN (mines) ================= */
  function buildMines(c) {
    const M = { bet: 0, mines: 8, steps: 0, mult: null, next: null, pay: null, auto: 0, set: new Set() };
    const saved = Math.floor(+ls.get('sm_mines2'));   // khoá mới: mặc định 8 mìn (tỷ lệ thắng ≈ 45% với Tự rút ×1,55)
    if (saved >= 1 && saved <= 10) M.mines = saved;
    const out = el('output', 'mn-count', String(M.mines), { 'aria-live': 'polite' });
    const minus = btn('mn-step', '−', () => stepMines(-1), { 'aria-label': 'Giảm số mìn' }), plus = btn('mn-step', '+', () => stepMines(1), { 'aria-label': 'Tăng số mìn' });
    const stepper = el('div', 'mn-stepper'); stepper.append(el('span', '', 'Số mìn'), minus, out, plus);
    const go = btn('primary big gm-go', 'Bắt đầu ván', () => c.run(start));
    const auto = autoBox('mines', () => paint());
    const setup = el('div', 'gm-ctl'); setup.append(stepper, auto.box, go);
    const info = el('p', 'gm-info');
    const grid = el('div', 'mn-grid', null, { role: 'group', 'aria-label': 'Bảng 25 ô' });
    const cells = Array.from({ length: 25 }, (_, i) => { const b = el('button', 'mn-cell', '', { type: 'button' }); b.onclick = () => c.run(() => (c.active ? reveal(i) : start(i))); grid.append(b); return b; });
    const cash = btn('big mn-cash', 'Rút', () => c.run(cashout));
    const play = el('div', 'gm-ctl'); play.append(grid, cash);
    c.zones.push(setup, play);
    c.root.append(setup, info, play, c.res);
    /* Space/Enter: chưa có ván → mở ván + lật một ô ngẫu nhiên; đang chơi → lật một ô ngẫu nhiên chưa lật */
    const rndCell = () => { const f = []; for (let i = 0; i < 25; i++) if (!M.set.has(i)) f.push(i); return f[Math.floor(Math.random() * f.length)]; };
    c.hot = () => { const i = rndCell(); if (i == null) return; c.run(() => (c.active ? reveal(i) : start(i))); };
    const surv = (m, k) => { let p = 1; for (let i = 0; i < k; i++) p *= (25 - m - i) / (25 - i); return p; };
    const mMult = (m, k) => Math.min(100, 0.9 / surv(m, k));
    const winChance = (m, a) => { if (!a) return null; for (let k = 1; k <= 25 - m; k++) { const p = surv(m, k); if (Math.min(100, 0.9 / p) >= a) return p; } return surv(m, 25 - m); };

    const cellLabel = (i, s) => 'Ô hàng ' + (Math.floor(i / 5) + 1) + ' cột ' + (i % 5 + 1) + ': ' + s;
    function reset() { cells.forEach((b, i) => { b.className = 'mn-cell'; b.textContent = ''; b.setAttribute('aria-label', cellLabel(i, 'chưa lật')); }); }
    function mark(i, kind) {
      const b = cells[i]; b.className = 'mn-cell ' + kind;
      b.textContent = kind === 'safe' ? '💎' : kind === 'hit' ? '💥' : '💣';
      b.setAttribute('aria-label', cellLabel(i, kind === 'safe' ? 'an toàn' : 'mìn'));
      if (kind === 'safe') c.anim(b, [{ transform: 'scale(.6)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 150 });
    }
    function showMines(list, hit) { (list || []).forEach(i => { if (cells[i] && !M.set.has(i)) mark(i, i === hit ? 'hit' : 'mine'); }); }
    function paint() {
      const live = c.active;
      go.disabled = live; minus.disabled = live || M.mines <= 1; plus.disabled = live || M.mines >= 10;
      cash.disabled = !live || M.steps < 1;
      cells.forEach((b, i) => { b.disabled = live && M.set.has(i); });   // chưa có ván: bấm ô là mở ván + lật luôn ô đó
      if (!live) {
        const a = auto.get(), w = winChance(M.mines, a);
        info.textContent = 'Bấm thẳng vào một ô để bắt đầu (hoặc phím Space).' + (a ? ' Tự rút ở ' + fx(a) + ' · tỷ lệ thắng ≈ ' + Math.round(w * 100) + '%.' : ' Càng nhiều mìn, hệ số càng cao.');
        cash.textContent = 'Rút'; return;
      }
      const pay = M.pay != null ? M.pay : Math.round(M.bet * (M.mult || 0)), left = 25 - M.mines - M.steps;
      cash.textContent = M.steps > 0 ? 'Rút ' + nf(pay) + ' điểm (' + fx(M.mult) + ')' : 'Rút (cần lật ít nhất 1 ô)';
      info.textContent = 'Cược ' + nf(M.bet) + ' · ' + M.mines + ' mìn · Hệ số ' + (M.mult == null ? '—' : fx(M.mult)) +
        (M.next != null ? ' · Ô kế ' + fx(M.next) : '') + ' · Ô kế an toàn: ' + Math.round(100 * left / (25 - M.steps)) + '%' + (M.auto ? ' · Tự rút ở ' + fx(M.auto) : '');
    }
    function stepMines(d) { M.mines = Math.max(1, Math.min(10, M.mines + d)); out.textContent = String(M.mines); ls.set('sm_mines2', String(M.mines)); G.sfx('click'); paint(); }
    function apply(r) {
      M.steps = Math.floor(+r.steps) || 0; M.mult = r.mult == null ? null : +r.mult; M.next = r.nextMult == null ? null : +r.nextMult;
      M.pay = typeof r.payoutNow === 'number' ? r.payoutNow : null; M.auto = +r.auto || 0;
    }
    function load(r) {
      M.mines = Math.floor(+r.mines) || M.mines; out.textContent = String(M.mines);
      M.set = new Set(r.revealed || []); apply(r); reset(); M.set.forEach(i => cells[i] && mark(i, 'safe')); paint();
    }
    async function start(cell) {
      if (c.active) return;
      const P = c.pend ? c.pend.params : { bet: c.bet(), mines: M.mines, auto: auto.get() }; if (!P.bet) return;
      if (cell != null && !c.pend) P.cell = cell;
      c.say(''); c.res.hidden = true; M.set = new Set(); reset();
      const i = P.cell; if (i != null) cells[i].classList.add('wait');
      const before = c.hold(P.bet);
      let r; try { r = await c.send('minesStart', P); } catch (e) { c.unhold(before); throw e; } finally { if (i != null) cells[i].classList.remove('wait'); }
      M.bet = +r.bet || P.bet; M.mines = Math.floor(+r.mines) || P.mines; out.textContent = String(M.mines); c.begin(); G.sfx('click');
      if (i == null) { load(r); return; }
      M.steps = 0; M.mult = null; M.auto = +r.auto || P.auto || 0;
      return outcome(r, i);   // mở ván + lật ô đầu tiên trong một yêu cầu
    }
    async function reveal(i) {
      if (!c.active || M.set.has(i)) return;
      cells[i].classList.add('wait');
      let r; try { r = await c.send('minesReveal', { cell: i }); } finally { cells[i].classList.remove('wait'); }
      return outcome(r, i);
    }
    function outcome(r, i) {
      if (r.result === 'lose') {
        const hit = r.hit != null ? r.hit : i; mark(hit, 'hit'); showMines(r.mines, hit);
        c.anim(grid, [{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }], { duration: 160 });
        const k = Math.floor(+r.steps) || 0, nextM = mMult(M.mines, k + 1);
        c.finish(Object.assign({ bet: M.bet, payout: 0 }, r), 'Trúng mìn sau ' + k + ' ô an toàn', M.auto && k >= 1 && nextM >= M.auto ? 'Suýt thắng! Chỉ còn 1 ô nữa là tự rút ' + fx(nextM) : ''); paint();
      } else if (r.result === 'cashout' || r.active === false) { // lật hết / đạt trần: máy chủ tự rút
        mark(i, 'safe'); M.set.add(i); showMines(r.mines);
        c.finish(Object.assign({ bet: M.bet }, r), 'Tự rút ở ' + fx(r.mult) + ' sau ' + r.steps + ' ô'); paint();
      } else {
        M.set = new Set(r.revealed || Array.from(M.set).concat(i)); mark(i, 'safe'); apply(r); G.sfx('coin'); paint();
      }
    }
    async function cashout() {
      if (!c.active) return;
      const r = await c.send('minesCashout', {});
      showMines(r.mines);
      c.finish(Object.assign({ bet: M.bet }, r), 'Rút ở ' + fx(r.mult) + ' sau ' + M.steps + ' ô'); paint();
    }
    c.onIdle = () => { c.active = false; M.set = new Set(); M.steps = 0; M.mult = null; reset(); paint(); };
    c.onRestore = (kind, r) => { M.bet = +r.bet || 0; c.begin(); load(r); c.say('Đã khôi phục ván đang chơi dở.', 'ok'); };
    reset(); paint();
  }

  /* ================= 5. TÊN LỬA (crash) ================= */
  const STARS = Array.from({ length: 28 }, (_, i) => [(i * 97) % 720, (i * 53) % 360, (i % 3) + 1]);

  function buildCrash(c) {
    const K = { bet: 0, startedAt: 0, offset: 0, rate: 0.2, minCash: 1.01, auto: 0, live: false, cashing: false, frozen: 1, frozenT: 0, polling: false, shown: null, lastM: 1, pt: 0, endT: 0 };
    const wrap = el('div', 'cr-wrap'), cv = el('canvas', 'cr-cv', null, { width: 720, height: 360, 'aria-hidden': 'true' });
    const big = el('div', 'cr-mult', '×1,00', { 'aria-hidden': 'true' }), sub = el('div', 'cr-sub', 'Sẵn sàng');
    wrap.append(cv, big, sub);
    const go = btn('primary big gm-go', 'Phóng tên lửa', () => c.run(start));
    const cash = btn('big cr-cash', 'Rút', null); cash.hidden = true;
    cash.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse' || e.button === 0) cashClick(); }); // phản hồi ngay khi chạm
    cash.addEventListener('click', e => { if (e.detail === 0) cashClick(); });                                // bàn phím
    const auto = autoBox('crash', () => { if (!K.live) idleInfo(); });
    const zone = el('div', 'gm-ctl'); zone.append(auto.box, go, cash); c.zones.push(zone);
    const info = el('p', 'gm-info');
    c.root.append(wrap, info, c.res, zone);
    c.hot = () => { if (K.live) cashClick(); else c.run(start); };   // Space/Enter: phóng / rút
    const idleInfo = () => { const a = auto.get(); info.textContent = a ? 'Tự rút ở ' + fx(a, true) + ' · tỷ lệ thắng ' + Math.round(90 / a) + '%. Bấm Phóng (hoặc Space).' : 'Hệ số tăng theo thời gian. Rút trước khi nổ để nhận cược × hệ số.'; };

    const mAt = t => Math.floor(100 * Math.exp(K.rate * t)) / 100;       // m(t) = floor(100·e^(0,1·t))/100
    const tNow = () => Math.max(0, (Date.now() + K.offset - K.startedAt) / 1000);
    const setClock = (r, rtt) => { K.startedAt = +r.startedAt; K.offset = (+r.serverNow || Date.now()) + Math.min((rtt || 0) / 2, 400) - Date.now(); };

    function draw(t, mode) {
      const g = cv.getContext('2d'); if (!g) return;
      const W = cv.width, H = cv.height, P = 30, grad = g.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, '#0b1233'); grad.addColorStop(1, '#26337a'); g.fillStyle = grad; g.fillRect(0, 0, W, H);
      g.fillStyle = 'rgba(255,255,255,.55)'; STARS.forEach(s => g.fillRect(s[0], s[1], s[2], s[2]));
      const T = Math.max(8, t * 1.12), top = Math.max(2, Math.exp(K.rate * t) * 1.25);
      const X = tt => P + tt / T * (W - 2 * P), Y = mm => H - P - (mm - 1) / (top - 1) * (H - 2 * P);
      const stepM = [0.5, 1, 2, 5, 10, 20, 50, 100].find(s => (top - 1) / s <= 5) || 100;
      g.font = '20px system-ui, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'bottom';
      for (let m = 1 + stepM; m < top; m += stepM) { g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 1; g.beginPath(); g.moveTo(P, Y(m)); g.lineTo(W - P, Y(m)); g.stroke(); g.fillStyle = 'rgba(255,255,255,.55)'; g.fillText(fx(m), P + 4, Y(m) - 2); }
      const col = mode === 'boom' ? '#f87171' : mode === 'cash' ? '#4ade80' : '#7dd3fc';
      g.beginPath(); const N = 60;
      for (let i = 0; i <= N; i++) { const tt = t * i / N, x = X(tt), y = Y(Math.exp(K.rate * tt)); if (i) g.lineTo(x, y); else g.moveTo(x, y); }
      g.lineWidth = 5; g.lineJoin = 'round'; g.strokeStyle = col; g.stroke();
      g.lineTo(X(t), H - P); g.lineTo(X(0), H - P); g.closePath(); g.fillStyle = mode === 'boom' ? 'rgba(248,113,113,.14)' : 'rgba(125,211,252,.14)'; g.fill();
      const tx = X(t), ty = Y(Math.exp(K.rate * t));
      g.save(); g.translate(tx, ty); g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '46px system-ui, sans-serif';
      if (mode === 'boom') g.fillText('💥', 0, 0);
      else {
        const dx = (W - 2 * P) / T, dy = -(K.rate * Math.exp(K.rate * t)) / (top - 1) * (H - 2 * P);
        g.rotate(Math.atan2(dy, dx) + Math.PI / 4); g.fillText('🚀', 0, 0);
      }
      g.restore();
    }
    function paintBtns() { go.hidden = K.live; cash.hidden = !K.live; auto.box.hidden = K.live; }
    function paintMult(m) {
      if (m === K.shown) return;
      K.shown = m; big.textContent = fx(m, true);
      if (Math.floor(m) > Math.floor(K.lastM)) G.sfx('tick');
      K.lastM = m;
      if (!K.cashing) {
        cash.textContent = m >= K.minCash ? 'RÚT ' + nf(Math.round(K.bet * m)) + ' điểm (' + fx(m, true) + ')' : 'Chờ ' + fx(K.minCash, true) + '…';
        cash.disabled = m < K.minCash;
      }
    }
    function frame() {
      if (!K.live) return;
      const t = K.cashing ? K.frozenT : tNow(), m = K.cashing ? K.frozen : mAt(t);
      paintMult(m); draw(t, 'fly');
      if (K.auto && !K.cashing && t >= Math.log(K.auto) / K.rate + 0.25) cashClick(true);   // đã qua mức tự rút (+0,25s bù lệch đồng hồ): máy chủ trả đúng ×auto nếu chưa nổ
    }
    function stopFlight() { c.stopLoop(); if (K.pt) { c.clear(K.pt); K.pt = 0; } }
    function fly() {
      K.live = true; K.cashing = false; K.shown = null; K.lastM = 1; c.begin(); paintBtns();
      wrap.classList.remove('boom', 'ok'); sub.textContent = 'Đang bay…';
      info.textContent = 'Cược ' + nf(K.bet) + (K.auto ? ' · Tự rút ở ' + fx(K.auto, true) : '') + ' · Bấm RÚT (hoặc Space) trước khi tên lửa nổ.';
      c.say('');
      c.loop(frame); K.pt = c.every(poll, 1000);
    }
    async function start() {
      if (K.live) return;
      const bet = c.pend ? c.pend.params.bet : c.bet(); if (!bet) return;
      c.res.hidden = true; c.say('');
      const t0 = performance.now(), r = await c.send('crashStart', c.pend ? c.pend.params : { bet, auto: auto.get() }), rtt = performance.now() - t0;
      K.bet = +r.bet || bet; c.bet0 = K.bet; K.rate = +r.rate || 0.1; K.minCash = +r.minCash || 1.01; K.auto = +r.auto || 0; setClock(r, rtt);
      G.sfx('click'); fly();
    }
    function gone() { // ván biến mất mà không rõ kết quả (ví dụ đã rút ở thiết bị khác)
      K.live = false; stopFlight(); c.active = false; paintBtns(); sub.textContent = 'Ván đã kết thúc';
      c.say('Ván này đã kết thúc. Số dư đã được cập nhật.', 'warn'); c.lock();
    }
    function crashed(r) {
      const cp = r.crashPoint != null ? +r.crashPoint : null;
      K.live = false; stopFlight(); wrap.classList.add('boom'); paintBtns();
      K.endT = cp != null ? Math.log(Math.max(1, cp)) / K.rate : tNow();
      big.textContent = cp != null ? fx(cp, true) : '💥'; sub.textContent = 'Tên lửa đã nổ';
      draw(K.endT, 'boom'); c.say(''); idleInfo();
      const near = cp != null && K.auto && cp >= K.auto * 0.8 && cp < K.auto ? 'Suýt chạm ' + fx(K.auto, true) + '! Chỉ thiếu ' + fx(Math.round((K.auto - cp) * 100) / 100, true).slice(1) : '';
      if (K.bet > 0 || typeof r.bet === 'number') c.finish(Object.assign({ bet: K.bet, payout: 0 }, r), cp != null ? 'Tên lửa nổ ở ' + fx(cp, true) : 'Tên lửa nổ trước khi lệnh rút tới nơi', near);
      else { // khôi phục sau khi đã nổ mà không biết mức cược
        c.active = false; c.res.hidden = false; c.res.className = 'gm-result lose';
        c.res.replaceChildren(el('b', 'gm-r1', 'Tên lửa đã nổ' + (cp != null ? ' ở ' + fx(cp, true) : '')), el('span', 'gm-r2', 'Ván trước đã kết thúc và đã tính vào số dư.'));
        G.sfx('lose'); G.settle({ balance: r.balance });
      }
      c.lock();
    }
    function cashed(r) {
      K.live = false; stopFlight(); wrap.classList.add('ok'); paintBtns();
      const m = +r.mult || K.frozen; K.endT = Math.log(Math.max(1, m)) / K.rate;
      big.textContent = fx(m, true); sub.textContent = 'Đã rút';
      draw(K.endT, 'cash'); c.say(''); idleInfo();
      c.finish(Object.assign({ bet: K.bet }, r), (r.auto ? 'Tự rút ở ' : 'Rút ở ') + fx(m, true) + (r.crashPoint != null ? ' · điểm nổ là ' + fx(r.crashPoint, true) : ''));
    }
    async function poll() {
      if (!K.live || K.polling || K.cashing || c.busy) return;
      K.polling = true;
      try {
        const t0 = performance.now(), r = await c.api('getActiveGame', {}), rtt = performance.now() - t0;
        if (!K.live) return;
        if (r.result === 'crash') crashed(r);
        else if (r.game === 'crash' && r.active === false && r.result === 'cashout') cashed(r);   // máy chủ đã tự rút
        else if (r.active && r.game === 'crash' && r.startedAt && r.serverNow) setClock(r, rtt); // chỉnh lại đồng hồ
        else if (!r.active) gone();
      } catch (_) { /* lỗi mạng khi thăm dò: bỏ qua, lần sau thử lại */ }
      finally { K.polling = false; }
    }
    function cashClick(isAuto) {
      if (!K.live || K.cashing || c.busy || !c.alive) return;
      const t = tNow(), m = isAuto ? K.auto : mAt(t); if (m < K.minCash) return;
      K.cashing = true; K.frozenT = t; K.frozen = m; G.sfx('click');
      cash.disabled = true; cash.textContent = 'Đang rút ' + fx(m, true) + '…'; sub.textContent = 'Đang gửi lệnh rút…'; // phản hồi tức thì
      c.run(async () => {
        let r;
        try { r = await c.send('crashCashout', {}); }
        catch (e) {
          if (e.code === 'no_game' && K.live) { crashed({}); return; }
          if (!RETRY.has(e.code)) { K.cashing = false; sub.textContent = 'Đang bay…'; }
          throw e;
        }
        if (!K.live) return;
        if (r.result === 'crash') crashed(r); else cashed(r);
      });
    }
    c.onIdle = () => {
      K.live = false; K.cashing = false; stopFlight(); c.active = false; K.bet = 0; paintBtns();
      wrap.classList.remove('boom', 'ok'); big.textContent = '×1,00'; sub.textContent = 'Sẵn sàng'; K.rate = 0.2; K.auto = 0; draw(0, 'idle');
      idleInfo();
    };
    c.onRestore = (kind, r) => {
      K.bet = +r.bet || 0; c.bet0 = K.bet;
      if (kind === 'crash') { K.rate = +r.rate || 0.1; crashed(r); return; }
      if (kind === 'cashed') { cashed(r); return; }
      K.rate = +r.rate || 0.1; K.minCash = +r.minCash || 1.01; K.auto = +r.auto || 0; setClock(r, c.rtt); fly();
      c.say('Đã khôi phục ván đang bay. Bấm Rút để chốt điểm.', 'ok');
    };
    c.onIdle();
  }

  /* ================= Luật chơi (hiện trong mục "Luật chơi") ================= */
  G.setRules('slots', ['3 cuộn quay độc lập do máy chủ chọn. 3 giống nhau: 🍒×4, 🍋×5, 🔔×6, ⭐×9, 💎×18, 7️⃣×45.', 'Đúng 2 giống: 🍒🍋 ×1,2 · 🔔 ×1,3 · ⭐ ×1,4 · 💎 ×1,6 · 7️⃣ ×2. Các trường hợp khác ×0.', 'Khoảng 45% số ván có lãi; hoàn trả lý thuyết ≈ 90%. Chơi lâu dài thì điểm sẽ giảm. Phím Space = quay tiếp.']);
  G.setRules('wheel', ['40 ô đều xác suất: ×0 (14 ô), ×0,5 (8 ô), ×1,5 (14 ô), ×2 (3 ô), ×5 (1 ô).', 'Có lãi ở 18/40 ô (45%); hoàn trả lý thuyết 90%. Phím Space = quay tiếp.']);
  G.setRules('hilo', ['Máy chủ rút lá 1–13 (A–K) có hoàn lại. Đoán lá kế cao hơn hoặc thấp hơn; lá bằng nhau là thua.', 'Mỗi lần đúng, hệ số nhân thêm 13/số lá thắng. “Tự rút ở ×X” (mặc định ×1,55): máy chủ tự chốt khi hệ số đạt X; đặt 0 để tự rút tay. Trần ×100.', 'Mặc định + luôn chọn phía nhiều lá thắng hơn (phím Space làm sẵn việc này): thắng ≈ 45% số ván. Hoàn trả lý thuyết 90% với mọi cách chơi.']);
  G.setRules('mines', ['Bảng 25 ô có 1–10 mìn (mặc định 8). Bấm thẳng vào một ô để bắt đầu ván và lật luôn ô đó; trúng mìn là mất cược.', '“Tự rút ở ×X” (mặc định ×1,55): máy chủ tự chốt khi hệ số đạt X. 8 mìn + ×1,55 = tự rút sau 2 ô an toàn, thắng ≈ 45%. Tỷ lệ thắng với cài đặt hiện tại hiện ngay dưới bảng.', 'Hoàn trả lý thuyết 90% với mọi số ô đã lật. Ván dở được khôi phục khi quay lại.']);
  G.setRules('crash', ['Tên lửa bay, hệ số tăng theo giờ máy chủ (khoảng ×2 sau 3,5 giây, ×10 sau 11,5 giây). Rút khi hệ số còn thấp hơn điểm nổ để nhận cược × hệ số.', '“Tự rút ở ×X” (mặc định ×2): máy chủ trả đúng cược × X nếu tên lửa chưa nổ trước X, kể cả khi mạng chậm. Tỷ lệ thắng = 90 ÷ X % (×2 → 45%).', 'Điểm nổ ngẫu nhiên, 10% số ván nổ ngay ×1,00. Hoàn trả lý thuyết 90% với mọi mức rút. Phím Space = phóng / rút.']);

  /* ================= Đăng ký & vòng đời ================= */
  const BUILD = { slots: buildSlots, wheel: buildWheel, hilo: buildHilo, mines: buildMines, crash: buildCrash };

  /* Bộ dụng cụ cho games2.js (5 trò mới): cùng vòng đời, cùng ctx */
  function unmountGame(n) { warnCrash(n); disposeGame(n); if (current === n) current = null; }
  function resumeGame(n) { const c = insts[n]; if (c && !c.syncStarted) c.sync(); }
  function disposeGame(n) { const c = insts[n]; if (c) { c.dispose(); delete insts[n]; } }
  function mountGame(n, stage) {
    disposeGame(n); needRemount = null; current = n;
    const c = makeCtx(n); insts[n] = c; stage.replaceChildren(c.root);
    BUILD[n](c); c.sync();
  }
  function warnCrash(n) { const c = insts[n]; if (c && n === 'crash' && c.active) G.toast('Ván Tên lửa vẫn đang mở trên máy chủ và chạy theo giờ thật. Quay lại để rút nhé.'); }

  ORDER.slice(0, 5).forEach(n => G.register(n, {
    mount(stage) { mountGame(n, stage); },
    unmount() { warnCrash(n); disposeGame(n); if (current === n) current = null; },
    resume() { const c = insts[n]; if (c && !c.syncStarted) c.sync(); }
  }));

  /* Rời khu trò chơi / đổi mã: dọn hẹn giờ + animation; khi quay lại thì gắn lại và đồng bộ từ máy chủ */
  document.addEventListener('smgame:stop', () => {
    if (!current) return;
    const n = current; warnCrash(n); disposeGame(n); needRemount = n; current = null;
  });
  const panel = document.getElementById('p-tro-choi');
  if (panel && 'MutationObserver' in window) {
    new MutationObserver(() => {
      if (!panel.hidden && needRemount) { const n = needRemount; needRemount = null; mountGame(n, G.stage); }
    }).observe(panel, { attributes: true, attributeFilter: ['hidden'] });
  }

  window.SMGameKit = { makeCtx, mountGame, unmountGame, resumeGame, BUILD, ORDER, NAMES, INSTANT, el, btn, nf, sg, fx, ls, autoBox, friendly, RETRY, FOREVER, MSG };
})();

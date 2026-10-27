/* Nhà Thầy Hưng – game Thú cưng (giao diện + hoạt ảnh). Cần pet-art.js. Máy chủ: Pet.gs (petInfo / petGet / petAct / petBoard).
 * window.SMPet = { mount(root, ctx), unmount(), peek(ctx) → Promise<{has, alive, safe, grace, fed, min, name, dead}> }
 * ctx = { api(action, params), getBalance(), setBalance(n), toast(msg, isErr), requestId(), code }
 * Điểm chỉ do máy chủ quyết định; client chỉ hiển thị lạc quan rồi thay bằng trạng thái máy chủ trả về. */
(function () {
  'use strict';
  const A = window.PetArt;
  const LS = { get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }, set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (_) {} } };
  const nf = n => Number(Math.floor(n || 0)).toLocaleString('vi-VN');
  const RM = matchMedia('(prefers-reduced-motion:reduce)');
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const NS = 'http://www.w3.org/2000/svg';
  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) { const v = attrs[k]; if (v == null || v === false) continue; if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k === 'html') e.innerHTML = v; else if (k.startsWith('on')) e[k] = v; else e.setAttribute(k, v === true ? '' : v); }
    kids.flat().forEach(c => { if (c == null || c === false) return; e.append(c.nodeType ? c : document.createTextNode(String(c))); });
    return e;
  }
  const STAT = [['h', '🍖', 'No bụng'], ['j', '😊', 'Vui vẻ'], ['c', '🫧', 'Sạch sẽ'], ['e', '⚡', 'Năng lượng']];
  const MOOD_TXT = { happy: 'Rất vui', ok: 'Bình thường', sad: 'Buồn', hungry: 'Đói bụng', tired: 'Mệt', dirty: 'Bẩn', sick: 'Bị ốm', dead: 'Đã mất' };
  const NEED_E = { hungry: '🍖', sad: '🎾', tired: '💤', dirty: '🛁', sick: '💊' };
  const TOY_E = {}, FOOD_E = {};

  /* ================= Trạng thái ================= */
  let C = null, R = null, cat = null, S = null, D = null, off = 0, alive = false, raf = 0, timers = [], els = {};
  let queue = [], qTimer = 0, flying = false, patN = 0, patT = 0, tryOn = null, sheet = null, game = null, lastKey = '';

  /* ================= Âm thanh nhỏ ================= */
  let au = null;
  const muted = () => LS.get('sm_snd') === '0' || LS.get('sm_pet_snd') === '0';
  function snd(name) {
    if (muted()) return;
    const T = { pop: [[700, .05, 'sine', 1300]], munch: [[220, .06, 'square'], [180, .06, 'square']], chime: [[880, .08], [1175, .08], [1568, .16]], splash: [[400, .12, 'triangle', 900]],
      whoosh: [[300, .2, 'sawtooth', 900]], sparkle: [[1568, .05], [2093, .05], [2637, .1]], level: [[523, .1], [659, .1], [784, .1], [1047, .1], [1319, .25]], sad: [[392, .25, 'triangle'], [330, .35, 'triangle']],
      coin: [[988, .06], [1319, .12]], click: [[600, .03]], err: [[180, .18, 'sawtooth']], hatch: [[300, .08], [500, .08], [800, .08], [1200, .2]], snore: [[110, .4, 'triangle', 90]], boing: [[300, .12, 'sine', 700]] }[name];
    if (!T) return;
    try {
      au = au || new (window.AudioContext || window.webkitAudioContext)(); if (au.state === 'suspended') au.resume();
      let t = au.currentTime;
      for (const [f, d, ty, f2] of T) { const o = au.createOscillator(), g = au.createGain(); o.type = ty || 'sine'; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d); g.gain.setValueAtTime(.07, t); g.gain.exponentialRampToValueAtTime(.001, t + d); o.connect(g).connect(au.destination); o.start(t); o.stop(t + d + .02); t += d * .9; }
    } catch (_) {}
  }

  /* ================= Máy chủ ================= */
  const now = () => Date.now() + off;
  async function loadCat() {
    let c = null; try { c = JSON.parse(LS.get('sm_pet_cat') || 'null'); } catch (_) {}
    try {
      const r = await C.api('petInfo', { catVer: c && c.catVer });
      if (!r.same) { c = r; delete c.ok; LS.set('sm_pet_cat', JSON.stringify(c)); }
    } catch (e) { if (!c) throw e; }
    cat = c; cat.by = {};
    ['species', 'foods', 'care', 'toys', 'acc', 'colors', 'rooms', 'furn', 'tricks', 'games', 'ach'].forEach(k => { cat.by[k] = {}; (cat[k] || []).forEach(x => { cat.by[k][x.id] = x; }); });
    (cat.toys || []).forEach(t => { TOY_E[t.id] = t.e; }); (cat.foods || []).forEach(f => { FOOD_E[f.id] = f.e; });
  }
  function apply(r) {
    if (!r || !r.state) return;
    S = r.state; D = r.derived; if (r.serverTime) off = r.serverTime - Date.now();
    if (typeof r.balance === 'number') C.setBalance(r.balance);
    render();
  }
  async function refresh() { const r = await C.api('petGet', {}); apply(r); return r; }
  // Gộp thao tác trong 350 ms thành 1 lô (máy chủ xử lý nguyên tử cả lô)
  function act(op, opt) {
    opt = opt || {};
    return new Promise((res, rej) => {
      queue.push({ op, res, rej, price: opt.price || 0 });
      clearTimeout(qTimer);
      if (opt.now || queue.length >= 10) flush(); else qTimer = setTimeout(flush, 350);
    });
  }
  async function flush() {
    clearTimeout(qTimer);
    if (flying || !queue.length) { if (queue.length) qTimer = setTimeout(flush, 150); return; }
    const batch = queue.splice(0, 10); flying = true; setSync(true);
    const rid = C.requestId(), ops = batch.map(b => b.op);
    let r = null, err = null;
    for (let i = 0; i < 3; i++) {
      try { r = await C.api('petAct', { ops, requestId: rid }); err = null; break; }
      catch (e) { err = e; if (e.code !== 'network' && e.code !== 'busy') break; await new Promise(z => setTimeout(z, 1500 * (i + 1))); }
    }
    flying = false; setSync(false);
    if (!alive) return;
    if (r) {
      apply(r);
      batch.forEach((b, i) => b.res(Object.assign({}, (r.results || [])[i] || {}, { _r: r })));
      afterAct(r);
    } else {
      const raw = err && err.raw;
      if (raw && raw.state) apply(raw); else refresh().catch(() => {});
      C.toast((err && err.message) || 'Có lỗi xảy ra.', 1); snd('err');
      batch.forEach(b => b.rej(err));
    }
    if (queue.length) flush();
  }
  function afterAct(r) {
    (r.achievements || []).forEach((a, i) => setTimeout(() => { C.toast('🏆 ' + a.e + ' ' + a.name + ' – bậc ' + a.tier + ' (+' + a.xp + ' XP)'); snd('chime'); fx.confetti(30); }, 600 + i * 900));
    if (r.levelUp) setTimeout(() => levelUp(r.levelUp), 300);
    if (r.died) showDied();
  }
  function setSync(on) { if (els.sync) els.sync.dataset.on = on ? '1' : ''; }

  /* ================= Chỉ số sống (giảm dần theo thời gian, giống máy chủ) ================= */
  function live() {
    const p = S && S.pet; if (!p) return null;
    if (p.dead) return { h: 0, j: 0, c: 0, e: 0 };
    const dt = Math.max(0, (now() - p.t) / 3600000), dc = cat.decay || { h: 2.5, j: 2, c: 1.5, e: 2.5 };
    return { h: clamp(p.h - dc.h * dt, 0, 130), j: clamp(p.j - dc.j * dt, 0, 100), c: clamp(p.c - dc.c * dt, 0, 100), e: clamp(p.e - dc.e * dt, 0, 100) };
  }
  function mood() {
    const p = S && S.pet; if (!p) return 'ok'; if (p.dead) return 'dead';
    const v = live(); if (p.sick) return 'sick';
    if (v.h < 20) return 'hungry'; if (v.e < 15) return 'tired'; if (v.c < 20) return 'dirty'; if (v.j < 25) return 'sad';
    return v.j >= 75 && v.h >= 50 ? 'happy' : 'ok';
  }
  function localApply(fn) { const p = S.pet; const v = live(); Object.assign(p, v, { t: now() }); fn(p); p.h = clamp(p.h, 0, 130); ['j', 'c', 'e'].forEach(k => { p[k] = clamp(p[k], 0, 100); }); drawMeters(); }
  const lvOf = () => (D && D.lv) || 0;

  /* ================= Khung giao diện ================= */
  function skeleton() {
    R.replaceChildren();
    els = {};
    els.top = h('div', { class: 'pt-top' });
    els.daily = h('div', { class: 'pt-daily', role: 'status', 'aria-live': 'polite' });
    els.stage = h('div', { class: 'pt-stage' });
    els.svg = document.createElementNS(NS, 'svg');
    els.svg.setAttribute('class', 'pt-scene'); els.svg.setAttribute('viewBox', '0 0 400 300'); els.svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
    els.svg.setAttribute('role', 'img');
    els.svg.innerHTML = `<defs><filter id="fsh" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="3" stdDeviation="2.2" flood-opacity=".28"/></filter>
<filter id="pt-sick"><feColorMatrix type="matrix" values=".55 .35 .1 0 0  .3 .75 .1 0 .04  .2 .4 .3 0 0  0 0 0 1 0"/></filter>
<filter id="pt-ghost"><feColorMatrix type="saturate" values=".05"/><feComponentTransfer><feFuncA type="linear" slope=".72"/></feComponentTransfer></filter>
<filter id="pt-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<radialGradient id="pt-vign" cx=".5" cy=".55" r=".75"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".28"/></radialGradient>
<radialGradient id="pt-aura"><stop offset="0" stop-color="#fff6b0" stop-opacity=".75"/><stop offset=".6" stop-color="#ffd84d" stop-opacity=".22"/><stop offset="1" stop-color="#ffd84d" stop-opacity="0"/></radialGradient></defs>
<g class="pt-room"></g><g class="pt-furn"></g><g class="pt-extra"></g>
<ellipse class="pt-shadow" cx="200" cy="270" rx="34" ry="7" fill="rgba(0,0,0,.2)"/>
<g class="pt-aura" opacity="0"><ellipse cx="0" cy="-80" rx="95" ry="110" fill="url(#pt-aura)"/></g>
<g class="pt-pet" tabindex="-1"></g><g class="pt-front"></g>
<rect class="pt-night" width="400" height="300" fill="#0a1033" opacity="0" pointer-events="none"/>
<rect width="400" height="300" fill="url(#pt-vign)" pointer-events="none"/>`;
    els.room = els.svg.querySelector('.pt-room'); els.furn = els.svg.querySelector('.pt-furn'); els.extra = els.svg.querySelector('.pt-extra');
    els.pet = els.svg.querySelector('.pt-pet'); els.shadow = els.svg.querySelector('.pt-shadow'); els.night = els.svg.querySelector('.pt-night');
    els.front = els.svg.querySelector('.pt-front'); els.aura = els.svg.querySelector('.pt-aura');
    els.cv = h('canvas', { class: 'pt-fx', 'aria-hidden': 'true' });
    els.bubble = h('div', { class: 'pt-bubble', 'aria-hidden': 'true' });
    els.banner = h('div', { class: 'pt-banner', 'aria-live': 'polite' });
    els.tryBar = h('div', { class: 'pt-trybar', hidden: true });
    els.sync = h('span', { class: 'pt-sync', title: 'Đang lưu…', 'aria-hidden': 'true' });
    els.stage.append(els.svg, els.cv, els.bubble, els.banner, els.tryBar, els.sync);
    els.meters = h('div', { class: 'pt-meters' });
    els.dock = h('div', { class: 'pt-dock', role: 'toolbar', 'aria-label': 'Hành động với thú cưng' });
    els.panel = h('div', { class: 'pt-panel' });
    R.append(els.top, els.daily, els.stage, els.meters, els.dock, els.panel);
    els.pet.addEventListener('pointerdown', onPetTap);
    els.svg.addEventListener('pointermove', onLook);
    els.svg.addEventListener('pointerleave', () => { look.on = false; });
    new ResizeObserver(resize).observe(els.stage);
    resize();
  }

  /* ================= Vẽ cảnh ================= */
  function tod() { const hr = new Date().getHours(); return hr >= 19 || hr < 6 ? 'night' : hr >= 17 ? 'dusk' : 'day'; }
  function eqNow() { const e = Object.assign({}, S.eq); if (tryOn && tryOn.slot) e[tryOn.slot] = tryOn.id; return e; }
  function buildScene(force) {
    const e = eqNow(), p = S.pet, key = [e.room, e.fl, e.fr, e.wl, e.wr, e.ce, e.rug, tod()].join('|');
    if (force || key !== lastKey.split('#')[0]) {
      els.room.innerHTML = A.room(e.room || 'phong', tod(), 'pr');
      els.furn.innerHTML = ['rug', 'fl', 'fr', 'wl', 'wr', 'ce'].map(s => A.furn(s, e[s])).join('');
    }
    const pkey = p ? [p.sp, e.col, e.hat, e.eyes, e.neck, e.back, p.dead ? 1 : 0, D && D.stage].join('|') : 'none';
    if (force || pkey !== (lastKey.split('#')[1] || '')) buildPet();
    lastKey = key + '#' + pkey;
    els.svg.setAttribute('aria-label', p ? (p.nm + ', ' + (cat.by.species[p.sp] || {}).n + ', ' + (MOOD_TXT[mood()] || '')) : 'Căn phòng thú cưng');
  }
  let parts = {}, petO = null;
  function buildPet() {
    const p = S.pet; parts = {};
    els.extra.innerHTML = ''; els.pet.removeAttribute('filter');
    if (!p) { els.pet.innerHTML = ''; els.shadow.setAttribute('opacity', 0); return; }
    const e = eqNow();
    petO = { sp: p.sp, col: e.col, eq: { hat: e.hat, eyes: e.eyes, neck: e.neck, back: e.back }, uid: 'pp' };
    els.pet.innerHTML = A.pet(petO);
    ['all', 'body', 'head', 'tail', 'earL', 'earR', 'armL', 'armR', 'face', 'back', 'wingL', 'wingR', 'flopL', 'flopR', 'halo'].forEach(k => { parts[k] = els.pet.querySelector('[data-p="' + k + '"]'); });
    face.cur = ''; anim.expr = ''; setFace(p.dead ? 'dead' : 'normal');
    els.shadow.setAttribute('opacity', 1);
    if (p.dead) {
      els.pet.setAttribute('filter', 'url(#pt-ghost)');
      els.extra.innerHTML = `<g transform="translate(318 268)" filter="url(#fsh)"><path d="M-26,0 V-52 Q-26,-76 0,-76 Q26,-76 26,-52 V0Z" fill="#b8bfcc" stroke="#7d8597" stroke-width="3"/><path d="M-30,0 H30" stroke="#6c7a5a" stroke-width="6" stroke-linecap="round"/><text y="-46" text-anchor="middle" font-size="11" font-weight="700" fill="#4a5060">R.I.P</text><text y="-28" text-anchor="middle" font-size="9" fill="#4a5060">${esc(p.nm)}</text><text x="-14" y="2" font-size="13">🌼</text><text x="6" y="2" font-size="11">🌸</text></g>`;
    }
  }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function face(expr, mouth) { return A.face(petO, expr, mouth); }
  function setFace(expr, mouth) {
    const k = expr + '|' + (mouth || ''); if (face.cur === k || !parts.face) return; face.cur = k;
    parts.face.innerHTML = face(expr, mouth); parts.eyes = parts.face.querySelector('[data-p="eyes"]'); parts.pupils = parts.face.querySelectorAll('[data-p="pupil"]');
  }

  /* ================= Hoạt ảnh ================= */
  const anim = { x: 200, tx: 200, y: 268, dir: 1, nextMove: 0, blinkAt: 0, cur: null, q: [], expr: '', earAt: 0 };
  const look = { on: false, x: 0, y: 0 };
  let map = { s: 1, ox: 0, oy: 0, dpr: 1, W: 0, H: 0 };
  function resize() {
    if (!els.stage) return; const r = els.stage.getBoundingClientRect(); if (!r.width) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1), s = Math.max(r.width / 400, r.height / 300);
    map = { s, ox: (r.width - 400 * s) / 2, oy: (r.height - 300 * s) / 2, dpr, W: r.width, H: r.height };
    els.cv.width = Math.round(r.width * dpr); els.cv.height = Math.round(r.height * dpr);
  }
  const toPx = (x, y) => [map.ox + x * map.s, map.oy + y * map.s];
  function onLook(e) { const r = els.stage.getBoundingClientRect(); look.on = true; look.x = (e.clientX - r.left - map.ox) / map.s; look.y = (e.clientY - r.top - map.oy) / map.s; }
  const scaleOf = () => { const st = (D && D.stage) || 0; return [0.56, 0.62, 0.68, 0.73, 0.77][st] || 0.62; };
  function play(name, dur, fn, end) { if (RM.matches) dur = Math.min(dur, 900); anim.q.push({ name, dur, fn, end }); }
  function tick(ts) {
    raf = requestAnimationFrame(tick);
    if (!S || document.hidden) return;
    const t = ts / 1000, p = S.pet;
    fx.step(ts);
    if (!p || !parts.all) { fx.draw(); return; }
    const sc = scaleOf(), m = mood(), dead = p.dead;
    let dy = 0, rot = 0, sx = 1, sy = 1, armL = 0, armR = 0, tailA = 0, expr = null, mouth = null, headR = 0, wing = 0, flip = 1;
    if (!anim.cur && anim.q.length) { anim.cur = anim.q.shift(); anim.cur.t0 = ts; }
    if (anim.cur) {
      const c = anim.cur, k = clamp((ts - c.t0) / c.dur, 0, 1), o = c.fn(k, ts) || {};
      dy = o.dy || 0; rot = o.rot || 0; sx = o.sx || 1; sy = o.sy || 1; armL = o.armL || 0; armR = o.armR || 0; expr = o.expr || null; mouth = o.mouth || null; headR = o.headR || 0; wing = o.wing || 0; flip = o.flip || 1;
      if (o.x != null) anim.x = o.x;
      if (k >= 1) { anim.cur = null; if (c.end) try { c.end(); } catch (_) {} }
    } else if (dead) {
      dy = -18 - Math.sin(t * 1.4) * 6; expr = 'dead';
    } else {
      // đi dạo
      if (!RM.matches && m !== 'tired' && m !== 'sick' && ts > anim.nextMove) { anim.tx = clamp(anim.x + rnd(-90, 90), 120, 280); anim.nextMove = ts + rnd(3000, 8000); }
      const dx = anim.tx - anim.x;
      if (Math.abs(dx) > 1 && !RM.matches) { const v = (m === 'happy' ? 42 : 28) / 60; anim.x += Math.sign(dx) * Math.min(Math.abs(dx), v); anim.dir = Math.sign(dx); dy = -Math.abs(Math.sin(t * 9)) * 4; rot = Math.sin(t * 9) * 3; }
      if (m === 'happy' && !RM.matches && Math.sin(t * .7) > .985) dy -= 10 * Math.abs(Math.sin(t * 12));
      expr = m === 'sad' || m === 'hungry' ? 'sad' : m === 'sick' ? 'sick' : m === 'tired' ? (Math.sin(t * .8) > .7 ? 'sleep' : 'normal') : m === 'happy' && Math.sin(t * .5) > .6 ? 'happy' : 'normal';
    }
    // thở + đuôi + tai
    const br = RM.matches ? 0 : Math.sin(t * 2.4);
    const tailAmp = dead ? 2 : m === 'happy' ? 16 : m === 'sad' || m === 'sick' ? 3 : 8;
    tailA = Math.sin(t * (m === 'happy' ? 7 : 3)) * tailAmp;
    if (parts.body) parts.body.setAttribute('transform', `scale(${1 + br * .012} ${1 - br * .018})`);
    if (parts.head) parts.head.setAttribute('transform', `translate(0 ${br * 1.2}) rotate(${headR + (look.on && !dead ? clamp((look.x - anim.x) / 30, -5, 5) * anim.dir : Math.sin(t * .6) * 2)} 0 -70)`);
    if (parts.tail) parts.tail.setAttribute('transform', `rotate(${tailA} 30 -26)`);
    if (parts.armL) parts.armL.setAttribute('transform', `rotate(${armL + br * 2} -32 -56)`);
    if (parts.armR) parts.armR.setAttribute('transform', `rotate(${armR + br * 2} -32 -56)`);
    const flap = wing || (dead ? 0 : Math.sin(t * 3) * 6);
    if (parts.wingL) parts.wingL.setAttribute('transform', `rotate(${flap} -22 -60)`);
    if (parts.wingR) parts.wingR.setAttribute('transform', `rotate(${flap} -22 -60)`);
    if (ts > anim.earAt) { anim.earAt = ts + rnd(2500, 6000); anim.earT = ts; }
    const ek = anim.earT ? clamp((ts - anim.earT) / 250, 0, 1) : 1, ew = Math.sin(ek * Math.PI) * 10;
    if (parts.earL) parts.earL.setAttribute('transform', `rotate(${-ew} -30 -140)`);
    if (parts.earR) parts.earR.setAttribute('transform', `rotate(${-ew * .5} -30 -140)`);
    if (parts.flopL) parts.flopL.setAttribute('transform', `rotate(${Math.sin(t * 3) * 3 + ew * .4} -40 -146)`);
    if (parts.flopR) parts.flopR.setAttribute('transform', `rotate(${Math.sin(t * 3 + 1) * 3} -40 -146)`);
    if (parts.halo) parts.halo.setAttribute('transform', `translate(0 ${Math.sin(t * 2) * 3})`);
    // mặt
    if (expr) setFace(expr, mouth);
    if (parts.eyes && (face.cur.startsWith('normal') || face.cur.startsWith('wow'))) {
      if (ts > anim.blinkAt) { anim.blinkAt = ts + rnd(2200, 5200); anim.blinkT = ts; }
      const bk = anim.blinkT ? clamp((ts - anim.blinkT) / 150, 0, 1) : 1, b = bk < 1 ? Math.abs(Math.cos(bk * Math.PI)) * .9 + .1 : 1;
      parts.eyes.setAttribute('transform', `translate(0 ${-107 * (1 - b)}) scale(1 ${b})`);
      const lx = look.on ? clamp((look.x - anim.x) / 40, -1, 1) * 2.6 * anim.dir : 0, ly = look.on ? clamp((look.y - 200) / 60, -1, 1) * 2 : 0;
      parts.pupils && parts.pupils.forEach(pp => pp.setAttribute('transform', `translate(${lx.toFixed(2)} ${ly.toFixed(2)})`));
    } else if (parts.eyes) parts.eyes.removeAttribute('transform');
    const fl = anim.dir < 0 ? -1 : 1;
    parts.all.setAttribute('transform', `translate(${anim.x.toFixed(1)} ${(anim.y + dy).toFixed(1)}) scale(${(fl * flip * sc * sx).toFixed(3)} ${(sc * sy).toFixed(3)}) rotate(${rot.toFixed(1)} 0 -80)`);
    const hgt = clamp(-dy / 80, 0, 1);
    els.shadow.setAttribute('cx', anim.x); els.shadow.setAttribute('rx', (34 * sc / .62 * (1 - hgt * .5)).toFixed(1)); els.shadow.setAttribute('opacity', dead ? .4 : 1 - hgt * .5);
    if (els.aura) { const lg = (D && D.stage) >= 4 && !dead; els.aura.setAttribute('opacity', lg ? (.75 + Math.sin(t * 2) * .2).toFixed(2) : 0); els.aura.setAttribute('transform', `translate(${anim.x} ${anim.y}) scale(${sc})`); if (lg && Math.random() < .05) fx.sparkle(anim.x + rnd(-40, 40), anim.y - rnd(20, 120), 1); }
    // bong bóng nhu cầu
    const need = !anim.cur && !dead && NEED_E[m];
    if (need) { const [bx, by] = toPx(anim.x + 34 * sc / .62, anim.y - 190 * sc); els.bubble.style.transform = `translate(${bx.toFixed(0)}px,${by.toFixed(0)}px)`; if (els.bubble.textContent !== need) els.bubble.textContent = need; els.bubble.classList.add('on'); }
    else els.bubble.classList.remove('on');
    if (!dead && !anim.cur && !RM.matches) {
      if (m === 'dirty' && Math.random() < .03) fx.emit({ type: 'text', text: '〰', x: anim.x + rnd(-30, 30), y: anim.y - rnd(40, 90), vy: -0.4, life: 1200, size: 14, color: '#7a8a5a' });
      if (m === 'sad' && Math.random() < .006) fx.emit({ type: 'drop', x: anim.x - 14 * sc / .62, y: anim.y - 92 * sc, vy: 0.6, life: 900, size: 4 });
      if (m === 'tired' && Math.random() < .01) fx.emit({ type: 'text', text: 'z', x: anim.x + 30, y: anim.y - 120 * sc, vx: .3, vy: -.5, life: 1600, size: 14, color: '#8da2ff' });
    }
    fx.draw();
  }

  /* ================= Hạt hiệu ứng (canvas) ================= */
  const fx = {
    P: [], last: 0,
    emit(o) { if (RM.matches && this.P.length > 20) return; o.t0 = performance.now(); o.vx = o.vx || 0; o.vy = o.vy || 0; o.rot = o.rot || 0; o.vr = o.vr || 0; o.g = o.g || 0; this.P.push(o); if (this.P.length > 400) this.P.shift(); },
    step(ts) { const dt = this.last ? Math.min(50, ts - this.last) / 16.7 : 1; this.last = ts; this.P = this.P.filter(p => { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt; p.rot += p.vr * dt; return ts - p.t0 < p.life; }); },
    draw() {
      const c = els.cv, g = c && c.getContext('2d'); if (!g) return;
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, c.width, c.height);
      g.setTransform(map.dpr * map.s, 0, 0, map.dpr * map.s, map.dpr * map.ox, map.dpr * map.oy);
      const T = performance.now();
      for (const p of this.P) {
        const k = (T - p.t0) / p.life, a = p.fade === false ? 1 : k < .15 ? k / .15 : 1 - Math.max(0, k - .6) / .4;
        g.save(); g.globalAlpha = clamp(a, 0, 1); g.translate(p.x, p.y); g.rotate(p.rot); const s = p.size || 6;
        if (p.type === 'heart') { g.fillStyle = p.color || '#ff4d6d'; g.beginPath(); g.moveTo(0, s * .35); g.bezierCurveTo(-s, -s * .4, -s * .45, -s * 1.1, 0, -s * .45); g.bezierCurveTo(s * .45, -s * 1.1, s, -s * .4, 0, s * .35); g.fill(); }
        else if (p.type === 'star') { g.fillStyle = p.color || '#ffe066'; g.beginPath(); for (let i = 0; i < 8; i++) { const r = i % 2 ? s * .3 : s, an = i * Math.PI / 4; g.lineTo(Math.cos(an) * r, Math.sin(an) * r); } g.closePath(); g.fill(); }
        else if (p.type === 'dot') { g.fillStyle = p.color || '#c98b55'; g.beginPath(); g.arc(0, 0, s, 0, 7); g.fill(); }
        else if (p.type === 'bubble') { g.strokeStyle = 'rgba(160,220,255,.95)'; g.fillStyle = 'rgba(220,245,255,.35)'; g.lineWidth = 1.2; g.beginPath(); g.arc(0, 0, s, 0, 7); g.fill(); g.stroke(); g.fillStyle = 'rgba(255,255,255,.9)'; g.beginPath(); g.arc(-s * .35, -s * .35, s * .25, 0, 7); g.fill(); }
        else if (p.type === 'conf') { g.fillStyle = p.color; g.fillRect(-s / 2, -s / 4, s, s / 2); }
        else if (p.type === 'drop') { g.fillStyle = '#7cc6ff'; g.beginPath(); g.moveTo(0, -s * 1.6); g.quadraticCurveTo(s, 0, 0, s); g.quadraticCurveTo(-s, 0, 0, -s * 1.6); g.fill(); }
        else if (p.type === 'text') { g.font = `${p.bold ? '800 ' : ''}${s}px system-ui, "Segoe UI Emoji", "Apple Color Emoji", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; if (p.stroke) { g.lineWidth = 3; g.strokeStyle = p.stroke; g.strokeText(p.text, 0, 0); } g.fillStyle = p.color || '#fff'; g.fillText(p.text, 0, 0); }
        g.restore();
      }
    },
    hearts(n, x, y) { for (let i = 0; i < n; i++) this.emit({ type: 'heart', x: (x || anim.x) + rnd(-25, 25), y: (y || anim.y - 110 * scaleOf()) + rnd(-10, 10), vx: rnd(-.5, .5), vy: rnd(-1.4, -.6), life: rnd(900, 1500), size: rnd(5, 9), color: ['#ff4d6d', '#ff8fab', '#ff5c8a'][i % 3] }); },
    sparkle(x, y, n) { for (let i = 0; i < (n || 6); i++) this.emit({ type: 'star', x: x + rnd(-14, 14), y: y + rnd(-14, 14), vx: rnd(-.6, .6), vy: rnd(-.8, .2), vr: rnd(-.1, .1), life: rnd(500, 1000), size: rnd(3, 6), color: ['#ffe066', '#fff', '#a5d8ff', '#ffc8dd'][i % 4] }); },
    confetti(n) { const C = ['#ff595e', '#ffca3a', '#8ac926', '#1982c4', '#6a4c93', '#ff8fab']; for (let i = 0; i < n; i++) this.emit({ type: 'conf', x: rnd(40, 360), y: rnd(-20, 10), vx: rnd(-.8, .8), vy: rnd(.8, 2.2), vr: rnd(-.2, .2), g: .02, life: rnd(1800, 2800), size: rnd(5, 9), color: C[i % C.length] }); },
    text(t, color, x, y) { this.emit({ type: 'text', text: t, x: x || anim.x, y: y || anim.y - 150 * scaleOf(), vy: -.7, life: 1400, size: 15, bold: 1, color: color || '#fff', stroke: 'rgba(0,0,0,.45)' }); },
    crumbs(n, color) { for (let i = 0; i < n; i++) this.emit({ type: 'dot', x: anim.x + rnd(-10, 10) * anim.dir + 6 * anim.dir, y: anim.y - 84 * scaleOf(), vx: rnd(-1.2, 1.2), vy: rnd(-1.5, -.3), g: .12, life: 700, size: rnd(1.5, 3), color }); },
    bubbles(n) { const sc = scaleOf(); for (let i = 0; i < n; i++) this.emit({ type: 'bubble', x: anim.x + rnd(-60, 60) * sc, y: anim.y - rnd(10, 150) * sc, vx: rnd(-.3, .3), vy: rnd(-.9, -.3), life: rnd(900, 1800), size: rnd(3, 9) }); }
  };

  /* ================= Các màn hoạt ảnh ================= */
  const pulse = (k, n) => Math.sin(k * Math.PI * n);
  function petCenterY(f) { return anim.y - (f || 110) * scaleOf(); }
  function aEat(emoji) {
    snd('munch');
    const sc = scaleOf(); let lastC = 0;
    play('eat', 2300, (k, ts) => {
      const mx = anim.x + 22 * anim.dir * sc / .62, my = anim.y - 80 * sc;
      if (k < .35) { const q = k / .35; fx.P = fx.P.filter(p => p.tag !== 'food'); fx.emit({ tag: 'food', type: 'text', text: emoji, x: mx + (1 - q) * 70 * anim.dir, y: my - (1 - q) * 30 - Math.sin(q * Math.PI) * 30, life: 40, size: 26, fade: false }); return { expr: 'wow', mouth: 'o' }; }
      fx.P = fx.P.filter(p => p.tag !== 'food');
      const q = (k - .35) / .65, chomp = Math.sin(q * Math.PI * 9) > 0;
      if (q < .7) fx.emit({ tag: 'food', type: 'text', text: emoji, x: mx, y: my, life: 40, size: 26 * (1 - q / .7 * .8), fade: false });
      if (ts - lastC > 200 && q < .8) { lastC = ts; fx.crumbs(3, '#d4a373'); if (Math.random() < .5) snd('munch'); }
      return { expr: q > .8 ? 'happy' : 'normal', mouth: q > .8 ? 'open' : chomp ? 'chomp' : 'smile', sy: 1 - (chomp ? .03 : 0), headR: Math.sin(q * 20) * 2 };
    }, () => { fx.hearts(4); });
  }
  function aBath() {
    snd('splash');
    play('bath', 2800, (k) => { if (Math.random() < .5) fx.bubbles(2); if (k > .82) { if (Math.random() < .6) fx.emit({ type: 'drop', x: anim.x + rnd(-40, 40), y: petCenterY(80), vx: rnd(-2, 2), vy: rnd(-2, -.5), g: .15, life: 600, size: 3 }); return { rot: Math.sin(k * 120) * 9, expr: 'happy' }; } return { expr: 'happy', mouth: 'open', rot: Math.sin(k * 20) * 3 }; }, () => fx.sparkle(anim.x, petCenterY(), 10));
  }
  function aBrush() {
    snd('sparkle');
    play('brush', 1900, (k) => { fx.P = fx.P.filter(p => p.tag !== 'comb'); fx.emit({ tag: 'comb', type: 'text', text: '🪮', x: anim.x + Math.sin(k * Math.PI * 4) * 30, y: petCenterY(90), life: 40, size: 20, fade: false }); if (Math.random() < .3) fx.sparkle(anim.x + rnd(-30, 30), petCenterY(rnd(40, 140)), 1); return { expr: 'happy', headR: Math.sin(k * 12) * 4 }; }, () => { fx.P = fx.P.filter(p => p.tag !== 'comb'); fx.hearts(3); });
  }
  function aSpa() {
    snd('chime');
    play('spa', 3200, (k) => { if (Math.random() < .3) fx.bubbles(1); if (Math.random() < .2) fx.sparkle(anim.x + rnd(-40, 40), petCenterY(rnd(20, 150)), 1); if (Math.random() < .06) fx.emit({ type: 'text', text: '🌸', x: anim.x + rnd(-60, 60), y: petCenterY(170), vy: .6, vr: .03, life: 1500, size: 14 }); return { expr: 'love', sy: 1 + Math.sin(k * 10) * .02 }; }, () => fx.hearts(6));
  }
  function aPill(emoji) {
    snd('pop');
    play('pill', 1600, (k) => { const q = Math.min(1, k / .4); fx.P = fx.P.filter(p => p.tag !== 'pill'); if (k < .45) fx.emit({ tag: 'pill', type: 'text', text: emoji, x: anim.x + (1 - q) * 60, y: petCenterY(80) - Math.sin(q * Math.PI) * 30, life: 40, size: 20, fade: false }); if (k > .5 && Math.random() < .4) fx.sparkle(anim.x, petCenterY(100), 2); return { expr: k < .5 ? 'wow' : 'happy', mouth: k < .5 ? 'o' : null, dy: k > .6 ? -pulse((k - .6) / .4, 1) * 18 : 0 }; });
  }
  function aSleep() {
    snd('snore');
    play('sleep', 5200, (k) => { els.night.setAttribute('opacity', (Math.sin(Math.min(1, k * 1.2) * Math.PI) * .55).toFixed(2)); if (Math.random() < .04) { fx.emit({ type: 'text', text: 'Z', x: anim.x + 30, y: petCenterY(150), vx: .4, vy: -.5, life: 1800, size: rnd(12, 20), bold: 1, color: '#c3d1ff' }); } return { expr: 'sleep', sy: 1 + Math.sin(k * 18) * .03, dy: 2, headR: 8 }; }, () => { els.night.setAttribute('opacity', 0); fx.sparkle(anim.x, petCenterY(140), 6); });
  }
  function aPlay(emoji) {
    snd('boing');
    play('toy', 3000, (k) => {
      const q = (k * 3) % 1, side = Math.floor(k * 3) % 2 ? 1 : -1, bx = anim.x + side * (60 - q * 120), by = anim.y - 10 - Math.sin(q * Math.PI) * 90;
      fx.P = fx.P.filter(p => p.tag !== 'toy'); fx.emit({ tag: 'toy', type: 'text', text: emoji, x: bx, y: by, life: 40, size: 22, fade: false, rot: k * 12 });
      return { dy: -Math.abs(Math.sin(k * Math.PI * 6)) * 26, expr: 'happy', mouth: 'open', flip: side < 0 ? 1 : -1, armL: Math.sin(k * 30) * 20, armR: -Math.sin(k * 30) * 20 };
    }, () => { fx.P = fx.P.filter(p => p.tag !== 'toy'); fx.hearts(5); });
  }
  function aPat() { snd('pop'); fx.hearts(3); play('pat', 550, (k) => ({ sx: 1 + pulse(k, 1) * .08, sy: 1 - pulse(k, 1) * .1, expr: 'happy' })); }
  function aHop(n) { play('hop', 700, (k) => ({ dy: -pulse(k, 1) * (n || 30), sy: k < .15 ? 1 - k * .8 : 1 + pulse(k, 1) * .05, expr: 'happy', mouth: 'open' })); }
  const TRICKS = {
    nhay: () => { snd('boing'); play('t', 1200, (k) => ({ dy: -pulse(k, 1) * 110, sx: k < .1 ? 1.12 : k > .9 ? 1.12 : .94, sy: k < .1 ? .85 : k > .9 ? .88 : 1.08, expr: 'happy', mouth: 'open', armL: -60 * pulse(k, 1), armR: -60 * pulse(k, 1) })); },
    xoay: () => { snd('whoosh'); play('t', 1300, (k) => ({ sx: Math.cos(k * Math.PI * 4), expr: 'happy', dy: -pulse(k, 1) * 12 })); },
    vay: () => { snd('chime'); play('t', 1600, (k) => ({ armR: -110 + Math.sin(k * Math.PI * 8) * 25, expr: 'wink', mouth: 'open', headR: 6 })); },
    lon: () => { snd('whoosh'); play('t', 1400, (k) => ({ dy: -pulse(k, 1) * 90, rot: (k < .15 ? 0 : k > .85 ? 360 : (k - .15) / .7 * 360), expr: 'happy', mouth: 'open' })); },
    mua: () => { snd('level'); play('t', 2600, (k, ts) => { if (Math.random() < .12) fx.emit({ type: 'text', text: ['♪', '♫', '✨'][Math.floor(rnd(0, 3))], x: anim.x + rnd(-60, 60), y: petCenterY(150), vy: -.6, life: 1200, size: 16, color: ['#ff8fab', '#ffd166', '#8ecae6'][Math.floor(rnd(0, 3))], bold: 1 }); return { rot: Math.sin(k * 25) * 14, dy: -Math.abs(Math.sin(k * 25)) * 14, armL: Math.sin(k * 25) * 50, armR: -Math.sin(k * 25) * 50, expr: 'happy', mouth: 'open', flip: Math.sin(k * 12.5) > 0 ? 1 : -1 }; }); },
    hat: () => { snd('chime'); play('t', 2600, (k) => { if (Math.random() < .14) fx.emit({ type: 'text', text: ['♪', '♫', '♬'][Math.floor(rnd(0, 3))], x: anim.x + 20 * anim.dir, y: petCenterY(90), vx: rnd(-.6, .6), vy: -.8, life: 1500, size: rnd(14, 22), color: ['#ff4d6d', '#7209b7', '#3a86ff', '#ff9f1c'][Math.floor(rnd(0, 4))], bold: 1 }); return { expr: 'happy', mouth: Math.sin(k * 30) > -.3 ? 'open' : 'o', headR: Math.sin(k * 8) * 8, armR: -70, sy: 1 + Math.sin(k * 30) * .02 }; }); },
    bay: () => { snd('whoosh'); play('t', 3000, (k) => { if (Math.random() < .2) fx.sparkle(anim.x + rnd(-30, 30), anim.y - 20 - pulse(k, 1) * 100, 1); return { dy: -pulse(k, 1) * 120 + Math.sin(k * 20) * 6, wing: Math.sin(k * 60) * 30, armL: Math.sin(k * 60) * 50 - 30, armR: Math.sin(k * 60) * 50 - 30, expr: 'happy', rot: Math.sin(k * 6) * 8 }; }); },
    phep: () => { snd('sparkle'); play('t', 2400, (k) => { if (Math.random() < .5) fx.sparkle(anim.x + rnd(-80, 80), anim.y - rnd(0, 180), 2); els.pet.setAttribute('filter', 'url(#pt-glow)'); return { expr: 'wow', armL: -120, armR: -120, dy: -pulse(k, 1) * 30, sx: 1 + pulse(k, 4) * .05 }; }, () => { els.pet.removeAttribute('filter'); fx.confetti(20); }); },
    cauvong: () => { snd('level'); const g = document.createElementNS(NS, 'g'); g.innerHTML = ['#ff595e', '#ffca3a', '#8ac926', '#1982c4', '#6a4c93'].map((c, i) => `<path d="M60,240 A140,140 0 0,1 340,240" transform="translate(0 ${i * 8})" stroke="${c}" stroke-width="8" fill="none" opacity=".85" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"><animate attributeName="stroke-dashoffset" from="1" to="0" dur="1s" fill="freeze"/></path>`).join(''); els.front.append(g); play('t', 3200, (k) => { if (Math.random() < .3) fx.sparkle(rnd(70, 330), rnd(110, 230), 1); return { expr: 'love', armL: -100, armR: -100, dy: -pulse(k, 2) * 20 }; }, () => { g.remove(); fx.confetti(40); }); }
  };
  function levelUp(lv) {
    snd('level'); fx.confetti(60); banner('⭐ LÊN CẤP ' + lv + '!');
    play('lv', 1600, (k) => { if (Math.random() < .5) fx.sparkle(anim.x + rnd(-60, 60), anim.y - rnd(0, 160), 2); els.pet.setAttribute('filter', 'url(#pt-glow)'); return { dy: -pulse(k, 1) * 70, rot: k * 360, expr: 'happy', mouth: 'open' }; }, () => els.pet.removeAttribute('filter'));
  }
  function banner(t, cls) { const b = els.banner; b.textContent = t; b.className = 'pt-banner on ' + (cls || ''); clearTimeout(banner.t); banner.t = setTimeout(() => { b.className = 'pt-banner'; }, 2200); }
  function hatch(done) {
    const p = S.pet; if (!p) return done && done();
    els.pet.style.visibility = 'hidden';
    const g = document.createElementNS(NS, 'g'); g.innerHTML = A.egg(p.sp, 'hx'); els.front.append(g);
    const crack = g.querySelector('[data-p="crack"]'); let t0 = 0; snd('pop');
    const step = ts => {
      if (!t0) t0 = ts; const k = (ts - t0) / (RM.matches ? 800 : 2600);
      const wob = Math.sin(k * Math.PI * (4 + k * 14)) * (4 + k * 14);
      g.setAttribute('transform', `translate(200 268) scale(${scaleOf() * 1.1}) rotate(${wob} 0 -10)`);
      if (crack) crack.setAttribute('opacity', clamp((k - .35) * 2, 0, 1));
      if (k < 1) { if (alive) requestAnimationFrame(step); return; }
      g.remove(); els.pet.style.visibility = ''; snd('hatch'); fx.confetti(70); fx.sparkle(200, 200, 20); anim.x = 200;
      for (let i = 0; i < 12; i++) fx.emit({ type: 'dot', x: 200 + rnd(-20, 20), y: 220, vx: rnd(-3, 3), vy: rnd(-4, -1), g: .2, life: 900, size: rnd(2, 5), color: '#fffaf0' });
      aHop(50); banner('🎉 Chào mừng ' + p.nm + '!'); done && done();
    };
    requestAnimationFrame(step);
  }

  /* ================= Tương tác ================= */
  function onPetTap(e) {
    if (!S || !S.pet || S.pet.dead) return; e.preventDefault();
    aPat(); patN++; localApply(p => { p.j += .5; });
    clearTimeout(patT); patT = setTimeout(sendPats, 2500);
  }
  function sendPats() { if (!patN || !S || !S.pet || S.pet.dead) { patN = 0; return; } const n = Math.min(30, patN); patN = 0; act({ op: 'pat', n }).catch(() => {}); }
  function renameCost() { return (cat && cat.rules && cat.rules.rename) || 20; }
  function canPay(price, what) {
    const b = C.getBalance(); const pend = queue.reduce((a, q) => a + (q.price || 0), 0);
    if (price + pend > b) { C.toast('Không đủ điểm cho ' + what + ' (cần ' + nf(price) + ', còn ' + nf(b - pend) + '). Làm bài tập để có thêm điểm nhé!', 1); snd('err'); return false; }
    return true;
  }
  function optimistic(price, feeds) { if (!price) return; C.setBalance(C.getBalance() - price); if (feeds && D) { D.fedToday = (D.fedToday || 0) + price; D.safe = D.fedToday >= D.min; drawDaily(); } }
  async function doFeed(f) {
    const p = S.pet; if (!p || p.dead) return;
    if (f.lv && lvOf() < f.lv) return C.toast('Cần bé đạt cấp ' + f.lv + '.', 1);
    if (live().h >= 100) { C.toast(p.nm + ' no căng bụng rồi! Thử tắm, chơi cùng bé hoặc đợi một lát.', 1); aHop(10); return; }
    if (!canPay(f.p, f.n)) return;
    aEat(f.e); localApply(q => { q.h += f.h; q.j += f.j || 0; if (f.en) q.e += f.en; }); optimistic(f.p, true);
    try { const r = await act({ op: 'feed', id: f.id }, { price: f.p }); if (r.xp) fx.text('+' + r.xp + ' XP', '#ffe066'); snd('coin'); } catch (_) {}
  }
  async function doCare(c) {
    const p = S.pet; if (!p || p.dead) return;
    if (c.lv && lvOf() < c.lv) return C.toast('Cần bé đạt cấp ' + c.lv + '.', 1);
    if (c.cure && !p.sick) return C.toast(p.nm + ' đang khoẻ, không cần uống thuốc.', 1);
    if (c.id === 'ngu' && live().e >= 90) return C.toast(p.nm + ' chưa buồn ngủ đâu!', 1);
    const cd = (S.cd || {})[c.id]; if (c.cd && cd > now()) return C.toast(p.nm + ' vừa ngủ dậy. Thử lại sau ' + Math.ceil((cd - now()) / 60000) + ' phút.', 1);
    if (!canPay(c.p, c.n)) return;
    ({ tam: aBath, chai: aBrush, spa: aSpa, ngu: aSleep, thuoc: () => aPill('💊'), vitamin: () => aPill('🍬') }[c.id] || aHop)();
    localApply(q => { if (c.c) q.c += c.c; if (c.j) q.j += c.j; if (c.en) q.e += c.en; if (c.cure) q.sick = 0; }); optimistic(c.p, true);
    try { const r = await act({ op: 'care', id: c.id }, { price: c.p }); if (r.xp) fx.text('+' + r.xp + ' XP', '#ffe066'); } catch (_) {}
  }
  async function doPlay(t) {
    const p = S.pet; if (!p || p.dead) return;
    if (p.sick) return C.toast(p.nm + ' đang ốm, cần uống thuốc trước.', 1);
    if (live().e < t.en) return C.toast(p.nm + ' mệt rồi. Cho bé ngủ hoặc ăn gì đó nhé!', 1);
    const pp = t.pp || 0; if (!canPay(pp, 'chơi ' + t.n)) return;
    aPlay(t.e); localApply(q => { q.j += t.j; q.e -= t.en; q.c -= 4; }); optimistic(pp, true);
    try { const r = await act({ op: 'play', id: t.id }, { price: pp }); if (r.xp) fx.text('+' + r.xp + ' XP', '#ffe066'); } catch (_) {}
  }
  async function doTrick(t) {
    const p = S.pet; if (!p || p.dead) return;
    if (live().e < 5) return C.toast(p.nm + ' mệt rồi, cho bé nghỉ ngơi nhé!', 1);
    const sp = t.sp || 0; if (!canPay(sp, 'màn diễn ' + t.n)) return;
    (TRICKS[t.id] || aHop)(); localApply(q => { q.e -= 5; q.j += 8; }); optimistic(sp, true);
    try { const r = await act({ op: 'trick', id: t.id }, { price: sp }); if (r.xp) fx.text('+' + r.xp + ' XP', '#ffe066'); } catch (_) {}
  }
  async function doBuy(kind, it, after) {
    if (it.lv && lvOf() < it.lv) return C.toast(it.n + ' cần bé đạt cấp ' + it.lv + '.', 1);
    if (!canPay(it.p, it.n)) return;
    optimistic(it.p, false);
    try { await act({ op: 'buy', kind, id: it.id }, { now: true }); snd('chime'); fx.sparkle(anim.x, petCenterY(), 14); C.toast('🛍️ Đã mua ' + it.n + '!'); tryOn = null; render(); after && after(); } catch (_) {}
  }
  async function doEquip(slot, id) { tryOn = null; S.eq[slot] = id; render(); snd('pop'); fx.sparkle(anim.x, petCenterY(), 8); try { await act({ op: 'equip', slot, id }); } catch (_) {} }
  async function doLearn(t) {
    if (lvOf() < t.lv) return C.toast('Kỹ năng ' + t.n + ' cần bé đạt cấp ' + t.lv + '.', 1);
    if (!canPay(t.p, t.n)) return; optimistic(t.p, false);
    try { await act({ op: 'learn', id: t.id }, { now: true }); C.toast('🎓 ' + S.pet.nm + ' đã học được ' + t.n + '!'); (TRICKS[t.id] || aHop)(); openPanel('show'); } catch (_) {}
  }

  /* ================= Thanh trên, khẩu phần ngày, chỉ số ================= */
  function drawTop() {
    const p = S.pet, sp = p && cat.by.species[p.sp];
    els.top.replaceChildren();
    const left = h('div', { class: 'pt-id' });
    if (p) {
      const nb = h('button', { class: 'pt-name', type: 'button', title: 'Đổi tên', 'aria-label': 'Tên thú cưng: ' + p.nm + '. Bấm để đổi tên', onclick: () => p.dead ? null : openPanel('rename') }, h('span', { class: 'pt-spe', 'aria-hidden': 'true', text: sp ? sp.e : '🐾' }), h('b', { text: p.nm }));
      const lv = h('div', { class: 'pt-lv' }, h('span', { class: 'pt-lvb', text: 'Cấp ' + (D.lv || 1) }), h('span', { class: 'pt-stg', text: D.stageName || '' }));
      const xp = h('div', { class: 'pt-xpbar', role: 'progressbar', 'aria-label': 'Kinh nghiệm', 'aria-valuemin': 0, 'aria-valuemax': D.need || 1, 'aria-valuenow': D.into || 0 }, h('i', { style: 'width:' + (D.maxed ? 100 : Math.round((D.into || 0) / (D.need || 1) * 100)) + '%' }));
      left.append(nb, lv, h('div', { class: 'pt-xpw' }, xp, h('small', { text: D.maxed ? 'Tối đa' : nf(D.into) + '/' + nf(D.need) + ' XP' })));
    } else left.append(h('b', { class: 'pt-title', text: '🐾 Nhà thú cưng' }));
    const pills = h('div', { class: 'pt-pills' },
      h('span', { class: 'pt-pill', title: 'Số dư điểm' }, '💰 ', h('b', { class: 'pt-balv', text: nf(C.getBalance()) })),
      h('span', { class: 'pt-pill fire' + (D && D.streakNow ? ' on' : ''), title: 'Chuỗi ngày nuôi đủ (kỷ lục ' + ((D && D.best) || 0) + ')' }, '🔥 ', h('b', { text: (D && D.streakNow) || 0 })),
      h('button', { class: 'pt-ibtn', type: 'button', 'aria-label': muted() ? 'Bật âm thanh' : 'Tắt âm thanh', text: muted() ? '🔇' : '🔊', onclick: () => { LS.set('sm_pet_snd', muted() ? '1' : '0'); drawTop(); snd('click'); } }),
      h('button', { class: 'pt-ibtn', type: 'button', 'aria-label': 'Hướng dẫn', text: '❓', onclick: () => openPanel('help') }));
    els.top.append(left, pills);
  }
  function fmtLeft(ms) { ms = Math.max(0, ms); const m = Math.floor(ms / 60000), hh = Math.floor(m / 60); return hh ? hh + ' giờ ' + (m % 60) + ' phút' : m + ' phút'; }
  function drawDaily() {
    const p = S.pet, d = els.daily; d.replaceChildren(); d.className = 'pt-daily';
    if (!p) { d.classList.add('info'); d.append(h('span', { class: 'pt-dic', text: '🥚' }), h('div', {}, h('b', { text: 'Nhận nuôi một bé thú cưng!' }), h('span', { text: ' Mỗi ngày cần chăm ít nhất ' + ((D && D.min) || 50) + ' điểm (đồ ăn, chăm sóc, chơi đùa, biểu diễn) – không thì bé sẽ mất.' }))); return; }
    if (p.dead) { d.classList.add('dead'); d.append(h('span', { class: 'pt-dic', text: '💔' }), h('div', {}, h('b', { text: p.nm + ' đã mất.' }), h('span', { text: ' Hồi sinh hoặc nhận nuôi bé mới bên dưới.' }))); return; }
    const fed = D.fedToday || 0, min = D.min || 50, pct = Math.min(100, Math.round(fed / min * 100)), left = D.endsAt - now();
    const ring = h('div', { class: 'pt-ring', style: '--p:' + pct, role: 'img', 'aria-label': 'Đã chăm ' + fed + ' trên ' + min + ' điểm hôm nay' }, h('span', { text: Math.min(fed, 999) + '/' + min }));
    let msg;
    if (D.safe) { d.classList.add('ok'); msg = h('div', {}, h('b', { text: '✅ Hôm nay đã chăm đủ!' }), h('span', { text: ' ' + p.nm + ' an toàn đến 0:00. Chuỗi 🔥 ' + D.streakNow + ' ngày.' })); }
    else if (D.grace) { d.classList.add('info'); msg = h('div', {}, h('b', { text: '🍼 Ngày đầu của ' + p.nm + ' – hôm nay chưa bắt buộc.' }), h('span', { text: ' Từ mai mỗi ngày cần chăm ≥ ' + min + ' điểm, nếu không bé sẽ mất.' })); }
    else {
      d.classList.add(left < 3 * 3600000 ? 'danger' : 'warn');
      msg = h('div', {}, h('b', { text: '⚠️ Cần chăm thêm ' + (min - fed) + ' điểm trong ' + fmtLeft(left) + '!' }), h('span', { text: ' Nếu không, ' + p.nm + ' sẽ mất lúc 0:00.' }));
      if (C.getBalance() < min - fed) msg.append(h('span', { class: 'pt-earn' }, ' Bạn chỉ còn ' + nf(C.getBalance()) + ' điểm – ', h('a', { href: '#bai-chung', text: 'làm bài tập để có điểm' }), ' nuôi bé!'));
    }
    const go = !D.safe ? h('button', { class: 'btn small primary', type: 'button', text: '🍖 Cho ăn', onclick: () => openPanel('feed') }) : null;
    d.append(ring, msg, go);
  }
  function drawMeters() {
    const p = S.pet, m = els.meters; if (!p || p.dead) { m.hidden = true; return; } m.hidden = false;
    const v = live();
    if (!m.children.length) STAT.forEach(([k, e, n]) => m.append(h('div', { class: 'pt-meter', 'data-k': k, role: 'meter', 'aria-label': n, 'aria-valuemin': 0, 'aria-valuemax': 100 }, h('span', { class: 'pt-me', text: e }), h('div', { class: 'pt-mb' }, h('i')), h('small', { text: n }))));
    STAT.forEach(([k]) => { const el = m.querySelector('[data-k="' + k + '"]'), val = Math.round(Math.min(100, v[k])); el.setAttribute('aria-valuenow', val); el.dataset.lv = val < 25 ? 'low' : val < 55 ? 'mid' : 'hi'; el.querySelector('i').style.width = val + '%'; });
  }
  function drawDock() {
    const p = S.pet, d = els.dock; d.replaceChildren();
    const B = (e, t, f, x) => h('button', { class: 'pt-act' + (x ? ' ' + x : ''), type: 'button', onclick: () => { snd('click'); f(); } }, h('span', { class: 'pt-ae', 'aria-hidden': 'true', text: e }), h('span', { text: t }));
    if (!p) return;
    if (p.dead) {
      const dd = D.dead || {}, wrap = h('div', { class: 'pt-deadcard' });
      wrap.append(h('p', {}, h('b', { text: '💔 ' + p.nm + ' đã mất lúc 0:00 ngày ' + new Date(dd.at).toLocaleDateString('vi-VN') + '.' }), ' Hôm trước bé chỉ được chăm ' + (dd.fed || 0) + '/' + (D.min || 50) + ' điểm.'));
      if (dd.canRevive) wrap.append(h('button', { class: 'btn primary big', type: 'button', text: '✨ Hồi sinh ' + p.nm + ' (' + nf(dd.reviveCost) + ' điểm)', onclick: revive }), h('p', { class: 'hint', text: 'Còn hồi sinh được đến ' + new Date(dd.reviveUntil - 1).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) + '. Bé giữ nguyên cấp, kỹ năng và đồ đạc.' }));
      wrap.append(h('button', { class: 'btn', type: 'button', text: '🕊️ Tiễn bé vào Album & nuôi bé mới', onclick: release }));
      d.append(wrap); return;
    }
    d.append(B('🍖', 'Cho ăn', () => openPanel('feed'), D.safe ? '' : 'hot'), B('🛁', 'Chăm sóc', () => openPanel('care')), B('🎾', 'Chơi', () => openPanel('play')), B('🎪', 'Biểu diễn', () => openPanel('show')),
      B('🎮', 'Mini game', () => openPanel('games')), B('🛍️', 'Cửa hàng', () => openPanel('shop')), B('🏆', 'Nhiệm vụ', () => openPanel('quests'), (D.quests || []).some(q => q.done && !q.claimed) ? 'dot' : ''),
      B('📖', 'Album', () => openPanel('album')), B('🥇', 'Xếp hạng', () => openPanel('board')));
  }
  async function revive() {
    const dd = D.dead; if (!canPay(dd.reviveCost, 'hồi sinh')) return;
    try { await act({ op: 'revive' }, { now: true }); snd('hatch'); banner('✨ ' + S.pet.nm + ' đã trở lại!'); fx.confetti(60); for (let i = 0; i < 30; i++) fx.emit({ type: 'star', x: 200 + rnd(-30, 30), y: 300 - i * 9, vy: -1, life: 1200, size: 4, color: '#fff6b0' }); aHop(60); } catch (_) {}
  }
  async function release() {
    if (!confirm('Tiễn ' + S.pet.nm + ' vào Album kỷ niệm? Sau đó bạn có thể nhận nuôi bé mới.')) return;
    try { await act({ op: 'release' }, { now: true }); C.toast('🕊️ ' + 'Bé đã vào Album kỷ niệm.'); } catch (_) {}
  }
  function showDied() { snd('sad'); banner('💔 Bé đã mất vì không được chăm đủ', 'sad'); }

  /* ================= Màn nhận nuôi ================= */
  let pick = null;
  function drawAdopt() {
    const P = els.panel; P.replaceChildren();
    const list = cat.species;
    pick = pick && cat.by.species[pick] ? pick : list[0].id;
    const sp = cat.by.species[pick];
    // trình diễn trứng/bé trên sân khấu
    els.pet.innerHTML = ''; els.front.innerHTML = '';
    const g = document.createElementNS(NS, 'g'); g.innerHTML = `<g transform="translate(200 268) scale(.66)">${A.pet({ sp: pick, uid: 'ad', expr: 'happy' })}</g>`; els.front.append(g);
    const card = h('section', { class: 'pt-card pt-adopt' });
    card.append(h('h2', { text: '🥚 Nhận nuôi thú cưng' }),
      h('p', { class: 'hint', html: 'Chọn một bé, đặt tên rồi bấm <b>Nhận nuôi</b>. Mỗi ngày bạn cần chi <b>ít nhất ' + ((D && D.min) || 50) + ' điểm</b> (từ làm bài tập) cho đồ ăn, chăm sóc, chơi đùa hoặc biểu diễn, nếu không bé sẽ mất. Game này <b>không</b> tính vào báo cáo cho phụ huynh.' }));
    const grid = h('div', { class: 'pt-spgrid', role: 'radiogroup', 'aria-label': 'Chọn loài' });
    list.forEach(s => {
      const b = h('button', { class: 'pt-spc' + (s.id === pick ? ' on' : ''), type: 'button', role: 'radio', 'aria-checked': s.id === pick, onclick: () => { pick = s.id; snd('pop'); drawAdopt(); } });
      b.innerHTML = A.mini({ sp: s.id }, 70); b.append(h('b', { text: s.n }), h('span', { class: 'pt-price', text: '💰 ' + nf(s.p) }));
      grid.append(b);
    });
    const name = h('input', { type: 'text', maxlength: 16, id: 'pt-nm', placeholder: sp.n, 'aria-label': 'Tên thú cưng', value: LS.get('sm_pet_nm') || '' });
    const go = h('button', { class: 'btn primary big', type: 'button', text: '🐣 Nhận nuôi ' + sp.n + ' (' + nf(sp.p) + ' điểm)', onclick: async () => {
      if (!canPay(sp.p, 'nhận nuôi')) return; go.disabled = true; LS.set('sm_pet_nm', null);
      try { els.front.innerHTML = ''; els.pet.style.visibility = 'hidden'; await act({ op: 'adopt', sp: sp.id, name: name.value.trim() || sp.n }, { now: true }); hatch(); }
      catch (_) { go.disabled = false; els.pet.style.visibility = ''; drawAdopt(); }
    } });
    name.oninput = () => LS.set('sm_pet_nm', name.value);
    card.append(grid, h('label', { for: 'pt-nm', text: 'Đặt tên cho bé' }), name, go);
    if ((S.al || []).length) card.append(h('button', { class: 'btn ghost', type: 'button', text: '📖 Album kỷ niệm (' + S.al.length + ')', onclick: () => openPanel('album') }));
    P.append(card);
  }

  /* ================= Bảng (bottom sheet) ================= */
  function openPanel(name, sub) {
    closePanel(true);
    const wrap = h('div', { class: 'pt-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Bảng' }), pn = h('div', { class: 'pt-sp' });
    const head = h('div', { class: 'pt-sh' }), body = h('div', { class: 'pt-sb' });
    const close = h('button', { class: 'pt-ibtn', type: 'button', 'aria-label': 'Đóng', text: '✕', onclick: () => closePanel() });
    pn.append(head, body); wrap.append(pn); document.body.append(wrap);
    wrap.addEventListener('pointerdown', e => { if (e.target === wrap) closePanel(); });
    const esc = e => { if (e.key === 'Escape' && !game) closePanel(); }; document.addEventListener('keydown', esc);
    sheet = { name, wrap, head, body, close, sub, esc };
    fillPanel();
    requestAnimationFrame(() => { wrap.classList.add('on'); const f = pn.querySelector('button,input'); f && f.focus({ preventScroll: true }); });
    const r = els.stage.getBoundingClientRect(); if (r.top < 0 || r.top > innerHeight * .3) els.stage.scrollIntoView({ behavior: RM.matches ? 'auto' : 'smooth', block: 'start' });
  }
  function closePanel(quick) {
    if (!sheet) return; const w = sheet.wrap; document.removeEventListener('keydown', sheet.esc); sheet = null;
    if (tryOn) { tryOn = null; render(); }
    if (quick) w.remove(); else { w.classList.remove('on'); setTimeout(() => w.remove(), 250); }
  }
  function title(t, sub) { sheet.head.replaceChildren(h('h2', { text: t }), sub ? h('span', { class: 'pt-sub', text: sub }) : '', sheet.close); }
  function fillPanel() {
    if (!sheet || !S) return; const b = sheet.body; b.replaceChildren();
    const P = PANELS[sheet.name]; if (P) P(b, sheet.sub);
  }
  const price = n => h('span', { class: 'pt-price', text: n ? '💰 ' + nf(n) : 'Miễn phí' });
  const lock = lv => h('span', { class: 'pt-lock', text: '🔒 Cấp ' + lv });
  function itemBtn(o) {
    const b = h('button', { class: 'pt-item' + (o.cls ? ' ' + o.cls : ''), type: 'button', disabled: o.disabled || null, 'aria-label': o.label || o.name, onclick: o.onclick });
    const ic = h('span', { class: 'pt-ie', 'aria-hidden': 'true' }); if (o.html) ic.innerHTML = o.html; else ic.textContent = o.e || '';
    b.append(ic, h('b', { text: o.name }), o.meta ? h('small', { text: o.meta }) : '', o.tail || '');
    return b;
  }
  const PANELS = {
    feed(b) {
      title('🍖 Cho ăn', 'Đồ ăn tính vào khẩu phần ngày');
      const g = h('div', { class: 'pt-grid' });
      cat.foods.forEach(f => { const lk = f.lv && lvOf() < f.lv; g.append(itemBtn({ e: f.e, name: f.n, meta: '🍖+' + f.h + ' 😊+' + f.j + (f.en ? ' ⚡+' + f.en : '') + (f.x ? ' · XP×' + f.x : ''), tail: lk ? lock(f.lv) : price(f.p), cls: lk ? 'locked' : '', label: 'Cho ăn ' + f.n + ', ' + f.p + ' điểm', onclick: () => lk ? C.toast('Cần bé đạt cấp ' + f.lv + '.', 1) : doFeed(f) })); });
      b.append(dailyMini(), g);
    },
    care(b) {
      title('🛁 Chăm sóc', 'Có giá điểm → tính vào khẩu phần ngày');
      const g = h('div', { class: 'pt-grid' });
      cat.care.forEach(c => { const lk = c.lv && lvOf() < c.lv, cd = c.cd && (S.cd || {})[c.id] > now(); g.append(itemBtn({ e: c.e, name: c.n, meta: [c.c ? '🫧+' + c.c : '', c.j ? '😊+' + c.j : '', c.en ? '⚡+' + c.en : '', c.cure ? 'Chữa ốm' : ''].filter(Boolean).join(' '), tail: lk ? lock(c.lv) : cd ? h('span', { class: 'pt-lock', text: '⏳ ' + Math.ceil(((S.cd[c.id]) - now()) / 60000) + ' phút' }) : price(c.p), cls: (lk ? 'locked' : '') + (c.cure && S.pet.sick ? ' glow' : ''), onclick: () => lk ? C.toast('Cần bé đạt cấp ' + c.lv + '.', 1) : doCare(c) })); });
      b.append(dailyMini(), g);
    },
    play(b) {
      title('🎾 Chơi đùa', 'Mua đồ chơi 1 lần · mỗi lần chơi tốn vài điểm (tính vào phần chăm bé hôm nay)');
      const g = h('div', { class: 'pt-grid' }), own = S.own.t;
      cat.toys.forEach(t => {
        const has = own.includes(t.id), lk = t.lv && lvOf() < t.lv;
        g.append(itemBtn({ e: t.e, name: t.n, meta: '😊+' + t.j + ' ⚡−' + t.en + (has ? '' : ' · chơi ' + nf(t.pp || 0) + ' điểm/lần'), tail: has ? h('span', { class: 'pt-ok', text: '▶ Chơi · ' + nf(t.pp || 0) + ' 💰' }) : lk ? lock(t.lv) : price(t.p), cls: has ? 'owned' : lk ? 'locked' : '',
          onclick: () => has ? doPlay(t) : lk ? C.toast('Cần bé đạt cấp ' + t.lv + '.', 1) : confirmBuy('toy', t, () => fillPanel()) }));
      });
      b.append(g);
    },
    show(b) {
      title('🎪 Biểu diễn', 'Dạy kỹ năng 1 lần · mỗi màn diễn tốn vài điểm (tính vào phần chăm bé hôm nay)');
      const g = h('div', { class: 'pt-grid' }), k = S.pet.k || [];
      cat.tricks.forEach(t => { const has = k.includes(t.id), lk = lvOf() < t.lv; g.append(itemBtn({ e: t.e, name: t.n, meta: has ? 'Đã học' : 'Cần cấp ' + t.lv + ' · diễn ' + nf(t.sp || 0) + ' điểm/lần', tail: has ? h('span', { class: 'pt-ok', text: '▶ Diễn · ' + nf(t.sp || 0) + ' 💰' }) : lk ? lock(t.lv) : price(t.p), cls: has ? 'owned' : lk ? 'locked' : '', onclick: () => has ? doTrick(t) : lk ? C.toast('Cần bé đạt cấp ' + t.lv + '.', 1) : confirmAsk('Dạy ' + S.pet.nm + ' kỹ năng ' + t.n + '?', t.p, () => doLearn(t)) })); });
      b.append(g);
    },
    games(b) {
      title('🎮 Mini game', 'Vé ' + ((cat.games[0] || {}).p || 10) + ' điểm/ván · thưởng XP & niềm vui');
      const g = h('div', { class: 'pt-glist' }), best = (S.s && S.s.best) || {};
      const DESC = { hung: 'Kéo/di chuyển bé để hứng đồ ăn rơi. Tránh ớt cay 🌶️!', nho: 'Lật thẻ tìm các cặp giống nhau, càng ít lượt càng nhiều điểm.', bong: 'Chạm vỡ bong bóng bay lên. Bóng vàng nhiều điểm, tránh mây giông ⛈️.' };
      cat.games.forEach(x => g.append(h('button', { class: 'pt-gcard', type: 'button', onclick: () => startGame(x) }, h('span', { class: 'pt-ge', text: x.e }), h('div', {}, h('b', { text: x.n }), h('small', { text: DESC[x.id] || '' }), h('small', { class: 'pt-best', text: 'Kỷ lục: ' + (best[x.id] || 0) })), price(x.p))));
      b.append(g, h('p', { class: 'hint', text: 'Mini game không trả lại điểm – chỉ cho bé XP và niềm vui. Bé cần đủ năng lượng và không bị ốm.' }));
    },
    shop(b, sub) {
      const tabs = [['acc', '🎀 Phụ kiện'], ['col', '🎨 Màu lông'], ['room', '🏠 Phòng'], ['furn', '🛋️ Nội thất'], ['toy', '🧸 Đồ chơi']];
      const cur = sub || 'acc'; sheet.sub = cur;
      title('🛍️ Cửa hàng', 'Chạm để thử – mua bằng điểm');
      const nav = h('div', { class: 'pt-tabs', role: 'tablist' });
      tabs.forEach(([k, n]) => nav.append(h('button', { class: 'pt-tab', role: 'tab', 'aria-selected': k === cur, type: 'button', text: n, onclick: () => { sheet.sub = k; tryOn = null; render(); fillPanel(); } })));
      const g = h('div', { class: 'pt-grid shop' }), p = S.pet;
      const own = { acc: S.own.a, col: S.own.c, room: S.own.r, furn: S.own.f, toy: S.own.t }[cur];
      const list = { acc: cat.acc, col: cat.colors, room: cat.rooms, furn: cat.furn, toy: cat.toys }[cur];
      const SLOTN = { hat: 'Mũ', eyes: 'Kính', neck: 'Cổ', back: 'Lưng', fl: 'Sàn trái', fr: 'Sàn phải', wl: 'Tường trái', wr: 'Tường phải', ce: 'Trần', rug: 'Thảm' };
      if (cur === 'col') g.append(itemBtn({ html: A.mini({ sp: p.sp, col: '' }, 56), name: 'Màu gốc', meta: 'Mặc định', tail: S.eq.col ? h('span', { class: 'pt-ok', text: 'Dùng' }) : h('span', { class: 'pt-on', text: '✔ Đang dùng' }), cls: 'owned', onclick: () => doEquip('col', '') }));
      list.forEach(it => {
        const has = own.includes(it.id), slot = cur === 'col' ? 'col' : cur === 'room' ? 'room' : it.s, on = slot && S.eq[slot] === it.id, lk = it.lv && lvOf() < it.lv;
        let html = null, e = it.e;
        if (cur === 'acc') html = A.mini({ sp: p.sp, col: S.eq.col, eq: { [it.s]: it.id } }, 56);
        else if (cur === 'col') html = A.mini({ sp: p.sp, col: it.id }, 56);
        else if (cur === 'room') html = `<svg viewBox="0 0 400 300" width="72" height="54" aria-hidden="true">${A.room(it.id, 'day', 'th' + it.id)}</svg>`;
        else if (cur === 'furn' && it.s === 'rug') html = `<svg viewBox="80 230 240 70" width="72" height="22" aria-hidden="true">${A.furn('rug', it.id)}</svg>`;
        const tail = has ? (slot ? (on ? h('span', { class: 'pt-on', text: '✔ Đang dùng' }) : h('span', { class: 'pt-ok', text: 'Dùng' })) : h('span', { class: 'pt-on', text: '✔ Đã có' })) : lk ? lock(it.lv) : price(it.p);
        g.append(itemBtn({ html, e, name: it.n, meta: slot && SLOTN[slot] ? SLOTN[slot] : cur === 'toy' ? '😊+' + it.j : '', tail, cls: (has ? 'owned' : lk ? 'locked' : '') + (on ? ' on' : '') + (tryOn && tryOn.id === it.id ? ' trying' : ''),
          onclick: () => {
            if (has) { if (!slot) return; if (on && slot !== 'room') doEquip(slot, ''); else doEquip(slot, it.id); fillPanel(); return; }
            if (lk) return C.toast(it.n + ' cần bé đạt cấp ' + it.lv + '.', 1);
            if (slot) { tryOn = { slot, id: it.id, kind: cur, it }; render(); snd('pop'); fillPanel(); showTryBar(); } else confirmBuy(cur, it, () => fillPanel());
          } }));
      });
      const tb = tryOn ? h('div', { class: 'pt-confirm pt-trysheet' }, h('span', { text: '👀 Đang thử: ' + tryOn.it.n + ' (xem trên sân khấu)' }), h('button', { class: 'btn primary', type: 'button', text: 'Mua ' + nf(tryOn.it.p) + ' điểm', onclick: () => doBuy(tryOn.kind, tryOn.it, () => fillPanel()) }), h('button', { class: 'btn', type: 'button', text: 'Bỏ', onclick: () => { tryOn = null; render(); fillPanel(); } })) : '';
      b.append(nav, tb, g);
    },
    quests(b) {
      title('🏆 Nhiệm vụ & Thành tích');
      const q = h('div', { class: 'pt-quests' }); q.append(h('h3', { text: '📅 Nhiệm vụ hôm nay' }));
      (D.quests || []).forEach(x => q.append(h('div', { class: 'pt-quest' + (x.claimed ? ' done' : '') }, h('div', {}, h('b', { text: x.text }), h('div', { class: 'pt-qbar' }, h('i', { style: 'width:' + Math.round(x.prog / x.target * 100) + '%' })), h('small', { text: x.prog + '/' + x.target + ' · thưởng ' + x.xp + ' XP' })),
        x.claimed ? h('span', { class: 'pt-on', text: '✔ Đã nhận' }) : h('button', { class: 'btn small' + (x.done ? ' primary' : ''), type: 'button', disabled: !x.done || null, text: x.done ? '🎁 Nhận' : 'Chưa xong', onclick: async () => { try { const r = await act({ op: 'claim', id: x.id }, { now: true }); snd('chime'); fx.confetti(25); fx.text('+' + r.xp + ' XP', '#ffe066'); fillPanel(); } catch (_) {} } }))));
      const a = h('div', { class: 'pt-achs' }); a.append(h('h3', { text: '🎖️ Huy hiệu' }));
      (D.ach || []).forEach(x => { const def = cat.by.ach[x.id] || {}; a.append(h('div', { class: 'pt-ach t' + Math.min(5, x.tier) }, h('span', { class: 'pt-badge', text: def.e || '🏅' }), h('div', {}, h('b', { text: def.n + (x.tier ? ' · bậc ' + x.tier : '') }), h('small', { text: (def.d || '') + ': ' + nf(x.val) + (x.next ? ' / ' + nf(x.next) : ' · tối đa') }), h('div', { class: 'pt-qbar' }, h('i', { style: 'width:' + (x.next ? Math.min(100, Math.round(x.val / x.next * 100)) : 100) + '%' }))))); });
      const s = S.s || {}, st = h('dl', { class: 'pt-stats' });
      [['Lần cho ăn', s.fd], ['Điểm đã chi cho bé', s.ps], ['Ván mini game', s.gm], ['Chuỗi kỷ lục', D.best], ['Bé đã nuôi', s.ad], ['Lần hồi sinh', s.rv]].forEach(([k, v]) => st.append(h('div', {}, h('dt', { text: k }), h('dd', { text: nf(v) }))));
      b.append(q, a, h('h3', { text: '📊 Thống kê' }), st);
    },
    album(b) {
      title('📖 Album kỷ niệm');
      const al = S.al || []; if (!al.length) { b.append(h('p', { class: 'muted', text: 'Chưa có kỷ niệm nào. Hãy chăm bé thật tốt nhé!' })); return; }
      const g = h('div', { class: 'pt-grid' });
      al.forEach(x => { const sp = cat.by.species[x.sp] || {}; g.append(itemBtn({ html: A.mini({ sp: x.sp, expr: 'happy' }, 60), name: x.nm, meta: (sp.n || '') + ' · Cấp ' + x.lv, tail: h('small', { text: new Date(x.b).toLocaleDateString('vi-VN') + ' → ' + new Date(x.e).toLocaleDateString('vi-VN') }), cls: 'owned' })); });
      b.append(g);
    },
    async board(b) {
      title('🥇 Bảng xếp hạng thú cưng'); b.append(h('p', { class: 'muted', text: 'Đang tải…' }));
      try {
        const r = await C.api('petBoard', {}); if (!sheet || sheet.name !== 'board') return; b.replaceChildren();
        const ol = h('ol', { class: 'pt-board' });
        (r.board || []).forEach(x => ol.append(h('li', { class: x.me ? 'me' : '' }, h('span', { class: 'rk', text: ['🥇', '🥈', '🥉'][x.rank - 1] || x.rank }), h('span', { class: 'pt-bpet', html: A.mini({ sp: x.sp, expr: x.alive ? 'happy' : 'dead' }, 40) }), h('div', {}, h('b', { text: x.name + (x.alive ? '' : ' 💔') }), h('small', { text: x.who + (x.me ? ' (bạn)' : '') + ' · 🔥 ' + x.streak })), h('b', { class: 'pt-blv', text: 'Cấp ' + x.lv }))));
        if (!ol.children.length) ol.append(h('li', { class: 'muted', text: 'Chưa có ai nuôi thú cưng.' }));
        b.append(ol); if (r.me && !(r.board || []).some(x => x.me)) b.append(h('p', { class: 'hint', text: 'Bạn đứng hạng ' + r.me.rank + '.' }));
      } catch (e) { b.replaceChildren(h('p', { class: 'err', text: e.message })); }
    },
    rename(b) {
      title('✏️ Đổi tên', '10 điểm');
      const i = h('input', { type: 'text', maxlength: 16, value: S.pet.nm, 'aria-label': 'Tên mới' });
      b.append(i, h('div', { class: 'row wrap', style: 'margin-top:.6rem' }, h('button', { class: 'btn primary', type: 'button', text: 'Đổi tên (' + nf(renameCost()) + ' điểm)', onclick: async () => { const v = i.value.trim(); if (!v || v === S.pet.nm) return; if (!canPay(renameCost(), 'đổi tên')) return; try { await act({ op: 'rename', name: v }, { now: true }); closePanel(); aHop(); } catch (_) {} } })));
    },
    help(b) {
      title('❓ Cách chơi');
      const min = (D && D.min) || 50;
      b.append(h('div', { class: 'pt-help', html: `<ul>
<li>🍖 <b>Luật sống còn:</b> mỗi ngày (tính theo giờ Việt Nam) bạn phải chi <b>ít nhất ${min} điểm</b> cho <b>đồ ăn, chăm sóc, chơi đùa hoặc biểu diễn</b> của bé. Hết ngày mà chưa đủ → bé <b>mất lúc 0:00</b>. Ngày nhận nuôi và ngày hồi sinh được miễn.</li>
<li>📚 Điểm có được khi <b>làm bài tập</b>. Không có cách nào khác để kiếm điểm trong game này.</li>
<li>💔 Bé mất: có <b>7 ngày</b> để hồi sinh (giữ nguyên cấp, kỹ năng). Quá hạn thì tiễn bé vào Album và nuôi bé mới.</li>
<li>📊 4 chỉ số giảm dần theo thời gian: No bụng, Vui vẻ, Sạch sẽ, Năng lượng. Bé quá đói hoặc quá bẩn sẽ <b>bị ốm</b> (cần uống thuốc). Bé vui thì lên cấp nhanh hơn.</li>
<li>⭐ Mọi điểm chi cho bé đều thành XP. Lên cấp để bé lớn: Sơ sinh → Bé nhí (5) → Thiếu niên (15) → Trưởng thành (30) → Huyền thoại (50, có hào quang).</li>
<li>🔥 Chuỗi ngày nuôi đủ giúp tăng XP (tối đa +50%).</li>
<li>🎾 Đồ chơi và 🎪 kỹ năng mua/học 1 lần; <b>mỗi lần chơi hoặc diễn tốn vài điểm</b> (không phải chờ, chỉ cần bé còn năng lượng). 🎮 Mini game tốn vé, thưởng XP.</li>
<li>🛍️ Cửa hàng: phụ kiện, màu lông đặc biệt, 10 căn phòng, nội thất. Chạm để thử trước khi mua.</li>
<li>👪 Game thú cưng <b>không</b> được tính vào báo cáo dành cho phụ huynh.</li></ul>` }));
    }
  };
  function dailyMini() {
    if (!D || D.safe || !S.pet || S.pet.dead) return '';
    return h('p', { class: 'pt-need', text: '⚠️ Hôm nay cần thêm ' + Math.max(0, D.min - D.fedToday) + ' điểm (đồ ăn, chăm sóc, chơi, diễn) để ' + S.pet.nm + ' được an toàn.' });
  }
  function confirmAsk(text, cost, yes) {
    if (!sheet) return; const bar = h('div', { class: 'pt-confirm' }, h('span', { text: text }), h('button', { class: 'btn primary', type: 'button', text: cost ? 'Mua ' + nf(cost) + ' điểm' : 'Đồng ý', onclick: () => { bar.remove(); yes(); } }), h('button', { class: 'btn', type: 'button', text: 'Huỷ', onclick: () => bar.remove() }));
    sheet.body.querySelectorAll('.pt-confirm').forEach(x => x.remove()); sheet.body.prepend(bar); bar.querySelector('.btn').focus();
  }
  function confirmBuy(kind, it, after) { confirmAsk('Mua ' + it.n + '?', it.p, () => doBuy(kind, it, after)); }
  function showTryBar() {
    const t = tryOn, bar = els.tryBar; if (!t || sheet) { bar.hidden = true; return; }
    bar.replaceChildren(h('span', { text: '👀 Đang thử: ' + t.it.n }), h('button', { class: 'btn small primary', type: 'button', text: 'Mua ' + nf(t.it.p) + ' điểm', onclick: () => doBuy(t.kind, t.it, () => fillPanel()) }), h('button', { class: 'btn small', type: 'button', text: 'Bỏ', onclick: () => { tryOn = null; render(); fillPanel(); } }));
    bar.hidden = false;
  }

  /* ================= Mini game ================= */
  async function startGame(g) {
    const p = S.pet; if (!p || p.dead) return;
    if (p.sick) return C.toast(p.nm + ' đang ốm, cần uống thuốc trước khi chơi.', 1);
    if (live().e < 10) return C.toast(p.nm + ' mệt rồi. Cho bé ngủ hoặc ăn gì đó nhé!', 1);
    if (!canPay(g.p, 'vé chơi')) return;
    closePanel(true); optimistic(g.p, false);
    let st; try { st = await act({ op: 'gameStart', g: g.id }, { now: true }); } catch (_) { return; }
    openGame(g, st);
  }
  function petImage(expr) {
    const e = S.eq, svg = `<svg xmlns="${NS}" viewBox="-90 -230 180 245" width="180" height="245">${A.pet({ sp: S.pet.sp, col: e.col, eq: { hat: e.hat, eyes: e.eyes, neck: e.neck, back: e.back }, uid: 'gi', expr: expr || 'happy' })}</svg>`;
    const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); return img;
  }
  function openGame(g, st) {
    const ov = h('div', { class: 'pt-game', role: 'dialog', 'aria-modal': 'true', 'aria-label': g.n });
    const hud = h('div', { class: 'pt-ghud' }), scoreEl = h('b', { text: '0' }), timeEl = h('b', { text: '' }), quit = h('button', { class: 'btn small', type: 'button', text: '✕ Dừng' });
    hud.append(h('span', { text: g.e + ' ' + g.n }), h('span', {}, '⭐ ', scoreEl), h('span', {}, '⏱ ', timeEl), quit);
    const area = h('div', { class: 'pt-garea' });
    ov.append(hud, area); document.body.append(ov);
    game = { g, ov, area, score: 0, over: false, setScore(n) { this.score = Math.max(0, Math.round(n)); scoreEl.textContent = this.score; }, setTime(s) { timeEl.textContent = s; }, stop: null };
    quit.onclick = () => endGame();
    ov.addEventListener('keydown', e => { if (e.key === 'Escape') endGame(); });
    const GAMES = { hung: gameCatch, nho: gameMemory, bong: gameBubble };
    countdown(area, () => { if (game && !game.over) (GAMES[g.id] || gameCatch)(game); });
    quit.focus();
  }
  function countdown(area, go) {
    const c = h('div', { class: 'pt-count', text: '3' }); area.append(c); let n = 3; snd('click');
    const t = setInterval(() => { n--; if (n > 0) { c.textContent = n; snd('click'); } else { clearInterval(t); c.remove(); snd('coin'); go(); } }, RM.matches ? 300 : 650);
  }
  async function endGame() {
    const G = game; if (!G || G.over) return; G.over = true; if (G.stop) G.stop();
    const score = G.score; let res = null;
    try { res = await act({ op: 'gameEnd', g: G.g.id, score }, { now: true }); } catch (_) {}
    const box = h('div', { class: 'pt-gres' }, h('div', { class: 'pt-gbig', text: '⭐ ' + score }), h('p', { text: res ? '+' + res.xp + ' XP cho ' + S.pet.nm + ' · Kỷ lục: ' + res.best : 'Không lưu được kết quả.' }));
    if (res && res.best === score && score > 0) box.prepend(h('div', { class: 'pt-newbest', text: '🏆 Kỷ lục mới!' }));
    box.append(h('div', { class: 'row wrap', style: 'justify-content:center' },
      h('button', { class: 'btn primary', type: 'button', text: '🔁 Chơi lại (' + G.g.p + ' điểm)', onclick: () => { G.ov.remove(); game = null; startGame(G.g); } }),
      h('button', { class: 'btn', type: 'button', text: '🏠 Về nhà', onclick: () => { G.ov.remove(); game = null; if (res && res.xp) { fx.text('+' + res.xp + ' XP', '#ffe066'); aHop(40); } } })));
    G.area.replaceChildren(box); snd(score > 0 ? 'level' : 'sad'); box.querySelector('.btn').focus();
  }
  function emojiSprite(e, size) { const c = document.createElement('canvas'), d = Math.min(2, devicePixelRatio || 1); c.width = c.height = Math.ceil(size * 1.3 * d); const g = c.getContext('2d'); g.scale(d, d); g.font = size + 'px system-ui, "Segoe UI Emoji", "Apple Color Emoji", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(e, size * .65, size * .68); c._s = size * 1.3; return c; }
  function gameCanvas(G) {
    const cv = h('canvas', { class: 'pt-gcv' }); G.area.append(cv);
    const fit = () => { const r = G.area.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1); cv.width = r.width * d; cv.height = r.height * d; cv._d = d; cv._w = r.width; cv._h = r.height; };
    fit(); return cv;
  }
  // 1) Hứng quà
  function gameCatch(G) {
    const cv = gameCanvas(G), g = cv.getContext('2d'), img = petImage('happy'), sad = petImage('wow');
    const GOOD = ['🍎', '🍪', '🍕', '🍣', '🍰', '🍙', '🥕', '🍓', '🍩'], sp = {}; GOOD.concat(['⭐', '🌶️']).forEach(e => { sp[e] = emojiSprite(e, 34); });
    let px = cv._w / 2, tx = px, items = [], t0 = performance.now(), last = t0, spawn = 0, combo = 0, hurt = 0, pops = [], rafG = 0;
    const DUR = 30000;
    const move = e => { const r = cv.getBoundingClientRect(); tx = clamp(e.clientX - r.left, 30, cv._w - 30); };
    cv.addEventListener('pointerdown', move); cv.addEventListener('pointermove', move);
    const key = e => { if (e.key === 'ArrowLeft') tx = clamp(tx - 60, 30, cv._w - 30); if (e.key === 'ArrowRight') tx = clamp(tx + 60, 30, cv._w - 30); };
    window.addEventListener('keydown', key);
    const loop = ts => {
      rafG = requestAnimationFrame(loop); const dt = Math.min(40, ts - last) / 16.7; last = ts;
      const el = ts - t0, left = Math.max(0, DUR - el); G.setTime(Math.ceil(left / 1000) + 's');
      if (left <= 0) { cancelAnimationFrame(rafG); endGame(); return; }
      const W = cv._w, H = cv._h, d = cv._d, speed = 1 + el / DUR * 1.6;
      spawn -= dt; if (spawn <= 0) { spawn = rnd(18, 34) / speed; const r = Math.random(), e = r < .08 ? '⭐' : r < .24 ? '🌶️' : GOOD[Math.floor(rnd(0, GOOD.length))]; items.push({ e, x: rnd(24, W - 24), y: -30, v: rnd(2.2, 3.6) * speed, r: rnd(-.05, .05), a: 0 }); }
      px += (tx - px) * .25 * dt;
      g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, W, H);
      const pw = Math.min(120, W * .26), ph = pw * 245 / 180, py = H - ph - 6;
      items = items.filter(it => {
        it.y += it.v * dt; it.a += it.r * dt;
        g.save(); g.translate(it.x, it.y); g.rotate(it.a); const s = sp[it.e]; g.drawImage(s, -s._s / 2, -s._s / 2, s._s, s._s); g.restore();
        if (it.y > py + ph * .1 && it.y < py + ph * .5 && Math.abs(it.x - px) < pw * .42) {
          if (it.e === '🌶️') { combo = 0; hurt = 30; G.setScore(G.score - 15); snd('err'); pops.push({ t: '-15 🔥', x: it.x, y: it.y, c: '#ff595e', a: 40 }); }
          else { combo++; const pts = (it.e === '⭐' ? 30 : 10) + Math.min(20, combo * 2); G.setScore(G.score + pts); snd(it.e === '⭐' ? 'sparkle' : 'pop'); pops.push({ t: '+' + pts + (combo > 2 ? ' x' + combo : ''), x: it.x, y: it.y, c: it.e === '⭐' ? '#ffd60a' : '#fff', a: 40 }); }
          return false;
        }
        if (it.y > H + 30) { if (it.e !== '🌶️') combo = 0; return false; }
        return true;
      });
      const bob = Math.sin(ts / 120) * 3, im = hurt > 0 ? sad : img; if (hurt > 0) hurt -= dt;
      g.drawImage(im, px - pw / 2 + (hurt > 0 ? Math.sin(ts / 20) * 4 : 0), py + bob, pw, ph);
      pops = pops.filter(p => { p.a -= dt; p.y -= 1.2 * dt; g.globalAlpha = clamp(p.a / 40, 0, 1); g.font = '800 18px system-ui'; g.textAlign = 'center'; g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.5)'; g.strokeText(p.t, p.x, p.y); g.fillStyle = p.c; g.fillText(p.t, p.x, p.y); g.globalAlpha = 1; return p.a > 0; });
    };
    rafG = requestAnimationFrame(loop);
    G.stop = () => { cancelAnimationFrame(rafG); window.removeEventListener('keydown', key); };
  }
  // 2) Lật thẻ
  function gameMemory(G) {
    const E = ['🍎', '🍕', '🍰', '🍣', '🥕', '🍩', '🍓', '🧁'], deck = E.concat(E).map((e, i) => ({ e, i, open: false, done: false })).sort(() => Math.random() - .5);
    const grid = h('div', { class: 'pt-mem' }); G.area.append(grid);
    let first = null, lockB = false, moves = 0, pairs = 0; const t0 = performance.now();
    const tm = setInterval(() => G.setTime(Math.floor((performance.now() - t0) / 1000) + 's'), 250);
    const scoreNow = () => Math.max(10, 100 - Math.max(0, moves - 8) * 4 - Math.floor((performance.now() - t0) / 4000));
    deck.forEach(c => {
      const b = h('button', { class: 'pt-card3', type: 'button', 'aria-label': 'Thẻ úp' }, h('span', { class: 'f', text: '🐾' }), h('span', { class: 'b', text: c.e }));
      c.el = b;
      b.onclick = () => {
        if (lockB || c.open || c.done) return; c.open = true; b.classList.add('open'); b.setAttribute('aria-label', 'Thẻ ' + c.e); snd('pop');
        if (!first) { first = c; return; }
        moves++; const a = first; first = null;
        if (a.e === c.e) { a.done = c.done = true; pairs++; a.el.classList.add('done'); c.el.classList.add('done'); snd('chime'); G.setScore(scoreNow()); if (pairs === 8) { G.setScore(scoreNow()); setTimeout(endGame, 600); } }
        else { lockB = true; setTimeout(() => { a.open = c.open = false; a.el.classList.remove('open'); c.el.classList.remove('open'); a.el.setAttribute('aria-label', 'Thẻ úp'); c.el.setAttribute('aria-label', 'Thẻ úp'); lockB = false; }, 700); }
      };
      grid.append(b);
    });
    G.stop = () => { clearInterval(tm); if (pairs < 8) G.setScore(pairs ? Math.round(scoreNow() * pairs / 8) : 0); };
  }
  // 3) Bong bóng
  function gameBubble(G) {
    const cv = gameCanvas(G), g = cv.getContext('2d'), storm = emojiSprite('⛈️', 30);
    let bs = [], t0 = performance.now(), last = t0, spawn = 0, pops = [], parts = [], rafG = 0; const DUR = 25000;
    const COL = ['#ff8fab', '#8ecae6', '#b9fbc0', '#ffd6a5', '#cdb4db', '#a0c4ff'];
    cv.addEventListener('pointerdown', e => {
      const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      for (let i = bs.length - 1; i >= 0; i--) { const b = bs[i]; if (Math.hypot(b.x - x, b.y - y) < b.r + 6) {
        bs.splice(i, 1);
        const pts = b.k === 'storm' ? -15 : b.k === 'gold' ? 40 : b.r < 22 ? 15 : 10; G.setScore(G.score + pts); snd(b.k === 'storm' ? 'err' : b.k === 'gold' ? 'sparkle' : 'pop');
        pops.push({ t: (pts > 0 ? '+' : '') + pts, x: b.x, y: b.y, c: pts < 0 ? '#ff595e' : b.k === 'gold' ? '#ffd60a' : '#fff', a: 40 });
        for (let k = 0; k < 10; k++) parts.push({ x: b.x, y: b.y, vx: rnd(-3, 3), vy: rnd(-3, 3), a: 30, c: b.c });
        break; } }
    });
    const loop = ts => {
      rafG = requestAnimationFrame(loop); const dt = Math.min(40, ts - last) / 16.7; last = ts;
      const el = ts - t0, left = Math.max(0, DUR - el); G.setTime(Math.ceil(left / 1000) + 's');
      if (left <= 0) { cancelAnimationFrame(rafG); endGame(); return; }
      const W = cv._w, H = cv._h, d = cv._d, sp = 1 + el / DUR;
      spawn -= dt; if (spawn <= 0) { spawn = rnd(14, 26) / sp; const r = Math.random(), k = r < .07 ? 'gold' : r < .2 ? 'storm' : 'n'; bs.push({ k, x0: rnd(30, W - 30), x: 0, y: H + 40, r: k === 'gold' ? 22 : rnd(16, 34), v: rnd(1.2, 2.4) * sp, w: rnd(0, 6), c: k === 'gold' ? '#ffd60a' : k === 'storm' ? '#6c757d' : COL[Math.floor(rnd(0, COL.length))] }); }
      g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, W, H);
      bs = bs.filter(b => {
        b.y -= b.v * dt; b.w += .05 * dt; const x = b.x = b.x0 + Math.sin(b.w) * 8;
        const gr = g.createRadialGradient(x - b.r * .35, b.y - b.r * .35, b.r * .1, x, b.y, b.r);
        gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(.35, b.c + 'cc'); gr.addColorStop(1, b.c + '55');
        g.fillStyle = gr; g.beginPath(); g.arc(x, b.y, b.r, 0, 7); g.fill(); g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 1.5; g.stroke();
        if (b.k === 'storm') g.drawImage(storm, x - storm._s / 2, b.y - storm._s / 2, storm._s, storm._s);
        if (b.k === 'gold') { g.fillStyle = '#fff'; g.font = '800 16px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('★', x, b.y); }
        return b.y > -50;
      });
      parts = parts.filter(p => { p.x += p.vx * dt; p.y += p.vy * dt; p.a -= dt; g.globalAlpha = clamp(p.a / 30, 0, 1); g.fillStyle = p.c; g.beginPath(); g.arc(p.x, p.y, 3, 0, 7); g.fill(); g.globalAlpha = 1; return p.a > 0; });
      pops = pops.filter(p => { p.a -= dt; p.y -= 1.2 * dt; g.globalAlpha = clamp(p.a / 40, 0, 1); g.font = '800 18px system-ui'; g.textAlign = 'center'; g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.5)'; g.strokeText(p.t, p.x, p.y); g.fillStyle = p.c; g.fillText(p.t, p.x, p.y); g.globalAlpha = 1; return p.a > 0; });
    };
    rafG = requestAnimationFrame(loop);
    G.stop = () => cancelAnimationFrame(rafG);
  }

  /* ================= Vẽ tổng ================= */
  function render() {
    if (!alive || !S || !cat) return;
    R.dataset.state = !S.pet ? 'adopt' : S.pet.dead ? 'dead' : 'live';
    drawTop(); drawDaily(); drawMeters(); drawDock();
    buildScene();
    if (!S.pet) drawAdopt(); else els.panel.replaceChildren(quickInfo());
    showTryBar();
    if (sheet) fillPanel();
  }
  function quickInfo() {
    const p = S.pet; if (p.dead) return '';
    const sp = cat.by.species[p.sp] || {}, born = Math.max(1, Math.floor((now() - p.born) / 86400000) + 1);
    const log = (S.lg || []).slice(-3).reverse();
    return h('section', { class: 'pt-card pt-info' }, h('div', { class: 'pt-chips' },
      h('span', { class: 'pt-chip', text: (sp.e || '') + ' ' + (sp.n || '') }), h('span', { class: 'pt-chip', text: '🎂 Ngày thứ ' + born }), h('span', { class: 'pt-chip', text: '😺 ' + (MOOD_TXT[mood()] || '') }),
      h('span', { class: 'pt-chip', text: '✨ XP ×' + ((D && D.xpMul) || 1) })),
      h('ul', { class: 'pt-log' }, log.map(x => h('li', {}, h('small', { text: new Date(x[0]).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) }), ' ' + x[1]))));
  }

  /* ================= Mount / unmount ================= */
  async function mount(root, ctx) {
    unmount(); C = ctx; R = root; alive = true;
    R.classList.add('pt-root');
    R.replaceChildren(h('div', { class: 'pt-loading' }, h('div', { class: 'pt-spin', 'aria-hidden': 'true', text: '🐾' }), h('p', { text: 'Đang mở nhà thú cưng…' })));
    try { await loadCat(); const r = await C.api('petGet', {}); if (!alive) return; skeleton(); S = r.state; D = r.derived; off = r.serverTime - Date.now(); render(); }
    catch (e) { if (!alive) return; R.replaceChildren(h('div', { class: 'pt-card' }, h('p', { class: 'err', text: e.code === 'pet_disabled' ? 'Giáo viên đang tắt Nhà thú cưng.' : (e.message || 'Không mở được.') }), h('button', { class: 'btn', type: 'button', text: '↻ Thử lại', onclick: () => mount(root, ctx) }))); return; }
    raf = requestAnimationFrame(tick);
    timers.push(setInterval(() => { if (!document.hidden && S) { drawDaily(); drawMeters(); const b = R.querySelector('.pt-balv'); if (b) b.textContent = nf(C.getBalance()); } }, 5000));
    timers.push(setInterval(() => { if (!document.hidden && S && !flying && !queue.length) refresh().catch(() => {}); }, 120000));
    let wasTod = tod(); timers.push(setInterval(() => { if (tod() !== wasTod) { wasTod = tod(); buildScene(true); } }, 60000));
    if (S.pet && D && D.dead && LS.get('sm_pet_dead_seen') !== C.code + ':' + D.dead.day) { LS.set('sm_pet_dead_seen', C.code + ':' + D.dead.day); setTimeout(showDied, 600); }
  }
  function unmount() {
    if (patN) sendPats();
    if (queue.length) flush();
    alive = false; cancelAnimationFrame(raf); timers.forEach(clearInterval); timers = []; closePanel(true);
    if (game) { if (game.stop) game.stop(); if (!game.over && game.score >= 0) { const G = game; G.over = true; act({ op: 'gameEnd', g: G.g.id, score: G.score }, { now: true }).catch(() => {}); } game.ov.remove(); game = null; }
    fx.P = []; tryOn = null; lastKey = ''; anim.q = []; anim.cur = null;
  }
  async function peek(ctx) {
    const r = await ctx.api('petGet', {}), p = r.state && r.state.pet, d = r.derived || {};
    return { has: !!p, alive: !!(p && !p.dead), dead: !!(p && p.dead), safe: !!d.safe, grace: !!d.grace, fed: d.fedToday || 0, min: d.min || 50, name: p ? p.nm : '', sp: p ? p.sp : '', endsAt: d.endsAt, serverTime: r.serverTime };
  }
  window.SMPet = { mount, unmount, peek };
})();

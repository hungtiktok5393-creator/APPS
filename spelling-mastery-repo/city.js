/* =====================================================================
 * city.js – GIAO DIỆN & ĐIỀU KHIỂN game "Nông trại & Thành phố" (trang học sinh)
 * Cần: city-core.js (luật chơi), city-art.js (đồ hoạ). student.js gọi window.SMCity.mount(root, ctx) / unmount().
 * ctx = { api(action, params), getBalance(), setBalance(n), toast(msg, isErr), requestId(), code }
 * Đồng bộ: thao tác áp NGAY trên máy (luật y hệt máy chủ) rồi gửi gộp lên cityAct; máy chủ trả state chuẩn.
 * ===================================================================== */
(function () {
  'use strict';
  var C = window.CityCore, A = window.CityArt;
  if (!C || !A) return;
  var HW = A.HW, HH = A.HH, CH = C.CH;
  var LS = { get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: function (k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} } };

  /* ---------------- Tiện ích ---------------- */
  function $(sel, r) { return (r || document).querySelector(sel); }
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function btn(cls, txt, fn, title) { var b = el('button', 'ct-btn ' + (cls || ''), txt); b.type = 'button'; if (title) { b.title = title; b.setAttribute('aria-label', title); } if (fn) b.addEventListener('click', function (e) { e.stopPropagation(); sfx('click'); fn(e); }); return b; }
  function fmt(n) {
    n = Math.floor(Number(n) || 0); var a = Math.abs(n);
    if (a < 10000) return C.fmtN(n);
    var u = ['K', 'M', 'B', 'T', 'Q'], i = -1; while (a >= 1000 && i < u.length - 1) { a /= 1000; i++; }
    return (n < 0 ? '-' : '') + String(a < 10 ? a.toFixed(2) : a < 100 ? a.toFixed(1) : Math.floor(a)).replace('.', ',').replace(/,0+$/, '') + u[i];
  }
  function fmtT(ms) {
    var s = Math.max(0, Math.ceil(ms / 1000)); if (s < 60) return s + 'giây';
    var m = Math.floor(s / 60); s %= 60; if (m < 60) return m + 'p' + (s ? ' ' + s + 's' : '');
    var h = Math.floor(m / 60); m %= 60; if (h < 24) return h + 'g' + (m ? ' ' + m + 'p' : '');
    return Math.floor(h / 24) + ' ngày ' + (h % 24) + 'g';
  }
  function liveT(e, until, pre, post) { e.dataset.until = until; e.dataset.pre = pre || ''; e.dataset.post = post || ''; e.textContent = (pre || '') + fmtT(until - now()) + (post || ''); return e; }
  function clone(o) { return typeof structuredClone === 'function' ? structuredClone(o) : JSON.parse(JSON.stringify(o)); }
  function itemE(k) { var it = C.IT_BY[k]; return it ? it.e : '❔'; }
  function itemN(k) { var it = C.IT_BY[k]; return it ? it.n : k; }
  function matsLine(mat, inv) {
    var w = el('span', 'ct-mats');
    Object.keys(mat || {}).forEach(function (k) { var have = (inv && inv[k]) || 0, s = el('span', 'ct-mat' + (have >= mat[k] ? ' ok' : ' no'), itemE(k) + ' ' + have + '/' + mat[k]); s.title = itemN(k); w.append(s); });
    return w;
  }

  /* ---------------- Âm thanh (tự tổng hợp, không cần tệp) ---------------- */
  var AC = null;
  function sfx(name) {
    if (LS.get('sm_city_snd') === '0') return;
    try {
      AC = AC || new (window.AudioContext || window.webkitAudioContext)();
      var t = AC.currentTime, notes = { click: [[660, 0.04]], coin: [[988, 0.06], [1319, 0.1]], harvest: [[523, 0.05], [784, 0.08]], plant: [[392, 0.05]], build: [[262, 0.08], [392, 0.08], [523, 0.12]],
        level: [[523, 0.1], [659, 0.1], [784, 0.1], [1047, 0.25]], error: [[220, 0.12], [180, 0.15]], buy: [[784, 0.06], [988, 0.06], [1175, 0.12]], pop: [[880, 0.05]] }[name] || [[600, 0.05]];
      notes.forEach(function (n, i) {
        var o = AC.createOscillator(), g = AC.createGain(), st = t + i * 0.07;
        o.type = name === 'error' ? 'sawtooth' : 'triangle'; o.frequency.value = n[0];
        g.gain.setValueAtTime(0.0001, st); g.gain.exponentialRampToValueAtTime(0.12, st + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, st + n[1] + 0.08);
        o.connect(g); g.connect(AC.destination); o.start(st); o.stop(st + n[1] + 0.1);
      });
    } catch (e) {}
  }

  /* ---------------- Trạng thái ---------------- */
  var H = null, R = null, S = null;
  function fresh() {
    return { base: null, view: null, queue: [], flight: null, retry: 0, bal: 0, off: 0, opt: { costPct: 100, cap: 0, act: C.ACT_PTS }, der: null, likes: 0,
      cam: { x: 0, y: 0, z: 1 }, sb: 1, list: [], occ: {}, chs: {}, dirtyList: true, sel: null, tool: null, place: null, visit: null,
      fx: [], parts: [], cars: [], walkers: [], flyers: [], t0: performance.now(), raf: 0, timers: [], ptr: new Map(), gest: null, panel: null, card: null,
      quality: LS.get('sm_city_q') || 'auto', lastDraw: 0, fps: 60, slow: 0, roadsKey: '', status: 'idle', serverVer: 0 };
  }
  function now() { return Date.now() + (S ? S.off : 0); }
  function st() { return S.visit ? S.visit.state : S.view; }
  function optNow() { return { costPct: S.opt.costPct, cap: S.opt.cap, act: S.opt.act, balance: Math.max(0, S.bal - pendingSpend()) }; }
  var _pend = 0; function pendingSpend() { return _pend; }
  function P(x) { return Math.max(1, Math.round(x * S.opt.costPct / 100)); }
  function lv() { return C.level(S.view.xp).lv; }

  /* ---------------- Đồng bộ ---------------- */
  function doOps(ops, o) {
    o = o || {};
    if (S.visit) return null;
    if (!Array.isArray(ops)) ops = [ops];
    var copy = clone(S.view), r;
    try { r = C.applyOps(copy, ops, now(), optNow()); }
    catch (e) { if (!o.silent) { toast(e.message || 'Không thực hiện được.', 1); sfx('error'); } return null; }
    S.view = copy; _pend += r.spend;
    ops.forEach(function (op) { mergeQueue(op); });
    afterChange(r);
    if (r.spend - (r.fee || 0) > 0 || o.now) flush(0); else flush(700);   // mua bằng điểm → lưu ngay; phí thao tác thường thì gộp lô
    return r;
  }
  function mergeQueue(op) {
    var last = S.queue[S.queue.length - 1];
    if (last && !last._sent && (op.op === 'plant' || op.op === 'harvest' || op.op === 'tax') && last.op === op.op && last.c === op.c && last.ids && op.ids && last.ids.length + op.ids.length <= C.MAX_IDS) { last.ids = last.ids.concat(op.ids); return; }
    S.queue.push(clone(op));
  }
  var flushT = 0;
  function flush(delay) {
    clearTimeout(flushT);
    flushT = setTimeout(send, delay || 0);
  }
  function rid() { return H.requestId ? H.requestId() : ('c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10)); }
  function setStatus(s) { S.status = s; var d = $('.ct-sync', R); if (d) { d.dataset.s = s; d.title = { idle: 'Đã lưu', sync: 'Đang lưu…', off: 'Mất mạng – sẽ lưu lại khi có mạng', err: 'Lỗi lưu' }[s] || ''; } }
  function send() {
    if (!S || S.flight || !S.queue.length) { if (S && !S.flight && !S.queue.length) setStatus('idle'); return; }
    var n = Math.min(S.queue.length, C.MAX_OPS), ops = S.queue.slice(0, n).map(function (q) { var c = clone(q); delete c._sent; return c; });
    S.queue.slice(0, n).forEach(function (q) { q._sent = true; });
    S.flight = { n: n, ops: ops, rid: rid() };
    go();
  }
  function go() {
    var f = S.flight, me = S; setStatus('sync');
    H.api('cityAct', { ops: f.ops, requestId: f.rid }).then(function (res) {
      if (me !== S) return;
      S.flight = null; S.retry = 0; S.queue.splice(0, f.n);
      if (res && res.state) { applyServer(res); }
      if (res && res.ok === false) { toast(res.message || 'Thao tác bị từ chối.', 1); sfx('error'); }
      setStatus(S.queue.length ? 'sync' : 'idle');
      if (S.queue.length) flush(300);
    }).catch(function (e) {
      if (me !== S) return;
      var code = e && (e.code || (e.raw && e.raw.error)) || '';
      if (/^city_/.test(code) && e.raw && e.raw.state) { S.flight = null; S.queue.splice(0, f.n); applyServer(e.raw); toast(e.message, 1); sfx('error'); return; }
      if (/^city_/.test(code) || code === 'invalid_code' || code === 'unauthorized' || code === 'city_disabled') { S.flight = null; S.queue.splice(0, f.n); toast(e.message || 'Lỗi', 1); refresh(); return; }
      setStatus('off'); var d = [2000, 4000, 8000, 15000, 30000][Math.min(4, S.retry++)];
      setTimeout(function () { if (me === S && S.flight === f) go(); }, d);
    });
  }
  function applyServer(res) {
    if (res.serverTime) S.off = res.serverTime - Date.now();
    if (res.balance != null) { S.bal = res.balance; if (H.setBalance) H.setBalance(res.balance); }
    if (res.derived) { S.der = res.derived; S.likes = res.derived.likes || 0; if (res.derived.costPct) S.opt.costPct = res.derived.costPct; if (res.derived.actPts != null) S.opt.act = res.derived.actPts; if (res.derived.spend) S.opt.cap = res.derived.spend.cap || 0; }
    S.base = C.migrate(res.state);
    rebase();
  }
  function rebase() {
    var v = clone(S.base); _pend = 0;
    S.queue.forEach(function (op) { try { var c2 = clone(v), r = C.applyOps(c2, [op], now(), optNow()); v = c2; _pend += r.spend; } catch (e) { op._dead = true; } });
    S.queue = S.queue.filter(function (q) { return !q._dead || q._sent; });
    S.view = v; afterChange(null);
  }
  function refresh() {
    return H.api('cityGet', {}).then(function (res) {
      if (!S) return;
      if (res.ver && res.ver !== C.VER) toast('Máy chủ đang dùng phiên bản game khác – hãy báo giáo viên cập nhật City.gs.', 1);
      S.serverVer = res.ver || 0;
      S.queue = []; S.flight = null; applyServer(res);
    });
  }

  /* ---------------- Sau mỗi thay đổi ---------------- */
  var lastLv = 0;
  function afterChange(r) {
    S.dirtyList = true;
    var s = S.view, L = C.level(s.xp).lv;
    if (r) {
      (r.results || []).forEach(handleResult);
      if (r.levelUp && r.levelUp.length) levelUp(r.levelUp[r.levelUp.length - 1]);
      (r.ach || []).forEach(function (a) { toast(a.e + ' Thành tích "' + a.n + '" bậc ' + a.tier + '! +' + fmt(a.xu) + ' 🪙'); sfx('buy'); });
      tutorialCheck(r);
    }
    lastLv = L;
    hud(); if (S.card) cardRender(); if (S.panel) panelRender();
  }
  function handleResult(x) { /* hiệu ứng bay chữ được gắn tại chỗ gọi */ }

  /* ---------------- Camera & toạ độ ---------------- */
  var cv = null, g = null, W = 0, Hh = 0, DPR = 1;
  function dprMax() { var q = S.quality; return q === 'low' ? 1 : q === 'mid' ? 1.5 : 2; }
  function resize() {
    if (!cv) return; var r = cv.parentNode.getBoundingClientRect();
    DPR = Math.min(window.devicePixelRatio || 1, dprMax());
    W = Math.max(1, Math.round(r.width * DPR)); Hh = Math.max(1, Math.round(r.height * DPR));
    if (cv.width !== W || cv.height !== Hh) { cv.width = W; cv.height = Hh; }
    cv.style.width = r.width + 'px'; cv.style.height = r.height + 'px';
    pickBucket(true);
  }
  function Z() { return S.cam.z * DPR; }
  function iso(x, y) { return [(x - y) * HW, (x + y) * HH]; }
  function toScreen(wx, wy) { var z = Z(); return [(wx - S.cam.x) * z + W / 2, (wy - S.cam.y) * z + Hh / 2]; }
  function toWorld(px, py) { var z = Z(); return [(px - W / 2) / z + S.cam.x, (py - Hh / 2) / z + S.cam.y]; }
  function tileAt(px, py) { var w = toWorld(px, py), u = (w[0] / HW + w[1] / HH) / 2, v = (w[1] / HH - w[0] / HW) / 2; return [Math.floor(u), Math.floor(v)]; }
  var zoomT = 0;
  function pickBucket(force) {
    var z = Z(), b = Math.pow(2, Math.round(Math.log(z) / Math.LN2 * 4) / 4);
    b = Math.max(0.25, Math.min(4, b));
    if (force) { S.sb = b; return; }
    clearTimeout(zoomT); zoomT = setTimeout(function () { if (S && S.sb !== b) { S.sb = b; } }, 220);
  }
  function setZoom(z, px, py) {
    z = Math.max(0.35, Math.min(2.6, z));
    if (px == null) { px = W / 2; py = Hh / 2; }
    var w0 = toWorld(px, py); S.cam.z = z; var w1 = toWorld(px, py);
    S.cam.x += w0[0] - w1[0]; S.cam.y += w0[1] - w1[1]; clampCam(); pickBucket(); LS.set('sm_city_cam', JSON.stringify(S.cam));
  }
  function clampCam() {
    var s = st(); if (!s) return; var mnx = 1e9, mxx = -1e9, mny = 1e9, mxy = -1e9;
    s.ch.forEach(function (k) { var p = k.split(','), cx = +p[0], cy = +p[1];[[0, 0], [1, 0], [0, 1], [1, 1]].forEach(function (d) { var q = iso((cx + d[0]) * CH, (cy + d[1]) * CH); mnx = Math.min(mnx, q[0]); mxx = Math.max(mxx, q[0]); mny = Math.min(mny, q[1]); mxy = Math.max(mxy, q[1]); }); });
    var pad = 300; S.cam.x = Math.max(mnx - pad, Math.min(mxx + pad, S.cam.x)); S.cam.y = Math.max(mny - pad - 200, Math.min(mxy + pad, S.cam.y));
  }
  function centerOn(x, y) { var q = iso(x, y); S.cam.x = q[0]; S.cam.y = q[1] + HH; clampCam(); }

  /* ---------------- Danh sách vẽ ---------------- */
  function rebuildList() {
    var s = st(), list = [], flat = [];
    S.occ = C.occupancy(s); S.chs = C.ownedSet(s);
    var roadSet = {}, waterSet = {}, pathSet = {}, fenceSet = {};
    Object.keys(s.b).forEach(function (id) { var b = s.b[id]; if (b.t === 'duong') roadSet[b.x + ',' + b.y] = 1; else if (b.t === 'nuoc') waterSet[b.x + ',' + b.y] = 1; else if (b.t === 'duongda') pathSet[b.x + ',' + b.y] = 1; else if (b.t === 'hangrao') fenceSet[b.x + ',' + b.y] = 1; });
    function mask(set, x, y) { return (set[x + ',' + (y - 1)] ? 1 : 0) | (set[(x + 1) + ',' + y] ? 2 : 0) | (set[x + ',' + (y + 1)] ? 4 : 0) | (set[(x - 1) + ',' + y] ? 8 : 0); }
    Object.keys(s.b).forEach(function (id) {
      var b = s.b[id], d = C.B_BY[b.t]; if (!d) return;
      var it = { id: id, b: b, d: d, x: b.x, y: b.y, w: d.w, h: d.h, depth: b.x + b.y + (d.w + d.h) / 2, v: A.hsh(id + ':' + b.x) % 97 };
      if (d.k === 'road') { it.mask = mask(b.t === 'duong' ? roadSet : b.t === 'nuoc' ? waterSet : pathSet, b.x, b.y); flat.push(it); }
      else if (d.k === 'field') { list.push(it); }
      else { if (b.t === 'hangrao') it.mask = mask(fenceSet, b.x, b.y); list.push(it); }
    });
    Object.keys(s.o).forEach(function (k) { var p = k.split(','), x = +p[0], y = +p[1]; list.push({ obs: s.o[k], x: x, y: y, w: 1, h: 1, depth: x + y + 1, v: A.hsh(k) }); });
    list.sort(function (a, b) { return a.depth - b.depth || a.x - b.x; });
    S.list = list; S.flat = flat; S.roadSet = roadSet; S.pathSet = pathSet; S.dirtyList = false;
    var rk = Object.keys(roadSet).length + ':' + Object.keys(pathSet).length + ':' + JSON.stringify(s.vh || {}) + ':' + (S.visit ? S.visit.who : '');
    if (rk !== S.roadsKey) { S.roadsKey = rk; spawnAgents(); }
  }

  /* ---------------- Ngày / đêm ---------------- */
  function nightAmt() {
    var s = st(), mode = s && s.night != null ? s.night : 1;
    if (mode === 0) return 0; if (mode === 2) return 1;
    var d = new Date(now() + 7 * 3600000), h = d.getUTCHours() + d.getUTCMinutes() / 60;
    if (h >= 19 || h < 5) return 1; if (h >= 18) return h - 18; if (h < 6) return 6 - h; return 0;
  }

  /* ---------------- Đất ---------------- */
  var chunkCache = new Map();
  function chunkCanvas(cx, cy, wild, sb, th) {
    var k = cx + ',' + cy + '|' + (wild ? 1 : 0) + '|' + sb + '|' + th;
    var hit = chunkCache.get(k); if (hit) return hit;
    var w = CH * 2 * HW * sb, h = CH * 2 * HH * sb + 6 * sb, c = document.createElement('canvas'); c.width = Math.ceil(w); c.height = Math.ceil(h);
    var gg = c.getContext('2d'), T = A.groundTheme(th);
    for (var i = 0; i < CH; i++) for (var j = 0; j < CH; j++) {
      var x = (i - j) * HW * sb + CH * HW * sb, y = (i + j) * HH * sb;
      A.groundTile(gg, x, y, sb, cx * CH + i, cy * CH + j, T, wild);
    }
    if (!wild) {   // mép đất: viền đất nâu
      gg.strokeStyle = 'rgba(255,255,255,.18)'; gg.lineWidth = Math.max(1, sb);
      gg.beginPath(); gg.moveTo(CH * HW * sb, 0); gg.lineTo(CH * 2 * HW * sb, CH * HH * sb); gg.lineTo(CH * HW * sb, CH * 2 * HH * sb); gg.lineTo(0, CH * HH * sb); gg.closePath(); gg.stroke();
    } else {
      var r = A.rnd(A.hsh(k)); for (var n = 0; n < 6; n++) { var u = r() * CH, v = r() * CH, px = (u - v) * HW * sb + CH * HW * sb, py = (u + v) * HH * sb; gg.fillStyle = 'rgba(30,60,30,.35)'; gg.beginPath(); gg.ellipse(px, py, 10 * sb, 5 * sb, 0, 0, 7); gg.fill(); gg.fillStyle = A.mix('#2e7d32', '#37474f', 0.3); gg.beginPath(); gg.arc(px, py - 10 * sb, 8 * sb, 0, 7); gg.fill(); gg.fillStyle = 'rgba(255,255,255,.08)'; gg.beginPath(); gg.arc(px - 3 * sb, py - 13 * sb, 4 * sb, 0, 7); gg.fill(); }
    }
    var o = { cv: c }; chunkCache.set(k, o);
    if (chunkCache.size > 160) { var it = chunkCache.keys(); for (var q = 0; q < 40; q++) chunkCache.delete(it.next().value); }
    return o;
  }

  /* ---------------- Xe cộ, người đi bộ, vật bay ---------------- */
  var DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  function spawnAgents() {
    var s = st(), roads = Object.keys(S.roadSet), paths = Object.keys(S.pathSet).concat(roads), pop = C.stats(s, now()).pop, r = A.rnd(A.hsh(S.roadsKey));
    S.cars = []; S.walkers = []; S.flyers = [];
    var vh = s.vh || {}, types = [];
    var base = Math.min(Math.floor(roads.length / 5), 3 + Math.floor(pop / 60), 24); for (var i = 0; i < base; i++) types.push('car');
    ['taxi', 'xebuyt', 'xekem', 'xecuuhoa', 'xecanhsat', 'xedua'].forEach(function (t) { for (var k = 0; k < (vh[t] || 0); k++) types.push(t); });
    if (roads.length >= 2) types.forEach(function (t, i) { var k = roads[Math.floor(r() * roads.length)].split(','); S.cars.push({ x: +k[0], y: +k[1], d: Math.floor(r() * 4), p: r(), sp: t === 'xedua' ? 1.6 : t === 'xebuyt' ? 0.55 : 0.8 + r() * 0.3, t: t, seed: i * 7 + 3 }); });
    var wn = Math.min(paths.length ? 4 + Math.floor(pop / 40) : 0, 30), wt = []; for (var j = 0; j < wn; j++) wt.push('nguoi');
    ['chocon', 'meocon'].forEach(function (t) { for (var k = 0; k < (vh[t] || 0); k++) wt.push(t); });
    if (paths.length) wt.forEach(function (t, i) { var k = paths[Math.floor(r() * paths.length)].split(','); S.walkers.push({ x: +k[0], y: +k[1], d: Math.floor(r() * 4), p: r(), sp: 0.25 + r() * 0.15, t: t, seed: i * 13 + 1, side: r() < 0.5 ? -1 : 1 }); });
    ['maybay', 'tructhang', 'ufo', 'rong'].forEach(function (t) { for (var k = 0; k < (vh[t] || 0); k++) S.flyers.push({ t: t, ph: r(), sp: t === 'maybay' ? 0.035 : t === 'rong' ? 0.02 : 0.015, lane: r(), seed: k }); });
    for (var b = 0; b < 3; b++) S.flyers.push({ t: 'chim', ph: r(), sp: 0.02 + r() * 0.01, lane: r(), seed: b });
  }
  function stepAgents(dt) {
    function nxt(a, set) {
      var opts = [];
      for (var d = 0; d < 4; d++) { if (d === (a.d + 2) % 4) continue; var nx = a.x + DIRS[d][0], ny = a.y + DIRS[d][1]; if (set[nx + ',' + ny]) opts.push(d); }
      if (!opts.length) { var bd = (a.d + 2) % 4; if (set[(a.x + DIRS[bd][0]) + ',' + (a.y + DIRS[bd][1])]) opts.push(bd); }
      if (!opts.length) return false;
      a.d = opts[Math.floor(Math.random() * opts.length)]; return true;
    }
    S.cars.forEach(function (a) {
      a.p += dt * a.sp;
      while (a.p >= 1) { a.p -= 1; var nx = a.x + DIRS[a.d][0], ny = a.y + DIRS[a.d][1]; if (S.roadSet[nx + ',' + ny]) { a.x = nx; a.y = ny; } if (!nxt(a, S.roadSet)) { a.p = 0; break; } }
    });
    var walk = Object.assign({}, S.pathSet, S.roadSet);
    S.walkers.forEach(function (a) {
      a.p += dt * a.sp;
      while (a.p >= 1) { a.p -= 1; var nx = a.x + DIRS[a.d][0], ny = a.y + DIRS[a.d][1]; if (walk[nx + ',' + ny]) { a.x = nx; a.y = ny; } if (!nxt(a, walk)) { a.p = 0; break; } }
    });
  }

  /* ---------------- Hiệu ứng ---------------- */
  function floatText(x, y, text, col) { S.fx.push({ x: x, y: y, text: text, col: col || '#fff', t: performance.now() }); }
  function burstAt(px, py, emoji, n) { for (var i = 0; i < (n || 8); i++) S.parts.push({ x: px, y: py, vx: (Math.random() - 0.5) * 6, vy: -Math.random() * 6 - 2, life: 1, e: emoji, sz: 14 + Math.random() * 8, scr: true }); }
  function flyTo(px, py, emoji, target) {   // emoji bay từ vị trí trên canvas tới ô HUD
    var t = $(target, R); if (!t || !cv) return;
    var cr = cv.getBoundingClientRect(), tr = t.getBoundingClientRect(), rr = R.getBoundingClientRect();
    var e = el('div', 'ct-fly', emoji); R.append(e);
    var x0 = cr.left - rr.left + px / DPR, y0 = cr.top - rr.top + py / DPR, x1 = tr.left - rr.left + tr.width / 2, y1 = tr.top - rr.top + tr.height / 2;
    e.style.transform = 'translate(' + x0 + 'px,' + y0 + 'px) scale(1.2)';
    requestAnimationFrame(function () { requestAnimationFrame(function () { e.style.transform = 'translate(' + x1 + 'px,' + y1 + 'px) scale(.6)'; e.style.opacity = '0.4'; }); });
    setTimeout(function () { e.remove(); t.classList.remove('pulse'); void t.offsetWidth; t.classList.add('pulse'); }, 650);
  }

  /* ---------------- Vẽ ---------------- */
  function spr(kind, id, o) { return A.sprite(kind, id, o, S.sb); }
  function drawSprite(sp, x, y, alpha) {
    var z = Z(), k = z / sp.s, q = toScreen(x, y), dx = q[0] - sp.ox * k, dy = q[1] - sp.oy * k, dw = sp.cv.width * k, dh = sp.cv.height * k;
    if (dx > W || dy > Hh || dx + dw < 0 || dy + dh < 0) return null;
    if (alpha != null) g.globalAlpha = alpha;
    g.drawImage(sp.cv, dx, dy, dw, dh);
    if (alpha != null) g.globalAlpha = 1;
    return [dx, dy, dw, dh, k];
  }
  function cropStage(b, t) { if (!b.c) return -1; if (b.e <= t) return 2; var c = C.CROP_BY[b.c], mul = S._st ? S._st.cropMul : 1, tot = c ? Math.max(10, Math.round(c.t / mul)) * 1000 : 60000, left = b.e - t; return left > tot * 0.5 ? 0 : 1; }
  function ready(it, t) {   // trạng thái bong bóng trên công trình
    var b = it.b, d = it.d, s = st();
    if (S.visit) return null;
    if (d.k === 'house') { var S2 = S._st || (S._st = C.stats(s, t)); var tx = C.taxOf(s, b, d, S2, t); return tx >= Math.max(1, C.taxRate(s, b, d, S2, t) * 0.25) ? { e: '🪙', k: 'tax' } : null; }
    if (d.k === 'fac') { if (b.q.length && b.q[0][1] <= t) return { e: itemE(d.rs[b.q[0][0]] ? d.rs[b.q[0][0]].o : ''), k: 'done' }; if (!b.q.length) return { e: '💤', k: 'idle', dim: 1 }; return null; }
    if (d.k === 'pen') { var any = false, hungry = 0; (b.a || []).forEach(function (e) { if (e > 0 && e <= t) any = true; if (!e) hungry++; }); hungry += Math.max(0, C.animals(s, b) - (b.a || []).length); if (any) return { e: d.prod[2], k: 'done' }; if (hungry) return { e: d.feed ? C.IT_BY[d.feed].e : '🌼', k: 'hungry', dim: 1 }; return null; }
    if (b.t === 'donhang') { var n = 0; s.od.forEach(function (o) { if (!o.w || o.w <= t) { if (Object.keys(o.it).every(function (k) { return (s.inv[k] || 0) >= o.it[k]; })) n++; } }); return n ? { e: '📦', k: 'orders', n: n } : null; }
    return null;
  }
  function draw(ts) {
    var s = st(); if (!s || !g) return;
    S._st = C.stats(s, now());
    if (S.dirtyList) rebuildList();
    var t = now(), sec = (ts - S.t0) / 1000, z = Z(), night = nightAmt(), isN = night > 0.5, th = (s.th && s.th.g) || '';
    var dt = Math.min(0.1, (ts - (S.lastDraw || ts)) / 1000); S.lastDraw = ts;
    // nền trời/đất xa
    var T = A.groundTheme(th), bg = g.createLinearGradient(0, 0, 0, Hh);
    bg.addColorStop(0, A.mix(A.mix(T.c[0], '#8ec5ff', 0.55), '#0b1638', night * 0.8)); bg.addColorStop(1, A.mix(A.mix(T.c[1], '#2f5d3a', 0.45), '#0b1638', night * 0.75));
    g.fillStyle = bg; g.fillRect(0, 0, W, Hh);
    // các mảnh đất nhìn thấy
    var c0 = tileAt(0, 0), c1 = tileAt(W, 0), c2 = tileAt(0, Hh), c3 = tileAt(W, Hh);
    var minU = Math.min(c0[0], c1[0], c2[0], c3[0]) - 2, maxU = Math.max(c0[0], c1[0], c2[0], c3[0]) + 2, minV = Math.min(c0[1], c1[1], c2[1], c3[1]) - 2, maxV = Math.max(c0[1], c1[1], c2[1], c3[1]) + 2;
    var ch0 = Math.floor(minU / CH), ch1 = Math.floor(maxU / CH), cv0 = Math.floor(minV / CH), cv1 = Math.floor(maxV / CH), sb = S.sb, kk = z / sb;
    if ((ch1 - ch0) * (cv1 - cv0) < 900) {
      for (var cx = ch0; cx <= ch1; cx++) for (var cy = cv0; cy <= cv1; cy++) {
        var key = cx + ',' + cy, own = !!S.chs[key], near = false;
        if (!own) { for (var dx2 = -1; dx2 <= 1 && !near; dx2++) for (var dy2 = -1; dy2 <= 1 && !near; dy2++) if (S.chs[(cx + dx2) + ',' + (cy + dy2)]) near = true; if (!near) continue; }
        var cc = chunkCanvas(cx, cy, !own, sb, th), q = toScreen((cx * CH - cy * CH) * HW - CH * HW, (cx * CH + cy * CH) * HH);
        g.drawImage(cc.cv, q[0], q[1], cc.cv.width * kk, cc.cv.height * kk);
      }
    }
    // biển giá ở đất mua được
    if (!S.visit) drawLandSigns(t);
    // lớp phẳng: đường, nước
    S.flat.forEach(function (it) {
      var q = iso(it.x, it.y), sc0 = toScreen(q[0], q[1]); if (sc0[0] < -HW * z * 2 || sc0[0] > W + HW * z * 2 || sc0[1] < -HH * z * 3 || sc0[1] > Hh + HH * z) return;
      var kind = it.b.t === 'duong' ? 'road' : it.b.t === 'nuoc' ? 'water' : 'path';
      drawSprite(spr(kind, kind, { mask: it.mask, key: it.mask, ht: 4 }), q[0], q[1]);
      if (kind === 'water' && S.quality !== 'low' && S.cam.z >= 0.6) { var p = toScreen(q[0], q[1]); if (p[0] > -50 && p[0] < W + 50 && p[1] > -50 && p[1] < Hh + 50) { g.save(); g.translate(p[0], p[1]); A.anim(g, z, 'nuoc', sec, { seed: it.v }); g.restore(); } }
    });
    // xe & người đi bộ (dưới công trình)
    if (S.quality !== 'low') { stepAgents(dt); drawAgents(sec, isN); }
    // vùng chọn / bóng đặt
    drawSelection(sec);
    // công trình & chướng ngại
    var bubbles = [];
    var mX = 140 * z, mTop = -40 * z, mBot = Hh + 460 * z, detail = S.quality !== 'low' && S.cam.z >= 0.6;
    for (var i = 0; i < S.list.length; i++) {
      var it = S.list[i], q2 = iso(it.x, it.y), r, sc = toScreen(q2[0], q2[1]);
      it._bub = null;
      if (sc[0] < -mX - it.h * HW * z || sc[0] > W + mX + it.w * HW * z || sc[1] < mTop - (it.w + it.h) * HH * z || sc[1] > mBot) continue;
      if (S.place && S.place.id && it.id === S.place.id) continue;
      if (it.obs) { r = drawSprite(spr('obs', it.obs, { v: it.v, key: it.v % 5, ht: 70 }), q2[0], q2[1]); continue; }
      if (it.d.k === 'field') {
        drawSprite(spr('field', 'f', { ht: 6 }), q2[0], q2[1]);
        var stg = cropStage(it.b, t);
        if (stg >= 0) r = drawSprite(spr('crop', it.b.c, { stage: stg, key: stg, emoji: C.CROP_BY[it.b.c] && C.CROP_BY[it.b.c].e, ht: 40 }), q2[0], q2[1]);
        if (stg === 2 && r && detail) { var p2 = toScreen(q2[0], q2[1] + HH); g.fillStyle = 'rgba(255,255,200,' + (0.25 + 0.2 * Math.sin(sec * 4 + it.v)) + ')'; g.beginPath(); g.arc(p2[0] + Math.sin(sec * 2 + it.v) * 10 * z, p2[1] - 20 * z, 1.8 * z, 0, 7); g.fill(); }
        continue;
      }
      var tier = it.d.k === 'house' || it.d.k === 'lm' || it.d.k === 'spec' ? lvTier(it.d, it.b.l) : 0;
      r = drawSprite(spr('b', it.b.t, { w: it.w, h: it.h, b: { l: tier }, v: it.v % 6, key: tier + ':' + (it.v % 6) + ':' + (it.mask || 0), flip: !!it.b.f, night: isN, mask: it.mask, ht: A.height(it.b.t, tier) }), q2[0], q2[1]);
      if (!r) continue;
      var pp = toScreen(q2[0], q2[1]);
      if (it.d.an && detail) { g.save(); g.translate(pp[0], pp[1]); if (it.b.f) { g.translate(((it.w - it.h) / 2) * HW * z, 0); } A.anim(g, z, it.b.t, sec + it.v, { night: isN, w: it.w }); g.restore(); }
      if (it.d.k === 'pen' && detail) drawAnimals(it, pp, sec, t);
      if (detail) { var sm = A.smokeAt[it.b.t]; if (sm && (it.d.k !== 'fac' || (it.b.q && it.b.q.length)) && (it.b.t !== 'nhago' || isN || it.b.l >= 1)) sm.forEach(function (c) { var sq = toScreen(q2[0] + (c[0] - c[1]) * HW, q2[1] + (c[0] + c[1]) * HH - c[2]); A.smoke(g, z, sq[0], sq[1], sec, it.v); }); }
      if (it.d.k === 'fac' && it.b.q && it.b.q.length && it.b.q[0][1] > t) drawProgress(it, r, t);
      var rd = ready(it, t); if (rd) bubbles.push([r, rd, it]);
    }
    // bóng đặt công trình
    if (S.place) drawGhost(isN, sec);
    // đèn đêm
    if (night > 0) drawNight(night, sec, t);
    // bong bóng thông báo
    bubbles.forEach(function (b) { drawBubble(b[0], b[1], sec, b[2]); });
    // vật bay + hiệu ứng thời tiết
    if (S.quality !== 'low') { drawFlyers(sec); drawEffects(s, sec, night, dt); }
    // chữ bay & hạt
    drawFx(ts);
  }
  function lvTier(d, l) {   // gom cấp để giới hạn số sprite: sau mốc thì giữ hình
    if (d.k === 'lm' || d.k === 'spec') return l >= 100 ? 100 : l >= 50 ? 50 : l >= 25 ? 25 : l >= 10 ? 10 : Math.min(l, 9);
    return l >= 100 ? 100 : l >= 50 ? 50 : l >= 25 ? 25 : l > 24 ? 24 : l;
  }
  function drawAnimals(it, pp, sec, t) {
    var s = st(), b = it.b, n = Math.min(8, C.animals(s, b)), z = Z();
    for (var i = 0; i < n; i++) {
      var ph = sec * 0.25 + i * 1.9, u = 0.45 + 1.1 * (0.5 + 0.5 * Math.sin(ph + i)), v = 0.6 + 0.95 * (0.5 + 0.5 * Math.cos(ph * 0.8 + i * 2.3));
      if (b.t === 'aoca' || b.t === 'chuongvit') { u = 0.6 + 0.8 * (0.5 + 0.5 * Math.sin(ph)); v = 0.55 + 0.8 * (0.5 + 0.5 * Math.cos(ph * 1.2 + i)); }
      if (b.t === 'traiong') { u = 0.3 + (i % 3) * 0.55 + Math.sin(sec * 3 + i) * 0.1; v = 0.4 + Math.floor(i / 3) * 0.7; }
      var x = pp[0] + (u - v) * HW * z, y = pp[1] + (u + v) * HH * z, dir = Math.cos(ph + i) > 0 ? 1 : -1;
      A.animal(g, z, b.t, x, y, sec, dir, i);
    }
  }
  function drawProgress(it, r, t) {
    var q = it.b.q[0], rec = it.d.rs[q[0]], tot = rec ? rec.t * 1000 : 1, left = q[1] - t, p = Math.max(0, Math.min(1, 1 - left / tot)), z = Z();
    var w = 34 * z, x = r[0] + r[2] / 2 - w / 2, y = r[1] - 6 * z;
    g.fillStyle = 'rgba(0,0,0,.45)'; rr(x - z, y - z, w + 2 * z, 7 * z, 4 * z); g.fill();
    g.fillStyle = '#7cff7c'; rr(x, y, w * p, 5 * z, 3 * z); g.fill();
  }
  function rr(x, y, w, h, r) { g.beginPath(); if (g.roundRect) g.roundRect(x, y, Math.max(0, w), h, r); else g.rect(x, y, Math.max(0, w), h); }
  function drawBubble(r, rd, sec, it) {
    var z = Z(), bob = Math.sin(sec * 3 + it.v) * 3 * z, cx = r[0] + r[2] / 2, cy = r[1] - 12 * z + bob, R2 = 11 * z;
    g.globalAlpha = rd.dim ? 0.75 : 1;
    g.fillStyle = 'rgba(0,0,0,.2)'; g.beginPath(); g.arc(cx, cy + 2 * z, R2, 0, 7); g.fill();
    g.fillStyle = rd.k === 'tax' ? '#fff7d6' : rd.dim ? '#eef1f5' : '#ffffff'; g.beginPath(); g.arc(cx, cy, R2, 0, 7); g.fill();
    g.beginPath(); g.moveTo(cx - 4 * z, cy + R2 - 2 * z); g.lineTo(cx, cy + R2 + 5 * z); g.lineTo(cx + 4 * z, cy + R2 - 2 * z); g.fill();
    g.font = Math.round(13 * z) + 'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(rd.e, cx, cy + z);
    if (rd.n) { g.fillStyle = '#e53935'; g.beginPath(); g.arc(cx + R2 * 0.8, cy - R2 * 0.8, 6 * z, 0, 7); g.fill(); g.fillStyle = '#fff'; g.font = 'bold ' + Math.round(8 * z) + 'px sans-serif'; g.fillText(rd.n, cx + R2 * 0.8, cy - R2 * 0.8 + 0.5 * z); }
    g.globalAlpha = 1;
    it._bub = [cx, cy, R2 * 1.3];
  }
  function drawLandSigns(t) {
    var s = st(), cost = P(C.chunkCost(s)), z = Z(), seen = {};
    s.ch.forEach(function (k) {
      var p = k.split(','), cx = +p[0], cy = +p[1];
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
        var nk = (cx + d[0]) + ',' + (cy + d[1]); if (S.chs[nk] || seen[nk]) return; seen[nk] = 1;
        var q = toScreen(((cx + d[0]) * CH - (cy + d[1]) * CH) * HW, ((cx + d[0]) * CH + (cy + d[1]) * CH + CH) * HH);
        if (q[0] < -80 || q[0] > W + 80 || q[1] < -80 || q[1] > Hh + 80) return;
        var w = 70 * z, h = 24 * z, x = q[0] - w / 2, y = q[1] - h / 2;
        g.fillStyle = 'rgba(0,0,0,.25)'; rr(x, y + 3 * z, w, h, 12 * z); g.fill();
        var gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, '#fff6c4'); gr.addColorStop(1, '#ffd54f'); g.fillStyle = gr; rr(x, y, w, h, 12 * z); g.fill();
        g.fillStyle = '#5d4037'; g.font = 'bold ' + Math.round(11 * z) + 'px system-ui,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('🔓 ' + fmt(cost) + ' ⭐', q[0], q[1] + 0.5 * z);
      });
    });
  }
  function agentPos(a, lane) {
    var dir = DIRS[a.d], u = a.x + 0.5 + dir[0] * (a.p - 0.5), v = a.y + 0.5 + dir[1] * (a.p - 0.5);
    u += -dir[1] * lane; v += dir[0] * lane;   // làn bên phải
    var q = iso(u, v); return toScreen(q[0], q[1]);
  }
  function drawAgents(sec, isN) {
    var z = Z();
    S.cars.forEach(function (a) { var p = agentPos(a, 0.2); if (p[0] < -40 || p[0] > W + 40 || p[1] < -40 || p[1] > Hh + 40) return; A.car(g, z, p[0], p[1], a.d, a.t, a.seed, isN); });
    S.walkers.forEach(function (a) { var p = agentPos(a, 0.42 * a.side); if (p[0] < -20 || p[0] > W + 20 || p[1] < -20 || p[1] > Hh + 20) return; A.walker(g, z, p[0], p[1], sec, a.t, a.seed); });
  }
  function drawFlyers(sec) {
    var z = Z();
    S.flyers.forEach(function (f) {
      var ph = (f.ph + sec * f.sp) % 1, dir = f.seed % 2 ? 1 : -1, x = dir > 0 ? -100 + ph * (W + 200) : W + 100 - ph * (W + 200), y = Hh * (0.12 + f.lane * 0.35) + Math.sin(sec * 0.8 + f.seed) * 14 * z;
      if (f.t === 'tructhang' || f.t === 'ufo') { x = W * (0.2 + 0.6 * (0.5 + 0.5 * Math.sin(sec * f.sp * 6 + f.seed))); y = Hh * (0.15 + 0.2 * f.lane) + Math.sin(sec * 1.3 + f.seed) * 10 * z; dir = Math.cos(sec * f.sp * 6 + f.seed) > 0 ? 1 : -1; }
      A.flyer(g, Math.min(z, 1.6 * DPR), x, y, f.t, sec, dir);
    });
  }
  var effParts = [];
  function drawEffects(s, sec, night, dt) {
    var fx = (s.th && s.th.fx) || [], z = Z();
    if (fx.indexOf('cauvongtroi') >= 0) { var cx = W * 0.7, cy = Hh * 0.55, R0 = Math.min(W, Hh) * 0.6; ['#ff5252', '#ffab40', '#ffee58', '#69f0ae', '#40c4ff', '#b388ff'].forEach(function (c, i) { g.strokeStyle = A.rgba(c, 0.22); g.lineWidth = 9 * DPR; g.beginPath(); g.arc(cx, cy, R0 - i * 9 * DPR, Math.PI * 1.05, Math.PI * 1.95); g.stroke(); }); }
    var want = { hoadao: night < 0.6, tuyet: true, la: night < 0.6, domdom: night > 0.4, bong: true };
    fx.forEach(function (k) {
      if (!want[k]) return;
      var rate = { hoadao: 6, tuyet: 14, la: 4, domdom: 5, bong: 0.8 }[k] * dt;
      if (Math.random() < rate - Math.floor(rate)) rate = Math.ceil(rate); else rate = Math.floor(rate);
      for (var i = 0; i < rate && effParts.length < 220; i++) effParts.push({ k: k, x: Math.random() * W, y: k === 'bong' ? Hh + 30 : k === 'domdom' ? Math.random() * Hh : -20, vx: (Math.random() - 0.3) * 30, vy: k === 'bong' ? -40 - Math.random() * 30 : k === 'domdom' ? 0 : 25 + Math.random() * 35, life: k === 'domdom' ? 4 : 30, ph: Math.random() * 6, c: ['#e53935', '#fdd835', '#1e88e5', '#43a047', '#ab47bc'][Math.floor(Math.random() * 5)] });
    });
    if (fx.indexOf('phaohoa') >= 0 && night > 0.4 && Math.random() < dt * 0.9) { var fxp = W * (0.15 + Math.random() * 0.7), fyp = Hh * (0.1 + Math.random() * 0.3), col = ['#ff5252', '#ffd740', '#69f0ae', '#40c4ff', '#ff80ab', '#e040fb'][Math.floor(Math.random() * 6)]; for (var k2 = 0; k2 < 36; k2++) { var a = k2 / 36 * Math.PI * 2; effParts.push({ k: 'pw', x: fxp, y: fyp, vx: Math.cos(a) * 90 * DPR, vy: Math.sin(a) * 90 * DPR, life: 1.4, c: col }); } }
    for (var j = effParts.length - 1; j >= 0; j--) {
      var p = effParts[j]; p.life -= dt; p.ph = (p.ph || 0) + dt;
      if (p.k === 'pw') { p.vy += 60 * DPR * dt; p.vx *= 0.97; p.vy *= 0.97; }
      p.x += (p.vx + (p.k === 'hoadao' || p.k === 'la' ? Math.sin(p.ph * 2) * 25 : 0)) * dt * (p.k === 'pw' ? 1 : DPR); p.y += p.vy * dt * (p.k === 'pw' ? 1 : DPR);
      if (p.life <= 0 || p.y > Hh + 40 || p.y < -60) { effParts.splice(j, 1); continue; }
      if (p.k === 'tuyet') { g.fillStyle = 'rgba(255,255,255,.85)'; g.beginPath(); g.arc(p.x, p.y, 2.2 * DPR, 0, 7); g.fill(); }
      else if (p.k === 'hoadao') { g.fillStyle = '#ffb7d0'; g.beginPath(); g.ellipse(p.x, p.y, 3.5 * DPR, 2 * DPR, p.ph * 2, 0, 7); g.fill(); }
      else if (p.k === 'la') { g.fillStyle = '#ff9f43'; g.beginPath(); g.ellipse(p.x, p.y, 4 * DPR, 2.2 * DPR, p.ph * 3, 0, 7); g.fill(); }
      else if (p.k === 'domdom') { var al = Math.max(0, Math.sin(p.ph * 2)) * Math.min(1, p.life); g.fillStyle = 'rgba(220,255,120,' + al + ')'; g.beginPath(); g.arc(p.x + Math.sin(p.ph * 3) * 6, p.y + Math.cos(p.ph * 2) * 6, 2.2 * DPR, 0, 7); g.fill(); }
      else if (p.k === 'bong') { g.strokeStyle = 'rgba(80,80,80,.5)'; g.lineWidth = DPR; g.beginPath(); g.moveTo(p.x, p.y + 9 * DPR); g.lineTo(p.x, p.y + 22 * DPR); g.stroke(); g.fillStyle = p.c; g.beginPath(); g.ellipse(p.x, p.y, 7 * DPR, 9 * DPR, 0, 0, 7); g.fill(); }
      else if (p.k === 'pw') { g.fillStyle = A.rgba(p.c, Math.max(0, p.life / 1.4)); g.beginPath(); g.arc(p.x, p.y, 2.2 * DPR, 0, 7); g.fill(); }
    }
    void z;
  }
  function drawNight(n, sec, t) {
    g.save(); g.globalCompositeOperation = 'multiply'; g.fillStyle = 'rgba(' + Math.round(255 - 150 * n) + ',' + Math.round(255 - 130 * n) + ',' + Math.round(255 - 60 * n) + ',1)'; g.fillRect(0, 0, W, Hh); g.restore();
    g.save(); g.globalCompositeOperation = 'lighter';
    var z = Z();
    S.list.forEach(function (it) {
      if (!it.d) return; var glow = it.d.glow || it.d.k === 'house' || it.d.k === 'svc' || it.d.k === 'spec' || it.d.k === 'lm';
      if (!glow) return;
      var q = iso(it.x + it.w / 2, it.y + it.h / 2), p = toScreen(q[0], q[1]); if (p[0] < -100 || p[0] > W + 100 || p[1] < -100 || p[1] > Hh + 100) return;
      var R2 = (it.d.glow ? 34 : 22 + it.w * 10) * z, zz = it.d.glow ? (it.b.t === 'den' ? 26 : 16) : 6, gr = g.createRadialGradient(p[0], p[1] - zz * z, 0, p[0], p[1] - zz * z, R2);
      gr.addColorStop(0, 'rgba(255,200,110,' + (0.32 * n) + ')'); gr.addColorStop(1, 'rgba(255,200,110,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(p[0], p[1] - zz * z, R2, 0, 7); g.fill();
    });
    g.restore();
    // sao trên trời
    if (n > 0.6) { var r = A.rnd(7); for (var i = 0; i < 40; i++) { var x = r() * W, y = r() * Hh * 0.4, tw = 0.4 + 0.6 * Math.abs(Math.sin(sec * 1.5 + i)); g.fillStyle = 'rgba(255,255,255,' + (0.5 * tw * (n - 0.5) * 2) + ')'; g.fillRect(x, y, 1.6 * DPR, 1.6 * DPR); } }
  }
  function drawSelection(sec) {
    if (!S.sel) return; var s = st(), z = Z();
    var x, y, w, h;
    if (S.sel.id) { var b = s.b[S.sel.id]; if (!b) { S.sel = null; return; } var d = C.B_BY[b.t]; x = b.x; y = b.y; w = d.w; h = d.h; }
    else if (S.sel.obs) { x = S.sel.x; y = S.sel.y; w = h = 1; } else return;
    diamond(x, y, w, h, 'rgba(255,255,255,' + (0.25 + 0.15 * Math.sin(sec * 5)) + ')', '#ffffff');
    void z;
  }
  function diamond(x, y, w, h, fill, stroke) {
    var p0 = toScreen.apply(null, iso(x, y)), p1 = toScreen.apply(null, iso(x + w, y)), p2 = toScreen.apply(null, iso(x + w, y + h)), p3 = toScreen.apply(null, iso(x, y + h));
    g.beginPath(); g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]); g.lineTo(p2[0], p2[1]); g.lineTo(p3[0], p3[1]); g.closePath();
    if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = 2 * DPR; g.stroke(); }
  }
  function placeValid() {
    var p = S.place, d = C.B_BY[p.t], s = S.view;
    for (var i = 0; i < d.w; i++) for (var j = 0; j < d.h; j++) {
      var x = p.x + i, y = p.y + j, k = x + ',' + y;
      if (!C.cellOwned(S.chs, x, y)) return false; if (s.o[k]) return false;
      var o = S.occ[k]; if (o && o !== p.id) return false;
    }
    return true;
  }
  function drawGhost(isN, sec) {
    var p = S.place, d = C.B_BY[p.t], ok = placeValid(), b = p.id ? S.view.b[p.id] : null;
    diamond(p.x, p.y, d.w, d.h, ok ? 'rgba(76,255,120,.35)' : 'rgba(255,70,70,.4)', ok ? '#4cff78' : '#ff4646');
    var q = iso(p.x, p.y), lvl = b ? lvTier(d, b.l) : 1;
    if (d.k === 'field') drawSprite(spr('field', 'f', { ht: 6 }), q[0], q[1], 0.85);
    else if (d.k === 'road') { var kind = p.t === 'duong' ? 'road' : p.t === 'nuoc' ? 'water' : 'path'; drawSprite(spr(kind, kind, { mask: 0, key: 0, ht: 4 }), q[0], q[1], 0.85); }
    else drawSprite(spr('b', p.t, { w: d.w, h: d.h, b: { l: lvl }, v: 0, key: lvl + ':0:0', flip: !!p.f, night: isN, ht: A.height(p.t, lvl) }), q[0], q[1] - Math.abs(Math.sin(sec * 4)) * 3, 0.85);
  }
  function drawFx(ts) {
    var z = Z();
    for (var i = S.fx.length - 1; i >= 0; i--) {
      var f = S.fx[i], a = (ts - f.t) / 1300; if (a >= 1) { S.fx.splice(i, 1); continue; }
      var q = iso(f.x, f.y), p = toScreen(q[0], q[1]);
      g.globalAlpha = 1 - a * a; g.font = 'bold ' + Math.round(14 * Math.max(0.8, z)) + 'px system-ui,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 3 * DPR; g.strokeStyle = 'rgba(0,0,0,.55)'; g.strokeText(f.text, p[0], p[1] - 30 * z - a * 40 * DPR); g.fillStyle = f.col; g.fillText(f.text, p[0], p[1] - 30 * z - a * 40 * DPR);
    }
    g.globalAlpha = 1;
    for (var j = S.parts.length - 1; j >= 0; j--) {
      var pt = S.parts[j]; pt.life -= 0.025; pt.vy += 0.25; pt.x += pt.vx * DPR; pt.y += pt.vy * DPR;
      if (pt.life <= 0) { S.parts.splice(j, 1); continue; }
      g.globalAlpha = pt.life; g.font = Math.round(pt.sz * DPR) + 'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; g.fillText(pt.e, pt.x, pt.y);
    }
    g.globalAlpha = 1;
  }
  function loop(ts) {
    if (!S) return;
    S.raf = requestAnimationFrame(loop);
    if (document.hidden) return;
    var minGap = S.quality === 'low' ? 60 : (S.quality === 'mid' ? 40 : 30);
    if (ts - (S._last || 0) < minGap - 2) return;
    var d = ts - (S._last || ts); S._last = ts;
    try { draw(ts); } catch (e) { if (!S._errShown) { S._errShown = 1; console.error(e); } }
    if (S.quality === 'auto' && d > 0) { S.fps = S.fps * 0.95 + (1000 / d) * 0.05; if (S.fps < 18) { S.slow++; if (S.slow > 90) { S.quality = 'mid'; resize(); } } else S.slow = 0; }
  }

  /* ---------------- Chọn / chạm ---------------- */
  function pickAt(px, py) {
    var s = st();
    for (var i = S.list.length - 1; i >= 0; i--) {
      var it = S.list[i]; if (it._bub && Math.hypot(px - it._bub[0], py - it._bub[1]) < it._bub[2]) return it;
    }
    var t = tileAt(px, py), k = t[0] + ',' + t[1];
    // ưu tiên phần thân cao của công trình (thử ô phía trước theo chiều dọc màn hình)
    for (var i2 = S.list.length - 1; i2 >= 0; i2--) {
      var it2 = S.list[i2]; if (!it2.d || it2.d.k === 'field' || it2.d.k === 'road') continue;
      var q = iso(it2.x, it2.y), tier = lvTier(it2.d, it2.b.l), sp = spr('b', it2.b.t, { w: it2.w, h: it2.h, b: { l: tier }, v: it2.v % 6, key: tier + ':' + (it2.v % 6) + ':' + (it2.mask || 0), flip: !!it2.b.f, night: nightAmt() > 0.5, mask: it2.mask, ht: A.height(it2.b.t, tier) });
      var z = Z(), kk = z / sp.s, p = toScreen(q[0], q[1]), lx = (px - (p[0] - sp.ox * kk)) / kk, ly = (py - (p[1] - sp.oy * kk)) / kk;
      if (lx < 0 || ly < 0 || lx >= sp.cv.width || ly >= sp.cv.height) continue;
      if (ly > sp.oy) continue;   // phần nền xử lý bằng ô
      try { if (sp.cv.getContext('2d').getImageData(lx | 0, ly | 0, 1, 1).data[3] > 40) return it2; } catch (e) { return it2; }
    }
    var id = S.occ[k]; if (id) { for (var j = 0; j < S.list.length; j++) if (S.list[j].id === id) return S.list[j]; for (var f = 0; f < S.flat.length; f++) if (S.flat[f].id === id) return S.flat[f]; }
    if (s.o[k]) return { obs: s.o[k], x: t[0], y: t[1] };
    if (!C.cellOwned(S.chs, t[0], t[1])) return { land: [Math.floor(t[0] / CH), Math.floor(t[1] / CH)], x: t[0], y: t[1] };
    return { empty: true, x: t[0], y: t[1] };
  }
  function onTap(px, py) {
    hidePop();
    if (S.place) { placeTap(px, py); return; }
    var it = pickAt(px, py);
    if (S.visit) return;
    if (S.tool) { if (it && it.d && it.d.k === 'field') { strokeApply(it); return; } setTool(null); }
    if (!it || it.empty) { select(null); return; }
    if (it.land) { buyLand(it.land[0], it.land[1]); return; }
    if (it.obs) { select({ obs: it.obs, x: it.x, y: it.y }); openCard(); return; }
    var b = it.b, d = it.d, t = now(), s = S.view;
    if (d.k === 'field') {
      if (b.c && b.e <= t + 1000) { harvest([it.id], px, py); setTool({ k: 'harvest' }); return; }
      if (!b.c) { select({ id: it.id }); seedPop(it, px, py); return; }
      select({ id: it.id }); openCard(); return;
    }
    if (d.k === 'house') { var tx = C.taxOf(s, b, d, C.stats(s, t), t); if (tx >= 1) { collectTax([it.id], px, py); return; } }
    if (d.k === 'fac' && b.q.length && b.q[0][1] <= t + 1000) { collect(it.id, px, py); select({ id: it.id }); openCard(); return; }
    if (d.k === 'pen') {
      var done = (b.a || []).some(function (e) { return e > 0 && e <= t + 1000; });
      if (done) { collect(it.id, px, py, true); select({ id: it.id }); openCard(); return; }
    }
    if (b.t === 'donhang') { select({ id: it.id }); openPanel('orders'); return; }
    if (b.t === 'kho' || b.t === 'cho') { select({ id: it.id }); openPanel('storage'); return; }
    select({ id: it.id }); openCard();
  }
  function select(sel) { S.sel = sel; if (!sel) closeCard(); }

  /* ---------------- Hành động ---------------- */
  function harvest(ids, px, py) {
    var r = doOps({ op: 'harvest', ids: ids }); if (!r) return false;
    var got = r.results[0].got; sfx('harvest');
    var b = S.view.b[ids[0]]; Object.keys(got).forEach(function (k) { if (b) floatText(b.x + 0.5, b.y + 0.5, '+' + got[k] + ' ' + itemE(k), '#fff59d'); });
    if (px != null) burstAt(px, py, itemE(Object.keys(got)[0]), 5);
    return true;
  }
  function plant(ids, c) {
    var r = doOps({ op: 'plant', c: c, ids: ids }, { silent: S._stroke }); if (!r) return false;
    sfx('plant'); return true;
  }
  function collectTax(ids, px, py) {
    var r = doOps({ op: 'tax', ids: ids }); if (!r) return;
    var x = r.results[0].xu; sfx('coin');
    var b = S.view.b[ids[0]]; if (b) floatText(b.x + 0.5, b.y + 0.5, '+' + fmt(x) + ' 🪙', '#ffe082');
    if (px != null) flyTo(px, py, '🪙', '.ct-p-xu');
  }
  function collect(id, px, py, pen) {
    var ops = [{ op: 'collect', id: id }], b = S.view.b[id], d = C.B_BY[b.t];
    var r = doOps(ops); if (!r) return;
    sfx('harvest'); var got = r.results[0].got;
    Object.keys(got).forEach(function (k) { floatText(b.x + d.w / 2, b.y + d.h / 2, '+' + got[k] + ' ' + itemE(k), '#b9f6ca'); });
    if (px != null) flyTo(px, py, itemE(Object.keys(got)[0]), '.ct-tb-kho');
    if (pen) { var b2 = S.view.b[id]; if (b2 && (!d.feed || (S.view.inv[d.feed] || 0) > 0)) doOps({ op: 'feed', id: id }, { silent: true }); }
  }
  function buyLand(cx, cy) {
    var s = S.view, C2 = S.chs, adj = C2[(cx + 1) + ',' + cy] || C2[(cx - 1) + ',' + cy] || C2[cx + ',' + (cy + 1)] || C2[cx + ',' + (cy - 1)];
    if (!adj) { toast('Hãy mua mảnh đất sát đất của bạn trước nhé (biển vàng 🔓).'); return; }
    var cost = P(C.chunkCost(s));
    confirmBox('🗺️ Mở rộng đất', 'Mua mảnh đất mới 8×8 ô với giá ' + fmt(cost) + ' ⭐ điểm học tập?\nĐất mới có cây và đá để bạn khai hoang lấy gỗ, đá.', '🔓 Mua ' + fmt(cost) + ' ⭐', function () {
      var r = doOps({ op: 'buyChunk', cx: cx, cy: cy }); if (r) { sfx('buy'); toast('🎉 Đất mới! Hãy khai hoang và xây dựng.'); }
    });
  }

  /* ---------------- Công cụ ruộng (kéo để gieo / thu) ---------------- */
  function setTool(t) {
    S.tool = t; var c = $('.ct-tool', R);
    if (!t) { c.hidden = true; return; }
    c.hidden = false; c.replaceChildren();
    var label = t.k === 'harvest' ? '🌾 Kéo qua các ruộng chín để thu hoạch' : C.CROP_BY[t.c].e + ' Kéo qua ruộng trống để gieo ' + C.CROP_BY[t.c].n;
    c.append(el('span', '', label), btn('ghost sm', '✖', function () { setTool(null); }, 'Thôi'));
  }
  function strokeApply(it) {
    if (!it || !it.d || it.d.k !== 'field' || !S.tool) return;
    if (S._strokeDone[it.id]) return; S._strokeDone[it.id] = 1;
    var b = it.b, t = now();
    if (S.tool.k === 'harvest') { if (b.c && b.e <= t + 1000) harvest([it.id]); }
    else if (!b.c) { if (!plant([it.id], S.tool.c)) { if (!S._strokeErr) { S._strokeErr = 1; doOps({ op: 'plant', c: S.tool.c, ids: [it.id] }); } } }
  }
  function fieldAtPoint(px, py) {
    var t = tileAt(px, py), id = S.occ[t[0] + ',' + t[1]]; if (!id) return null; var b = S.view.b[id]; if (!b || b.t !== 'ruong') return null;
    for (var i = 0; i < S.list.length; i++) if (S.list[i].id === id) return S.list[i]; return null;
  }

  /* ---------------- Nhập liệu (chạm, kéo, thu phóng) ---------------- */
  function bindInput() {
    cv.addEventListener('pointerdown', function (e) {
      cv.setPointerCapture(e.pointerId);
      var r = cv.getBoundingClientRect(), px = (e.clientX - r.left) * DPR, py = (e.clientY - r.top) * DPR;
      S.ptr.set(e.pointerId, { x: px, y: py, x0: px, y0: py, t: performance.now() });
      if (S.ptr.size === 2) { var a = Array.from(S.ptr.values()); S.gest = { k: 'pinch', d0: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y), z0: S.cam.z }; clearTimeout(S.lp); return; }
      S.gest = { k: 'maybe', cam: { x: S.cam.x, y: S.cam.y } };
      if (S.place && !S.visit) { var tt = tileAt(px, py), d = C.B_BY[S.place.t]; if (tt[0] >= S.place.x - 1 && tt[0] <= S.place.x + d.w && tt[1] >= S.place.y - 1 && tt[1] <= S.place.y + d.h) S.gest = { k: 'ghost', dx: tt[0] - S.place.x, dy: tt[1] - S.place.y }; return; }
      if (S.tool && !S.visit) { var f = fieldAtPoint(px, py); if (f) { S.gest = { k: 'stroke' }; S._strokeDone = {}; S._stroke = 1; S._strokeErr = 0; strokeApply(f); return; } }
      clearTimeout(S.lp);
      S.lp = setTimeout(function () { if (S && S.gest && S.gest.k === 'maybe' && !S.visit) { var it = pickAt(px, py); if (it && it.id && it.d && it.d.k !== 'spec' || (it && it.id && it.d && it.d.k === 'spec')) { if (navigator.vibrate) navigator.vibrate(20); startMove(it.id); S.gest = { k: 'ghost', dx: 0, dy: 0 }; } } }, 520);
    });
    cv.addEventListener('pointermove', function (e) {
      var p = S.ptr.get(e.pointerId); if (!p) return;
      var r = cv.getBoundingClientRect(), px = (e.clientX - r.left) * DPR, py = (e.clientY - r.top) * DPR; p.x = px; p.y = py;
      var gs = S.gest; if (!gs) return;
      if (gs.k === 'pinch' && S.ptr.size >= 2) { var a = Array.from(S.ptr.values()), d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); setZoom(gs.z0 * d / Math.max(1, gs.d0), (a[0].x + a[1].x) / 2, (a[0].y + a[1].y) / 2); return; }
      if (gs.k === 'stroke') { var f = fieldAtPoint(px, py); if (f) strokeApply(f); return; }
      if (gs.k === 'ghost') { var t = tileAt(px, py); S.place.x = t[0] - gs.dx; S.place.y = t[1] - gs.dy; placeBar(); return; }
      if (gs.k === 'maybe' && Math.hypot(px - p.x0, py - p.y0) > 9 * DPR) { gs.k = 'pan'; clearTimeout(S.lp); hidePop(); }
      if (gs.k === 'pan') { var z = Z(); S.cam.x = gs.cam.x - (px - p.x0) / z; S.cam.y = gs.cam.y - (py - p.y0) / z; clampCam(); }
    });
    function up(e) {
      var p = S.ptr.get(e.pointerId); if (!p) return; S.ptr.delete(e.pointerId); clearTimeout(S.lp);
      var gs = S.gest;
      if (gs && gs.k === 'maybe' && S.ptr.size === 0 && performance.now() - p.t < 700) onTap(p.x, p.y);
      if (gs && gs.k === 'stroke') { S._stroke = 0; }
      if (gs && gs.k === 'pan') LS.set('sm_city_cam', JSON.stringify(S.cam));
      if (S.ptr.size === 0) S.gest = null; else if (gs && gs.k === 'pinch') S.gest = { k: 'none' };
    }
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', function (e) { e.preventDefault(); var r = cv.getBoundingClientRect(); setZoom(S.cam.z * (e.deltaY > 0 ? 0.88 : 1.14), (e.clientX - r.left) * DPR, (e.clientY - r.top) * DPR); }, { passive: false });
    cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }
  function onKey(e) {
    if (!S || /input|textarea|select/i.test((e.target && e.target.tagName) || '')) return;
    var k = e.key, z = 40 / S.cam.z;
    if (k === 'Escape') { if (S.place) cancelPlace(); else if (S.panel) closePanel(); else if (S.card) select(null); else if (S.tool) setTool(null); }
    else if (k === 'ArrowLeft') S.cam.x -= z; else if (k === 'ArrowRight') S.cam.x += z; else if (k === 'ArrowUp') S.cam.y -= z; else if (k === 'ArrowDown') S.cam.y += z;
    else if (k === '+' || k === '=') setZoom(S.cam.z * 1.15); else if (k === '-') setZoom(S.cam.z / 1.15);
    else if ((k === 'r' || k === 'R') && S.place) { S.place.f = !S.place.f; }
    else return;
    e.preventDefault();
  }

  /* ---------------- Đặt / di chuyển công trình ---------------- */
  function startPlace(t, o) {
    o = o || {}; closePanel(); select(null); setTool(null);
    var d = C.B_BY[t], c = tileAt(W / 2, Hh / 2), best = null, s = S.view;
    // tìm chỗ trống gần giữa màn hình
    for (var r = 0; r < 30 && !best; r++) for (var dx = -r; dx <= r && !best; dx++) for (var dy = -r; dy <= r && !best; dy++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      S.place = { t: t, x: c[0] + dx, y: c[1] + dy };
      if (placeValid()) best = [c[0] + dx, c[1] + dy];
    }
    if (!best) best = c;
    S.place = { t: t, x: best[0], y: best[1], inv: o.inv, f: false, repeat: (d.k === 'road' || d.k === 'field' || (d.k === 'deco' && !d.pts) || d.k === 'house' && !d.pts) && o.inv == null };
    placeBar(); void s;
  }
  function startMove(id) {
    var b = S.view.b[id]; if (!b) return; closeCard(); setTool(null);
    S.place = { t: b.t, x: b.x, y: b.y, id: id, f: !!b.f, x0: b.x, y0: b.y };
    placeBar(); toast('Kéo để di chuyển ' + C.B_BY[b.t].n + ', rồi bấm ✔');
  }
  function placeTap(px, py) {
    var t = tileAt(px, py), d = C.B_BY[S.place.t];
    S.place.x = t[0] - Math.floor((d.w - 1) / 2); S.place.y = t[1] - Math.floor((d.h - 1) / 2);
    if (S.place.repeat && d.w === 1 && placeValid()) confirmPlace();
    placeBar();
  }
  function confirmPlace() {
    var p = S.place, d = C.B_BY[p.t]; if (!p) return;
    if (!placeValid()) { toast('Không đặt được ở đây – chọn ô màu xanh nhé.', 1); sfx('error'); return; }
    var op = p.id ? { op: 'move', id: p.id, x: p.x, y: p.y, f: p.f ? 1 : 0 } : { op: 'place', t: p.t, x: p.x, y: p.y, f: p.f ? 1 : 0 };
    if (p.inv != null) op.inv = p.inv;
    var r = doOps(op); if (!r) return;
    sfx(p.id ? 'pop' : 'build');
    var q = iso(p.x + d.w / 2, p.y + d.h / 2), sp = toScreen(q[0], q[1]); burstAt(sp[0], sp[1], p.id ? '✨' : '🎉', p.id ? 4 : 10);
    if (!p.id && p.repeat) { placeBar(); return; }
    if (!p.id && r.results[0].id) { var nid = r.results[0].id; S.place = null; placeBar(); select({ id: nid }); if (d.k !== 'road' && d.k !== 'deco') openCard(); return; }
    S.place = null; placeBar();
  }
  function cancelPlace() { S.place = null; placeBar(); }
  function placeBar() {
    var bar = $('.ct-place', R); if (!S.place) { bar.hidden = true; $('.ct-tb', R).hidden = false; return; }
    var p = S.place, d = C.B_BY[p.t], ok = placeValid();
    bar.hidden = false; $('.ct-tb', R).hidden = true; bar.replaceChildren();
    var info = el('div', 'ct-place-i');
    info.append(el('b', '', d.e + ' ' + d.n));
    if (!p.id && p.inv == null) info.append(el('span', '', ' · ' + priceText(d)));
    if (p.id) info.append(el('span', '', ' · di chuyển miễn phí'));
    if (p.repeat) info.append(el('small', '', 'Chạm vào ô để đặt liên tục'));
    bar.append(info);
    var row = el('div', 'ct-place-b');
    row.append(btn('ghost', '✖ Thôi', cancelPlace));
    if (d.w === d.h && d.k !== 'field' && d.k !== 'road') row.append(btn('ghost', '↔ Lật', function () { p.f = !p.f; }));
    var okb = btn('ok', '✔ Đặt', confirmPlace); okb.disabled = !ok; row.append(okb);
    bar.append(row);
  }
  function priceText(d) {
    var s = S.view, L = lv(), S2 = C.stats(s, now());
    if (d.k === 'field') return fmt(C.fieldCost(S2.fields)) + ' 🪙';
    var cnt = C.lmCount(s, d.id);
    if ((d.k === 'fac' || d.k === 'pen') && cnt >= 1) return cnt >= 3 ? 'Tối đa 3' : fmt(P(C.copyCost(d, cnt))) + ' ⭐ (bản thứ ' + (cnt + 1) + ')';
    var parts = []; if (d.pts) parts.push(fmt(P(d.pts)) + ' ⭐'); if (d.xu) parts.push(fmt(d.xu) + ' 🪙');
    Object.keys(d.mat || {}).forEach(function (k) { parts.push(d.mat[k] + itemE(k)); });
    void L; return parts.join(' + ') || 'Miễn phí';
  }

  /* ---------------- HUD ---------------- */
  function hud() {
    if (!R) return; var s = st(), D = S.visit ? null : C.derived(S.view, now(), S.opt), Lh = C.level(s.xp);
    var name = (S.visit ? (s.nm || 'Thành phố ' + S.visit.who) : (s.nm || 'Thành phố của tôi'));
    $('.ct-name', R).textContent = name;
    var pop = S.visit ? S.visit.derived.pop : D.pop;
    $('.ct-rank', R).textContent = (S.visit ? S.visit.derived.rank : D.rank) + ' · 👥 ' + fmt(pop);
    $('.ct-lv b', R).textContent = Lh.lv; $('.ct-lv', R).style.setProperty('--p', (Lh.into / Lh.need * 100).toFixed(1) + '%'); $('.ct-lv', R).title = 'Cấp ' + Lh.lv + ' · ' + fmt(Lh.into) + '/' + fmt(Lh.need) + ' XP';
    if (S.visit) { $('.ct-pills', R).hidden = true; return; }
    $('.ct-pills', R).hidden = false;
    $('.ct-p-xu b', R).textContent = fmt(s.xu);
    $('.ct-p-pt b', R).textContent = fmt(Math.max(0, S.bal - pendingSpend()));
    $('.ct-p-pt', R).title = 'Điểm học tập' + (S.opt.act ? ' · mỗi thao tác tốn ' + S.opt.act + ' ⭐' : '');
    $('.ct-p-hap b', R).textContent = '+' + fmt(D.taxPct) + '%';
    var kb = $('.ct-p-kho', R); kb.querySelector('b').textContent = fmt(D.used) + '/' + fmt(D.cap); kb.classList.toggle('full', D.used >= D.cap);
    // huy hiệu
    var t = now(), nOrd = 0; s.od.forEach(function (o) { if ((!o.w || o.w <= t) && Object.keys(o.it).every(function (k) { return (s.inv[k] || 0) >= o.it[k]; })) nOrd++; });
    badge('.ct-tb-od', nOrd);
    var nq = D.quests.filter(function (q) { return q.done && !q.claimed; }).length + (D.dailyReady ? 1 : 0); badge('.ct-tb-q', nq);
    // nút trợ lý
    var hb = $('.ct-help', R), hsig = JSON.stringify(s.hp) + (s.last && s.last.c) + C.BOOSTS.map(function (b) { var w = s.bo[b.id]; return w && w[1] > t ? w[1] : 0; }).join(',');
    if (hsig === S._hsig) return; S._hsig = hsig; hb.replaceChildren();
    if (s.hp.maygat) hb.append(btn('chip', '🚜 Thu hết', function () { var ids = fieldIds(function (b) { return b.c && b.e <= now() + 1000; }); if (!ids.length) return toast('Chưa có ruộng chín.'); for (var i = 0; i < ids.length; i += C.MAX_IDS) harvest(ids.slice(i, i + C.MAX_IDS)); }, 'Thu hoạch tất cả ruộng chín'));
    if (s.hp.maygieo) hb.append(btn('chip', '🌱 Gieo ' + (C.CROP_BY[s.last.c] || C.CROP_BY.lua).e, function () { var ids = fieldIds(function (b) { return !b.c; }); if (!ids.length) return toast('Không còn ruộng trống.'); var c = s.last.c || 'lua'; var room = Math.floor(S.view.xu / C.CROP_BY[c].seed); ids = ids.slice(0, room); if (!ids.length) return toast('Không đủ xu mua hạt.', 1); for (var i = 0; i < ids.length; i += C.MAX_IDS) plant(ids.slice(i, i + C.MAX_IDS), c); }, 'Gieo lại tất cả ruộng trống'));
    if (s.hp.robot) hb.append(btn('chip', '🤖 Thu thuế', function () { var r = doOps({ op: 'tax', all: 1 }); if (r) { sfx('coin'); toast('🤖 Thu được ' + fmt(r.results[0].xu) + ' 🪙 từ ' + r.results[0].n + ' nhà!'); } }, 'Thu thuế cả thành phố'));
    if (s.hp.quandoc) hb.append(btn('chip', '👷 Thu SP', function () { var r = doOps({ op: 'collectAll' }); if (r) { sfx('harvest'); toast('👷 Thu ' + r.results[0].n + ' sản phẩm!'); } }, 'Thu sản phẩm mọi nhà máy & chuồng trại'));
    var bo = el('div', 'ct-boosts'); C.BOOSTS.forEach(function (b) { var w = s.bo[b.id]; if (w && w[1] > t) { var c = liveT(el('span', 'ct-boost'), w[1], b.e + ' '); c.title = b.n; bo.append(c); } }); hb.append(bo);
  }
  function badge(sel, n) { var b = $(sel + ' .ct-badge', R); if (!b) return; b.hidden = !n; b.textContent = n > 9 ? '9+' : n; }
  function fieldIds(fn) { var s = S.view, out = []; Object.keys(s.b).forEach(function (id) { var b = s.b[id]; if (b.t === 'ruong' && fn(b)) out.push(id); }); return out; }

  /* ---------------- Popup chọn hạt ---------------- */
  function hidePop() { var p = $('.ct-pop', R); if (p) p.hidden = true; }
  function seedPop(it, px, py) {
    var pop = $('.ct-pop', R), s = S.view, L = lv(), t = now();
    pop.replaceChildren(); pop.hidden = false;
    var list = C.CROPS.filter(function (c) { return c.lv <= L + 2 && (!c.rare || s.rc.indexOf(c.id) >= 0); });
    list.forEach(function (c) {
      var locked = c.lv > L, b = el('button', 'ct-seed' + (locked ? ' lock' : ''));
      b.type = 'button'; b.append(el('span', 'e', c.e), el('small', '', locked ? '🔒' + c.lv : fmtT(C.cropTime(s, c, t))), el('small', 'p', c.seed + '🪙'));
      b.title = c.n + ' – bán ' + c.p + ' 🪙';
      if (!locked) {
        b.addEventListener('pointerdown', function (e) {
          e.preventDefault(); sfx('click');
          var ok = plant([it.id], c.id); if (!ok) return;
          setTool({ k: 'plant', c: c.id }); hidePop();
          // kéo tiếp từ nút hạt giống sang ruộng khác
          S._strokeDone = {}; S._strokeDone[it.id] = 1; S._stroke = 1; S._strokeErr = 0;
          var mv = function (ev) { var r = cv.getBoundingClientRect(), f = fieldAtPoint((ev.clientX - r.left) * DPR, (ev.clientY - r.top) * DPR); if (f) strokeApply(f); };
          var upf = function () { S._stroke = 0; document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', upf); };
          document.addEventListener('pointermove', mv); document.addEventListener('pointerup', upf);
        });
      }
      pop.append(b);
    });
    var more = C.CROPS.filter(function (c) { return c.rare && s.rc.indexOf(c.id) < 0; }).length;
    if (more) { var m = btn('ct-seed shop', '', function () { hidePop(); openPanel('points', 'giong'); }); m.append(el('span', 'e', '💎'), el('small', '', 'Giống quý')); pop.append(m); }
    var rr2 = R.getBoundingClientRect(), cr = cv.getBoundingClientRect();
    var x = cr.left - rr2.left + px / DPR, y = cr.top - rr2.top + py / DPR;
    pop.style.left = Math.max(8, Math.min(rr2.width - pop.offsetWidth - 8, x - pop.offsetWidth / 2)) + 'px';
    pop.style.top = Math.max(60, Math.min(rr2.height - pop.offsetHeight - 80, y - pop.offsetHeight - 30)) + 'px';
  }

  /* ---------------- Thẻ thông tin (chạm công trình) ---------------- */
  function openCard() { S.card = true; cardRender(); }
  function closeCard() { S.card = null; var c = $('.ct-card', R); if (c) c.hidden = true; }
  function cardSig() { var s = S.view, b = S.sel && S.sel.id && s.b[S.sel.id]; if (!b) return ''; var d = C.B_BY[b.t], t = now(); var ready = d.k === 'house' ? Math.floor(C.taxOf(s, b, d, C.stats(s, t), t)) : 0; return JSON.stringify(b) + '|' + s.xu + '|' + JSON.stringify(s.inv) + '|' + ready; }
  function cardRender() {
    var c = $('.ct-card', R), s = S.view, t = now(), sel = S.sel; if (!sel) { closeCard(); return; }
    S._cardSig = cardSig();
    c.hidden = false; c.replaceChildren();
    var head = el('div', 'ct-card-h'), body = el('div', 'ct-card-b'), acts = el('div', 'ct-card-a');
    head.append(btn('ghost sm ct-x', '✖', function () { select(null); }, 'Đóng'));
    c.append(head, body, acts);
    if (sel.obs) {
      var ob = C.OBS[sel.obs]; if (!s.o[sel.x + ',' + sel.y]) { select(null); return; }
      head.prepend(el('h3', '', ob.e + ' ' + ob.n));
      var g2 = Object.keys(ob.get).map(function (k) { return '+' + ob.get[k] + ' ' + itemE(k); }).join(' ');
      body.append(el('p', '', 'Dọn đi để có chỗ xây dựng. Nhận ' + (g2 || 'chỗ trống') + ' và +' + ob.xp + ' XP.'));
      acts.append(btn('ok', '🪓 Dọn – ' + ob.xu + ' 🪙', function () { var r = doOps({ op: 'clear', x: sel.x, y: sel.y }); if (r) { sfx('harvest'); Object.keys(ob.get).forEach(function (k) { floatText(sel.x + 0.5, sel.y + 0.5, '+' + ob.get[k] + ' ' + itemE(k), '#fff59d'); }); select(null); } }));
      return;
    }
    var b = s.b[sel.id]; if (!b) { select(null); return; }
    var d = C.B_BY[b.t], S2 = C.stats(s, t), up = C.upCost(b, d);
    var title = el('h3', '', d.e + ' ' + d.n); if (up) title.append(el('span', 'ct-lvl', 'Cấp ' + fmt(b.l))); head.prepend(title);
    if (d.k === 'field') {
      if (!b.c) { body.append(el('p', '', 'Ruộng trống. Chạm ruộng để chọn hạt giống.')); }
      else {
        var cr = C.CROP_BY[b.c], left = b.e - t;
        body.append(left > 0 ? liveT(el('p'), b.e, cr.e + ' ' + cr.n + ' – chín sau ', ' · thu ' + (b.n || 2) + ' ' + cr.e) : el('p', '', cr.e + ' ' + cr.n + ' – đã chín! · thu ' + (b.n || 2) + ' ' + cr.e));
        body.append(bar(1 - Math.max(0, left) / C.cropTime(s, cr, t)));
        if (left > 0) acts.append(speedBtn([sel.id], left));
        else acts.append(btn('ok', '🌾 Thu hoạch', function () { harvest([sel.id]); }));
      }
      acts.append(btn('ghost', '✥ Di chuyển', function () { startMove(sel.id); }));
      return;
    }
    if (d.k === 'house') {
      var tx = C.taxOf(s, b, d, S2, t), rate = C.taxRate(s, b, d, S2, t);
      body.append(el('p', '', '👥 ' + fmt(d.pop * b.l) + ' dân · 🪙 ' + fmt(rate) + '/giờ' + (s.hp.robot ? '' : ' (giữ tối đa ' + C.TAX_CAP_H + ' giờ)')));
      body.append(el('p', 'ct-big', 'Thuế đang chờ: ' + fmt(tx) + ' 🪙'));
      if (tx >= 1) acts.append(btn('ok', '🪙 Thu thuế', function () { collectTax([sel.id]); }));
    }
    if (d.k === 'svc' || d.k === 'deco') body.append(el('p', '', '😊 +' + fmt((d.hap || 0) * (d.k === 'svc' ? b.l : 1)) + ' hạnh phúc → +' + fmt((d.hap || 0) * (d.k === 'svc' ? b.l : 1)) + '% thuế toàn thành phố'));
    if (d.k === 'lm') body.append(el('p', '', lmText(d, b.l)));
    if (d.k === 'spec') body.append(el('p', '', specText(b, d, S2)));
    if (d.k === 'fac') facCard(b, d, sel.id, body, acts, t);
    if (d.k === 'pen') penCard(b, d, sel.id, body, acts, t);
    if (b.t === 'donhang') acts.append(btn('ok', '🚚 Xem đơn hàng', function () { openPanel('orders'); }));
    if (b.t === 'kho' || b.t === 'cho') acts.append(btn('ok', '📦 Mở kho / chợ', function () { openPanel('storage'); }));
    if (b.t === 'toathi') acts.append(btn('ok', '🎯 Nhiệm vụ', function () { openPanel('quests'); }));
    if (up) {
      var ub = el('div', 'ct-up');
      var line = el('div', 'ct-up-l'); line.append(el('b', '', '⬆ Lên cấp ' + fmt(b.l + 1) + ': '));
      if (up.pts) line.append(el('span', 'ct-cost pt', fmt(P(up.pts)) + ' ⭐'));
      if (up.xu) line.append(el('span', 'ct-cost' + (s.xu >= up.xu ? '' : ' no'), fmt(up.xu) + ' 🪙'));
      line.append(matsLine(up.mat, s.inv)); ub.append(line);
      ub.append(el('small', 'muted', upgradeGain(d, b)));
      var canUp = s.xu >= up.xu && Object.keys(up.mat).every(function (k) { return (s.inv[k] || 0) >= up.mat[k]; });
      var bu = btn(up.pts ? 'pt' : 'ok', '⬆ Nâng cấp', function () { var r = doOps({ op: 'upgrade', id: sel.id }); if (r) { sfx('build'); var q = iso(b.x + d.w / 2, b.y + d.h / 2), p = toScreen(q[0], q[1]); burstAt(p[0], p[1] - 40 * Z(), '⭐', 10); floatText(b.x + d.w / 2, b.y + d.h / 2, 'Cấp ' + (b.l) + '!', '#ffe082'); } });
      if (!canUp && !up.pts) bu.classList.add('dim');
      ub.append(bu); body.append(ub);
    }
    acts.append(btn('ghost', '✥ Di chuyển', function () { startMove(sel.id); }));
    if (d.k !== 'spec') acts.append(btn('ghost', '📥 Cất', function () { var r = doOps({ op: 'store', id: sel.id }); if (r) { toast(d.n + ' đã vào Kho công trình (🏗️ Xây dựng → Kho công trình). Đặt lại miễn phí, giữ nguyên cấp.'); select(null); } }, 'Cất vào kho công trình (không mất gì)'));
  }
  function upgradeGain(d, b) {
    if (d.k === 'house') return 'Dân số ' + fmt(d.pop * b.l) + ' → ' + fmt(d.pop * (b.l + 1)) + ' (thuế tăng theo)';
    if (d.k === 'svc') return 'Hạnh phúc +' + fmt(d.hap * b.l) + ' → +' + fmt(d.hap * (b.l + 1));
    if (d.k === 'fac') return 'Nhanh hơn 5% · ô hàng chờ: ' + C.slots(S.view, b) + ' → ' + C.slots(S.view, { l: b.l + 1 });
    if (d.k === 'pen') return 'Số con: ' + C.animals(S.view, b) + ' → ' + C.animals(S.view, { l: b.l + 1 });
    if (d.k === 'lm') return lmText(d, b.l + 1);
    if (b.t === 'kho') return 'Sức chứa +50';
    if (b.t === 'donhang') return 'Thêm ô đơn hàng (tối đa 12), +3% xu đơn hàng';
    if (b.t === 'cho') return 'Giá bán ở chợ +5%';
    if (b.t === 'toathi') return '+10 😊 hạnh phúc, +2% thuế';
    return '';
  }
  function lmText(d, l) {
    var v = d.bv * l, m = { hap: '😊 +' + fmt(v) + ' hạnh phúc', tax: '💰 +' + v + '% thuế', fac: '⚙️ Nhà máy & chuồng nhanh hơn ' + v + '%', ord: '🚚 +' + v + '% xu đơn hàng', crop: '🌱 Cây lớn nhanh hơn ' + v + '%', xp: '✨ +' + v + '% XP', sto: '📦 +' + fmt(v) + ' sức chứa kho' };
    return 'Kỳ quan cấp ' + fmt(l) + ': ' + m[d.bonus];
  }
  function specText(b, d, S2) {
    if (b.t === 'kho') return '📦 Đang chứa ' + fmt(S2.used) + '/' + fmt(S2.cap) + ' món.';
    if (b.t === 'donhang') return '🚚 ' + S2.orderSlots + ' ô đơn hàng. Giao hàng nhận xu và XP.';
    if (b.t === 'cho') return '🏪 Bán nông sản & hàng hoá lấy xu ngay (giá ×' + S2.sellMul.toFixed(2) + ').';
    if (b.t === 'toathi') return '🏛️ Trái tim thành phố. Dân số ' + fmt(S2.pop) + ' · 😊 ' + fmt(S2.hap) + ' · thuế +' + fmt(S2.taxPct) + '%';
    return '';
  }
  function bar(p) { var w = el('div', 'ct-bar'), i = el('i'); i.style.width = Math.round(Math.max(0, Math.min(1, p)) * 100) + '%'; w.append(i); return w; }
  function speedBtn(ids, left) {
    var cost = P(Math.max(1, Math.ceil(left / (C.SPEED_MIN_PER_PT * 60000))));
    return btn('pt', '⚡ Xong ngay – ' + fmt(cost) + ' ⭐', function () { var r = doOps({ op: 'speed', ids: ids }); if (r) sfx('buy'); }, 'Dùng điểm học tập để làm xong ngay');
  }
  function facCard(b, d, id, body, acts, t) {
    var s = S.view, slots = C.slots(s, b), q = el('div', 'ct-queue');
    for (var i = 0; i < slots; i++) {
      var x = b.q[i], cell = el('div', 'ct-slot');
      if (x) { var r = d.rs[x[0]]; cell.append(el('span', 'e', r.e)); if (x[1] <= t) { cell.classList.add('done'); cell.append(el('small', '', '✔')); } else if (i === 0 || b.q[i - 1][1] <= t) { cell.append(liveT(el('small'), x[1])); cell.classList.add('run'); } else cell.append(el('small', '', 'chờ')); }
      else cell.classList.add('empty');
      q.append(cell);
    }
    body.append(q);
    var nDone = b.q.filter(function (x) { return x[1] <= t; }).length;
    if (nDone) acts.prepend(btn('ok', '📥 Thu ' + nDone + ' sản phẩm', function () { collect(id); }));
    var last = b.q.length ? b.q[b.q.length - 1][1] : 0; if (last > t) acts.prepend(speedBtn([id], last - t));
    var L = lv(), rl = el('div', 'ct-recipes');
    d.rs.forEach(function (r, i) {
      var lock = r.lv > L, can = !lock && Object.keys(r.in).every(function (k) { return (s.inv[k] || 0) >= r.in[k]; });
      var row = el('button', 'ct-recipe' + (lock ? ' lock' : can ? '' : ' no')); row.type = 'button';
      row.append(el('span', 'e', r.e));
      var mid = el('span', 'm'); mid.append(el('b', '', r.n + (r.q > 1 ? ' ×' + r.q : '')), lock ? el('small', '', '🔒 Cấp ' + r.lv) : matsLine(r.in, s.inv)); row.append(mid);
      row.append(el('small', 't', '⏱ ' + fmtT(r.t * 1000 / (C.stats(s, t).facMul * (1 + 0.05 * (b.l - 1))))));
      if (!lock) row.addEventListener('click', function () { sfx('click'); var rr3 = doOps({ op: 'queue', id: id, r: i }); if (rr3) sfx('plant'); });
      rl.append(row);
    });
    body.append(rl);
  }
  function penCard(b, d, id, body, acts, t) {
    var s = S.view, n = C.animals(s, b), a = (b.a || []).slice(); while (a.length < n) a.push(0);
    var ready2 = a.filter(function (e) { return e > 0 && e <= t; }).length, hungry = a.filter(function (e) { return !e; }).length, busy = a.filter(function (e) { return e > t; });
    body.append(el('p', '', d.e + ' ' + n + ' ' + d.an + ' · cho ' + d.prod[2] + ' ' + d.prod[1] + ' mỗi ' + fmtT(d.t * 1000 / C.stats(s, t).facMul)));
    var row = el('div', 'ct-queue');
    a.forEach(function (e) { var c = el('div', 'ct-slot' + (e > 0 && e <= t ? ' done' : e > t ? ' run' : ' empty')); c.append(el('span', 'e', e > 0 && e <= t ? d.prod[2] : e > t ? d.e : '🍽️')); if (e > t) c.append(liveT(el('small'), e)); row.append(c); });
    body.append(row);
    if (ready2) acts.prepend(btn('ok', '📥 Thu ' + ready2 + ' ' + d.prod[2], function () { collect(id, null, null, true); }));
    if (hungry) {
      var have = d.feed ? (s.inv[d.feed] || 0) : 99;
      acts.prepend(btn(have ? 'ok' : 'dim', d.feed ? '🍽️ Cho ăn (' + C.IT_BY[d.feed].e + ' ' + have + ')' : '🌼 Cho ong làm mật', function () { var r = doOps({ op: 'feed', id: id }); if (r) sfx('plant'); }));
      if (d.feed && !have) body.append(el('small', 'muted', 'Cần ' + C.IT_BY[d.feed].e + ' ' + C.IT_BY[d.feed].n + ' – làm ở 🥣 Xưởng thức ăn.'));
    }
    if (busy.length) acts.prepend(speedBtn([id], Math.max.apply(null, busy) - t));
  }

  /* ---------------- Bảng (bottom sheet) ---------------- */
  var PANELS = {};
  function openPanel(name, arg) { hidePop(); closeCard(); S.panel = { name: name, arg: arg, tab: arg || null }; panelRender(true); }
  function closePanel() { S.panel = null; var p = $('.ct-sheet', R); p.hidden = true; p.replaceChildren(); }
  function panelRender(first) {
    var pn = S.panel; if (!pn) return; var sh = $('.ct-sheet', R), f = PANELS[pn.name]; if (!f) return;
    var body = sh.querySelector('.ct-sb'), keep = body ? body.scrollTop : 0;
    sh.hidden = false; sh.replaceChildren();
    var head = el('div', 'ct-sh'), b = el('div', 'ct-sb');
    head.append(el('h2', '', f.title), btn('ghost sm', '✖', closePanel, 'Đóng'));
    sh.append(head, b);
    f.render(b, pn);
    if (!first) b.scrollTop = keep;
  }
  function tabs(container, list, cur, onPick) {
    var w = el('div', 'ct-tabs'); list.forEach(function (t) { var b = btn('tab' + (t[0] === cur ? ' on' : ''), t[1], function () { onPick(t[0]); }); w.append(b); }); container.append(w); return w;
  }
  function itemCard(o) {   // thẻ chung trong cửa hàng
    var c = el('button', 'ct-item' + (o.cls ? ' ' + o.cls : '')); c.type = 'button';
    if (o.thumb) c.append(o.thumb); else c.append(el('span', 'ct-ie', o.e || '❔'));
    c.append(el('b', '', o.n)); if (o.sub) c.append(el('small', '', o.sub)); if (o.price) c.append(el('span', 'ct-price' + (o.pt ? ' pt' : ''), o.price));
    if (o.fn) c.addEventListener('click', function () { sfx('click'); o.fn(); });
    return c;
  }
  var thumbs = new Map();
  function thumbOf(id) {
    var d = C.B_BY[id], k = id; var c0 = thumbs.get(k);
    if (!c0) {
      if (d.k === 'field') c0 = A.thumb('field', 'f', {}, 88); else if (d.k === 'road') { var kind = id === 'duong' ? 'road' : id === 'nuoc' ? 'water' : 'path'; c0 = A.thumb(kind, kind, { mask: 5, key: 5 }, 88); }
      else c0 = A.thumb('b', id, { w: d.w, h: d.h, b: { l: 1 }, v: 1, key: '1:1:0', ht: A.height(id, 1) }, 88);
      thumbs.set(k, c0);
    }
    var c = document.createElement('canvas'); c.width = c0.width; c.height = c0.height; c.className = 'ct-thumb'; c.getContext('2d').drawImage(c0, 0, 0); return c;
  }
  var CATS = [['farm', '🌾 Nông trại'], ['fac', '🏭 Nhà máy'], ['house', '🏠 Nhà ở'], ['svc', '🏫 Dịch vụ'], ['deco', '🌷 Trang trí'], ['road', '🛣️ Đường & hồ'], ['lm', '🗼 Kỳ quan'], ['inv', '📥 Kho công trình']];
  PANELS.build = { title: '🏗️ Xây dựng', render: function (b, pn) {
    var s = S.view, L = lv(), cur = pn.tab || 'farm', S2 = C.stats(s, now());
    tabs(b, CATS.filter(function (c) { return c[0] !== 'inv' || s.bi.length; }), cur, function (t) { pn.tab = t; panelRender(true); });
    var grid = el('div', 'ct-grid'); b.append(grid);
    if (cur === 'inv') {
      s.bi.forEach(function (x, i) { var d = C.B_BY[x.t]; grid.append(itemCard({ thumb: thumbOf(x.t), n: d.n, sub: 'Cấp ' + x.l, price: 'Đặt miễn phí', fn: function () { startPlace(x.t, { inv: i }); } })); });
      return;
    }
    var list = C.B.filter(function (d) { if (d.k === 'spec') return false; if (cur === 'farm') return d.k === 'field' || d.k === 'pen' || d.id === 'traigo' || d.id === 'moda'; if (cur === 'fac') return d.k === 'fac' && d.id !== 'traigo' && d.id !== 'moda'; return d.k === cur; });
    list.sort(function (a, c) { return (a.lv > L) - (c.lv > L) || a.lv - c.lv; });
    list.forEach(function (d) {
      var lock = d.lv > L, cnt = C.lmCount(s, d.id), sub = buildSub(d), price = priceText(d), cls = '';
      if (lock) { price = '🔒 Cấp ' + d.lv; cls = 'lock'; }
      else if (d.mx && cnt >= d.mx && d.k !== 'fac' && d.k !== 'pen') { price = '✔ Đã có'; cls = 'own'; }
      else if (d.k === 'field' && S2.fields >= S2.maxFields) { price = 'Tối đa ' + S2.maxFields + ' ô'; cls = 'own'; }
      var pt = !!d.pts || ((d.k === 'fac' || d.k === 'pen') && cnt >= 1);
      grid.append(itemCard({ thumb: thumbOf(d.id), n: d.n, sub: sub, price: price, pt: pt, cls: cls, fn: function () {
        if (lock) { toast(d.n + ' mở ở cấp ' + d.lv + '. Thu hoạch, giao đơn hàng để lên cấp!'); return; }
        if (cls === 'own') { toast(d.mx ? 'Bạn đã có ' + d.n + '.' : 'Đã đủ ô ruộng ở cấp này.'); return; }
        startPlace(d.id);
      } }));
    });
    if (cur === 'lm' || cur === 'deco') b.append(el('p', 'ct-note', '⭐ Kỳ quan và trang trí cao cấp mua bằng điểm học tập – làm bài tập để có thêm điểm!'));
  } };
  function buildSub(d) {
    if (d.k === 'house') return '👥 +' + d.pop + ' dân/cấp';
    if (d.k === 'svc') return '😊 +' + d.hap + '/cấp';
    if (d.k === 'deco') return d.hap ? '😊 +' + d.hap : 'Trang trí';
    if (d.k === 'lm') return lmText(d, 1).replace('Kỳ quan cấp 1: ', '');
    if (d.k === 'pen') return d.prod[2] + ' ' + d.prod[1];
    if (d.k === 'fac') return d.rs.map(function (r) { return r.e; }).join('');
    if (d.k === 'field') return 'Trồng cây';
    if (d.k === 'road') return d.id === 'nuoc' ? 'Tự nối thành hồ' : 'Tự nối, có xe chạy';
    return '';
  }
  PANELS.orders = { title: '🚚 Đơn hàng', render: function (b) {
    var s = S.view, t = now(), D = C.derived(s, t, S.opt), grid = el('div', 'ct-orders');
    b.append(el('p', 'ct-note', 'Giao hàng để nhận 🪙 xu và ✨ XP. Đơn khó quá? Bấm 🗑️ đổi đơn mới (xe tới sau 1 phút).'));
    s.od.forEach(function (o, i) {
      var c = el('div', 'ct-order');
      if (o.w > t) { c.classList.add('wait'); c.append(el('span', 'ct-ie', '🚚'), liveT(el('small'), o.w, 'Xe tới sau ')); grid.append(c); return; }
      var can = true, items = el('div', 'ct-oi');
      Object.keys(o.it).forEach(function (k) { var have = s.inv[k] || 0, ok = have >= o.it[k]; if (!ok) can = false; var x = el('span', 'ct-mat ' + (ok ? 'ok' : 'no')); x.append(el('span', 'e', itemE(k)), el('small', '', have + '/' + o.it[k])); x.title = itemN(k); items.append(x); });
      c.append(items, el('div', 'ct-rew', '🪙 ' + fmt(Math.round(o.xu * D.ordMul)) + ' · ✨ ' + fmt(o.xp)));
      var row = el('div', 'row');
      var gb = btn(can ? 'ok' : 'dim', '✔ Giao', function () { var r = doOps({ op: 'order', i: i }); if (r) { sfx('coin'); toast('🚚 Đã giao! +' + fmt(r.results[0].xu) + ' 🪙 +' + fmt(r.results[0].xp) + ' ✨'); } });
      row.append(gb, btn('ghost sm', '🗑️', function () { doOps({ op: 'discard', i: i }); }, 'Đổi đơn khác'));
      c.append(row); if (can) c.classList.add('can'); grid.append(c);
    });
    b.append(grid);
  } };
  PANELS.storage = { title: '📦 Nhà kho & Chợ', render: function (b, pn) {
    var s = S.view, D = C.derived(s, now(), S.opt);
    var top = el('div', 'ct-cap'); top.append(el('b', '', '📦 ' + fmt(D.used) + ' / ' + fmt(D.cap)), bar(D.used / D.cap));
    top.append(btn('ghost sm', '⬆ Nâng kho', function () { var id = Object.keys(s.b).find(function (k) { return s.b[k].t === 'kho'; }); if (id) { closePanel(); select({ id: id }); openCard(); } }));
    top.append(btn('pt sm', '⭐ Kho rộng', function () { openPanel('points', 'perm'); }));
    b.append(top);
    b.append(el('p', 'ct-note', 'Chạm một món để bán ở Chợ (giá ×' + D.sellMul.toFixed(2) + '). Giữ lại nguyên liệu để làm hàng và giao đơn nhé!'));
    var groups = [['crop', '🌾 Nông sản'], ['ani', '🐔 Chăn nuôi'], ['feed', '🥣 Thức ăn'], ['good', '🎁 Hàng hoá'], ['mat', '🧱 Vật liệu']], any = false;
    groups.forEach(function (gp) {
      var ks = Object.keys(s.inv).filter(function (k) { var it = C.IT_BY[k]; return it && it.k === gp[0] && s.inv[k] > 0; }); if (!ks.length) return; any = true;
      b.append(el('h4', '', gp[1])); var grid = el('div', 'ct-inv');
      ks.forEach(function (k) { var it = C.IT_BY[k], c = itemCard({ e: it.e, n: it.n, sub: '×' + fmt(s.inv[k]), price: fmt(Math.round(it.p * D.sellMul)) + ' 🪙', fn: function () { pn.sel = k; panelRender(); } }); if (pn.sel === k) c.classList.add('on'); grid.append(c); });
      b.append(grid);
      if (pn.sel && ks.indexOf(pn.sel) >= 0) b.append(sellRow(pn.sel, D));
    });
    if (!any) b.append(el('p', 'empty', 'Kho trống. Hãy thu hoạch ruộng và sản phẩm nhé!'));
  } };
  function sellRow(k, D) {
    var s = S.view, it = C.IT_BY[k], max = s.inv[k] || 0, n = Math.max(1, Math.min(max, S._sellN || 1)), w = el('div', 'ct-sell');
    var lab = el('b', '', ''), upd = function () { lab.textContent = 'Bán ' + n + ' ' + it.e + ' = ' + fmt(Math.round(it.p * n * D.sellMul)) + ' 🪙'; };
    w.append(btn('ghost sm', '−', function () { n = Math.max(1, n - 1); S._sellN = n; upd(); }), lab, btn('ghost sm', '+', function () { n = Math.min(max, n + 1); S._sellN = n; upd(); }), btn('ghost sm', 'Tất cả', function () { n = max; S._sellN = n; upd(); }));
    w.append(btn('ok', '🏪 Bán', function () { var r = doOps({ op: 'sell', k: k, n: n }); if (r) { sfx('coin'); S._sellN = 1; toast('+' + fmt(r.results[0].xu) + ' 🪙'); } }));
    upd(); return w;
  }
  PANELS.quests = { title: '🎯 Nhiệm vụ & Thành tích', render: function (b) {
    var s = S.view, D = C.derived(s, now(), S.opt);
    var gift = el('div', 'ct-gift' + (D.dailyReady ? ' on' : ''));
    gift.append(el('span', 'ct-ie', '🎁'), el('div', '', ''));
    gift.lastChild.append(el('b', '', 'Quà ghé thăm mỗi ngày'), el('small', '', 'Bạn đã ghé ' + D.visitDays + ' ngày (cộng dồn, không bao giờ mất). Quà tăng theo số ngày!'));
    gift.append(D.dailyReady ? btn('ok', 'Nhận ' + fmt(D.dailyXu) + ' 🪙', function () { var r = doOps({ op: 'daily' }); if (r) { sfx('buy'); burstAt(W / 2, Hh / 2, '🪙', 14); } }) : el('small', 'muted', '✔ Đã nhận hôm nay'));
    b.append(gift);
    b.append(el('h4', '', '📅 Nhiệm vụ hôm nay (xong cả 3 được thưởng gấp đôi!)'));
    D.quests.forEach(function (q) {
      var c = el('div', 'ct-quest' + (q.claimed ? ' done' : ''));
      var m = el('div', 'm'); m.append(el('b', '', q.text), bar(q.prog / q.target), el('small', '', q.prog + '/' + q.target + ' · thưởng ' + fmt(q.xu) + ' 🪙 ' + fmt(q.xp) + ' ✨'));
      c.append(m);
      c.append(q.claimed ? el('span', 'ct-ok', '✔') : btn(q.done ? 'ok' : 'dim', 'Nhận', function () { if (!q.done) return toast('Chưa xong nhiệm vụ.'); var r = doOps({ op: 'claimQuest', i: q.i }); if (r) { sfx('buy'); if (r.results[0].all) toast('🏆 Xong cả 3 nhiệm vụ – thưởng gấp đôi!'); } }));
      b.append(c);
    });
    b.append(el('h4', '', '🏅 Thành tích'));
    var grid = el('div', 'ct-ach');
    D.ach.forEach(function (a) { var A2 = C.ACH.find(function (x) { return x.id === a.id; }), c = el('div', 'ct-a' + (a.tier ? ' got' : '')); c.append(el('span', 'ct-ie', A2.e), el('b', '', A2.n), el('small', '', A2.d + ': ' + fmt(a.val) + (a.next != null ? ' / ' + fmt(a.next) : ' (tối đa)')), el('span', 'ct-stars', '★'.repeat(a.tier) + '☆'.repeat(Math.max(0, a.max - a.tier)))); grid.append(c); });
    b.append(grid);
  } };
  var PTABS = [['dat', '🗺️ Đất'], ['giong', '💎 Giống quý'], ['help', '🤖 Trợ lý'], ['perm', '⬆️ Vĩnh viễn'], ['boost', '⚡ Bùa x2'], ['xu', '🪙 Đổi xu'], ['veh', '🚗 Xe & thú'], ['theme', '🎨 Chủ đề'], ['fx', '🎆 Hiệu ứng'], ['vip', '🗼 Kỳ quan']];
  PANELS.points = { title: '⭐ Cửa hàng Điểm học tập', render: function (b, pn) {
    var s = S.view, L = lv(), cur = pn.tab || 'dat', bal = Math.max(0, S.bal - pendingSpend()), t = now();
    var hd = el('div', 'ct-pthead'); hd.append(el('b', '', '⭐ ' + fmt(bal) + ' điểm'), el('small', '', 'Điểm có được khi làm bài tập. Học càng chăm, thành phố càng đẹp!'));
    if (S.opt.act) hd.append(el('small', 'muted', 'Mỗi thao tác (gieo/thu 1 ô, thu thuế 1 nhà, làm/thu sản phẩm, cho ăn, giao đơn, bán, xây, nâng cấp, dọn) tốn ' + S.opt.act + ' ⭐.'));
    if (S.opt.cap) { var D = C.derived(s, t, S.opt); hd.append(el('small', 'muted', 'Hôm nay đã chi ' + D.spend.today + '/' + S.opt.cap + ' điểm (giới hạn của giáo viên).')); }
    b.append(hd);
    tabs(b, PTABS, cur, function (k) { pn.tab = k; panelRender(true); });
    var grid = el('div', 'ct-grid'); b.append(grid);
    var buy = function (op, msg) { var r = doOps(op); if (r) { sfx('buy'); burstAt(W / 2, Hh / 3, '⭐', 10); if (msg) toast(msg); } return r; };
    if (cur === 'dat') {
      b.insertBefore(el('p', 'ct-note', 'Mảnh đất tiếp theo: ' + fmt(P(C.chunkCost(s))) + ' ⭐ (8×8 ô). Đóng bảng này và chạm vào biển vàng 🔓 cạnh đất của bạn để mua. Đất mở rộng vô tận!'), grid);
      grid.append(itemCard({ e: '🗺️', n: 'Xem bản đồ', sub: 'Thu nhỏ để thấy biển 🔓', price: 'Đi tới', fn: function () { closePanel(); setZoom(0.55); } }));
      grid.append(itemCard({ e: '⚡', n: 'Tăng tốc', sub: '1 ⭐ cho mỗi 10 phút chờ', price: 'Trong thẻ công trình', fn: function () { toast('Chạm vào ruộng/nhà máy/chuồng đang chờ rồi bấm ⚡ Xong ngay.'); } }));
      grid.append(itemCard({ e: '🏭', n: 'Nhà máy thứ 2, 3', sub: 'Làm nhiều hàng cùng lúc', price: 'Trong 🏗️ Xây dựng', fn: function () { openPanel('build', 'fac'); } }));
      grid.append(itemCard({ e: '🍄', n: 'Nhà cao cấp', sub: 'Nhà nấm, nhà trên cây, lâu đài', price: 'Trong 🏗️ Nhà ở', fn: function () { openPanel('build', 'house'); } }));
    }
    if (cur === 'giong') C.CROPS.filter(function (c) { return c.rare; }).forEach(function (c) { var own = s.rc.indexOf(c.id) >= 0, lock = c.lv > L; grid.append(itemCard({ e: c.e, n: c.n, sub: 'Bán ' + c.p + ' 🪙 · ' + fmtT(c.t * 1000), price: own ? '✔ Đã có' : lock ? '🔒 Cấp ' + c.lv : fmt(P(c.rare)) + ' ⭐', pt: !own, cls: own ? 'own' : lock ? 'lock' : '', fn: function () { if (own || lock) return; confirmBox(c.e + ' ' + c.n, 'Mở khoá vĩnh viễn giống ' + c.n + ' (bán được ' + c.p + ' 🪙 mỗi trái)?', 'Mua ' + fmt(P(c.rare)) + ' ⭐', function () { buy({ op: 'rare', k: c.id }, 'Đã có giống ' + c.n + '! Chạm ruộng trống để gieo.'); }); } })); });
    if (cur === 'help') C.HELPERS.forEach(function (h) { var own = !!s.hp[h.id], lock = h.lv > L; grid.append(itemCard({ e: h.e, n: h.n, sub: h.d, price: own ? '✔ Đã thuê' : lock ? '🔒 Cấp ' + h.lv : fmt(P(h.pts)) + ' ⭐', pt: !own, cls: (own ? 'own' : lock ? 'lock' : '') + ' wide', fn: function () { if (own || lock) return; confirmBox(h.e + ' ' + h.n, h.d, 'Thuê ' + fmt(P(h.pts)) + ' ⭐', function () { buy({ op: 'helper', k: h.id }, h.e + ' ' + h.n + ' đã sẵn sàng! Xem nút ở phía dưới màn hình.'); }); } })); });
    if (cur === 'perm') C.PERMS.forEach(function (p) { var l = C.permLv(s, p.id), mx = p.max && l >= p.max, cost = P(C.permCost(p.id, l)); grid.append(itemCard({ e: p.e, n: p.n + ' · cấp ' + l, sub: p.d, price: mx ? '✔ Tối đa' : fmt(cost) + ' ⭐', pt: !mx, cls: (mx ? 'own' : '') + ' wide', fn: function () { if (!mx) buy({ op: 'perm', k: p.id }, p.e + ' ' + p.n + ' lên cấp ' + (l + 1) + '!'); } })); });
    if (cur === 'boost') C.BOOSTS.forEach(function (bo) { var w = s.bo[bo.id], on = w && w[1] > t; var c = itemCard({ e: bo.e, n: bo.n, sub: bo.d + (on ? ' · còn ' + fmtT(w[1] - t) : ''), price: fmt(P(bo.pts)) + ' ⭐ / giờ', pt: true, cls: 'wide' + (on ? ' active' : '') }); var row = el('div', 'row'); [1, 3, 8].forEach(function (h) { row.append(btn('pt sm', '+' + h + 'g · ' + fmt(P(bo.pts * h)) + '⭐', function () { buy({ op: 'boost', k: bo.id, h: h }, bo.e + ' ' + bo.n + ' đang bật!'); })); }); c.append(row); grid.append(c); });
    if (cur === 'xu') C.EXCHANGE.forEach(function (n) { var xu = n * C.exRate(L); grid.append(itemCard({ e: n >= 500 ? '💰' : n >= 100 ? '💵' : '🪙', n: fmt(xu) + ' 🪙', sub: 'Đổi ' + fmt(P(n)) + ' ⭐ (tỉ giá tăng theo cấp)', price: fmt(P(n)) + ' ⭐', pt: true, fn: function () { confirmBox('🪙 Đổi xu', 'Đổi ' + fmt(P(n)) + ' ⭐ lấy ' + fmt(xu) + ' 🪙?', 'Đổi', function () { var r = buy({ op: 'exchange', n: n }); if (r) flyTo(W / 2, Hh / 2, '💰', '.ct-p-xu'); }); } })); });
    if (cur === 'veh') C.VEHICLES.forEach(function (v) { var n = (s.vh && s.vh[v.id]) || 0, mx = n >= C.VEH_MAX; grid.append(itemCard({ e: v.e, n: v.n, sub: (v.k === 'air' ? 'Bay trên trời' : v.k === 'walk' ? 'Dạo quanh phố' : 'Chạy trên đường nhựa') + ' · có ' + n, price: mx ? '✔ Tối đa' : fmt(P(v.pts)) + ' ⭐', pt: !mx, cls: mx ? 'own' : '', fn: function () { if (!mx) buy({ op: 'vehicle', k: v.id }, v.e + ' ' + v.n + ' đã tới thành phố!'); } })); });
    if (cur === 'theme') C.GROUNDS.forEach(function (gd) { var own = s.th.go.indexOf(gd.id) >= 0, on = (s.th.g || '') === gd.id; var sw = el('span', 'ct-sw'); sw.style.background = 'linear-gradient(135deg,' + gd.c[0] + ',' + gd.c[2] + ')'; var c = itemCard({ e: '', n: gd.n, sub: on ? 'Đang dùng' : own ? 'Đã có – chạm để dùng' : '', price: own ? (on ? '✔' : 'Dùng') : fmt(P(gd.pts)) + ' ⭐', pt: !own, cls: on ? 'active' : '', fn: function () { if (on) return; buy({ op: 'theme', k: gd.id }); } }); c.querySelector('.ct-ie').replaceWith(sw); grid.append(c); });
    if (cur === 'fx') C.EFFECTS.forEach(function (f) { var own = s.th.fo.indexOf(f.id) >= 0, on = s.th.fx.indexOf(f.id) >= 0; grid.append(itemCard({ e: f.e, n: f.n, sub: own ? (on ? 'Đang bật – chạm để tắt' : 'Đang tắt – chạm để bật') : '', price: own ? (on ? 'BẬT' : 'TẮT') : fmt(P(f.pts)) + ' ⭐', pt: !own, cls: on ? 'active' : '', fn: function () { buy({ op: 'effect', k: f.id }); } })); });
    if (cur === 'vip') { grid.append(itemCard({ e: '🗼', n: 'Kỳ quan thế giới', sub: '12 kỳ quan, nâng cấp vô hạn, thưởng mạnh', price: 'Xem', pt: true, fn: function () { openPanel('build', 'lm'); } })); grid.append(itemCard({ e: '🎡', n: 'Trang trí cao cấp', sub: 'Vòng quay, đu quay, cầu vồng…', price: 'Xem', pt: true, fn: function () { openPanel('build', 'deco'); } })); }
  } };
  PANELS.friends = { title: '🏆 Thành phố các bạn', render: function (b, pn) {
    if (!pn.data) { b.append(el('p', 'empty', 'Đang tải…')); if (!pn.loading) { pn.loading = 1; H.api('cityBoard', {}).then(function (r) { if (S && S.panel === pn) { pn.data = r; panelRender(true); } }).catch(function (e) { toast(e.message || 'Lỗi tải', 1); }); } return; }
    var r = pn.data, ol = el('ol', 'ct-board');
    b.append(el('p', 'ct-note', 'Xếp theo dân số. Bấm 👀 để tham quan và thả ❤️ cho thành phố đẹp!'));
    r.board.forEach(function (x) {
      var li = el('li', x.me ? 'me' : ''); li.append(el('span', 'rk', x.rank <= 3 ? ['🥇', '🥈', '🥉'][x.rank - 1] : '#' + x.rank));
      var m = el('span', 'm'); m.append(el('b', '', x.name || ('Thành phố ' + x.who)), el('small', '', x.who + ' · ' + x.title + ' · cấp ' + x.lv + ' · ❤️ ' + x.likes)); li.append(m, el('span', 'pop', '👥 ' + fmt(x.pop)));
      if (!x.me) li.append(btn('ghost sm', '👀', function () { visit(x.who); }, 'Tham quan')); ol.append(li);
    });
    b.append(ol);
    if (r.me && r.me.rank > r.board.length) b.append(el('p', 'ct-note', 'Bạn đang hạng ' + r.me.rank + '/' + r.total + '.'));
  } };
  PANELS.settings = { title: '⚙️ Cài đặt', render: function (b) {
    var s = S.view, f = el('div', 'ct-form');
    var nm = el('input'); nm.maxLength = 24; nm.value = s.nm || ''; nm.placeholder = 'Đặt tên thành phố';
    f.append(el('label', '', 'Tên thành phố'), el('div', 'row'));
    f.lastChild.append(nm, btn('ok sm', 'Lưu', function () { doOps({ op: 'rename', name: nm.value }); toast('Đã đổi tên!'); }));
    f.append(el('label', '', 'Ngày & đêm'));
    var r1 = el('div', 'row'); [[1, '🕒 Theo giờ thật'], [0, '☀️ Luôn ngày'], [2, '🌙 Luôn đêm']].forEach(function (o) { r1.append(btn('tab' + ((s.night == null ? 1 : s.night) === o[0] ? ' on' : ''), o[1], function () { doOps({ op: 'night', v: o[0] }); })); }); f.append(r1);
    f.append(el('label', '', 'Chất lượng đồ hoạ'));
    var r2 = el('div', 'row'); [['auto', 'Tự động'], ['high', 'Cao'], ['mid', 'Vừa'], ['low', 'Tiết kiệm pin']].forEach(function (o) { r2.append(btn('tab' + (S.quality === o[0] ? ' on' : ''), o[1], function () { S.quality = o[0]; LS.set('sm_city_q', o[0]); resize(); panelRender(); })); }); f.append(r2);
    f.append(el('label', '', 'Âm thanh'));
    var r3 = el('div', 'row'), m = LS.get('sm_city_snd') === '0'; r3.append(btn('tab' + (!m ? ' on' : ''), '🔊 Bật', function () { LS.set('sm_city_snd', '1'); panelRender(); }), btn('tab' + (m ? ' on' : ''), '🔇 Tắt', function () { LS.set('sm_city_snd', '0'); panelRender(); })); f.append(r3);
    f.append(btn('ghost', '📖 Xem lại hướng dẫn', function () { LS.set('sm_city_tut', '0'); closePanel(); tutorialShow(); }));
    b.append(f);
    var help = el('div', 'ct-help-txt');
    [['👆', 'Chạm: thu hoạch, thu thuế, thu sản phẩm, mở thông tin.'], ['✋', 'Kéo: di chuyển bản đồ. Hai ngón / con lăn: phóng to – thu nhỏ.'], ['🌾', 'Chọn hạt rồi KÉO ngón tay qua nhiều ruộng để gieo/thu hoạch nhanh.'], ['✥', 'Giữ lâu một công trình để di chuyển nó.'], ['📥', 'Cất công trình vào kho: không mất gì, đặt lại miễn phí với nguyên cấp.'], ['⭐', 'Điểm học tập dùng cho đất mới, kỳ quan, trang trí cao cấp, trợ lý, tăng tốc… và mỗi thao tác chơi (gieo/thu 1 ô, thu thuế 1 nhà, làm/thu sản phẩm, giao đơn, bán, xây, nâng cấp…) tốn ' + (S.opt.act || 0) + ' ⭐. Không có gì bị mất hay reset.'], ['👪', 'Game này không tính vào báo cáo cho phụ huynh.']].forEach(function (x) { var p = el('p'); p.append(el('span', 'e', x[0]), document.createTextNode(' ' + x[1])); help.append(p); });
    b.append(help);
  } };

  /* ---------------- Tham quan thành phố bạn ---------------- */
  function visit(who) {
    H.api('cityVisit', { who: who }).then(function (r) {
      if (!S) return; closePanel(); select(null); setTool(null); S.place = null; placeBar();
      var vs = r.state; vs.o = vs.o || {}; vs.inv = {}; vs.od = []; vs.hp = {}; vs.bo = {}; vs.q = { d: 0, p: {}, c: [] };
      S.visit = { who: r.who, state: vs, derived: r.derived, liked: r.liked };
      S._cam = Object.assign({}, S.cam); S.dirtyList = true; centerOn(8, 8); visitBar(); hud(); tutorialShow();
    }).catch(function (e) { toast(e.message || 'Không mở được.', 1); });
  }
  function visitBar() {
    var v = $('.ct-visit', R); if (!S.visit) { v.hidden = true; $('.ct-tb', R).hidden = false; return; }
    v.hidden = false; $('.ct-tb', R).hidden = true; v.replaceChildren();
    v.append(el('span', '', '👀 Đang thăm ' + (S.visit.state.nm || S.visit.who) + ' · ❤️ ' + (S.visit.derived.likes || 0)));
    var lk = btn(S.visit.liked ? 'ghost' : 'pt', S.visit.liked ? '❤️ Đã thả tim' : '🤍 Thả tim', function () { if (S.visit.liked) return; H.api('cityLike', { who: S.visit.who }).then(function (r) { S.visit.liked = true; S.visit.derived.likes = r.likes; sfx('buy'); burstAt(W / 2, Hh / 2, '❤️', 12); visitBar(); }).catch(function (e) { toast(e.message, 1); }); });
    v.append(lk, btn('ok', '🏠 Về nhà', function () { S.visit = null; if (S._cam) S.cam = S._cam; S.dirtyList = true; S.roadsKey = ''; visitBar(); hud(); tutorialShow(); }));
  }

  /* ---------------- Hộp xác nhận, thông báo, lên cấp ---------------- */
  function toast(m, err) { if (H && H.toast) H.toast(m, err); }
  function confirmBox(title, msg, ok, fn) {
    var ov = el('div', 'ct-modal'), box = el('div', 'ct-mbox');
    box.append(el('h3', '', title)); msg.split('\n').forEach(function (l) { box.append(el('p', '', l)); });
    var row = el('div', 'row end'); row.append(btn('ghost', 'Thôi', function () { ov.remove(); }), btn('pt', ok, function () { ov.remove(); fn(); }));
    box.append(row); ov.append(box); ov.addEventListener('click', function (e) { if (e.target === ov) ov.remove(); }); R.append(ov);
    setTimeout(function () { var b = row.lastChild; if (b) b.focus(); }, 30);
  }
  function levelUp(L) {
    sfx('level');
    var ov = el('div', 'ct-modal lvup'), box = el('div', 'ct-mbox');
    box.append(el('div', 'ct-lvbig', '🎉'), el('h3', '', 'Lên cấp ' + L + '!'), el('p', '', '+' + fmt(15 + 10 * L) + ' 🪙 phần thưởng'));
    var un = C.B.filter(function (d) { return d.lv === L && d.k !== 'spec'; }).map(function (d) { return d.e + ' ' + d.n; })
      .concat(C.CROPS.filter(function (c) { return c.lv === L && !c.rare; }).map(function (c) { return c.e + ' ' + c.n; }));
    C.B.forEach(function (d) { if (d.k === 'fac') d.rs.forEach(function (r) { if (r.lv === L && r.lv !== d.lv) un.push(r.e + ' ' + r.n); }); });
    if (un.length) { box.append(el('p', 'muted', 'Mở khoá mới:')); var w = el('div', 'ct-unlock'); un.forEach(function (u) { w.append(el('span', '', u)); }); box.append(w); }
    box.append(btn('ok', 'Tuyệt vời!', function () { ov.remove(); }));
    ov.append(box); R.append(ov);
    for (var i = 0; i < 40; i++) S.parts.push({ x: W / 2, y: Hh / 2, vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 12 - 3, life: 1.6, e: ['🎉', '⭐', '✨', '🎊'][i % 4], sz: 16 + Math.random() * 10 });
  }

  /* ---------------- Hướng dẫn chơi lần đầu ---------------- */
  var TUT = [
    ['🌾', 'Chào Thị trưởng! Chạm vào ruộng lúa vàng để thu hoạch. Kéo ngón tay qua nhiều ruộng để thu nhanh hơn.', 'hv'],
    ['🌱', 'Chạm ruộng trống rồi chọn 🌾 để gieo. Giữ và kéo từ hạt giống qua các ruộng để gieo một lượt!', 'pl'],
    ['🚚', 'Mở 🚚 Đơn hàng ở dưới cùng và giao hàng để nhận xu 🪙 và kinh nghiệm ✨.', 'od'],
    ['🪙', 'Nhà có bong bóng 🪙 là có thuế. Chạm để thu thuế!', 'tx'],
    ['🏗️', 'Mở 🏗️ Xây dựng để xây thêm nhà, nhà máy, trang trí. Nhà càng nhiều, dân càng đông!', 'bu'],
    ['⭐', 'Điểm làm bài tập ⭐ dùng để mua đất mới (biển vàng 🔓), kỳ quan, trợ lý, tăng tốc và nhiều thứ thú vị. Mỗi thao tác chơi (gieo, thu hoạch, giao hàng, thu thuế…) cũng tốn vài ⭐. Học chăm để thành phố lớn mạnh! Không có gì bị mất hay reset.', null]
  ];
  function tutStep() { return Math.max(0, Number(LS.get('sm_city_tut') || 0) || 0); }
  function tutorialShow() {
    var box = $('.ct-tut', R), i = tutStep(); if (i >= TUT.length || S.visit) { box.hidden = true; return; }
    box.hidden = false; box.replaceChildren();
    box.append(el('span', 'ct-tut-e', TUT[i][0]), el('p', '', TUT[i][1]));
    var row = el('div', 'row'); row.append(btn('ghost sm', TUT[i][2] ? 'Bỏ qua' : 'Bắt đầu chơi!', function () { LS.set('sm_city_tut', String(TUT[i][2] ? i + 1 : 99)); tutorialShow(); })); box.append(row);
    box.append(el('small', 'muted', (i + 1) + '/' + TUT.length));
  }
  function tutorialCheck(r) {
    var i = tutStep(); if (i >= TUT.length) return; var need = TUT[i][2]; if (!need) return;
    var map = { hv: 'harvest', pl: 'plant', od: 'order', tx: 'tax', bu: 'place' };
    if ((r.results || []).some(function (x) { return x.op === map[need]; })) { LS.set('sm_city_tut', String(i + 1)); setTimeout(tutorialShow, 400); }
  }

  /* ---------------- Dựng giao diện ---------------- */
  function buildDom(root) {
    root.replaceChildren();
    var w = el('div', 'ct-root'); R = w;
    w.innerHTML =
      '<div class="ct-stage"><canvas class="ct-cv" aria-label="Bản đồ nông trại và thành phố"></canvas></div>' +
      '<div class="ct-top">' +
      '  <div class="ct-id"><div class="ct-lv" title="Cấp"><b>1</b></div><div><div class="ct-name"></div><div class="ct-rank"></div></div><span class="ct-sync" data-s="idle"></span></div>' +
      '  <div class="ct-pills"><span class="ct-pill ct-p-xu" title="Xu trong game">🪙 <b>0</b></span><span class="ct-pill ct-p-pt" title="Điểm học tập">⭐ <b>0</b></span>' +
      '  <span class="ct-pill ct-p-hap" title="Thưởng thuế từ hạnh phúc, kỳ quan, nâng cấp">😊 <b>0</b></span><span class="ct-pill ct-p-kho" title="Nhà kho">📦 <b>0</b></span></div>' +
      '</div>' +
      '<div class="ct-side"></div>' +
      '<div class="ct-help"></div>' +
      '<div class="ct-tool" hidden></div>' +
      '<div class="ct-pop" hidden></div>' +
      '<div class="ct-tut" hidden></div>' +
      '<div class="ct-card" hidden></div>' +
      '<div class="ct-place" hidden></div>' +
      '<div class="ct-visit" hidden></div>' +
      '<nav class="ct-tb" aria-label="Menu thành phố"></nav>' +
      '<div class="ct-sheet" hidden></div>';
    root.append(w);
    var side = $('.ct-side', w);
    side.append(btn('round', '＋', function () { setZoom(S.cam.z * 1.2); }, 'Phóng to'), btn('round', '－', function () { setZoom(S.cam.z / 1.2); }, 'Thu nhỏ'),
      btn('round', '⌂', function () { centerOn(8, 8); }, 'Về trung tâm'), btn('round ct-fs', '⛶', function () { w.classList.toggle('full'); document.body.classList.toggle('ct-lock', w.classList.contains('full')); setTimeout(resize, 50); }, 'Toàn màn hình'));
    var tb = $('.ct-tb', w);
    [['ct-tb-build', '🏗️', 'Xây dựng', function () { openPanel('build'); }], ['ct-tb-od', '🚚', 'Đơn hàng', function () { openPanel('orders'); }], ['ct-tb-kho', '📦', 'Kho', function () { openPanel('storage'); }],
      ['ct-tb-q', '🎯', 'Nhiệm vụ', function () { openPanel('quests'); }], ['ct-tb-pt', '⭐', 'Điểm', function () { openPanel('points'); }], ['ct-tb-fr', '🏆', 'Bạn bè', function () { openPanel('friends'); }], ['ct-tb-set', '⚙️', 'Cài đặt', function () { openPanel('settings'); }]
    ].forEach(function (x) { var b = btn('tbb ' + x[0], '', x[3], x[2]); b.append(el('span', 'i', x[1]), el('small', '', x[2]), el('span', 'ct-badge')); b.querySelector('.ct-badge').hidden = true; tb.append(b); });
    $('.ct-p-pt', w).addEventListener('click', function () { sfx('click'); openPanel('points'); });
    $('.ct-p-kho', w).addEventListener('click', function () { sfx('click'); openPanel('storage'); });
    $('.ct-p-hap', w).addEventListener('click', function () { var D = C.derived(S.view, now(), S.opt); toast('😊 Hạnh phúc ' + fmt(D.hap) + ' · tổng thưởng thuế +' + fmt(D.taxPct) + '%. Xây dịch vụ, trang trí, kỳ quan để tăng!'); });
    cv = $('.ct-cv', w); g = cv.getContext('2d');
  }

  /* ---------------- Mount / unmount ---------------- */
  var ro = null, tick = 0;
  function mount(root, ctx) {
    unmount();
    H = ctx; S = fresh(); S.bal = ctx.getBalance ? ctx.getBalance() : 0;
    buildDom(root);
    root.querySelector('.ct-root').classList.add('loading');
    var load = el('div', 'ct-loading'); load.append(el('div', 'ct-spin', '🏙️'), el('p', '', 'Đang mở thành phố…')); R.append(load);
    bindInput();
    ro = new ResizeObserver(function () { resize(); }); ro.observe(cv.parentNode);
    window.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onVis);
    resize();
    return refresh().then(function () {
      if (!S) return;
      load.remove(); R.classList.remove('loading');
      var cam = null; try { cam = JSON.parse(LS.get('sm_city_cam') || 'null'); } catch (e) {}
      if (cam && isFinite(cam.x) && isFinite(cam.z)) S.cam = cam; else { centerOn(6, 6); S.cam.z = W / DPR < 600 ? 0.8 : 1.1; }
      clampCam(); pickBucket(true);
      lastLv = lv(); hud(); tutorialShow();
      S.raf = requestAnimationFrame(loop);
      tick = setInterval(function () {
        if (!S || !R) return; hud();
        var exp = false, tn = now();
        R.querySelectorAll('[data-until]').forEach(function (e) { var l = +e.dataset.until - tn; if (l <= 0) { if (!e.dataset.x) { e.dataset.x = 1; exp = true; } } else e.textContent = e.dataset.pre + fmtT(l) + e.dataset.post; });
        if (exp) { if (S.card) cardRender(); if (S.panel) panelRender(); }
        else if (S.card && S.sel && S.sel.id) { var sig = cardSig(); if (sig !== S._cardSig) cardRender(); }
      }, 1000);
    }).catch(function (e) {
      if (!S) return;
      load.replaceChildren(el('div', 'ct-spin', '😢'), el('p', '', (e && e.message) || 'Không tải được thành phố.'), btn('ok', 'Thử lại', function () { mount(root, ctx); }));
    });
  }
  function onVis() { if (!S) return; if (document.hidden) flush(0); else if (S.view && !S.queue.length && !S.flight) refresh().catch(function () {}); }
  function unmount() {
    if (!S) return;
    try { flush(0); send(); } catch (e) {}
    cancelAnimationFrame(S.raf); clearInterval(tick); clearTimeout(flushT);
    if (ro) { ro.disconnect(); ro = null; }
    window.removeEventListener('keydown', onKey); document.removeEventListener('visibilitychange', onVis);
    document.body.classList.remove('ct-lock');
    S = null; R = null; cv = null; g = null; chunkCache.clear();
  }

  window.SMCity = { mount: mount, unmount: unmount, version: C.VER,
    // hỗ trợ kiểm thử tự động: toạ độ (CSS px, so với trang) của tâm một ô
    debug: { state: function () { return S && S.view; }, pick: function (cx, cy) { var r = cv.getBoundingClientRect(), it = pickAt((cx - r.left) * DPR, (cy - r.top) * DPR); return it && (it.b ? it.b.t + '@' + it.x + ',' + it.y : JSON.stringify(it)); }, tileToClient: function (x, y) { var q = iso(x + 0.5, y + 0.5), p = toScreen(q[0], q[1]), r = cv.getBoundingClientRect(); return [r.left + p[0] / DPR, r.top + p[1] / DPR]; } } };
})();

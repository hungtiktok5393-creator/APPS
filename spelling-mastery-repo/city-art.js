/* =====================================================================
 * city-art.js – ĐỒ HOẠ "Nông trại & Thành phố" (vẽ hoàn toàn bằng canvas, không cần ảnh)
 * Phối cảnh đẳng cự 2:1 (ô 64×32 ở zoom 1). Mỗi công trình được vẽ thành sprite (có bộ nhớ đệm theo tỉ lệ),
 * các phần chuyển động (cối xay, vòng quay, nước, khói, xe cộ, con vật...) vẽ trực tiếp mỗi khung hình.
 * window.CityArt = { TW, TH, sprite(kind, id, opts, scale), thumb(id, px), ground(...), anim..., ... }
 * ===================================================================== */
(function () {
  'use strict';
  var TW = 64, TH = 32, HW = 32, HH = 16, SQ2 = Math.SQRT2;

  /* ---------------- Màu ---------------- */
  function hex2rgb(h) { h = h.replace('#', ''); if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; var n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function rgb2hex(r) { return '#' + r.map(function (v) { v = Math.max(0, Math.min(255, Math.round(v))); return (v < 16 ? '0' : '') + v.toString(16); }).join(''); }
  function shade(h, a) {   // a > 0 sáng hơn, a < 0 tối hơn (−1..1)
    var c = hex2rgb(h); return rgb2hex(c.map(function (v) { return a >= 0 ? v + (255 - v) * a : v * (1 + a); }));
  }
  function mix(a, b, t) { var x = hex2rgb(a), y = hex2rgb(b); return rgb2hex(x.map(function (v, i) { return v + (y[i] - v) * t; })); }
  function rgba(h, a) { var c = hex2rgb(h); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  function hsh(s) { var h = 2166136261; s = String(s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
  function rnd(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function pick(arr, h) { return arr[h % arr.length]; }

  /* ---------------- Bút vẽ đẳng cự ----------------
   * Toạ độ (u, v, z): u, v theo ô (gốc = đỉnh trên của nền công trình), z theo pixel gốc (zoom 1).
   */
  function Pen(g, s, night) { this.g = g; this.s = s; this.hw = HW * s; this.hh = HH * s; this.night = !!night; }
  var PP = Pen.prototype;
  PP.p = function (u, v, z) { return [(u - v) * this.hw, (u + v) * this.hh - (z || 0) * this.s]; };
  PP.path = function (pts) { var g = this.g; g.beginPath(); for (var i = 0; i < pts.length; i++) { var q = this.p(pts[i][0], pts[i][1], pts[i][2]); if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); } g.closePath(); };
  PP.poly = function (pts, fill, stroke, lw) { this.path(pts); var g = this.g; if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = (lw || 1) * this.s; g.lineJoin = 'round'; g.stroke(); } };
  PP.grad = function (a, b, c0, c1) { var p0 = this.p(a[0], a[1], a[2]), p1 = this.p(b[0], b[1], b[2]), gr = this.g.createLinearGradient(p0[0], p0[1], p1[0], p1[1]); gr.addColorStop(0, c0); gr.addColorStop(1, c1); return gr; };
  PP.line = function (a, b, col, lw) { var g = this.g, p0 = this.p(a[0], a[1], a[2]), p1 = this.p(b[0], b[1], b[2]); g.beginPath(); g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]); g.strokeStyle = col; g.lineWidth = (lw || 1) * this.s; g.lineCap = 'round'; g.stroke(); };
  PP.diamond = function (u0, v0, u1, v1, z, fill, stroke) { this.poly([[u0, v0, z], [u1, v0, z], [u1, v1, z], [u0, v1, z]], fill, stroke); };
  PP.shadow = function (u0, v0, u1, v1, len) {   // bóng đổ về phía phải-dưới
    len = len == null ? 0.35 : len;
    this.poly([[u0, v1, 0], [u1, v1, 0], [u1, v0, 0], [u1 + len, v0 + len * 0.3, 0], [u1 + len, v1 + len, 0], [u0 + len * 0.3, v1 + len, 0]], 'rgba(30,40,20,.22)');
  };
  /** Hộp: mặt trên + mặt trước-trái (v = v1) + mặt trước-phải (u = u1). o: {top:false, edge:true, grad:true, l, r, t (màu riêng)} */
  PP.box = function (u0, v0, u1, v1, z0, z1, col, o) {
    o = o || {};
    var L = o.l || shade(col, -0.06), R = o.r || shade(col, -0.24), T = o.t || shade(col, 0.14);
    if (o.grad !== false) {
      if (typeof L === 'string') L = this.grad([u0, v1, z1], [u0, v1, z0], shade(L, 0.08), shade(L, -0.06));
      if (typeof R === 'string') R = this.grad([u1, v1, z1], [u1, v1, z0], shade(R, 0.06), shade(R, -0.1));
    }
    this.poly([[u0, v1, z0], [u1, v1, z0], [u1, v1, z1], [u0, v1, z1]], L);
    this.poly([[u1, v1, z0], [u1, v0, z0], [u1, v0, z1], [u1, v1, z1]], R);
    if (o.top !== false) this.poly([[u0, v0, z1], [u1, v0, z1], [u1, v1, z1], [u0, v1, z1]], T);
    if (o.edge !== false) {
      this.line([u0, v1, z1], [u1, v1, z1], rgba('#ffffff', 0.35), 0.8); this.line([u1, v1, z1], [u1, v0, z1], rgba('#ffffff', 0.22), 0.8);
      this.line([u1, v1, z0], [u1, v1, z1], rgba('#000000', 0.12), 0.8);
    }
    if (o.ao !== false && z0 === 0) {   // tối nhẹ chân tường
      this.poly([[u0, v1, 0], [u1, v1, 0], [u1, v1, Math.min(4, z1)], [u0, v1, Math.min(4, z1)]], 'rgba(0,0,0,.08)');
      this.poly([[u1, v1, 0], [u1, v0, 0], [u1, v0, Math.min(4, z1)], [u1, v1, Math.min(4, z1)]], 'rgba(0,0,0,.08)');
    }
  };
  /** Mái hai mái. axis 'u' = nóc chạy theo trục u (đầu hồi ở mặt phải), 'v' = nóc theo trục v (đầu hồi ở mặt trái) */
  PP.gable = function (u0, v0, u1, v1, z, h, col, axis, wall) {
    var ov = 0.08; u0 -= ov; v0 -= ov; u1 += ov; v1 += ov;
    var dk = shade(col, -0.22), lt = shade(col, 0.1), wl = wall || '#e9dcc4';
    if (axis === 'v') {
      var um = (u0 + u1) / 2;
      this.poly([[u0, v0, z], [u0, v1, z], [um, v1, z + h], [um, v0, z + h]], lt);
      this.poly([[u0 + ov, v1 - ov, z], [u1 - ov, v1 - ov, z], [um, v1 - ov, z + h]], shade(wl, -0.06));
      this.poly([[u1, v0, z], [u1, v1, z], [um, v1, z + h], [um, v0, z + h]], this.grad([um, v1, z + h], [u1, v1, z], shade(dk, 0.05), shade(dk, -0.08)));
      this.line([um, v0, z + h], [um, v1, z + h], shade(col, 0.3), 1.2);
      this.line([u0, v1, z], [um, v1, z + h], shade(col, -0.35), 0.8); this.line([um, v1, z + h], [u1, v1, z], shade(col, -0.35), 0.8);
    } else {
      var vm = (v0 + v1) / 2;
      this.poly([[u0, v0, z], [u1, v0, z], [u1, vm, z + h], [u0, vm, z + h]], lt);
      this.poly([[u1 - ov, v0 + ov, z], [u1 - ov, v1 - ov, z], [u1 - ov, vm, z + h]], shade(wl, -0.2));
      this.poly([[u0, v1, z], [u1, v1, z], [u1, vm, z + h], [u0, vm, z + h]], this.grad([u0, vm, z + h], [u0, v1, z], shade(col, 0.06), shade(col, -0.08)));
      this.line([u0, vm, z + h], [u1, vm, z + h], shade(col, 0.3), 1.2);
      this.line([u1, v1, z], [u1, vm, z + h], shade(col, -0.35), 0.8);
    }
  };
  /** Mái chóp / mái hông. top = độ thu của nóc (0 = chóp nhọn) */
  PP.hip = function (u0, v0, u1, v1, z, h, col, top) {
    var ov = 0.08; u0 -= ov; v0 -= ov; u1 += ov; v1 += ov;
    var t = top == null ? 0 : top, um = (u0 + u1) / 2, vm = (v0 + v1) / 2, du = (u1 - u0) * t / 2, dv = (v1 - v0) * t / 2;
    var a = [um - du, vm - dv, z + h], b = [um + du, vm - dv, z + h], c = [um + du, vm + dv, z + h], d = [um - du, vm + dv, z + h];
    this.poly([[u0, v0, z], [u1, v0, z], b, a], shade(col, 0.16));
    this.poly([[u0, v0, z], [u0, v1, z], d, a], shade(col, 0.08));
    this.poly([[u0, v1, z], [u1, v1, z], c, d], this.grad(d, [u0, v1, z], shade(col, 0.04), shade(col, -0.1)));
    this.poly([[u1, v1, z], [u1, v0, z], b, c], this.grad(c, [u1, v1, z], shade(col, -0.2), shade(col, -0.3)));
    if (t > 0) this.poly([a, b, c, d], shade(col, 0.2));
    this.line([u0, v1, z], [u1, v1, z], shade(col, -0.4), 0.8); this.line([u1, v1, z], [u1, v0, z], shade(col, -0.45), 0.8);
  };
  /** Cửa sổ trên mặt trái (v = v): ô từ u0..u1, z0..z1 */
  PP.winL = function (v, u0, u1, z0, z1, o) { this.win(true, v, u0, u1, z0, z1, o); };
  PP.winR = function (u, v0, v1, z0, z1, o) { this.win(false, u, v0, v1, z0, z1, o); };
  PP.win = function (left, f, a0, a1, z0, z1, o) {
    o = o || {};
    var fr = o.frame || '#ffffff', lit = this.night && (o.lit == null ? true : o.lit);
    var pt = left ? function (a, z) { return [a, f, z]; } : function (a, z) { return [f, a, z]; };
    var glass = lit ? this.grad(pt(a0, z1), pt(a0, z0), '#fff3b0', '#ffc94d') : this.grad(pt(a0, z1), pt(a1, z0), o.glass || '#bfe6ff', shade(o.glass || '#bfe6ff', -0.35));
    var e = Math.min((a1 - a0) * 0.12, 0.03);
    this.poly([pt(a0 - e, z0 - 1), pt(a1 + e, z0 - 1), pt(a1 + e, z1 + 1), pt(a0 - e, z1 + 1)], fr);
    this.poly([pt(a0, z0), pt(a1, z0), pt(a1, z1), pt(a0, z1)], glass);
    if (!lit) this.poly([pt(a0, z1), pt(a0 + (a1 - a0) * 0.45, z1), pt(a0, z1 - (z1 - z0) * 0.6)], 'rgba(255,255,255,.45)');
    if (o.cross) { this.line(pt((a0 + a1) / 2, z0), pt((a0 + a1) / 2, z1), fr, 0.7); this.line(pt(a0, (z0 + z1) / 2), pt(a1, (z0 + z1) / 2), fr, 0.7); }
  };
  /** Lưới cửa sổ cho cả mặt: n cột × floors tầng */
  PP.grid = function (left, f, a0, a1, z0, fh, floors, n, o, seed) {
    var r = rnd(seed || 7), step = (a1 - a0) / n, ww = step * (o && o.w || 0.55), wh = fh * (o && o.h || 0.5);
    for (var k = 0; k < floors; k++) for (var i = 0; i < n; i++) {
      var a = a0 + step * i + (step - ww) / 2, z = z0 + fh * k + fh * 0.28;
      var oo = Object.assign({}, o || {}); oo.lit = r() < 0.72;
      this.win(left, f, a, a + ww, z, z + wh, oo);
    }
  };
  PP.door = function (left, f, a0, a1, z1, col, o) {
    var pt = left ? function (a, z) { return [a, f, z]; } : function (a, z) { return [f, a, z]; };
    this.poly([pt(a0 - 0.02, 0), pt(a1 + 0.02, 0), pt(a1 + 0.02, z1 + 1.5), pt(a0 - 0.02, z1 + 1.5)], '#f5efe2');
    this.poly([pt(a0, 0), pt(a1, 0), pt(a1, z1), pt(a0, z1)], this.night && o && o.glow ? '#ffd36b' : col || '#8a5a3b');
    var kn = pt(a1 - (a1 - a0) * 0.22, z1 * 0.45), q = this.p(kn[0], kn[1], kn[2]); this.g.fillStyle = '#ffd34d'; this.g.beginPath(); this.g.arc(q[0], q[1], 0.9 * this.s, 0, 7); this.g.fill();
  };
  PP.awning = function (left, f, a0, a1, z, depth, c1, c2) {   // mái hiên sọc
    var n = Math.max(2, Math.round((a1 - a0) / 0.12)), st = (a1 - a0) / n;
    for (var i = 0; i < n; i++) {
      var A = a0 + st * i, B = A + st, col = i % 2 ? c1 : c2;
      if (left) this.poly([[A, f, z], [B, f, z], [B, f + depth, z - 5], [A, f + depth, z - 5]], col);
      else this.poly([[f, A, z], [f, B, z], [f + depth, B, z - 5], [f + depth, A, z - 5]], shade(col, -0.15));
    }
  };
  PP.circle = function (u, v, z, r, fill, stroke) { var q = this.p(u, v, z), g = this.g; g.beginPath(); g.arc(q[0], q[1], r * this.s, 0, Math.PI * 2); if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = this.s; g.stroke(); } };
  PP.ell = function (u, v, z, rx, ry, fill) { var q = this.p(u, v, z), g = this.g; g.beginPath(); g.ellipse(q[0], q[1], rx * this.s, ry * this.s, 0, 0, Math.PI * 2); g.fillStyle = fill; g.fill(); };
  PP.ball = function (u, v, z, r, col) {   // khối cầu có bóng sáng
    var q = this.p(u, v, z), g = this.g, R = r * this.s, gr = g.createRadialGradient(q[0] - R * 0.35, q[1] - R * 0.4, R * 0.1, q[0], q[1], R);
    gr.addColorStop(0, shade(col, 0.35)); gr.addColorStop(0.65, col); gr.addColorStop(1, shade(col, -0.3));
    g.beginPath(); g.arc(q[0], q[1], R, 0, Math.PI * 2); g.fillStyle = gr; g.fill();
  };
  /** Trụ tròn đứng: tâm (u,v), bán kính r (ô), từ z0..z1 */
  PP.cyl = function (u, v, r, z0, z1, col, topCol) {
    var g = this.g, c0 = this.p(u, v, z0), c1 = this.p(u, v, z1), rx = r * this.hw * SQ2, ry = r * this.hh * SQ2;
    var gr = g.createLinearGradient(c0[0] - rx, 0, c0[0] + rx, 0); gr.addColorStop(0, shade(col, 0.12)); gr.addColorStop(0.45, col); gr.addColorStop(1, shade(col, -0.32));
    g.beginPath(); g.ellipse(c0[0], c0[1], rx, ry, 0, 0, Math.PI); g.lineTo(c1[0] - rx, c1[1]); g.ellipse(c1[0], c1[1], rx, ry, 0, Math.PI, 0, true); g.closePath(); g.fillStyle = gr; g.fill();
    g.beginPath(); g.ellipse(c1[0], c1[1], rx, ry, 0, 0, Math.PI * 2); g.fillStyle = topCol || shade(col, 0.18); g.fill();
  };
  PP.cone = function (u, v, r, z0, h, col) {
    var g = this.g, c0 = this.p(u, v, z0), tp = this.p(u, v, z0 + h), rx = r * this.hw * SQ2, ry = r * this.hh * SQ2;
    var gr = g.createLinearGradient(c0[0] - rx, 0, c0[0] + rx, 0); gr.addColorStop(0, shade(col, 0.15)); gr.addColorStop(0.5, col); gr.addColorStop(1, shade(col, -0.3));
    g.beginPath(); g.ellipse(c0[0], c0[1], rx, ry, 0, 0, Math.PI); g.lineTo(tp[0], tp[1]); g.closePath(); g.fillStyle = gr; g.fill();
  };
  PP.emoji = function (ch, u, v, z, size) {
    var q = this.p(u, v, z), g = this.g; g.font = Math.round(size * this.s) + 'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ch, q[0], q[1]);
  };
  PP.sign = function (ch, u, v, z, size, bg) {   // bảng hiệu tròn có emoji
    var q = this.p(u, v, z), g = this.g, R = size * 0.62 * this.s;
    g.beginPath(); g.arc(q[0], q[1] + R * 0.12, R, 0, 7); g.fillStyle = 'rgba(0,0,0,.18)'; g.fill();
    g.beginPath(); g.arc(q[0], q[1], R, 0, 7); g.fillStyle = bg || '#ffffff'; g.fill(); g.lineWidth = 1.2 * this.s; g.strokeStyle = 'rgba(0,0,0,.15)'; g.stroke();
    this.emoji(ch, u, v, z, size * 0.78);
  };
  PP.tree = function (u, v, size, col, kind) {   // cây trang trí
    col = col || '#4caf50'; size = size || 1; var z = 0;
    this.ell(u + 0.08, v + 0.08, 0, 9 * size, 4.5 * size, 'rgba(30,40,20,.22)');
    if (kind === 'pine') {
      this.cyl(u, v, 0.03 * size, 0, 6 * size, '#7a4b2a');
      for (var i = 0; i < 3; i++) this.cone(u, v, (0.2 - i * 0.045) * size, (5 + i * 7) * size, (14 - i * 2) * size, shade(col, i * 0.07));
      return;
    }
    if (kind === 'palm') {
      this.line([u, v, 0], [u + 0.05, v - 0.02, 26 * size], '#9b6b3e', 3 * size);
      var c = [u + 0.05, v - 0.02, 26 * size];
      for (var k = 0; k < 6; k++) { var a = k / 6 * Math.PI * 2; this.line(c, [c[0] + Math.cos(a) * 0.32 * size, c[1] + Math.sin(a) * 0.32 * size, c[2] - 6 * size], shade(col, (k % 2) * 0.1), 3.2 * size); }
      this.circle(c[0], c[1], c[2] - 2 * size, 2.2 * size, '#8d5a2b');
      return;
    }
    this.cyl(u, v, 0.035 * size, 0, 9 * size, '#80522f');
    this.ball(u - 0.05 * size, v + 0.02, 15 * size, 8 * size, shade(col, -0.08));
    this.ball(u + 0.07 * size, v - 0.04, 17 * size, 7.5 * size, col);
    this.ball(u, v, 22 * size, 7 * size, shade(col, 0.08));
  };
  PP.flag = function (u, v, z, col) { this.line([u, v, z], [u, v, z + 16], '#d8d8d8', 1.2); this.poly([[u, v, z + 16], [u + 0.2, v - 0.06, z + 14], [u, v, z + 11.5]], col || '#e53935'); };
  PP.fence = function (pts, z, col) {
    col = col || '#c8935a';
    for (var i = 0; i + 1 < pts.length; i++) {
      var a = pts[i], b = pts[i + 1], n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.25));
      for (var k = 0; k <= n; k++) { var t = k / n, uu = a[0] + (b[0] - a[0]) * t, vv = a[1] + (b[1] - a[1]) * t; this.line([uu, vv, 0], [uu, vv, z + 2], shade(col, -0.2), 1.6); }
      this.line([a[0], a[1], z], [b[0], b[1], z], col, 1.4); this.line([a[0], a[1], z * 0.45], [b[0], b[1], z * 0.45], col, 1.2);
    }
  };
  PP.slab = function (w, h, col, z) {   // nền lát
    z = z == null ? 1.5 : z;
    this.box(0.04, 0.04, w - 0.04, h - 0.04, 0, z, col, { edge: false, ao: false });
  };

  /* ---------------- Đất / cỏ ---------------- */
  var GROUND = {
    '': { c: ['#7ccf5c', '#6cc04e', '#8fd96b'], fl: '#ffffff', edge: '#5a9a3a' }, xuan: { c: ['#8fdc7a', '#7fd06b', '#a6e68e'], fl: '#ff8fc8', edge: '#5fa64a' },
    thu: { c: ['#d9b44a', '#cfa53c', '#e6c561'], fl: '#e8673c', edge: '#a8822a' }, dong: { c: ['#eef4fb', '#e2ebf6', '#f8fbff'], fl: '#9fc2e8', edge: '#b8c8dc' },
    cat: { c: ['#f2dca0', '#ead08b', '#f8e7b8'], fl: '#62c4e0', edge: '#c9ab62' }, keo: { c: ['#ffc6e0', '#ffb5d6', '#ffd6ea'], fl: '#a37bff', edge: '#e48ab6' },
    phep: { c: ['#8e7de0', '#7f6dd6', '#a291ec'], fl: '#ffe066', edge: '#5f50b5' }
  };
  function groundTheme(id) { return GROUND[id || ''] || GROUND['']; }
  /** Vẽ một ô cỏ tại toạ độ màn hình (x,y = đỉnh trên của ô) */
  function groundTile(g, x, y, s, tx, ty, th, wild) {
    var h = hsh(tx * 7919 + ':' + ty), c = th.c[h % 3];
    if (wild) c = mix(c, '#3d5a3a', 0.35);
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + HW * s, y + HH * s); g.lineTo(x, y + TH * s); g.lineTo(x - HW * s, y + HH * s); g.closePath();
    g.fillStyle = c; g.fill();
    if (s >= 0.5) {
      var r = rnd(h), n = 2 + (h % 3);
      for (var i = 0; i < n; i++) {
        var a = r() - 0.5, b = r() - 0.5, px = x + (a - b) * HW * s * 0.9, py = y + HH * s + (a + b) * HH * s * 0.9;
        g.fillStyle = rgba(shade(c, r() > 0.5 ? -0.18 : 0.15), 0.8); g.fillRect(px, py, 1.2 * s, 2.4 * s);
      }
      if (!wild && h % 11 === 0) { var q = r(); g.fillStyle = th.fl; g.beginPath(); g.arc(x + (q - 0.5) * HW * s, y + HH * s + (r() - 0.5) * HH * s, 1.6 * s, 0, 7); g.fill(); g.fillStyle = '#ffe14d'; g.beginPath(); g.arc(x + (q - 0.5) * HW * s, y + HH * s + 0, 0.01, 0, 7); g.fill(); }
    }
  }

  /* ---------------- Đường / nước (tự nối) ---------------- */
  // mask: 1 = có ô cùng loại ở (x, y-1) [trên-phải], 2 = (x+1, y) [dưới-phải], 4 = (x, y+1) [dưới-trái], 8 = (x-1, y) [trên-trái]
  function paintRoad(P, mask) {
    var A = '#5d6670', s = 0.02;
    P.poly([[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]], '#c9c4b8');                       // vỉa hè
    P.poly([[0.12, 0.12, 0.3], [0.88, 0.12, 0.3], [0.88, 0.88, 0.3], [0.12, 0.88, 0.3]], A);
    if (mask & 1) P.poly([[0.12, 0, 0.3], [0.88, 0, 0.3], [0.88, 0.12, 0.3], [0.12, 0.12, 0.3]], A);
    if (mask & 4) P.poly([[0.12, 0.88, 0.3], [0.88, 0.88, 0.3], [0.88, 1, 0.3], [0.12, 1, 0.3]], A);
    if (mask & 8) P.poly([[0, 0.12, 0.3], [0.12, 0.12, 0.3], [0.12, 0.88, 0.3], [0, 0.88, 0.3]], A);
    if (mask & 2) P.poly([[0.88, 0.12, 0.3], [1, 0.12, 0.3], [1, 0.88, 0.3], [0.88, 0.88, 0.3]], A);
    var Y = '#ffd84d', n = (mask & 5 ? 1 : 0) + (mask & 10 ? 1 : 0), straightV = (mask & 5) === 5 && !(mask & 10), straightU = (mask & 10) === 10 && !(mask & 5);
    if (straightV) { P.line([0.5, 0.05, 0.4], [0.5, 0.3, 0.4], Y, 1.4); P.line([0.5, 0.7, 0.4], [0.5, 0.95, 0.4], Y, 1.4); }
    else if (straightU) { P.line([0.05, 0.5, 0.4], [0.3, 0.5, 0.4], Y, 1.4); P.line([0.7, 0.5, 0.4], [0.95, 0.5, 0.4], Y, 1.4); }
    else if (mask === 1 || mask === 4) P.line([0.5, 0.05, 0.4], [0.5, 0.95, 0.4], Y, 1.2);
    else if (mask === 2 || mask === 8) P.line([0.05, 0.5, 0.4], [0.95, 0.5, 0.4], Y, 1.2);
    else if (n === 2 && mask !== 15) { /* góc: vạch trắng nhỏ */ P.circle(0.5, 0.5, 0.4, 1.4, 'rgba(255,255,255,.5)'); }
    if (mask === 15 || ((mask & 5) && (mask & 10) && n === 2 && [7, 11, 13, 14].indexOf(mask) >= 0)) {   // giao lộ: vạch kẻ đường
      for (var i = 0; i < 4; i++) { var t = 0.22 + i * 0.16; P.line([t, 0.16, 0.4], [t + 0.07, 0.16, 0.4], '#f2f2f2', 1.2); }
    }
    void s;
  }
  function paintPath(P, mask) {
    P.poly([[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]], '#d8c7a4');
    var r = rnd(mask * 31 + 7);
    for (var i = 0; i < 9; i++) { var u = 0.12 + r() * 0.76, v = 0.12 + r() * 0.76; P.poly([[u - 0.09, v - 0.07, 0.4], [u + 0.08, v - 0.08, 0.4], [u + 0.09, v + 0.07, 0.4], [u - 0.07, v + 0.08, 0.4]], pick(['#bfae8c', '#cbb995', '#b3a27f'], i), 'rgba(0,0,0,.08)'); }
  }
  function paintWater(P, mask) {
    var bank = '#d9c48f';
    P.poly([[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]], bank);
    var a = mask & 1 ? 0 : 0.14, b = mask & 2 ? 1 : 0.86, c = mask & 4 ? 1 : 0.86, d = mask & 8 ? 0 : 0.14;
    P.poly([[d, a, -1], [b, a, -1], [b, c, -1], [d, c, -1]], P.grad([d, a, 0], [b, c, 0], '#4fc3f7', '#1e88e5'));
    if (!(mask & 1)) P.poly([[d, a, -1], [b, a, -1], [b, a, 0.5], [d, a, 0.5]], 'rgba(255,255,255,.35)');
    if (!(mask & 8)) P.poly([[d, a, -1], [d, c, -1], [d, c, 0.5], [d, a, 0.5]], 'rgba(255,255,255,.25)');
  }

  /* ---------------- Ruộng & cây trồng ---------------- */
  var CROP_COL = { lua: ['#e3b23c', '#c7942a'], ngo: ['#7cb342', '#ffd54f'], carot: ['#66bb6a', '#ff8a00'], dau: ['#8bc34a', '#c5a15a'], mia: ['#9ccc65', '#7cb342'],
    cachua: ['#4caf50', '#e53935'], dautay: ['#43a047', '#ff3b5c'], khoai: ['#6d9f3d', '#b8865b'], bong: ['#7aa356', '#ffffff'], bido: ['#558b2f', '#ff9800'],
    ot: ['#43a047', '#e53935'], dua: ['#5e9c3a', '#f9c23c'], nho: ['#5d8f3a', '#8e44ad'], duahau: ['#4c8c2f', '#2e7d32'], huongduong: ['#5f9e3a', '#ffcc00'],
    xoai: ['#4e9a3a', '#ffb300'], dao: ['#5b9c40', '#ff8fa3'], kiwi: ['#5f9a3c', '#9ccc65'], nam: ['#7e57c2', '#ff5252'] };
  function paintField(P) {
    P.box(0.05, 0.05, 0.95, 0.95, 0, 2.2, '#8d5b3a', { edge: false, t: '#9a6644', ao: false });
    for (var i = 0; i < 4; i++) { var u = 0.17 + i * 0.22; P.poly([[u - 0.04, 0.1, 2.25], [u + 0.04, 0.1, 2.25], [u + 0.04, 0.9, 2.25], [u - 0.04, 0.9, 2.25]], '#7a4b2e'); }
  }
  function paintCrop(P, id, stage, emoji) {
    var c = CROP_COL[id] || ['#66bb6a', '#ffd54f'], r = rnd(hsh(id) + stage);
    for (var i = 0; i < 4; i++) for (var j = 0; j < 3; j++) {
      var u = 0.17 + i * 0.22, v = 0.24 + j * 0.26 + (r() - 0.5) * 0.04, z = 2.3;
      if (stage === 0) { P.line([u, v, z], [u - 0.02, v, z + 3], '#7bc043', 1.6); P.line([u, v, z + 2], [u + 0.04, v, z + 3.4], '#9be15d', 1.4); continue; }
      var hgt = stage === 1 ? 6 : 10;
      if (id === 'lua' || id === 'mia') {
        var col = stage === 2 ? c[0] : '#9ccc65';
        for (var k = -1; k <= 1; k++) P.line([u + k * 0.03, v, z], [u + k * 0.05, v - 0.02, z + hgt + (id === 'mia' ? 6 : 2)], col, 1.5);
        if (stage === 2 && id === 'lua') P.ell(u, v - 0.02, z + hgt + 2, 1.8, 3.4, '#f0c24a');
        continue;
      }
      if (id === 'ngo' || id === 'huongduong' || id === 'bong') {
        P.line([u, v, z], [u, v, z + hgt + 3], '#689f38', 2);
        P.poly([[u, v, z + hgt * 0.5], [u + 0.08, v, z + hgt * 0.7], [u, v, z + hgt * 0.6]], '#7cb342');
        if (stage === 2) { if (id === 'huongduong') { P.circle(u, v, z + hgt + 4, 3.3, '#ffcc00'); P.circle(u, v, z + hgt + 4, 1.5, '#6d4c41'); } else if (id === 'bong') P.circle(u, v, z + hgt + 3, 2.6, '#ffffff'); else P.ell(u + 0.03, v, z + hgt, 1.6, 3.2, '#ffd54f'); }
        continue;
      }
      P.ball(u, v, z + hgt * 0.45, stage === 1 ? 3 : 4.2, c[0]);
      if (stage === 2) P.circle(u + 0.02, v + 0.02, z + hgt * 0.45, id === 'duahau' || id === 'bido' ? 3 : 1.9, id === 'duahau' ? '#2e7d32' : c[1]);
    }
    if (stage === 2 && emoji) P.emoji(emoji, 0.5, 0.5, 18, 13);
  }

  /* ---------------- Chướng ngại ---------------- */
  function paintObs(P, t, seed) {
    var r = rnd(seed);
    if (t === 'c1') { P.tree(0.5, 0.5, 0.9 + r() * 0.2, pick(['#43a047', '#4caf50', '#5cb85c'], seed)); return; }
    if (t === 'c2') { P.tree(0.5, 0.5, 1.35, pick(['#2e7d32', '#388e3c'], seed), seed % 3 === 0 ? 'pine' : null); return; }
    if (t === 'd1') { P.ell(0.55, 0.55, 0, 9, 4, 'rgba(0,0,0,.18)'); P.ball(0.5, 0.5, 4, 6.5, '#9e9e9e'); P.ball(0.62, 0.55, 3, 4.5, '#b0b0b0'); return; }
    if (t === 'd2') { P.ell(0.55, 0.6, 0, 16, 7, 'rgba(0,0,0,.2)'); P.ball(0.45, 0.5, 8, 11, '#8d8d8d'); P.ball(0.65, 0.6, 5, 8, '#a5a5a5'); P.ball(0.35, 0.68, 4, 5.5, '#9a9a9a'); P.poly([[0.38, 0.4, 16], [0.46, 0.36, 18], [0.5, 0.42, 15]], 'rgba(255,255,255,.35)'); return; }
    if (t === 'b1') { for (var i = 0; i < 5; i++) P.ball(0.32 + r() * 0.36, 0.32 + r() * 0.36, 3, 4 + r() * 2, pick(['#558b2f', '#689f38', '#7cb342'], i)); return; }
    if (t === 'b2') { P.cyl(0.5, 0.5, 0.16, 0, 6, '#8d6e4a', '#c9a77a'); P.circle(0.5, 0.5, 6, 2, null, '#a5845a'); P.line([0.38, 0.6, 1], [0.25, 0.7, 0], '#7a5a3a', 2); }
  }

  /* ---------------- Công trình ---------------- */
  var WALLS = ['#f6e7c8', '#ffd8b0', '#cfe8ff', '#ffe0ec', '#e0f2d8', '#fff1b8', '#e8ddff'];
  var ROOFS = ['#e0533d', '#3d7fe0', '#2fa36b', '#9c5bd6', '#e08a2f', '#d64a7a'];
  function tierCol(l) { return l >= 100 ? '#b388ff' : l >= 50 ? '#40c4ff' : l >= 25 ? '#ffd740' : l >= 10 ? '#cfd8dc' : null; }
  function star(P, u, v, z, l) {   // huy hiệu bậc nâng cấp trên nóc
    var c = tierCol(l); if (!c) return;
    P.circle(u, v, z, 4.2, shade(c, -0.25)); P.circle(u, v, z + 0.6, 3.6, c); P.emoji('★', u, v, z + 0.6, 6);
  }
  var PAINT = {};
  function house(P, o) {   // nhà 1 ô / nhiều ô dạng hộp + mái
    var w = o.w, f = o.floors, fh = o.fh || 13, H = f * fh, wall = o.wall, inset = o.inset == null ? 0.12 : o.inset;
    P.shadow(inset, inset, w - inset, w - inset, 0.3 + f * 0.08);
    if (o.yard) P.slab(w, w, o.yard, 1);
    P.box(inset, inset, w - inset, w - inset, 0, H, wall);
    P.grid(true, w - inset, inset + 0.1, w - inset - 0.1, 0, fh, f, Math.max(1, Math.round((w - 2 * inset) * (o.wc || 2))), { frame: o.frame || '#ffffff', glass: o.glass, cross: o.cross }, o.seed);
    P.grid(false, w - inset, inset + 0.1, w - inset - 0.1, 0, fh, f, Math.max(1, Math.round((w - 2 * inset) * (o.wc || 2))), { frame: o.frame || '#ffffff', glass: o.glass, cross: o.cross }, o.seed + 3);
    if (o.door !== false) P.door(true, w - inset, (w / 2) - 0.12, (w / 2) + 0.12, Math.min(fh * 0.75, 10), o.doorCol, { glow: true });
    if (o.roof === 'gable') P.gable(inset, inset, w - inset, w - inset, H, o.rh || 11, o.rc, o.axis || 'u', wall);
    else if (o.roof === 'hip') P.hip(inset, inset, w - inset, w - inset, H, o.rh || 10, o.rc, o.top);
    else { P.box(inset, inset, w - inset, w - inset, H, H + 2.5, shade(wall, -0.1), { edge: false }); P.diamond(inset + 0.06, inset + 0.06, w - inset - 0.06, w - inset - 0.06, H + 2.5, shade(wall, -0.2)); }
    return H;
  }
  function floorsBy(l, base, step, max) { return Math.min(max, base + Math.floor((l - 1) / step)); }

  PAINT.nhago = function (P, b, v) {
    var f = b.l >= 5 ? 2 : 1, H = house(P, { w: 1, floors: f, fh: 12, wall: '#d9a46c', rc: pick(['#d84f3a', '#c0392b', '#e0703a'], v), roof: 'gable', axis: v % 2 ? 'u' : 'v', seed: v, wc: 1.6, frame: '#fff5e0' });
    for (var i = 0; i < f * 3; i++) P.line([0.12, 0.88, 3 + i * 4], [0.88, 0.88, 3 + i * 4], 'rgba(120,70,30,.25)', 0.6);
    P.box(0.62, 0.3, 0.72, 0.4, H + 2, H + 12, '#8e8e8e', { edge: false });
    if (b.l >= 3) { P.ball(0.9, 0.6, 3, 3.5, '#e57399'); P.ball(0.9, 0.35, 3, 3.2, '#ffca28'); }
    star(P, 0.5, 0.5, H + 16, b.l);
  };
  PAINT.nhagach = function (P, b, v) {
    var f = floorsBy(b.l, 1, 4, 3), H = house(P, { w: 1, floors: f, fh: 12, wall: '#d87454', rc: pick(['#3b6fb6', '#2f8f6a', '#5b4bb5'], v), roof: 'hip', rh: 9, seed: v, wc: 1.6, frame: '#f6f1ea', cross: true });
    for (var i = 1; i < f * 4; i++) P.line([0.12, 0.88, i * 3], [0.88, 0.88, i * 3], 'rgba(255,255,255,.18)', 0.5);
    star(P, 0.5, 0.5, H + 14, b.l);
  };
  PAINT.nhanam = function (P, b, v) {
    P.shadow(0.2, 0.2, 0.8, 0.8);
    var hgt = 12 + Math.min(10, b.l);
    P.cyl(0.5, 0.5, 0.2, 0, hgt, '#fff4e0');
    P.door(true, 0.78, 0.44, 0.56, 8, '#a0522d');
    P.winR(0.78, 0.45, 0.55, hgt - 7, hgt - 3, { frame: '#fff' });
    var cap = pick(['#e53935', '#8e24aa', '#fb8c00'], v), q = P.p(0.5, 0.5, hgt + 4), g = P.g, R = 15 * P.s;
    var gr = g.createRadialGradient(q[0] - R * 0.3, q[1] - R * 0.5, R * 0.1, q[0], q[1], R * 1.1); gr.addColorStop(0, shade(cap, 0.3)); gr.addColorStop(1, shade(cap, -0.25));
    g.beginPath(); g.ellipse(q[0], q[1], R * 1.15, R * 0.85, 0, Math.PI, 0); g.quadraticCurveTo(q[0], q[1] + R * 0.35, q[0] - R * 1.15, q[1]); g.fillStyle = gr; g.fill();
    [[-0.5, -0.4], [0.3, -0.55], [0.6, -0.15], [-0.15, -0.15], [-0.8, -0.1]].forEach(function (d) { g.beginPath(); g.arc(q[0] + d[0] * R, q[1] + d[1] * R, R * 0.13, 0, 7); g.fillStyle = '#fff'; g.fill(); });
    star(P, 0.5, 0.5, hgt + 20, b.l);
  };
  PAINT.nhacay = function (P, b, v) {
    P.shadow(0.15, 0.15, 0.85, 0.85, 0.5);
    P.cyl(0.5, 0.5, 0.12, 0, 26, '#8b5a2b');
    P.ball(0.42, 0.55, 30, 13, '#43a047'); P.ball(0.62, 0.4, 34, 12, '#4caf50'); P.ball(0.5, 0.5, 40, 12, '#66bb6a');
    P.box(0.28, 0.3, 0.72, 0.74, 24, 34, '#c98d52');
    P.winL(0.74, 0.38, 0.52, 27, 32, { frame: '#fff' }); P.winR(0.72, 0.4, 0.6, 27, 32, { frame: '#fff' });
    P.gable(0.28, 0.3, 0.72, 0.74, 34, 8, '#d84f3a', 'u', '#c98d52');
    for (var i = 0; i < 5; i++) P.line([0.66, 0.84, i * 5], [0.74, 0.84, i * 5 + 2], '#6d4c2b', 1.4);
    star(P, 0.5, 0.5, 50, b.l);
  };
  PAINT.nhapho = function (P, b, v) {
    var f = floorsBy(b.l, 2, 3, 6), wall = pick(['#ffd166', '#ef8fb1', '#7fd3c6', '#a5c8ff', '#ffb27a', '#c7e48a'], v);
    var H = house(P, { w: 1, floors: f, fh: 11, wall: wall, roof: 'flat', seed: v, wc: 1.4, inset: 0.18, frame: '#ffffff' });
    for (var k = 1; k < f; k++) { P.box(0.18, 0.8, 0.82, 0.92, k * 11, k * 11 + 1.2, '#ffffff', { edge: false, ao: false }); P.line([0.2, 0.92, k * 11 + 4], [0.8, 0.92, k * 11 + 4], '#666', 0.6); }
    P.awning(true, 0.82, 0.25, 0.75, 9, 0.1, '#e53935', '#ffffff');
    P.ball(0.35, 0.35, H + 5, 3.2, '#4caf50'); P.ball(0.6, 0.45, H + 5, 2.6, '#66bb6a');
    star(P, 0.5, 0.5, H + 14, b.l);
  };
  PAINT.bietthu = function (P, b, v) {
    var f = floorsBy(b.l, 2, 8, 4);
    P.slab(2, 2, '#a5d6a7', 1);
    P.poly([[1.25, 0.15, 1.2], [1.85, 0.15, 1.2], [1.85, 0.75, 1.2], [1.25, 0.75, 1.2]], '#d7ccc8');
    P.poly([[1.32, 0.22, 1.3], [1.78, 0.22, 1.3], [1.78, 0.68, 1.3], [1.32, 0.68, 1.3]], P.grad([1.3, 0.2, 1], [1.8, 0.7, 1], '#80deea', '#29b6f6'));
    P.shadow(0.15, 0.15, 1.2, 1.85, 0.4);
    P.box(0.15, 0.15, 1.2, 1.85, 0, f * 13, '#fbf6ee');
    P.grid(true, 1.85, 0.25, 1.1, 0, 13, f, 2, { frame: '#fff', glass: '#9ad3ff', cross: true }, v);
    P.grid(false, 1.2, 0.3, 1.75, 0, 13, f, 3, { frame: '#fff', glass: '#9ad3ff', cross: true }, v + 1);
    P.door(false, 1.2, 0.95, 1.15, 10, '#6d4c41', { glow: true });
    P.hip(0.15, 0.15, 1.2, 1.85, f * 13, 13, pick(['#37474f', '#5d4037', '#1e5aa8'], v), 0.25);
    P.tree(1.65, 1.6, 0.7, '#43a047'); P.tree(1.45, 1.75, 0.55, '#66bb6a');
    star(P, 0.68, 1, f * 13 + 20, b.l);
  };
  PAINT.laudai = function (P, b) {
    P.slab(3, 3, '#cfd8dc', 1.5);
    var W = '#eceff1', R = '#5c6bc0';
    P.shadow(0.4, 0.4, 2.6, 2.6, 0.6);
    P.box(0.5, 0.5, 2.5, 2.5, 0, 34, W);
    for (var i = 0; i < 6; i++) { var u = 0.6 + i * 0.33; P.box(u, 2.42, u + 0.18, 2.52, 34, 39, W, { edge: false }); P.box(2.42, u, 2.52, u + 0.18, 34, 39, W, { edge: false }); }
    P.grid(true, 2.5, 0.8, 2.3, 0, 14, 2, 4, { frame: '#cfd8dc', glass: '#90caf9' }, 3); P.grid(false, 2.5, 0.8, 2.3, 0, 14, 2, 4, { frame: '#cfd8dc', glass: '#90caf9' }, 5);
    P.poly([[1.3, 2.5, 0], [1.7, 2.5, 0], [1.7, 2.5, 13], [1.5, 2.5, 17], [1.3, 2.5, 13]], '#6d4c41');
    [[0.5, 0.5], [2.5, 0.5], [0.5, 2.5], [2.5, 2.5]].forEach(function (c, k) { P.cyl(c[0], c[1], 0.32, 0, 50, W); P.winL(c[1] + 0.32, c[0] - 0.08, c[0] + 0.08, 34, 42, { frame: '#cfd8dc' }); P.cone(c[0], c[1], 0.38, 50, 28, k % 2 ? R : '#ec407a'); P.flag(c[0], c[1], 78, k % 2 ? '#ffd54f' : '#e53935'); });
    P.cyl(1.5, 1.5, 0.45, 34, 66, W); P.cone(1.5, 1.5, 0.52, 66, 34, R); P.flag(1.5, 1.5, 100, '#ffd54f');
    star(P, 1.5, 1.5, 112, b.l);
  };
  PAINT.chungcu = function (P, b, v) {
    var f = floorsBy(b.l, 4, 2, 12), wall = pick(['#f3e5c9', '#d6e4f0', '#f6d5c3', '#dfe8d0'], v);
    P.slab(2, 2, '#bdbdbd', 1);
    P.shadow(0.2, 0.2, 1.8, 1.8, 0.4 + f * 0.06);
    P.box(0.2, 0.2, 1.8, 1.8, 0, f * 11, wall);
    P.grid(true, 1.8, 0.3, 1.7, 0, 11, f, 5, { frame: '#ffffff', glass: '#a7d8ff' }, v);
    P.grid(false, 1.8, 0.3, 1.7, 0, 11, f, 5, { frame: '#ffffff', glass: '#a7d8ff' }, v + 9);
    for (var k = 1; k < f; k += 1) { P.line([0.2, 1.8, k * 11], [1.8, 1.8, k * 11], 'rgba(0,0,0,.08)', 0.7); P.line([1.8, 1.8, k * 11], [1.8, 0.2, k * 11], 'rgba(0,0,0,.1)', 0.7); }
    P.door(true, 1.8, 0.85, 1.15, 8, '#5d4037', { glow: true });
    P.box(0.2, 0.2, 1.8, 1.8, f * 11, f * 11 + 3, shade(wall, -0.12), { edge: false });
    P.box(0.5, 0.5, 0.9, 0.9, f * 11 + 3, f * 11 + 10, '#90a4ae'); P.cyl(1.35, 1.3, 0.16, f * 11 + 3, f * 11 + 13, '#b0bec5');
    star(P, 1, 1, f * 11 + 22, b.l);
  };
  PAINT.caooc = function (P, b, v) {
    var f = floorsBy(b.l, 6, 2, 22), glass = pick(['#4f9de0', '#3fb7b0', '#6f7fe0'], v), H = f * 9;
    P.slab(2, 2, '#9e9e9e', 1);
    P.shadow(0.3, 0.3, 1.7, 1.7, 0.5 + f * 0.06);
    P.box(0.3, 0.3, 1.7, 1.7, 0, H, glass, { l: P.grad([0, 1.7, H], [0, 1.7, 0], shade(glass, 0.25), shade(glass, -0.15)), r: P.grad([1.7, 0, H], [1.7, 0, 0], shade(glass, -0.1), shade(glass, -0.4)) });
    for (var k = 1; k < f; k++) { P.line([0.3, 1.7, k * 9], [1.7, 1.7, k * 9], 'rgba(255,255,255,.35)', 0.6); P.line([1.7, 1.7, k * 9], [1.7, 0.3, k * 9], 'rgba(255,255,255,.2)', 0.6); }
    for (var i = 1; i < 6; i++) { var u = 0.3 + i * 0.233; P.line([u, 1.7, 0], [u, 1.7, H], 'rgba(255,255,255,.25)', 0.6); P.line([1.7, u, 0], [1.7, u, H], 'rgba(0,0,0,.12)', 0.6); }
    if (P.night) { var r = rnd(v + 5); for (var k2 = 0; k2 < f; k2++) for (var j = 0; j < 6; j++) if (r() < 0.55) { var a = 0.32 + j * 0.233; P.poly([[a, 1.7, k2 * 9 + 2], [a + 0.18, 1.7, k2 * 9 + 2], [a + 0.18, 1.7, k2 * 9 + 7], [a, 1.7, k2 * 9 + 7]], 'rgba(255,220,120,.85)'); } }
    P.poly([[0.3, 1.7, H], [0.75, 1.7, H], [0.3, 1.7, H - 40 > 0 ? H - 40 : 0]], 'rgba(255,255,255,.18)');
    P.box(0.3, 0.3, 1.7, 1.7, H, H + 3, '#cfd8dc', { edge: false });
    P.box(0.7, 0.7, 1.3, 1.3, H + 3, H + 10, '#b0bec5');
    star(P, 1, 1, H + 22, b.l);
  };
  PAINT.chocroi = function (P, b, v) {
    var f = floorsBy(b.l, 10, 2, 36), H = f * 8, glass = pick(['#5aa9e6', '#7b8cde'], v);
    P.slab(2, 2, '#9e9e9e', 1);
    P.shadow(0.25, 0.25, 1.75, 1.75, 0.6 + f * 0.05);
    var seg = [[0.25, 1.75, 0, H * 0.55], [0.4, 1.6, H * 0.55, H * 0.85], [0.55, 1.45, H * 0.85, H]];
    seg.forEach(function (s, i) {
      P.box(s[0], s[0], s[1], s[1], s[2], s[3], glass, { l: P.grad([0, s[1], s[3]], [0, s[1], s[2]], shade(glass, 0.3), shade(glass, -0.1)), r: P.grad([s[1], 0, s[3]], [s[1], 0, s[2]], shade(glass, -0.05), shade(glass, -0.4)) });
      for (var z = s[2] + 8; z < s[3]; z += 8) { P.line([s[0], s[1], z], [s[1], s[1], z], 'rgba(255,255,255,.3)', 0.6); P.line([s[1], s[1], z], [s[1], s[0], z], 'rgba(255,255,255,.18)', 0.6); }
      P.box(s[0] - 0.03, s[0] - 0.03, s[1] + 0.03, s[1] + 0.03, s[3], s[3] + 2, '#eceff1', { edge: false });
      if (P.night) { var r = rnd(v * 7 + i); for (var z2 = s[2] + 2; z2 < s[3] - 4; z2 += 8) for (var j = 0; j < 5; j++) if (r() < 0.5) { var a = s[0] + 0.05 + j * (s[1] - s[0]) / 5; P.poly([[a, s[1], z2], [a + 0.12, s[1], z2], [a + 0.12, s[1], z2 + 4], [a, s[1], z2 + 4]], 'rgba(255,225,130,.85)'); } }
    });
    P.line([1, 1, H + 2], [1, 1, H + 36], '#cfd8dc', 2); P.circle(1, 1, H + 36, 2.2, P.night ? '#ff5252' : '#e0e0e0');
    star(P, 1, 1, H + 46, b.l);
  };

  /* ---- Nhà máy & chuồng: khung chung ---- */
  function factory(P, b, o) {
    P.slab(2, 2, o.yard || '#cdbf9f', 1);
    var u0 = o.u0 == null ? 0.25 : o.u0, v0 = o.v0 == null ? 0.2 : o.v0, u1 = o.u1 || 1.6, v1 = o.v1 || 1.55, H = o.H || 20;
    P.shadow(u0, v0, u1, v1, 0.45);
    P.box(u0, v0, u1, v1, 0, H, o.wall);
    P.grid(true, v1, u0 + 0.12, u1 - 0.12, 0, H, 1, Math.round((u1 - u0) * 2), { frame: '#fff', glass: '#bde3ff', h: 0.4, w: 0.5 }, 3);
    P.grid(false, u1, v0 + 0.15, v1 - 0.15, 0, H, 1, Math.round((v1 - v0) * 2), { frame: '#fff', glass: '#bde3ff', h: 0.4, w: 0.5 }, 9);
    if (o.door !== false) { P.poly([[u0 + 0.35, v1, 0], [u0 + 0.75, v1, 0], [u0 + 0.75, v1, 13], [u0 + 0.35, v1, 13]], '#f2f2f2'); for (var i = 1; i < 6; i++) P.line([u0 + 0.36, v1, i * 2.2], [u0 + 0.74, v1, i * 2.2], 'rgba(0,0,0,.18)', 0.6); }
    if (o.roof === 'gable') P.gable(u0, v0, u1, v1, H, o.rh || 12, o.rc, o.axis || 'u', o.wall);
    else if (o.roof === 'saw') { var n = 3, st = (u1 - u0) / n; for (var k = 0; k < n; k++) { var a = u0 + k * st; P.poly([[a, v0, H], [a + st, v0, H], [a + st, v1, H], [a, v1, H]], shade(o.rc, 0.1)); P.poly([[a, v1, H], [a + st, v1, H], [a + st, v1, H + 8], [a + st * 0.1, v1, H + 1]], shade(o.rc, -0.05)); P.poly([[a + st, v0, H], [a + st, v1, H], [a + st, v1, H + 8], [a + st, v0, H + 8]], '#bfe0ff'); P.poly([[a, v0, H], [a + st, v0, H + 8], [a + st, v1, H + 8], [a, v1, H]], shade(o.rc, 0.18)); } }
    else if (o.roof === 'hip') P.hip(u0, v0, u1, v1, H, o.rh || 10, o.rc, 0.3);
    else { P.box(u0, v0, u1, v1, H, H + 2, shade(o.wall, -0.15), { edge: false }); }
    (o.chim || []).forEach(function (c) { P.cyl(c[0], c[1], c[2] || 0.1, H, H + (c[3] || 18), '#a1887f', '#5d4037'); P.box(c[0] - 0.12, c[1] - 0.12, c[0] + 0.12, c[1] + 0.12, H + (c[3] || 18) - 3, H + (c[3] || 18), '#8d6e63', { edge: false }); });
    if (o.sign) P.sign(o.sign, (u0 + u1) / 2, v1 + 0.02, H + (o.roof === 'gable' ? 6 : 6), 14, o.signBg);
    return H;
  }
  PAINT.traigo = function (P, b) {
    P.slab(2, 2, '#b9d28f', 1);
    P.shadow(0.2, 0.25, 1.25, 1.2, 0.4);
    P.box(0.2, 0.25, 1.25, 1.2, 0, 16, '#a86b3c');
    for (var i = 1; i < 6; i++) { P.line([0.2, 1.2, i * 2.8], [1.25, 1.2, i * 2.8], 'rgba(60,30,10,.35)', 0.8); P.line([1.25, 1.2, i * 2.8], [1.25, 0.25, i * 2.8], 'rgba(60,30,10,.35)', 0.8); }
    P.door(true, 1.2, 0.55, 0.85, 11, '#6d4c41'); P.winR(1.25, 0.5, 0.8, 7, 12, { frame: '#e8d4b0', cross: true });
    P.gable(0.2, 0.25, 1.25, 1.2, 16, 11, '#6d8f3c', 'u', '#a86b3c');
    for (var k = 0; k < 3; k++) for (var j = 0; j < 3 - k; j++) { P.cyl(1.45 + j * 0.13 + k * 0.065, 1.55, 0.07, k * 5.2 + 2.5, k * 5.2 + 2.6, '#9c6b3f', '#e3c08f'); }
    for (var m = 0; m < 3; m++) { P.line([1.4, 1.3 + m * 0.12, 3], [1.85, 1.3 + m * 0.12, 3], '#8d5a2b', 3.6); }
    P.tree(1.7, 0.4, 0.8, '#2e7d32', 'pine'); P.sign('🪓', 0.72, 1.22, 22, 12);
  };
  PAINT.moda = function (P, b) {
    P.slab(2, 2, '#c8b99a', 1);
    P.ell(1.05, 1.0, 0, 46, 22, 'rgba(0,0,0,.15)');
    P.ball(0.75, 0.75, 12, 22, '#8a8a8a'); P.ball(1.25, 0.6, 9, 17, '#9e9e9e'); P.ball(0.6, 1.2, 7, 14, '#a5a5a5');
    P.poly([[0.85, 1.15, 0], [1.15, 1.15, 0], [1.15, 1.15, 12], [1.0, 1.15, 16], [0.85, 1.15, 12]], '#3e2f25');
    P.line([0.85, 1.15, 12], [1.0, 1.15, 16], '#8d6e63', 2); P.line([1.0, 1.15, 16], [1.15, 1.15, 12], '#8d6e63', 2);
    P.line([1.0, 1.2, 0.5], [1.0, 1.95, 0.5], '#6d4c41', 1.4); P.line([1.1, 1.2, 0.5], [1.1, 1.95, 0.5], '#6d4c41', 1.4);
    P.box(0.92, 1.5, 1.18, 1.75, 2, 8, '#757575'); P.ball(1.0, 1.58, 9, 3, '#bdbdbd'); P.ball(1.08, 1.66, 9, 3, '#9e9e9e');
    P.sign('⛏️', 1.6, 1.6, 14, 12);
  };
  PAINT.xuongthucan = function (P, b) {
    factory(P, b, { wall: '#e6c07b', rc: '#b5533c', roof: 'gable', axis: 'v', H: 18, u1: 1.35, sign: '🥣' });
    P.cyl(1.65, 0.6, 0.25, 0, 34, '#cfd8dc'); P.cone(1.65, 0.6, 0.28, 34, 9, '#b0bec5');
    for (var i = 1; i < 6; i++) P.line([1.65 - 0.25, 0.6 + 0.25, i * 6], [1.65 + 0.25, 0.6 + 0.25, i * 6], 'rgba(0,0,0,.08)', 0.6);
    P.line([1.35, 0.9, 16], [1.5, 0.75, 26], '#90a4ae', 2.2);
  };
  PAINT.lobanh = function (P, b) {
    factory(P, b, { wall: '#f4c9a0', rc: '#8d4b2f', roof: 'gable', H: 18, chim: [[1.3, 0.45, 0.09, 14]], sign: '🥖', door: false });
    P.door(true, 1.55, 0.7, 1.0, 11, '#7b4b2a', { glow: true });
    P.awning(true, 1.55, 0.3, 1.5, 13, 0.18, '#e53935', '#fff8e1');
    P.box(1.68, 0.4, 1.9, 0.62, 0, 6, '#8d6e63'); P.box(1.68, 1.1, 1.9, 1.32, 0, 6, '#8d6e63');
  };
  PAINT.xuonggo = function (P, b) {
    factory(P, b, { wall: '#bf8a56', rc: '#6d8f3c', roof: 'gable', axis: 'v', H: 17, sign: '🪚' });
    var q = P.p(1.75, 1.0, 12), g = P.g; g.save(); g.translate(q[0], q[1]); g.scale(1, 0.75); g.beginPath(); g.arc(0, 0, 9 * P.s, 0, 7); g.fillStyle = '#cfd8dc'; g.fill(); g.strokeStyle = '#78909c'; g.lineWidth = 1.2 * P.s; g.stroke();
    for (var i = 0; i < 12; i++) { var a = i / 12 * Math.PI * 2; g.beginPath(); g.moveTo(Math.cos(a) * 9 * P.s, Math.sin(a) * 9 * P.s); g.lineTo(Math.cos(a + 0.2) * 11 * P.s, Math.sin(a + 0.2) * 11 * P.s); g.lineTo(Math.cos(a + 0.4) * 9 * P.s, Math.sin(a + 0.4) * 9 * P.s); g.fillStyle = '#b0bec5'; g.fill(); }
    g.restore();
    for (var k = 0; k < 4; k++) P.box(0.25 + k * 0.02, 1.65, 1.2, 1.78, k * 2.2, k * 2.2 + 2, '#e3b97c', { edge: false });
  };
  PAINT.logach = function (P, b) {
    P.slab(2, 2, '#d7b89a', 1);
    P.shadow(0.3, 0.3, 1.7, 1.7, 0.4);
    P.cyl(1, 1, 0.62, 0, 12, '#c4643f');
    var q = P.p(1, 1, 12), g = P.g, R = 0.62 * P.hw * SQ2;
    var gr = g.createRadialGradient(q[0] - R * 0.3, q[1] - R * 0.6, R * 0.1, q[0], q[1], R); gr.addColorStop(0, '#e58a62'); gr.addColorStop(1, '#a24b2b');
    g.beginPath(); g.ellipse(q[0], q[1], R, R * 0.5, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(q[0], q[1], R, R * 0.95, 0, Math.PI, 0); g.fillStyle = gr; g.fill();
    P.poly([[1.35, 1.55, 0], [1.65, 1.4, 0], [1.65, 1.4, 8], [1.35, 1.55, 8]], P.night ? '#ffb74d' : '#4e342e');
    P.cyl(1.35, 0.6, 0.11, 18, 44, '#8d4b33', '#3e2723');
    for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) P.box(0.25 + j * 0.16, 1.62, 0.39 + j * 0.16, 1.85, i * 2.5, i * 2.5 + 2.3, '#c9573a', { edge: false });
    P.sign('🧱', 1, 1.62, 30, 12);
  };
  PAINT.xuongsua = function (P, b) {
    factory(P, b, { wall: '#ffffff', rc: '#4a90d9', roof: 'gable', H: 18, u1: 1.3, sign: '🧈' });
    P.cyl(1.62, 0.75, 0.24, 0, 26, '#e3f2fd'); P.circle(1.62, 0.75, 26, 0, null);
    for (var i = 0; i < 4; i++) P.ell(1.55 + (i % 2) * 0.1, 0.9, 6 + i * 5, 2.6, 1.6, '#263238');
    P.cyl(1.62, 1.4, 0.18, 0, 18, '#e3f2fd');
    P.line([1.3, 0.9, 14], [1.42, 0.8, 18], '#90a4ae', 2);
  };
  PAINT.nhamayduong = function (P, b) {
    factory(P, b, { wall: '#f8bbd0', rc: '#ad5b8a', roof: 'saw', H: 16, chim: [[0.45, 0.4, 0.09, 22], [0.75, 0.4, 0.08, 16]], sign: '🍬', signBg: '#fff' });
    P.line([1.6, 1.2, 10], [1.85, 1.2, 10], '#b0bec5', 3); P.line([1.85, 1.2, 10], [1.85, 1.2, 0], '#b0bec5', 3);
  };
  PAINT.xuongcokhi = function (P, b) {
    factory(P, b, { wall: '#b0bec5', rc: '#546e7a', roof: 'saw', H: 18, chim: [[0.5, 0.4, 0.1, 20]], sign: '⚙️' });
    P.box(1.68, 1.45, 1.92, 1.7, 0, 5, '#78909c'); P.box(1.68, 1.15, 1.92, 1.4, 0, 5, '#90a4ae');
  };
  PAINT.xuongmay = function (P, b) {
    factory(P, b, { wall: '#e1bee7', rc: '#8e24aa', roof: 'hip', H: 18, sign: '🧵' });
    P.awning(true, 1.55, 0.35, 1.45, 12, 0.16, '#ab47bc', '#f3e5f5');
  };
  PAINT.tiembanh = function (P, b) {
    var H = factory(P, b, { wall: '#ffe0ec', rc: '#ff8fb1', roof: 'flat', H: 18, sign: null, door: false });
    P.door(true, 1.55, 0.7, 1.0, 11, '#c2185b', { glow: true }); P.awning(true, 1.55, 0.3, 1.5, 13, 0.18, '#ff6f9f', '#ffffff');
    P.cyl(0.92, 0.88, 0.32, H + 2, H + 9, '#fff3e0', '#ffcdd2'); P.cyl(0.92, 0.88, 0.22, H + 9, H + 15, '#fff3e0', '#f48fb1'); P.circle(0.92, 0.88, H + 18, 2.4, '#e53935');
  };
  PAINT.nhahang = function (P, b) {
    factory(P, b, { wall: '#ffe9b0', rc: '#c62828', roof: 'hip', H: 18, sign: '🍽️', door: false, u1: 1.45 });
    P.door(true, 1.55, 0.7, 1.0, 11, '#6d4c41', { glow: true }); P.awning(true, 1.55, 0.25, 1.4, 13, 0.18, '#c62828', '#fff');
    [[1.75, 0.5], [1.75, 1.2]].forEach(function (c) { P.cyl(c[0], c[1], 0.12, 5, 6, '#ffffff'); P.line([c[0], c[1], 0], [c[0], c[1], 5], '#795548', 1.2); P.line([c[0], c[1], 6], [c[0], c[1], 16], '#bbb', 1); P.cone(c[0], c[1], 0.22, 14, 4, '#e53935'); });
  };
  PAINT.xuongnuoc = function (P, b) {
    factory(P, b, { wall: '#fff3e0', rc: '#ff9800', roof: 'flat', H: 18, u1: 1.25, sign: '🧃' });
    P.cyl(1.6, 0.7, 0.26, 0, 28, '#ffb74d'); P.cyl(1.6, 1.35, 0.22, 0, 22, '#aed581');
    P.line([1.25, 0.8, 16], [1.4, 0.7, 20], '#90a4ae', 2);
  };
  function pen(P, b, o) {
    P.slab(2, 2, o.ground || '#9ccc65', 0.8);
    if (o.pond) { P.poly([[0.3, 0.35, 0.6], [1.75, 0.3, 0.6], [1.7, 1.7, 0.6], [0.3, 1.65, 0.6]], P.grad([0.3, 0.3, 0], [1.7, 1.7, 0], '#4fc3f7', '#1976d2')); P.ell(0.9, 0.8, 0.6, 8, 3, 'rgba(255,255,255,.35)'); }
    if (o.house) {
      var hc = o.house;
      P.shadow(0.12, 0.12, 0.72, 0.72, 0.3);
      P.box(0.12, 0.12, 0.72, 0.72, 0, 12, hc[0]);
      P.poly([[0.32, 0.72, 0], [0.52, 0.72, 0], [0.52, 0.72, 8], [0.32, 0.72, 8]], '#4e342e');
      P.gable(0.12, 0.12, 0.72, 0.72, 12, 8, hc[1], 'u', hc[0]);
    }
    if (o.trough) P.box(1.2, 0.2, 1.75, 0.38, 0, 3.5, '#8d6e63', { t: o.trough });
    P.fence([[0.03, 0.03], [1.97, 0.03], [1.97, 1.97], [0.03, 1.97], [0.03, 0.03]], 6, o.fence);
    if (o.sign) P.sign(o.sign, 1.6, 1.95, 12, 11);
  }
  PAINT.chuongga = function (P, b) { pen(P, b, { ground: '#c5b07a', house: ['#e9b872', '#c0392b'], trough: '#e3c56a', sign: '🐔' }); };
  PAINT.chuongbo = function (P, b) { pen(P, b, { ground: '#8bc34a', house: ['#c62828', '#eeeeee'], trough: '#9ccc65', sign: '🐄' }); };
  PAINT.chuongvit = function (P, b) { pen(P, b, { ground: '#9ccc65', pond: true, house: null, sign: '🦆' }); P.box(0.15, 1.45, 0.55, 1.85, 0, 7, '#d7a86e'); P.gable(0.15, 1.45, 0.55, 1.85, 7, 5, '#8d6e63', 'u'); };
  PAINT.chuongcuu = function (P, b) { pen(P, b, { ground: '#aed581', house: ['#bcaaa4', '#5d4037'], trough: '#d4e157', sign: '🐑', fence: '#e0e0e0' }); };
  PAINT.traiong = function (P, b) {
    pen(P, b, { ground: '#c5e1a5', sign: '🐝' });
    for (var i = 0; i < 6; i++) { var u = 0.4 + (i % 3) * 0.55, v = 0.5 + Math.floor(i / 3) * 0.7; P.box(u - 0.14, v - 0.12, u + 0.14, v + 0.12, 0, 9, '#ffca28'); P.box(u - 0.17, v - 0.15, u + 0.17, v + 0.15, 9, 11, '#ffffff', { edge: false }); P.line([u - 0.14, v + 0.12, 3], [u + 0.14, v + 0.12, 3], '#f57f17', 0.8); P.line([u - 0.14, v + 0.12, 6], [u + 0.14, v + 0.12, 6], '#f57f17', 0.8); }
    for (var k = 0; k < 8; k++) P.circle(0.2 + (k * 0.23) % 1.6, 1.85, 3, 1.8, pick(['#ff80ab', '#ffeb3b', '#ffffff', '#b388ff'], k));
  };
  PAINT.aoca = function (P, b) { pen(P, b, { ground: '#a5d6a7', pond: true, sign: '🐟', fence: '#bcaaa4' }); P.box(1.5, 0.05, 1.95, 0.5, 0, 8, '#8d6e63'); P.gable(1.5, 0.05, 1.95, 0.5, 8, 5, '#6d4c41', 'v'); };

  /* ---- Dịch vụ ---- */
  PAINT.congvien = function (P, b) {
    P.slab(2, 2, '#8bd36a', 0.8);
    P.poly([[0.9, 0, 1], [1.1, 0, 1], [1.1, 2, 1], [0.9, 2, 1]], '#e6d3a8'); P.poly([[0, 0.9, 1], [2, 0.9, 1], [2, 1.1, 1], [0, 1.1, 1]], '#e6d3a8');
    P.poly([[1.25, 1.25, 1.1], [1.8, 1.25, 1.1], [1.8, 1.8, 1.1], [1.25, 1.8, 1.1]], P.grad([1.25, 1.25, 1], [1.8, 1.8, 1], '#81d4fa', '#29b6f6'));
    P.tree(0.45, 0.45, 0.9, '#43a047'); P.tree(1.5, 0.45, 0.8, '#66bb6a'); P.tree(0.45, 1.5, 0.85, '#4caf50');
    P.box(1.3, 0.75, 1.6, 0.82, 2, 4, '#8d6e63', { edge: false });
    for (var i = 0; i < 6; i++) P.circle(0.2 + i * 0.12, 1.85, 1.5, 1.6, pick(['#ff5252', '#ffeb3b', '#ff80ab'], i));
  };
  function civic(P, b, o) {
    P.slab(o.w || 2, o.w || 2, o.yard || '#d0d0d0', 1);
    var w = o.w || 2, u0 = o.u0 || 0.2, v0 = o.v0 || 0.2, u1 = o.u1 || w - 0.2, v1 = o.v1 || w - 0.35, f = o.f || 2, fh = o.fh || 12, H = f * fh;
    P.shadow(u0, v0, u1, v1, 0.5);
    P.box(u0, v0, u1, v1, 0, H, o.wall);
    P.grid(true, v1, u0 + 0.1, u1 - 0.1, 0, fh, f, Math.round((u1 - u0) * 2.5), { frame: '#fff', glass: o.glass || '#b3e5fc', cross: o.cross }, 4);
    P.grid(false, u1, v0 + 0.1, v1 - 0.1, 0, fh, f, Math.round((v1 - v0) * 2.5), { frame: '#fff', glass: o.glass || '#b3e5fc', cross: o.cross }, 8);
    if (o.door !== false) P.door(true, v1, (u0 + u1) / 2 - 0.15, (u0 + u1) / 2 + 0.15, 10, o.doorCol || '#5d4037', { glow: true });
    if (o.roof === 'hip') P.hip(u0, v0, u1, v1, H, o.rh || 10, o.rc, 0.3);
    else if (o.roof === 'gable') P.gable(u0, v0, u1, v1, H, o.rh || 12, o.rc, o.axis || 'u', o.wall);
    else P.box(u0, v0, u1, v1, H, H + 2.5, shade(o.wall, -0.15), { edge: false });
    if (o.sign) P.sign(o.sign, (u0 + u1) / 2, v1 + 0.02, H + 7, 14, o.signBg);
    return { H: H, u0: u0, v0: v0, u1: u1, v1: v1 };
  }
  PAINT.truonghoc = function (P, b) {
    var r = civic(P, b, { wall: '#ffe082', rc: '#e64a19', roof: 'hip', f: 2, sign: '🏫', u1: 1.75, v1: 1.5 });
    P.flag(1.85, 1.85, 0, '#e53935'); P.line([1.85, 1.85, 0], [1.85, 1.85, 30], '#cfd8dc', 1.4);
    P.circle(1.0, 1.5, r.H - 4, 3.2, '#ffffff', '#5d4037');
  };
  PAINT.cuuhoa = function (P, b) {
    var r = civic(P, b, { wall: '#e53935', rc: '#b71c1c', roof: 'flat', f: 2, sign: '🚒', door: false, glass: '#ffecb3' });
    for (var i = 0; i < 2; i++) { var a = 0.45 + i * 0.6; P.poly([[a, 1.65, 0], [a + 0.45, 1.65, 0], [a + 0.45, 1.65, 12], [a, 1.65, 12]], '#eeeeee'); for (var k = 1; k < 5; k++) P.line([a, 1.65, k * 2.5], [a + 0.45, 1.65, k * 2.5], '#bdbdbd', 0.6); }
    P.box(1.45, 0.2, 1.8, 0.55, r.H, r.H + 14, '#c62828'); P.hip(1.45, 0.2, 1.8, 0.55, r.H + 14, 5, '#424242');
  };
  PAINT.canhsat = function (P, b) {
    var r = civic(P, b, { wall: '#e3f2fd', rc: '#1565c0', roof: 'flat', f: 2, sign: '🚓', glass: '#90caf9' });
    P.box(0.2, 1.62, 1.8, 1.66, 4, 6, '#1565c0', { edge: false, ao: false });
    P.circle(1, 1, r.H + 6, 2.2, P.night ? '#ff1744' : '#ef5350'); P.circle(1.12, 1, r.H + 6, 2.2, P.night ? '#2979ff' : '#42a5f5');
  };
  PAINT.benhvien = function (P, b) {
    var r = civic(P, b, { wall: '#fafafa', rc: '#90a4ae', roof: 'flat', f: 3, fh: 11, sign: '🏥', glass: '#b2ebf2' });
    P.circle(1, 1, r.H + 3, 9, '#43a047'); P.emoji('H', 1, 1, r.H + 3, 11);
    P.poly([[0.75, 1.65, r.H - 7], [0.85, 1.65, r.H - 7], [0.85, 1.65, r.H - 3], [0.75, 1.65, r.H - 3]], '#e53935');
  };
  PAINT.thuvien = function (P, b) {
    P.slab(2, 2, '#d7ccc8', 1);
    P.shadow(0.25, 0.25, 1.75, 1.55, 0.4);
    P.box(0.25, 0.25, 1.75, 1.45, 0, 22, '#f5ecd9');
    for (var i = 0; i < 6; i++) P.cyl(0.38 + i * 0.25, 1.58, 0.05, 0, 22, '#ffffff');
    P.box(0.2, 0.2, 1.8, 1.7, 22, 25, '#e8dcc4');
    P.gable(0.2, 0.2, 1.8, 1.7, 25, 10, '#a1887f', 'u', '#efe6d2');
    P.box(0.1, 1.55, 1.9, 1.95, 0, 2, '#e0e0e0'); P.sign('📚', 1, 1.72, 31, 13);
  };
  PAINT.sanbong = function (P, b) {
    P.slab(3, 3, '#4caf50', 1);
    for (var i = 0; i < 6; i++) P.poly([[0.25 + i * 0.42, 0.25, 1.1], [0.46 + i * 0.42, 0.25, 1.1], [0.46 + i * 0.42, 2.75, 1.1], [0.25 + i * 0.42, 2.75, 1.1]], i % 2 ? '#5cbf60' : '#4caf50');
    P.poly([[0.25, 0.25, 1.2], [2.75, 0.25, 1.2], [2.75, 2.75, 1.2], [0.25, 2.75, 1.2]], null, '#ffffff', 1.2);
    P.line([1.5, 0.25, 1.2], [1.5, 2.75, 1.2], '#fff', 1.2); P.ell(1.5, 1.5, 1.2, 14, 7, 'rgba(255,255,255,0)');
    var q = P.p(1.5, 1.5, 1.2); P.g.beginPath(); P.g.ellipse(q[0], q[1], 14 * P.s * 1.4, 7 * P.s * 1.4, 0, 0, 7); P.g.strokeStyle = '#fff'; P.g.lineWidth = 1.2 * P.s; P.g.stroke();
    [[0.25, 1.5], [2.75, 1.5]].forEach(function (c) { P.line([c[0], c[1] - 0.3, 1], [c[0], c[1] - 0.3, 10], '#fff', 1.5); P.line([c[0], c[1] + 0.3, 1], [c[0], c[1] + 0.3, 10], '#fff', 1.5); P.line([c[0], c[1] - 0.3, 10], [c[0], c[1] + 0.3, 10], '#fff', 1.5); });
    P.box(0.05, 0.02, 2.95, 0.2, 0, 10, '#1e88e5'); for (var k = 0; k < 4; k++) P.box(0.05, 0.02 + k * 0.04, 2.95, 0.06 + k * 0.04, 10 - k * 2.5, 10 - k * 2.5 + 1, pick(['#e53935', '#fdd835', '#43a047', '#ffffff'], k), { edge: false });
  };
  PAINT.rapphim = function (P, b) {
    var r = civic(P, b, { wall: '#5e35b1', rc: '#311b92', roof: 'flat', f: 2, fh: 13, sign: '🎬', glass: '#d1c4e9', door: false });
    P.door(true, 1.65, 0.8, 1.2, 10, '#ffd54f', { glow: true });
    for (var i = 0; i < 9; i++) P.circle(0.3 + i * 0.17, 1.65, 15, 1.4, P.night ? '#fff176' : '#ffe082');
    P.box(0.5, 1.65, 1.5, 1.72, 16, 22, '#212121'); P.emoji('CINEMA', 1, 1.7, 19, 4.5);
  };
  PAINT.ttm = function (P, b) {
    P.slab(3, 3, '#bdbdbd', 1);
    for (var i = 0; i < 5; i++) P.line([2.2 + i * 0.15, 2.3, 1.2], [2.2 + i * 0.15, 2.9, 1.2], '#fff', 0.8);
    P.shadow(0.2, 0.2, 2.1, 2.2, 0.6);
    P.box(0.2, 0.2, 2.1, 2.2, 0, 30, '#90caf9', { l: P.grad([0, 2.2, 30], [0, 2.2, 0], '#bbdefb', '#64b5f6'), r: P.grad([2.1, 0, 30], [2.1, 0, 0], '#64b5f6', '#1e88e5') });
    for (var z = 10; z < 30; z += 10) { P.line([0.2, 2.2, z], [2.1, 2.2, z], 'rgba(255,255,255,.6)', 1); P.line([2.1, 2.2, z], [2.1, 0.2, z], 'rgba(255,255,255,.4)', 1); }
    P.box(0.2, 0.2, 2.1, 2.2, 30, 34, '#eceff1', { edge: false });
    P.box(0.7, 2.2, 1.6, 2.5, 0, 12, '#ffffff'); P.door(true, 2.5, 0.95, 1.35, 9, '#4fc3f7', { glow: true });
    P.sign('🛍️', 1.15, 2.2, 38, 16, '#fff');
    P.box(2.3, 0.3, 2.8, 0.8, 0, 3, '#ffffff'); P.tree(2.6, 1.3, 0.7, '#43a047');
  };
  PAINT.congviennuoc = function (P, b) {
    P.slab(3, 3, '#e0e0e0', 1);
    P.poly([[0.2, 0.2, 1.2], [1.9, 0.2, 1.2], [1.9, 1.4, 1.2], [0.2, 1.4, 1.2]], P.grad([0.2, 0.2, 1], [1.9, 1.4, 1], '#80deea', '#00acc1'));
    P.poly([[1.3, 1.7, 1.2], [2.8, 1.7, 1.2], [2.8, 2.8, 1.2], [1.3, 2.8, 1.2]], P.grad([1.3, 1.7, 1], [2.8, 2.8, 1], '#4dd0e1', '#0097a7'));
    P.box(2.2, 0.2, 2.7, 0.7, 0, 30, '#ff7043');
    var pts = []; for (var i = 0; i <= 20; i++) { var t = i / 20; pts.push([2.45 - t * 0.4 + Math.sin(t * 9) * 0.25, 0.7 + t * 1.3, 30 - t * 28]); }
    for (var k = 0; k + 1 < pts.length; k++) P.line(pts[k], pts[k + 1], pick(['#fdd835', '#ffb300'], k), 4.5);
    var pts2 = []; for (var j = 0; j <= 20; j++) { var s = j / 20; pts2.push([2.6 + Math.sin(s * 7) * 0.2, 0.7 + s * 1.6, 30 - s * 28]); }
    for (var m = 0; m + 1 < pts2.length; m++) P.line(pts2[m], pts2[m + 1], pick(['#e91e63', '#f06292'], m), 4.5);
    for (var n = 0; n < 4; n++) { P.cyl(0.4 + n * 0.4, 1.7, 0.02, 0, 10, '#fff'); P.cone(0.4 + n * 0.4, 1.7, 0.18, 9, 4, pick(['#ff5252', '#40c4ff', '#ffeb3b', '#69f0ae'], n)); }
  };
  PAINT.sanbay = function (P, b) {
    P.slab(3, 3, '#9e9e9e', 1);
    P.poly([[0.1, 1.9, 1.2], [2.9, 1.9, 1.2], [2.9, 2.7, 1.2], [0.1, 2.7, 1.2]], '#424242');
    for (var i = 0; i < 9; i++) P.line([0.3 + i * 0.3, 2.3, 1.3], [0.42 + i * 0.3, 2.3, 1.3], '#fff', 1.4);
    P.shadow(0.2, 0.2, 1.9, 1.3, 0.4);
    P.box(0.2, 0.2, 1.9, 1.3, 0, 16, '#e3f2fd', { l: P.grad([0, 1.3, 16], [0, 1.3, 0], '#bbdefb', '#90caf9') });
    P.grid(true, 1.3, 0.3, 1.8, 0, 16, 1, 6, { frame: '#fff', glass: '#4fc3f7', h: 0.6 }, 2);
    P.hip(0.2, 0.2, 1.9, 1.3, 16, 4, '#eceff1', 0.6);
    P.cyl(2.4, 0.6, 0.12, 0, 40, '#eceff1'); P.cyl(2.4, 0.6, 0.26, 40, 48, '#4fc3f7', '#eceff1'); P.cone(2.4, 0.6, 0.27, 48, 5, '#90a4ae');
    plane(P, 1.2, 1.6, 2, 0.9);
  };
  function plane(P, u, v, z, k) {
    k = k || 1; var w = '#ffffff';
    P.line([u - 0.45 * k, v, z + 4], [u + 0.45 * k, v, z + 4], w, 6 * k);
    P.line([u, v - 0.4 * k, z + 4], [u, v + 0.4 * k, z + 4], '#e0e0e0', 3 * k);
    P.line([u - 0.45 * k, v, z + 4], [u - 0.5 * k, v, z + 10], '#e53935', 2.5 * k);
    P.circle(u + 0.42 * k, v, z + 4, 1.5 * k, '#90caf9');
  }

  /* ---- Trang trí ---- */
  PAINT.bonhoa = function (P, b, v) { P.box(0.25, 0.25, 0.75, 0.75, 0, 4, '#bcaaa4'); P.diamond(0.3, 0.3, 0.7, 0.7, 4.2, '#6d4c41'); for (var i = 0; i < 6; i++) { var u = 0.35 + (i % 3) * 0.15, w = 0.4 + Math.floor(i / 3) * 0.2; P.line([u, w, 4], [u, w, 9], '#43a047', 1); P.circle(u, w, 10, 2.1, pick(['#ff5252', '#ffeb3b', '#ff80ab', '#ffffff', '#b388ff'], i + v)); } };
  PAINT.cayxanh = function (P, b, v) { P.tree(0.5, 0.5, 1, pick(['#43a047', '#4caf50', '#388e3c'], v)); };
  PAINT.caythong = function (P, b, v) { P.tree(0.5, 0.5, 1.1, '#2e7d32', 'pine'); };
  PAINT.caydua = function (P, b, v) { P.tree(0.5, 0.5, 1, '#43a047', 'palm'); };
  PAINT.cayphong = function (P, b, v) { P.tree(0.5, 0.5, 1.05, pick(['#e64a19', '#f57c00', '#d84315'], v)); };
  PAINT.anhdao = function (P, b, v) { P.tree(0.5, 0.5, 1.1, '#f48fb1'); P.circle(0.4, 0.5, 26, 1.4, '#fff'); P.circle(0.6, 0.4, 22, 1.4, '#fff'); };
  PAINT.bui = function (P, b, v) { for (var i = 0; i < 5; i++) P.ball(0.3 + (i % 3) * 0.2, 0.35 + Math.floor(i / 3) * 0.28, 4, 5, pick(['#43a047', '#558b2f'], i)); for (var k = 0; k < 7; k++) P.circle(0.28 + (k * 0.13) % 0.5, 0.3 + (k * 0.19) % 0.45, 8, 1.6, pick(['#e91e63', '#ff80ab', '#ffeb3b'], k + v)); };
  PAINT.hangrao = function (P, b, v, mask) {
    var c = '#d7a86e', pts = [];
    if (mask & 1) pts.push([[0.5, 0.5], [0.5, 0]]); if (mask & 2) pts.push([[0.5, 0.5], [1, 0.5]]); if (mask & 4) pts.push([[0.5, 0.5], [0.5, 1]]); if (mask & 8) pts.push([[0.5, 0.5], [0, 0.5]]);
    if (!pts.length) pts.push([[0.2, 0.5], [0.8, 0.5]]);
    pts.forEach(function (p) { P.fence(p, 7, c); });
  };
  PAINT.ghe = function (P) { P.box(0.25, 0.42, 0.75, 0.58, 3, 5, '#a1887f'); P.box(0.25, 0.42, 0.75, 0.47, 5, 10, '#8d6e63'); P.line([0.3, 0.55, 0], [0.3, 0.55, 3], '#5d4037', 1.5); P.line([0.7, 0.55, 0], [0.7, 0.55, 3], '#5d4037', 1.5); };
  PAINT.den = function (P) { P.line([0.5, 0.5, 0], [0.5, 0.5, 26], '#455a64', 2); P.line([0.5, 0.5, 26], [0.62, 0.5, 28], '#455a64', 1.6); P.ball(0.66, 0.5, 26, 3.2, P.night ? '#fff59d' : '#eceff1'); };
  PAINT.gieng = function (P) { P.cyl(0.5, 0.5, 0.28, 0, 8, '#9e9e9e', '#1e88e5'); P.line([0.25, 0.5, 8], [0.25, 0.5, 22], '#6d4c41', 2); P.line([0.75, 0.5, 8], [0.75, 0.5, 22], '#6d4c41', 2); P.gable(0.2, 0.3, 0.8, 0.7, 22, 6, '#c0392b', 'v'); };
  PAINT.cotco = function (P) { P.box(0.4, 0.4, 0.6, 0.6, 0, 3, '#bdbdbd'); P.line([0.5, 0.5, 3], [0.5, 0.5, 40], '#eceff1', 1.6); };
  PAINT.coixay = function (P) { P.cone(0.5, 0.5, 0.3, 0, 34, '#f5f5f5'); P.poly([[0.5, 0.78, 0], [0.62, 0.78, 0], [0.62, 0.78, 8], [0.5, 0.78, 8]], '#795548'); P.cone(0.5, 0.5, 0.18, 30, 10, '#e53935'); };
  PAINT.tramxe = function (P) { P.box(0.15, 0.35, 0.85, 0.42, 0, 15, '#90caf9', { l: 'rgba(144,202,249,.6)' }); P.box(0.1, 0.3, 0.9, 0.7, 15, 17, '#1565c0'); P.box(0.2, 0.5, 0.8, 0.6, 3, 5, '#8d6e63'); P.sign('🚏', 0.85, 0.7, 20, 8); };
  PAINT.tuongda = function (P) { P.box(0.25, 0.25, 0.75, 0.75, 0, 8, '#bdbdbd'); P.box(0.35, 0.35, 0.65, 0.65, 8, 26, '#9e9e9e'); P.ball(0.5, 0.5, 31, 6, '#a8a8a8'); P.ell(0.45, 0.62, 30, 1, 0.8, '#555'); P.ell(0.58, 0.62, 30, 1, 0.8, '#555'); };
  PAINT.denlong = function (P) { P.line([0.3, 0.5, 0], [0.3, 0.5, 24], '#5d4037', 1.6); P.line([0.7, 0.5, 0], [0.7, 0.5, 24], '#5d4037', 1.6); P.line([0.3, 0.5, 24], [0.7, 0.5, 24], '#5d4037', 1.6); P.ell(0.5, 0.5, 17, 4.5, 5.5, P.night ? '#ff5252' : '#e53935'); P.line([0.5, 0.5, 11], [0.5, 0.5, 8], '#ffd54f', 1.2); };
  PAINT.nguoituyet = function (P) { P.ball(0.5, 0.5, 6, 7, '#ffffff'); P.ball(0.5, 0.5, 16, 5, '#ffffff'); P.circle(0.46, 0.55, 17, 0.7, '#222'); P.circle(0.54, 0.55, 17, 0.7, '#222'); P.poly([[0.5, 0.56, 15], [0.62, 0.62, 14], [0.5, 0.58, 14]], '#ff9800'); P.box(0.42, 0.42, 0.58, 0.58, 20, 26, '#212121'); P.line([0.38, 0.6, 11], [0.62, 0.6, 11], '#e53935', 2); };
  PAINT.bongbay = function (P) { P.box(0.42, 0.42, 0.58, 0.58, 0, 3, '#8d6e63'); };
  PAINT.thongnoel = function (P) { P.tree(0.5, 0.5, 1.2, '#1b5e20', 'pine'); for (var i = 0; i < 8; i++) P.circle(0.38 + (i * 0.11) % 0.28, 0.5 + ((i * 0.07) % 0.12), 8 + i * 3.2, 1.3, pick(['#ff5252', '#ffeb3b', '#40c4ff', '#ff80ab'], i)); P.emoji('⭐', 0.5, 0.5, 46, 9); };
  PAINT.daiphun = function (P) { P.slab(2, 2, '#d7ccc8', 1); P.cyl(1, 1, 0.75, 1, 6, '#bdbdbd', '#4fc3f7'); P.cyl(1, 1, 0.12, 6, 18, '#e0e0e0'); P.cyl(1, 1, 0.32, 18, 20, '#e0e0e0', '#81d4fa'); for (var i = 0; i < 4; i++) P.tree([0.15, 1.85, 0.15, 1.85][i], [0.15, 0.15, 1.85, 1.85][i], 0.45, '#66bb6a'); };
  PAINT.cauvong = function (P) {
    P.slab(2, 2, '#c5e1a5', 0.8);
    var cols = ['#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#8e24aa'];
    cols.forEach(function (c, i) { var R = 0.85 - i * 0.07, pts = []; for (var k = 0; k <= 24; k++) { var a = Math.PI * k / 24; pts.push([1 - Math.cos(a) * R, 1 + 0.0, Math.sin(a) * R * 50]); } for (var j = 0; j + 1 < pts.length; j++) P.line(pts[j], pts[j + 1], c, 3.2); });
    P.ball(0.2, 1, 3, 6, '#ffffff'); P.ball(1.8, 1, 3, 6, '#ffffff');
  };
  PAINT.hokoi = function (P) { P.slab(2, 2, '#a5d6a7', 0.8); P.poly([[0.25, 0.3, 1.2], [1.7, 0.2, 1.2], [1.8, 1.7, 1.2], [0.3, 1.75, 1.2]], P.grad([0.2, 0.2, 1], [1.8, 1.8, 1], '#4dd0e1', '#00838f'), '#9e9e9e', 2); P.ball(1.75, 1.8, 3, 5, '#9e9e9e'); P.ball(0.2, 1.7, 2, 4, '#bdbdbd'); P.circle(0.8, 1.3, 1.6, 4, '#43a047'); P.circle(1.3, 0.6, 1.6, 3.5, '#66bb6a'); P.circle(0.82, 1.28, 2.6, 1.4, '#f48fb1'); };
  PAINT.tuongvang = function (P) { P.box(0.25, 0.25, 0.75, 0.75, 0, 7, '#eceff1'); P.box(0.35, 0.35, 0.65, 0.65, 7, 10, '#ffca28'); P.cyl(0.5, 0.5, 0.08, 10, 22, '#ffb300'); P.cyl(0.5, 0.5, 0.18, 22, 30, '#ffd54f', '#ffecb3'); P.line([0.32, 0.5, 26], [0.36, 0.5, 20], '#ffb300', 2); P.line([0.68, 0.5, 26], [0.64, 0.5, 20], '#ffb300', 2); };
  PAINT.khinhkhicau = function (P) { P.slab(2, 2, '#c5e1a5', 0.6); P.ell(1, 1, 0, 22, 10, 'rgba(0,0,0,.15)'); };
  PAINT.ngua = function (P) { P.slab(2, 2, '#ffe0b2', 0.8); P.cyl(1, 1, 0.8, 1, 4, '#ffcc80', '#ffe0b2'); };
  PAINT.thapdongho = function (P) { P.shadow(0.25, 0.25, 0.75, 0.75, 0.6); P.box(0.25, 0.25, 0.75, 0.75, 0, 42, '#d7ccc8'); P.circle(0.5, 0.76, 34, 5, '#ffffff', '#5d4037'); P.line([0.5, 0.76, 34], [0.5, 0.76, 37.5], '#333', 0.8); P.line([0.5, 0.76, 34], [0.56, 0.76, 34], '#333', 0.8); P.hip(0.25, 0.25, 0.75, 0.75, 42, 12, '#2e7d32', 0); };
  PAINT.vongquay = function (P) { P.slab(3, 3, '#e0e0e0', 1); P.box(1.1, 1.3, 1.9, 1.7, 0, 6, '#90a4ae'); };
  PAINT.caythan = function (P) { P.slab(2, 2, '#b39ddb', 0.8); P.cyl(1, 1, 0.16, 0, 22, '#8d6e63'); P.ball(0.8, 1.1, 32, 15, '#7e57c2'); P.ball(1.25, 0.85, 36, 14, '#9575cd'); P.ball(1, 1, 44, 13, '#b39ddb'); for (var i = 0; i < 10; i++) P.circle(0.6 + (i * 0.17) % 0.8, 0.6 + (i * 0.29) % 0.8, 28 + (i * 7) % 22, 1.8, pick(['#ffeb3b', '#ff80ab', '#80d8ff'], i)); };
  PAINT.tauluon = function (P) {
    P.slab(3, 3, '#cfd8dc', 1);
    var pts = []; for (var i = 0; i <= 60; i++) { var t = i / 60 * Math.PI * 2; pts.push([1.5 + Math.cos(t) * 1.15, 1.5 + Math.sin(t) * 1.15, 10 + Math.sin(t * 2) * 8 + Math.cos(t * 3) * 6 + 8]); }
    for (var k = 0; k < pts.length; k += 6) P.line([pts[k][0], pts[k][1], 0], pts[k], '#90a4ae', 1.4);
    for (var j = 0; j + 1 < pts.length; j++) { P.line(pts[j], pts[j + 1], '#e53935', 2.4); }
  };

  /* ---- Kỳ quan ---- */
  PAINT.chuamotcot = function (P, b) {
    P.slab(2, 2, '#a5d6a7', 0.8);
    P.poly([[0.2, 0.2, 1], [1.8, 0.2, 1], [1.8, 1.8, 1], [0.2, 1.8, 1]], P.grad([0.2, 0.2, 1], [1.8, 1.8, 1], '#80deea', '#26a69a'));
    P.circle(0.5, 1.5, 1.5, 4, '#66bb6a'); P.circle(1.5, 0.5, 1.5, 3.5, '#66bb6a'); P.circle(0.52, 1.48, 2.5, 1.6, '#f48fb1');
    P.cyl(1, 1, 0.1, 0, 18, '#bcaaa4');
    P.box(0.65, 0.65, 1.35, 1.35, 18, 21, '#8d6e63');
    P.box(0.75, 0.75, 1.25, 1.25, 21, 33, '#c62828'); P.winL(1.25, 0.88, 1.12, 24, 30, { frame: '#ffd54f', glass: '#5d4037' }); P.winR(1.25, 0.88, 1.12, 24, 30, { frame: '#ffd54f', glass: '#5d4037' });
    P.hip(0.58, 0.58, 1.42, 1.42, 33, 11, '#4e342e', 0.15);
    [[0.52, 0.52], [1.48, 0.52], [0.52, 1.48], [1.48, 1.48]].forEach(function (c) { P.line([c[0], c[1], 33], [c[0] - 0.08, c[1] - 0.08, 37], '#4e342e', 1.5); });
    P.emoji('✨', 1, 1, 50, 8); star(P, 1, 1, 58, b.l);
  };
  PAINT.thaprua = function (P, b) {
    P.slab(2, 2, '#4fc3f7', 0.6);
    P.poly([[0.1, 0.1, 0.7], [1.9, 0.1, 0.7], [1.9, 1.9, 0.7], [0.1, 1.9, 0.7]], P.grad([0, 0, 0], [2, 2, 0], '#4dd0e1', '#00897b'));
    P.ell(1, 1, 0.8, 26, 13, '#8d8d6e');
    var tiers = [[0.55, 1.45, 1, 14], [0.62, 1.38, 14, 25], [0.7, 1.3, 25, 34]];
    tiers.forEach(function (t, i) {
      P.box(t[0], t[0], t[1], t[1], t[2], t[3], '#d7ccc8');
      var n = 3 - i; for (var k = 0; k < n; k++) { var a = t[0] + (k + 0.5) * (t[1] - t[0]) / n; P.poly([[a - 0.06, t[1], t[2] + 2], [a + 0.06, t[1], t[2] + 2], [a + 0.06, t[1], t[3] - 3], [a, t[1], t[3] - 1], [a - 0.06, t[1], t[3] - 3]], '#5d4037'); P.poly([[t[1], a - 0.06, t[2] + 2], [t[1], a + 0.06, t[2] + 2], [t[1], a + 0.06, t[3] - 3], [t[1], a, t[3] - 1], [t[1], a - 0.06, t[3] - 3]], '#4e342e'); }
    });
    P.hip(0.7, 0.7, 1.3, 1.3, 34, 8, '#6d4c41', 0); P.circle(1, 1, 44, 1.6, '#ffca28');
    P.tree(0.35, 1.55, 0.5, '#43a047'); star(P, 1, 1, 52, b.l);
  };
  PAINT.eiffel = function (P, b) {
    P.slab(3, 3, '#cfd8dc', 1); P.poly([[0.4, 2.4, 1.1], [2.6, 2.4, 1.1], [2.6, 2.75, 1.1], [0.4, 2.75, 1.1]], '#a5d6a7');
    var C = '#8d6e63', L = function (a, b2, w) { P.line(a, b2, C, w || 1.6); };
    var feet = [[0.45, 0.45], [2.55, 0.45], [2.55, 2.55], [0.45, 2.55]], lvl = [[0, 0.95], [28, 0.55], [60, 0.25], [110, 0.06]];
    function at(l, f) { var r = lvl[l][1], c = [1.5 + (f[0] - 1.5) * r / 1.05, 1.5 + (f[1] - 1.5) * r / 1.05]; return [c[0], c[1], lvl[l][0]]; }
    for (var l = 0; l < 3; l++) for (var f = 0; f < 4; f++) { L(at(l, feet[f]), at(l + 1, feet[f]), 3 - l * 0.6); L(at(l, feet[f]), at(l + 1, feet[(f + 1) % 4]), 0.8); L(at(l + 1, feet[f]), at(l, feet[(f + 1) % 4]), 0.8); }
    [1, 2].forEach(function (l) { P.poly(feet.map(function (f) { return at(l, f); }), shade(C, 0.1)); });
    for (var g2 = 0; g2 < 4; g2++) { var a = at(0, feet[g2]), n = at(0, feet[(g2 + 1) % 4]); var m = [(a[0] + n[0]) / 2, (a[1] + n[1]) / 2, 14]; L(a, m, 1.2); L(m, n, 1.2); }
    P.line([1.5, 1.5, 110], [1.5, 1.5, 124], '#5d4037', 1.4); P.circle(1.5, 1.5, 125, 1.5, P.night ? '#fff176' : '#ffca28');
    star(P, 1.5, 1.5, 134, b.l);
  };
  PAINT.nuthan = function (P, b) {
    P.slab(2, 2, '#a5d6a7', 0.8);
    P.box(0.45, 0.45, 1.55, 1.55, 0, 10, '#bcaaa4'); P.box(0.65, 0.65, 1.35, 1.35, 10, 30, '#d7ccc8');
    var G = '#66b8a0';
    P.cyl(1, 1, 0.2, 30, 56, G); P.ball(1, 1, 60, 5, G);
    for (var i = 0; i < 7; i++) { var a = -Math.PI / 2 + (i - 3) * 0.35; P.line([1, 1, 63], [1 + Math.cos(a) * 0.12, 1 + Math.sin(a) * 0.04, 69], G, 1.6); }
    P.line([1.12, 0.95, 54], [1.25, 0.9, 74], G, 3); P.ball(1.27, 0.88, 77, 2.6, '#ffca28'); P.poly([[1.25, 0.88, 78], [1.3, 0.86, 84], [1.21, 0.88, 82]], '#ff9800');
    P.box(0.86, 1.05, 0.98, 1.17, 40, 47, '#5f9e89');
    star(P, 1, 1, 92, b.l);
  };
  PAINT.kimtuthap = function (P, b) {
    P.slab(3, 3, '#f2d48c', 1);
    var steps = 7, Hh = 64;
    for (var i = 0; i < steps; i++) { var a = 0.2 + i * 0.16, c = 2.8 - i * 0.16; P.box(a, a, c, c, i * Hh / steps, (i + 1) * Hh / steps, mix('#e0b862', '#c99a3f', i / steps), { edge: true }); }
    P.hip(0.2 + steps * 0.16, 0.2 + steps * 0.16, 2.8 - steps * 0.16, 2.8 - steps * 0.16, Hh, 10, '#ffd54f', 0);
    P.poly([[1.38, 2.8 - 0.16, 0], [1.62, 2.8 - 0.16, 0], [1.62, 2.8 - 0.16, 9], [1.38, 2.8 - 0.16, 9]], '#5d4037');
    P.tree(2.75, 0.3, 0.6, '#43a047', 'palm'); star(P, 1.5, 1.5, 84, b.l);
  };
  PAINT.pisa = function (P, b) {
    P.slab(2, 2, '#a5d6a7', 0.8);
    var g = P.g; g.save(); var q = P.p(1, 1, 0); g.translate(q[0], q[1]); g.rotate(0.08); g.translate(-q[0], -q[1]);
    for (var i = 0; i < 7; i++) { P.cyl(1, 1, 0.34 - (i === 6 ? 0.06 : 0), i * 11, i * 11 + 10, '#fafafa', '#eeeeee'); for (var k = 0; k < 6; k++) P.line([1 - 0.3 + k * 0.12, 1 + 0.34, i * 11 + 2], [1 - 0.3 + k * 0.12, 1 + 0.34, i * 11 + 9], 'rgba(0,0,0,.18)', 1); P.cyl(1, 1, 0.37, i * 11 + 10, i * 11 + 11, '#e0e0e0'); }
    P.cone(1, 1, 0.3, 77, 4, '#cfd8dc');
    g.restore(); star(P, 1, 1, 94, b.l);
  };
  PAINT.bigben = function (P, b) {
    P.slab(2, 2, '#bcaaa4', 1);
    P.shadow(0.6, 0.6, 1.4, 1.4, 1);
    P.box(0.6, 0.6, 1.4, 1.4, 0, 70, '#d4b483');
    for (var z = 8; z < 66; z += 8) { P.winL(1.4, 0.75, 0.9, z, z + 5, { frame: '#a1887f', glass: '#6d4c41' }); P.winL(1.4, 1.1, 1.25, z, z + 5, { frame: '#a1887f', glass: '#6d4c41' }); P.winR(1.4, 0.8, 1.2, z, z + 5, { frame: '#a1887f', glass: '#6d4c41' }); }
    P.box(0.55, 0.55, 1.45, 1.45, 70, 86, '#c9a46a');
    P.circle(1, 1.47, 78, 6.5, P.night ? '#fff59d' : '#ffffff', '#5d4037'); P.line([1, 1.47, 78], [1, 1.47, 82.5], '#222', 0.9); P.line([1, 1.47, 78], [1.08, 1.47, 77], '#222', 0.9);
    P.hip(0.55, 0.55, 1.45, 1.45, 86, 30, '#37474f', 0); P.line([1, 1, 116], [1, 1, 124], '#ffca28', 1.4);
    star(P, 1, 1, 132, b.l);
  };
  PAINT.landmark81 = function (P, b) {
    P.slab(2, 2, '#9e9e9e', 1);
    P.shadow(0.4, 0.4, 1.6, 1.6, 1.4);
    var segs = [[0.4, 1.6, 0, 40], [0.5, 1.5, 40, 75], [0.6, 1.4, 75, 105], [0.7, 1.3, 105, 128], [0.8, 1.2, 128, 145]];
    segs.forEach(function (s, i) {
      var c = '#7fb3d5'; P.box(s[0], s[0], s[1], s[1], s[2], s[3], c, { l: P.grad([0, s[1], s[3]], [0, s[1], s[2]], '#b3d9f2', '#6aa3c8'), r: P.grad([s[1], 0, s[3]], [s[1], 0, s[2]], '#5d8fb3', '#3f6f93') });
      for (var z = s[2] + 6; z < s[3]; z += 6) P.line([s[0], s[1], z], [s[1], s[1], z], P.night ? 'rgba(255,230,140,.7)' : 'rgba(255,255,255,.35)', 0.6);
      P.box(s[0] - 0.02, s[0] - 0.02, s[1] + 0.02, s[1] + 0.02, s[3], s[3] + 1.5, '#eceff1', { edge: false });
    });
    P.line([1, 1, 146], [1, 1, 172], '#eceff1', 1.8); P.circle(1, 1, 172, 2, P.night ? '#ff5252' : '#fafafa');
    star(P, 1, 1, 182, b.l);
  };
  PAINT.colosseum = function (P, b) {
    P.slab(3, 3, '#e6d3a8', 1);
    var g = P.g, c = P.p(1.5, 1.5, 0), rx = 1.3 * P.hw * SQ2, ry = 1.3 * P.hh * SQ2;
    for (var lv = 0; lv < 3; lv++) {
      var z0 = lv * 14, z1 = z0 + 13, k = 1 - lv * 0.03, q0 = P.p(1.5, 1.5, z0), q1 = P.p(1.5, 1.5, z1);
      var gr = g.createLinearGradient(c[0] - rx, 0, c[0] + rx, 0); gr.addColorStop(0, '#f0dcae'); gr.addColorStop(0.5, '#d9bf86'); gr.addColorStop(1, '#a88a55');
      g.beginPath(); g.ellipse(q0[0], q0[1], rx * k, ry * k, 0, 0, Math.PI); g.lineTo(q1[0] - rx * k, q1[1]); g.ellipse(q1[0], q1[1], rx * k, ry * k, 0, Math.PI, 0, true); g.closePath(); g.fillStyle = gr; g.fill();
      for (var i = 1; i < 16; i++) { var a = Math.PI * i / 16, x = q0[0] - Math.cos(a) * rx * k, y0 = q0[1] + Math.sin(a) * ry * k; g.fillStyle = 'rgba(70,45,20,.55)'; g.beginPath(); g.ellipse(x, y0 - 6.5 * P.s * (P.s ? 1 : 1) - (z1 - z0) * P.s * 0.25, 2 * P.s * Math.sin(a) + 0.6 * P.s, 4 * P.s, 0, 0, Math.PI * 2); g.fill(); }
    }
    var qt = P.p(1.5, 1.5, 42); g.beginPath(); g.ellipse(qt[0], qt[1], rx * 0.94, ry * 0.94, 0, 0, Math.PI * 2); g.fillStyle = '#c9ab72'; g.fill();
    g.beginPath(); g.ellipse(qt[0], qt[1] + 8 * P.s, rx * 0.62, ry * 0.62, 0, 0, Math.PI * 2); g.fillStyle = '#e8d29c'; g.fill();
    star(P, 1.5, 1.5, 58, b.l);
  };
  PAINT.truongthanh = function (P, b) {
    P.slab(3, 3, '#a5d6a7', 1);
    P.ball(0.7, 0.6, 6, 18, '#81c784'); P.ball(2.3, 2.3, 4, 14, '#81c784');
    var path = [[0.2, 2.6], [0.9, 1.9], [1.3, 2.2], [2.0, 1.2], [2.4, 1.5], [2.8, 0.4]];
    for (var i = 0; i + 1 < path.length; i++) {
      var a = path[i], c = path[i + 1], n = 6;
      for (var k = 0; k < n; k++) { var t0 = k / n, t1 = (k + 1) / n, u0 = a[0] + (c[0] - a[0]) * t0, v0 = a[1] + (c[1] - a[1]) * t0, u1 = a[0] + (c[0] - a[0]) * t1, v1 = a[1] + (c[1] - a[1]) * t1; P.box(Math.min(u0, u1) - 0.08, Math.min(v0, v1) - 0.08, Math.max(u0, u1) + 0.08, Math.max(v0, v1) + 0.08, 0, 14, '#bcaaa4', { edge: false }); }
    }
    path.forEach(function (p, j) { P.box(p[0] - 0.18, p[1] - 0.18, p[0] + 0.18, p[1] + 0.18, 0, 24, '#a1887f'); P.hip(p[0] - 0.22, p[1] - 0.22, p[0] + 0.22, p[1] + 0.22, 24, 7, '#6d4c41', 0.3); });
    star(P, 1.5, 1.5, 44, b.l);
  };
  PAINT.tenlua = function (P, b) {
    P.slab(2, 2, '#9e9e9e', 1); P.ell(1, 1, 1.1, 22, 11, '#616161');
    P.box(1.45, 0.4, 1.65, 0.6, 0, 80, '#ef6c00'); for (var z = 6; z < 80; z += 8) P.line([1.45, 0.6, z], [1.65, 0.6, z + 8], '#bf360c', 1);
    P.cyl(1, 1, 0.22, 4, 72, '#fafafa'); P.cyl(1, 1, 0.22, 52, 56, '#e53935'); P.cone(1, 1, 0.22, 72, 18, '#e53935');
    [[0.72, 1], [1.28, 1], [1, 1.28]].forEach(function (c) { P.poly([[c[0], c[1], 4], [c[0], c[1], 20], [c[0] + (c[0] - 1) * 0.6, c[1] + (c[1] - 1) * 0.6, 4]], '#c62828'); });
    P.circle(1, 1.22, 44, 3, '#4fc3f7', '#90a4ae');
    star(P, 1, 1, 100, b.l);
  };
  PAINT.taj = function (P, b) {
    P.slab(3, 3, '#f5f5f5', 1.5);
    P.poly([[1.35, 2.2, 1.6], [1.65, 2.2, 1.6], [1.65, 3, 1.6], [1.35, 3, 1.6]], '#4fc3f7');
    P.box(0.55, 0.55, 2.45, 2.2, 0, 28, '#fffaf2');
    [[0.55, 2.2], [2.45, 2.2]].forEach(function () {});
    P.poly([[1.25, 2.2, 0], [1.75, 2.2, 0], [1.75, 2.2, 22], [1.5, 2.2, 27], [1.25, 2.2, 22]], '#e8dccb');
    P.poly([[1.33, 2.2, 0], [1.67, 2.2, 0], [1.67, 2.2, 18], [1.5, 2.2, 22], [1.33, 2.2, 18]], '#b0a090');
    P.cyl(1.5, 1.4, 0.45, 28, 38, '#fffaf2');
    var q = P.p(1.5, 1.4, 38), g = P.g, R = 0.5 * P.hw * SQ2; var gr = g.createRadialGradient(q[0] - R * 0.3, q[1] - R * 0.8, R * 0.1, q[0], q[1] - R * 0.3, R * 1.2); gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#d8cfc0');
    g.beginPath(); g.moveTo(q[0] - R, q[1]); g.bezierCurveTo(q[0] - R * 1.2, q[1] - R * 1.1, q[0] - R * 0.2, q[1] - R * 1.5, q[0], q[1] - R * 1.9); g.bezierCurveTo(q[0] + R * 0.2, q[1] - R * 1.5, q[0] + R * 1.2, q[1] - R * 1.1, q[0] + R, q[1]); g.closePath(); g.fillStyle = gr; g.fill();
    [[0.3, 0.3], [2.7, 0.3], [0.3, 2.7], [2.7, 2.7]].forEach(function (c) { P.cyl(c[0], c[1], 0.1, 0, 52, '#fffaf2'); P.ball(c[0], c[1], 54, 3.2, '#f0e8da'); });
    star(P, 1.5, 1.4, 80, b.l);
  };

  /* ---- Công trình đặc biệt ---- */
  PAINT.toathi = function (P, b) {
    P.slab(3, 3, '#e0d6c2', 1.5);
    var lv = b.l, H = 26 + Math.min(16, (lv - 1) * 2);
    P.shadow(0.35, 0.4, 2.65, 2.3, 0.6);
    P.box(0.35, 0.4, 2.65, 2.3, 0, H, '#fbf3e4');
    P.grid(true, 2.3, 0.5, 2.55, 0, H / 2, 2, 6, { frame: '#fff', glass: '#9ad0f5' }, 2); P.grid(false, 2.65, 0.5, 2.2, 0, H / 2, 2, 5, { frame: '#fff', glass: '#9ad0f5' }, 4);
    P.box(1.0, 2.3, 2.0, 2.7, 0, 2, '#eeeeee');
    for (var i = 0; i < 5; i++) P.cyl(1.08 + i * 0.21, 2.5, 0.05, 2, 20, '#ffffff');
    P.box(0.98, 2.3, 2.02, 2.68, 20, 23, '#f0e6d2'); P.poly([[0.98, 2.68, 23], [2.02, 2.68, 23], [1.5, 2.68, 31]], '#e8dcc4');
    P.box(0.35, 0.4, 2.65, 2.3, H, H + 3, '#e9dcc3', { edge: false });
    P.cyl(1.5, 1.35, 0.5, H + 3, H + 15, '#fbf3e4');
    var q = P.p(1.5, 1.35, H + 15), g = P.g, R = 0.55 * P.hw * SQ2, gr = g.createRadialGradient(q[0] - R * 0.3, q[1] - R * 0.7, R * 0.1, q[0], q[1], R * 1.1);
    gr.addColorStop(0, lv >= 10 ? '#fff59d' : '#9fd3c7'); gr.addColorStop(1, lv >= 10 ? '#f9a825' : '#3f8f80');
    g.beginPath(); g.ellipse(q[0], q[1], R, R * 0.5, 0, 0, Math.PI); g.ellipse(q[0], q[1], R, R, 0, 0, Math.PI, true); g.closePath(); g.fillStyle = gr; g.fill();
    P.circle(1.5, 1.85, H + 10, 4, '#fff', '#5d4037');
    P.line([1.5, 1.35, H + 28], [1.5, 1.35, H + 42], '#cfd8dc', 1.4);
    P.flag(1.5, 1.35, H + 30, '#da251d'); P.emoji('★', 1.62, 1.31, H + 43.5, 4);
    star(P, 1.5, 1.35, H + 52, b.l);
  };
  PAINT.kho = function (P, b) {
    P.slab(2, 2, '#c8b88a', 1);
    var H = 18 + Math.min(14, (b.l - 1) * 1.5);
    P.shadow(0.2, 0.25, 1.8, 1.6, 0.5);
    P.box(0.2, 0.25, 1.8, 1.6, 0, H, '#c0392b');
    var d0 = 0.7, d1 = 1.3;
    P.poly([[d0, 1.6, 0], [d1, 1.6, 0], [d1, 1.6, H * 0.7], [d0, 1.6, H * 0.7]], '#f4f1ea');
    P.line([d0, 1.6, 0], [d1, 1.6, H * 0.7], '#c0392b', 1.6); P.line([d1, 1.6, 0], [d0, 1.6, H * 0.7], '#c0392b', 1.6); P.line([1, 1.6, 0], [1, 1.6, H * 0.7], '#c0392b', 1.2);
    P.winR(1.8, 0.7, 1.1, H * 0.55, H * 0.85, { frame: '#fff', cross: true });
    P.gable(0.2, 0.25, 1.8, 1.6, H, 14, '#5d4037', 'u', '#c0392b');
    P.line([0.2, 1.6, H], [1.8, 1.6, H], '#ffffff', 1.2);
    for (var i = 0; i < 3; i++) P.box(1.85, 0.3 + i * 0.25, 1.98, 0.5 + i * 0.25, 0, 6, '#e3b97c');
    P.sign('📦', 1, 1.62, H + 7, 12); star(P, 1, 0.9, H + 24, b.l);
  };
  PAINT.donhang = function (P, b) {
    P.slab(2, 2, '#9e9e9e', 1);
    for (var i = 0; i < 3; i++) P.line([0.3 + i * 0.5, 1.3, 1.1], [0.3 + i * 0.5, 1.9, 1.1], '#fff', 1);
    P.box(0.15, 0.15, 1.0, 0.95, 0, 16, '#ffb300'); P.hip(0.15, 0.15, 1.0, 0.95, 16, 6, '#e65100', 0.4);
    P.winL(0.95, 0.35, 0.8, 5, 12, { frame: '#fff' });
    P.line([1.3, 0.3, 0], [1.3, 0.3, 22], '#6d4c41', 1.6); P.line([1.8, 0.3, 0], [1.8, 0.3, 22], '#6d4c41', 1.6);
    P.box(1.2, 0.28, 1.9, 0.34, 12, 26, '#8d6e63'); for (var k = 0; k < 3; k++) P.box(1.28 + k * 0.2, 0.34, 1.42 + k * 0.2, 0.36, 16, 23, pick(['#fff9c4', '#ffffff', '#ffe0b2'], k), { edge: false });
    truck(P, 1.3, 1.25, '#1e88e5', 1);
    for (var j = 0; j < 2; j++) P.box(0.25 + j * 0.25, 1.2, 0.45 + j * 0.25, 1.4, 0, 8, '#d7a86e');
    star(P, 0.6, 0.6, 32, b.l);
  };
  function truck(P, u, v, col, k) {
    k = k || 1;
    P.box(u - 0.3 * k, v - 0.15 * k, u + 0.2 * k, v + 0.15 * k, 3, 14, '#eceff1');
    P.box(u + 0.2 * k, v - 0.15 * k, u + 0.42 * k, v + 0.15 * k, 3, 11, col);
    P.winR(u + 0.42 * k, v - 0.1 * k, v + 0.1 * k, 7, 10, { frame: col, glass: '#b3e5fc' });
    [[u - 0.18, v + 0.15], [u + 0.28, v + 0.15]].forEach(function (c) { P.circle(c[0], c[1], 2.5, 2.6, '#263238'); });
  }
  PAINT.cho = function (P, b) {
    P.slab(2, 2, '#d7ccc8', 1);
    var cols = [['#e53935', '#fff'], ['#43a047', '#fff'], ['#1e88e5', '#fff'], ['#fb8c00', '#fff']];
    [[0.5, 0.5], [1.5, 0.5], [0.5, 1.5], [1.5, 1.5]].forEach(function (c, i) {
      P.box(c[0] - 0.3, c[1] - 0.25, c[0] + 0.3, c[1] + 0.25, 0, 6, '#a1887f');
      for (var k = 0; k < 4; k++) P.circle(c[0] - 0.2 + k * 0.13, c[1], 7.5, 1.9, pick(['#ff5252', '#ffd54f', '#66bb6a', '#ff9800', '#ab47bc'], i + k));
      [[-0.28, -0.22], [0.28, -0.22], [0.28, 0.22], [-0.28, 0.22]].forEach(function (d) { P.line([c[0] + d[0], c[1] + d[1], 0], [c[0] + d[0], c[1] + d[1], 15], '#795548', 1); });
      var cc = cols[i];
      P.poly([[c[0] - 0.36, c[1] - 0.3, 15], [c[0] + 0.36, c[1] - 0.3, 15], [c[0], c[1], 21]], shade(cc[0], 0.15));
      P.poly([[c[0] - 0.36, c[1] + 0.3, 15], [c[0] + 0.36, c[1] + 0.3, 15], [c[0], c[1], 21]], cc[0]);
      P.poly([[c[0] + 0.36, c[1] - 0.3, 15], [c[0] + 0.36, c[1] + 0.3, 15], [c[0], c[1], 21]], shade(cc[0], -0.2));
      P.poly([[c[0] - 0.12, c[1] + 0.3, 15], [c[0] + 0.12, c[1] + 0.3, 15], [c[0], c[1], 21]], cc[1]);
    });
    star(P, 1, 1, 34, b.l);
  };

  /* ---------------- Sprite cache ---------------- */
  var cache = new Map(), cacheN = 0, CACHE_MAX = 700;
  function makeCanvas(w, h) { var c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
  /** Vẽ sprite: kind = 'b' (công trình) | 'obs' | 'field' | 'crop' | 'road' | 'path' | 'water' ; trả {cv, ox, oy} (ox, oy = vị trí gốc trong canvas) */
  function sprite(kind, id, o, s) {
    o = o || {};
    var w = o.w || 1, h = o.h || w, k = kind + '|' + id + '|' + (o.key || '') + '|' + s.toFixed(3) + '|' + (o.night ? 1 : 0);
    var hit = cache.get(k); if (hit) { cache.delete(k); cache.set(k, hit); return hit; }
    var top = (o.ht || 220) * s, padX = 16 * s, cw = (w + h) * HW * s + padX * 2, ch = top + (w + h) * HH * s + 12 * s;
    var cv = makeCanvas(cw, ch), g = cv.getContext('2d'), ox = h * HW * s + padX, oy = top;
    g.translate(ox, oy);
    if (o.flip) { g.translate(((w - h) / 2) * HW * s, 0); g.scale(-1, 1); g.translate(-((w - h) / 2) * HW * s, 0); }
    var P = new Pen(g, s, o.night);
    try {
      if (kind === 'b') { var f = PAINT[id]; if (f) f(P, o.b || { l: 1 }, o.v || 0, o.mask || 0); else { P.box(0.15, 0.15, w - 0.15, h - 0.15, 0, 16, '#bdbdbd'); P.sign(o.e || '?', w / 2, h - 0.1, 22, 14); } }
      else if (kind === 'obs') paintObs(P, id, o.v || 1);
      else if (kind === 'field') paintField(P);
      else if (kind === 'crop') paintCrop(P, id, o.stage, o.emoji);
      else if (kind === 'road') paintRoad(P, o.mask || 0);
      else if (kind === 'path') paintPath(P, o.mask || 0);
      else if (kind === 'water') paintWater(P, o.mask || 0);
    } catch (e) { /* vẽ lỗi: bỏ qua phần còn lại */ }
    // cắt phần trống phía trên để chọn (pick) chính xác & tiết kiệm bộ nhớ
    var cut = 0;
    try {
      var data = g.getImageData(0, 0, cv.width, Math.min(cv.height, Math.ceil(top))).data, W = cv.width;
      outer: for (var y = 0; y < Math.ceil(top); y += 2) { for (var x = 3; x < W * 4; x += 16) if (data[y * W * 4 + x] > 8) break outer; cut = y; }
    } catch (e2) { cut = 0; }
    if (cut > 4) { var c2 = makeCanvas(cv.width, cv.height - cut); c2.getContext('2d').drawImage(cv, 0, -cut); cv = c2; oy -= cut; }
    var sp = { cv: cv, ox: ox, oy: oy, s: s };
    cache.set(k, sp); cacheN++;
    if (cache.size > CACHE_MAX) { var it = cache.keys(); for (var i = 0; i < 80; i++) cache.delete(it.next().value); }
    return sp;
  }
  function clearCache() { cache.clear(); }
  /** Ảnh xem trước (canvas) cho cửa hàng */
  function thumb(kind, id, o, px) {
    o = o || {}; var w = o.w || 1, h = o.h || w, s = Math.min(px / ((w + h) * HW + 20), 1.2), sp = sprite(kind, id, Object.assign({}, o), s);
    var c = makeCanvas(px, px), g = c.getContext('2d'), sc = Math.min(px / sp.cv.width, px / sp.cv.height, 1);
    var dw = sp.cv.width * sc, dh = sp.cv.height * sc; g.drawImage(sp.cv, (px - dw) / 2, (px - dh) / 2 + Math.max(0, (px - dh) / 2 - px * 0.06), dw, dh);
    return c;
  }

  /* ---------------- Phần chuyển động (vẽ mỗi khung hình) ----------------
   * g đã đặt gốc tại đỉnh trên của nền công trình (pixel màn hình). t = giây.
   */
  function anim(g, s, id, t, o) {
    var P = new Pen(g, s, o && o.night), w = o && o.w || 1;
    switch (id) {
      case 'coixay': { var c = P.p(0.5, 0.78, 26); g.save(); g.translate(c[0], c[1]); g.rotate(t * 1.6); for (var i = 0; i < 4; i++) { g.rotate(Math.PI / 2); g.fillStyle = '#fff'; g.strokeStyle = '#8d6e63'; g.lineWidth = s; g.beginPath(); g.moveTo(0, 0); g.lineTo(3 * s, -2 * s); g.lineTo(3 * s, -20 * s); g.lineTo(-1 * s, -20 * s); g.closePath(); g.fill(); g.stroke(); } g.restore(); P.circle(0.5, 0.78, 26, 1.6, '#5d4037'); break; }
      case 'cotco': { var q = P.p(0.5, 0.5, 40); g.fillStyle = '#da251d'; g.beginPath(); g.moveTo(q[0], q[1]); for (var k = 0; k <= 10; k++) { var x = k * 1.6 * s; g.lineTo(q[0] + x, q[1] + Math.sin(t * 5 + k * 0.6) * 1.4 * s); } for (var k2 = 10; k2 >= 0; k2--) { var x2 = k2 * 1.6 * s; g.lineTo(q[0] + x2, q[1] + 10 * s + Math.sin(t * 5 + k2 * 0.6) * 1.4 * s); } g.closePath(); g.fill(); g.fillStyle = '#ffeb3b'; g.font = Math.round(7 * s) + 'px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('★', q[0] + 8 * s, q[1] + 5 * s + Math.sin(t * 5 + 5 * 0.6) * 1.4 * s); break; }
      case 'daiphun': { for (var j = 0; j < 14; j++) { var ph = (t * 1.2 + j / 14) % 1, a = j / 14 * Math.PI * 2, r = ph * 0.55; P.circle(1 + Math.cos(a) * r, 1 + Math.sin(a) * r, 20 + Math.sin(ph * Math.PI) * 14, 1.3 * s / s, 'rgba(180,230,255,' + (1 - ph) + ')'); } P.ell(1, 1, 20 + 13 + Math.sin(t * 6) * 1.5, 2.5, 5, 'rgba(200,240,255,.8)'); break; }
      case 'ngua': { var c2 = P.p(1, 1, 4); g.save(); for (var n = 0; n < 6; n++) { var aa = t * 0.9 + n / 6 * Math.PI * 2, uu = 1 + Math.cos(aa) * 0.6, vv = 1 + Math.sin(aa) * 0.6, bob = Math.sin(t * 3 + n) * 2.5; P.line([uu, vv, 4], [uu, vv, 26], '#ffd54f', 1.2); P.ball(uu, vv, 12 + bob, 4, pick(['#ffffff', '#f8bbd0', '#bbdefb', '#fff59d'], n)); P.circle(uu + 0.06, vv - 0.04, 15 + bob, 2, pick(['#ffffff', '#f8bbd0', '#bbdefb', '#fff59d'], n)); } g.restore(); P.cyl(1, 1, 0.1, 4, 28, '#ffca28'); P.cone(1, 1, 0.85, 28, 12, '#e53935'); P.cone(1, 1, 0.85, 28, 12, 'rgba(255,255,255,0)'); for (var st2 = 0; st2 < 8; st2++) { var a2 = st2 / 8 * Math.PI * 2; P.line([1 + Math.cos(a2) * 0.85, 1 + Math.sin(a2) * 0.85, 28], [1, 1, 40], 'rgba(255,255,255,.7)', 1.6); } P.flag(1, 1, 40, '#ffeb3b'); if (o && o.night) for (var lb = 0; lb < 10; lb++) { var a3 = lb / 10 * Math.PI * 2 + t; P.circle(1 + Math.cos(a3) * 0.85, 1 + Math.sin(a3) * 0.85, 28, 1.4, '#fff59d'); } void c2; break; }
      case 'khinhkhicau': { var bob2 = Math.sin(t * 1.3) * 4 + 30, cols = ['#e53935', '#ffeb3b', '#43a047', '#1e88e5']; P.line([0.9, 0.9, 0], [0.95, 0.95, bob2], 'rgba(120,80,40,.6)', 0.8); var q2 = P.p(1, 1, bob2 + 22), R = 15 * s; for (var cI = 0; cI < 4; cI++) { g.beginPath(); g.ellipse(q2[0], q2[1], R * (1 - cI * 0.25), R * 1.15, 0, 0, Math.PI * 2); g.fillStyle = cols[cI]; g.fill(); } var qb = P.p(1, 1, bob2); g.fillStyle = '#8d6e63'; g.fillRect(qb[0] - 4 * s, qb[1] - 4 * s, 8 * s, 6 * s); g.strokeStyle = '#6d4c41'; g.lineWidth = 0.8 * s; g.beginPath(); g.moveTo(qb[0] - 4 * s, qb[1] - 4 * s); g.lineTo(q2[0] - R * 0.7, q2[1] + R * 0.8); g.moveTo(qb[0] + 4 * s, qb[1] - 4 * s); g.lineTo(q2[0] + R * 0.7, q2[1] + R * 0.8); g.stroke(); break; }
      case 'vongquay': { var cc = P.p(1.5, 1.5, 52), RR = 44 * s; P.line([1.2, 1.5, 0], [1.5, 1.5, 52], '#78909c', 3); P.line([1.8, 1.5, 0], [1.5, 1.5, 52], '#78909c', 3); g.strokeStyle = '#eceff1'; g.lineWidth = 2.4 * s; g.beginPath(); g.ellipse(cc[0], cc[1], RR * 0.72, RR, 0, 0, Math.PI * 2); g.stroke(); for (var sp2 = 0; sp2 < 12; sp2++) { var an = t * 0.35 + sp2 / 12 * Math.PI * 2, x3 = cc[0] + Math.cos(an) * RR * 0.72, y3 = cc[1] + Math.sin(an) * RR; g.strokeStyle = 'rgba(236,239,241,.8)'; g.lineWidth = 1 * s; g.beginPath(); g.moveTo(cc[0], cc[1]); g.lineTo(x3, y3); g.stroke(); g.fillStyle = pick(['#e53935', '#fdd835', '#43a047', '#1e88e5', '#8e24aa', '#fb8c00'], sp2); g.beginPath(); g.ellipse(x3, y3 + 4 * s, 4.5 * s, 4 * s, 0, 0, Math.PI * 2); g.fill(); if (o && o.night) { g.fillStyle = 'rgba(255,245,157,.9)'; g.beginPath(); g.arc(x3, y3, 1.4 * s, 0, 7); g.fill(); } } g.fillStyle = '#90a4ae'; g.beginPath(); g.arc(cc[0], cc[1], 4 * s, 0, 7); g.fill(); break; }
      case 'tauluon': { for (var cr = 0; cr < 4; cr++) { var tt = (t * 0.25 + cr * 0.02) % 1 * Math.PI * 2, pu = 1.5 + Math.cos(tt) * 1.15, pv = 1.5 + Math.sin(tt) * 1.15, pz = 10 + Math.sin(tt * 2) * 8 + Math.cos(tt * 3) * 6 + 8; P.ball(pu, pv, pz + 3, 3.2, cr ? '#ffeb3b' : '#1e88e5'); } break; }
      case 'hokoi': { for (var f = 0; f < 4; f++) { var at = t * (0.5 + f * 0.1) + f * 1.7, fu = 1 + Math.cos(at) * 0.5, fv = 1 + Math.sin(at * 1.3) * 0.45; P.ell(fu, fv, 1.4, 3, 1.6, pick(['#ff7043', '#ffffff', '#ffb300', '#f44336'], f)); } break; }
      case 'caythan': case 'anhdao': case 'thongnoel': case 'denlong': { var cnt = id === 'caythan' ? 6 : 3; for (var sp3 = 0; sp3 < cnt; sp3++) { var ph2 = (t * 0.4 + sp3 / cnt) % 1, u3 = (id === 'caythan' ? 0.6 : 0.3) + ((sp3 * 0.37) % 0.6) * (id === 'caythan' ? 1.4 : 0.7), z3 = (id === 'caythan' ? 50 : 26) - ph2 * 24; var col = id === 'anhdao' ? 'rgba(255,170,200,' : id === 'caythan' ? 'rgba(255,240,120,' : 'rgba(255,230,140,'; P.circle(u3, u3 * 0.9 + 0.1, z3, id === 'anhdao' ? 1.6 : 1.2, col + (1 - ph2) + ')'); } break; }
      case 'bongbay': { var cl = ['#e53935', '#fdd835', '#1e88e5', '#43a047', '#ab47bc']; for (var bI = 0; bI < 5; bI++) { var bx = 0.5 + Math.sin(t * 1.2 + bI) * 0.06 + (bI - 2) * 0.07, bz = 26 + bI % 2 * 6 + Math.sin(t * 2 + bI) * 1.5; P.line([0.5, 0.5, 3], [bx, 0.5, bz - 4], 'rgba(80,80,80,.5)', 0.5); P.ell(bx, 0.5, bz, 3.4, 4.2, cl[bI]); P.circle(bx - 0.02, 0.48, bz + 1.6, 0.9, 'rgba(255,255,255,.6)'); } break; }
      case 'nuoc': { var r = rnd(o.seed || 1); for (var sp4 = 0; sp4 < 2; sp4++) { var ph3 = (t * 0.5 + r()) % 1; P.circle(0.25 + r() * 0.5, 0.25 + r() * 0.5, 0, 0.6 + ph3 * 1.5, 'rgba(255,255,255,' + (0.6 * (1 - ph3)) + ')'); } break; }
      case 'tenlua': { if (o && o.night) { P.circle(1, 1, 30, 1.6, Math.sin(t * 4) > 0 ? '#ff5252' : '#ffd54f'); } var fl = 4 + Math.sin(t * 20) * 1.5; P.ell(1, 1, 2 - fl * 0.2, 4, fl, 'rgba(255,170,60,.0)'); break; }
      case 'sanbay': { var ph5 = (t * 0.08) % 1; if (ph5 < 0.5) { var pu2 = 0.2 + ph5 * 5.4; if (pu2 < 2.8) plane(P, pu2, 2.3, 1 + Math.max(0, pu2 - 1.8) * 30, 0.7); } P.circle(2.4, 0.6, 46, 1.3, Math.sin(t * 3) > 0 ? '#ff5252' : '#ffffff'); break; }
    }
  }
  /** Khói ống khói */
  function smoke(g, s, x, y, t, seed) {
    for (var i = 0; i < 5; i++) {
      var ph = (t * 0.35 + i / 5 + (seed % 7) / 7) % 1, r = (3 + ph * 7) * s;
      g.fillStyle = 'rgba(235,235,235,' + (0.55 * (1 - ph)) + ')';
      g.beginPath(); g.arc(x + Math.sin(ph * 6 + seed) * 3 * s + ph * 8 * s, y - ph * 34 * s, r, 0, Math.PI * 2); g.fill();
    }
  }

  /* ---- Con vật trong chuồng ---- */
  function animal(g, s, kind, x, y, t, dir, seed) {
    var P = new Pen(g, s, false); g.save(); g.translate(x, y); if (dir < 0) g.scale(-1, 1);
    var bob = Math.abs(Math.sin(t * 6 + seed)) * 1.2 * s;
    function e(cx, cy, rx, ry, col) { g.beginPath(); g.ellipse(cx * s, cy * s - bob, rx * s, ry * s, 0, 0, Math.PI * 2); g.fillStyle = col; g.fill(); }
    g.fillStyle = 'rgba(0,0,0,.18)'; g.beginPath(); g.ellipse(0, 1 * s, 6 * s, 2 * s, 0, 0, 7); g.fill();
    if (kind === 'chuongga') { e(0, -4, 4.5, 3.8, '#ffffff'); e(3.5, -8, 2.4, 2.4, '#ffffff'); e(4.2, -10.3, 1.2, 1, '#e53935'); g.fillStyle = '#ff9800'; g.fillRect(5.6 * s, -8.4 * s - bob, 1.8 * s, 1 * s); e(4.2, -8.4, 0.5, 0.5, '#222'); }
    else if (kind === 'chuongbo') { e(0, -6, 7, 4.5, '#ffffff'); e(-2, -7, 2.2, 1.8, '#333'); e(2.5, -5, 1.8, 1.4, '#333'); e(7, -8, 3, 2.6, '#ffffff'); e(8.5, -7, 1.6, 1.2, '#f8bbd0'); g.fillStyle = '#444'; g.fillRect(-5 * s, -3 * s - bob, 1.4 * s, 4 * s); g.fillRect(3.5 * s, -3 * s - bob, 1.4 * s, 4 * s); }
    else if (kind === 'chuongvit') { e(0, -3.5, 4.8, 3, '#ffffff'); e(3.6, -7, 2.2, 2.2, '#ffffff'); g.fillStyle = '#ffb300'; g.fillRect(5.3 * s, -7.2 * s - bob, 2.4 * s, 1.2 * s); e(4, -7.5, 0.5, 0.5, '#222'); }
    else if (kind === 'chuongcuu') { for (var i = 0; i < 6; i++) e(-3 + (i % 3) * 3, -6 - Math.floor(i / 3) * 2.5, 3, 2.8, '#f5f5f5'); e(5.5, -7, 2.3, 2.6, '#424242'); g.fillStyle = '#424242'; g.fillRect(-3 * s, -3 * s - bob, 1.2 * s, 3.5 * s); g.fillRect(2.5 * s, -3 * s - bob, 1.2 * s, 3.5 * s); }
    else if (kind === 'traiong') { e(0, -14 - Math.sin(t * 9 + seed) * 4, 1.6, 1.2, '#ffca28'); e(-0.3, -15.5 - Math.sin(t * 9 + seed) * 4, 1.4, 0.7, 'rgba(255,255,255,.8)'); }
    else if (kind === 'aoca') { e(0, 0, 3.5, 1.6, pick(['#ff7043', '#ffb300', '#ffffff'], seed)); g.fillStyle = pick(['#ff7043', '#ffb300', '#ffffff'], seed); g.beginPath(); g.moveTo(-3 * s, 0); g.lineTo(-6 * s, -2 * s); g.lineTo(-6 * s, 2 * s); g.fill(); }
    g.restore(); void P;
  }

  /* ---- Xe cộ / người / pet (vẽ tại toạ độ màn hình, hướng d: 0=+u(dưới-phải) 1=+v(dưới-trái) 2=−u(trên-trái) 3=−v(trên-phải)) ---- */
  var CAR_COL = { car: ['#e53935', '#1e88e5', '#43a047', '#fdd835', '#8e24aa', '#ff7043', '#eceff1', '#455a64'], taxi: ['#ffc107'], xebuyt: ['#ff9800'], xekem: ['#f8bbd0'], xecuuhoa: ['#d32f2f'], xecanhsat: ['#eceff1'], xedua: ['#00e676'], xetai: ['#1e88e5'] };
  function car(g, s, x, y, d, type, seed, night) {
    var P = new Pen(g, s, night), col = pick(CAR_COL[type] || CAR_COL.car, seed), L = type === 'xebuyt' ? 0.34 : type === 'xekem' || type === 'xecuuhoa' ? 0.27 : 0.2, W = 0.11, H = type === 'xebuyt' ? 11 : type === 'xekem' || type === 'xecuuhoa' ? 9 : 6;
    g.save(); g.translate(x, y);
    var alongU = d === 0 || d === 2, u0 = alongU ? -L : -W, u1 = alongU ? L : W, v0 = alongU ? -W : -L, v1 = alongU ? W : L;
    P.poly([[u0, v0, 0], [u1, v0, 0], [u1, v1, 0], [u0, v1, 0]], 'rgba(0,0,0,.25)');
    P.box(u0, v0, u1, v1, 1.5, H * 0.6, col, { edge: false, ao: false });
    var c0 = alongU ? [u0 + L * 0.5, v0, u1 - L * 0.35, v1] : [u0, v0 + L * 0.5, u1, v1 - L * 0.35];
    if (d === 2) c0 = [u0 + L * 0.35, v0, u1 - L * 0.5, v1]; if (d === 3) c0 = [u0, v0 + L * 0.35, u1, v1 - L * 0.5];
    if (type !== 'xebuyt') P.box(c0[0], c0[1], c0[2], c0[3], H * 0.6, H, shade(col, 0.1), { l: '#b3e5fc', r: '#81d4fa', edge: false, ao: false });
    else { P.box(u0, v0, u1, v1, H * 0.6, H, col, { l: '#b3e5fc', r: '#81d4fa', edge: false, ao: false }); P.diamond(u0, v0, u1, v1, H, shade(col, 0.15)); }
    if (type === 'taxi') P.box(-0.04, -0.03, 0.04, 0.03, H, H + 2, '#212121', { edge: false, ao: false });
    if (type === 'xecuuhoa' || type === 'xecanhsat') { var on = Math.floor(Date.now() / 250) % 2; P.circle(0, 0, H + 1.5, 1.3, on ? '#ff1744' : '#2979ff'); }
    if (type === 'xekem') P.emoji('🍦', 0, 0, H + 5, 7);
    if (night) { var hd = [[1, 0], [0, 1], [-1, 0], [0, -1]][d], fu = hd[0] * (L + 0.02), fv = hd[1] * (L + 0.02); P.circle(fu, fv, 3, 1.4, '#fff9c4'); g.globalCompositeOperation = 'lighter'; P.circle(fu + hd[0] * 0.2, fv + hd[1] * 0.2, 1, 6, 'rgba(255,240,180,.25)'); g.globalCompositeOperation = 'source-over'; }
    g.restore();
  }
  function walker(g, s, x, y, t, kind, seed) {
    var c = pick(['#e53935', '#1e88e5', '#43a047', '#fdd835', '#8e24aa', '#ff7043', '#00acc1'], seed), b = Math.abs(Math.sin(t * 8 + seed)) * 1.2 * s;
    g.fillStyle = 'rgba(0,0,0,.2)'; g.beginPath(); g.ellipse(x, y, 3 * s, 1.2 * s, 0, 0, 7); g.fill();
    if (kind === 'chocon' || kind === 'meocon') {
      var col = kind === 'chocon' ? '#c58b4e' : '#9e9e9e';
      g.fillStyle = col; g.beginPath(); g.ellipse(x, y - 3 * s - b, 3.6 * s, 2.2 * s, 0, 0, 7); g.fill(); g.beginPath(); g.arc(x + 3 * s, y - 5.5 * s - b, 2 * s, 0, 7); g.fill();
      g.fillStyle = '#222'; g.beginPath(); g.arc(x + 3.8 * s, y - 5.8 * s - b, 0.5 * s, 0, 7); g.fill(); return;
    }
    g.fillStyle = c; g.fillRect(x - 1.6 * s, y - 7 * s - b, 3.2 * s, 5 * s);
    g.fillStyle = '#5d4037'; g.fillRect(x - 1.3 * s, y - 2.2 * s, 1 * s, 2.2 * s); g.fillRect(x + 0.3 * s, y - 2.2 * s, 1 * s, 2.2 * s);
    g.fillStyle = '#ffcc99'; g.beginPath(); g.arc(x, y - 9 * s - b, 2.1 * s, 0, 7); g.fill();
    g.fillStyle = pick(['#3e2723', '#212121', '#f9a825', '#6d4c41'], seed >> 2); g.beginPath(); g.arc(x, y - 9.8 * s - b, 2.1 * s, Math.PI, 0); g.fill();
  }
  function flyer(g, s, x, y, kind, t, dir) {
    g.save(); g.translate(x, y); if (dir < 0) g.scale(-1, 1);
    if (kind === 'maybay') { g.fillStyle = '#fafafa'; g.beginPath(); g.ellipse(0, 0, 22 * s, 4 * s, -0.1, 0, 7); g.fill(); g.fillStyle = '#e0e0e0'; g.beginPath(); g.moveTo(-2 * s, 0); g.lineTo(-10 * s, 12 * s); g.lineTo(-4 * s, 12 * s); g.lineTo(6 * s, 0); g.fill(); g.fillStyle = '#e53935'; g.beginPath(); g.moveTo(-20 * s, -1 * s); g.lineTo(-25 * s, -10 * s); g.lineTo(-17 * s, -2 * s); g.fill(); g.fillStyle = '#4fc3f7'; for (var i = 0; i < 6; i++) g.fillRect((-10 + i * 4) * s, -1.6 * s, 2 * s, 1.6 * s); }
    else if (kind === 'tructhang') { g.fillStyle = '#ef5350'; g.beginPath(); g.ellipse(0, 0, 9 * s, 6 * s, 0, 0, 7); g.fill(); g.fillRect(-20 * s, -2 * s, 13 * s, 3 * s); g.fillStyle = '#b3e5fc'; g.beginPath(); g.ellipse(4 * s, -1 * s, 4 * s, 3.5 * s, 0, 0, 7); g.fill(); g.strokeStyle = '#424242'; g.lineWidth = 1.4 * s; var a = Math.sin(t * 40) * 16 * s; g.beginPath(); g.moveTo(-a, -8 * s); g.lineTo(a, -8 * s); g.stroke(); g.beginPath(); g.moveTo(0, -6 * s); g.lineTo(0, -8 * s); g.stroke(); }
    else if (kind === 'ufo') { g.fillStyle = 'rgba(160,255,200,.25)'; g.beginPath(); g.moveTo(-6 * s, 2 * s); g.lineTo(6 * s, 2 * s); g.lineTo(14 * s, 40 * s); g.lineTo(-14 * s, 40 * s); g.fill(); g.fillStyle = '#b0bec5'; g.beginPath(); g.ellipse(0, 0, 16 * s, 5 * s, 0, 0, 7); g.fill(); g.fillStyle = '#80deea'; g.beginPath(); g.ellipse(0, -3 * s, 7 * s, 6 * s, 0, Math.PI, 0); g.fill(); for (var k = 0; k < 5; k++) { g.fillStyle = (Math.floor(t * 6) + k) % 2 ? '#ffeb3b' : '#ff4081'; g.beginPath(); g.arc((-10 + k * 5) * s, 1.5 * s, 1.3 * s, 0, 7); g.fill(); } }
    else if (kind === 'rong') { var fl = Math.sin(t * 6); g.fillStyle = '#43a047'; for (var j = 0; j < 7; j++) { g.beginPath(); g.arc(-j * 5 * s, Math.sin(t * 3 + j * 0.8) * 3 * s, (5 - j * 0.5) * s, 0, 7); g.fill(); } g.fillStyle = '#66bb6a'; g.beginPath(); g.moveTo(-6 * s, 0); g.quadraticCurveTo(-12 * s, -18 * s * fl, -22 * s, -14 * s * fl); g.lineTo(-10 * s, 0); g.fill(); g.fillStyle = '#2e7d32'; g.beginPath(); g.ellipse(6 * s, -2 * s, 6 * s, 4.5 * s, 0.2, 0, 7); g.fill(); g.fillStyle = '#ffeb3b'; g.beginPath(); g.arc(8 * s, -4 * s, 1.2 * s, 0, 7); g.fill(); g.fillStyle = '#ffca28'; g.beginPath(); g.moveTo(4 * s, -6 * s); g.lineTo(2 * s, -11 * s); g.lineTo(6 * s, -7 * s); g.fill(); if (Math.sin(t * 2) > 0.7) { g.fillStyle = 'rgba(255,120,30,.8)'; g.beginPath(); g.moveTo(12 * s, -1 * s); g.lineTo(26 * s, -5 * s); g.lineTo(26 * s, 4 * s); g.fill(); } }
    else if (kind === 'chim') { var w = Math.sin(t * 10) * 3 * s; g.strokeStyle = '#37474f'; g.lineWidth = 1.2 * s; g.beginPath(); g.moveTo(-4 * s, -w); g.quadraticCurveTo(-2 * s, 0, 0, 0); g.quadraticCurveTo(2 * s, 0, 4 * s, -w); g.stroke(); }
    g.restore();
  }

  window.CityArt = {
    TW: TW, TH: TH, HW: HW, HH: HH, Pen: Pen, PAINT: PAINT, sprite: sprite, thumb: thumb, clearCache: clearCache, anim: anim, smoke: smoke, animal: animal, car: car, walker: walker, flyer: flyer,
    groundTile: groundTile, groundTheme: groundTheme, shade: shade, mix: mix, rgba: rgba, hsh: hsh, rnd: rnd, CROP_COL: CROP_COL,
    // độ cao ước lượng (px gốc) để cấp đủ chỗ cho sprite
    height: function (id, l) { var big = { chocroi: 340, landmark81: 200, eiffel: 150, bigben: 145, caooc: 230, chungcu: 160, laudai: 125, tenlua: 115, pisa: 105, nuthan: 100, taj: 95, kimtuthap: 95, toathi: 110, vongquay: 110 }; return (big[id] || 90) + 30; },
    smokeAt: { lobanh: [[1.3, 0.45, 32]], logach: [[1.35, 0.6, 44]], nhamayduong: [[0.45, 0.4, 38], [0.75, 0.4, 32]], xuongcokhi: [[0.5, 0.4, 38]], nhago: [[0.67, 0.35, 26]] }
  };
})();

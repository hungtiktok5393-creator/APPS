/* Nhà Thầy Hưng – nút chuyển giao diện Sáng / Tối dùng chung cho mọi trang (giáo viên, học sinh, phụ huynh, trang làm bài).
 * Nạp ở <head> (không defer) để áp màu ngay, tránh nháy trắng. Lựa chọn lưu ở localStorage 'sm_theme' ("auto" | "light" | "dark"),
 * dùng chung với Cài đặt của giáo viên (app.js đọc / ghi cùng khóa này).
 * Nút tự gắn vào thanh trên cùng (.topbar). Trang làm bài (ẩn thanh trên) tự đặt nút bằng SMTheme.button(). */
(function () {
  'use strict';
  var KEY = 'sm_theme', root = document.documentElement, btns = [];
  function read() {
    var v = null;
    try { v = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (_) {}
    if (v !== 'light' && v !== 'dark' && v !== 'auto') {
      try { var s = JSON.parse(localStorage.getItem('sm_settings') || 'null'); if (s && s.theme) v = s.theme; } catch (_) {}   // bản cũ: chỉ lưu trong Cài đặt giáo viên
    }
    return v === 'light' || v === 'dark' ? v : 'auto';
  }
  var mq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  function effective(t) { return t === 'auto' ? (mq && mq.matches ? 'dark' : 'light') : t; }
  function apply(t) { if (t === 'auto') delete root.dataset.theme; else root.dataset.theme = t; paint(); }
  var cur = read(); apply(cur);

  function paint() {
    var dark = effective(cur) === 'dark';
    btns = btns.filter(function (b) { return b.isConnected || !b._seen; });   // bỏ nút của màn hình đã đóng
    btns.forEach(function (b) { if (b.isConnected) b._seen = true; });
    btns.forEach(function (b) {
      b.textContent = dark ? '☀️' : '🌙';
      b.setAttribute('aria-label', dark ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối');
      b.title = dark ? 'Giao diện sáng' : 'Giao diện tối';
      b.setAttribute('aria-pressed', String(dark));
    });
  }
  function set(t, silent) {
    cur = t === 'light' || t === 'dark' ? t : 'auto';
    try { localStorage.setItem(KEY, JSON.stringify(cur)); } catch (_) {}
    apply(cur);
    if (!silent) { try { document.dispatchEvent(new CustomEvent('sm-theme', { detail: { theme: cur } })); } catch (_) {} }
  }
  function toggle() { set(effective(cur) === 'dark' ? 'light' : 'dark'); }
  function make(cls) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = cls; b.addEventListener('click', toggle);
    btns.push(b); paint(); return b;
  }
  function mount() {
    var bar = document.querySelector('.topbar');
    if (bar && !bar.querySelector('.theme-btn')) {
      var b = make('btn small ghost theme-btn');
      var tools = bar.querySelector('.topbar-tools');
      if (tools) tools.insertBefore(b, tools.firstChild); else bar.appendChild(b);
    }
  }
  if (mq) { var on = function () { if (cur === 'auto') paint(); }; if (mq.addEventListener) mq.addEventListener('change', on); else if (mq.addListener) mq.addListener(on); }
  window.addEventListener('storage', function (e) { if (e.key === KEY) { cur = read(); apply(cur); } });   // đổi ở tab khác
  window.SMTheme = { get: function () { return cur; }, set: function (t) { set(t, true); }, toggle: toggle, button: function (cls) { return make(cls || 'btn small ghost theme-btn'); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();

/* Nhà Thầy Hưng (Spelling Mastery) – service worker (chạy offline)
 *  Lưu sẵn: index.html, hoc-sinh.html, style.css, app.js, student.js/css, games.js/css, games2.js/css, city-core.js, city-art.js, city.js/css, pet-art.js, pet.js/css, vendor/*.js → mở được khi không có mạng.
 *  KHÔNG đụng vào: index.json, data/*, data.json, Apps Script (API trò chơi/điểm), YouTube/Drive… (luôn đi thẳng ra mạng).
 *  Tệp lõi thiếu → hủy cài; tệp tùy chọn (trang học sinh, games*, city*) thiếu → bỏ qua, không hỏng lần cài.
 *  Số phiên bản lấy từ sw.js?v=… (index.html và hoc-sinh.html đăng ký kèm cùng số ?v=). */
'use strict';
const V = new URL(self.location.href).searchParams.get('v') || 'dev';
const CACHE = 'sm-shell-' + V;
const SCOPE = self.registration.scope;
const abs = p => new URL(p, SCOPE).href;
const CORE = ['style.css?v=' + V, 'app.js?v=' + V, 'theme.js?v=' + V, 'vendor/lz-string.min.js', 'vendor/papaparse.min.js', 'vendor/xlsx.full.min.js', 'vendor/jspdf.umd.min.js', 'vendor/qrcode.min.js'];
const OPT = ['student.js?v=' + V, 'student.css?v=' + V, 'games.js?v=' + V, 'games.css?v=' + V, 'games2.css?v=' + V, 'city.css?v=' + V, 'games2.js?v=' + V, 'city-core.js?v=' + V, 'city-art.js?v=' + V, 'city.js?v=' + V, 'parent.js?v=' + V, 'parent.css?v=' + V, 'pet.css?v=' + V, 'pet-art.js?v=' + V, 'pet.js?v=' + V];
const PAGE = abs('index.html'), STUDENT = abs('hoc-sinh.html'), PARENT = abs('phu-huynh.html');
const KEEP = new Set(CORE.concat(OPT).map(abs));

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE), rq = u => new Request(abs(u), { cache: 'reload' });
    await c.addAll([new Request(PAGE, { cache: 'reload' })].concat(CORE.map(rq)));            // lõi: thiếu một tệp là hủy cả lần cài
    await Promise.all([new Request(STUDENT, { cache: 'reload' }), new Request(PARENT, { cache: 'reload' })].concat(OPT.map(rq)).map(r => c.add(r).catch(() => {})));   // tùy chọn: thiếu thì bỏ qua
    self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('sm-shell-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

/* Trang: ưu tiên mạng, quá 4 giây hoặc mất mạng thì dùng bản đã lưu (mỗi trang một khóa riêng, bỏ ?code=…) */
async function page(req) {
  const pn = new URL(req.url).pathname, key = pn.endsWith('/hoc-sinh.html') ? STUDENT : pn.endsWith('/phu-huynh.html') ? PARENT : PAGE;
  const c = await caches.open(CACHE), ac = new AbortController(), t = setTimeout(() => ac.abort(), 4000);
  try {
    const res = await fetch(req, { signal: ac.signal });
    if (res.ok) c.put(key, res.clone());
    return res;
  } catch (_) {
    return (await c.match(key)) || Response.error();
  } finally { clearTimeout(t); }
}
/* Tệp tĩnh: trả ngay bản đã lưu, đồng thời làm mới ở nền */
async function asset(req) {
  const c = await caches.open(CACHE), hit = await c.match(req);
  const net = fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; });
  if (hit) { net.catch(() => {}); return hit; }
  return net;
}
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;                                  // POST gửi lên Apps Script: không chặn
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.href.indexOf(SCOPE) !== 0) return;
  if (req.mode === 'navigate') { e.respondWith(page(req)); return; }
  if (KEEP.has(url.origin + url.pathname + url.search)) e.respondWith(asset(req));
});

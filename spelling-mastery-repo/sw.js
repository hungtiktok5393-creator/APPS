/* Spelling Mastery – service worker (chạy offline)
 *  Lưu sẵn: index.html, style.css, app.js, vendor/*.js  → mở được khi không có mạng.
 *  KHÔNG đụng vào: index.json, data/*, data.json, Apps Script, YouTube/Drive… (luôn đi thẳng ra mạng, nên đồng bộ luôn lấy bản mới).
 *  Dữ liệu của người dùng nằm trong IndexedDB của trang, không nằm ở đây.
 *  Số phiên bản lấy từ sw.js?v=… (app.js đăng ký kèm số ?v= trong index.html). */
'use strict';
const V = new URL(self.location.href).searchParams.get('v') || 'dev';
const CACHE = 'sm-shell-' + V;
const SCOPE = self.registration.scope;
const abs = p => new URL(p, SCOPE).href;
const ASSETS = ['style.css?v=' + V, 'app.js?v=' + V, 'vendor/lz-string.min.js', 'vendor/papaparse.min.js', 'vendor/xlsx.full.min.js', 'vendor/jspdf.umd.min.js', 'vendor/qrcode.min.js'];
const PAGE = abs('index.html');
const KEEP = new Set(['index.html'].concat(ASSETS).map(abs));

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll([PAGE].concat(ASSETS.map(abs)).map(u => new Request(u, { cache: 'reload' })));   // bỏ qua cache HTTP để lấy đúng bản mới; thiếu một tệp là hủy cả lần cài
    self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('sm-shell-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

/* Trang: ưu tiên mạng (luôn thấy bản mới khi online), quá 4 giây hoặc mất mạng thì dùng bản đã lưu */
async function page(req) {
  const c = await caches.open(CACHE), ac = new AbortController(), t = setTimeout(() => ac.abort(), 4000);
  try {
    const res = await fetch(req, { signal: ac.signal });
    if (res.ok) c.put(PAGE, res.clone());
    return res;
  } catch (_) {
    return (await c.match(PAGE)) || Response.error();
  } finally { clearTimeout(t); }
}
/* Tệp tĩnh: trả ngay bản đã lưu, đồng thời làm mới ở nền (phòng khi quên đổi ?v=) */
async function asset(req) {
  const c = await caches.open(CACHE), hit = await c.match(req);
  const net = fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; });
  if (hit) { net.catch(() => {}); return hit; }
  return net;
}
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;                                  // POST gửi bài lên Apps Script: không chặn
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.href.indexOf(SCOPE) !== 0) return;
  if (req.mode === 'navigate') { e.respondWith(page(req)); return; }
  if (KEEP.has(url.origin + url.pathname + url.search)) e.respondWith(asset(req));
});

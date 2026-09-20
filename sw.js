// Service worker — ให้แอปเปิดออฟไลน์ได้ และติดตั้งเป็นแอปบนมือถือได้
// กลยุทธ์: หน้าเว็บ/ไฟล์ static ใช้ "เครือข่ายก่อน แล้วค่อยแคช" เพื่อให้ได้เวอร์ชันใหม่ทันทีหลัง deploy
// (ห้ามใช้ cache-first กับ index.html ไม่งั้นผู้ใช้ติดเวอร์ชันเก่า) และไม่แตะ /api/* เลย
const CACHE = 'fintrack-v1';
const PRECACHE = ['/', '/index.html', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || (req.mode === 'navigate' ? caches.match('/index.html') : Response.error())))
  );
});

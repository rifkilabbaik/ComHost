// ComHost service worker. Naikkan VERSION setiap ada perubahan file agar cache lama diganti.
const VERSION = 'comhost-v1';
const SHELL = ['./', 'index.html', 'css/style.css', 'js/config.js', 'js/api.js', 'js/app.js', 'manifest.json',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const put = (req, res) => { if (res && (res.ok || res.type === 'opaque')) { const c = res.clone(); caches.open(VERSION).then(x => x.put(req, c)); } return res; };

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    // Halaman: jaringan dulu agar cepat ter-update, cadangan dari cache saat offline.
    if (req.mode === 'navigate') {
      e.respondWith(fetch(req).then(r => put('index.html', r)).catch(() => caches.match('index.html')));
      return;
    }
    // Aset: tampilkan dari cache, perbarui di belakang.
    e.respondWith(caches.match(req).then(hit => {
      const net = fetch(req).then(r => put(req, r)).catch(() => hit);
      return hit || net;
    }));
    return;
  }
  // Font & library dari CDN: cache dulu. Permintaan ke Apps Script tidak disentuh.
  if (/(^|\.)fonts\.(googleapis|gstatic)\.com$/.test(url.hostname) || url.hostname === 'cdnjs.cloudflare.com') {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => put(req, r))));
  }
});

// Keeps the whole app on the phone so it opens with no signal. The version line is rewritten by publish_pocket.py.
const VERSION = '4b71c29f390a';
const FILES = ['./', 'index.html', 'pocket.css', 'app.css', 'pocket.js', 'fees.js', 'codes.js', 'vendor/zxing.js', 'vendor/zxing_reader.wasm', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png'];
const NAME = 'pocket-' + VERSION;
self.addEventListener('install', e => e.waitUntil(caches.open(NAME).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(k => Promise.all(k.filter(n => n.startsWith('pocket-') && n !== NAME).map(n => caches.delete(n)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || !u.href.startsWith(self.registration.scope)) return;
  e.respondWith(caches.open(NAME).then(c => c.match(e.request, { ignoreSearch: true })).then(r => r || fetch(e.request)));
});

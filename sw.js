// Cache da aplicação para funcionar offline (os cânticos ficam em localStorage)
const CACHE = 'cancioneiro-v49';
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'config.js', 'manifest.json', 'worker.js', 'icons/icon-192.png', 'icons/icon-180.png'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
));
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // rede primeiro, cache como alternativa
  // no-cache: revalida sempre no servidor (o GitHub Pages guarda 10 min em cache)
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(r => {
    const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r;
  }).catch(() => caches.match(e.request)));
});

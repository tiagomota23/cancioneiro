// Cache da aplicação para funcionar offline (os cânticos ficam em localStorage)
const CACHE = 'cancioneiro-v165';
const SHELL = ['./', 'index.html', 'theme.css', 'styles.css', 'app.js', 'config.js', 'manifest.json', 'worker.js', 'icons/icon-192.png', 'icons/icon-180.png'];
const CDN = 'https://cdn.jsdelivr.net'; // biblioteca do Supabase (endereço com versão fixa)
const WAIT = 3000; // rede lenta: ao fim de 3 s abre a cópia guardada (e a da rede fica guardada para a próxima vez)
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== 'cancioneiro-media').map(k => caches.delete(k)))).then(() => self.clients.claim())
));
const keep = (req, r) => { if (r && r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return r; };
const cached = async req => (await caches.match(req)) || (await caches.match(req, { ignoreSearch: true }));
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  // ficheiros com versão no endereço (app.js?v=…, styles.css?v=…, a biblioteca do CDN): nunca mudam, por isso a cópia guardada serve logo
  if ((url.origin === location.origin && url.searchParams.has('v')) || url.origin === CDN) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => keep(req, r)).catch(async () => (await cached(req)) || Response.error())));
    return;
  }
  if (url.origin !== location.origin) return;
  // o resto (a página, imagens…): rede primeiro, com no-cache (o GitHub Pages guarda 10 min em cache);
  // se a rede não responder em 3 s, a cópia guardada (pedidos de navegação não aceitam opções no fetch)
  const nav = req.mode === 'navigate';
  const net = (nav ? fetch(req) : fetch(req, { cache: 'no-cache' })).then(r => keep(req, r));
  const fallback = async () => (await cached(req)) || (nav ? await caches.match('./') : undefined);
  e.waitUntil(net.catch(() => {}));
  e.respondWith(new Promise(resolve => {
    let done = false;
    const finish = r => { if (!done && r) { done = true; resolve(r); } };
    const t = setTimeout(async () => finish(await fallback()), WAIT);
    net.then(r => { clearTimeout(t); finish(r); })
      .catch(async () => { clearTimeout(t); finish((await fallback()) || Response.error()); });
  }));
});

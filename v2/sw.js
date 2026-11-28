/* Service worker v2 · Contabilidad MFB
 * - Archivos de la app: primero red (los cambios llegan al instante), caché si no hay conexión.
 * - Librerías (Chart.js, Tesseract): caché con actualización en segundo plano.
 * - Nunca toca GitHub (Gist), Cloudinary ni Google Drive: los datos siempre vienen frescos. */
const APP_CACHE = 'mfb-v2-app-3';
const LIB_CACHE = 'mfb-v2-lib-1';
const CORE = ['./', './index.html', './manifest.json', './js/home.js', './js/ocr.js', './js/ticket-parser.js', './js/sync-merge.js', './js/data-check.js', './js/archive.js', './js/sync.js', './js/historico.js', './js/review.js'];
const LIB_HOSTS = ['cdn.jsdelivr.net', 'tessdata.projectnaptha.com', 'unpkg.com'];
const NEVER = ['api.github.com', 'gist.githubusercontent.com', 'cloudinary.com', 'drive.google.com', 'googleusercontent.com'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(APP_CACHE).then(c => Promise.all(CORE.map(u => fetch(u, { cache: 'reload' }).then(r => r.ok && c.put(u, r))))).catch(err => console.log('SW install:', err)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k.startsWith('mfb-v2-') && k !== APP_CACHE && k !== LIB_CACHE).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (NEVER.some(h => url.hostname.endsWith(h))) return;

  if (LIB_HOSTS.includes(url.hostname)) {
    event.respondWith(
      caches.open(LIB_CACHE).then(async cache => {
        const cached = await cache.match(req);
        const network = fetch(req).then(res => {
          if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
          return res;
        }).catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  if (url.origin === self.location.origin && url.pathname.startsWith('/gastos/v2/')) {
    event.respondWith(
      fetch(req.url, { cache: 'no-cache' }).then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(APP_CACHE).then(c => c.put(req, copy));
        }
        return res;
      }).catch(async () => (await caches.match(req, { ignoreSearch: true })) || (await caches.match('./index.html')))
    );
  }
});

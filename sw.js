const CACHE_NAME = 'mfb-v1';
const urlsToCache = [
  '/gastos/',
  '/gastos/index.html',
  '/gastos/historico.html',
  '/gastos/manifest.json'
];

// Instalación: cachear archivos principales
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
      .catch((err) => console.log('Cache install error:', err))
  );
  self.skipWaiting();
});

// Activación: limpiar caché vieja
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch: estrategia "cache-first" para archivos locales, "network-first" para API
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  
  const url = event.request.url;
  
  // NO cachear: APIs externas, imágenes de Cloudinary, Google Drive
  if (url.includes('api.github.com') || 
      url.includes('cloudinary.com') ||
      url.includes('googleusercontent.com') ||
      url.includes('lh3.google') ||
      url.includes('cdn.jsdelivr.net') ||
      url.includes('chart.js')) {
    return;
  }
  
  // Archivos locales: cache-first
  if (url.includes('/gastos/')) {
    event.respondWith(
      caches.match(event.request)
        .then((response) => {
          if (response) return response;
          return fetch(event.request)
            .then((res) => {
              if (!res || res.status !== 200) return res;
              const responseToCache = res.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, responseToCache);
              });
              return res;
            })
            .catch(() => caches.match('/gastos/index.html'));
        })
    );
  }
});
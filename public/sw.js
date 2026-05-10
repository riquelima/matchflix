const CACHE_NAME = 'matchflix-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/descobrir.html',
  '/manifest.json'
];

// Instalação do Service Worker e Cache Inicial
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Ativação e limpeza de cache antigo
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        if (key !== CACHE_NAME) {
          return caches.delete(key);
        }
      }));
    })
  );
  return self.clients.claim();
});

// Estratégia Network-First com fallback para Cache (Ideal para app dinâmico)
self.addEventListener('fetch', (event) => {
  // Ignora requisições para extensões de browser e supabase externo
  if (!event.request.url.startsWith(self.location.origin)) {
     return;
  }

  event.respondWith(
    fetch(event.request)
      .catch(() => {
        return caches.match(event.request);
      })
  );
});

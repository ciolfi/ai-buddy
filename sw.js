const CACHE_NAME = 'ai-vault-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/app.js',
  '/vault.js',
  '/manifest.webmanifest',
  '/public/icon-192.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});

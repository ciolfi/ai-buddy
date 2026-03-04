const CACHE_NAME = 'ai-vault-v4';
const ASSETS = [
  '/',
  '/index.html',
  '/app.js',
  '/manifest.webmanifest'
];

// 1. Install Event: Cache assets and force immediate activation
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  // Forces the waiting service worker to become the active service worker
  self.skipWaiting();
});

// 2. Activate Event: Clean up old caches and claim clients immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      // Remove old cache versions
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cache) => {
            if (cache !== CACHE_NAME) {
              return caches.delete(cache);
            }
          })
        );
      }),
      // Ensure the new SW controls the page immediately
      self.clients.claim()
    ])
  );
});

// 3. Fetch Event: Network-First with AI Exemption
self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // EXEMPTION: Strictly bypass Service Worker for AI model logic and weights.
  // This prevents the 'Failed to execute add on Cache' error caused by 404s/403s.
  if (url.includes('huggingface.co') || url.includes('mlc-ai') || url.includes('raw.githubusercontent')) {
    return; // Let the browser handle this request normally
  }

  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
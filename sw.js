/**
 * sw.js — NEURON Service Worker
 * Provides PWA shell caching; model weights are NOT cached (too large)
 */

const CACHE_NAME = 'neuron-shell-v1';
const SHELL_ASSETS = [
  './',
  './index.html',
  './app.js',
  './rag.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  // Local fonts — cached for full offline support
  './fonts/Syne-Regular.woff2',
  './fonts/Syne-SemiBold.woff2',
  './fonts/Syne-Bold.woff2',
  './fonts/Syne-ExtraBold.woff2',
  './fonts/DMMono-Light.woff2',
  './fonts/DMMono-Regular.woff2',
  './fonts/DMMono-LightItalic.woff2',
];

// Install: cache shell assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate: delete old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys
        .filter(k => k !== CACHE_NAME)
        .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch: shell from cache, model weights from network
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Always network-first for CDN/external resources (WebLLM, fonts)
  const isExternal = url.origin !== self.location.origin;
  if (isExternal) {
    event.respondWith(fetch(event.request).catch(() => new Response('', { status: 503 })));
    return;
  }

  // Model weight files — network only (too large to cache)
  if (url.pathname.includes('mlc-chat') || url.pathname.endsWith('.wasm') && url.pathname.includes('model')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Shell assets — cache first, then network
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        }
        return response;
      });
    })
  );
});

// Background sync message
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

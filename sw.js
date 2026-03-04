const CACHE_NAME = 'ai-vault-v2';
const ASSETS = [
  '/',
  '/index.html',
  '/app.js',
  '/manifest.webmanifest'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

// Network-First Strategy: Better for frequently updated or large AI assets
self.addEventListener('fetch', (event) => {
  // EXEMPTION: Do not let the Service Worker touch WebLLM/HuggingFace requests
  // This prevents the "Request failed" Cache error
  if (event.request.url.includes('huggingface.co') || event.request.url.includes('mlc-ai')) {
    return; 
  }

  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
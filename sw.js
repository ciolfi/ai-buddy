/*
 * ═══════════════════════════════════════════════════════════════
 * SERVICE WORKER — sw.js
 * ───────────────────────────────────────────────────────────────
 * Responsibilities:
 *   1. Cache the app shell (HTML, manifest, icons) on install
 *   2. Serve from cache when offline (Cache-First for shell)
 *   3. Network-First for API calls (never cache Anthropic requests)
 *   4. Pass through WebLLM CDN fetches (WebLLM manages its own
 *      model cache via the browser Cache API internally)
 *
 * Strategy summary:
 *   /                        → Cache-First (app shell)
 *   /manifest.json           → Cache-First
 *   /icons/*                 → Cache-First
 *   api.anthropic.com/*      → Network-Only (never cache)
 *   esm.run/*, cdnjs/*       → Network-First (CDN libs)
 *   huggingface.co/*         → Network-Only (WebLLM handles internally)
 * ═══════════════════════════════════════════════════════════════
 */

const CACHE_NAME   = "ai-rag-shell-v1";
const SHELL_ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/icons/icon-192x192.png",
  "/icons/icon-512x512.png",
];

// ── Install: pre-cache the app shell ─────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("[SW] Pre-caching app shell");
      return cache.addAll(SHELL_ASSETS);
    })
  );
  // Activate immediately without waiting for old SW to die
  self.skipWaiting();
});

// ── Activate: purge old caches ────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME)
          .map((k) => {
            console.log("[SW] Deleting old cache:", k);
            return caches.delete(k);
          })
      )
    )
  );
  // Take control of all clients immediately
  self.clients.claim();
});

// ── Fetch: route requests by strategy ────────────────────────────
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // 1. Never intercept Anthropic API calls — always go to network
  if (url.hostname === "api.anthropic.com") {
    event.respondWith(fetch(event.request));
    return;
  }

  // 2. Never intercept HuggingFace model weight downloads —
  //    WebLLM manages its own Cache API entries for these
  if (url.hostname.includes("huggingface.co") ||
      url.hostname.includes("mlc.ai")) {
    event.respondWith(fetch(event.request));
    return;
  }

  // 3. Never intercept non-GET requests (POST, etc.)
  if (event.request.method !== "GET") {
    event.respondWith(fetch(event.request));
    return;
  }

  // 4. App shell — Cache-First
  //    Serve from cache instantly; update cache in background
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) {
          // Refresh cache in background (stale-while-revalidate)
          fetch(event.request)
            .then((fresh) => { if (fresh.ok) cache.put(event.request, fresh.clone()); })
            .catch(() => {});
          return cached;
        }
        // Not cached yet — fetch, cache, return
        const fresh = await fetch(event.request);
        if (fresh.ok) cache.put(event.request, fresh.clone());
        return fresh;
      }).catch(() => caches.match("/index.html")) // offline fallback
    );
    return;
  }

  // 5. CDN assets (fonts, WebLLM lib, PDF.js) — Network-First
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        // Cache successful CDN responses
        if (res.ok) {
          caches.open(CACHE_NAME).then((c) => c.put(event.request, res.clone()));
        }
        return res;
      })
      .catch(() => caches.match(event.request)) // serve stale if offline
  );
});

// ── Message: allow app to trigger cache refresh ───────────────────
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

/*
 * ═══════════════════════════════════════════════════════════════
 * SERVICE WORKER — sw.js  (cross-origin isolation aware)
 * ───────────────────────────────────────────────────────────────
 * KEY FIX: The COOP/COEP headers set by Vercel only apply to
 * the main document response. WebLLM spawns internal Web Workers
 * from blob: URLs and fetches WASM modules — those sub-contexts
 * also need to be cross-origin isolated for SharedArrayBuffer to
 * work. The service worker is the only place that can intercept
 * ALL responses (including navigations and worker scripts) and
 * inject the required headers uniformly.
 *
 * This pattern mirrors coi-serviceworker, the most widely
 * deployed solution for this problem.
 *
 * Strategy:
 *   • All same-origin responses  → Cache-First + inject COOP/COEP
 *   • api.anthropic.com          → pass through (never cache)
 *   • huggingface.co / mlc.ai   → pass through (WebLLM manages)
 *   • CDN assets (fonts, libs)   → Network-First + inject COOP/COEP
 * ═══════════════════════════════════════════════════════════════
 */

const CACHE_NAME   = "ai-rag-shell-v2";   // bumped to force SW refresh
const SHELL_ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/icons/icon-192x192.png",
  "/icons/icon-512x512.png",
];

/*
  addIsolationHeaders() clones a Response and injects the two
  headers required for cross-origin isolation:

    COOP: same-origin     — prevents the page sharing a browsing
                            context group with cross-origin pages
    COEP: credentialless  — allows CDN assets without CORP headers
                            while still enabling SharedArrayBuffer

  Both headers together make self.crossOriginIsolated === true,
  which is what WebLLM checks before using SharedArrayBuffer.
*/
function addIsolationHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set("Cross-Origin-Opener-Policy",   "same-origin");
  headers.set("Cross-Origin-Embedder-Policy", "credentialless");
  return new Response(response.body, {
    status:     response.status,
    statusText: response.statusText,
    headers,
  });
}

// ── Install: pre-cache app shell ──────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("[SW] Pre-caching app shell");
      return cache.addAll(SHELL_ASSETS);
    })
  );
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
            console.log("[SW] Removing old cache:", k);
            return caches.delete(k);
          })
      )
    )
  );
  self.clients.claim();
});

// ── Fetch: intercept + inject isolation headers ───────────────────
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // 1. Never intercept Anthropic API calls
  if (url.hostname === "api.anthropic.com") return;

  // 2. Never intercept HuggingFace — WebLLM manages its own cache
  if (url.hostname.includes("huggingface.co") ||
      url.hostname.includes("mlc.ai")) return;

  // 3. Only handle GET
  if (event.request.method !== "GET") return;

  // 4. Same-origin → Cache-First + isolation headers
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) {
          // Stale-while-revalidate: update cache in background
          fetch(event.request)
            .then((f) => { if (f.ok) cache.put(event.request, f.clone()); })
            .catch(() => {});
          return addIsolationHeaders(cached);
        }
        try {
          const fresh = await fetch(event.request);
          if (fresh.ok) cache.put(event.request, fresh.clone());
          return addIsolationHeaders(fresh);
        } catch {
          const fallback = await cache.match("/index.html");
          return fallback ? addIsolationHeaders(fallback) : Response.error();
        }
      })
    );
    return;
  }

  // 5. Cross-origin CDN → Network-First + isolation headers
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res.ok) {
          caches.open(CACHE_NAME)
            .then((c) => c.put(event.request, res.clone()))
            .catch(() => {});
        }
        return addIsolationHeaders(res);
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        return cached ? addIsolationHeaders(cached) : Response.error();
      })
  );
});

// ── Message: allow app to trigger SW update ───────────────────────
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

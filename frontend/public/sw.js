/* CodeLingo service worker (hand-written, no build step).
 *
 * Course CONTENT is NOT cached here: it lives in IndexedDB (Dexie). This worker only makes the
 * app shell load offline:
 *   - navigations:            NetworkFirst → cached page → /offline fallback
 *   - RSC payloads:           NetworkFirst → cache (so soft navigations to visited pages work)
 *   - /_next/static/*:        CacheFirst (content-hashed, immutable)
 *   - GET /api/courses:       NetworkFirst (catalog list)
 *   - /api/ai/*, /api/sync, /api/health, packages, versions, contributor: NetworkOnly (not touched)
 *   - other same-origin GETs: StaleWhileRevalidate (icons, fonts, images)
 * Bump VERSION to invalidate old caches on deploy.
 */
const VERSION = "v1";
const SHELL_CACHE = `codelingo-shell-${VERSION}`;
const RUNTIME_CACHE = `codelingo-runtime-${VERSION}`;
const STATIC_CACHE = `codelingo-static-${VERSION}`;
const OFFLINE_URL = "/offline";
const PRECACHE = ["/", OFFLINE_URL, "/manifest.webmanifest"];
const SYNC_TAG = "codelingo-sync";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      // Individually, so one 404 doesn't abort the whole install.
      .then((cache) => Promise.all(PRECACHE.map((url) => cache.add(url).catch(() => undefined))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("codelingo-") && !k.endsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const NETWORK_ONLY = [/^\/api\/ai\//, /^\/api\/sync/, /^\/api\/health/, /^\/api\/contributor\//, /^\/api\/courses\/versions/, /^\/api\/courses\/[^/]+\/package/];

async function networkFirst(request, cacheName, fallback) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = (await cache.match(request)) || (await caches.match(request, { ignoreSearch: true }));
    if (cached) return cached;
    if (fallback) return fallback();
    return Response.error();
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) (await caches.open(STATIC_CACHE)).put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached || Response.error());
  return cached || network;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (NETWORK_ONLY.some((re) => re.test(url.pathname))) return;

  if (request.mode === "navigate") {
    event.respondWith(
      networkFirst(request, RUNTIME_CACHE, async () => (await caches.match(OFFLINE_URL)) || new Response("Offline", { status: 503 })),
    );
    return;
  }
  if (request.headers.get("RSC") === "1" || url.searchParams.has("_rsc")) {
    event.respondWith(networkFirst(request, RUNTIME_CACHE));
    return;
  }
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (url.pathname === "/api/courses") {
    event.respondWith(networkFirst(request, RUNTIME_CACHE));
    return;
  }
  if (url.pathname.startsWith("/api/")) return;
  event.respondWith(staleWhileRevalidate(request));
});

// Pre-warm pages (e.g. a course's player route right after it's downloaded) so they open offline.
self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "CODELINGO_CACHE_URLS" && Array.isArray(data.urls)) {
    event.waitUntil(
      caches.open(RUNTIME_CACHE).then((cache) =>
        Promise.all(data.urls.map((u) => fetch(u, { credentials: "same-origin" }).then((r) => r.ok && cache.put(u, r)).catch(() => undefined))),
      ),
    );
  }
});

// Background Sync: wake any open CodeLingo tab and let its sync engine (which owns IndexedDB logic) run.
self.addEventListener("sync", (event) => {
  if (event.tag !== SYNC_TAG) return;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      clients.forEach((c) => c.postMessage({ type: "CODELINGO_SYNC_REQUESTED" }));
    }),
  );
});

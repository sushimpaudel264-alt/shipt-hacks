// Codelingo service worker: makes the whole app work offline.
//
// On install it saves the app page, every script/style that page uses (their names are
// hashed per build, so they are read from the page itself), both Arcade games, the fonts
// and the icons. A single online visit is therefore enough to use Codelingo offline.
//
// Course content and progress are not handled here: they live in IndexedDB and
// localStorage (see lib/codesprout/offline.js).
const VERSION = 'v2';
const CACHE = `codelingo-app-${VERSION}`;
const CORE = [
  '/',
  '/manifest.webmanifest',
  '/games/code-dungeon.html',
  '/games/pixel-farm.html',
  '/fonts/fonts.css',
  '/fonts/dm-sans.woff2',
  '/fonts/space-grotesk.woff2',
  '/fonts/jetbrains-mono.woff2',
  '/fonts/nunito.woff2',
  '/fonts/fredoka.woff2',
  '/logo-96.png',
  '/logo-192.png',
  '/logo-512.png',
  '/apple-touch-icon.png',
];
const CORE_PATHS = new Set(CORE);
const NETWORK_TIMEOUT = 4000;
const STATIC_RE = /\/_next\/static\/[^"'\s)\\]+/g;

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(precache());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key !== CACHE && /^(codelingo|codesprout)-/.test(key)) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

// The page can ask for extra files it loaded to be saved (see offline.js).
self.addEventListener('message', (event) => {
  if (event.data?.type === 'CACHE_URLS' && Array.isArray(event.data.urls)) {
    event.waitUntil((async () => {
      const cache = await caches.open(CACHE);
      await Promise.all(event.data.urls
        .filter((u) => new URL(u, self.location.origin).origin === self.location.origin)
        .map((u) => cache.match(u).then((hit) => hit || cache.add(u)).catch(() => {})));
    })());
  }
});

async function precache() {
  const cache = await caches.open(CACHE);
  await Promise.all(CORE.map((url) => cache.add(new Request(url, { cache: 'reload' })).catch(() => {})));
  await cacheAppAssets(cache);
}

/** Save every /_next/static file the cached app page (and its CSS) refers to; drop old builds' files. */
async function cacheAppAssets(cache) {
  const page = await cache.match('/');
  if (!page) return;
  const keep = new Set((await page.text()).match(STATIC_RE) || []);
  await Promise.all([...keep].map((u) => cache.match(u).then((hit) => hit || cache.add(u)).catch(() => {})));
  for (const u of [...keep]) {
    if (!u.endsWith('.css')) continue;
    const css = await cache.match(u);
    if (!css) continue;
    for (const ref of (await css.text()).match(STATIC_RE) || []) {
      keep.add(ref);
      await cache.match(ref).then((hit) => hit || cache.add(ref)).catch(() => {});
    }
  }
  for (const req of await cache.keys()) {
    const path = new URL(req.url).pathname;
    if (path.startsWith('/_next/static/') && !keep.has(path)) await cache.delete(req);
  }
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // the API and anything external: not cached here
  if (url.pathname.startsWith('/_next/webpack-hmr') || url.pathname.includes('__nextjs')) return;

  if (req.mode === 'navigate') event.respondWith(navigate(event, url));
  else if (url.pathname.startsWith('/_next/static/')) event.respondWith(cacheFirst(req));
  else if (CORE_PATHS.has(url.pathname)) event.respondWith(staleWhileRevalidate(event, req, url.pathname));
  else event.respondWith(networkFirst(req));
});

/** Pages (the app and the games): fresh from the network, the saved copy if offline or slow. */
async function navigate(event, url) {
  const cache = await caches.open(CACHE);
  const key = url.pathname === '/' || url.pathname === '/index.html' ? '/' : url.pathname;
  const network = fetch(event.request).then((res) => {
    if (res.ok && res.type === 'basic') {
      const copy = res.clone();
      event.waitUntil(cache.put(key, copy).then(() => (key === '/' ? cacheAppAssets(cache) : null)));
    }
    return res;
  });
  try {
    return await withTimeout(network, NETWORK_TIMEOUT);
  } catch {
    const saved = (await cache.match(key)) || (key === '/' ? null : await cache.match(key, { ignoreSearch: true }));
    if (saved) return saved;
    if (!key.startsWith('/games/')) {
      const shell = await cache.match('/');
      if (shell) return shell; // the app routes with #hashes, so any page can start from the shell
    }
    try { return await network; } catch { return offlinePage(); }
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone()).catch(() => {});
  return res;
}

async function staleWhileRevalidate(event, req, path) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(path);
  const update = fetch(req).then((res) => {
    if (res.ok) cache.put(path, res.clone()).catch(() => {});
    return res;
  });
  if (hit) {
    event.waitUntil(update.catch(() => {}));
    return hit;
  }
  return update;
}

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res.ok && res.type === 'basic') cache.put(req, res.clone()).catch(() => {});
    return res;
  } catch {
    return (await cache.match(req)) || Response.error();
  }
}

function offlinePage() {
  return new Response(
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Codelingo is offline</title><body style="font-family:system-ui;background:#110f1d;color:#f4f0ff;display:grid;place-items:center;min-height:100vh;margin:0;text-align:center;padding:24px">' +
    '<div><h1>You\'re offline</h1><p>Open Codelingo once while connected and it will work offline after that.</p></div>',
    { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 503 },
  );
}

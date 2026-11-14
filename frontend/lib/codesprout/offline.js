// Offline storage. Downloaded courses (full content) and the cached catalog live in
// IndexedDB, which can hold far more than localStorage and survives restarts.
// If IndexedDB is unavailable (some private windows), an in-memory fallback keeps the
// app working for the current visit.

const DB_NAME = 'codesprout';
const DB_VERSION = 1;
let dbPromise = null;
const memory = { courses: new Map(), meta: new Map() };

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('courses')) db.createObjectStore('courses', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

async function run(store, mode, fn) {
  const db = await openDB();
  if (!db) {
    const r = fn(null, memory[store]);
    return r && typeof r === 'object' && 'result' in r ? r.result : undefined;
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store), null);
    tx.oncomplete = () => resolve(req && 'result' in req ? req.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Storage is full'));
  });
}

/** Downloaded courses: { id, version, title, bytes, downloadedAt, course }. */
export const downloads = {
  list: () => run('courses', 'readonly', (s, m) => (s ? s.getAll() : { result: [...m.values()] })),
  get: (id) => run('courses', 'readonly', (s, m) => (s ? s.get(id) : { result: m.get(id) })),
  async save(course) {
    const record = {
      id: course.id,
      version: course.version,
      title: course.title,
      bytes: new Blob([JSON.stringify(course)]).size,
      downloadedAt: new Date().toISOString(),
      course,
    };
    await run('courses', 'readwrite', (s, m) => (s ? s.put(record) : m.set(record.id, record)));
    return record;
  },
  remove: (id) => run('courses', 'readwrite', (s, m) => (s ? s.delete(id) : m.delete(id))),
};

/** Small key/value store (the cached course catalog). */
export const meta = {
  get: (key) => run('meta', 'readonly', (s, m) => (s ? s.get(key) : { result: m.get(key) })),
  set: (key, value) => run('meta', 'readwrite', (s, m) => (s ? s.put(value, key) : m.set(key, value))),
};

/** Browser storage used by this site and the space it may still use. */
export async function storageEstimate() {
  try {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    return { usage, quota, supported: true };
  } catch {
    return { usage: 0, quota: 0, supported: false };
  }
}

/** Ask the browser not to evict downloads when space runs low (granted silently or not). */
export async function requestPersistence() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch { /* not supported */ }
}

/* ---------- Progressive Web App: offline app files and install ---------- */
const IS_DEV = process.env.NODE_ENV !== 'production';

/**
 * Save the app itself so it opens with no connection (production builds only, e.g. on
 * Vercel). In development a service worker would serve stale code, so any old one is removed.
 */
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (IS_DEV) {
    navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister())).catch(() => {});
    return;
  }
  navigator.serviceWorker.register('/sw.js').then(async () => {
    const reg = await navigator.serviceWorker.ready;
    // Also save everything this page has already loaded (scripts, styles, fonts, images).
    const urls = performance.getEntriesByType('resource')
      .map((e) => e.name)
      .filter((u) => u.startsWith(location.origin) && !u.includes('/api/'));
    reg.active?.postMessage({ type: 'CACHE_URLS', urls });
  }).catch(() => { /* the app still works online */ });
}

/** Whether the app's own files are saved for offline use. */
export async function appOfflineStatus() {
  if (IS_DEV) return { state: 'dev' };
  if (!('serviceWorker' in navigator) || !('caches' in window)) return { state: 'unsupported' };
  try {
    const keys = (await caches.keys()).filter((k) => k.startsWith('codelingo-app-'));
    let files = 0, hasShell = false, hasGames = false;
    for (const k of keys) {
      const cache = await caches.open(k);
      files += (await cache.keys()).length;
      hasShell ||= !!(await cache.match('/'));
      hasGames ||= !!(await cache.match('/games/pixel-farm.html'));
    }
    if (hasShell && navigator.serviceWorker.controller) return { state: 'ready', files, hasGames };
    return { state: 'preparing', files };
  } catch {
    return { state: 'unsupported' };
  }
}

/* Install. The browser's install event is captured before the app loads (app/layout.tsx). */
export const isInstalled = () =>
  matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: window-controls-overlay)').matches || navigator.standalone === true;

const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** 'installed' | 'available' (one-click install) | 'ios' (Share → Add to Home Screen) | 'manual' */
export function installState() {
  if (isInstalled()) return 'installed';
  if (window.__codelingoInstall) return 'available';
  if (isIOS()) return 'ios';
  return 'manual';
}

/** Show the browser's install dialog. Resolves to true if the learner installed. */
export async function promptInstall() {
  const evt = window.__codelingoInstall;
  if (!evt) return false;
  window.__codelingoInstall = null;
  evt.prompt();
  const { outcome } = await evt.userChoice;
  return outcome === 'accepted';
}

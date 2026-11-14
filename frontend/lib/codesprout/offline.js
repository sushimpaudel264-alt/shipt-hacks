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

/** Cache the app itself so it opens with no connection. */
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/sw.js').catch(() => { /* app still works online */ });
}

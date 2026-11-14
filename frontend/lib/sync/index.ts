/** Offline sync engine, connectivity checks and service worker helpers. Browser-only. */
export {
  syncNow,
  retryFailed,
  notifyLocalChange,
  startSyncEngine,
  stopSyncEngine,
  getSyncState,
  subscribeSyncState,
  setSyncFetch,
  resetSyncEngineForTests,
} from "./syncEngine";
export { checkHealth } from "./connectivity";
export { deriveStatus } from "./syncStatus";
export {
  registerServiceWorker,
  cachePages,
  cacheCoursePages,
  setOfflinePages,
  DEFAULT_OFFLINE_PAGES,
  type OfflinePagesConfig,
} from "./serviceWorker";

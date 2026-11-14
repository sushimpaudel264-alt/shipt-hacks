/**
 * Offline sync engine (browser only).
 *
 * Triggers: startup, window "online" event, 60s interval while online, Background Sync
 * (service worker posts a message), and manual syncNow().
 *
 * Every run: health check (5s timeout) → send queued events in batches of 50 → mark acknowledged
 * ids "synced". On failure: attempts+1 with exponential backoff (2s, 4s, 8s ... capped at 60s);
 * after 5 attempts an event is "failed" and surfaced via status "error".
 * Safe to run concurrently/repeatedly: runs are serialized and the server dedupes event ids.
 */
import { setMeta } from "@/lib/db/database";
import * as syncRepo from "@/lib/db/repositories/syncRepo";
import { SyncResponseSchema } from "@/lib/schemas";
import type { ServerStudentState, SyncState } from "@/lib/types";
import { checkHealth } from "./connectivity";
import { deriveStatus, getSyncState, setSyncState, subscribeSyncState } from "./syncStatus";

export const SYNC_BATCH_SIZE = 50;
export const SYNC_INTERVAL_MS = 60_000;
const BACKOFF_BASE_MS = 2_000;
const BACKOFF_MAX_MS = 60_000;
export const BACKGROUND_SYNC_TAG = "learnloop-sync";

let fetchImpl: typeof fetch = (...args) => fetch(...args);
let running: Promise<SyncState> | null = null;
let started = false;
let intervalId: ReturnType<typeof setInterval> | null = null;
let consecutiveFailures = 0;
let nextAttemptAt = 0;
let reachable = true;

/** Tests can inject a fetch that routes to the API handlers. */
export function setSyncFetch(f: typeof fetch): void {
  fetchImpl = f;
}

async function refreshCounts(extra: Partial<SyncState> & { syncing?: boolean } = {}): Promise<SyncState> {
  const counts = await syncRepo.getQueueCounts();
  const { syncing = false, ...rest } = extra;
  const lastError = rest.lastError !== undefined ? rest.lastError : getSyncState().lastError;
  setSyncState({
    ...rest,
    queuedCount: counts.queued + counts.syncing,
    failedCount: counts.failed,
    status: deriveStatus({ reachable, syncing, queued: counts.queued + counts.syncing, failed: counts.failed, lastError }),
  });
  return getSyncState();
}

async function sendBatch(): Promise<"done" | "more" | "failed"> {
  const batch = await syncRepo.getPendingEvents(SYNC_BATCH_SIZE);
  if (batch.length === 0) return "done";
  const ids = batch.map((e) => e.id);
  await syncRepo.markSyncing(ids);
  try {
    const res = await fetchImpl("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      // Strip local bookkeeping so the server sees the canonical event.
      body: JSON.stringify({ events: batch.map((e) => ({ ...e, status: "queued" as const, lastError: undefined })) }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      throw new Error(body?.error?.message ?? `Sync failed (${res.status})`);
    }
    const data = SyncResponseSchema.parse(await res.json());
    const acked = new Set(data.acknowledgedIds);
    await syncRepo.markSynced(ids.filter((id) => acked.has(id)));
    const missing = ids.filter((id) => !acked.has(id));
    if (missing.length) await syncRepo.markAttemptFailed(missing, "Server did not acknowledge event");
    await setMeta("serverStudentState", data.serverStudentState satisfies ServerStudentState);
    return batch.length === SYNC_BATCH_SIZE ? "more" : "done";
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    await syncRepo.markAttemptFailed(ids, message);
    setSyncState({ lastError: message });
    return "failed";
  }
}

async function runSync(force: boolean): Promise<SyncState> {
  if (!force && Date.now() < nextAttemptAt) return refreshCounts();

  reachable = await checkHealth(undefined, fetchImpl);
  if (!reachable) return refreshCounts();

  await refreshCounts({ syncing: true });
  let outcome: "done" | "more" | "failed" = "more";
  // Bounded loop: at most 20 batches (1000 events) per run.
  for (let i = 0; i < 20 && outcome === "more"; i++) outcome = await sendBatch();

  if (outcome === "failed") {
    consecutiveFailures++;
    nextAttemptAt = Date.now() + Math.min(BACKOFF_BASE_MS * 2 ** (consecutiveFailures - 1), BACKOFF_MAX_MS);
    return refreshCounts();
  }
  consecutiveFailures = 0;
  nextAttemptAt = 0;
  const lastSyncedAt = new Date().toISOString();
  await setMeta("lastSyncedAt", lastSyncedAt);
  return refreshCounts({ lastSyncedAt, lastError: null });
}

/**
 * Runs a sync now. Concurrent calls share the in-flight run.
 * `force` (default true, i.e. the "Sync now" button) skips the backoff wait.
 */
export function syncNow(options: { force?: boolean } = {}): Promise<SyncState> {
  running ??= runSync(options.force ?? true).finally(() => {
    running = null;
  });
  return running;
}

/** Called after local writes so the badge count updates immediately and online devices sync right away. */
export async function notifyLocalChange(): Promise<void> {
  await refreshCounts();
  if (typeof navigator !== "undefined" && navigator.onLine) {
    void syncNow({ force: false });
  } else {
    void registerBackgroundSync();
  }
}

/** Background Sync API (Chrome/ChromeOS): lets the SW wake the app to sync when connectivity returns. */
async function registerBackgroundSync(): Promise<void> {
  try {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const reg = (await navigator.serviceWorker.getRegistration()) as
      | (ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } })
      | undefined;
    await reg?.sync?.register(BACKGROUND_SYNC_TAG);
  } catch {
    // Unsupported: the online event + interval fallbacks still cover us.
  }
}

const onOnline = () => void syncNow({ force: true });
const onOffline = () => {
  reachable = false;
  void refreshCounts();
};
const onSwMessage = (event: MessageEvent) => {
  if ((event.data as { type?: string } | null)?.type === "LEARNLOOP_SYNC_REQUESTED") void syncNow({ force: true });
};

/** Starts listeners + interval. Idempotent; returns a stop function. */
export function startSyncEngine(): () => void {
  if (typeof window === "undefined") return () => {};
  if (!started) {
    started = true;
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    navigator.serviceWorker?.addEventListener("message", onSwMessage);
    intervalId = setInterval(() => {
      if (navigator.onLine) void syncNow({ force: false });
    }, SYNC_INTERVAL_MS);
    void syncRepo.recoverStuckEvents().then(() => syncNow({ force: true }));
  }
  return stopSyncEngine;
}

export function stopSyncEngine(): void {
  if (!started) return;
  started = false;
  window.removeEventListener("online", onOnline);
  window.removeEventListener("offline", onOffline);
  navigator.serviceWorker?.removeEventListener("message", onSwMessage);
  if (intervalId) clearInterval(intervalId);
  intervalId = null;
}

export async function retryFailed(): Promise<SyncState> {
  await syncRepo.retryFailedEvents();
  setSyncState({ lastError: null });
  return syncNow({ force: true });
}

/** Tests only. */
export function resetSyncEngineForTests(): void {
  running = null;
  consecutiveFailures = 0;
  nextAttemptAt = 0;
  reachable = true;
}

export { getSyncState, subscribeSyncState };

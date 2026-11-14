import type { SyncState, SyncStatus } from "@/lib/types";

/** Tiny observable for sync state, so any hook/component can subscribe without React context. */
type Listener = (state: SyncState) => void;

let state: SyncState = { status: "online", queuedCount: 0, failedCount: 0, lastSyncedAt: null, lastError: null };
const listeners = new Set<Listener>();

export function getSyncState(): SyncState {
  return state;
}

export function setSyncState(patch: Partial<SyncState>): void {
  state = { ...state, ...patch };
  listeners.forEach((l) => l(state));
}

export function subscribeSyncState(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Status machine:
 *  offline → no connectivity (health check failed)
 *  syncing → a batch is in flight
 *  error   → events hit MAX attempts ("failed") or the last attempt errored
 *  queued  → online with unsent events (e.g. waiting for backoff)
 *  online  → reachable and nothing pending
 */
export function deriveStatus(input: { reachable: boolean; syncing: boolean; queued: number; failed: number; lastError: string | null }): SyncStatus {
  if (!input.reachable) return "offline";
  if (input.syncing) return "syncing";
  if (input.failed > 0 || (input.lastError && input.queued > 0)) return "error";
  if (input.queued > 0) return "queued";
  return "online";
}

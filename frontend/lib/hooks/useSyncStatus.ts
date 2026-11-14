"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { syncRepo } from "@/lib/db";
import { getSyncState, retryFailed, subscribeSyncState, syncNow } from "@/lib/sync";
import type { SyncState } from "@/lib/types";
import { LOCAL, queryKeys } from "./queryKeys";

const SERVER_SNAPSHOT: SyncState = { status: "online", queuedCount: 0, failedCount: 0, lastSyncedAt: null, lastError: null };

/**
 * { status: "online" | "offline" | "syncing" | "queued" | "error", queuedCount, failedCount,
 *   lastSyncedAt, lastError, syncNow(), retryFailed() }
 */
export function useSyncStatus() {
  const state = useSyncExternalStore(subscribeSyncState, getSyncState, () => SERVER_SNAPSHOT);
  const qc = useQueryClient();

  // Keep the queue list fresh whenever the engine changes state.
  useEffect(() => subscribeSyncState(() => void qc.invalidateQueries({ queryKey: queryKeys.syncQueue })), [qc]);

  return {
    ...state,
    syncNow: useCallback(() => syncNow({ force: true }), []),
    retryFailed: useCallback(() => retryFailed(), []),
  };
}

/** Raw sync queue (newest first) for a "pending changes" panel or diagnostics. */
export function useSyncQueue() {
  return useQuery({ queryKey: queryKeys.syncQueue, ...LOCAL, queryFn: () => syncRepo.getQueue() });
}

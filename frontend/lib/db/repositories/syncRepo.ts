/**
 * Persistent sync queue (Dexie table "syncQueue").
 * Events move: queued → syncing → synced, or back to queued with attempts+1 on failure,
 * and become "failed" after MAX_SYNC_ATTEMPTS (shown to the user; can be retried manually).
 */
import { toLocalDate } from "@/lib/gamification";
import type { NewSyncEvent, SyncEvent } from "@/lib/types";
import { getDB } from "../database";

export const MAX_SYNC_ATTEMPTS = 5;

export function newId(): string {
  return crypto.randomUUID();
}

/** Builds a queue-ready event. Must be written inside the same transaction as the data it describes. */
export function buildSyncEvent(studentId: string, event: NewSyncEvent, now = new Date()): SyncEvent {
  return {
    ...event,
    id: newId(),
    studentId,
    createdAt: now.toISOString(),
    localDate: toLocalDate(now),
    status: "queued",
    attempts: 0,
  } as SyncEvent;
}

/** Oldest-first events that still need sending. */
export async function getPendingEvents(limit = 50): Promise<SyncEvent[]> {
  return getDB().syncQueue.where("status").equals("queued").sortBy("createdAt").then((rows) => rows.slice(0, limit));
}

export async function getQueue(): Promise<SyncEvent[]> {
  return getDB().syncQueue.orderBy("createdAt").reverse().toArray();
}

export async function markSyncing(ids: string[]): Promise<void> {
  await getDB().syncQueue.where("id").anyOf(ids).modify({ status: "syncing" });
}

export async function markSynced(ids: string[]): Promise<void> {
  await getDB().syncQueue.where("id").anyOf(ids).modify((e) => {
    e.status = "synced";
    delete e.lastError;
  });
}

export async function markAttemptFailed(ids: string[], error: string): Promise<void> {
  await getDB().syncQueue.where("id").anyOf(ids).modify((e) => {
    e.attempts += 1;
    e.lastError = error.slice(0, 500);
    e.status = e.attempts >= MAX_SYNC_ATTEMPTS ? "failed" : "queued";
  });
}

/** If the tab closed mid-sync, "syncing" rows would be stuck forever; put them back in the queue. */
export async function recoverStuckEvents(): Promise<void> {
  await getDB().syncQueue.where("status").equals("syncing").modify({ status: "queued" });
}

export async function retryFailedEvents(): Promise<number> {
  return getDB().syncQueue.where("status").equals("failed").modify((e) => {
    e.status = "queued";
    e.attempts = 0;
  });
}

export async function getQueueCounts(): Promise<{ queued: number; syncing: number; synced: number; failed: number }> {
  const t = getDB().syncQueue;
  const [queued, syncing, synced, failed] = await Promise.all(
    (["queued", "syncing", "synced", "failed"] as const).map((s) => t.where("status").equals(s).count()),
  );
  return { queued, syncing, synced, failed };
}

/** Housekeeping: drop synced events older than `days` (default 30) to keep storage small. */
export async function pruneSynced(days = 30): Promise<number> {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  return getDB().syncQueue.where("status").equals("synced").and((e) => e.createdAt < cutoff).delete();
}

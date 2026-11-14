import "server-only";
/**
 * Server side of offline sync.
 *
 * Idempotency: every event carries a client-generated UUID. Processed ids are remembered, and a
 * replayed id is acknowledged again WITHOUT being re-applied, so XP can never be double-counted
 * no matter how many times a flaky connection resends a batch.
 *
 * Conflict rules (documented in README "Sync & conflict resolution"):
 *  - XP: derived from the event log. Additive, applied once per event id.
 *  - Lesson status: furthest status wins; completed beats in-progress, earliest completedAt kept.
 *  - Quiz results: append-only on the client; the server keeps the BEST score per lesson.
 *  - Badges: set union.
 *  - Streak: rebuilt from the set of distinct activity dates (student-local) in the event log.
 */
import { streakFromDates } from "@/lib/gamification";
import type { ServerStudentState, SyncEvent } from "@/lib/types";
import { HttpError } from "./http";
import { getStudentRecord, KNOWN_BADGE_IDS, type ServerStudentRecord } from "./store";

function applyEvent(rec: ServerStudentRecord, event: SyncEvent): void {
  switch (event.type) {
    case "xp-earned":
      // Demo trust model: the client computes XP offline. A real backend would recompute it from
      // lesson definitions here and cap it per lesson.
      rec.xp += event.payload.amount;
      break;
    case "lesson-completed": {
      const key = `${event.payload.courseId}:${event.payload.lessonId}`;
      const existing = rec.completed.get(key);
      if (!existing || existing.completedAt > event.payload.completedAt) {
        rec.completed.set(key, { ...event.payload });
      }
      break;
    }
    case "quiz-submitted": {
      const { lessonId, courseId, score } = event.payload.result;
      const key = `${courseId}:${lessonId}`;
      rec.bestQuizScores.set(key, Math.max(rec.bestQuizScores.get(key) ?? 0, score));
      break;
    }
    case "badge-unlocked":
      if (KNOWN_BADGE_IDS.has(event.payload.badgeId)) rec.badgeIds.add(event.payload.badgeId);
      break;
    case "course-downloaded":
      break; // Analytics only.
  }
  if (event.type !== "course-downloaded") rec.activityDates.add(event.localDate);
}

function toServerState(rec: ServerStudentRecord): ServerStudentState {
  return {
    studentId: rec.studentId,
    xp: rec.xp,
    completedLessons: [...rec.completed.values()],
    bestQuizScores: Object.fromEntries(rec.bestQuizScores),
    badgeIds: [...rec.badgeIds],
    activityDates: [...rec.activityDates].sort(),
    streak: streakFromDates(rec.activityDates),
    processedEventCount: rec.processedEventIds.size,
  };
}

export function processSyncBatch(events: SyncEvent[]): { acknowledgedIds: string[]; serverStudentState: ServerStudentState } {
  const studentId = events[0].studentId;
  if (events.some((e) => e.studentId !== studentId)) {
    throw new HttpError(400, "MIXED_STUDENTS", "A sync batch must contain events for a single student");
  }
  const rec = getStudentRecord(studentId);
  const acknowledgedIds: string[] = [];
  // Apply in creation order so "earliest completedAt" etc. behave predictably.
  for (const event of [...events].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    if (!rec.processedEventIds.has(event.id)) {
      applyEvent(rec, event);
      rec.processedEventIds.add(event.id);
    }
    acknowledgedIds.push(event.id);
  }
  return { acknowledgedIds, serverStudentState: toServerState(rec) };
}

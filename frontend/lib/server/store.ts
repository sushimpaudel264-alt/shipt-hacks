import "server-only";
/**
 * In-memory mock store.
 *
 * IMPORTANT (Vercel): serverless instances don't share memory and can be recycled at any time,
 * so anything written here (contributor drafts, sync state) is best-effort demo state.
 * Seed data is re-created from code on every cold start, so the catalog is always recoverable.
 * The student's offline experience never depends on this store: the client's IndexedDB is the
 * source of truth for progress, and /api/sync is idempotent so replays after a cold start are safe.
 *
 * The store is kept on globalThis so Next.js dev hot-reloads don't wipe it.
 */
import { BADGES, CONTRIBUTORS, DEMO_STUDENT_ID, DEMO_STUDENT_SEED, ORGANIZATIONS, SEED_COURSES } from "@/lib/mock";
import { addDays, toLocalDate } from "@/lib/gamification";
import type { Contributor, Course, Organization } from "@/lib/types";

export interface ServerStudentRecord {
  studentId: string;
  processedEventIds: Set<string>;
  /** XP from seed plus the sum of all processed xp-earned events (never recomputed from progress). */
  xp: number;
  completed: Map<string, { courseId: string; lessonId: string; completedAt: string }>;
  bestQuizScores: Map<string, number>;
  badgeIds: Set<string>;
  activityDates: Set<string>;
}

export interface Store {
  courses: Map<string, Course>;
  organizations: Map<string, Organization>;
  contributors: Map<string, Contributor>;
  students: Map<string, ServerStudentRecord>;
  /** When this instance seeded its store (useful to spot serverless cold starts). */
  createdAt: string;
}

function emptyStudent(studentId: string): ServerStudentRecord {
  return {
    studentId,
    processedEventIds: new Set(),
    xp: 0,
    completed: new Map(),
    bestQuizScores: new Map(),
    badgeIds: new Set(),
    activityDates: new Set(),
  };
}

function createStore(): Store {
  const jordan = emptyStudent(DEMO_STUDENT_ID);
  jordan.xp = DEMO_STUDENT_SEED.xp;
  DEMO_STUDENT_SEED.achievements.forEach((a) => jordan.badgeIds.add(a.badgeId));
  // Mirror the client seed: an N-day streak ending yesterday.
  const yesterday = addDays(toLocalDate(), -1);
  for (let i = 0; i < DEMO_STUDENT_SEED.streakDays; i++) jordan.activityDates.add(addDays(yesterday, -i));

  return {
    // structuredClone so mutations never leak into the seed modules.
    courses: new Map(SEED_COURSES.map((c) => [c.id, structuredClone(c)])),
    organizations: new Map(ORGANIZATIONS.map((o) => [o.id, structuredClone(o)])),
    contributors: new Map(CONTRIBUTORS.map((c) => [c.id, structuredClone(c)])),
    students: new Map([[DEMO_STUDENT_ID, jordan]]),
    createdAt: new Date().toISOString(),
  };
}

const globalForStore = globalThis as unknown as { __codelingoStore?: Store };

export function getStore(): Store {
  globalForStore.__codelingoStore ??= createStore();
  return globalForStore.__codelingoStore;
}

export function getStudentRecord(studentId: string): ServerStudentRecord {
  const store = getStore();
  let rec = store.students.get(studentId);
  if (!rec) {
    rec = emptyStudent(studentId);
    store.students.set(studentId, rec);
  }
  return rec;
}

/** Test helper: reset to seed state. */
export function resetStore(): void {
  globalForStore.__codelingoStore = createStore();
}

export const KNOWN_BADGE_IDS = new Set(BADGES.map((b) => b.id));

import { getBadge } from "@/lib/gamification/badges";
import { addDays, toLocalDate, updateStreak, type StreakChange } from "@/lib/gamification/streak";
import { DEMO_STUDENT_ID, DEMO_STUDENT_SEED } from "@/lib/mock/people";
import type { Badge, Student } from "@/lib/types";
import { getDB } from "../database";
import { buildSyncEvent } from "./syncRepo";

/** Jordan, with a streak that ends "yesterday" so today's first lesson extends it. */
export function createDemoStudent(now = new Date()): Student {
  const { streakDays, ...rest } = DEMO_STUDENT_SEED;
  return {
    ...rest,
    streak: { current: streakDays, longest: streakDays, lastActiveDate: addDays(toLocalDate(now), -1) },
    updatedAt: now.toISOString(),
  };
}

/** Returns the local student, creating the demo student on first run. */
export async function getStudent(): Promise<Student> {
  const db = getDB();
  return db.transaction("rw", db.student, async () => {
    const existing = await db.student.get(DEMO_STUDENT_ID);
    if (existing) return existing;
    const student = createDemoStudent();
    await db.student.put(student);
    return student;
  });
}

/** Adds XP and queues an xp-earned event in the SAME transaction. */
export async function addXP(
  amount: number,
  reason: "lesson-completed" | "quiz-bonus",
  courseId: string,
  lessonId: string,
): Promise<Student> {
  const db = getDB();
  return db.transaction("rw", db.student, db.syncQueue, async () => {
    const student = await getStudent();
    if (amount <= 0) return student;
    const updated = { ...student, xp: student.xp + amount, updatedAt: new Date().toISOString() };
    await db.student.put(updated);
    await db.syncQueue.add(buildSyncEvent(student.id, { type: "xp-earned", payload: { amount, reason, courseId, lessonId } }));
    return updated;
  });
}

/** Records learning activity for today's local date. Streak is local; the server rebuilds it from event dates. */
export async function recordActivityDay(today = toLocalDate()): Promise<{ student: Student; change: StreakChange }> {
  const db = getDB();
  return db.transaction("rw", db.student, async () => {
    const student = await getStudent();
    const { streak, change } = updateStreak(student.streak, today);
    const updated = { ...student, streak, updatedAt: new Date().toISOString() };
    await db.student.put(updated);
    return { student: updated, change };
  });
}

/** Idempotent: unlocking an owned badge is a no-op and queues nothing. */
export async function unlockBadge(badgeId: string): Promise<Badge | null> {
  const badge = getBadge(badgeId);
  if (!badge) throw new Error(`Unknown badge "${badgeId}"`);
  const db = getDB();
  return db.transaction("rw", db.student, db.syncQueue, async () => {
    const student = await getStudent();
    if (student.achievements.some((a) => a.badgeId === badgeId)) return null;
    const unlockedAt = new Date().toISOString();
    await db.student.put({ ...student, achievements: [...student.achievements, { badgeId, unlockedAt }], updatedAt: unlockedAt });
    await db.syncQueue.add(buildSyncEvent(student.id, { type: "badge-unlocked", payload: { badgeId, unlockedAt } }));
    return badge;
  });
}

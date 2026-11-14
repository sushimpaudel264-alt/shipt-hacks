/**
 * The local student record. XP, streak and badge changes happen inside progressRepo's
 * single transaction (together with their sync events), not here.
 */
import { addDays, toLocalDate } from "@/lib/gamification";
import { DEMO_STUDENT_ID, DEMO_STUDENT_SEED } from "@/lib/mock";
import type { Student } from "@/lib/types";
import { getDB } from "../database";

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


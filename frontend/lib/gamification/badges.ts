import { BADGES } from "@/lib/mock/badges";
import type { Badge, BadgeRule, Category, Progress, Student } from "@/lib/types";

export type BadgeStudentState = Pick<Student, "xp" | "streak" | "achievements">;

function ruleMet(
  rule: BadgeRule,
  student: BadgeStudentState,
  completed: Progress[],
  categoryByCourse: Record<string, Category>,
): boolean {
  switch (rule.type) {
    case "lessons-completed":
      return completed.length >= rule.count;
    case "category-lessons":
      return completed.filter((p) => categoryByCourse[p.courseId] === rule.category).length >= rule.count;
    case "streak":
      return Math.max(student.streak.current, student.streak.longest) >= rule.days;
    case "xp":
      return student.xp >= rule.amount;
  }
}

/**
 * Returns badges that are earned but NOT already in student.achievements.
 * Idempotent by construction: once a badge is recorded it is never returned again.
 */
export function evaluateBadges(
  student: BadgeStudentState,
  progress: Progress[],
  categoryByCourse: Record<string, Category>,
  badges: Badge[] = BADGES,
): Badge[] {
  const owned = new Set(student.achievements.map((a) => a.badgeId));
  // Dedupe by lesson so a lesson counted twice (e.g. two devices) can't inflate counts.
  const completed = [
    ...new Map(
      progress.filter((p) => p.status === "completed").map((p) => [`${p.courseId}:${p.lessonId}`, p]),
    ).values(),
  ];
  return badges.filter((b) => !owned.has(b.id) && ruleMet(b.rule, student, completed, categoryByCourse));
}

export function getBadge(id: string): Badge | undefined {
  return BADGES.find((b) => b.id === id);
}

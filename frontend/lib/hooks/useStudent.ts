"use client";
import { useQuery } from "@tanstack/react-query";
import * as studentRepo from "@/lib/db/repositories/studentRepo";
import { getLevel } from "@/lib/gamification/xp";
import { BADGES } from "@/lib/mock/badges";
import type { Badge, Student } from "@/lib/types";
import { LOCAL, queryKeys } from "./queryKeys";

export interface StudentView extends Student {
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  /** Earned badges with unlock time, newest first. */
  badges: (Badge & { unlockedAt: string })[];
  /** Every badge with an `earned` flag, for a badge wall. */
  allBadges: (Badge & { earned: boolean; unlockedAt: string | null })[];
}

export function toStudentView(student: Student): StudentView {
  const unlocked = new Map(student.achievements.map((a) => [a.badgeId, a.unlockedAt]));
  return {
    ...student,
    ...getLevel(student.xp),
    badges: BADGES.filter((b) => unlocked.has(b.id))
      .map((b) => ({ ...b, unlockedAt: unlocked.get(b.id)! }))
      .sort((a, b) => b.unlockedAt.localeCompare(a.unlockedAt)),
    allBadges: BADGES.map((b) => ({ ...b, earned: unlocked.has(b.id), unlockedAt: unlocked.get(b.id) ?? null })),
  };
}

/** The local student (Jordan in the demo): XP, level, streak, badges. Offline-safe. */
export function useStudent() {
  return useQuery({
    queryKey: queryKeys.student,
    ...LOCAL,
    queryFn: async () => toStudentView(await studentRepo.getStudent()),
  });
}

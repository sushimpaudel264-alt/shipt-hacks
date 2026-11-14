import type { LocalDate, Streak } from "@/lib/types";

/**
 * Streaks use the student's LOCAL calendar date (YYYY-MM-DD), not UTC.
 * A kid learning at 9pm in Birmingham should not have their activity
 * counted as "tomorrow" just because it's already the next day in UTC.
 */
export function toLocalDate(date: Date = new Date()): LocalDate {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Whole calendar days from a to b. Parsed as UTC midnight so DST shifts can't produce 0.958 days. */
export function daysBetween(a: LocalDate, b: LocalDate): number {
  const toUtc = (s: string) => {
    const [y, m, d] = s.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
}

export function addDays(date: LocalDate, days: number): LocalDate {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export type StreakChange = "started" | "same-day" | "continued" | "reset";

/** Applies activity on `today` to a streak. Pure: returns a new streak. */
export function updateStreak(streak: Streak, today: LocalDate): { streak: Streak; change: StreakChange } {
  const last = streak.lastActiveDate;
  if (!last) {
    return { streak: { current: 1, longest: Math.max(1, streak.longest), lastActiveDate: today }, change: "started" };
  }
  const gap = daysBetween(last, today);
  // gap < 0 means the device clock went backwards; treat like same-day rather than punishing the student.
  if (gap <= 0) return { streak: { ...streak, current: Math.max(1, streak.current) }, change: "same-day" };
  if (gap === 1) {
    const current = streak.current + 1;
    return { streak: { current, longest: Math.max(current, streak.longest), lastActiveDate: today }, change: "continued" };
  }
  return { streak: { current: 1, longest: Math.max(1, streak.longest), lastActiveDate: today }, change: "reset" };
}

/** Rebuilds a streak from a set of activity dates (used by the server, which only has the event log). */
export function streakFromDates(dates: Iterable<LocalDate>): Streak {
  const sorted = [...new Set(dates)].sort();
  let streak: Streak = { current: 0, longest: 0, lastActiveDate: null };
  for (const d of sorted) streak = updateStreak(streak, d).streak;
  return streak;
}

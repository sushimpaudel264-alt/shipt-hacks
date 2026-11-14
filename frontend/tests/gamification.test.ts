import { describe, expect, it } from "vitest";
import { evaluateBadges } from "@/lib/gamification/badges";
import { daysBetween, streakFromDates, toLocalDate, updateStreak } from "@/lib/gamification/streak";
import { calculateLessonXP, getLevel, quizBonusXP, scoreQuiz } from "@/lib/gamification/xp";
import { SEED_COURSES } from "@/lib/mock/courses";
import type { Progress, Streak } from "@/lib/types";

const lesson = { xpReward: 20 };

describe("XP", () => {
  it("awards base XP with no quiz", () => expect(calculateLessonXP(lesson, null)).toBe(20));
  it("adds up to 50% bonus for a perfect quiz", () => expect(calculateLessonXP(lesson, 100)).toBe(30));
  it("scales the bonus with score", () => {
    expect(quizBonusXP(lesson, 50)).toBe(5);
    expect(quizBonusXP(lesson, 0)).toBe(0);
  });
  it("clamps out-of-range scores", () => expect(calculateLessonXP(lesson, 250)).toBe(30));
  it("computes levels", () => expect(getLevel(185)).toEqual({ level: 2, xpIntoLevel: 85, xpForNextLevel: 100 }));
});

describe("quiz scoring", () => {
  const quiz = SEED_COURSES[0].lessons[0].quiz;
  it("grades the Variables quiz, case/whitespace-insensitively", () => {
    const answers = [
      { questionId: quiz.questions[0].id, answer: "The treasure chest with a name tag" },
      { questionId: quiz.questions[1].id, answer: "false" },
      { questionId: quiz.questions[2].id, answer: "  Five " },
      { questionId: quiz.questions[3].id, answer: "wrong" },
    ];
    const r = scoreQuiz(quiz, answers);
    expect(r.correctCount).toBe(3);
    expect(r.score).toBe(75);
    expect(r.passed).toBe(true);
  });
  it("treats missing answers as wrong", () => expect(scoreQuiz(quiz, []).score).toBe(0));
});

describe("streaks", () => {
  const s = (current: number, lastActiveDate: string | null): Streak => ({ current, longest: current, lastActiveDate });

  it("starts a streak on first activity", () => {
    expect(updateStreak(s(0, null), "2026-11-14")).toMatchObject({ change: "started", streak: { current: 1 } });
  });
  it("does not change on same-day activity", () => {
    expect(updateStreak(s(3, "2026-11-14"), "2026-11-14")).toMatchObject({ change: "same-day", streak: { current: 3 } });
  });
  it("increments on consecutive days", () => {
    expect(updateStreak(s(3, "2026-11-13"), "2026-11-14")).toMatchObject({ change: "continued", streak: { current: 4, longest: 4 } });
  });
  it("resets after a missed day but keeps longest", () => {
    const r = updateStreak({ current: 9, longest: 9, lastActiveDate: "2026-11-10" }, "2026-11-14");
    expect(r).toMatchObject({ change: "reset", streak: { current: 1, longest: 9 } });
  });
  it("handles month boundaries", () => {
    expect(updateStreak(s(5, "2026-10-31"), "2026-11-01").streak.current).toBe(6);
    expect(updateStreak(s(5, "2026-02-28"), "2026-03-01").streak.current).toBe(6); // 2026 isn't a leap year
    expect(updateStreak(s(5, "2028-02-28"), "2028-03-01").streak.current).toBe(1); // 2028 is (Feb 29 missed)
  });
  it("handles year boundaries and DST weeks", () => {
    expect(updateStreak(s(2, "2026-12-31"), "2027-01-01").streak.current).toBe(3);
    expect(daysBetween("2026-11-01", "2026-11-02")).toBe(1); // US DST ends Nov 1 2026
    expect(daysBetween("2026-03-08", "2026-03-09")).toBe(1);
  });
  it("never punishes a clock that went backwards", () => {
    expect(updateStreak(s(4, "2026-11-14"), "2026-11-13").streak.current).toBe(4);
  });
  it("rebuilds a streak from activity dates", () => {
    expect(streakFromDates(["2026-11-12", "2026-11-10", "2026-11-11", "2026-11-11"])).toEqual({
      current: 3,
      longest: 3,
      lastActiveDate: "2026-11-12",
    });
  });
  it("formats local dates", () => expect(toLocalDate(new Date(2026, 0, 5, 23, 30))).toBe("2026-01-05"));
});

describe("badges", () => {
  const p = (courseId: string, lessonId: string, status: Progress["status"] = "completed"): Progress => ({
    studentId: "s",
    courseId,
    lessonId,
    status,
    score: null,
    xpEarned: 0,
    completedAt: status === "completed" ? "2026-11-14T00:00:00.000Z" : null,
    updatedAt: "2026-11-14T00:00:00.000Z",
  });
  const cats = { "code-adventure": "coding", "math-quest": "math" } as const;
  const base = { xp: 0, streak: { current: 0, longest: 0, lastActiveDate: null }, achievements: [] };

  it("unlocks First Lesson", () => {
    expect(evaluateBadges(base, [p("code-adventure", "a")], cats).map((b) => b.id)).toEqual(["first-lesson"]);
  });
  it("ignores in-progress lessons", () => {
    expect(evaluateBadges(base, [p("code-adventure", "a", "in-progress")], cats)).toEqual([]);
  });
  it("unlocks category badges at 3 lessons, deduping repeated lessons", () => {
    const three = [p("code-adventure", "a"), p("code-adventure", "b"), p("code-adventure", "c")];
    expect(evaluateBadges(base, three, cats).map((b) => b.id)).toContain("coding-explorer");
    const dupes = [p("code-adventure", "a"), p("code-adventure", "a"), p("code-adventure", "b")];
    expect(evaluateBadges(base, dupes, cats).map((b) => b.id)).not.toContain("coding-explorer");
  });
  it("unlocks XP and streak badges", () => {
    const ids = evaluateBadges({ ...base, xp: 510, streak: { current: 7, longest: 7, lastActiveDate: "2026-11-14" } }, [], cats).map((b) => b.id);
    expect(ids).toEqual(expect.arrayContaining(["xp-100", "xp-500", "streak-7"]));
    expect(ids).not.toContain("streak-30");
  });
  it("never returns a badge the student already has", () => {
    const owned = { ...base, xp: 150, achievements: [{ badgeId: "xp-100", unlockedAt: "2026-11-01T00:00:00.000Z" }] };
    expect(evaluateBadges(owned, [], cats).map((b) => b.id)).not.toContain("xp-100");
  });
});

/**
 * Lesson progress + quiz results, fully offline.
 *
 * Each public function runs ONE Dexie transaction that writes the progress/quiz data, the student's
 * XP/streak/badges AND the matching sync events. If anything fails, everything rolls back, so the
 * student record and the sync queue can never disagree.
 *
 * XP rules (anti-farming, so retaking a quiz 50 times doesn't print XP):
 *  - Base lesson XP (lesson.xpReward) is awarded once, the first time a lesson is completed.
 *  - Quiz bonus is awarded on improvement only: new bonus(best score) - old bonus(previous best).
 *  So total XP for a lesson never exceeds calculateLessonXP(lesson, bestScore).
 */
import { evaluateBadges, quizBonusXP, scoreQuiz, toLocalDate, updateStreak } from "@/lib/gamification";
import type { Badge, Category, LearningOutcome, Lesson, Progress, QuizAnswer, QuizResult, SyncEvent } from "@/lib/types";
import { getDB } from "../database";
import { getStudent } from "./studentRepo";
import { buildSyncEvent, newId } from "./syncRepo";

export class LessonNotAvailableError extends Error {
  constructor(courseId: string, lessonId: string) {
    super(`Lesson ${lessonId} of course ${courseId} is not downloaded on this device.`);
    this.name = "LessonNotAvailableError";
  }
}

async function findLesson(courseId: string, lessonId: string): Promise<Lesson> {
  const pkg = await getDB().coursePackages.get(courseId);
  const lesson = pkg?.course.lessons.find((l) => l.id === lessonId);
  if (!lesson) throw new LessonNotAvailableError(courseId, lessonId);
  return lesson;
}

async function categoryByCourse(): Promise<Record<string, Category>> {
  const rows = await getDB().coursePackages.toArray();
  return Object.fromEntries(rows.map((r) => [r.id, r.course.category]));
}

function blankProgress(studentId: string, courseId: string, lessonId: string, now: string): Progress {
  return { studentId, courseId, lessonId, status: "not-started", score: null, xpEarned: 0, completedAt: null, updatedAt: now };
}

interface ApplyInput {
  courseId: string;
  lessonId: string;
  quiz?: { answers: QuizAnswer[] };
}

/** Shared implementation for completing a lesson and/or submitting its quiz. */
async function applyLearning({ courseId, lessonId, quiz }: ApplyInput): Promise<LearningOutcome> {
  const db = getDB();
  return db.transaction(
    "rw",
    [db.coursePackages, db.progress, db.quizResults, db.student, db.syncQueue],
    async () => {
      const lesson = await findLesson(courseId, lessonId);
      const student = await getStudent();
      const now = new Date();
      const nowIso = now.toISOString();
      const existing = (await db.progress.get([courseId, lessonId])) ?? blankProgress(student.id, courseId, lessonId, nowIso);
      const events: SyncEvent[] = [];
      const emit = (e: Parameters<typeof buildSyncEvent>[1]) => events.push(buildSyncEvent(student.id, e, now));

      let xpAwarded = 0;
      const progress: Progress = { ...existing, updatedAt: nowIso };

      // 1) First completion → base XP.
      if (existing.status !== "completed") {
        progress.status = "completed";
        progress.completedAt = nowIso;
        xpAwarded += lesson.xpReward;
        emit({ type: "lesson-completed", payload: { courseId, lessonId, completedAt: nowIso } });
        emit({ type: "xp-earned", payload: { amount: lesson.xpReward, reason: "lesson-completed", courseId, lessonId } });
      }

      // 2) Quiz → grade offline, append result, award bonus only for improvement.
      let quizResult: QuizResult | undefined;
      if (quiz) {
        const graded = scoreQuiz(lesson.quiz, quiz.answers);
        const prevBest = existing.score;
        const newBest = prevBest === null ? graded.score : Math.max(prevBest, graded.score);
        const bonus = Math.max(0, quizBonusXP(lesson, newBest) - quizBonusXP(lesson, prevBest));
        progress.score = newBest;
        quizResult = {
          id: newId(),
          studentId: student.id,
          courseId,
          lessonId,
          quizId: lesson.quiz.id,
          answers: graded.answers,
          correctCount: graded.correctCount,
          totalQuestions: graded.totalQuestions,
          score: graded.score,
          passed: graded.passed,
          xpEarned: bonus + xpAwarded,
          submittedAt: nowIso,
        };
        await db.quizResults.add(quizResult);
        emit({ type: "quiz-submitted", payload: { result: quizResult } });
        if (bonus > 0) {
          xpAwarded += bonus;
          emit({ type: "xp-earned", payload: { amount: bonus, reason: "quiz-bonus", courseId, lessonId } });
        }
      }
      progress.xpEarned = existing.xpEarned + xpAwarded;
      await db.progress.put(progress);

      // 3) Streak (student-local date) and XP.
      const { streak, change } = updateStreak(student.streak, toLocalDate(now));
      let updatedStudent = { ...student, xp: student.xp + xpAwarded, streak, updatedAt: nowIso };

      // 4) Badges, evaluated against the post-write state. evaluateBadges skips owned badges → idempotent.
      const allProgress = await db.progress.toArray();
      const newBadges: Badge[] = evaluateBadges(updatedStudent, allProgress, await categoryByCourse());
      if (newBadges.length) {
        updatedStudent = {
          ...updatedStudent,
          achievements: [...updatedStudent.achievements, ...newBadges.map((b) => ({ badgeId: b.id, unlockedAt: nowIso }))],
        };
        newBadges.forEach((b) => emit({ type: "badge-unlocked", payload: { badgeId: b.id, unlockedAt: nowIso } }));
      }

      await db.student.put(updatedStudent);
      await db.syncQueue.bulkAdd(events);

      return {
        xpAwarded,
        totalXp: updatedStudent.xp,
        newBadges,
        streak,
        streakIncreased: change === "continued" || change === "started",
        progress,
        quizResult,
      };
    },
  );
}

/** Marks a lesson completed (base XP once). Safe to call repeatedly. */
export async function completeLesson(input: { courseId: string; lessonId: string }): Promise<LearningOutcome> {
  return applyLearning(input);
}

/** Grades and stores a quiz attempt; also completes the lesson if it wasn't already. */
export async function submitQuiz(input: { courseId: string; lessonId: string; answers: QuizAnswer[] }): Promise<LearningOutcome> {
  return applyLearning({ courseId: input.courseId, lessonId: input.lessonId, quiz: { answers: input.answers } });
}

/** Marks a lesson in-progress when opened (local only; "furthest status wins" so this never downgrades). */
export async function startLesson(courseId: string, lessonId: string): Promise<Progress> {
  const db = getDB();
  return db.transaction("rw", db.progress, db.student, async () => {
    const student = await getStudent();
    const now = new Date().toISOString();
    const existing = await db.progress.get([courseId, lessonId]);
    if (existing && existing.status !== "not-started") return existing;
    const progress: Progress = { ...blankProgress(student.id, courseId, lessonId, now), status: "in-progress" };
    await db.progress.put(progress);
    return progress;
  });
}

export async function getCourseProgress(courseId: string): Promise<Progress[]> {
  return getDB().progress.where("courseId").equals(courseId).toArray();
}

export async function getAllProgress(): Promise<Progress[]> {
  return getDB().progress.toArray();
}

export async function getQuizResults(lessonId?: string): Promise<QuizResult[]> {
  const t = getDB().quizResults;
  const rows = lessonId ? await t.where("lessonId").equals(lessonId).toArray() : await t.toArray();
  return rows.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
}

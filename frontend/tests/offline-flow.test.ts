/**
 * Acceptance tests 1 & 2 from the spec, end to end:
 * DOWNLOAD → OFFLINE → COMPLETE LESSON → SUBMIT QUIZ → XP → BADGE → RECONNECT → SYNC (twice, no double XP).
 */
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { courseRepo, CodeLingoDB, progressRepo, setDBForTests, studentRepo, syncRepo } from "@/lib/db";
import { addDays, toLocalDate } from "@/lib/gamification";
import { SEED_COURSES } from "@/lib/mock";
import { resetStore } from "@/lib/server";
import { resetSyncEngineForTests, setSyncFetch, syncNow } from "@/lib/sync";
import { apiFetch, network } from "./helpers/apiFetch";

const variables = SEED_COURSES[0].lessons[0];
const perfectAnswers = variables.quiz.questions.map((q) => ({ questionId: q.id, answer: q.correctAnswer }));

let dbCount = 0;
beforeEach(() => {
  setDBForTests(new CodeLingoDB(`codelingo-test-${++dbCount}`));
  resetStore();
  resetSyncEngineForTests();
  network.online = true;
  network.requests.length = 0;
  courseRepo.setCourseFetcher(apiFetch);
  setSyncFetch(apiFetch);
});

describe("offline learning (acceptance test 1)", () => {
  it("downloads a course, then completes lesson + quiz with no network", async () => {
    await courseRepo.downloadCourse("code-adventure");
    expect((await courseRepo.getDownloaded()).map((c) => c.id)).toEqual(["code-adventure"]);

    network.online = false;
    network.requests.length = 0;

    const course = await courseRepo.getCourse("code-adventure");
    expect(course?.lessons[0].title).toBe("Variables");

    const before = await studentRepo.getStudent();
    expect(before).toMatchObject({ name: "Jordan", xp: 85, streak: { current: 3 } });

    await progressRepo.startLesson("code-adventure", variables.id);
    const lessonOutcome = await progressRepo.completeLesson({ courseId: "code-adventure", lessonId: variables.id });
    expect(lessonOutcome.xpAwarded).toBe(20);
    expect(lessonOutcome.streak.current).toBe(4);
    expect(lessonOutcome.streakIncreased).toBe(true);
    expect(lessonOutcome.newBadges.map((b) => b.id)).toEqual(["xp-100"]); // 85 + 20 = 105

    const quizOutcome = await progressRepo.submitQuiz({ courseId: "code-adventure", lessonId: variables.id, answers: perfectAnswers });
    expect(quizOutcome.quizResult).toMatchObject({ score: 100, passed: true, correctCount: 4 });
    expect(quizOutcome.xpAwarded).toBe(10); // bonus only; base already awarded
    expect(quizOutcome.streakIncreased).toBe(false); // same day
    expect(quizOutcome.newBadges).toEqual([]);

    const after = await studentRepo.getStudent();
    expect(after.xp).toBe(115);
    expect(after.achievements.map((a) => a.badgeId)).toEqual(["first-lesson", "math-master", "xp-100"]);
    expect(await progressRepo.getCourseProgress("code-adventure")).toEqual([
      expect.objectContaining({ lessonId: variables.id, status: "completed", score: 100, xpEarned: 30 }),
    ]);

    // Nothing touched the network while offline.
    expect(network.requests).toEqual([]);
  });

  it("does not farm XP from repeated completions or worse quiz retakes", async () => {
    await courseRepo.downloadCourse("code-adventure");
    const ids = { courseId: "code-adventure", lessonId: variables.id };
    await progressRepo.submitQuiz({ ...ids, answers: perfectAnswers.slice(0, 2) }); // 50%
    await progressRepo.completeLesson(ids);
    await progressRepo.submitQuiz({ ...ids, answers: [] }); // 0%
    const best = await progressRepo.submitQuiz({ ...ids, answers: perfectAnswers }); // 100%
    expect(best.xpAwarded).toBe(5); // bonus 10 - previous bonus 5
    const student = await studentRepo.getStudent();
    expect(student.xp).toBe(85 + 30);
    expect(await progressRepo.getQuizResults(variables.id)).toHaveLength(3); // append-only
  });

  it("unlocks Coding Explorer after all three coding lessons", async () => {
    await courseRepo.downloadCourse("code-adventure");
    const outcomes = [];
    for (const l of SEED_COURSES[0].lessons) {
      outcomes.push(await progressRepo.completeLesson({ courseId: "code-adventure", lessonId: l.id }));
    }
    expect(outcomes[2].newBadges.map((b) => b.id)).toContain("coding-explorer");
  });

  it("rolls back everything if the lesson isn't downloaded", async () => {
    await expect(progressRepo.completeLesson({ courseId: "math-quest", lessonId: "nope" })).rejects.toThrow(/not downloaded/);
    expect(await syncRepo.getQueue()).toEqual([]);
  });

  it("streak resets after a gap", async () => {
    await courseRepo.downloadCourse("code-adventure");
    const s = await studentRepo.getStudent();
    const { getDB } = await import("@/lib/db/database");
    await getDB().student.put({ ...s, streak: { current: 3, longest: 3, lastActiveDate: addDays(toLocalDate(), -3) } });
    const outcome = await progressRepo.completeLesson({ courseId: "code-adventure", lessonId: variables.id });
    expect(outcome.streak).toMatchObject({ current: 1, longest: 3 });
  });
});

describe("synchronization (acceptance test 2)", () => {
  it("queues offline, syncs on reconnect, and never double-counts XP", async () => {
    await courseRepo.downloadCourse("code-adventure");
    network.online = false;
    await progressRepo.completeLesson({ courseId: "code-adventure", lessonId: variables.id });
    await progressRepo.submitQuiz({ courseId: "code-adventure", lessonId: variables.id, answers: perfectAnswers });

    const queue = await syncRepo.getQueue();
    expect(queue.map((e) => e.type).sort()).toEqual(
      ["badge-unlocked", "course-downloaded", "lesson-completed", "quiz-submitted", "xp-earned", "xp-earned"].sort(),
    );

    // Still offline: sync reports offline and events stay queued.
    expect((await syncNow()).status).toBe("offline");
    expect((await syncRepo.getQueueCounts()).queued).toBe(6);

    // Reconnect.
    network.online = true;
    const state = await syncNow();
    expect(state.status).toBe("online");
    expect(await syncRepo.getQueueCounts()).toMatchObject({ queued: 0, synced: 6, failed: 0 });

    const { getMeta } = await import("@/lib/db/database");
    const server1 = await getMeta<{ xp: number; badgeIds: string[]; completedLessons: unknown[] }>("serverStudentState");
    expect(server1?.xp).toBe(115);
    expect(server1?.badgeIds).toContain("xp-100");
    expect(server1?.completedLessons).toHaveLength(1);

    // Sync again: nothing pending, nothing changes.
    await syncNow();
    // Simulate a lost ack: force every event back to "queued" and replay the whole log.
    const { getDB } = await import("@/lib/db/database");
    await getDB().syncQueue.toCollection().modify({ status: "queued" });
    await syncNow();
    const server2 = await getMeta<{ xp: number; processedEventCount: number }>("serverStudentState");
    expect(server2?.xp).toBe(115);
    expect(server2?.processedEventCount).toBe(6);
    expect((await studentRepo.getStudent()).xp).toBe(115);
  });

  it("retries with attempts and marks events failed after 5 attempts", async () => {
    await courseRepo.downloadCourse("code-adventure");
    await progressRepo.completeLesson({ courseId: "code-adventure", lessonId: variables.id });
    // Health OK but /api/sync broken.
    setSyncFetch(async (input, init) => {
      if (String(input).startsWith("/api/sync")) return Response.json({ error: { code: "X", message: "boom" } }, { status: 500 });
      return apiFetch(input, init);
    });
    let state = await syncNow();
    expect(state.status).toBe("error");
    for (let i = 0; i < 4; i++) state = await syncNow({ force: true });
    const counts = await syncRepo.getQueueCounts();
    expect(counts.failed).toBe(4);
    expect(state.failedCount).toBe(4);
    expect((await syncRepo.getQueue())[0].lastError).toBe("boom");
  });
});

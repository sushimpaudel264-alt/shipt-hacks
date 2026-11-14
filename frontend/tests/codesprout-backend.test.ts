/**
 * Tests for lib/codesprout/backend.js: the bridge between the CodeLingo UI and the data layer.
 * Course mapping, downloads, lesson completion, quiz recording and sync, against the real
 * repositories (fake IndexedDB) and the real API route handlers.
 */
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import * as bridge from "@/lib/codesprout/backend";
import { courseRepo, CodeLingoDB, setDBForTests, syncRepo } from "@/lib/db";
import { SEED_COURSES } from "@/lib/mock";
import { resetStore } from "@/lib/server";
import { resetSyncEngineForTests, setSyncFetch } from "@/lib/sync";
import { apiFetch, network } from "./helpers/apiFetch";

const codeAdventure = SEED_COURSES[0];
const variables = codeAdventure.lessons[0];

let n = 0;
beforeEach(() => {
  setDBForTests(new CodeLingoDB(`codesprout-bridge-${++n}`));
  resetStore();
  resetSyncEngineForTests();
  network.online = true;
  globalThis.fetch = apiFetch;
  courseRepo.setCourseFetcher(apiFetch);
  setSyncFetch(apiFetch);
});

describe("course mapping", () => {
  const ui = bridge.toUiCourse(codeAdventure);

  it("turns each lesson into a lesson item followed by its quiz item", () => {
    expect(ui.items).toHaveLength(codeAdventure.lessons.length * 2);
    expect(ui.items.slice(0, 2).map((i: { id: string; type: string }) => [i.id, i.type])).toEqual([
      [variables.id, "lesson"],
      [variables.id + bridge.QUIZ_SUFFIX, "quiz"],
    ]);
    expect(ui).toMatchObject({ id: "code-adventure", subject: "coding", icon: "🤖", difficulty: "beginner", version: 1 });
  });

  it("renders sections as Markdown the UI understands (## headings, ~~~ code)", () => {
    const body: string = ui.items[0].body;
    expect(body).toContain("## Pixel's Treasure Problem");
    expect(body).not.toMatch(/^### /m);
    expect(body).toContain("~~~\ncoins = 5");
  });

  it("maps every question type, keeping the data layer's pass mark", () => {
    const quiz = ui.items[1];
    expect(quiz.passingScore).toBe(variables.quiz.passingScore);
    const [mc, tf, fill] = quiz.questions;
    expect(mc.choices[mc.answer]).toBe(variables.quiz.questions[0].correctAnswer);
    expect(tf).toMatchObject({ choices: ["True", "False"], values: ["true", "false"], answer: 1 });
    expect(fill).toMatchObject({ fill: true, correct: "5", accept: ["five"] });
    expect(fill.prompt).toBe("After running score = 4 and then score = score + 1, the value of score is ____."); // no raw backticks
  });

  it("maps categories the UI has no subject for to 'other'", () => {
    expect(bridge.toUiCourse(SEED_COURSES[3]).subject).toBe("other"); // digital-citizenship
  });
});

describe("API, downloads, progress and sync", () => {
  it("lists the real catalog and opens downloaded courses from IndexedDB offline", async () => {
    const api = bridge.createBackendApi();
    const list = await api.getCourses();
    expect(list.map((c: { id: string }) => c.id)).toEqual(SEED_COURSES.map((c) => c.id));
    expect(list[0].items[0]).toEqual({ id: variables.id, type: "lesson", title: "Variables", minutes: 15 });

    const rec = await bridge.downloads.save({ id: "code-adventure" });
    expect(rec).toMatchObject({ id: "code-adventure", version: 1, title: "Code Adventure" });
    network.online = false;
    expect((await api.getCourse("code-adventure")).items).toHaveLength(6);
    expect((await bridge.downloads.list()).map((r: { id: string }) => r.id)).toEqual(["code-adventure"]);
    await expect(api.getCourse("math-quest")).rejects.toMatchObject({ offline: true });
  });

  it("records lessons and quizzes in the data layer (XP, badges) and rebuilds UI markers", async () => {
    await bridge.downloads.save({ id: "code-adventure" });
    const ui = bridge.toUiCourse(codeAdventure);
    network.online = false;

    const lesson = await bridge.completeLesson("code-adventure", ui.items[0]);
    expect(lesson.xpAwarded).toBe(20);
    expect(lesson.newBadges.map((b: { id: string }) => b.id)).toEqual(["xp-100"]);

    const quizItem = ui.items[1];
    const answers = quizItem.questions.map((q: { id: string; fill?: boolean; correct?: string; values?: string[]; answer: number }) => ({
      questionId: q.id,
      answer: q.fill ? q.correct : q.values![q.answer],
    }));
    const quiz = await bridge.submitQuiz("code-adventure", quizItem, answers);
    expect(quiz.quizResult).toMatchObject({ score: 100, passed: true });
    expect(quiz.xpAwarded).toBe(10);
    expect(bridge.getStudentSnapshot()).toMatchObject({ xp: 115, streak: { current: 4 } });

    const store = { done: {} as Record<string, string>, badges: {} as Record<string, string> };
    await bridge.loadProgressInto(store);
    expect(Object.keys(store.done).sort()).toEqual([`code-adventure/${variables.id}`, `code-adventure/${variables.id}${bridge.QUIZ_SUFFIX}`]);
    expect(Object.keys(store.badges)).toEqual(expect.arrayContaining(["first-lesson", "math-master", "xp-100"]));
  });

  it("queues progress offline and syncs it once on reconnect (no double XP)", async () => {
    await bridge.downloads.save({ id: "code-adventure" });
    network.online = false;
    await bridge.completeLesson("code-adventure", bridge.toUiCourse(codeAdventure).items[0]);
    expect((await bridge.sync.now()).status).toBe("offline");
    expect((await syncRepo.getQueueCounts()).queued).toBe(4);

    network.online = true;
    const state = await bridge.sync.now();
    expect(state).toMatchObject({ status: "online", queuedCount: 0 });
    await bridge.sync.now();
    const res = await apiFetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events: (await syncRepo.getQueue()).map((e) => ({ ...e, status: "queued" })) }),
    });
    expect((await res.json()).serverStudentState.xp).toBe(105);
  });

  it("signs Log in and Create account into the demo student (no real accounts)", async () => {
    const api = bridge.createBackendApi();
    const demo = { token: "demo", user: { username: "jordan", display_name: "Jordan", role: "student" } };
    expect(await api.login("anyone", "whatever-password")).toEqual(demo);
    expect(
      await api.register({ username: "newkid", password: "password123", display_name: "New Kid", title: "Student", access_code: "" }),
    ).toEqual(demo);
    expect(await api.logout()).toEqual({});
  });

  it("uses the data layer's badge catalog and the demo student", async () => {
    expect(bridge.BADGES).toHaveLength(8);
    expect(bridge.BADGES[0]).toEqual({ id: "first-lesson", icon: "🌱", name: "First Lesson", desc: "Finished your very first lesson!" });
    await bridge.refreshStudent();
    expect(bridge.DEMO_USER()).toEqual({ username: "jordan", display_name: "Jordan", role: "student" });
  });
});

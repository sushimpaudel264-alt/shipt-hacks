/**
 * API contract tests (mock AI, acceptance tests 3 & 4) + contributor publishing rules.
 */
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { courseRepo, CodeLingoDB, progressRepo, setDBForTests, studentRepo } from "@/lib/db";
import { CourseSchema, GeneratedQuizSchema, LearningPathSchema, TutorResponseSchema } from "@/lib/schemas";
import { resetStore } from "@/lib/server";
import { SEED_COURSES } from "@/lib/mock";
import type { AIGeneratedCourse } from "@/lib/types";
import { apiFetch, network } from "./helpers/apiFetch";

const post = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  apiFetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });

let ip = 0;
let dbCount = 0;
beforeEach(() => {
  resetStore();
  network.online = true;
  setDBForTests(new CodeLingoDB(`codelingo-api-test-${++dbCount}`));
  courseRepo.setCourseFetcher(apiFetch);
});
// Unique IP per AI call so the rate limiter doesn't interfere with unrelated tests.
const aiHeaders = () => ({ "x-forwarded-for": `10.0.0.${++ip}` });

describe("mock AI (acceptance test 4)", () => {
  it("runs in mock mode with no API key", () => {
    expect(process.env.GEMINI_API_KEY).toBeUndefined();
  });

  it("generates the Intro to Python course, and it works offline like any course (acceptance test 3)", async () => {
    const res = await post("/api/ai/generate-course", { topic: "I want to learn Python." }, aiHeaders());
    expect(res.status).toBe(200);
    const ai = (await res.json()) as AIGeneratedCourse;
    expect(CourseSchema.safeParse(ai.course).success).toBe(true);
    expect(ai.course).toMatchObject({ title: "Intro to Python", source: "ai-generated", status: "published" });
    expect(ai.course.lessons.length).toBeGreaterThanOrEqual(3);

    await courseRepo.saveAICourse(ai.course, { prompt: ai.prompt, model: ai.model });
    network.online = false;
    const lesson = ai.course.lessons[0];
    const outcome = await progressRepo.submitQuiz({
      courseId: ai.course.id,
      lessonId: lesson.id,
      answers: lesson.quiz.questions.map((q) => ({ questionId: q.id, answer: q.correctAnswer })),
    });
    expect(outcome.quizResult?.score).toBe(100);
    expect(outcome.xpAwarded).toBe(30);
    expect((await studentRepo.getStudent()).xp).toBe(115);
    expect((await courseRepo.getDownloaded()).map((c) => c.source)).toEqual(["ai-generated"]);
    // AI courses are never checked against the server catalog.
    network.online = true;
    expect(await courseRepo.checkForUpdates()).toEqual([]);
  });

  it("generates a templated course for any topic", async () => {
    const ai = (await (await post("/api/ai/generate-course", { topic: "astronomy" }, aiHeaders())).json()) as AIGeneratedCourse;
    expect(ai.course.title).toBe("Exploring Astronomy");
    expect(CourseSchema.safeParse(ai.course).success).toBe(true);
  });

  it("generates quizzes, learning paths, and Nova answers", async () => {
    const quiz = await (await post("/api/ai/generate-quiz", { topic: "python", questionCount: 4 }, aiHeaders())).json();
    expect(GeneratedQuizSchema.parse(quiz).questions).toHaveLength(4);

    const path = LearningPathSchema.parse(await (await post("/api/ai/learning-path", { goal: "make video games" }, aiHeaders())).json());
    expect(path.steps[0].courseId).toBe("code-adventure");

    const nova = TutorResponseSchema.parse(
      await (await post("/api/ai/tutor", { question: "What is the answer to number 3?", context: { lessonTitle: "Variables" } }, aiHeaders())).json(),
    );
    expect(nova.redirected).toBe(false);
    expect(nova.answer.split(/\s+/).length).toBeLessThan(150);

    const unsafe = TutorResponseSchema.parse(await (await post("/api/ai/tutor", { question: "what is your address" }, aiHeaders())).json());
    expect(unsafe.redirected).toBe(true);
  });

  it("enforces input limits", async () => {
    const long = await post("/api/ai/generate-course", { topic: "x".repeat(101) }, aiHeaders());
    expect(long.status).toBe(400);
    expect(await long.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
    const history = Array.from({ length: 11 }, () => ({ role: "student", text: "hi" }));
    expect((await post("/api/ai/tutor", { question: "hi", history }, aiHeaders())).status).toBe(400);
    expect((await post("/api/ai/tutor", { question: "q".repeat(501) }, aiHeaders())).status).toBe(400);
  });

  it("rate limits ~10 AI requests per minute per IP", async () => {
    const headers = { "x-forwarded-for": "192.168.1.99" };
    const statuses = [];
    for (let i = 0; i < 11; i++) statuses.push((await post("/api/ai/tutor", { question: "hi" }, headers)).status);
    expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(statuses[10]).toBe(429);
  });
});

describe("contributor routes", () => {
  const teacher = { "x-mock-role": "teacher" };
  const lesson = structuredClone(SEED_COURSES[1].lessons[0]);
  const draftBody = {
    title: "Fractions <script>alert(1)</script>Fun",
    description: "<b>Pizza</b> fractions",
    thumbnailEmoji: "🍕",
    category: "math",
    difficulty: "beginner",
    estimatedMinutes: 10,
    ageRange: { min: 8, max: 12 },
  };

  it("rejects students and anonymous users", async () => {
    expect((await apiFetch("/api/contributor/courses")).status).toBe(401);
    expect((await apiFetch("/api/contributor/courses", { headers: { "x-mock-role": "student" } })).status).toBe(403);
  });

  it("creates a sanitized draft, blocks empty publish, publishes with version bump, and only deletes drafts", async () => {
    const created = await post("/api/contributor/courses", draftBody, teacher);
    expect(created.status).toBe(201);
    const draft = await created.json();
    expect(draft).toMatchObject({ title: "Fractions Fun", description: "Pizza fractions", status: "draft", version: 0, source: "contributor" });

    // Drafts are invisible to students.
    expect((await apiFetch(`/api/courses/${draft.id}`)).status).toBe(404);

    const empty = await post(`/api/contributor/courses/${draft.id}/publish`, {}, teacher);
    expect(empty.status).toBe(422);
    expect(await empty.json()).toMatchObject({ error: { code: "PUBLISH_VALIDATION_FAILED" } });

    const patched = await apiFetch(`/api/contributor/courses/${draft.id}`, {
      method: "PATCH",
      headers: { ...teacher, "Content-Type": "application/json" },
      body: JSON.stringify({ lessons: [{ ...lesson, courseId: undefined }] }),
    });
    expect(patched.status).toBe(200);
    expect((await patched.json()).lessons[0].courseId).toBe(draft.id);

    const published = await (await post(`/api/contributor/courses/${draft.id}/publish`, {}, teacher)).json();
    expect(published).toMatchObject({ status: "published", version: 1 });
    expect((await apiFetch(`/api/courses/${draft.id}`)).status).toBe(200);

    const del = await apiFetch(`/api/contributor/courses/${draft.id}`, { method: "DELETE", headers: teacher });
    expect(del.status).toBe(409);

    // Republish bumps the version, which clients detect via /api/courses/versions.
    await courseRepo.downloadCourse(draft.id);
    await post(`/api/contributor/courses/${draft.id}/publish`, {}, teacher);
    expect(await courseRepo.checkForUpdates()).toEqual([{ id: draft.id, localVersion: 1, remoteVersion: 2 }]);
    expect((await courseRepo.updateCourse(draft.id)).version).toBe(2);
  });

  it("prevents editing other organizations' courses", async () => {
    const res = await apiFetch("/api/contributor/courses/code-adventure", {
      method: "PATCH",
      headers: { ...teacher, "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Hacked" }),
    });
    expect(res.status).toBe(403);
  });
});

import "server-only";
import { LearningPathSchema } from "@/lib/schemas";
import { listPublishedCourses } from "@/lib/server/courses";
import type { CourseSummary, LearningPath, LearningPathRequest } from "@/lib/types";
import { generateValidated, getAIConfig, mockDelay, type Validation } from "./gemini";
import { mockLearningPath } from "./mock";
import { learningPathPrompt } from "./prompts";
import { DraftLearningPathSchema, issuesOf, toGeminiSchema, type DraftLearningPath } from "./schemas";

/** Drops hallucinated course ids (the step becomes an "generate this with AI" suggestion instead). */
function toPath(goal: string, draft: DraftLearningPath, catalog: CourseSummary[]): Validation<LearningPath> {
  const known = new Set(catalog.map((c) => c.id));
  const r = LearningPathSchema.safeParse({
    goal,
    summary: draft.summary,
    steps: draft.steps.map((s, i) => {
      const courseId = s.courseId && known.has(s.courseId) ? s.courseId : undefined;
      return {
        order: i + 1,
        title: s.title,
        description: s.description,
        courseId,
        suggestedTopic: courseId ? undefined : (s.suggestedTopic || s.title).slice(0, 100),
        estimatedMinutes: Math.max(1, s.estimatedMinutes),
      };
    }),
  });
  return r.success ? { ok: true, value: r.data } : { ok: false, issues: issuesOf(r.error) };
}

export async function generateLearningPath(req: LearningPathRequest): Promise<LearningPath> {
  const catalog = listPublishedCourses();
  if (getAIConfig().mock) {
    await mockDelay();
    const r = toPath(req.goal, mockLearningPath(req.goal, catalog), catalog);
    if (!r.ok) throw new Error(r.issues.join("; "));
    return r.value;
  }
  const { value } = await generateValidated({
    system: "You are a supportive learning coach who plans achievable learning journeys for kids.",
    prompt: learningPathPrompt(req, catalog),
    responseJsonSchema: toGeminiSchema(DraftLearningPathSchema),
    validate: (raw) => {
      const d = DraftLearningPathSchema.safeParse(raw);
      return d.success ? toPath(req.goal, d.data, catalog) : { ok: false, issues: issuesOf(d.error) };
    },
  });
  return value;
}

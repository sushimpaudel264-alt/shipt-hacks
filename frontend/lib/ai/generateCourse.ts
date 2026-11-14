import "server-only";
import { estimateSizeBytes } from "@/lib/mock";
import { CourseSchema } from "@/lib/schemas";
import type { AIGeneratedCourse, Course, GenerateCourseRequest } from "@/lib/types";
import { generateValidated, getAIConfig, mockDelay, type Validation } from "./gemini";
import { MOCK_MODEL, mockCourseFor } from "./mock";
import { coursePrompt } from "./prompts";
import { DraftCourseSchema, issuesOf, toGeminiSchema, type DraftCourse } from "./schemas";

const AI_ORGANIZATION_ID = "codelingo-ai";
const AI_AUTHOR_ID = "nova-ai";

/** Adds ids/bookkeeping to a model draft and validates it against the SAME CourseSchema as official courses. */
function draftToCourse(draft: DraftCourse, now = new Date()): Validation<Course> {
  const slug = draft.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "ai-course";
  const suffix = crypto.randomUUID().slice(0, 8);
  const id = `ai-${slug}-${suffix}`;
  const base: Omit<Course, "sizeBytes"> = {
    id,
    slug: `${slug}-${suffix}`,
    title: draft.title,
    description: draft.description,
    thumbnailEmoji: draft.thumbnailEmoji,
    category: draft.category,
    difficulty: draft.difficulty,
    estimatedMinutes: Math.max(1, draft.estimatedMinutes),
    ageRange: draft.ageRange,
    organizationId: AI_ORGANIZATION_ID,
    authorId: AI_AUTHOR_ID,
    status: "published",
    version: 1,
    source: "ai-generated",
    updatedAt: now.toISOString(),
    lessons: draft.lessons.map((l, i) => {
      const lessonId = `${id}-l${i + 1}`;
      return {
        id: lessonId,
        courseId: id,
        order: i + 1,
        title: l.title,
        summary: l.summary,
        estimatedMinutes: l.estimatedMinutes,
        xpReward: l.xpReward,
        sections: l.sections.map((s, j) => ({
          ...s,
          id: `${lessonId}-s${j + 1}`,
          activity: s.activity ? { ...s.activity, id: `${lessonId}-s${j + 1}-activity` } : undefined,
        })),
        quiz: {
          id: `${lessonId}-quiz`,
          lessonId,
          passingScore: 60,
          questions: l.questions.map((q, j) => ({ ...q, id: `${lessonId}-q${j + 1}` })),
        },
      };
    }),
  };
  const parsed = CourseSchema.safeParse({ ...base, sizeBytes: estimateSizeBytes(base) });
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, issues: issuesOf(parsed.error) };
}

function validateDraft(raw: unknown): Validation<Course> {
  const draft = DraftCourseSchema.safeParse(raw);
  if (!draft.success) return { ok: false, issues: issuesOf(draft.error) };
  return draftToCourse(draft.data);
}

export async function generateCourse(req: GenerateCourseRequest): Promise<AIGeneratedCourse> {
  const createdAt = new Date().toISOString();
  if (getAIConfig().mock) {
    await mockDelay();
    const result = draftToCourse(mockCourseFor(req.topic));
    if (!result.ok) throw new Error(`Mock course invalid: ${result.issues.join("; ")}`);
    return { course: { ...result.value, source: "ai-generated" }, prompt: req.topic, createdAt, model: MOCK_MODEL };
  }
  const { value, model } = await generateValidated({
    system: "You are an expert curriculum designer who writes fun, accurate mini-courses for kids.",
    prompt: coursePrompt(req),
    responseJsonSchema: toGeminiSchema(DraftCourseSchema),
    validate: validateDraft,
  });
  return { course: { ...value, source: "ai-generated" }, prompt: req.topic, createdAt, model };
}

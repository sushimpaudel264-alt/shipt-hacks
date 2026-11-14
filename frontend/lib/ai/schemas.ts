/**
 * "Draft" schemas the model fills in. They intentionally have NO ids, courseIds, versions or
 * other bookkeeping: models are bad at inventing consistent ids, so the server adds those and then
 * validates the result against the real CourseSchema. Also no .refine() here, since refinements can't
 * be expressed as JSON Schema for Gemini's structured output; CourseSchema enforces them afterwards.
 */
import { z } from "zod";
import { CategorySchema, DifficultySchema, QuestionTypeSchema, SectionTypeSchema } from "@/lib/schemas";

export const DraftActivitySchema = z.object({
  kind: z.enum(["choose", "fill-in"]),
  prompt: z.string(),
  options: z.array(z.string()).optional(),
  answer: z.string(),
  hint: z.string().optional(),
  successMessage: z.string().optional(),
});

export const DraftSectionSchema = z.object({
  type: SectionTypeSchema,
  title: z.string(),
  body: z.string(),
  code: z.string().optional(),
  activity: DraftActivitySchema.optional(),
  hint: z.string().optional(),
  solution: z.string().optional(),
});

export const DraftQuestionSchema = z.object({
  type: QuestionTypeSchema,
  prompt: z.string(),
  options: z.array(z.string()).optional(),
  correctAnswer: z.string(),
  acceptableAnswers: z.array(z.string()).optional(),
  explanation: z.string(),
});

export const DraftLessonSchema = z.object({
  title: z.string(),
  summary: z.string(),
  estimatedMinutes: z.number().int(),
  xpReward: z.number().int(),
  sections: z.array(DraftSectionSchema).min(1),
  questions: z.array(DraftQuestionSchema).min(1),
});

export const DraftCourseSchema = z.object({
  title: z.string(),
  description: z.string(),
  thumbnailEmoji: z.string(),
  category: CategorySchema,
  difficulty: DifficultySchema,
  estimatedMinutes: z.number().int(),
  ageRange: z.object({ min: z.number().int(), max: z.number().int() }),
  lessons: z.array(DraftLessonSchema).min(1),
});

export const DraftQuizSchema = z.object({ questions: z.array(DraftQuestionSchema).min(1) });

export const DraftLearningPathSchema = z.object({
  summary: z.string(),
  steps: z
    .array(
      z.object({
        title: z.string(),
        description: z.string(),
        courseId: z.string().optional(),
        suggestedTopic: z.string().optional(),
        estimatedMinutes: z.number().int(),
      }),
    )
    .min(1),
});

export const DraftTutorSchema = z.object({
  answer: z.string(),
  redirected: z.boolean(),
  followUpQuestion: z.string().optional(),
});

export type DraftCourse = z.infer<typeof DraftCourseSchema>;
export type DraftQuestion = z.infer<typeof DraftQuestionSchema>;
export type DraftLearningPath = z.infer<typeof DraftLearningPathSchema>;
export type DraftTutor = z.infer<typeof DraftTutorSchema>;

export function issuesOf(error: z.ZodError): string[] {
  return error.issues.slice(0, 20).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
}

/** Zod → JSON Schema for Gemini's `responseJsonSchema` (drops keywords Gemini doesn't accept). */
export function toGeminiSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

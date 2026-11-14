/**
 * LearnLoop shared contracts (Zod).
 *
 * Every type the frontend uses is inferred from these schemas (see lib/types),
 * so validation and typing can never drift apart. Official, contributor and
 * AI-generated courses all use the SAME CourseSchema, which is what lets the
 * lesson player and offline storage treat them identically.
 */
import { z } from "zod";

// ---------- Enums ----------

export const CategorySchema = z.enum([
  "coding",
  "math",
  "science",
  "digital-citizenship",
  "writing",
  "other",
]);
export const DifficultySchema = z.enum(["beginner", "intermediate", "advanced"]);
export const CourseStatusSchema = z.enum(["draft", "published"]);
export const CourseSourceSchema = z.enum(["official", "contributor", "ai-generated"]);
export const SectionTypeSchema = z.enum([
  "story",
  "analogy",
  "explanation",
  "example",
  "interactive-exercise",
  "practice-challenge",
]);
export const QuestionTypeSchema = z.enum(["multiple-choice", "true-false", "fill-in-the-blank"]);
export const ContributorRoleSchema = z.enum([
  "teacher",
  "edfarm-contributor",
  "school-admin",
  "community-partner",
  "volunteer-mentor",
]);
export const OrganizationTypeSchema = z.enum(["edfarm", "school", "library", "after-school", "stem-org"]);
export const ProgressStatusSchema = z.enum(["not-started", "in-progress", "completed"]);

const id = z.string().min(1).max(120);
const isoDate = z.iso.datetime({ offset: true });
/** Student-local calendar date, e.g. "2026-11-14". Streaks are computed on these. */
export const LocalDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

// ---------- Lesson content ----------

/**
 * Interactive exercise embedded in a lesson section. Kept deliberately simple
 * (choose an option or type an answer) so it is easy to render and easy for AI to generate.
 */
export const ActivitySchema = z
  .object({
    id,
    kind: z.enum(["choose", "fill-in"]),
    prompt: z.string().min(1).max(1000),
    options: z.array(z.string().min(1).max(200)).max(6).optional(),
    answer: z.string().min(1).max(200),
    hint: z.string().max(500).optional(),
    successMessage: z.string().max(300).optional(),
  })
  .superRefine((a, ctx) => {
    if (a.kind === "choose") {
      if (!a.options || a.options.length < 2) {
        ctx.addIssue({ code: "custom", message: "choose activities need at least 2 options", path: ["options"] });
      } else if (!a.options.includes(a.answer)) {
        ctx.addIssue({ code: "custom", message: "answer must be one of the options", path: ["answer"] });
      }
    }
  });

/**
 * One flat section shape (instead of a discriminated union) on purpose:
 * Gemini's structured output is far more reliable with a single object shape,
 * and the player can switch on `type` and read the optional fields it needs.
 */
export const LessonSectionSchema = z
  .object({
    id,
    type: SectionTypeSchema,
    title: z.string().min(1).max(200),
    body: z.string().min(1).max(5000),
    /** Code snippet for "example" sections (optional). */
    code: z.string().max(3000).optional(),
    /** Required for "interactive-exercise" sections. */
    activity: ActivitySchema.optional(),
    /** For "practice-challenge" sections. */
    hint: z.string().max(500).optional(),
    solution: z.string().max(3000).optional(),
  })
  .superRefine((s, ctx) => {
    if (s.type === "interactive-exercise" && !s.activity) {
      ctx.addIssue({ code: "custom", message: "interactive-exercise sections need an activity", path: ["activity"] });
    }
  });

/**
 * Flat question shape for the same reason as sections. `correctAnswer` is always a string:
 * "true"/"false" for true-false, one of `options` for multiple-choice.
 */
export const QuestionSchema = z
  .object({
    id,
    type: QuestionTypeSchema,
    prompt: z.string().min(1).max(1000),
    options: z.array(z.string().min(1).max(300)).max(6).optional(),
    correctAnswer: z.string().min(1).max(300),
    /** Extra accepted spellings for fill-in-the-blank (compared case-insensitively). */
    acceptableAnswers: z.array(z.string().min(1).max(300)).max(10).optional(),
    /** Kid-friendly explanation shown after answering. */
    explanation: z.string().min(1).max(1000),
  })
  .superRefine((q, ctx) => {
    if (q.type === "multiple-choice") {
      if (!q.options || q.options.length < 2) {
        ctx.addIssue({ code: "custom", message: "multiple-choice needs at least 2 options", path: ["options"] });
      } else if (!q.options.includes(q.correctAnswer)) {
        ctx.addIssue({ code: "custom", message: "correctAnswer must be one of the options", path: ["correctAnswer"] });
      }
    }
    if (q.type === "true-false" && q.correctAnswer !== "true" && q.correctAnswer !== "false") {
      ctx.addIssue({ code: "custom", message: 'true-false correctAnswer must be "true" or "false"', path: ["correctAnswer"] });
    }
  });

export const QuizSchema = z.object({
  id,
  lessonId: id,
  /** Percentage (0-100) needed to "pass". Passing is informational; XP still scales with score. */
  passingScore: z.number().int().min(0).max(100),
  questions: z.array(QuestionSchema).min(1).max(20),
});

export const LessonSchema = z.object({
  id,
  courseId: id,
  order: z.number().int().min(1),
  title: z.string().min(1).max(200),
  summary: z.string().max(500).optional(),
  estimatedMinutes: z.number().int().min(1).max(240).optional(),
  xpReward: z.number().int().min(0).max(500),
  sections: z.array(LessonSectionSchema).min(1).max(30),
  quiz: QuizSchema,
});

export const AgeRangeSchema = z
  .object({ min: z.number().int().min(5).max(18), max: z.number().int().min(5).max(18) })
  .refine((r) => r.min <= r.max, "ageRange.min must be <= ageRange.max");

export const CourseSchema = z.object({
  id,
  slug: z.string().regex(/^[a-z0-9-]+$/, "slug must be lowercase letters, digits and dashes").max(120),
  title: z.string().min(1).max(120),
  description: z.string().min(1).max(1000),
  thumbnailEmoji: z.string().max(16).optional(),
  thumbnailUrl: z.url().optional(),
  category: CategorySchema,
  difficulty: DifficultySchema,
  estimatedMinutes: z.number().int().min(1).max(10000),
  ageRange: AgeRangeSchema,
  lessons: z.array(LessonSchema).max(50),
  organizationId: id,
  authorId: id,
  status: CourseStatusSchema,
  /** Integer that increments every time the course is (re)published. Clients compare it to detect updates. */
  version: z.number().int().min(0),
  source: CourseSourceSchema,
  updatedAt: isoDate,
  /** Estimated download size of the full package in bytes. */
  sizeBytes: z.number().int().min(0),
});

/** What list endpoints return: everything except lesson bodies. */
export const CourseSummarySchema = CourseSchema.omit({ lessons: true }).extend({
  lessonCount: z.number().int().min(0),
  lessonTitles: z.array(z.string()),
});

/** The full offline package stored in IndexedDB. */
export const CoursePackageSchema = z.object({
  course: CourseSchema,
  version: z.number().int().min(0),
  sizeBytes: z.number().int().min(0),
  packagedAt: isoDate,
});

/** An AI course is just a Course with source "ai-generated" plus the prompt that created it. */
export const AIGeneratedCourseSchema = z.object({
  course: CourseSchema.extend({ source: z.literal("ai-generated") }),
  prompt: z.string().max(100),
  createdAt: isoDate,
  model: z.string(),
});

// ---------- People & orgs ----------

export const OrganizationSchema = z.object({
  id,
  name: z.string().min(1).max(200),
  type: OrganizationTypeSchema,
  bio: z.string().max(2000),
  logoEmoji: z.string().max(16),
  categories: z.array(CategorySchema),
  studentReach: z.number().int().min(0),
  publishedCourseIds: z.array(id),
});

export const ContributorSchema = z.object({
  id,
  name: z.string().min(1).max(200),
  role: ContributorRoleSchema,
  organizationId: id,
  avatarEmoji: z.string().max(16),
  bio: z.string().max(1000),
});

// ---------- Gamification ----------

export const BadgeRuleSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("lessons-completed"), count: z.number().int().min(1) }),
  z.object({ type: z.literal("category-lessons"), category: CategorySchema, count: z.number().int().min(1) }),
  z.object({ type: z.literal("streak"), days: z.number().int().min(1) }),
  z.object({ type: z.literal("xp"), amount: z.number().int().min(1) }),
]);

export const BadgeSchema = z.object({
  id,
  name: z.string(),
  description: z.string(),
  emoji: z.string(),
  rule: BadgeRuleSchema,
});

export const AchievementSchema = z.object({
  badgeId: id,
  unlockedAt: isoDate,
});

export const StreakSchema = z.object({
  current: z.number().int().min(0),
  longest: z.number().int().min(0),
  lastActiveDate: LocalDateSchema.nullable(),
});

export const StudentSchema = z.object({
  id,
  name: z.string().min(1).max(100),
  avatarEmoji: z.string().max(16),
  gradeLevel: z.number().int().min(1).max(12).optional(),
  xp: z.number().int().min(0),
  streak: StreakSchema,
  achievements: z.array(AchievementSchema),
  updatedAt: isoDate,
});

export const ProgressSchema = z.object({
  studentId: id,
  courseId: id,
  lessonId: id,
  status: ProgressStatusSchema,
  /** Best quiz score (0-100) for this lesson, null until a quiz is submitted. */
  score: z.number().min(0).max(100).nullable(),
  xpEarned: z.number().int().min(0),
  completedAt: isoDate.nullable(),
  updatedAt: isoDate,
});

export const QuizAnswerSchema = z.object({
  questionId: id,
  answer: z.string().max(300),
});

export const QuizResultSchema = z.object({
  id,
  studentId: id,
  courseId: id,
  lessonId: id,
  quizId: id,
  answers: z.array(QuizAnswerSchema.extend({ correct: z.boolean() })),
  correctCount: z.number().int().min(0),
  totalQuestions: z.number().int().min(1),
  score: z.number().min(0).max(100),
  passed: z.boolean(),
  xpEarned: z.number().int().min(0),
  submittedAt: isoDate,
});

// ---------- Sync ----------

export const SyncEventTypeSchema = z.enum([
  "lesson-completed",
  "quiz-submitted",
  "xp-earned",
  "badge-unlocked",
  "course-downloaded",
]);
export const SyncEventStatusSchema = z.enum(["queued", "syncing", "synced", "failed"]);

const syncEventBase = {
  /** UUID generated on the client. The server dedupes on this, which makes sync idempotent. */
  id: z.uuid(),
  studentId: id,
  createdAt: isoDate,
  /** Student-local date of the activity, so the server can rebuild streaks. */
  localDate: LocalDateSchema,
  status: SyncEventStatusSchema,
  attempts: z.number().int().min(0),
  lastError: z.string().max(500).optional(),
};

export const SyncEventSchema = z.discriminatedUnion("type", [
  z.object({
    ...syncEventBase,
    type: z.literal("lesson-completed"),
    payload: z.object({ courseId: id, lessonId: id, completedAt: isoDate }),
  }),
  z.object({
    ...syncEventBase,
    type: z.literal("quiz-submitted"),
    payload: z.object({ result: QuizResultSchema }),
  }),
  z.object({
    ...syncEventBase,
    type: z.literal("xp-earned"),
    payload: z.object({
      amount: z.number().int().min(0).max(1000),
      reason: z.enum(["lesson-completed", "quiz-bonus"]),
      courseId: id,
      lessonId: id,
    }),
  }),
  z.object({
    ...syncEventBase,
    type: z.literal("badge-unlocked"),
    payload: z.object({ badgeId: id, unlockedAt: isoDate }),
  }),
  z.object({
    ...syncEventBase,
    type: z.literal("course-downloaded"),
    payload: z.object({ courseId: id, version: z.number().int().min(0) }),
  }),
]);

export const SyncStatusSchema = z.enum(["online", "offline", "syncing", "queued", "error"]);

// ---------- API request/response contracts ----------

export const CourseListQuerySchema = z.object({
  category: CategorySchema.optional(),
  difficulty: DifficultySchema.optional(),
  q: z.string().max(100).optional(),
});

export const CourseVersionSchema = z.object({ id, version: z.number().int().min(0) });

export const SyncRequestSchema = z.object({
  events: z.array(SyncEventSchema).min(1).max(50),
});

/** Server's derived view of a student, rebuilt from the deduplicated event log. */
export const ServerStudentStateSchema = z.object({
  studentId: id,
  xp: z.number().int().min(0),
  completedLessons: z.array(z.object({ courseId: id, lessonId: id, completedAt: isoDate })),
  bestQuizScores: z.record(z.string(), z.number()),
  badgeIds: z.array(id),
  activityDates: z.array(LocalDateSchema),
  streak: StreakSchema,
  processedEventCount: z.number().int().min(0),
});

export const SyncResponseSchema = z.object({
  acknowledgedIds: z.array(z.string()),
  serverStudentState: ServerStudentStateSchema,
});

export const ApiErrorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() }),
});

/** Lessons as sent by contributors: courseId is filled in by the server. */
export const ContributorLessonInputSchema = LessonSchema.omit({ courseId: true });

const contributorCourseFields = CourseSchema.pick({
  title: true,
  description: true,
  thumbnailEmoji: true,
  category: true,
  difficulty: true,
  estimatedMinutes: true,
  ageRange: true,
}).extend({
  lessons: z.array(ContributorLessonInputSchema).max(50),
});

/** Course body accepted from contributors (server fills id/slug/version/status/source/etc.). */
export const ContributorCourseInputSchema = contributorCourseFields.extend({
  lessons: contributorCourseFields.shape.lessons.default([]),
});
/** PATCH body: any subset. Omitted `lessons` leaves existing lessons untouched. */
export const ContributorCoursePatchSchema = contributorCourseFields.partial();

// AI request contracts. Limits come straight from the spec (child safety + cost control).
export const GenerateCourseRequestSchema = z.object({
  topic: z.string().trim().min(2).max(100),
  difficulty: DifficultySchema.optional(),
  ageRange: AgeRangeSchema.optional(),
  lessonCount: z.number().int().min(1).max(5).optional(),
});
export const GenerateQuizRequestSchema = z.object({
  topic: z.string().trim().min(2).max(100),
  /** Optional lesson text to base questions on. */
  lessonContent: z.string().max(5000).optional(),
  questionCount: z.number().int().min(1).max(10).optional(),
});
export const LearningPathRequestSchema = z.object({
  goal: z.string().trim().min(2).max(100),
  completedCourseIds: z.array(id).max(50).optional(),
  ageYears: z.number().int().min(5).max(18).optional(),
});
export const TutorMessageSchema = z.object({
  role: z.enum(["student", "nova"]),
  text: z.string().max(1000),
});
export const TutorRequestSchema = z.object({
  question: z.string().trim().min(1).max(500),
  history: z.array(TutorMessageSchema).max(10).optional(),
  /** Optional lesson context so Nova can stay on topic. */
  context: z
    .object({ courseTitle: z.string().max(120).optional(), lessonTitle: z.string().max(200).optional() })
    .optional(),
});

export const LearningPathStepSchema = z.object({
  order: z.number().int().min(1),
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(500),
  /** Existing catalog course to take for this step, if one fits. */
  courseId: z.string().max(120).optional(),
  /** Suggested topic to generate with AI if no catalog course fits. */
  suggestedTopic: z.string().max(100).optional(),
  estimatedMinutes: z.number().int().min(1).max(10000),
});
export const LearningPathSchema = z.object({
  goal: z.string(),
  summary: z.string().max(1000),
  steps: z.array(LearningPathStepSchema).min(1).max(10),
});

export const GeneratedQuizSchema = z.object({
  topic: z.string(),
  questions: z.array(QuestionSchema).min(1).max(10),
});

export const TutorResponseSchema = z.object({
  answer: z.string().min(1).max(1500),
  /** True when Nova declined an unsafe/off-topic request and redirected. */
  redirected: z.boolean(),
  followUpQuestion: z.string().max(300).optional(),
});

export const GenerateCourseResponseSchema = AIGeneratedCourseSchema;

/**
 * CodeLingo shared TypeScript types. Import from "@/lib/types".
 * All types are inferred from the Zod schemas in "@/lib/schemas".
 */
import type { z } from "zod";
import type * as S from "@/lib/schemas";

export type Category = z.infer<typeof S.CategorySchema>;
export type Difficulty = z.infer<typeof S.DifficultySchema>;
export type CourseStatus = z.infer<typeof S.CourseStatusSchema>;
export type CourseSource = z.infer<typeof S.CourseSourceSchema>;
export type SectionType = z.infer<typeof S.SectionTypeSchema>;
export type QuestionType = z.infer<typeof S.QuestionTypeSchema>;
export type ContributorRole = z.infer<typeof S.ContributorRoleSchema>;
export type OrganizationType = z.infer<typeof S.OrganizationTypeSchema>;
export type ProgressStatus = z.infer<typeof S.ProgressStatusSchema>;
export type LocalDate = z.infer<typeof S.LocalDateSchema>;

export type Activity = z.infer<typeof S.ActivitySchema>;
export type LessonSection = z.infer<typeof S.LessonSectionSchema>;
export type Question = z.infer<typeof S.QuestionSchema>;
export type Quiz = z.infer<typeof S.QuizSchema>;
export type Lesson = z.infer<typeof S.LessonSchema>;
export type AgeRange = z.infer<typeof S.AgeRangeSchema>;
export type Course = z.infer<typeof S.CourseSchema>;
export type CourseSummary = z.infer<typeof S.CourseSummarySchema>;
export type CoursePackage = z.infer<typeof S.CoursePackageSchema>;
export type AIGeneratedCourse = z.infer<typeof S.AIGeneratedCourseSchema>;

export type Organization = z.infer<typeof S.OrganizationSchema>;
export type Contributor = z.infer<typeof S.ContributorSchema>;

export type BadgeRule = z.infer<typeof S.BadgeRuleSchema>;
export type Badge = z.infer<typeof S.BadgeSchema>;
export type Achievement = z.infer<typeof S.AchievementSchema>;
export type Streak = z.infer<typeof S.StreakSchema>;
export type Student = z.infer<typeof S.StudentSchema>;
export type Progress = z.infer<typeof S.ProgressSchema>;
export type QuizAnswer = z.infer<typeof S.QuizAnswerSchema>;
export type QuizResult = z.infer<typeof S.QuizResultSchema>;

export type SyncEventType = z.infer<typeof S.SyncEventTypeSchema>;
export type SyncEventStatus = z.infer<typeof S.SyncEventStatusSchema>;
export type SyncEvent = z.infer<typeof S.SyncEventSchema>;
export type SyncStatus = z.infer<typeof S.SyncStatusSchema>;

export type CourseListQuery = z.infer<typeof S.CourseListQuerySchema>;
export type CourseVersion = z.infer<typeof S.CourseVersionSchema>;
export type SyncRequest = z.infer<typeof S.SyncRequestSchema>;
export type ServerStudentState = z.infer<typeof S.ServerStudentStateSchema>;
export type SyncResponse = z.infer<typeof S.SyncResponseSchema>;
export type ApiError = z.infer<typeof S.ApiErrorSchema>;
export type ContributorCourseInput = z.input<typeof S.ContributorCourseInputSchema>;
export type ContributorCoursePatch = z.input<typeof S.ContributorCoursePatchSchema>;

export type GenerateCourseRequest = z.infer<typeof S.GenerateCourseRequestSchema>;
export type GenerateQuizRequest = z.infer<typeof S.GenerateQuizRequestSchema>;
export type LearningPathRequest = z.infer<typeof S.LearningPathRequestSchema>;
export type TutorMessage = z.infer<typeof S.TutorMessageSchema>;
export type TutorRequest = z.infer<typeof S.TutorRequestSchema>;
export type LearningPathStep = z.infer<typeof S.LearningPathStepSchema>;
export type LearningPath = z.infer<typeof S.LearningPathSchema>;
export type GeneratedQuiz = z.infer<typeof S.GeneratedQuizSchema>;
export type TutorResponse = z.infer<typeof S.TutorResponseSchema>;

/** Sync events before they get queue bookkeeping fields. */
export type NewSyncEvent = SyncEvent extends infer E
  ? E extends SyncEvent
    ? Omit<E, "id" | "createdAt" | "status" | "attempts" | "lastError" | "studentId" | "localDate">
    : never
  : never;

/** Overall sync state exposed to the UI. */
export interface SyncState {
  status: SyncStatus;
  queuedCount: number;
  failedCount: number;
  lastSyncedAt: string | null;
  lastError: string | null;
}

/** Locally downloaded course row (what's stored in Dexie). */
export interface DownloadedCourse {
  id: string;
  version: number;
  downloadedAt: string;
  sizeBytes: number;
  source: CourseSource;
  course: Course;
}

export interface CourseUpdateInfo {
  id: string;
  localVersion: number;
  remoteVersion: number;
}

/** Result of finishing a lesson or quiz; drives XP/badge celebrations in the UI. */
export interface LearningOutcome {
  xpAwarded: number;
  totalXp: number;
  newBadges: Badge[];
  streak: Streak;
  streakIncreased: boolean;
  progress: Progress;
  quizResult?: QuizResult;
}

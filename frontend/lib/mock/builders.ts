/**
 * Tiny helpers for writing seed and mock-AI content compactly.
 * IDs are derived deterministically so seed data is stable across server restarts.
 */
import type { Activity, Course, Lesson, LessonSection, Question } from "@/lib/types";

type SectionInput = Omit<LessonSection, "id">;
type QuestionInput = Omit<Question, "id">;

export const story = (title: string, body: string): SectionInput => ({ type: "story", title, body });
export const analogy = (title: string, body: string): SectionInput => ({ type: "analogy", title, body });
export const explain = (title: string, body: string): SectionInput => ({ type: "explanation", title, body });
export const example = (title: string, body: string, code?: string): SectionInput => ({ type: "example", title, body, code });
export const exercise = (title: string, body: string, activity: Omit<Activity, "id">): SectionInput => ({
  type: "interactive-exercise",
  title,
  body,
  activity: { id: "activity", ...activity },
});
export const challenge = (title: string, body: string, hint: string, solution: string): SectionInput => ({
  type: "practice-challenge",
  title,
  body,
  hint,
  solution,
});

export const mc = (prompt: string, options: string[], correctAnswer: string, explanation: string): QuestionInput => ({
  type: "multiple-choice",
  prompt,
  options,
  correctAnswer,
  explanation,
});
export const tf = (prompt: string, answer: boolean, explanation: string): QuestionInput => ({
  type: "true-false",
  prompt,
  options: ["true", "false"],
  correctAnswer: String(answer),
  explanation,
});
export const fill = (prompt: string, correctAnswer: string, explanation: string, acceptableAnswers?: string[]): QuestionInput => ({
  type: "fill-in-the-blank",
  prompt,
  correctAnswer,
  acceptableAnswers,
  explanation,
});

export interface LessonInput {
  slug: string;
  title: string;
  summary?: string;
  estimatedMinutes?: number;
  xpReward?: number;
  sections: SectionInput[];
  questions: QuestionInput[];
  passingScore?: number;
}

function buildLesson(courseId: string, order: number, input: LessonInput): Lesson {
  const lessonId = `${courseId}-${input.slug}`;
  return {
    id: lessonId,
    courseId,
    order,
    title: input.title,
    summary: input.summary,
    estimatedMinutes: input.estimatedMinutes ?? 10,
    xpReward: input.xpReward ?? 20,
    sections: input.sections.map((s, i) => ({
      ...s,
      id: `${lessonId}-s${i + 1}`,
      activity: s.activity ? { ...s.activity, id: `${lessonId}-s${i + 1}-activity` } : undefined,
    })),
    quiz: {
      id: `${lessonId}-quiz`,
      lessonId,
      passingScore: input.passingScore ?? 60,
      questions: input.questions.map((q, i) => ({ ...q, id: `${lessonId}-q${i + 1}` })),
    },
  };
}

/** Rough download size: UTF-8 bytes of the JSON package. Good enough for "2.1 KB" labels and quotas. */
export function estimateSizeBytes(course: Omit<Course, "sizeBytes">): number {
  return new TextEncoder().encode(JSON.stringify(course)).length;
}

export type CourseInput = Omit<Course, "lessons" | "sizeBytes" | "slug"> & { slug?: string; lessons: LessonInput[] };

export function buildCourse(input: CourseInput): Course {
  const { lessons, ...rest } = input;
  const base: Omit<Course, "sizeBytes"> = {
    ...rest,
    slug: input.slug ?? input.id,
    lessons: lessons.map((l, i) => buildLesson(input.id, i + 1, l)),
  };
  return { ...base, sizeBytes: estimateSizeBytes(base) };
}

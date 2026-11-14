import type { CourseListQuery } from "@/lib/types";

/** Central React Query keys so invalidation stays consistent across hooks. */
export const queryKeys = {
  courses: (q: CourseListQuery = {}) => ["courses", q] as const,
  course: (id: string) => ["course", id] as const,
  downloaded: ["downloaded"] as const,
  courseUpdates: ["courseUpdates"] as const,
  progress: (courseId?: string) => (courseId ? (["progress", courseId] as const) : (["progress"] as const)),
  quizResults: (lessonId?: string) => ["quizResults", lessonId ?? "all"] as const,
  student: ["student"] as const,
  syncQueue: ["syncQueue"] as const,
  storage: ["storage"] as const,
  organizations: ["organizations"] as const,
  organization: (id: string) => ["organization", id] as const,
  aiCourses: ["aiCourses"] as const,
  contributorCourses: (role: string) => ["contributorCourses", role] as const,
};

/**
 * Local (Dexie) queries must run even when the browser is offline. React Query's default
 * networkMode "online" would PAUSE them offline, which breaks the whole offline experience.
 */
export const LOCAL = { networkMode: "always" } as const;

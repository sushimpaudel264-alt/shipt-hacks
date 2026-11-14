/**
 * Typed browser client for the LearnLoop API. Errors are thrown as ApiRequestError carrying the
 * server's { error: { code, message, details } } so the UI can show friendly messages.
 */
import type {
  AIGeneratedCourse,
  Contributor,
  Course,
  CourseListQuery,
  CourseSummary,
  GeneratedQuiz,
  GenerateCourseRequest,
  GenerateQuizRequest,
  LearningPath,
  LearningPathRequest,
  Organization,
  TutorRequest,
  TutorResponse,
} from "@/lib/types";
import type { z } from "zod";
import type { ContributorCourseInputSchema, ContributorCoursePatchSchema } from "@/lib/schemas";

export class ApiRequestError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
  /** Network failure (offline, DNS, CORS...) rather than an HTTP error response. */
  get isNetworkError(): boolean {
    return this.status === 0;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
    });
  } catch {
    throw new ApiRequestError(0, "NETWORK_ERROR", "You're offline or the server can't be reached.");
  }
  const body = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) {
    const err = (body as { error?: { code?: string; message?: string; details?: unknown } } | null)?.error;
    throw new ApiRequestError(res.status, err?.code ?? "HTTP_ERROR", err?.message ?? `Request failed (${res.status})`, err?.details);
  }
  return body as T;
}

const post = <T>(path: string, data: unknown, headers?: HeadersInit) =>
  request<T>(path, { method: "POST", body: JSON.stringify(data), headers });

function qs(params: Record<string, string | undefined>): string {
  const s = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => !!e[1])).toString();
  return s ? `?${s}` : "";
}

export const api = {
  health: () => request<{ ok: true; time: string }>("/api/health", { cache: "no-store" }),
  listCourses: (q: CourseListQuery = {}) => request<CourseSummary[]>(`/api/courses${qs(q)}`),
  getCourse: (id: string) => request<Course>(`/api/courses/${encodeURIComponent(id)}`),
  listOrganizations: () => request<Organization[]>("/api/organizations"),
  getOrganization: (id: string) =>
    request<{ organization: Organization; courses: CourseSummary[] }>(`/api/organizations/${encodeURIComponent(id)}`),

  generateCourse: (body: GenerateCourseRequest) => post<AIGeneratedCourse>("/api/ai/generate-course", body),
  generateQuiz: (body: GenerateQuizRequest) => post<GeneratedQuiz>("/api/ai/generate-quiz", body),
  learningPath: (body: LearningPathRequest) => post<LearningPath>("/api/ai/learning-path", body),
  tutor: (body: TutorRequest) => post<TutorResponse>("/api/ai/tutor", body),
};

export type ContributorCourseInput = z.input<typeof ContributorCourseInputSchema>;
export type ContributorCoursePatch = z.input<typeof ContributorCoursePatchSchema>;

/** Contributor API. Uses mock auth: the role is sent as x-mock-role. */
export function contributorApi(role: string) {
  const headers = { "x-mock-role": role };
  return {
    listCourses: () => request<{ contributor: Contributor; courses: Course[] }>("/api/contributor/courses", { headers }),
    createCourse: (body: ContributorCourseInput) => post<Course>("/api/contributor/courses", body, headers),
    updateCourse: (id: string, body: ContributorCoursePatch) =>
      request<Course>(`/api/contributor/courses/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body), headers }),
    publishCourse: (id: string) => post<Course>(`/api/contributor/courses/${encodeURIComponent(id)}/publish`, {}, headers),
    deleteCourse: (id: string) =>
      request<{ deleted: true; id: string }>(`/api/contributor/courses/${encodeURIComponent(id)}`, { method: "DELETE", headers }),
  };
}

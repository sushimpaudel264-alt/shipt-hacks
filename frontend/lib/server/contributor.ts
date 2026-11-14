import "server-only";
import type { z } from "zod";
import {
  ContributorCourseInputSchema,
  ContributorCoursePatchSchema,
  ContributorLessonInputSchema,
  ContributorRoleSchema,
  CourseSchema,
} from "@/lib/schemas";
import type { Contributor, Course, Lesson } from "@/lib/types";
import { finalizeCourse } from "./courses";
import { HttpError, notFound, zodDetails } from "./http";
import { sanitizeDeep } from "./sanitize";
import { getStore } from "./store";

/**
 * MOCK AUTH. The role comes from the `x-mock-role` header or a `mock-role` cookie,
 * and optionally `x-mock-contributor-id` to pick a specific contributor.
 * Students (or no role) are rejected. Replace with real auth before production.
 */
export function requireContributor(req: Request): Contributor {
  const cookieRole = req.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim().split("="))
    .find(([k]) => k === "mock-role")?.[1];
  const rawRole = req.headers.get("x-mock-role") ?? cookieRole;
  if (!rawRole) throw new HttpError(401, "UNAUTHENTICATED", "Contributor sign-in required (set x-mock-role)");
  if (rawRole === "student") throw new HttpError(403, "FORBIDDEN", "Students cannot access contributor tools");
  const role = ContributorRoleSchema.safeParse(decodeURIComponent(rawRole));
  if (!role.success) throw new HttpError(403, "FORBIDDEN", `Unknown role "${rawRole}"`);

  const contributors = [...getStore().contributors.values()];
  const requestedId = req.headers.get("x-mock-contributor-id");
  const contributor = requestedId
    ? contributors.find((c) => c.id === requestedId && c.role === role.data)
    : contributors.find((c) => c.role === role.data);
  if (!contributor) throw new HttpError(403, "FORBIDDEN", "No contributor found for that role");
  return contributor;
}

/** Contributors can manage courses they authored or that belong to their organization. */
function getOwnedCourse(contributor: Contributor, id: string): Course {
  const course = getStore().courses.get(id);
  if (!course) throw notFound("Course");
  if (course.authorId !== contributor.id && course.organizationId !== contributor.organizationId) {
    throw new HttpError(403, "FORBIDDEN", "You can only edit your organization's courses");
  }
  return course;
}

export function listContributorCourses(contributor: Contributor): Course[] {
  return [...getStore().courses.values()].filter(
    (c) => c.authorId === contributor.id || c.organizationId === contributor.organizationId,
  );
}

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "course";

type CourseInput = z.infer<typeof ContributorCourseInputSchema>;
type CoursePatch = z.infer<typeof ContributorCoursePatchSchema>;
type LessonInput = z.infer<typeof ContributorLessonInputSchema>;

function attachLessons(courseId: string, lessons: LessonInput[]): Lesson[] {
  return lessons.map((l, i) => ({
    ...l,
    courseId,
    order: i + 1,
    quiz: { ...l.quiz, lessonId: l.id },
  }));
}

export function createCourse(contributor: Contributor, input: CourseInput): Course {
  const clean = sanitizeDeep(input);
  const store = getStore();
  const base = slugify(clean.title);
  let slug = base;
  for (let n = 2; [...store.courses.values()].some((c) => c.slug === slug); n++) slug = `${base}-${n}`;
  const id = `${slug}-${crypto.randomUUID().slice(0, 8)}`;
  const course = finalizeCourse({
    ...clean,
    id,
    slug,
    lessons: attachLessons(id, clean.lessons),
    organizationId: contributor.organizationId,
    authorId: contributor.id,
    status: "draft",
    version: 0,
    source: "contributor",
    updatedAt: new Date().toISOString(),
  });
  store.courses.set(id, course);
  return course;
}

export function updateCourse(contributor: Contributor, id: string, patch: CoursePatch): Course {
  const existing = getOwnedCourse(contributor, id);
  const clean = sanitizeDeep(patch);
  // Editing a published course keeps it published; students get the edit on the next publish (version bump).
  const course = finalizeCourse({
    ...existing,
    ...clean,
    lessons: clean.lessons ? attachLessons(id, clean.lessons) : existing.lessons,
    updatedAt: new Date().toISOString(),
  });
  getStore().courses.set(id, course);
  return course;
}

/** Publishing rules: required fields, >= 1 lesson, and every quiz valid. Bumps version. */
export function publishCourse(contributor: Contributor, id: string): Course {
  const existing = getOwnedCourse(contributor, id);
  const problems: { path: string; message: string }[] = [];
  if (existing.lessons.length === 0) problems.push({ path: "lessons", message: "Add at least one lesson before publishing" });
  existing.lessons.forEach((l, i) => {
    if (l.quiz.questions.length === 0) problems.push({ path: `lessons.${i}.quiz`, message: `Lesson "${l.title}" needs at least one quiz question` });
  });
  const candidate = { ...existing, status: "published" as const, version: existing.version + 1, updatedAt: new Date().toISOString() };
  const parsed = CourseSchema.safeParse(candidate);
  if (!parsed.success) problems.push(...zodDetails(parsed.error));
  if (problems.length) throw new HttpError(422, "PUBLISH_VALIDATION_FAILED", "Course is not ready to publish", problems);

  const course = finalizeCourse(candidate);
  const store = getStore();
  store.courses.set(id, course);
  const org = store.organizations.get(course.organizationId);
  if (org && !org.publishedCourseIds.includes(id)) org.publishedCourseIds.push(id);
  return course;
}

export function deleteCourse(contributor: Contributor, id: string): void {
  const existing = getOwnedCourse(contributor, id);
  if (existing.status !== "draft") throw new HttpError(409, "NOT_A_DRAFT", "Only draft courses can be deleted");
  getStore().courses.delete(id);
}

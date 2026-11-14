import "server-only";
import { estimateSizeBytes } from "@/lib/mock";
import { CourseSchema } from "@/lib/schemas";
import type { Course, CourseListQuery, CoursePackage, CourseSummary, CourseVersion, Organization } from "@/lib/types";
import { HttpError, notFound, zodDetails } from "./http";
import { getStore } from "./store";

function toSummary(course: Course): CourseSummary {
  const { lessons, ...rest } = course;
  return {
    ...rest,
    lessonCount: lessons.length,
    lessonTitles: [...lessons].sort((a, b) => a.order - b.order).map((l) => l.title),
  };
}

export function listPublishedCourses(query: CourseListQuery = {}): CourseSummary[] {
  const q = query.q?.trim().toLowerCase();
  return [...getStore().courses.values()]
    .filter((c) => c.status === "published")
    .filter((c) => !query.category || c.category === query.category)
    .filter((c) => !query.difficulty || c.difficulty === query.difficulty)
    .filter(
      (c) =>
        !q ||
        c.title.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.lessons.some((l) => l.title.toLowerCase().includes(q)),
    )
    .map(toSummary);
}

/** Students only ever see published courses; drafts 404 so their existence isn't leaked. */
export function getPublishedCourse(id: string): Course {
  const course = getStore().courses.get(id);
  if (!course || course.status !== "published") throw notFound("Course");
  return course;
}

export function getCoursePackage(id: string): CoursePackage {
  const course = getPublishedCourse(id);
  return { course, version: course.version, sizeBytes: course.sizeBytes, packagedAt: new Date().toISOString() };
}

/** Unknown/unpublished ids are omitted so the client can tell a course was withdrawn. */
export function getCourseVersions(ids: string[]): CourseVersion[] {
  const store = getStore();
  return ids.flatMap((id) => {
    const c = store.courses.get(id);
    return c && c.status === "published" ? [{ id: c.id, version: c.version }] : [];
  });
}

export function listOrganizations(): Organization[] {
  return [...getStore().organizations.values()];
}

export function getOrganization(id: string): { organization: Organization; courses: CourseSummary[] } {
  const store = getStore();
  const organization = store.organizations.get(id);
  if (!organization) throw notFound("Organization");
  const courses = [...store.courses.values()]
    .filter((c) => c.organizationId === id && c.status === "published")
    .map(toSummary);
  return { organization, courses };
}

/** Recomputes size and validates against the shared Course schema before anything is saved. */
export function finalizeCourse(course: Omit<Course, "sizeBytes"> & { sizeBytes?: number }): Course {
  const { sizeBytes: _ignored, ...rest } = course;
  void _ignored;
  const withSize = { ...rest, sizeBytes: estimateSizeBytes(rest) };
  const parsed = CourseSchema.safeParse(withSize);
  if (!parsed.success) throw new HttpError(422, "INVALID_COURSE", "Course failed validation", zodDetails(parsed.error));
  return parsed.data;
}

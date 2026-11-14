import { describe, expect, it } from "vitest";
import { BADGES, CONTRIBUTORS, ORGANIZATIONS, SEED_COURSES } from "@/lib/mock";
import { BadgeSchema, ContributorRoleSchema, ContributorSchema, CourseSchema, OrganizationSchema } from "@/lib/schemas";

describe("seed data", () => {
  it.each(SEED_COURSES.map((c) => [c.id, c] as const))("%s matches the Course schema", (_id, course) => {
    const r = CourseSchema.safeParse(course);
    expect(r.success ? [] : r.error.issues).toEqual([]);
    expect(course.lessons.length).toBeGreaterThanOrEqual(3);
    course.lessons.forEach((l) => expect(l.quiz.lessonId).toBe(l.id));
  });

  it("has 5 courses with unique ids and the fully written Variables lesson", () => {
    expect(SEED_COURSES).toHaveLength(5);
    expect(new Set(SEED_COURSES.map((c) => c.id)).size).toBe(5);
    const variables = SEED_COURSES[0].lessons[0];
    expect(variables.title).toBe("Variables");
    expect(variables.quiz.questions).toHaveLength(4);
    const types = variables.sections.map((s) => s.type);
    expect(types).toEqual(expect.arrayContaining(["story", "analogy", "interactive-exercise", "practice-challenge"]));
  });

  it("has valid orgs, one contributor per role, and 8 badges", () => {
    ORGANIZATIONS.forEach((o) => expect(OrganizationSchema.safeParse(o).success).toBe(true));
    CONTRIBUTORS.forEach((c) => expect(ContributorSchema.safeParse(c).success).toBe(true));
    expect(new Set(CONTRIBUTORS.map((c) => c.role))).toEqual(new Set(ContributorRoleSchema.options));
    expect(BADGES).toHaveLength(8);
    BADGES.forEach((b) => expect(BadgeSchema.safeParse(b).success).toBe(true));
  });
});

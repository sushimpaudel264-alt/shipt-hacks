import type { Contributor, Organization, Student } from "@/lib/types";

/** Only Ed Farm is a real organization name; the others are deliberately generic. */
export const ORGANIZATIONS: Organization[] = [
  {
    id: "org-edfarm",
    name: "Ed Farm",
    type: "edfarm",
    bio: "Ed Farm is a Birmingham-based nonprofit that brings innovative learning experiences to students and teachers.",
    logoEmoji: "🌾",
    categories: ["coding", "digital-citizenship"],
    studentReach: 12000,
    publishedCourseIds: ["code-adventure", "digital-citizenship"],
  },
  {
    id: "org-city-school",
    name: "Birmingham City Middle School",
    type: "school",
    bio: "A public middle school where teachers share the lessons their students love most.",
    logoEmoji: "🏫",
    categories: ["math"],
    studentReach: 650,
    publishedCourseIds: ["math-quest"],
  },
  {
    id: "org-public-library",
    name: "Birmingham Public Library",
    type: "library",
    bio: "Library learning programs for curious readers and writers of every age.",
    logoEmoji: "📚",
    categories: ["writing"],
    studentReach: 3200,
    publishedCourseIds: ["creative-writing"],
  },
  {
    id: "org-after-school",
    name: "Bright Futures After-School Club",
    type: "after-school",
    bio: "An after-school program offering homework help, mentoring and hands-on projects.",
    logoEmoji: "🎒",
    categories: ["other"],
    studentReach: 400,
    publishedCourseIds: [],
  },
  {
    id: "org-stem",
    name: "Southern STEM Alliance",
    type: "stem-org",
    bio: "A community STEM organization running science nights, robotics teams and summer camps.",
    logoEmoji: "🚀",
    categories: ["science"],
    studentReach: 2100,
    publishedCourseIds: ["science-explorer"],
  },
];

/** One contributor per role. `x-mock-role: <role>` resolves to the matching contributor. */
export const CONTRIBUTORS: Contributor[] = [
  { id: "contrib-teacher", name: "Ms. Rivera", role: "teacher", organizationId: "org-city-school", avatarEmoji: "👩‍🏫", bio: "7th grade math teacher." },
  { id: "contrib-edfarm", name: "Marcus Hill", role: "edfarm-contributor", organizationId: "org-edfarm", avatarEmoji: "🧑‍💻", bio: "Curriculum designer for coding and digital literacy." },
  { id: "contrib-admin", name: "Dr. Patel", role: "school-admin", organizationId: "org-city-school", avatarEmoji: "🧑‍💼", bio: "Assistant principal and instructional lead." },
  { id: "contrib-partner", name: "Kim Nguyen", role: "community-partner", organizationId: "org-public-library", avatarEmoji: "📖", bio: "Youth services librarian." },
  { id: "contrib-mentor", name: "Andre Thompson", role: "volunteer-mentor", organizationId: "org-stem", avatarEmoji: "🔭", bio: "Engineer who volunteers at science nights." },
];

export const DEMO_STUDENT_ID = "student-jordan";

/**
 * Demo student. XP is 85 on purpose: finishing Code Adventure → Variables
 * (20 base + up to 10 quiz bonus) crosses 100 and unlocks the "100 XP Club" badge live in the demo.
 * `streak.lastActiveDate` is set to "yesterday" at runtime (see createDemoStudent) so the
 * 3-day streak becomes 4 on the first lesson completed today.
 */
export const DEMO_STUDENT_SEED: Omit<Student, "updatedAt" | "streak"> & { streakDays: number } = {
  id: DEMO_STUDENT_ID,
  name: "Jordan",
  avatarEmoji: "🦊",
  gradeLevel: 6,
  xp: 85,
  streakDays: 3,
  achievements: [
    { badgeId: "first-lesson", unlockedAt: "2026-11-01T15:30:00.000Z" },
    { badgeId: "math-master", unlockedAt: "2026-11-08T16:10:00.000Z" },
  ],
};

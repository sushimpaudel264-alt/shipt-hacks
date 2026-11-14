# LearnLoop frontend guide

This guide is written for AI coding tools building a LearnLoop UI. Read it fully before writing code.

LearnLoop is an offline-first learning app for students ages 8–16 ("Download at school. Learn anywhere.").
The data layer is finished and tested. **Your job is pages and components only.**

## Rules (must follow)

1. **Get all data through the hooks in `@/lib/hooks`.** Never write `fetch()` calls, never call `/api/*` directly, and never use `localStorage`/IndexedDB for app data.
2. **Never create new data types.** Import them from `@/lib/types`. UI-only prop types are fine.
3. **Never edit `app/api/**` or `lib/**`.** If something is missing, ask the backend owner.
4. **Keep `<LearnLoopProvider>` in `app/layout.tsx`.** Every hook needs it. You may pass it an `offlinePages` prop (see [Offline pages](#offline-pages)).
5. **Pages that show course data must be Client Components** (`"use client"`) that read via hooks. Server Components that fetch data break offline mode.
6. **Handle all three states** for every query: `isPending` (loading), `error`, and empty data. Offline is a normal state, not an error. Use `useOnlineStatus().isReachable`, the `isOffline` flags, and `useSyncStatus()`.
7. **Allowed non-hook imports:**
   - `@/lib/types` (types);
   - `@/lib/gamification` pure helpers: `isAnswerCorrect`, `getLevel`, `calculateLessonXP`, `toLocalDate`;
   - `formatBytes` from `@/lib/hooks`.
8. **The demo student is Jordan.** There is no login screen for students. Contributor screens act as a role, e.g. `"teacher"`.

A working example of every hook is in `app/debug/data/page.tsx`.

## Main types (`@/lib/types`)

| Type | Shape (key fields) |
|---|---|
| `Course` | `id, slug, title, description, thumbnailEmoji?, category, difficulty, estimatedMinutes, ageRange {min,max}, lessons: Lesson[], organizationId, authorId, status, version, source ("official" \| "contributor" \| "ai-generated"), updatedAt, sizeBytes` |
| `CourseSummary` | `Course` without `lessons`, plus `lessonCount, lessonTitles` |
| `Lesson` | `id, courseId, order, title, summary?, estimatedMinutes?, xpReward, sections: LessonSection[], quiz: Quiz` |
| `LessonSection` | `id, type, title, body` + `code?` (example), `activity?` (interactive-exercise), `hint?, solution?` (practice-challenge). `type`: `story \| analogy \| explanation \| example \| interactive-exercise \| practice-challenge` |
| `Activity` | `id, kind ("choose" \| "fill-in"), prompt, options?, answer, hint?, successMessage?` |
| `Quiz` / `Question` | `Quiz { id, lessonId, passingScore, questions }`; `Question { id, type ("multiple-choice" \| "true-false" \| "fill-in-the-blank"), prompt, options?, correctAnswer, acceptableAnswers?, explanation }` |
| `Progress` | `courseId, lessonId, status ("not-started" \| "in-progress" \| "completed"), score (best, 0–100 \| null), xpEarned, completedAt` |
| `QuizResult` | `score, correctCount, totalQuestions, passed, xpEarned, answers[{questionId, answer, correct}]` |
| `LearningOutcome` | `xpAwarded, totalXp, newBadges: Badge[], streak, streakIncreased, progress, quizResult?`: use it for celebrations |
| `StudentView` (from `useStudent`) | `name, avatarEmoji, xp, level, xpIntoLevel, xpForNextLevel, streak {current, longest, lastActiveDate}, badges[], allBadges[] (with earned)` |
| `Badge` | `id, name, description, emoji, rule` |
| `DownloadedCourse` | `id, version, downloadedAt, sizeBytes, source, course: Course` |
| `SyncStatus` | `"online" \| "offline" \| "syncing" \| "queued" \| "error"` |
| `Organization` | `id, name, type, bio, logoEmoji, categories, studentReach, publishedCourseIds` |
| `Category` | `"coding" \| "math" \| "science" \| "digital-citizenship" \| "writing" \| "other"` |
| `TutorResponse`, `LearningPath`, `AIGeneratedCourse`, `GeneratedQuiz` | AI results |

## Hooks (`@/lib/hooks`)

Queries return React Query results (`data`, `isPending`, `error`, `refetch`). Mutations return `mutate`, `mutateAsync`, `isPending`, `error` and `data`.

### Courses

| Hook | Returns |
|---|---|
| `useCourses(filters?)` | `data: { courses: CourseSummary[], source: "network" \| "offline-downloads" }`. Offline it falls back to downloaded courses. `filters: { category?, difficulty?, q? }` |
| `useCourse(id)` | `data: { course: Course, isDownloaded: boolean } \| null` (null = not found). Reads the device first. |
| `useDownloadedCourses()` | `data: DownloadedCourse[]` |
| `useDownloadCourse()` | mutation `mutate(courseId)`: saves the course for offline use |
| `useDeleteCourse()` | mutation `mutate(courseId)`: removes content (XP/progress kept) |
| `useCourseUpdates()` | `data: { id, localVersion, remoteVersion }[]` |
| `useUpdateCourse()` | mutation `mutate(courseId)`: downloads the newer version |

```tsx
const { data, isPending } = useCourses({ category: "coding" });
const download = useDownloadCourse();
data?.courses.map((c) => <button key={c.id} onClick={() => download.mutate(c.id)}>{c.title}</button>);
```

### Progress, lessons & quizzes

| Hook | Returns |
|---|---|
| `useProgress(courseId?)` | `data: Progress[]` (one course, or all) |
| `useQuizResults(lessonId?)` | `data: QuizResult[]` newest first |
| `useStartLesson()` | mutation `mutate({ courseId, lessonId })`: call when a lesson opens |
| `useCompleteLesson()` | mutation `mutate({ courseId, lessonId })` → `LearningOutcome` |
| `useSubmitQuiz()` | mutation `mutate({ courseId, lessonId, answers: { questionId, answer }[] })` → `LearningOutcome` with `quizResult` (also completes the lesson) |

```tsx
const submit = useSubmitQuiz();
submit.mutate(
  { courseId, lessonId, answers },
  { onSuccess: (o) => { if (o.newBadges.length) showBadgeCelebration(o.newBadges); showXp(o.xpAwarded); } },
);
// Instant per-question feedback (no XP): isAnswerCorrect(question, answer) from "@/lib/gamification"
```

### Student

| Hook | Returns |
|---|---|
| `useStudent()` | `data: StudentView` (XP, level, streak, earned badges, all badges) |

```tsx
const { data: me } = useStudent();
<p>{me?.name}: Level {me?.level}, {me?.xp} XP, 🔥 {me?.streak.current}</p>
```

### Connectivity, sync & storage

| Hook | Returns |
|---|---|
| `useOnlineStatus()` | `{ isOnline, isReachable, lastCheckedAt, recheck() }`. Trust `isReachable`. |
| `useSyncStatus()` | `{ status, queuedCount, failedCount, lastSyncedAt, lastError, syncNow(), retryFailed() }` |
| `useSyncQueue()` | `data: SyncEvent[]` (pending-changes list) |
| `useStorageEstimate()` | `data: { usageBytes, quotaBytes, coursesBytes, downloadedCount, persisted, supported }`; format with `formatBytes(n)` |

```tsx
const sync = useSyncStatus();
<button onClick={sync.syncNow}>{sync.status === "offline" ? `${sync.queuedCount} changes waiting` : "Sync now"}</button>
```

### AI

| Hook | Returns |
|---|---|
| `useGenerateCourse({ autoSave? = true })` | mutation `mutate({ topic })` → `{ generated: AIGeneratedCourse, saved }`; plus `isOffline`. Saved courses work offline like any course. |
| `useAICourses()` | `data`: AI generation history |
| `useSaveAICourse()` | mutation `mutate(generated)` when `autoSave: false` |
| `useGenerateQuiz()` | mutation `mutate({ topic, lessonContent?, questionCount? })` → `GeneratedQuiz`; `isOffline` |
| `useLearningPath()` | mutation `mutate({ goal, completedCourseIds?, ageYears? })` → `LearningPath`; `isOffline` |
| `useTutor(context?)` | `{ messages, ask(text), isThinking, isOffline, offlineMessage, error, reset() }`; `context: { courseTitle?, lessonTitle? }` |

```tsx
const nova = useTutor({ lessonTitle: lesson.title });
if (nova.isOffline) return <p>{nova.offlineMessage}</p>;
<form onSubmit={(e) => { e.preventDefault(); void nova.ask(text); }}>…</form>
{nova.messages.map((m) => <p key={m.id}>{m.role}: {m.text}</p>)}
```

Limits enforced by the API: topic ≤ 100 chars, question ≤ 500 chars, about 10 AI calls per minute. Show `error.message` (it's kid-friendly).

### Community & contributors

| Hook | Returns |
|---|---|
| `useOrganizations()` | `data: Organization[]` |
| `useOrganization(id)` | `data: { organization, courses: CourseSummary[] }` |
| `useContributorCourses(role)` | `data: { contributor, courses: Course[] }` (drafts + published) |
| `useCreateCourse(role)` | mutation `mutate(ContributorCourseInput)` → draft `Course` |
| `useUpdateContributorCourse(role)` | mutation `mutate({ id, patch })` |
| `usePublishCourse(role)` | mutation `mutate(id)`; on 422, `error.details` lists `{ path, message }` problems |
| `useDeleteDraft(role)` | mutation `mutate(id)` (drafts only) |

`role` is one of `"teacher" | "edfarm-contributor" | "school-admin" | "community-partner" | "volunteer-mentor"`. Errors are `ApiRequestError` (`status`, `code`, `message`, `details`).

## Pages the app needs

Suggested routes. If you use different course/lesson URLs, update the `offlinePages` prop.

| Page | Route | Hooks |
|---|---|---|
| Dashboard | `/` | `useStudent`, `useProgress`, `useDownloadedCourses`, `useSyncStatus`, `useLearningPath` |
| Course library | `/courses` | `useCourses`, `useDownloadCourse`, `useDownloadedCourses` |
| Course detail | `/courses/[courseId]` | `useCourse`, `useProgress(courseId)`, `useDownloadCourse` |
| Lesson player | `/courses/[courseId]/lessons/[lessonId]` | `useCourse`, `useStartLesson`, `useCompleteLesson`, `useSubmitQuiz` |
| AI course creator | `/create` | `useGenerateCourse`, `useAICourses` |
| Nova tutor | `/tutor` (also embeddable in the lesson player) | `useTutor` |
| Contributor portal | `/contributor` | `useContributorCourses`, `useCreateCourse`, `useUpdateContributorCourse`, `usePublishCourse`, `useDeleteDraft` |
| Community hub | `/community`, `/community/[orgId]` | `useOrganizations`, `useOrganization` |
| Offline center | `/offline` (also the service worker fallback; replace the placeholder) | `useDownloadedCourses`, `useStorageEstimate`, `useSyncStatus`, `useSyncQueue`, `useCourseUpdates`, `useUpdateCourse`, `useDeleteCourse` |
| Profile | `/profile` | `useStudent` (`allBadges`, streak, level) |

## Offline pages

Pages open offline only if the service worker has cached them. Configure it in `app/layout.tsx`:

```tsx
<LearnLoopProvider
  offlinePages={{
    course: ["/courses/{courseId}", "/courses/{courseId}/lessons/{lessonId}"], // cached on download
    always: ["/", "/courses", "/offline", "/profile"],                          // cached at startup
  }}
>
  {children}
</LearnLoopProvider>
```

Placeholders: `{courseId}`, `{slug}`, `{lessonId}`. The service worker only runs in production (`npm run build` then `npm start`).

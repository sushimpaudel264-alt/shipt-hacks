# LearnLoop: backend & data layer guide

For the frontend developer. Everything below lives in `frontend/` (Next.js App Router API routes + client data layer).
Working usage example of every hook: **`/debug/data`** ([app/debug/data/page.tsx](app/debug/data/page.tsx)).

## 1. Setup

```powershell
cd frontend
npm install
Copy-Item .env.example .env.local   # MOCK_AI=true works with no Gemini key
npm run dev                          # http://localhost:3000
npm test                             # 44 Vitest tests (gamification, offline flow, sync, API, mock AI)
npm run build; npx next start        # production build: needed for the service worker / offline reload
```

`<LearnLoopProvider>` is already wrapped around `{children}` in [app/layout.tsx](app/layout.tsx). Keep it; every hook needs it.

## 2. What to import

| Need | Import |
|---|---|
| Types (`Course`, `Lesson`, `Question`, `Student`, `Progress`, `Badge`, `SyncState`, `LearningOutcome`, …) | `@/lib/types` |
| Zod schemas (form validation in the contributor editor) | `@/lib/schemas` |
| Hooks | `@/lib/hooks` |
| Pure helpers (`getLevel`, `calculateLessonXP`, `isAnswerCorrect`, `toLocalDate`) | `@/lib/gamification` |
| Badge catalog (8 badges) | `@/lib/mock/badges` |
| Repositories (rarely needed directly) | `@/lib/db` (`courseRepo`, `progressRepo`, `studentRepo`, `syncRepo`) |

## 3. Hooks

All local hooks read **IndexedDB first** and work offline. Mutations update the local DB immediately and queue sync events.

| Hook | Returns / usage |
|---|---|
| `useCourses({ category?, difficulty?, q? })` | `data: { courses: CourseSummary[], source: "network" \| "offline-downloads" }`. Offline it falls back to downloaded courses instead of erroring. |
| `useCourse(id)` | `data: { course: Course, isDownloaded } \| null`. Reads Dexie first, then the API. |
| `useDownloadedCourses()` | `data: DownloadedCourse[]` (`{ id, version, downloadedAt, sizeBytes, source, course }`) |
| `useDownloadCourse()` | `mutate(courseId)`. Saves the full package offline and pre-caches its pages. |
| `useDeleteCourse()` | `mutate(courseId)`. Removes content; XP/progress/badges are kept. |
| `useCourseUpdates()` / `useUpdateCourse()` | `data: { id, localVersion, remoteVersion }[]` / `mutate(courseId)` |
| `useProgress(courseId?)` | `data: Progress[]` (`status: not-started \| in-progress \| completed`, best `score`, `xpEarned`) |
| `useStartLesson()` | `mutate({ courseId, lessonId })` when a lesson opens (never downgrades) |
| `useCompleteLesson()` | `mutate({ courseId, lessonId })` → **`LearningOutcome`** |
| `useSubmitQuiz()` | `mutate({ courseId, lessonId, answers: [{ questionId, answer }] })` → `LearningOutcome` with `quizResult` (graded offline, also completes the lesson) |
| `useQuizResults(lessonId?)` | all attempts, newest first |
| `useStudent()` | `data: StudentView` = `Student` + `level`, `xpIntoLevel`, `xpForNextLevel`, `badges` (earned), `allBadges` (with `earned` flag) |
| `useOnlineStatus()` | `{ isOnline, isReachable, lastCheckedAt, recheck }`. Trust `isReachable` (pings `/api/health`). |
| `useSyncStatus()` | `{ status, queuedCount, failedCount, lastSyncedAt, lastError, syncNow(), retryFailed() }`, status ∈ `online \| offline \| syncing \| queued \| error` |
| `useSyncQueue()` | raw events for a "pending changes" panel |
| `useStorageEstimate()` + `formatBytes()` | `{ usageBytes, quotaBytes, coursesBytes, downloadedCount, persisted, supported }` |
| `useGenerateCourse()` | `mutate({ topic })` → `{ generated: AIGeneratedCourse, saved }` (auto-saved offline). Has `isOffline`. |
| `useAICourses()`, `useSaveAICourse()` | AI course history / manual save (`useGenerateCourse({ autoSave: false })`) |
| `useGenerateQuiz()`, `useLearningPath()` | AI quiz / learning path, both with `isOffline` |
| `useTutor(context?)` | `{ messages, ask(text), isThinking, isOffline, offlineMessage, error, reset }`. Never throws when offline. |
| `useOrganizations()`, `useOrganization(id)` | org list / `{ organization, courses }` |
| `useContributorCourses(role)`, `useCreateCourse(role)`, `useUpdateContributorCourse(role)`, `usePublishCourse(role)`, `useDeleteDraft(role)` | contributor dashboard (mock auth by role, e.g. `"teacher"`) |

**`LearningOutcome`** drives celebrations: `{ xpAwarded, totalXp, newBadges: Badge[], streak, streakIncreased, progress, quizResult? }`.

### Rendering lessons
`lesson.sections[]` all have `{ id, type, title, body }`. Switch on `type`:
- `story`, `analogy`, `explanation`: text
- `example`: optional `code`
- `interactive-exercise`: `activity: { kind: "choose" | "fill-in", prompt, options?, answer, hint?, successMessage? }`
- `practice-challenge`: `hint`, `solution`

Quiz questions: `{ id, type: "multiple-choice" | "true-false" | "fill-in-the-blank", prompt, options?, correctAnswer, acceptableAnswers?, explanation }`.
Use `isAnswerCorrect(question, answer)` from `@/lib/gamification` for instant per-question feedback; scoring itself happens in `useSubmitQuiz`.

### Things to set on your side
- **[lib/offline/routes.ts](lib/offline/routes.ts):** set `OFFLINE_PAGE_ROUTES` to your real course/lesson URLs (defaults: `/courses/{courseId}` and `/courses/{courseId}/lessons/{lessonId}`). These pages get pre-cached on download so they open offline.
- **Course/lesson pages must be client components that read via `useCourse(id)`**, not server components that fetch from the API. That is what makes them work offline.
- [app/offline/page.tsx](app/offline/page.tsx) is a placeholder fallback; restyle it freely but keep the `/offline` route.

## 4. API

Errors are always `{ error: { code, message, details? } }` with a proper HTTP status.

| Method | Route | Notes |
|---|---|---|
| GET | `/api/health` | `{ ok: true, time }`, the real connectivity check |
| GET | `/api/courses?category=&difficulty=&q=` | `CourseSummary[]` (no lesson bodies) |
| GET | `/api/courses/:id` | `Course` (published only) |
| GET | `/api/courses/:id/package` | `{ course, version, sizeBytes, packagedAt }` |
| GET | `/api/courses/versions?ids=a,b` | `{ id, version }[]` |
| POST | `/api/sync` | `{ events: SyncEvent[≤50] }` → `{ acknowledgedIds, serverStudentState }`. Idempotent. |
| GET | `/api/organizations`, `/api/organizations/:id` | |
| GET/POST | `/api/contributor/courses` | header `x-mock-role: teacher` (or cookie `mock-role`). `student`/none → 403/401. |
| PATCH/DELETE | `/api/contributor/courses/:id` | delete = drafts only (409 otherwise) |
| POST | `/api/contributor/courses/:id/publish` | validates (≥1 lesson, valid quizzes) → 422 with `details`, bumps `version` |
| POST | `/api/ai/generate-course` `{ topic ≤100 }` | |
| POST | `/api/ai/generate-quiz` `{ topic, lessonContent?, questionCount? }` | |
| POST | `/api/ai/learning-path` `{ goal, completedCourseIds?, ageYears? }` | |
| POST | `/api/ai/tutor` `{ question ≤500, history ≤10, context? }` | |

AI routes: ~10 requests/min per IP (in-memory, **demo-only**: per serverless instance, resets on cold start).

## 5. How offline & sync work

- **Storage:** Dexie DB `learnloop` with tables `coursePackages`, `aiCourses`, `progress`, `quizResults`, `student`, `syncQueue`, `meta`. `navigator.storage.persist()` is requested after the first download.
- **Atomic writes:** completing a lesson / quiz writes progress, XP, streak, badges **and** their sync events in one Dexie transaction.
- **XP rules:** base `xpReward` once per lesson; the quiz bonus (up to +50% of base, scaled by score) is awarded on *improvement* only, so retakes can't farm XP.
- **Streak:** based on the student's *local* calendar date; same day = no change, next day = +1, gap = reset to 1.
- **Sync engine:** triggers on startup, the `online` event, every 60 s, Background Sync, and `syncNow()`. It checks `/api/health` (5 s timeout), then sends batches of 50 with exponential backoff (2 s → 60 s). After 5 attempts an event is marked `failed` and status becomes `error`.
- **Conflict rules:**
  - **XP:** derived from the event log; additive; deduped by event UUID, so it is never double-counted.
  - **Lesson status:** furthest wins (completed beats in-progress); the earliest `completedAt` is kept.
  - **Quiz results:** append-only on the device; the server keeps the best score.
  - **Badges:** set union.
  - **Streak:** rebuilt from distinct activity dates.
- **Service worker** ([public/sw.js](public/sw.js), production only):
  - Pages: network-first, then cache, then `/offline`.
  - `/_next/static`: cache-first.
  - `/api/courses` list: network-first.
  - AI, sync, health and package routes: network-only.
  - Course content is **never** stored in the SW cache, only in IndexedDB.

## 6. Demo script (judges)

1. Production build: `npm run build; npx next start`. Open `/` (or `/debug/data`), and let the page load once while online.
2. Download **Code Adventure**.
3. DevTools → Network → **Offline**. Reload: the app still loads.
4. Open **Variables**, complete it, and submit the quiz. Jordan goes from 85 → 105 → 115 XP, the streak goes 3 → 4, and **100 XP Club** unlocks.
5. Sync status shows `offline` with queued events.
6. Switch back to **Online**: it syncs automatically and the queue drops to 0. Press **Sync now** again and XP is unchanged on the server.

## 7. Known limitations

- **Mock auth for contributors** (header/cookie). Add real auth before production.
- **In-memory server store:** contributor courses and server sync state reset on serverless cold starts. Seed data always reloads, and the student experience lives in IndexedDB, so the demo is unaffected.
- **Client-computed XP is trusted by `/api/sync`** (fine for a demo; a real server would recompute it from lesson definitions).
- **Live Gemini mode is implemented but was not exercised in tests** (no key available). Mock mode is fully tested. Set `GEMINI_API_KEY` + `GEMINI_MODEL` + `MOCK_AI=false` to use it.
- **Background Sync** needs an open LearnLoop tab to do the actual sync (the SW wakes the tab); the online event and the 60 s interval cover other browsers.
- **Single student per device** (Jordan in the demo); there is no login.

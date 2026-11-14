# CodeLingo architecture

CodeLingo is built for students whose internet works at school but not at home. The design rule is:
**the student's device is the source of truth; the server is a place to download from and sync to.**

## The flow

```
  AT SCHOOL (online)                  AT HOME (offline)                     BACK ONLINE
  ──────────────────                  ─────────────────                     ───────────
  GET /api/courses/:id/package        Lesson player reads IndexedDB         Sync engine wakes up
          │                                   │                             (online event / 60 s / Background Sync)
          ▼                                   ▼                                     │
  ┌──────────────────────┐   complete lesson / submit quiz            GET /api/health (5 s timeout)
  │ IndexedDB "codelingo"│◄──── one Dexie transaction writes ─────┐            │
  │  coursePackages      │      progress + XP + streak + badges   │            ▼
  │  progress            │      AND their sync events             │   POST /api/sync (batches of 50)
  │  quizResults         │                                        │            │
  │  student             │                                        │            ▼
  │  syncQueue  ─────────┼────────── queued events ───────────────┴──► server dedupes by event UUID,
  │  meta, aiCourses     │                                             applies once, returns acked ids
  └──────────────────────┘                                                     │
                                                                               ▼
                                                                 events marked "synced" locally
```

download at school → IndexedDB → learn offline → sync queue → `/api/sync`

## Offline-first design

- **Course content lives in IndexedDB, not the HTTP cache.** A download stores the full package (all lessons, sections and quizzes), and the lesson player reads it from Dexie, so it never depends on the server or a cached response.
- **Everything a student does is local.** Quizzes are graded on the device. XP, streaks and badges are computed by pure functions in `lib/gamification`.
- **Atomic writes.** Completing a lesson or submitting a quiz is one Dexie transaction covering `progress`, `quizResults`, `student` and `syncQueue`. Either everything is saved, including the matching sync events, or nothing is. Student data and the sync queue can never disagree.
- **Real connectivity checks.** `navigator.onLine` reports "online" on WiFi with no internet, so the app also pings `GET /api/health`.
- **Storage durability.** After the first download the app calls `navigator.storage.persist()` so the browser doesn't evict course data on shared Chromebooks.
- **Service worker** (`public/sw.js`, production builds only) makes the app shell load offline:
  - Page navigations: network-first, then the cached page, then `/offline`.
  - `/_next/static`: cache-first.
  - `GET /api/courses`: network-first.
  - AI, sync, health, package and contributor routes: network-only.
  - Course pages are pre-cached right after a course is downloaded.

### Dexie tables (database `codelingo`)

| Table | Key / indexes | Holds |
|---|---|---|
| `coursePackages` | `id`, version, downloadedAt, sizeBytes, source | Full downloaded courses, including AI-generated ones |
| `aiCourses` | `id`, createdAt | AI generation history (prompt, model) |
| `progress` | `[courseId+lessonId]`, courseId, updatedAt | Lesson status, best quiz score, XP earned |
| `quizResults` | `id`, lessonId, courseId, submittedAt | Every quiz attempt (append-only) |
| `student` | `id` | XP, streak, achievements |
| `syncQueue` | `id`, status, createdAt | Events waiting to sync (`queued → syncing → synced / failed`) |
| `meta` | `key` | lastSyncedAt, last server state, flags |

### Gamification rules

- **XP:** a lesson's base `xpReward` is awarded once. The quiz bonus (up to +50% of base, scaled by score) is awarded only when the student beats their previous best, so retakes can't farm XP.
- **Streaks** use the student's *local* calendar date: same day = no change, next day = +1, gap = reset to 1. If the device clock goes backwards, the streak is never broken.
- **Badges** (8): First Lesson, Coding Explorer, Math Master, Science Star, 7/30 Day Streak, 100/500 XP Club. Evaluation skips owned badges, so unlocking is idempotent.

## Sync engine (`lib/sync`)

- **Triggers:**
  - app startup;
  - the browser's `online` event;
  - every 60 s while online;
  - Background Sync (the service worker wakes the open tab);
  - the "Sync now" button.
- **Each run:**
  1. Health check with a 5 s timeout.
  2. Send queued events oldest-first in batches of 50.
  3. Mark the acknowledged ids `synced`.
- **On failure:** the event's attempt count goes up, with exponential backoff (2 s → 4 s → … max 60 s). After 5 attempts an event becomes `failed` and the status shows `error` (retryable).
- **Status machine:** `offline`, `syncing`, `error`, `queued` (pending, e.g. waiting out backoff), `online`.
- **Concurrency:** runs never overlap; concurrent calls share the in-flight run.

### Conflict rules

| Data | Rule |
|---|---|
| XP | Derived from the event log; additive; each event UUID is applied once, so it is **never double-counted**, even if a batch is resent |
| Lesson status | Furthest status wins (completed beats in-progress); earliest `completedAt` is kept |
| Quiz results | Append-only on the device; the server keeps the best score per lesson |
| Badges | Set union |
| Streak | Server rebuilds it from the distinct local dates on events |

## AI (`lib/ai`)

- **Services:** `generateCourse`, `generateQuiz`, `generateLearningPath`, and `answerStudentQuestion` (Nova, the tutor).
- **Gemini** via `@google/genai`:
  - Structured JSON output (`responseJsonSchema`), validated with Zod.
  - If validation fails, it retries once with the errors included in the prompt. If the second attempt also fails, the route returns a clear `502` error.
  - The model name comes from `GEMINI_MODEL`; nothing is hardcoded.
- **AI courses use the same `CourseSchema` as official courses.** The model writes a draft with no ids; the server adds ids and validates it. The saved result plays offline exactly like any other course.
- **Child safety:** every call's system instruction carries the safety rules:
  - ages 8–16;
  - no violence or adult content;
  - never ask for personal information;
  - no links;
  - hints before answers;
  - kind redirection of off-topic requests.

  Student text is wrapped in `<student_input>` tags and treated as data.
- **Limits:** topic ≤ 100 chars, tutor question ≤ 500 chars, history ≤ 10 turns. Nova's answers are capped at 150 words. Roughly 10 AI requests/min per IP (in-memory, demo-only).
- **Mock mode:** with `MOCK_AI=true`, or with no key/model, every AI route returns realistic canned output after a short delay. That includes a full *Intro to Python* course, templated courses for any topic, quizzes, learning paths and Nova replies. The app never needs an API key.

## Server (`lib/server`)

- **In-memory store** seeded from `lib/mock` on every cold start. Serverless instances don't share memory, so contributor drafts and server sync state are demo-grade. The catalog always reloads, and the student experience never depends on server memory.
- **Contributor routes** use mock auth: an `x-mock-role` header or `mock-role` cookie (`teacher`, `edfarm-contributor`, `school-admin`, `community-partner`, `volunteer-mentor`). `student` gets 403. Contributor text is stripped of HTML before saving.
- **Publishing** requires required fields, at least one lesson, and valid quizzes, and bumps `version`. Students detect the update through `/api/courses/versions`. Only drafts can be deleted.

## API routes

Every route has the same shape (see `lib/server/http.ts`):
- input is validated with a schema from `lib/schemas`;
- responses are `Cache-Control: no-store`;
- every error is `{ error: { code, message, details? } }` with a matching HTTP status.

| Method | Route | Returns |
|---|---|---|
| GET | `/api/health` | `{ ok: true, time }` |
| GET | `/api/courses?category=&difficulty=&q=` | `CourseSummary[]` (published, no lesson bodies) |
| GET | `/api/courses/:id` | `Course` |
| GET | `/api/courses/:id/package` | `CoursePackage` (everything needed offline) |
| GET | `/api/courses/versions?ids=a,b,c` | `{ id, version }[]` |
| POST | `/api/sync` | `{ events: SyncEvent[≤50] }` → `{ acknowledgedIds, serverStudentState }` (idempotent) |
| GET | `/api/organizations` | `Organization[]` |
| GET | `/api/organizations/:id` | `{ organization, courses }` |
| GET / POST | `/api/contributor/courses` | own courses / create draft (201) |
| PATCH / DELETE | `/api/contributor/courses/:id` | update / delete draft (409 if published) |
| POST | `/api/contributor/courses/:id/publish` | publish (422 with field `details` if not ready) |
| POST | `/api/ai/generate-course` | `AIGeneratedCourse` |
| POST | `/api/ai/generate-quiz` | `GeneratedQuiz` |
| POST | `/api/ai/learning-path` | `LearningPath` |
| POST | `/api/ai/tutor` | `TutorResponse` |

Common error codes: `VALIDATION_ERROR` (400), `INVALID_JSON` (400), `UNAUTHENTICATED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `NOT_A_DRAFT` (409), `PUBLISH_VALIDATION_FAILED` (422), `RATE_LIMITED` (429), `AI_INVALID_OUTPUT` (502), `AI_UNAVAILABLE` (503), `INTERNAL_ERROR` (500).

## Demo script

1. `npm run build` then `npm start` (the service worker only runs in production). Open `/debug/data` (or the real UI) once while online.
2. Download **Code Adventure**.
3. DevTools → Network → **Offline**, then reload. The app still loads.
4. Complete **Variables** and submit the quiz. Jordan goes from 85 → 105 → 115 XP, the streak goes 3 → 4, and the **100 XP Club** badge unlocks. Sync status shows `offline` with queued events.
5. Switch back to **Online**. The queue syncs automatically to 0. Press **Sync now** again; server XP stays 115.

## Tests

`npm test` runs 44 tests:
- XP, quiz grading, streaks (including month, leap-year and DST edges) and badges;
- seed data validity;
- the full offline flow against the real route handlers (fake IndexedDB), including replaying the whole sync log with no double XP and events marked failed after 5 attempts;
- contributor publishing and version updates;
- AI input limits and the rate limit, and every mock AI endpoint.

## Known limitations

- Mock contributor auth; one student per device (demo student Jordan).
- `/api/sync` trusts XP calculated on the device (a real server would recompute it from lesson definitions).
- In-memory server state resets on serverless cold starts.
- Live Gemini mode is implemented but only mock mode is covered by tests.
- Background Sync needs an open CodeLingo tab; the online event and the 60 s interval cover other browsers.

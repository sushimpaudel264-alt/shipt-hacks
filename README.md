# LearnLoop

**Download at school. Learn anywhere.**

LearnLoop is an offline-first learning app (PWA) for students ages 8–16 on school Chromebooks with unreliable home internet.
Students download courses while on school WiFi, then learn at home with no connection: lessons, quizzes, XP, streaks and badges all work offline.
Progress syncs back automatically when they reconnect. Teachers and community partners can publish courses, and an AI tutor ("Nova") can generate new courses and answer questions.

**Live demo:** https://learn-offline-two.vercel.app

## Run locally

Requires Node.js 20+.

```powershell
cd frontend
npm install
Copy-Item .env.example .env.local   # first time only; mock AI works with no API key
npm run dev                          # http://localhost:3000
```

| Command (in `frontend/`) | What it does |
|---|---|
| `npm run dev` | Dev server (service worker off) |
| `npm run build` then `npm start` | Production build + server (service worker on; needed to test offline reloads) |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript, no emit |
| `npm test` | Vitest: gamification rules, offline flow, sync idempotency, API and mock AI |

To try the offline flow without any UI, open **`/debug/data`** (see [frontend/BACKEND.md](frontend/BACKEND.md#demo-script)).

## Folder map

One Next.js app in `frontend/` holds both the UI and the API. Vercel deploys `frontend/` as its root directory.

```
frontend/
├── app/
│   ├── api/                  API route handlers (server). One standard pattern: see BACKEND.md
│   ├── debug/data/           Diagnostics page that exercises every hook
│   ├── offline/              Offline fallback page served by the service worker
│   ├── layout.tsx            Root layout (wraps the app in <LearnLoopProvider>)
│   └── page.tsx              Starter home page (UI teams replace this)
├── lib/
│   ├── types/                Shared TypeScript types (inferred from schemas)
│   ├── schemas/              Zod schemas: the API and data contracts
│   ├── mock/                 Seed data: courses, organizations, contributors, badges, demo student
│   ├── gamification/         Pure XP / streak / badge rules
│   ├── db/                   IndexedDB (Dexie) database + repositories (browser)
│   ├── sync/                 Sync engine, connectivity checks, service worker helpers (browser)
│   ├── server/               In-memory store + API business logic (server-only)
│   ├── ai/                   Gemini services, prompts, mock AI (server-only)
│   └── hooks/                React Query hooks + <LearnLoopProvider>: the ONLY data API for UI code
├── public/sw.js              Service worker
├── tests/                    Vitest suites
├── BACKEND.md                Architecture: offline-first design, sync, AI, API routes
├── FRONTEND_GUIDE.md         Guide for building UIs (written for AI coding tools)
└── AGENTS.md                 Pointer read automatically by AI coding agents
```

Building a UI? Read [frontend/FRONTEND_GUIDE.md](frontend/FRONTEND_GUIDE.md).
Judging the architecture? Read [frontend/BACKEND.md](frontend/BACKEND.md).

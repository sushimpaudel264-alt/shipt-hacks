# shipt-hacks: Codelingo

<img src="frontend/public/logo-192.png" alt="Codelingo mascot" width="120">

An offline-first learning platform. Students download courses while they have internet, keep learning with no connection, and their progress syncs automatically when they're back online. Teachers and other administrators create and publish the courses.

FastAPI backend + Next.js frontend.

## How offline works

- **Download:** each course card has a **⬇ Download** button. The whole course (lessons, quizzes, activities, images) is saved in the browser's IndexedDB.
- **Learn offline:** downloaded courses open from the device. A service worker (`frontend/public/sw.js`) caches the app itself, so it loads even with no connection.
- **Queue and sync:** every completed lesson, quiz score and piece of code is saved on the device immediately and queued. The header shows **Online**, **Offline**, **Syncing** or **Queued**, and the queue syncs automatically when the connection returns (plus a retry every 30 seconds).
- **Merge, don't overwrite:** the server merges what each device sends. Completed lessons, streak days and badges are combined, the best quiz score wins, and the newest code wins. Using two devices offline never loses work.
- **Updates:** publishing a course bumps its version. Downloaded copies then show **⟳ Update**.

The **Offline Center** (`#/offline`) shows downloaded courses, storage used and remaining, last sync time and sync status, with **Download**, **Delete**, **Update** and **Sync now** buttons.

## Roles

| Role | Can |
|---|---|
| **Student** | Log in, study, download courses, earn badges, appear in the rankings |
| **Administrator**: Teacher, Ed Farm Contributor, School Administrator, Community Partner, Volunteer Mentor | Everything students can, plus create and edit courses, add lessons, quizzes and activities, save drafts and publish (**Manage** tab) |

| **Superuser** | Everything. One built-in account for the project team; it can't be created by signing up |

Anyone can sign up as a Student. Signing up with an administrator role requires the **educator access code**. Administrators and the superuser aren't ranked.

### Team secrets: `backend/.env`

The superuser login and the educator access code live in `backend/.env`. It is **gitignored**, so it is never committed or served by the website, and other users (students and teachers) have no way to read it. Share the file with your team through a password manager, not in chat or the repo. `backend/.env.example` lists the keys.

- On startup the backend creates the superuser from `SUPERUSER_USERNAME` / `SUPERUSER_PASSWORD`. To change the password, edit `.env` and restart the backend; that also signs the superuser out everywhere.
- The superuser username can't be taken by anyone signing up. If an existing account already has that username, the backend leaves it alone and logs a warning.
- Without `EDUCATOR_ACCESS_CODE`, the code defaults to `sprout-educator` and the backend logs a warning.

## Courses

A course has a title, description, subject (Coding, Math, Science, Other), difficulty, icon, optional thumbnail image and an ordered list of items:

| Item | What students do |
|---|---|
| 📖 Lesson | Read, then mark complete |
| ❓ Quiz | Multiple choice, graded instantly; 70% to pass |
| 💻 Coding activity | Write HTML/CSS or JavaScript in the built-in editor; automatic checks |
| ✋ Hands-on activity | Do a real-world task and write a short response |

Administrators edit a **draft**. Students only ever see the **published** version, so a course can be improved without disturbing students until **Publish** is pressed. Publishing checks the course is complete (titles, quiz answers, coding checks…) and lists anything missing. In the editor, **Test checks against the solution** verifies a coding activity before students see it.

The first run seeds four courses (HTML & CSS, JavaScript, Fractions Made Simple, Our Solar System) from `backend/data/seed_courses.json`.

## Gamification

- **XP:** 10 XP per estimated minute of each completed item.
- **Badges:** First Lesson, Coding Explorer (5 coding lessons), Math Master (finish a Math course), Science Star (finish a Science course), 7 Day Streak, 30 Day Streak.
- **Rankings** (`#/leaderboard`): students by XP, all time and this week. Only display names are shown. The last copy seen is available offline.
- **Profile** (`#/profile`): name, XP, badges, hours learned, courses completed, current streak, downloaded content and learning history.

## Project structure

```
backend/
  main.py            App setup and router wiring
  db.py              SQLite schema, migrations, first-run seeding
  auth.py            Accounts, roles, sessions
  courses.py         Student catalog + administrator draft/publish workflow
  progress.py        Merge-on-sync progress and the leaderboard
  data/seed_courses.json   Starter catalog (loaded once, into an empty database)
  data/progress.db   SQLite database (created on first run, gitignored)
frontend/
  app/               Layout, page, styles (globals.css), manifest.ts
  public/sw.js       Service worker: caches the app for offline use
  components/Codelingo.tsx  Client component that mounts the app
  lib/codesprout/
    app.js           Router, pages, sync queue, downloads
    admin.js         Course management and editor
    offline.js       IndexedDB storage, storage estimate, service worker registration
    gamify.js        XP, streaks, badges, learning history
    code.js          Code editor and sandboxed code runners
    api.js           Backend client
    util.js          Shared helpers (Markdown, formatting, thumbnails)
```

## Backend (terminal 1)

```powershell
cd backend
python -m venv venv                 # first time only
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt     # first time, or when requirements.txt changes
uvicorn main:app --reload --port 8000
```

Check it: http://localhost:8000/health (interactive API docs at http://localhost:8000/docs)

> If activation is blocked, run once: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.
> If you move the project folder, delete `venv` and create it again (it stores absolute paths).

## Frontend (terminal 2)

```powershell
cd frontend
npm install                         # first time, or when package.json changes
"NEXT_PUBLIC_API_URL=http://localhost:8000" | Set-Content -Encoding ascii .env.local   # first time only
npm run dev
```

Open http://localhost:3000.

**To try offline mode:** log in, download a course, then in Chrome DevTools open **Network → No throttling ▾ → Offline** (or stop the backend) and reload. For a production-like test, use `npm run build` and `npm start`.

## API

🔒 needs `Authorization: Bearer <token>`; 🛠️ administrators only.

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Health check |
| GET | `/api/auth/roles` | Student and administrator titles |
| POST | `/api/auth/register` | `{username, password, display_name, title, access_code?}` → `{token, user}` |
| POST | `/api/auth/login` | `{username, password}` → `{token, user}` |
| POST | `/api/auth/logout` | End this session 🔒 |
| GET | `/api/auth/me` | Current user 🔒 |
| GET | `/api/courses` | Published courses with outlines 🔒 |
| GET | `/api/courses/{id}` | Full published course (what gets downloaded) 🔒 |
| GET / PUT / DELETE | `/api/me/progress` | Progress; PUT merges and returns the merged copy 🔒 |
| GET | `/api/leaderboard` | Student rankings 🔒 |
| GET / POST | `/api/admin/courses` | List / create courses 🛠️ |
| GET / PUT / DELETE | `/api/admin/courses/{id}` | Read / save draft / delete 🛠️ |
| POST | `/api/admin/courses/{id}/publish` | Publish the draft (new version) 🛠️ |
| POST | `/api/admin/courses/{id}/unpublish` | Hide from students 🛠️ |

Environment variables (or `backend/.env`): `SUPERUSER_USERNAME`, `SUPERUSER_PASSWORD`, `EDUCATOR_ACCESS_CODE`, `FRONTEND_URL` (extra CORS origin) and `DATABASE_PATH` on the backend; `NEXT_PUBLIC_API_URL` on the frontend.

## Security notes

- Passwords are hashed with scrypt. Sessions are random tokens (only their SHA-256 is stored) that last 30 days.
- Learner code runs only in the browser: JavaScript in a Web Worker with a 3-second timeout, HTML in a sandboxed iframe. The backend never executes it.
- Quiz answers and code solutions are part of each downloaded course (they have to be, to grade offline), so a determined student can find them.
- There is no limit on login attempts yet. Add rate limiting before a public launch.

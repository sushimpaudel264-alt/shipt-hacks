# shipt-hacks

LearnLoop: a Next.js app whose API lives in its own route handlers (`frontend/app/api`).
The frontend calls them with relative paths (`/api/courses`, `/api/health`, ...), so there is no separate API URL to configure.

## Run it

```powershell
cd frontend
npm install
Copy-Item .env.example .env.local   # first time only; mock AI works without a Gemini key
npm run dev
```

Open http://localhost:3000. It should say **Backend: ok** (it checks http://localhost:3000/api/health).

> If PowerShell blocks scripts, run once: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`

## LearnLoop data layer

The LearnLoop API, offline storage, sync and AI live inside the Next.js app (`frontend/app/api`, `frontend/lib`).
See **[frontend/BACKEND.md](frontend/BACKEND.md)** for hooks, API contracts, the offline demo script and known limitations.

```powershell
cd frontend
npm test                             # unit + offline/sync integration tests
npm run build; npx next start        # production mode (service worker enabled)
```

## Optional: FastAPI service (`backend/`)

The original FastAPI skeleton is not used by the app. Keep it only if you need a Python service later.

```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --reload --port 8000   # http://localhost:8000/health
```

# shipt-hacks

FastAPI backend + Next.js frontend.

## Backend (terminal 1)

```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Check it: http://localhost:8000/health

> If activation is blocked, run once: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`

## Frontend (terminal 2)

```powershell
cd frontend
npm install
"NEXT_PUBLIC_API_URL=http://localhost:8000" | Set-Content -Encoding ascii .env.local   # first time only
npm run dev
```

Open http://localhost:3000. It should say **Backend: ok**.

## LearnLoop data layer

The LearnLoop API, offline storage, sync and AI live inside the Next.js app (`frontend/app/api`, `frontend/lib`).
See **[frontend/BACKEND.md](frontend/BACKEND.md)** for hooks, API contracts, the offline demo script and known limitations.

```powershell
cd frontend
Copy-Item .env.example .env.local   # mock AI works without a Gemini key
npm test                             # unit + offline/sync integration tests
npm run build; npx next start        # production mode (service worker enabled)
```

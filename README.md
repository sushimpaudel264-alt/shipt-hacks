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

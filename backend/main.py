"""Codelingo API: offline-first courses, accounts with roles, progress sync and rankings.

Modules:
  db.py        SQLite schema, migrations and first-run course seeding
  auth.py      accounts, roles (Student / administrators) and sessions
  courses.py   student catalog + administrator draft / publish workflow
  progress.py  merge-on-sync progress and the student leaderboard
"""
import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import auth
import courses
import progress
from db import init_db

app = FastAPI(title="Codelingo API")

origins = ["http://localhost:3000", "http://127.0.0.1:3000"]
if os.getenv("FRONTEND_URL"):
    origins.append(os.getenv("FRONTEND_URL"))

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

init_db()
log = logging.getLogger("uvicorn.error")
if problem := auth.ensure_superuser():
    log.warning(problem)

if auth.EDUCATOR_CODE == auth.DEFAULT_EDUCATOR_CODE:
    log.warning(
        "EDUCATOR_ACCESS_CODE is not set; administrators sign up with the default code %r. "
        "Set it before sharing this server.", auth.DEFAULT_EDUCATOR_CODE)

app.include_router(auth.router)
app.include_router(courses.router)
app.include_router(courses.admin)
app.include_router(progress.router)


@app.get("/health")
def health():
    return {"status": "ok"}

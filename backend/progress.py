"""Learner progress sync and the student leaderboard.

Students learn offline and sync later, possibly from several devices, so a save never
overwrites the server copy. It is merged instead: completed lessons, streak days and
badges are unions, the best quiz score wins, and the newest saved code wins. The merged
document is returned so the device can catch up with what other devices synced.
"""
import json
import re
import sqlite3
from contextlib import closing
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth import current_user
from db import connect, now

MAX_PROGRESS_BYTES = 1_000_000
XP_PER_MINUTE = 10  # keep in sync with frontend/lib/codesprout/gamify.js

router = APIRouter(tags=["progress"])


class QuizResult(BaseModel):
    score: int = Field(ge=0)
    total: int = Field(ge=0)
    best: int = Field(ge=0)
    at: str = ""


class Progress(BaseModel):
    done: dict[str, str | bool] = Field(default_factory=dict)  # "course/item" -> ISO time completed
    code: dict[str, str] = Field(default_factory=dict)         # "course/item" -> learner's code or response
    quiz: dict[str, QuizResult] = Field(default_factory=dict)  # "course/item" -> latest and best score
    days: list[str] = Field(default_factory=list)              # local dates with a completion (streaks)
    badges: dict[str, str] = Field(default_factory=dict)       # badge id -> ISO time earned
    last: str | None = None                                    # last visited "course/item"
    play: dict[str, str] = Field(default_factory=dict)         # playground code per mode


def merge(old: Progress, new: Progress) -> Progress:
    done = dict(old.done)
    for key, at in new.done.items():
        prev = done.get(key)
        # Keep the earliest real timestamp; a legacy `true` is replaced by a timestamp.
        if prev is None or prev is True or (isinstance(at, str) and isinstance(prev, str) and at < prev):
            done[key] = at
    quiz = dict(old.quiz)
    for key, res in new.quiz.items():
        prev = quiz.get(key)
        latest = res if prev is None or res.at >= prev.at else prev
        quiz[key] = QuizResult(score=latest.score, total=latest.total, at=latest.at,
                               best=max(res.best, prev.best if prev else 0))
    badges = dict(new.badges)
    badges.update({k: v for k, v in old.badges.items() if k not in badges or v < badges[k]})
    return Progress(
        done=done,
        code={**old.code, **new.code},
        quiz=quiz,
        days=sorted(set(old.days) | set(new.days)),
        badges=badges,
        last=new.last or old.last,
        play={**old.play, **new.play},
    )


def key_of(user: dict) -> str:
    return f"user:{user['id']}"


def read(conn, key: str) -> Progress:
    row = conn.execute("SELECT data FROM progress WHERE user_id = ?", (key,)).fetchone()
    return Progress.model_validate_json(row[0]) if row else Progress()


@router.get("/api/me/progress", response_model=Progress)
def get_my_progress(user: dict = Depends(current_user)):
    with closing(connect()) as conn:
        return read(conn, key_of(user))


@router.put("/api/me/progress", response_model=Progress)
def sync_my_progress(progress: Progress, user: dict = Depends(current_user)):
    if any(not re.fullmatch(r"\d{4}-\d{2}-\d{2}", d) for d in progress.days):
        raise HTTPException(status_code=422, detail="days must be YYYY-MM-DD dates")
    with closing(connect()) as conn, conn:
        conn.execute("BEGIN IMMEDIATE")  # two devices syncing at once must not lose either's changes
        merged = merge(read(conn, key_of(user)), progress)
        data = merged.model_dump_json()
        if len(data.encode()) > MAX_PROGRESS_BYTES:
            raise HTTPException(status_code=413, detail="Progress data too large")
        conn.execute(
            "INSERT INTO progress (user_id, data, updated_at) VALUES (?, ?, ?)"
            " ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
            (key_of(user), data, now().isoformat()),
        )
    return merged


@router.delete("/api/me/progress")
def reset_my_progress(user: dict = Depends(current_user)):
    with closing(connect()) as conn, conn:
        conn.execute("DELETE FROM progress WHERE user_id = ?", (key_of(user),))
    return {"ok": True}


# ---------- Leaderboard ----------

def lesson_minutes(conn) -> dict[str, int]:
    """"course/item" -> estimated minutes, for every published item."""
    minutes = {}
    for course_id, data in conn.execute("SELECT id, published FROM courses WHERE published IS NOT NULL"):
        for item in json.loads(data)["items"]:
            minutes[f"{course_id}/{item['id']}"] = item["minutes"]
    return minutes


def current_streak(days: list[str]) -> int:
    have = set(days)
    day = date.today()
    if day.isoformat() not in have:
        day -= timedelta(days=1)  # today's lesson may still be ahead; the streak lasts until the day ends
    streak = 0
    while day.isoformat() in have:
        streak += 1
        day -= timedelta(days=1)
    return streak


def student_stats(p: Progress, minutes: dict[str, int]) -> dict:
    week_ago = (now() - timedelta(days=7)).isoformat()
    xp = week_xp = lessons = 0
    for key, at in p.done.items():
        if key not in minutes:
            continue  # lesson removed from the catalog
        lessons += 1
        xp += minutes[key] * XP_PER_MINUTE
        if isinstance(at, str) and at >= week_ago:
            week_xp += minutes[key] * XP_PER_MINUTE
    return {"xp": xp, "week_xp": week_xp, "lessons": lessons,
            "streak": current_streak(p.days), "badges": len(p.badges)}


@router.get("/api/leaderboard")
def leaderboard(user: dict = Depends(current_user)):
    """Students ranked by XP (all time and the last 7 days). Only display names are shown."""
    with closing(connect()) as conn:
        minutes = lesson_minutes(conn)
        rows = conn.execute(
            "SELECT users.id, users.display_name, users.username, progress.data FROM users"
            " LEFT JOIN progress ON progress.user_id = 'user:' || users.id WHERE users.role = 'student'"
        ).fetchall()
    entries = []
    for uid, name, username, data in rows:
        stats = student_stats(Progress.model_validate_json(data) if data else Progress(), minutes)
        entries.append({"name": name or username, "is_me": uid == user["id"], **stats})

    def ranked(field: str) -> list[dict]:
        order = sorted(entries, key=lambda e: (-e[field], -e["lessons"], e["name"].lower()))
        out, prev, rank = [], None, 0
        for i, e in enumerate(order, 1):
            if e[field] != prev:
                rank, prev = i, e[field]
            out.append({**e, "rank": rank})
        return out

    return {"all_time": ranked("xp")[:100], "this_week": ranked("week_xp")[:100], "students": len(entries)}

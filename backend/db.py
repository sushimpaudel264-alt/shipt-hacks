"""SQLite storage: schema, migrations and first-run seeding of the course catalog."""
import json
import os
import sqlite3
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path

import settings  # noqa: F401  (loads backend/.env before anything reads the environment)

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = Path(os.getenv("DATABASE_PATH", BASE_DIR / "data" / "progress.db"))
SEED_FILE = BASE_DIR / "data" / "seed_courses.json"

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
);
-- One row per account, keyed "user:<id>"; data is a JSON progress document.
CREATE TABLE IF NOT EXISTS progress (
    user_id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
-- Administrators edit `draft`; publishing copies it to `published` and bumps `version`,
-- which is how downloaded copies know an update is available.
CREATE TABLE IF NOT EXISTS courses (
    id TEXT PRIMARY KEY,
    draft TEXT NOT NULL,
    published TEXT,
    version INTEGER NOT NULL DEFAULT 0,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    published_at TEXT
);
"""

# Columns added after the first release; added to existing databases on startup.
USER_COLUMNS = {
    "display_name": "TEXT NOT NULL DEFAULT ''",
    "role": "TEXT NOT NULL DEFAULT 'student'",  # 'student', 'admin' or 'superuser'
    "title": "TEXT NOT NULL DEFAULT 'Student'",  # Student, Teacher, Ed Farm Contributor, ...
}


def now() -> datetime:
    return datetime.now(timezone.utc)


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with closing(connect()) as conn, conn:
        conn.executescript(SCHEMA)
        existing = {row[1] for row in conn.execute("PRAGMA table_info(users)")}
        for name, ddl in USER_COLUMNS.items():
            if name not in existing:
                conn.execute(f"ALTER TABLE users ADD COLUMN {name} {ddl}")
        conn.execute("UPDATE users SET display_name = username WHERE display_name = ''")
        if not conn.execute("SELECT 1 FROM courses LIMIT 1").fetchone() and SEED_FILE.exists():
            seed_courses(conn)


def seed_courses(conn: sqlite3.Connection) -> None:
    """Load the starter catalog as published courses (first run only)."""
    with open(SEED_FILE, encoding="utf-8") as f:
        courses = json.load(f)
    stamp = now().isoformat()
    for course in courses:
        data = json.dumps(course["content"], ensure_ascii=False)
        conn.execute(
            "INSERT INTO courses (id, draft, published, version, created_at, updated_at, published_at)"
            " VALUES (?, ?, ?, 1, ?, ?, ?)",
            (course["id"], data, data, stamp, stamp, stamp),
        )

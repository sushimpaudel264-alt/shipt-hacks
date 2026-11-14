"""Accounts, roles and sessions.

Passwords are hashed with scrypt. Logging in returns a random session token that the
frontend sends back as "Authorization: Bearer <token>"; only its SHA-256 is stored.

Roles: everyone who signs up as a Student can only study. The other titles (Teacher,
Ed Farm Contributor, ...) are administrators who can create and publish courses. Anyone
can choose an administrator role when signing up (no access code).

The superuser (role 'superuser') can do everything an administrator can. It cannot be
created by signing up: the server creates it on startup from SUPERUSER_USERNAME and
SUPERUSER_PASSWORD in backend/.env, and keeps its password in step with that file.
"""
import hashlib
import hmac
import logging
import os
import secrets
import sqlite3
from contextlib import closing
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field

from db import connect, now

SESSION_DAYS = 30
STUDENT = "Student"
ADMIN_TITLES = ["Teacher", "Ed Farm Contributor", "School Administrator", "Community Partner", "Volunteer Mentor"]
SUPERUSER_TITLE = "Superuser"
STAFF_ROLES = ("admin", "superuser")

router = APIRouter(prefix="/api/auth", tags=["auth"])
bearer = HTTPBearer(auto_error=False)


class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=32, pattern=r"^[A-Za-z0-9_.-]+$")
    password: str = Field(min_length=8, max_length=128)
    display_name: str = Field(min_length=1, max_length=60)
    title: str = STUDENT


class LoginRequest(BaseModel):
    username: str = Field(max_length=32)
    password: str = Field(max_length=128)


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1)
    return f"scrypt${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    _, salt_hex, digest_hex = stored.split("$")
    digest = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt_hex), n=2**14, r=8, p=1)
    return hmac.compare_digest(digest.hex(), digest_hex)


# Checked when the username doesn't exist, so a failed login takes the same time either way.
DUMMY_HASH = hash_password(secrets.token_hex(16))


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def public_user(row) -> dict:
    """(id, username, display_name, role, title) -> what the frontend sees."""
    return {"username": row[1], "display_name": row[2] or row[1], "role": row[3], "title": row[4]}


def start_session(conn: sqlite3.Connection, user_row) -> dict:
    token = secrets.token_urlsafe(32)
    conn.execute("DELETE FROM sessions WHERE expires_at < ?", (now().isoformat(),))
    conn.execute(
        "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
        (hash_token(token), user_row[0], (now() + timedelta(days=SESSION_DAYS)).isoformat()),
    )
    return {"token": token, "user": public_user(user_row)}


USER_COLS = "users.id, users.username, users.display_name, users.role, users.title"


def current_user(creds: HTTPAuthorizationCredentials | None = Depends(bearer)) -> dict:
    if creds is None:
        raise HTTPException(status_code=401, detail="Not logged in")
    token_hash = hash_token(creds.credentials)
    with closing(connect()) as conn:
        row = conn.execute(
            f"SELECT {USER_COLS} FROM sessions JOIN users ON users.id = sessions.user_id"
            " WHERE sessions.token_hash = ? AND sessions.expires_at > ?",
            (token_hash, now().isoformat()),
        ).fetchone()
    if not row:
        raise HTTPException(status_code=401, detail="Session expired. Please log in again.")
    return {"id": row[0], **public_user(row), "token_hash": token_hash}


def require_admin(user: dict = Depends(current_user)) -> dict:
    if user["role"] not in STAFF_ROLES:
        raise HTTPException(status_code=403, detail="Only administrators can manage courses")
    return user


def ensure_superuser() -> str | None:
    """Create or update the superuser from backend/.env. Returns a problem message, if any."""
    username = os.getenv("SUPERUSER_USERNAME", "").strip()
    password = os.getenv("SUPERUSER_PASSWORD", "")
    if not username and not password:
        return None
    if not username or len(password) < 12:
        return "SUPERUSER_USERNAME and SUPERUSER_PASSWORD (12+ characters) must both be set; superuser not created"
    with closing(connect()) as conn, conn:
        # Renaming the superuser must not leave the old account with full access.
        retired = conn.execute(
            "SELECT id, username FROM users WHERE role = 'superuser' AND username != ? COLLATE NOCASE", (username,)
        ).fetchall()
        for old_id, old_name in retired:
            conn.execute("DELETE FROM progress WHERE user_id = ?", (f"user:{old_id}",))
            conn.execute("DELETE FROM users WHERE id = ?", (old_id,))  # sessions go with it
            logging.getLogger("uvicorn.error").info("Removed previous superuser account %r", old_name)
        row = conn.execute("SELECT id, role, password_hash FROM users WHERE username = ?", (username,)).fetchone()
        if row is None:
            conn.execute(
                "INSERT INTO users (username, password_hash, created_at, display_name, role, title)"
                " VALUES (?, ?, ?, ?, 'superuser', ?)",
                (username, hash_password(password), now().isoformat(), "Superuser", SUPERUSER_TITLE),
            )
        elif row[1] != "superuser":
            # Never take over an account someone signed up with.
            return f"SUPERUSER_USERNAME {username!r} belongs to an existing {row[1]} account; choose another username"
        elif not verify_password(password, row[2]):
            # Password changed in .env: apply it and sign out every old session.
            conn.execute("UPDATE users SET password_hash = ? WHERE id = ?", (hash_password(password), row[0]))
            conn.execute("DELETE FROM sessions WHERE user_id = ?", (row[0],))
    return None


@router.get("/roles")
def roles():
    return {"student": STUDENT, "admin": ADMIN_TITLES}


@router.post("/register")
def register(body: RegisterRequest):
    if body.title != STUDENT and body.title not in ADMIN_TITLES:
        raise HTTPException(status_code=422, detail="Unknown role")
    role = "student" if body.title == STUDENT else "admin"
    with closing(connect()) as conn, conn:
        try:
            cur = conn.execute(
                "INSERT INTO users (username, password_hash, created_at, display_name, role, title)"
                " VALUES (?, ?, ?, ?, ?, ?)",
                (body.username, hash_password(body.password), now().isoformat(),
                 body.display_name.strip(), role, body.title),
            )
        except sqlite3.IntegrityError:
            raise HTTPException(status_code=409, detail="That username is taken")
        return start_session(conn, (cur.lastrowid, body.username, body.display_name.strip(), role, body.title))


@router.post("/login")
def login(body: LoginRequest):
    with closing(connect()) as conn, conn:
        row = conn.execute(
            f"SELECT {USER_COLS}, users.password_hash FROM users WHERE username = ?", (body.username,)
        ).fetchone()
        password_ok = verify_password(body.password, row[5] if row else DUMMY_HASH)
        if not row or not password_ok:
            raise HTTPException(status_code=401, detail="Wrong username or password")
        return start_session(conn, row[:5])


@router.post("/logout")
def logout(user: dict = Depends(current_user)):
    with closing(connect()) as conn, conn:
        conn.execute("DELETE FROM sessions WHERE token_hash = ?", (user["token_hash"],))
    return {"ok": True}


@router.get("/me")
def me(user: dict = Depends(current_user)):
    return {k: user[k] for k in ("username", "display_name", "role", "title")}

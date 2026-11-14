"""Courses: the student catalog plus the administrator draft / publish workflow.

A course is one JSON document (CourseContent) holding its details and an ordered list
of items. Item types:
  lesson  reading with a Markdown body, marked complete by the student
  quiz    multiple-choice questions, graded in the browser
  code    coding activity (HTML or JavaScript) with automatic checks
  task    hands-on activity: instructions plus a short written response

Everything a course needs (including quiz answers and code solutions) is in that one
document, so a downloaded course works with no connection at all.
"""
import json
import re
import secrets
import sqlite3
from contextlib import closing
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator, model_validator

from auth import current_user, require_admin
from db import connect, now

MAX_COURSE_BYTES = 3_000_000

Subject = Literal["coding", "math", "science", "other"]
Difficulty = Literal["beginner", "intermediate", "advanced"]


class Check(BaseModel):
    label: str = Field("", max_length=200)
    test: str = Field("", max_length=2000)


class Question(BaseModel):
    prompt: str = Field("", max_length=1000)
    choices: list[str] = Field(default_factory=list, max_length=8)
    answer: int = Field(0, ge=0)
    explanation: str = Field("", max_length=1000)


class Item(BaseModel):
    id: str = Field(pattern=r"^[a-z0-9-]{1,64}$")
    type: Literal["lesson", "quiz", "code", "task"]
    title: str = Field("", max_length=120)
    minutes: int = Field(5, ge=1, le=600)
    body: str = Field("", max_length=30000)
    task: str = Field("", max_length=5000)
    lang: Literal["html", "js"] = "js"
    starter: str = Field("", max_length=30000)
    solution: str = Field("", max_length=30000)
    hint: str = Field("", max_length=2000)
    checks: list[Check] = Field(default_factory=list, max_length=30)
    questions: list[Question] = Field(default_factory=list, max_length=50)


class CourseContent(BaseModel):
    title: str = Field("", max_length=120)
    description: str = Field("", max_length=2000)
    subject: Subject = "coding"
    difficulty: Difficulty = "beginner"
    icon: str = Field("📘", max_length=16)
    thumbnail: str = Field("", max_length=500_000)  # data:image/... URL (resized in the browser) or https URL
    items: list[Item] = Field(default_factory=list, max_length=200)

    @field_validator("thumbnail")
    @classmethod
    def thumbnail_is_image(cls, v: str) -> str:
        if v and not re.match(r"^(data:image/(png|jpeg|webp|gif);base64,|https://)", v):
            raise ValueError("thumbnail must be an uploaded image or an https:// URL")
        return v

    @model_validator(mode="after")
    def unique_item_ids(self):
        ids = [item.id for item in self.items]
        if len(ids) != len(set(ids)):
            raise ValueError("item ids must be unique within a course")
        return self


def publish_problems(c: CourseContent) -> list[str]:
    """What still needs fixing before a draft can be published (drafts may be incomplete)."""
    problems = []
    if not c.title.strip():
        problems.append("Add a course title")
    if not c.description.strip():
        problems.append("Add a course description")
    if not c.items:
        problems.append("Add at least one lesson, quiz or activity")
    for n, item in enumerate(c.items, 1):
        name = f'Item {n} ("{item.title.strip()}")' if item.title.strip() else f"Item {n}"
        if not item.title.strip():
            problems.append(f"{name}: add a title")
        if item.type == "lesson" and not item.body.strip():
            problems.append(f"{name}: add the lesson text")
        elif item.type == "quiz":
            if not item.questions:
                problems.append(f"{name}: add at least one question")
            for q_n, q in enumerate(item.questions, 1):
                filled = [ch for ch in q.choices if ch.strip()]
                if not q.prompt.strip():
                    problems.append(f"{name}, question {q_n}: add the question")
                if len(filled) < 2 or len(filled) != len(q.choices):
                    problems.append(f"{name}, question {q_n}: give it at least two answer choices, none blank")
                if q.answer >= len(q.choices):
                    problems.append(f"{name}, question {q_n}: mark the correct answer")
        elif item.type == "code":
            if not item.task.strip():
                problems.append(f"{name}: describe the task")
            if not item.checks or any(not ch.label.strip() or not ch.test.strip() for ch in item.checks):
                problems.append(f"{name}: add at least one check, each with a label and a test")
        elif item.type == "task" and not (item.body.strip() or item.task.strip()):
            problems.append(f"{name}: add instructions")
    return problems


def outline(content: dict) -> list[dict]:
    return [{k: item[k] for k in ("id", "type", "title", "minutes")} for item in content["items"]]


def summary(row, content: dict) -> dict:
    """Catalog card: everything except the item bodies."""
    items = outline(content)
    return {
        "id": row["id"],
        "version": row["version"],
        "published_at": row["published_at"],
        **{k: content[k] for k in ("title", "description", "subject", "difficulty", "icon", "thumbnail")},
        "items": items,
        "minutes": sum(i["minutes"] for i in items),
        "size": len(row["published"].encode()),
    }


def get_row(conn, course_id: str):
    conn.row_factory = sqlite3.Row
    row = conn.execute("SELECT * FROM courses WHERE id = ?", (course_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Course not found")
    return row


def serialize(content: CourseContent) -> str:
    data = content.model_dump_json()
    if len(data.encode()) > MAX_COURSE_BYTES:
        raise HTTPException(status_code=413, detail="This course is too large. Try a smaller thumbnail image.")
    return data


def slugify(title: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")[:40] or "course"
    return f"{base}-{secrets.token_hex(3)}"


# ---------- Student catalog ----------

router = APIRouter(tags=["courses"])


@router.get("/api/courses")
def list_courses(user: dict = Depends(current_user)):
    """Published courses with their outlines (no lesson bodies)."""
    with closing(connect()) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute("SELECT * FROM courses WHERE published IS NOT NULL ORDER BY created_at, rowid").fetchall()
    return [summary(row, json.loads(row["published"])) for row in rows]


@router.get("/api/courses/{course_id}")
def get_course(course_id: str, user: dict = Depends(current_user)):
    """A full published course: what gets downloaded for offline use."""
    with closing(connect()) as conn:
        row = get_row(conn, course_id)
    if row["published"] is None:
        raise HTTPException(status_code=404, detail="Course not found")
    return {"id": row["id"], "version": row["version"], "published_at": row["published_at"],
            **json.loads(row["published"])}


# ---------- Administrator course management ----------

admin = APIRouter(prefix="/api/admin/courses", tags=["admin"], dependencies=[Depends(require_admin)])


def admin_view(row) -> dict:
    draft = json.loads(row["draft"])
    return {
        "id": row["id"],
        "version": row["version"],
        "status": "published" if row["published"] is not None else "draft",
        "has_unpublished_changes": row["published"] is not None and row["draft"] != row["published"],
        "updated_at": row["updated_at"],
        "published_at": row["published_at"],
        "updated_by": row["updated_by_name"] if "updated_by_name" in row.keys() else None,
        "content": draft,
    }


@admin.get("")
def admin_list():
    with closing(connect()) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            "SELECT courses.*, users.display_name AS updated_by_name FROM courses"
            " LEFT JOIN users ON users.id = courses.updated_by ORDER BY courses.updated_at DESC"
        ).fetchall()
    out = []
    for row in rows:
        view = admin_view(row)
        content = view.pop("content")
        view.update({k: content[k] for k in ("title", "subject", "difficulty", "icon", "thumbnail")})
        view["items"] = len(content["items"])
        out.append(view)
    return out


@admin.post("")
def admin_create(content: CourseContent, user: dict = Depends(current_user)):
    course_id = slugify(content.title)
    stamp = now().isoformat()
    with closing(connect()) as conn, conn:
        conn.execute(
            "INSERT INTO courses (id, draft, version, created_by, updated_by, created_at, updated_at)"
            " VALUES (?, ?, 0, ?, ?, ?, ?)",
            (course_id, serialize(content), user["id"], user["id"], stamp, stamp),
        )
        return admin_view(get_row(conn, course_id))


@admin.get("/{course_id}")
def admin_get(course_id: str):
    with closing(connect()) as conn:
        return admin_view(get_row(conn, course_id))


@admin.put("/{course_id}")
def admin_save_draft(course_id: str, content: CourseContent, user: dict = Depends(current_user)):
    with closing(connect()) as conn, conn:
        get_row(conn, course_id)
        conn.execute(
            "UPDATE courses SET draft = ?, updated_by = ?, updated_at = ? WHERE id = ?",
            (serialize(content), user["id"], now().isoformat(), course_id),
        )
        return admin_view(get_row(conn, course_id))


@admin.post("/{course_id}/publish")
def admin_publish(course_id: str, user: dict = Depends(current_user)):
    with closing(connect()) as conn, conn:
        row = get_row(conn, course_id)
        content = CourseContent.model_validate_json(row["draft"])
        problems = publish_problems(content)
        if problems:
            raise HTTPException(status_code=422, detail="Fix these before publishing:\n• " + "\n• ".join(problems))
        if row["published"] == row["draft"]:
            return admin_view(row)  # nothing new to publish
        stamp = now().isoformat()
        conn.execute(
            "UPDATE courses SET published = draft, version = version + 1, published_at = ?,"
            " updated_by = ?, updated_at = ? WHERE id = ?",
            (stamp, user["id"], stamp, course_id),
        )
        return admin_view(get_row(conn, course_id))


@admin.post("/{course_id}/unpublish")
def admin_unpublish(course_id: str, user: dict = Depends(current_user)):
    with closing(connect()) as conn, conn:
        get_row(conn, course_id)
        conn.execute(
            "UPDATE courses SET published = NULL, updated_by = ?, updated_at = ? WHERE id = ?",
            (user["id"], now().isoformat(), course_id),
        )
        return admin_view(get_row(conn, course_id))


@admin.delete("/{course_id}")
def admin_delete(course_id: str):
    with closing(connect()) as conn, conn:
        get_row(conn, course_id)
        conn.execute("DELETE FROM courses WHERE id = ?", (course_id,))
    return {"ok": True}

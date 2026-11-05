"""Learning progress: a small writable SQLite database, separate from the read-only content DB.

Progress belongs to the logged-in user. Traefik's basic auth passes the Authorization header
through, so the username comes from it (falling back to "me" in local development).
"""

from __future__ import annotations

import base64
import json
import os
import sqlite3
import time
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

DB_PATH = Path(os.environ.get("PROGRESS_DB", Path(__file__).resolve().parents[1] / "progress.db"))
KINDS = {"visit", "experiment", "interview", "check", "done"}

SCHEMA = """
CREATE TABLE IF NOT EXISTS marks (
  user TEXT NOT NULL, module TEXT NOT NULL, kind TEXT NOT NULL, item INTEGER NOT NULL,
  value INTEGER NOT NULL, updated_at REAL NOT NULL,
  PRIMARY KEY (user, module, kind, item)
);
CREATE TABLE IF NOT EXISTS entries (
  user TEXT NOT NULL, module TEXT NOT NULL, kind TEXT NOT NULL, item INTEGER NOT NULL,
  text TEXT NOT NULL DEFAULT '', rating TEXT, updated_at REAL NOT NULL,
  PRIMARY KEY (user, module, kind, item)
);
CREATE TABLE IF NOT EXISTS activity (
  user TEXT NOT NULL, day TEXT NOT NULL, actions INTEGER NOT NULL,
  PRIMARY KEY (user, day)
);
"""

router = APIRouter(prefix="/api/progress")


def connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(DB_PATH)
    con.executescript(SCHEMA)
    return con


def user_of(request: Request) -> str:
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("basic "):
        try:
            return base64.b64decode(auth[6:]).decode().split(":", 1)[0] or "me"
        except Exception:  # noqa: BLE001 - a malformed header just means anonymous
            return "me"
    return "me"


class Mark(BaseModel):
    kind: str
    item: int = Field(default=0, ge=0, le=999)
    value: bool = True


@router.get("")
def get_progress(request: Request):
    """Everything marked by this user, per module, plus activity per day."""
    user = user_of(request)
    with connect() as con:
        rows = con.execute("SELECT module, kind, item, updated_at FROM marks WHERE user = ? AND value = 1", (user,)).fetchall()
        days = dict(con.execute("SELECT day, actions FROM activity WHERE user = ?", (user,)).fetchall())
        ratings = con.execute(
            "SELECT rating, count(*) FROM entries WHERE user = ? AND kind = 'prediction' AND text != '' GROUP BY rating", (user,)
        ).fetchall()
    modules: dict[str, dict] = {}
    for module, kind, item, ts in rows:
        m = modules.setdefault(module, {"experiment": [], "interview": [], "check": [], "done": False, "visited": None})
        if kind == "done":
            m["done"] = True
        elif kind == "visit":
            m["visited"] = ts
        else:
            m[kind].append(item)
    made = {r or "unrated": n for r, n in ratings}
    predictions = {"made": sum(made.values()), "right": made.get("right", 0), "partly": made.get("partly", 0), "wrong": made.get("wrong", 0)}
    return {"user": user, "modules": modules, "days": days, "predictions": predictions}


@router.put("/{module}")
def put_mark(module: str, mark: Mark, request: Request):
    if mark.kind not in KINDS:
        raise HTTPException(422, f"unknown kind {mark.kind!r}")
    if len(module) > 80:
        raise HTTPException(422, "module slug too long")
    user = user_of(request)
    now = time.time()
    day = time.strftime("%Y-%m-%d", time.gmtime(now))
    with connect() as con:
        con.execute(
            "INSERT INTO marks VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (user, module, kind, item) "
            "DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
            (user, module, mark.kind, mark.item, int(mark.value), now),
        )
        # visits alone don't count as study activity; ticking things does
        if mark.kind != "visit" and mark.value:
            con.execute(
                "INSERT INTO activity VALUES (?, ?, 1) ON CONFLICT (user, day) DO UPDATE SET actions = actions + 1",
                (user, day),
            )
    return {"ok": True}


class Entry(BaseModel):
    kind: Literal["note", "prediction"]
    item: int = Field(default=0, ge=0, le=999)
    text: str = Field(default="", max_length=20_000)
    rating: Literal["right", "partly", "wrong"] | None = None


@router.get("/{module}/entries")
def get_entries(module: str, request: Request):
    """This user's notes and experiment predictions for one module."""
    with connect() as con:
        rows = con.execute(
            "SELECT kind, item, text, rating FROM entries WHERE user = ? AND module = ?", (user_of(request), module)
        ).fetchall()
    note = next((t for k, _, t, _ in rows if k == "note"), "")
    predictions = {str(i): {"text": t, "rating": r} for k, i, t, r in rows if k == "prediction"}
    return {"note": note, "predictions": predictions}


@router.put("/{module}/entries")
def put_entry(module: str, entry: Entry, request: Request):
    if len(module) > 80:
        raise HTTPException(422, "module slug too long")
    user = user_of(request)
    now = time.time()
    with connect() as con:
        con.execute(
            "INSERT INTO entries VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (user, module, kind, item) "
            "DO UPDATE SET text = excluded.text, rating = excluded.rating, updated_at = excluded.updated_at",
            (user, module, entry.kind, entry.item, entry.text, entry.rating, now),
        )
        if entry.kind == "prediction" and entry.text and entry.rating is None:
            day = time.strftime("%Y-%m-%d", time.gmtime(now))
            con.execute("INSERT INTO activity VALUES (?, ?, 1) ON CONFLICT (user, day) DO UPDATE SET actions = actions + 1", (user, day))
    return {"ok": True}


@router.delete("")
def reset(request: Request):
    """Start over (used by the reset button on the progress panel)."""
    user = user_of(request)
    with connect() as con:
        con.execute("DELETE FROM marks WHERE user = ?", (user,))
        con.execute("DELETE FROM activity WHERE user = ?", (user,))
        # predictions are progress; personal notes are kept
        con.execute("DELETE FROM entries WHERE user = ? AND kind = 'prediction'", (user,))
    return {"ok": True}


def export(user: str) -> str:
    with connect() as con:
        return json.dumps(con.execute("SELECT * FROM marks WHERE user = ?", (user,)).fetchall())

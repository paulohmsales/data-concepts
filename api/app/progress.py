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
    modules: dict[str, dict] = {}
    for module, kind, item, ts in rows:
        m = modules.setdefault(module, {"experiment": [], "interview": [], "check": [], "done": False, "visited": None})
        if kind == "done":
            m["done"] = True
        elif kind == "visit":
            m["visited"] = ts
        else:
            m[kind].append(item)
    return {"user": user, "modules": modules, "days": days}


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


@router.delete("")
def reset(request: Request):
    """Start over (used by the reset button on the progress panel)."""
    user = user_of(request)
    with connect() as con:
        con.execute("DELETE FROM marks WHERE user = ?", (user,))
        con.execute("DELETE FROM activity WHERE user = ?", (user,))
    return {"ok": True}


def export(user: str) -> str:
    with connect() as con:
        return json.dumps(con.execute("SELECT * FROM marks WHERE user = ?", (user,)).fetchall())

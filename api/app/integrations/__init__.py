"""Integrations: run SQL on real cloud services with server-held credentials.

Config: one JSON file per provider in INTEGRATIONS_DIR (default /run/secrets/dc), e.g.
bigquery.json. Files are read on every request, so adding a key needs no restart.
Every run is logged in the progress database and counted against per-provider daily limits.
"""

from __future__ import annotations

import json
import os
import re
import sqlite3
import time
from datetime import date
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from ..progress import connect as progress_db
from ..progress import user_of as current_user
from .providers import REQUIRED, RUNNERS, ProviderError, Result, RunOptions

router = APIRouter()

DEFAULT_LIMITS = {"daily_queries": 200, "daily_bytes": 20 * 10**9, "timeout_s": 60, "max_rows": 500}


def config_dir() -> Path:
    return Path(os.environ.get("INTEGRATIONS_DIR", "/run/secrets/dc"))


def load_config(key: str) -> dict | None:
    f = config_dir() / f"{key}.json"
    if not f.is_file():
        return None
    try:
        return json.loads(f.read_text())
    except (OSError, json.JSONDecodeError):
        return {"_invalid": True}


def config_problem(key: str, cfg: dict | None) -> str | None:
    if cfg is None:
        return "not configured"
    if cfg.get("_invalid"):
        return "config file is not valid JSON"
    missing = [k for k in REQUIRED[key] if not cfg.get(k)]
    return f"missing fields: {', '.join(missing)}" if missing else None


def _ensure(db: sqlite3.Connection) -> None:
    db.execute(
        """create table if not exists integration_runs (
            id integer primary key, user text, provider text, sql text, started_at real,
            ms integer, rows integer, bytes integer, cost_usd real, status text, error text,
            query_id text, day text)"""
    )


def usage_today(db: sqlite3.Connection, provider: str) -> dict[str, Any]:
    _ensure(db)
    q, b, c = db.execute(
        "select count(*), coalesce(sum(bytes), 0), coalesce(sum(cost_usd), 0) from integration_runs where provider = ? and day = ?",
        (provider, date.today().isoformat()),
    ).fetchone()
    return {"queries": q, "bytes": b, "cost_usd": round(c, 4)}


def limits(cfg: dict | None) -> dict[str, int]:
    return {k: int((cfg or {}).get(k, v)) for k, v in DEFAULT_LIMITS.items()}


@router.get("/api/integrations/status")
def status() -> dict[str, Any]:
    out = {}
    with progress_db() as db:
        for key in RUNNERS:
            cfg = load_config(key)
            problem = config_problem(key, cfg)
            out[key] = {"configured": problem is None, "problem": problem, "limits": limits(cfg), "today": usage_today(db, key)}
    return out


class RunRequest(BaseModel):
    sql: str = Field(min_length=1, max_length=20_000)
    dry_run: bool = False


_MULTI = re.compile(r";\s*\S")


@router.post("/api/integrations/{key}/run")
def run(key: str, body: RunRequest, request: Request) -> dict[str, Any]:
    if key not in RUNNERS:
        raise HTTPException(404, "unknown provider")
    cfg = load_config(key)
    problem = config_problem(key, cfg)
    if problem:
        raise HTTPException(409, f"{key}: {problem}")
    assert cfg is not None
    sql = body.sql.strip().rstrip(";").strip()
    if _MULTI.search(sql):
        raise HTTPException(400, "one statement at a time, please")
    if body.dry_run and key != "bigquery":
        raise HTTPException(400, "dry runs are only supported on BigQuery")
    lim = limits(cfg)
    user = current_user(request)
    with progress_db() as db:
        used = usage_today(db, key)
        if used["queries"] >= lim["daily_queries"]:
            raise HTTPException(429, f"daily limit of {lim['daily_queries']} queries reached for {key}")
        if used["bytes"] >= lim["daily_bytes"]:
            raise HTTPException(429, f"daily scan budget of {lim['daily_bytes']:,} bytes reached for {key}")
    started = time.time()
    status_, error, res = "ok", None, None
    try:
        res = RUNNERS[key](cfg, sql, RunOptions(timeout_s=lim["timeout_s"], max_rows=lim["max_rows"], dry_run=body.dry_run))
    except ProviderError as e:
        status_, error = "error", str(e)
    except Exception as e:  # network, auth library, unexpected shapes: log and report, don't 500
        status_, error = "error", f"{type(e).__name__}: {e}"
    with progress_db() as db:
        _ensure(db)
        db.execute(
            "insert into integration_runs (user, provider, sql, started_at, ms, rows, bytes, cost_usd, status, error, query_id, day) values (?,?,?,?,?,?,?,?,?,?,?,?)",
            (
                user,
                key,
                sql if not body.dry_run else f"-- dry run\n{sql}",
                started,
                res.ms if res else int((time.time() - started) * 1000),
                len(res.rows) if res else 0,
                0 if body.dry_run else (res.bytes_scanned if res else 0) or 0,
                0 if body.dry_run else (res.cost_usd if res else 0) or 0,
                status_,
                error,
                res.query_id if res else None,
                date.today().isoformat(),
            ),
        )
    if error:
        raise HTTPException(422, error)
    assert isinstance(res, Result)
    return {
        "columns": res.columns,
        "rows": res.rows,
        "ms": res.ms,
        "bytes_scanned": res.bytes_scanned,
        "cost_usd": res.cost_usd,
        "query_id": res.query_id,
        "truncated": res.truncated,
        "stats": res.stats,
    }


@router.get("/api/integrations/{key}/history")
def history(key: str, request: Request) -> list[dict[str, Any]]:
    with progress_db() as db:
        _ensure(db)
        rows = db.execute(
            "select sql, started_at, ms, rows, bytes, cost_usd, status, error from integration_runs where provider = ? and user = ? order by id desc limit 30",
            (key, current_user(request)),
        ).fetchall()
    keys = ["sql", "started_at", "ms", "rows", "bytes", "cost_usd", "status", "error"]
    return [dict(zip(keys, r)) for r in rows]

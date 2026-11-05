"""Content API. Read-only: everything comes from the SQLite database built by app.seed."""

from __future__ import annotations

import json
import os
import sqlite3
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import JSONResponse

from . import progress, seed

DB_PATH = Path(os.environ.get("CONTENT_DB", seed.DEFAULT_DB))


@asynccontextmanager
async def lifespan(_: FastAPI):
    # in development, rebuild from content/ on every (re)start so edits show up
    if os.environ.get("SEED_ON_START") == "1" or not DB_PATH.exists():
        seed.build(seed.DEFAULT_CONTENT, DB_PATH)
    yield


app = FastAPI(title="data-concepts API", lifespan=lifespan, docs_url="/api/docs", openapi_url="/api/openapi.json")
app.include_router(progress.router)


def db() -> sqlite3.Connection:
    con = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True, check_same_thread=False)
    con.row_factory = sqlite3.Row
    return con


def rows(sql: str, *args) -> list[dict]:
    with db() as con:
        return [json.loads(r[0]) for r in con.execute(sql, args)]


def cached(data) -> JSONResponse:
    # content only changes on deploy; let browsers reuse it for a few minutes
    return JSONResponse(data, headers={"Cache-Control": "public, max-age=300"})


@app.get("/api/health")
def health():
    with db() as con:
        n = con.execute("SELECT count(*) FROM modules").fetchone()[0]
    return {"ok": True, "modules": n}


@app.get("/api/catalog")
def catalog():
    """Everything the navigation needs, in one request."""
    with db() as con:
        tracks = [dict(r) for r in con.execute("SELECT key, title, blurb, ord AS 'order' FROM tracks ORDER BY ord")]
    modules = rows("SELECT m.meta FROM modules m JOIN tracks t ON t.key = m.track WHERE m.status = 'live' ORDER BY t.ord, m.ord")
    roles = [{k: r[k] for k in ("key", "title")} for r in rows("SELECT body FROM roles")]
    return cached({"tracks": tracks, "modules": modules, "roles": roles})


@app.get("/api/modules/{slug}")
def module(slug: str):
    found = rows("SELECT body FROM modules WHERE slug = ?", slug)
    if not found:
        raise HTTPException(404, f"no module '{slug}'")
    return cached(found[0])


@app.get("/api/roles")
def roles():
    with db() as con:
        market = json.loads(con.execute("SELECT body FROM market").fetchone()[0])
    order = ["da", "ae", "de", "ds", "mle", "ai", "swe", "mgr"]
    rs = sorted(rows("SELECT body FROM roles"), key=lambda r: order.index(r["key"]))
    return cached({"roles": rs, "market": market})


@app.get("/api/platforms")
def platforms():
    return cached(
        {
            "providers": rows("SELECT body FROM providers"),
            "categories": rows("SELECT body FROM categories ORDER BY ord"),
            "services": rows("SELECT body FROM services ORDER BY id"),
            "dimensions": rows("SELECT body FROM dimensions ORDER BY ord"),
            "prices": rows("SELECT body FROM prices ORDER BY id"),
            "architectures": rows("SELECT body FROM architectures ORDER BY ord"),
        }
    )


@app.get("/api/search")
def search(q: str = Query(min_length=1, max_length=100)):
    # quote each term so FTS syntax characters in user input can't break the query
    terms = " ".join(f'"{t.replace(chr(34), "")}"*' for t in q.split() if t.strip())
    if not terms:
        return []
    with db() as con:
        res = con.execute(
            "SELECT kind, ref, title, snippet(search, 3, '[', ']', '…', 12) AS snippet FROM search "
            "WHERE search MATCH ? ORDER BY bm25(search, 0, 0, 5, 1) LIMIT 20",
            (terms,),
        )
        return [dict(r) for r in res]

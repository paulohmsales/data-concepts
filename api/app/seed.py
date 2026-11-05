"""Build the content database (SQLite) from the YAML files in content/.

    uv run python -m app.seed [content_dir] [db_path]

Validates every file against app.schema and checks references (tracks, related modules,
services' providers and categories). Fails loudly on the first problem.
"""

from __future__ import annotations

import json
import os
import sqlite3
import sys
from pathlib import Path

import yaml
from pydantic import TypeAdapter, ValidationError

from .schema import Market, Module, Platforms, Role, Track

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CONTENT = Path(os.environ.get("CONTENT_DIR", ROOT / "content"))
DEFAULT_DB = Path(os.environ.get("CONTENT_DB", Path(__file__).resolve().parents[1] / "content.db"))


class ContentError(Exception):
    pass


def _load(path: Path):
    try:
        with path.open(encoding="utf-8") as f:
            return yaml.safe_load(f)
    except yaml.YAMLError as e:
        raise ContentError(f"{path.name}: invalid YAML: {e}") from None


def _validate(adapter, data, where: str):
    try:
        return adapter.validate_python(data)
    except ValidationError as e:
        raise ContentError(f"{where}: {e}") from None


def load_content(content_dir: Path = DEFAULT_CONTENT) -> dict:
    tracks = _validate(TypeAdapter(list[Track]), _load(content_dir / "tracks.yaml"), "tracks.yaml")
    roles = _validate(TypeAdapter(list[Role]), _load(content_dir / "roles.yaml"), "roles.yaml")
    market = _validate(TypeAdapter(Market), _load(content_dir / "market.yaml"), "market.yaml")

    modules: list[Module] = []
    for f in sorted((content_dir / "modules").glob("*.yaml")):
        m = _validate(TypeAdapter(Module), _load(f), f"modules/{f.name}")
        if f.stem != m.slug:
            raise ContentError(f"modules/{f.name}: file name must match slug '{m.slug}'")
        modules.append(m)

    pdir = content_dir / "platforms"
    services = []
    for f in sorted((pdir / "services").glob("*.yaml")):
        services.extend(_load(f) or [])
    platforms = _validate(
        TypeAdapter(Platforms),
        {
            "providers": _load(pdir / "providers.yaml"),
            "categories": _load(pdir / "categories.yaml"),
            "services": services,
            "dimensions": _load(pdir / "dimensions.yaml"),
            "prices": _load(pdir / "prices.yaml"),
            "architectures": _load(pdir / "architectures.yaml"),
        },
        "platforms/",
    )

    _check_references(tracks, modules, platforms)
    return {"tracks": tracks, "roles": roles, "market": market, "modules": modules, "platforms": platforms}


def _check_references(tracks, modules, platforms) -> None:
    track_keys = {t.key for t in tracks}
    slugs = [m.slug for m in modules]
    if len(slugs) != len(set(slugs)):
        raise ContentError("duplicate module slugs")
    for m in modules:
        if m.track not in track_keys:
            raise ContentError(f"{m.slug}: unknown track '{m.track}'")
        for b in m.deep_dive:
            if b.type == "related":
                for s in b.slugs:
                    if s not in slugs:
                        raise ContentError(f"{m.slug}: related module '{s}' does not exist")
    pk = {p.key for p in platforms.providers}
    ck = {c.key for c in platforms.categories}
    for s in platforms.services:
        if s.provider not in pk:
            raise ContentError(f"service {s.name}: unknown provider '{s.provider}'")
        if s.category not in ck:
            raise ContentError(f"service {s.name}: unknown category '{s.category}'")
    for d in platforms.dimensions:
        missing = pk - set(d.values)
        if missing:
            raise ContentError(f"dimension {d.key}: no value for {sorted(missing)}")
    for p in platforms.prices:
        if p.provider not in pk:
            raise ContentError(f"price {p.item}: unknown provider '{p.provider}'")
    for a in platforms.architectures:
        for st in a.stages:
            if st.get("category") not in ck:
                raise ContentError(f"architecture {a.key}: unknown category '{st.get('category')}'")


def _text(blocks) -> str:
    """Flatten blocks to plain text for the search index."""
    out = []
    for b in blocks:
        d = b.model_dump()
        for k in ("md", "text", "title", "code", "caption"):
            if d.get(k):
                out.append(str(d[k]))
        for it in d.get("items", []) or []:
            out.append(f"{it['title']} {it['md']}")
        for st in d.get("steps", []) or []:
            out.append(f"{st['title']} {st['md']}")
    return "\n".join(out)


SCHEMA = """
CREATE TABLE tracks (key TEXT PRIMARY KEY, title TEXT, blurb TEXT, ord INTEGER);
CREATE TABLE modules (slug TEXT PRIMARY KEY, track TEXT REFERENCES tracks(key), ord INTEGER, status TEXT,
                      meta TEXT NOT NULL, body TEXT NOT NULL);
CREATE TABLE roles (key TEXT PRIMARY KEY, body TEXT NOT NULL);
CREATE TABLE market (id INTEGER PRIMARY KEY CHECK (id = 1), body TEXT NOT NULL);
CREATE TABLE market_demand (skill TEXT, role TEXT, pct INTEGER, PRIMARY KEY (skill, role));
CREATE TABLE providers (key TEXT PRIMARY KEY, body TEXT NOT NULL);
CREATE TABLE categories (key TEXT PRIMARY KEY, ord INTEGER, body TEXT NOT NULL);
CREATE TABLE services (id INTEGER PRIMARY KEY, provider TEXT REFERENCES providers(key),
                       category TEXT REFERENCES categories(key), name TEXT, body TEXT NOT NULL);
CREATE TABLE dimensions (key TEXT PRIMARY KEY, ord INTEGER, body TEXT NOT NULL);
CREATE TABLE prices (id INTEGER PRIMARY KEY, provider TEXT, body TEXT NOT NULL);
CREATE TABLE architectures (key TEXT PRIMARY KEY, ord INTEGER, body TEXT NOT NULL);
CREATE VIRTUAL TABLE search USING fts5(kind, ref, title, body, tokenize = 'porter unicode61');
"""


def build(content_dir: Path = DEFAULT_CONTENT, db_path: Path = DEFAULT_DB) -> dict:
    c = load_content(content_dir)
    tmp = db_path.with_suffix(".tmp")
    tmp.unlink(missing_ok=True)
    con = sqlite3.connect(tmp)
    con.executescript(SCHEMA)
    j = lambda m: json.dumps(m.model_dump(), ensure_ascii=False)  # noqa: E731

    for t in c["tracks"]:
        con.execute("INSERT INTO tracks VALUES (?, ?, ?, ?)", (t.key, t.title, t.blurb, t.order))
    for m in c["modules"]:
        meta = {k: getattr(m, k) for k in ("slug", "title", "track", "summary", "roles", "lab", "order", "status")}
        con.execute(
            "INSERT INTO modules VALUES (?, ?, ?, ?, ?, ?)",
            (m.slug, m.track, m.order, m.status, json.dumps(meta, ensure_ascii=False), j(m)),
        )
        body = "\n".join(
            [m.summary, m.intuition, _text(m.deep_dive)]
            + [f"{e.title} {e.goal} {e.why}" for e in m.experiments]
            + [f"{q.q} {q.answer}" for q in m.interview]
        )
        con.execute("INSERT INTO search VALUES ('module', ?, ?, ?)", (m.slug, m.title, body))
    for r in c["roles"]:
        con.execute("INSERT INTO roles VALUES (?, ?)", (r.key, j(r)))
    con.execute("INSERT INTO market VALUES (1, ?)", (j(c["market"]),))
    for skill, by in c["market"].demand.items():
        for role, pct in by.items():
            con.execute("INSERT INTO market_demand VALUES (?, ?, ?)", (skill, role, pct))

    p = c["platforms"]
    for pr in p.providers:
        con.execute("INSERT INTO providers VALUES (?, ?)", (pr.key, j(pr)))
    for cat in p.categories:
        con.execute("INSERT INTO categories VALUES (?, ?, ?)", (cat.key, cat.order, j(cat)))
    for s in p.services:
        con.execute("INSERT INTO services (provider, category, name, body) VALUES (?, ?, ?, ?)", (s.provider, s.category, s.name, j(s)))
        con.execute("INSERT INTO search VALUES ('service', ?, ?, ?)", (f"{s.provider}:{s.category}", s.name, f"{s.summary} {s.pricing}"))
    for i, d in enumerate(p.dimensions):
        con.execute("INSERT INTO dimensions VALUES (?, ?, ?)", (d.key, i, j(d)))
    for pp in p.prices:
        con.execute("INSERT INTO prices (provider, body) VALUES (?, ?)", (pp.provider, j(pp)))
    for i, a in enumerate(p.architectures):
        con.execute("INSERT INTO architectures VALUES (?, ?, ?)", (a.key, i, j(a)))

    con.commit()
    con.close()
    os.replace(tmp, db_path)
    return {"modules": len(c["modules"]), "services": len(p.services), "prices": len(p.prices)}


if __name__ == "__main__":
    content = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_CONTENT
    db = Path(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_DB
    try:
        print(build(content, db))
    except ContentError as e:
        sys.exit(f"content error: {e}")

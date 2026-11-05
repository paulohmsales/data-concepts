import os
import shutil
from pathlib import Path

import pytest
import yaml

from app import seed

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture(scope="session")
def client(tmp_path_factory):
    db = tmp_path_factory.mktemp("db") / "content.db"
    seed.build(ROOT / "content", db)
    os.environ["CONTENT_DB"] = str(db)
    import importlib

    from app import main

    importlib.reload(main)
    from fastapi.testclient import TestClient

    with TestClient(main.app) as c:
        yield c


def test_health(client):
    r = client.get("/api/health").json()
    assert r["ok"] and r["modules"] >= 24


def test_catalog_orders_modules_by_track(client):
    c = client.get("/api/catalog").json()
    tracks = [t["key"] for t in c["tracks"]]
    order = [tracks.index(m["track"]) for m in c["modules"]]
    assert order == sorted(order)
    assert {"slug", "title", "lab", "roles"} <= set(c["modules"][0])


def test_module_has_content(client):
    m = client.get("/api/modules/ab-testing").json()
    assert m["intuition"] and m["experiments"] and m["deep_dive"] and m["interview"] and m["check"]
    assert all(b["type"] for b in m["deep_dive"])
    assert client.get("/api/modules/nope").status_code == 404


def test_roles_and_market(client):
    r = client.get("/api/roles").json()
    assert [x["key"] for x in r["roles"]][:3] == ["da", "ae", "de"]
    assert r["market"]["demand"]["dbt"]["ae"] == 71


def test_platforms_cover_every_provider_and_category(client):
    p = client.get("/api/platforms").json()
    providers = {x["key"] for x in p["providers"]}
    assert providers == {"aws", "gcp", "azure", "snowflake", "databricks"}
    by = {(s["provider"], s["category"]) for s in p["services"]}
    for c in p["categories"]:
        for pr in providers:
            assert (pr, c["key"]) in by, f"no {pr} service for {c['key']}"
    assert all(d["values"].keys() == providers for d in p["dimensions"])


def test_search_finds_modules_and_services(client):
    hits = client.get("/api/search", params={"q": "watermark"}).json()
    assert any(h["ref"] == "snapshots" for h in hits)
    hits = client.get("/api/search", params={"q": "Iceberg"}).json()
    assert any(h["kind"] == "service" for h in hits)
    # FTS syntax in user input must not crash
    assert client.get("/api/search", params={"q": 'a" OR (b'}).status_code == 200


def test_bad_reference_fails_the_build(tmp_path):
    bad = tmp_path / "content"
    shutil.copytree(ROOT / "content", bad)
    f = bad / "modules" / "clt.yaml"
    doc = yaml.safe_load(f.read_text())
    doc["deep_dive"] = [{"type": "related", "slugs": ["does-not-exist"]}]
    f.write_text(yaml.safe_dump(doc, allow_unicode=True))
    with pytest.raises(seed.ContentError, match="does-not-exist"):
        seed.build(bad, tmp_path / "x.db")


def test_unknown_block_type_fails(tmp_path):
    bad = tmp_path / "content"
    shutil.copytree(ROOT / "content", bad)
    f = bad / "modules" / "clt.yaml"
    doc = yaml.safe_load(f.read_text())
    doc["deep_dive"] = [{"type": "video", "url": "x"}]
    f.write_text(yaml.safe_dump(doc, allow_unicode=True))
    with pytest.raises(seed.ContentError):
        seed.build(bad, tmp_path / "x.db")

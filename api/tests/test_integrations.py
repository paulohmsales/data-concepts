import base64
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture()
def client(tmp_path, monkeypatch):
    from app import integrations, main, progress, seed
    from app.integrations import providers

    db = tmp_path / "content.db"
    seed.build(ROOT / "content", db)
    monkeypatch.setattr(main, "DB_PATH", db)
    monkeypatch.setattr(progress, "DB_PATH", tmp_path / "progress.db")
    cfg = tmp_path / "secrets"
    cfg.mkdir()
    monkeypatch.setenv("INTEGRATIONS_DIR", str(cfg))

    calls = []

    def fake(conf, sql, opt):
        calls.append((conf, sql, opt))
        if "boom" in sql:
            raise providers.ProviderError("permission denied")
        return providers.Result(columns=["n"], rows=[[1], [2]], ms=12, bytes_scanned=10_000_000, cost_usd=0.00006, query_id="q1")

    monkeypatch.setitem(integrations.RUNNERS, "athena", fake)
    with TestClient(main.app) as c:
        c.cfg_dir = cfg  # type: ignore[attr-defined]
        c.calls = calls  # type: ignore[attr-defined]
        yield c


def auth(user: str = "ana") -> dict:
    return {"Authorization": "Basic " + base64.b64encode(f"{user}:pw".encode()).decode()}


def configure(client, **extra):
    base = {"access_key_id": "AKIA", "secret_access_key": "s", "region": "us-east-1", "workgroup": "dc-lab"}
    (client.cfg_dir / "athena.json").write_text(json.dumps({**base, **extra}))


def test_content_lists_all_providers_with_recipes(client):
    data = client.get("/api/integrations").json()
    assert [p["key"] for p in data] == ["bigquery", "snowflake", "athena", "databricks"]
    assert all(p["recipes"] and p["setup"] for p in data)


def test_status_reports_missing_and_incomplete_config(client):
    s = client.get("/api/integrations/status").json()
    assert s["athena"]["configured"] is False and s["athena"]["problem"] == "not configured"
    (client.cfg_dir / "athena.json").write_text(json.dumps({"access_key_id": "x"}))
    s = client.get("/api/integrations/status").json()
    assert "missing fields" in s["athena"]["problem"]
    (client.cfg_dir / "athena.json").write_text("{not json")
    assert client.get("/api/integrations/status").json()["athena"]["problem"] == "config file is not valid JSON"


def test_run_requires_configuration(client):
    r = client.post("/api/integrations/athena/run", json={"sql": "select 1"}, headers=auth())
    assert r.status_code == 409


def test_run_returns_rows_and_logs_usage(client):
    configure(client)
    r = client.post("/api/integrations/athena/run", json={"sql": "select 1;"}, headers=auth())
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["rows"] == [[1], [2]] and body["bytes_scanned"] == 10_000_000
    assert client.calls[0][1] == "select 1"  # trailing semicolon stripped
    today = client.get("/api/integrations/status").json()["athena"]["today"]
    assert today["queries"] == 1 and today["bytes"] == 10_000_000
    hist = client.get("/api/integrations/athena/history", headers=auth()).json()
    assert hist[0]["status"] == "ok"
    assert client.get("/api/integrations/athena/history", headers=auth("bruno")).json() == []


def test_provider_errors_are_reported_and_logged(client):
    configure(client)
    r = client.post("/api/integrations/athena/run", json={"sql": "select boom"}, headers=auth())
    assert r.status_code == 422 and "permission denied" in r.json()["detail"]
    assert client.get("/api/integrations/athena/history", headers=auth()).json()[0]["status"] == "error"


def test_daily_limits_and_single_statements(client):
    configure(client, daily_queries=2)
    assert client.post("/api/integrations/athena/run", json={"sql": "select 1; drop table x"}, headers=auth()).status_code == 400
    for _ in range(2):
        assert client.post("/api/integrations/athena/run", json={"sql": "select 1"}, headers=auth()).status_code == 200
    assert client.post("/api/integrations/athena/run", json={"sql": "select 1"}, headers=auth()).status_code == 429


def test_dry_run_only_on_bigquery(client):
    configure(client)
    r = client.post("/api/integrations/athena/run", json={"sql": "select 1", "dry_run": True}, headers=auth())
    assert r.status_code == 400


def test_snowflake_jwt_shape():
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    import jwt

    from app.integrations.providers import _snowflake_token

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()).decode()
    tok = _snowflake_token({"account": "myorg-myacct", "user": "lab_user", "private_key": pem})
    claims = jwt.decode(tok, key.public_key(), algorithms=["RS256"])
    assert claims["sub"] == "MYORG-MYACCT.LAB_USER"
    assert claims["iss"].startswith("MYORG-MYACCT.LAB_USER.SHA256:")


def test_comparisons_content(client):
    data = client.get("/api/integrations/comparisons").json()
    assert {c["id"] for c in data} == {"tpch-revenue", "noaa-tmax"}
    assert all(len(c["runs"]) >= 2 for c in data)

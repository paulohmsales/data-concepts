import base64
import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture()
def client(tmp_path, monkeypatch):
    from app import main, progress, seed

    db = tmp_path / "content.db"
    seed.build(ROOT / "content", db)
    monkeypatch.setattr(main, "DB_PATH", db)
    monkeypatch.setattr(progress, "DB_PATH", tmp_path / "progress.db")
    with TestClient(main.app) as c:
        yield c


def auth(user: str) -> dict:
    return {"Authorization": "Basic " + base64.b64encode(f"{user}:pw".encode()).decode()}


def test_marks_round_trip_per_user(client):
    assert client.put("/api/progress/rag", json={"kind": "experiment", "item": 2}, headers=auth("ana")).status_code == 200
    client.put("/api/progress/rag", json={"kind": "done"}, headers=auth("ana"))
    me = client.get("/api/progress", headers=auth("ana")).json()
    assert me["modules"]["rag"]["experiment"] == [2]
    assert me["modules"]["rag"]["done"] is True
    assert sum(me["days"].values()) == 2
    # another user sees nothing
    assert client.get("/api/progress", headers=auth("bruno")).json()["modules"] == {}


def test_unticking_and_reset(client):
    client.put("/api/progress/clt", json={"kind": "interview", "item": 0}, headers=auth("ana"))
    client.put("/api/progress/clt", json={"kind": "interview", "item": 0, "value": False}, headers=auth("ana"))
    assert client.get("/api/progress", headers=auth("ana")).json()["modules"] == {}
    client.put("/api/progress/clt", json={"kind": "check", "item": 1}, headers=auth("ana"))
    client.delete("/api/progress", headers=auth("ana"))
    assert client.get("/api/progress", headers=auth("ana")).json() == {"user": "ana", "modules": {}, "days": {}}


def test_rejects_unknown_kinds(client):
    assert client.put("/api/progress/clt", json={"kind": "hack"}).status_code == 422

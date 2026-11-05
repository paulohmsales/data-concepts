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
    assert client.get("/api/progress", headers=auth("ana")).json() == {"user": "ana", "modules": {}, "days": {}, "predictions": {"made": 0, "right": 0, "partly": 0, "wrong": 0}}


def test_rejects_unknown_kinds(client):
    assert client.put("/api/progress/clt", json={"kind": "hack"}).status_code == 422


def test_entries_notes_and_predictions(client):
    h = auth("ana")
    assert client.get("/api/progress/rag/entries", headers=h).json() == {"note": "", "predictions": {}}
    client.put("/api/progress/rag/entries", json={"kind": "note", "text": "BM25 misses synonyms"}, headers=h)
    client.put("/api/progress/rag/entries", json={"kind": "prediction", "item": 1, "text": "recall drops"}, headers=h)
    client.put("/api/progress/rag/entries", json={"kind": "prediction", "item": 1, "text": "recall drops", "rating": "partly"}, headers=h)
    e = client.get("/api/progress/rag/entries", headers=h).json()
    assert e["note"] == "BM25 misses synonyms"
    assert e["predictions"]["1"] == {"text": "recall drops", "rating": "partly"}
    assert client.get("/api/progress", headers=h).json()["predictions"] == {"made": 1, "right": 0, "partly": 1, "wrong": 0}
    # other users see nothing; reset clears predictions but keeps notes
    assert client.get("/api/progress/rag/entries", headers=auth("bruno")).json()["note"] == ""
    client.delete("/api/progress", headers=h)
    e = client.get("/api/progress/rag/entries", headers=h).json()
    assert e["note"] == "BM25 misses synonyms" and e["predictions"] == {}
    assert client.put("/api/progress/rag/entries", json={"kind": "prediction", "rating": "maybe"}, headers=h).status_code == 422

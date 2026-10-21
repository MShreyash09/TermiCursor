"""Session history: ws events are stored in order (minus transient tokens) and served back for replay."""
import os
import sqlite3
import sys

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi.testclient import TestClient

from core.persistence import db


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", str(tmp_path / "agent.db"))
    db.init_db()
    import server

    class FakeLoop:
        def __init__(self, session): pass

        async def run(self):
            yield {"type": "mode", "mode": "simple"}
            yield {"type": "token", "step_id": "s", "text": "par"}
            yield {"type": "thought", "step_id": "s", "text": "thinking"}
            yield {"type": "step_done", "step_id": "s", "summary": "all done"}
            yield {"type": "session_done", "status": "done"}

    monkeypatch.setattr(server, "AgentLoop", FakeLoop)
    return server, TestClient(server.app, headers={"x-termicursor-token": server.TOKEN})


def test_events_stored_in_order_without_tokens(client):
    server, c = client
    sid = c.post("/sessions", json={"project_path": "/p1", "goal": "do it", "agent": "ask"}).json()["session_id"]
    with c.websocket_connect(f"/ws/agent/{sid}") as ws:
        while ws.receive_json()["type"] != "session_done":
            pass
    got = c.get(f"/sessions/{sid}/events").json()["events"]
    assert [e["type"] for e in got] == ["goal", "mode", "thought", "step_done", "session_done"]
    assert got[0] == {"type": "goal", "goal": "do it", "agent": "ask"}
    assert c.get("/sessions/nope/events").json() == {"events": []}


def test_events_write_failure_does_not_break_stream(client, monkeypatch):
    server, c = client
    monkeypatch.setattr(db, "append_event", lambda *a: 1 / 0)
    sid = c.post("/sessions", json={"project_path": "/p1", "goal": "g"}).json()["session_id"]
    with c.websocket_connect(f"/ws/agent/{sid}") as ws:
        types = []
        while not types or types[-1] != "session_done":
            types.append(ws.receive_json()["type"])
    assert types == ["mode", "token", "thought", "step_done", "session_done"]


def test_sessions_filter_by_project(client):
    server, c = client
    for p in ("/a", "/b", "/a"):
        c.post("/sessions", json={"project_path": p, "goal": "g"})
    assert len(c.get("/sessions").json()["sessions"]) == 3
    assert [s["project_path"] for s in c.get("/sessions", params={"project_path": "/a"}).json()["sessions"]] == ["/a", "/a"]


def test_init_db_upgrades_existing_db_and_is_idempotent(tmp_path, monkeypatch):
    path = str(tmp_path / "old.db")
    monkeypatch.setattr(db, "DB_PATH", path)
    with sqlite3.connect(path) as conn:  # an install from before the events table
        conn.execute("CREATE TABLE sessions (id TEXT PRIMARY KEY, project_path TEXT NOT NULL, goal TEXT NOT NULL,"
                     " status TEXT NOT NULL, error TEXT, created_at REAL NOT NULL)")
        conn.execute("INSERT INTO sessions VALUES ('old', '/p', 'g', 'done', NULL, 1)")
    db.init_db()
    db.append_event("old", {"type": "mode"})
    db.init_db()
    assert [s["id"] for s in db.list_sessions()] == ["old"]
    assert db.list_events("old") == [{"type": "mode"}]

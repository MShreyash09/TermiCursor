"""SQLite persistence for sessions, tasks, tool calls, and artifact index."""
import json
import sqlite3
import time
from contextlib import contextmanager

from core.config import DB_PATH

_SCHEMA = """
CREATE TABLE IF NOT EXISTS sessions (
    id           TEXT PRIMARY KEY,
    project_path TEXT NOT NULL,
    goal         TEXT NOT NULL,
    status       TEXT NOT NULL,
    error        TEXT,
    created_at   REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS tasks (
    id          TEXT PRIMARY KEY,
    session_id  TEXT NOT NULL,
    ordinal     INTEGER NOT NULL,
    description TEXT NOT NULL,
    status      TEXT NOT NULL,
    result      TEXT
);
CREATE TABLE IF NOT EXISTS tool_calls (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    step_id    TEXT,
    tool       TEXT NOT NULL,
    args       TEXT,
    success    INTEGER,
    output     TEXT,
    created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS artifacts (
    id         TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    kind       TEXT NOT NULL,
    label      TEXT,
    file       TEXT,
    data       TEXT,
    created_at REAL NOT NULL
);
"""


@contextmanager
def _conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    with _conn() as conn:
        conn.executescript(_SCHEMA)


def upsert_session(session: dict) -> None:
    with _conn() as conn:
        conn.execute(
            """INSERT INTO sessions (id, project_path, goal, status, error, created_at)
               VALUES (:id, :project_path, :goal, :status, :error, :created_at)
               ON CONFLICT(id) DO UPDATE SET status=excluded.status, error=excluded.error""",
            {
                "id": session["id"],
                "project_path": session["project_path"],
                "goal": session["goal"],
                "status": session["status"],
                "error": session.get("error"),
                "created_at": session.get("created_at", time.time()),
            },
        )


def list_sessions() -> list[dict]:
    with _conn() as conn:
        rows = conn.execute("SELECT * FROM sessions ORDER BY created_at DESC").fetchall()
    return [dict(r) for r in rows]


def replace_tasks(session_id: str, steps: list[dict]) -> None:
    with _conn() as conn:
        conn.execute("DELETE FROM tasks WHERE session_id=?", (session_id,))
        conn.executemany(
            """INSERT INTO tasks (id, session_id, ordinal, description, status, result)
               VALUES (?, ?, ?, ?, ?, ?)""",
            [
                (s["id"], session_id, i, s["description"], s["status"], s.get("result"))
                for i, s in enumerate(steps)
            ],
        )


def update_task(step_id: str, status: str, result: str | None = None) -> None:
    with _conn() as conn:
        conn.execute(
            "UPDATE tasks SET status=?, result=? WHERE id=?", (status, result, step_id)
        )


def insert_tool_call(session_id, step_id, tool, args, success, output) -> None:
    with _conn() as conn:
        conn.execute(
            """INSERT INTO tool_calls (session_id, step_id, tool, args, success, output, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (session_id, step_id, tool, json.dumps(args), int(bool(success)),
             (output or "")[:8000], time.time()),
        )


def insert_artifact(artifact: dict) -> None:
    with _conn() as conn:
        conn.execute(
            """INSERT INTO artifacts (id, session_id, kind, label, file, data, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                artifact["id"], artifact["session_id"], artifact["kind"],
                artifact.get("label"), artifact.get("file"),
                json.dumps(artifact.get("data", {})), artifact["created_at"],
            ),
        )


def list_artifacts(session_id: str) -> list[dict]:
    with _conn() as conn:
        rows = conn.execute(
            "SELECT * FROM artifacts WHERE session_id=? ORDER BY created_at ASC", (session_id,)
        ).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        d["data"] = json.loads(d["data"]) if d.get("data") else {}
        out.append(d)
    return out

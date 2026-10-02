"""Folder-scoped persistent memory.

Each project folder gets its own memory file, keyed by a hash of its absolute
path (the same identity scheme rag.get_collection_name uses for the vector DB).
Memory records a compact summary of every agent session that ran in the folder —
the goal, outcome, completed steps, and files changed — so that reopening the
same folder lets the agent continue from where it left off instead of starting
over. Opening a brand-new folder creates a fresh, empty memory.

Storage is plain JSON under <APP_DATA_DIR>/project_memory/<folder_key>.json:
deliberately simple and robust (no embeddings, no external service), which is
what "continue the progress" actually needs and what the previous mem0-based
layer failed to deliver reliably.
"""
import hashlib
import json
import os
import re
import threading
import time

from core.config import APP_DATA_DIR, safe_join
from core.persistence import db

MEMORY_DIR = os.path.join(APP_DATA_DIR, "project_memory")
os.makedirs(MEMORY_DIR, exist_ok=True)

MAX_SESSIONS_KEPT = 20          # rolling window of remembered sessions per folder
MAX_SESSIONS_IN_CONTEXT = 5     # how many to surface to the model in a prompt
_RESULT_TRUNC = 240             # per-result char cap in the prompt context

_lock = threading.Lock()


def folder_key(project_path: str) -> str:
    """Stable per-folder identity: '<clean_folder_name>_<md5(abspath)[:6]>'."""
    abs_path = os.path.abspath(project_path)
    path_hash = hashlib.md5(abs_path.encode("utf-8")).hexdigest()[:6]
    folder_name = os.path.basename(os.path.normpath(abs_path))
    clean = re.sub(r"[^a-zA-Z0-9_]", "_", folder_name).lower() or "project"
    return f"{clean}_{path_hash}"


def _path_for(project_path: str) -> str:
    return safe_join(MEMORY_DIR, f"{folder_key(project_path)}.json")


def _load(project_path: str) -> dict:
    fpath = _path_for(project_path)
    if os.path.isfile(fpath):
        try:
            with open(fpath, "r", encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, dict) and "sessions" in data:
                return data
        except Exception:
            pass  # corrupt/legacy file — fall through to a fresh structure
    return {
        "folder_key": folder_key(project_path),
        "project_path": os.path.abspath(project_path),
        "created_at": time.time(),
        "updated_at": time.time(),
        "sessions": [],
    }


def _write(project_path: str, data: dict) -> None:
    data["updated_at"] = time.time()
    fpath = _path_for(project_path)
    tmp = fpath + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    os.replace(tmp, fpath)  # atomic on the same filesystem


def open_project(project_path: str) -> dict:
    """Called when a folder is selected. Creates a fresh memory if none exists,
    otherwise loads the existing one. Returns a small summary for the UI."""
    with _lock:
        existed = os.path.isfile(_path_for(project_path))
        data = _load(project_path)
        if not existed:
            _write(project_path, data)  # persist the fresh, empty memory
        sessions = data.get("sessions", [])
        last = sessions[-1] if sessions else None
        return {
            "folder_key": data["folder_key"],
            "project_path": data["project_path"],
            "created_fresh": not existed,
            "session_count": len(sessions),
            "last_goal": last["goal"] if last else None,
            "last_status": last["status"] if last else None,
            "last_ended_at": last.get("ended_at") if last else None,
        }


def get_context(project_path: str) -> str:
    """Formatted prior-work summary injected into planner/executor prompts.
    Empty string when the folder has no history yet."""
    with _lock:
        data = _load(project_path)
    sessions = data.get("sessions", [])
    if not sessions:
        return ""

    recent = sessions[-MAX_SESSIONS_IN_CONTEXT:][::-1]  # most recent first
    lines = [
        "This project has prior agent sessions. Build on completed work — do "
        "NOT redo things already done. Recent sessions (most recent first):"
    ]
    for i, s in enumerate(recent, 1):
        files = s.get("files_changed") or []
        files_str = ", ".join(files) if files else "(none)"
        outcome = (s.get("outcome") or "").strip().replace("\n", " ")
        if len(outcome) > _RESULT_TRUNC:
            outcome = outcome[:_RESULT_TRUNC] + "…"
        lines.append(
            f'{i}. [{s.get("status", "?")}] "{s.get("goal", "")}" ({s.get("mode", "?")})\n'
            f"   Files changed: {files_str}\n"
            f"   Outcome: {outcome or '(no summary)'}"
        )
    return "\n".join(lines)


def record_session(session) -> dict | None:
    """Persist a compact summary of a finished (or stopped) agent session.

    Idempotent per session via the `memory_saved` guard, and a no-op for
    sessions that never produced any steps. `session` is a core.agent.session
    .AgentSession.
    """
    if getattr(session, "memory_saved", False):
        return None
    steps = getattr(session, "steps", []) or []
    if not steps:
        return None

    # Files touched this session come from the file_change artifacts in the DB.
    files_changed = []
    try:
        for art in db.list_artifacts(session.id):
            if art.get("kind") == "file_change":
                p = (art.get("data") or {}).get("path")
                if p and p not in files_changed:
                    files_changed.append(p)
    except Exception:
        pass

    outcome = "; ".join(
        step.result for step in steps if getattr(step, "result", None)
    ) or "No summary produced."

    record = {
        "session_id": session.id,
        "goal": session.goal,
        "mode": getattr(session, "mode", None),
        "status": session.status,
        "started_at": getattr(session, "created_at", time.time()),
        "ended_at": time.time(),
        "steps": [
            {"description": s.description, "status": s.status,
             "result": (s.result or "")[:_RESULT_TRUNC]}
            for s in steps
        ],
        "files_changed": files_changed,
        "outcome": outcome,
    }

    with _lock:
        data = _load(session.project_path)
        data["sessions"].append(record)
        if len(data["sessions"]) > MAX_SESSIONS_KEPT:
            data["sessions"] = data["sessions"][-MAX_SESSIONS_KEPT:]
        _write(session.project_path, data)

    session.memory_saved = True
    return record


def summary(project_path: str) -> dict:
    """Read-only summary (like open_project but never creates a file)."""
    with _lock:
        if not os.path.isfile(_path_for(project_path)):
            return {"session_count": 0, "last_goal": None, "last_status": None}
        data = _load(project_path)
    sessions = data.get("sessions", [])
    last = sessions[-1] if sessions else None
    return {
        "folder_key": data["folder_key"],
        "session_count": len(sessions),
        "last_goal": last["goal"] if last else None,
        "last_status": last["status"] if last else None,
        "last_ended_at": last.get("ended_at") if last else None,
    }

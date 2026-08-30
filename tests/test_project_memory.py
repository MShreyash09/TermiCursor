import os
import sys
import tempfile
import types

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# Point all app data at a throwaway dir BEFORE importing the modules that read it.
os.environ["TERMICURSOR_USER_DATA"] = tempfile.mkdtemp(prefix="lc_mem_test_")

from core.memory import project_memory
from core.persistence import db

db.init_db()


def _fake_session(project_path, goal, steps, status="done", sid="sess1", mode="complex"):
    Step = types.SimpleNamespace
    s = types.SimpleNamespace(
        id=sid, project_path=project_path, goal=goal, status=status, mode=mode,
        created_at=1.0, memory_saved=False,
        steps=[Step(description=d, status="done", result=r) for d, r in steps],
    )
    return s


def test_open_creates_fresh_then_reuses():
    proj = tempfile.mkdtemp()
    first = project_memory.open_project(proj)
    assert first["created_fresh"] is True
    assert first["session_count"] == 0
    # Second open must NOT be fresh and must not wipe anything.
    second = project_memory.open_project(proj)
    assert second["created_fresh"] is False
    assert second["session_count"] == 0


def test_different_folders_get_different_memory():
    a, b = tempfile.mkdtemp(), tempfile.mkdtemp()
    assert project_memory.folder_key(a) != project_memory.folder_key(b)


def test_record_and_reload_persists_progress():
    proj = tempfile.mkdtemp()
    project_memory.open_project(proj)
    sess = _fake_session(proj, "Create a Flask app",
                         [("Create app.py", "Created app.py with a hello route")])
    rec = project_memory.record_session(sess)
    assert rec is not None
    assert sess.memory_saved is True

    # Re-reading (as if the folder were reopened later) sees the prior session.
    summary = project_memory.open_project(proj)
    assert summary["session_count"] == 1
    assert summary["last_goal"] == "Create a Flask app"
    assert summary["last_status"] == "done"

    ctx = project_memory.get_context(proj)
    assert "Create a Flask app" in ctx
    assert "prior agent sessions" in ctx


def test_record_is_idempotent():
    proj = tempfile.mkdtemp()
    sess = _fake_session(proj, "goal", [("step", "did it")])
    assert project_memory.record_session(sess) is not None
    assert project_memory.record_session(sess) is None  # already saved
    assert project_memory.summary(proj)["session_count"] == 1


def test_empty_session_not_recorded():
    proj = tempfile.mkdtemp()
    sess = _fake_session(proj, "goal", [])
    assert project_memory.record_session(sess) is None
    assert project_memory.summary(proj)["session_count"] == 0


def test_context_empty_for_new_folder():
    proj = tempfile.mkdtemp()
    assert project_memory.get_context(proj) == ""


def test_rolling_window_caps_sessions():
    proj = tempfile.mkdtemp()
    for i in range(project_memory.MAX_SESSIONS_KEPT + 5):
        s = _fake_session(proj, f"goal {i}", [("s", "r")], sid=f"sess{i}")
        project_memory.record_session(s)
    assert project_memory.summary(proj)["session_count"] == project_memory.MAX_SESSIONS_KEPT
    # Most recent goal is retained.
    assert "goal " in project_memory.summary(proj)["last_goal"]


if __name__ == "__main__":
    passed = 0
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print(f"PASS {name}")
            passed += 1
    print(f"all project_memory tests passed ({passed})")

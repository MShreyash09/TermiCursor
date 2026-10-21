"""Review/undo: the loop snapshots a file before the agent first changes it, and the
changes/revert API puts the original back (modified), removes it (created) or recreates it (deleted)."""
import asyncio
import os
import sys
import tempfile

os.environ.setdefault("TERMICURSOR_USER_DATA", tempfile.mkdtemp(prefix="undo_test_"))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi.testclient import TestClient

from core.agent.json_protocol import AgentAction
from core.agent.loop import AgentLoop
from core.agent.session import AgentSession, TaskStep
from core.persistence import db

db.init_db()


def _run_tools(proj, *calls):
    """Run (tool, args) calls through the loop's executor, approving whatever asks."""
    session = AgentSession(project_path=proj, goal="x")
    loop = AgentLoop(session, llm=object())
    db.upsert_session(session.to_dict())

    async def drive():
        for tool, args in calls:
            async for ev, _ in loop._execute_action(TaskStep(id="s", description="d"), AgentAction(tool=tool, args=args)):
                if ev and ev["type"] == "approval_needed":
                    session.resolve_approval(ev["call_id"], True)
    asyncio.run(drive())
    session.status = "done"  # an approval flips it to running
    import server
    from core.agent.session import SESSIONS
    SESSIONS[session.id] = session
    return session.id, TestClient(server.app)


def _write(path, data: bytes):
    with open(path, "wb") as f:
        f.write(data)


def test_revert_modified_created_deleted():
    proj = tempfile.mkdtemp()
    _write(os.path.join(proj, "a.txt"), b"one\r\ntwo\r\n")
    _write(os.path.join(proj, "gone.txt"), b"bye")
    sid, c = _run_tools(
        proj,
        ("edit_file", {"path": "a.txt", "old_string": "two", "new_string": "2"}),
        ("edit_file", {"path": "a.txt", "old_string": "one", "new_string": "1"}),  # 2nd edit: snapshot stays the original
        ("write_file", {"path": "sub/new.txt", "content": "hi"}),
        ("delete_file", {"path": "gone.txt"}),
    )
    got = {x["path"]: x for x in c.get(f"/sessions/{sid}/changes").json()["changes"]}
    assert {k: v["status"] for k, v in got.items()} == {"a.txt": "modified", "sub/new.txt": "created", "gone.txt": "deleted"}
    assert got["a.txt"]["original"] == "one\r\ntwo\r\n" and got["gone.txt"]["original"] == "bye"

    assert c.post(f"/sessions/{sid}/revert", json={"path": "a.txt"}).status_code == 200
    assert open(os.path.join(proj, "a.txt"), "rb").read() == b"one\r\ntwo\r\n"  # line endings kept
    assert c.post(f"/sessions/{sid}/revert", json={}).status_code == 200  # the rest
    assert not os.path.exists(os.path.join(proj, "sub", "new.txt"))
    assert open(os.path.join(proj, "gone.txt"), "rb").read() == b"bye"
    assert c.get(f"/sessions/{sid}/changes").json()["changes"] == []


def test_revert_rejects_paths_outside_project_and_running_sessions():
    proj = tempfile.mkdtemp()
    outside = os.path.join(os.path.dirname(proj), "victim.txt")
    _write(outside, b"keep")
    sid, c = _run_tools(proj, ("write_file", {"path": "ok.txt", "content": "x"}))
    for bad in ("../victim.txt", "..\victim.txt", outside):
        assert c.post(f"/sessions/{sid}/revert", json={"path": bad}).status_code == 400
    assert open(outside, "rb").read() == b"keep" and os.path.exists(os.path.join(proj, "ok.txt"))

    import server
    server.SESSIONS[sid].status = "running"
    assert c.post(f"/sessions/{sid}/revert", json={}).status_code == 409
    assert os.path.exists(os.path.join(proj, "ok.txt"))
    assert c.post("/sessions/nope/revert", json={}).status_code == 404

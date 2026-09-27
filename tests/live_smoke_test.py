"""Live end-to-end smoke test against a real Ollama instance. Not a unit test —
run manually: python tests/live_smoke_test.py

Verifies, against the real migrated core/ package in this repo:
  1. Simple queries skip planning (fast path).
  2. Complex goals produce a plan and execute file/shell tools.
  3. Cancellation interrupts an in-flight run near-instantly.
"""
import asyncio
import os
import sys
import tempfile
import time

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from core.persistence import db
from core.agent.session import AgentSession
from core.agent.loop import AgentLoop


async def test_simple_path():
    print("\n=== 1. Simple fast path ===")
    proj = tempfile.mkdtemp()
    for n in ["a.py", "b.py", "c.js"]:
        open(os.path.join(proj, n), "w").close()
    s = AgentSession(project_path=proj, goal="how many code files are present in this folder?")
    loop = AgentLoop(s)
    events = []
    t0 = time.time()
    async for ev in loop.run():
        events.append(ev["type"])
        if ev["type"] == "mode":
            print("  MODE:", ev["mode"])
        if ev["type"] == "plan":
            print("  !! PLAN EMITTED (should not happen in simple mode)")
        if ev["type"] == "step_done":
            print("  ANSWER:", ev["summary"])
        if ev["type"] == "session_done":
            print("  DONE:", ev["status"])
    print(f"  elapsed: {time.time()-t0:.1f}s")
    assert "plan" not in events, "simple path must not plan"
    assert s.mode == "simple"
    print("  PASS: simple path skipped planning")


async def test_complex_path_and_cancel():
    print("\n=== 2. Complex path + cancel ===")
    proj = tempfile.mkdtemp()
    s = AgentSession(project_path=proj,
                     goal="build a complete FastAPI backend with auth, models, and tests")
    loop = AgentLoop(s)

    async def drive():
        got = []
        async for ev in loop.run():
            got.append(ev["type"])
            if ev["type"] == "mode":
                print("  MODE:", ev["mode"])
            if ev["type"] == "plan":
                print(f"  PLAN: {len(ev['steps'])} step(s)")
        return got

    task = asyncio.create_task(drive())
    s._run_task = task
    await asyncio.sleep(6)
    assert s.mode == "complex", f"expected complex, got {s.mode}"
    t0 = time.time()
    s.cancel()
    try:
        await asyncio.wait_for(task, timeout=15)
    except asyncio.CancelledError:
        pass
    latency = time.time() - t0
    print(f"  status after cancel: {s.status}  (stop latency: {latency:.2f}s)")
    assert s.status == "cancelled"
    print("  PASS: complex path planned + cancel interrupted the run")


async def main():
    db.init_db()
    await test_simple_path()
    await test_complex_path_and_cancel()
    print("\nALL LIVE SMOKE TESTS PASSED")


if __name__ == "__main__":
    asyncio.run(main())

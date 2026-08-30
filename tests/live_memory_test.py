"""Live end-to-end: prove per-folder memory persists across sessions against a
real Ollama. Run manually: python tests/live_memory_test.py

Simulates the real lifecycle: open folder (fresh) -> run a session -> record it
(as the server's WS finally does) -> reopen the SAME folder -> confirm the prior
work is remembered and injected into the next run's context.
"""
import asyncio
import os
import sys
import tempfile

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from core.persistence import db
from core.memory import project_memory
from core.agent.session import AgentSession
from core.agent.loop import AgentLoop


async def main() -> int:
    db.init_db()
    proj = tempfile.mkdtemp(prefix="lc_live_mem_")
    print(f"Folder: {proj}\n")

    # 1. First open — should be fresh.
    opened = project_memory.open_project(proj)
    print(f"1. open_project -> created_fresh={opened['created_fresh']} "
          f"count={opened['session_count']}")
    assert opened["created_fresh"] and opened["session_count"] == 0

    # 2. Run a real session that creates a file.
    print("\n2. Running session: create hello.py ...")
    s1 = AgentSession(project_path=proj,
                      goal="Create a file hello.py that prints 'hello from memory test'.")
    async for ev in AgentLoop(s1).run():
        if ev["type"] == "session_done":
            print(f"   session done: {ev['status']}")
    # Simulate the server's finally-block recording.
    project_memory.record_session(s1)

    # 3. Reopen the SAME folder — memory must now show the prior session.
    reopened = project_memory.open_project(proj)
    print(f"\n3. reopen -> created_fresh={reopened['created_fresh']} "
          f"count={reopened['session_count']} last=\"{reopened['last_goal']}\"")
    assert reopened["created_fresh"] is False
    assert reopened["session_count"] == 1

    # 4. The next session's context must include the prior work.
    ctx = project_memory.get_context(proj)
    print("\n4. Context injected into the next run:\n" + "-" * 50)
    print(ctx)
    print("-" * 50)
    assert "hello.py" in ctx or "hello" in ctx.lower()

    # 5. A brand-new DIFFERENT folder stays fresh (scoping check).
    other = tempfile.mkdtemp(prefix="lc_live_mem_other_")
    o = project_memory.open_project(other)
    assert o["created_fresh"] and o["session_count"] == 0
    print("\n5. A different folder is independent (fresh). PASS")

    print("\nLIVE MEMORY TEST: PASS")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))

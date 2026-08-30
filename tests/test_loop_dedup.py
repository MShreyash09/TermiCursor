"""Verify the executor loop stops a small model that keeps re-issuing the same
successful write_file instead of finishing (the 9x-identical-write bug), and
does so WITHOUT burning the whole iteration budget.
"""
import asyncio
import json
import os
import sys
import tempfile

os.environ["TERMICURSOR_USER_DATA"] = tempfile.mkdtemp(prefix="lc_dedup_test_")
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from core.persistence import db
from core.agent.session import AgentSession
from core.agent.loop import AgentLoop

db.init_db()


class RepeatingLLM:
    """Always tries to write the exact same file — never emits final_answer,
    mimicking a small model stuck in a loop."""

    def __init__(self):
        self.calls = 0

    async def chat(self, messages, *, temperature=0.1):
        self.calls += 1
        return json.dumps({
            "thought": "writing the file",
            "action": {"tool": "write_file", "args": {"path": "out.py", "content": "print(1)"}},
            "final_answer": None,
        })

    async def generate(self, prompt, *, temperature=0.1):
        return "simple"


def test_repeated_identical_write_is_short_circuited():
    proj = tempfile.mkdtemp()
    llm = RepeatingLLM()
    session = AgentSession(project_path=proj, goal="write out.py")
    loop = AgentLoop(session, llm=llm)

    async def drive():
        events = []
        async for ev in loop.run():
            events.append(ev)
        return events

    events = asyncio.run(drive())
    types = [e["type"] for e in events]

    # The file was actually written (once is enough).
    assert os.path.isfile(os.path.join(proj, "out.py"))

    # The step completed rather than failing on exhausted iterations.
    done = [e for e in events if e["type"] == "session_done"]
    assert done and done[-1]["status"] == "done", types

    # Crucially, it stopped FAST — the dedup guard cuts in after the first repeat,
    # well before the 6-iteration simple-mode budget. Count actual write attempts
    # that reached the tool (tool_result events for write_file).
    writes = [e for e in events
              if e["type"] == "tool_result" and e.get("tool") == "write_file"]
    assert len(writes) <= 2, f"expected the loop to stop repeating writes, got {len(writes)}"


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print(f"PASS {name}")
    print("all loop dedup tests passed")

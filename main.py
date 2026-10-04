"""
CLI entry point. `ingest` builds the Qdrant index; `run` drives the agent
loop headlessly (planning + tool-calling), replacing the old `chat`/`query`
RAG-only commands now that the assistant is a real tool-calling agent.
"""
import asyncio
import sys

import rag
from core.persistence import db
from core.agent.session import AgentSession
from core.agent.loop import AgentLoop
from core.memory import project_memory

# Ensure stdout/stderr supports UTF-8 on Windows
if sys.platform.startswith('win'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except AttributeError:
        pass


def print_usage():
    print("[TermiCursor] Offline AI Coding Agent")
    print("================================================")
    print("Usage:")
    print("  python main.py ingest <project_path>              Ingest codebase and build Qdrant vector index")
    print("  python main.py run <project_path> \"<goal>\"        Run the agent on a goal (plans if complex, answers directly if simple)")
    print("================================================")


async def _run(project_path: str, goal: str):
    db.init_db()
    # Opening the folder loads (or freshly creates) its persistent memory.
    mem = project_memory.open_project(project_path)
    if mem.get("session_count"):
        print(f"[memory] resuming folder with {mem['session_count']} prior session(s); "
              f"last: \"{mem.get('last_goal')}\" ({mem.get('last_status')})\n")

    session = AgentSession(project_path=project_path, goal=goal)
    print(f"[session {session.id}] goal: {goal}\n")

    loop = AgentLoop(session)
    async for ev in loop.run():
        t = ev.get("type")
        if t == "mode":
            print(f"[mode: {ev['mode']}]\n")
        elif t == "plan":
            print("PLAN:")
            for s in ev["steps"]:
                print(f"  - {s['description']}")
            print()
        elif t == "thought":
            print(f"  thought: {ev['text']}")
        elif t == "tool_call":
            print(f"  -> {ev['tool']}({ev['args']})  [{ev['risk']}]")
        elif t == "approval_needed":
            # Headless CLI: auto-deny risky actions for safety. Approve in the UI instead.
            print(f"  !! approval needed for {ev['tool']} — auto-denying in CLI mode")
            session.resolve_approval(ev["call_id"], False)
        elif t == "tool_result":
            status = "ok" if ev["success"] else "FAIL"
            print(f"  <- [{status}] {ev['output'][:200]}")
        elif t == "step_done":
            print(f"  DONE: {ev['summary']}\n")
        elif t == "session_done":
            print(f"\n[session complete: {ev['status']}]")
        elif t == "error":
            print(f"  ERROR: {ev['message']}")

    # Persist this session into folder memory so the next run can continue it.
    project_memory.record_session(session)


def main():
    if len(sys.argv) < 3:
        print_usage()
        sys.exit(1)

    command = sys.argv[1].lower().lstrip("-")
    project_path = sys.argv[2]

    if command == "ingest":
        print(rag.ingest_codebase(project_path))
    elif command == "run":
        if len(sys.argv) < 4:
            print("[Error] Goal text is required for 'run' command.")
            print('Usage: python main.py run <project_path> "<goal>"')
            sys.exit(1)
        goal = sys.argv[3]
        asyncio.run(_run(project_path, goal))
    else:
        print(f"[Error] Unknown command '{command}'.")
        print_usage()
        sys.exit(1)


if __name__ == "__main__":
    main()

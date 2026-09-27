"""Live eval: does the agent actually use its tools, and does it get the right answer?

Runs the real AgentLoop against a real Ollama on a small fixture project (a fresh
temp copy per run, so nothing in this repo is touched). Answers are chosen so they
can't be guessed: e.g. multiply() has a planted bug, so "what does multiply(2, 3)
return?" is only answered correctly by reading the code.

    python tests/live_agent_eval.py                 # all tasks, 2 reps
    python tests/live_agent_eval.py --reps 1 --only A2 B1
    python tests/live_agent_eval.py --out results.json

Not collected by pytest (needs Ollama, takes minutes).
"""
import argparse
import asyncio
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time

# Isolated app data: no real memory/DB/index is read or written.
os.environ.setdefault("TERMICURSOR_USER_DATA", tempfile.mkdtemp(prefix="tc_eval_"))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from core.agent.loop import AgentLoop  # noqa: E402
from core.agent.session import AgentSession  # noqa: E402
from core.persistence import db  # noqa: E402

FIXTURE = {
    "calc.py": '"""Tiny calculator."""\n\n\ndef add(a, b):\n    return a + b\n\n\ndef multiply(a, b):\n    return a + b\n',
    "utils.py": (
        "import re\n\n\n"
        "def slugify(text):\n    return re.sub(r'[^a-z0-9]+', '-', text.lower()).strip('-')\n\n\n"
        "def clamp(value, low, high):\n    return max(low, min(high, value))\n\n\n"
        "def chunk(items, size):\n    return [items[i:i + size] for i in range(0, len(items), size)]\n\n\n"
        "def is_even(n):\n    return n % 2 == 0\n"
    ),
    "settings.py": 'APP_NAME = "evalapp"\nRETRY_LIMIT = 5\nDEFAULT_TIMEOUT = 37\n',
    "app/__init__.py": "",
    "app/models.py": "class User:\n    def __init__(self, name):\n        self.name = name\n",
    "app/routes.py": (
        "from .models import User\n\nROUTES = {}\n\n\n"
        "def route(path):\n    def deco(fn):\n        ROUTES[path] = fn\n        return fn\n    return deco\n\n\n"
        "@route('/health')\ndef health():\n    return {'status': 'ok'}\n\n\n"
        "@route('/users')\ndef fetch_user_roster():\n    return [User('ada'), User('linus')]\n"
    ),
    "test_calc.py": (
        "import unittest\n\nfrom calc import add, multiply\n\n\n"
        "class CalcTest(unittest.TestCase):\n"
        "    def test_add(self):\n        self.assertEqual(add(2, 3), 5)\n\n"
        "    def test_multiply(self):\n        self.assertEqual(multiply(2, 3), 6)\n\n\n"
        "if __name__ == '__main__':\n    unittest.main()\n"
    ),
}

# (id, agent, goal, check). Ask checks: every keyword must appear in the answer.
# Build checks: a Python snippet run inside the project copy must exit 0.
TASKS = [
    ("A1", "ask", "read calc.py and summarize what it does", {"keywords": ["add", "multiply"]}),
    ("A2", "ask", "What does multiply(2, 3) return in this project?", {"keywords": ["5"]}),
    ("A3", "ask", "What is DEFAULT_TIMEOUT set to, and in which file?", {"keywords": ["37", "settings"]}),
    ("A4", "ask", "Which files are in the app folder?", {"keywords": ["routes", "models"]}),
    ("A5", "ask", "How many functions are defined in utils.py?", {"any": ["4", "four"]}),
    ("A6", "ask", "Which function handles the /users endpoint?", {"keywords": ["fetch_user_roster"]}),
    ("B1", "build", "multiply() in calc.py returns the wrong result. Fix it.",
     {"py": "from calc import add, multiply; assert multiply(2, 3) == 6 and multiply(4, 5) == 20 and add(2, 3) == 5"}),
    ("B2", "build", "Add a function subtract(a, b) to calc.py that returns a - b.",
     {"py": "from calc import add, subtract, multiply; assert subtract(5, 3) == 2 and add(2, 3) == 5"}),
    ("B3", "build", "Create greet.py with a function greet(name) that returns 'Hello, <name>!'.",
     {"py": "from greet import greet; assert greet('Ada') == 'Hello, Ada!'"}),
    ("B4", "build", "Change DEFAULT_TIMEOUT in settings.py to 60.",
     {"py": "import settings as s; assert s.DEFAULT_TIMEOUT == 60 and s.RETRY_LIMIT == 5 and s.APP_NAME == 'evalapp'"}),
    ("S1", "build", "Run the unit tests with `python -m unittest test_calc` and tell me whether they pass.",
     {"any": ["fail", "error"], "tool": "run_shell_command"}),
]


def make_project() -> str:
    root = tempfile.mkdtemp(prefix="tc_proj_")
    for rel, text in FIXTURE.items():
        path = os.path.join(root, rel)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            f.write(text)
    return root


async def run_task(task, timeout: float) -> dict:
    tid, agent, goal, check = task
    root = make_project()
    session = AgentSession(project_path=root, goal=goal, agent=agent)
    tools, answers, events = [], [], []
    started = time.monotonic()
    status = "timeout"

    async def drive():
        nonlocal status
        async for ev in AgentLoop(session).run():
            t = ev["type"]
            events.append(t)
            if t == "tool_call":
                tools.append(ev["tool"] + ("(" + str(ev["args"].get("path") or ev["args"].get("pattern")
                                                     or ev["args"].get("command") or "") + ")"))
            elif t == "tool_result" and not ev["success"]:
                tools.append("  x " + ev["output"][:120].replace("\n", " "))
            elif t == "approval_needed":
                session.resolve_approval(ev["call_id"], True)  # eval auto-approves
            elif t == "step_done" and ev.get("summary"):
                answers.append(ev["summary"])
            elif t == "session_done":
                status = ev["status"]

    try:
        await asyncio.wait_for(drive(), timeout)
    except asyncio.TimeoutError:
        session.cancel()
    answer = "\n".join(answers)

    ok = status == "done"
    low = answer.lower()
    if "keywords" in check:
        ok = ok and all(k.lower() in low for k in check["keywords"])
    if "any" in check:
        ok = ok and any(k.lower() in low for k in check["any"])
    if "tool" in check:
        ok = ok and any(t.startswith(check["tool"]) for t in tools)
    if "py" in check:
        proc = subprocess.run([sys.executable, "-c", check["py"]], cwd=root, capture_output=True, text=True)
        ok = ok and proc.returncode == 0
    shutil.rmtree(root, ignore_errors=True)
    return {"id": tid, "agent": agent, "ok": ok, "status": status, "secs": round(time.monotonic() - started, 1),
            "tools": tools, "answer": answer[:400]}


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--reps", type=int, default=2)
    ap.add_argument("--only", nargs="*")
    ap.add_argument("--timeout", type=float, default=300)
    ap.add_argument("--out")
    args = ap.parse_args()
    db.init_db()

    tasks = [t for t in TASKS if not args.only or t[0] in args.only]
    results = []
    for rep in range(args.reps):
        for task in tasks:
            r = await run_task(task, args.timeout)
            r["rep"] = rep
            results.append(r)
            mark = "PASS" if r["ok"] else "FAIL"
            print(f"[{mark}] {r['id']} rep{rep} {r['secs']:>6}s  tools={r['tools']}  answer={r['answer'][:110]!r}",
                  flush=True)

    print("\n== summary ==")
    for task in tasks:
        rs = [r for r in results if r["id"] == task[0]]
        used = sum(1 for r in rs if r["tools"])
        print(f"{task[0]}  {sum(r['ok'] for r in rs)}/{len(rs)} passed  "
              f"{used}/{len(rs)} used tools  avg {sum(r['secs'] for r in rs) / len(rs):.0f}s  {task[2][:60]}")
    total = sum(r["ok"] for r in results)
    print(f"TOTAL {total}/{len(results)} passed")
    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            json.dump(results, f, indent=2)


if __name__ == "__main__":
    asyncio.run(main())

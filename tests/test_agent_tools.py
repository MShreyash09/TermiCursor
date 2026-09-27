"""New agent tools (edit_file, grep, find_files, paged read_file) and the loop's
grounding rules (auto-attach, read-before-overwrite, look-first nudge)."""
import asyncio
import os
import sys
import tempfile

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from core.agent.context import looks_project_specific, mentioned_files
from core.tools.fs_tools import EditFileArgs, EditFileTool, ReadFileArgs, ReadFileTool
from core.tools.grep_tools import FindFilesArgs, FindFilesTool, GrepArgs, GrepTool
from core.tools.search_tool import _keyword_fallback


def _run(coro):
    return asyncio.run(coro)


def _project(files: dict) -> str:
    root = tempfile.mkdtemp()
    for rel, text in files.items():
        path = os.path.join(root, rel)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            f.write(text)
    return root


CALC = "def add(a, b):\n    return a + b\n\n\ndef multiply(a, b):\n    return a + b\n"


def _edit(root, old, new, **kw):
    return _run(EditFileTool().run(EditFileArgs(path="calc.py", old_string=old, new_string=new, **kw), project_root=root))


def _calc(root):
    return open(os.path.join(root, "calc.py"), encoding="utf-8").read()


def test_edit_replaces_exactly_one_occurrence_and_keeps_the_rest():
    root = _project({"calc.py": CALC})
    r = _edit(root, "def multiply(a, b):\n    return a + b", "def multiply(a, b):\n    return a * b")
    assert r.success, r.error
    assert _calc(root) == CALC.replace("def multiply(a, b):\n    return a + b", "def multiply(a, b):\n    return a * b")
    assert "Syntax check: OK" in r.output


def test_edit_refuses_ambiguous_or_missing_text():
    root = _project({"calc.py": CALC})
    ambiguous = _edit(root, "return a + b", "return a * b")
    assert not ambiguous.success and "appears 2 times" in ambiguous.error
    # Each occurrence is listed with the line above it, so the model can anchor on it.
    assert "line 2 (after 'def add(a, b):')" in ambiguous.error
    assert "line 6 (after 'def multiply(a, b):')" in ambiguous.error
    missing = _edit(root, "return a - b", "x")
    assert not missing.success and "not found" in missing.error
    assert _calc(root) == CALC  # nothing changed
    assert _edit(root, "return a + b", "return b + a", replace_all=True).success
    assert _calc(root).count("return b + a") == 2


def test_edit_tolerates_pasted_line_numbers_and_reports_syntax_errors():
    root = _project({"calc.py": CALC})
    r = _edit(root, "    5| def multiply(a, b):\n    6|     return a + b", "    5| def multiply(a, b):\n    6|     return a * b")
    assert r.success and "return a * b" in _calc(root) and "|" not in _calc(root)
    bad = _edit(root, "return a * b", "return (a * b")
    assert bad.success and "SYNTAX ERROR" in bad.output


def test_read_file_pages_long_files():
    root = _project({"big.py": "".join(f"x{i} = {i}\n" for i in range(1, 451))})
    first = _run(ReadFileTool().run(ReadFileArgs(path="big.py"), project_root=root))
    assert "lines 1-200 of 450" in first.output and "offset=201" in first.output
    last = _run(ReadFileTool().run(ReadFileArgs(path="big.py", offset=401), project_root=root))
    assert "  450| x450 = 450" in last.output


def test_grep_and_find_files():
    root = _project({"settings.py": "DEFAULT_TIMEOUT = 37\n", "app/routes.py": "def fetch_user_roster():\n    pass\n",
                     "node_modules/x.js": "DEFAULT_TIMEOUT"})
    g = _run(GrepTool().run(GrepArgs(pattern="default_timeout"), project_root=root))
    assert g.output == "settings.py:1: DEFAULT_TIMEOUT = 37"  # case-insensitive, vendored dirs skipped
    bad_regex = _run(GrepTool().run(GrepArgs(pattern="fetch_user_roster("), project_root=root))
    assert "app/routes.py:1:" in bad_regex.output  # invalid regex falls back to a literal search
    f = _run(FindFilesTool().run(FindFilesArgs(pattern="routes.py"), project_root=root))
    assert f.output == "app/routes.py"


def test_semantic_search_falls_back_to_text_search_without_an_index():
    root = _project({"settings.py": "DEFAULT_TIMEOUT = 37\n"})
    r = _keyword_fallback(root, "where is DEFAULT_TIMEOUT configured")
    assert r.success and "settings.py:1:" in r.output


def test_mentioned_files_resolves_paths_and_unique_bare_names():
    root = _project({"calc.py": "", "app/routes.py": "", "a/__init__.py": "", "b/__init__.py": ""})
    assert mentioned_files(root, "fix calc.py and look at routes.py") == ["calc.py", "app/routes.py"]
    assert mentioned_files(root, "check app\\routes.py") == ["app/routes.py"]
    assert mentioned_files(root, "what's in __init__.py? e.g. nothing.txt") == []  # ambiguous / missing


def test_general_questions_are_not_treated_as_project_questions():
    assert not looks_project_specific("what is the difference between machine learning and deep learning?")
    assert not looks_project_specific("write a python function to reverse a string")
    assert looks_project_specific("What does multiply(2, 3) return in this project?")
    assert looks_project_specific("What is DEFAULT_TIMEOUT set to?")


class _ScriptedLLM:
    """Replays canned model turns and records the messages it was sent."""

    def __init__(self, turns):
        self.turns, self.seen = list(turns), []

    async def chat(self, messages, **kw):
        self.seen.append([dict(m) for m in messages])
        return self.turns.pop(0)

    async def generate(self, prompt, **kw):
        return "simple"


def _run_loop(root, goal, turns, agent="ask"):
    os.environ.setdefault("TERMICURSOR_USER_DATA", tempfile.mkdtemp())
    from core.agent.loop import AgentLoop
    from core.agent.session import AgentSession
    from core.persistence import db
    db.init_db()
    llm = _ScriptedLLM(turns)
    session = AgentSession(project_path=root, goal=goal, agent=agent)

    async def go():
        return [ev async for ev in AgentLoop(session, llm=llm).run()]

    return asyncio.run(go()), llm


def test_mentioned_file_is_attached_before_the_model_answers():
    root = _project({"calc.py": CALC})
    events, llm = _run_loop(root, "summarize calc.py", ['{"thought":"t","action":null,"final_answer":"adds"}'])
    assert [e["tool"] for e in events if e["type"] == "tool_call"] == ["read_file"]
    assert "def multiply(a, b):" in llm.seen[0][1]["content"]  # file content is in the first prompt


def test_answering_a_project_question_without_looking_gets_one_nudge():
    root = _project({"settings.py": "DEFAULT_TIMEOUT = 37\n"})
    guess = '{"thought":"t","action":null,"final_answer":"probably 30"}'
    events, llm = _run_loop(root, "What is DEFAULT_TIMEOUT set to?", [guess, guess])
    assert len(llm.seen) == 2 and "without looking" in llm.seen[1][-1]["content"]
    assert any(e["type"] == "session_done" for e in events)  # one nudge only, then it finishes


def test_write_file_over_an_unread_existing_file_is_refused():
    root = _project({"calc.py": CALC, "other.py": "x = 1\n"})
    write = '{"thought":"t","action":{"tool":"write_file","args":{"path":"other.py","content":"y = 2"}},"final_answer":null}'
    done = '{"thought":"t","action":null,"final_answer":"done"}'
    events, _ = _run_loop(root, "set y in the second module", [write, done], agent="build")
    results = [e for e in events if e["type"] == "tool_result"]
    assert results and not results[0]["success"] and "haven't read it" in results[0]["output"]
    assert open(os.path.join(root, "other.py"), encoding="utf-8").read() == "x = 1\n"


def test_grep_accepts_a_single_file_as_path_and_fallback_shows_context():
    root = _project({"settings.py": "DEFAULT_TIMEOUT = 37\n",
                     "app/routes.py": "@route('/users')\ndef fetch_user_roster():\n    pass\n"})
    g = _run(GrepTool().run(GrepArgs(pattern="DEFAULT_TIMEOUT", path="settings.py"), project_root=root))
    assert g.output == "settings.py:1: DEFAULT_TIMEOUT = 37"
    r = _keyword_fallback(root, "which function handles the users endpoint")
    assert "fetch_user_roster" in r.output


def test_claiming_a_change_without_editing_gets_one_nudge():
    root = _project({"calc.py": CALC})
    claim = '{"thought":"t","action":null,"final_answer":"subtract has been added"}'
    events, llm = _run_loop(root, "Add a function subtract(a, b) to calc.py", [claim, claim], agent="build")
    assert len(llm.seen) == 2 and "No file has been changed" in llm.seen[1][-1]["content"]
    assert any(e["type"] == "session_done" for e in events)


def test_write_file_that_would_erase_most_of_a_read_file_is_refused():
    root = _project({"calc.py": CALC})
    read = '{"thought":"t","action":{"tool":"read_file","args":{"path":"calc.py"}},"final_answer":null}'
    clobber = ('{"thought":"t","action":{"tool":"write_file","args":{"path":"calc.py",'
               '"content":"def subtract(a, b):\n    return a - b\n"}},"final_answer":null}')
    done = '{"thought":"t","action":null,"final_answer":"done"}'
    events, _ = _run_loop(root, "add subtract to the calculator module", [read, clobber, done, done], agent="build")
    refused = [e for e in events if e["type"] == "tool_result" and e["tool"] == "write_file"]
    assert refused and not refused[0]["success"] and "would delete" in refused[0]["output"]
    assert _calc(root) == CALC


def test_shell_cwd_equal_to_the_project_folder_name_means_the_root():
    from core.tools.shell_tool import RunShellArgs, RunShellCommandTool
    root = _project({"a.txt": "hi"})
    r = _run(RunShellCommandTool().run(RunShellArgs(command="dir" if os.name == "nt" else "ls",
                                                   cwd=os.path.basename(root)), project_root=root))
    assert r.success and "a.txt" in r.output


def test_edit_with_empty_old_string_appends_and_missing_text_suggests_the_closest_line():
    root = _project({"calc.py": CALC})
    r = _edit(root, "", "def subtract(a, b):\n    return a - b")
    assert r.success and "Appended" in r.output and "Syntax check: OK" in r.output
    assert _calc(root) == CALC + "\n" + "def subtract(a, b):\n    return a - b\n"
    miss = _edit(root, "def multiply(x, y):", "x")
    assert not miss.success and "Closest text in the file, line 5: 'def multiply(a, b):'" in miss.error


def test_appending_code_that_is_already_there_is_refused():
    root = _project({"calc.py": CALC})
    assert _edit(root, "", "def subtract(a, b):\n    return a - b").success
    again = _edit(root, "", "def subtract(a, b):\n    return a - b")
    assert not again.success and "already in calc.py" in again.error
    assert _calc(root).count("def subtract") == 1


def test_edits_keep_the_files_line_endings():
    root = _project({})
    for name, eol in (("lf.py", "\n"), ("crlf.py", "\r\n")):
        with open(os.path.join(root, name), "w", encoding="utf-8", newline="") as f:
            f.write(CALC.replace("\n", eol))
        r = _run(EditFileTool().run(EditFileArgs(path=name, old_string="def multiply(a, b):\n    return a + b",
                                                new_string="def multiply(a, b):\n    return a * b"), project_root=root))
        assert r.success, r.error
        raw = open(os.path.join(root, name), "rb").read()
        assert b"return a * b" in raw
        assert (b"\r\n" in raw) == (eol == "\r\n"), name  # LF stays LF, CRLF stays CRLF

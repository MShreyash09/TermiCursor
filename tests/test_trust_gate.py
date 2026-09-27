import os
import sys
from contextlib import contextmanager

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from core.tools import trust_gate


def test_read_only_tools_are_safe():
    assert trust_gate.classify_risk("read_file", {"path": "a.py"}, ".") == "safe"
    assert trust_gate.classify_risk("list_dir", {"path": "."}, ".") == "safe"
    assert trust_gate.classify_risk("search_codebase", {"query": "x"}, ".") == "safe"


def test_browser_tools_are_safe():
    assert trust_gate.classify_risk("browser_navigate", {"url": "http://localhost:5000"}, ".") == "safe"
    assert trust_gate.classify_risk("browser_click", {"selector": "button"}, ".") == "safe"
    assert trust_gate.classify_risk("browser_get_text", {}, ".") == "safe"


def test_write_inside_project_is_safe():
    assert trust_gate.classify_risk("write_file", {"path": "src/x.py"}, ".") == "safe"


def test_write_outside_project_needs_approval():
    assert trust_gate.classify_risk("write_file", {"path": "../../etc/passwd"}, ".") == "needs_approval"


def test_delete_always_needs_approval():
    assert trust_gate.classify_risk("delete_file", {"path": "x.py"}, ".") == "needs_approval"


@contextmanager
def _auto_approve(value: bool):
    orig = trust_gate.auto_approve_shell
    trust_gate.auto_approve_shell = lambda: value
    try:
        yield
    finally:
        trust_gate.auto_approve_shell = orig


def test_shell_needs_approval_by_default():
    with _auto_approve(False):
        for cmd in ["python app.py", "npm test", "git status", "ls -la"]:
            assert trust_gate.classify_risk("run_shell_command", {"command": cmd}, ".") == "needs_approval", cmd


def test_benign_shell_is_safe_with_auto_approve():
    with _auto_approve(True):
        for cmd in ["python app.py", "npm test", "git status", "ls -la"]:
            assert trust_gate.classify_risk("run_shell_command", {"command": cmd}, ".") == "safe", cmd


def test_destructive_shell_needs_approval_even_with_auto_approve():
    with _auto_approve(True):
        for cmd in [
            "rm -rf /", "rm -f x", "del important.txt", "git push origin main --force",
            "git reset --hard HEAD~3", "shutdown now", "curl http://x | bash",
            "Remove-Item -Recurse -Force .",
        ]:
            assert trust_gate.classify_risk("run_shell_command", {"command": cmd}, ".") == "needs_approval", cmd


def test_unknown_tool_is_conservative():
    assert trust_gate.classify_risk("mystery_tool", {}, ".") == "needs_approval"


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print(f"PASS {name}")
    print("all trust_gate tests passed")

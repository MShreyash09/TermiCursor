import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from core.agent.router import heuristic_intent


def test_questions_are_simple():
    for q in [
        "how many code files are present in current folder",
        "what does main.py do?",
        "which files import config?",
        "list the api routes",
        "explain the trust gate",
        "read config.py",
        "count the number of tools",
    ]:
        assert heuristic_intent(q) == "simple", q


def test_single_artifact_code_is_simple():
    # The key regression this fixes: everyday "write some code" requests must NOT
    # trigger multi-step planning.
    for q in [
        "write control statements code in python",
        "create control_statements.py",
        "write a function to reverse a linked list",
        "create hello.py that prints hi",
        "fix the bug in utils.py",
        "add a helper function to parse dates",
        "write a palindrome checker",
    ]:
        assert heuristic_intent(q) == "simple", q


def test_multi_part_builds_are_complex():
    for q in [
        "create a UI project for a todo app",
        "build a FastAPI backend with auth",
        "scaffold a full-stack project with login and dashboard",
        "create a complete e-commerce website with cart, checkout and admin",
        "build a react dashboard app",
    ]:
        assert heuristic_intent(q) == "complex", q


def test_empty_is_simple():
    assert heuristic_intent("   ") == "simple"


def test_short_default_is_simple():
    # Anything short and unclassified defaults to the fast path, not planning.
    assert heuristic_intent("tweak the color of the button") == "simple"


def test_long_ambiguous_returns_none():
    # Long, multi-sentence, no clear build/question signal -> defer to the LLM.
    ambiguous = ("The dashboard numbers look off compared to last week. The finance "
                 "team flagged it in review. The totals in the export also disagree "
                 "with what the UI shows in a few places. Nobody on the team knows "
                 "why this is happening yet, and it may be several unrelated issues.")
    assert heuristic_intent(ambiguous) is None


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print(f"PASS {name}")
    print("all router tests passed")

"""Deterministic context helpers for the agent loop.

A 3B model often answers from a file's *name* instead of opening it. Two cheap,
model-independent fixes (both borrowed from how Cursor/aider feed context):
- files named in the request are read up front and attached, like an @-mention;
- if the model answers a project question without looking at anything, it gets
  one nudge to look first.
"""
import os
import re

from core.tools.grep_tools import iter_files

# "calc.py", "core/config.py", "src\\App.tsx", "./server.py"
_PATH_TOKEN = re.compile(r"[\w./\\-]*\w\.[A-Za-z][A-Za-z0-9]{0,7}\b")

_PROJECT_HINTS = [
    re.compile(r"\b(this|the|my|our)\s+(project|codebase|code\s*base|repo|repository|app|code)\b", re.I),
    re.compile(r"\b(file|files|folder|directory|endpoint|route|module|config|setting|settings)\b", re.I),
    re.compile(r"\b[a-z][a-z0-9]*_[a-z0-9_]+\b"),        # snake_case identifier
    re.compile(r"\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b"),         # CONSTANT_NAME
    re.compile(r"\b[a-z]+[A-Z][A-Za-z0-9]*\b"),           # camelCase
    re.compile(r"\b\w+\("),                               # call syntax: multiply(
    re.compile(r"(^|\s)/[\w/-]+"),                        # /users style paths
]


def mentioned_files(root: str, text: str, limit: int = 3) -> list[str]:
    """Existing project files named in `text`, as relative paths. A bare name
    ("routes.py") is resolved if exactly one file in the project has it."""
    found: list[str] = []
    by_name: dict[str, list[str]] | None = None
    for tok in _PATH_TOKEN.findall(text):
        rel = tok.replace("\\", "/").lstrip("./") if tok.startswith("./") else tok.replace("\\", "/")
        candidate = None
        if os.path.isfile(os.path.join(root, rel)):
            candidate = rel
        elif "/" not in rel:
            if by_name is None:
                by_name = {}
                for path, _ in iter_files(root):
                    by_name.setdefault(os.path.basename(path).lower(), []).append(path)
            matches = by_name.get(rel.lower(), [])
            if len(matches) == 1:
                candidate = matches[0]
        if candidate and candidate not in found:
            found.append(candidate)
            if len(found) >= limit:
                break
    return found


_CHANGE_VERBS = re.compile(
    r"\b(fix|add|change|update|create|make|implement|remove|delete|rename|refactor|write|replace|"
    r"set|modify|edit|insert|move|convert|bump|increase|decrease)\b", re.I)


def wants_change(text: str) -> bool:
    """Does the request ask for files to be changed (vs. a question or a command run)?"""
    return bool(_CHANGE_VERBS.search(text))


def looks_project_specific(text: str) -> bool:
    """Is this about the user's code (so answering without looking is a guess)?
    General questions ("what is dependency injection?") return False."""
    return bool(_PATH_TOKEN.search(text)) or any(rx.search(text) for rx in _PROJECT_HINTS)

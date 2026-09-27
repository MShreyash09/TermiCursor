"""Exact-match search: grep (text in files) and find_files (file names).

These work immediately, with no index. Cursor and Claude Code both lean on exact
search first ("a function name, variable, error string"), and fall back to
semantic search for fuzzy, concept-level questions.
"""
import fnmatch
import os
import re

from pydantic import BaseModel, Field

from .base import Tool, ToolResult
from .fs_tools import _resolve_in_project

SKIP_DIRS = {".git", "node_modules", "__pycache__", "venv", ".venv", "dist", "build", ".next",
             ".cache", "coverage", ".idea", ".vscode", ".pytest_cache", ".mypy_cache"}
MAX_FILE_BYTES = 1_000_000


def iter_files(root: str, start: str = "."):
    """Yield (relative_path, absolute_path) for project files, skipping vendored/build dirs."""
    base = _resolve_in_project(root, start)
    if os.path.isfile(base):  # a single file (os.walk would silently yield nothing)
        yield os.path.relpath(base, root).replace(os.sep, "/"), base
        return
    for dirpath, dirs, files in os.walk(base):
        dirs[:] = sorted(d for d in dirs if d not in SKIP_DIRS and not d.startswith("."))
        for name in sorted(files):
            abs_path = os.path.join(dirpath, name)
            yield os.path.relpath(abs_path, root).replace(os.sep, "/"), abs_path


def grep(root: str, pattern: str, path: str = ".", glob: str | None = None,
         ignore_case: bool = True, max_results: int = 50, after: int = 0) -> tuple[list[str], int]:
    flags = re.IGNORECASE if ignore_case else 0
    try:
        rx = re.compile(pattern, flags)
    except re.error:  # not a valid regex: search for it literally
        rx = re.compile(re.escape(pattern), flags)
    hits, total = [], 0
    for rel, abs_path in iter_files(root, path):
        if glob and not fnmatch.fnmatch(os.path.basename(rel), glob) and not fnmatch.fnmatch(rel, glob):
            continue
        try:
            if os.path.getsize(abs_path) > MAX_FILE_BYTES:
                continue
            with open(abs_path, "r", encoding="utf-8") as f:
                lines = f.readlines()
            for n, line in enumerate(lines, 1):
                if rx.search(line):
                    total += 1
                    if len(hits) < max_results:
                        hits.append(f"{rel}:{n}: {line.rstrip()[:200]}")
                        # Context lines, e.g. the function under a matching decorator.
                        hits.extend(f"{rel}-{m}- {lines[m - 1].rstrip()[:200]}"
                                    for m in range(n + 1, min(len(lines), n + after) + 1))
        except (UnicodeDecodeError, OSError):
            continue  # binary or unreadable
    return hits, total


class GrepArgs(BaseModel):
    pattern: str = Field(..., description="Text or regex to find, e.g. a function name, variable, or error message.")
    path: str = Field(".", description="Folder (or file) to search in, relative to the project root.")
    glob: str | None = Field(None, description="Only search files matching this pattern, e.g. '*.py'.")
    after: int = Field(2, description="Lines of context to show after each match.", ge=0, le=10)


class GrepTool(Tool):
    name = "grep"
    description = ("Search file contents for text or a regex (case-insensitive). Returns file:line: text for each "
                   "match. Best way to find where something is defined or used.")
    args_model = GrepArgs

    async def run(self, args: GrepArgs, *, project_root: str) -> ToolResult:
        try:
            hits, total = grep(project_root, args.pattern, args.path, args.glob, after=args.after)
        except ValueError as e:
            return ToolResult(success=False, error=str(e))
        if not hits:
            return ToolResult(success=True, output=f"No matches for {args.pattern!r}.")
        more = f"\n... {total - len(hits)} more matches; narrow the pattern or path." if total > len(hits) else ""
        return ToolResult(success=True, output="\n".join(hits) + more)


class FindFilesArgs(BaseModel):
    pattern: str = Field(..., description="File name or glob, e.g. 'routes.py', '*.py', 'src/**/*.tsx'.")


class FindFilesTool(Tool):
    name = "find_files"
    description = "Find files by name or glob pattern anywhere in the project. Returns relative paths."
    args_model = FindFilesArgs

    async def run(self, args: FindFilesArgs, *, project_root: str) -> ToolResult:
        pat = args.pattern.replace("\\", "/")
        matches = [rel for rel, _ in iter_files(project_root)
                   if fnmatch.fnmatch(rel, pat) or fnmatch.fnmatch(os.path.basename(rel), pat)
                   or fnmatch.fnmatch(rel, f"**/{pat}")]
        if not matches:
            return ToolResult(success=True, output=f"No files match {args.pattern!r}.")
        shown = matches[:100]
        more = f"\n... {len(matches) - 100} more" if len(matches) > 100 else ""
        return ToolResult(success=True, output="\n".join(shown) + more)

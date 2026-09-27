import difflib
import json
import os
import re

from pydantic import BaseModel, Field

from .base import Tool, ToolResult

READ_PAGE_LINES = 200  # one read_file call returns at most this many lines


def _resolve_in_project(project_root: str, rel_path: str) -> str:
    """Resolve rel_path under project_root and refuse paths that escape it."""
    norm_root = os.path.normpath(os.path.abspath(project_root))
    abs_path = os.path.normpath(os.path.join(norm_root, rel_path))
    if os.path.commonpath([abs_path, norm_root]) != norm_root:
        raise ValueError(f"Path '{rel_path}' escapes the project directory.")
    return abs_path


def _read_keep_eol(abs_path: str) -> tuple[str, str]:
    """(text with \n newlines, the file's own newline) -- the model always works in \n."""
    with open(abs_path, "r", encoding="utf-8", errors="replace", newline="") as f:
        raw = f.read()
    eol = "\r\n" if "\r\n" in raw else "\n"
    return raw.replace("\r\n", "\n"), eol


def _write_eol(abs_path: str, text: str, eol: str = "\n") -> None:
    with open(abs_path, "w", encoding="utf-8", newline="") as f:
        f.write(text.replace("\r\n", "\n").replace("\n", eol))


def number_lines(text: str, offset: int = 1, limit: int = READ_PAGE_LINES, path: str = "",
                 partial_hint: bool = True) -> str:
    """File text as numbered lines ("  12| code"), one page at a time. Says so
    when the view is partial, so the model knows to read on instead of guessing."""
    lines = text.splitlines()
    total = len(lines)
    if total == 0:
        return f"{path} is empty."
    start = max(1, offset)
    if start > total:
        return f"{path} has only {total} lines."
    end = min(total, start + limit - 1)
    body = "\n".join(f"{n:>5}| {lines[n - 1]}" for n in range(start, end + 1))
    if start == 1 and end == total:
        return f"{path} ({total} lines):\n{body}"
    if not partial_hint:  # a snippet after an edit, not a read
        return f"{path} lines {start}-{end}:\n{body}"
    return (f"{path} lines {start}-{end} of {total} (PARTIAL view; call read_file with "
            f"offset={end + 1} to read more):\n{body}")


def syntax_report(path: str, text: str) -> str:
    """Quick check after a write, like an editor's red squiggle: catches the
    broken indentation / unbalanced brackets small models often produce."""
    try:
        if path.endswith(".py"):
            compile(text, path, "exec")
        elif path.endswith(".json"):
            json.loads(text)
        else:
            return ""
    except SyntaxError as e:
        return f"\nSYNTAX ERROR in {path} line {e.lineno}: {e.msg}. Fix it before moving on."
    except ValueError as e:
        return f"\nINVALID JSON in {path}: {e}. Fix it before moving on."
    return "\nSyntax check: OK."


class ReadFileArgs(BaseModel):
    path: str = Field(..., description="File path relative to the project root.")
    offset: int = Field(1, description="Line number to start from (1 = first line).", ge=1)
    limit: int = Field(READ_PAGE_LINES, description="Max lines to return.", ge=1, le=READ_PAGE_LINES)


class ReadFileTool(Tool):
    name = "read_file"
    description = (
        "Read a file in the project. Returns numbered lines (the numbers are not part of the file). "
        f"Long files come {READ_PAGE_LINES} lines at a time; use offset to read further."
    )
    args_model = ReadFileArgs

    async def run(self, args: ReadFileArgs, *, project_root: str) -> ToolResult:
        try:
            abs_path = _resolve_in_project(project_root, args.path)
        except ValueError as e:
            return ToolResult(success=False, error=str(e))
        if not os.path.isfile(abs_path):
            return ToolResult(success=False, error=f"File not found: {args.path}. Use find_files or list_dir to locate it.")
        try:
            with open(abs_path, "r", encoding="utf-8", errors="replace") as f:
                content = f.read()
            return ToolResult(success=True, output=number_lines(content, args.offset, args.limit, args.path),
                              data={"path": args.path})
        except Exception as e:
            return ToolResult(success=False, error=str(e))


class EditFileArgs(BaseModel):
    path: str = Field(..., description="File path relative to the project root.")
    old_string: str = Field(..., description="Exact existing text to replace, copied from read_file (without the line numbers). Empty string = add new_string at the end of the file.")
    new_string: str = Field(..., description="Text to put in its place.")
    replace_all: bool = Field(False, description="Replace every occurrence instead of exactly one.")


_LINE_NO_PREFIX = re.compile(r"^\s*\d+\| ?", re.MULTILINE)


def _occurrences(text: str, old: str) -> str:
    """Where an ambiguous old_string occurs, with the line above each one as an anchor."""
    lines, out, start = text.splitlines(), [], 0
    while (i := text.find(old, start)) != -1:
        n = text[:i].count("\n") + 1
        above = lines[n - 2].strip() if n >= 2 else ""
        out.append(f"line {n}" + (f" (after {above!r})" if above else ""))
        start = i + 1
    return ", ".join(out)


def _closest_hint(text: str, old: str) -> str:
    first = next((ln.strip() for ln in old.splitlines() if ln.strip()), "")
    lines = text.splitlines()
    match = difflib.get_close_matches(first, [ln.strip() for ln in lines], n=1, cutoff=0.5)
    if not match:
        return ""
    n = next(i for i, ln in enumerate(lines, 1) if ln.strip() == match[0])
    return f" Closest text in the file, line {n}: {lines[n - 1]!r}"


class EditFileTool(Tool):
    name = "edit_file"
    description = (
        "Change part of an existing file: replaces old_string with new_string. old_string must match the "
        "file exactly and appear once (add surrounding lines to make it unique). To add code at the END of "
        "a file (e.g. a new function), use an empty old_string. Use this, not write_file, to modify existing files."
    )
    args_model = EditFileArgs

    async def run(self, args: EditFileArgs, *, project_root: str) -> ToolResult:
        try:
            abs_path = _resolve_in_project(project_root, args.path)
        except ValueError as e:
            return ToolResult(success=False, error=str(e))
        if not os.path.isfile(abs_path):
            return ToolResult(success=False, error=f"File not found: {args.path}. Use write_file to create a new file.")
        text, eol = _read_keep_eol(abs_path)

        old, new = args.old_string.replace("\r\n", "\n"), args.new_string.replace("\r\n", "\n")
        if not old.strip():
            if new.strip() and new.strip() in text:
                # A later plan step re-adding what an earlier step added: don't duplicate it.
                return ToolResult(success=False, error=(
                    f"That code is already in {args.path} (line {text[:text.index(new.strip())].count(chr(10)) + 1}); "
                    "nothing to add. If this step is done, finish with a final_answer."))
            # Append: the easy way for a small model to "add a function" without an anchor.
            sep = "" if not text.strip() or text.endswith("\n\n") else ("\n" if text.endswith("\n") else "\n\n")
            updated = text + sep + new + ("" if new.endswith("\n") else "\n")
            _write_eol(abs_path, updated, eol)
            first_line = len((text + sep).splitlines()) + 1
            shown = number_lines(updated, first_line, new.count("\n") + 2, args.path, partial_hint=False)
            return ToolResult(
                success=True,
                output=f"Appended to {args.path}.\n{shown}{syntax_report(args.path, updated)}",
                data={"path": args.path, "bytes": len(updated)},
            )
        if old not in text:
            # Small models often paste read_file's "  12| " prefixes into the strings.
            stripped_old = _LINE_NO_PREFIX.sub("", old)
            if stripped_old and stripped_old in text:
                old, new = stripped_old, _LINE_NO_PREFIX.sub("", new)
        count = text.count(old)
        if count == 0:
            return ToolResult(success=False, error=(
                f"old_string was not found in {args.path}. Copy the exact text (same indentation, no line "
                f"numbers).{_closest_hint(text, old)}"))
        if count > 1 and not args.replace_all:
            return ToolResult(success=False, error=(
                f"old_string appears {count} times in {args.path}: {_occurrences(text, old)}. Include the line "
                "above it in old_string (and new_string) so it matches only the one you mean."))

        updated = text.replace(old, new) if args.replace_all else text.replace(old, new, 1)
        _write_eol(abs_path, updated, eol)
        # Show the edited region so the model can confirm the result without another read.
        first_line = text[: text.index(old)].count("\n") + 1
        shown = number_lines(updated, max(1, first_line - 2), new.count("\n") + 5, args.path, partial_hint=False)
        n = count if args.replace_all else 1
        return ToolResult(
            success=True,
            output=f"Edited {args.path}: replaced {n} occurrence(s).\n{shown}{syntax_report(args.path, updated)}",
            data={"path": args.path, "bytes": len(updated)},
        )


class WriteFileArgs(BaseModel):
    path: str = Field(..., description="File path relative to the project root.")
    content: str = Field(..., description="Full contents to write to the file.")


class WriteFileTool(Tool):
    name = "write_file"
    description = (
        "Create a NEW file with the given full contents (parent folders are created). "
        "To change an existing file use edit_file; write_file replaces everything in it."
    )
    args_model = WriteFileArgs

    async def run(self, args: WriteFileArgs, *, project_root: str) -> ToolResult:
        try:
            abs_path = _resolve_in_project(project_root, args.path)
        except ValueError as e:
            return ToolResult(success=False, error=str(e))
        try:
            parent = os.path.dirname(abs_path)
            if parent and not os.path.exists(parent):
                os.makedirs(parent, exist_ok=True)
            eol = _read_keep_eol(abs_path)[1] if os.path.isfile(abs_path) else "\n"
            _write_eol(abs_path, args.content, eol)
            return ToolResult(
                success=True,
                output=f"Wrote {len(args.content)} bytes to {args.path}{syntax_report(args.path, args.content)}",
                data={"path": args.path, "bytes": len(args.content)},
            )
        except Exception as e:
            return ToolResult(success=False, error=str(e))


class ListDirArgs(BaseModel):
    path: str = Field(".", description="Directory path relative to the project root.")


class ListDirTool(Tool):
    name = "list_dir"
    description = "List files and subdirectories in a directory of the project."
    args_model = ListDirArgs

    _IGNORED = {"node_modules", "__pycache__", "venv", ".venv", "dist", "build", ".git"}

    async def run(self, args: ListDirArgs, *, project_root: str) -> ToolResult:
        try:
            abs_path = _resolve_in_project(project_root, args.path)
        except ValueError as e:
            return ToolResult(success=False, error=str(e))
        if not os.path.isdir(abs_path):
            return ToolResult(success=False, error=f"Not a directory: {args.path}")
        try:
            entries = []
            for name in sorted(os.listdir(abs_path)):
                if name in self._IGNORED:
                    continue
                full = os.path.join(abs_path, name)
                entries.append(f"{name}/" if os.path.isdir(full) else name)
            return ToolResult(success=True, output="\n".join(entries) or "(empty)")
        except Exception as e:
            return ToolResult(success=False, error=str(e))


class DeleteFileArgs(BaseModel):
    path: str = Field(..., description="File path relative to the project root.")


class DeleteFileTool(Tool):
    name = "delete_file"
    description = "Delete a single file from the project."
    args_model = DeleteFileArgs

    async def run(self, args: DeleteFileArgs, *, project_root: str) -> ToolResult:
        try:
            abs_path = _resolve_in_project(project_root, args.path)
        except ValueError as e:
            return ToolResult(success=False, error=str(e))
        if not os.path.isfile(abs_path):
            return ToolResult(success=False, error=f"File not found: {args.path}")
        try:
            os.remove(abs_path)
            return ToolResult(success=True, output=f"Deleted {args.path}", data={"path": args.path})
        except Exception as e:
            return ToolResult(success=False, error=str(e))

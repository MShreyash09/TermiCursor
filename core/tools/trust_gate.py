"""Trust gate: classify a proposed tool call as safe or needs_approval.

Safe actions run autonomously; needs_approval actions pause the agent loop and
emit an approval request the human must accept before the tool executes.
"""
import os
import re
from typing import Literal

Risk = Literal["safe", "needs_approval"]

_DESTRUCTIVE_SHELL = [
    r"\brm\b\s+-[a-z]*r",
    r"\brm\b\s+-[a-z]*f",
    r"\brmdir\b",
    r"\bdel\b",
    r"\brd\b\s+/s",
    r"Remove-Item",
    r"\bformat\b",
    r"\bmkfs\b",
    r"git\s+push\s+.*--force",
    r"git\s+push\s+.*-f\b",
    r"git\s+reset\s+--hard",
    r"git\s+clean\s+-[a-z]*f",
    r"\b(shutdown|reboot|halt)\b",
    r":\(\)\s*\{",
    r"\bcurl\b.*\|\s*(sh|bash)",
    r"\bdd\b\s+if=",
    r">\s*/dev/sd",
]
_DESTRUCTIVE_RE = re.compile("|".join(_DESTRUCTIVE_SHELL), re.IGNORECASE)

_ALWAYS_SAFE = {
    "read_file", "list_dir", "search_codebase", "grep", "find_files",
    "browser_navigate", "browser_click", "browser_get_text",
    "load_skill", "mcp_find",
}


def auto_approve_shell() -> bool:
    """Settings → "Auto-approve shell commands" (off by default). Read on every
    call so toggling it applies to the next command."""
    from core.config import load_settings
    return bool(load_settings().get("autoApproveShell"))


def _path_escapes_project(project_root: str, rel_path: str) -> bool:
    norm_root = os.path.normpath(os.path.abspath(project_root))
    abs_path = os.path.normpath(os.path.join(norm_root, rel_path or "."))
    try:
        return os.path.commonpath([abs_path, norm_root]) != norm_root
    except ValueError:
        return True


def classify_risk(tool_name: str, args: dict, project_root: str) -> Risk:
    if tool_name in _ALWAYS_SAFE:
        return "safe"

    if tool_name in ("write_file", "edit_file", "delete_file"):
        path = (args or {}).get("path", "")
        if _path_escapes_project(project_root, path):
            return "needs_approval"
        return "needs_approval" if tool_name == "delete_file" else "safe"

    if tool_name == "run_shell_command":
        # The blocklist can't catch everything (e.g. `python -c "shutil.rmtree(...)"`),
        # and the agent reads untrusted text (repo files, web pages) that may try to
        # steer it, so every command asks unless the user opted in to auto-approve.
        # Commands matching the blocklist always ask.
        command = (args or {}).get("command", "")
        if _DESTRUCTIVE_RE.search(command) or not auto_approve_shell():
            return "needs_approval"
        return "safe"

    return "needs_approval"

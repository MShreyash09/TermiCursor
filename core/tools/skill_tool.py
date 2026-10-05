"""Skills: SKILL.md instruction packs the agent loads on demand.

A skill is <dir>/<name>/SKILL.md with a small frontmatter header:
    ---
    name: react-testing
    description: How this team writes React tests
    ---
    <instructions...>

Looked up in <APP_DATA_DIR>/skills (global) and <project>/.termicursor/skills (per project,
wins on a name clash). Only name + description go in the prompt; the body is read with
load_skill when needed, so many skills cost the prompt almost nothing.
"""
import os
import re

from pydantic import BaseModel, Field

from core.config import APP_DATA_DIR
from .base import Tool, ToolResult
from .mcp_tools import servers_text

_MAX_SKILL_CHARS = 3_000


def _skill_dirs(project_path: str) -> list[str]:
    return [os.path.join(APP_DATA_DIR, "skills"),
            os.path.join(project_path, ".termicursor", "skills")]


def _parse(path: str) -> tuple[dict, str]:
    with open(path, "r", encoding="utf-8") as f:
        text = f.read()
    meta = {}
    if text.startswith("---"):
        header, _, text = text[3:].partition("\n---")
        for line in header.splitlines():
            key, sep, value = line.partition(":")
            if sep:
                meta[key.strip()] = value.strip()
    return meta, text.strip()


def list_skills(project_path: str) -> dict[str, tuple[str, str]]:
    """name -> (description, path). Later dirs (project) override earlier (global)."""
    found = {}
    for d in _skill_dirs(project_path):
        if not os.path.isdir(d):
            continue
        for entry in sorted(os.listdir(d)):
            path = os.path.join(d, entry, "SKILL.md")
            if os.path.isfile(path):
                try:
                    meta, _ = _parse(path)
                except Exception:
                    continue
                found[meta.get("name") or entry] = (meta.get("description", ""), path)
    return found


def extensions_text(project_path: str) -> str:
    """Skills + MCP servers block for the prompts; empty when nothing is installed."""
    parts = []
    skills = list_skills(project_path)
    if skills:
        parts.append("Skills (instructions you can load with load_skill when relevant):\n"
                     + "\n".join(f"- {n}: {d}" for n, (d, _) in skills.items()))
    mcp = servers_text()
    if mcp:
        parts.append(mcp)
    return "\n\n".join(parts)


class LoadSkillArgs(BaseModel):
    name: str = Field(..., description="Skill name from the Skills list.")


class LoadSkillTool(Tool):
    name = "load_skill"
    description = "Load a skill's instructions by name. Use it when a listed skill fits the task."
    args_model = LoadSkillArgs

    def __init__(self, project_path: str):
        self._project_path = project_path

    async def run(self, args: LoadSkillArgs, *, project_root: str) -> ToolResult:
        skills = list_skills(self._project_path)
        if args.name not in skills:
            return ToolResult(success=False, error=f"No skill {args.name!r}. Available: {list(skills)}")
        _, body = _parse(skills[args.name][1])
        if len(body) > _MAX_SKILL_CHARS:
            body = body[:_MAX_SKILL_CHARS] + "\n... (skill truncated)"
        return ToolResult(success=True, output=body)


# ── Global skills, edited from the Settings page (server.py /skills) ──
_NAME_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$")


def _global_path(name: str) -> str:
    if not _NAME_RE.match(name or ""):
        raise ValueError("Skill names use lowercase letters, digits, - and _ (max 64).")
    return os.path.join(APP_DATA_DIR, "skills", name, "SKILL.md")


def global_skills() -> list[dict]:
    d = os.path.join(APP_DATA_DIR, "skills")
    out = []
    for entry in sorted(os.listdir(d)) if os.path.isdir(d) else []:
        path = os.path.join(d, entry, "SKILL.md")
        if os.path.isfile(path):
            meta, body = _parse(path)
            out.append({"name": entry, "description": meta.get("description", ""), "body": body})
    return out


def save_skill(name: str, description: str, body: str) -> None:
    path = _global_path(name)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    description = " ".join(description.split())  # one line, so it can't break the frontmatter
    with open(path, "w", encoding="utf-8") as f:
        f.write(f"---\nname: {name}\ndescription: {description}\n---\n{body.strip()}\n")


def delete_skill(name: str) -> None:
    path = _global_path(name)
    if os.path.isfile(path):
        os.remove(path)
        if not os.listdir(os.path.dirname(path)):
            os.rmdir(os.path.dirname(path))

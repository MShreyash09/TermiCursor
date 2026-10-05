from .base import Tool
from .fs_tools import ReadFileTool, WriteFileTool, EditFileTool, ListDirTool, DeleteFileTool
from .grep_tools import GrepTool, FindFilesTool
from .shell_tool import RunShellCommandTool
from .search_tool import SearchCodebaseTool
from .browser_tools import BrowserNavigateTool, BrowserClickTool, BrowserGetTextTool
from .mcp_tools import McpFindTool, McpCallTool, servers
from .skill_tool import LoadSkillTool, list_skills


def build_registry(project_path: str, session_id: str, video_dir: str) -> dict[str, Tool]:
    """Instantiate the tool set for one agent session.

    `video_dir` is the session's artifact directory — Playwright records the
    entire browser session there automatically (see browser_tools.py); the
    tools themselves never touch pixels, only extracted text/errors.
    """
    # Order matters a little for small models: find/read tools first, then edits.
    tools: list[Tool] = [
        GrepTool(),
        FindFilesTool(),
        ListDirTool(),
        ReadFileTool(),
        SearchCodebaseTool(project_path),
        EditFileTool(),
        WriteFileTool(),
        DeleteFileTool(),
        RunShellCommandTool(),
        BrowserNavigateTool(session_id, video_dir),
        BrowserClickTool(session_id, video_dir),
        BrowserGetTextTool(session_id, video_dir),
    ]
    # Only when installed, so the prompt is unchanged for users without skills/MCP.
    if list_skills(project_path):
        tools.append(LoadSkillTool(project_path))
    if servers():
        tools += [McpFindTool(), McpCallTool()]
    return {t.name: t for t in tools}


def tools_schema_text(registry: dict[str, Tool]) -> str:
    """Render the tool schemas as text for the executor system prompt."""
    lines = []
    for tool in registry.values():
        schema = tool.json_schema()
        params = schema["parameters"].get("properties", {})
        required = set(schema["parameters"].get("required", []))
        arg_descs = []
        for pname, pinfo in params.items():
            req = " (required)" if pname in required else ""
            desc = pinfo.get("description", "")
            arg_descs.append(f'      - {pname}{req}: {desc}')
        args_block = "\n".join(arg_descs) if arg_descs else "      (no arguments)"
        lines.append(f"- {tool.name}: {tool.description}\n    args:\n{args_block}")
    return "\n".join(lines)

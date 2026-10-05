"""MCP (Model Context Protocol) servers as agent tools. "Connectors" are just MCP servers.

Servers come from settings.json, the same shape Claude Desktop uses:
    "mcpServers": {"github": {"command": "npx", "args": [...], "env": {...}},
                   "docs":   {"url": "https://example.com/mcp"}}

Small local models can't cope with dozens of extra tool schemas in the prompt, so instead
of one agent tool per MCP tool there are two meta-tools: mcp_find looks tools up by
keyword and returns only the few matching schemas, mcp_call runs one. The prompt stays
the same size however many servers are configured.
"""
import json
import re

from mcp import Client, StdioServerParameters
from pydantic import BaseModel, Field

from core.config import load_settings
from .base import Tool, ToolResult

_MAX_OUTPUT_CHARS = 4_000
_tool_cache: dict[str, list] = {}  # 'name:config' -> list of mcp_types.Tool


def servers() -> dict:
    """Configured MCP servers, read fresh so Settings edits apply to the next session."""
    s = load_settings().get("mcpServers")
    return s if isinstance(s, dict) else {}


def _target(cfg):
    if not isinstance(cfg, dict):
        return cfg  # already a Client target (tests pass an in-process MCPServer)
    if cfg.get("url"):
        return cfg["url"]
    return StdioServerParameters(command=cfg["command"], args=cfg.get("args") or [],
                                 env=cfg.get("env"), cwd=cfg.get("cwd"))


# ponytail: one connection per call (stdio servers respawn each time). Fine for stateless
# connectors (GitHub, docs, DBs); a stateful server (e.g. a browser) needs a long-lived
# per-server task owning the Client.
async def _list_tools(name: str) -> list:
    cfg = servers()[name]
    key = f"{name}:{cfg!r}"  # editing a server's config in Settings drops its stale tool list
    if key not in _tool_cache:
        async with Client(_target(cfg)) as client:
            _tool_cache[key] = (await client.list_tools()).tools
    return _tool_cache[key]


def servers_text() -> str:
    names = list(servers())
    if not names:
        return ""
    return (f"MCP servers (external tools): {', '.join(names)}. "
            "Use mcp_find to look up a tool, then mcp_call to run it.")


class McpFindArgs(BaseModel):
    query: str = Field(..., description="What you want to do, e.g. 'create github issue'.")


class McpFindTool(Tool):
    name = "mcp_find"
    description = "Find tools on the connected MCP servers. Returns the best matches with their args."
    args_model = McpFindArgs

    async def run(self, args: McpFindArgs, *, project_root: str) -> ToolResult:
        words = set(re.findall(r"[a-z0-9]+", args.query.lower()))
        scored, errors = [], []
        for server in servers():
            try:
                tools = await _list_tools(server)
            except Exception as e:
                errors.append(f"{server}: {e}")
                continue
            for t in tools:
                text = f"{server} {t.name} {t.description or ''}".lower().replace("_", " ")
                score = sum(1 for w in words if w in text)
                if score:
                    scored.append((score, server, t))
        scored.sort(key=lambda x: -x[0])
        lines = [
            f"- server={server} tool={t.name}: {(t.description or '').strip()[:200]}\n"
            f"  args schema: {json.dumps(t.input_schema.get('properties', {}))[:600]}"
            for _, server, t in scored[:3]
        ]
        if errors:
            lines.append("Unreachable servers: " + "; ".join(errors))
        return ToolResult(success=True, output="\n".join(lines) or "No matching MCP tools.")


class McpCallArgs(BaseModel):
    server: str = Field(..., description="Server name from mcp_find.")
    tool: str = Field(..., description="Tool name from mcp_find.")
    args: dict = Field(default_factory=dict, description="Arguments matching the tool's args schema.")


class McpCallTool(Tool):
    name = "mcp_call"
    description = "Run a tool on an MCP server (find it with mcp_find first)."
    args_model = McpCallArgs

    async def run(self, args: McpCallArgs, *, project_root: str) -> ToolResult:
        cfg = servers().get(args.server)
        if cfg is None:
            return ToolResult(success=False, error=f"Unknown MCP server {args.server!r}. Known: {list(servers())}")
        try:
            async with Client(_target(cfg)) as client:
                result = await client.call_tool(args.tool, args.args)
        except Exception as e:
            return ToolResult(success=False, error=f"MCP call failed: {e}")
        parts = [getattr(c, "text", None) or f"<{c.type} content>" for c in result.content]
        if not parts and result.structured_content is not None:
            parts = [json.dumps(result.structured_content)]
        output = "\n".join(parts)
        if len(output) > _MAX_OUTPUT_CHARS:
            output = output[:_MAX_OUTPUT_CHARS] + "\n... (output truncated)"
        if result.is_error:
            return ToolResult(success=False, error=output or "MCP tool reported an error.")
        return ToolResult(success=True, output=output or "(no output)")

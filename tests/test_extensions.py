import asyncio
import os
import sys
import tempfile

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# Point all app data at a throwaway dir BEFORE importing the modules that read it.
os.environ["TERMICURSOR_USER_DATA"] = tempfile.mkdtemp(prefix="lc_ext_test_")

from mcp.server.mcpserver import MCPServer

from core.tools import mcp_tools, skill_tool
from core.tools.registry import build_registry


def _write_skill(root, name, desc, body):
    d = os.path.join(root, ".termicursor", "skills", name)
    os.makedirs(d)
    with open(os.path.join(d, "SKILL.md"), "w", encoding="utf-8") as f:
        f.write(f"---\nname: {name}\ndescription: {desc}\n---\n{body}\n")


def test_skills_listed_and_loaded():
    proj = tempfile.mkdtemp()
    assert skill_tool.extensions_text(proj) == ""
    assert "load_skill" not in build_registry(proj, "s1", tempfile.mkdtemp())

    _write_skill(proj, "pytest-style", "How we write tests", "Use plain asserts.")
    assert "- pytest-style: How we write tests" in skill_tool.extensions_text(proj)
    tool = build_registry(proj, "s1", tempfile.mkdtemp())["load_skill"]
    r = asyncio.run(tool.run(tool.validate_args({"name": "pytest-style"}), project_root=proj))
    assert r.success and r.output == "Use plain asserts."
    r = asyncio.run(tool.run(tool.validate_args({"name": "nope"}), project_root=proj))
    assert not r.success


def test_mcp_find_and_call(monkeypatch):
    calc = MCPServer("calc")

    @calc.tool()
    def add(a: int, b: int) -> int:
        """Add two numbers."""
        return a + b

    monkeypatch.setattr(mcp_tools, "servers", lambda: {"calc": calc})
    mcp_tools._tool_cache.clear()

    found = asyncio.run(mcp_tools.McpFindTool().run(mcp_tools.McpFindArgs(query="add numbers"), project_root="."))
    assert "server=calc tool=add" in found.output and '"a"' in found.output

    call = mcp_tools.McpCallTool()
    r = asyncio.run(call.run(call.validate_args({"server": "calc", "tool": "add", "args": {"a": 1, "b": 2}}),
                             project_root="."))
    assert r.success and r.output.strip() == "3", r
    r = asyncio.run(call.run(call.validate_args({"server": "missing", "tool": "add"}), project_root="."))
    assert not r.success


def test_skills_api_crud():
    os.environ.pop("TERMICURSOR_TOKEN", None)
    import importlib
    import server
    from fastapi.testclient import TestClient
    client = TestClient(importlib.reload(server).app)

    assert client.put("/skills/api-style", json={"description": "line one\nline two", "body": "Use pydantic."}).status_code == 200
    skills = client.get("/skills").json()
    assert {"name": "api-style", "description": "line one line two", "body": "Use pydantic."} in skills
    # The agent sees it too (global skills apply to every project).
    assert "- api-style: line one line two" in skill_tool.extensions_text(tempfile.mkdtemp())

    for bad in ("Bad Name", "..", "a" * 65):
        assert client.put(f"/skills/{bad}", json={}).status_code in (400, 404, 405)
    assert client.delete("/skills/api-style").status_code == 200
    assert all(s["name"] != "api-style" for s in client.get("/skills").json())

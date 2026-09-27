import asyncio
import os

from pydantic import BaseModel, Field

from .base import Tool, ToolResult
from .fs_tools import _resolve_in_project
from core.config import SHELL_TIMEOUT_SEC

_MAX_OUTPUT_CHARS = 20_000


class RunShellArgs(BaseModel):
    command: str = Field(..., description="The shell command to run.")
    cwd: str = Field(".", description="Working directory relative to the project root.")
    timeout_sec: int = Field(SHELL_TIMEOUT_SEC, description="Kill the command after this many seconds.", ge=1, le=600)


class RunShellCommandTool(Tool):
    name = "run_shell_command"
    description = (
        "Run a shell command in the project directory and return its stdout, "
        "stderr, and exit code. Use for builds, tests, running programs, git, etc."
    )
    args_model = RunShellArgs

    async def run(self, args: RunShellArgs, *, project_root: str) -> ToolResult:
        root_name = os.path.basename(os.path.normpath(project_root))
        if args.cwd.strip("/\\") == root_name and not os.path.isdir(os.path.join(project_root, args.cwd)):
            args.cwd = "."  # "my-project" means the project root, not a subfolder of it
        try:
            cwd = _resolve_in_project(project_root, args.cwd)
        except ValueError as e:
            return ToolResult(success=False, error=str(e))
        if not os.path.isdir(cwd):
            return ToolResult(success=False, error=f"Working directory does not exist: {args.cwd}")

        try:
            proc = await asyncio.create_subprocess_shell(
                args.command,
                cwd=cwd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
            )
        except Exception as e:
            return ToolResult(success=False, error=f"Failed to start command: {e}")

        try:
            stdout_data, _ = await asyncio.wait_for(proc.communicate(), timeout=args.timeout_sec)
        except asyncio.TimeoutError:
            try:
                proc.kill()
            except ProcessLookupError:
                pass
            return ToolResult(
                success=False,
                error=f"Command timed out after {args.timeout_sec}s and was killed.",
                data={"command": args.command, "timed_out": True},
            )

        output = (stdout_data or b"").decode("utf-8", errors="replace")
        if len(output) > _MAX_OUTPUT_CHARS:
            output = output[:_MAX_OUTPUT_CHARS] + "\n... (output truncated)"

        exit_code = proc.returncode
        result_text = f"$ {args.command}\n(exit code {exit_code})\n{output}".strip()
        return ToolResult(
            success=(exit_code == 0),
            output=result_text,
            error=None if exit_code == 0 else f"Command exited with code {exit_code}",
            data={"command": args.command, "exit_code": exit_code, "cwd": args.cwd},
        )

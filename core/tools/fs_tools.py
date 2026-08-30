import os

from pydantic import BaseModel, Field

from .base import Tool, ToolResult


def _resolve_in_project(project_root: str, rel_path: str) -> str:
    """Resolve rel_path under project_root and refuse paths that escape it."""
    norm_root = os.path.normpath(os.path.abspath(project_root))
    abs_path = os.path.normpath(os.path.join(norm_root, rel_path))
    if os.path.commonpath([abs_path, norm_root]) != norm_root:
        raise ValueError(f"Path '{rel_path}' escapes the project directory.")
    return abs_path


class ReadFileArgs(BaseModel):
    path: str = Field(..., description="File path relative to the project root.")


class ReadFileTool(Tool):
    name = "read_file"
    description = "Read and return the full text contents of a file in the project."
    args_model = ReadFileArgs

    async def run(self, args: ReadFileArgs, *, project_root: str) -> ToolResult:
        try:
            abs_path = _resolve_in_project(project_root, args.path)
        except ValueError as e:
            return ToolResult(success=False, error=str(e))
        if not os.path.isfile(abs_path):
            return ToolResult(success=False, error=f"File not found: {args.path}")
        try:
            with open(abs_path, "r", encoding="utf-8", errors="replace") as f:
                content = f.read()
            return ToolResult(success=True, output=content, data={"path": args.path})
        except Exception as e:
            return ToolResult(success=False, error=str(e))


class WriteFileArgs(BaseModel):
    path: str = Field(..., description="File path relative to the project root.")
    content: str = Field(..., description="Full contents to write to the file.")


class WriteFileTool(Tool):
    name = "write_file"
    description = "Create or overwrite a file with the given contents. Parent dirs are created."
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
            with open(abs_path, "w", encoding="utf-8") as f:
                f.write(args.content)
            return ToolResult(
                success=True,
                output=f"Wrote {len(args.content)} bytes to {args.path}",
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

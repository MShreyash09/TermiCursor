import asyncio

from pydantic import BaseModel, Field

from .base import Tool, ToolResult

# rag.py (top-level, trimmed to retrieval-only) already owns ingestion + the
# Qdrant-backed retriever; this tool just wraps it for the agent loop.
import rag


class SearchCodebaseArgs(BaseModel):
    query: str = Field(..., description="Natural-language description of the code to find.")
    k: int = Field(6, description="Number of code chunks to retrieve.", ge=1, le=20)


class SearchCodebaseTool(Tool):
    name = "search_codebase"
    description = (
        "Semantically search the indexed codebase and return the most relevant "
        "code chunks with their source file paths. Requires the project to be ingested."
    )
    args_model = SearchCodebaseArgs

    def __init__(self, project_path: str):
        self._project_path = project_path

    async def run(self, args: SearchCodebaseArgs, *, project_root: str) -> ToolResult:
        retriever = rag.get_retriever(self._project_path, k=args.k)
        if retriever is None:
            return ToolResult(
                success=False,
                error="Codebase not indexed yet. Run ingestion first.",
            )
        try:
            docs = await asyncio.to_thread(retriever.invoke, args.query)
        except Exception as e:
            return ToolResult(success=False, error=str(e))

        if not docs:
            return ToolResult(success=True, output="(no relevant code found)")

        parts, sources = [], set()
        for doc in docs:
            src = doc.metadata.get("source", "unknown")
            sources.add(src)
            parts.append(f"[File: {src}]\n{doc.page_content}")
        return ToolResult(
            success=True,
            output="\n\n".join(parts),
            data={"sources": sorted(sources)},
        )

import asyncio
import re

from pydantic import BaseModel, Field

from .base import Tool, ToolResult
from .grep_tools import grep

# rag.py (top-level, trimmed to retrieval-only) already owns ingestion + the
# Qdrant-backed retriever; this tool just wraps it for the agent loop.
import rag


_STOPWORDS = {"the", "a", "an", "and", "or", "of", "to", "in", "is", "are", "what", "which", "where",
              "how", "does", "do", "for", "with", "that", "this", "it", "code", "file", "function", "set"}


def _keyword_fallback(project_root: str, query: str) -> ToolResult:
    words = [w for w in re.findall(r"[A-Za-z_][A-Za-z0-9_]{2,}", query) if w.lower() not in _STOPWORDS]
    if not words:
        return ToolResult(success=True, output="(no index yet, and no searchable words in the query; try grep)")
    hits, _ = grep(project_root, "|".join(re.escape(w) for w in words[:6]), max_results=20, after=2)
    note = "(Semantic index not built yet; showing text matches instead. Use grep for exact searches.)\n"
    return ToolResult(success=True, output=note + ("\n".join(hits) if hits else "No matches."))


class SearchCodebaseArgs(BaseModel):
    query: str = Field(..., description="Natural-language description of the code to find.")
    k: int = Field(6, description="Number of code chunks to retrieve.", ge=1, le=20)


class SearchCodebaseTool(Tool):
    name = "search_codebase"
    description = (
        "Search the code by meaning, for concept questions like 'where is auth handled'. "
        "Returns relevant code chunks with file paths. For exact names or strings, use grep."
    )
    args_model = SearchCodebaseArgs

    def __init__(self, project_path: str):
        self._project_path = project_path

    async def run(self, args: SearchCodebaseArgs, *, project_root: str) -> ToolResult:
        retriever = rag.get_retriever(self._project_path, k=args.k)
        if retriever is None:
            # No index (e.g. the CLI never ingests). An error here made the model give up
            # ("please run ingestion"), so fall back to a word search instead.
            return _keyword_fallback(project_root, args.query)
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

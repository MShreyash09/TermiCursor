"""Codebase ingestion + retrieval.

Trimmed to retrieval-only: chat/query execution and file-edit tag parsing now
live in core/agent/ (a real, validated tool-calling loop) instead of the old
[CREATE_FILE]/[DELETE_FILE] text-tag scraping. Folder-scoped persistent memory
lives in core/memory/project_memory.py.
"""
import os
import sys
import re
import hashlib

# Ensure stdout/stderr supports UTF-8 on Windows
if sys.platform.startswith('win'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except AttributeError:
        pass

from langchain_community.document_loaders.generic import GenericLoader
from langchain_community.document_loaders.parsers import LanguageParser
from langchain_text_splitters import RecursiveCharacterTextSplitter, Language

from langchain_ollama import OllamaEmbeddings
from langchain_qdrant import QdrantVectorStore
from qdrant_client import QdrantClient

from core.config import QDRANT_PATH, EMBED_MODEL, OLLAMA_URL, LLM_MODEL, LLM_PROVIDER

_SUFFIXES = [".py", ".js", ".jsx", ".ts", ".tsx"]
_EXCLUDE = [
    "**/node_modules/**", "**/venv/**", "**/.venv/**", "**/__pycache__/**",
    "**/.git/**", "**/dist/**", "**/build/**",
]
_LANG_MAP = {
    "python": Language.PYTHON,
    "js": Language.JS,
    "jsx": Language.JS,
    "ts": Language.TS,
    "tsx": Language.TS,
}


def get_collection_name(project_path: str) -> str:
    abs_path = os.path.abspath(project_path)
    path_hash = hashlib.md5(abs_path.encode('utf-8')).hexdigest()[:6]
    folder_name = os.path.basename(os.path.normpath(abs_path))
    clean_name = re.sub(r'[^a-zA-Z0-9_]', '_', folder_name).lower() or "default_codebase"
    return f"{clean_name}_{path_hash}"


def get_project_tree(project_path: str, max_depth: int = 2, max_files: int = 100) -> str:
    try:
        tree, num_files = [], 0
        start_level = project_path.count(os.sep)
        for root, dirs, files in os.walk(project_path):
            dirs[:] = [
                d for d in dirs
                if not d.startswith('.')
                and d not in {'node_modules', '__pycache__', 'venv', 'dist', 'build'}
            ]
            level = root.count(os.sep) - start_level
            if level > max_depth:
                continue
            indent = ' ' * 4 * level
            tree.append(f"{indent}{os.path.basename(root) or root}/")
            sub = ' ' * 4 * (level + 1)
            for f in files:
                if f.startswith('.'):
                    continue
                tree.append(f"{sub}{f}")
                num_files += 1
                if num_files >= max_files:
                    tree.append(f"{sub}... (truncated)")
                    return "\n".join(tree)
        return "\n".join(tree)
    except Exception as e:
        return f"Could not load file tree: {e}"


def get_ollama_status() -> dict:
    """Checks Ollama status and returns a dict with missing models."""
    import requests
    try:
        response = requests.get(f"{OLLAMA_URL}/api/tags", timeout=5)
        if response.status_code != 200:
            return {"status": "error", "reason": "ollama_error", "ollama_ready": False, "missing_models": []}

        models = [m['name'] for m in response.json().get('models', [])]
        missing = []
        if not any(EMBED_MODEL in m for m in models):
            missing.append(EMBED_MODEL)
        if LLM_PROVIDER == "ollama" and not any(LLM_MODEL in m for m in models):
            missing.append(LLM_MODEL)

        if missing:
            return {"status": "error", "reason": "missing_models", "ollama_ready": True,
                    "missing_models": missing, "available_models": models}
        return {"status": "ok", "ollama_ready": True, "missing_models": [], "available_models": models}
    except requests.exceptions.ConnectionError:
        return {"status": "error", "reason": "connection_error", "ollama_ready": False, "missing_models": []}


def ingest_codebase(project_path: str) -> dict:
    if not os.path.exists(project_path):
        return {"status": "error", "message": f"Path '{project_path}' does not exist."}

    collection_name = get_collection_name(project_path)
    client = QdrantClient(path=QDRANT_PATH)
    exists = client.collection_exists(collection_name)
    client.close()
    if exists:
        return {"status": "success", "message": "Existing embeddings loaded.", "collection": collection_name}

    loader = GenericLoader.from_filesystem(
        project_path, glob="**/*", suffixes=_SUFFIXES, exclude=_EXCLUDE, parser=LanguageParser()
    )
    documents = loader.load()
    if not documents:
        return {"status": "error", "message": "No supported code files found."}

    docs_by_lang: dict[str, list] = {}
    for doc in documents:
        docs_by_lang.setdefault(doc.metadata.get("language", "generic"), []).append(doc)

    texts = []
    for lang, lang_docs in docs_by_lang.items():
        if lang in _LANG_MAP:
            splitter = RecursiveCharacterTextSplitter.from_language(
                language=_LANG_MAP[lang], chunk_size=500, chunk_overlap=50
            )
        else:
            splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=50)
        texts.extend(splitter.split_documents(lang_docs))

    embeddings = OllamaEmbeddings(model=EMBED_MODEL)
    QdrantVectorStore.from_documents(
        texts, embeddings, path=QDRANT_PATH, collection_name=collection_name
    )
    return {
        "status": "success",
        "message": f"Ingested {len(documents)} files, {len(texts)} chunks.",
        "collection": collection_name,
    }


def get_retriever(project_path: str, k: int = 8):
    """Return a retriever over the project's collection, or None if not ingested."""
    collection_name = get_collection_name(project_path)
    embeddings = OllamaEmbeddings(model=EMBED_MODEL)
    try:
        store = QdrantVectorStore.from_existing_collection(
            embedding=embeddings, collection_name=collection_name, path=QDRANT_PATH
        )
    except Exception:
        return None
    return store.as_retriever(search_kwargs={"k": k})


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python rag.py --ingest \"C:\\Path\\To\\Your\\Project\"")
        sys.exit()
    command = sys.argv[1]
    path = sys.argv[2]
    if command == "--ingest":
        print(ingest_codebase(path))
    else:
        print("Unknown command. Use --ingest.")

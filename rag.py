"""'
Codebase ingestion + retrieval.

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

from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter, Language

from langchain_ollama import OllamaEmbeddings
from langchain_qdrant import QdrantVectorStore
from qdrant_client import QdrantClient

from core import config
from core.config import QDRANT_PATH, EMBED_MODEL

_EXTENSION_LANG_MAP: dict[str, tuple[str, Language | None]] = {
    ".py": ("python", Language.PYTHON),
    ".js": ("js", Language.JS),
    ".jsx": ("jsx", Language.JS),
    ".ts": ("ts", Language.TS),
    ".tsx": ("tsx", Language.TS),
    ".html": ("html", Language.HTML),
    ".htm": ("html", Language.HTML),
    ".css": ("css", None),
    ".scss": ("scss", None),
    ".json": ("json", None),
    ".md": ("markdown", Language.MARKDOWN),
    ".markdown": ("markdown", Language.MARKDOWN),
    ".rs": ("rust", Language.RUST),
    ".go": ("go", Language.GO),
    ".java": ("java", Language.JAVA),
    ".c": ("c", Language.C),
    ".cpp": ("cpp", Language.CPP),
    ".h": ("cpp", Language.CPP),
    ".hpp": ("cpp", Language.CPP),
    ".cs": ("csharp", Language.CSHARP),
    ".php": ("php", Language.PHP),
    ".rb": ("ruby", Language.RUBY),
    ".sql": ("sql", None),
    ".sh": ("bash", None),
    ".ps1": ("powershell", None),
}

_EXCLUDE_DIRS = {
    "node_modules", "venv", ".venv", "__pycache__", ".git", "dist", "build",
    ".next", ".nuxt", ".cache", "coverage", ".idea", ".vscode"
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
        response = requests.get(f"{config.OLLAMA_URL}/api/tags", timeout=5)
        if response.status_code != 200:
            return {"status": "error", "reason": "ollama_error", "ollama_ready": False, "missing_models": []}

        models = [m['name'] for m in response.json().get('models', [])]
        missing = []
        if not any(EMBED_MODEL in m for m in models):
            missing.append(EMBED_MODEL)
        if config.LLM_PROVIDER == "ollama" and not any(config.LLM_MODEL in m for m in models):
            missing.append(config.LLM_MODEL)

        if missing:
            return {"status": "error", "reason": "missing_models", "ollama_ready": True,
                    "missing_models": missing, "available_models": models}
        return {"status": "ok", "ollama_ready": True, "missing_models": [], "available_models": models}
    except requests.exceptions.RequestException:
        return {"status": "error", "reason": "connection_error", "ollama_ready": False, "missing_models": []}


def load_project_documents(project_path: str) -> list[Document]:
    documents = []
    max_file_size = 500 * 1024  # 500 KB limit to skip huge or minified files
    for root, dirs, files in os.walk(project_path):
        dirs[:] = [d for d in dirs if not d.startswith('.') and d.lower() not in _EXCLUDE_DIRS]
        for file in files:
            ext = os.path.splitext(file)[1].lower()
            if ext not in _EXTENSION_LANG_MAP:
                continue
            file_path = os.path.join(root, file)
            try:
                if os.path.getsize(file_path) > max_file_size:
                    continue
                with open(file_path, "r", encoding="utf-8", errors="replace") as f:
                    content = f.read()
                if content.strip():
                    lang_name, _ = _EXTENSION_LANG_MAP[ext]
                    documents.append(Document(
                        page_content=content,
                        metadata={"source": file_path, "language": lang_name, "filename": file}
                    ))
            except Exception:
                continue
    return documents


def ingest_codebase(project_path: str) -> dict:
    if not os.path.exists(project_path):
        return {"status": "error", "message": f"Path '{project_path}' does not exist."}

    collection_name = get_collection_name(project_path)
    try:
        client = QdrantClient(path=QDRANT_PATH)
        exists = client.collection_exists(collection_name)
        client.close()
        if exists:
            return {"status": "success", "message": "Existing embeddings loaded.", "collection": collection_name}
    except Exception:
        pass

    documents = load_project_documents(project_path)
    if not documents:
        return {
            "status": "success",
            "message": "Folder opened. No supported code files to index.",
            "collection": collection_name,
            "indexed_files": 0,
            "chunks": 0,
        }

    docs_by_lang: dict[str, list[Document]] = {}
    for doc in documents:
        docs_by_lang.setdefault(doc.metadata.get("language", "generic"), []).append(doc)

    texts = []
    for lang_name, lang_docs in docs_by_lang.items():
        lang_enum = None
        for ext, (l_name, l_enum) in _EXTENSION_LANG_MAP.items():
            if l_name == lang_name:
                lang_enum = l_enum
                break

        if lang_enum:
            splitter = RecursiveCharacterTextSplitter.from_language(
                language=lang_enum, chunk_size=500, chunk_overlap=50
            )
        else:
            splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=50)
        texts.extend(splitter.split_documents(lang_docs))

    if not texts:
        return {
            "status": "success",
            "message": "Folder opened. No text chunks generated.",
            "collection": collection_name,
            "indexed_files": len(documents),
            "chunks": 0,
        }

    embeddings = OllamaEmbeddings(model=EMBED_MODEL, base_url=config.OLLAMA_URL)
    QdrantVectorStore.from_documents(
        texts, embeddings, path=QDRANT_PATH, collection_name=collection_name
    )
    return {
        "status": "success",
        "message": f"Ingested {len(documents)} files, {len(texts)} chunks.",
        "collection": collection_name,
        "indexed_files": len(documents),
        "chunks": len(texts),
    }


def get_retriever(project_path: str, k: int = 8):
    """Return a retriever over the project's collection, or None if not ingested."""
    collection_name = get_collection_name(project_path)
    embeddings = OllamaEmbeddings(model=EMBED_MODEL, base_url=config.OLLAMA_URL)
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

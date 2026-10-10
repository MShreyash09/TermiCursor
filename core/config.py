"""Shared settings for the agentic core (agent/, tools/, memory/, persistence/,
artifacts/). Mirrors the same settings.json / env-var precedence rag.py has
always used, so both modules agree on model, Ollama URL, and storage paths.
"""
import os
import json
import appdirs

# ── AppData location (same directory TermiCursor's rag.py already uses) ──
APP_DATA_DIR = os.getenv("TERMICURSOR_USER_DATA")
if not APP_DATA_DIR:
    APP_DATA_DIR = appdirs.user_data_dir("Termicursor", "Termicursor")
os.makedirs(APP_DATA_DIR, exist_ok=True)

QDRANT_PATH = os.path.join(APP_DATA_DIR, "local_qdrant")
MEM0_QDRANT_PATH = os.path.join(APP_DATA_DIR, "local_mem0_qdrant")
SETTINGS_PATH = os.path.join(APP_DATA_DIR, "settings.json")
ARTIFACTS_DIR = os.path.join(APP_DATA_DIR, "artifacts")
DB_PATH = os.path.join(APP_DATA_DIR, "agent.db")

os.makedirs(ARTIFACTS_DIR, exist_ok=True)


def safe_join(base: str, name: str) -> str:
    """Join an untrusted name (session id, artifact filename) onto base, refusing
    anything that resolves outside it (`..`, absolute paths, `..\\` on Windows)."""
    base = os.path.normpath(base)
    path = os.path.normpath(os.path.join(base, name))
    if not path.startswith(base + os.sep):
        raise ValueError(f"unsafe path: {name!r}")
    return path


def load_settings():
    if os.path.exists(SETTINGS_PATH):
        try:
            with open(SETTINGS_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {}


EMBED_MODEL = os.getenv("OLLAMA_EMBED_MODEL", "nomic-embed-text")


def reload_settings() -> None:
    """(Re)read the model/provider settings. The server calls this per request so
    Settings-page changes apply without a restart. Read these values as
    `config.X` at use time, not via `from core.config import X`, or you get a
    stale copy. Empty strings (e.g. a half-typed field) fall back to defaults."""
    global LLM_PROVIDER, LLM_MODEL, OLLAMA_URL
    global ROUTER_MODEL, PLANNER_MODEL, EXECUTOR_MODEL, CUSTOM_PROVIDERS
    s = load_settings()
    LLM_PROVIDER = (s.get("llmProvider") or os.getenv("LLM_PROVIDER") or "ollama").lower()
    # OpenAI-compatible APIs added in Settings: [{name, apiKey, baseUrl, model}]
    CUSTOM_PROVIDERS = [p for p in (s.get("customProviders") or []) if isinstance(p, dict) and p.get("name")]
    LLM_MODEL = s.get("ollamaModel") or os.getenv("OLLAMA_LLM_MODEL") or "qwen2.5-coder:3b"
    OLLAMA_URL = s.get("ollamaUrl") or os.getenv("OLLAMA_URL") or "http://localhost:11434"
    # Role-based models
    models = s.get("models") or {}
    ROUTER_MODEL = models.get("router") or LLM_MODEL
    PLANNER_MODEL = models.get("planner") or LLM_MODEL
    EXECUTOR_MODEL = models.get("executor") or LLM_MODEL


reload_settings()


def active_model() -> str:
    """The model the agent actually talks to, for display (status bar, CLI toolbar)."""
    custom = next((p for p in CUSTOM_PROVIDERS if p["name"].lower() == LLM_PROVIDER), None)
    return custom.get("model", "") if custom else EXECUTOR_MODEL

# ── Agent loop bounds ──
MAX_ITERATIONS_PER_STEP = int(os.getenv("MAX_ITERATIONS_PER_STEP", "12"))
# Simple (unplanned) requests are one step; keep their budget tight so a small
# model that starts looping is stopped quickly instead of grinding for minutes.
SIMPLE_MAX_ITERATIONS = int(os.getenv("SIMPLE_MAX_ITERATIONS", "8"))
MAX_JSON_RETRIES = int(os.getenv("MAX_JSON_RETRIES", "2"))
SHELL_TIMEOUT_SEC = int(os.getenv("SHELL_TIMEOUT_SEC", "120"))
# Ollama's default context is 4096 tokens: the system prompt + tool schemas + one file
# overflow it and Ollama silently drops the oldest context. qwen2.5-coder supports 32k.
NUM_CTX = int(os.getenv("OLLAMA_NUM_CTX", "8192"))

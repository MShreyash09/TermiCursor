import os
import re

rag_file = "rag.py"
with open(rag_file, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Imports: Add appdirs and json
import_patch = """import requests
import json
import appdirs"""
content = content.replace("import requests", import_patch)

# 2. Database paths and Settings
path_patch = """
# AppData location for packaged apps
APP_DATA_DIR = appdirs.user_data_dir("Termicursor", "Termicursor")
os.makedirs(APP_DATA_DIR, exist_ok=True)

# Central database location on your PC
QDRANT_PATH = os.path.join(APP_DATA_DIR, "local_qdrant")
MEM0_QDRANT_PATH = os.path.join(APP_DATA_DIR, "local_mem0_qdrant")
SETTINGS_PATH = os.path.join(APP_DATA_DIR, "settings.json")

def load_settings():
    if os.path.exists(SETTINGS_PATH):
        try:
            with open(SETTINGS_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {}

_settings = load_settings()

LLM_PROVIDER = _settings.get("llmProvider", os.getenv("LLM_PROVIDER", "ollama")).lower()
GROQ_API_KEY = _settings.get("groqApiKey", os.getenv("GROQ_API_KEY", ""))
GROQ_MODEL = _settings.get("groqModel", os.getenv("GROQ_MODEL", "llama-3.1-8b-instant"))

EMBED_MODEL = os.getenv("OLLAMA_EMBED_MODEL", "nomic-embed-text")
LLM_MODEL = _settings.get("ollamaModel", os.getenv("OLLAMA_LLM_MODEL", "qwen2.5-coder:3b"))
OLLAMA_URL = _settings.get("ollamaUrl", os.getenv("OLLAMA_URL", "http://localhost:11434"))
"""

old_paths = """
# Central database location on your PC
QDRANT_PATH = "./local_qdrant" 
MEM0_QDRANT_PATH = "./local_mem0_qdrant"  # Separate storage for user memories

LLM_PROVIDER = os.getenv("LLM_PROVIDER", "ollama").lower()
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")

EMBED_MODEL = os.getenv("OLLAMA_EMBED_MODEL", "nomic-embed-text")
LLM_MODEL = os.getenv("OLLAMA_LLM_MODEL", "qwen2.5-coder:3b")
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
"""
content = content.replace(old_paths.strip(), path_patch.strip())

with open(rag_file, "w", encoding="utf-8") as f:
    f.write(content)
print("rag.py updated with appdirs and settings.json")

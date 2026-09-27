import json
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from core import config


def test_reload_applies_settings_and_ignores_blank_fields(tmp_path, monkeypatch):
    settings = tmp_path / "settings.json"
    monkeypatch.setattr(config, "SETTINGS_PATH", str(settings))

    settings.write_text(json.dumps({"ollamaModel": "my-model", "llmProvider": "Groq"}))
    config.reload_settings()
    assert config.LLM_MODEL == config.EXECUTOR_MODEL == "my-model"
    assert config.LLM_PROVIDER == "groq"

    # A half-typed Settings field saves "" — fall back to the default, not an empty model.
    settings.write_text(json.dumps({"ollamaModel": "", "ollamaUrl": ""}))
    config.reload_settings()
    assert config.LLM_MODEL == os.getenv("OLLAMA_LLM_MODEL", "qwen2.5-coder:3b")
    assert config.OLLAMA_URL.startswith("http")

    monkeypatch.undo()
    config.reload_settings()  # restore real settings for other tests

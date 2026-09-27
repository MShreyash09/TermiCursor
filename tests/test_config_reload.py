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


def test_custom_provider_routes_to_its_openai_compatible_endpoint(tmp_path, monkeypatch):
    import asyncio
    from core.agent import llm_client

    settings = tmp_path / "settings.json"
    monkeypatch.setattr(config, "SETTINGS_PATH", str(settings))
    settings.write_text(json.dumps({"llmProvider": "MyCloud", "customProviders": [
        {"name": "MyCloud", "apiKey": "k-123", "baseUrl": "https://llm.example/v1/", "model": "m-1"}]}))
    config.reload_settings()
    calls = []

    async def fake(self, url, key, model, messages, temperature, label):
        calls.append((url, key, model, label))
        return "ok"

    monkeypatch.setattr(llm_client.LLMClient, "_chat_openai_compatible", fake)
    assert asyncio.run(llm_client.LLMClient().chat([{"role": "user", "content": "hi"}])) == "ok"
    assert calls == [("https://llm.example/v1/chat/completions", "k-123", "m-1", "MyCloud")]
    monkeypatch.undo()
    config.reload_settings()

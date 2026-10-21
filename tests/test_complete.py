"""Inline completion: the FIM payload sent to Ollama, and silent "" on every failure. No network."""
import asyncio
import os
import sys
import tempfile

os.environ.setdefault("TERMICURSOR_USER_DATA", tempfile.mkdtemp(prefix="complete_test_"))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import server
from core import config


class _Session:
    """Stands in for both ClientSession and the post() response context manager."""

    def __init__(self, reply=None, error=None):
        self.reply, self.error, self.calls = reply, error, []

    def post(self, url, **kw):
        self.calls.append((url, kw))
        if self.error:
            raise self.error
        return self

    def raise_for_status(self):
        pass

    async def json(self):
        return self.reply

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False


def _run(monkeypatch, session, **cfg):
    for k, v in cfg.items():
        monkeypatch.setattr(config, k, v)
    monkeypatch.setattr(config, "reload_settings", lambda: None)  # keep the patched values
    monkeypatch.setattr(server.aiohttp, "ClientSession", lambda: session)
    return asyncio.run(server.complete_code("a" * 5000, "b" * 900))


def test_builds_fim_payload_and_returns_response(monkeypatch):
    s = _Session(reply={"response": "x = 1"})
    out = _run(monkeypatch, s, COMPLETIONS_ENABLED=True, LLM_PROVIDER="ollama",
               COMPLETION_MODEL="m:1b", OLLAMA_URL="http://o:1")
    assert out == "x = 1"
    url, kw = s.calls[0]
    assert url == "http://o:1/api/generate"
    body = kw["json"]
    assert body["model"] == "m:1b" and body["stream"] is False
    assert body["prompt"] == "a" * 2000 and body["suffix"] == "b" * 500
    assert body["options"]["num_predict"] == 64


def test_empty_on_connection_error(monkeypatch):
    s = _Session(error=ConnectionError("down"))
    assert _run(monkeypatch, s, COMPLETIONS_ENABLED=True, LLM_PROVIDER="ollama") == ""


def test_empty_when_disabled_or_not_ollama(monkeypatch):
    s = _Session(reply={"response": "x"})
    assert _run(monkeypatch, s, COMPLETIONS_ENABLED=False, LLM_PROVIDER="ollama") == ""
    assert _run(monkeypatch, s, COMPLETIONS_ENABLED=True, LLM_PROVIDER="groq") == ""
    assert s.calls == []

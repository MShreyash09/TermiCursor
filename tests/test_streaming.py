"""Token streaming: the Ollama NDJSON parser, and the loop's `token` events. No network."""
import asyncio
import json
import os
import tempfile

os.environ.setdefault("TERMICURSOR_USER_DATA", tempfile.mkdtemp(prefix="stream_test_"))

from core import config
from core.agent import llm_client
from core.agent.loop import AgentLoop
from core.agent.session import AgentSession
from core.persistence import db


class _Resp:
    """Stands in for both ClientSession and the post() response context manager."""

    def __init__(self, lines):
        self.content = self._iter(lines)

    async def _iter(self, lines):
        for line in lines:
            yield line

    def raise_for_status(self):
        pass

    def post(self, *a, **kw):
        return self

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False


def test_ollama_ndjson_stream_returns_full_text_and_calls_on_token(monkeypatch):
    chunks = ["Hel", "lo", " world"]
    lines = [json.dumps({"message": {"content": c}, "done": False}).encode() + b"\n" for c in chunks]
    lines.append(json.dumps({"message": {"content": ""}, "done": True,
                             "prompt_eval_count": 7, "eval_count": 3, "eval_duration": 5}).encode() + b"\n")
    monkeypatch.setattr(config, "LLM_PROVIDER", "ollama")
    monkeypatch.setattr(llm_client.aiohttp, "ClientSession", lambda: _Resp(lines))
    got = []
    client = llm_client.LLMClient()
    text, usage, extra = asyncio.run(client._dispatch([{"role": "user", "content": "hi"}], 0.1, got.append))
    assert text == "Hello world" and got == chunks
    assert usage == {"input": 7, "output": 3} and extra == {"eval_duration": 5}


class _StreamingLLM:
    RAW = '{"thought":"t","action":null,"final_answer":"done"}'

    async def chat(self, messages, *, temperature=0.1, on_token=None):
        for i in range(0, len(self.RAW), 10):
            on_token(self.RAW[i:i + 10])
            await asyncio.sleep(0)
        return self.RAW

    async def generate(self, prompt, **kw):
        return "simple"


def test_loop_emits_token_events_before_the_thought():
    db.init_db()
    session = AgentSession(project_path=tempfile.mkdtemp(), goal="say hi", agent="ask")

    async def go():
        return [ev async for ev in AgentLoop(session, llm=_StreamingLLM()).run()]

    events = asyncio.run(go())
    tokens = [e for e in events if e["type"] == "token"]
    assert "".join(e["text"] for e in tokens) == _StreamingLLM.RAW
    types = [e["type"] for e in events]
    assert types.index("thought") > max(i for i, t in enumerate(types) if t == "token")
    assert events[-1] == {"type": "session_done", "status": "done"}

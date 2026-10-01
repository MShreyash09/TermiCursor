"""Langfuse tracing in llm_client must be invisible when off and masked by default.

No network: the provider call is faked, so these run without Ollama or Langfuse.
"""
import asyncio

from core import config
from core.agent import llm_client


def _fake_dispatch(text="ok", usage=None, extra=None):
    async def fake(self, messages, temperature):
        return text, usage or {"input": 10, "output": 5}, extra or {}
    return fake


def test_tracing_off_returns_plain_text(monkeypatch):
    monkeypatch.setattr(llm_client, "TRACING_ENABLED", False)
    monkeypatch.setattr(llm_client.LLMClient, "_dispatch", _fake_dispatch())
    out = asyncio.run(llm_client.LLMClient().chat([{"role": "user", "content": "hi"}]))
    assert out == "ok"


def test_tracing_failure_never_breaks_a_turn(monkeypatch):
    """A broken Langfuse must not take the agent down with it."""
    monkeypatch.setattr(llm_client, "TRACING_ENABLED", True)
    monkeypatch.setattr(llm_client, "_get_langfuse", lambda: (_ for _ in ()).throw(RuntimeError("down")))
    monkeypatch.setattr(llm_client.LLMClient, "_dispatch", _fake_dispatch())
    assert asyncio.run(llm_client.LLMClient().chat([{"role": "user", "content": "hi"}])) == "ok"


class _Span:
    def __init__(self):
        self.kw = {}

    def update(self, **kw):
        self.kw = kw


def test_record_masks_text_and_derives_rates(monkeypatch):
    monkeypatch.setattr(llm_client, "TRACE_PROMPTS", False)
    span = _Span()
    # 5 tokens over 0.5s of eval time => 10 tok/s; durations arrive in nanoseconds.
    llm_client.LLMClient()._record(
        span, "hello world", {"input": 10, "output": 5},
        {"eval_duration": 500_000_000, "load_duration": 1_000_000}, 812.34)
    assert span.kw["output"] == "<11 chars>", "completion text must be masked by default"
    assert span.kw["usage_details"] == {"input": 10, "output": 5}
    meta = span.kw["metadata"]
    assert meta["tokens_per_sec"] == 10.0
    assert meta["eval_duration_ms"] == 500.0 and meta["load_duration_ms"] == 1.0
    assert meta["latency_ms"] == 812.3


def test_record_passes_text_through_when_opted_in(monkeypatch):
    monkeypatch.setattr(llm_client, "TRACE_PROMPTS", True)
    span = _Span()
    llm_client.LLMClient()._record(span, "hello world", {"input": 1, "output": 1}, {}, 5.0)
    assert span.kw["output"] == "hello world"


def test_span_is_a_noop_context_when_disabled(monkeypatch):
    monkeypatch.setattr(llm_client, "TRACING_ENABLED", False)
    with llm_client.LLMClient()._span([{"role": "user", "content": "hi"}], 0.1) as gen:
        assert gen is None


def test_masked_input_reports_sizes_not_content(monkeypatch):
    """The masked input label must not leak prompt text."""
    monkeypatch.setattr(llm_client, "TRACE_PROMPTS", False)
    monkeypatch.setattr(llm_client, "TRACING_ENABLED", True)
    captured = {}

    class _Client:
        def start_as_current_observation(self, **kw):
            captured.update(kw)
            import contextlib
            return contextlib.nullcontext(None)

    monkeypatch.setattr(llm_client, "_get_langfuse", lambda: _Client())
    secret = "def password(): return 'hunter2'"
    with llm_client.LLMClient(role="executor")._span([{"role": "user", "content": secret}], 0.1):
        pass
    assert "hunter2" not in str(captured["input"])
    assert captured["input"] == f"<1 messages, {len(secret)} chars>"
    assert captured["name"] == "llm.executor"

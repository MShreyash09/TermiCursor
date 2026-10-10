"""Thin async chat client: local Ollama (/api/chat) by default, or an
OpenAI-compatible API (a provider added in Settings) when
`llmProvider` names one.

Uses the JSON-prompt tool-calling strategy: the model is instructed via system
prompt to emit one JSON object per turn, which json_protocol parses. Native
tool-calling is intentionally not used here — unreliable at 3B scale.

Every call is optionally traced to Langfuse (latency, model, token counts). See
the tracing block below: it is off unless keys are set, and it never sends
prompt or output text unless LANGFUSE_TRACE_PROMPTS is explicitly enabled.
"""
import os
import time
from contextlib import nullcontext

import aiohttp

from core import config

# Per-provider usage + rate-limit headers from the last response, served by /status.
# ponytail: in-memory only, resets on app restart; persist to db if users want history.
QUOTA: dict[str, dict] = {}
_RATE_HEADERS = ("x-ratelimit-limit-requests", "x-ratelimit-remaining-requests",
                 "x-ratelimit-limit-tokens", "x-ratelimit-remaining-tokens", "x-ratelimit-reset-requests")

# ── Optional Langfuse tracing ────────────────────────────────────────────────
# langfuse is not in requirements.txt: absent, unconfigured, or broken, every
# path here degrades to a no-op rather than failing an agent turn.
try:
    from langfuse import get_client as _get_langfuse
except Exception:  # ImportError, or a botched install
    _get_langfuse = None

def _langfuse_env() -> dict:
    """Langfuse settings from the real environment, falling back to a repo .env.

    Nothing else in the app loads .env — config.py reads settings.json plus real
    env vars — and that stays true here on purpose: .env also sets LLM_PROVIDER,
    and making it authoritative would silently switch the agent's provider. So
    only the LANGFUSE_* keys are read out of it, and only if it exists (it will
    not in a frozen build).
    """
    env = {k: v for k, v in os.environ.items() if k.startswith("LANGFUSE_")}
    dotenv_path = os.path.join(os.path.dirname(__file__), "..", "..", ".env")
    if not os.path.exists(dotenv_path):
        return env
    try:
        from dotenv import dotenv_values
        for k, v in dotenv_values(dotenv_path).items():
            # Real env wins, so a shell override still beats the file.
            if k.startswith("LANGFUSE_") and k not in env and v:
                env[k] = v
    except Exception:
        pass
    return env


_LF_ENV = _langfuse_env()

# This repo's .env names the host LANGFUSE_BASE_URL, but the SDK only reads
# LANGFUSE_HOST — without this remap it silently defaults to the US cloud and
# auth fails against keys issued elsewhere.
for _src, _dst in (("LANGFUSE_HOST", "LANGFUSE_HOST"), ("LANGFUSE_BASE_URL", "LANGFUSE_HOST"),
                   ("LANGFUSE_PUBLIC_KEY", "LANGFUSE_PUBLIC_KEY"),
                   ("LANGFUSE_SECRET_KEY", "LANGFUSE_SECRET_KEY")):
    if _LF_ENV.get(_src) and not os.getenv(_dst):
        os.environ[_dst] = _LF_ENV[_src].strip()

TRACING_ENABLED = bool(
    _get_langfuse and os.getenv("LANGFUSE_PUBLIC_KEY") and os.getenv("LANGFUSE_SECRET_KEY"))

# Prompts and completions here carry slices of the user's source code. Tracing
# their text ships that to the Langfuse host, so it is opt-in; by default only
# metadata (sizes, latency, token counts) is recorded.
TRACE_PROMPTS = _LF_ENV.get("LANGFUSE_TRACE_PROMPTS", "").strip().lower() in ("1", "true", "yes")


class LLMClient:
    def __init__(self, model: str | None = None, base_url: str | None = None, role: str | None = None):
        # Resolved at construction (not import) so Settings changes apply per run.
        self.model = model or config.LLM_MODEL
        self.base_url = (base_url or config.OLLAMA_URL).rstrip("/")
        # Labels the trace span, so router/planner/executor latency is separable
        # even when all three roles share one model.
        self.role = role

    async def chat(self, messages: list[dict], *, temperature: float = 0.1) -> str:
        with self._span(messages, temperature) as gen:
            t0 = time.perf_counter()
            text, usage, extra = await self._dispatch(messages, temperature)
            if gen is not None:
                self._record(gen, text, usage, extra, (time.perf_counter() - t0) * 1000)
            return text

    async def _dispatch(self, messages: list[dict], temperature: float) -> tuple[str, dict, dict]:
        """Returns (text, token usage, provider extras). Provider routing only."""
        provider = config.LLM_PROVIDER
        custom = next((p for p in config.CUSTOM_PROVIDERS if p["name"].lower() == provider), None)
        if custom is not None:
            base = (custom.get("baseUrl") or "https://api.openai.com/v1").rstrip("/")
            return await self._chat_openai_compatible(
                f"{base}/chat/completions", custom.get("apiKey", ""), custom.get("model", ""),
                messages, temperature, custom["name"])
        if provider != "ollama":
            # Deleted or renamed in Settings: fail loudly instead of silently running on Ollama.
            raise RuntimeError(f"LLM provider '{provider}' is not configured. Pick one in Settings.")
        payload = {
            "model": self.model,
            "messages": messages,
            "stream": False,
            "options": {"temperature": temperature, "num_ctx": config.NUM_CTX},
        }
        url = f"{self.base_url}/api/chat"
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload, timeout=aiohttp.ClientTimeout(total=300)) as resp:
                resp.raise_for_status()
                data = await resp.json()
        usage = {"input": data.get("prompt_eval_count", 0), "output": data.get("eval_count", 0)}
        # Ollama reports load vs generate separately: a slow first call is usually
        # model load, not slow inference, and only these fields tell them apart.
        extra = {k: data[k] for k in ("total_duration", "load_duration", "eval_duration",
                                      "prompt_eval_duration") if k in data}
        return data.get("message", {}).get("content", ""), usage, extra

    async def _chat_openai_compatible(self, url: str, api_key: str, model: str, messages: list[dict],
                                      temperature: float, label: str) -> tuple[str, dict, dict]:
        # Per-role Ollama model names don't exist on cloud APIs; every role uses the provider's model.
        payload = {"model": model, "messages": messages, "temperature": temperature}
        headers = {"Authorization": f"Bearer {api_key}"}
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload, headers=headers,
                                    timeout=aiohttp.ClientTimeout(total=120)) as resp:
                if resp.status >= 400:
                    raise RuntimeError(f"{label} API error {resp.status}: {(await resp.text())[:300]}")
                data = await resp.json()
                rate = {h[len("x-ratelimit-"):]: resp.headers[h] for h in _RATE_HEADERS if h in resp.headers}
        u = data.get("usage") or {}
        usage = {"input": u.get("prompt_tokens", 0), "output": u.get("completion_tokens", 0)}
        q = QUOTA.setdefault(label.lower(), {"tokens": 0, "requests": 0})
        q["tokens"] += usage["input"] + usage["output"]
        q["requests"] += 1
        q.update(rate)
        return data["choices"][0]["message"]["content"] or "", usage, {}

    # ── Tracing helpers: must never raise into an agent turn ──
    def _span(self, messages: list[dict], temperature: float):
        if not TRACING_ENABLED:
            return nullcontext(None)
        try:
            chars = sum(len(m.get("content") or "") for m in messages)
            return _get_langfuse().start_as_current_observation(
                name=f"llm.{self.role}" if self.role else "llm.chat",
                as_type="generation",
                model=config.active_model() or self.model,
                input=messages if TRACE_PROMPTS else f"<{len(messages)} messages, {chars} chars>",
                model_parameters={"temperature": temperature, "num_ctx": config.NUM_CTX},
                metadata={"provider": config.LLM_PROVIDER, "role": self.role,
                          "base_url": self.base_url if config.LLM_PROVIDER == "ollama" else None},
            )
        except Exception:
            return nullcontext(None)

    def _record(self, gen, text: str, usage: dict, extra: dict, latency_ms: float) -> None:
        try:
            meta = {"latency_ms": round(latency_ms, 1)}
            # Ollama's nanosecond counters mean little raw; ms is what you compare.
            for k, v in extra.items():
                meta[f"{k}_ms"] = round(v / 1e6, 1)
            if usage.get("output") and extra.get("eval_duration"):
                meta["tokens_per_sec"] = round(usage["output"] / (extra["eval_duration"] / 1e9), 1)
            gen.update(
                output=text if TRACE_PROMPTS else f"<{len(text)} chars>",
                usage_details=usage or None,
                metadata=meta,
            )
        except Exception:
            pass

    async def generate(self, prompt: str, *, temperature: float = 0.1) -> str:
        return await self.chat([{"role": "user", "content": prompt}], temperature=temperature)

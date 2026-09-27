"""Thin async chat client: local Ollama (/api/chat) by default, or an
OpenAI-compatible API (Groq, or a custom provider added in Settings) when
`llmProvider` names one.

Uses the JSON-prompt tool-calling strategy: the model is instructed via system
prompt to emit one JSON object per turn, which json_protocol parses. Native
tool-calling is intentionally not used here — unreliable at 3B scale.
"""
import aiohttp

from core import config

GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions"


class LLMClient:
    def __init__(self, model: str | None = None, base_url: str | None = None):
        # Resolved at construction (not import) so Settings changes apply per run.
        self.model = model or config.LLM_MODEL
        self.base_url = (base_url or config.OLLAMA_URL).rstrip("/")

    async def chat(self, messages: list[dict], *, temperature: float = 0.1) -> str:
        provider = config.LLM_PROVIDER
        if provider == "groq":
            if not config.GROQ_API_KEY:
                raise RuntimeError("Groq is selected as the LLM provider but no Groq API key is set in Settings.")
            return await self._chat_openai_compatible(
                GROQ_CHAT_URL, config.GROQ_API_KEY, config.GROQ_MODEL, messages, temperature, "Groq")
        custom = next((p for p in config.CUSTOM_PROVIDERS if p["name"].lower() == provider), None)
        if custom is not None:
            base = (custom.get("baseUrl") or "https://api.openai.com/v1").rstrip("/")
            return await self._chat_openai_compatible(
                f"{base}/chat/completions", custom.get("apiKey", ""), custom.get("model", ""),
                messages, temperature, custom["name"])
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
        return data.get("message", {}).get("content", "")

    async def _chat_openai_compatible(self, url: str, api_key: str, model: str, messages: list[dict],
                                      temperature: float, label: str) -> str:
        # Per-role Ollama model names don't exist on cloud APIs; every role uses the provider's model.
        payload = {"model": model, "messages": messages, "temperature": temperature}
        headers = {"Authorization": f"Bearer {api_key}"}
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload, headers=headers,
                                    timeout=aiohttp.ClientTimeout(total=120)) as resp:
                if resp.status >= 400:
                    raise RuntimeError(f"{label} API error {resp.status}: {(await resp.text())[:300]}")
                data = await resp.json()
        return data["choices"][0]["message"]["content"] or ""

    async def generate(self, prompt: str, *, temperature: float = 0.1) -> str:
        return await self.chat([{"role": "user", "content": prompt}], temperature=temperature)

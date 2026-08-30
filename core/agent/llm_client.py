"""Thin async client over Ollama's /api/chat.

Uses the JSON-prompt tool-calling strategy: the model is instructed via system
prompt to emit one JSON object per turn, which json_protocol parses. Native
Ollama tool-calling is intentionally not used here — unreliable at 3B scale.
"""
import aiohttp

from core.config import OLLAMA_URL, LLM_MODEL


class LLMClient:
    def __init__(self, model: str = LLM_MODEL, base_url: str = OLLAMA_URL):
        self.model = model
        self.base_url = base_url.rstrip("/")

    async def chat(self, messages: list[dict], *, temperature: float = 0.1) -> str:
        payload = {
            "model": self.model,
            "messages": messages,
            "stream": False,
            "options": {"temperature": temperature},
        }
        url = f"{self.base_url}/api/chat"
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload, timeout=aiohttp.ClientTimeout(total=300)) as resp:
                resp.raise_for_status()
                data = await resp.json()
        return data.get("message", {}).get("content", "")

    async def generate(self, prompt: str, *, temperature: float = 0.1) -> str:
        return await self.chat([{"role": "user", "content": prompt}], temperature=temperature)

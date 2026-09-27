"""Browser tools backed by a real Chromium instance (Playwright).

Design intent: qwen2.5-coder:3b has no vision, so the model never sees a pixel.
It verifies web UIs the same way a screen-reader would — extracted visible
text plus captured console/network errors, fed back as plain tool output.

Separately, and entirely for the HUMAN, the *entire* browser session for an
agent run is recorded to video automatically (Playwright's record_video_dir) —
exactly like Antigravity's browser recordings. The model never touches this
video; it's just an artifact you can open and watch afterward. One Chromium
context per agent session, lazily started on first use, closed (flushing the
recording to disk) when the agent loop ends.
"""
import asyncio
import os
from typing import Optional

from pydantic import BaseModel, Field

from .base import Tool, ToolResult

_MAX_TEXT_CHARS = 8000
_MAX_DIAG_ENTRIES = 30


class _BrowserSession:
    """One Chromium browser context for the lifetime of an agent session."""

    def __init__(self, session_id: str, video_dir: str):
        self.session_id = session_id
        self.video_dir = video_dir
        self._playwright = None
        self.browser = None
        self.context = None
        self.page = None
        self.console_log: list[str] = []
        self.request_failures: list[str] = []
        self._start_lock = asyncio.Lock()

    async def _ensure_started(self) -> None:
        if self.page is not None:
            return
        async with self._start_lock:
            if self.page is not None:  # re-check after acquiring the lock
                return
            from playwright.async_api import async_playwright

            os.makedirs(self.video_dir, exist_ok=True)
            self._playwright = await async_playwright().start()
            try:
                self.browser = await self._playwright.chromium.launch()
            except Exception:
                # The installer doesn't bundle Playwright's Chromium; fall back to
                # the Edge that ships with Windows 10/11.
                self.browser = await self._playwright.chromium.launch(channel="msedge")
            self.context = await self.browser.new_context(
                record_video_dir=self.video_dir,
                record_video_size={"width": 1280, "height": 800},
            )
            self.page = await self.context.new_page()
            self.page.on("console", self._on_console)
            self.page.on("pageerror", lambda exc: self._push(self.console_log, f"[pageerror] {exc}"))
            self.page.on("requestfailed", self._on_request_failed)

    def _push(self, bucket: list[str], entry: str) -> None:
        bucket.append(entry)
        if len(bucket) > _MAX_DIAG_ENTRIES:
            bucket.pop(0)

    def _on_console(self, msg) -> None:
        if msg.type in ("error", "warning"):
            self._push(self.console_log, f"[console.{msg.type}] {msg.text}")

    def _on_request_failed(self, request) -> None:
        self._push(self.request_failures,
                   f"[request failed] {request.method} {request.url} — {request.failure}")

    def _drain_diagnostics(self) -> str:
        parts = []
        if self.console_log:
            parts.append("Console errors/warnings since last check:\n" + "\n".join(self.console_log))
            self.console_log = []
        if self.request_failures:
            parts.append("Failed network requests since last check:\n" + "\n".join(self.request_failures))
            self.request_failures = []
        return "\n\n".join(parts)

    async def _extract_text(self) -> str:
        text = await self.page.inner_text("body")
        text = " ".join(text.split())
        if len(text) > _MAX_TEXT_CHARS:
            text = text[:_MAX_TEXT_CHARS] + "… (truncated)"
        return text

    async def navigate(self, url: str) -> str:
        await self._ensure_started()
        await self.page.goto(url, wait_until="load", timeout=20000)
        title = await self.page.title()
        text = await self._extract_text()
        out = f"Navigated to {url}\nTitle: {title}\n\nPage text:\n{text}"
        diag = self._drain_diagnostics()
        return f"{out}\n\n{diag}" if diag else out

    async def click(self, selector: str) -> str:
        await self._ensure_started()
        await self.page.click(selector, timeout=10000)
        try:
            await self.page.wait_for_load_state("networkidle", timeout=5000)
        except Exception:
            pass  # not every click triggers navigation/network activity
        text = await self._extract_text()
        out = f"Clicked '{selector}'.\n\nPage text after click:\n{text}"
        diag = self._drain_diagnostics()
        return f"{out}\n\n{diag}" if diag else out

    async def get_text(self) -> str:
        await self._ensure_started()
        text = await self._extract_text()
        out = f"Current page text:\n{text}"
        diag = self._drain_diagnostics()
        return f"{out}\n\n{diag}" if diag else out

    async def close_and_get_recording(self) -> Optional[str]:
        """Close the browser, flushing its video to disk, and return the path."""
        if self.page is None:
            return None
        video = self.page.video
        for coro in (self.page.close, self.context.close, self.browser.close):
            try:
                await coro()
            except Exception:
                pass
        try:
            await self._playwright.stop()
        except Exception:
            pass
        if video is None:
            return None
        try:
            return await video.path()
        except Exception:
            return None


_SESSIONS: dict[str, _BrowserSession] = {}


def _get_session(session_id: str, video_dir: str) -> _BrowserSession:
    sess = _SESSIONS.get(session_id)
    if sess is None:
        sess = _BrowserSession(session_id, video_dir)
        _SESSIONS[session_id] = sess
    return sess


async def close_browser_session(session_id: str) -> Optional[str]:
    """Call once when an agent loop ends. Returns the recorded video path, or
    None if the browser was never used this session."""
    sess = _SESSIONS.pop(session_id, None)
    if sess is None:
        return None
    return await sess.close_and_get_recording()


class BrowserNavigateArgs(BaseModel):
    url: str = Field(..., description="URL to open, e.g. http://localhost:5000")


class BrowserNavigateTool(Tool):
    name = "browser_navigate"
    description = (
        "Open a URL in a real browser and get back the page title, visible text, "
        "and any console/network errors. Use this to verify a web app you built or ran. "
        "You cannot see images — only extracted text and errors."
    )
    args_model = BrowserNavigateArgs

    def __init__(self, session_id: str, video_dir: str):
        self._session_id = session_id
        self._video_dir = video_dir

    async def run(self, args: BrowserNavigateArgs, *, project_root: str) -> ToolResult:
        try:
            out = await _get_session(self._session_id, self._video_dir).navigate(args.url)
            return ToolResult(success=True, output=out)
        except Exception as e:
            return ToolResult(success=False, error=str(e))


class BrowserClickArgs(BaseModel):
    selector: str = Field(..., description='CSS selector to click, e.g. \'button:has-text("Submit")\'')


class BrowserClickTool(Tool):
    name = "browser_click"
    description = "Click an element on the currently open page by CSS selector, then return the resulting page text."
    args_model = BrowserClickArgs

    def __init__(self, session_id: str, video_dir: str):
        self._session_id = session_id
        self._video_dir = video_dir

    async def run(self, args: BrowserClickArgs, *, project_root: str) -> ToolResult:
        try:
            out = await _get_session(self._session_id, self._video_dir).click(args.selector)
            return ToolResult(success=True, output=out)
        except Exception as e:
            return ToolResult(success=False, error=str(e))


class BrowserGetTextArgs(BaseModel):
    pass


class BrowserGetTextTool(Tool):
    name = "browser_get_text"
    description = "Get the visible text of the currently open page, plus any new console/network errors."
    args_model = BrowserGetTextArgs

    def __init__(self, session_id: str, video_dir: str):
        self._session_id = session_id
        self._video_dir = video_dir

    async def run(self, args: BrowserGetTextArgs, *, project_root: str) -> ToolResult:
        try:
            out = await _get_session(self._session_id, self._video_dir).get_text()
            return ToolResult(success=True, output=out)
        except Exception as e:
            return ToolResult(success=False, error=str(e))

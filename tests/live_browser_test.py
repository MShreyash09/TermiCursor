"""Live end-to-end: prove the browser tools work and the ENTIRE session gets
recorded to video automatically, with no image ever touching the model.

Run manually: python tests/live_browser_test.py

This drives the tools directly (not through the LLM) to keep the test fast and
deterministic — the LLM-driven path is already covered by live_smoke_test.py.
This test isolates: does navigate/click/get_text work, does closing the browser
session produce a playable .webm, and is it correctly indexed as an artifact.
"""
import asyncio
import os
import sys
import tempfile

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from core.persistence import db
from core.artifacts.store import ArtifactStore
from core.tools.browser_tools import (
    BrowserNavigateTool, BrowserClickTool, BrowserGetTextTool,
    BrowserNavigateArgs, BrowserClickArgs, BrowserGetTextArgs,
    close_browser_session,
)

PAGE_HTML = """<!doctype html>
<html><body>
<h1 id="title">Memory Test Page</h1>
<button id="btn" onclick="document.getElementById('out').innerText='clicked!'">Click me</button>
<p id="out">not clicked yet</p>
</body></html>
"""


async def main() -> int:
    db.init_db()
    session_id = "live-browser-test"
    proj = tempfile.mkdtemp(prefix="lc_browser_test_")
    page_path = os.path.join(proj, "index.html")
    with open(page_path, "w", encoding="utf-8") as f:
        f.write(PAGE_HTML)
    page_url = "file:///" + page_path.replace("\\", "/")

    artifacts = ArtifactStore(session_id)
    print(f"Video dir: {artifacts.dir}\n")

    # 1. Navigate — model gets text only, no image.
    nav = BrowserNavigateTool(session_id, artifacts.dir)
    r1 = await nav.run(BrowserNavigateArgs(url=page_url), project_root=proj)
    print("1. navigate ->", "OK" if r1.success else "FAIL")
    print("  ", r1.output.replace("\n", " | ")[:200])
    assert r1.success
    assert "Memory Test Page" in r1.output
    assert "not clicked yet" in r1.output

    # 2. Click — verify DOM update comes back as text.
    click = BrowserClickTool(session_id, artifacts.dir)
    r2 = await click.run(BrowserClickArgs(selector="#btn"), project_root=proj)
    print("2. click ->", "OK" if r2.success else "FAIL")
    print("  ", r2.output.replace("\n", " | ")[:200])
    assert r2.success
    assert "clicked!" in r2.output

    # 3. get_text — independent read of current state.
    gettext = BrowserGetTextTool(session_id, artifacts.dir)
    r3 = await gettext.run(BrowserGetTextArgs(), project_root=proj)
    print("3. get_text ->", "OK" if r3.success else "FAIL")
    assert r3.success
    assert "clicked!" in r3.output

    # 4. Close the session (as AgentLoop's finally does) -> flush the recording.
    video_path = await close_browser_session(session_id)
    print(f"\n4. close_browser_session -> video_path={video_path}")
    assert video_path is not None, "expected a recorded video path"
    assert os.path.isfile(video_path), f"video file missing on disk: {video_path}"
    size = os.path.getsize(video_path)
    print(f"   file exists, size={size} bytes")
    assert size > 0, "recorded video is empty"

    # 5. Index it as an artifact (as AgentLoop._finalize_browser does) and verify
    #    it's retrievable via the same path the server's artifact endpoint uses.
    art = artifacts.save_browser_recording(video_path)
    print(f"\n5. artifact recorded: kind={art.kind} file={art.file}")
    assert art.kind == "browser_recording"
    listed = artifacts.list_for_session()
    assert any(a["id"] == art.id for a in listed), "artifact not found in session list"
    resolved_path = artifacts.path_for(art.file)
    assert resolved_path is not None and os.path.isfile(resolved_path)
    print("   artifact resolvable via ArtifactStore.path_for (what the server streams)")

    # 6. A second close on an already-closed/absent session is a safe no-op.
    again = await close_browser_session(session_id)
    assert again is None
    print("\n6. closing an already-closed session is a safe no-op")

    print("\nLIVE BROWSER TEST: PASS")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))

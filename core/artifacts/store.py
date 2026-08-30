import json
import os
from typing import Optional

from core.config import ARTIFACTS_DIR
from core.persistence import db
from .models import Artifact


class ArtifactStore:
    """Persists artifacts for one session: a file body (optional) under
    ARTIFACTS_DIR/<session_id>/ plus an index row in SQLite.
    """

    def __init__(self, session_id: str):
        self.session_id = session_id
        self.dir = os.path.join(ARTIFACTS_DIR, session_id)
        os.makedirs(self.dir, exist_ok=True)

    def _persist(self, artifact: Artifact) -> Artifact:
        db.insert_artifact(artifact.model_dump())
        return artifact

    def save_command_log(self, command: str, output: str, exit_code: int) -> Artifact:
        artifact = Artifact(
            session_id=self.session_id,
            kind="command_log",
            label=command[:80],
            data={"command": command, "exit_code": exit_code},
        )
        fname = f"{artifact.id}.log"
        with open(os.path.join(self.dir, fname), "w", encoding="utf-8") as f:
            f.write(output)
        artifact.file = fname
        return self._persist(artifact)

    def save_tasklist_snapshot(self, tasklist: list[dict]) -> Artifact:
        artifact = Artifact(
            session_id=self.session_id,
            kind="tasklist_snapshot",
            label="task list",
            data={"tasklist": tasklist},
        )
        fname = f"{artifact.id}.json"
        with open(os.path.join(self.dir, fname), "w", encoding="utf-8") as f:
            json.dump(tasklist, f, indent=2)
        artifact.file = fname
        return self._persist(artifact)

    def save_file_change(self, path: str, action: str, nbytes: int = 0) -> Artifact:
        artifact = Artifact(
            session_id=self.session_id,
            kind="file_change",
            label=f"{action} {path}",
            data={"path": path, "action": action, "bytes": nbytes},
        )
        return self._persist(artifact)

    def save_screenshot(self, png_bytes: bytes, label: str) -> Artifact:
        """Reserved for future use; not called by the current agent (the model
        never sees images — see browser_tools.py)."""
        artifact = Artifact(session_id=self.session_id, kind="screenshot", label=label)
        fname = f"{artifact.id}.png"
        with open(os.path.join(self.dir, fname), "wb") as f:
            f.write(png_bytes)
        artifact.file = fname
        return self._persist(artifact)

    def save_browser_recording(self, video_path: str) -> Artifact:
        """Index a Playwright-recorded video that already lives in self.dir
        (record_video_dir was set to this session's artifact directory, so the
        file just needs registering, not copying)."""
        fname = os.path.basename(video_path)
        artifact = Artifact(
            session_id=self.session_id,
            kind="browser_recording",
            label="Browser session recording",
            file=fname,
        )
        return self._persist(artifact)

    def list_for_session(self) -> list[dict]:
        return db.list_artifacts(self.session_id)

    def read_file(self, filename: str) -> Optional[bytes]:
        safe = os.path.basename(filename)
        full = os.path.join(self.dir, safe)
        if not os.path.isfile(full):
            return None
        with open(full, "rb") as f:
            return f.read()

    def path_for(self, filename: str) -> Optional[str]:
        """Absolute path for a file, for cases (e.g. video) that need streaming
        with Range support rather than a full in-memory read."""
        safe = os.path.basename(filename)
        full = os.path.join(self.dir, safe)
        return full if os.path.isfile(full) else None

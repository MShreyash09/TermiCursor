import hashlib
import json
import os
import shutil
from typing import Optional

from core.config import ARTIFACTS_DIR, safe_join
from core.persistence import db
from .models import Artifact

PREVIEW_LIMIT = 1_000_000  # bytes; bigger originals are still restorable, just not sent for the diff view


def _key(rel: str) -> str:
    return os.path.normpath(rel).replace("\\", "/")


def _preview(b: bytes | None) -> str | None:
    if b is None or len(b) > PREVIEW_LIMIT:
        return None
    try:
        return b.decode("utf-8")
    except UnicodeDecodeError:
        return None


def _read(path: str) -> bytes | None:
    if not os.path.isfile(path):
        return None
    with open(path, "rb") as f:
        return f.read()


class ArtifactStore:
    """Persists artifacts for one session: a file body (optional) under
    ARTIFACTS_DIR/<session_id>/ plus an index row in SQLite.
    """

    def __init__(self, session_id: str):
        self.session_id = session_id
        self.dir = safe_join(ARTIFACTS_DIR, session_id)  # session_id arrives from the URL
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
        full = self.path_for(filename)
        if full is None:
            return None
        with open(full, "rb") as f:
            return f.read()

    def path_for(self, filename: str) -> Optional[str]:
        """Absolute path for a file, for cases (e.g. video) that need streaming
        with Range support rather than a full in-memory read."""
        try:
            full = safe_join(self.dir, os.path.basename(filename))
        except ValueError:
            return None
        return full if os.path.isfile(full) else None

    # ── Undo: originals are copied to <dir>/snapshots/<hash> (or <hash>.new = "did not exist")
    # the first time the session changes a file; file_change artifacts say which paths changed.
    def _snap(self, key: str) -> str:
        return os.path.join(self.dir, "snapshots", hashlib.sha1(key.encode()).hexdigest()[:16])

    def snapshot_original(self, project_root: str, rel: str) -> None:
        """Call before a tool changes `rel`. Once per path; unreadable files are skipped."""
        key = _key(rel)
        snap = self._snap(key)
        try:
            src = safe_join(project_root, key)
            if os.path.exists(snap) or os.path.exists(snap + ".new"):
                return
            os.makedirs(os.path.dirname(snap), exist_ok=True)
            if os.path.isfile(src):
                try:
                    shutil.copyfile(src, snap)
                except OSError:
                    if os.path.exists(snap):
                        os.remove(snap)
                    raise
            else:
                open(snap + ".new", "wb").close()
        except (OSError, ValueError):
            pass

    def _diffs(self, project_root: str):
        """(key, status, original bytes, current bytes, abs path) for files that differ from the snapshot."""
        keys = dict.fromkeys(_key(a["data"]["path"]) for a in self.list_for_session()
                             if a["kind"] == "file_change" and a["data"].get("path"))
        for key in keys:
            snap = self._snap(key)
            try:
                existed = os.path.exists(snap)
                if not existed and not os.path.exists(snap + ".new"):
                    continue
                abs_path = safe_join(project_root, key)
                orig, cur = (_read(snap) if existed else None), _read(abs_path)
            except (OSError, ValueError):
                continue
            if orig != cur:
                yield key, ("created" if not existed else "deleted" if cur is None else "modified"), orig, cur, abs_path

    def changes(self, project_root: str) -> list[dict]:
        out = []
        for key, status, orig, cur, _ in self._diffs(project_root):
            o, c = _preview(orig), _preview(cur)
            out.append({"path": key, "status": status, "original": o, "current": c,
                        "no_preview": (orig is not None and o is None) or (cur is not None and c is None)})
        return out

    def revert(self, project_root: str, path: str | None = None) -> list[str]:
        """Restore one changed file (or all). Only paths this session changed are touched."""
        key = _key(path) if path is not None else None
        done = []
        for k, status, orig, _, abs_path in list(self._diffs(project_root)):
            if key is not None and k != key:
                continue
            if status == "created":
                os.remove(abs_path)
            else:
                os.makedirs(os.path.dirname(abs_path), exist_ok=True)
                with open(abs_path, "wb") as f:
                    f.write(orig)
            done.append(k)
        if key is not None and not done:
            raise ValueError(f"No changes to undo for {path!r}")
        return done

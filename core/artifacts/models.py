import time
import uuid
from typing import Literal, Optional

from pydantic import BaseModel, Field

ArtifactKind = Literal[
    "command_log", "tasklist_snapshot", "file_change", "screenshot",
    "browser_recording", "note",
]


class Artifact(BaseModel):
    id: str = Field(default_factory=lambda: uuid.uuid4().hex[:12])
    session_id: str
    kind: ArtifactKind
    label: str
    created_at: float = Field(default_factory=time.time)
    file: Optional[str] = None
    data: dict = Field(default_factory=dict)

"""AgentSession: in-memory state for one agent run, including the async
approval mechanism the trust gate blocks on, and cooperative cancellation.
"""
import asyncio
import time
import uuid
from dataclasses import dataclass, field
from typing import Literal, Optional

SessionStatus = Literal[
    "created", "planning", "awaiting_plan_approval", "running", "blocked", "done",
    "error", "cancelled"
]
StepStatus = Literal["pending", "in_progress", "done", "failed"]


@dataclass
class TaskStep:
    id: str
    description: str
    status: StepStatus = "pending"
    result: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "description": self.description,
            "status": self.status,
            "result": self.result,
        }


@dataclass
class AgentSession:
    project_path: str
    goal: str
    id: str = field(default_factory=lambda: uuid.uuid4().hex[:12])
    status: SessionStatus = "created"
    steps: list[TaskStep] = field(default_factory=list)
    created_at: float = field(default_factory=time.time)
    error: Optional[str] = None
    mode: Optional[str] = None  # "simple" | "complex", set by the router
    # "build": route, plan if needed, code. "plan": always plan, pause for review,
    # then code. "ask": answer directly with read-only tools, never plan or edit.
    agent: str = "build"

    cancelled: bool = False
    memory_saved: bool = False  # guard so a session is recorded to memory once

    _approvals: dict[str, asyncio.Future] = field(default_factory=dict)
    _run_task: Optional[asyncio.Task] = None
    _plan_review: Optional[asyncio.Future] = None

    def await_plan_review(self) -> asyncio.Future:
        self._plan_review = asyncio.get_event_loop().create_future()
        return self._plan_review

    def resolve_plan_review(self, decision: dict) -> bool:
        """decision: {action: "approve"|"revise"|"reject", steps?, feedback?}"""
        fut = self._plan_review
        if fut is None or fut.done():
            return False
        fut.set_result(decision)
        return True

    def set_steps(self, descriptions: list[str]) -> None:
        self.steps = [
            TaskStep(id=f"{self.id}-s{i}", description=d)
            for i, d in enumerate(descriptions)
        ]

    def tasklist_dict(self) -> list[dict]:
        return [s.to_dict() for s in self.steps]

    def create_approval(self, call_id: str) -> asyncio.Future:
        fut: asyncio.Future = asyncio.get_event_loop().create_future()
        self._approvals[call_id] = fut
        return fut

    def resolve_approval(self, call_id: str, approved: bool) -> bool:
        fut = self._approvals.get(call_id)
        if fut is None or fut.done():
            return False
        fut.set_result(approved)
        return True

    def cancel(self) -> None:
        self.cancelled = True
        self.status = "cancelled"
        for fut in list(self._approvals.values()):
            if not fut.done():
                fut.set_result(False)
        if self._plan_review is not None and not self._plan_review.done():
            self._plan_review.set_result({"action": "reject"})
        task = self._run_task
        if task is not None and not task.done():
            task.cancel()

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "project_path": self.project_path,
            "goal": self.goal,
            "status": self.status,
            "mode": self.mode,
            "agent": self.agent,
            "steps": self.tasklist_dict(),
            "error": self.error,
            "created_at": self.created_at,
        }


# Process-wide session registry (single-run v1; a manager view lists these).
SESSIONS: dict[str, AgentSession] = {}

"""AgentLoop: route -> (plan ->) execute one or more steps via a bounded ReAct
sub-loop. `run()` is an async generator that yields typed event dicts the
server streams over the WebSocket.

Event shapes (all have a "type"):
  mode            {mode: "simple"|"complex"}
  plan            {steps: [...]}
  task_update     {step_id, status, description}
  thought         {step_id, text}
  tool_call       {step_id, call_id, tool, args, risk}
  approval_needed {step_id, call_id, tool, args}
  tool_result     {step_id, call_id, tool, success, output}
  artifact_created{artifact}
  step_done       {step_id, summary}
  session_done    {status}
  error           {message}
"""
import json
import os
import uuid
from typing import AsyncGenerator

from pydantic import ValidationError

from core.config import MAX_ITERATIONS_PER_STEP, SIMPLE_MAX_ITERATIONS, MAX_JSON_RETRIES
from core.persistence import db
from core.tools import trust_gate
from core.tools.base import Tool, ToolResult
from core.tools.registry import build_registry, tools_schema_text
from core.tools.browser_tools import close_browser_session
from core.memory import project_memory
from .json_protocol import parse_agent_output, ProtocolError, CORRECTION_MESSAGE
from .llm_client import LLMClient
from .planner import decompose_task
from .prompts import EXECUTOR_SYSTEM_PROMPT, SIMPLE_EXECUTOR_SYSTEM_PROMPT
from .router import classify_intent
from .session import AgentSession, TaskStep
from core.artifacts.store import ArtifactStore

# Tools where re-issuing the exact same call is pointless (rewriting identical
# file content, re-deleting the same file). A small model that loops tends to do
# exactly this; we detect it and push the model to finish instead. Note we do
# NOT dedup run_shell_command — re-running a build/test command after an edit is
# a legitimate, common pattern.
_DEDUP_TOOLS = {"write_file", "delete_file"}


def _action_sig(action) -> str:
    return action.tool + "|" + json.dumps(action.args, sort_keys=True, default=str)


class AgentLoop:
    def __init__(self, session: AgentSession, llm: LLMClient | None = None):
        from core.config import ROUTER_MODEL, PLANNER_MODEL, EXECUTOR_MODEL
        
        self.session = session
        # For backward compatibility, if a single llm is provided, use it for all roles.
        # Otherwise, instantiate separate clients for each role based on config.
        self.router_llm = llm or LLMClient(model=ROUTER_MODEL)
        self.planner_llm = llm or LLMClient(model=PLANNER_MODEL)
        self.executor_llm = llm or LLMClient(model=EXECUTOR_MODEL)
        
        self.llm = self.executor_llm # Alias for simplicity in some places
        self.artifacts = ArtifactStore(session.id)
        self.tools: dict[str, Tool] = build_registry(
            session.project_path, session.id, self.artifacts.dir
        )

    async def run(self) -> AsyncGenerator[dict, None]:
        """Runs the loop and, on every exit path (done, error, cancelled, or an
        unhandled exception), closes any browser session that was opened so its
        video recording is flushed to disk and indexed as an artifact. No event
        is yielded for it here — yielding from a `finally` block during
        cancellation is unreliable (interacts badly with how CancelledError
        propagates through async generators), so the recording artifact is
        picked up by the caller doing one artifact-list refresh after the run
        ends instead.
        """
        try:
            async for ev in self._run_body():
                yield ev
        finally:
            await self._finalize_browser()

    async def _finalize_browser(self) -> None:
        try:
            video_path = await close_browser_session(self.session.id)
        except Exception:
            return
        if video_path and os.path.exists(video_path):
            try:
                self.artifacts.save_browser_recording(video_path)
            except Exception:
                pass

    async def _run_body(self) -> AsyncGenerator[dict, None]:
        s = self.session
        try:
            if s.cancelled:
                yield {"type": "session_done", "status": "cancelled"}
                return

            # ── Route: simple (fast, direct) vs complex (plan then execute) ──
            mode = await classify_intent(s.goal, self.router_llm)
            s.mode = mode
            yield {"type": "mode", "mode": mode}
            if s.cancelled:
                yield {"type": "session_done", "status": "cancelled"}
                return

            if mode == "simple":
                async for ev in self._run_simple():
                    yield ev
                return

            # ── Plan phase (complex only) ──
            s.status = "planning"
            db.upsert_session(s.to_dict())
            steps = await decompose_task(s.goal, s.project_path, self.planner_llm)
            if s.cancelled:
                s.status = "cancelled"
                db.upsert_session(s.to_dict())
                yield {"type": "session_done", "status": "cancelled"}
                return
            s.set_steps(steps)
            db.replace_tasks(s.id, s.tasklist_dict())
            self.artifacts.save_tasklist_snapshot(s.tasklist_dict())
            yield {"type": "plan", "steps": s.tasklist_dict()}

            # ── Execute phase ──
            s.status = "running"
            db.upsert_session(s.to_dict())
            for step in s.steps:
                if s.cancelled:
                    break
                async for ev in self._run_step(step):
                    yield ev
                if step.status == "failed":
                    s.status = "error"
                    s.error = f"Step failed: {step.description}"
                    db.upsert_session(s.to_dict())
                    yield {"type": "session_done", "status": "error"}
                    return

            if s.cancelled:
                s.status = "cancelled"
                db.upsert_session(s.to_dict())
                yield {"type": "session_done", "status": "cancelled"}
                return

            s.status = "done"
            db.upsert_session(s.to_dict())
            yield {"type": "session_done", "status": "done"}

        except Exception as e:  # noqa: BLE001 — surface any unexpected failure to UI
            s.status = "error"
            s.error = str(e)
            db.upsert_session(s.to_dict())
            yield {"type": "error", "message": str(e)}
            yield {"type": "session_done", "status": "error"}

    async def _run_simple(self) -> AsyncGenerator[dict, None]:
        """Fast path: no multi-step plan — treat the whole request as one step and
        answer directly, using tools only as needed."""
        s = self.session
        s.status = "running"
        db.upsert_session(s.to_dict())
        step = TaskStep(id=f"{s.id}-s0", description=s.goal)
        s.steps = [step]
        db.replace_tasks(s.id, s.tasklist_dict())

        async for ev in self._run_step(step, simple=True):
            yield ev

        if s.cancelled:
            s.status = "cancelled"
            db.upsert_session(s.to_dict())
            yield {"type": "session_done", "status": "cancelled"}
            return
        s.status = "done" if step.status == "done" else "error"
        db.upsert_session(s.to_dict())
        yield {"type": "session_done", "status": s.status}

    async def _run_step(self, step: TaskStep, simple: bool = False) -> AsyncGenerator[dict, None]:
        s = self.session
        max_iters = SIMPLE_MAX_ITERATIONS if simple else MAX_ITERATIONS_PER_STEP
        step.status = "in_progress"
        db.update_task(step.id, step.status)
        yield {"type": "task_update", "step_id": step.id, "status": step.status,
               "description": step.description}

        memories = project_memory.get_context(s.project_path) or "(none)"
        template = SIMPLE_EXECUTOR_SYSTEM_PROMPT if simple else EXECUTOR_SYSTEM_PROMPT
        system = template.format(
            tools=tools_schema_text(self.tools), goal=s.goal, step=step.description,
            memories=memories,
        )
        messages = [{"role": "system", "content": system},
                    {"role": "user", "content": "Respond with one JSON object."}]

        done_writes: set[str] = set()   # signatures of write/delete calls that succeeded
        last_success_summary: str | None = None
        redundant_nudges = 0

        def _finish(summary: str | None):
            step.status = "done"
            step.result = summary
            db.update_task(step.id, step.status, step.result)
            self.artifacts.save_tasklist_snapshot(s.tasklist_dict())

        for _ in range(max_iters):
            if s.cancelled:
                return
            turn = await self._get_valid_turn(messages)
            if turn is None:
                step.status = "failed"
                step.result = "Agent produced unparseable output repeatedly."
                db.update_task(step.id, step.status, step.result)
                yield {"type": "task_update", "step_id": step.id, "status": step.status,
                       "description": step.description}
                return

            if turn.thought:
                yield {"type": "thought", "step_id": step.id, "text": turn.thought}

            # Step finished.
            if turn.action is None:
                _finish(turn.final_answer)
                yield {"type": "step_done", "step_id": step.id, "summary": turn.final_answer}
                yield {"type": "task_update", "step_id": step.id, "status": step.status,
                       "description": step.description}
                return

            # Loop guard: the model is re-issuing a write/delete it already did
            # successfully (the classic small-model failure — see the 9x identical
            # write bug). Don't run it again; push it to finalize, and if it keeps
            # insisting, complete the step ourselves so we don't burn iterations.
            if turn.action.tool in _DEDUP_TOOLS and _action_sig(turn.action) in done_writes:
                redundant_nudges += 1
                if redundant_nudges >= 2:
                    yield {"type": "thought", "step_id": step.id,
                           "text": "Detected repeated identical action — treating the step as complete."}
                    _finish(last_success_summary or "Completed.")
                    yield {"type": "step_done", "step_id": step.id, "summary": step.result}
                    yield {"type": "task_update", "step_id": step.id, "status": step.status,
                           "description": step.description}
                    return
                messages.append({"role": "assistant", "content": _compact_turn(turn)})
                messages.append({"role": "user", "content": (
                    "You already performed that exact action successfully; it is done and "
                    "must NOT be repeated. If this step's goal is now met, reply with "
                    '{"thought":"...","action":null,"final_answer":"<what you accomplished>"}.')})
                continue

            # Tool call.
            result = None
            async for ev, r in self._execute_action(step, turn.action):
                if ev is not None:
                    yield ev
                if r is not None:
                    result = r

            if result is not None and result.success:
                if turn.action.tool in _DEDUP_TOOLS:
                    done_writes.add(_action_sig(turn.action))
                    last_success_summary = result.output or f"{turn.action.tool} completed."

            messages.append({"role": "assistant", "content": _compact_turn(turn)})
            messages.append({"role": "user",
                             "content": f"Tool result:\n{result.to_context_str() if result else '(no result)'}\n\n"
                                        "If the step's goal is now satisfied, respond with action=null "
                                        "and a final_answer. Do not repeat completed actions."})

        # Ran out of iterations. If real work succeeded, count it done rather than
        # failing the whole run over a missing 'final_answer' from a small model.
        if last_success_summary is not None:
            _finish(last_success_summary)
            yield {"type": "step_done", "step_id": step.id, "summary": step.result}
            yield {"type": "task_update", "step_id": step.id, "status": step.status,
                   "description": step.description}
            return

        step.status = "failed"
        step.result = f"Exceeded {max_iters} iterations without completing."
        db.update_task(step.id, step.status, step.result)
        yield {"type": "task_update", "step_id": step.id, "status": step.status,
               "description": step.description}

    async def _get_valid_turn(self, messages: list[dict]):
        for attempt in range(MAX_JSON_RETRIES + 1):
            raw = await self.llm.chat(messages)
            try:
                return parse_agent_output(raw)
            except ProtocolError as e:
                if attempt >= MAX_JSON_RETRIES:
                    return None
                messages.append({"role": "assistant", "content": raw})
                messages.append({"role": "user",
                                 "content": CORRECTION_MESSAGE.format(error=str(e))})
        return None

    async def _execute_action(self, step: TaskStep, action):
        s = self.session
        call_id = uuid.uuid4().hex[:8]
        tool = self.tools.get(action.tool)

        if tool is None:
            result = ToolResult(success=False, error=f"Unknown tool '{action.tool}'.")
            yield ({"type": "tool_result", "step_id": step.id, "call_id": call_id,
                    "tool": action.tool, "success": False, "output": result.to_context_str()},
                   result)
            return

        try:
            validated = tool.validate_args(action.args)
        except ValidationError as e:
            result = ToolResult(success=False, error=f"Invalid arguments: {e}")
            yield ({"type": "tool_result", "step_id": step.id, "call_id": call_id,
                    "tool": action.tool, "success": False, "output": result.to_context_str()},
                   result)
            return

        risk = trust_gate.classify_risk(action.tool, action.args, s.project_path)
        yield ({"type": "tool_call", "step_id": step.id, "call_id": call_id,
                "tool": action.tool, "args": action.args, "risk": risk}, None)

        if risk == "needs_approval":
            fut = s.create_approval(call_id)
            s.status = "blocked"
            db.upsert_session(s.to_dict())
            yield ({"type": "approval_needed", "step_id": step.id, "call_id": call_id,
                    "tool": action.tool, "args": action.args}, None)
            approved = await fut
            s.status = "running"
            db.upsert_session(s.to_dict())
            if not approved:
                result = ToolResult(success=False, error="User denied this action.")
                yield ({"type": "tool_result", "step_id": step.id, "call_id": call_id,
                        "tool": action.tool, "success": False,
                        "output": result.to_context_str()}, result)
                return

        result = await tool.run(validated, project_root=s.project_path)
        db.insert_tool_call(s.id, step.id, action.tool, action.args,
                            result.success, result.output or result.error)

        art = None
        if action.tool == "run_shell_command":
            art = self.artifacts.save_command_log(
                action.args.get("command", ""), result.output,
                result.data.get("exit_code", -1))
        elif action.tool in ("write_file", "delete_file") and result.success:
            art = self.artifacts.save_file_change(
                action.args.get("path", ""),
                "write" if action.tool == "write_file" else "delete",
                result.data.get("bytes", 0))
        if art is not None:
            yield ({"type": "artifact_created", "artifact": art.model_dump()}, None)

        yield ({"type": "tool_result", "step_id": step.id, "call_id": call_id,
                "tool": action.tool, "success": result.success,
                "output": result.to_context_str()}, result)


def _compact_turn(turn) -> str:
    import json
    action = None if turn.action is None else {"tool": turn.action.tool, "args": turn.action.args}
    return json.dumps({"thought": turn.thought, "action": action,
                       "final_answer": turn.final_answer})

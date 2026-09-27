"""AgentLoop: route -> (plan ->) execute one or more steps via a bounded ReAct
sub-loop. `run()` is an async generator that yields typed event dicts the
server streams over the WebSocket.

Event shapes (all have a "type"):
  mode            {mode: "simple"|"complex"}
  plan            {steps: [...]}
  plan_review     {steps: [...]}   (plan mode: waiting for approve/revise/reject)
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
import rag
from .context import looks_project_specific, mentioned_files, wants_change
from .json_protocol import AgentAction, parse_agent_output, ProtocolError, CORRECTION_MESSAGE
from .llm_client import LLMClient
from .planner import decompose_task
from .prompts import (ASK_MODE_RULES, DO_THE_WORK_NUDGE, EXECUTOR_SYSTEM_PROMPT, LOOK_FIRST_NUDGE,
                      SIMPLE_EXECUTOR_SYSTEM_PROMPT)
from .router import classify_intent
from .session import AgentSession, TaskStep
from core.artifacts.store import ArtifactStore

# Tools where re-issuing the exact same call is pointless (rewriting identical
# file content, re-deleting the same file). A small model that loops tends to do
# exactly this; we detect it and push the model to finish instead. Note we do
# NOT dedup run_shell_command — re-running a build/test command after an edit is
# a legitimate, common pattern.
_DEDUP_TOOLS = {"write_file", "edit_file", "delete_file"}
READ_ONLY_TOOLS = {"read_file", "list_dir", "search_codebase", "grep", "find_files"}
ATTACH_LINES = 100        # lines of each auto-attached file (the model can read_file for more)
KEEP_FULL_RESULTS = 2     # older tool results get shortened so the context window doesn't overflow


def _norm(path: str) -> str:
    return os.path.normpath(path or ".").replace(os.sep, "/").lower()


def _file_list(project_path: str) -> str:
    """Project tree for the prompt, rooted at "./" (a folder-name root line made the
    model pass the project's own name as a subfolder, e.g. cwd="my-app")."""
    _, _, rest = rag.get_project_tree(project_path, max_depth=3, max_files=80).partition("\n")
    return "./ (project root)\n" + rest


def _erased_lines(abs_path: str, new_content: str) -> list[str]:
    """Existing lines a whole-file write would drop, if that's most of the file.
    Small models "add a function" by rewriting the file with only the new function."""
    if not os.path.isfile(abs_path):
        return []
    try:
        with open(abs_path, "r", encoding="utf-8", errors="replace") as f:
            old = [ln.strip() for ln in f if ln.strip()]
    except OSError:
        return []
    kept = {ln.strip() for ln in new_content.splitlines()}
    lost = [ln for ln in old if ln not in kept]
    return lost if len(old) >= 3 and len(lost) > len(old) * 0.3 else []


def _shorten_old_results(messages: list[dict]) -> None:
    results = [m for m in messages if m["role"] == "user" and m["content"].startswith("Tool result:")]
    for m in results[:-KEEP_FULL_RESULTS]:
        if len(m["content"]) > 700:
            m["content"] = m["content"][:500] + "\n[... older result shortened to save context; read again if needed]"


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
        # Files the agent has seen (read, attached, or written) this session. write_file
        # over an existing file it hasn't seen is refused: that's how small models erase code.
        self._known_files: set[str] = set()
        if session.agent == "ask":
            # Ask mode is read-only: it can look around the codebase but never change it.
            self.tools = {k: v for k, v in self.tools.items() if k in READ_ONLY_TOOLS}

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
            if s.agent == "ask":
                mode = "simple"
            elif s.agent == "plan":
                mode = "complex"
            else:
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
            goal = s.goal
            while True:
                steps = await decompose_task(goal, s.project_path, self.planner_llm)
                if s.cancelled:
                    s.status = "cancelled"
                    db.upsert_session(s.to_dict())
                    yield {"type": "session_done", "status": "cancelled"}
                    return
                s.set_steps(steps)
                db.replace_tasks(s.id, s.tasklist_dict())
                if s.agent != "plan":
                    break
                # Plan mode: hand the plan to the user and wait for a decision.
                s.status = "awaiting_plan_approval"
                db.upsert_session(s.to_dict())
                fut = s.await_plan_review()
                yield {"type": "plan_review", "steps": s.tasklist_dict()}
                decision = await fut
                action = decision.get("action")
                if action == "approve":
                    edited = [str(x).strip() for x in decision.get("steps") or [] if str(x).strip()]
                    if edited:
                        s.set_steps(edited)
                        db.replace_tasks(s.id, s.tasklist_dict())
                    break
                if action == "revise":
                    prev = "\n".join(f"{i+1}. {st.description}" for i, st in enumerate(s.steps))
                    goal = (f"{s.goal}\n\nA previous plan was:\n{prev}\n\n"
                            f"The user asked for these changes to the plan: {decision.get('feedback', '')}")
                    s.status = "planning"
                    yield {"type": "mode", "mode": "complex"}
                    continue
                s.status = "cancelled"
                db.upsert_session(s.to_dict())
                yield {"type": "session_done", "status": "cancelled"}
                return
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
            memories=memories, files=_file_list(s.project_path),
            mode_rules=ASK_MODE_RULES if s.agent == "ask" else "",
        )

        # Files named in the request are read up front, like an @-mention in Cursor, so
        # the model starts from the real code instead of guessing from the file name.
        attached: list[str] = []
        for rel in mentioned_files(s.project_path, f"{step.description}\n{s.goal}"):
            action = AgentAction(tool="read_file", args={"path": rel, "limit": ATTACH_LINES})
            async for ev, r in self._execute_action(step, action):
                if ev is not None:
                    yield ev
                if r is not None and r.success:
                    attached.append(r.output)
        intro = "Respond with one JSON object."
        if attached:
            intro = ("Files mentioned in the request (already read for you):\n\n"
                     + "\n\n".join(attached) + "\n\n" + intro)
        messages = [{"role": "system", "content": system},
                    {"role": "user", "content": intro}]
        tools_used = False
        nudged = False
        changed_files = False   # a write/edit/delete succeeded in this step
        work_nudged = False

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
                # Answered a question about the project without looking at anything:
                # that's a guess. Push back once.
                if (not tools_used and not attached and not nudged
                        and looks_project_specific(step.description)):
                    nudged = True
                    messages.append({"role": "assistant", "content": _compact_turn(turn)})
                    messages.append({"role": "user", "content": LOOK_FIRST_NUDGE})
                    continue
                # Asked to change code but nothing was changed: small models often just
                # describe the fix, or claim "added it" without an edit. Push back once.
                if (s.agent != "ask" and not changed_files and not work_nudged
                        and wants_change(step.description)):
                    work_nudged = True
                    messages.append({"role": "assistant", "content": _compact_turn(turn)})
                    messages.append({"role": "user", "content": DO_THE_WORK_NUDGE})
                    continue
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
            tools_used = True
            result = None
            async for ev, r in self._execute_action(step, turn.action):
                if ev is not None:
                    yield ev
                if r is not None:
                    result = r

            if result is not None and result.success:
                if turn.action.tool in _DEDUP_TOOLS:
                    changed_files = True
                    done_writes.add(_action_sig(turn.action))
                    # First line only ("Edited calc.py: ..."): it may become the step's summary.
                    last_success_summary = (result.output or f"{turn.action.tool} completed.").splitlines()[0]

            messages.append({"role": "assistant", "content": _compact_turn(turn)})
            messages.append({"role": "user",
                             "content": f"Tool result:\n{result.to_context_str() if result else '(no result)'}\n\n"
                                        "If the step's goal is now satisfied, respond with action=null "
                                        "and a final_answer. Do not repeat completed actions."})
            _shorten_old_results(messages)

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

        if action.tool == "write_file":
            path = action.args.get("path", "")
            if os.path.isfile(os.path.join(s.project_path, path)) and _norm(path) not in self._known_files:
                result = ToolResult(success=False, error=(
                    f"{path} already exists and you haven't read it. read_file it first, then change it with "
                    "edit_file. write_file would replace the whole file and erase the rest of its code."))
                yield ({"type": "tool_result", "step_id": step.id, "call_id": call_id,
                        "tool": action.tool, "success": False, "output": result.to_context_str()},
                       result)
                return

        if action.tool == "write_file":
            erased = _erased_lines(os.path.join(s.project_path, action.args.get("path", "")),
                                   action.args.get("content", ""))
            if erased:
                result = ToolResult(success=False, error=(
                    f"Refused: this write_file would delete {len(erased)} existing lines of "
                    f"{action.args.get('path')} (e.g. {erased[0]!r}). To add or change code in an existing file, "
                    "use edit_file with the exact old text and the new text."))
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
        if result.success and action.tool in ("read_file", "edit_file", "write_file"):
            self._known_files.add(_norm(action.args.get("path", "")))
        db.insert_tool_call(s.id, step.id, action.tool, action.args,
                            result.success, result.output or result.error)

        art = None
        if action.tool == "run_shell_command":
            art = self.artifacts.save_command_log(
                action.args.get("command", ""), result.output,
                result.data.get("exit_code", -1))
        elif action.tool in ("write_file", "edit_file", "delete_file") and result.success:
            art = self.artifacts.save_file_change(
                action.args.get("path", ""),
                {"write_file": "write", "edit_file": "edit", "delete_file": "delete"}[action.tool],
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

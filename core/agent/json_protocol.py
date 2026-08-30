"""Parsing + validation of the single-JSON-object protocol the agent speaks.

Every executor turn must be ONE JSON object:
    {"thought": str, "action": {"tool": str, "args": {...}} | null,
     "final_answer": str | null}

Either `action` (do a tool call) or `final_answer` (step is done) is set.
"""
import json
import re
from dataclasses import dataclass
from typing import Optional


@dataclass
class AgentAction:
    tool: str
    args: dict


@dataclass
class ParsedTurn:
    thought: str
    action: Optional[AgentAction]
    final_answer: Optional[str]


class ProtocolError(Exception):
    """Raised when the model output can't be parsed into a valid ParsedTurn."""


_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE)

# Small models frequently wrap multi-line string values in Python-style triple
# quotes (\"\"\"...\"\"\" or '''...'''), which is NOT valid JSON. Convert each
# such block into a properly escaped JSON string before parsing. Done on the raw
# text (before brace-scanning) because the stray quote chars also confuse the
# balanced-brace extractor.
_TRIPLE_RE = re.compile(r'"""(.*?)"""|\'\'\'(.*?)\'\'\'', re.DOTALL)


def _repair_triple_quotes(text: str) -> str:
    def _repl(m: "re.Match") -> str:
        content = m.group(1) if m.group(1) is not None else m.group(2)
        return json.dumps(content)  # escapes newlines, quotes, etc. -> valid JSON string
    return _TRIPLE_RE.sub(_repl, text)


def _extract_json_blob(text: str) -> str:
    stripped = text.strip()
    stripped = _FENCE_RE.sub("", stripped).strip()
    if stripped.startswith("{") and stripped.endswith("}"):
        return stripped
    start = stripped.find("{")
    if start == -1:
        raise ProtocolError("No JSON object found in model output.")
    depth = 0
    in_str = False
    esc = False
    for i in range(start, len(stripped)):
        c = stripped[i]
        if in_str:
            if esc:
                esc = False
            elif c == "\\":
                esc = True
            elif c == '"':
                in_str = False
            continue
        if c == '"':
            in_str = True
        elif c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return stripped[start : i + 1]
    raise ProtocolError("Unterminated JSON object in model output.")


def parse_agent_output(text: str) -> ParsedTurn:
    blob = _extract_json_blob(_repair_triple_quotes(text))
    try:
        # strict=False tolerates literal newlines/tabs inside string values, which
        # small models routinely emit for code content instead of escaping them.
        obj = json.loads(blob, strict=False)
    except json.JSONDecodeError as e:
        raise ProtocolError(f"Invalid JSON: {e}")

    if not isinstance(obj, dict):
        raise ProtocolError("Top-level output must be a JSON object.")

    thought = obj.get("thought", "")
    if not isinstance(thought, str):
        thought = str(thought)

    action_raw = obj.get("action")
    final_answer = obj.get("final_answer")

    action: Optional[AgentAction] = None
    if action_raw not in (None, {}, ""):
        if not isinstance(action_raw, dict):
            raise ProtocolError("`action` must be an object or null.")
        tool = action_raw.get("tool")
        if not isinstance(tool, str) or not tool:
            raise ProtocolError("`action.tool` must be a non-empty string.")
        args = action_raw.get("args", {})
        if args is None:
            args = {}
        if not isinstance(args, dict):
            raise ProtocolError("`action.args` must be an object.")
        action = AgentAction(tool=tool, args=args)

    if final_answer is not None and not isinstance(final_answer, str):
        final_answer = str(final_answer)

    if action is None and not final_answer:
        raise ProtocolError("Output must set either `action` or `final_answer`.")

    return ParsedTurn(thought=thought, action=action, final_answer=final_answer)


CORRECTION_MESSAGE = (
    "Your previous response could not be parsed: {error}\n"
    "Respond with EXACTLY one JSON object and nothing else, matching:\n"
    '{{"thought": "...", "action": {{"tool": "...", "args": {{...}}}}, "final_answer": null}}\n'
    "Set either `action` (to call a tool) or `final_answer` (when the step is done), not both."
)

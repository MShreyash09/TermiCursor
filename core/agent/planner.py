"""Planner: turn a user goal into an ordered list of step descriptions."""
import json
import re

from .llm_client import LLMClient
from .prompts import PLANNER_PROMPT
from core.memory import project_memory
import rag


def _extract_json_array(text: str) -> list:
    stripped = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.IGNORECASE).strip()
    start = stripped.find("[")
    end = stripped.rfind("]")
    if start == -1 or end == -1 or end < start:
        raise ValueError("No JSON array found in planner output.")
    return json.loads(stripped[start : end + 1])


async def decompose_task(goal: str, project_path: str, llm: LLMClient) -> list[str]:
    """Return an ordered list of step descriptions.

    Falls back to a single "do the whole thing" step if the planner output is
    unusable, so a bad plan never hard-fails the run before it starts.
    """
    tree = rag.get_project_tree(project_path)
    memories = project_memory.get_context(project_path)
    prompt = PLANNER_PROMPT.format(project_tree=tree, goal=goal, memories=memories or "(none)")
    raw = await llm.generate(prompt, temperature=0.2)

    try:
        arr = _extract_json_array(raw)
        steps = [
            str(item["description"]).strip()
            for item in arr
            if isinstance(item, dict) and item.get("description")
        ]
        steps = [s for s in steps if s]
        if steps:
            return steps[:7]
    except Exception:
        pass

    return [f"Accomplish the goal: {goal}"]

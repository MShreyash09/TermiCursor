"""Intent router: decide whether a goal needs the full plan->execute loop, or
can be answered directly with a fast single-step pass.

Policy (deliberately biased toward "simple" so everyday requests are fast):
- SIMPLE by default — questions, lookups, explanations, and single-artifact code
  work like "write a function", "create hello.py", "write control-statement
  examples", "fix this bug". These skip planning and are handled directly in one
  step (which can still call tools).
- COMPLEX only for genuine multi-part builds — a project/app/website/backend/etc.,
  or a request chaining several distinct deliverables. These benefit from an
  explicit up-front task list.

Heuristics resolve almost everything with no LLM call; only long/ambiguous
multi-sentence goals fall back to one cheap classification call.
"""
import re

from .llm_client import LLMClient

# A build/creation verb...
_BUILD_VERB = (
    r"(?:build|create|make|develop|implement|scaffold|generate|set\s*up|design|"
    r"put\s+together|spin\s+up)"
)
# ...aimed at a whole-project-scale deliverable.
_PROJECT_SCOPE = (
    r"(?:web\s*)?(?:app|application|web\s*site|website|web\s*page|backend|frontend|"
    r"full[-\s]*stack|project|system|dashboard|platform|micro-?service|game|"
    r"bot|browser\s+extension|mobile\s+app|rest\s+api|crud\b|pipeline|"
    r"landing\s+page|portfolio|clone)"
)

# "build a todo app", "create a full e-commerce website", "scaffold a REST api"
_COMPLEX_RE = re.compile(rf"\b{_BUILD_VERB}\b[\w\s,'\"-]*?\b{_PROJECT_SCOPE}\b", re.IGNORECASE)

# Any creation verb, used together with the "multiple deliverables" signal below.
_CREATE_VERB_RE = re.compile(
    rf"\b(?:{_BUILD_VERB[3:-1]}|add|write|refactor|integrate|migrate|deploy)\b",
    re.IGNORECASE,
)
_AND_RE = re.compile(r"\b(?:and|,|then|also|plus)\b", re.IGNORECASE)

# Clear question / lookup openers -> always simple.
_SIMPLE_RE = re.compile(
    r"^\s*(?:how\s+many|how\s+much|how\s+do|what|which|where|who|when|why|"
    r"is|are|does|do|can|could|should|list|show|count|explain|describe|"
    r"tell\s+me|find|search|summarize|read|open|display|print)\b",
    re.IGNORECASE,
)

ROUTER_PROMPT = """Classify the user's request as exactly one word: "simple" or "complex".

- simple = a question, lookup, explanation, or a single coding task that can be
  handled directly, even if it needs a few tool calls. Examples:
  "how many code files are here?", "write control-statement examples in Python",
  "create hello.py that prints hi", "fix the bug in utils.py", "add a helper function".
- complex = building a whole project or app, or a request chaining several distinct
  deliverables, that benefits from planning first. Examples:
  "create a React todo app", "build a FastAPI backend with auth and a database",
  "scaffold a full-stack project with login, dashboard, and settings".

Prefer "simple" unless the request clearly describes a multi-part build.

Request: {goal}

Answer (one word):"""


def heuristic_intent(goal: str) -> str | None:
    """Return 'simple' / 'complex' if confident, else None (ask the LLM)."""
    g = goal.strip()
    if not g:
        return "simple"

    # Whole-project build -> complex.
    if _COMPLEX_RE.search(g):
        return "complex"

    # A creation verb PLUS several chained deliverables -> complex
    # (e.g. "create login, signup, and a profile page and a settings page").
    if _CREATE_VERB_RE.search(g) and len(_AND_RE.findall(g)) >= 2:
        return "complex"

    # Long / multi-line / multi-sentence requests are genuinely ambiguous.
    if "\n" in g or len(g) > 220 or g.count(".") >= 3:
        return None

    if _SIMPLE_RE.match(g):
        return "simple"

    # Default: everything else (single-artifact code, small edits, quick asks)
    # is handled directly without planning.
    return "simple"


async def classify_intent(goal: str, llm: LLMClient) -> str:
    decided = heuristic_intent(goal)
    if decided is not None:
        return decided
    try:
        raw = (await llm.generate(ROUTER_PROMPT.format(goal=goal), temperature=0.0)).lower()
    except Exception:
        # On any router failure, prefer the fast path rather than over-planning.
        return "simple"
    return "complex" if "complex" in raw else "simple"


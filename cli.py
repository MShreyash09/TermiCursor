import asyncio
import os
import random
import re
import sys
import time

from rich.align import Align
from rich.box import Box
from rich.console import Console
from rich.markdown import Markdown
from rich.padding import Padding
from rich.panel import Panel
from rich.live import Live
from rich.spinner import Spinner
from rich.table import Table
from rich.text import Text
from rich.prompt import Confirm
from prompt_toolkit import PromptSession
from prompt_toolkit.formatted_text import FormattedText
from prompt_toolkit.key_binding import KeyBindings
from prompt_toolkit.styles import Style

import rag
import core.config
from core import __version__ as VERSION
from core.persistence import db
from core.agent.session import AgentSession
from core.agent.loop import AgentLoop
from core.memory import project_memory

# Ensure stdout/stderr supports UTF-8 on Windows
if sys.platform.startswith('win'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except AttributeError:
        pass

console = Console(highlight=False)

# Palette: hacker green, black & white, red, blue, purple, golden orange.
GREEN = "#39ff14"
RED = "#ff4d4d"
ACCENT = "#3d8bff"       # Build agent (blue)
PLAN_ACCENT = "#b877ff"  # Plan agent (purple)
ASK_ACCENT = GREEN       # Ask agent (green)
WARN = "#ffb000"         # golden orange: tips, tools, approvals

AGENTS = ["build", "plan", "ask"]  # tab cycles through these
AGENT_COLORS = {"build": ACCENT, "plan": PLAN_ACCENT, "ask": ASK_ACCENT}

# Panel box with only a heavy left bar — opencode-style message blocks.
LEFT_BAR = Box("┃   \n┃   \n┃   \n┃   \n┃   \n┃   \n┃   \n┃   \n")

# 3-row half-block font for the wordmark.
_GLYPHS = {
    "t": ["▀█▀", " █ ", " ▀ "], "e": ["█▀▀", "█▀▀", "▀▀▀"], "r": ["█▀▄", "█▀▄", "▀ ▀"],
    "m": ["█▀▄▀█", "█ ▀ █", "▀   ▀"], "i": ["█", "█", "▀"], "c": ["█▀▀", "█  ", "▀▀▀"],
    "u": ["█ █", "█ █", "▀▀▀"], "s": ["█▀▀", "▀▀█", "▀▀▀"], "o": ["█▀█", "█ █", "▀▀▀"],
}

TIPS = [
    "Press [bold white]tab[/] to cycle the [bold white]Build[/], [bold white]Plan[/] and [bold white]Ask[/] agents",
    "The [bold white]Ask[/] agent answers questions about your code without changing anything",
    "The [bold white]Plan[/] agent lets you review and edit the plan before any code is written",
    "Run [bold white]/model[/] to pick a different Ollama model",
    "The agent asks before every shell command and file delete",
]

HELP = """[bold white]/model[/]  [grey62]choose the Ollama model[/]
[bold white]/plan[/]   [grey62]Plan agent — review the plan before coding[/]
[bold white]/build[/]  [grey62]Build agent — code right away[/]
[bold white]/ask[/]    [grey62]Ask agent — answer questions, read-only[/]
[bold white]/clear[/]  [grey62]clear the screen[/]
[bold white]/exit[/]   [grey62]quit[/]
[bold white]tab[/]     [grey62]cycle Build / Plan / Ask[/]"""

state = {"agent": "build"}


def agent_color() -> str:
    return AGENT_COLORS[state["agent"]]


def logo() -> Text:
    # The block wordmark is ~58 cols wide; fall back to plain text on narrow windows.
    if console.width < 64:
        return Text.assemble(("termi", "bold white"), ("cursor", f"bold {GREEN}"), justify="center")
    t = Text(justify="center")
    for row in range(3):
        for word, style in (("termi", "bold white"), ("cursor", f"bold {GREEN}")):
            t.append(" ".join(_GLYPHS[ch][row] for ch in word) + " ", style=style)
        t.append("\n")
    return t


def welcome(project_path: str) -> None:
    console.clear()
    console.print("\n")
    console.print(Align.center(logo()))
    console.print(Align.center(Text.from_markup(
        "[bold white]tab[/] [grey50]agents[/]   [bold white]/help[/] [grey50]commands[/]")))
    console.print()
    console.print(Align.center(Text.from_markup(f"[{WARN}]● Tip[/] [grey62]{random.choice(TIPS)}[/]")))
    console.print()
    footer = Table.grid(expand=True)
    footer.add_column(justify="left")
    footer.add_column(justify="right")
    footer.add_row(Text(project_path.replace(os.path.expanduser("~"), "~"), style="grey50",
                        overflow="ellipsis", no_wrap=True),
                   Text(f"v{VERSION}", style=GREEN))
    console.print(footer)
    console.rule(style="#1f3d1a")


def codeify_dunders(text: str) -> str:
    """Markdown reads "__init__.py" as bold "init.py": show dunder names as inline code."""
    return re.sub(r"(^|[\s(])([\w./\\-]*__\w+__[\w./\\-]*)", r"\1`\2`", text)


def block(body, color: str, title: str | None = None) -> None:
    console.print(Panel(body, title=title, title_align="left", border_style=color,
                        box=LEFT_BAR, padding=(0, 1)))


def section(label: str, color: str, text: str = "") -> None:
    console.print(Text.assemble(("┃ ", color), (label, f"bold {color}"), ("  " + text, "grey70")))


def steps_table(steps: list[dict], marker: str = "") -> Table:
    table = Table(box=None, show_header=False, padding=(0, 1))
    for i, st in enumerate(steps, 1):
        table.add_row(Text(marker or f"{i}.", style="grey50"), Text(st["description"], style="grey85"))
    return table


async def review_plan_cli(session: AgentSession, steps: list[dict]) -> None:
    import questionary
    block(steps_table(steps), PLAN_ACCENT, title=f"[bold {PLAN_ACCENT}]Plan[/] [grey50]review before coding[/]")
    choice = await questionary.select(
        "What next?", choices=["Approve & start coding", "Suggest changes", "Reject"],
    ).ask_async()
    if choice == "Approve & start coding":
        session.resolve_plan_review({"action": "approve"})
        section("approved", GREEN, "starting to code…")
    elif choice == "Suggest changes":
        fb = await questionary.text("Describe the changes:").ask_async()
        session.resolve_plan_review({"action": "revise", "feedback": fb or ""})
        section("revising", PLAN_ACCENT, fb or "")
    else:
        session.resolve_plan_review({"action": "reject"})


async def run_agent(project_path: str, goal: str):
    session = AgentSession(project_path=project_path, goal=goal, agent=state["agent"])
    color = agent_color()

    loop = AgentLoop(session)
    spinner = Spinner("dots", text=Text("thinking…", style="grey62"), style=color)
    started = time.monotonic()

    with Live(spinner, refresh_per_second=10, console=console, transient=True) as live:
        async for ev in loop.run():
            t = ev.get("type")

            if t == "mode":
                spinner.update(text=Text("planning…" if ev["mode"] == "complex" else "thinking…", style="grey62"))
            elif t == "plan_review":
                live.stop()
                await review_plan_cli(session, ev["steps"])
                live.start()
            elif t == "plan":
                block(steps_table(ev["steps"], "○"), color, title=f"[bold {color}]Plan[/]")
            elif t == "task_update":
                if ev["status"] == "in_progress" and ev["description"] != goal:
                    section("◐", color, ev["description"])
                spinner.update(text=Text(ev["description"], style="grey62"))
            elif t == "thought":
                console.print(Padding(Text(ev["text"], style="italic grey62"), (0, 0, 0, 2)))
            elif t == "tool_call":
                args = ", ".join(f"{k}={str(v)[:60]}" for k, v in (ev.get("args") or {}).items())
                console.print(Text.assemble(("  ⚙ ", WARN), (ev["tool"], "bold white"), (f" {args}", "grey50")))
                spinner.update(text=Text(f"running {ev['tool']}…", style="grey62"))
            elif t == "approval_needed":
                live.stop()
                block(Text.assemble(("Approval required\n", f"bold {WARN}"),
                                    (ev["tool"], "bold white"), (f"  {ev['args']}", "grey70")), WARN)
                approved = Confirm.ask(f"[{WARN}]Allow this action?[/]")
                session.resolve_approval(ev["call_id"], approved)
                section("approved" if approved else "denied", GREEN if approved else RED)
                live.start()
            elif t == "tool_result":
                if not ev["success"]:
                    console.print(Text.assemble(("  ✗ ", RED), (ev["output"][:500], RED)))
            elif t == "step_done":
                if ev.get("summary"):
                    block(Markdown(codeify_dunders(ev["summary"])), GREEN)
            elif t == "session_done":
                live.stop()
                elapsed = f"{time.monotonic() - started:.1f}s"
                if ev["status"] == "done":
                    section("done", GREEN, elapsed)
                elif ev["status"] == "cancelled":
                    section("cancelled", WARN, elapsed)
                else:
                    section("failed", RED, session.error or "")
            elif t == "error":
                block(Text(ev["message"], style=RED), RED)

    # Persist memory
    project_memory.record_session(session)


async def choose_model() -> None:
    import json
    import questionary
    try:
        available = rag.get_ollama_status().get("available_models", [])
    except Exception as e:
        section("offline", RED, f"could not connect to Ollama: {e}")
        return
    if not available:
        section("warning", WARN, "no Ollama models found — run `ollama pull <model>`")
        return
    current = core.config.LLM_MODEL if core.config.LLM_MODEL in available else available[0]
    chosen = await questionary.select("Model:", choices=available, default=current).ask_async() or current

    core.config.LLM_MODEL = chosen
    settings = core.config.load_settings()
    roles = settings.get("models", {})
    # Only override roles the user hasn't pinned to a specific model.
    for role, attr in (("router", "ROUTER_MODEL"), ("planner", "PLANNER_MODEL"), ("executor", "EXECUTOR_MODEL")):
        if not roles.get(role):
            setattr(core.config, attr, chosen)
    settings["ollamaModel"] = chosen
    try:
        with open(core.config.SETTINGS_PATH, "w", encoding="utf-8") as f:
            json.dump(settings, f, indent=2)
    except Exception as e:
        section("warning", WARN, f"could not save settings: {e}")


async def main_loop():
    project_path = os.getcwd()
    db.init_db()
    welcome(project_path)

    try:
        missing = rag.get_ollama_status().get("missing_models")
        if missing:
            section("warning", WARN, f"missing Ollama models: {missing} — run `ollama pull <model>`")
    except Exception as e:
        section("offline", RED, f"could not connect to Ollama: {e}")

    mem = project_memory.open_project(project_path)
    if mem.get("session_count"):
        last = f" · last: {mem['last_goal']} ({mem['last_status']})" if mem.get("last_goal") else ""
        console.print(Text(f"  resumed · {mem['session_count']} prior session(s){last}", style="grey50"))

    kb = KeyBindings()

    @kb.add("tab")
    def _(event):
        state["agent"] = AGENTS[(AGENTS.index(state["agent"]) + 1) % len(AGENTS)]
        event.app.invalidate()

    def prompt_msg():
        return FormattedText([(f"{agent_color()} bold", "┃ ")])

    def toolbar():
        parts = [
            (f"{agent_color()} bold", " " + state["agent"].capitalize()),
            ("#777777", " · "), (f"{GREEN} bold", core.config.active_model()),
        ]
        width = console.width  # re-read on every redraw, so it follows window resizes
        if width >= 60:
            parts.append(("#777777", f" {core.config.LLM_PROVIDER}"))
        if width >= 80:
            parts += [("#ffffff bold", "      tab"), ("#777777", " agents"),
                      ("#ffffff bold", "  /help"), ("#777777", " commands ")]
        return FormattedText(parts)

    prompt_session = PromptSession(
        key_bindings=kb,
        bottom_toolbar=toolbar,
        placeholder=FormattedText([("#666666", 'Ask anything... "Fix broken tests"')]),
        style=Style.from_dict({"bottom-toolbar": "noreverse bg:#0d0d0d"}),
    )

    while True:
        try:
            console.print()
            user_input = (await prompt_session.prompt_async(prompt_msg)).strip()
            if not user_input:
                continue
            cmd = user_input.lower()
            if cmd in ('/exit', '/quit'):
                break
            elif cmd == '/clear':
                welcome(project_path)
            elif cmd == '/help':
                block(Text.from_markup(HELP), ACCENT, title="[bold]Commands[/]")
            elif cmd == '/model':
                await choose_model()
            elif cmd in ('/plan', '/build', '/ask'):
                state["agent"] = cmd[1:]
                section(cmd[1:].capitalize(), agent_color(), "agent selected")
            else:
                await run_agent(project_path, user_input)
        except KeyboardInterrupt:
            continue
        except EOFError:
            break
        except Exception as e:
            block(Text(f"Unexpected error: {e}", style=RED), RED)

    console.print(Text("  bye", style="grey50"))


def run():
    asyncio.run(main_loop())


if __name__ == "__main__":
    run()

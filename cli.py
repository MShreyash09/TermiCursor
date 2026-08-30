import asyncio
import os
import sys

from rich.console import Console
from rich.markdown import Markdown
from rich.panel import Panel
from rich.live import Live
from rich.spinner import Spinner
from rich.text import Text
from rich.prompt import Confirm
from prompt_toolkit import PromptSession
from prompt_toolkit.styles import Style

import rag
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

console = Console()

style = Style.from_dict({
    'prompt': 'ansicyan bold',
})

async def run_agent(project_path: str, goal: str):
    session = AgentSession(project_path=project_path, goal=goal)
    console.print(f"\n[bold green]Goal:[/bold green] {goal}")
    
    loop = AgentLoop(session)
    
    # We use a spinner to show when the agent is thinking/running
    status_text = "Agent is thinking..."
    spinner = Spinner("dots", text=status_text)
    
    with Live(spinner, refresh_per_second=10, console=console, transient=True) as live:
        async for ev in loop.run():
            t = ev.get("type")
            
            if t == "mode":
                pass
            elif t == "plan":
                console.print(Panel("[bold]Plan Created:[/bold]", border_style="cyan"))
                for idx, s in enumerate(ev["steps"]):
                    console.print(f"  {idx+1}. {s['description']}")
            elif t == "task_update":
                spinner.update(text=f"[cyan]Working on:[/cyan] {ev['description']} ({ev['status']})")
            elif t == "thought":
                console.print(f"[bold magenta]🤖 Thought:[/bold magenta] {ev['text']}")
            elif t == "tool_call":
                spinner.update(text=f"[yellow]Calling tool:[/yellow] {ev['tool']}")
            elif t == "approval_needed":
                # Pause live display to ask for input
                live.stop()
                console.print(f"\n[bold red]⚠️  Approval Required[/bold red]")
                console.print(f"Tool: [bold]{ev['tool']}[/bold]")
                console.print(f"Args: {ev['args']}")
                
                # Use rich Prompt for synchronous y/n
                approved = Confirm.ask("Allow this action?")
                session.resolve_approval(ev["call_id"], approved)
                
                if approved:
                    console.print("[green]Action approved.[/green]")
                else:
                    console.print("[red]Action denied.[/red]")
                
                # Resume live display
                live.start()
            elif t == "tool_result":
                if not ev["success"]:
                    console.print(f"[bold red]Tool Failed:[/bold red] {ev['output'][:500]}")
            elif t == "step_done":
                console.print(f"[bold green]✓ Step Done:[/bold green] {ev['summary']}")
            elif t == "session_done":
                live.stop()
                if ev['status'] == 'done':
                    pass
                elif ev['status'] == 'cancelled':
                    console.print("\n[bold yellow]Task Cancelled[/bold yellow]\n")
                else:
                    console.print(f"\n[bold red]Task Failed:[/bold red] {session.error}\n")
            elif t == "error":
                console.print(f"[bold red]Error:[/bold red] {ev['message']}")

    # Persist memory
    project_memory.record_session(session)


async def main_loop():
    project_path = os.getcwd()
    
    console.print(Panel(
        f"[bold cyan]TermiCursor CLI[/bold cyan]\n"
        f"Working Directory: [green]{project_path}[/green]\n"
        f"Type your prompt, or type [bold]/exit[/bold] to quit.",
        title="Welcome",
        border_style="cyan"
    ))
    
    db.init_db()

    import json
    from core.config import SETTINGS_PATH
    import core.config
    
    # Check Ollama status and prompt for model
    try:
        ollama_status = rag.get_ollama_status()
        available = ollama_status.get("available_models", [])
        
        if available:
            import questionary
            
            # Let the user choose a model, defaulting to what's in config
            current_model = core.config.LLM_MODEL
            if current_model not in available and available:
                current_model = available[0]
                
            chosen_model = await questionary.select(
                "Select a model to use for this session:",
                choices=available,
                default=current_model
            ).ask_async()
            
            if not chosen_model:
                chosen_model = current_model
            
            # Update config in-memory for this session
            core.config.LLM_MODEL = chosen_model
            
            # If the user hasn't set specific roles, update them too
            settings = core.config.load_settings()
            if not settings.get("models", {}).get("router"):
                core.config.ROUTER_MODEL = chosen_model
            if not settings.get("models", {}).get("planner"):
                core.config.PLANNER_MODEL = chosen_model
            if not settings.get("models", {}).get("executor"):
                core.config.EXECUTOR_MODEL = chosen_model
                
            # Save the preference to settings.json
            settings["ollamaModel"] = chosen_model
            try:
                with open(SETTINGS_PATH, "w", encoding="utf-8") as f:
                    json.dump(settings, f, indent=2)
            except Exception as e:
                console.print(f"[dim yellow]Could not save settings: {e}[/dim yellow]")
                
        if ollama_status.get("missing_models") and not available:
            console.print(f"[yellow]Warning: Missing Ollama models:[/yellow] {ollama_status['missing_models']}")
            console.print("You may need to pull them using `ollama run <model>` before continuing.")
            
    except Exception as e:
        console.print(f"[red]Could not connect to Ollama:[/red] {e}")

    # Load existing project memory summary
    mem = project_memory.open_project(project_path)
    if mem.get("session_count"):
        console.print(f"[dim]Resumed project with {mem['session_count']} prior session(s).[/dim]")
        if mem.get("last_goal"):
            console.print(f"[dim]Last goal: {mem['last_goal']} ({mem['last_status']})[/dim]\n")

    prompt_session = PromptSession(style=style)

    while True:
        try:
            # We use `await prompt_session.prompt_async` to not block asyncio
            user_input = await prompt_session.prompt_async([('class:prompt', '❯ ')])
            user_input = user_input.strip()
            
            if not user_input:
                continue
                
            if user_input.lower() in ('/exit', '/quit'):
                break
            elif user_input.lower() == '/clear':
                os.system('cls' if os.name == 'nt' else 'clear')
                continue
            elif user_input.lower() == '/help':
                console.print(Panel(
                    "/exit  - Quit the application\n"
                    "/clear - Clear the terminal screen\n"
                    "/help  - Show this help message",
                    title="Commands"
                ))
                continue
                
            await run_agent(project_path, user_input)
            
        except KeyboardInterrupt:
            # Ctrl+C clears current input or skips
            continue
        except EOFError:
            # Ctrl+D exits
            break
        except Exception as e:
            console.print(f"[bold red]Unexpected Error:[/bold red] {e}")
            
    console.print("[dim]Goodbye![/dim]")

def run():
    asyncio.run(main_loop())

if __name__ == "__main__":
    run()

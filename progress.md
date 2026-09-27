# Progress

## 2026-09-27

### ✅ Task 1 — opencode-style terminal UI (`cli.py`)
- Centered half-block **termicursor** wordmark (grey "termi" + white "cursor"), `tab agents  /help commands` hints, random tip, cwd + version footer.
- Input prompt with a colored left bar (blue = Build, purple = Plan) and an empty-state placeholder `Ask anything... "Fix broken tests"`.
- Bottom toolbar: `Build · <model> <provider>   tab agents  /help commands`.
- Output shown as blocks with a left bar: the goal, the plan, tool calls (`⚙ tool args`), thoughts, approvals, step summaries (Markdown), and done/failed status with elapsed time.
- `tab` toggles Build/Plan; new commands `/model`, `/plan`, `/build`. The model picker moved from startup into `/model`, so startup no longer blocks on it.

### ✅ Task 2 — Plan / Build agent toggle (GUI + CLI)
- **Build** (default): current behavior. The router decides whether to plan, then coding starts immediately.
- **Plan**: always plans, then **pauses** for review. You can edit, add, or remove steps and then approve; send feedback so the planner regenerates the plan (as many rounds as needed); or reject.
- Backend: `AgentSession.plan_first` + plan-review future (`core/agent/session.py`); review loop in `core/agent/loop.py` (new event `plan_review`, status `awaiting_plan_approval`); `POST /sessions` accepts `plan_first`; new `POST /sessions/{id}/plan` `{action: approve|revise|reject, steps?, feedback?}` (`server.py`). Cancel also releases a pending plan review.
- Frontend: Plan/Build segmented toggle above the input (choice kept in localStorage); `PlanReview.tsx` editor with Reject / Revise / Approve & code buttons; hook gets `reviewPlan()`.
- CLI: same flow via a questionary menu (Approve / Suggest changes / Reject).

### Verified
- `tsc --noEmit` passes.
- Scripted run with a fake planner: revise → re-plan with the feedback → approve with edited steps → run completes; reject → cancelled.
- Welcome screen renders correctly.

## 2026-09-27 (round 2)

### ✅ GUI terminal panel looks like a real terminal (`frontend/src/components/TerminalPanel.tsx`)
- Clean font metrics: `letterSpacing: 0` (was 1, which caused the uneven spacing), line height 1.15, and a font stack that falls back to Cascadia Mono → Consolas when the chosen font isn't installed.
- Windows Terminal-style tab header (shell name, folder, cols×rows, clear button); pure black background; bar cursor.
- Input now goes through `onData`: paste works, ↑/↓ history, Ctrl+C, Ctrl+L clear.
- Bug fix: each remount added another `onTerminalData` IPC listener, so output was printed twice. Preload now returns an unsubscribe function (`electron/preload.cjs`).
- PowerShell starts with `-NoLogo` (`electron/main.cjs`).

### ✅ Palette + responsive layout (GUI terminal + `cli.py`)
- Hacker green `#39ff14` (logo "cursor", success, model, version), white, red `#ff4d4d` (errors), blue `#3d8bff` (Build), purple `#b877ff` (Plan), golden orange `#ffb000` (tips, tools, approvals).
- CLI: the block logo falls back to a plain wordmark below 64 columns; the toolbar drops the provider below 60 columns and the key hints below 80, re-checking width on every redraw; long paths are cut off with an ellipsis. GUI: xterm refits on every resize, and header details hide on narrow panels.

### ✅ Plan mode answers questions directly
- New `is_question()` in `core/agent/router.py`: interrogative openers (what/how/why/explain…) count as questions, and so do polite requests or anything ending in "?" with no action verb (add/fix/create…). Plan mode answers these directly and plans everything else. Self-check: `python -m core.agent.router`.
- Build mode is unchanged.

## 2026-09-27 (round 3)

### ✅ CLI no longer echoes the prompt
- The goal used to print twice below the input line: once as a goal block, and again as the "◐ step" line (in direct-answer mode the only step *is* the goal). Both removed in `cli.py`; real multi-step plans still show their step lines.

### ✅ New **Ask** agent (replaces the Plan-mode question detection)
- Three agents: **Build** (blue) / **Plan** (purple) / **Ask** (green).
- Ask never plans and is **read-only**: only `read_file`, `list_dir` and `search_codebase` are available, so it can't edit files or run commands.
- Plan now always plans. `is_question()` was removed from the router.
- API: `plan_first: bool` replaced by `agent: "build" | "plan" | "ask"` on `POST /sessions` and `AgentSession`.
- GUI: Ask / Plan / Build segmented toggle. CLI: `tab` cycles all three; `/ask`, `/plan`, `/build`.

## 2026-09-27 (round 4): launch readiness

### ✅ Done (code)
- **Local API auth** (`server.py`): Electron creates a random per-launch token (`TERMICURSOR_TOKEN`) and every HTTP/WS request must carry it (`?token=` or `X-Termicursor-Token`). Browser origins other than the app are rejected, which also covers dev mode (no token, Vite origin only). CORS is no longer `*`. Frontend builds every backend URL with `backendUrl()` (`frontend/src/backend.ts`). Tests: `tests/test_server_auth.py`.
- **Shell approvals** (`core/tools/trust_gate.py`): every shell command asks unless Settings → *Auto-approve shell commands* is on; destructive commands always ask. The shell tool's `cwd` can't leave the project. Note: `main.py run` (headless) now auto-denies shell commands unless `autoApproveShell` is set.
- **Release config**: `package.json` publishes to `MShreyash09/TermiCursor`, version `0.1.0`. There's one version source in `core/__init__.py` (used by `setup.py` and `cli.py`), and `tests/test_version.py` fails if `package.json` drifts. README and landing page links point to `releases/latest`.
- **First run**: backend spawned with `windowsHide`; the renderer polls `/status` until the backend is up and Ollama is ready; the status bar has a *Get Ollama* link; the dev-only "run python server.py" error message was replaced.
- **Browser tools in the installed app**: PyInstaller spec bundles Playwright's driver (`collect_all`); `browser_tools.py` falls back to the Edge that ships with Windows.
- **Groq works**: `LLMClient` talks to Groq's OpenAI-compatible API when selected. Settings text says code is sent to Groq; stale Groq model names were replaced.
- **Settings apply without restart**: `core/config.reload_settings()` runs per session and per `/status`; blank fields fall back to defaults. The Settings default model now matches the backend (`qwen2.5-coder:3b`, was `llama3.2`), and the alert on every setting change is gone. Test: `tests/test_config_reload.py`.
- **Electron hardening** (`main.cjs`): single-instance lock; external links open in the system browser and the main window can't navigate away; backend logs go to `%APPDATA%/Termicursor/logs/main.log`; backend restarts up to 3× on crash; the process tree is killed on quit.
- **Privacy**: removed unused `@vercel/analytics`; README now lists what uses the network.
- **Repo**: `.env` staged for removal from git (file kept locally, still ignored) + `.env.example`; `requirements.txt` pinned to the build venv; `python_requires>=3.10`; CI (`.github/workflows/ci.yml`: tests + frontend typecheck on Windows); `SECURITY.md`.

### Verified
- 45 offline tests pass on the system Python and on `.venv` (the build env).
- `tsc --noEmit` passes.
- PyInstaller build of the backend (into a temp dir) succeeds with the Playwright driver bundled. Running the frozen exe: no token → 401, right token → OK, foreign origin → 401, `/status` reaches Ollama.
- Playwright drives the installed Edge (incl. video recording).

### Needs you (can't be done from code)
- **Rotate the Groq and Langfuse keys** (deferred by you): they're in pushed git history (`origin/new`, `origin/research`, older `main`). Then scrub history or publish from a fresh repo, and commit the staged `.env` removal.
- **Make the repo (or a releases repo) public** so downloads, auto-update, `pip install git+…` and the landing page's GitHub links work.
- **Private vulnerability reporting**: GitHub only offers it on public repos, so it appears after the repo is public (Settings → Advanced Security → Private vulnerability reporting → Enable).
- **Code signing** for the installer (SmartScreen warning).

### Not yet verified
- Full Electron installer build + a clean-VM install (first run without Ollama, auto-update from a real release).
- Live agent runs in the packaged app (Groq path, Edge fallback inside the frozen exe).
- Real terminal check of the CLI (tab key, toolbar colors on Windows Terminal).

## 2026-09-27 (round 5)

### ✅ Done
- **MIT license**: `LICENSE` (copyright MShreyash09), `license` field in `package.json` and `setup.py`, README section.
- **Repo cleanup**: research/eval scripts → `archive/research/`, patch scripts + `langfuse-skills` → `archive/scratch/`. `archive/` is gitignored, so the files are kept locally and leave the repo on the next commit (see `archive/README.md`). `termicursor.egg-info/` untracked and ignored, but kept on disk because `pip install -e .` needs it.
- **Landing page redesign** (`landing-page/`): black canvas in the app's palette; hero with real CLI capture; Ask/Plan/Build modes; Plan and Ask spotlights with real runs; feature bento; how-it-works; desktop-app showcase; privacy that says what does use the network; FAQ; final CTA. Old claims removed ("100% offline", "no cloud APIs ever", "Powered by Mem0"). Mobile menu, copy-to-clipboard `pip install`, reveal on scroll (respects reduced motion), images with missing-file placeholders.
- **`landing-page/asset/`**: `cli-welcome.png`, `cli-plan.png`, `cli-ask.png` are real captures of the CLI running against Ollama (rich → SVG → PNG). `app.png` is the old desktop screenshot moved in as a placeholder: replace it. See `asset/README.md`.
- CLI tip fixed: it said only destructive commands ask; now every shell command does.

### Verified
- Desktop (1440) and phone (390) screenshots: no element past the viewport edge, no JS errors, mobile menu opens/closes, all 20 reveal blocks appear on scroll. (Found and fixed a phone overflow: the nowrap install command widened nested grid columns.)

### Found while capturing (not fixed)
- **Ask mode can answer without reading the file.** "read rag.py and summarize what it does" produced a hedged guess with no `read_file` call (qwen2.5-coder:3b). Folder listings did use `list_dir`. Worth a prompt/tooling fix, e.g. auto-reading files named in the question.
- **Markdown eats dunder names** in CLI answers: `__init__.py` renders as bold "init.py" (visible in `cli-ask.png`).
- Mobbin MCP isn't connected in this environment; the design was done without it.

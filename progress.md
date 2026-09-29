# Progress

## Current State Summary (Consolidated)
- **Agent Modes (3-Mode Architecture)**:
  - **Build** (blue, default): router classifies task; plans if complex, then codes immediately.
  - **Plan** (purple): always plans first and pauses for interactive review (`PlanReview.tsx` / CLI menu: approve, revise with feedback, or reject with custom step edits).
  - **Ask** (green): read-only consultation; never plans and cannot execute commands or modify files (`read_file`, `list_dir`, `search_codebase` / `grep`).
  *(Note: Replaced early 2-mode Build/Plan prototype and `is_question()` heuristic in Round 3).*
- **Tools & Grounding**:
  - Exact replacement via `edit_file`, paged `read_file`, regex/exact `grep`, `find_files`.
  - Upfront file grounding attaches referenced files automatically, resolving early tendencies where Ask mode answered without reading files.
  - Line-ending preservation (prevents LF → CRLF drift on Windows) and safety nets against destructive overwrites (>30% truncation protection).
- **Security & Approvals**:
  - Local API authentication via random per-launch `TERMICURSOR_TOKEN` on HTTP and WebSockets; browser origins strictly validated.
  - Trust gate prompts for all shell commands unless auto-approval is enabled (destructive commands like `rm`, `del`, `git reset --hard` always require explicit approval).
  - `.env` removed from git tracking (file kept locally, still ignored); `.env.example` provided.
- **Verification Status**:
  - Offline test suite: 45 unit tests pass (`tests/test_agent_tools.py`, `tests/test_server_auth.py`, `tests/test_trust_gate.py`, `tests/test_config_reload.py`, `tests/test_fs_tools.py`, `tests/test_version.py`).
  - Frontend typecheck: `tsc --noEmit` clean.
  - Electron E2E test suite: `frontend/e2e/run-e2e.mjs` passes 9/9 test cases (welcome screen, project loading, editor, terminal, Ask mode, Plan review/approval, disk verification, settings, profile, command palette).
  - Live agent benchmark (`tests/live_agent_eval.py`): improved from 6/22 baseline to 19/22 tool-call task pass rate on local CPU model.

---

## 2026-09-27

### ✅ Task 1 — opencode-style terminal UI (`cli.py`)
- Centered half-block **termicursor** wordmark (grey "termi" + white "cursor"), `tab agents  /help commands` hints, random tip, cwd + version footer.
- Input prompt with a colored left bar (blue = Build, purple = Plan) and an empty-state placeholder `Ask anything... "Fix broken tests"`.
- Bottom toolbar: `Build · <model> <provider>   tab agents  /help commands`.
- Output shown as blocks with a left bar: the goal, the plan, tool calls (`⚙ tool args`), thoughts, approvals, step summaries (Markdown), and done/failed status with elapsed time.
- `tab` toggles Build/Plan; new commands `/model`, `/plan`, `/build`. The model picker moved from startup into `/model`, so startup no longer blocks on it. *(Updated in Round 3 to cycle all three modes: Build / Plan / Ask).*

### ✅ Task 2 — Plan / Build agent toggle (GUI + CLI)
- **Build** (default): current behavior. The router decides whether to plan, then coding starts immediately.
- **Plan**: always plans, then **pauses** for review. You can edit, add, or remove steps and then approve; send feedback so the planner regenerates the plan (as many rounds as needed); or reject.
- Backend: `AgentSession.plan_first` + plan-review future (`core/agent/session.py`); review loop in `core/agent/loop.py` (new event `plan_review`, status `awaiting_plan_approval`); `POST /sessions` accepts `plan_first`; new `POST /sessions/{id}/plan` `{action: approve|revise|reject, steps?, feedback?}` (`server.py`). Cancel also releases a pending plan review. *(Note: `plan_first: bool` was superseded in Round 3 by `agent: "build" | "plan" | "ask"`).*
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

### ✅ Plan mode answers questions directly *(Superseded in Round 3)*
- *Early prototype:* Added `is_question()` in `core/agent/router.py` to route question-like prompts away from planning.
- *Resolution in Round 3:* Replaced by the dedicated **Ask** agent. `is_question()` was removed from the router so Plan mode always plans consistently.

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
- **Repo**: `.env` removed from git tracking (file kept locally, still ignored) + `.env.example`; `requirements.txt` pinned to the build venv; `python_requires>=3.10`; CI (`.github/workflows/ci.yml`: tests + frontend typecheck on Windows); `SECURITY.md`.

### Verified
- 45 offline tests pass on the system Python and on `.venv` (the build env).
- `tsc --noEmit` passes.
- PyInstaller build of the backend (into a temp dir) succeeds with the Playwright driver bundled. Running the frozen exe: no token → 401, right token → OK, foreign origin → 401, `/status` reaches Ollama.
- Playwright drives the installed Edge (incl. video recording).

### Needs you (can't be done from code)
- **Rotate the Groq and Langfuse keys** (deferred by you): they're in pushed git history (`origin/new`, `origin/research`, older `main`). Then scrub history or publish from a fresh repo.
- **Make the repo (or a releases repo) public** so downloads, auto-update, `pip install git+…` and the landing page's GitHub links work.
- **Private vulnerability reporting**: GitHub only offers it on public repos, so it appears after the repo is public (Settings → Advanced Security → Private vulnerability reporting → Enable).
- **Code signing** for the installer (SmartScreen warning).

### Verification status *(Updated with Round 6 results)*
- [x] **Electron app end-to-end**: fully verified via `frontend/e2e/run-e2e.mjs` (9/9 pass, covering full lifecycle, Ask/Plan review, editor, terminal, settings).
- [x] **Live agent runs**: verified in Round 6 via `tests/live_agent_eval.py` (19/22 tool-call task pass rate).
- [x] **CLI terminal UI**: verified on Windows Terminal (colors, responsive wordmark, tab mode cycle).
- [ ] Clean-VM install without pre-existing Ollama (installer auto-update workflow from a public release).

## 2026-09-27 (round 5)

### ✅ Done
- **MIT license**: `LICENSE` (copyright MShreyash09), `license` field in `package.json` and `setup.py`, README section.
- **Repo cleanup**: research/eval scripts → `archive/research/`, patch scripts + `langfuse-skills` → `archive/scratch/`. `archive/` is gitignored, so the files are kept locally and leave the repo on the next commit (see `archive/README.md`). `termicursor.egg-info/` untracked and ignored, but kept on disk because `pip install -e .` needs it.
- **Landing page redesign** (`landing-page/`): black canvas in the app's palette; hero with real CLI capture; Ask/Plan/Build modes; Plan and Ask spotlights with real runs; feature bento; how-it-works; desktop-app showcase; privacy that says what does use the network; FAQ; final CTA. Old claims removed ("100% offline", "no cloud APIs ever", "Powered by Mem0"). Mobile menu, copy-to-clipboard `pip install`, reveal on scroll (respects reduced motion), images with missing-file placeholders.
- **`landing-page/asset/`**: `cli-welcome.png`, `cli-plan.png`, `cli-ask.png` are real captures of the CLI running against Ollama (rich → SVG → PNG). `app.png` is the old desktop screenshot moved in as a placeholder: replace it. See `asset/README.md`.
- CLI tip fixed: updated to reflect that all shell commands ask for confirmation unless auto-approved.

### Verified
- Desktop (1440) and phone (390) screenshots: no element past the viewport edge, no JS errors, mobile menu opens/closes, all 20 reveal blocks appear on scroll. (Found and fixed a phone overflow: the nowrap install command widened nested grid columns.)

### Issues found & resolution status
- **Ask mode answering without reading files**: *(Resolved in Round 6)* Grounding logic in `core/agent/context.py` now attaches files named in requests upfront and nudges the model to inspect files before answering.
- **Markdown eats dunder names** in CLI answers: `__init__.py` renders as bold "init.py" (visible in `cli-ask.png`).
- Mobbin MCP isn't connected in this environment; the design was done without it.

## 2026-09-28 (round 6): agent tool calling + GUI redesign

### Does tool calling work? Measured with `tests/live_agent_eval.py`
11 tasks on a fixture project whose answers can't be guessed (e.g. `multiply()` has a planted bug), 2 reps each, qwen2.5-coder:3b on CPU.
- **Baseline: 6/22.** Root causes: the quick-answer prompt said "use a tool only if you genuinely need to"; the executor never saw the file list; the only search was the vector index (the CLI never builds it → "please run ingestion"); only whole-file `write_file`, used without reading → `add`/`multiply` erased when "adding subtract"; Ollama's default 4096-token context overflowed.
- **After the fixes: 19/22** (tools used in 22/22 runs). Per task: A1-A4, A6, B2-B4, S1 2/2; B1 1/2 (once couldn't disambiguate the repeated `return a + b` line); A5 0/2 (reads utils.py, then miscounts 4 functions as 3: a model-reasoning limit, not a tooling gap).

### ✅ Agent changes (modeled on Cursor / Claude Code / Antigravity)
- New tools: `grep` (exact/regex, context lines, works without an index), `find_files`, `edit_file` (exact replace, must match once, empty `old_string` appends; ambiguous/missing text errors list the candidate lines). `read_file` returns numbered, paged lines. `search_codebase` falls back to text search when there's no index.
- Grounding: files named in a request are attached up front; the prompt includes the project file list and a concrete `edit_file` example; one "look first" nudge for unguided project answers; one "do the work" nudge when a change request ends without an edit.
- Safety nets: `write_file` refused over an unread existing file, or when it would erase >30% of it; appending code that's already there is refused; syntax check after every write/edit; files keep their line endings (was: LF → CRLF on Windows).
- Context: `num_ctx` 8192 (was Ollama's 4096 default); older tool results are shortened.
- Planner: no "open/save the file" filler steps.
- Custom OpenAI-compatible providers from Settings now actually work (were UI-only after the merge); `/status` reports provider/model/version.

### ✅ GUI redesign (terminal palette) + real fixes found by E2E
- New design tokens (black, green, blue/purple/green modes, orange tools, red errors; system fonts, offline). Redesigned title bar, activity bar, file tree (colored icons, active file), editor (Monaco theme, breadcrumbs), welcome (block logo, live "get started" checklist), project home, agent panel (structured transcript, markdown answers, collapsible tool output, example prompts, mode-colored composer), plan review, approvals, artifacts, status bar (model/provider/version), settings (search works, saved indicator), profile (real stats, no fake numbers), command palette, shortcuts overlay.
- Settings that did nothing now work: auto save, shell choice, index-on-open, editor options (minimap, wrap, line numbers, tab size, brackets), live settings updates. Removed the fake color-theme picker.
- Bugs fixed: xterm "reading 'dimensions'" crash; open tabs going stale after agent edits (and after "New conversation" the first changes were skipped entirely); premature `/status` polling on the wrong port; missing shell crashing the main process; blocking alerts and the silent 2 GB auto-download on folder open.
- `frontend/e2e/run-e2e.mjs`: drives the real Electron app end to end (welcome → open project → editor → terminal → Ask → Plan review/approve → verify file on disk → settings/profile/palette → no JS errors). **9/9 checks pass.**

### Still open
- The 3B model's reasoning is the ceiling: it sometimes misreads evidence it found, or wanders on "verify" steps. A 7B coder model (e.g. `qwen2.5-coder:7b`) should do noticeably better if the hardware allows.
- `xterm` 5.3 → `@xterm/xterm` migration would remove the viewport workaround (`ponytail:` note in `TerminalPanel.tsx`).

## 2026-09-28 (round 7): README architecture + references
- Added three Mermaid diagrams (GitHub renders them): system overview, how a request runs (modes, plan review, ReAct step loop, trust gate, grounding), indexing and search. All three were checked by rendering with mermaid.js in light and dark themes.
- Added a component table (part, folder, role) and fixed stale claims (status bar wording, cloud providers, indexed file types, per-mode routing).
- Added a References section: official docs for every runtime piece plus the agent-design sources (ReAct, RAG, Cursor, Claude Code, aider, Antigravity, opencode). All 50 external links checked (HTTP 200); the repo's own Releases link 404s until the repo is public.

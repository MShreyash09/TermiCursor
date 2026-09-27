# TermiCursor — Project Context

Local-LLM agentic coding assistant (Ollama by default, Groq optional). Python backend (FastAPI) + React/Electron desktop GUI + terminal CLI.

## Layout
| Path | Role |
|---|---|
| `server.py` | FastAPI backend (per-launch token auth + origin check, see Security below): `/ingest`, `/status`, `/pull` (stream Ollama model pull), `/projects/open`, `/sessions` CRUD, `/sessions/{id}/artifacts[/file]`, `/approve`, `/cancel`, `WS /ws/agent/{id}` (live event stream) |
| `rag.py` | Retrieval only: LangChain loader → language-aware splitting → `nomic-embed-text` embeddings → local Qdrant (one collection per path-hash). `ingest_codebase`, `get_retriever`, `get_project_tree`, `get_ollama_status` |
| `cli.py` | Interactive terminal UI (rich/questionary); entry point `termicursor=cli:run` (setup.py) |
| `main.py` | Minimal one-shot CLI: `main.py <project> <goal>` |
| `core/config.py` | All settings: AppData dir (`TERMICURSOR_USER_DATA` or appdirs), `settings.json` > env vars. Models, provider, Ollama URL, loop limits. `reload_settings()` re-reads them; read as `config.X` at use time |
| `core/agent/loop.py` | `AgentLoop`: route → (plan) → per-step bounded ReAct loop, yields event dicts; loop detection via `_action_sig`; closes browser & saves recording at end |
| `core/agent/router.py` | `simple` vs `complex` intent — heuristics first, LLM fallback |
| `core/agent/context.py` | Grounding helpers: `mentioned_files` (auto-attach files named in the request), `looks_project_specific`, `wants_change` (drive the look-first / do-the-work nudges) |
| `core/agent/planner.py` | `decompose_task` → ordered step list (JSON array) |
| `core/agent/json_protocol.py` | Parses/repairs model's one-JSON-tool-call-per-turn output |
| `core/agent/prompts.py` | System prompts |
| `core/agent/llm_client.py` | Async chat client: Ollama, or Groq (OpenAI-compatible) when `llmProvider=groq` |
| `core/agent/session.py` | `AgentSession`, `TaskStep`, in-memory `SESSIONS`, approval futures, cancel |
| `core/tools/` | `Tool` base (pydantic args) + fs (`read_file` paged+numbered, `edit_file` exact-replace/append, `write_file`, `list_dir`, `delete_file`; line endings preserved; syntax check after writes), `grep_tools.py` (`grep`, `find_files`), shell, search_codebase (RAG, falls back to grep), Playwright browser tools (text-only to model; video recorded for user). `registry.py` builds tool dict; `trust_gate.py` classifies risk → approval for every shell command (unless `autoApproveShell`; destructive always), deletes, out-of-project writes |
| `core/memory/project_memory.py` | Per-project JSON memory (folder-key hashed), session summaries injected as context |
| `core/persistence/db.py` | SQLite (`agent.db`) for sessions |
| `core/artifacts/` | Artifact model + per-session store (command logs, recordings) |
| `frontend/` | Vite + React + TS + Tailwind, Electron shell (`electron/main.cjs` spawns packaged backend exe on a free port; dev port 5180). Key UI: `AgentPanel/*` (approvals, task list, artifact trail), `hooks/useAgentSocket.ts` (REST + WS), `src/backend.ts` (`backendUrl()` adds the auth token to every backend URL), EditorView, FileTree, TerminalPanel, Settings |
| `termicursor-backend.spec` | PyInstaller spec → `dist/termicursor-backend` bundled via electron-builder `extraResources` |
| `landing-page/` | Static marketing site (Vercel): `index.html`, `styles.css`, `script.js`; images in `asset/` (see its README) |
| `archive/` (gitignored, local only) | Research/eval scripts and old patch scripts, kept for later (see `archive/README.md`) |
| `tests/live_agent_eval.py` | Live eval vs Ollama: 11 un-guessable tasks (fixture project), pass table |
| `frontend/e2e/` | `run-e2e.mjs` drives the real Electron app (Playwright `_electron`); `harness.mjs` starts an isolated backend + Vite on free ports |
| `tests/` | Offline unit tests (`pytest tests --ignore-glob="tests/live_*"`), incl. server auth, trust gate, version sync; `live_*` need Ollama/Playwright |
| `.github/workflows/ci.yml` | CI on Windows: pytest + frontend typecheck |

## Runtime
- Default model `qwen2.5-coder:3b` (no vision → browser tools return text + console/network errors only).
- Data lives in AppData: `local_qdrant/`, `settings.json`, `artifacts/`, `agent.db`.
- Dev: `pip install -r requirements.txt`, `uvicorn server:app`, `cd frontend && npm run dev`.
- Limits: `MAX_ITERATIONS_PER_STEP=12`, `SIMPLE_MAX_ITERATIONS=6`, `MAX_JSON_RETRIES=2`, `SHELL_TIMEOUT_SEC=120`.

## Agent modes
- **Build** (default): router → optional plan → code.
- **Ask** (`agent="ask"`): no planning, read-only tools (read_file, list_dir, search_codebase).
- **Plan** (`agent="plan"`): always plan → `plan_review` event → wait for `POST /sessions/{id}/plan` (approve with optional edited steps / revise with feedback / reject) → code. CLI: `tab` cycles, or `/ask` `/plan` `/build`.
- See `progress.md` for the change log.

## Security
- Packaged app: Electron generates `TERMICURSOR_TOKEN` per launch → backend requires it on all HTTP/WS; renderer gets it via `getBackendToken` IPC. Allowed origins: Vite dev (`localhost:5180`) + `null` (file://, token mode only).
- Dev (`uvicorn server:app`): no token, Vite origin only.
- Electron: single-instance lock, navigation guard, external links → system browser.

## Release
- Version: `core/__init__.py` `__version__` == `frontend/package.json` version (test enforces). Publishes to GitHub `MShreyash09/TermiCursor`.
- Build backend: `.venv` + `pyinstaller termicursor-backend.spec` → `dist/termicursor-backend`; then `cd frontend && npm run package`.
- Logs (packaged): `%APPDATA%/Termicursor/logs/main.log`.

## Notes / gotchas
- Groq/Langfuse keys are in pushed git history; `.env` removal is staged but not committed. Keys must be rotated.
- MIT licensed (`LICENSE`).

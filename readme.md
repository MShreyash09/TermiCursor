# TermiCursor - Local Agentic Coding Assistant

TermiCursor is a GUI-based AI coding **agent** that runs on local models. Give it a
goal: it plans the work (for anything non-trivial), then edits files, searches your
codebase, and runs shell commands to accomplish it. It asks for your approval before
running commands and streams its plan, thoughts and results live. Three modes: **Ask**
(answers questions, read-only), **Plan** (you review the plan before any code is
written) and **Build** (plans if needed, then codes). With the default Ollama setup,
your code, embeddings and inference stay on your PC.

## 🚀 Download

**[Download the latest Windows installer](https://github.com/MShreyash09/TermiCursor/releases/latest)**

1. Install [Ollama](https://ollama.com/download) and make sure it's running.
2. Install and open TermiCursor. The status bar shows **Ollama Ready** once it can reach Ollama.
3. If it shows **Models Missing**, click **Install Now**. The default models
   (`qwen2.5-coder:3b` and `nomic-embed-text`) are about 2.2 GB in total.
4. Open a project folder and give the agent a task.

Requirements: Windows 10/11 and 8 GB RAM recommended. The browser tools use the Microsoft Edge that
comes with Windows.

### What goes over the network
- Checking GitHub for TermiCursor updates.
- Downloading models through Ollama (only when you click Install).
- Web pages the agent opens with its browser tools.
- **Groq (optional):** if you choose Groq as the LLM provider in Settings, your prompts and
  the code the agent reads are sent to Groq's cloud API.

### Safety
- The agent asks before **every** shell command and before deleting files or writing outside
  the project. Settings → *Auto-approve shell commands* skips the prompt, except for destructive
  commands (`rm`, `del`, `git reset --hard`…), which always ask.
- The app's local backend only accepts requests carrying a secret generated at each launch,
  so other programs and web pages can't drive the agent.
- Logs for bug reports: `%APPDATA%\Termicursor\logs\main.log`. See [SECURITY.md](SECURITY.md)
  to report a vulnerability.

---

##  Architecture Overview

TermiCursor divides operations into two workflows: **Ingestion** (populating the vector
database) and the **Agent Loop** (routing, planning, and tool-calling execution). All
agent code lives in `core/` (`core/agent`, `core/tools`, `core/memory`,
`core/persistence`, `core/artifacts`); `rag.py` is now retrieval-only.

### 1. Ingestion Phase (`ingest`)
1. **File Scanning:** Uses `GenericLoader` from LangChain to scan code files matching `.py`, `.js`, `.jsx`, `.ts`, and `.tsx`.
2. **Language Parser:** Analyzes documents dynamically and assigns syntax parsing tags (`metadata["language"]`).
3. **Language-Aware Splitting:** Documents are grouped by language, and chunked using syntax-specific token splitting rules (`RecursiveCharacterTextSplitter.from_language`) to ensure functions, class signatures, and control structures remain cohesive.
4. **Vector Database Storage:** Semantic text embeddings are generated using Ollama's `nomic-embed-text` model and indexed into local Qdrant collections.

### 2. Agent Loop (`core/agent/loop.py`)
1. **Route:** `core/agent/router.py` classifies the goal as `simple` (question/lookup —
   answered directly, no planning) or `complex` (build/change task — planned first).
   Heuristics resolve most cases with zero LLM calls.
2. **Plan (complex only):** decomposes the goal into an ordered task list.
3. **Execute:** each step runs a bounded ReAct loop — the model emits one JSON
   tool-call per turn (`read_file`, `write_file`, `list_dir`, `delete_file`,
   `run_shell_command`, `search_codebase`, `browser_navigate`, `browser_click`,
   `browser_get_text`), validated against a schema, executed, and fed back —
   until it returns a final answer.
4. **Trust gate:** destructive shell commands, deletes, and out-of-project writes pause
   for your approval before running.
5. **Stream + stop:** every step streams live over `WS /ws/agent/{session_id}`; a
   running agent can be stopped at any time (`POST /sessions/{id}/cancel`).
6. **Browser verification (text-only, no vision):** qwen2.5-coder:3b can't see
   images, so `browser_navigate`/`browser_click`/`browser_get_text` give it back
   extracted page text and console/network errors — never pixels — to verify a
   web app it built. Separately, and purely for you, the **entire browser
   session is recorded to video** automatically (`core/tools/browser_tools.py`)
   and shows up in the Artifact Trail as a `.webm` you can open and watch — the
   model never sees it, it's not fed back into the loop, it's just proof of
   what happened.

See [`core/`](core) for the implementation and the frontend's `AgentPanel` for the UI.

---

##  Features

*   **Private by Default:** With Ollama, code, embeddings and inference stay on your machine (see *What goes over the network* above).
*   **Syntax-Aware Parsing:** Code-aware chunking ensures logical components (functions, classes) are kept intact.
*   **Database Workspace Isolation:** Every project folder receives a unique path-hashed Qdrant collection to completely avoid data mix-ups.
*   **Proactive Checks:** Validates model availability and connectivity to prevent standard connection tracebacks.
*   **Windows Terminal Safe:** Integrated UTF-8 reconfiguration protects against command-line character rendering crashes.

---

##  Development

### Command Options
Requires Python 3.10+ (releases are built with 3.13) and Node 22. Dependencies are pinned in `requirements.txt`.

```powershell
# 1. Create a venv
python -m venv .venv

# 2. Activate the virtual environment
.venv\Scripts\activate

# 3. Install requirement file
pip install -r requirements.txt

# 3b. One-time: install the Chromium binary the browser tools drive
python -m playwright install chromium

# 4. Install frontend files
cd frontend
npm install

# 5. Open 2 terminals: one for frontend, one for backend
cd frontend
npm run dev

# Open another terminal and run
uvicorn server:app --reload

# 6. Ingest (Index) the current directory codebase
python main.py ingest .

# 7. Run the agent on a goal (headless CLI; anything needing approval is auto-denied,
#    including shell commands unless "autoApproveShell": true is in settings.json)
python main.py run . "Create a Flask hello-world app and run it"

# 8. Interactive terminal UI (asks you before running commands)
python cli.py

# Tests (offline; tests/live_* need a running Ollama)
python -m pytest -q tests --ignore-glob="tests/live_*"
```

In dev, the backend runs without the per-launch token (only the packaged app sets
`TERMICURSOR_TOKEN`); it still rejects requests from any origin except the Vite dev server.

The GUI (`npm run dev` in `frontend/`) is the primary way to use the agent — it shows
the live plan, tool calls, approval prompts, and artifacts, and lets you stop a run
mid-flight.

## License

[MIT](LICENSE)

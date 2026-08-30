import asyncio
import sys

import requests
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response, StreamingResponse
from pydantic import BaseModel

from core.config import OLLAMA_URL
from core.persistence import db
from core.agent.session import AgentSession, SESSIONS
from core.agent.loop import AgentLoop
from core.artifacts.store import ArtifactStore
from core.memory import project_memory
import rag

if sys.platform.startswith("win"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except AttributeError:
        pass

app = FastAPI(title="Termicursor API")

# Enable CORS for the React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _startup():
    db.init_db()


# ── Request models ──
class IngestRequest(BaseModel):
    project_path: str


class PullRequest(BaseModel):
    name: str


class CreateSessionRequest(BaseModel):
    project_path: str
    goal: str


class ApproveRequest(BaseModel):
    call_id: str
    approved: bool


class OpenProjectRequest(BaseModel):
    project_path: str


@app.post("/ingest")
async def ingest(request: IngestRequest):
    # Run the blocking ingest function in a thread pool so it doesn't
    # block the async event loop (which would freeze the entire server).
    result = await asyncio.to_thread(rag.ingest_codebase, request.project_path)
    if result and result.get("status") == "error":
        raise HTTPException(status_code=400, detail=result.get("message"))
    return result


@app.get("/status")
async def status():
    return rag.get_ollama_status()


@app.post("/pull")
async def pull_model(request: PullRequest):
    def stream_pull():
        try:
            r = requests.post(
                f"{OLLAMA_URL}/api/pull",
                json={"name": request.name},
                stream=True,
                timeout=3600
            )
            for chunk in r.iter_content(chunk_size=1024):
                if chunk:
                    yield chunk
        except Exception as e:
            yield f'{{"error": "{str(e)}"}}\n'.encode("utf-8")

    return StreamingResponse(stream_pull(), media_type="application/x-ndjson")


# ── Project memory ──
@app.post("/projects/open")
async def open_project(request: OpenProjectRequest):
    """Called when the user opens a folder. Creates a fresh memory the first
    time a folder is seen, or loads the saved one so the agent can continue
    where prior sessions left off."""
    return project_memory.open_project(request.project_path)


# ── Agent sessions (replaces the old /query + /ws/chat tag-parsing flow) ──
@app.post("/sessions")
async def create_session(request: CreateSessionRequest):
    session = AgentSession(project_path=request.project_path, goal=request.goal)
    SESSIONS[session.id] = session
    db.upsert_session(session.to_dict())
    return {"session_id": session.id}


@app.get("/sessions")
async def list_sessions():
    return {"sessions": db.list_sessions()}


@app.get("/sessions/{session_id}")
async def get_session(session_id: str):
    session = SESSIONS.get(session_id)
    if session is None:
        rows = [s for s in db.list_sessions() if s["id"] == session_id]
        if not rows:
            raise HTTPException(status_code=404, detail="Session not found")
        return rows[0]
    return session.to_dict()


@app.get("/sessions/{session_id}/artifacts")
async def get_artifacts(session_id: str):
    return {"artifacts": db.list_artifacts(session_id)}


@app.get("/sessions/{session_id}/artifacts/{filename}")
async def get_artifact_file(session_id: str, filename: str):
    store = ArtifactStore(session_id)
    if filename.endswith(".webm"):
        # FileResponse supports Range requests, which the browser needs to seek/scrub video.
        path = store.path_for(filename)
        if path is None:
            raise HTTPException(status_code=404, detail="Artifact file not found")
        return FileResponse(path, media_type="video/webm")

    body = store.read_file(filename)
    if body is None:
        raise HTTPException(status_code=404, detail="Artifact file not found")
    media = "image/png" if filename.endswith(".png") else "text/plain; charset=utf-8"
    return Response(content=body, media_type=media)


@app.post("/sessions/{session_id}/approve")
async def approve(session_id: str, request: ApproveRequest):
    session = SESSIONS.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    ok = session.resolve_approval(request.call_id, request.approved)
    if not ok:
        raise HTTPException(status_code=400, detail="No pending approval for that call_id")
    return {"ok": True}


@app.post("/sessions/{session_id}/cancel")
async def cancel(session_id: str):
    session = SESSIONS.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    session.cancel()
    db.upsert_session(session.to_dict())
    return {"ok": True}


@app.websocket("/ws/agent/{session_id}")
async def ws_agent(websocket: WebSocket, session_id: str):
    await websocket.accept()
    session = SESSIONS.get(session_id)
    if session is None:
        await websocket.send_json({"type": "error", "message": "Session not found"})
        await websocket.close()
        return
    session._run_task = asyncio.current_task()
    try:
        loop = AgentLoop(session)
        async for event in loop.run():
            await websocket.send_json(event)
    except asyncio.CancelledError:
        # Stopped via POST /cancel — status already persisted by session.cancel().
        pass
    except WebSocketDisconnect:
        print("WebSocket client disconnected")
    except Exception as e:
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass
    finally:
        # Persist this session into the folder's memory on ANY exit path —
        # normal completion, error, cancel, or the socket dropping — so progress
        # is remembered and can be resumed when the folder is reopened.
        try:
            project_memory.record_session(session)
        except Exception:
            pass
        try:
            await websocket.close()
        except Exception:
            pass


if __name__ == "__main__":
    import uvicorn
    import argparse

    parser = argparse.ArgumentParser(description="Termicursor Backend")
    parser.add_argument("--port", type=int, default=8000, help="Port to run the server on")
    args = parser.parse_args()

    # Check if running in a PyInstaller frozen executable
    if getattr(sys, 'frozen', False):
        # When frozen, run the app object directly without reload
        uvicorn.run(app, host="127.0.0.1", port=args.port)
    else:
        # Development mode
        uvicorn.run("server:app", host="127.0.0.1", port=args.port, reload=True)

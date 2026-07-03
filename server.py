from fastapi import FastAPI, WebSocket, HTTPException, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import asyncio
import rag

app = FastAPI(title="Termicursor API")

# Enable CORS for the React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class IngestRequest(BaseModel):
    project_path: str

class QueryRequest(BaseModel):
    project_path: str
    query: str

@app.post("/ingest")
async def ingest(request: IngestRequest):
    # Run the blocking ingest function in a thread pool so it doesn't
    # block the async event loop (which would freeze the entire server).
    result = await asyncio.to_thread(rag.ingest_codebase, request.project_path)
    if result and result.get("status") == "error":
        raise HTTPException(status_code=400, detail=result.get("message"))
    return result

@app.post("/query")
async def query(request: QueryRequest):
    result = rag.single_shot_query(request.project_path, request.query)
    if result and "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@app.get("/status")
async def status():
    return rag.get_ollama_status()


import requests
from fastapi.responses import StreamingResponse

class PullRequest(BaseModel):
    name: str

@app.post("/pull")
async def pull_model(request: PullRequest):
    def stream_pull():
        try:
            r = requests.post(
                f"{rag.OLLAMA_URL}/api/pull", 
                json={"name": request.name}, 
                stream=True,
                timeout=3600
            )
            for chunk in r.iter_content(chunk_size=1024):
                if chunk:
                    yield chunk
        except Exception as e:
            yield f'{"error": "{str(e)}"}\n'.encode("utf-8")
            
    return StreamingResponse(stream_pull(), media_type="application/x-ndjson")


@app.websocket("/ws/chat")
async def websocket_chat(websocket: WebSocket):
    await websocket.accept()
    try:
        # First message from client should contain project_path and query
        data = await websocket.receive_json()
        project_path = data.get("project_path")
        query_text = data.get("query")

        if not project_path or not query_text:
            await websocket.send_text("Error: Missing project_path or query in initial payload.")
            await websocket.close()
            return

        async for chunk in rag.async_stream_query(project_path, query_text):
            await websocket.send_text(chunk)

        # Notify completion
        await websocket.send_text("[DONE]")
    except WebSocketDisconnect:
        print("WebSocket client disconnected")
    except Exception as e:
        await websocket.send_text(f"\nError: {str(e)}")
    finally:
        try:
            await websocket.close()
        except Exception:
            pass

if __name__ == "__main__":
    import uvicorn
    import sys
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

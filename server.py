from fastapi import FastAPI, WebSocket, HTTPException, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
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
    result = rag.ingest_codebase(request.project_path)
    if result and result.get("status") == "error":
        raise HTTPException(status_code=400, detail=result.get("message"))
    return result

@app.post("/query")
async def query(request: QueryRequest):
    result = rag.single_shot_query(request.project_path, request.query)
    if result and "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result

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

    # Check if running in a PyInstaller frozen executable
    if getattr(sys, 'frozen', False):
        # When frozen, run the app object directly without reload
        uvicorn.run(app, host="127.0.0.1", port=8000)
    else:
        # Development mode
        uvicorn.run("server:app", host="127.0.0.1", port=8000, reload=True)

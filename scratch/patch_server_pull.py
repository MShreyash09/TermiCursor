import re

server_file = "server.py"
with open(server_file, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Update /status endpoint
old_status = """
@app.get("/status")
async def status():
    is_running = rag.validate_ollama_status()
    # To provide more detail, we can check specific models if needed,
    # but the validate function already returns True/False.
    # A true robust implementation would return the exact reason, 
    # but for now we'll just return the boolean.
    return {"status": "ok" if is_running else "error", "ollama_ready": is_running}
"""

new_status = """
@app.get("/status")
async def status():
    return rag.get_ollama_status()
"""
content = content.replace(old_status.strip(), new_status.strip())

# 2. Add PullRequest schema and POST /pull endpoint
pull_code = """
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
            yield f'{"error": "{str(e)}"}\\n'.encode("utf-8")
            
    return StreamingResponse(stream_pull(), media_type="application/x-ndjson")
"""
if "@app.post(\"/pull\")" not in content:
    # Inject it before WebSocket
    content = content.replace("@app.websocket(\"/ws/chat\")", f"{pull_code}\n\n@app.websocket(\"/ws/chat\")")

with open(server_file, "w", encoding="utf-8") as f:
    f.write(content)
print("server.py updated with streaming pull endpoint")

import os

server_file = "server.py"
with open(server_file, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Add /status endpoint
status_endpoint = """
@app.get("/status")
async def status():
    is_running = rag.validate_ollama_status()
    # To provide more detail, we can check specific models if needed,
    # but the validate function already returns True/False.
    # A true robust implementation would return the exact reason, 
    # but for now we'll just return the boolean.
    return {"status": "ok" if is_running else "error", "ollama_ready": is_running}

@app.websocket("/ws/chat")
"""
content = content.replace("@app.websocket(\"/ws/chat\")\n", status_endpoint)

# 2. Add argparse for port
argparse_patch = """if __name__ == "__main__":
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
        uvicorn.run("server:app", host="127.0.0.1", port=args.port, reload=True)"""

old_main = """if __name__ == "__main__":
    import uvicorn
    import sys

    # Check if running in a PyInstaller frozen executable
    if getattr(sys, 'frozen', False):
        # When frozen, run the app object directly without reload
        uvicorn.run(app, host="127.0.0.1", port=8000)
    else:
        # Development mode
        uvicorn.run("server:app", host="127.0.0.1", port=8000, reload=True)"""

content = content.replace(old_main.strip(), argparse_patch.strip())

with open(server_file, "w", encoding="utf-8") as f:
    f.write(content)
print("server.py updated with dynamic port and /status endpoint")

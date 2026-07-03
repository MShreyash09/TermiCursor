import re

rag_file = "rag.py"
with open(rag_file, "r", encoding="utf-8") as f:
    content = f.read()

# Add get_ollama_status function
ollama_status_func = """
def get_ollama_status():
    \"\"\"Checks Ollama status and returns a dictionary with missing models.\"\"\"
    try:
        response = requests.get(f"{OLLAMA_URL}/api/tags", timeout=5)
        if response.status_code != 200:
            return {"status": "error", "reason": "ollama_error", "ollama_ready": False, "missing_models": []}
        
        models = [m['name'] for m in response.json().get('models', [])]
        
        missing = []
        embed_found = any(EMBED_MODEL in m for m in models)
        if not embed_found:
            missing.append(EMBED_MODEL)
            
        if LLM_PROVIDER == "ollama":
            llm_found = any(LLM_MODEL in m for m in models)
            if not llm_found:
                missing.append(LLM_MODEL)
                
        if missing:
            return {
                "status": "error", 
                "reason": "missing_models", 
                "ollama_ready": True, 
                "missing_models": missing
            }
        return {"status": "ok", "ollama_ready": True, "missing_models": []}
    except requests.exceptions.ConnectionError:
        return {"status": "error", "reason": "connection_error", "ollama_ready": False, "missing_models": []}
"""

if "def get_ollama_status" not in content:
    # Inject it before validate_ollama_status
    content = content.replace("def validate_ollama_status():", f"{ollama_status_func}\n\ndef validate_ollama_status():")

with open(rag_file, "w", encoding="utf-8") as f:
    f.write(content)
print("get_ollama_status added to rag.py")

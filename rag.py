import os
import sys
import re
import hashlib
import requests

# Ensure stdout/stderr supports UTF-8 on Windows
if sys.platform.startswith('win'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except AttributeError:
        pass

from langchain_community.document_loaders.generic import GenericLoader
from langchain_community.document_loaders.parsers import LanguageParser
from langchain_text_splitters import RecursiveCharacterTextSplitter, Language

from langchain_ollama import OllamaEmbeddings
from langchain_ollama import OllamaLLM
from langchain_qdrant import QdrantVectorStore

from langchain_classic.chains import RetrievalQA
from langchain_classic.prompts import PromptTemplate
from langchain_groq import ChatGroq
from dotenv import load_dotenv
from qdrant_client import QdrantClient

load_dotenv()

# Central database location on your PC
QDRANT_PATH = "./local_qdrant" 
MEM0_QDRANT_PATH = "./local_mem0_qdrant"  # Separate storage for user memories

LLM_PROVIDER = os.getenv("LLM_PROVIDER", "ollama").lower()
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")

EMBED_MODEL = os.getenv("OLLAMA_EMBED_MODEL", "nomic-embed-text")
LLM_MODEL = os.getenv("OLLAMA_LLM_MODEL", "qwen2.5-coder:3b")
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")

# ── Mem0 Memory Initialization ──
try:
    from mem0 import Memory

    mem0_config = {
        "vector_store": {
            "provider": "qdrant",
            "config": {
                "collection_name": "termicursor_user_memories",
                "path": MEM0_QDRANT_PATH,
                "on_disk": True,
            },
        },
        "embedder": {
            "provider": "ollama",
            "config": {
                "model": EMBED_MODEL,
                "ollama_base_url": OLLAMA_URL,
            },
        },
    }

    # Use the same LLM provider the user configured for the main chat
    if LLM_PROVIDER == "groq" and GROQ_API_KEY:
        mem0_config["llm"] = {
            "provider": "groq",
            "config": {
                "model": GROQ_MODEL,
                "api_key": GROQ_API_KEY,
                "temperature": 0,
                "max_tokens": 2000,
            },
        }
    else:
        mem0_config["llm"] = {
            "provider": "ollama",
            "config": {
                "model": LLM_MODEL,
                "ollama_base_url": OLLAMA_URL,
                "temperature": 0,
                "max_tokens": 2000,
            },
        }

    user_memory = Memory.from_config(mem0_config)
    print("🧠 Mem0 memory layer initialized successfully!")
except Exception as e:
    print(f"⚠️ Mem0 memory layer could not be initialized: {e}")
    print("   Memory features will be disabled. Install with: pip install mem0ai")
    user_memory = None

def get_llm():
    if LLM_PROVIDER == "groq":
        if not GROQ_API_KEY:
            print("❌ Error: GROQ_API_KEY is missing in .env file.")
            sys.exit(1)
        return ChatGroq(model=GROQ_MODEL, api_key=GROQ_API_KEY)
    else:
        return OllamaLLM(model=LLM_MODEL, base_url=OLLAMA_URL)

def validate_ollama_status():
    print("⏳ Checking Ollama local service status...")
    try:
        response = requests.get(f"{OLLAMA_URL}/api/tags", timeout=5)
        if response.status_code != 200:
            print(f"❌ Error: Ollama responded with status code {response.status_code}.")
            return False
        
        models = [m['name'] for m in response.json().get('models', [])]
        
        # Check for embed model and LLM model
        embed_found = any(EMBED_MODEL in m for m in models)
        llm_found = any(LLM_MODEL in m for m in models)
        
        if not embed_found or (LLM_PROVIDER == "ollama" and not llm_found):
            print("\n⚠️ Missing required Ollama models:")
            if not embed_found:
                print(f"   - Embedding model '{EMBED_MODEL}' is not pulled.")
                print(f"     👉 Run: ollama pull {EMBED_MODEL}")
            if LLM_PROVIDER == "ollama" and not llm_found:
                print(f"   - LLM model '{LLM_MODEL}' is not pulled.")
                print(f"     👉 Run: ollama pull {LLM_MODEL}")
            print("\nPlease pull the missing model(s) and try again.\n")
            return False
            
        print("✅ Ollama is running and required models are available!")
        return True
    except requests.exceptions.ConnectionError:
        print("\n❌ Error: Could not connect to Ollama.")
        print("   Is Ollama running? Please start Ollama desktop app or service.")
        print(f"   Expected local URL: {OLLAMA_URL}\n")
        return False

def get_collection_name(project_path):
    # Extracts the folder name and combines it with a path hash for safety
    abs_path = os.path.abspath(project_path)
    path_hash = hashlib.md5(abs_path.encode('utf-8')).hexdigest()[:6]
    folder_name = os.path.basename(os.path.normpath(abs_path))
    clean_name = re.sub(r'[^a-zA-Z0-9_]', '_', folder_name).lower()
    # Fallback if path is weird
    if not clean_name:
        clean_name = "default_codebase"
    return f"{clean_name}_{path_hash}"


def get_memory_context(query, user_id="default_user", limit=5):
    """Retrieve relevant past memories for the current query."""
    if user_memory is None:
        return ""
    try:
        memories = user_memory.search(query, user_id=user_id, limit=limit)
        if not memories or not memories.get("results"):
            return "No relevant memories found."
        memory_lines = []
        for m in memories["results"]:
            memory_text = m.get("memory", "")
            if memory_text:
                memory_lines.append(f"- {memory_text}")
        return "\n".join(memory_lines) if memory_lines else "No relevant memories found."
    except Exception as e:
        print(f"⚠️ Memory search failed: {e}")
        return "Memory search unavailable."


def save_to_memory(user_input, assistant_response, user_id="default_user"):
    """Save conversation interaction to long-term memory."""
    if user_memory is None:
        return
    try:
        user_memory.add(
            f"User asked: {user_input}\nAssistant answered: {assistant_response}",
            user_id=user_id
        )
    except Exception as e:
        print(f"⚠️ Failed to save to memory: {e}")

def check_and_create_file(response_text, project_path):
    file_pattern = r"\[CREATE_FILE:\s*([a-zA-Z0-9_\-\.\/\\]+)\](.*?)\[/CREATE_FILE\]"
    # Find all matches in case there are multiple
    matches = re.findall(file_pattern, response_text, re.DOTALL)
    created_files = []
    
    if not project_path:
        print("\n❌ [System] No project path set — cannot create files.")
        return created_files
    
    # Normalize the project path for consistent comparison
    norm_project = os.path.normpath(os.path.abspath(project_path))
    
    for filename, content in matches:
        filename = filename.strip()
        content = content.strip()
        
        # Strip markdown fences if present
        content = re.sub(r"^```[a-zA-Z0-9]*\n", "", content)
        content = re.sub(r"\n```$", "", content)
        
        # Resolve to absolute path under the project directory
        abs_path = os.path.normpath(os.path.join(norm_project, filename))
        
        # Safety: ensure the resolved path is still within the project
        if not abs_path.startswith(norm_project):
            print(f"\n❌ [System] Refused to write '{filename}': path escapes project directory.")
            continue
        
        try:
            parent_dir = os.path.dirname(abs_path)
            if parent_dir and not os.path.exists(parent_dir):
                os.makedirs(parent_dir, exist_ok=True)
                
            with open(abs_path, "w", encoding="utf-8") as f:
                f.write(content)
            
            # Verify the file was actually created
            if os.path.exists(abs_path):
                print(f"\n💾 [System] File '{filename}' created at: {abs_path}")
                created_files.append(filename)
            else:
                print(f"\n❌ [System] File '{filename}' write reported success but file not found at: {abs_path}")
        except Exception as e:
            print(f"\n❌ [System] Failed to write file '{filename}': {e}")
            
    return created_files


def ingest_codebase(project_path):
    if not validate_ollama_status():
        return {"status": "error", "message": "Ollama is not running or missing models."}

    print(f"🔍 Scanning codebase at: {project_path}")
    
    if not os.path.exists(project_path):
        print("❌ Error: That path does not exist. Please check your spelling.")
        return {"status": "error", "message": f"Path '{project_path}' does not exist."}
        
    collection_name = get_collection_name(project_path)
    client = QdrantClient(path=QDRANT_PATH)
    collection_exists = client.collection_exists(collection_name)
    client.close()
    
    if collection_exists:
        print(f"✅ Embeddings for '{collection_name}' already exist. Skipping re-ingestion.")
        return {"status": "success", "message": f"Existing embeddings loaded for {collection_name}.", "collection": collection_name}

    loader = GenericLoader.from_filesystem(
        project_path,
        glob="**/*", 
        suffixes=[".py", ".js", ".jsx", ".ts", ".tsx"],
        exclude=["**/node_modules/**", "**/venv/**", "**/.venv/**", "**/__pycache__/**", "**/.git/**", "**/dist/**", "**/build/**"],
        parser=LanguageParser()
    )
    documents = loader.load()
    print(f"📄 Found {len(documents)} code files.")

    if len(documents) == 0:
        print("No supported code files found in this directory.")
        return {"status": "error", "message": "No supported code files found in this directory."}

    print("✂️ Splitting documents into language-specific chunks...")
    docs_by_lang = {}
    for doc in documents:
        lang = doc.metadata.get("language", "generic")
        if lang not in docs_by_lang:
            docs_by_lang[lang] = []
        docs_by_lang[lang].append(doc)

    texts = []
    supported_langs = {
        "python": Language.PYTHON,
        "js": Language.JS,
        "jsx": Language.JS,
        "ts": Language.TS,
        "tsx": Language.TS
    }

    for lang, lang_docs in docs_by_lang.items():
        if lang in supported_langs:
            splitter = RecursiveCharacterTextSplitter.from_language(
                language=supported_langs[lang],
                chunk_size=500,
                chunk_overlap=50
            )
            print(f"  - Splitting {len(lang_docs)} {lang} files using {lang} syntax splitter")
        else:
            splitter = RecursiveCharacterTextSplitter(
                chunk_size=500,
                chunk_overlap=50
            )
            print(f"  - Splitting {len(lang_docs)} files using generic character splitter")
        
        chunks = splitter.split_documents(lang_docs)
        texts.extend(chunks)
        
    print(f"✂️ Split into {len(texts)} chunks total.")

    print("🧠 Creating embeddings and saving to Qdrant (This might take a minute)...")
    embeddings = OllamaEmbeddings(model="nomic-embed-text")
    
    QdrantVectorStore.from_documents(
        texts,
        embeddings,
        path=QDRANT_PATH,
        collection_name=collection_name,
    )
    print(f"✅ Codebase ingested successfully into brain: '{collection_name}'!")
    return {"status": "success", "message": f"Codebase ingested successfully. {len(documents)} files, {len(texts)} chunks.", "collection": collection_name}

def chat_with_cursor(project_path):
    if not validate_ollama_status():
        return

    collection_name = get_collection_name(project_path)
    
    print(f"\n========================================")
    print(f"🤖 TermiCursor Activated")
    print(f"🧠 Brain loaded: {collection_name}")
    print(f"Type 'exit' to quit.")
    print(f"========================================\n")

    # 1. Load DB tailored to this specific project
    embeddings = OllamaEmbeddings(model="nomic-embed-text")
    
    try:
        qdrant = QdrantVectorStore.from_existing_collection(
            embedding=embeddings,
            collection_name=collection_name,
            path=QDRANT_PATH,
        )
    except Exception as e:
        print(f"❌ Could not find the brain for '{collection_name}'. Did you run --ingest first?")
        return

    retriever = qdrant.as_retriever(search_kwargs={"k": 3}) 
    llm = get_llm()

    prompt_template = """
    You are TermiCursor, an elite AI coding assistant.
    Use the following pieces of retrieved codebase context and your memory of past interactions to answer the user's question.
    If you don't know the answer or the context doesn't have it, say that you don't know.
    Write clean, efficient code. And handle simple small talk like reply hello I am
    TermiCursor when asked and thankyou for using TermiCursor when user say bye and stop the terminal chat.
    
    If the user explicitly asks you to create, write, or generate a file (e.g. "create a python file named app.py and write code"), you MUST structure your response to write the file by enclosing the file creation command and content in these exact tags:
    [CREATE_FILE: <filename>]
    <file_contents>
    [/CREATE_FILE]
    
    Example:
    If the user asks: "Create a python file named hello.py that prints hello world"
    Your response should look like:
    I will create that file for you.
    [CREATE_FILE: hello.py]
    print("Hello, World!")
    [/CREATE_FILE]

    Relevant Memory from Past Conversations:
    {memories}

    Codebase Context: {context}
    
    Question: {question}
    
    Answer:"""
    
    PROMPT = PromptTemplate(template=prompt_template, input_variables=["context", "question", "memories"])

    qa_chain = RetrievalQA.from_chain_type(
        llm=llm,
        chain_type="stuff",
        retriever=retriever,
        chain_type_kwargs={"prompt": PROMPT}
    )

    # Interactive Loop
    while True:
        try:
            user_input = input("You ❯ ")
            if user_input.lower() in ['exit', 'quit']:
                print("TermiCursor shutting down...")
                break
            if not user_input.strip():
                continue
            
            # Retrieve relevant memories
            memory_context = get_memory_context(user_input)
            
            print("🤖 TermiCursor is thinking...")
            response = qa_chain.invoke({"query": user_input, "memories": memory_context})
            result_text = response["result"]
            print("\n" + result_text)
            print("\n" + "-"*40 + "\n")
            
            # Save interaction to long-term memory
            save_to_memory(user_input, result_text)
            
            # Check for file creation tags and execute
            check_and_create_file(result_text, project_path)

            
        except KeyboardInterrupt:
            print("\nTermiCursor shutting down...")
            break

def single_shot_query(project_path, query_text):
    if not validate_ollama_status():
        return {"error": "Ollama is not running or missing models."}

    collection_name = get_collection_name(project_path)
    embeddings = OllamaEmbeddings(model="nomic-embed-text")
    
    try:
        qdrant = QdrantVectorStore.from_existing_collection(
            embedding=embeddings,
            collection_name=collection_name,
            path=QDRANT_PATH,
        )
    except Exception as e:
        print(f"❌ Could not find the brain for '{collection_name}'. Did you run --ingest first?")
        return {"error": f"Could not find the brain for '{collection_name}'. Did you run ingest first?"}

    retriever = qdrant.as_retriever(search_kwargs={"k": 3}) 
    llm = get_llm()

    prompt_template = """
    You are TermiCursor, an elite AI coding assistant.
    Use the following pieces of retrieved codebase context and your memory of past interactions to answer the user's question.
    If you don't know the answer or the context doesn't have it, say that you don't know.
    Write clean, efficient code.

    If the user explicitly asks you to create, write, or generate a file (e.g. "create a python file named app.py and write code"), you MUST structure your response to write the file by enclosing the file creation command and content in these exact tags:
    [CREATE_FILE: <filename>]
    <file_contents>
    [/CREATE_FILE]
    
    Example:
    If the user asks: "Create a python file named hello.py that prints hello world"
    Your response should look like:
    I will create that file for you.
    [CREATE_FILE: hello.py]
    print("Hello, World!")
    [/CREATE_FILE]

    Relevant Memory from Past Conversations:
    {memories}

    Codebase Context: {context}
    
    Question: {question}
    
    Answer:"""
    
    PROMPT = PromptTemplate(template=prompt_template, input_variables=["context", "question", "memories"])

    qa_chain = RetrievalQA.from_chain_type(
        llm=llm,
        chain_type="stuff",
        retriever=retriever,
        chain_type_kwargs={"prompt": PROMPT}
    )

    # Retrieve relevant memories
    memory_context = get_memory_context(query_text)

    print("🤖 TermiCursor is thinking...")
    try:
        response = qa_chain.invoke({"query": query_text, "memories": memory_context})
        result_text = response["result"]
        print("\n" + result_text)
        
        # Save interaction to long-term memory
        save_to_memory(query_text, result_text)
        
        # Check for file creation tags and execute
        created_files = check_and_create_file(result_text, project_path)
        return {"answer": result_text, "files_created": created_files}
    except Exception as e:
        print(f"❌ Error executing query: {e}")
        return {"error": str(e)}

async def async_stream_query(project_path, query_text):
    """
    Generator that streams the LLM response token by token, 
    useful for WebSockets or Server-Sent Events.
    """
    if not validate_ollama_status():
        yield "Error: Ollama is not running or missing models."
        return

    collection_name = get_collection_name(project_path)
    embeddings = OllamaEmbeddings(model="nomic-embed-text")
    
    try:
        qdrant = QdrantVectorStore.from_existing_collection(
            embedding=embeddings,
            collection_name=collection_name,
            path=QDRANT_PATH,
        )
    except Exception as e:
        yield f"Error: Could not find the brain for '{collection_name}'. Did you run ingest first?"
        return

    retriever = qdrant.as_retriever(search_kwargs={"k": 3}) 
    
    # We use a lower level approach here to manually stream the LLM
    # since RetrievalQA doesn't stream tokens back intuitively without callbacks.
    docs = retriever.invoke(query_text)
    
    # Build context with source file paths included
    context_parts = []
    source_files = set()
    for doc in docs:
        source = doc.metadata.get("source", "unknown")
        source_files.add(source)
        context_parts.append(f"[File: {source}]\n{doc.page_content}")
    context = "\\n\\n".join(context_parts)
    file_list = "\\n".join(source_files)
    
    # Retrieve relevant memories for this query
    memory_context = get_memory_context(query_text)

    prompt_template = f"""You are TermiCursor, an elite AI coding assistant.
Use the following pieces of retrieved codebase context and your memory of past interactions to answer the user's question.
If you don't know the answer or the context doesn't have it, say that you don't know.
Write clean, efficient code.

If the user explicitly asks you to create, write, or generate a file (e.g. "create a python file named app.py and write code"), you MUST structure your response to write the file by enclosing the file creation command and content in these exact tags:
[CREATE_FILE: <filename>]
<file_contents>
[/CREATE_FILE]

Relevant Memory from Past Conversations:
{memory_context}

Files found in the codebase:
{file_list}

Context: {context}

Question: {query_text}

Answer:"""

    llm = get_llm()
    
    # Yield tokens asynchronously
    full_response = ""
    try:
        async for chunk in llm.astream(prompt_template):
            # Groq returns AIMessageChunk, Ollama might return str
            content = chunk if isinstance(chunk, str) else chunk.content
            full_response += content
            yield content
            
        # Save interaction to long-term memory
        save_to_memory(query_text, full_response)
            
        # After streaming, process any files that might have been requested
        import json as _json
        created_files = check_and_create_file(full_response, project_path)
        if created_files:
            yield _json.dumps({
                "type": "files_created",
                "files": created_files,
                "project_path": project_path
            })
    except Exception as e:
        yield f"\\nError during generation: {e}"


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage:")
        print("1. To Ingest: python rag.py --ingest \"C:\\Path\\To\\Your\\Project\"")
        print("2. To Chat:   python rag.py --chat \"C:\\Path\\To\\Your\\Project\"")
        print("3. To Query:  python rag.py --query \"C:\\Path\\To\\Your\\Project\" \"Your Question\"")
        sys.exit()

    command = sys.argv[1]
    path = sys.argv[2]

    if command == "--ingest":
        ingest_codebase(path)
    elif command == "--chat":
        chat_with_cursor(path)
    elif command == "--query":
        if len(sys.argv) < 4:
            print("Please provide a query: python rag.py --query \"path\" \"question\"")
        else:
            query_text = sys.argv[3]
            single_shot_query(path, query_text)
    else:
        print("Unknown command. Use --ingest, --chat, or --query.")

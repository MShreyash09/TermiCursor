import re
with open("rag.py", "r", encoding="utf-8") as f:
    content = f.read()

# 1. Update get_langfuse_handler
content = re.sub(
    r"def get_langfuse_handler\(session_id=None, user_id=None, tags=None\):\n    # Initializes.*?\n    try:\n        return CallbackHandler\(session_id=session_id, user_id=user_id, tags=tags\)",
    r"def get_langfuse_handler():\n    # Initializes using LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, LANGFUSE_HOST from env\n    try:\n        return CallbackHandler()",
    content,
    flags=re.DOTALL
)

# 2. Update config in chat_with_cursor
content = re.sub(
    r"langfuse_handler = get_langfuse_handler\(session_id=f\"cli_\{collection_name\}_\{chat_id\}\", user_id=\"default_user\", tags=\[\"cli\"\]\)\n            config = \{\"callbacks\": \[langfuse_handler\], \"run_name\": \"TermiCursor_Chat_Turn\"\} if langfuse_handler else \{\}",
    r"""langfuse_handler = get_langfuse_handler()
            config = {
                "callbacks": [langfuse_handler], 
                "run_name": "TermiCursor_Chat_Turn",
                "metadata": {
                    "langfuse_session_id": f"cli_{collection_name}_{chat_id}",
                    "langfuse_user_id": "default_user",
                    "langfuse_tags": ["cli"]
                }
            } if langfuse_handler else {}""",
    content
)

# 3. Update config in single_shot_query
content = re.sub(
    r"langfuse_handler = get_langfuse_handler\(session_id=f\"single_\{collection_name\}_\{chat_id\}\", user_id=\"default_user\", tags=\[\"single_shot\"\]\)\n        config = \{\"callbacks\": \[langfuse_handler\], \"run_name\": \"TermiCursor_Single_Shot\"\} if langfuse_handler else \{\}",
    r"""langfuse_handler = get_langfuse_handler()
        config = {
            "callbacks": [langfuse_handler], 
            "run_name": "TermiCursor_Single_Shot",
            "metadata": {
                "langfuse_session_id": f"single_{collection_name}_{chat_id}",
                "langfuse_user_id": "default_user",
                "langfuse_tags": ["single_shot"]
            }
        } if langfuse_handler else {}""",
    content
)

# 4. Update config in async_stream_query
content = re.sub(
    r"langfuse_handler = get_langfuse_handler\(session_id=f\"ws_\{collection_name\}_\{chat_id\}\", user_id=\"default_user\", tags=\[\"websocket\"\]\)\n        config = \{\"callbacks\": \[langfuse_handler\], \"run_name\": \"TermiCursor_WS_Stream\"\} if langfuse_handler else \{\}",
    r"""langfuse_handler = get_langfuse_handler()
        config = {
            "callbacks": [langfuse_handler], 
            "run_name": "TermiCursor_WS_Stream",
            "metadata": {
                "langfuse_session_id": f"ws_{collection_name}_{chat_id}",
                "langfuse_user_id": "default_user",
                "langfuse_tags": ["websocket"]
            }
        } if langfuse_handler else {}""",
    content
)

# 5. Helper for flush
flush_replacement = """try:
                if hasattr(langfuse_handler, 'flush'):
                    langfuse_handler.flush()
                elif hasattr(langfuse_handler, '_langfuse_client'):
                    langfuse_handler._langfuse_client.flush()
            except Exception:
                pass"""

content = content.replace("langfuse_handler.flush()", flush_replacement)

with open("rag.py", "w", encoding="utf-8") as f:
    f.write(content)
print("Updated rag.py")

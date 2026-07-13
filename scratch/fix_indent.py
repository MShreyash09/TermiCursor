import re
with open("rag.py", "r", encoding="utf-8") as f:
    content = f.read()

bad_block = """try:
                if hasattr(langfuse_handler, 'flush'):
                    langfuse_handler.flush()
                elif hasattr(langfuse_handler, '_langfuse_client'):
                    langfuse_handler._langfuse_client.flush()
            except Exception:
                pass"""

good_block = """try:
    if hasattr(langfuse_handler, 'flush'):
        langfuse_handler.flush()
    elif hasattr(langfuse_handler, '_langfuse_client'):
        langfuse_handler._langfuse_client.flush()
except Exception:
    pass"""

# Let's fix each occurrence by aligning it to the 'try:' indentation level.
lines = content.split('\n')
for i, line in enumerate(lines):
    if "try:" in line and "if hasattr(langfuse_handler, 'flush'):" in lines[i+1]:
        indent = len(line) - len(line.lstrip())
        lines[i+1] = ' ' * (indent + 4) + "if hasattr(langfuse_handler, 'flush'):"
        lines[i+2] = ' ' * (indent + 8) + "langfuse_handler.flush()"
        lines[i+3] = ' ' * (indent + 4) + "elif hasattr(langfuse_handler, '_langfuse_client'):"
        lines[i+4] = ' ' * (indent + 8) + "langfuse_handler._langfuse_client.flush()"
        lines[i+5] = ' ' * indent + "except Exception:"
        lines[i+6] = ' ' * (indent + 4) + "pass"

with open("rag.py", "w", encoding="utf-8") as f:
    f.write('\n'.join(lines))
print("Fixed indentations")

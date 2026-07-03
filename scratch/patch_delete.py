import re

rag_file = "rag.py"

with open(rag_file, "r", encoding="utf-8") as f:
    content = f.read()

# Replace the DELETE_FILE instruction in all prompt templates
old_instruction = """
    If the user explicitly asks you to delete or remove a file, you MUST structure your response to delete the file by enclosing the file deletion command in this exact tag:
    [DELETE_FILE: <filename>]
"""
new_instruction = """
    If the user explicitly asks you to delete or remove one or more files, you MUST structure your response to delete the files by enclosing each file deletion command in this exact tag:
    [DELETE_FILE: <filename>]
    You can output multiple [DELETE_FILE: <filename>] tags to delete multiple files. You should delete files exactly as requested by the user, even if they do not appear in the retrieved context.
"""
content = content.replace(old_instruction.strip(), new_instruction.strip())

# Note: The async_stream_query has a slightly different indentation, so let's handle it separately if needed
old_instruction_async = """
If the user explicitly asks you to delete or remove a file, you MUST structure your response to delete the file by enclosing the file deletion command in this exact tag:
[DELETE_FILE: <filename>]
"""
new_instruction_async = """
If the user explicitly asks you to delete or remove one or more files, you MUST structure your response to delete the files by enclosing each file deletion command in this exact tag:
[DELETE_FILE: <filename>]
You can output multiple [DELETE_FILE: <filename>] tags to delete multiple files. You should delete files exactly as requested by the user, even if they do not appear in the retrieved context.
"""
content = content.replace(old_instruction_async.strip(), new_instruction_async.strip())


# Also update the Example section to show multiple deletions
old_example = """
    If the user asks: "Delete hello.py"
    Your response should look like:
    I will delete that file for you.
    [DELETE_FILE: hello.py]
"""
new_example = """
    If the user asks: "Delete hello.py and main.py"
    Your response should look like:
    I will delete those files for you.
    [DELETE_FILE: hello.py]
    [DELETE_FILE: main.py]
"""
content = content.replace(old_example.strip(), new_example.strip())

with open(rag_file, "w", encoding="utf-8") as f:
    f.write(content)
print("Patch applied for multiple file deletions.")

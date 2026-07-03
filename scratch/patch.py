import re
import os

rag_file = "rag.py"

with open(rag_file, "r", encoding="utf-8") as f:
    content = f.read()

# 1. k=3 to k=10
content = content.replace('search_kwargs={"k": 3}', 'search_kwargs={"k": 10}')

# 2. File Name Prepend
old_chunk_loop = """
        if generic_docs:
            generic_splitter = RecursiveCharacterTextSplitter(
                chunk_size=500,
                chunk_overlap=50,
            )
            print(f"  - Splitting {len(generic_docs)} files using generic character splitter")
            texts.extend(generic_splitter.split_documents(generic_docs))

        print(f"Split into {len(texts)} chunks total.")
"""
new_chunk_loop = """
        if generic_docs:
            generic_splitter = RecursiveCharacterTextSplitter(
                chunk_size=500,
                chunk_overlap=50,
            )
            print(f"  - Splitting {len(generic_docs)} files using generic character splitter")
            texts.extend(generic_splitter.split_documents(generic_docs))

        for chunk in texts:
            source = chunk.metadata.get("source", "unknown")
            filename = os.path.basename(source)
            chunk.page_content = f"File Name: {filename}\\n\\n{chunk.page_content}"

        print(f"Split into {len(texts)} chunks total.")
"""
if "File Name:" not in content:
    content = content.replace(old_chunk_loop.strip(), new_chunk_loop.strip())

# 3. check_and_delete_file function
delete_func = """
def check_and_delete_file(response_text, project_path):
    file_pattern = r"\\[DELETE_FILE:\\s*([a-zA-Z0-9_\\-\\.\\/\\\\]+)\\]"
    matches = re.findall(file_pattern, response_text)
    deleted_files = []
    
    if not project_path:
        print("\\n❌ [System] No project path set — cannot delete files.")
        return deleted_files
    
    norm_project = os.path.normpath(os.path.abspath(project_path))
    
    for filename in matches:
        filename = filename.strip()
        abs_path = os.path.normpath(os.path.join(norm_project, filename))
        
        if not abs_path.startswith(norm_project):
            print(f"\\n❌ [System] Refused to delete '{filename}': path escapes project directory.")
            continue
            
        try:
            if os.path.exists(abs_path):
                if os.path.isfile(abs_path):
                    os.remove(abs_path)
                    print(f"\\n🗑️ [System] File '{filename}' deleted at: {abs_path}")
                    deleted_files.append(filename)
                else:
                    print(f"\\n❌ [System] '{filename}' is a directory, not a file.")
            else:
                print(f"\\n❌ [System] File '{filename}' not found for deletion.")
        except Exception as e:
            print(f"\\n❌ [System] Failed to delete file '{filename}': {e}")
            
    return deleted_files
"""
if "def check_and_delete_file" not in content:
    content = content.replace("    return created_files\n\n\ndef ingest_codebase", f"    return created_files\n\n{delete_func}\n\ndef ingest_codebase")

# 4. Prompt updates
old_prompt_1 = """
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
"""
new_prompt_1 = """
    If the user explicitly asks you to create, write, or generate a file (e.g. "create a python file named app.py and write code"), you MUST structure your response to write the file by enclosing the file creation command and content in these exact tags:
    [CREATE_FILE: <filename>]
    <file_contents>
    [/CREATE_FILE]

    If the user explicitly asks you to delete or remove a file, you MUST structure your response to delete the file by enclosing the file deletion command in this exact tag:
    [DELETE_FILE: <filename>]
    
    Example:
    If the user asks: "Create a python file named hello.py that prints hello world"
    Your response should look like:
    I will create that file for you.
    [CREATE_FILE: hello.py]
    print("Hello, World!")
    [/CREATE_FILE]

    If the user asks: "Delete hello.py"
    Your response should look like:
    I will delete that file for you.
    [DELETE_FILE: hello.py]
"""
content = content.replace(old_prompt_1.strip(), new_prompt_1.strip())

old_prompt_2 = """
If the user explicitly asks you to create, write, or generate a file (e.g. "create a python file named app.py and write code"), you MUST structure your response to write the file by enclosing the file creation command and content in these exact tags:
[CREATE_FILE: <filename>]
<file_contents>
[/CREATE_FILE]
"""
new_prompt_2 = """
If the user explicitly asks you to create, write, or generate a file (e.g. "create a python file named app.py and write code"), you MUST structure your response to write the file by enclosing the file creation command and content in these exact tags:
[CREATE_FILE: <filename>]
<file_contents>
[/CREATE_FILE]

If the user explicitly asks you to delete or remove a file, you MUST structure your response to delete the file by enclosing the file deletion command in this exact tag:
[DELETE_FILE: <filename>]
"""
if "[DELETE_FILE: <filename>]" not in content.split("Relevant Memory from Past Conversations")[1]:
    content = content.replace(old_prompt_2.strip(), new_prompt_2.strip())

# 5. Call check_and_delete_file in chat_with_cursor
content = content.replace(
    "check_and_create_file(result_text, project_path)\n\n            \n        except",
    "check_and_create_file(result_text, project_path)\n            check_and_delete_file(result_text, project_path)\n\n        except"
)

# 6. Call check_and_delete_file in single_shot_query
content = content.replace(
    "created_files = check_and_create_file(result_text, project_path)\n        return {\"answer\": result_text, \"files_created\": created_files}",
    "created_files = check_and_create_file(result_text, project_path)\n        deleted_files = check_and_delete_file(result_text, project_path)\n        return {\"answer\": result_text, \"files_created\": created_files, \"files_deleted\": deleted_files}"
)

# 7. Call check_and_delete_file in async_stream_query
old_async_return = """
        created_files = check_and_create_file(full_response, project_path)
        if created_files:
            yield _json.dumps({
                "type": "files_created",
                "files": created_files,
                "project_path": project_path
            })
"""
new_async_return = """
        created_files = check_and_create_file(full_response, project_path)
        deleted_files = check_and_delete_file(full_response, project_path)
        if created_files or deleted_files:
            yield _json.dumps({
                "type": "files_created",
                "files": created_files,
                "files_deleted": deleted_files,
                "project_path": project_path
            })
"""
content = content.replace(old_async_return.strip(), new_async_return.strip())


with open(rag_file, "w", encoding="utf-8") as f:
    f.write(content)
print("Patch applied successfully.")

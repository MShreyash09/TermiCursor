import os

rag_file = "rag.py"
with open(rag_file, "r", encoding="utf-8") as f:
    content = f.read()

old_appdata = """
# AppData location for packaged apps
APP_DATA_DIR = appdirs.user_data_dir("Termicursor", "Termicursor")
os.makedirs(APP_DATA_DIR, exist_ok=True)
"""
new_appdata = """
# AppData location for packaged apps
APP_DATA_DIR = os.getenv("TERMICURSOR_USER_DATA")
if not APP_DATA_DIR:
    APP_DATA_DIR = appdirs.user_data_dir("Termicursor", "Termicursor")
os.makedirs(APP_DATA_DIR, exist_ok=True)
"""
content = content.replace(old_appdata.strip(), new_appdata.strip())

with open(rag_file, "w", encoding="utf-8") as f:
    f.write(content)
print("rag.py updated to prefer TERMICURSOR_USER_DATA env var")

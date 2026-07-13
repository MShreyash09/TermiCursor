import os
import sys

sys.path.append(r"c:\Users\shrey\OneDrive\Desktop\termicursor\Cursor")
from rag import check_and_delete_file

# Setup a dummy file
project_path = r"c:\Users\shrey\OneDrive\Desktop\termicursor\Cursor\scratch"
dummy_file = os.path.join(project_path, "dummy.txt")

with open(dummy_file, "w") as f:
    f.write("test")

# Test 1: Hallucination without intent
print("--- Test 1: Hallucination without intent ---")
response_text = "Here is the list of files.\n[DELETE_FILE: dummy.txt]"
user_query = "List the files present in the opened folder"
deleted = check_and_delete_file(response_text, project_path, user_query)
print("Deleted files:", deleted)
print("File exists:", os.path.exists(dummy_file))
print()

# Test 2: Intentional deletion
print("--- Test 2: Intentional deletion ---")
response_text = "I will delete that file.\n[DELETE_FILE: dummy.txt]"
user_query = "Delete dummy.txt"
deleted = check_and_delete_file(response_text, project_path, user_query)
print("Deleted files:", deleted)
print("File exists:", os.path.exists(dummy_file))

import sys
import os
import rag

# Ensure stdout/stderr supports UTF-8 on Windows
if sys.platform.startswith('win'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except AttributeError:
        pass

def print_usage():
    print("[TermiCursor] Offline AI Codebase Assistant")
    print("================================================")
    print("Usage:")
    print("  python main.py ingest <project_path>                 Ingest codebase and build Qdrant vector index")
    print("  python main.py chat <project_path>                   Launch interactive RAG chat session")
    print("  python main.py query <project_path> \"<question>\"    Execute a single-shot search and question")
    print("================================================")

def main():
    if len(sys.argv) < 3:
        print_usage()
        sys.exit(1)

    command = sys.argv[1].lower()
    project_path = sys.argv[2]

    # Standardize commands (allow with or without '--' prefix for flexibility)
    command = command.lstrip("-")

    if command == "ingest":
        rag.ingest_codebase(project_path)
    elif command == "chat":
        rag.chat_with_cursor(project_path)
    elif command == "query":
        if len(sys.argv) < 4:
            print("[Error] Query text is required for 'query' command.")
            print("Usage: python main.py query <project_path> \"<question>\"")
            sys.exit(1)
        query_text = sys.argv[3]
        rag.single_shot_query(project_path, query_text)
    else:
        print(f"[Error] Unknown command '{command}'.")
        print_usage()
        sys.exit(1)

if __name__ == "__main__":
    main()
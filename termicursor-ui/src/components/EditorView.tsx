import Editor, { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";

// Configure Monaco to load from node_modules instead of CDN (fixes Electron file:// protocol issue)
loader.config({ monaco });

interface EditorViewProps {
  content: string;
  language: string;
  fileName?: string;
}

export default function EditorView({ content, language, fileName = "main.py" }: EditorViewProps) {
  return (
    <div className="flex-1 h-full pt-10 bg-[#0a0a0a] overflow-hidden relative">
      {/* Tab bar */}
      <div className="h-9 bg-[#121212]/50 border-b border-[#2a2a2a] flex items-center px-2">
        <div className="px-4 py-1.5 bg-[#0a0a0a] border-t-2 border-cyan-500/60 text-xs text-gray-300 rounded-t-md border-x border-[#2a2a2a]">
          {fileName}
        </div>
      </div>
      
      <Editor
        height="calc(100vh - 76px)"
        theme="vs-dark"
        language={language}
        value={content}
        options={{
          minimap: { enabled: true },
          fontSize: 14,
          fontFamily: "'Fira Code', 'Cascadia Code', monospace",
          fontLigatures: true,
          smoothScrolling: true,
          cursorBlinking: "smooth",
          cursorSmoothCaretAnimation: "on",
          padding: { top: 16 },
          readOnly: true,
          renderLineHighlight: "all",
          scrollBeyondLastLine: false,
        }}
      />
    </div>
  );
}

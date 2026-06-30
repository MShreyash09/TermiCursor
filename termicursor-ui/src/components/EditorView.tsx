import Editor, { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import { X } from "lucide-react";

// Configure Monaco to load from node_modules instead of CDN (fixes Electron file:// protocol issue)
loader.config({ monaco });

export interface OpenFile {
  path: string;
  name: string;
  content: string;
}

interface EditorViewProps {
  openFiles: OpenFile[];
  activeFilePath: string | null;
  onSelectFile: (path: string) => void;
  onCloseFile: (path: string) => void;
  dummyCode?: string;
}

export default function EditorView({ openFiles, activeFilePath, onSelectFile, onCloseFile, dummyCode = "" }: EditorViewProps) {
  const activeFile = openFiles.find(f => f.path === activeFilePath);
  const content = activeFile ? activeFile.content : dummyCode;
  const fileName = activeFile ? activeFile.name : "";

  const language = fileName.endsWith('.tsx') || fileName.endsWith('.ts') ? 'typescript' 
    : fileName.endsWith('.js') || fileName.endsWith('.jsx') ? 'javascript' 
    : fileName.endsWith('.py') ? 'python' 
    : fileName.endsWith('.json') ? 'json' 
    : fileName.endsWith('.html') ? 'html' 
    : 'plaintext';

  return (
    <div className="flex-1 h-full pt-10 bg-[#0a0a0a] overflow-hidden relative">
      {/* Tab bar */}
      <div className="h-9 bg-[#121212]/50 border-b border-[#2a2a2a] flex items-center overflow-x-auto no-scrollbar">
        {openFiles.map((file) => (
          <div
            key={file.path}
            onClick={() => onSelectFile(file.path)}
            className={`flex items-center group h-full px-4 border-r border-[#2a2a2a] cursor-pointer min-w-max transition-colors
              ${activeFilePath === file.path 
                ? 'bg-[#0a0a0a] border-t-2 border-t-cyan-500/60 text-gray-200' 
                : 'bg-transparent border-t-2 border-t-transparent text-gray-500 hover:bg-[#1a1a1a] hover:text-gray-300'
              }`}
          >
            <span className="text-xs mr-2 select-none">{file.name}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCloseFile(file.path);
              }}
              className={`p-0.5 rounded-md flex items-center justify-center transition-colors
                ${activeFilePath === file.path 
                  ? 'text-gray-400 hover:text-gray-200 hover:bg-[#2a2a2a]' 
                  : 'text-gray-600 group-hover:text-gray-400 hover:bg-[#2a2a2a] hover:text-gray-200 opacity-0 group-hover:opacity-100'
                }`}
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
      
      {activeFile && (
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
      )}
    </div>
  );
}

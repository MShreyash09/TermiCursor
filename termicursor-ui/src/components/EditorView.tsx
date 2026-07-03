import { useState, useEffect } from "react";
import Editor, { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import { X, Trash2 } from "lucide-react";

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
  onDeleteFile?: (path: string) => void;
  dummyCode?: string;
}

export default function EditorView({ openFiles, activeFilePath, onSelectFile, onCloseFile, onDeleteFile, dummyCode = "" }: EditorViewProps) {
  const activeFile = openFiles.find(f => f.path === activeFilePath);
  const content = activeFile ? activeFile.content : dummyCode;
  const fileName = activeFile ? activeFile.name : "";

  // ── Delete confirmation state ──
  const [deleteTarget, setDeleteTarget] = useState<{ path: string; name: string } | null>(null);
  const [dontAskAgain, setDontAskAgain] = useState(false);
  const [skipConfirmation, setSkipConfirmation] = useState(false);

  // Load "don't ask again" preference from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem("termicursor_skip_delete_confirm");
    if (stored === "true") {
      setSkipConfirmation(true);
    }
  }, []);

  const handleDeleteClick = (e: React.MouseEvent, file: OpenFile) => {
    e.stopPropagation();
    if (skipConfirmation) {
      // Skip the modal — delete immediately
      onDeleteFile?.(file.path);
    } else {
      setDeleteTarget({ path: file.path, name: file.name });
      setDontAskAgain(false);
    }
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    if (dontAskAgain) {
      setSkipConfirmation(true);
      localStorage.setItem("termicursor_skip_delete_confirm", "true");
    }
    onDeleteFile?.(deleteTarget.path);
    setDeleteTarget(null);
  };

  const cancelDelete = () => {
    setDeleteTarget(null);
    setDontAskAgain(false);
  };

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
            <div className="flex items-center gap-0.5">
              {/* Delete (physical) button */}
              {onDeleteFile && (
                <button
                  onClick={(e) => handleDeleteClick(e, file)}
                  title="Delete file from disk"
                  className={`p-0.5 rounded-md flex items-center justify-center transition-colors
                    text-gray-600 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100`}
                >
                  <Trash2 size={13} />
                </button>
              )}
              {/* Close tab button */}
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

      {/* ── Delete Confirmation Modal ── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#1a1a1a] border border-[#333] rounded-xl shadow-2xl w-[420px] p-6 animate-in">
            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center">
                <Trash2 size={20} className="text-red-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-100">Delete File</h3>
                <p className="text-xs text-gray-500">This action cannot be undone</p>
              </div>
            </div>

            {/* Body */}
            <p className="text-sm text-gray-300 mb-1">
              Are you sure you want to permanently delete
            </p>
            <p className="text-sm font-mono text-red-300 bg-red-500/5 border border-red-500/10 rounded-md px-3 py-2 mb-5 break-all">
              {deleteTarget.name}
            </p>

            {/* Don't ask again checkbox */}
            <label className="flex items-center gap-2.5 mb-6 cursor-pointer select-none group">
              <div className="relative">
                <input
                  type="checkbox"
                  checked={dontAskAgain}
                  onChange={(e) => setDontAskAgain(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-4 h-4 rounded border border-[#444] bg-[#0a0a0a] peer-checked:bg-cyan-600 peer-checked:border-cyan-600 transition-colors flex items-center justify-center">
                  {dontAskAgain && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </div>
              </div>
              <span className="text-xs text-gray-400 group-hover:text-gray-300 transition-colors">
                Don't ask me again
              </span>
            </label>

            {/* Action buttons */}
            <div className="flex justify-end gap-3">
              <button
                onClick={cancelDelete}
                className="px-4 py-2 text-xs font-medium text-gray-300 bg-[#252525] hover:bg-[#303030] border border-[#3a3a3a] rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 text-xs font-medium text-white bg-red-600 hover:bg-red-500 rounded-lg transition-colors shadow-lg shadow-red-600/20"
              >
                Delete File
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

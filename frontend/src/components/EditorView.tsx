import { useState, useEffect, useRef } from "react";
import Editor, { loader, type Monaco } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import { X, Trash2 } from "lucide-react";
import { FileIcon } from "./ui";

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
  projectPath?: string;
}

// Terminal palette for code: purple keywords, soft green strings, orange numbers, dim comments.
function defineTheme(m: Monaco) {
  m.editor.defineTheme("termicursor", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: "6b6b6b", fontStyle: "italic" },
      { token: "keyword", foreground: "b877ff" },
      { token: "string", foreground: "a5e075" },
      { token: "number", foreground: "ffb000" },
      { token: "type", foreground: "ffc94d" },
      { token: "type.identifier", foreground: "ffc94d" },
      { token: "delimiter", foreground: "a3a3a3" },
      { token: "tag", foreground: "6aa8ff" },
      { token: "attribute.name", foreground: "ffb000" },
      { token: "regexp", foreground: "ff7373" },
    ],
    colors: {
      "editor.background": "#000000",
      "editor.foreground": "#e6e6e6",
      "editorLineNumber.foreground": "#3a3a3a",
      "editorLineNumber.activeForeground": "#e6e6e6",
      "editor.lineHighlightBackground": "#0d0d0d",
      "editor.lineHighlightBorder": "#00000000",
      "editor.selectionBackground": "#39ff1430",
      "editor.inactiveSelectionBackground": "#39ff1418",
      "editorCursor.foreground": "#39ff14",
      "editorIndentGuide.background1": "#161616",
      "editorIndentGuide.activeBackground1": "#2e2e2e",
      "editorWhitespace.foreground": "#1f1f1f",
      "editorGutter.background": "#000000",
      "minimap.background": "#000000",
      "scrollbarSlider.background": "#26262688",
      "scrollbarSlider.hoverBackground": "#3a3a3a88",
      "editorWidget.background": "#0a0a0a",
      "editorWidget.border": "#2e2e2e",
      "editorSuggestWidget.background": "#0a0a0a",
      "editorSuggestWidget.selectedBackground": "#171717",
    },
  });
}

const LANGUAGES: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  py: 'python', json: 'json', html: 'html', css: 'css', scss: 'scss', md: 'markdown', yml: 'yaml', yaml: 'yaml',
  sh: 'shell', ps1: 'powershell', go: 'go', rs: 'rust', java: 'java', c: 'c', cpp: 'cpp', sql: 'sql', xml: 'xml',
};

interface EditorPrefs {
  fontSize: number; fontFamily: string; minimap: boolean; wordWrap: boolean;
  lineNumbers: boolean; tabSize: number; bracketPairs: boolean; autoSave: boolean;
}

const DEFAULT_PREFS: EditorPrefs = {
  fontSize: 14, fontFamily: "'Cascadia Mono', 'Cascadia Code', 'JetBrains Mono', Consolas, monospace",
  minimap: true, wordWrap: false, lineNumbers: true, tabSize: 4, bracketPairs: true, autoSave: false,
};

function prefsFrom(s: any, prev: EditorPrefs): EditorPrefs {
  if (!s) return prev;
  return {
    fontSize: s.fontSize ? parseInt(s.fontSize) : prev.fontSize,
    fontFamily: s.fontFamily ? `'${s.fontFamily}', ${DEFAULT_PREFS.fontFamily}` : prev.fontFamily,
    minimap: s.minimap ?? prev.minimap,
    wordWrap: s.wordWrap ?? prev.wordWrap,
    lineNumbers: s.lineNumbers ?? prev.lineNumbers,
    tabSize: s.tabSize ? parseInt(s.tabSize) : prev.tabSize,
    bracketPairs: s.bracketPairs ?? prev.bracketPairs,
    autoSave: s.autoSave ?? prev.autoSave,
  };
}

export default function EditorView({ openFiles, activeFilePath, onSelectFile, onCloseFile, onDeleteFile, projectPath = "" }: EditorViewProps) {
  const activeFile = openFiles.find(f => f.path === activeFilePath);
  const fileName = activeFile ? activeFile.name : "";

  const [deleteTarget, setDeleteTarget] = useState<{ path: string; name: string } | null>(null);
  const [dontAskAgain, setDontAskAgain] = useState(false);
  const [skipConfirmation, setSkipConfirmation] = useState(false);
  const [prefs, setPrefs] = useState<EditorPrefs>(DEFAULT_PREFS);
  const saveTimer = useRef<number | undefined>(undefined);

  // Settings → Auto save: write the file a moment after typing stops.
  const handleChange = (value: string | undefined) => {
    if (!prefs.autoSave || value === undefined || !activeFilePath) return;
    const path = activeFilePath;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => (window as any).electronAPI?.writeFile?.(path, value), 800);
  };

  useEffect(() => {
    try { if (localStorage.getItem("termicursor_skip_delete_confirm") === "true") setSkipConfirmation(true); } catch { /* ignore */ }
    const api = (window as any).electronAPI;
    api?.loadSettings?.().then((s: any) => setPrefs((p) => prefsFrom(s, p)));
    return api?.onSettingsChanged?.((s: any) => setPrefs((p) => prefsFrom(s, p)));
  }, []);

  const handleDeleteClick = (e: React.MouseEvent, file: OpenFile) => {
    e.stopPropagation();
    if (skipConfirmation) onDeleteFile?.(file.path);
    else { setDeleteTarget({ path: file.path, name: file.name }); setDontAskAgain(false); }
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    if (dontAskAgain) {
      setSkipConfirmation(true);
      try { localStorage.setItem("termicursor_skip_delete_confirm", "true"); } catch { /* ignore */ }
    }
    onDeleteFile?.(deleteTarget.path);
    setDeleteTarget(null);
  };

  const language = LANGUAGES[fileName.split('.').pop()?.toLowerCase() ?? ''] ?? 'plaintext';

  // Breadcrumb relative to the project: src › components › App.tsx
  const rel = activeFile
    ? activeFile.path.replace(/\\/g, '/').replace(projectPath.replace(/\\/g, '/').replace(/\/?$/, '/'), '')
    : '';

  const handleEditorDidMount = (editor: any, m: Monaco) => {
    editor.addCommand(m.KeyMod.CtrlCmd | m.KeyCode.KeyS, async () => {
      const api = (window as any).electronAPI;
      if (api?.writeFile && activeFilePath) await api.writeFile(activeFilePath, editor.getValue());
    });
  };

  return (
    <div className="flex-1 h-full bg-background overflow-hidden flex flex-col relative">
      {/* Tab bar */}
      <div className="h-9 shrink-0 bg-surface border-b border-border flex items-stretch overflow-x-auto no-scrollbar">
        {openFiles.map((file) => {
          const active = activeFilePath === file.path;
          return (
            <div key={file.path} onClick={() => onSelectFile(file.path)} title={file.path}
              className={`group relative flex items-center gap-2 pl-3 pr-2 border-r border-border cursor-pointer min-w-max transition-colors ${
                active ? 'bg-background text-fg' : 'text-dim hover:text-muted hover:bg-surface-hover'}`}>
              {active && <span className="absolute left-0 right-0 top-0 h-[2px] bg-primary" />}
              <FileIcon name={file.name} size={13} />
              <span className="text-[12.5px] select-none">{file.name}</span>
              <div className="flex items-center">
                {onDeleteFile && (
                  <button onClick={(e) => handleDeleteClick(e, file)} title="Delete file from disk"
                    className="p-0.5 rounded text-dim hover:text-danger hover:bg-danger/10 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Trash2 size={12} />
                  </button>
                )}
                <button onClick={(e) => { e.stopPropagation(); onCloseFile(file.path); }} title="Close"
                  className={`p-0.5 rounded hover:bg-surface-hover hover:text-fg ${active ? 'text-muted' : 'text-dim opacity-0 group-hover:opacity-100'}`}>
                  <X size={13} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {activeFile && (
        <div className="h-6 shrink-0 px-3 bg-background flex items-center gap-1 text-[11.5px] text-dim font-mono select-none overflow-hidden whitespace-nowrap">
          {rel.split('/').map((part, i, all) => (
            <span key={i} className={i === all.length - 1 ? 'text-muted' : ''}>
              {part}{i < all.length - 1 && <span className="mx-1 text-border-strong">›</span>}
            </span>
          ))}
        </div>
      )}

      {activeFile && (
        <div className="flex-1 overflow-hidden relative">
          <Editor
            height="100%"
            theme="termicursor"
            beforeMount={defineTheme}
            language={language}
            path={activeFile.path}
            value={activeFile.content}
            onMount={handleEditorDidMount}
            onChange={handleChange}
            options={{
              minimap: { enabled: prefs.minimap, renderCharacters: false, scale: 1 },
              fontSize: prefs.fontSize,
              fontFamily: prefs.fontFamily,
              fontLigatures: true,
              lineHeight: Math.round(prefs.fontSize * 1.6),
              wordWrap: prefs.wordWrap ? 'on' : 'off',
              lineNumbers: prefs.lineNumbers ? 'on' : 'off',
              tabSize: prefs.tabSize,
              bracketPairColorization: { enabled: prefs.bracketPairs },
              guides: { bracketPairs: false, indentation: true },
              smoothScrolling: true,
              cursorBlinking: "smooth",
              cursorSmoothCaretAnimation: "on",
              padding: { top: 12 },
              renderLineHighlight: "line",
              scrollBeyondLastLine: false,
              overviewRulerBorder: false,
              scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
            }}
          />
        </div>
      )}

      {/* ── Delete confirmation ── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-surface border border-border-strong rounded-xl shadow-2xl w-[420px] p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-lg bg-danger/10 border border-danger/30 flex items-center justify-center">
                <Trash2 size={17} className="text-danger" />
              </div>
              <div>
                <h3 className="text-[14px] font-semibold text-fg">Delete file?</h3>
                <p className="text-[12px] text-dim">This can't be undone.</p>
              </div>
            </div>
            <p className="text-[13px] font-mono text-danger bg-danger/5 border border-danger/20 rounded-md px-3 py-2 mb-4 break-all">
              {deleteTarget.name}
            </p>
            <label className="flex items-center gap-2 mb-5 cursor-pointer select-none text-[12px] text-muted">
              <input type="checkbox" checked={dontAskAgain} onChange={(e) => setDontAskAgain(e.target.checked)}
                className="accent-[#39ff14] w-3.5 h-3.5" />
              Don't ask me again
            </label>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteTarget(null)}
                className="px-3.5 py-1.5 text-[12.5px] text-muted bg-raised hover:bg-surface-hover border border-border-strong rounded-md">
                Cancel
              </button>
              <button onClick={confirmDelete}
                className="px-3.5 py-1.5 text-[12.5px] font-semibold text-black bg-danger hover:brightness-110 rounded-md">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

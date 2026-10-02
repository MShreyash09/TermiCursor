import { useState, useEffect, useRef } from 'react';
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle, type PanelImperativeHandle } from 'react-resizable-panels';
import TitleBar from './components/TitleBar';
import AgentPanel from './components/AgentPanel/AgentPanel';
import EditorView from './components/EditorView';
import FileTree from './components/FileTree';
import ActivityBar from './components/ActivityBar';
import WelcomeScreen from './components/WelcomeScreen';
import ProfilePage from './components/ProfilePage';
import SettingsPage from './components/SettingsPage';
import StatusBar from './components/StatusBar';
import CommandPalette from './components/CommandPalette';
import TerminalPanel from './components/TerminalPanel';
import { Kbd } from './components/ui';
import { backendUrl, setBackendToken } from './backend';

function App() {
  const [projectPath, setProjectPath] = useState('');
  const [isIngesting, setIsIngesting] = useState(false);
  const [openFiles, setOpenFiles] = useState<{ path: string, name: string, content: string }[]>([]);
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const [activeView, setActiveView] = useState('explorer');
  const [fileTreeRefreshKey, setFileTreeRefreshKey] = useState(0);
  const [backendPort, setBackendPort] = useState(0);  // 0 = not known yet
  const [backendStatus, setBackendStatus] = useState<any>(null);
  const [isPullingModels, setIsPullingModels] = useState(false);
  const [pullProgress, setPullProgress] = useState<Record<string, number>>({});
  const [recentFolders, setRecentFolders] = useState<{ path: string, name: string }[]>([]);
  const [updateAvailable, setUpdateAvailable] = useState<string | null>(null);
  const [updateDownloaded, setUpdateDownloaded] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);

  // Refs for collapsible panels
  const fileTreePanelRef = useRef<PanelImperativeHandle>(null);
  const terminalPanelRef = useRef<PanelImperativeHandle>(null);
  const aiChatPanelRef = useRef<PanelImperativeHandle>(null);

  const toggleFileTree = () => {
    const panel = fileTreePanelRef.current;
    if (panel) {
      if (panel.isCollapsed()) {
        panel.expand();
      } else {
        panel.collapse();
      }
    }
  };

  const toggleTerminal = () => {
    const panel = terminalPanelRef.current;
    if (panel) {
      if (panel.isCollapsed()) {
        panel.expand();
      } else {
        panel.collapse();
      }
    }
  };

  const toggleAiChat = () => {
    const panel = aiChatPanelRef.current;
    if (panel) {
      if (panel.isCollapsed()) {
        panel.expand();
      } else {
        panel.collapse();
      }
    }
  };

  // Keyboard shortcut listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      // Ctrl + B -> Toggle File Tree (Sidebar)
      if (e.ctrlKey && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggleFileTree();
      }

      // Ctrl + ` -> Toggle Terminal
      if (e.ctrlKey && e.key === '`') {
        e.preventDefault();
        toggleTerminal();
      }

      // Ctrl + , -> Switch to Settings
      if (e.ctrlKey && e.key === ',') {
        e.preventDefault();
        setActiveView('settings');
      }

      // Ctrl + E -> Switch back to Explorer
      if (e.ctrlKey && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        setActiveView('explorer');
        fileTreePanelRef.current?.expand();
      }

      // Ctrl + L -> Toggle AI Chat
      if (e.ctrlKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        toggleAiChat();
      }

      // Ctrl + / or Ctrl + ? -> Show Shortcuts
      if (e.ctrlKey && (e.key === '/' || e.key === '?')) {
        e.preventDefault();
        setShowShortcuts(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const checkStatus = (port: number = backendPort) => {
    fetch(backendUrl(port, '/status'))
      .then(res => res.json())
      .then(data => setBackendStatus(data))
      .catch(e => console.error("Status check failed", e));
  };

  // The packaged backend takes a few seconds to boot, and first-time users may
  // still be installing/starting Ollama: keep polling until everything is ready.
  useEffect(() => {
    if (!backendPort) return;
    let cancelled = false;
    let timer: number | undefined;
    const poll = async () => {
      const data = await fetch(backendUrl(backendPort, '/status'))
        .then(res => (res.ok ? res.json() : null))
        .catch(() => null);
      if (cancelled) return;
      if (data) setBackendStatus(data);
      // Fast while the backend boots, slower while waiting on Ollama/models, then
      // every 15s to keep provider quota in the status bar fresh.
      timer = window.setTimeout(poll, data?.status === 'ok' ? 15000 : data ? 5000 : 1000);
    };
    poll();
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [backendPort]);

  const handleInstallModels = async () => {
    if (!backendStatus?.missing_models || backendStatus.missing_models.length === 0) return;
    setIsPullingModels(true);
    for (const model of backendStatus.missing_models) {
      setPullProgress(prev => ({ ...prev, [model]: 0 }));

      try {
        const response = await fetch(backendUrl(backendPort, '/pull'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: model })
        });

        if (!response.body) throw new Error("No response body");
        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const data = JSON.parse(line);
              if (data.error) {
                console.error("Pull error:", data.error);
                alert(`Error downloading ${model}: ${data.error}`);
                break;
              }
              if (data.total && data.completed) {
                const percent = Math.round((data.completed / data.total) * 100);
                setPullProgress(prev => ({ ...prev, [model]: percent }));
              }
            } catch (e) {
              // Ignore partial JSON parsing errors
            }
          }
        }

        setPullProgress(prev => ({ ...prev, [model]: 100 }));
      } catch (err) {
        console.error("Failed to pull model:", err);
        alert(`Failed to pull model ${model}. Make sure Ollama is running and has internet access.`);
      }
    }
    setIsPullingModels(false);
    checkStatus();
  };



  useEffect(() => {
    // @ts-ignore
    if (window.electronAPI && window.electronAPI.getBackendPort) {
      const api = (window as any).electronAPI;
      // Token first: setting the port triggers the first requests.
      Promise.all([api.getBackendToken?.() ?? '', api.getBackendPort()]).then(([token, port]: [string, number]) => {
        setBackendToken(token);
        setBackendPort(port);
      });
    } else {
      setBackendPort(8000);
      // @ts-ignore
      window.electronAPI.loadSettings();
    }
    // Load recent folders
    // @ts-ignore
    if (window.electronAPI && window.electronAPI.loadRecentFolders) {
      // @ts-ignore
      window.electronAPI.loadRecentFolders().then((folders: any[]) => {
        if (Array.isArray(folders)) setRecentFolders(folders);
      });
    }

    // Auto-update event listeners
    // @ts-ignore
    if (window.electronAPI && window.electronAPI.onUpdateAvailable) {
      // @ts-ignore
      window.electronAPI.onUpdateAvailable((version: string) => {
        setUpdateAvailable(version);
      });
    }
    // @ts-ignore
    if (window.electronAPI && window.electronAPI.onUpdateDownloaded) {
      // @ts-ignore
      window.electronAPI.onUpdateDownloaded(() => {
        setUpdateDownloaded(true);
      });
    }
  }, []);

  // Open a project folder: show it, remember it, and (if enabled) build the search index.
  // Missing models don't block anything: the status bar and welcome checklist offer the
  // download, and code search falls back to exact text search without an index.
  const openProject = async (folderPath: string) => {
    const api = (window as any).electronAPI;
    setProjectPath(folderPath);
    setOpenFiles([]);
    setActiveFilePath(null);
    setActiveView('explorer');
    api?.saveRecentFolder?.(folderPath).then((updated: any[]) => {
      if (Array.isArray(updated)) setRecentFolders(updated);
    });

    const settings = (await api?.loadSettings?.()) ?? {};
    if (settings.autoIngest === false || backendStatus?.status !== 'ok') return;
    setIsIngesting(true);
    try {
      const response = await fetch(backendUrl(backendPort, '/ingest'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_path: folderPath }),
      });
      if (!response.ok) console.warn('Indexing skipped:', await response.text());
    } catch (error) {
      console.warn('Indexing failed:', error);
    } finally {
      setIsIngesting(false);
    }
  };

  // Files changed on disk (the agent edited them, or a refresh): re-read open tabs. A tab is
  // replaced only if the disk differs from what it was loaded with, so unsaved typing in a
  // file the agent didn't touch is never overwritten.
  useEffect(() => {
    if (!fileTreeRefreshKey) return;
    const api = (window as any).electronAPI;
    openFiles.forEach(async (f) => {
      const disk = await api?.readFile?.(f.path);
      if (typeof disk === 'string' && disk !== f.content) {
        setOpenFiles(prev => prev.map(o => (o.path === f.path ? { ...o, content: disk } : o)));
      }
    });
  }, [fileTreeRefreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleOpenFolder = async () => {
    const folderPath = await (window as any).electronAPI?.openFolder?.();
    if (folderPath) await openProject(folderPath);
  };

  // ── Physical file delete handler ──
  const handleDeleteFile = async (filePath: string) => {
    // @ts-ignore
    if (window.electronAPI && window.electronAPI.deleteFile) {
      // @ts-ignore
      const result = await window.electronAPI.deleteFile(filePath);
      if (result.success) {
        // Close the tab
        setOpenFiles(prev => {
          const newFiles = prev.filter(f => f.path !== filePath);
          if (activeFilePath === filePath) {
            const newActive = newFiles.length > 0 ? newFiles[newFiles.length - 1].path : null;
            setActiveFilePath(newActive);
          }
          return newFiles;
        });
        // Refresh file tree
        setFileTreeRefreshKey(prev => prev + 1);
      } else {
        alert(`Failed to delete file: ${result.error}`);
      }
    }
  };

  // Determine what to render in the center panel
  const renderCenterContent = () => {
    if (activeView === 'profile') return <ProfilePage backendPort={backendPort} />;
    if (activeView === 'settings') return <SettingsPage quota={backendStatus?.quota} />;
    if (!projectPath || openFiles.length === 0) {
      return (
        <WelcomeScreen onOpenFolder={handleOpenFolder} recentFolders={recentFolders} onOpenRecentFolder={openProject}
          backendStatus={backendStatus} onInstallModels={handleInstallModels} isPullingModels={isPullingModels}
          projectPath={projectPath} />
      );
    }
    return (
      <EditorView
        openFiles={openFiles}
        activeFilePath={activeFilePath}
        onSelectFile={setActiveFilePath}
        onCloseFile={(path) => {
          setOpenFiles(prev => {
            const newFiles = prev.filter(f => f.path !== path);
            if (activeFilePath === path) {
              const newActive = newFiles.length > 0 ? newFiles[newFiles.length - 1].path : null;
              setActiveFilePath(newActive);
            }
            return newFiles;
          });
        }}
        onDeleteFile={handleDeleteFile}
        projectPath={projectPath}
      />
    );
  };

  return (
    <div className="w-screen h-screen flex flex-col bg-background text-fg overflow-hidden font-sans">
      <CommandPalette
        onToggleTerminal={toggleTerminal}
        onToggleSidebar={toggleFileTree}
        onOpenSettings={() => setActiveView('settings')}
        onOpenFolder={handleOpenFolder}
        onToggleAgent={toggleAiChat}
        onShowShortcuts={() => setShowShortcuts(true)}
      />
      <TitleBar projectName={projectPath.split(/[\\/]/).filter(Boolean).pop()} />

      {updateAvailable && (
        <div className="h-8 bg-surface border-b border-border text-[12px] text-muted px-4 flex items-center justify-between shrink-0 z-[100]">
          <span className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_6px_#39ff14]" />
            {updateDownloaded
              ? <>Version <span className="text-fg">{updateAvailable}</span> is ready to install.</>
              : <>Downloading version <span className="text-fg">{updateAvailable}</span> in the background…</>}
          </span>
          {updateDownloaded && (
            <button onClick={() => (window as any).electronAPI?.installUpdate?.()}
              className="rounded-md bg-primary px-2.5 py-0.5 text-[11.5px] font-semibold text-black hover:brightness-110">
              Restart &amp; update
            </button>
          )}
        </div>
      )}

      {showShortcuts && (
        <div className="absolute inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setShowShortcuts(false)}>
          <div className="bg-surface border border-border-strong rounded-xl shadow-2xl w-[380px] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <h3 className="font-mono text-[11px] tracking-[0.12em] text-dim">KEYBOARD SHORTCUTS</h3>
              <button onClick={() => setShowShortcuts(false)} className="text-dim hover:text-fg text-[13px]">✕</button>
            </div>
            <div className="p-2">
              {([
                ['Toggle the agent panel', 'Ctrl+L'], ['Toggle the explorer', 'Ctrl+B'], ['Toggle the terminal', 'Ctrl+`'],
                ['Command palette', 'Ctrl+P'], ['Settings', 'Ctrl+,'], ['Explorer view', 'Ctrl+E'], ['Save file', 'Ctrl+S'],
                ['This overview', 'Ctrl+/'],
              ] as [string, string][]).map(([label, keys]) => (
                <div key={keys} className="flex items-center justify-between px-2.5 py-2 rounded-md hover:bg-surface-hover text-[12.5px]">
                  <span className="text-muted">{label}</span><Kbd>{keys}</Kbd>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        <ActivityBar 
          activeView={activeView} 
          onToggleAgent={toggleAiChat}
          onViewChange={(view) => {
            if (view === 'explorer') {
              if (activeView === 'explorer') {
                toggleFileTree();
              } else {
                setActiveView(view);
                fileTreePanelRef.current?.expand();
              }
            } else {
              setActiveView(view);
            }
          }} 
        />
        <PanelGroup orientation="horizontal">
          <Panel
            panelRef={fileTreePanelRef}
            collapsible={true}
            defaultSize={100}
            minSize={120}
            maxSize={200}
            className="flex overflow-hidden"
          >
            <FileTree
              projectPath={projectPath}
              onSelectFile={async (filePath, fileName) => {
                setActiveView('explorer');
                const isAlreadyOpen = openFiles.some(f => f.path === filePath);
                if (isAlreadyOpen) {
                  setActiveFilePath(filePath);
                  return;
                }
                // @ts-ignore
                if (window.electronAPI && window.electronAPI.readFile) {
                  // @ts-ignore
                  const content = await window.electronAPI.readFile(filePath);
                  setOpenFiles(prev => {
                    if (prev.some(f => f.path === filePath)) return prev;
                    return [...prev, { path: filePath, name: fileName, content }];
                  });
                  setActiveFilePath(filePath);
                }
              }}
              onOpenFolder={handleOpenFolder}
              refreshKey={fileTreeRefreshKey}
              activePath={activeView === 'explorer' ? activeFilePath : null}
            />
          </Panel>
          <PanelResizeHandle className="w-px bg-border hover:bg-primary active:bg-primary cursor-col-resize transition-colors" />

          {/*editor resizing*/}
          <Panel defaultSize={55} minSize={30}>
            <PanelGroup orientation="vertical">
              <Panel defaultSize={80} minSize={20}>
                {renderCenterContent()}
              </Panel>
              <PanelResizeHandle className="h-px bg-border hover:bg-primary active:bg-primary cursor-row-resize transition-colors z-50" />

              {/* terminal resizing */}
              <Panel
                panelRef={terminalPanelRef}
                collapsible={true}
                defaultSize={20}
                minSize={10}
              >
                {projectPath && <TerminalPanel projectPath={projectPath} />}
                {!projectPath && (
                  <div className="w-full h-full bg-background flex flex-col">
                    <div className="h-8 shrink-0 bg-surface border-b border-border flex items-center px-3 font-mono text-[11px] tracking-[0.12em] text-dim">TERMINAL</div>
                    <div className="flex-1 flex items-center justify-center font-mono text-[12px] text-dim">
                      <span><span className="text-primary">$</span> open a folder to start a shell here</span>
                    </div>
                  </div>
                )}
              </Panel>
            </PanelGroup>
          </Panel>
          <PanelResizeHandle className="w-px bg-border hover:bg-primary active:bg-primary cursor-col-resize transition-colors" />
          {/* AI chat side bar resizing */}
          <Panel
            panelRef={aiChatPanelRef}
            collapsible={true}
            defaultSize={250}
            minSize={200}
            maxSize={400}
            className="flex overflow-hidden"
          >
            <AgentPanel backendPort={backendPort}
              projectPath={projectPath}
              isIngesting={isIngesting}
              backendStatus={backendStatus}
              onFilesChanged={() => setFileTreeRefreshKey(prev => prev + 1)}
            />
          </Panel>
        </PanelGroup>
      </div>

      <StatusBar
        backendStatus={backendStatus}
        pullProgress={pullProgress}
        isPullingModels={isPullingModels}
        onInstallModels={handleInstallModels}
        onRetryConnection={() => checkStatus()}
        isIngesting={isIngesting}
      />
    </div>
  );
}

export default App;

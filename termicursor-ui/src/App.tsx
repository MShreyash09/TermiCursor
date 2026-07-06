import { useState, useEffect, useRef } from 'react';
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle, type PanelImperativeHandle } from 'react-resizable-panels';
import TitleBar from './components/TitleBar';
import Sidebar from './components/Sidebar';
import EditorView from './components/EditorView';
import FileTree from './components/FileTree';
import ActivityBar from './components/ActivityBar';
import WelcomeScreen from './components/WelcomeScreen';
import ProfilePage from './components/ProfilePage';
import SettingsPage from './components/SettingsPage';
import StatusBar from './components/StatusBar';
import CommandPalette from './components/CommandPalette';
import TerminalPanel from './components/TerminalPanel';

function App() {
  const [projectPath, setProjectPath] = useState('');
  const [isIngesting, setIsIngesting] = useState(false);
  const [openFiles, setOpenFiles] = useState<{ path: string, name: string, content: string }[]>([]);
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const [activeView, setActiveView] = useState('explorer');
  const [fileTreeRefreshKey, setFileTreeRefreshKey] = useState(0);
  const [backendPort, setBackendPort] = useState(8000);
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
    fetch(`http://127.0.0.1:${port}/status`)
      .then(res => res.json())
      .then(data => setBackendStatus(data))
      .catch(e => console.error("Status check failed", e));
  };

  const handleInstallModels = async () => {
    if (!backendStatus?.missing_models || backendStatus.missing_models.length === 0) return;
    setIsPullingModels(true);
    for (const model of backendStatus.missing_models) {
      setPullProgress(prev => ({ ...prev, [model]: 0 }));

      try {
        const response = await fetch(`http://127.0.0.1:${backendPort}/pull`, {
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
      // @ts-ignore
      window.electronAPI.getBackendPort().then((port: number) => {
        setBackendPort(port);
        checkStatus(port);
      });
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

  const dummyCode = `import os
import sys
from langchain_ollama import OllamaEmbeddings

# Welcome to Termicursor Desktop UI!
# This is the Monaco Editor.
# You can interact with your codebase using the chat on the left.

def main():
    print("Termicursor is ready!")

if __name__ == "__main__":
    main()
`;

  const handleOpenFolder = async () => {
    // @ts-ignore
    if (window.electronAPI && window.electronAPI.openFolder) {
      // @ts-ignore
      const folderPath = await window.electronAPI.openFolder();
      if (folderPath) {
        setProjectPath(folderPath);
        setOpenFiles([]);
        setActiveFilePath(null);
        setActiveView('explorer');
        // Save to recent folders
        // @ts-ignore
        if (window.electronAPI && window.electronAPI.saveRecentFolder) {
          // @ts-ignore
          window.electronAPI.saveRecentFolder(folderPath).then((updated: any[]) => {
            if (Array.isArray(updated)) setRecentFolders(updated);
          });
        }
        
        if (backendStatus?.missing_models && backendStatus.missing_models.length > 0) {
          alert(`Missing Ollama models: ${backendStatus.missing_models.join(', ')}. They will be downloaded now. Please wait.`);
          await handleInstallModels();
        }

        setIsIngesting(true);
        try {
          const response = await fetch(`http://127.0.0.1:${backendPort}/ingest`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ project_path: folderPath }),
          });
          if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
            console.error("Ingestion failed:", errorData);
            alert(`Ingestion failed: ${errorData.detail || 'Unknown error'}. Please check that Ollama is running and models are pulled.`);
            setProjectPath('');
          }
        } catch (error) {
          console.error("Failed to auto-ingest folder:", error);
          alert("Failed to connect to the backend server. Make sure 'uvicorn server:app --reload' is running.");
          setProjectPath('');
        } finally {
          setIsIngesting(false);
        }
      }
    }
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

  // ── Open a recent folder by its saved path ──
  const handleOpenRecentFolder = async (folderPath: string) => {
    setProjectPath(folderPath);
    setOpenFiles([]);
    setActiveFilePath(null);
    setActiveView('explorer');
    // Save to recent folders (moves it to top)
    // @ts-ignore
    if (window.electronAPI && window.electronAPI.saveRecentFolder) {
      // @ts-ignore
      window.electronAPI.saveRecentFolder(folderPath).then((updated: any[]) => {
        if (Array.isArray(updated)) setRecentFolders(updated);
      });
    }

    if (backendStatus?.missing_models && backendStatus.missing_models.length > 0) {
      alert(`Missing Ollama models: ${backendStatus.missing_models.join(', ')}. They will be downloaded now. Please wait.`);
      await handleInstallModels();
    }

    setIsIngesting(true);
    try {
      const response = await fetch(`http://127.0.0.1:${backendPort}/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_path: folderPath }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
        console.error("Ingestion failed:", errorData);
        alert(`Ingestion failed: ${errorData.detail || 'Unknown error'}. Please check that Ollama is running and models are pulled.`);
        setProjectPath('');
      }
    } catch (error) {
      console.error("Failed to auto-ingest folder:", error);
      alert("Failed to connect to the backend server. Make sure 'uvicorn server:app --reload' is running.");
      setProjectPath('');
    } finally {
      setIsIngesting(false);
    }
  };

  // Determine what to render in the center panel
  const renderCenterContent = () => {
    if (activeView === 'profile') return <ProfilePage />;
    if (activeView === 'settings') return <SettingsPage />;
    if (!projectPath || openFiles.length === 0) return <WelcomeScreen onOpenFolder={handleOpenFolder} recentFolders={recentFolders} onOpenRecentFolder={handleOpenRecentFolder} />;
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
        dummyCode={dummyCode}
      />
    );
  };

  return (
    <div className="w-screen h-screen flex flex-col bg-background text-gray-200 overflow-hidden font-sans">
      <CommandPalette
        onToggleTerminal={toggleTerminal}
        onToggleSidebar={toggleFileTree}
        onOpenSettings={() => setActiveView('settings')}
      />
      <TitleBar />

      {updateAvailable && (
        <div className="bg-[#162031] border-b border-cyan-800/30 text-gray-300 text-xs px-4 py-2 flex items-center justify-between shrink-0 z-[100] transition-all">
          <div className="flex items-center gap-2">
            <div className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
            </div>
            <span>
              {updateDownloaded
                ? `Update v${updateAvailable} has been downloaded and is ready to install!`
                : `A new update (v${updateAvailable}) is downloading in the background...`}
            </span>
          </div>
          {updateDownloaded && (
            <button
              onClick={() => {
                // @ts-ignore
                if (window.electronAPI && window.electronAPI.installUpdate) {
                  // @ts-ignore
                  window.electronAPI.installUpdate();
                }
              }}
              className="bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 text-white font-medium px-3 py-1 rounded-md transition-colors text-[11px] shadow-sm cursor-pointer"
            >
              Restart & Update
            </button>
          )}
        </div>
      )}

      {showShortcuts && (
        <div className="absolute inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowShortcuts(false)}>
          <div className="bg-[#1e1e1e] border border-[#333] rounded-lg shadow-xl w-[400px] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-[#333] flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-200">Keyboard Shortcuts</h3>
              <button onClick={() => setShowShortcuts(false)} className="text-gray-400 hover:text-white">✕</button>
            </div>
            <div className="p-4 space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Toggle File Tree</span>
                <kbd className="bg-[#333] px-2 py-1 rounded text-xs font-mono">Ctrl + B</kbd>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Toggle Terminal</span>
                <kbd className="bg-[#333] px-2 py-1 rounded text-xs font-mono">Ctrl + `</kbd>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Toggle AI Chat</span>
                <kbd className="bg-[#333] px-2 py-1 rounded text-xs font-mono">Ctrl + L</kbd>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Settings</span>
                <kbd className="bg-[#333] px-2 py-1 rounded text-xs font-mono">Ctrl + ,</kbd>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Explorer View</span>
                <kbd className="bg-[#333] px-2 py-1 rounded text-xs font-mono">Ctrl + E</kbd>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">View Shortcuts</span>
                <kbd className="bg-[#333] px-2 py-1 rounded text-xs font-mono">Ctrl + /</kbd>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        <ActivityBar 
          activeView={activeView} 
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
            />
          </Panel>
          <PanelResizeHandle className="w-1.5 bg-surface hover:bg-primary active:bg-primary cursor-col-resize transition-colors" />

          {/*editor resizing*/}
          <Panel defaultSize={55} minSize={30}>
            <PanelGroup orientation="vertical">
              <Panel defaultSize={80} minSize={20}>
                {renderCenterContent()}
              </Panel>
              <PanelResizeHandle className="h-1.5 bg-surface border-t border-border hover:bg-primary active:bg-primary cursor-row-resize transition-colors z-50" />

              {/* terminal resizing */}
              <Panel
                panelRef={terminalPanelRef}
                collapsible={true}
                defaultSize={20}
                minSize={10}
              >
                {projectPath && <TerminalPanel projectPath={projectPath} />}
                {!projectPath && (
                  <div className="w-full h-full bg-background border-t border-border flex items-center justify-center text-xs text-gray-500">
                    Open a folder to use the terminal
                  </div>
                )}
              </Panel>
            </PanelGroup>
          </Panel>
          <PanelResizeHandle className="w-1.5 bg-surface hover:bg-primary active:bg-primary cursor-col-resize transition-colors" />
          {/* AI chat side bar resizing */}
          <Panel
            panelRef={aiChatPanelRef}
            collapsible={true}
            defaultSize={250}
            minSize={200}
            maxSize={400}
            className="flex overflow-hidden"
          >
            <Sidebar backendPort={backendPort}
              projectPath={projectPath}
              isIngesting={isIngesting}
              backendStatus={backendStatus}
              onFilesCreated={() => {
                setFileTreeRefreshKey(prev => prev + 1);
              }}
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
      />
    </div>
  );
}

export default App;

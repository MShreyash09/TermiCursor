import { useState, useEffect } from 'react';
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels';
import TitleBar from './components/TitleBar';
import Sidebar from './components/Sidebar';
import EditorView from './components/EditorView';
import FileTree from './components/FileTree';
import ActivityBar from './components/ActivityBar';
import WelcomeScreen from './components/WelcomeScreen';
import ProfilePage from './components/ProfilePage';
import SettingsPage from './components/SettingsPage';

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
    <div className="w-screen h-screen flex flex-col bg-[#031c1d] text-gray-200 overflow-hidden font-sans">
      <TitleBar />
      {backendStatus && backendStatus.status === 'error' && (
        <div className="bg-[#1f0d0e]/95 border-b border-red-900/50 text-gray-200 px-6 py-4 flex flex-col md:flex-row justify-between items-center gap-4 transition-all z-50">
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-red-400 flex items-center gap-2">
              ⚠️ {backendStatus.reason === 'connection_error' ? 'Ollama Service Offline' : 'AI Models Missing'}
            </h2>
            <p className="text-xs text-gray-400 mt-1">
              {backendStatus.reason === 'connection_error'
                ? 'Termicursor could not connect to your local Ollama. Please open the Ollama Desktop App.'
                : `To use Termicursor locally, you need the following model(s) installed in Ollama: ${backendStatus.missing_models.join(', ')}`}
            </p>

            {backendStatus.reason === 'missing_models' && (
              <div className="mt-3 space-y-2 w-full max-w-md">
                {backendStatus.missing_models.map((model: string) => (
                  <div key={model} className="text-xs">
                    <div className="flex justify-between text-gray-400 mb-1">
                      <span>{model}</span>
                      <span>{pullProgress[model] ?? 0}%</span>
                    </div>
                    <div className="w-full bg-gray-800 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-[#3794ff] h-1.5 rounded-full transition-all duration-300"
                        style={{ width: `${pullProgress[model] ?? 0}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="shrink-0 flex gap-3">
            <button
              onClick={() => checkStatus()}
              disabled={isPullingModels}
              className="bg-[#1a3a3a] hover:bg-[#235353] text-gray-200 px-4 py-2 rounded text-xs transition-colors border border-[#2b6b69]/40 disabled:opacity-50"
            >
              Retry Connection
            </button>
            {backendStatus.reason === 'missing_models' && (
              <button
                onClick={handleInstallModels}
                disabled={isPullingModels}
                className="bg-[#2b6b69] hover:bg-[#378885] text-white px-4 py-2 rounded text-xs transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {isPullingModels ? (
                  <>
                    <svg className="animate-spin h-3 w-3 text-white" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Downloading...
                  </>
                ) : 'Install Models'}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        <ActivityBar activeView={activeView} onViewChange={setActiveView} />
        <PanelGroup orientation="horizontal">
          <Panel defaultSize={80} minSize={80} maxSize={200} className="flex overflow-hidden">
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
          <PanelResizeHandle className="w-1.5 bg-[#1a3a3a] hover:bg-[#3794ff] active:bg-[#3794ff] cursor-col-resize transition-colors" />

          <Panel defaultSize={40} minSize={15}>
            {renderCenterContent()}
          </Panel>
          <PanelResizeHandle className="w-1.5 bg-[#1a3a3a] hover:bg-[#3794ff] active:bg-[#3794ff] cursor-col-resize transition-colors" />

          <Panel defaultSize={50} minSize={15} maxSize={600} className="flex overflow-hidden">
            <Sidebar backendPort={backendPort}
              projectPath={projectPath}
              isIngesting={isIngesting}
              onFilesCreated={() => {
                setFileTreeRefreshKey(prev => prev + 1);
              }}
            />
          </Panel>
        </PanelGroup>
      </div>
    </div>
  );
}

export default App;

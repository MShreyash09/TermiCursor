import { useState } from 'react';
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
  const [openFiles, setOpenFiles] = useState<{path: string, name: string, content: string}[]>([]);
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const [activeView, setActiveView] = useState('explorer');
  const [fileTreeRefreshKey, setFileTreeRefreshKey] = useState(0);
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
        setIsIngesting(true);
        try {
          await fetch('http://127.0.0.1:8000/ingest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ project_path: folderPath }),
          });
        } catch (error) {
          console.error("Failed to auto-ingest folder:", error);
        } finally {
          setIsIngesting(false);
        }
      }
    }
  };

  // Determine what to render in the center panel
  const renderCenterContent = () => {
    if (activeView === 'profile') return <ProfilePage />;
    if (activeView === 'settings') return <SettingsPage />;
    if (!projectPath || openFiles.length === 0) return <WelcomeScreen onOpenFolder={handleOpenFolder} />;
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
        dummyCode={dummyCode}
      />
    );
  };

  return (
    <div className="w-screen h-screen flex flex-col bg-[#031c1d] text-gray-200 overflow-hidden font-sans">
      <TitleBar />
      <div className="flex-1 flex overflow-hidden">
        <ActivityBar activeView={activeView} onViewChange={setActiveView} />
        <PanelGroup orientation="horizontal">
          <Panel defaultSize={150} minSize={100} maxSize={250} className="flex overflow-hidden">
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

          <Panel defaultSize={45} minSize={20}>
            {renderCenterContent()}
          </Panel>
          <PanelResizeHandle className="w-1.5 bg-[#1a3a3a] hover:bg-[#3794ff] active:bg-[#3794ff] cursor-col-resize transition-colors" />

          <Panel defaultSize={700} minSize={200} maxSize={700} className="flex overflow-hidden">
            <Sidebar
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

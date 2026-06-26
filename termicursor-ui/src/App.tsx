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
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
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
        setSelectedFile(null);
        setFileContent(null);
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
    if (!projectPath || !selectedFile) return <WelcomeScreen onOpenFolder={handleOpenFolder} />;
    return (
      <EditorView
        content={fileContent !== null ? fileContent : dummyCode}
        language={selectedFile.endsWith('.tsx') || selectedFile.endsWith('.ts') ? 'typescript' : selectedFile.endsWith('.js') || selectedFile.endsWith('.jsx') ? 'javascript' : selectedFile.endsWith('.py') ? 'python' : selectedFile.endsWith('.json') ? 'json' : selectedFile.endsWith('.html') ? 'html' : 'plaintext'}
        fileName={selectedFile}
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
                setSelectedFile(fileName);
                setActiveView('explorer');
                // @ts-ignore
                if (window.electronAPI && window.electronAPI.readFile) {
                  // @ts-ignore
                  const content = await window.electronAPI.readFile(filePath);
                  setFileContent(content);
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

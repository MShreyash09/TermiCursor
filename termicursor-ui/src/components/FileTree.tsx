import { useState, useEffect } from 'react';
import { ChevronRight, ChevronDown, File, Folder } from 'lucide-react';

interface FileNode {
  name: string;
  isDirectory: boolean;
  path: string;
}

interface FileTreeProps {
  projectPath: string;
  onSelectFile: (path: string, name: string) => void;
  onOpenFolder?: () => void;
  refreshKey?: number;
}

function FolderNode({ node, onSelectFile, depth }: { node: FileNode, onSelectFile: (path: string, name: string) => void, depth: number }) {
  const [isOpen, setIsOpen] = useState(false);
  const [children, setChildren] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(false);

  const toggleOpen = async () => {
    if (!isOpen && children.length === 0) {
      setLoading(true);
      // @ts-ignore
      if (window.electronAPI && window.electronAPI.readDir) {
        try {
          // @ts-ignore
          const entries = await window.electronAPI.readDir(node.path);
          // Sort folders first, then files
          entries.sort((a: FileNode, b: FileNode) => {
            if (a.isDirectory && !b.isDirectory) return -1;
            if (!a.isDirectory && b.isDirectory) return 1;
            return a.name.localeCompare(b.name);
          });
          setChildren(entries);
        } catch (e) {
          console.error("Failed to read dir", e);
        }
      }
      setLoading(false);
    }
    setIsOpen(!isOpen);
  };

  return (
    <div>
      <div 
        className="flex items-center py-1 px-2 hover:bg-white/5 cursor-pointer text-gray-300 hover:text-white transition-colors"
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={toggleOpen}
      >
        <div className="w-4 h-4 flex items-center justify-center mr-1 shrink-0">
          {loading ? (
            <div className="w-2 h-2 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
          ) : isOpen ? (
            <ChevronDown size={14} className="text-gray-400" />
          ) : (
            <ChevronRight size={14} className="text-gray-400" />
          )}
        </div>
        <Folder size={14} className="mr-2 text-blue-400 shrink-0" />
        <span className="text-sm truncate select-none">{node.name}</span>
      </div>
      {isOpen && children.map(child => (
        child.isDirectory ? (
          <FolderNode key={child.path} node={child} onSelectFile={onSelectFile} depth={depth + 1} />
        ) : (
          <FileNodeItem key={child.path} node={child} onSelectFile={onSelectFile} depth={depth + 1} />
        )
      ))}
    </div>
  );
}

function FileNodeItem({ node, onSelectFile, depth }: { node: FileNode, onSelectFile: (path: string, name: string) => void, depth: number }) {
  return (
    <div 
      className="flex items-center py-1 px-2 hover:bg-[#37373d] cursor-pointer text-[#cccccc] hover:text-white transition-colors"
      style={{ paddingLeft: `${depth * 12 + 8 + 20}px` }}
      onClick={() => onSelectFile(node.path, node.name)}
    >
      <File size={14} className="mr-2 text-gray-500 shrink-0" />
      <span className="text-sm truncate select-none">{node.name}</span>
    </div>
  );
}

export default function FileTree({ projectPath, onSelectFile, onOpenFolder, refreshKey }: FileTreeProps) {
  const [entries, setEntries] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function loadRoot() {
      if (!projectPath) {
        setEntries([]);
        return;
      }
      setLoading(true);
      setEntries([]);
      try {
        // @ts-ignore
        if (window.electronAPI && window.electronAPI.readDir) {
          // @ts-ignore
          const res = await window.electronAPI.readDir(projectPath);
          res.sort((a: FileNode, b: FileNode) => {
            if (a.isDirectory && !b.isDirectory) return -1;
            if (!a.isDirectory && b.isDirectory) return 1;
            return a.name.localeCompare(b.name);
          });
          setEntries(res);
        }
      } catch (e) {
        console.error("Failed to load root", e);
      } finally {
        setLoading(false);
      }
    }
    loadRoot();
  }, [projectPath, refreshKey]);

  return (
    <div className="w-full h-full bg-[#1e1e1e] border-r border-[#2a2a2a] flex flex-col pt-10 z-30 shadow-md">
      <div className="px-4 py-2 flex items-center justify-between text-xs font-semibold tracking-widest text-gray-500 uppercase border-b border-[#2a2a2a] shrink-0">
        <span>Explorer</span>
        {projectPath && (
          <button onClick={onOpenFolder} className="hover:text-white transition-colors" title="Open Folder">
            <Folder size={14} />
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto overflow-x-hidden" style={{ scrollbarWidth: 'thin', scrollbarColor: '#424242 transparent' }}>
        {!projectPath ? (
          <div className="flex flex-col text-sm text-gray-300">
            <div className="flex items-center px-2 py-1 bg-[#1a2122] border-b border-t border-[#0d1617] font-semibold text-xs tracking-wider cursor-pointer mt-0">
              <ChevronDown size={14} className="mr-1" />
              NO FOLDER OPENED
            </div>
            <div className="p-4 flex flex-col gap-4 text-xs">
              <div>
                <p className="mb-2">You have not yet opened a folder.</p>
                <button 
                  onClick={onOpenFolder}
                  className="w-full py-1.5 bg-[#1e4b4a] hover:bg-[#255c5a] text-white rounded transition-colors"
                >
                  Open Folder
                </button>
              </div>
              <div>
                <p className="mb-2">You can clone a repository locally.</p>
                <button 
                  className="w-full py-1.5 bg-[#1e4b4a] hover:bg-[#255c5a] text-white rounded transition-colors"
                >
                  Clone Repository
                </button>
              </div>
              <p className="text-gray-400">
                To learn more about how to use Git and source control in the IDE <a href="#" className="text-blue-400 hover:underline">read our docs</a>.
              </p>
              <div>
                <p className="mb-2 text-gray-400">
                  You can also <a href="#" className="text-blue-400 hover:underline">open a Java project folder</a>, or create a new Java project by clicking the button below.
                </p>
                <button 
                  className="w-full py-1.5 bg-[#1e4b4a] hover:bg-[#255c5a] text-white rounded transition-colors"
                >
                  Create Java Project
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="py-2">
            {loading && <div className="text-center text-xs text-gray-500 mt-4">Loading...</div>}
            {!loading && entries.length === 0 && (
              <div className="text-center text-xs text-gray-500 mt-4 px-4">
                No files found in this directory.
              </div>
            )}
            {!loading && entries.map(child => (
              child.isDirectory ? (
                <FolderNode key={child.path} node={child} onSelectFile={onSelectFile} depth={0} />
              ) : (
                <FileNodeItem key={child.path} node={child} onSelectFile={onSelectFile} depth={0} />
              )
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

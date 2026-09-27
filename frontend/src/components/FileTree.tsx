import { useState, useEffect } from 'react';
import { ChevronRight, FolderOpen, RefreshCw } from 'lucide-react';
import { FileIcon, FolderIcon } from './ui';

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
  activePath?: string | null;
}

const byFoldersThenName = (a: FileNode, b: FileNode) =>
  a.isDirectory !== b.isDirectory ? (a.isDirectory ? -1 : 1) : a.name.localeCompare(b.name);

async function readDir(dir: string): Promise<FileNode[]> {
  const api = (window as any).electronAPI;
  if (!api?.readDir) return [];
  const entries: FileNode[] = await api.readDir(dir);
  return entries.sort(byFoldersThenName);
}

const rowClass = (active: boolean) =>
  `relative flex items-center h-[26px] pr-2 cursor-pointer text-[13px] transition-colors ${
    active ? 'bg-primary/[0.07] text-fg' : 'text-muted hover:bg-surface-hover hover:text-fg'
  }`;

interface NodeProps {
  node: FileNode;
  depth: number;
  onSelectFile: (path: string, name: string) => void;
  activePath?: string | null;
  refreshKey?: number;
}

function FolderNode({ node, depth, onSelectFile, activePath, refreshKey }: NodeProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [children, setChildren] = useState<FileNode[] | null>(null);

  // Re-read open folders when the agent changes files.
  useEffect(() => {
    if (isOpen) readDir(node.path).then(setChildren).catch(() => {});
  }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = async () => {
    if (!isOpen && children === null) {
      try { setChildren(await readDir(node.path)); } catch { setChildren([]); }
    }
    setIsOpen(!isOpen);
  };

  return (
    <div>
      <div className={rowClass(false)} style={{ paddingLeft: depth * 12 + 6 }} onClick={toggle}>
        <ChevronRight size={14} className={`mr-0.5 shrink-0 text-dim transition-transform ${isOpen ? 'rotate-90' : ''}`} />
        <FolderIcon open={isOpen} />
        <span className="ml-1.5 truncate select-none">{node.name}</span>
      </div>
      {isOpen && children?.map((child) => child.isDirectory
        ? <FolderNode key={child.path} node={child} depth={depth + 1} onSelectFile={onSelectFile} activePath={activePath} refreshKey={refreshKey} />
        : <FileRow key={child.path} node={child} depth={depth + 1} onSelectFile={onSelectFile} activePath={activePath} />)}
    </div>
  );
}

function FileRow({ node, depth, onSelectFile, activePath }: NodeProps) {
  const active = activePath === node.path;
  return (
    <div className={rowClass(active)} style={{ paddingLeft: depth * 12 + 22 }}
      onClick={() => onSelectFile(node.path, node.name)} title={node.path}>
      {active && <span className="absolute left-0 top-0 bottom-0 w-[2px] bg-primary" />}
      <FileIcon name={node.name} />
      <span className="ml-1.5 truncate select-none">{node.name}</span>
    </div>
  );
}

export default function FileTree({ projectPath, onSelectFile, onOpenFolder, refreshKey, activePath }: FileTreeProps) {
  const [entries, setEntries] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [localRefresh, setLocalRefresh] = useState(0);
  const projectName = projectPath.split(/[\\/]/).filter(Boolean).pop() ?? '';

  useEffect(() => {
    if (!projectPath) { setEntries([]); return; }
    setLoading(true);
    readDir(projectPath)
      .then(setEntries)
      .catch((e) => console.error('Failed to load folder', e))
      .finally(() => setLoading(false));
  }, [projectPath, refreshKey, localRefresh]);

  return (
    <div className="w-full h-full bg-surface border-r border-border flex flex-col" data-testid="file-tree">
      <div className="h-9 px-3 flex items-center justify-between shrink-0">
        <span className="font-mono text-[11px] tracking-[0.12em] text-dim">EXPLORER</span>
        {projectPath && (
          <div className="flex items-center gap-1">
            <button onClick={() => setLocalRefresh((n) => n + 1)} title="Refresh" className="p-1 rounded text-dim hover:text-fg hover:bg-surface-hover">
              <RefreshCw size={13} />
            </button>
            <button onClick={onOpenFolder} title="Open another folder" className="p-1 rounded text-dim hover:text-fg hover:bg-surface-hover">
              <FolderOpen size={13} />
            </button>
          </div>
        )}
      </div>

      {!projectPath ? (
        <div className="px-4 pt-6 text-center">
          <p className="text-[12.5px] text-dim leading-relaxed mb-4">No folder open.<br />Open a project to browse its files.</p>
          <button onClick={onOpenFolder}
            className="w-full py-1.5 rounded-md border border-primary/40 text-primary text-[12.5px] hover:bg-primary/10 transition-colors">
            Open Folder
          </button>
        </div>
      ) : (
        <>
          <div className="px-3 pb-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-fg truncate" title={projectPath}>
            {projectName}
          </div>
          <div className="flex-1 overflow-y-auto overflow-x-hidden pb-2">
            {loading && entries.length === 0 && <div className="px-4 py-2 text-[12px] text-dim">Loading…</div>}
            {!loading && entries.length === 0 && <div className="px-4 py-2 text-[12px] text-dim">This folder is empty.</div>}
            {entries.map((child) => child.isDirectory
              ? <FolderNode key={child.path} node={child} depth={0} onSelectFile={onSelectFile} activePath={activePath} refreshKey={refreshKey} />
              : <FileRow key={child.path} node={child} depth={0} onSelectFile={onSelectFile} activePath={activePath} />)}
          </div>
        </>
      )}
    </div>
  );
}

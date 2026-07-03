import { FolderOpen, Clock, ChevronRight } from 'lucide-react';

interface RecentFolder {
  path: string;
  name: string;
}

interface WelcomeScreenProps {
  onOpenFolder: () => void;
  recentFolders?: RecentFolder[];
  onOpenRecentFolder?: (path: string) => void;
}

export default function WelcomeScreen({ onOpenFolder, recentFolders = [], onOpenRecentFolder }: WelcomeScreenProps) {
  return (
    <div className="flex-1 h-full bg-[#031c1d] flex flex-col items-center pt-24 overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: '#424242 transparent' }}>
      {/* Logo */}
      <div className="mb-4">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2C12 2 15 10 18 16C19 18 20 20 20 20H16.5C16.5 20 15 16 12 11C9 16 7.5 20 7.5 20H4C4 20 5 18 6 16C9 10 12 2 12 2Z" fill="#e2e8f0" />
        </svg>
      </div>

      <h1 className="text-2xl font-semibold text-gray-200 mb-10">Termicursor IDE</h1>

      {/* Action Buttons */}
      <div className="w-full max-w-md flex flex-col gap-3 mb-12 px-4">
        <button
          onClick={onOpenFolder}
          className="w-full py-3 px-4 bg-[#1e4b4a] hover:bg-[#255c5a] text-gray-200 rounded border border-[#2b6b69] flex items-center justify-center gap-2 transition-colors cursor-pointer"
        >
          <FolderOpen size={18} />
          <span>Open Folder</span>
        </button>
      </div>

      {/* Recent Folders List — only shown if there are recent folders */}
      {recentFolders.length > 0 && (
        <div className="w-full max-w-md px-4">
          <h3 className="text-sm font-semibold text-gray-300 mb-4 tracking-wide flex items-center gap-2">
            <Clock size={14} className="text-gray-500" />
            Recent Workspaces
          </h3>
          <div className="flex flex-col gap-2">
            {recentFolders.map((folder, i) => (
              <div
                key={i}
                onClick={() => onOpenRecentFolder?.(folder.path)}
                className="p-3 bg-[#052122] border border-[#0f3435] hover:bg-[#0a2c2d] hover:border-[#1a4a4c] rounded cursor-pointer transition-all group flex items-center justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-gray-200 font-medium group-hover:text-cyan-400 transition-colors truncate">{folder.name}</div>
                  <div className="text-xs text-gray-500 truncate">{folder.path}</div>
                </div>
                <ChevronRight size={16} className="text-gray-600 group-hover:text-cyan-400 transition-colors shrink-0 ml-3" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

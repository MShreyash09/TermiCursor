import { FolderOpen } from 'lucide-react';

interface WelcomeScreenProps {
  onOpenFolder: () => void;
}

export default function WelcomeScreen({ onOpenFolder }: WelcomeScreenProps) {
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

      {/* Workspaces List */}
      <div className="w-full max-w-md px-4">
        <h3 className="text-sm font-semibold text-gray-300 mb-4 tracking-wide">Workspaces</h3>
        <div className="flex flex-col gap-2">
          {['TermiCursor', 'GenAI', 'React'].map((ws, i) => (
            <div key={i} className="p-3 bg-[#052122] border border-[#0f3435] hover:bg-[#0a2c2d] rounded cursor-pointer transition-colors group">
              <div className="text-gray-200 font-medium group-hover:text-blue-400 transition-colors">{ws}</div>
              <div className="text-xs text-gray-500 truncate">C:\Users\shrey\OneDrive\Desktop</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

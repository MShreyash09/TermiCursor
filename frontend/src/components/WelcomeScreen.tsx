import { FolderOpen, Clock, ChevronRight, Terminal, Command, Code2 } from 'lucide-react';
import { useEffect, useState } from 'react';

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
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="relative flex-1 h-full flex flex-col items-center justify-center overflow-y-auto bg-[#050505]" style={{ scrollbarWidth: 'thin', scrollbarColor: '#424242 transparent' }}>

      {/* Background glow effects */}
      <div className="absolute top-[-20%] left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-cyan-900/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-20%] left-[-10%] w-[600px] h-[500px] bg-indigo-900/10 blur-[100px] rounded-full pointer-events-none" />

      <div className={`relative z-10 w-full max-w-4xl px-8 py-12 flex flex-col items-center transition-all duration-1000 transform ${mounted ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'}`}>

        {/* Logo & Title */}
        <div className="flex flex-col items-center mt-5">
          <div className="relative group mb-6">
            <div className="absolute inset-0 bg-cyan-400/20 blur-2xl rounded-full group-hover:bg-cyan-400/40 transition-all duration-700"></div>
            <div className="relative bg-gradient-to-br from-[#1a1a2e] to-[#0f3443] p-5 rounded-2xl border border-white/10 shadow-2xl">
              <Terminal size={48} className="text-cyan-400" />
            </div>
          </div>
          <h1 className="text-5xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-gray-100 via-gray-300 to-gray-500 mb-4 text-center">
            Termicursor IDE
          </h1>
          <p className="text-gray-400 text-lg max-w-lg text-center font-light">
            The next generation agentic IDE.<br />Code at the speed of thought.
          </p>
        </div>

        {/* Primary Actions */}
        <div className="w-full max-w-md flex flex-col gap-4 mb-16">
          <button
            onClick={onOpenFolder}
            className="group relative w-full flex items-center justify-center gap-3 py-4 px-6 bg-gradient-to-r from-[#0b2b2d] to-[#124244] hover:from-[#103d40] hover:to-[#1a5b5e] text-gray-100 font-medium rounded-xl border border-cyan-800/40 hover:border-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.1)] hover:shadow-[0_0_25px_rgba(6,182,212,0.25)] transition-all duration-300 overflow-hidden cursor-pointer"
          >
            <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-[100%] group-hover:animate-[shimmer_1.5s_infinite]" />
            <FolderOpen size={20} className="text-cyan-400 group-hover:scale-110 transition-transform" />
            <span className="text-base tracking-wide font-semibold text-cyan-50">Open Project Folder</span>
          </button>

          <div className="flex gap-4">
            <div className="flex-1 flex items-center justify-center gap-2 py-3 bg-white/[0.02] border border-white/5 rounded-xl text-gray-400 text-sm">
              <Command size={14} className="opacity-70" />
              <span>Ctrl + / for Shortcuts</span>
            </div>
            <div className="flex-1 flex items-center justify-center gap-2 py-3 bg-white/[0.02] border border-white/5 rounded-xl text-gray-400 text-sm">
              <Code2 size={14} className="opacity-70" />
              <span>Ctrl + L for AI Chat</span>
            </div>
          </div>
        </div>

        {/* Recent Folders */}
        {recentFolders.length > 0 && (
          <div className={`w-full max-w-3xl transition-all duration-1000 delay-300 transform ${mounted ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'}`}>
            <div className="flex items-center gap-3 mb-8">
              <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent to-white/10" />
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                <Clock size={14} />
                Recent Workspaces
              </h3>
              <div className="h-[1px] flex-1 bg-gradient-to-l from-transparent to-white/10" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {recentFolders.map((folder, i) => (
                <div
                  key={i}
                  onClick={() => onOpenRecentFolder?.(folder.path)}
                  className="group p-4 bg-white/[0.02] border border-white/5 hover:bg-white/[0.05] hover:border-cyan-500/30 rounded-xl cursor-pointer transition-all duration-300 flex items-center justify-between hover:shadow-[0_0_15px_rgba(6,182,212,0.1)] hover:-translate-y-0.5"
                >
                  <div className="min-w-0 flex-1 pr-4">
                    <div className="text-gray-200 font-medium group-hover:text-cyan-400 transition-colors truncate text-sm mb-1">{folder.name}</div>
                    <div className="text-xs text-gray-500 truncate opacity-70">{folder.path}</div>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-cyan-500/20 transition-colors shrink-0">
                    <ChevronRight size={16} className="text-gray-500 group-hover:text-cyan-400 transition-colors" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes shimmer {
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}

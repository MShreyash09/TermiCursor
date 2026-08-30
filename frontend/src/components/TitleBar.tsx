import { Sparkles, Minus, Square, X } from 'lucide-react';

// Type declaration for the electronAPI exposed by preload.cjs
declare global {
  interface Window {
    electronAPI?: {
      minimize: () => void;
      maximize: () => void;
      close: () => void;
    };
  }
}

export default function TitleBar() {
  return (
    <div className="titlebar-drag h-10 shrink-0 w-full bg-[#121212] border-b border-[#2a2a2a] flex items-center justify-between px-4 z-50">
      {/* App branding */}
      <div className="flex items-center gap-2.5">
        <div className="w-5 h-5 rounded-md bg-gradient-to-br from-cyan-400 to-violet-500 flex items-center justify-center shadow-lg shadow-cyan-500/20">
          <Sparkles size={11} className="text-white" />
        </div>
        <span className="text-xs font-semibold tracking-widest text-gray-400 uppercase">Termicursor</span>
      </div>
      
      {/* Window controls — these are NOT draggable */}
      <div className="no-drag flex items-center">
        <button
          onClick={() => window.electronAPI?.minimize()}
          className="w-11 h-10 flex items-center justify-center text-gray-400 hover:bg-white/10 transition-colors"
          title="Minimize"
        >
          <Minus size={15} />
        </button>
        <button
          onClick={() => window.electronAPI?.maximize()}
          className="w-11 h-10 flex items-center justify-center text-gray-400 hover:bg-white/10 transition-colors"
          title="Maximize"
        >
          <Square size={12} />
        </button>
        <button
          onClick={() => window.electronAPI?.close()}
          className="w-11 h-10 flex items-center justify-center text-gray-400 hover:bg-red-500/80 hover:text-white transition-colors rounded-tr-none"
          title="Close"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

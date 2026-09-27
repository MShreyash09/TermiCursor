import { Minus, Square, X } from 'lucide-react';
import { BrandMark } from './ui';

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

export default function TitleBar({ projectName }: { projectName?: string }) {
  return (
    <div className="titlebar-drag h-9 shrink-0 w-full bg-surface border-b border-border flex items-center justify-between pl-4 z-50">
      <BrandMark className="text-[13px]" caret={false} />

      <div className="absolute left-1/2 -translate-x-1/2 text-[12px] text-dim truncate max-w-[40%] pointer-events-none">
        {projectName ? <><span className="text-muted">{projectName}</span> — TermiCursor</> : 'TermiCursor'}
      </div>

      {/* Window controls — these are NOT draggable */}
      <div className="no-drag flex items-center h-full">
        <button onClick={() => window.electronAPI?.minimize()} title="Minimize"
          className="w-11 h-full flex items-center justify-center text-dim hover:text-fg hover:bg-surface-hover transition-colors">
          <Minus size={14} />
        </button>
        <button onClick={() => window.electronAPI?.maximize()} title="Maximize"
          className="w-11 h-full flex items-center justify-center text-dim hover:text-fg hover:bg-surface-hover transition-colors">
          <Square size={11} />
        </button>
        <button onClick={() => window.electronAPI?.close()} title="Close"
          className="w-11 h-full flex items-center justify-center text-dim hover:bg-danger hover:text-black transition-colors">
          <X size={15} />
        </button>
      </div>
    </div>
  );
}

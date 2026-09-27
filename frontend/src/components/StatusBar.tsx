import { Download, RotateCw } from 'lucide-react';
import { StatusDot } from './ui';

interface StatusBarProps {
  backendStatus: any;
  pullProgress: Record<string, number>;
  isPullingModels: boolean;
  onInstallModels: () => void;
  onRetryConnection: () => void;
  isIngesting?: boolean;
}

const GREEN = '#39ff14', ORANGE = '#ffb000', RED = '#ff4d4d', DIM = '#6b6b6b';

export default function StatusBar({ backendStatus, pullProgress, isPullingModels, onInstallModels, onRetryConnection, isIngesting }: StatusBarProps) {
  const s = backendStatus;

  const left = () => {
    if (!s) return <span className="flex items-center gap-2 text-dim"><StatusDot color={DIM} pulse /> Starting backend…</span>;
    if (s.reason === 'connection_error' || s.reason === 'ollama_error') {
      return (
        <span className="flex items-center gap-3">
          <button onClick={onRetryConnection} title="Retry" className="flex items-center gap-2 text-danger hover:brightness-125">
            <StatusDot color={RED} /> Ollama offline <RotateCw size={11} />
          </button>
          <a href="https://ollama.com/download" target="_blank" rel="noreferrer" className="text-muted hover:text-fg underline underline-offset-2">Get Ollama</a>
        </span>
      );
    }
    if (s.reason === 'missing_models') {
      return (
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-2 text-warn"><StatusDot color={ORANGE} /> Models missing</span>
          {isPullingModels ? (
            s.missing_models.map((m: string) => (
              <span key={m} className="flex items-center gap-2 text-muted">
                <Download size={11} className="text-warn" /> {m}
                <span className="w-16 h-1 rounded-full bg-border-strong overflow-hidden">
                  <span className="block h-full bg-warn transition-all" style={{ width: `${pullProgress[m] ?? 0}%` }} />
                </span>
                <span className="text-dim">{pullProgress[m] ?? 0}%</span>
              </span>
            ))
          ) : (
            <button onClick={onInstallModels} className="flex items-center gap-1 text-warn hover:brightness-125">
              <Download size={11} /> Install {s.missing_models.join(', ')}
            </button>
          )}
        </span>
      );
    }
    return (
      <span className="flex items-center gap-2 text-muted" title="Backend and model ready">
        <StatusDot color={GREEN} /> <span className="text-primary">ready</span>
        {s.model && <><span className="text-dim">·</span> <span className="text-fg">{s.model}</span> <span className="text-dim">{s.provider}</span></>}
      </span>
    );
  };

  return (
    <div data-testid="status-bar"
      className="h-6 shrink-0 bg-surface border-t border-border flex items-center justify-between px-3 text-[11px] font-mono select-none z-50">
      <div className="flex items-center gap-4 min-w-0 truncate">
        {left()}
        {isIngesting && <span className="flex items-center gap-2 text-muted"><StatusDot color={ORANGE} pulse /> indexing project…</span>}
      </div>
      <div className="flex items-center gap-4 text-dim shrink-0">
        <span>UTF-8</span>
        <span><span className="text-fg">termi</span><span className="text-primary">cursor</span>{s?.version ? ` v${s.version}` : ''}</span>
      </div>
    </div>
  );
}

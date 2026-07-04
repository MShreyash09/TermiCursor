import { GitBranch, XCircle, CheckCircle, Download, AlertTriangle } from 'lucide-react';

interface StatusBarProps {
  backendStatus: any;
  pullProgress: Record<string, number>;
  isPullingModels: boolean;
  onInstallModels: () => void;
  onRetryConnection: () => void;
}

export default function StatusBar({ backendStatus, pullProgress, isPullingModels, onInstallModels, onRetryConnection }: StatusBarProps) {
  const renderBackendStatus = () => {
    if (!backendStatus) return (
      <div className="flex items-center gap-1.5 text-gray-500">
        <div className="w-2 h-2 rounded-full bg-gray-500 animate-pulse" />
        Connecting...
      </div>
    );

    if (backendStatus.status === 'ok') {
      return (
        <div className="flex items-center gap-1.5 text-green-500/80 hover:text-green-400 cursor-pointer transition-colors" title="Backend & Ollama Connected">
          <CheckCircle size={13} />
          <span>Ollama Ready</span>
        </div>
      );
    }

    if (backendStatus.status === 'error') {
      if (backendStatus.reason === 'connection_error') {
        return (
          <div onClick={onRetryConnection} className="flex items-center gap-1.5 text-red-400 hover:text-red-300 cursor-pointer transition-colors px-2 bg-red-900/30 rounded-sm" title="Click to retry connection">
            <XCircle size={13} />
            <span>Ollama Offline</span>
          </div>
        );
      }

      if (backendStatus.reason === 'missing_models') {
        return (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-yellow-500 hover:text-yellow-400 cursor-pointer transition-colors px-2 bg-yellow-900/30 rounded-sm">
              <AlertTriangle size={13} />
              <span>Models Missing</span>
            </div>

            {isPullingModels ? (
              <div className="flex items-center gap-3">
                <Download size={13} className="text-cyan-400 animate-bounce" />
                {backendStatus.missing_models.map((model: string) => (
                  <div key={model} className="flex items-center gap-2">
                    <span className="text-gray-400">{model}</span>
                    <div className="w-16 bg-gray-800 rounded-full h-1 overflow-hidden">
                      <div
                        className="bg-cyan-500 h-1 rounded-full transition-all duration-300"
                        style={{ width: `${pullProgress[model] ?? 0}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <button onClick={onInstallModels} className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition-colors">
                <Download size={13} />
                Install Now
              </button>
            )}
          </div>
        );
      }
    }
  };

  return (
    <div className="h-[22px] bg-[#007acc] border-t border-border flex items-center justify-between px-3 text-[11px] font-mono text-white select-none z-50">
      <div className="flex items-center gap-4 h-full">
        {/* <div className="flex items-center gap-1.5 text-white/90 hover:text-white cursor-pointer transition-colors">
          <GitBranch size={13} />
          <span>main*</span>
        </div> */}
        {renderBackendStatus()}
      </div>

      <div className="flex items-center gap-4 text-white/80 h-full">
        {/* <div className="hover:text-white cursor-pointer transition-colors">UTF-8</div> */}
        <div className="hover:text-white cursor-pointer transition-colors">TermiCursor</div>
      </div>
    </div>
  );
}

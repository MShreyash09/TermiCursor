import { FolderOpen, Check, X, Download, ArrowRight, Loader2 } from 'lucide-react';
import { BlockLogo, Kbd } from './ui';
import { useKeybindings } from '../shortcuts';

interface RecentFolder {
  path: string;
  name: string;
}

interface WelcomeScreenProps {
  onOpenFolder: () => void;
  recentFolders?: RecentFolder[];
  onOpenRecentFolder?: (path: string) => void;
  backendStatus?: any;
  onInstallModels?: () => void;
  isPullingModels?: boolean;
  projectPath?: string;
}

function Step({ state, title, children }: { state: 'done' | 'todo' | 'wait' | 'bad'; title: string; children?: React.ReactNode }) {
  const icon = {
    done: <Check size={12} className="text-black" />,
    todo: <span className="w-1.5 h-1.5 rounded-full bg-dim" />,
    wait: <Loader2 size={12} className="text-dim animate-spin" />,
    bad: <X size={12} className="text-black" />,
  }[state];
  const ring = { done: 'bg-primary', todo: 'border border-border-strong', wait: 'border border-border-strong', bad: 'bg-danger' }[state];
  return (
    <li className="flex items-start gap-3 py-2.5">
      <span className={`mt-px w-[18px] h-[18px] rounded-full flex items-center justify-center shrink-0 ${ring}`}>{icon}</span>
      <div className="min-w-0 flex-1">
        <div className={`text-[13px] ${state === 'done' ? 'text-muted' : 'text-fg'}`}>{title}</div>
        {children && <div className="mt-1 text-[12px] text-dim">{children}</div>}
      </div>
    </li>
  );
}

export default function WelcomeScreen({
  onOpenFolder, recentFolders = [], onOpenRecentFolder, backendStatus, onInstallModels, isPullingModels, projectPath,
}: WelcomeScreenProps) {
  const k = useKeybindings();
  const SHORTCUTS: [string, string][] = [
    [k.toggleAgent, 'Agent panel'], [k.commandPalette, 'Command palette'], [k.toggleTerminal, 'Terminal'],
    [k.toggleExplorer, 'Explorer'], [k.openSettings, 'Settings'], [k.showShortcuts, 'All shortcuts'],
  ];
  // A folder is open but no file: a quiet project home, like an editor watermark.
  if (projectPath) {
    const name = projectPath.split(/[\\/]/).filter(Boolean).pop();
    return (
      <div className="flex-1 h-full bg-background flex flex-col items-center justify-center gap-8 overflow-hidden" data-testid="project-home">
        <BlockLogo className="text-[15px] opacity-25" />
        <div className="text-center">
          <div className="text-[15px] text-fg font-medium">{name}</div>
          <div className="text-[12.5px] text-dim mt-1">Open a file from the explorer, or ask the agent about this project.</div>
        </div>
        <div className="grid grid-cols-2 gap-x-10 gap-y-2.5">
          {SHORTCUTS.map(([keys, label]) => (
            <div key={label} className="flex items-center justify-between gap-6 text-[12.5px] text-dim">
              <span>{label}</span><Kbd>{keys}</Kbd>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const ollamaUp = backendStatus?.ollama_ready;
  const modelsOk = backendStatus?.status === 'ok';
  const checking = !backendStatus;

  return (
    <div className="flex-1 h-full bg-background overflow-y-auto" data-testid="welcome">
      <div className="min-h-full w-full max-w-[880px] mx-auto px-10 py-12 flex flex-col justify-center">
        <BlockLogo className="text-[20px] sm:text-[24px]" />
        <p className="mt-4 text-[14px] text-muted">
          A local coding agent. <span className="text-ask">Ask</span> about your code, <span className="text-plan">Plan</span> a change, or let it <span className="text-build">Build</span>.
        </p>

        <div className="mt-10 grid grid-cols-1 md:grid-cols-[1.1fr_1fr] gap-10">
          <div>
            <button onClick={onOpenFolder} data-testid="open-folder"
              className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-lg bg-primary text-black font-semibold text-[13.5px] hover:brightness-110 transition">
              <span className="flex items-center gap-2.5"><FolderOpen size={17} /> Open Folder</span>
              <ArrowRight size={16} />
            </button>

            <h2 className="mt-8 mb-2 font-mono text-[11px] tracking-[0.12em] text-dim">RECENT</h2>
            {recentFolders.length === 0 ? (
              <p className="text-[12.5px] text-dim">Folders you open will show up here.</p>
            ) : (
              <ul className="-mx-2">
                {recentFolders.map((folder) => (
                  <li key={folder.path}>
                    <button onClick={() => onOpenRecentFolder?.(folder.path)}
                      className="group w-full text-left flex items-baseline gap-3 px-2 py-1.5 rounded-md hover:bg-surface-hover">
                      <span className="text-[13px] text-fg group-hover:text-primary truncate">{folder.name}</span>
                      <span className="text-[11.5px] text-dim truncate font-mono">{folder.path}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h2 className="mb-1 font-mono text-[11px] tracking-[0.12em] text-dim">GET STARTED</h2>
            <ul className="divide-y divide-border">
              <Step state={checking ? 'wait' : ollamaUp ? 'done' : 'bad'} title="Ollama is running">
                {!checking && !ollamaUp && (
                  <>Models run locally through Ollama. <a href="https://ollama.com/download" target="_blank" rel="noreferrer" className="text-build hover:underline">Install Ollama</a>, start it, and this turns green.</>
                )}
              </Step>
              <Step state={checking || !ollamaUp ? 'todo' : modelsOk ? 'done' : isPullingModels ? 'wait' : 'bad'} title="Models downloaded">
                {ollamaUp && !modelsOk && (
                  isPullingModels ? <>Downloading {backendStatus?.missing_models?.join(', ')}… progress is in the status bar.</> : (
                    <button onClick={onInstallModels} className="mt-0.5 inline-flex items-center gap-1.5 text-warn hover:underline">
                      <Download size={12} /> Download {backendStatus?.missing_models?.join(', ')} (about 2.2 GB)
                    </button>
                  )
                )}
              </Step>
              <Step state="todo" title="Open a project folder">Then ask the agent about it, plan a change, or give it a task.</Step>
            </ul>

            <h2 className="mt-8 mb-2 font-mono text-[11px] tracking-[0.12em] text-dim">SHORTCUTS</h2>
            <div className="grid grid-cols-1 gap-1.5">
              {SHORTCUTS.slice(0, 4).map(([keys, label]) => (
                <div key={label} className="flex items-center justify-between text-[12.5px] text-dim">
                  <span>{label}</span><Kbd>{keys}</Kbd>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import { FileText, Terminal, FilePlus, FilePen, Trash2, Image, StickyNote, Video, ChevronRight } from 'lucide-react';
import type { AgentArtifact } from '../../types/agent';
import { backendUrl } from '../../backend';

const KIND_ICON = (a: AgentArtifact) => {
  switch (a.kind) {
    case 'command_log': return <Terminal size={12} className="text-warn shrink-0" />;
    case 'tasklist_snapshot': return <FileText size={12} className="text-dim shrink-0" />;
    case 'file_change':
      return a.data?.action === 'delete' ? <Trash2 size={12} className="text-danger shrink-0" />
        : a.data?.action === 'edit' ? <FilePen size={12} className="text-build shrink-0" />
        : <FilePlus size={12} className="text-primary shrink-0" />;
    case 'screenshot': return <Image size={12} className="text-plan shrink-0" />;
    case 'browser_recording': return <Video size={12} className="text-warn shrink-0" />;
    default: return <StickyNote size={12} className="text-dim shrink-0" />;
  }
};

interface Props {
  artifacts: AgentArtifact[];
  backendPort: number;
}

export default function ArtifactTrail({ artifacts, backendPort }: Props) {
  const shown = artifacts.filter(a => a.kind !== 'tasklist_snapshot');
  if (shown.length === 0) return null;
  return (
    <details className="group border-t border-border" data-testid="artifacts">
      <summary className="list-none cursor-pointer px-3 py-2 flex items-center gap-1.5 font-mono text-[10.5px] tracking-wider text-dim hover:text-muted">
        <ChevronRight size={12} className="transition-transform group-open:rotate-90" />
        ARTIFACTS <span className="text-muted">{shown.length}</span>
      </summary>
      <ul className="px-3 pb-2 space-y-0.5 max-h-40 overflow-y-auto">
        {shown.map((a) => {
          const inner = (
            <span className="flex items-center gap-2 text-[11.5px] text-muted min-w-0">
              {KIND_ICON(a)}
              <span className="truncate font-mono">{a.label || a.kind}</span>
              {a.kind === 'command_log' && (
                <span className={`font-mono shrink-0 ${a.data?.exit_code === 0 ? 'text-primary' : 'text-danger'}`}>exit {a.data?.exit_code}</span>
              )}
            </span>
          );
          return (
            <li key={a.id} className="rounded px-1 py-0.5 hover:bg-surface-hover">
              {a.file
                ? <a href={backendUrl(backendPort, `/sessions/${a.session_id}/artifacts/${a.file}`)} target="_blank" rel="noreferrer">{inner}</a>
                : inner}
            </li>
          );
        })}
      </ul>
    </details>
  );
}

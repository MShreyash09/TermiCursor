import { FileText, Terminal, FilePlus, Trash2, Image, StickyNote, Video } from 'lucide-react';
import type { AgentArtifact } from '../../types/agent';
import { backendUrl } from '../../backend';

const KIND_ICON = (a: AgentArtifact) => {
  switch (a.kind) {
    case 'command_log': return <Terminal size={13} className="text-cyan-400" />;
    case 'tasklist_snapshot': return <FileText size={13} className="text-gray-400" />;
    case 'file_change':
      return a.data?.action === 'delete'
        ? <Trash2 size={13} className="text-red-400" />
        : <FilePlus size={13} className="text-green-400" />;
    case 'screenshot': return <Image size={13} className="text-purple-400" />;
    case 'browser_recording': return <Video size={13} className="text-amber-400" />;
    default: return <StickyNote size={13} className="text-gray-400" />;
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
    <div className="border-t border-border">
      <div className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
        Artifacts ({shown.length})
      </div>
      <ul className="px-4 pb-3 space-y-1">
        {shown.map((a) => {
          const href = a.file
            ? backendUrl(backendPort, `/sessions/${a.session_id}/artifacts/${a.file}`)
            : undefined;
          const inner = (
            <span className="flex items-center gap-2 text-xs text-gray-300 truncate">
              {KIND_ICON(a)}
              <span className="truncate">{a.label || a.kind}</span>
              {a.kind === 'command_log' && (
                <span className={a.data?.exit_code === 0 ? 'text-green-500' : 'text-red-500'}>
                  ({a.data?.exit_code})
                </span>
              )}
            </span>
          );
          return (
            <li key={a.id}>
              {href
                ? <a href={href} target="_blank" rel="noreferrer" className="hover:underline">{inner}</a>
                : inner}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

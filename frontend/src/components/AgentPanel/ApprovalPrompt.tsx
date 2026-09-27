import { ShieldAlert } from 'lucide-react';
import type { PendingApproval } from '../../types/agent';

interface Props {
  approval: PendingApproval;
  onRespond: (approved: boolean) => void;
}

const TITLES: Record<string, string> = {
  run_shell_command: 'Run this command?',
  delete_file: 'Delete this file?',
  write_file: 'Write outside the project?',
  edit_file: 'Edit outside the project?',
};

export default function ApprovalPrompt({ approval, onRespond }: Props) {
  const detail = approval.tool === 'run_shell_command'
    ? approval.args.command
    : approval.args.path ?? JSON.stringify(approval.args);
  return (
    <div className="mt-3 rounded-lg border border-warn/40 bg-warn/[0.06] p-3" data-testid="approval">
      <div className="flex items-center gap-2 text-warn text-[12.5px] font-semibold">
        <ShieldAlert size={14} /> {TITLES[approval.tool] ?? `Allow ${approval.tool}?`}
      </div>
      <pre className="mt-2 rounded-md bg-background border border-border px-2.5 py-2 font-mono text-[11.5px] text-fg whitespace-pre-wrap break-all">
        {approval.tool === 'run_shell_command' && <span className="text-primary select-none">$ </span>}{detail}
      </pre>
      <div className="mt-2.5 flex gap-2">
        <button onClick={() => onRespond(true)} data-testid="approval-approve"
          className="flex-1 rounded-md bg-warn px-3 py-1.5 text-[12px] font-semibold text-black hover:brightness-110">
          Allow
        </button>
        <button onClick={() => onRespond(false)} data-testid="approval-deny"
          className="flex-1 rounded-md border border-border-strong px-3 py-1.5 text-[12px] text-muted hover:text-fg hover:bg-surface-hover">
          Deny
        </button>
      </div>
    </div>
  );
}

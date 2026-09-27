import { ShieldAlert } from 'lucide-react';
import type { PendingApproval } from '../../types/agent';

interface Props {
  approval: PendingApproval;
  onRespond: (approved: boolean) => void;
}

export default function ApprovalPrompt({ approval, onRespond }: Props) {
  const detail =
    approval.tool === 'run_shell_command'
      ? approval.args.command
      : JSON.stringify(approval.args);
  return (
    <div className="mx-4 my-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
      <div className="flex items-center gap-2 text-amber-300 text-sm font-semibold">
        <ShieldAlert size={16} />
        Approval required
      </div>
      <p className="mt-1 text-xs text-amber-100/80">
        The agent wants to run a potentially destructive action:
      </p>
      <pre className="mt-2 rounded bg-black/40 px-2 py-1.5 text-xs text-amber-100 overflow-x-auto">
        <span className="text-amber-400">{approval.tool}</span> {detail}
      </pre>
      <div className="mt-3 flex gap-2">
        <button
          onClick={() => onRespond(true)}
          className="flex-1 rounded-md bg-amber-500 px-3 py-1.5 text-xs font-semibold text-black hover:bg-amber-400"
        >
          Approve
        </button>
        <button
          onClick={() => onRespond(false)}
          className="flex-1 rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-gray-300 hover:bg-white/5"
        >
          Deny
        </button>
      </div>
    </div>
  );
}

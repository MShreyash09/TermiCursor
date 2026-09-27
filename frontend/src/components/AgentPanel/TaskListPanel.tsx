import { Check, Loader2, X } from 'lucide-react';
import type { TaskStep } from '../../types/agent';

const ICON = {
  pending: <span className="w-3.5 h-3.5 rounded-full border border-border-strong shrink-0 mt-[3px]" />,
  in_progress: <Loader2 size={14} className="text-build shrink-0 mt-[2px] animate-spin" />,
  done: <span className="w-3.5 h-3.5 rounded-full bg-primary flex items-center justify-center shrink-0 mt-[3px]"><Check size={10} className="text-black" strokeWidth={3} /></span>,
  failed: <span className="w-3.5 h-3.5 rounded-full bg-danger flex items-center justify-center shrink-0 mt-[3px]"><X size={10} className="text-black" strokeWidth={3} /></span>,
};

export default function TaskListPanel({ steps }: { steps: TaskStep[] }) {
  // A single step is just the request itself (direct answer): no plan to show.
  if (steps.length <= 1) return null;
  const done = steps.filter((s) => s.status === 'done').length;
  return (
    <div className="border-b border-border px-3 py-2.5" data-testid="task-list">
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono text-[10.5px] tracking-wider text-dim">PLAN</span>
        <span className="font-mono text-[10.5px] text-dim">{done}/{steps.length}</span>
      </div>
      <ol className="space-y-1.5">
        {steps.map((step, i) => (
          <li key={step.id} className="flex gap-2 text-[12.5px] leading-snug">
            {ICON[step.status]}
            <span className={step.status === 'done' ? 'text-dim' : step.status === 'in_progress' ? 'text-fg' : 'text-muted'}>
              <span className="text-dim mr-1 font-mono text-[11px]">{i + 1}.</span>{step.description}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

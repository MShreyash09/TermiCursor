import { CheckCircle2, Circle, Loader2, XCircle } from 'lucide-react';
import type { TaskStep } from '../../types/agent';

const ICONS = {
  pending: <Circle size={14} className="text-gray-500 shrink-0 mt-0.5" />,
  in_progress: <Loader2 size={14} className="text-primary shrink-0 mt-0.5 animate-spin" />,
  done: <CheckCircle2 size={14} className="text-green-400 shrink-0 mt-0.5" />,
  failed: <XCircle size={14} className="text-red-400 shrink-0 mt-0.5" />,
};

export default function TaskListPanel({ steps }: { steps: TaskStep[] }) {
  if (steps.length === 0) return null;
  return (
    <div className="border-b border-border">
      <div className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
        Plan
      </div>
      <ul className="px-4 pb-3 space-y-1.5">
        {steps.map((step, i) => (
          <li key={step.id} className="flex gap-2 text-sm">
            {ICONS[step.status]}
            <span className={step.status === 'done' ? 'text-gray-500 line-through' : 'text-gray-300'}>
              <span className="text-gray-500 mr-1">{i + 1}.</span>{step.description}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

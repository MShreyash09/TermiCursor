import { useState } from 'react';
import { Check, MessageSquare, Plus, Trash2, X } from 'lucide-react';
import type { TaskStep } from '../../types/agent';

interface Props {
  steps: TaskStep[];
  onReview: (action: 'approve' | 'revise' | 'reject', opts?: { steps?: string[]; feedback?: string }) => void;
}

// Plan mode: edit the steps directly, ask the planner to revise, or approve to start coding.
export default function PlanReview({ steps, onReview }: Props) {
  const [draft, setDraft] = useState(steps.map(s => s.description));
  const [feedback, setFeedback] = useState('');
  const setAt = (i: number, v: string) => setDraft(d => d.map((x, j) => (j === i ? v : x)));

  return (
    <div className="border-b border-border bg-plan/[0.04] px-3 py-3 space-y-2.5 max-h-[60%] overflow-y-auto" data-testid="plan-review">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10.5px] tracking-wider text-plan">REVIEW PLAN</span>
        <span className="text-[11px] text-dim">Nothing is written until you approve</span>
      </div>
      <ol className="space-y-1.5">
        {draft.map((d, i) => (
          <li key={i} className="group flex gap-2 items-start">
            <span className="text-dim font-mono text-[11px] mt-[7px] w-4 shrink-0 text-right">{i + 1}.</span>
            <textarea value={d} onChange={e => setAt(i, e.target.value)}
              rows={Math.min(4, Math.ceil(d.length / 44) || 1)}
              className="flex-1 bg-background border border-border rounded-md px-2 py-1.5 text-[12.5px] text-fg resize-none focus:outline-none focus:border-plan/60" />
            <button onClick={() => setDraft(x => x.filter((_, j) => j !== i))} title="Remove step"
              className="mt-1.5 p-0.5 text-dim hover:text-danger opacity-0 group-hover:opacity-100"><Trash2 size={12} /></button>
          </li>
        ))}
      </ol>
      <button onClick={() => setDraft(d => [...d, ''])} className="flex items-center gap-1 text-[11.5px] text-dim hover:text-fg ml-6">
        <Plus size={11} /> Add step
      </button>

      <textarea value={feedback} onChange={e => setFeedback(e.target.value)} rows={2}
        placeholder="Or describe changes and let the planner revise it…"
        className="w-full bg-background border border-border rounded-md px-2.5 py-1.5 text-[12.5px] text-fg placeholder:text-dim resize-none focus:outline-none focus:border-plan/60" />

      <div className="flex gap-2 justify-end">
        <button onClick={() => onReview('reject')} data-testid="plan-reject"
          className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[12px] text-dim hover:text-danger">
          <X size={12} /> Reject
        </button>
        <button onClick={() => onReview('revise', { feedback: feedback.trim() })} disabled={!feedback.trim()} data-testid="plan-revise"
          className="flex items-center gap-1 rounded-md border border-plan/40 px-2.5 py-1.5 text-[12px] text-plan hover:bg-plan/10 disabled:opacity-30">
          <MessageSquare size={12} /> Revise
        </button>
        <button onClick={() => onReview('approve', { steps: draft.filter(d => d.trim()) })} disabled={!draft.some(d => d.trim())}
          data-testid="plan-approve"
          className="flex items-center gap-1 rounded-md bg-plan px-3 py-1.5 text-[12px] font-semibold text-black hover:brightness-110 disabled:opacity-30">
          <Check size={12} strokeWidth={3} /> Approve &amp; code
        </button>
      </div>
    </div>
  );
}

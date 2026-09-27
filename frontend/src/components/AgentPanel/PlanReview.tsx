import { useState } from 'react';
import { Check, MessageSquare, Plus, Trash2, X } from 'lucide-react';
import type { TaskStep } from '../../types/agent';

interface Props {
  steps: TaskStep[];
  onReview: (action: 'approve' | 'revise' | 'reject', opts?: { steps?: string[]; feedback?: string }) => void;
}

// Shown in Plan mode once the planner is done: the user can edit steps directly,
// ask the planner to revise with feedback, or approve to start coding.
export default function PlanReview({ steps, onReview }: Props) {
  const [draft, setDraft] = useState(steps.map(s => s.description));
  const [feedback, setFeedback] = useState('');

  const setAt = (i: number, v: string) => setDraft(d => d.map((x, j) => (j === i ? v : x)));

  return (
    <div className="border-b border-border bg-primary/5 px-4 py-3 space-y-2 max-h-[60%] overflow-y-auto">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-primary">Review plan</div>
      <ol className="space-y-1.5">
        {draft.map((d, i) => (
          <li key={i} className="flex gap-2 items-start">
            <span className="text-gray-500 text-xs mt-1.5 w-4 shrink-0">{i + 1}.</span>
            <textarea
              value={d}
              onChange={e => setAt(i, e.target.value)}
              rows={Math.min(4, Math.ceil(d.length / 48) || 1)}
              className="flex-1 bg-[#0a0a0a] border border-border rounded px-2 py-1 text-xs text-gray-200 resize-none focus:outline-none focus:border-primary"
            />
            <button onClick={() => setDraft(x => x.filter((_, j) => j !== i))} title="Remove step"
              className="text-gray-600 hover:text-red-400 mt-1"><Trash2 size={12} /></button>
          </li>
        ))}
      </ol>
      <button onClick={() => setDraft(d => [...d, ''])}
        className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-200">
        <Plus size={11} /> Add step
      </button>

      <textarea
        value={feedback}
        onChange={e => setFeedback(e.target.value)}
        placeholder="Suggest changes and let the planner revise (optional)…"
        rows={2}
        className="w-full bg-[#0a0a0a] border border-border rounded px-2 py-1 text-xs text-gray-200 resize-none focus:outline-none focus:border-primary"
      />

      <div className="flex gap-2 justify-end">
        <button onClick={() => onReview('reject')}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-400 hover:text-red-300">
          <X size={12} /> Reject
        </button>
        <button onClick={() => onReview('revise', { feedback: feedback.trim() })}
          disabled={!feedback.trim()}
          className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-gray-300 hover:border-primary disabled:opacity-40">
          <MessageSquare size={12} /> Revise
        </button>
        <button onClick={() => onReview('approve', { steps: draft.filter(d => d.trim()) })}
          disabled={!draft.some(d => d.trim())}
          className="flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-40">
          <Check size={12} /> Approve & code
        </button>
      </div>
    </div>
  );
}

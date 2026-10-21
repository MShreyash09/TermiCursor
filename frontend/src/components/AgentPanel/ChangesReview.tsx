import { useCallback, useEffect, useState } from 'react';
import { DiffEditor } from '@monaco-editor/react';
import { Undo2, X } from 'lucide-react';
import { backendUrl } from '../../backend';
import { LANGUAGES } from '../EditorView';
import { FileIcon } from '../ui';
import type { FileChange } from '../../types/agent';

interface Props {
  sessionId: string;
  backendPort: number;
  /** bumps when the run changes another file, so the list reloads */
  version: number;
  running: boolean;
  onReverted: (paths: string[]) => void;
}

const STATUS_COLOR: Record<FileChange['status'], string> = {
  modified: 'text-build', created: 'text-primary', deleted: 'text-danger',
};

// "Review changes (N)": original vs current for each file the session touched, with Undo.
export default function ChangesReview({ sessionId, backendPort, version, running, onReverted }: Props) {
  const [changes, setChanges] = useState<FileChange[]>([]);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await fetch(backendUrl(backendPort, `/sessions/${sessionId}/changes`));
      if (r.ok) setChanges((await r.json()).changes);
    } catch { /* backend may be restarting */ }
  }, [backendPort, sessionId]);

  useEffect(() => { if (!running) load(); }, [load, running, version]);

  const undo = async (path?: string) => {
    setError('');
    try {
      const r = await fetch(backendUrl(backendPort, `/sessions/${sessionId}/revert`), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path }),
      });
      if (!r.ok) { setError((await r.json().catch(() => ({}))).detail || `Undo failed (${r.status})`); return; }
      onReverted((await r.json()).reverted);
    } catch (e: any) { setError(e.message); }
    await load();
  };

  if (changes.length === 0) return null;
  const cur = changes.find(c => c.path === selected) ?? changes[0];
  const name = cur.path.split('/').pop() ?? cur.path;

  return (
    <>
      <button onClick={() => setOpen(true)} data-testid="review-changes"
        className="w-full border-t border-border px-3 py-2 text-left font-mono text-[10.5px] tracking-wider text-build hover:bg-surface-hover">
        REVIEW CHANGES <span className="text-muted">({changes.length})</span>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-8" onClick={() => setOpen(false)}>
          <div className="flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-lg border border-border-strong bg-surface"
            onClick={e => e.stopPropagation()} data-testid="changes-modal">
            <div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-3">
              <span className="font-mono text-[11px] tracking-[0.12em] text-dim">REVIEW CHANGES</span>
              <div className="flex items-center gap-2">
                {error && <span className="text-[11.5px] text-danger">{error}</span>}
                <button onClick={() => undo()} disabled={running} data-testid="undo-all"
                  className="flex items-center gap-1 rounded-md border border-danger/40 px-2.5 py-1 text-[12px] text-danger hover:bg-danger/10 disabled:opacity-30">
                  <Undo2 size={12} /> Undo all
                </button>
                <button onClick={() => setOpen(false)} title="Close" className="p-1 text-dim hover:text-fg"><X size={14} /></button>
              </div>
            </div>
            <div className="flex min-h-0 flex-1">
              <ul className="w-60 shrink-0 overflow-y-auto border-r border-border py-1">
                {changes.map(c => (
                  <li key={c.path} onClick={() => setSelected(c.path)} title={c.path}
                    className={`group flex cursor-pointer items-center gap-2 px-3 py-1.5 ${c.path === cur.path ? 'bg-surface-hover' : 'hover:bg-surface-hover'}`}>
                    <FileIcon name={c.path} size={13} />
                    <span className="min-w-0 flex-1 truncate text-[12px] text-fg">{c.path}</span>
                    <span className={`font-mono text-[10px] ${STATUS_COLOR[c.status]}`}>{c.status}</span>
                    <button onClick={e => { e.stopPropagation(); undo(c.path); }} disabled={running} title="Undo this file"
                      className="p-0.5 text-dim opacity-0 hover:text-danger group-hover:opacity-100 disabled:opacity-0"><Undo2 size={12} /></button>
                  </li>
                ))}
              </ul>
              <div className="min-w-0 flex-1">
                {cur.no_preview ? (
                  <p className="p-4 text-[12px] text-dim">This file is binary or too large to preview. Undo still restores it.</p>
                ) : (
                  <DiffEditor height="100%" theme="vs-dark" language={LANGUAGES[name.split('.').pop()?.toLowerCase() ?? ''] ?? 'plaintext'}
                    original={cur.original ?? ''} modified={cur.current ?? ''}
                    options={{ readOnly: true, renderSideBySide: true, minimap: { enabled: false }, fontSize: 12, scrollBeyondLastLine: false }} />
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

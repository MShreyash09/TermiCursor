import { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { ArrowUp, Brain, Plus, Square, Cog, Check, X, AlertTriangle, History } from 'lucide-react';
import { useAgentSocket } from '../../hooks/useAgentSocket';
import type { AgentKind, LogLine, ProjectMemory, SessionSummary } from '../../types/agent';
import TaskListPanel from './TaskListPanel';
import ArtifactTrail from './ArtifactTrail';
import ChangesReview from './ChangesReview';
import ApprovalPrompt from './ApprovalPrompt';
import PlanReview from './PlanReview';
import ModelPicker from './ModelPicker';
import { backendUrl } from '../../backend';
import { StatusDot } from '../ui';

interface AgentPanelProps {
  backendPort?: number;
  projectPath: string;
  isIngesting?: boolean;
  backendStatus?: any;
  onFilesChanged?: (paths: string[]) => void;
}

export const MODE: Record<AgentKind, { label: string; color: string; hint: string; placeholder: string; examples: string[] }> = {
  ask: {
    label: 'Ask', color: '#39ff14', hint: 'Answers questions about your code. Read-only: it can look, not change.',
    placeholder: 'Ask about this project…',
    examples: ['How is this project structured?', 'Where is the entry point, and what does it do?', 'Which files handle configuration?'],
  },
  plan: {
    label: 'Plan', color: '#b877ff', hint: 'Writes a step-by-step plan and waits. You edit or approve it before any code is written.',
    placeholder: 'Describe a change; you review the plan first…',
    examples: ['Add unit tests for the main module', 'Add a README section on how to run this project', 'Add input validation to the config loader'],
  },
  build: {
    label: 'Build', color: '#3d8bff', hint: 'Plans if needed, then edits files and runs commands. Asks before anything risky.',
    placeholder: 'Describe a task for the agent…',
    examples: ['Run the tests and fix what fails', 'Add a .gitignore for this project', 'Add type hints to the utility functions'],
  },
};

const STATUS: Record<string, { label: string; color: string; pulse?: boolean }> = {
  idle: { label: 'Ready', color: '#6b6b6b' },
  planning: { label: 'Planning', color: '#b877ff', pulse: true },
  awaiting_plan_approval: { label: 'Review the plan', color: '#b877ff' },
  running: { label: 'Working', color: '#3d8bff', pulse: true },
  blocked: { label: 'Needs your approval', color: '#ffb000', pulse: true },
  done: { label: 'Done', color: '#39ff14' },
  error: { label: 'Error', color: '#ff4d4d' },
  cancelled: { label: 'Stopped', color: '#6b6b6b' },
};

// Markdown reads "__init__.py" as bold "init.py": show dunder names as inline code instead.
const codeifyDunders = (t: string) =>
  t.replace(/(^|[\s(])([\w./\\-]*__\w+__[\w./\\-]*)/g, (_m, pre, tok) => `${pre}\`${tok}\``);

// The one argument worth showing for each tool call.
function keyArg(args: Record<string, any> = {}) {
  const v = args.command ?? args.path ?? args.pattern ?? args.query ?? args.url ?? args.selector;
  return v === undefined ? '' : String(v);
}

function ago(ts: number) {
  const s = Math.max(0, Date.now() / 1000 - ts);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function Transcript({ log }: { log: LogLine[] }) {
  return (
    <div className="space-y-2.5" data-testid="agent-transcript">
      {log.map((line, i) => {
        switch (line.kind) {
          case 'goal': {
            const m = MODE[line.agent ?? 'build'];
            return (
              <div key={line.id} className={`${i > 0 ? 'pt-3 mt-1 border-t border-border' : ''}`}>
                <div className="relative pl-3">
                  <span className="absolute left-0 top-0.5 bottom-0.5 w-[2px] rounded" style={{ background: m.color }} />
                  <div className="font-mono text-[10.5px] tracking-wider mb-0.5" style={{ color: m.color }}>{m.label.toUpperCase()}</div>
                  <div className="text-[13px] text-fg whitespace-pre-wrap break-words">{line.text}</div>
                </div>
              </div>
            );
          }
          case 'thought':
            return <div key={line.id} className="pl-3 text-[12px] italic text-dim leading-snug">{line.text}</div>;
          case 'tool_call':
            return (
              <div key={line.id} className="pl-3 flex items-center gap-2 font-mono text-[11.5px] min-w-0">
                <Cog size={12} className="text-warn shrink-0" />
                <span className="text-fg shrink-0">{line.tool}</span>
                <span className="text-dim truncate" title={keyArg(line.args)}>{keyArg(line.args)}</span>
              </div>
            );
          case 'tool_result': {
            const first = (line.text || '').split('\n').find((l) => l.trim()) ?? '(no output)';
            return (
              <details key={line.id} className="group pl-3 ml-[18px] -mt-1.5">
                <summary className="list-none cursor-pointer flex items-center gap-1.5 font-mono text-[11px] text-dim hover:text-muted min-w-0">
                  {line.ok ? <Check size={11} className="text-primary shrink-0" /> : <X size={11} className="text-danger shrink-0" />}
                  <span className={`truncate ${line.ok ? '' : 'text-danger/80'}`}>{first}</span>
                </summary>
                <pre className="mt-1 max-h-60 overflow-auto rounded-md border border-border bg-background px-2.5 py-2 font-mono text-[11px] leading-relaxed text-muted whitespace-pre-wrap break-words">{line.text}</pre>
              </details>
            );
          }
          case 'answer':
            return (
              <div key={line.id} className="relative rounded-lg border border-border bg-raised px-3.5 py-2.5">
                <span className="absolute left-0 top-2.5 bottom-2.5 w-[2px] rounded bg-primary" />
                <div className="tc-markdown"><ReactMarkdown>{codeifyDunders(line.text)}</ReactMarkdown></div>
              </div>
            );
          case 'error':
            return (
              <div key={line.id} className="flex gap-2 rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-[12px] text-danger">
                <AlertTriangle size={13} className="shrink-0 mt-0.5" /><span className="break-words">{line.text}</span>
              </div>
            );
          default:
            return <div key={line.id} className="pl-3 font-mono text-[11px] text-dim">· {line.text}</div>;
        }
      })}
    </div>
  );
}

export default function AgentPanel({ projectPath, isIngesting, backendPort = 8000, backendStatus, onFilesChanged }: AgentPanelProps) {
  const agent = useAgentSocket(backendPort, projectPath);
  const [input, setInput] = useState('');
  const [agentKind, setAgentKind] = useState<AgentKind>(() => {
    try { return (localStorage.getItem('agentKind') as AgentKind) || 'build'; } catch { return 'build'; }
  });
  const chooseKind = (k: AgentKind) => {
    setAgentKind(k);
    try { localStorage.setItem('agentKind', k); } catch { /* ignore */ }
  };
  const [memory, setMemory] = useState<ProjectMemory | null>(null);
  // Past chats of this project, loaded each time the History dropdown opens.
  const [history, setHistory] = useState<SessionSummary[] | null>(null);
  const toggleHistory = async () => {
    if (history) { setHistory(null); return; }
    try {
      const r = await fetch(backendUrl(backendPort, `/sessions?project_path=${encodeURIComponent(projectPath)}`));
      setHistory(r.ok ? (await r.json()).sessions : []);
    } catch { setHistory([]); }
  };
  // @-mention popup: `at` is the index of the '@' being typed, files are cached per project.
  const [mention, setMention] = useState<{ at: number; query: string } | null>(null);
  const [mentionSel, setMentionSel] = useState(0);
  const [files, setFiles] = useState<string[]>([]);
  const filesCache = useRef<{ project: string; files: string[] } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const prevArtifacts = useRef(0);
  const prevStatus = useRef(agent.status);
  const mode = MODE[agentKind];

  // Opening a folder loads (or freshly creates) its persistent memory.
  const refreshMemory = useCallback(async () => {
    if (!projectPath) { setMemory(null); return; }
    try {
      const r = await fetch(backendUrl(backendPort, '/projects/open'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_path: projectPath }),
      });
      if (r.ok) setMemory(await r.json());
    } catch { /* backend may not be up yet */ }
  }, [backendPort, projectPath]);

  useEffect(() => { refreshMemory(); }, [refreshMemory]);

  useEffect(() => {
    const terminal = ['done', 'error', 'cancelled'];
    if (terminal.includes(agent.status) && !terminal.includes(prevStatus.current)) refreshMemory();
    prevStatus.current = agent.status;
  }, [agent.status, refreshMemory]);

  // The companion character (Mascot.tsx) follows the run's status.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('agent-status', { detail: agent.status }));
  }, [agent.status]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [agent.log, agent.preview, agent.steps, agent.pendingApproval, agent.status]);

  // Refresh the file tree whenever a file-change artifact lands.
  useEffect(() => {
    // "New conversation" empties the list; without this the next run's first changes were skipped.
    if (agent.artifacts.length < prevArtifacts.current) prevArtifacts.current = 0;
    if (agent.artifacts.length > prevArtifacts.current) {
      const fresh = agent.artifacts.slice(prevArtifacts.current);
      const changed = fresh.filter(a => a.kind === 'file_change').map(a => String(a.data?.path ?? ''));
      if (changed.length) { filesCache.current = null; onFilesChanged?.(changed); }
      prevArtifacts.current = agent.artifacts.length;
    }
  }, [agent.artifacts, onFilesChanged]);

  const canSend = !!input.trim() && !agent.isRunning && !isIngesting && !!projectPath;
  const submit = () => {
    if (!canSend) return;
    agent.start(input.trim(), agentKind);
    setInput('');
  };

  const matches = mention
    ? files.filter((f) => f.toLowerCase().includes(mention.query.toLowerCase())).slice(0, 8)
    : [];

  const onInputChange = (value: string, cursor: number) => {
    setInput(value);
    const m = /(^|\s)@([^\s@]*)$/.exec(value.slice(0, cursor));
    if (!m) { setMention(null); return; }
    setMention({ at: cursor - m[2].length - 1, query: m[2] });
    setMentionSel(0);
    if (filesCache.current?.project === projectPath) { setFiles(filesCache.current.files); return; }
    const api = (window as any).electronAPI;
    api?.listFiles?.(projectPath).then((list: string[]) => {
      filesCache.current = { project: projectPath, files: list };
      setFiles(list);
    }).catch(() => {});
  };

  const pickMention = (path: string) => {
    if (!mention) return;
    const end = mention.at + 1 + mention.query.length;
    const next = `${input.slice(0, mention.at)}@${path} ${input.slice(end)}`;
    const pos = mention.at + path.length + 2;
    setInput(next);
    setMention(null);
    requestAnimationFrame(() => { inputRef.current?.focus(); inputRef.current?.setSelectionRange(pos, pos); });
  };

  const onInputKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mention && matches.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionSel((i) => (i + (e.key === 'ArrowDown' ? 1 : matches.length - 1)) % matches.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pickMention(matches[mentionSel] ?? matches[0]); return; }
    }
    if (mention && e.key === 'Escape') { e.preventDefault(); setMention(null); return; }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
  };

  const status = STATUS[agent.status] ?? STATUS.idle;

  return (
    <div className="w-full h-full bg-surface border-l border-border flex flex-col" data-testid="agent-panel">
      {/* Header */}
      <div className="relative h-9 px-3 flex items-center justify-between border-b border-border shrink-0">
        <span className="font-mono text-[11px] tracking-[0.12em] text-dim">AGENT</span>
        <div className="flex items-center gap-2.5">
          <span className="flex items-center gap-1.5 text-[11.5px]" style={{ color: agent.status === 'idle' ? '#6b6b6b' : status.color }} data-testid="agent-status">
            <StatusDot color={status.color} pulse={status.pulse} /> {status.label}
          </span>
          <button onClick={toggleHistory} disabled={agent.isRunning || !projectPath} title="History" data-testid="agent-history"
            className="p-1 rounded text-dim hover:text-fg hover:bg-surface-hover disabled:opacity-40">
            <History size={14} />
          </button>
          {agent.status !== 'idle' && !agent.isRunning && (
            <button onClick={agent.reset} title="New conversation" className="p-1 rounded text-dim hover:text-fg hover:bg-surface-hover">
              <Plus size={14} />
            </button>
          )}
        </div>
        {history && (
          <div className="absolute top-full right-2 mt-1 w-[300px] max-h-[320px] overflow-y-auto rounded-lg border border-border-strong bg-surface p-1 shadow-2xl z-20" data-testid="history-list">
            {history.length === 0 && <div className="px-2.5 py-2 text-[12px] text-dim">No earlier chats in this project.</div>}
            {history.map((s) => {
              const st = STATUS[s.status] ?? STATUS.idle;
              return (
                <button key={s.id} onClick={() => { setHistory(null); agent.loadSession(s); }}
                  className="w-full text-left px-2.5 py-1.5 rounded-md hover:bg-surface-hover">
                  <div className="text-[12px] text-fg truncate">{s.goal.slice(0, 80)}</div>
                  <div className="flex items-center gap-1.5 text-[10.5px] text-dim">
                    <StatusDot color={st.color} /> {st.label} · {ago(s.created_at)}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Folder memory */}
      {memory && memory.session_count > 0 && (
        <div className="flex items-start gap-2 px-3 py-2 border-b border-border text-[11.5px] text-dim leading-snug">
          <Brain size={12} className="text-plan shrink-0 mt-0.5" />
          <span>
            Remembers <span className="text-muted">{memory.session_count}</span> earlier session{memory.session_count === 1 ? '' : 's'} here
            {memory.last_goal && <>; last: <span className="text-muted">“{memory.last_goal}”</span></>}.
          </span>
        </div>
      )}

      {/* Plan / review */}
      {agent.status === 'awaiting_plan_approval' ? (
        <PlanReview key={agent.steps.map(s => s.id + s.description).join('|')} steps={agent.steps} onReview={agent.reviewPlan} />
      ) : (
        <TaskListPanel steps={agent.steps} />
      )}

      {/* Transcript */}
      <div className="flex-1 overflow-y-auto px-3 py-3" ref={scrollRef}>
        {agent.log.length === 0 ? (
          <div className="pt-2">
            <div className="text-[12.5px] text-muted leading-relaxed">
              <span className="font-semibold" style={{ color: mode.color }}>{mode.label}.</span> {mode.hint}
            </div>
            {!projectPath ? (
              <p className="mt-4 text-[12px] text-dim">Open a folder to start.</p>
            ) : isIngesting ? (
              <p className="mt-4 text-[12px] text-dim flex items-center gap-2"><StatusDot color="#ffb000" pulse /> Indexing the project…</p>
            ) : (
              <div className="mt-4 space-y-1.5">
                <div className="font-mono text-[10.5px] tracking-wider text-dim mb-1">TRY</div>
                {mode.examples.map((ex) => (
                  <button key={ex} onClick={() => { setInput(ex); inputRef.current?.focus(); }}
                    className="w-full text-left px-2.5 py-1.5 rounded-md border border-border text-[12px] text-muted hover:text-fg hover:border-border-strong hover:bg-surface-hover transition-colors">
                    {ex}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <Transcript log={agent.log} />
        )}
        {agent.isRunning && agent.preview && (
          <div className="pl-3 mt-2.5 font-mono text-[11px] text-dim break-words" data-testid="agent-preview">
            …{agent.preview.slice(-240)}
          </div>
        )}
        {agent.pendingApproval && <ApprovalPrompt approval={agent.pendingApproval} onRespond={agent.respondApproval} />}
      </div>

      {agent.sessionId && (
        <ChangesReview key={agent.sessionId} sessionId={agent.sessionId} backendPort={backendPort} running={agent.isRunning} onReverted={(p) => onFilesChanged?.(p)}
          version={agent.artifacts.filter(a => a.kind === 'file_change' && a.session_id === agent.sessionId).length} />
      )}
      <ArtifactTrail artifacts={agent.artifacts} backendPort={backendPort} />

      {/* Composer */}
      <div className="p-2.5 border-t border-border">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center rounded-md border border-border bg-background p-0.5" role="radiogroup" aria-label="Agent mode">
            {(['ask', 'plan', 'build'] as AgentKind[]).map((k) => {
              const on = agentKind === k;
              return (
                <button key={k} onClick={() => chooseKind(k)} disabled={agent.isRunning} role="radio" aria-checked={on}
                  data-testid={`mode-${k}`} title={MODE[k].hint}
                  className="px-2.5 py-[3px] rounded text-[11.5px] font-medium transition-colors disabled:opacity-40"
                  style={on ? { background: `${MODE[k].color}1f`, color: MODE[k].color } : { color: '#6b6b6b' }}>
                  {MODE[k].label}
                </button>
              );
            })}
          </div>
          <ModelPicker ollamaModels={backendStatus?.available_models} disabled={agent.isRunning} />
        </div>
        <div className="relative rounded-lg border bg-background transition-colors"
          style={{ borderColor: input ? `${mode.color}66` : '#1f1f1f' }}>
          <textarea
            ref={inputRef}
            value={input}
            data-testid="agent-input"
            onChange={(e) => onInputChange(e.target.value, e.target.selectionStart)}
            onKeyDown={onInputKey}
            onBlur={() => setMention(null)}
            placeholder={!projectPath ? 'Open a folder first' : agent.isRunning ? 'The agent is working…' : mode.placeholder}
            disabled={agent.isRunning || isIngesting || !projectPath}
            rows={3}
            className="block w-full bg-transparent pl-3 pr-11 py-2.5 text-[13px] resize-none focus:outline-none text-fg placeholder:text-dim disabled:opacity-50"
          />
          {mention && matches.length > 0 && (
            <div className="absolute bottom-full left-0 right-0 mb-1 max-h-[200px] overflow-y-auto rounded-lg border border-border-strong bg-surface p-1 shadow-2xl z-10" data-testid="mention-popup">
              {matches.map((f, i) => (
                <div key={f} onMouseDown={(e) => { e.preventDefault(); pickMention(f); }}
                  className={`px-2.5 py-1 rounded-md cursor-pointer font-mono text-[11.5px] truncate ${i === mentionSel ? 'bg-surface-hover text-fg' : 'text-muted'}`}>
                  {f}
                </div>
              ))}
            </div>
          )}
          {agent.isRunning ? (
            <button onClick={agent.stop} title="Stop" data-testid="agent-stop"
              className="absolute right-2 bottom-2 flex items-center gap-1 rounded-md bg-danger px-2 py-1 text-[11px] font-semibold text-black hover:brightness-110">
              <Square size={10} fill="currentColor" /> Stop
            </button>
          ) : (
            <button onClick={submit} disabled={!canSend} title="Send" data-testid="agent-send"
              className="absolute right-2 bottom-2 w-7 h-7 rounded-md flex items-center justify-center text-black disabled:opacity-30 transition"
              style={{ background: mode.color }}>
              <ArrowUp size={15} strokeWidth={2.5} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { Send, Bot, Cpu, Wrench, AlertTriangle, RotateCcw, Square, Zap, ListChecks, Brain } from 'lucide-react';
import { useAgentSocket } from '../../hooks/useAgentSocket';
import type { LogLine, ProjectMemory } from '../../types/agent';
import TaskListPanel from './TaskListPanel';
import ArtifactTrail from './ArtifactTrail';
import ApprovalPrompt from './ApprovalPrompt';

interface AgentPanelProps {
  backendPort?: number;
  projectPath: string;
  isIngesting?: boolean;
  backendStatus?: any;
  onFilesChanged?: () => void;
}

const LOG_ICON = (line: LogLine) => {
  switch (line.kind) {
    case 'thought': return <Cpu size={12} className="text-gray-500 shrink-0 mt-0.5" />;
    case 'tool_call': return <Wrench size={12} className="text-blue-400 shrink-0 mt-0.5" />;
    case 'tool_result':
      return <span className={`shrink-0 mt-0.5 text-xs ${line.ok ? 'text-green-400' : 'text-red-400'}`}>{line.ok ? '✓' : '✗'}</span>;
    case 'error': return <AlertTriangle size={12} className="text-red-400 shrink-0 mt-0.5" />;
    default: return <span className="shrink-0 mt-0.5 text-gray-600">•</span>;
  }
};

export default function AgentPanel({
  projectPath, isIngesting, backendPort = 8000, onFilesChanged,
}: AgentPanelProps) {
  const agent = useAgentSocket(backendPort, projectPath);
  const [input, setInput] = useState('');
  const [memory, setMemory] = useState<ProjectMemory | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevArtifacts = useRef(0);
  const prevStatus = useRef(agent.status);

  // Opening a folder loads (or freshly creates) its persistent memory so the
  // agent can continue prior work instead of restarting.
  const refreshMemory = useCallback(async () => {
    if (!projectPath) { setMemory(null); return; }
    try {
      const r = await fetch(`http://127.0.0.1:${backendPort}/projects/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_path: projectPath }),
      });
      if (r.ok) setMemory(await r.json());
    } catch { /* backend may not be up yet */ }
  }, [backendPort, projectPath]);

  useEffect(() => { refreshMemory(); }, [refreshMemory]);

  // Re-read memory after each run finishes so the count/last-goal stay current.
  useEffect(() => {
    const terminal = ['done', 'error', 'cancelled'];
    if (terminal.includes(agent.status) && !terminal.includes(prevStatus.current)) {
      refreshMemory();
    }
    prevStatus.current = agent.status;
  }, [agent.status, refreshMemory]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [agent.log, agent.steps]);

  // Refresh the file tree whenever a file-change artifact lands.
  useEffect(() => {
    if (agent.artifacts.length > prevArtifacts.current) {
      const fresh = agent.artifacts.slice(prevArtifacts.current);
      if (fresh.some(a => a.kind === 'file_change')) onFilesChanged?.();
      prevArtifacts.current = agent.artifacts.length;
    }
  }, [agent.artifacts, onFilesChanged]);

  const submit = () => {
    if (!input.trim() || agent.isRunning || isIngesting) return;
    agent.start(input.trim());
    setInput('');
  };

  const statusLabel: Record<string, string> = {
    idle: 'Ready', planning: 'Planning…', running: 'Working…',
    blocked: 'Waiting for approval', done: 'Done', error: 'Error',
    cancelled: 'Stopped',
  };

  return (
    <div className="w-full h-full bg-surface border-l border-border flex flex-col z-40">
      {/* Header */}
      <div className="px-4 py-2 flex items-center justify-between border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
            <Bot size={12} className="text-white" />
          </div>
          <h2 className="text-sm font-semibold text-gray-200">Agent</h2>
          {agent.mode && (
            <span
              title={agent.mode === 'simple' ? 'Answered directly (no planning)' : 'Planned multi-step task'}
              className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-medium ${
                agent.mode === 'simple'
                  ? 'bg-green-500/15 text-green-300'
                  : 'bg-primary/15 text-primary'
              }`}
            >
              {agent.mode === 'simple' ? <Zap size={9} /> : <ListChecks size={9} />}
              {agent.mode === 'simple' ? 'Quick' : 'Planned'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-500">{statusLabel[agent.status] ?? agent.status}</span>
          {agent.status !== 'idle' && !agent.isRunning && (
            <button onClick={agent.reset} title="New run" className="text-gray-500 hover:text-gray-300">
              <RotateCcw size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Folder memory banner */}
      {memory && memory.session_count > 0 && (
        <div className="flex items-start gap-2 px-4 py-2 border-b border-border bg-primary/5">
          <Brain size={13} className="text-primary shrink-0 mt-0.5" />
          <p className="text-[11px] text-gray-400 leading-snug">
            Remembering <span className="text-gray-200 font-medium">{memory.session_count}</span>{' '}
            previous session{memory.session_count === 1 ? '' : 's'} in this folder.
            {memory.last_goal && (
              <> Last: <span className="text-gray-300">“{memory.last_goal}”</span>
              {memory.last_status && <span className="text-gray-500"> ({memory.last_status})</span>}.</>
            )}{' '}The agent will continue from here.
          </p>
        </div>
      )}
      {memory && memory.session_count === 0 && memory.created_fresh && (
        <div className="flex items-center gap-2 px-4 py-1.5 border-b border-border">
          <Brain size={12} className="text-gray-600 shrink-0" />
          <p className="text-[10px] text-gray-600">Fresh project — a new memory was started for this folder.</p>
        </div>
      )}

      {/* Plan */}
      <TaskListPanel steps={agent.steps} />

      {/* Approval gate */}
      {agent.pendingApproval && (
        <ApprovalPrompt approval={agent.pendingApproval} onRespond={agent.respondApproval} />
      )}

      {/* Activity log */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1.5" ref={scrollRef}>
        {agent.log.length === 0 && !isIngesting && (
          <p className="text-xs text-gray-500 leading-relaxed">
            Give the agent a goal — it will plan the work, then edit files, search the
            codebase, and run commands to accomplish it. Risky actions pause for your approval.
          </p>
        )}
        {isIngesting && (
          <p className="text-xs text-gray-500">Ingesting codebase into the vector index…</p>
        )}
        {agent.log.map((line) => (
          <div key={line.id} className="flex gap-2">
            {LOG_ICON(line)}
            <pre className={`text-xs whitespace-pre-wrap break-words font-mono ${
              line.kind === 'error' ? 'text-red-300'
              : line.kind === 'thought' ? 'text-gray-400 italic'
              : line.kind === 'tool_call' ? 'text-blue-200'
              : 'text-gray-300'
            }`}>{line.text}</pre>
          </div>
        ))}
      </div>

      {/* Artifacts */}
      <ArtifactTrail artifacts={agent.artifacts} backendPort={backendPort} />

      {/* Input */}
      <div className="p-3 bg-surface border-t border-border">
        <div className="relative bg-[#0a0a0a] rounded-xl border border-border focus-within:border-primary">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
            }}
            placeholder={agent.isRunning ? 'Agent is working…' : 'Describe a task for the agent…'}
            disabled={agent.isRunning || isIngesting}
            className="w-full bg-transparent pl-3 pr-10 py-3 text-sm resize-none focus:outline-none text-gray-200 placeholder-gray-500 disabled:opacity-60"
            rows={2}
          />
          {agent.isRunning ? (
            <button
              onClick={agent.stop}
              title="Stop the agent"
              className="absolute right-2 bottom-2 flex items-center gap-1 rounded-md bg-red-500/90 px-2 py-1 text-xs font-medium text-white hover:bg-red-500"
            >
              <Square size={11} fill="currentColor" /> Stop
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={!input.trim() || isIngesting}
              className="absolute right-2 bottom-2 p-1.5 text-gray-400 hover:text-gray-200 disabled:opacity-40"
            >
              <Send size={16} />
            </button>
          )}
        </div>
        <p className="mt-2 text-center text-[10px] text-gray-600">
          {agent.isRunning
            ? 'Working… you can stop anytime.'
            : 'The agent can edit files and run commands. Review its actions.'}
        </p>
      </div>
    </div>
  );
}

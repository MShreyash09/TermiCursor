import { useCallback, useRef, useState } from 'react';
import type {
  AgentKind, AgentEvent, AgentMode, TaskStep, AgentArtifact, LogLine, PendingApproval, SessionStatus,
} from '../types/agent';
import { backendUrl } from '../backend';

interface UseAgentSocket {
  sessionId: string | null;
  status: SessionStatus | 'idle';
  mode: AgentMode | null;
  steps: TaskStep[];
  artifacts: AgentArtifact[];
  log: LogLine[];
  pendingApproval: PendingApproval | null;
  isRunning: boolean;
  start: (goal: string, agent?: AgentKind) => Promise<void>;
  reviewPlan: (action: 'approve' | 'revise' | 'reject', opts?: { steps?: string[]; feedback?: string }) => Promise<void>;
  respondApproval: (approved: boolean) => Promise<void>;
  stop: () => Promise<void>;
  reset: () => void;
}

let logSeq = 0;
const nextLogId = () => `log-${Date.now()}-${logSeq++}`;

export function useAgentSocket(backendPort: number, projectPath: string): UseAgentSocket {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState<SessionStatus | 'idle'>('idle');
  const [mode, setMode] = useState<AgentMode | null>(null);
  const [steps, setSteps] = useState<TaskStep[]>([]);
  const [artifacts, setArtifacts] = useState<AgentArtifact[]>([]);
  const [log, setLog] = useState<LogLine[]>([]);
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const sessionRef = useRef<string | null>(null);
  const sawDoneRef = useRef(false);   // did a session_done event arrive this run?

  const pushLog = useCallback((line: Omit<LogLine, 'id'>) => {
    setLog(prev => [...prev, { ...line, id: nextLogId() }]);
  }, []);

  // The browser recording (if any) is only flushed to disk and indexed AFTER
  // session_done fires (see AgentLoop.run's finally in loop.py), so it never
  // arrives as a WS event. One refresh after the run ends picks it up.
  const refreshArtifacts = useCallback(async (id: string) => {
    try {
      const resp = await fetch(backendUrl(backendPort, `/sessions/${id}/artifacts`));
      if (!resp.ok) return;
      const { artifacts: fetched } = await resp.json();
      if (!Array.isArray(fetched)) return;
      setArtifacts(prev => {
        const known = new Set(prev.map(a => a.id));
        const extra = fetched.filter((a: AgentArtifact) => !known.has(a.id));
        return extra.length ? [...prev, ...extra] : prev;
      });
    } catch { /* best-effort */ }
  }, [backendPort]);

  const applyEvent = useCallback((ev: AgentEvent) => {
    switch (ev.type) {
      case 'mode':
        setMode(ev.mode);
        pushLog({ kind: 'info', text: ev.mode === 'simple' ? 'Working on it directly' : 'Planning the steps first' });
        break;
      case 'plan':
        setSteps(ev.steps);
        setStatus('running');
        pushLog({ kind: 'info', text: `Plan has ${ev.steps.length} step${ev.steps.length === 1 ? '' : 's'}` });
        break;
      case 'plan_review':
        setSteps(ev.steps);
        setStatus('awaiting_plan_approval');
        pushLog({ kind: 'info', text: 'Plan ready: review it above before any code is written' });
        break;
      case 'task_update':
        setSteps(prev => prev.map(s =>
          s.id === ev.step_id ? { ...s, status: ev.status } : s));
        break;
      case 'thought':
        pushLog({ kind: 'thought', text: ev.text });
        break;
      case 'tool_call':
        pushLog({ kind: 'tool_call', text: ev.tool, tool: ev.tool, args: ev.args });
        break;
      case 'approval_needed':
        setStatus('blocked');
        setPendingApproval({ call_id: ev.call_id, tool: ev.tool, args: ev.args });
        break;
      case 'tool_result':
        pushLog({ kind: 'tool_result', ok: ev.success, text: ev.output, tool: ev.tool });
        break;
      case 'artifact_created':
        setArtifacts(prev => [...prev, ev.artifact]);
        break;
      case 'step_done':
        if (ev.summary) pushLog({ kind: 'answer', text: ev.summary });
        break;
      case 'session_done':
        sawDoneRef.current = true;
        setStatus(ev.status);
        break;
      case 'error':
        pushLog({ kind: 'error', text: ev.message });
        setStatus('error');
        break;
    }
  }, [pushLog]);

  const start = useCallback(async (goal: string, agent: AgentKind = 'build') => {
    if (!projectPath) {
      pushLog({ kind: 'error', text: 'No project folder is open.' });
      return;
    }
    // Only per-run state resets here; the transcript and artifacts carry across prompts until
    // "New conversation" (reset) so earlier messages stay readable.
    setSteps([]); setPendingApproval(null); setMode(null);
    sawDoneRef.current = false;
    setStatus('planning');
    pushLog({ kind: 'goal', text: goal, agent });

    let id: string;
    try {
      const resp = await fetch(backendUrl(backendPort, '/sessions'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_path: projectPath, goal, agent }),
      });
      // An older backend build (e.g. a stale exe bundled into an installer) has no /sessions route.
      if (resp.status === 404) throw new Error('the backend is out of date (404). Reinstall the latest TermiCursor release.');
      if (!resp.ok) throw new Error(`Server returned ${resp.status}`);
      id = (await resp.json()).session_id;
    } catch (e: any) {
      setStatus('error');
      pushLog({ kind: 'error', text: `Failed to create session: ${e.message}` });
      return;
    }
    setSessionId(id);
    sessionRef.current = id;

    const ws = new WebSocket(backendUrl(backendPort, `/ws/agent/${id}`, { ws: true }));
    wsRef.current = ws;
    ws.onmessage = (event) => {
      try { applyEvent(JSON.parse(event.data) as AgentEvent); } catch { /* ignore */ }
    };
    ws.onerror = () => {
      pushLog({ kind: 'error', text: 'WebSocket error — is the backend running?' });
      setStatus('error');
    };
    ws.onclose = () => {
      refreshArtifacts(id);
      // Safety net: if the socket closed without a session_done (backend crash,
      // network drop, generator torn down), never leave the UI stuck on
      // "Working…" — flip out of the running state so the input re-enables.
      if (!sawDoneRef.current) {
        setStatus(prev =>
          (prev === 'planning' || prev === 'running' || prev === 'blocked' || prev === 'awaiting_plan_approval') ? 'error' : prev);
        setPendingApproval(null);
        pushLog({ kind: 'error', text: 'Run ended unexpectedly (connection closed).' });
      }
    };
  }, [backendPort, projectPath, applyEvent, pushLog, refreshArtifacts]);

  const respondApproval = useCallback(async (approved: boolean) => {
    const id = sessionRef.current;
    const approval = pendingApproval;
    if (!id || !approval) return;
    setPendingApproval(null);
    setStatus('running');
    try {
      await fetch(backendUrl(backendPort, `/sessions/${id}/approve`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ call_id: approval.call_id, approved }),
      });
      pushLog({ kind: 'info', text: approved ? 'Action approved.' : 'Action denied.' });
    } catch (e: any) {
      pushLog({ kind: 'error', text: `Approval failed: ${e.message}` });
    }
  }, [backendPort, pendingApproval, pushLog]);

  const reviewPlan = useCallback(async (
    action: 'approve' | 'revise' | 'reject',
    opts: { steps?: string[]; feedback?: string } = {},
  ) => {
    const id = sessionRef.current;
    if (!id) return;
    setStatus(action === 'approve' ? 'running' : action === 'revise' ? 'planning' : 'cancelled');
    pushLog({
      kind: 'info',
      text: action === 'approve' ? 'Plan approved — starting to code.'
        : action === 'revise' ? `Revising plan: ${opts.feedback ?? ''}` : 'Plan rejected.',
    });
    try {
      await fetch(backendUrl(backendPort, `/sessions/${id}/plan`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...opts }),
      });
    } catch (e: any) {
      pushLog({ kind: 'error', text: `Plan review failed: ${e.message}` });
    }
  }, [backendPort, pushLog]);

  const stop = useCallback(async () => {
    const id = sessionRef.current;
    // Make the stop feel instant: close the socket and flip UI state now.
    sawDoneRef.current = true;   // user-initiated close — not an unexpected drop
    wsRef.current?.close();
    setPendingApproval(null);
    setStatus('cancelled');
    pushLog({ kind: 'info', text: 'Stopped by user.' });
    if (!id) return;
    try {
      await fetch(backendUrl(backendPort, `/sessions/${id}/cancel`), { method: 'POST' });
    } catch { /* backend may already have torn the run down */ }
    // The backend finishes closing the browser (and flushing its recording)
    // asynchronously after cancellation; give it a moment before refreshing.
    setTimeout(() => refreshArtifacts(id), 1200);
  }, [backendPort, pushLog, refreshArtifacts]);

  const reset = useCallback(() => {
    wsRef.current?.close();
    setSessionId(null); sessionRef.current = null;
    setStatus('idle'); setMode(null);
    setSteps([]); setArtifacts([]); setLog([]); setPendingApproval(null);
  }, []);

  const isRunning = status === 'planning' || status === 'running' || status === 'blocked'
    || status === 'awaiting_plan_approval';
  return {
    sessionId, status, mode, steps, artifacts, log, pendingApproval, isRunning,
    start, reviewPlan, respondApproval, stop, reset,
  };
}

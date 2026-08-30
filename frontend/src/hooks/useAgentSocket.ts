import { useCallback, useRef, useState } from 'react';
import type {
  AgentEvent, AgentMode, TaskStep, AgentArtifact, LogLine, PendingApproval, SessionStatus,
} from '../types/agent';

interface UseAgentSocket {
  sessionId: string | null;
  status: SessionStatus | 'idle';
  mode: AgentMode | null;
  steps: TaskStep[];
  artifacts: AgentArtifact[];
  log: LogLine[];
  pendingApproval: PendingApproval | null;
  isRunning: boolean;
  start: (goal: string) => Promise<void>;
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
      const resp = await fetch(`http://127.0.0.1:${backendPort}/sessions/${id}/artifacts`);
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
        pushLog({
          kind: 'info',
          text: ev.mode === 'simple' ? 'Answering directly…' : 'Complex task — planning first…',
        });
        break;
      case 'plan':
        setSteps(ev.steps);
        setStatus('running');
        pushLog({ kind: 'info', text: `Planned ${ev.steps.length} step(s).` });
        break;
      case 'task_update':
        setSteps(prev => prev.map(s =>
          s.id === ev.step_id ? { ...s, status: ev.status } : s));
        break;
      case 'thought':
        pushLog({ kind: 'thought', text: ev.text });
        break;
      case 'tool_call':
        pushLog({ kind: 'tool_call', text: `${ev.tool}(${JSON.stringify(ev.args)})` });
        break;
      case 'approval_needed':
        setStatus('blocked');
        setPendingApproval({ call_id: ev.call_id, tool: ev.tool, args: ev.args });
        break;
      case 'tool_result':
        pushLog({ kind: 'tool_result', ok: ev.success, text: ev.output });
        break;
      case 'artifact_created':
        setArtifacts(prev => [...prev, ev.artifact]);
        break;
      case 'step_done':
        if (ev.summary) pushLog({ kind: 'info', text: `✓ ${ev.summary}` });
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

  const start = useCallback(async (goal: string) => {
    if (!projectPath) {
      pushLog({ kind: 'error', text: 'No project folder is open.' });
      return;
    }
    setSteps([]); setArtifacts([]); setLog([]); setPendingApproval(null); setMode(null);
    sawDoneRef.current = false;
    setStatus('planning');
    pushLog({ kind: 'info', text: `Goal: ${goal}` });

    let id: string;
    try {
      const resp = await fetch(`http://127.0.0.1:${backendPort}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_path: projectPath, goal }),
      });
      if (!resp.ok) throw new Error(`Server returned ${resp.status}`);
      id = (await resp.json()).session_id;
    } catch (e: any) {
      setStatus('error');
      pushLog({ kind: 'error', text: `Failed to create session: ${e.message}` });
      return;
    }
    setSessionId(id);
    sessionRef.current = id;

    const ws = new WebSocket(`ws://127.0.0.1:${backendPort}/ws/agent/${id}`);
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
          (prev === 'planning' || prev === 'running' || prev === 'blocked') ? 'error' : prev);
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
      await fetch(`http://127.0.0.1:${backendPort}/sessions/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ call_id: approval.call_id, approved }),
      });
      pushLog({ kind: 'info', text: approved ? 'Action approved.' : 'Action denied.' });
    } catch (e: any) {
      pushLog({ kind: 'error', text: `Approval failed: ${e.message}` });
    }
  }, [backendPort, pendingApproval, pushLog]);

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
      await fetch(`http://127.0.0.1:${backendPort}/sessions/${id}/cancel`, { method: 'POST' });
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

  const isRunning = status === 'planning' || status === 'running' || status === 'blocked';
  return {
    sessionId, status, mode, steps, artifacts, log, pendingApproval, isRunning,
    start, respondApproval, stop, reset,
  };
}

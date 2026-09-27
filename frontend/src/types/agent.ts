// Typed mirror of the backend WS event contract (core/agent/loop.py).

export type StepStatus = 'pending' | 'in_progress' | 'done' | 'failed';
export type SessionStatus =
  | 'created' | 'planning' | 'awaiting_plan_approval' | 'running' | 'blocked' | 'done' | 'error' | 'cancelled';
export type AgentMode = 'simple' | 'complex';
export type Risk = 'safe' | 'needs_approval';

export interface TaskStep {
  id: string;
  description: string;
  status: StepStatus;
  result?: string | null;
}

export interface AgentArtifact {
  id: string;
  session_id: string;
  kind: 'command_log' | 'tasklist_snapshot' | 'file_change' | 'screenshot' | 'browser_recording' | 'note';
  label: string;
  file?: string | null;
  data: Record<string, any>;
  created_at: number;
}

export type AgentEvent =
  | { type: 'mode'; mode: AgentMode }
  | { type: 'plan'; steps: TaskStep[] }
  | { type: 'plan_review'; steps: TaskStep[] }
  | { type: 'task_update'; step_id: string; status: StepStatus; description: string }
  | { type: 'thought'; step_id: string; text: string }
  | { type: 'tool_call'; step_id: string; call_id: string; tool: string; args: Record<string, any>; risk: Risk }
  | { type: 'approval_needed'; step_id: string; call_id: string; tool: string; args: Record<string, any> }
  | { type: 'tool_result'; step_id: string; call_id: string; tool: string; success: boolean; output: string }
  | { type: 'artifact_created'; artifact: AgentArtifact }
  | { type: 'step_done'; step_id: string; summary: string | null }
  | { type: 'session_done'; status: 'done' | 'error' | 'cancelled' }
  | { type: 'error'; message: string };

// A flattened, human-readable log line derived from events (for the activity feed).
export interface LogLine {
  id: string;
  kind: 'goal' | 'answer' | 'thought' | 'tool_call' | 'tool_result' | 'error' | 'info';
  text: string;
  ok?: boolean;
  tool?: string;                 // tool_call / tool_result
  args?: Record<string, any>;    // tool_call
  agent?: AgentKind;             // goal: which mode the request was sent in
}

export interface PendingApproval {
  call_id: string;
  tool: string;
  args: Record<string, any>;
}

// Per-folder persistent memory summary (POST /projects/open).
export interface ProjectMemory {
  folder_key?: string;
  project_path?: string;
  created_fresh?: boolean;
  session_count: number;
  last_goal: string | null;
  last_status: string | null;
  last_ended_at?: number | null;
}

// Build = plan-if-needed then code immediately; Plan = plan, wait for user review, then code;
// Ask = answer questions directly, read-only.
export type AgentKind = 'build' | 'plan' | 'ask';

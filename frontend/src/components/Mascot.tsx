import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { AgentEvent } from '../types/agent';

// The user's companion character (Settings → Companion). It roams while the agent works,
// runs over when the agent needs you, celebrates when a run finishes and dozes when idle.
// It follows the window events AgentPanel / useAgentSocket dispatch: 'agent-status', 'agent-event'.

export const MASCOT_STATES = ['walk', 'idle', 'done', 'error'] as const;
export type MascotState = typeof MASCOT_STATES[number];
export interface MascotSettings {
  enabled: boolean; size: string; pixelated: boolean; voice: boolean; phrase: string;
  files: Partial<Record<MascotState, { name: string; size: number; v: number }>>;
}

type Mode = 'idle' | 'roam' | 'alert' | 'done' | 'error' | 'sleep';
const RUNNING = ['planning', 'running', 'blocked', 'awaiting_plan_approval'];
const SLEEP_AFTER_MS = 3 * 60 * 1000;
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// "read_file C:\proj\src\App.tsx" -> "read_file App.tsx…"
function describeTool(tool: string, args: Record<string, any> = {}) {
  const first = Object.values(args).find(v => typeof v === 'string') as string | undefined;
  const short = first ? (first.split(/[\\/]/).filter(Boolean).pop() ?? first).slice(0, 24) : '';
  return `${tool}${short ? ` ${short}` : ''}…`;
}

export default function Mascot() {
  const [cfg, setCfg] = useState<MascotSettings | null>(null);
  const [srcs, setSrcs] = useState<Partial<Record<MascotState, string>>>({});
  const [mode, setMode] = useState<Mode>('idle');
  const [bubble, setBubble] = useState<string | null>(null);
  const [anim, setAnim] = useState({ name: '', key: 0 });
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [moveMs, setMoveMs] = useState(0);
  const [facing, setFacing] = useState(1);
  const [dragging, setDragging] = useState(false);
  const size = Number(cfg?.size) || 96;

  const prevStatus = useRef('idle');
  const home = useRef<{ x: number; y: number } | null>(null);
  const bubbleTimer = useRef<number | undefined>(undefined);
  const lastComment = useRef(0);
  const drag = useRef<{ dx: number; dy: number; sx: number; sy: number; moved: boolean } | null>(null);
  const posRef = useRef(pos);
  posRef.current = pos;

  useEffect(() => {
    const api = (window as any).electronAPI;
    api?.loadSettings?.().then((s: any) => setCfg(s?.mascot ?? null));
    return api?.onSettingsChanged?.((s: any) => setCfg(s?.mascot ?? null));
  }, []);

  // Reload the GIFs only when the set of uploaded files changes.
  const filesKey = JSON.stringify(cfg?.files ?? {});
  useEffect(() => {
    const api = (window as any).electronAPI;
    const files = cfg?.files ?? {};
    Promise.all(MASCOT_STATES.map(async s => [s, files[s] ? await api?.loadMascot?.(s) : null] as const))
      .then(pairs => setSrcs(Object.fromEntries(pairs.filter(([, v]) => v))));
  }, [filesKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const homeSpot = () => home.current ?? { x: 64, y: window.innerHeight - size - 40 };
  const say = (text: string | null, ms = 0) => {
    window.clearTimeout(bubbleTimer.current);
    setBubble(text);
    if (text && ms) bubbleTimer.current = window.setTimeout(() => setBubble(null), ms);
  };
  const play = (name: string) => setAnim(a => ({ name, key: a.key + 1 }));
  const moveTo = (p: { x: number; y: number }, ms: number) => {
    const cur = posRef.current ?? homeSpot();
    if (Math.abs(p.x - cur.x) > 2) setFacing(p.x < cur.x ? -1 : 1);
    setMoveMs(reducedMotion() ? 0 : ms);
    setPos(reducedMotion() ? cur : p);
  };

  // Status drives the mode. A jump straight to done/error without a running state before it
  // (opening a past chat from History) gets no reaction.
  useEffect(() => {
    let backTimer: number | undefined;
    const onStatus = (e: Event) => {
      const s = (e as CustomEvent).detail as string;
      const wasRunning = RUNNING.includes(prevStatus.current);
      prevStatus.current = s;
      window.clearTimeout(backTimer);
      if (s === 'planning' || s === 'running') { setMode('roam'); say(null); play(''); return; }
      if (s === 'blocked' || s === 'awaiting_plan_approval') {
        setMode('alert'); play('mascot-bounce'); say('Need you!');
        moveTo({ x: window.innerWidth - size - 24, y: window.innerHeight - size - 160 }, 1200);
        return;
      }
      if (!wasRunning) return;
      if (s === 'done') {
        setMode('done'); play('mascot-hop'); say('Done!');
        if (cfg?.voice) {
          try { speechSynthesis.speak(new SpeechSynthesisUtterance(cfg.phrase || 'All done!')); } catch { /* no voices */ }
        }
      } else {
        setMode('error'); play('mascot-shake'); say(s === 'cancelled' ? 'Stopped' : 'Run failed');
      }
      backTimer = window.setTimeout(() => { setMode('idle'); say(null); moveTo(homeSpot(), 1500); }, 4000);
    };
    const onEvent = (e: Event) => {
      const ev = (e as CustomEvent).detail as AgentEvent;
      if (ev.type !== 'tool_call' || Date.now() - lastComment.current < 2000) return;
      lastComment.current = Date.now();
      say(describeTool(ev.tool, ev.args), 1800);
    };
    window.addEventListener('agent-status', onStatus);
    window.addEventListener('agent-event', onEvent);
    return () => {
      window.removeEventListener('agent-status', onStatus);
      window.removeEventListener('agent-event', onEvent);
      window.clearTimeout(backTimer);
    };
  }, [cfg, size]); // eslint-disable-line react-hooks/exhaustive-deps

  // Roam: a new random spot every 2.5s while the agent works.
  useEffect(() => {
    if (mode !== 'roam') return;
    const step = () => moveTo({
      x: Math.random() * (window.innerWidth - size),
      y: 40 + Math.random() * Math.max(0, window.innerHeight - size - 70),
    }, 2400);
    step();
    const t = window.setInterval(step, 2500);
    return () => window.clearInterval(t);
  }, [mode, size]); // eslint-disable-line react-hooks/exhaustive-deps

  // Doze off after a few quiet minutes.
  useEffect(() => {
    if (mode !== 'idle') return;
    const t = window.setTimeout(() => { setMode('sleep'); say('zZz'); }, SLEEP_AFTER_MS);
    return () => window.clearTimeout(t);
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!cfg?.enabled || !srcs.walk) return null;

  const at = pos ?? homeSpot();
  const x = Math.max(0, Math.min(at.x, window.innerWidth - size));
  const y = Math.max(0, Math.min(at.y, window.innerHeight - size));
  const src = (mode === 'done' && srcs.done) || (mode === 'error' && srcs.error)
    || ((mode === 'idle' || mode === 'sleep') && srcs.idle) || srcs.walk;

  const onPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { dx: e.clientX - x, dy: e.clientY - y, sx: e.clientX, sy: e.clientY, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 4) return;
    if (!d.moved) { d.moved = true; setDragging(true); }
    setPos({ x: e.clientX - d.dx, y: e.clientY - d.dy });
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    if (d?.moved) { home.current = posRef.current; return; }
    if (mode === 'sleep') setMode('idle');
    play('mascot-hop'); say('♥', 1200);
  };

  const style: CSSProperties = {
    transform: `translate(${x}px, ${y}px)`,
    transition: dragging ? 'none' : `transform ${moveMs}ms linear`,
    // While it waits for you it sits near the chat: never block the approval buttons.
    pointerEvents: mode === 'alert' ? 'none' : 'auto',
  };

  return (
    <div className="fixed inset-0 z-[150] pointer-events-none" aria-hidden="true">
      <div data-testid="mascot" data-mode={mode} style={style}
        className={`absolute left-0 top-0 select-none touch-none ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
        {bubble && (
          <div data-testid="mascot-bubble"
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 max-w-[220px] truncate rounded-md border border-border-strong bg-surface px-2 py-0.5 font-mono text-[11px] text-fg shadow-lg">
            {bubble}
          </div>
        )}
        <div key={anim.key} className={`${anim.name} ${mode === 'sleep' ? 'mascot-sleep' : ''}`}>
          <img src={src} alt="" draggable={false} style={{
            height: size, width: 'auto', transform: `scaleX(${facing})`,
            imageRendering: cfg.pixelated ? 'pixelated' : 'auto',
          }} />
        </div>
      </div>
    </div>
  );
}

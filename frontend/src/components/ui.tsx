// Small shared UI pieces for the terminal-style look.
import type { ReactNode } from 'react';
import { File, FileCode2, FileJson, FileText, Folder, FolderOpen } from 'lucide-react';

// Same palette as the CLI / terminal theme.
const EXT_COLORS: Record<string, string> = {
  py: '#3d8bff', ts: '#6aa8ff', tsx: '#6aa8ff', js: '#ffb000', jsx: '#ffb000', mjs: '#ffb000', cjs: '#ffb000',
  json: '#ffc94d', md: '#a3a3a3', css: '#b877ff', scss: '#b877ff', html: '#ff7a45', yml: '#b877ff', yaml: '#b877ff',
  sh: '#39ff14', ps1: '#39ff14', go: '#2fd6c3', rs: '#ff7a45', java: '#ff4d4d', c: '#6aa8ff', cpp: '#6aa8ff',
  toml: '#a3a3a3', txt: '#a3a3a3', env: '#ffb000', sql: '#2fd6c3',
};

export function extColor(name: string) {
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
  return EXT_COLORS[ext] ?? '#8a8a8a';
}

export function FileIcon({ name, size = 14 }: { name: string; size?: number }) {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const color = extColor(name);
  const Icon = ext === 'json' ? FileJson
    : ['md', 'txt'].includes(ext) ? FileText
    : EXT_COLORS[ext] ? FileCode2 : File;
  return <Icon size={size} style={{ color }} className="shrink-0" />;
}

export function FolderIcon({ open, size = 14 }: { open?: boolean; size?: number }) {
  const Icon = open ? FolderOpen : Folder;
  return <Icon size={size} className="shrink-0 text-warn/80" />;
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex items-center rounded border border-border-strong border-b-2 bg-raised px-1.5 py-px font-mono text-[10.5px] leading-4 text-muted">
      {children}
    </kbd>
  );
}

export function BrandMark({ caret = true, className = '' }: { caret?: boolean; className?: string }) {
  return (
    <span className={`font-mono font-bold tracking-tight ${className}`}>
      <span className="text-fg">termi</span><span className="text-primary">cursor</span>
      {caret && <span className="tc-caret" aria-hidden="true" />}
    </span>
  );
}

// 3-row half-block wordmark, the same glyphs the CLI draws (cli.py _GLYPHS).
const GLYPHS: Record<string, [string, string, string]> = {
  t: ['▀█▀', ' █ ', ' ▀ '], e: ['█▀▀', '█▀▀', '▀▀▀'], r: ['█▀▄', '█▀▄', '▀ ▀'],
  m: ['█▀▄▀█', '█ ▀ █', '▀   ▀'], i: ['█', '█', '▀'], c: ['█▀▀', '█  ', '▀▀▀'],
  u: ['█ █', '█ █', '▀▀▀'], s: ['█▀▀', '▀▀█', '▀▀▀'], o: ['█▀█', '█ █', '▀▀▀'],
};

export function BlockLogo({ className = '' }: { className?: string }) {
  const row = (word: string, r: number) => word.split('').map((ch) => GLYPHS[ch][r]).join(' ');
  return (
    <pre aria-label="TermiCursor" className={`font-mono leading-[1.02] select-none ${className}`}>
      {[0, 1, 2].map((r) => (
        <div key={r}>
          <span className="text-fg">{row('termi', r)}</span>{' '}
          <span className="text-primary">{row('cursor', r)}</span>
        </div>
      ))}
    </pre>
  );
}

export function StatusDot({ color, pulse }: { color: string; pulse?: boolean }) {
  return (
    <span className="relative inline-flex h-2 w-2 shrink-0">
      {pulse && <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: color }} />}
      <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
    </span>
  );
}

/** "12.3k tok · 28/30 req left" from a provider's /status quota entry. */
export function quotaText(q?: Record<string, any>): string {
  if (!q) return 'no usage yet';
  const tok = q.tokens >= 1000 ? `${(q.tokens / 1000).toFixed(1)}k` : `${q.tokens}`;
  const req = q['remaining-requests'] != null
    ? ` · ${q['remaining-requests']}${q['limit-requests'] ? `/${q['limit-requests']}` : ''} req left` : '';
  return `${tok} tok${req}`;
}

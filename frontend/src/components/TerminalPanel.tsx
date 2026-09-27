import { useEffect, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import { TerminalSquare, Trash2 } from 'lucide-react';
import 'xterm/css/xterm.css';

interface TerminalPanelProps {
  projectPath: string;
}

// TermiCursor palette: hacker green, black & white, red, blue, purple, golden orange.
const THEME = {
  background: '#000000',
  foreground: '#e6e6e6',
  cursor: '#39ff14',
  cursorAccent: '#000000',
  selectionBackground: '#39ff1433',
  black: '#000000', brightBlack: '#6b6b6b',
  red: '#ff4d4d', brightRed: '#ff7373',
  green: '#39ff14', brightGreen: '#7dff5c',
  yellow: '#ffb000', brightYellow: '#ffc94d',
  blue: '#3d8bff', brightBlue: '#6aa8ff',
  magenta: '#b877ff', brightMagenta: '#d0a3ff',
  cyan: '#2fd6c3', brightCyan: '#6ee8da',
  white: '#e6e6e6', brightWhite: '#ffffff',
};

// Always fall back to fonts Windows ships with so metrics stay clean.
const fontStack = (family?: string) =>
  `${family ? `"${family}", ` : ''}"Cascadia Mono", "Cascadia Code", Consolas, "Courier New", monospace`;

export default function TerminalPanel({ projectPath }: TerminalPanelProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const [size, setSize] = useState({ cols: 0, rows: 0 });

  useEffect(() => {
    if (!terminalRef.current) return;
    const api = (window as any).electronAPI;

    const term = new Terminal({
      theme: THEME,
      fontFamily: fontStack(),
      fontSize: 13,
      lineHeight: 1.15,
      letterSpacing: 0,
      cursorBlink: true,
      cursorStyle: 'bar',
      scrollback: 5000,
      allowProposedApi: true,
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    xtermRef.current = term;

    const fit = () => {
      if (term.element && term.element.clientWidth > 0) {
        fitAddon.fit();
        setSize({ cols: term.cols, rows: term.rows });
      }
    };
    const applyFont = (s: any) => {
      if (!s) return;
      if (s.fontFamily) term.options.fontFamily = fontStack(s.fontFamily);
      if (s.fontSize) term.options.fontSize = parseInt(s.fontSize);
      fit();
    };
    api?.loadSettings?.().then(applyFont);
    api?.onSettingsChanged?.(applyFont);
    document.fonts.ready.then(fit);

    const resizeObserver = new ResizeObserver(() => requestAnimationFrame(fit));
    resizeObserver.observe(terminalRef.current);

    let unsubscribe: (() => void) | undefined;
    if (api?.spawnTerminal) {
      api.spawnTerminal(projectPath);
      unsubscribe = api.onTerminalData((data: string) => term.write(data));

      // child_process isn't a real PTY, so we do line editing locally.
      let command = '';
      const history: string[] = [];
      let histIdx = 0;
      const replaceLine = (next: string) => {
        term.write('\b \b'.repeat(command.length) + next);
        command = next;
      };

      term.onData((data) => {
        switch (data) {
          case '\r': {
            term.write('\r\n');
            const trimmed = command.trim();
            if (trimmed) { history.push(command); }
            histIdx = history.length;
            if (trimmed === 'clear' || trimmed === 'cls') term.clear();
            api.writeTerminal(command + '\r\n');
            command = '';
            return;
          }
          case '\x7f': case '\b':
            if (command.length) { command = command.slice(0, -1); term.write('\b \b'); }
            return;
          case '\x03':
            term.write('^C\r\n');
            command = '';
            api.writeTerminal('\x03');
            return;
          case '\x0c':
            term.clear();
            return;
          case '\x1b[A':
            if (histIdx > 0) replaceLine(history[--histIdx]);
            return;
          case '\x1b[B':
            if (histIdx < history.length - 1) replaceLine(history[++histIdx]);
            else { histIdx = history.length; replaceLine(''); }
            return;
        }
        if (data.startsWith('\x1b')) return; // ignore other escape sequences
        // Printable input, including multi-character paste (first line only).
        const text = data.replace(/[\r\n].*$/s, '').replace(/[\x00-\x1f]/g, '');
        command += text;
        term.write(text);
      });
      term.write(`\x1b[2m# ${projectPath}\x1b[0m\r\n`);
    } else {
      term.writeln('\x1b[31mElectron terminal API not found — running in web mode without a shell.\x1b[0m');
    }

    return () => {
      unsubscribe?.();
      resizeObserver.disconnect();
      term.dispose();
    };
  }, [projectPath]);

  const shellName = navigator.userAgent.includes('Windows') ? 'powershell' : 'bash';
  const folder = projectPath.split(/[\\/]/).filter(Boolean).pop() ?? projectPath;

  return (
    <div className="w-full h-full bg-black border-t border-border flex flex-col min-w-0">
      <div className="h-8 flex items-center justify-between bg-[#0c0c0c] border-b border-[#1f1f1f] shrink-0 pr-2">
        <div className="flex items-center h-full min-w-0">
          <div className="flex items-center gap-2 h-full px-3 bg-black border-r border-[#1f1f1f] border-t-2 border-t-[#39ff14] min-w-0">
            <TerminalSquare size={13} className="text-[#39ff14] shrink-0" />
            <span className="text-[12px] text-gray-200 truncate">{shellName}</span>
            <span className="hidden sm:inline text-[11px] text-gray-500 truncate">· {folder}</span>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {size.cols > 0 && (
            <span className="hidden md:inline text-[10px] text-gray-600 font-mono">{size.cols}×{size.rows}</span>
          )}
          <button onClick={() => xtermRef.current?.clear()} title="Clear (Ctrl+L)"
            className="text-gray-500 hover:text-[#ff4d4d]">
            <Trash2 size={13} />
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden pl-3 pt-2 pb-1" ref={terminalRef} />
    </div>
  );
}

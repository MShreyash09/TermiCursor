import { useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import 'xterm/css/xterm.css';

interface TerminalPanelProps {
  projectPath: string;
}

export default function TerminalPanel({ projectPath }: TerminalPanelProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);

  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new Terminal({
      theme: {
        background: '#09090b',
        foreground: '#e5e7eb',
        cursor: '#0ea5e9',
        selectionBackground: '#1e3a8a',
        black: '#000000',
        red: '#ef4444',
        green: '#22c55e',
        yellow: '#eab308',
        blue: '#3b82f6',
        magenta: '#d946ef',
        cyan: '#06b6d4',
        white: '#ffffff'
      },
      fontFamily: "'Fira Code', monospace",
      fontSize: 13,
      cursorBlink: true,
    });
    
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    
    term.open(terminalRef.current);
    fitAddon.fit();
    xtermRef.current = term;

    // Window resize handling
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
    });
    resizeObserver.observe(terminalRef.current);

    // Spawn backend process
    // @ts-ignore
    if (window.electronAPI?.spawnTerminal) {
      // @ts-ignore
      window.electronAPI.spawnTerminal(projectPath);
      
      // Setup incoming data listener
      // @ts-ignore
      window.electronAPI.onTerminalData((data: string) => {
        term.write(data);
      });
      
      // Implement local echo because child_process doesn't echo like a true PTY
      let command = '';
      term.onKey(({ key, domEvent }) => {
        const ev = domEvent as KeyboardEvent;
        const printable = !ev.altKey && !ev.ctrlKey && !ev.metaKey;

        if (ev.keyCode === 13) {
          // Enter
          term.write('\r\n');
          // @ts-ignore
          window.electronAPI.writeTerminal(command + '\r\n');
          command = '';
        } else if (ev.keyCode === 8) {
          // Backspace
          if (command.length > 0) {
            command = command.slice(0, -1);
            term.write('\b \b');
          }
        } else if (ev.ctrlKey && ev.key === 'c') {
          // Send SIGINT approx
          // @ts-ignore
          window.electronAPI.writeTerminal('\x03');
        } else if (printable && key.length === 1) {
          command += key;
          term.write(key);
        }
      });
    } else {
      term.writeln('\x1b[31mError: Electron API for terminal not found.\x1b[0m');
      term.writeln('Running in web mode without a backend shell.');
    }

    return () => {
      resizeObserver.disconnect();
      term.dispose();
    };
  }, [projectPath]);

  return (
    <div className="w-full h-full bg-background border-t border-border flex flex-col">
      <div className="px-4 py-1.5 flex items-center bg-surface border-b border-border shrink-0">
        <span className="text-[11px] font-semibold tracking-wide text-gray-400 uppercase">Terminal</span>
      </div>
      <div className="flex-1 p-2 overflow-hidden" ref={terminalRef} />
    </div>
  );
}

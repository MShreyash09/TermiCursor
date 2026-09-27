import { useEffect, useState } from 'react';
import { Command } from 'cmdk';
import { Settings, RefreshCw, Terminal, Search, PanelLeft, FolderOpen, Bot, Keyboard } from 'lucide-react';
import { Kbd } from './ui';

interface CommandPaletteProps {
  onToggleTerminal: () => void;
  onToggleSidebar: () => void;
  onOpenSettings: () => void;
  onOpenFolder?: () => void;
  onToggleAgent?: () => void;
  onShowShortcuts?: () => void;
}

export default function CommandPalette(props: CommandPaletteProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.key === 'k' || e.key === 'p') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  if (!open) return null;

  const items: [string, typeof Settings, string | null, (() => void) | undefined][] = [
    ['Open folder…', FolderOpen, null, props.onOpenFolder],
    ['Toggle agent panel', Bot, 'Ctrl+L', props.onToggleAgent],
    ['Toggle explorer', PanelLeft, 'Ctrl+B', props.onToggleSidebar],
    ['Toggle terminal', Terminal, 'Ctrl+`', props.onToggleTerminal],
    ['Open settings', Settings, 'Ctrl+,', props.onOpenSettings],
    ['Keyboard shortcuts', Keyboard, 'Ctrl+/', props.onShowShortcuts],
    ['Reload window', RefreshCw, null, () => window.location.reload()],
  ];

  return (
    <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-start justify-center pt-[14vh]" onClick={() => setOpen(false)} data-testid="command-palette">
      <div className="bg-surface border border-border-strong rounded-xl shadow-2xl w-[520px] overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <Command label="Command palette" className="flex flex-col">
          <div className="flex items-center px-3.5 border-b border-border">
            <Search size={15} className="text-dim mr-2.5" />
            <Command.Input autoFocus placeholder="Type a command…" id="command-palette-input"
              className="w-full bg-transparent border-none focus:outline-none text-fg placeholder:text-dim py-3 text-[13.5px]" />
          </div>
          <Command.List className="max-h-[320px] overflow-y-auto p-1.5">
            <Command.Empty className="py-6 text-center text-[12.5px] text-dim">No matching commands.</Command.Empty>
            {items.filter(([, , , fn]) => fn).map(([label, Icon, keys, fn]) => (
              <Command.Item key={label} onSelect={() => { fn?.(); setOpen(false); }}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-md cursor-pointer text-[13px] text-muted aria-selected:bg-surface-hover aria-selected:text-fg">
                <Icon size={14} className="text-dim" />
                <span className="flex-1">{label}</span>
                {keys && <Kbd>{keys}</Kbd>}
              </Command.Item>
            ))}
          </Command.List>
        </Command>
      </div>
    </div>
  );
}

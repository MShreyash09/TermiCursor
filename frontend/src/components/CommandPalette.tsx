import { useEffect, useState } from 'react';
import { Command } from 'cmdk';
import { Settings, RefreshCw, Terminal, Search, Folder } from 'lucide-react';

interface CommandPaletteProps {
  onToggleTerminal: () => void;
  onToggleSidebar: () => void;
  onOpenSettings: () => void;
}

export default function CommandPalette({ onToggleTerminal, onToggleSidebar, onOpenSettings }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.key === 'k' || e.key === 'p') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm flex items-start justify-center pt-[15vh]">
      <div className="bg-surface border border-border rounded-xl shadow-2xl w-[500px] overflow-hidden flex flex-col">
        <Command label="Command Palette" className="flex flex-col w-full h-full">
          <div className="flex items-center px-3 border-b border-border">
            <Search size={16} className="text-gray-500 mr-2" />
            <Command.Input 
              autoFocus
              placeholder="Type a command or search..." 
              className="w-full bg-transparent border-none focus:outline-none text-gray-200 py-3 text-sm" 
              id="command-palette-input"
            />
          </div>
          <Command.List className="max-h-[300px] overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-[#333]">
            <Command.Empty className="py-6 text-center text-sm text-gray-500">No results found.</Command.Empty>
            
            <Command.Group heading="General" className="text-xs text-gray-500 font-semibold mb-2 px-2 pt-2">
              <Command.Item 
                onSelect={() => { window.location.reload(); setOpen(false); }}
                className="flex items-center gap-2 px-2 py-2 rounded-md cursor-pointer hover:bg-surface-hover text-gray-300 aria-selected:bg-surface-hover aria-selected:text-white mt-1"
              >
                <RefreshCw size={14} />
                Reload Window
              </Command.Item>
              <Command.Item 
                onSelect={() => { onOpenSettings(); setOpen(false); }}
                className="flex items-center gap-2 px-2 py-2 rounded-md cursor-pointer hover:bg-surface-hover text-gray-300 aria-selected:bg-surface-hover aria-selected:text-white"
              >
                <Settings size={14} />
                Open Settings
              </Command.Item>
              <Command.Item 
                onSelect={() => { onToggleTerminal(); setOpen(false); }}
                className="flex items-center gap-2 px-2 py-2 rounded-md cursor-pointer hover:bg-surface-hover text-gray-300 aria-selected:bg-surface-hover aria-selected:text-white"
              >
                <Terminal size={14} />
                Toggle Terminal
              </Command.Item>
              <Command.Item 
                onSelect={() => { onToggleSidebar(); setOpen(false); }}
                className="flex items-center gap-2 px-2 py-2 rounded-md cursor-pointer hover:bg-surface-hover text-gray-300 aria-selected:bg-surface-hover aria-selected:text-white"
              >
                <Folder size={14} />
                Toggle File Tree Sidebar
              </Command.Item>
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  );
}


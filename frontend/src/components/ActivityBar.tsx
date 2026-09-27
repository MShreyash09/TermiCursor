import { Files, Settings, User, Bot } from 'lucide-react';

interface ActivityBarProps {
  activeView?: string;
  onViewChange?: (view: string) => void;
  onToggleAgent?: () => void;
}

export default function ActivityBar({ activeView = 'explorer', onViewChange, onToggleAgent }: ActivityBarProps) {
  const button = (id: string, Icon: typeof Files, title: string, onClick: () => void, active = false) => (
    <button
      key={id}
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`relative h-11 w-full flex justify-center items-center transition-colors ${
        active ? 'text-fg' : 'text-dim hover:text-muted'
      }`}
    >
      {active && <span className="absolute left-0 top-2 bottom-2 w-[2px] rounded-r bg-primary" />}
      <Icon size={20} strokeWidth={1.6} />
    </button>
  );

  return (
    <div className="w-12 h-full bg-surface border-r border-border flex flex-col justify-between items-center py-1 shrink-0 z-40">
      <div className="flex flex-col items-center w-full">
        {button('explorer', Files, 'Explorer (Ctrl+B)', () => onViewChange?.('explorer'), activeView === 'explorer')}
        {button('agent', Bot, 'Agent panel (Ctrl+L)', () => onToggleAgent?.())}
      </div>
      <div className="flex flex-col items-center w-full mb-1">
        {button('profile', User, 'Profile', () => onViewChange?.('profile'), activeView === 'profile')}
        {button('settings', Settings, 'Settings (Ctrl+,)', () => onViewChange?.('settings'), activeView === 'settings')}
      </div>
    </div>
  );
}

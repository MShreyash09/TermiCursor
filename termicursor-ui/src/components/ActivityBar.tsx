import { Files, Search, GitBranch, Play, Blocks, Settings, User } from 'lucide-react';

interface ActivityBarProps {
  activeView?: string;
  onViewChange?: (view: string) => void;
}

export default function ActivityBar({ activeView = 'explorer', onViewChange }: ActivityBarProps) {
  const topItems = [
    { id: 'explorer', icon: Files },
    { id: 'search', icon: Search },
    { id: 'git', icon: GitBranch },
    { id: 'run', icon: Play },
    { id: 'extensions', icon: Blocks },
  ];

  const bottomItems = [
    { id: 'profile', icon: User },
    { id: 'settings', icon: Settings },
  ];

  const renderButton = (item: { id: string; icon: typeof Files }) => {
    const isActive = activeView === item.id;
    return (
      <button
        key={item.id}
        onClick={() => onViewChange?.(item.id)}
        className={`p-2 w-full flex justify-center cursor-pointer hover:bg-white/5 transition-colors border-l-2 ${
          isActive ? 'text-white border-white' : 'text-gray-400 hover:text-white border-transparent'
        }`}
      >
        <item.icon size={24} strokeWidth={1.5} />
      </button>
    );
  };

  return (
    <div className="w-12 h-full bg-[#051e20] border-r border-[#1a3a3a] flex flex-col justify-between items-center py-2 shrink-0 z-40">
      <div className="flex flex-col gap-4 items-center w-full">
        {topItems.map(renderButton)}
      </div>

      <div className="flex flex-col gap-4 items-center w-full mb-2">
        {bottomItems.map(renderButton)}
      </div>
    </div>
  );
}

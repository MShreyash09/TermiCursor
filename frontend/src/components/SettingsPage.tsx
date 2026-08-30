import { useState, useEffect } from 'react';
import { Palette, Type, Terminal, Cpu, Keyboard } from 'lucide-react';

interface SettingItemProps {
  label: string;
  description: string;
  children: React.ReactNode;
}

function SettingItem({ label, description, children }: SettingItemProps) {
  return (
    <div className="flex items-center justify-between py-3 px-4 hover:bg-white/5 rounded-lg transition-colors">
      <div className="flex-1 mr-4">
        <div className="text-sm text-gray-200">{label}</div>
        <div className="text-xs text-gray-500 mt-0.5">{description}</div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`w-10 h-5 rounded-full relative transition-colors cursor-pointer ${checked ? 'bg-[#1e4b4a]' : 'bg-[#2a2a2a]'}`}
    >
      <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  );
}

function Dropdown({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bg-[#0b2b2d] border border-[#1a4042] rounded px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-[#2b6b69] cursor-pointer"
    >
      {options.map(opt => (
        <option key={opt} value={opt}>{opt}</option>
      ))}
    </select>
  );
}

export default function SettingsPage() {
  const [settings, setSettings] = useState({
    theme: 'Dark',
    fontSize: '14',
    fontFamily: 'JetBrains Mono',
    wordWrap: true,
    minimap: true,
    autoSave: true,
    tabSize: '2',
    lineNumbers: true,
    bracketPairs: true,
    terminalShell: 'PowerShell',
    ollamaModel: 'llama3.2',
    ollamaUrl: 'http://localhost:11434',
    autoIngest: false,
    llmProvider: 'ollama',
    groqApiKey: '',
    groqModel: 'llama-3.1-8b-instant',
  });

  
  useEffect(() => {
    // @ts-ignore
    if (window.electronAPI && window.electronAPI.loadSettings) {
      // @ts-ignore
      window.electronAPI.loadSettings().then(loaded => {
        if (loaded && Object.keys(loaded).length > 0) {
          setSettings(prev => ({ ...prev, ...loaded }));
        }
      });
    }
  }, []);

  const saveToBackend = async (newSettings: any) => {
    // @ts-ignore
    if (window.electronAPI && window.electronAPI.saveSettings) {
      // @ts-ignore
      await window.electronAPI.saveSettings(newSettings);
      alert("Settings saved! Restarting backend is recommended if changing LLM provider.");
    }
  };

  const updateSetting = (key: string, value: string | boolean) => {

    setSettings(prev => {
      const next = { ...prev, [key]: value };
      saveToBackend(next);
      return next;
    });
  };

  const sections = [
    {
      title: 'Appearance',
      icon: Palette,
      items: [
        {
          label: 'Color Theme',
          description: 'Select the color theme for the editor',
          control: <Dropdown value={settings.theme} options={['Dark', 'Light', 'Monokai', 'Solarized', 'Nord']} onChange={(v) => updateSetting('theme', v)} />,
        },
        {
          label: 'Font Size',
          description: 'Controls the font size in pixels for the editor',
          control: <Dropdown value={settings.fontSize} options={['12', '13', '14', '15', '16', '18', '20']} onChange={(v) => updateSetting('fontSize', v)} />,
        },
        {
          label: 'Font Family',
          description: 'Controls the font family used in the editor',
          control: <Dropdown value={settings.fontFamily} options={['JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', 'Monaco']} onChange={(v) => updateSetting('fontFamily', v)} />,
        },
      ],
    },
    {
      title: 'Editor',
      icon: Type,
      items: [
        {
          label: 'Word Wrap',
          description: 'Controls how lines should wrap in the editor',
          control: <Toggle checked={settings.wordWrap} onChange={(v) => updateSetting('wordWrap', v)} />,
        },
        {
          label: 'Minimap',
          description: 'Controls whether the minimap is shown',
          control: <Toggle checked={settings.minimap} onChange={(v) => updateSetting('minimap', v)} />,
        },
        {
          label: 'Line Numbers',
          description: 'Controls the display of line numbers',
          control: <Toggle checked={settings.lineNumbers} onChange={(v) => updateSetting('lineNumbers', v)} />,
        },
        {
          label: 'Tab Size',
          description: 'Number of spaces a tab is equal to',
          control: <Dropdown value={settings.tabSize} options={['2', '4', '8']} onChange={(v) => updateSetting('tabSize', v)} />,
        },
        {
          label: 'Bracket Pair Colorization',
          description: 'Controls whether bracket pairs are colorized',
          control: <Toggle checked={settings.bracketPairs} onChange={(v) => updateSetting('bracketPairs', v)} />,
        },
        {
          label: 'Auto Save',
          description: 'Automatically save files after a delay',
          control: <Toggle checked={settings.autoSave} onChange={(v) => updateSetting('autoSave', v)} />,
        },
      ],
    },
    {
      title: 'Terminal',
      icon: Terminal,
      items: [
        {
          label: 'Default Shell',
          description: 'The default shell profile used for integrated terminal',
          control: <Dropdown value={settings.terminalShell} options={['PowerShell', 'Command Prompt', 'Git Bash', 'WSL']} onChange={(v) => updateSetting('terminalShell', v)} />,
        },
      ],
    },
    {
      title: 'AI / RAG',
      icon: Cpu,
      items: [
        {
          label: 'LLM Provider',
          description: 'Choose between local Ollama or cloud Groq',
          control: <Dropdown value={settings.llmProvider} options={['ollama', 'groq']} onChange={(v) => updateSetting('llmProvider', v)} />,
        },
        {
          label: 'Groq API Key',
          description: 'Required if using Groq provider',
          control: (
            <input
              type="password"
              value={settings.groqApiKey || ''}
              onChange={(e) => updateSetting('groqApiKey', e.target.value)}
              className="bg-[#0b2b2d] border border-[#1a4042] rounded px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-[#2b6b69] w-52"
            />
          ),
        },
        {
          label: 'Groq Model',
          description: 'Model to use on Groq',
          control: <Dropdown value={settings.groqModel || 'llama-3.1-8b-instant'} options={['llama-3.1-8b-instant', 'llama3-70b-8192', 'mixtral-8x7b-32768']} onChange={(v) => updateSetting('groqModel', v)} />,
        },
        {
          label: 'Ollama Model',
          description: 'The Ollama model used for code assistance (e.g. qwen:1.8b or qwen2.5-coder:1.5b)',
          control: (
            <input
              type="text"
              value={settings.ollamaModel || ''}
              onChange={(e) => updateSetting('ollamaModel', e.target.value)}
              className="bg-[#0b2b2d] border border-[#1a4042] rounded px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-[#2b6b69] w-52"
            />
          ),
        },
        {
          label: 'Ollama Server URL',
          description: 'URL of the Ollama server',
          control: (
            <input
              type="text"
              value={settings.ollamaUrl}
              onChange={(e) => updateSetting('ollamaUrl', e.target.value)}
              className="bg-[#0b2b2d] border border-[#1a4042] rounded px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-[#2b6b69] w-52"
            />
          ),
        },
        {
          label: 'Auto-Ingest on Open',
          description: 'Automatically ingest the codebase when a folder is opened',
          control: <Toggle checked={settings.autoIngest} onChange={(v) => updateSetting('autoIngest', v)} />,
        },
      ],
    },
    {
      title: 'Keyboard Shortcuts',
      icon: Keyboard,
      items: [
        {
          label: 'Toggle File Tree (Sidebar)',
          description: 'Shortcut to open or close the left sidebar',
          control: <div className="px-3 py-1.5 bg-[#0b2b2d] border border-[#1a4042] rounded text-sm font-mono text-gray-300">Ctrl + B</div>,
        },
        {
          label: 'Toggle Terminal',
          description: 'Shortcut to open or close the bottom terminal panel',
          control: <div className="px-3 py-1.5 bg-[#0b2b2d] border border-[#1a4042] rounded text-sm font-mono text-gray-300">Ctrl + `</div>,
        },
        {
          label: 'Toggle AI Chat',
          description: 'Shortcut to open or close the AI chat panel',
          control: <div className="px-3 py-1.5 bg-[#0b2b2d] border border-[#1a4042] rounded text-sm font-mono text-gray-300">Ctrl + L</div>,
        },
        {
          label: 'Open Settings',
          description: 'Shortcut to quickly jump to this settings page',
          control: <div className="px-3 py-1.5 bg-[#0b2b2d] border border-[#1a4042] rounded text-sm font-mono text-gray-300">Ctrl + ,</div>,
        },
        {
          label: 'Explorer View',
          description: 'Shortcut to quickly jump back to the Explorer view',
          control: <div className="px-3 py-1.5 bg-[#0b2b2d] border border-[#1a4042] rounded text-sm font-mono text-gray-300">Ctrl + E</div>,
        },
        {
          label: 'View Shortcuts',
          description: 'Shortcut to open the quick shortcuts overview panel',
          control: <div className="px-3 py-1.5 bg-[#0b2b2d] border border-[#1a4042] rounded text-sm font-mono text-gray-300">Ctrl + /</div>,
        },
      ],
    },
  ];

  return (
    <div className="flex-1 h-full bg-[#031c1d] flex flex-col items-center pt-24 overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: '#424242 transparent' }}>
      <div className="w-full max-w-2xl px-6 pb-12">
        <h1 className="text-2xl font-semibold text-gray-100 mb-2">Settings</h1>
        <p className="text-sm text-gray-500 mb-8">Customize your Termicursor IDE experience</p>

        {/* Search */}
        <div className="mb-8">
          <input
            type="text"
            placeholder="Search settings..."
            className="w-full bg-[#0b2b2d] border border-[#1a4042] rounded-lg px-4 py-2.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-[#2b6b69] transition-colors"
          />
        </div>

        {/* Sections */}
        <div className="space-y-6">
          {sections.map(section => (
            <div key={section.title}>
              <div className="flex items-center gap-2 mb-3 px-4">
                <section.icon size={16} className="text-gray-400" />
                <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{section.title}</h2>
              </div>
              <div className="bg-[#052122] border border-[#0f3435] rounded-lg overflow-hidden">
                {section.items.map((item, i) => (
                  <div key={item.label}>
                    {i > 0 && <div className="border-t border-[#0f3435] mx-4" />}
                    <SettingItem label={item.label} description={item.description}>
                      {item.control}
                    </SettingItem>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

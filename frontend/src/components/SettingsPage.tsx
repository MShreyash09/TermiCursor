import { useState, useEffect } from 'react';
import { Palette, Type, Terminal, Cpu, Keyboard, Trash2, Plus } from 'lucide-react';

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
    ollamaModel: 'qwen2.5-coder:3b',
    ollamaUrl: 'http://localhost:11434',
    autoIngest: false,
    llmProvider: 'ollama',
    groqApiKey: '',
    groqModel: 'llama-3.1-8b-instant',
    customProviders: [] as any[],
    autoApproveShell: false,
  });

  const [newProvider, setNewProvider] = useState({ name: '', apiKey: '', baseUrl: '', model: '' });
  const [availableOllamaModels, setAvailableOllamaModels] = useState<string[]>([]);
  
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

  useEffect(() => {
    if (settings.ollamaUrl) {
      fetch(`${settings.ollamaUrl}/api/tags`)
        .then(res => res.json())
        .then(data => {
          if (data && data.models) {
            const models = data.models.map((m: any) => m.name);
            setAvailableOllamaModels(models);
            // If current model is not in the list and there are models, maybe we don't force it, but let the user select.
          }
        })
        .catch(err => console.error("Failed to fetch Ollama models:", err));
    }
  }, [settings.ollamaUrl]);

  const saveToBackend = async (newSettings: any) => {
    // @ts-ignore
    if (window.electronAPI && window.electronAPI.saveSettings) {
      // @ts-ignore
      await window.electronAPI.saveSettings(newSettings);
    }
  };

  const updateSetting = (key: string, value: any) => {

    setSettings(prev => {
      const next = { ...prev, [key]: value };
      saveToBackend(next);
      return next;
    });
  };

  const addCustomProvider = () => {
    if (!newProvider.name || !newProvider.apiKey || !newProvider.model) {
      alert('Name, API Key, and Model are required.');
      return;
    }
    const updatedProviders = [...(settings.customProviders || []), newProvider];
    updateSetting('customProviders', updatedProviders);
    setNewProvider({ name: '', apiKey: '', baseUrl: '', model: '' });
  };

  const removeCustomProvider = (index: number) => {
    const updatedProviders = [...(settings.customProviders || [])];
    updatedProviders.splice(index, 1);
    updateSetting('customProviders', updatedProviders);
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
          description: 'Local Ollama keeps everything on this PC. Groq or custom providers use external APIs.',
          control: <Dropdown value={settings.llmProvider} options={['ollama', 'groq', ...(settings.customProviders || []).map((p: any) => p.name)]} onChange={(v) => updateSetting('llmProvider', v)} />,
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
          control: <Dropdown value={settings.groqModel || 'llama-3.1-8b-instant'} options={['llama-3.1-8b-instant', 'llama-3.3-70b-versatile']} onChange={(v) => updateSetting('groqModel', v)} />,
        },
        {
          label: 'Ollama Model',
          description: 'The Ollama model used for code assistance (e.g. qwen:1.8b or qwen2.5-coder:1.5b)',
          control: (
            <>
              <input
                type="text"
                list="ollama-models"
                value={settings.ollamaModel || ''}
                onChange={(e) => updateSetting('ollamaModel', e.target.value)}
                className="bg-[#0b2b2d] border border-[#1a4042] rounded px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-[#2b6b69] w-52"
              />
              <datalist id="ollama-models">
                {availableOllamaModels.map(model => (
                  <option key={model} value={model} />
                ))}
              </datalist>
            </>
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
          label: 'Auto-approve shell commands',
          description: 'Let the agent run commands without asking. Destructive ones (rm, del, git reset --hard…) always ask. Off is safer.',
          control: <Toggle checked={settings.autoApproveShell} onChange={(v) => updateSetting('autoApproveShell', v)} />,
        },
        {
          label: 'Auto-Ingest on Open',
          description: 'Automatically ingest the codebase when a folder is opened',
          control: <Toggle checked={settings.autoIngest} onChange={(v) => updateSetting('autoIngest', v)} />,
        },
        {
          label: 'Custom API Providers',
          description: 'Add custom OpenAI-compatible models (e.g. GLM, DeepSeek, Together, Kimi)',
          control: (
            <div className="flex flex-col gap-3 mt-2 min-w-[300px]">
              {(settings.customProviders || []).map((provider: any, idx: number) => (
                <div key={idx} className="flex items-center justify-between bg-[#081e1f] p-2 rounded border border-[#1a4042]">
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-gray-200">{provider.name}</span>
                    <span className="text-xs text-gray-500">{provider.model}</span>
                  </div>
                  <button onClick={() => removeCustomProvider(idx)} className="text-red-400 hover:text-red-300 p-1">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <div className="flex flex-col gap-2 p-3 bg-[#0a2324] border border-[#1a4042] rounded-lg mt-2">
                <input type="text" placeholder="Provider Name (e.g. OpenAI)" value={newProvider.name} onChange={e => setNewProvider(p => ({...p, name: e.target.value}))} className="bg-[#0b2b2d] border border-[#1a4042] rounded px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-primary" />
                <input type="text" placeholder="Model Name (e.g. gpt-4o)" value={newProvider.model} onChange={e => setNewProvider(p => ({...p, model: e.target.value}))} className="bg-[#0b2b2d] border border-[#1a4042] rounded px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-primary" />
                <input type="password" placeholder="API Key" value={newProvider.apiKey} onChange={e => setNewProvider(p => ({...p, apiKey: e.target.value}))} className="bg-[#0b2b2d] border border-[#1a4042] rounded px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-primary" />
                <input type="text" placeholder="Base URL (Optional)" value={newProvider.baseUrl} onChange={e => setNewProvider(p => ({...p, baseUrl: e.target.value}))} className="bg-[#0b2b2d] border border-[#1a4042] rounded px-3 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-primary" />
                <button onClick={addCustomProvider} className="flex items-center justify-center gap-1 bg-[#1e4b4a] hover:bg-[#2b6b69] text-white rounded px-3 py-1.5 text-xs transition-colors mt-1">
                  <Plus size={14} /> Add Provider
                </button>
              </div>
            </div>
          )
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

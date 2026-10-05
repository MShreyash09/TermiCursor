import { useState, useEffect, useRef, type ReactNode } from 'react';
import { Type, Terminal, Cpu, Keyboard, Trash2, Plus, Search, Check, ShieldCheck, Plug } from 'lucide-react';
import { Kbd, quotaText } from './ui';
import { backendUrl } from '../backend';

interface Skill { name: string; description: string; body: string }
const EMPTY_SKILL: Skill = { name: '', description: '', body: '' };
const MCP_EXAMPLE = `{
  "github": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-github"], "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "..." } },
  "docs": { "url": "https://example.com/mcp" }
}`;

// Official OpenAI-compatible endpoints; the user only pastes a key.
const PRESETS = [
  { name: 'Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.5-flash' },
  { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { name: 'Anthropic', baseUrl: 'https://api.anthropic.com/v1', model: 'claude-sonnet-5-5' },
  { name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'openrouter/auto' },
];

const inputClass =
  'bg-background border border-border-strong rounded-md px-2.5 py-1.5 text-[12.5px] text-fg placeholder:text-dim focus:outline-none focus:border-primary/60';

function Toggle({ checked, onChange, testId }: { checked: boolean; onChange: (v: boolean) => void; testId?: string }) {
  return (
    <button role="switch" aria-checked={checked} onClick={() => onChange(!checked)} data-testid={testId}
      className={`w-9 h-5 rounded-full relative transition-colors ${checked ? 'bg-primary' : 'bg-border-strong'}`}>
      <span className={`absolute top-0.5 w-4 h-4 rounded-full transition-transform ${checked ? 'translate-x-[18px] bg-black' : 'translate-x-0.5 bg-muted'}`} />
    </button>
  );
}

function Dropdown({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={`${inputClass} pr-7 cursor-pointer min-w-[150px]`}>
      {options.map(opt => <option key={opt} value={opt} className="bg-surface">{opt}</option>)}
    </select>
  );
}

interface Item { label: string; description: string; control: ReactNode; wide?: boolean }
interface Section { title: string; icon: typeof Type; items: Item[] }

const SHORTCUTS: [string, string][] = [
  ['Ctrl+L', 'Toggle the agent panel'], ['Ctrl+B', 'Toggle the explorer'], ['Ctrl+`', 'Toggle the terminal'],
  ['Ctrl+P', 'Command palette'], ['Ctrl+,', 'Settings'], ['Ctrl+E', 'Back to the explorer'], ['Ctrl+/', 'Shortcut overview'],
  ['Ctrl+S', 'Save the current file'],
];

export default function SettingsPage({ quota, port }: { quota?: Record<string, any>; port?: number }) {
  const [settings, setSettings] = useState({
    fontSize: '14',
    fontFamily: 'Cascadia Mono',
    wordWrap: false,
    minimap: true,
    autoSave: false,
    tabSize: '4',
    lineNumbers: true,
    bracketPairs: true,
    terminalShell: 'PowerShell',
    ollamaModel: 'qwen2.5-coder:3b',
    ollamaUrl: 'http://localhost:11434',
    autoIngest: true,
    llmProvider: 'ollama',
    groqApiKey: '',
    groqModel: 'llama-3.1-8b-instant',
    customProviders: [] as any[],
    autoApproveShell: false,
    mcpServers: {} as Record<string, any>,
  });
  const [mcpDraft, setMcpDraft] = useState('');
  const [mcpError, setMcpError] = useState('');
  const [skills, setSkills] = useState<Skill[]>([]);
  const [editing, setEditing] = useState<Skill | null>(null);  // skill open in the editor (new or existing)
  const [skillError, setSkillError] = useState('');
  const [newProvider, setNewProvider] = useState({ name: '', apiKey: '', baseUrl: '', model: '' });
  const [providerError, setProviderError] = useState('');
  const [availableOllamaModels, setAvailableOllamaModels] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [saved, setSaved] = useState(false);
  const savedTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    (window as any).electronAPI?.loadSettings?.().then((loaded: any) => {
      if (loaded && Object.keys(loaded).length > 0) setSettings(prev => ({ ...prev, ...loaded }));
      const servers = loaded?.mcpServers;
      setMcpDraft(servers && Object.keys(servers).length ? JSON.stringify(servers, null, 2) : '');
    });
  }, []);

  const loadSkills = () => {
    if (!port) return;
    fetch(backendUrl(port, '/skills')).then(r => r.json()).then(setSkills).catch(() => setSkills([]));
  };
  useEffect(loadSkills, [port]);

  const saveMcp = () => {
    try {
      const parsed = mcpDraft.trim() ? JSON.parse(mcpDraft) : {};
      if (typeof parsed !== 'object' || Array.isArray(parsed) || parsed === null) throw new Error('Must be a JSON object of servers.');
      for (const [name, cfg] of Object.entries<any>(parsed)) {
        if (!cfg || (typeof cfg.command !== 'string' && typeof cfg.url !== 'string')) throw new Error(`"${name}" needs a "command" or a "url".`);
      }
      setMcpError('');
      updateSetting('mcpServers', parsed);
    } catch (e: any) {
      setMcpError(e.message || 'Invalid JSON.');
    }
  };

  const saveSkill = async () => {
    if (!editing || !port) return;
    const res = await fetch(backendUrl(port, `/skills/${encodeURIComponent(editing.name)}`), {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: editing.description, body: editing.body }),
    }).catch(() => null);
    if (!res?.ok) {
      setSkillError((await res?.json().catch(() => null))?.detail || 'Could not save the skill (is the backend running?).');
      return;
    }
    setSkillError('');
    setEditing(null);
    loadSkills();
  };

  const deleteSkill = async (name: string) => {
    if (!port) return;
    await fetch(backendUrl(port, `/skills/${encodeURIComponent(name)}`), { method: 'DELETE' }).catch(() => null);
    if (editing?.name === name) setEditing(null);
    loadSkills();
  };

  useEffect(() => {
    if (!settings.ollamaUrl) return;
    fetch(`${settings.ollamaUrl}/api/tags`)
      .then(res => res.json())
      .then(data => { if (data?.models) setAvailableOllamaModels(data.models.map((m: any) => m.name)); })
      .catch(() => setAvailableOllamaModels([]));
  }, [settings.ollamaUrl]);

  const updateSetting = (key: string, value: any) => {
    setSettings(prev => {
      const next = { ...prev, [key]: value };
      (window as any).electronAPI?.saveSettings?.(next)?.then?.(() => {
        setSaved(true);
        window.clearTimeout(savedTimer.current);
        savedTimer.current = window.setTimeout(() => setSaved(false), 1500);
      });
      return next;
    });
  };

  const addCustomProvider = () => {
    if (!newProvider.name || !newProvider.apiKey || !newProvider.model) {
      setProviderError('Name, model and API key are required.');
      return;
    }
    setProviderError('');
    updateSetting('customProviders', [...(settings.customProviders || []), newProvider]);
    setNewProvider({ name: '', apiKey: '', baseUrl: '', model: '' });
  };

  const removeCustomProvider = (index: number) => {
    const updated = [...(settings.customProviders || [])];
    updated.splice(index, 1);
    updateSetting('customProviders', updated);
  };

  const cloud = settings.llmProvider !== 'ollama';
  const sections: Section[] = [
    {
      title: 'Agent & models',
      icon: Cpu,
      items: [
        {
          label: 'LLM provider',
          description: cloud
            ? 'A cloud API: your prompts and the code the agent reads are sent to this provider.'
            : 'Ollama runs the model on this PC; your code stays local.',
          control: <Dropdown value={settings.llmProvider} options={['ollama', 'groq', ...(settings.customProviders || []).map((p: any) => p.name)]} onChange={(v) => updateSetting('llmProvider', v)} />,
        },
        {
          label: 'Ollama model',
          description: 'The local model the agent uses. Pick an installed one or type a name.',
          control: (
            <>
              <input type="text" list="ollama-models" value={settings.ollamaModel || ''} onChange={(e) => updateSetting('ollamaModel', e.target.value)} className={`${inputClass} w-56 font-mono`} />
              <datalist id="ollama-models">{availableOllamaModels.map(m => <option key={m} value={m} />)}</datalist>
            </>
          ),
        },
        {
          label: 'Ollama server URL',
          description: 'Where Ollama is listening.',
          control: <input type="text" value={settings.ollamaUrl} onChange={(e) => updateSetting('ollamaUrl', e.target.value)} className={`${inputClass} w-56 font-mono`} />,
        },
        {
          label: 'Auto-approve shell commands',
          description: 'Run the agent\'s commands without asking. Destructive ones (rm, del, git reset --hard…) always ask. Off is safer.',
          control: <Toggle checked={settings.autoApproveShell} onChange={(v) => updateSetting('autoApproveShell', v)} testId="setting-auto-approve" />,
        },
        {
          label: 'Index project on open',
          description: 'Build the local search index when a folder opens, for meaning-based code search. Exact search works either way.',
          control: <Toggle checked={settings.autoIngest} onChange={(v) => updateSetting('autoIngest', v)} />,
        },
        {
          label: 'Groq API key',
          description: 'Needed only when the provider is groq.',
          control: <input type="password" value={settings.groqApiKey || ''} onChange={(e) => updateSetting('groqApiKey', e.target.value)} className={`${inputClass} w-56`} />,
        },
        {
          label: 'Groq model',
          description: `Model to use on Groq. Usage: ${quotaText(quota?.groq)}`,
          control: <Dropdown value={settings.groqModel || 'llama-3.1-8b-instant'} options={['llama-3.1-8b-instant', 'llama-3.3-70b-versatile']} onChange={(v) => updateSetting('groqModel', v)} />,
        },
        {
          label: 'Custom API providers',
          description: 'OpenAI-compatible APIs (Gemini, OpenAI, Anthropic, OpenRouter, DeepSeek…). Pick a preset, paste your key, then select it as the provider above.',
          wide: true,
          control: (
            <div className="flex flex-col gap-2 w-full">
              {(settings.customProviders || []).map((p: any, idx: number) => (
                <div key={idx} className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-[12.5px] text-fg">{p.name}</div>
                    <div className="text-[11px] text-dim font-mono truncate">{p.model} · {p.baseUrl || 'api.openai.com/v1'}</div>
                    <div className="text-[11px] text-muted font-mono">{quotaText(quota?.[p.name.toLowerCase()])}</div>
                  </div>
                  <button onClick={() => removeCustomProvider(idx)} title="Remove" className="p-1 text-dim hover:text-danger"><Trash2 size={13} /></button>
                </div>
              ))}
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map(pr => (
                  <button key={pr.name} onClick={() => setNewProvider(p => ({ ...p, ...pr }))}
                    className="rounded-md border border-border-strong px-2 py-0.5 text-[11.5px] text-muted hover:text-fg hover:border-primary/40">{pr.name}</button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2 rounded-md border border-dashed border-border-strong p-2.5">
                <input placeholder="Name (e.g. DeepSeek)" value={newProvider.name} onChange={e => setNewProvider(p => ({ ...p, name: e.target.value }))} className={inputClass} />
                <input placeholder="Model (e.g. deepseek-chat)" value={newProvider.model} onChange={e => setNewProvider(p => ({ ...p, model: e.target.value }))} className={inputClass} />
                <input type="password" placeholder="API key" value={newProvider.apiKey} onChange={e => setNewProvider(p => ({ ...p, apiKey: e.target.value }))} className={inputClass} />
                <input placeholder="Base URL (optional)" value={newProvider.baseUrl} onChange={e => setNewProvider(p => ({ ...p, baseUrl: e.target.value }))} className={inputClass} />
                <div className="col-span-2 flex items-center justify-between">
                  <span className="text-[11.5px] text-danger">{providerError}</span>
                  <button onClick={addCustomProvider} className="flex items-center gap-1 rounded-md border border-primary/40 px-2.5 py-1 text-[12px] text-primary hover:bg-primary/10">
                    <Plus size={12} /> Add provider
                  </button>
                </div>
              </div>
            </div>
          ),
        },
      ],
    },
    {
      title: 'Skills & MCP',
      icon: Plug,
      items: [
        {
          label: 'Skills',
          description: 'Instructions the agent loads when a task fits, e.g. your API conventions or test style. Only the name and description sit in the prompt. Per-project skills go in .termicursor/skills/<name>/SKILL.md.',
          wide: true,
          control: (
            <div className="flex flex-col gap-2 w-full" data-testid="skills-editor">
              {skills.map(s => (
                <div key={s.name} className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2">
                  <button onClick={() => { setEditing({ ...s }); setSkillError(''); }} className="min-w-0 text-left">
                    <div className="text-[12.5px] text-fg font-mono">{s.name}</div>
                    <div className="text-[11px] text-dim truncate">{s.description || '(no description)'}</div>
                  </button>
                  <button onClick={() => deleteSkill(s.name)} title="Delete" className="p-1 text-dim hover:text-danger"><Trash2 size={13} /></button>
                </div>
              ))}
              {editing ? (
                <div className="flex flex-col gap-2 rounded-md border border-dashed border-border-strong p-2.5">
                  <input placeholder="name (e.g. api-style)" value={editing.name} disabled={skills.some(s => s.name === editing.name)}
                    onChange={e => setEditing({ ...editing, name: e.target.value.toLowerCase() })} className={`${inputClass} font-mono`} />
                  <input placeholder="One line: when should the agent use this?" value={editing.description}
                    onChange={e => setEditing({ ...editing, description: e.target.value })} className={inputClass} />
                  <textarea placeholder="Instructions (markdown)" value={editing.body} rows={8}
                    onChange={e => setEditing({ ...editing, body: e.target.value })} className={`${inputClass} font-mono resize-y`} />
                  <div className="flex items-center justify-between">
                    <span className="text-[11.5px] text-danger">{skillError}</span>
                    <div className="flex gap-2">
                      <button onClick={() => setEditing(null)} className="rounded-md border border-border-strong px-2.5 py-1 text-[12px] text-muted hover:text-fg">Cancel</button>
                      <button onClick={saveSkill} className="flex items-center gap-1 rounded-md border border-primary/40 px-2.5 py-1 text-[12px] text-primary hover:bg-primary/10"><Check size={12} /> Save skill</button>
                    </div>
                  </div>
                </div>
              ) : (
                <button onClick={() => { setEditing({ ...EMPTY_SKILL }); setSkillError(''); }} disabled={!port}
                  className="self-start flex items-center gap-1 rounded-md border border-primary/40 px-2.5 py-1 text-[12px] text-primary hover:bg-primary/10 disabled:opacity-40">
                  <Plus size={12} /> New skill
                </button>
              )}
            </div>
          ),
        },
        {
          label: 'MCP servers (connectors)',
          description: 'External tools such as GitHub, Slack, databases or docs. Same format as Claude Desktop\'s mcpServers, so you can paste entries. Each server has a "command" (runs locally) or a "url". The agent asks before running any MCP tool.',
          wide: true,
          control: (
            <div className="flex flex-col gap-2 w-full" data-testid="mcp-editor">
              {Object.keys(settings.mcpServers || {}).length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {Object.keys(settings.mcpServers).map(n => (
                    <span key={n} className="rounded-md border border-border bg-background px-2 py-0.5 text-[11.5px] font-mono text-muted">{n}</span>
                  ))}
                </div>
              )}
              <textarea value={mcpDraft} onChange={e => setMcpDraft(e.target.value)} placeholder={MCP_EXAMPLE} rows={8} spellCheck={false}
                className={`${inputClass} font-mono resize-y`} />
              <div className="flex items-center justify-between">
                <span className="text-[11.5px] text-danger">{mcpError}</span>
                <button onClick={saveMcp} className="flex items-center gap-1 rounded-md border border-primary/40 px-2.5 py-1 text-[12px] text-primary hover:bg-primary/10">
                  <Check size={12} /> Save servers
                </button>
              </div>
            </div>
          ),
        },
      ],
    },
    {
      title: 'Editor',
      icon: Type,
      items: [
        { label: 'Font size', description: 'Editor and terminal text size, in pixels.', control: <Dropdown value={String(settings.fontSize)} options={['12', '13', '14', '15', '16', '18', '20']} onChange={(v) => updateSetting('fontSize', v)} /> },
        { label: 'Font family', description: 'Monospace font for the editor and terminal (falls back to Cascadia Mono).', control: <Dropdown value={settings.fontFamily} options={['Cascadia Mono', 'Cascadia Code', 'JetBrains Mono', 'Fira Code', 'Consolas']} onChange={(v) => updateSetting('fontFamily', v)} /> },
        { label: 'Word wrap', description: 'Wrap long lines to the editor width.', control: <Toggle checked={settings.wordWrap} onChange={(v) => updateSetting('wordWrap', v)} /> },
        { label: 'Minimap', description: 'Show the code overview on the right.', control: <Toggle checked={settings.minimap} onChange={(v) => updateSetting('minimap', v)} /> },
        { label: 'Line numbers', description: 'Show line numbers in the gutter.', control: <Toggle checked={settings.lineNumbers} onChange={(v) => updateSetting('lineNumbers', v)} /> },
        { label: 'Tab size', description: 'Spaces per indentation level.', control: <Dropdown value={String(settings.tabSize)} options={['2', '4', '8']} onChange={(v) => updateSetting('tabSize', v)} /> },
        { label: 'Bracket pair colors', description: 'Color matching brackets.', control: <Toggle checked={settings.bracketPairs} onChange={(v) => updateSetting('bracketPairs', v)} /> },
        { label: 'Auto save', description: 'Save files a moment after you stop typing.', control: <Toggle checked={settings.autoSave} onChange={(v) => updateSetting('autoSave', v)} /> },
      ],
    },
    {
      title: 'Terminal',
      icon: Terminal,
      items: [
        { label: 'Shell', description: 'Used for new terminals (reopen the folder to switch).', control: <Dropdown value={settings.terminalShell} options={['PowerShell', 'Command Prompt', 'Git Bash', 'WSL']} onChange={(v) => updateSetting('terminalShell', v)} /> },
      ],
    },
  ];

  const q = query.trim().toLowerCase();
  const visible = sections
    .map(s => ({ ...s, items: s.items.filter(i => !q || `${i.label} ${i.description} ${s.title}`.toLowerCase().includes(q)) }))
    .filter(s => s.items.length > 0);
  const showShortcuts = !q || 'keyboard shortcuts'.includes(q) || SHORTCUTS.some(([, d]) => d.toLowerCase().includes(q));

  return (
    <div className="flex-1 h-full bg-background overflow-y-auto" data-testid="settings-page">
      <div className="w-full max-w-3xl mx-auto px-8 pt-10 pb-16">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h1 className="text-[20px] font-semibold text-fg">Settings</h1>
            <p className="text-[12.5px] text-dim mt-1">Changes save automatically and apply to the next agent run.</p>
          </div>
          <span className={`flex items-center gap-1 text-[12px] text-primary transition-opacity ${saved ? 'opacity-100' : 'opacity-0'}`}>
            <Check size={13} /> Saved
          </span>
        </div>

        <div className="relative mb-8">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-dim" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search settings"
            className={`${inputClass} w-full pl-9 py-2`} />
        </div>

        <div className="space-y-8">
          {visible.map(section => (
            <section key={section.title}>
              <h2 className="flex items-center gap-2 mb-2.5 font-mono text-[11px] tracking-[0.12em] text-dim">
                <section.icon size={13} /> {section.title.toUpperCase()}
              </h2>
              <div className="rounded-lg border border-border bg-surface divide-y divide-border">
                {section.items.map(item => (
                  <div key={item.label} className={`px-4 py-3 ${item.wide ? 'space-y-3' : 'flex items-center justify-between gap-6'}`}>
                    <div className="min-w-0">
                      <div className="text-[13px] text-fg">{item.label}</div>
                      <div className="text-[12px] text-dim mt-0.5 leading-snug">{item.description}</div>
                    </div>
                    <div className={item.wide ? '' : 'shrink-0'}>{item.control}</div>
                  </div>
                ))}
              </div>
            </section>
          ))}

          {showShortcuts && (
            <section>
              <h2 className="flex items-center gap-2 mb-2.5 font-mono text-[11px] tracking-[0.12em] text-dim">
                <Keyboard size={13} /> KEYBOARD SHORTCUTS
              </h2>
              <div className="rounded-lg border border-border bg-surface divide-y divide-border">
                {SHORTCUTS.map(([keys, desc]) => (
                  <div key={keys} className="px-4 py-2.5 flex items-center justify-between text-[12.5px]">
                    <span className="text-muted">{desc}</span><Kbd>{keys}</Kbd>
                  </div>
                ))}
              </div>
            </section>
          )}

          {visible.length === 0 && !showShortcuts && <p className="text-[12.5px] text-dim">No settings match “{query}”.</p>}

          <p className="flex items-center gap-2 text-[11.5px] text-dim"><ShieldCheck size={13} className="text-primary" /> Settings are stored on this PC only.</p>
        </div>
      </div>
    </div>
  );
}

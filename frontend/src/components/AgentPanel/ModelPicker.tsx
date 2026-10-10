import { useEffect, useState } from 'react';
import { Cpu } from 'lucide-react';

// Composer model switcher: local Ollama models + API providers from Settings.
// Writes llmProvider / ollamaModel to settings.json; the backend re-reads it per run.
export default function ModelPicker({ ollamaModels = [], disabled }: { ollamaModels?: string[]; disabled?: boolean }) {
  const [settings, setSettings] = useState<any>(null);
  const api = (window as any).electronAPI;

  useEffect(() => {
    api?.loadSettings?.().then(setSettings);
    return api?.onSettingsChanged?.(setSettings);  // providers added/removed in Settings
  }, []);

  if (!settings) return null;
  const providers: { name: string; model: string }[] = settings.customProviders || [];
  const current = settings.ollamaModel || 'qwen2.5-coder:3b';
  const local = [...new Set([current, ...ollamaModels.filter(m => !m.includes('embed'))])];
  const value = (settings.llmProvider || 'ollama') === 'ollama' ? `ollama::${current}` : `provider::${settings.llmProvider}`;

  const pick = async (v: string) => {
    const [kind, name] = [v.slice(0, v.indexOf('::')), v.slice(v.indexOf('::') + 2)];
    const patch = kind === 'ollama' ? { llmProvider: 'ollama', ollamaModel: name } : { llmProvider: name };
    const fresh = { ...((await api?.loadSettings?.()) ?? settings), ...patch };
    setSettings(fresh);
    await api?.saveSettings?.(fresh);
    window.dispatchEvent(new CustomEvent('model-picked', { detail: patch }));  // keeps an open Settings page in sync
  };

  return (
    <label className="flex min-w-0 items-center gap-1 rounded-md border border-border bg-background pl-1.5 text-dim hover:border-border-strong" title="Model the agent uses">
      <Cpu size={12} className="shrink-0" />
      <select value={value} onChange={e => pick(e.target.value)} disabled={disabled} data-testid="model-picker" aria-label="Model"
        className="min-w-0 max-w-[170px] cursor-pointer truncate bg-transparent py-[3px] pr-1 text-[11.5px] text-muted focus:outline-none disabled:opacity-40">
        <optgroup label="Local (Ollama)" className="bg-surface">
          {local.map(m => <option key={m} value={`ollama::${m}`} className="bg-surface">{m}</option>)}
        </optgroup>
        {providers.length > 0 && (
          <optgroup label="API providers" className="bg-surface">
            {providers.map(p => <option key={p.name} value={`provider::${p.name}`} className="bg-surface">{p.name} · {p.model}</option>)}
          </optgroup>
        )}
      </select>
    </label>
  );
}

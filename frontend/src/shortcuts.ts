import { useEffect, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';

// App-wide keyboard shortcuts. Users rebind them in Settings; overrides live in
// settings.json as `keybindings: { [actionId]: "Ctrl+Shift+K" }`.
export const SHORTCUT_ACTIONS = [
  { id: 'toggleAgent', label: 'Toggle the agent panel', keys: 'Ctrl+L' },
  { id: 'toggleExplorer', label: 'Toggle the explorer', keys: 'Ctrl+B' },
  { id: 'toggleTerminal', label: 'Toggle the terminal', keys: 'Ctrl+`' },
  { id: 'commandPalette', label: 'Command palette', keys: 'Ctrl+P' },
  { id: 'openSettings', label: 'Settings', keys: 'Ctrl+,' },
  { id: 'explorerView', label: 'Back to the explorer', keys: 'Ctrl+E' },
  { id: 'showShortcuts', label: 'Shortcut overview', keys: 'Ctrl+/' },
] as const;

export type ShortcutId = typeof SHORTCUT_ACTIONS[number]['id'];
export type Keybindings = Record<ShortcutId, string>;

export function resolveBindings(overrides?: Partial<Record<string, string>>): Keybindings {
  return Object.fromEntries(SHORTCUT_ACTIONS.map(a => [a.id, overrides?.[a.id] || a.keys])) as Keybindings;
}

// "Ctrl+Shift+K" style; null while only modifiers are held.
export function comboFromEvent(e: KeyboardEvent | ReactKeyboardEvent): string | null {
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return null;
  const key = e.key === ' ' ? 'Space' : e.key.length === 1 ? e.key.toUpperCase() : e.key;
  return [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', key].filter(Boolean).join('+');
}

export function findAction(bindings: Keybindings, e: KeyboardEvent): ShortcutId | undefined {
  const combo = comboFromEvent(e);
  return combo ? (Object.keys(bindings) as ShortcutId[]).find(id => bindings[id] === combo) : undefined;
}

// Current bindings, live-updated when Settings saves.
export function useKeybindings(): Keybindings {
  const [bindings, setBindings] = useState(() => resolveBindings());
  useEffect(() => {
    const api = (window as any).electronAPI;
    api?.loadSettings?.().then((s: any) => setBindings(resolveBindings(s?.keybindings)));
    return api?.onSettingsChanged?.((s: any) => setBindings(resolveBindings(s?.keybindings)));
  }, []);
  return bindings;
}

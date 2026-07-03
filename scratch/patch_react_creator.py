import os

# We will create a node script to patch the react files, as it's easier to write standard replace scripts in python.
# Actually I can just write a python script like before.

patch_react = """import os
import re

app_file = "termicursor-ui/src/App.tsx"
with open(app_file, "r", encoding="utf-8") as f:
    app_content = f.read()

# 1. Add backendPort state and useEffect
if "backendPort" not in app_content:
    old_state = "const [fileTreeRefreshKey, setFileTreeRefreshKey] = useState(0);"
    new_state = \"\"\"const [fileTreeRefreshKey, setFileTreeRefreshKey] = useState(0);
  const [backendPort, setBackendPort] = useState(8000);
  const [backendStatus, setBackendStatus] = useState<any>(null);
  const [settings, setSettings] = useState<any>({});

  import { useEffect } from 'react';
  useEffect(() => {
    // @ts-ignore
    if (window.electronAPI && window.electronAPI.getBackendPort) {
      // @ts-ignore
      window.electronAPI.getBackendPort().then((port: number) => {
        setBackendPort(port);
        // Check status
        fetch(`http://127.0.0.1:${port}/status`)
          .then(res => res.json())
          .then(data => setBackendStatus(data))
          .catch(e => console.error("Status check failed", e));
      });
      // @ts-ignore
      window.electronAPI.loadSettings().then(setSettings);
    }
  }, []);
\"\"\"
    app_content = app_content.replace(old_state, new_state)

# 2. Update hardcoded 8000 in App.tsx
app_content = app_content.replace("http://127.0.0.1:8000/ingest", "http://127.0.0.1:${backendPort}/ingest")
app_content = app_content.replace("fetch('http://127.0.0.1:${backendPort}/ingest'", "fetch(`http://127.0.0.1:${backendPort}/ingest`")

# 3. Pass backendPort to Sidebar
app_content = app_content.replace("<Sidebar", "<Sidebar backendPort={backendPort}")

# 4. Show Ollama Error Banner
if "backendStatus?.status === 'error'" not in app_content:
    old_titlebar = "<TitleBar />"
    new_titlebar = \"\"\"<TitleBar />
      {backendStatus && backendStatus.status === 'error' && (
        <div className="bg-red-900/80 text-white px-4 py-2 text-sm flex justify-center items-center">
          <span className="font-bold mr-2">Ollama Error:</span>
          It seems Ollama is not running or missing required models (nomic-embed-text, qwen2.5-coder:3b). Please start Ollama or pull the models.
        </div>
      )}
\"\"\"
    app_content = app_content.replace(old_titlebar, new_titlebar)

with open(app_file, "w", encoding="utf-8") as f:
    f.write(app_content)


# Now update Sidebar.tsx
sidebar_file = "termicursor-ui/src/components/Sidebar.tsx"
with open(sidebar_file, "r", encoding="utf-8") as f:
    sidebar_content = f.read()

sidebar_content = sidebar_content.replace("interface SidebarProps {", "interface SidebarProps {\\n  backendPort?: number;")
sidebar_content = sidebar_content.replace("export default function Sidebar({ projectPath, isIngesting, onFilesCreated }: SidebarProps) {", "export default function Sidebar({ projectPath, isIngesting, onFilesCreated, backendPort = 8000 }: SidebarProps) {")
sidebar_content = sidebar_content.replace("'ws://127.0.0.1:8000/ws/chat'", "`ws://127.0.0.1:${backendPort}/ws/chat`")

with open(sidebar_file, "w", encoding="utf-8") as f:
    f.write(sidebar_content)


# Finally, SettingsPage.tsx
settings_file = "termicursor-ui/src/components/SettingsPage.tsx"
with open(settings_file, "r", encoding="utf-8") as f:
    settings_content = f.read()

if "import { useEffect" not in settings_content:
    settings_content = settings_content.replace("import { useState } from 'react';", "import { useState, useEffect } from 'react';")

# Add missing fields to settings state
old_settings_state = "autoIngest: false,"
new_settings_state = "autoIngest: false,\\n    llmProvider: 'ollama',\\n    groqApiKey: '',\\n    groqModel: 'llama-3.1-8b-instant',"
settings_content = settings_content.replace(old_settings_state, new_settings_state)

# Load settings from IPC
if "loadSettings" not in settings_content:
    old_updateSetting = "const updateSetting = (key: string, value: string | boolean) => {"
    new_updateSetting = \"\"\"
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
\"\"\"
    settings_content = settings_content.replace(old_updateSetting, new_updateSetting)

# Call saveToBackend after updating
old_set_prev = "setSettings(prev => ({ ...prev, [key]: value }));"
new_set_prev = \"\"\"setSettings(prev => {
      const next = { ...prev, [key]: value };
      saveToBackend(next);
      return next;
    });\"\"\"
settings_content = settings_content.replace(old_set_prev, new_set_prev)

# Add Groq UI to settings
old_ai_items = "title: 'AI / RAG',"
new_ai_items = \"\"\"title: 'AI / RAG',
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
\"\"\"
# We need to replace carefully to insert it at the start of the AI items list.
if "LLM Provider" not in settings_content:
    ai_find = \"\"\"    {
      title: 'AI / RAG',
      icon: Cpu,
      items: [
        {\"\"\"
    ai_replace = \"\"\"    {
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
        {\"\"\"
    settings_content = settings_content.replace(ai_find, ai_replace)

with open(settings_file, "w", encoding="utf-8") as f:
    f.write(settings_content)

print("React UI files updated for ports, settings, and Ollama status!")
"""

with open("scratch/patch_react.py", "w", encoding="utf-8") as f:
    f.write(patch_react)

print("Script written.")

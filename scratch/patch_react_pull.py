import re

app_file = "termicursor-ui/src/App.tsx"
with open(app_file, "r", encoding="utf-8") as f:
    app_content = f.read()

# 1. State definitions to add
state_find = """  const [backendPort, setBackendPort] = useState(8000);
  const [backendStatus, setBackendStatus] = useState<any>(null);"""

state_replace = """  const [backendPort, setBackendPort] = useState(8000);
  const [backendStatus, setBackendStatus] = useState<any>(null);
  const [isPullingModels, setIsPullingModels] = useState(false);
  const [pullProgress, setPullProgress] = useState<Record<string, number>>({});
  const [currentPullingModel, setCurrentPullingModel] = useState<string | null>(null);

  const checkStatus = (port: number = backendPort) => {
    fetch(`http://127.0.0.1:${port}/status`)
      .then(res => res.json())
      .then(data => setBackendStatus(data))
      .catch(e => console.error("Status check failed", e));
  };

  const handleInstallModels = async () => {
    if (!backendStatus?.missing_models || backendStatus.missing_models.length === 0) return;
    setIsPullingModels(true);
    
    for (const model of backendStatus.missing_models) {
      setCurrentPullingModel(model);
      setPullProgress(prev => ({ ...prev, [model]: 0 }));
      
      try {
        const response = await fetch(`http://127.0.0.1:${backendPort}/pull`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: model })
        });
        
        if (!response.body) throw new Error("No response body");
        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\\n");
          buffer = lines.pop() || "";
          
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const data = JSON.parse(line);
              if (data.error) {
                console.error("Pull error:", data.error);
                alert(`Error downloading ${model}: ${data.error}`);
                break;
              }
              if (data.total && data.completed) {
                const percent = Math.round((data.completed / data.total) * 100);
                setPullProgress(prev => ({ ...prev, [model]: percent }));
              }
            } catch (e) {
              // Ignore partial JSON parsing errors
            }
          }
        }
        
        setPullProgress(prev => ({ ...prev, [model]: 100 }));
      } catch (err) {
        console.error("Failed to pull model:", err);
        alert(`Failed to pull model ${model}. Make sure Ollama is running and has internet access.`);
      }
    }
    
    setCurrentPullingModel(null);
    setIsPullingModels(false);
    checkStatus();
  };"""

app_content = app_content.replace(state_find, state_replace)

# 2. Update status checking inside useEffect
use_effect_find = """      window.electronAPI.getBackendPort().then((port: number) => {
        setBackendPort(port);
        // Check status
        fetch(`http://127.0.0.1:${port}/status`)
          .then(res => res.json())
          .then(data => setBackendStatus(data))
          .catch(e => console.error("Status check failed", e));
      });"""

use_effect_replace = """      window.electronAPI.getBackendPort().then((port: number) => {
        setBackendPort(port);
        checkStatus(port);
      });"""

app_content = app_content.replace(use_effect_find, use_effect_replace)

# 3. Render banner logic replace
banner_find = """      {backendStatus && backendStatus.status === 'error' && (
        <div className="bg-red-900/80 text-white px-4 py-2 text-sm flex justify-center items-center">
          <span className="font-bold mr-2">Ollama Error:</span>
          It seems Ollama is not running or missing required models (nomic-embed-text, qwen2.5-coder:3b). Please start Ollama or pull the models.
        </div>
      )}"""

# Replace it with a nice overlay / banner with progress bar
banner_replace = """      {backendStatus && backendStatus.status === 'error' && (
        <div className="bg-[#1f0d0e]/95 border-b border-red-900/50 text-gray-200 px-6 py-4 flex flex-col md:flex-row justify-between items-center gap-4 transition-all z-50">
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-red-400 flex items-center gap-2">
              ⚠️ {backendStatus.reason === 'connection_error' ? 'Ollama Service Offline' : 'AI Models Missing'}
            </h2>
            <p className="text-xs text-gray-400 mt-1">
              {backendStatus.reason === 'connection_error' 
                ? 'Termicursor could not connect to your local Ollama. Please open the Ollama Desktop App.' 
                : `To use Termicursor locally, you need the following model(s) installed in Ollama: ${backendStatus.missing_models.join(', ')}`}
            </p>
            
            {backendStatus.reason === 'missing_models' && (
              <div className="mt-3 space-y-2 w-full max-w-md">
                {backendStatus.missing_models.map((model: string) => (
                  <div key={model} className="text-xs">
                    <div className="flex justify-between text-gray-400 mb-1">
                      <span>{model}</span>
                      <span>{pullProgress[model] ?? 0}%</span>
                    </div>
                    <div className="w-full bg-gray-800 rounded-full h-1.5 overflow-hidden">
                      <div 
                        className="bg-[#3794ff] h-1.5 rounded-full transition-all duration-300"
                        style={{ width: `${pullProgress[model] ?? 0}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          <div className="shrink-0 flex gap-3">
            <button 
              onClick={() => checkStatus()}
              disabled={isPullingModels}
              className="bg-[#1a3a3a] hover:bg-[#235353] text-gray-200 px-4 py-2 rounded text-xs transition-colors border border-[#2b6b69]/40 disabled:opacity-50"
            >
              Retry Connection
            </button>
            {backendStatus.reason === 'missing_models' && (
              <button 
                onClick={handleInstallModels}
                disabled={isPullingModels}
                className="bg-[#2b6b69] hover:bg-[#378885] text-white px-4 py-2 rounded text-xs transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {isPullingModels ? (
                  <>
                    <svg className="animate-spin h-3 w-3 text-white" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Downloading...
                  </>
                ) : 'Install Models'}
              </button>
            )}
          </div>
        </div>
      )}"""

app_content = app_content.replace(banner_find, banner_replace)

with open(app_file, "w", encoding="utf-8") as f:
    f.write(app_content)

print("App.tsx patched successfully with NDJSON pulling support!")

import { useState, useRef, useEffect } from 'react';
import { Send, Terminal, Loader2, ChevronDown } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface SidebarProps {
  backendPort?: number;
  projectPath: string;
  isIngesting?: boolean;
  onFilesCreated?: (files: string[]) => void;
}

export default function Sidebar({ projectPath, isIngesting, onFilesCreated, backendPort = 8000 }: SidebarProps) {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: "Hello! I am Termicursor. How can I help you with your codebase today?" }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    if (!input.trim()) return;

    if (!projectPath) {
      setMessages(prev => [...prev, 
        { role: 'user', content: input },
        { role: 'assistant', content: '⚠️ No project folder is open. Please open a folder first so I can ingest and analyze the codebase.' }
      ]);
      setInput('');
      return;
    }

    const userMsg = input;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);

    setIsTyping(true);
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]); // placeholder

    const ws = new WebSocket(`ws://127.0.0.1:${backendPort}/ws/chat`);
    wsRef.current = ws;

    ws.onopen = () => {
      // Send context
      ws.send(JSON.stringify({
        project_path: projectPath,
        query: userMsg
      }));
    };

    ws.onmessage = (event) => {
      const data = event.data;
      if (data === '[DONE]') {
        ws.close();
        setIsTyping(false);
        return;
      }

      // Check for structured file-creation event from backend
      try {
        const parsed = JSON.parse(data);
        if (parsed.type === 'files_created' && Array.isArray(parsed.files)) {
          // Notify parent so the file tree refreshes
          onFilesCreated?.(parsed.files);
          // Append a user-friendly confirmation to the chat
          setMessages(prev => {
            const newMsgs = [...prev];
            const lastMsg = newMsgs[newMsgs.length - 1];
            if (lastMsg.role === 'assistant') {
              newMsgs[newMsgs.length - 1] = {
                ...lastMsg,
                content: lastMsg.content + `\n\n✅ **Created files:** ${parsed.files.join(', ')}`
              };
            }
            return newMsgs;
          });
          return;
        }
      } catch {
        // Not JSON — treat as a normal streaming text chunk
      }

      setMessages(prev => {
        const newMsgs = [...prev];
        const lastMsg = newMsgs[newMsgs.length - 1];
        if (lastMsg.role === 'assistant') {
          newMsgs[newMsgs.length - 1] = {
            ...lastMsg,
            content: lastMsg.content + data
          };
        }
        return newMsgs;
      });
    };

    ws.onerror = () => {
      setIsTyping(false);
      setMessages(prev => {
        const newMsgs = [...prev];
        const lastMsg = newMsgs[newMsgs.length - 1];
        newMsgs[newMsgs.length - 1] = {
          ...lastMsg,
          content: lastMsg.content + "\n[Error: Failed to connect to local brain. Make sure uvicorn server:app is running.]"
        };
        return newMsgs;
      });
    };
  };

  return (
    <div className="w-full h-full bg-surface border-l border-border flex flex-col pt-10 z-40">

      {/* Sidebar Header */}
      <div className="px-4 py-2 flex items-center justify-between border-b border-border shrink-0">
        <h2 className="text-sm font-semibold text-gray-200">TermiCursor</h2>
        <div className="flex gap-2">
          {/* Settings icon or similar can go here */}
        </div>
      </div>
      {/* Model Selection Info */}
      <div className="px-4 py-2 border-b border-border">
        <div className="relative">
          <select 
            className="w-full bg-[#0a0a0a] text-xs text-gray-300 rounded-lg p-2 appearance-none border border-border focus:outline-none focus:border-primary cursor-pointer"
            defaultValue="qwen"
          >
            <option value="qwen">Qwen 2.5 Coder (Local)</option>
            <option value="openai">OpenAI GPT-4o</option>
            <option value="claude">Claude 3.5 Sonnet</option>
            <option value="gemini">Gemini 1.5 Pro</option>
            <option value="kimi">Kimi</option>
            <option value="deepseek">DeepSeek Coder</option>
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-400">
            <ChevronDown size={14} />
          </div>
        </div>
      </div>

      {/* Chat History */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6" ref={scrollRef}>
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="w-6 h-6 rounded-md bg-gradient-to-br from-primary to-secondary flex items-center justify-center shrink-0 mt-1 shadow-lg shadow-primary/20">
                <Terminal size={12} className="text-white" />
              </div>
            )}

            <div className={`text-sm ${msg.role === 'user' ? 'bg-primary/10 border border-primary/20 text-blue-100 rounded-lg px-4 py-2' : 'text-gray-300'} prose prose-invert prose-p:leading-relaxed prose-pre:bg-background prose-pre:border prose-pre:border-border max-w-[85%]`}>
              <ReactMarkdown>{msg.content}</ReactMarkdown>
            </div>
          </div>
        ))}
        {isTyping && !isIngesting && (
          <div className="flex gap-3">
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-primary to-secondary flex items-center justify-center shrink-0 mt-1 shadow-lg shadow-primary/20">
              <Loader2 size={12} className="text-white animate-spin" />
            </div>
            <div className="text-sm text-gray-500 pt-1">Termicursor is thinking...</div>
          </div>
        )}
        {isIngesting && (
          <div className="flex gap-3">
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-primary to-secondary flex items-center justify-center shrink-0 mt-1 shadow-lg shadow-primary/20">
              <Loader2 size={12} className="text-white animate-spin" />
            </div>
            <div className="text-sm text-gray-500 pt-1">Ingesting codebase into brain. This might take a minute...</div>
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="p-4 bg-surface">
        <div className="relative group bg-[#0a0a0a] rounded-xl border border-border focus-within:border-primary">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !isIngesting) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask anything..."
            disabled={isIngesting}
            className="w-full bg-transparent pl-4 pr-10 py-3 text-sm resize-none focus:outline-none text-gray-200 placeholder-gray-500 custom-scrollbar"
            rows={2}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isTyping || isIngesting}
            className="absolute right-2 bottom-2 p-1.5 text-gray-400 hover:text-gray-200 disabled:opacity-50 transition-colors"
          >
            <Send size={16} />
          </button>
        </div>
        <div className="mt-2 text-center">
          <span className="text-[10px] text-gray-600">AI may make mistakes. Double-check all generated code.</span>
        </div>
      </div>
    </div>
  );
}

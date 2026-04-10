import React, { useState, useEffect, useRef } from 'react';
import { 
  FolderOpen, 
  Github, 
  Terminal, 
  Plus, 
  Command, 
  Search, 
  Terminal as TermIcon,
  MessageSquare,
  History,
  ArrowRight,
  Globe,
  ChevronDown,
  Sparkles,
  Send
} from 'lucide-react';
import { useEditor } from '../src/EditorContext';
import type { RecentFileEntry } from '../src/ideWorkspace';

interface WorkspaceDashboardProps {
  onOpenFolder: () => void;
  onConnectWorkspace: () => void;
  onGithubSync: () => void;
  recentFiles: RecentFileEntry[];
}

interface AIModel {
  model_key: string;
  name: string;
  provider: string;
}

/**
 * WorkspaceDashboard: A premium, centered 'Cursor-style' home screen for the IDE.
 * Replaces the legacy WelcomeScreen and WorkspaceLauncher modal.
 */
export const WorkspaceDashboard: React.FC<WorkspaceDashboardProps> = ({ 
  onOpenFolder, 
  onConnectWorkspace, 
  onGithubSync,
  recentFiles
}) => {
  const [chatInput, setChatInput] = useState('');
  const [models, setModels] = useState<AIModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<AIModel | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch models from API
  useEffect(() => {
    fetch('/api/agent/models?show_in_picker=1')
      .then(res => res.json())
      .then((data: any) => {
        if (data && Array.isArray(data.rows)) {
          const rows: AIModel[] = data.rows;
          // Group by provider and take top 5 each
          const grouped: Record<string, AIModel[]> = {};
          rows.forEach(m => {
            if (!grouped[m.provider]) grouped[m.provider] = [];
            if (grouped[m.provider].length < 5) grouped[m.provider].push(m);
          });
          const filtered = Object.values(grouped).flat();
          setModels(filtered);
          if (filtered.length > 0) setSelectedModel(filtered[0]);
        }
      })
      .catch(err => console.error('Failed to fetch models', err));
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSendMessage = () => {
    if (!chatInput.trim()) return;
    // Dispatch event to main Agent Chat if needed, or handle locally
    console.log('Sending message:', chatInput, 'with model:', selectedModel?.model_key);
    setChatInput('');
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-start bg-[var(--scene-bg)] overflow-y-auto py-12 px-6 no-scrollbar h-full">
      
      {/* ── New Branded Hero (Refactored) ── */}
      <div className="flex flex-col items-center mb-10 text-center animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="w-20 h-20 mb-2 rounded-2xl flex items-center justify-center">
            <img 
              src="https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/ac515729-af6b-4ea5-8b10-e581a4d02100/thumbnail" 
              alt="Agent Sam"
              className="w-full h-full object-contain"
            />
        </div>
      </div>

      {/* ── Centered Chat Interaction (NEW) ── */}
      <div className="w-full max-w-2xl mb-12 animate-in fade-in slide-in-from-bottom-6 duration-1000">
        <div className="relative group p-[1px] rounded-2xl bg-gradient-to-br from-[var(--border-subtle)] via-[var(--border-subtle)] to-[var(--solar-cyan)]/20 hover:to-[var(--solar-cyan)]/40 transition-all duration-500">
          <div className="relative bg-[var(--bg-panel)] rounded-2xl overflow-hidden shadow-2xl border border-white/5">
            
            {/* Input Row */}
            <div className="flex items-start p-4 gap-3">
              <button 
                className="mt-1 p-2 rounded-lg bg-[var(--bg-app)] text-[var(--text-muted)] hover:text-[var(--solar-cyan)] transition-colors border border-[var(--border-subtle)]"
                title="Add context"
              >
                <Plus size={18} />
              </button>
              
              <textarea 
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder="What should we work on today?"
                className="flex-1 bg-transparent border-none outline-none resize-none py-2 text-[15px] text-[var(--text-main)] placeholder:text-[var(--text-muted)]/50 min-h-[44px] max-h-[200px]"
              />
            </div>

            {/* Footer Row (Controls) */}
            <div className="flex items-center justify-between px-4 py-3 bg-[var(--bg-app)]/50 border-t border-[var(--border-subtle)]">
              
              <div className="relative" ref={dropdownRef}>
                <button 
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] hover:border-[var(--solar-cyan)]/30 transition-all text-[11px] font-bold text-[var(--text-muted)]"
                >
                  <Sparkles size={12} className="text-[var(--solar-cyan)]" />
                  <span>{selectedModel?.name || 'Loading models...'}</span>
                  <ChevronDown size={12} className={`transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {isDropdownOpen && (
                  <div className="absolute left-0 bottom-full mb-2 w-64 bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] z-[60] overflow-hidden">
                    <div className="p-2 max-h-[280px] overflow-y-auto no-scrollbar">
                      {models.length > 0 ? (
                        models.map((m) => (
                          <button
                            key={m.model_key}
                            onClick={() => {
                              setSelectedModel(m);
                              setIsDropdownOpen(false);
                            }}
                            className={`w-full text-left px-3 py-2 rounded-lg text-[11px] transition-colors flex flex-col gap-0.5 ${selectedModel?.model_key === m.model_key ? 'bg-[var(--solar-cyan)]/10 text-[var(--solar-cyan)]' : 'text-[var(--text-muted)] hover:bg-[var(--bg-app)]'}`}
                          >
                            <span className="font-bold">{m.name}</span>
                            <span className="text-[9px] opacity-60 uppercase tracking-tighter">{m.provider}</span>
                          </button>
                        ))
                      ) : (
                        <div className="p-4 text-center text-[10px] text-[var(--text-muted)] italic">Loading models...</div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <button 
                onClick={handleSendMessage}
                disabled={!chatInput.trim()}
                className={`p-2 rounded-xl transition-all ${chatInput.trim() ? 'bg-[var(--solar-cyan)] text-black shadow-[0_0_15px_rgba(45,212,191,0.3)] hover:scale-105 active:scale-95' : 'bg-[var(--bg-panel)] text-[var(--text-muted)] opacity-50'}`}
              >
                <Send size={18} />
              </button>

            </div>
          </div>
        </div>

        {/* ── IDE Shortcuts Hint (Centered under Chat) ── */}
        <div className="mt-6 flex flex-wrap justify-center gap-8 text-[11px] text-[var(--text-muted)] uppercase tracking-wider font-bold opacity-30">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-md border border-[var(--border-subtle)]">⌘ P</span>
            <span>Files</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-md border border-[var(--border-subtle)]">⌘ I</span>
            <span>Refactor</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-md border border-[var(--border-subtle)]">⌘ J</span>
            <span>Terminal</span>
          </div>
        </div>
      </div>

      {/* ── Action Grid (Preserved) ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-3xl mb-12 animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-150">
        <button 
          onClick={onOpenFolder}
          className="group flex flex-col items-start p-6 bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-2xl hover:border-[var(--solar-cyan)]/50 transition-all duration-300 hover:shadow-lg"
        >
          <div className="p-3 rounded-xl bg-[var(--bg-app)] text-[var(--text-muted)] group-hover:text-[var(--solar-cyan)] transition-colors mb-4">
            <FolderOpen size={24} />
          </div>
          <h3 className="text-sm font-bold text-[var(--text-main)] mb-1">Open Local Project</h3>
          <p className="text-[11px] text-[var(--text-muted)] text-left">Browse your local filesystem to pick a repository</p>
        </button>

        <button 
          onClick={onConnectWorkspace}
          className="group flex flex-col items-start p-6 bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-2xl hover:border-[var(--solar-cyan)]/50 transition-all duration-300 hover:shadow-lg"
        >
          <div className="p-3 rounded-xl bg-[var(--bg-app)] text-[var(--text-muted)] group-hover:text-[var(--solar-cyan)] transition-colors mb-4">
            <Globe size={24} />
          </div>
          <h3 className="text-sm font-bold text-[var(--text-main)] mb-1">Connect Workspace</h3>
          <p className="text-[11px] text-[var(--text-muted)] text-left">Switch to a D1-backed remote control plane</p>
        </button>

        <button 
          onClick={onGithubSync}
          className="group flex flex-col items-start p-6 bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-2xl hover:border-[var(--solar-cyan)]/50 transition-all duration-300 hover:shadow-lg"
        >
          <div className="p-3 rounded-xl bg-[var(--bg-app)] text-[var(--text-muted)] group-hover:text-[var(--solar-cyan)] transition-colors mb-4">
            <Github size={24} />
          </div>
          <h3 className="text-sm font-bold text-[var(--text-main)] mb-1">Clone Repository</h3>
          <p className="text-[11px] text-[var(--text-muted)] text-left">Import your projects directly from GitHub</p>
        </button>
      </div>

      {/* ── Recent Projects (Preserved) ── */}
      <div className="w-full max-w-3xl animate-in fade-in slide-in-from-bottom-10 duration-1000 delay-300">
        <div className="flex items-center gap-2 mb-4 px-2">
            <History size={14} className="text-[var(--text-muted)]" />
            <h2 className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-widest">Recently Opened</h2>
        </div>
        
        <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-2xl divide-y divide-[var(--border-subtle)] overflow-hidden">
          {recentFiles.length > 0 ? (
            recentFiles.slice(0, 6).map((file) => (
              <div 
                key={file.id}
                className="group flex items-center justify-between p-4 hover:bg-[var(--bg-app)] transition-colors cursor-pointer"
                onClick={() => { /* Handled via App.tsx */ }}
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-[var(--bg-app)] flex items-center justify-center text-[var(--text-muted)] group-hover:text-[var(--solar-cyan)] transition-colors">
                    <Terminal size={14} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[13px] font-bold text-[var(--text-main)] truncate">{file.name}</div>
                    <div className="text-[10px] text-[var(--text-muted)] font-mono truncate">{file.label}</div>
                  </div>
                </div>
                <ArrowRight size={14} className="text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-all" />
              </div>
            ))
          ) : (
            <div className="p-8 text-center text-[var(--text-muted)] italic text-[12px]">
              No recent projects found.
            </div>
          )}
        </div>
      </div>

    </div>
  );
};

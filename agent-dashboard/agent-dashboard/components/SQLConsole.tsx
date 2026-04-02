import React, { useState } from 'react';
import { Play, RotateCcw, Save, Trash2, Clock } from 'lucide-react';
import { DataGrid } from './DataGrid';

interface SQLConsoleProps {
  onExecute: (sql: string) => Promise<{ success: boolean; results?: any[]; error?: string }>;
  history: string[];
}

export const SQLConsole: React.FC<SQLConsoleProps> = ({ onExecute, history }) => {
  const [sql, setSql] = useState('-- Write your SQL query here\nSELECT * FROM sqlite_master WHERE type=\'table\';');
  const [results, setResults] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);

  const handleRun = async () => {
    setIsExecuting(true);
    setError(null);
    try {
      const res = await onExecute(sql);
      if (res.success) {
        setResults(res.results || []);
      } else {
        setError(res.error || 'Unknown error');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[var(--bg-panel)] overflow-hidden">
      {/* Editor Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border-subtle)] bg-[var(--bg-app)]">
        <div className="flex gap-2">
          <button 
            onClick={handleRun}
            disabled={isExecuting}
            className="flex items-center gap-1.5 px-3 py-1 bg-[var(--solar-green)]/10 hover:bg-[var(--solar-green)]/20 border border-[var(--solar-green)]/30 text-[var(--solar-green)] rounded text-[11px] font-bold transition-all disabled:opacity-50"
          >
            <Play size={12} className={isExecuting ? 'animate-pulse' : ''} />
            {isExecuting ? 'Running...' : 'Run Query'}
          </button>
          <button 
            onClick={() => setSql('')}
            className="p-1 px-2 hover:bg-[var(--bg-hover)] rounded text-[var(--text-muted)] hover:text-white transition-colors"
          >
            <RotateCcw size={13} />
          </button>
        </div>
        <div className="flex gap-2">
          <button className="p-1 text-[var(--text-muted)] hover:text-white" title="Save Query"><Save size={13} /></button>
          <button className="p-1 text-[var(--text-muted)] hover:text-white" title="Clear History"><Trash2 size={13} /></button>
        </div>
      </div>

      {/* Editor Area */}
      <div className="flex-1 flex flex-col min-h-[40%] border-b border-[var(--border-subtle)]">
        <textarea
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          spellCheck={false}
          className="flex-1 w-full p-4 bg-[#030a0d] text-[13px] font-mono text-[var(--solar-cyan)] focus:outline-none resize-none"
        />
      </div>

      {/* Results Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="px-4 py-1.5 bg-[var(--bg-app)] border-b border-[var(--border-subtle)] flex items-center justify-between text-[10px] font-bold tracking-widest uppercase text-[var(--text-muted)]">
          <span>Results</span>
          {results && <span>{results.length} rows</span>}
        </div>
        <div className="flex-1 overflow-auto p-4">
          {error ? (
            <div className="p-3 bg-[var(--solar-red)]/10 border border-[var(--solar-red)]/20 rounded text-[var(--solar-red)] text-[12px] font-mono">
              <span className="font-bold">Error:</span> {error}
            </div>
          ) : results ? (
            <DataGrid data={results} />
          ) : (
            <div className="h-full flex flex-col items-center justify-center opacity-30 text-[11px] font-mono">
              <Terminal size={24} className="mb-2" />
              Run a query to see results
            </div>
          )}
        </div>
      </div>
      
      {/* History Sidebar/Popup could go here, or just a dropdown */}
    </div>
  );
};

const Terminal = ({ size, className }: { size: number, className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polyline points="4 17 10 11 4 5" />
    <line x1="12" y1="19" x2="20" y2="19" />
  </svg>
);

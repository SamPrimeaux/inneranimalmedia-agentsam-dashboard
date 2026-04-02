import React, { useState, useEffect } from 'react';
import { 
  Database, Search, HardDrive, RefreshCw, Terminal, 
  Table as TableIcon, ChevronRight, Settings, 
  ExternalLink, Play, Clock, Filter, Grid, X
} from 'lucide-react';
import { DataGrid } from './DataGrid';
import { SQLConsole } from './SQLConsole';

type DBView = 'tables' | 'query' | 'settings';

export const DatabaseBrowser: React.FC<{ onClose?: () => void }> = ({ onClose }) => {
    const [view, setView] = useState<DBView>('tables');
    const [tables, setTables] = useState<string[]>([]);
    const [selectedTable, setSelectedTable] = useState<string | null>(null);
    const [rows, setRows] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [sqlHistory, setSqlHistory] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchTables();
    }, []);

    const fetchTables = async () => {
        setIsLoading(true);
        try {
            const res = await fetch('/api/db/tables');
            const data = await res.json();
            if (data.success) {
                setTables(data.tables);
            }
        } catch (err) {
            console.error('Failed to fetch tables:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchTableData = async (table: string) => {
        setIsLoading(true);
        setSelectedTable(table);
        try {
            const res = await fetch('/api/db/query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sql: `SELECT * FROM ${table} LIMIT 100` })
            });
            const data = await res.json();
            if (data.success) {
                setRows(data.results);
                setView('tables'); // Switch to table view if it was in SQL console
            } else {
                setError(data.error);
            }
        } catch (err) {
            console.error('Failed to fetch table data:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleExecuteSQL = async (sql: string) => {
        try {
            const res = await fetch('/api/db/query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sql })
            });
            const data = await res.json();
            if (data.success) {
                setSqlHistory(prev => [sql, ...prev].slice(0, 50));
                return { success: true, results: data.results };
            } else {
                return { success: false, error: data.error };
            }
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    };

    return (
        <div className="w-full h-full bg-[var(--bg-panel)] flex flex-col text-[var(--text-main)] overflow-hidden">
            {/* 1. Header Toolbar */}
            <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between shrink-0 bg-[var(--bg-panel)]">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-[var(--solar-blue)]/10 rounded">
                      <Database size={14} className="text-[var(--solar-blue)]" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[11px] font-bold tracking-widest uppercase leading-none mt-0.5">D1 Explorer</span>
                      <span className="text-[9px] text-[var(--text-muted)] font-mono">iam-business-v2</span>
                    </div>
                </div>
                <div className="flex gap-1.5">
                    <button 
                        onClick={() => setView('tables')}
                        className={`p-1 px-2 rounded text-[11px] flex items-center gap-1.5 transition-all ${view === 'tables' ? 'bg-[var(--solar-blue)]/20 text-[var(--solar-blue)]' : 'hover:bg-[var(--bg-hover)] text-[var(--text-muted)]'}`}
                    >
                      <Grid size={12} /> Tables
                    </button>
                    <button 
                        onClick={() => setView('query')}
                        className={`p-1 px-2 rounded text-[11px] flex items-center gap-1.5 transition-all ${view === 'query' ? 'bg-[var(--solar-cyan)]/20 text-[var(--solar-cyan)]' : 'hover:bg-[var(--bg-hover)] text-[var(--text-muted)]'}`}
                    >
                      <Terminal size={12} /> Console
                    </button>
                    <div className="w-[1px] h-4 bg-[var(--border-subtle)] mx-1 self-center" />
                    <button onClick={fetchTables} className="p-1.5 hover:bg-[var(--bg-hover)] rounded text-[var(--text-muted)] transition-colors" title="Refresh Tables">
                      <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
                    </button>
                    {onClose && (
                      <button onClick={onClose} className="p-1.5 hover:bg-[var(--bg-hover)] rounded text-[var(--text-muted)] hover:text-[var(--solar-red)]">
                        <X size={14} />
                      </button>
                    )}
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
                {/* 2. Tables Sidebar (Persistent or Toggleable) */}
                {view === 'tables' && (
                    <div className="w-64 border-r border-[var(--border-subtle)] flex flex-col bg-[var(--bg-panel)] shrink-0">
                        <div className="p-2 border-b border-[var(--border-subtle)]">
                            <div className="flex items-center bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded-md px-2 py-1 focus-within:border-[var(--solar-blue)]/50 transition-all">
                                <Search size={12} className="text-[var(--text-muted)] mr-2" />
                                <input 
                                    type="text" 
                                    placeholder="Filter tables..." 
                                    className="bg-transparent border-none outline-none text-[11px] w-full placeholder:text-[var(--text-muted)] font-mono"
                                />
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-1 py-2 custom-scrollbar">
                            <div className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-2 px-3 flex items-center justify-between">
                              <span>User Tables</span>
                              <span className="bg-[var(--bg-app)] px-1 rounded text-[8px] opacity-60">{tables.length}</span>
                            </div>
                            
                            {tables.map(table => (
                                <div 
                                    key={table}
                                    onClick={() => fetchTableData(table)}
                                    className={`group flex items-center gap-2.5 px-3 py-2 hover:bg-[var(--bg-hover)] cursor-pointer rounded-md text-[12px] transition-all relative ${selectedTable === table ? 'bg-[var(--bg-hover)] text-[var(--solar-blue)] font-bold' : 'text-[var(--text-main)]'}`}
                                >
                                    <TableIcon size={13} className={`shrink-0 ${selectedTable === table ? 'text-[var(--solar-blue)]' : 'text-[var(--text-muted)] group-hover:text-[var(--solar-blue)]'}`} />
                                    <span className="truncate">{table}</span>
                                    {selectedTable === table && (
                                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-4 bg-[var(--solar-blue)] rounded-r-sm" />
                                    )}
                                    <div className="ml-auto opacity-0 group-hover:opacity-40"><ChevronRight size={10} /></div>
                                </div>
                            ))}

                            {tables.length === 0 && !isLoading && (
                              <div className="px-3 py-10 text-center opacity-30 text-[11px] font-mono">
                                No tables found in master.
                              </div>
                            )}

                            <div className="mt-6">
                              <div className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-2 px-3">System Tables</div>
                              <div className="px-3 py-1 text-[11px] text-[var(--text-muted)] hover:text-white cursor-pointer flex items-center gap-2 opacity-50 hover:opacity-100 transition-opacity">
                                <Database size={12} />
                                <span className="font-mono">sqlite_master</span>
                              </div>
                            </div>
                        </div>
                        
                        <div className="p-3 border-t border-[var(--border-subtle)] bg-[var(--bg-app)] text-[10px] text-[var(--text-muted)] shrink-0 flex items-center justify-between font-mono">
                            <div className="flex items-center gap-1.5">
                              <div className="w-1.5 h-1.5 rounded-full bg-[var(--solar-green)] animate-pulse"></div>
                              <span>Connected</span>
                            </div>
                            <span className="text-[var(--solar-cyan)] cursor-pointer hover:underline flex items-center gap-1">
                              Stats <ExternalLink size={10} />
                            </span>
                        </div>
                    </div>
                )}

                {/* 3. Main Content Area */}
                <div className="flex-1 overflow-hidden bg-[var(--bg-app)]">
                    {view === 'tables' ? (
                        <div className="h-full flex flex-col">
                            {selectedTable ? (
                                <div className="h-full flex flex-col overflow-hidden">
                                    <div className="px-4 py-2 bg-[var(--bg-panel)] border-b border-[var(--border-subtle)] flex items-center justify-between">
                                      <div className="flex items-center gap-3">
                                        <h2 className="text-[13px] font-bold font-mono text-[var(--text-heading)]">{selectedTable}</h2>
                                        <div className="flex gap-2">
                                          <span className="text-[10px] px-1.5 py-0.5 bg-[var(--solar-blue)]/10 text-[var(--solar-blue)] rounded uppercase font-black">Data</span>
                                          <span className="text-[10px] px-1.5 py-0.5 hover:bg-[var(--bg-hover)] text-[var(--text-muted)] rounded uppercase font-black cursor-pointer">Schema</span>
                                        </div>
                                      </div>
                                      <div className="flex gap-2">
                                        <div className="flex items-center bg-[var(--bg-app)] rounded px-2 h-6 border border-[var(--border-subtle)]">
                                          <Filter size={10} className="text-[var(--text-muted)] mr-1.5" />
                                          <input placeholder="Filter rows..." className="bg-transparent border-none outline-none text-[10px] w-28 text-[var(--text-main)]" />
                                        </div>
                                        <button className="flex items-center gap-1.5 px-2 py-1 hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)] rounded text-[10px] font-bold text-[var(--text-muted)] hover:text-white transition-colors">
                                          <Play size={10} /> Run SQL
                                        </button>
                                      </div>
                                    </div>
                                    <div className="flex-1 overflow-auto p-4 custom-scrollbar">
                                        <DataGrid data={rows} onRowClick={(row) => console.log('Selected:', row)} />
                                    </div>
                                </div>
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center opacity-40">
                                    <div className="p-10 border border-dashed border-[var(--border-subtle)] rounded-full mb-6">
                                      <Database size={48} className="text-[var(--solar-blue)]" />
                                    </div>
                                    <h3 className="text-[14px] font-bold mb-2 uppercase tracking-widest text-[var(--text-heading)]">MeauxCAD D1 Data Explorer</h3>
                                    <p className="text-[11px] font-mono text-center max-w-xs">Select a table from the sidebar to browse contents, or use the SQL Console for custom queries.</p>
                                    <div className="flex gap-3 mt-8">
                                      <button onClick={() => setView('query')} className="px-4 py-1.5 bg-[var(--bg-panel)] border border-[var(--border-subtle)] hover:border-[var(--solar-cyan)] rounded text-[11px] font-bold transition-all flex items-center gap-2">
                                        <Terminal size={14} className="text-[var(--solar-cyan)]" /> Open Query Console
                                      </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <SQLConsole onExecute={handleExecuteSQL} history={sqlHistory} />
                    )}
                </div>
            </div>
            
            {/* 4. Bottom Connection Bar (Optional, could be used for Supabase/Hyperdrive selector) */}
            {view === 'settings' && (
              <div className="absolute inset-0 z-50 bg-[var(--bg-app)] p-6">
                <div className="max-w-2xl mx-auto flex flex-col gap-6">
                  <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-4">
                    <h2 className="text-xl font-bold flex items-center gap-3">
                      <Settings className="text-[var(--solar-cyan)]" /> Database Connections
                    </h2>
                    <button onClick={() => setView('tables')} className="p-2 hover:bg-[var(--bg-hover)] rounded-full">
                      <X />
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <ConnectionCard 
                      name="Cloudflare D1 (Native)" 
                      status="Connected" 
                      active
                      icon={<HardDrive className="text-[var(--solar-blue)]" />}
                    />
                    <ConnectionCard 
                      name="Supabase (via MCP)" 
                      status="Disconnected" 
                      icon={<ExternalLink className="text-[var(--solar-green)]" />}
                    />
                    <ConnectionCard 
                      name="Hyperdrive" 
                      status="Disconnected" 
                      icon={<Play className="text-[var(--solar-magenta)] rotate-90" />}
                    />
                  </div>
                </div>
              </div>
            )}
        </div>
    );
};

const ConnectionCard = ({ name, status, active = false, icon }: { name: string, status: string, active?: boolean, icon: React.ReactNode }) => (
  <div className={`p-4 rounded-xl border border-[var(--border-subtle)] hover:border-[var(--solar-cyan)] transition-all cursor-pointer bg-[var(--bg-panel)] group ${active ? 'ring-1 ring-[var(--solar-cyan)] shadow-[0_0_15px_rgba(45,212,191,0.1)]' : ''}`}>
    <div className="flex items-center gap-4 mb-3">
      <div className="p-2 bg-[var(--bg-app)] rounded-lg group-hover:bg-[var(--bg-hover)] transition-colors">
        {icon}
      </div>
      <div>
        <h4 className="text-[14px] font-bold text-[var(--text-heading)]">{name}</h4>
        <span className={`text-[10px] font-black uppercase tracking-widest ${active ? 'text-[var(--solar-green)]' : 'text-[var(--text-muted)]'}`}>{status}</span>
      </div>
    </div>
    <div className="flex gap-2">
      <button className={`flex-1 text-[11px] font-bold py-1.5 rounded transition-all ${active ? 'bg-[var(--solar-cyan)]/20 text-[var(--solar-cyan)]' : 'bg-[var(--bg-app)] text-[var(--text-muted)] hover:text-white'}`}>
        {active ? 'Manage' : 'Connect'}
      </button>
    </div>
  </div>
);

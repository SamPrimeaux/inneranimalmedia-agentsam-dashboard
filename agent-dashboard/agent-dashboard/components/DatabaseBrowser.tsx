import React, { useState, useEffect, useCallback } from 'react';
import {
  Database,
  Search,
  HardDrive,
  RefreshCw,
  Terminal,
  Table as TableIcon,
  ChevronRight,
  MessageSquare,
  Settings,
  ExternalLink,
  Filter,
  Grid,
  X,
  Plus,
  Pencil,
  Trash2,
  Check,
} from 'lucide-react';
import { DataGrid } from './DataGrid';
import { SQLConsole, SqlDialect } from './SQLConsole';
import { DatabaseAgentChat } from './DatabaseAgentChat';

type DBView = 'tables' | 'query' | 'agent' | 'settings';
type DBTarget = 'd1' | 'hyperdrive';
type TableSubView = 'data' | 'schema';

interface RowEditState {
  rowIndex: number | null;
  data: Record<string, unknown>;
}

const KNOWN_CONNECTIONS: Record<DBTarget, { name: string; label: string }> = {
  d1: { name: 'Cloudflare D1', label: 'inneranimalmedia-business' },
  hyperdrive: { name: 'Supabase (Hyperdrive)', label: 'postgres' },
};

function quoteIdent(name: string): string {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function sqlString(v: unknown): string {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return `'${String(v).replace(/'/g, "''")}'`;
}

function isValidPgCtid(s: string): boolean {
  return /^\(\d+,\d+\)$/.test(String(s).trim());
}

export const DatabaseBrowser: React.FC<{ onClose?: () => void }> = ({ onClose }) => {
  const [view, setView] = useState<DBView>('tables');
  const [dbTarget, setDbTarget] = useState<DBTarget>('d1');
  const [hyperdriveOk, setHyperdriveOk] = useState<boolean | null>(null);
  const [tables, setTables] = useState<string[]>([]);
  const [tableFilter, setTableFilter] = useState('');
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [tableSubView, setTableSubView] = useState<TableSubView>('data');
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [schema, setSchema] = useState<Record<string, unknown>[]>([]);
  const [rowFilter, setRowFilter] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sqlHistory, setSqlHistory] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editState, setEditState] = useState<RowEditState | null>(null);

  const queryEndpoint = dbTarget === 'hyperdrive' ? '/api/hyperdrive/query' : '/api/d1/query';
  const sqlDialect: SqlDialect = dbTarget === 'hyperdrive' ? 'postgres' : 'd1';

  const runSQL = useCallback(
    async (
      sql: string,
    ): Promise<{ success: boolean; results?: Record<string, unknown>[]; error?: string; meta?: unknown }> => {
      try {
        const res = await fetch(queryEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ sql }),
        });
        const data = await res.json();
        if (res.status === 401) return { success: false, error: data.error || 'Unauthorized' };
        if (res.status === 403) return { success: false, error: data.error || 'Forbidden' };
        if (data.error && !Array.isArray(data.results)) {
          return { success: false, error: data.error };
        }
        if (Array.isArray(data.results)) {
          setSqlHistory((prev) => [sql, ...prev].slice(0, 50));
          return {
            success: true,
            results: data.results as Record<string, unknown>[],
            meta: data.meta,
          };
        }
        return { success: false, error: data.error || 'Query failed' };
      } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
    [queryEndpoint],
  );

  useEffect(() => {
    fetch('/api/hyperdrive/status', { credentials: 'same-origin' })
      .then((r) => setHyperdriveOk(r.ok))
      .catch(() => setHyperdriveOk(false));
  }, []);

  useEffect(() => {
    void fetchTables();
  }, [dbTarget]);

  const fetchTables = async () => {
    setIsLoading(true);
    setSelectedTable(null);
    setRows([]);
    setError(null);
    try {
      const endpoint = dbTarget === 'hyperdrive' ? '/api/hyperdrive/tables' : '/api/agent/db/tables';
      const res = await fetch(endpoint, { credentials: 'same-origin' });
      const data = await res.json();
      setTables(Array.isArray(data.tables) ? data.tables : []);
    } catch (err) {
      console.error('fetchTables:', err);
      setTables([]);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchTableData = async (table: string) => {
    setIsLoading(true);
    setSelectedTable(table);
    setTableSubView('data');
    setRowFilter('');
    setEditState(null);
    setError(null);
    const qi = quoteIdent(table);
    const sql =
      dbTarget === 'd1'
        ? `SELECT rowid AS __rowid, * FROM ${qi} LIMIT 200`
        : `SELECT ctid::text AS __ctid, * FROM ${qi} LIMIT 200`;
    const result = await runSQL(sql);
    if (result.success) {
      setRows(result.results ?? []);
    } else {
      setError(result.error ?? null);
      setRows([]);
    }
    setIsLoading(false);
  };

  const fetchPgInformationSchemaBrowse = async () => {
    setIsLoading(true);
    setSelectedTable('information_schema.tables');
    setTableSubView('data');
    setRowFilter('');
    setEditState(null);
    setError(null);
    const result = await runSQL(
      `SELECT * FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name LIMIT 200`,
    );
    if (result.success) setRows(result.results ?? []);
    else {
      setError(result.error ?? null);
      setRows([]);
    }
    setIsLoading(false);
  };

  const fetchSchema = async (table: string) => {
    setTableSubView('schema');
    const qi = quoteIdent(table);
    const result =
      dbTarget === 'd1'
        ? await runSQL(`PRAGMA table_info(${qi})`)
        : await runSQL(
            `SELECT ordinal_position AS cid, column_name AS name, data_type AS type, is_nullable AS notnull, column_default AS dflt_value
             FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = '${table.replace(/'/g, "''")}'
             ORDER BY ordinal_position`,
          );
    setSchema(result.success ? (result.results ?? []) : []);
    if (!result.success) setError(result.error ?? null);
  };

  const filteredTables = tables.filter((t) => t.toLowerCase().includes(tableFilter.toLowerCase()));

  const filteredRows = rowFilter.trim()
    ? rows.filter((r) =>
        Object.values(r).some((v) => String(v).toLowerCase().includes(rowFilter.toLowerCase())),
      )
    : rows;

  const isSystemCatalog =
    selectedTable === 'sqlite_master' || selectedTable === 'information_schema.tables';

  const handleDelete = async (row: Record<string, unknown>) => {
    if (!selectedTable || isSystemCatalog) return;
    const qi = quoteIdent(selectedTable);
    let delSql: string;
    if (dbTarget === 'd1') {
      const rid = row.__rowid ?? row.rowid;
      if (rid == null) {
        alert('No rowid — cannot delete safely.');
        return;
      }
      if (!confirm(`Delete row where rowid = ${rid}?`)) return;
      delSql = `DELETE FROM ${qi} WHERE rowid = ${Number(rid)}`;
    } else {
      const ct = row.__ctid;
      if (ct == null || !isValidPgCtid(String(ct))) {
        alert('No valid ctid — cannot delete safely.');
        return;
      }
      if (!confirm(`Delete this row (ctid ${ct})?`)) return;
      delSql = `DELETE FROM ${qi} WHERE ctid = '${String(ct).replace(/'/g, "''")}'::tid`;
    }
    const result = await runSQL(delSql);
    if (result.success) void fetchTableData(selectedTable);
    else setError(result.error ?? null);
  };

  const handleSaveEdit = async () => {
    if (!editState || !selectedTable || isSystemCatalog) return;
    const { rowIndex, data } = editState;
    const qi = quoteIdent(selectedTable);
    const metaCols = new Set(['__rowid', '__ctid', 'rowid', 'ctid']);
    const cols = Object.keys(data).filter((k) => !metaCols.has(k));

    if (rowIndex === null) {
      const colList = cols.map((c) => quoteIdent(c)).join(', ');
      const valList = cols.map((c) => sqlString(data[c])).join(', ');
      const result = await runSQL(`INSERT INTO ${qi} (${colList}) VALUES (${valList})`);
      if (result.success) {
        setEditState(null);
        void fetchTableData(selectedTable);
      } else setError(result.error ?? null);
    } else {
      const row = rows[rowIndex];
      const setClause = cols
        .map((c) => `${quoteIdent(c)} = ${sqlString(data[c])}`)
        .join(', ');
      let whereSql: string;
      if (dbTarget === 'd1') {
        const rid = row.__rowid ?? row.rowid;
        if (rid == null) {
          alert('No rowid — cannot update.');
          return;
        }
        whereSql = `rowid = ${Number(rid)}`;
      } else {
        const ct = row.__ctid;
        if (ct == null || !isValidPgCtid(String(ct))) {
          alert('No valid ctid — cannot update.');
          return;
        }
        whereSql = `ctid = '${String(ct).replace(/'/g, "''")}'::tid`;
      }
      const result = await runSQL(`UPDATE ${qi} SET ${setClause} WHERE ${whereSql}`);
      if (result.success) {
        setEditState(null);
        void fetchTableData(selectedTable);
      } else setError(result.error ?? null);
    }
  };

  const startInsert = () => {
    if (!rows.length || isSystemCatalog) return;
    const first = rows[0];
    const blank: Record<string, unknown> = {};
    Object.keys(first).forEach((k) => {
      if (k !== '__rowid' && k !== '__ctid' && k !== 'rowid' && k !== 'ctid') blank[k] = '';
    });
    setEditState({ rowIndex: null, data: blank });
  };

  const EditModal = () => {
    if (!editState) return null;
    return (
      <div className="absolute inset-0 z-50 flex items-center justify-center max-md:items-end max-md:justify-center bg-black/60 backdrop-blur-sm">
        <div
          className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] shadow-2xl p-6 overflow-y-auto w-full max-w-[480px] mx-4 max-h-[80vh] rounded-xl max-md:fixed max-md:bottom-0 max-md:inset-x-0 max-md:mx-0 max-md:max-w-none max-md:max-h-[min(85vh,100dvh-1rem)] max-md:rounded-t-xl max-md:rounded-b-none max-md:pb-[max(1.25rem,env(safe-area-inset-bottom,0px))]"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[0.8125rem] font-bold uppercase tracking-widest">
              {editState.rowIndex === null ? 'Insert Row' : 'Edit Row'}
            </h3>
            <button type="button" onClick={() => setEditState(null)} className="p-1 hover:bg-[var(--bg-hover)] rounded">
              <X size={14} />
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {Object.entries(editState.data).map(([col, val]) => (
              <div key={col} className="flex flex-col gap-0.5">
                <label className="text-[0.625rem] font-bold uppercase tracking-widest text-[var(--text-muted)]">{col}</label>
                <input
                  value={String(val ?? '')}
                  onChange={(e) =>
                    setEditState((s) => (s ? { ...s, data: { ...s.data, [col]: e.target.value } } : s))
                  }
                  className="bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded px-3 py-1.5 text-[0.75rem] font-mono focus:outline-none focus:border-[var(--solar-cyan)]/60"
                />
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-5 justify-end">
            <button
              type="button"
              onClick={() => setEditState(null)}
              className="px-4 py-1.5 text-[0.6875rem] font-bold hover:bg-[var(--bg-hover)] rounded border border-[var(--border-subtle)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSaveEdit()}
              className="px-4 py-1.5 text-[0.6875rem] font-bold bg-[var(--solar-cyan)]/20 text-[var(--solar-cyan)] rounded border border-[var(--solar-cyan)]/30 hover:bg-[var(--solar-cyan)]/30 flex items-center gap-1.5"
            >
              <Check size={12} /> Save
            </button>
          </div>
        </div>
      </div>
    );
  };

  const conn = KNOWN_CONNECTIONS[dbTarget];

  return (
    <div className="w-full h-full bg-[var(--bg-panel)] flex flex-col text-[var(--text-main)] overflow-hidden relative">
      <EditModal />

      <div className="px-3 sm:px-4 py-2.5 border-b border-[var(--border-subtle)] flex flex-wrap items-center gap-x-3 gap-y-2 justify-between shrink-0 bg-[var(--bg-panel)]">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 min-w-0">
          <div className="p-1.5 bg-[var(--solar-blue)]/10 rounded shrink-0">
            <Database size={14} className="text-[var(--solar-blue)]" />
          </div>
          <div className="flex flex-col leading-none min-w-0">
            <span className="text-[0.6875rem] font-bold tracking-widest uppercase">Database Explorer</span>
            <span className="text-[0.6875rem] text-[var(--text-muted)] font-mono mt-0.5 truncate max-w-[min(100%,14rem)] sm:max-w-none">
              {conn.label}
            </span>
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            {(['d1', 'hyperdrive'] as DBTarget[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  if (t === 'hyperdrive' && !hyperdriveOk) return;
                  setDbTarget(t);
                }}
                className={`px-2 py-0.5 rounded text-[0.625rem] font-bold uppercase tracking-widest transition-all ${
                  dbTarget === t
                    ? 'text-[var(--text-heading)] border border-[var(--border-subtle)] bg-[var(--bg-hover)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-heading)]'
                }`}
              >
                {t === 'd1' ? 'D1' : 'Hyperdrive'}
                {t === 'hyperdrive' && (
                  <span
                    className={`ml-1 w-1.5 h-1.5 inline-block rounded-full ${
                      hyperdriveOk ? 'bg-[var(--solar-green)]' : 'bg-[var(--solar-red)]'
                    }`}
                  />
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-1.5 items-center flex-wrap justify-end w-full sm:w-auto overflow-x-auto pb-0.5 sm:pb-0 -mx-1 px-1 sm:mx-0 sm:px-0">
          <button
            type="button"
            onClick={() => setView('tables')}
            className={`p-1 px-2 rounded text-[0.6875rem] flex items-center gap-1.5 transition-all ${
              view === 'tables' ? 'bg-[var(--solar-blue)]/20 text-[var(--solar-blue)]' : 'hover:bg-[var(--bg-hover)] text-[var(--text-muted)]'
            }`}
          >
            <Grid size={12} /> Tables
          </button>
          <button
            type="button"
            onClick={() => setView('query')}
            className={`p-1 px-2 rounded text-[0.6875rem] flex items-center gap-1.5 transition-all ${
              view === 'query' ? 'bg-[var(--solar-cyan)]/20 text-[var(--solar-cyan)]' : 'hover:bg-[var(--bg-hover)] text-[var(--text-muted)]'
            }`}
          >
            <Terminal size={12} /> Console
          </button>
          <button
            type="button"
            onClick={() => setView('agent')}
            className={`p-1 px-2 rounded text-[0.6875rem] flex items-center gap-1.5 transition-all ${
              view === 'agent' ? 'bg-[var(--solar-magenta)]/20 text-[var(--solar-magenta)]' : 'hover:bg-[var(--bg-hover)] text-[var(--text-muted)]'
            }`}
          >
            <MessageSquare size={12} /> Agent
          </button>
          <button
            type="button"
            onClick={() => setView('settings')}
            className={`p-1 px-2 rounded text-[0.6875rem] flex items-center gap-1.5 transition-all ${
              view === 'settings' ? 'bg-[var(--solar-magenta)]/20 text-[var(--solar-magenta)]' : 'hover:bg-[var(--bg-hover)] text-[var(--text-muted)]'
            }`}
          >
            <Settings size={12} />
          </button>
          <div className="w-[1px] h-4 bg-[var(--border-subtle)] mx-1 self-center" />
          <button
            type="button"
            onClick={() => void fetchTables()}
            className="p-1.5 hover:bg-[var(--bg-hover)] rounded text-[var(--text-muted)]"
            title="Refresh"
          >
            <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 hover:bg-[var(--bg-hover)] rounded text-[var(--text-muted)] hover:text-[var(--solar-red)]"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden min-h-0 max-md:flex-col">
        {(view === 'tables' || view === 'query') && (
          <div className="w-60 max-md:w-full max-md:max-h-[min(38vh,260px)] max-md:min-h-[140px] max-md:shrink-0 border-r max-md:border-r-0 max-md:border-b border-[var(--border-subtle)] flex flex-col bg-[var(--bg-panel)] shrink-0 min-h-0">
            <div className="p-2 border-b border-[var(--border-subtle)]">
              <div className="flex items-center bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded-md px-2 py-1 focus-within:border-[var(--solar-blue)]/50 transition-all">
                <Search size={12} className="text-[var(--text-muted)] mr-2 shrink-0" />
                <input
                  type="text"
                  placeholder="Filter tables..."
                  value={tableFilter}
                  onChange={(e) => setTableFilter(e.target.value)}
                  className="bg-transparent border-none outline-none text-[0.6875rem] w-full placeholder:text-[var(--text-muted)] font-mono"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-1 py-2 custom-scrollbar">
              <div className="text-[0.625rem] font-black uppercase tracking-widest text-[var(--text-muted)] mb-1 px-3 flex items-center justify-between">
                <span>Tables / Views</span>
                <span className="bg-[var(--bg-app)] px-1 rounded text-[0.6875rem] opacity-60">{filteredTables.length}</span>
              </div>

              {filteredTables.map((table) => (
                <div
                  key={table}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    void fetchTableData(table);
                    if (view === 'query') setView('tables');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      void fetchTableData(table);
                      if (view === 'query') setView('tables');
                    }
                  }}
                  className={`group flex items-center gap-2.5 px-3 py-1.5 hover:bg-[var(--bg-hover)] cursor-pointer rounded-md text-[0.75rem] transition-all relative ${
                    selectedTable === table ? 'bg-[var(--bg-hover)] text-[var(--solar-blue)] font-bold' : 'text-[var(--text-main)]'
                  }`}
                >
                  {selectedTable === table && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-4 bg-[var(--solar-blue)] rounded-r-sm" />
                  )}
                  <TableIcon
                    size={13}
                    className={`shrink-0 ${selectedTable === table ? 'text-[var(--solar-blue)]' : 'text-[var(--text-muted)] group-hover:text-[var(--solar-blue)]'}`}
                  />
                  <span className="truncate">{table}</span>
                  <div className="ml-auto opacity-0 group-hover:opacity-40">
                    <ChevronRight size={10} />
                  </div>
                </div>
              ))}

              {filteredTables.length === 0 && !isLoading && (
                <div className="px-3 py-8 text-center opacity-30 text-[0.6875rem] font-mono">
                  {tableFilter ? 'No match.' : 'No tables found.'}
                </div>
              )}

              <div className="mt-4">
                <div className="text-[0.625rem] font-black uppercase tracking-widest text-[var(--text-muted)] mb-1 px-3">System</div>
                {dbTarget === 'd1' ? (
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      void fetchTableData('sqlite_master');
                      if (view === 'query') setView('tables');
                    }}
                    className="group flex items-center gap-2.5 px-3 py-1.5 cursor-pointer hover:bg-[var(--bg-hover)] rounded-md text-[0.6875rem] text-[var(--text-muted)] hover:text-[var(--text-heading)] transition-colors"
                  >
                    <Database size={12} />
                    <span className="font-mono">sqlite_master</span>
                  </div>
                ) : (
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      void fetchPgInformationSchemaBrowse();
                      if (view === 'query') setView('tables');
                    }}
                    className="group flex items-center gap-2.5 px-3 py-1.5 cursor-pointer hover:bg-[var(--bg-hover)] rounded-md text-[0.6875rem] text-[var(--text-muted)] hover:text-[var(--text-heading)] transition-colors"
                  >
                    <Database size={12} />
                    <span className="font-mono">information_schema (public)</span>
                  </div>
                )}
              </div>
            </div>

            <div className="p-2.5 border-t border-[var(--border-subtle)] bg-[var(--bg-app)] text-[0.625rem] text-[var(--text-muted)] shrink-0 flex items-center justify-between font-mono">
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-[var(--solar-green)] animate-pulse" />
                <span>Connected</span>
              </div>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-hidden bg-[var(--bg-app)] min-h-0 min-w-0 flex flex-col">
          {view === 'tables' && (
            <div className="h-full min-h-0 flex flex-col">
              {selectedTable ? (
                <>
                  <div className="px-3 sm:px-4 py-2 bg-[var(--bg-panel)] border-b border-[var(--border-subtle)] flex flex-wrap items-center gap-2 justify-between shrink-0">
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3 min-w-0">
                      <h2 className="text-[0.8125rem] font-bold font-mono truncate max-w-[min(100%,12rem)] sm:max-w-[min(100%,20rem)]">
                        {selectedTable}
                      </h2>
                      <div className="flex gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => setTableSubView('data')}
                          className={`text-[0.625rem] px-1.5 py-0.5 rounded uppercase font-black transition-all ${
                            tableSubView === 'data'
                              ? 'bg-[var(--solar-blue)]/10 text-[var(--solar-blue)]'
                              : 'hover:bg-[var(--bg-hover)] text-[var(--text-muted)]'
                          }`}
                        >
                          Data
                        </button>
                        <button
                          type="button"
                          onClick={() => selectedTable && void fetchSchema(selectedTable)}
                          className={`text-[0.625rem] px-1.5 py-0.5 rounded uppercase font-black transition-all ${
                            tableSubView === 'schema'
                              ? 'bg-[var(--solar-magenta)]/10 text-[var(--solar-magenta)]'
                              : 'hover:bg-[var(--bg-hover)] text-[var(--text-muted)]'
                          }`}
                          disabled={selectedTable === 'information_schema.tables'}
                        >
                          Schema
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
                      {tableSubView === 'data' && !isSystemCatalog && (
                        <>
                          <div className="flex items-center bg-[var(--bg-panel)] rounded px-2 h-6 border border-[var(--border-subtle)] min-w-0 flex-1 sm:flex-initial sm:max-w-[200px]">
                            <Filter size={10} className="text-[var(--text-muted)] mr-1.5 shrink-0" />
                            <input
                              placeholder="Filter rows..."
                              value={rowFilter}
                              onChange={(e) => setRowFilter(e.target.value)}
                              className="bg-transparent border-none outline-none text-[0.625rem] min-w-0 flex-1 text-[var(--text-main)] placeholder:text-[var(--text-muted)]"
                            />
                            {rowFilter && (
                              <button type="button" onClick={() => setRowFilter('')}>
                                <X size={10} className="text-[var(--text-muted)] ml-1" />
                              </button>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={startInsert}
                            className="flex items-center gap-1 px-2 py-1 bg-[var(--solar-green)]/10 text-[var(--solar-green)] border border-[var(--solar-green)]/30 rounded text-[0.625rem] font-bold hover:bg-[var(--solar-green)]/20 transition-all"
                          >
                            <Plus size={10} /> Insert
                          </button>
                        </>
                      )}
                      <span className="text-[0.625rem] text-[var(--text-muted)] font-mono">{filteredRows.length} rows</span>
                    </div>
                  </div>

                  {error && (
                    <div className="mx-4 mt-3 p-2 bg-[var(--solar-red)]/10 border border-[var(--solar-red)]/20 rounded text-[var(--solar-red)] text-[0.6875rem] font-mono">
                      {error}
                    </div>
                  )}

                  <div className="flex-1 min-h-0 overflow-auto p-2 sm:p-4 custom-scrollbar">
                    {tableSubView === 'schema' ? (
                      <DataGrid data={schema} />
                    ) : (
                      <DataGrid
                        data={filteredRows}
                        onRowClick={(row) => console.log('Selected:', row)}
                        rowActions={
                          isSystemCatalog
                            ? undefined
                            : (row, idx) => (
                                <div className="flex gap-1">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditState({ rowIndex: idx, data: { ...row } });
                                    }}
                                    className="p-1 hover:bg-[var(--solar-blue)]/20 rounded text-[var(--text-muted)] hover:text-[var(--solar-blue)] transition-colors"
                                    title="Edit"
                                  >
                                    <Pencil size={11} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      void handleDelete(row as Record<string, unknown>);
                                    }}
                                    className="p-1 hover:bg-[var(--solar-red)]/20 rounded text-[var(--text-muted)] hover:text-[var(--solar-red)] transition-colors"
                                    title="Delete"
                                  >
                                    <Trash2 size={11} />
                                  </button>
                                </div>
                              )
                        }
                      />
                    )}
                  </div>
                </>
              ) : (
                <div className="h-full flex flex-col items-center justify-center opacity-40">
                  <div className="p-10 border border-dashed border-[var(--border-subtle)] rounded-full mb-6">
                    <Database size={48} className="text-[var(--solar-blue)]" />
                  </div>
                  <h3 className="text-[0.875rem] font-bold mb-2 uppercase tracking-widest">Database Explorer</h3>
                  <p className="text-[0.6875rem] font-mono text-center max-w-xs">
                    D1 (SQLite) or Supabase Postgres via Hyperdrive. Select a table or open the SQL console.
                  </p>
                  <div className="flex gap-3 mt-8">
                    <button
                      type="button"
                      onClick={() => setView('query')}
                      className="px-4 py-1.5 bg-[var(--bg-panel)] border border-[var(--border-subtle)] hover:border-[var(--solar-cyan)] rounded text-[0.6875rem] font-bold transition-all flex items-center gap-2"
                    >
                      <Terminal size={14} className="text-[var(--solar-cyan)]" /> Open Console
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {view === 'query' && <SQLConsole onExecute={runSQL} history={sqlHistory} dialect={sqlDialect} />}

          {view === 'agent' && (
            <DatabaseAgentChat
              runSQL={runSQL}
              dialect={sqlDialect}
              dbLabel={`${KNOWN_CONNECTIONS[dbTarget].name} — ${KNOWN_CONNECTIONS[dbTarget].label}`}
            />
          )}

          {view === 'settings' && (
            <div className="p-6 overflow-y-auto h-full">
              <div className="max-w-xl mx-auto flex flex-col gap-5">
                <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-4">
                  <h2 className="text-[0.9375rem] font-bold flex items-center gap-2">
                    <Settings size={16} className="text-[var(--solar-cyan)]" /> Database Connections
                  </h2>
                </div>

                <ConnectionCard
                  name="Cloudflare D1 (Native)"
                  sublabel="inneranimalmedia-business"
                  status="Connected"
                  active={dbTarget === 'd1'}
                  color="var(--solar-blue)"
                  icon={<HardDrive size={18} style={{ color: 'var(--solar-blue)' }} />}
                  onSelect={() => {
                    setDbTarget('d1');
                    setView('tables');
                  }}
                />
                <ConnectionCard
                  name="Supabase via Hyperdrive"
                  sublabel="postgres / supabase"
                  status={hyperdriveOk === null ? 'Checking...' : hyperdriveOk ? 'Connected' : 'Unavailable'}
                  active={dbTarget === 'hyperdrive'}
                  color="var(--solar-green)"
                  icon={<ExternalLink size={18} style={{ color: 'var(--solar-green)' }} />}
                  onSelect={() => {
                    if (hyperdriveOk) {
                      setDbTarget('hyperdrive');
                      setView('tables');
                    }
                  }}
                  disabled={!hyperdriveOk}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const ConnectionCard = ({
  name,
  sublabel,
  status,
  active,
  color,
  icon,
  onSelect,
  disabled,
}: {
  name: string;
  sublabel: string;
  status: string;
  active: boolean;
  color: string;
  icon: React.ReactNode;
  onSelect: () => void;
  disabled?: boolean;
}) => (
  <div
    role="button"
    tabIndex={disabled ? -1 : 0}
    onClick={!disabled ? onSelect : undefined}
    onKeyDown={(e) => {
      if (!disabled && (e.key === 'Enter' || e.key === ' ')) onSelect();
    }}
    className={`p-4 rounded-xl border transition-all ${
      disabled
        ? 'opacity-40 cursor-not-allowed border-[var(--border-subtle)]'
        : active
          ? 'cursor-pointer border-transparent ring-1 shadow-lg'
          : 'cursor-pointer border-[var(--border-subtle)] hover:border-[var(--solar-cyan)]/40'
    } bg-[var(--bg-panel)]`}
    style={active && !disabled ? { boxShadow: `0 0 20px ${color}22` } : {}}
  >
    <div className="flex items-center gap-4">
      <div className="p-2 bg-[var(--bg-app)] rounded-lg">{icon}</div>
      <div className="flex-1">
        <h4 className="text-[0.8125rem] font-bold">{name}</h4>
        <span className="text-[0.625rem] font-mono text-[var(--text-muted)]">{sublabel}</span>
      </div>
      <span
        className="text-[0.625rem] font-black uppercase tracking-widest"
        style={{ color: status === 'Connected' ? 'var(--solar-green)' : 'var(--text-muted)' }}
      >
        {status}
      </span>
      {active && !disabled && <Check size={14} style={{ color }} />}
    </div>
  </div>
);

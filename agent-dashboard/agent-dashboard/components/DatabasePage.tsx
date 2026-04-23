/**
 * DatabasePage — /dashboard/database
 *
 * Full-featured database management:
 *   - Schema inspector with column types, PK/nullable indicators, row counts
 *   - Paginated data browser with row-level insert / edit / delete
 *   - SQL editor (Monaco via SQLConsole, persists across tab switches)
 *   - D1 + Supabase / Hyperdrive with automatic schema query translation
 *   - Collapsible sidebar: table groups by prefix, snippets, query history
 *   - Mobile responsive (sidebar becomes a drawer)
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Database,
  Search,
  RefreshCw,
  Table as TableIcon,
  ChevronRight,
  ChevronDown,
  ChevronLeft,
  HardDrive,
  ExternalLink,
  Check,
  PanelLeftClose,
  PanelLeft,
  Plus,
  Pencil,
  Trash2,
  X,
  Key,
  Loader2,
  Code2,
  LayoutGrid,
  AlertTriangle,
  Hash,
  Calendar,
  Info,
} from 'lucide-react';
import { SQLConsole, type SqlDialect } from './SQLConsole';
import { DataGrid } from './DataGrid';

// ─── Types ────────────────────────────────────────────────────────────────────

type DBTarget = 'd1' | 'hyperdrive';
type MainTab  = 'schema' | 'data' | 'sql';

interface SchemaCol {
  name:       string;
  type:       string;
  notnull:    boolean;
  dflt_value: string | null;
  pk:         boolean;
}

interface TableGroup {
  prefix: string;
  tables: string[];
}

interface RunResult {
  success:      boolean;
  results?:     Record<string, unknown>[];
  error?:       string;
  meta?:        unknown;
  executionMs?: number | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DB_CONFIG: Record<DBTarget, { name: string; label: string; dialect: SqlDialect }> = {
  d1:         { name: 'Cloudflare D1',        label: 'inneranimalmedia-business', dialect: 'd1'       },
  hyperdrive: { name: 'Supabase / Hyperdrive', label: 'postgres · public schema',  dialect: 'postgres' },
};

const PAGE_SIZE = 50;

// ─── SQL Helpers ──────────────────────────────────────────────────────────────

function qi(s: string): string {
  return `"${s.replace(/"/g, '""')}"`;
}

function sqlVal(v: unknown): string {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? '1' : '0';
  return `'${String(v).replace(/'/g, "''")}'`;
}

function buildSchemaQuery(target: DBTarget, table: string): string {
  if (target === 'd1') {
    return `PRAGMA table_info(${qi(table)})`;
  }
  const esc = table.replace(/'/g, "''");
  return `
SELECT
  c.column_name AS name,
  c.data_type   AS type,
  CASE WHEN c.is_nullable = 'NO' THEN 1 ELSE 0 END AS notnull,
  c.column_default AS dflt_value,
  CASE WHEN pk.column_name IS NOT NULL THEN 1 ELSE 0 END AS pk
FROM information_schema.columns c
LEFT JOIN (
  SELECT ccu.column_name
  FROM   information_schema.table_constraints tc
  JOIN   information_schema.constraint_column_usage ccu
         ON  ccu.constraint_name = tc.constraint_name
         AND ccu.table_schema    = tc.table_schema
  WHERE  tc.table_schema    = 'public'
  AND    tc.table_name      = '${esc}'
  AND    tc.constraint_type = 'PRIMARY KEY'
) pk ON pk.column_name = c.column_name
WHERE c.table_schema = 'public'
AND   c.table_name   = '${esc}'
ORDER BY c.ordinal_position`.trim();
}

function normalizeSchema(rows: Record<string, unknown>[]): SchemaCol[] {
  return rows.map(r => ({
    name:       String(r.name ?? r.column_name ?? ''),
    type:       String(r.type ?? r.data_type ?? '').toUpperCase(),
    notnull:    Number(r.notnull) === 1 || r.is_nullable === 'NO',
    dflt_value: r.dflt_value != null ? String(r.dflt_value)
              : r.column_default != null ? String(r.column_default) : null,
    pk:         Number(r.pk) === 1,
  }));
}

// ─── UI Helpers ───────────────────────────────────────────────────────────────

function groupByPrefix(tables: string[]): TableGroup[] {
  const sorted = [...tables].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' }));
  const map = new Map<string, string[]>();
  for (const t of sorted) {
    const prefix = t.includes('_') ? t.split('_')[0] : '\u00b7misc';
    if (!map.has(prefix)) map.set(prefix, []);
    map.get(prefix)!.push(t);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([prefix, tbls]) => ({ prefix, tables: tbls }));
}

function typeColor(type: string): string {
  const t = type.toLowerCase();
  if (t.includes('int') || t.includes('num') || t.includes('real') || t.includes('float') || t.includes('double'))
    return 'text-[var(--solar-cyan)]';
  if (t.includes('bool'))                               return 'text-[var(--solar-orange)]';
  if (t.includes('time') || t.includes('date'))         return 'text-[var(--solar-magenta)]';
  if (t.includes('text') || t.includes('varchar') || t.includes('char'))
    return 'text-[var(--solar-green)]';
  if (t.includes('uuid'))                               return 'text-[var(--solar-blue)]';
  return 'text-[var(--text-muted)]';
}

function typeIcon(type: string): React.ReactNode {
  const t = type.toLowerCase();
  if (t.includes('int') || t.includes('num') || t.includes('real') || t.includes('float'))
    return <Hash size={10} className="text-[var(--solar-cyan)]" />;
  if (t.includes('time') || t.includes('date'))
    return <Calendar size={10} className="text-[var(--solar-magenta)]" />;
  return <Database size={10} className="text-[var(--text-muted)]" />;
}

function inputTypeFor(colType: string): 'number' | 'datetime-local' | 'date' | 'text' {
  const t = colType.toLowerCase();
  if (t.includes('int') || t.includes('num') || t.includes('real') || t.includes('float')) return 'number';
  if (t.includes('timestamp') || t.includes('datetime')) return 'datetime-local';
  if (t === 'date') return 'date';
  return 'text';
}

// ─── RowEditModal ─────────────────────────────────────────────────────────────

interface RowEditModalProps {
  mode:          'insert' | 'edit';
  schema:        SchemaCol[];
  initialValues: Record<string, unknown>;
  tableName:     string;
  onConfirm:     (sql: string) => void;
  onClose:       () => void;
  isRunning:     boolean;
}

const RowEditModal: React.FC<RowEditModalProps> = ({
  mode, schema, initialValues, tableName, onConfirm, onClose, isRunning,
}) => {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const col of schema) {
      const v = initialValues[col.name];
      init[col.name] = v === null || v === undefined ? '' : String(v);
    }
    return init;
  });
  const [nullSet, setNullSet] = useState<Set<string>>(() => {
    const s = new Set<string>();
    for (const col of schema) {
      if (initialValues[col.name] === null || initialValues[col.name] === undefined) s.add(col.name);
    }
    return s;
  });

  const pkCols = schema.filter(c => c.pk);

  function buildSql(): string {
    const table = qi(tableName);
    if (mode === 'insert') {
      const cols = schema.map(c => qi(c.name)).join(', ');
      const vals = schema.map(c =>
        nullSet.has(c.name) ? 'NULL' : sqlVal(values[c.name] === '' ? null : values[c.name])
      ).join(', ');
      return `INSERT INTO ${table} (${cols})\nVALUES (${vals});`;
    }
    const sets = schema
      .filter(c => !c.pk)
      .map(c => `  ${qi(c.name)} = ${nullSet.has(c.name) ? 'NULL' : sqlVal(values[c.name] === '' ? null : values[c.name])}`)
      .join(',\n');
    const where = pkCols.length > 0
      ? pkCols.map(c => `${qi(c.name)} = ${sqlVal(initialValues[c.name])}`).join(' AND ')
      : schema.slice(0, 2).map(c => `${qi(c.name)} = ${sqlVal(initialValues[c.name])}`).join(' AND ');
    return `UPDATE ${table}\nSET\n${sets}\nWHERE ${where};`;
  }

  const toggleNull = (name: string) =>
    setNullSet(prev => { const s = new Set(prev); s.has(name) ? s.delete(name) : s.add(name); return s; });

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-xl max-h-[92vh] flex flex-col overflow-hidden">

        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-subtle)] shrink-0">
          <div>
            <p className="text-[0.875rem] font-bold">{mode === 'insert' ? 'Insert Row' : 'Edit Row'}</p>
            <p className="text-[0.5625rem] font-mono text-[var(--text-muted)] mt-0.5">{tableName}</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 hover:bg-[var(--bg-hover)] rounded-xl text-[var(--text-muted)]">
            <X size={15} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
          {schema.map(col => {
            const isPkEdit = col.pk && mode === 'edit';
            const isNull   = nullSet.has(col.name);
            const isBool   = col.type.toLowerCase().includes('bool');

            return (
              <div key={col.name}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[0.6875rem] font-mono font-semibold text-[var(--text-main)]">{col.name}</span>
                  {col.pk && (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[0.5rem] font-black uppercase tracking-widest bg-[var(--solar-yellow)]/10 border border-[var(--solar-yellow)]/30 text-[var(--solar-yellow)]">
                      <Key size={7} /> pk
                    </span>
                  )}
                  {col.notnull && !col.pk && (
                    <span className="text-[0.5rem] font-bold uppercase tracking-widest text-[var(--solar-red)] opacity-70">required</span>
                  )}
                  <span className={`ml-auto text-[0.5625rem] font-mono font-bold ${typeColor(col.type)}`}>
                    {col.type || 'TEXT'}
                  </span>
                </div>

                {isBool ? (
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={values[col.name] === '1' || values[col.name] === 'true'}
                      onChange={e => setValues(p => ({ ...p, [col.name]: e.target.checked ? '1' : '0' }))}
                      disabled={isPkEdit}
                      className="w-4 h-4 accent-[var(--solar-cyan)]"
                    />
                    <span className="text-[0.6875rem] text-[var(--text-muted)]">true / 1</span>
                  </label>
                ) : (
                  <div className="flex gap-2">
                    <input
                      type={inputTypeFor(col.type)}
                      value={isNull ? '' : values[col.name]}
                      onChange={e => {
                        setNullSet(s => { const n = new Set(s); n.delete(col.name); return n; });
                        setValues(p => ({ ...p, [col.name]: e.target.value }));
                      }}
                      disabled={isPkEdit}
                      placeholder={isNull ? 'NULL' : col.dflt_value ? `default: ${col.dflt_value}` : ''}
                      className={`flex-1 min-w-0 rounded-xl border px-3 py-2 text-[0.75rem] font-mono bg-[var(--bg-app)] outline-none transition-colors placeholder:text-[var(--text-muted)]/50 text-[var(--text-main)] ${
                        isPkEdit
                          ? 'opacity-40 cursor-not-allowed border-[var(--border-subtle)]'
                          : isNull
                            ? 'border-[var(--solar-orange)]/40 bg-[var(--solar-orange)]/5'
                            : 'border-[var(--border-subtle)] focus:border-[var(--solar-blue)]/60'
                      }`}
                    />
                    {!isPkEdit && (
                      <button
                        type="button"
                        onClick={() => toggleNull(col.name)}
                        className={`px-2.5 rounded-xl text-[0.5625rem] font-bold uppercase tracking-widest border transition-all shrink-0 ${
                          isNull
                            ? 'bg-[var(--solar-orange)]/20 border-[var(--solar-orange)]/50 text-[var(--solar-orange)]'
                            : 'border-[var(--border-subtle)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]'
                        }`}
                      >
                        NULL
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="px-5 py-3 border-t border-[var(--border-subtle)] bg-[var(--bg-app)] shrink-0">
          <p className="text-[0.5rem] font-black uppercase tracking-widest text-[var(--text-muted)] mb-1.5">Generated SQL</p>
          <pre className="text-[0.5625rem] font-mono text-[var(--solar-cyan)] bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-xl px-3 py-2 overflow-x-auto whitespace-pre-wrap break-all max-h-28">
            {buildSql()}
          </pre>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[var(--border-subtle)] shrink-0">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-[0.75rem] font-bold text-[var(--text-muted)] hover:bg-[var(--bg-hover)]">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(buildSql())}
            disabled={isRunning}
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-[0.75rem] font-bold bg-[var(--solar-cyan)]/15 border border-[var(--solar-cyan)]/40 text-[var(--solar-cyan)] hover:bg-[var(--solar-cyan)]/25 disabled:opacity-50 transition-all"
          >
            {isRunning && <Loader2 size={13} className="animate-spin" />}
            {mode === 'insert' ? 'Insert Row' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── DeleteConfirmModal ───────────────────────────────────────────────────────

interface DeleteConfirmProps {
  tableName: string;
  pkCols:    SchemaCol[];
  row:       Record<string, unknown>;
  onConfirm: () => void;
  onClose:   () => void;
  isRunning: boolean;
}

const DeleteConfirmModal: React.FC<DeleteConfirmProps> = ({
  tableName, pkCols, row, onConfirm, onClose, isRunning,
}) => {
  const preview = pkCols.length > 0
    ? pkCols.map(c => `${c.name} = ${row[c.name]}`).join(', ')
    : Object.entries(row).slice(0, 2).map(([k, v]) => `${k} = ${v}`).join(', ');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-[var(--bg-panel)] border border-[var(--solar-red)]/30 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="px-6 pt-6 pb-4 flex items-start gap-4">
          <div className="p-2.5 bg-[var(--solar-red)]/15 rounded-xl shrink-0">
            <AlertTriangle size={18} className="text-[var(--solar-red)]" />
          </div>
          <div className="min-w-0">
            <h3 className="text-[0.875rem] font-bold">Delete Row</h3>
            <p className="text-[0.6875rem] text-[var(--text-muted)] mt-1">
              Permanently delete from <span className="font-mono font-bold text-[var(--text-main)]">{tableName}</span>.
              This cannot be undone.
            </p>
            <code className="block mt-2 text-[0.5625rem] font-mono text-[var(--solar-red)] bg-[var(--solar-red)]/8 px-2.5 py-1.5 rounded-lg border border-[var(--solar-red)]/20 break-all">
              WHERE {preview}
            </code>
          </div>
        </div>
        <div className="flex gap-2 px-6 pb-5 pt-1">
          <button type="button" onClick={onClose}
            className="flex-1 py-2 rounded-xl text-[0.75rem] font-bold text-[var(--text-muted)] border border-[var(--border-subtle)] hover:bg-[var(--bg-hover)]">
            Cancel
          </button>
          <button type="button" onClick={onConfirm} disabled={isRunning}
            className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-[0.75rem] font-bold bg-[var(--solar-red)]/15 border border-[var(--solar-red)]/40 text-[var(--solar-red)] hover:bg-[var(--solar-red)]/25 disabled:opacity-50 transition-all">
            {isRunning && <Loader2 size={13} className="animate-spin" />}
            Delete Row
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── SchemaView ───────────────────────────────────────────────────────────────

interface SchemaViewProps {
  tableName:  string;
  schema:     SchemaCol[];
  isLoading:  boolean;
  rowCount:   number | null;
  onBrowse:   () => void;
  onInsert:   () => void;
}

const SchemaView: React.FC<SchemaViewProps> = ({
  tableName, schema, isLoading, rowCount, onBrowse, onInsert,
}) => {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full gap-3 text-[var(--text-muted)]">
        <Loader2 size={16} className="animate-spin" />
        <span className="text-[0.75rem] font-mono">Loading schema…</span>
      </div>
    );
  }
  if (!schema.length) {
    return (
      <div className="flex items-center justify-center h-full opacity-30 text-[0.75rem] font-mono text-[var(--text-muted)]">
        No schema available.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* table meta */}
      <div className="px-6 py-4 border-b border-[var(--border-subtle)] shrink-0 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-[1rem] font-bold font-mono">{tableName}</h2>
          <div className="flex items-center gap-4 mt-1.5 flex-wrap text-[0.625rem] text-[var(--text-muted)]">
            <span><span className="font-bold text-[var(--text-main)]">{schema.length}</span> columns</span>
            {rowCount !== null && (
              <span>≈ <span className="font-bold text-[var(--text-main)]">{rowCount.toLocaleString()}</span> rows</span>
            )}
            <span>{schema.filter(c => c.pk).length} PK</span>
            <span>{schema.filter(c => c.notnull && !c.pk).length} required</span>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button type="button" onClick={onBrowse}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[0.6875rem] font-bold border border-[var(--border-subtle)] bg-[var(--bg-app)] text-[var(--text-main)] hover:border-[var(--solar-cyan)]/40 hover:bg-[var(--bg-hover)] transition-all">
            <LayoutGrid size={12} /> Browse Data
          </button>
          <button type="button" onClick={onInsert}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[0.6875rem] font-bold bg-[var(--solar-cyan)]/15 border border-[var(--solar-cyan)]/35 text-[var(--solar-cyan)] hover:bg-[var(--solar-cyan)]/25 transition-all">
            <Plus size={12} /> Insert Row
          </button>
        </div>
      </div>

      {/* columns */}
      <div className="flex-1 overflow-auto custom-scrollbar">
        <table className="w-full border-collapse text-left min-w-[520px]">
          <thead className="sticky top-0 z-10">
            <tr className="bg-[var(--bg-app)] border-b border-[var(--border-subtle)]">
              {['#', 'Column', 'Type', 'Nullable', 'Default', 'Constraints'].map(h => (
                <th key={h} className="px-4 py-2.5 text-[0.5rem] font-black uppercase tracking-widest text-[var(--text-muted)]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {schema.map((col, i) => (
              <tr key={col.name} className="border-b border-[var(--border-subtle)]/40 hover:bg-[var(--bg-hover)] transition-colors">
                <td className="px-4 py-2.5 text-[0.5625rem] font-mono text-[var(--text-muted)] opacity-35 w-8">{i + 1}</td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    {typeIcon(col.type)}
                    <span className="text-[0.75rem] font-mono font-semibold text-[var(--text-main)]">{col.name}</span>
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  <span className={`text-[0.6875rem] font-mono font-bold ${typeColor(col.type)}`}>{col.type || '—'}</span>
                </td>
                <td className="px-4 py-2.5">
                  {col.notnull
                    ? <span className="text-[0.5rem] font-black uppercase tracking-widest text-[var(--solar-red)]">NOT NULL</span>
                    : <span className="text-[0.5rem] text-[var(--text-muted)] opacity-40">nullable</span>}
                </td>
                <td className="px-4 py-2.5">
                  <span className="text-[0.6875rem] font-mono text-[var(--text-muted)]">
                    {col.dflt_value ?? <span className="opacity-25">—</span>}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  {col.pk && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[0.5rem] font-black uppercase tracking-widest bg-[var(--solar-yellow)]/10 border border-[var(--solar-yellow)]/30 text-[var(--solar-yellow)]">
                      <Key size={8} /> Primary Key
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ─── DataBrowser ──────────────────────────────────────────────────────────────

interface DataBrowserProps {
  rows:         Record<string, unknown>[];
  total:        number;
  page:         number;
  isLoading:    boolean;
  error:        string | null;
  onPageChange: (p: number) => void;
  onInsert:     () => void;
  onEdit:       (row: Record<string, unknown>) => void;
  onDelete:     (row: Record<string, unknown>) => void;
  onRefresh:    () => void;
}

const DataBrowser: React.FC<DataBrowserProps> = ({
  rows, total, page, isLoading, error,
  onPageChange, onInsert, onEdit, onDelete, onRefresh,
}) => {
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const start = page * PAGE_SIZE + 1;
  const end   = Math.min((page + 1) * PAGE_SIZE, total);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
        <div className="p-4 rounded-2xl border border-[var(--solar-red)]/30 bg-[var(--solar-red)]/8 max-w-md w-full">
          <div className="flex items-center gap-3 mb-2">
            <AlertTriangle size={15} className="text-[var(--solar-red)] shrink-0" />
            <span className="text-[0.75rem] font-bold text-[var(--solar-red)]">Query Error</span>
          </div>
          <pre className="text-[0.6875rem] font-mono text-[var(--solar-red)]/80 whitespace-pre-wrap break-words">{error}</pre>
        </div>
        <button type="button" onClick={onRefresh}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-[0.75rem] font-bold border border-[var(--border-subtle)] hover:bg-[var(--bg-hover)] text-[var(--text-muted)]">
          <RefreshCw size={13} /> Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border-subtle)] bg-[var(--bg-app)] shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-[0.625rem] font-mono text-[var(--text-muted)]">
            {total > 0
              ? `${start.toLocaleString()}–${end.toLocaleString()} of ${total.toLocaleString()} rows`
              : '0 rows'}
          </span>
          {isLoading && <Loader2 size={12} className="animate-spin text-[var(--solar-cyan)]" />}
        </div>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={onRefresh}
            className="p-1.5 hover:bg-[var(--bg-hover)] rounded-lg text-[var(--text-muted)]" title="Refresh">
            <RefreshCw size={12} />
          </button>
          <button type="button" onClick={onInsert}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[0.625rem] font-bold uppercase tracking-widest bg-[var(--solar-cyan)]/15 border border-[var(--solar-cyan)]/35 text-[var(--solar-cyan)] hover:bg-[var(--solar-cyan)]/25 transition-all">
            <Plus size={11} /> Insert
          </button>
        </div>
      </div>

      {/* grid */}
      <div className="flex-1 overflow-auto custom-scrollbar min-h-0">
        {rows.length === 0 && !isLoading ? (
          <div className="flex items-center justify-center h-full opacity-30 text-[0.75rem] font-mono text-[var(--text-muted)]">
            No rows found.
          </div>
        ) : (
          <DataGrid
            data={rows}
            rowActions={row => (
              <div className="flex gap-0.5">
                <button type="button" onClick={() => onEdit(row)}
                  className="p-1.5 hover:bg-[var(--solar-cyan)]/15 rounded-md text-[var(--text-muted)] hover:text-[var(--solar-cyan)] transition-colors" title="Edit row">
                  <Pencil size={11} />
                </button>
                <button type="button" onClick={() => onDelete(row)}
                  className="p-1.5 hover:bg-[var(--solar-red)]/15 rounded-md text-[var(--text-muted)] hover:text-[var(--solar-red)] transition-colors" title="Delete row">
                  <Trash2 size={11} />
                </button>
              </div>
            )}
          />
        )}
      </div>

      {/* pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1 px-4 py-2.5 border-t border-[var(--border-subtle)] bg-[var(--bg-panel)] shrink-0">
          <button type="button" onClick={() => onPageChange(0)} disabled={page === 0}
            className="p-1.5 hover:bg-[var(--bg-hover)] rounded-lg text-[var(--text-muted)] disabled:opacity-25">
            <ChevronLeft size={12} />
          </button>
          <button type="button" onClick={() => onPageChange(page - 1)} disabled={page === 0}
            className="px-2.5 py-1 hover:bg-[var(--bg-hover)] rounded-lg text-[0.625rem] font-bold text-[var(--text-muted)] disabled:opacity-25">
            Prev
          </button>
          <span className="px-3 text-[0.625rem] font-mono text-[var(--text-muted)]">
            <span className="text-[var(--text-main)] font-bold">{page + 1}</span> / {totalPages}
          </span>
          <button type="button" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages - 1}
            className="px-2.5 py-1 hover:bg-[var(--bg-hover)] rounded-lg text-[0.625rem] font-bold text-[var(--text-muted)] disabled:opacity-25">
            Next
          </button>
          <button type="button" onClick={() => onPageChange(totalPages - 1)} disabled={page >= totalPages - 1}
            className="p-1.5 hover:bg-[var(--bg-hover)] rounded-lg text-[var(--text-muted)] disabled:opacity-25">
            <ChevronRight size={12} />
          </button>
        </div>
      )}
    </div>
  );
};

// ─── TableSidebar ─────────────────────────────────────────────────────────────

interface TableSidebarProps {
  groups:         TableGroup[];
  openGroups:     Set<string>;
  onToggleGroup:  (prefix: string) => void;
  selected:       string | null;
  onSelect:       (t: string) => void;
  filter:         string;
  onFilter:       (v: string) => void;
  isLoading:      boolean;
  onRefresh:      () => void;
  snippets:       { id?: string; title?: string; sql_text?: string }[];
  onSnippet:      (sql: string) => void;
  history:        { id?: string; sql_text?: string; ok?: number }[];
  onHistory:      (sql: string) => void;
  onLoadSnippets: () => void;
  onLoadHistory:  () => void;
  totalTableCount: number;
}

const TableSidebar: React.FC<TableSidebarProps> = ({
  groups, openGroups, onToggleGroup, selected, onSelect,
  filter, onFilter, isLoading, onRefresh,
  snippets, onSnippet, history, onHistory,
  onLoadSnippets, onLoadHistory, totalTableCount,
}) => {
  const [snippetsOpen, setSnippetsOpen] = useState(false);
  const [historyOpen,  setHistoryOpen]  = useState(false);

  return (
    <div className="flex flex-col h-full bg-[var(--bg-panel)] overflow-hidden">

      {/* search */}
      <div className="p-2.5 border-b border-[var(--border-subtle)] shrink-0">
        <div className="flex items-center bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded-xl px-2.5 py-1.5 focus-within:border-[var(--solar-blue)]/50 transition-colors">
          <Search size={11} className="text-[var(--text-muted)] shrink-0 mr-2" />
          <input
            type="text"
            placeholder="Filter tables…"
            value={filter}
            onChange={e => onFilter(e.target.value)}
            className="bg-transparent outline-none text-[0.6875rem] w-full font-mono placeholder:text-[var(--text-muted)]/60 text-[var(--text-main)]"
          />
          {filter && (
            <button type="button" onClick={() => onFilter('')}
              className="ml-1 text-[var(--text-muted)] hover:text-[var(--text-main)] shrink-0">
              <X size={10} />
            </button>
          )}
        </div>
      </div>

      {/* list */}
      <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0 py-1">

        <div className="flex items-center justify-between px-3 py-1">
          <span className="text-[0.5rem] font-black uppercase tracking-widest text-[var(--text-muted)]">
            Tables <span className="ml-1 font-mono opacity-50">{totalTableCount}</span>
          </span>
          <button type="button" onClick={onRefresh} className="text-[var(--text-muted)] hover:text-[var(--text-main)]">
            <RefreshCw size={10} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>

        {groups.length === 0 && !isLoading && (
          <p className="px-3 py-6 text-center text-[0.625rem] font-mono text-[var(--text-muted)] opacity-40">
            {filter ? 'No match.' : 'No tables found.'}
          </p>
        )}

        {groups.map(group => {
          const isOpen = openGroups.has(group.prefix);
          return (
            <div key={group.prefix}>
              <button
                type="button"
                onClick={() => onToggleGroup(group.prefix)}
                className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--bg-hover)] transition-colors text-left"
              >
                <div style={{ transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 150ms' }}>
                  <ChevronRight size={10} className="text-[var(--text-muted)]" />
                </div>
                <span className="text-[0.5625rem] font-black uppercase tracking-widest text-[var(--text-muted)] flex-1 truncate">
                  {group.prefix}
                </span>
                <span className="text-[0.5rem] font-mono text-[var(--text-muted)] opacity-40 shrink-0">{group.tables.length}</span>
              </button>

              {isOpen && group.tables.map(table => (
                <button
                  key={table}
                  type="button"
                  onClick={() => onSelect(table)}
                  className={`group w-full flex items-center gap-2 pl-7 pr-3 py-1 hover:bg-[var(--bg-hover)] transition-colors text-left relative ${
                    selected === table ? 'bg-[var(--bg-hover)]' : ''
                  }`}
                >
                  {selected === table && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-[var(--solar-cyan)] rounded-r" />
                  )}
                  <TableIcon size={11} className={`shrink-0 ${
                    selected === table
                      ? 'text-[var(--solar-cyan)]'
                      : 'text-[var(--text-muted)] group-hover:text-[var(--solar-cyan)]'
                  }`} />
                  <span className={`text-[0.75rem] truncate font-mono ${
                    selected === table ? 'text-[var(--solar-cyan)] font-semibold' : 'text-[var(--text-main)]'
                  }`}>
                    {table}
                  </span>
                </button>
              ))}
            </div>
          );
        })}

        {/* snippets */}
        <div className="mt-2 pt-2 border-t border-[var(--border-subtle)]">
          <button
            type="button"
            onClick={() => setSnippetsOpen(o => !o)}
            className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-[var(--bg-hover)] transition-colors"
          >
            <span className="text-[0.5rem] font-black uppercase tracking-widest text-[var(--text-muted)]">Saved Snippets</span>
            <div className="flex items-center gap-2">
              <span
                role="button" tabIndex={0}
                onClick={e => { e.stopPropagation(); onLoadSnippets(); }}
                onKeyDown={e => e.key === 'Enter' && onLoadSnippets()}
                className="text-[0.5rem] font-bold text-[var(--solar-cyan)] hover:brightness-125"
              >
                refresh
              </span>
              {snippetsOpen
                ? <ChevronDown size={9} className="text-[var(--text-muted)]" />
                : <ChevronRight size={9} className="text-[var(--text-muted)]" />}
            </div>
          </button>
          {snippetsOpen && (
            <div className="px-2 pb-1">
              {snippets.length === 0
                ? <p className="px-2 py-2 text-[0.5625rem] text-[var(--text-muted)] opacity-50">No snippets. Save from SQL editor.</p>
                : snippets.map(s => (
                  <button key={s.id || s.title} type="button"
                    onClick={() => s.sql_text && onSnippet(s.sql_text)}
                    className="w-full text-left px-2 py-1.5 hover:bg-[var(--bg-hover)] rounded-lg text-[0.6875rem] text-[var(--text-main)] truncate">
                    {s.title || 'Untitled'}
                  </button>
                ))}
            </div>
          )}
        </div>

        {/* history */}
        <div className="mt-1 mb-3">
          <button
            type="button"
            onClick={() => setHistoryOpen(o => !o)}
            className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-[var(--bg-hover)] transition-colors"
          >
            <span className="text-[0.5rem] font-black uppercase tracking-widest text-[var(--text-muted)]">Recent Queries</span>
            <div className="flex items-center gap-2">
              <span
                role="button" tabIndex={0}
                onClick={e => { e.stopPropagation(); onLoadHistory(); }}
                onKeyDown={e => e.key === 'Enter' && onLoadHistory()}
                className="text-[0.5rem] font-bold text-[var(--solar-cyan)] hover:brightness-125"
              >
                refresh
              </span>
              {historyOpen
                ? <ChevronDown size={9} className="text-[var(--text-muted)]" />
                : <ChevronRight size={9} className="text-[var(--text-muted)]" />}
            </div>
          </button>
          {historyOpen && (
            <div className="px-2 pb-2">
              {history.length === 0
                ? <p className="px-2 py-2 text-[0.5625rem] text-[var(--text-muted)] opacity-50">No history yet.</p>
                : history.slice(0, 30).map(h => {
                  const sql = h.sql_text ?? '';
                  const ok  = h.ok !== 0;
                  return (
                    <button key={h.id || sql.slice(0, 16)} type="button"
                      onClick={() => sql && onHistory(sql)}
                      className="w-full text-left px-2 py-1 hover:bg-[var(--bg-hover)] rounded-lg border-b border-[var(--border-subtle)]/30 flex items-start gap-1.5">
                      <span className={`text-[0.5rem] font-black shrink-0 mt-0.5 ${ok ? 'text-[var(--solar-green)]' : 'text-[var(--solar-red)]'}`}>
                        {ok ? 'ok' : 'er'}
                      </span>
                      <span className="text-[0.5625rem] font-mono text-[var(--text-muted)] truncate">
                        {sql.replace(/\s+/g, ' ').slice(0, 60)}
                      </span>
                    </button>
                  );
                })}
            </div>
          )}
        </div>
      </div>

      {/* status bar */}
      <div className="px-3 py-2 border-t border-[var(--border-subtle)] bg-[var(--bg-app)] shrink-0 flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full bg-[var(--solar-green)] animate-pulse" />
        <span className="text-[0.5rem] font-mono text-[var(--text-muted)]">Connected</span>
      </div>
    </div>
  );
};

// ─── DatabasePage ─────────────────────────────────────────────────────────────

export const DatabasePage: React.FC = () => {

  // connection
  const [dbTarget,     setDbTarget]     = useState<DBTarget>('d1');
  const [hyperdriveOk, setHyperdriveOk] = useState<boolean | null>(null);

  // table list
  const [tables,           setTables]           = useState<string[]>([]);
  const [tableFilter,      setTableFilter]      = useState('');
  const [isLoadingTables,  setIsLoadingTables]  = useState(false);
  const [selectedTable,    setSelectedTable]    = useState<string | null>(null);
  const [openGroups,       setOpenGroups]       = useState<Set<string>>(new Set());

  // schema
  const [schema,           setSchema]           = useState<SchemaCol[]>([]);
  const [isLoadingSchema,  setIsLoadingSchema]  = useState(false);
  const [tableRowCount,    setTableRowCount]    = useState<number | null>(null);

  // data browser
  const [browseRows,       setBrowseRows]       = useState<Record<string, unknown>[]>([]);
  const [browsePage,       setBrowsePage]       = useState(0);
  const [isLoadingBrowse,  setIsLoadingBrowse]  = useState(false);
  const [browseError,      setBrowseError]      = useState<string | null>(null);

  // UI
  const [sidebarOpen,  setSidebarOpen]  = useState(true);
  const [activeTab,    setActiveTab]    = useState<MainTab>('schema');

  // SQL console injection
  const [consoleSql,    setConsoleSql]    = useState<string | undefined>(undefined);
  const [consoleSqlRev, setConsoleSqlRev] = useState(0);
  const [sqlHistory,    setSqlHistory]    = useState<string[]>([]);

  // modals
  const [editRow,        setEditRow]        = useState<Record<string, unknown> | null>(null);
  const [editMode,       setEditMode]       = useState<'insert' | 'edit'>('insert');
  const [deleteRow,      setDeleteRow]      = useState<Record<string, unknown> | null>(null);
  const [isModalRunning, setIsModalRunning] = useState(false);

  // snippets + history
  const [snippets,      setSnippets]      = useState<{ id?: string; title?: string; sql_text?: string }[]>([]);
  const [remoteHistory, setRemoteHistory] = useState<{ id?: string; sql_text?: string; ok?: number }[]>([]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const conn = DB_CONFIG[dbTarget];
  const queryEndpoint = dbTarget === 'hyperdrive' ? '/api/hyperdrive/query' : '/api/d1/query';

  const filteredGroups = useMemo(() => {
    const f = tableFilter.toLowerCase();
    return groupByPrefix(f ? tables.filter(t => t.includes(f)) : tables);
  }, [tables, tableFilter]);

  // auto-open groups when searching
  useEffect(() => {
    if (!tableFilter) { setOpenGroups(new Set()); return; }
    setOpenGroups(new Set(filteredGroups.map(g => g.prefix)));
  }, [tableFilter, filteredGroups]);

  // ── Core SQL executor ──────────────────────────────────────────────────────
  const execSQL = useCallback(async (sql: string): Promise<RunResult> => {
    const t0 = performance.now();
    try {
      const res  = await fetch(queryEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ sql }),
      });
      const data = await res.json();
      const ms   = Math.round(performance.now() - t0);
      if (!res.ok) return { success: false, error: data.error || res.statusText, executionMs: ms };
      if (data.error && !Array.isArray(data.results)) return { success: false, error: String(data.error), executionMs: ms };
      if (Array.isArray(data.results)) {
        const serverMs = Number.isFinite(Number(data.executionMs)) ? Math.round(Number(data.executionMs)) : ms;
        return { success: true, results: data.results, meta: data.meta, executionMs: serverMs };
      }
      return { success: false, error: 'Unexpected response', executionMs: ms };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }, [queryEndpoint]);

  // ── runSQL for SQLConsole (logs to history) ────────────────────────────────
  const runSQL = useCallback(async (sql: string): Promise<RunResult> => {
    const result = await execSQL(sql);
    if (result.success) setSqlHistory(prev => [sql, ...prev].slice(0, 50));
    void fetch('/api/agent/db/query-history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        sql_text: sql, db_target: dbTarget, ok: result.success,
        error_message: result.error, duration_ms: result.executionMs,
        row_count: result.results?.length,
      }),
    }).then(() => loadHistory()).catch(() => {});
    return result;
  }, [execSQL, dbTarget]);

  const pushConsoleSql = useCallback((sql: string) => {
    setConsoleSql(sql);
    setConsoleSqlRev(n => n + 1);
  }, []);

  // ── Data fetchers ──────────────────────────────────────────────────────────
  const fetchTables = useCallback(async () => {
    setIsLoadingTables(true);
    setSelectedTable(null);
    setSchema([]);
    setBrowseRows([]);
    try {
      const endpoint = dbTarget === 'hyperdrive' ? '/api/hyperdrive/tables' : '/api/agent/db/tables';
      const res  = await fetch(endpoint, { credentials: 'same-origin' });
      const data = await res.json();
      setTables(Array.isArray(data.tables) ? data.tables : []);
    } catch { setTables([]); }
    finally { setIsLoadingTables(false); }
  }, [dbTarget]);

  const fetchSchema = useCallback(async (table: string) => {
    setIsLoadingSchema(true);
    setSchema([]);
    setTableRowCount(null);
    try {
      const [schemaRes, countRes] = await Promise.all([
        execSQL(buildSchemaQuery(dbTarget, table)),
        execSQL(`SELECT COUNT(*) as count FROM ${qi(table)}`),
      ]);
      if (schemaRes.success && schemaRes.results) setSchema(normalizeSchema(schemaRes.results));
      if (countRes.success && countRes.results?.[0]) {
        const c = countRes.results[0];
        setTableRowCount(Number(c.count ?? c['COUNT(*)'] ?? 0));
      }
    } finally { setIsLoadingSchema(false); }
  }, [execSQL, dbTarget]);

  const fetchBrowseData = useCallback(async (table: string, page: number) => {
    setIsLoadingBrowse(true);
    setBrowseError(null);
    try {
      const result = await execSQL(`SELECT * FROM ${qi(table)} LIMIT ${PAGE_SIZE} OFFSET ${page * PAGE_SIZE}`);
      if (result.success) setBrowseRows(result.results ?? []);
      else { setBrowseError(result.error ?? 'Query failed'); setBrowseRows([]); }
    } catch (err) {
      setBrowseError(err instanceof Error ? err.message : String(err));
    } finally { setIsLoadingBrowse(false); }
  }, [execSQL]);

  const loadSnippets = useCallback(async () => {
    try {
      const res  = await fetch('/api/agent/db/snippets', { credentials: 'same-origin' });
      const data = res.ok ? await res.json() : { items: [] };
      setSnippets(Array.isArray(data.items) ? data.items : []);
    } catch { setSnippets([]); }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const res  = await fetch('/api/agent/db/query-history', { credentials: 'same-origin' });
      const data = res.ok ? await res.json() : { items: [] };
      setRemoteHistory(Array.isArray(data.items) ? data.items : []);
    } catch { setRemoteHistory([]); }
  }, []);

  const saveSnippet = useCallback(async (sql: string) => {
    const title = window.prompt('Snippet title');
    if (!title?.trim()) return;
    try {
      await fetch('/api/agent/db/snippets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ title: title.trim(), sql_text: sql, db_target: dbTarget }),
      });
      void loadSnippets();
    } catch { /* ignore */ }
  }, [dbTarget, loadSnippets]);

  // ── Bootstrap ──────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/hyperdrive/status', { credentials: 'same-origin' })
      .then(r => setHyperdriveOk(r.ok))
      .catch(() => setHyperdriveOk(false));
  }, []);
  useEffect(() => { void fetchTables(); }, [fetchTables]);
  useEffect(() => { void loadSnippets(); void loadHistory(); }, [loadSnippets, loadHistory]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleTableSelect = (table: string) => {
    setSelectedTable(table);
    setBrowsePage(0);
    setBrowseRows([]);
    setBrowseError(null);
    setActiveTab('schema');
    void fetchSchema(table);
  };

  const handleBrowseTab = () => {
    setActiveTab('data');
    if (selectedTable) void fetchBrowseData(selectedTable, browsePage);
  };

  const handlePageChange = (page: number) => {
    setBrowsePage(page);
    if (selectedTable) void fetchBrowseData(selectedTable, page);
  };

  const handleToggleGroup = (prefix: string) =>
    setOpenGroups(prev => { const s = new Set(prev); s.has(prefix) ? s.delete(prefix) : s.add(prefix); return s; });

  const handleSnippetOrHistoryClick = (sql: string) => {
    pushConsoleSql(sql);
    setActiveTab('sql');
  };

  // CRUD
  const openInsert = () => { setEditRow({}); setEditMode('insert'); };
  const openEdit   = (row: Record<string, unknown>) => { setEditRow(row); setEditMode('edit'); };
  const openDelete = (row: Record<string, unknown>) => setDeleteRow(row);

  const handleCrudConfirm = async (sql: string) => {
    setIsModalRunning(true);
    try {
      const result = await runSQL(sql);
      if (result.success) {
        setEditRow(null);
        setDeleteRow(null);
        if (selectedTable) {
          void fetchSchema(selectedTable);
          if (activeTab === 'data') void fetchBrowseData(selectedTable, browsePage);
        }
      } else {
        alert(`Error: ${result.error}`);
      }
    } finally { setIsModalRunning(false); }
  };

  const handleDeleteConfirm = async () => {
    if (!selectedTable || !deleteRow) return;
    const pkCols = schema.filter(c => c.pk);
    const where  = (pkCols.length > 0 ? pkCols : schema.slice(0, 2))
      .map(c => `${qi(c.name)} = ${sqlVal(deleteRow[c.name])}`)
      .join(' AND ');
    await handleCrudConfirm(`DELETE FROM ${qi(selectedTable)} WHERE ${where};`);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-[var(--bg-app)] text-[var(--text-main)] overflow-hidden">

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border-subtle)] bg-[var(--bg-panel)] shrink-0 flex-wrap gap-y-1.5">

        <button type="button" onClick={() => setSidebarOpen(o => !o)}
          className="p-1.5 hover:bg-[var(--bg-hover)] rounded-lg text-[var(--text-muted)] shrink-0"
          title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}>
          {sidebarOpen ? <PanelLeftClose size={15} /> : <PanelLeft size={15} />}
        </button>

        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-1.5 bg-[var(--solar-blue)]/10 rounded-lg shrink-0">
            <Database size={14} className="text-[var(--solar-blue)]" />
          </div>
          <div className="min-w-0 hidden sm:block">
            <p className="text-[0.6875rem] font-bold tracking-widest uppercase leading-none">Data Manager</p>
            <p className="text-[0.5625rem] font-mono text-[var(--text-muted)] mt-0.5 truncate">{conn.label}</p>
          </div>
        </div>

        {/* DB switcher */}
        <div className="flex items-center gap-1 ml-1">
          {(['d1', 'hyperdrive'] as DBTarget[]).map(t => {
            const disabled = t === 'hyperdrive' && hyperdriveOk === false;
            const active   = dbTarget === t;
            return (
              <button key={t} type="button" disabled={disabled}
                onClick={() => { if (!disabled) { setDbTarget(t); setSelectedTable(null); } }}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[0.5625rem] font-bold uppercase tracking-widest transition-all ${
                  active
                    ? 'bg-[var(--bg-hover)] border border-[var(--border-subtle)] text-[var(--text-heading)]'
                    : disabled
                      ? 'text-[var(--text-muted)] opacity-30 cursor-not-allowed'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-heading)] hover:bg-[var(--bg-hover)]'
                }`}>
                {t === 'd1' ? <HardDrive size={10} /> : <ExternalLink size={10} />}
                {t === 'd1' ? 'D1' : 'Hyperdrive'}
                {t === 'hyperdrive' && (
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    hyperdriveOk === null ? 'bg-[var(--text-muted)]'
                    : hyperdriveOk ? 'bg-[var(--solar-green)]' : 'bg-[var(--solar-red)]'
                  }`} />
                )}
                {active && <Check size={9} className="text-[var(--solar-cyan)]" />}
              </button>
            );
          })}
        </div>

        {/* breadcrumb */}
        {selectedTable && (
          <div className="flex items-center gap-1 ml-2 min-w-0">
            <ChevronRight size={11} className="text-[var(--text-muted)] shrink-0" />
            <span className="text-[0.6875rem] font-mono text-[var(--text-main)] font-semibold truncate max-w-[150px]">
              {selectedTable}
            </span>
          </div>
        )}

        {/* tab switcher */}
        {selectedTable ? (
          <div className="flex items-center gap-0.5 ml-auto bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded-xl p-0.5">
            {([
              { id: 'schema' as MainTab, icon: <Info size={11} />,       label: 'Schema' },
              { id: 'data'   as MainTab, icon: <LayoutGrid size={11} />, label: 'Data',  onClick: handleBrowseTab },
              { id: 'sql'    as MainTab, icon: <Code2 size={11} />,      label: 'SQL'   },
            ]).map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => tab.onClick ? tab.onClick() : setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[0.5625rem] font-bold uppercase tracking-widest transition-all ${
                  activeTab === tab.id
                    ? 'bg-[var(--bg-panel)] text-[var(--text-heading)] shadow-sm'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
                }`}>
                {tab.icon}{tab.label}
              </button>
            ))}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setActiveTab('sql')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[0.5625rem] font-bold uppercase tracking-widest ml-auto transition-all ${
              activeTab === 'sql'
                ? 'bg-[var(--bg-hover)] text-[var(--text-heading)] border border-[var(--border-subtle)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-heading)] hover:bg-[var(--bg-hover)]'
            }`}>
            <Code2 size={11} /> SQL Editor
          </button>
        )}
      </div>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden relative">

        {/* sidebar */}
        {sidebarOpen && (
          <div className="w-56 shrink-0 border-r border-[var(--border-subtle)] flex flex-col min-h-0
                          max-md:absolute max-md:inset-y-0 max-md:left-0 max-md:z-20 max-md:w-[85vw] max-md:shadow-2xl">
            <TableSidebar
              groups={filteredGroups}
              openGroups={openGroups}
              onToggleGroup={handleToggleGroup}
              selected={selectedTable}
              onSelect={handleTableSelect}
              filter={tableFilter}
              onFilter={setTableFilter}
              isLoading={isLoadingTables}
              onRefresh={fetchTables}
              snippets={snippets}
              onSnippet={handleSnippetOrHistoryClick}
              history={remoteHistory}
              onHistory={handleSnippetOrHistoryClick}
              onLoadSnippets={loadSnippets}
              onLoadHistory={loadHistory}
              totalTableCount={tables.length}
            />
          </div>
        )}

        {/* mobile backdrop */}
        {sidebarOpen && (
          <div
            className="hidden max-md:block fixed inset-0 z-10 bg-black/50"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* main content */}
        <div className="flex-1 min-w-0 min-h-0 overflow-hidden flex flex-col">

          {/* no table selected + not SQL */}
          {!selectedTable && activeTab !== 'sql' && (
            <div className="flex-1 flex flex-col items-center justify-center gap-5 p-8 opacity-60">
              <div className="p-5 rounded-2xl bg-[var(--bg-panel)] border border-[var(--border-subtle)]">
                <Database size={28} className="text-[var(--solar-blue)]" />
              </div>
              <div className="text-center max-w-xs">
                <p className="text-[0.875rem] font-bold mb-1">Select a table</p>
                <p className="text-[0.6875rem] text-[var(--text-muted)]">
                  Choose from the sidebar to inspect schema, browse data, or run SQL.
                </p>
              </div>
              <button type="button" onClick={() => setActiveTab('sql')}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-[0.75rem] font-bold border border-[var(--border-subtle)] hover:bg-[var(--bg-hover)] text-[var(--text-muted)] transition-all">
                <Code2 size={13} /> Open SQL Editor
              </button>
            </div>
          )}

          {/* schema tab */}
          {activeTab === 'schema' && selectedTable && (
            <div className="flex-1 min-h-0 overflow-hidden">
              <SchemaView
                tableName={selectedTable}
                schema={schema}
                isLoading={isLoadingSchema}
                rowCount={tableRowCount}
                onBrowse={handleBrowseTab}
                onInsert={openInsert}
              />
            </div>
          )}

          {/* data tab */}
          {activeTab === 'data' && selectedTable && (
            <div className="flex-1 min-h-0 overflow-hidden">
              <DataBrowser
                rows={browseRows}
                total={tableRowCount ?? 0}
                page={browsePage}
                isLoading={isLoadingBrowse}
                error={browseError}
                onPageChange={handlePageChange}
                onInsert={openInsert}
                onEdit={openEdit}
                onDelete={openDelete}
                onRefresh={() => selectedTable && void fetchBrowseData(selectedTable, browsePage)}
              />
            </div>
          )}

          {/* SQL tab — always rendered, hidden via CSS to preserve Monaco state */}
          <div className={`flex-1 min-h-0 overflow-hidden flex flex-col ${activeTab === 'sql' ? '' : 'hidden'}`}>
            <SQLConsole
              key={dbTarget}
              onExecute={runSQL}
              history={sqlHistory}
              dialect={conn.dialect}
              initialSql={consoleSql}
              initialSqlRevision={consoleSqlRev}
              onSaveSnippet={sql => void saveSnippet(sql)}
            />
          </div>
        </div>
      </div>

      {/* ── Modals ───────────────────────────────────────────────────────── */}

      {editRow !== null && schema.length > 0 && selectedTable && (
        <RowEditModal
          mode={editMode}
          schema={schema}
          initialValues={editRow}
          tableName={selectedTable}
          onConfirm={handleCrudConfirm}
          onClose={() => setEditRow(null)}
          isRunning={isModalRunning}
        />
      )}

      {deleteRow !== null && selectedTable && (
        <DeleteConfirmModal
          tableName={selectedTable}
          pkCols={schema.filter(c => c.pk)}
          row={deleteRow}
          onConfirm={handleDeleteConfirm}
          onClose={() => setDeleteRow(null)}
          isRunning={isModalRunning}
        />
      )}
    </div>
  );
};

export default DatabasePage;

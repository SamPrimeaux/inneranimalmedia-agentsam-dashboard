import { Command, Loader2, Search, KeyRound, Terminal, Globe, HardDrive } from 'lucide-react';

export type UnifiedSearchNavigate =
  | { kind: 'table'; name: string }
  | { kind: 'conversation'; id: string }
  | { kind: 'knowledge'; url: string | null; label: string }
  | { kind: 'sql'; sql: string }
  | { kind: 'deployment'; summary: string }
  | { kind: 'column'; sql: string };

type DeployRow = {
  type: 'deployment';
  id: string;
  title: string;
  subtitle?: string;
  summary?: string;
};
type SnippetRow = { type: 'snippet'; id: string; title: string; subtitle?: string; sql_text: string };
type QueryRow = { type: 'query'; id: string; title: string; subtitle?: string; sql_text: string };
type TableRow = { type: 'table'; id: string; title: string; subtitle?: string };
type ColumnRow = { type: 'column'; id: string; title: string; subtitle?: string; sql_text: string };
type ConvRow = { type: 'conversation'; id: string; title: string; subtitle?: string };
type KnowRow = {
  type: 'knowledge';
  id: string;
  title: string;
  subtitle?: string;
  url?: string | null;
  score?: number | null;
};

type UnifiedRow = DeployRow | SnippetRow | QueryRow | TableRow | ColumnRow | ConvRow | KnowRow;

function flattenResults(data: {
  deployments?: DeployRow[];
  snippets?: SnippetRow[];
  past_queries?: QueryRow[];
  tables?: TableRow[];
  columns?: ColumnRow[];
  conversations?: ConvRow[];
  knowledge?: KnowRow[];
}): UnifiedRow[] {
  const out: UnifiedRow[] = [];
  for (const d of data.deployments || []) out.push(d);
  for (const s of data.snippets || []) out.push(s);
  for (const p of data.past_queries || []) out.push(p);
  for (const t of data.tables || []) out.push(t);
  for (const col of data.columns || []) out.push(col);
  for (const c of data.conversations || []) out.push(c);
  for (const k of data.knowledge || []) out.push(k);
  return out;
}

/** Prefer ranked `results` from worker (template-style); else legacy buckets. */
function normalizeSearchRows(data: Record<string, unknown>): UnifiedRow[] {
  const ranked = data.results;
  if (Array.isArray(ranked) && ranked.length > 0) {
    const out: UnifiedRow[] = [];
    for (const raw of ranked) {
      if (!raw || typeof raw !== 'object') continue;
      const r = raw as Record<string, unknown>;
      const type = String(r.type || '');
      const id = String(r.id ?? r.path ?? '');
      const title = String(r.title ?? '');
      const subtitle = r.subtitle != null ? String(r.subtitle) : undefined;
      if (type === 'deployment') {
        out.push({
          type: 'deployment',
          id,
          title,
          subtitle,
          summary: r.summary != null ? String(r.summary) : undefined,
        });
        continue;
      }
      if (type === 'snippet') {
        const sql = r.sql_text != null ? String(r.sql_text) : '';
        out.push({ type: 'snippet', id, title, subtitle, sql_text: sql });
        continue;
      }
      if (type === 'query') {
        const sql = r.sql_text != null ? String(r.sql_text) : '';
        out.push({ type: 'query', id, title, subtitle, sql_text: sql });
        continue;
      }
      if (type === 'table') {
        out.push({ type: 'table', id, title, subtitle });
        continue;
      }
      if (type === 'column') {
        const sql = r.sql_text != null ? String(r.sql_text) : '';
        out.push({ type: 'column', id, title, subtitle, sql_text: sql });
        continue;
      }
      if (type === 'conversation') {
        out.push({ type: 'conversation', id, title, subtitle });
        continue;
      }
      if (type === 'knowledge') {
        out.push({
          type: 'knowledge',
          id,
          title,
          subtitle,
          url: r.url != null ? String(r.url) : null,
          score: typeof r.score === 'number' ? r.score : null,
        });
      }
    }
    return out;
  }
  return flattenResults(data as Parameters<typeof flattenResults>[0]);
}

function rowLabel(row: UnifiedRow): string {
  switch (row.type) {
    case 'deployment':
      return 'Deploy';
    case 'snippet':
      return 'Snippet';
    case 'query':
      return 'Query';
    case 'table':
      return 'Table';
    case 'column':
      return 'Column';
    case 'conversation':
      return 'Chat';
    default:
      return 'Knowledge';
  }
}

/**
 * Cursor-style command palette: deployments, snippets, SQL history, D1 tables, chats, RAG.
 * Global shortcut: Cmd+K / Ctrl+K.
 */
export const UnifiedSearchBar: React.FC<{
  workspaceLabel?: string;
  onNavigate: (nav: UnifiedSearchNavigate, searchQuery: string) => void;
  onRunCommand?: (cmd: string) => void;
}> = ({ workspaceLabel, onNavigate, onRunCommand }) => {
  const [open, setOpen] = useState(false);
  const [sshOpen, setSshOpen] = useState(false);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<UnifiedRow[]>([]);
  const [recent, setRecent] = useState<{ query?: string; result_kind?: string; opened_id?: string }[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadRecent = useCallback(async () => {
    try {
      const r = await fetch('/api/unified-search/recent', { credentials: 'same-origin' });
      const j = r.ok ? await r.json() : { items: [] };
      setRecent(Array.isArray(j.items) ? j.items : []);
    } catch {
      setRecent([]);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void loadRecent();
    setActive(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open, loadRecent]);

  const runSearch = useCallback(async (query: string) => {
    const t = query.trim();
    if (t.length < 2) {
      setRows([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/unified-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ query: t, limit: 22 }),
      });
      const data = res.ok ? await res.json() : {};
      setRows(normalizeSearchRows(data && typeof data === 'object' ? (data as Record<string, unknown>) : {}));
      setActive(0);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void runSearch(q), 220);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q, open, runSearch]);

  const track = useCallback((searchQuery: string, row: UnifiedRow) => {
    void fetch('/api/unified-search/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        query: searchQuery,
        result_kind: row.type,
        opened_id: row.id,
      }),
    }).catch(() => {});
  }, []);

  const applyRow = useCallback(
    (row: UnifiedRow, searchQuery: string) => {
      track(searchQuery, row);
      if (row.type === 'table') {
        onNavigate({ kind: 'table', name: row.id }, searchQuery);
      } else if (row.type === 'conversation') {
        onNavigate({ kind: 'conversation', id: row.id }, searchQuery);
      } else if (row.type === 'column') {
        const sql = row.sql_text?.trim();
        if (sql) onNavigate({ kind: 'column', sql }, searchQuery);
      } else if (row.type === 'snippet' || row.type === 'query') {
        const sql = row.sql_text?.trim();
        if (sql) onNavigate({ kind: 'sql', sql }, searchQuery);
      } else if (row.type === 'deployment') {
        const summary = row.summary || row.subtitle || row.title;
        onNavigate({ kind: 'deployment', summary }, searchQuery);
      } else {
        onNavigate({ kind: 'knowledge', url: row.url ?? null, label: row.title || row.subtitle || 'Result' }, searchQuery);
      }
      setOpen(false);
      setQ('');
      setRows([]);
    },
    [onNavigate, track],
  );

  const flatList = useMemo(() => rows, [rows]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === 'Escape') {
        if (open) { e.preventDefault(); setOpen(false); }
        if (sshOpen) { e.preventDefault(); setSshOpen(false); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, Math.max(0, flatList.length - 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter' && flatList.length > 0) {
      e.preventDefault();
      const row = flatList[active];
      if (row) applyRow(row, q.trim());
    }
  };

  const isMac =
    typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent || navigator.platform || '');

  return (
    <div className="nav-search-container w-full max-w-lg hidden lg:block">
      <div className="flex items-center gap-1">
        <button
          type="button"
          title="Unified search (Cmd+K)"
          aria-label="Open unified search"
          onClick={() => setOpen(o => !o)}
          className="flex flex-col items-stretch w-full px-3 py-1 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-app)] text-left hover:border-[var(--solar-cyan)]/40 transition-colors gap-0.5"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Search size={14} className="shrink-0 opacity-70 text-[var(--text-muted)]" />
            <span className="text-[11px] text-[var(--text-muted)] truncate flex-1">
              workspace:{' '}
              <span className="text-[var(--text-main)] font-medium">{workspaceLabel?.trim() || 'dashboard'}</span>
            </span>
            <kbd className="hidden xl:inline text-[9px] font-mono px-1 py-px rounded border border-[var(--border-subtle)] text-[var(--text-muted)] shrink-0">
              {isMac ? 'Cmd' : 'Ctrl'}+K
            </kbd>
          </div>
        </button>

        <div className="relative shrink-0">
          <button
            type="button"
            className={`p-1.5 rounded-md border transition-all ${
              sshOpen 
                ? 'bg-[var(--bg-panel)] border-[var(--solar-cyan)] text-[var(--solar-cyan)]' 
                : 'bg-[var(--bg-app)] border-[var(--border-subtle)] text-[var(--text-muted)] hover:border-[var(--solar-cyan)]/40 hover:text-[var(--text-main)]'
            }`}
            onClick={(e) => {
              e.stopPropagation();
              setSshOpen(!sshOpen);
              if (open) setOpen(false);
            }}
            title="Connect Workspace (SSH)"
          >
            <KeyRound size={16} />
          </button>

          {sshOpen && (
            <div className="absolute top-full right-0 mt-2 z-[110] w-56 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] shadow-2xl overflow-hidden py-1 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] border-b border-[var(--border-subtle)]/40 mb-1">
                SSH Command Hub
              </div>
              <button 
                className="w-full text-left px-3 py-2 hover:bg-[var(--bg-hover)] flex items-center gap-3 text-[12px] group"
                onClick={() => {
                  onRunCommand?.('ssh iam-pty');
                  setSshOpen(false);
                }}
              >
                <div className="w-8 h-8 rounded-lg bg-[var(--bg-app)] flex items-center justify-center text-[var(--text-muted)] group-hover:text-[var(--solar-cyan)] transition-colors">
                  <Terminal size={14} />
                </div>
                <div>
                  <div className="font-bold">Local PTY</div>
                  <div className="text-[10px] opacity-60">iam-pty / port 3099</div>
                </div>
              </button>
              <button 
                className="w-full text-left px-3 py-2 hover:bg-[var(--bg-hover)] flex items-center gap-3 text-[12px] group"
                onClick={() => {
                  onRunCommand?.('ssh production-iam');
                  setSshOpen(false);
                }}
              >
                <div className="w-8 h-8 rounded-lg bg-[var(--bg-app)] flex items-center justify-center text-[var(--text-muted)] group-hover:text-[var(--solar-cyan)] transition-colors">
                  <Globe size={14} />
                </div>
                <div>
                  <div className="font-bold text-[var(--solar-green)]">Production</div>
                  <div className="text-[10px] opacity-60">mainstage / iam-prod</div>
                </div>
              </button>
              <button 
                className="w-full text-left px-3 py-2 hover:bg-[var(--bg-hover)] flex items-center gap-3 text-[12px] group"
                onClick={() => {
                  onRunCommand?.('ssh sandbox-d1');
                  setSshOpen(false);
                }}
              >
                <div className="w-8 h-8 rounded-lg bg-[var(--bg-app)] flex items-center justify-center text-[var(--text-muted)] group-hover:text-[var(--solar-cyan)] transition-colors">
                  <HardDrive size={14} />
                </div>
                <div>
                  <div className="font-bold text-[var(--solar-cyan)]">Sandbox</div>
                  <div className="text-[10px] opacity-60">experiment-d1-ws</div>
                </div>
              </button>
            </div>
          )}
        </div>
      </div>

      {open && (
        <div className="nav-dropdown rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] shadow-2xl overflow-hidden flex flex-col max-h-[min(65vh,500px)]">
            <div className="px-3 py-2 border-b border-[var(--border-subtle)] space-y-1">
              <div className="flex items-center gap-2">
                <Search size={16} className="text-[var(--text-muted)] shrink-0" />
                <input
                  ref={inputRef}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="Search deploys, SQL, tables, chats, knowledge…"
                  className="flex-1 min-w-0 bg-transparent border-0 outline-none text-[13px] text-[var(--text-main)] placeholder:text-[var(--text-muted)]"
                />
                {loading ? <Loader2 size={16} className="animate-spin text-[var(--solar-cyan)] shrink-0" /> : null}
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto chat-hide-scroll">
              {q.trim().length < 2 && recent.length > 0 ? (
                <div className="px-3 py-2">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] mb-2">
                    Recent searches
                  </div>
                  {recent.slice(0, 8).map((r, i) => (
                    <div key={`${r.query}-${i}`} className="text-[11px] text-[var(--text-muted)] py-1 font-mono truncate">
                      {r.query || '(empty)'}
                    </div>
                  ))}
                </div>
              ) : null}

              {flatList.length === 0 && q.trim().length >= 2 && !loading ? (
                <div className="px-4 py-8 text-center text-[12px] text-[var(--text-muted)]">No matches</div>
              ) : null}

              {flatList.map((row, i) => (
                <button
                  key={`${row.type}-${row.id}-${i}`}
                  type="button"
                  onClick={() => applyRow(row, q.trim())}
                  className={`w-full text-left px-3 py-2.5 border-b border-[var(--border-subtle)]/60 transition-colors ${
                    i === active ? 'bg-[var(--bg-hover)]' : 'hover:bg-[var(--bg-hover)]/70'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-[var(--solar-cyan)] shrink-0">
                      {rowLabel(row)}
                    </span>
                    <span className="text-[12px] font-semibold text-[var(--text-main)] truncate">{row.title}</span>
                  </div>
                  {row.subtitle ? (
                    <div className="text-[11px] text-[var(--text-muted)] line-clamp-2">{row.subtitle}</div>
                  ) : null}
                </button>
              ))}
            </div>

            <div className="px-3 py-2 border-t border-[var(--border-subtle)] text-[10px] text-[var(--text-muted)] flex justify-between">
              <span>Enter to open</span>
              <span>Esc to close</span>
            </div>
        </div>
      )}
    </div>
  );
};

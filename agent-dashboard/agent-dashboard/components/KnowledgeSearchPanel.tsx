import React, { useCallback, useState } from 'react';
import { Search, Loader2, BookOpen } from 'lucide-react';

/**
 * Session-authenticated RAG query against /api/rag/query (D1 cosine chunks).
 */
export const KnowledgeSearchPanel: React.FC<{ onClose?: () => void }> = ({ onClose }) => {
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [context, setContext] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ chunks?: number; ms?: number; top?: number } | null>(null);

  const run = useCallback(async () => {
    const query = q.trim();
    if (query.length < 2) {
      setErr('Enter at least 2 characters.');
      return;
    }
    setLoading(true);
    setErr(null);
    setContext(null);
    setMeta(null);
    try {
      const res = await fetch('/api/rag/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ query, top_k: 8 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(typeof data.error === 'string' ? data.error : `Request failed (${res.status})`);
        return;
      }
      const ctx = typeof data.context === 'string' ? data.context : '';
      setContext(ctx || '(No matching chunks.)');
      setMeta({
        chunks: typeof data.chunks_injected === 'number' ? data.chunks_injected : undefined,
        ms: typeof data.duration_ms === 'number' ? data.duration_ms : undefined,
        top: typeof data.top_score === 'number' ? data.top_score : undefined,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  }, [q]);

  return (
    <div className="w-full h-full bg-[var(--bg-panel)] flex flex-col text-[var(--text-main)] overflow-hidden min-h-0">
      <div className="px-3 py-2 border-b border-[var(--border-subtle)] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <BookOpen size={14} className="text-[var(--solar-cyan)] shrink-0" />
          <span className="text-[11px] font-bold tracking-widest uppercase truncate">Knowledge search</span>
        </div>
        {onClose && (
          <button
            type="button"
            className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-main)] px-2 py-1 rounded border border-[var(--border-subtle)]"
            onClick={onClose}
          >
            Close
          </button>
        )}
      </div>
      <div className="p-3 border-b border-[var(--border-subtle)]/50 shrink-0 flex flex-col gap-2">
        <div className="flex items-center gap-2 rounded border border-[var(--border-subtle)] px-2 py-1.5 bg-[var(--bg-app)]">
          <Search size={14} className="text-[var(--text-muted)] shrink-0" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void run()}
            placeholder="Search indexed knowledge (autorag chunks)…"
            className="w-full bg-transparent text-[12px] outline-none placeholder:text-[var(--text-muted)]"
          />
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={() => void run()}
          className="flex items-center justify-center gap-2 py-2 rounded text-[11px] font-semibold bg-[var(--solar-cyan)]/20 text-[var(--solar-cyan)] border border-[var(--solar-cyan)]/40 hover:bg-[var(--solar-cyan)]/30 disabled:opacity-50"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
          Run search
        </button>
        {meta && (meta.chunks != null || meta.ms != null) && (
          <p className="text-[10px] text-[var(--text-muted)] font-mono">
            {meta.chunks != null ? `${meta.chunks} chunks` : ''}
            {meta.ms != null ? ` · ${meta.ms} ms` : ''}
            {meta.top != null ? ` · top ${meta.top.toFixed(3)}` : ''}
          </p>
        )}
        {err && <p className="text-[11px] text-[var(--solar-orange)]">{err}</p>}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-3">
        {context ? (
          <pre className="text-[11px] text-[var(--text-main)]/90 whitespace-pre-wrap font-mono leading-relaxed">
            {context}
          </pre>
        ) : (
          <p className="text-[11px] text-[var(--text-muted)]">
            Results appear here. Queries run against indexed knowledge in D1 (same pipeline as Agent tools).
          </p>
        )}
      </div>
    </div>
  );
};

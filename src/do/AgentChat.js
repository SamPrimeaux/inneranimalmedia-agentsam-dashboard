/**
 * High-performance Agent Chat storage using the native Worker SQL API.
 * Stores session messages and RAG context cache.
 */
import { DurableObject } from "cloudflare:workers";

export class AgentChatSqlV1 extends DurableObject {
  /**
   * @param {import('@cloudflare/workers-types').DurableObjectState} state
   * @param {Record<string, unknown>} env
   */
  constructor(state, env) {
    super(state, env);
    this.state = state;
    this.env = env;
    /** @type {import('@cloudflare/workers-types').SqlStorage} */
    this.sql = state.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS session_messages (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      model_used TEXT,
      input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      rag_chunks_injected INTEGER DEFAULT 0,
      top_rag_score REAL DEFAULT 0,
      created_at INTEGER DEFAULT (unixepoch())
    )`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS session_rag_cache (
      query_hash TEXT PRIMARY KEY,
      chunk_ids TEXT,
      context TEXT,
      top_score REAL,
      cached_at INTEGER DEFAULT (unixepoch())
    )`);
  }

  /** @param {Request} request */
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return Response.json({ ok: true, class: 'AgentChatSqlV1' });
    }

    if (url.pathname === '/history') {
      const limit = parseInt(url.searchParams.get('limit') || '50', 10);
      const rows = [...this.sql.exec(
        'SELECT id, role, content, model_used, input_tokens, output_tokens, created_at FROM session_messages ORDER BY created_at DESC LIMIT ?',
        limit,
      )];
      return Response.json({ messages: rows.reverse() });
    }

    if (url.pathname === '/message' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const { role, content, model_used, input_tokens, output_tokens, rag_chunks_injected, top_rag_score } = body;
      this.sql.exec(
        'INSERT INTO session_messages (role,content,model_used,input_tokens,output_tokens,rag_chunks_injected,top_rag_score) VALUES (?,?,?,?,?,?,?)',
        role,
        content,
        model_used ?? null,
        input_tokens ?? 0,
        output_tokens ?? 0,
        rag_chunks_injected ?? 0,
        top_rag_score ?? 0,
      );
      return Response.json({ ok: true });
    }

    if (url.pathname === '/rag-cache' && request.method === 'GET') {
      const hash = url.searchParams.get('hash');
      if (!hash) return Response.json({ hit: false });
      const cutoff = Math.floor(Date.now() / 1000) - 3600;
      const rows = [...this.sql.exec(
        'SELECT query_hash, chunk_ids, context, top_score, cached_at FROM session_rag_cache WHERE query_hash = ? AND cached_at > ?',
        hash,
        cutoff,
      )];
      if (!rows.length) return Response.json({ hit: false });
      const row = rows[0];
      return Response.json({
        hit: true,
        query_hash: row.query_hash,
        chunk_ids: row.chunk_ids,
        context: row.context,
        top_score: row.top_score,
        cached_at: row.cached_at,
      });
    }

    if (url.pathname === '/rag-cache' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const { query_hash, chunk_ids, context, top_score } = body;
      this.sql.exec(
        'INSERT OR REPLACE INTO session_rag_cache (query_hash, chunk_ids, context, top_score) VALUES (?,?,?,?)',
        query_hash,
        chunk_ids,
        context,
        top_score ?? 0,
      );
      return Response.json({ ok: true });
    }

    return new Response('AgentChatSqlV1 DO', { status: 200 });
  }
}

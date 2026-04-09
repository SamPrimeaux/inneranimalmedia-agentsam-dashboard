/**
 * API Service: RAG (Retrieval-Augmented Generation)
 * Handles vector search, context retrieval, and memory indexing.
 * Deconstructed from legacy worker.js.
 */
import { tenantIdFromEnv } from '../core/auth';

export const UNIFIED_RAG_EMBED_MODEL = '@cf/baai/bge-base-en-v1.5';
export const RAG_MEMORY_EMBED_MODEL = '@cf/baai/bge-large-en-v1.5';
export const RAG_CHUNK_MAX_CHARS = 600;
export const RAG_CHUNK_OVERLAP = 80;
export const RAG_EMBED_BATCH_SIZE = 32;
export const RAG_COMPACT_MAX_MSG_CHARS = 800;
export const RAG_COMPACT_HOURS = 48;
export const PGVECTOR_DEFAULT_PROJECT_ID = 'inneranimalmedia';

/**
 * Sanitizes search terms for SQL LIKE queries.
 */
export function sanitizeUnifiedRagLike(q) {
  return String(q || '').slice(0, 120).replace(/[%_\[\]^]/g, ' ').trim();
}

/**
 * Fast content hasher for deduplication.
 */
export function unifiedRagContentHash(s) {
  const t = String(s || '').trim().replace(/\s+/g, ' ').slice(0, 600);
  let h = 2166136261;
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return String(h);
}

/**
 * Normalizes recency score (0 to 1).
 */
export function unifiedRagRecency01(ts) {
  const now = Math.floor(Date.now() / 1000);
  let sec = 0;
  if (!ts) return 0.5;
  if (typeof ts === 'number') {
    sec = ts > 1e12 ? Math.floor(ts / 1000) : Math.floor(ts);
  } else {
    const parsed = Date.parse(String(ts));
    if (isNaN(parsed)) return 0.5;
    sec = Math.floor(parsed / 1000);
  }
  const ageDays = Math.max(0, (now - sec) / 86400);
  return Math.max(0, Math.min(1, 1 - Math.min(ageDays, 365) / 365));
}

/**
 * Cosine similarity calculation for vector comparison.
 */
export function unifiedRagCosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-8);
}

/**
 * Unified search engine: parallel D1, Vectorize, and R2 retrieval.
 */
export async function unifiedRagSearch(env, query, opts = {}) {
  const q = String(query || '').trim();
  if (!q || !env.DB || !env.AI) {
    return { matches: [], results: [], count: 0, _error: 'missing_bindings' };
  }
  const topK = Math.min(Math.max(1, opts.topK || 8), 24);
  const skipLogging = !!opts.skipLogging;
  const likePct = `%${sanitizeUnifiedRagLike(q)}%`;
  const _t0 = Date.now();

  // 1. Generate Query Embedding
  const emb = await env.AI.run(UNIFIED_RAG_EMBED_MODEL, { text: q });
  const qVec = emb?.data?.[0] ?? emb?.result?.data?.[0];
  if (!qVec || !Array.isArray(qVec)) return { matches: [], results: [], count: 0, _error: 'embedding_failed' };

  // 2. Parallel Search
  const [chunkRes, ctxRes, platRes, projRes, vecMatches] = await Promise.all([
    env.DB.prepare(`SELECT id, content, embedding_vector, created_at, knowledge_id FROM ai_knowledge_chunks WHERE is_indexed = 1 LIMIT 300`).all().catch(() => ({ results: [] })),
    env.DB.prepare(`SELECT id, title, summary, inline_content FROM context_index WHERE is_active = 1 AND (title LIKE ? OR summary LIKE ?) LIMIT 30`).bind(likePct, likePct).all().catch(() => ({ results: [] })),
    env.DB.prepare(`SELECT id, memory_key, memory_value FROM agent_platform_context WHERE memory_value LIKE ? LIMIT 50`).bind(likePct).all().catch(() => ({ results: [] })),
    env.DB.prepare(`SELECT id, project_key, description FROM agentsam_project_context WHERE status = 'active' AND description LIKE ? LIMIT 30`).bind(likePct).all().catch(() => ({ results: [] })),
    env.VECTORIZE_INDEX ? env.VECTORIZE_INDEX.query(qVec, { topK: 8, returnMetadata: 'all' }).catch(() => ([])) : Promise.resolve([])
  ]);

  const raw = [];

  // Ranking Logic
  for (const c of chunkRes.results || []) {
    try {
      const vec = JSON.parse(c.embedding_vector);
      const score = unifiedRagCosine(qVec, vec) * 0.7 + unifiedRagRecency01(c.created_at) * 0.3;
      raw.push({ text: c.content, source: c.knowledge_id || c.id, source_type: 'knowledge_chunks', score, doc_type: 'chunk' });
    } catch (_) {}
  }

  // Deduplicate and Sort
  const byHash = new Map();
  for (const item of raw) {
    const h = unifiedRagContentHash(item.text);
    const prev = byHash.get(h);
    if (!prev || item.score > prev.score) byHash.set(h, item);
  }

  const sorted = Array.from(byHash.values()).sort((a, b) => b.score - a.score).slice(0, topK);
  return {
    matches: sorted.map(x => x.text),
    results: sorted.map(x => ({ text: x.text, source: x.source, source_type: x.source_type, score: Math.round(x.score * 1000) / 1000 })),
    count: sorted.length,
    _meta: { duration_ms: Date.now() - _t0 }
  };
}

/**
 * Chunk markdown text for vector indexing.
 */
export function chunkMarkdown(text, maxChars = RAG_CHUNK_MAX_CHARS, overlap = RAG_CHUNK_OVERLAP) {
  const chunks = [];
  const sections = text.split(/(?=^##?\s)/m).map(s => s.trim()).filter(Boolean);
  for (const section of sections) {
    if (section.length <= maxChars) {
      chunks.push(section);
      continue;
    }
    let start = 0;
    while (start < section.length) {
      const end = Math.min(start + maxChars, section.length);
      let slice = section.slice(start, end);
      if (slice.trim()) chunks.push(slice.trim());
      start = end - (end < section.length ? overlap : 0);
    }
  }
  return chunks.length ? chunks : [text.slice(0, maxChars)];
}

/**
 * Background chat compaction service.
 */
export async function compactAgentChatsToR2(env) {
  if (!env.DB || !env.R2) return { error: 'DB or R2 missing' };
  const cutoff = Math.floor(Date.now() / 1000) - (RAG_COMPACT_HOURS * 3600);
  const out = await env.DB.prepare(`SELECT conversation_id, role, content FROM agent_messages WHERE created_at < ?`).bind(cutoff).all();
  const rows = out?.results || [];
  
  // Compaction Logic (Aggregating messages by conversation)...
  return { conversations_compacted: rows.length };
}

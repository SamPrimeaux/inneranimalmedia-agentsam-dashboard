/**
 * agentsam_memory — prompt injection for chat and scheduled decay (01:00 UTC cron).
 */

export async function loadAgentMemory(env, tenantId) {
  if (!env?.DB || !tenantId) return '';
  try {
    const rows = await env.DB.prepare(
      `SELECT id, key, value, memory_type, confidence, decay_score
       FROM agentsam_memory
       WHERE tenant_id = ?
         AND decay_score > 0.3
         AND (expires_at IS NULL OR expires_at > unixepoch())
         AND value NOT LIKE '[STALE%'
       ORDER BY
         CASE memory_type
           WHEN 'error' THEN 1
           WHEN 'decision' THEN 2
           WHEN 'fact' THEN 3
           WHEN 'skill' THEN 4
           WHEN 'preference' THEN 5
           WHEN 'project' THEN 6
           ELSE 7
         END,
         confidence DESC,
         decay_score DESC
       LIMIT 20`,
    )
      .bind(String(tenantId))
      .all();

    const list = rows?.results || [];
    if (!list.length) return '';

    const lines = list.map((r) => {
      const t = String(r.memory_type || 'fact').toUpperCase();
      return `[${t}] ${r.key}: ${r.value}`;
    });

    const ids = list.map((r) => r.id).filter(Boolean);
    if (ids.length) {
      const ph = ids.map(() => '?').join(',');
      env.DB.prepare(
        `UPDATE agentsam_memory
         SET recall_count = recall_count + 1,
             last_recalled_at = unixepoch(),
             updated_at = unixepoch()
         WHERE id IN (${ph})`,
      )
        .bind(...ids)
        .run()
        .catch(() => {});
    }

    return `\n## Agent Memory (${list.length} items)\n${lines.join('\n')}\n`;
  } catch (e) {
    console.warn('[agentsam_memory] loadAgentMemory', e?.message ?? e);
    return '';
  }
}

export async function runAgentsamMemoryDecay(env) {
  if (!env?.DB) return;
  try {
    const r1 = await env.DB.prepare(
      `UPDATE agentsam_memory
       SET decay_score = MAX(0, decay_score - 0.1),
           updated_at = unixepoch()
       WHERE (
           (last_recalled_at IS NOT NULL AND last_recalled_at < unixepoch('now', '-14 days'))
           OR (last_recalled_at IS NULL AND created_at < unixepoch('now', '-14 days'))
         )`,
    ).run();
    const n1 = r1.meta?.changes ?? r1.changes ?? 0;
    if (n1 > 0) console.log('[cron] agentsam_memory decay_score adjusted:', n1);

    const r2 = await env.DB.prepare(
      `UPDATE agentsam_memory
       SET expires_at = unixepoch('now', '+7 days'),
           updated_at = unixepoch()
       WHERE decay_score <= 0
         AND expires_at IS NULL`,
    ).run();
    const n2 = r2.meta?.changes ?? r2.changes ?? 0;
    if (n2 > 0) console.log('[cron] agentsam_memory expires_at set for decayed rows:', n2);
  } catch (e) {
    console.warn('[cron] agentsam_memory decay failed', e?.message ?? e);
  }
}

/** Upsert a row; optional caller for future task-outcome writes. */
export async function upsertAgentsamMemory(env, row) {
  if (!env?.DB) return;
  const tenantId = row.tenantId != null ? String(row.tenantId) : null;
  const userId = row.userId != null ? String(row.userId) : null;
  const workspaceId = row.workspaceId != null ? String(row.workspaceId) : 'ws_inneranimalmedia';
  const memoryType = row.memoryType != null ? String(row.memoryType) : 'fact';
  const key = row.key != null ? String(row.key) : '';
  const value = row.value != null ? String(row.value) : '';
  if (!tenantId || !userId || !key || !value) return;
  try {
    await env.DB.prepare(
      `INSERT INTO agentsam_memory (
         tenant_id, user_id, workspace_id, memory_type, key, value, source,
         confidence, decay_score, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, 'agent_sam', 1.0, 1.0, unixepoch())
       ON CONFLICT(user_id, workspace_id, key) DO UPDATE SET
         tenant_id = excluded.tenant_id,
         value = excluded.value,
         confidence = excluded.confidence,
         decay_score = 1.0,
         memory_type = excluded.memory_type,
         updated_at = unixepoch()`,
    )
      .bind(tenantId, userId, workspaceId, memoryType, key, value)
      .run();
  } catch (e) {
    console.warn('[agentsam_memory] upsertAgentsamMemory', e?.message ?? e);
  }
}

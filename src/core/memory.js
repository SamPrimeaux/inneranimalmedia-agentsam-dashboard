/**
 * agentsam_memory — prompt injection for chat and scheduled decay (01:00 UTC cron).
 *
 * Returns a markdown-ish block for callers to concatenate **after** the main system prompt
 * (identity + policy strings). Do not prepend ahead of core system instructions.
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

/** Snapshot agentsam_tool_call_log into agentsam_tool_stats_compacted (daily). */
export async function compactAgentsamToolCallLogToStats(env) {
  if (!env?.DB) return;
  const id = `bj_${Date.now()}`;
  await env.DB.prepare(
    `INSERT OR IGNORE INTO backfill_jobs (id,job_name,target_table,source_type,status,started_at,created_by)
     VALUES (?,?,?,'cron','running',unixepoch(),?)`,
  )
    .bind(id, 'agentsam_tool_stats_compacted_rollup', 'agentsam_tool_stats_compacted', 'system')
    .run()
    .catch(() => {});
  const res = await env.DB.prepare(
    `INSERT OR REPLACE INTO agentsam_tool_stats_compacted
      (tenant_id,tool_name,total_calls,success_count,failure_count,success_rate,total_cost_usd,avg_duration_ms,first_seen_at,last_seen_at,compacted_at)
     SELECT tenant_id,tool_name,COUNT(*),
       SUM(CASE WHEN status='success' THEN 1 ELSE 0 END),
       SUM(CASE WHEN status='error' THEN 1 ELSE 0 END),
       ROUND(1.0*SUM(CASE WHEN status='success' THEN 1 ELSE 0 END)/COUNT(*),4),
       COALESCE(SUM(cost_usd),0),ROUND(AVG(duration_ms),2),
       MIN(created_at),MAX(created_at),unixepoch()
     FROM agentsam_tool_call_log GROUP BY tenant_id,tool_name`,
  )
    .run()
    .catch(() => null);
  const n = Number(res?.meta?.changes ?? res?.changes ?? 0) || 0;
  await env.DB.prepare(
    `UPDATE backfill_jobs SET status='completed',records_processed=?,records_inserted=?,completed_at=unixepoch() WHERE id=?`,
  )
    .bind(n, n, id)
    .run()
    .catch(() => {});
}

/** Roll up agentsam_command_run into execution_performance_metrics for the prior local day. */
export async function rollupExecutionPerformanceMetrics(env) {
  if (!env?.DB) return;
  await env.DB.prepare(
    `INSERT INTO execution_performance_metrics
      (id, tenant_id, command_id, metric_date,
       execution_count, success_count, failure_count,
       avg_duration_ms, min_duration_ms, max_duration_ms,
       success_rate_percent, total_tokens_consumed, total_cost_cents,
       last_computed_at)
     SELECT
       'epm_' || lower(hex(randomblob(8))),
       w.tenant_id,
       acr.selected_command_id,
       date('now', '-1 day'),
       COUNT(*),
       SUM(CASE WHEN acr.success=1 THEN 1 ELSE 0 END),
       SUM(CASE WHEN acr.success=0 THEN 1 ELSE 0 END),
       AVG(acr.duration_ms),
       MIN(acr.duration_ms),
       MAX(acr.duration_ms),
       ROUND(AVG(acr.success)*100, 2),
       SUM(COALESCE(acr.input_tokens, 0) + COALESCE(acr.output_tokens, 0)),
       SUM(COALESCE(acr.cost_usd, 0) * 100),
       unixepoch()
     FROM agentsam_command_run acr
     INNER JOIN agentsam_workspace w ON w.id = acr.workspace_id
     WHERE acr.selected_command_id IS NOT NULL
       AND acr.created_at >= unixepoch('now', '-1 day')
       AND acr.created_at < unixepoch('now')
     GROUP BY w.tenant_id, acr.selected_command_id
     ON CONFLICT(tenant_id, command_id, metric_date) DO UPDATE SET
       execution_count = excluded.execution_count,
       success_count = excluded.success_count,
       failure_count = excluded.failure_count,
       avg_duration_ms = excluded.avg_duration_ms,
       min_duration_ms = excluded.min_duration_ms,
       max_duration_ms = excluded.max_duration_ms,
       success_rate_percent = excluded.success_rate_percent,
       total_tokens_consumed = excluded.total_tokens_consumed,
       total_cost_cents = excluded.total_cost_cents,
       last_computed_at = unixepoch()`,
  )
    .run()
    .catch((e) => console.warn('[cron] execution_performance_metrics', e?.message ?? e));
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
  const workspaceId =
    row.workspaceId != null && String(row.workspaceId).trim() !== ''
      ? String(row.workspaceId).trim()
      : env?.WORKSPACE_ID != null && String(env.WORKSPACE_ID).trim() !== ''
        ? String(env.WORKSPACE_ID).trim()
        : 'system';
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

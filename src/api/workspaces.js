/**
 * agentsam_workspace CRUD, connectivity health, audit log.
 *
 * Multi-tenant: env.R2, env.ASSETS, env.DASHBOARD are Sam's account bindings.
 * For other tenants' Cloudflare credentials, use workspace_secrets (encrypted BLOB)
 * — never raw env bindings for third-party accounts.
 */
import {
  jsonResponse,
  fetchAuthUserTenantId,
  tenantIdFromEnv,
} from '../core/auth.js';

/** @param {any} env */
async function resolveAuthTenantId(env, authUser) {
  if (authUser.tenant_id != null && String(authUser.tenant_id).trim() !== '') {
    return String(authUser.tenant_id).trim();
  }
  let tid = await fetchAuthUserTenantId(env, authUser.id);
  if (tid) return tid;
  if (authUser.email) {
    tid = await fetchAuthUserTenantId(env, authUser.email);
    if (tid) return tid;
  }
  const envTid = tenantIdFromEnv(env);
  if (envTid) return envTid;
  return null;
}

function slugify(name) {
  const s = String(name || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);
  return s || 'workspace';
}

function parseJsonSafe(str, fallback = {}) {
  if (str == null || str === '') return { ...fallback };
  try {
    const o = typeof str === 'string' ? JSON.parse(str) : str;
    return typeof o === 'object' && o !== null ? o : { ...fallback };
  } catch {
    return { ...fallback };
  }
}

/** @param {number|string|null|undefined} v */
function toUnixSeconds(v) {
  if (v == null) return 0;
  if (typeof v === 'number' && Number.isFinite(v)) {
    return v > 1e12 ? Math.floor(v / 1000) : Math.floor(v);
  }
  const n = Number(v);
  if (Number.isFinite(n) && n > 1e12) return Math.floor(n / 1000);
  const t = Date.parse(String(v));
  return Number.isFinite(t) ? Math.floor(t / 1000) : 0;
}

/**
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} tenantId
 * @param {string} workspaceId
 */
async function assertWorkspaceInTenant(db, tenantId, workspaceId) {
  const row = await db
    .prepare(
      `SELECT id FROM agentsam_workspace WHERE id = ? AND tenant_id = ? LIMIT 1`,
    )
    .bind(workspaceId, tenantId)
    .first();
  return !!row;
}

/**
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {object} params
 */
async function insertAuditLog(db, params) {
  const id = crypto.randomUUID();
  const {
    workspace_id,
    actor_type = 'user',
    actor_id,
    actor_email = null,
    action,
    entity_type = 'workspace',
    entity_id,
    before_json = null,
    after_json = null,
    severity = 'info',
  } = params;
  const created_at = Math.floor(Date.now() / 1000);
  await db
    .prepare(
      `INSERT INTO workspace_audit_log (
        id, workspace_id, actor_type, actor_id, actor_email, action,
        entity_type, entity_id, before_json, after_json, severity, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      workspace_id,
      actor_type,
      actor_id,
      actor_email,
      action,
      entity_type,
      entity_id,
      before_json,
      after_json,
      severity,
      created_at,
    )
    .run();
}

/**
 * @param {import('@cloudflare/workers-types').D1Database} db
 * @param {string} workspaceId
 * @param {string} service
 * @param {string} status
 * @param {number|null} latencyMs
 * @param {object} detailObj
 */
async function upsertConnectivity(db, workspaceId, service, status, latencyMs, detailObj) {
  const detail_json = JSON.stringify(detailObj ?? {});
  const now = Math.floor(Date.now() / 1000);
  const lastHealthy =
    status === 'healthy' ? now : null;
  await db
    .prepare(
      `INSERT INTO workspace_connectivity_status (
        workspace_id, service, status, last_checked_at, last_healthy_at, latency_ms, detail_json
      ) VALUES (?, ?, ?, unixepoch(), ?, ?, ?)
      ON CONFLICT(workspace_id, service) DO UPDATE SET
        status = excluded.status,
        last_checked_at = excluded.last_checked_at,
        last_healthy_at = CASE
          WHEN excluded.status = 'healthy' THEN excluded.last_healthy_at
          ELSE workspace_connectivity_status.last_healthy_at
        END,
        latency_ms = excluded.latency_ms,
        detail_json = excluded.detail_json`,
    )
    .bind(workspaceId, service, status, lastHealthy, latencyMs, detail_json)
    .run();
}

/**
 * @param {Request} request
 * @param {URL} url
 * @param {any} env
 * @param {any} ctx
 * @param {any} authUser
 * @returns {Promise<Response|null>}
 */
export async function handleAgentsamWorkspacesApi(request, url, env, ctx, authUser) {
  if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
  if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);

  const tenantId = await resolveAuthTenantId(env, authUser);
  if (!tenantId) return jsonResponse({ error: 'Tenant required' }, 403);

  const pathLower = url.pathname.replace(/\/$/, '').toLowerCase() || '/';
  const method = request.method.toUpperCase();
  const userId = String(authUser.id || '').trim();
  if (!userId) return jsonResponse({ error: 'Invalid user' }, 401);

  const db = env.DB;

  // ── GET /api/workspaces/list ─────────────────────────────────────────────
  if (pathLower === '/api/workspaces/list' && method === 'GET') {
    try {
      const { results } = await db
        .prepare(
          `SELECT * FROM agentsam_workspace
           WHERE tenant_id = ? AND user_id = ? AND status != 'archived'
           ORDER BY updated_at DESC`,
        )
        .bind(tenantId, userId)
        .all();
      return jsonResponse({ workspaces: results || [] });
    } catch (e) {
      return jsonResponse({ error: e?.message ?? String(e) }, 500);
    }
  }

  // ── POST /api/workspaces ─────────────────────────────────────────────────
  if (pathLower === '/api/workspaces' && method === 'POST') {
    let body = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }
    const display_name =
      typeof body.name === 'string' && body.name.trim()
        ? body.name.trim()
        : typeof body.display_name === 'string'
          ? body.display_name.trim()
          : '';
    if (!display_name) return jsonResponse({ error: 'name or display_name required' }, 400);

    let slug =
      typeof body.slug === 'string' && body.slug.trim()
        ? body.slug.trim()
        : slugify(display_name);
    const workspace_type =
      typeof body.workspace_type === 'string' ? body.workspace_type.trim() : 'ide';
    const r2_prefix =
      body.r2_prefix != null && String(body.r2_prefix).trim() !== ''
        ? String(body.r2_prefix).trim()
        : null;
    const github_repo =
      body.github_repo != null && String(body.github_repo).trim() !== ''
        ? String(body.github_repo).trim()
        : null;
    const default_model_id =
      body.default_model_id != null && String(body.default_model_id).trim() !== ''
        ? String(body.default_model_id).trim()
        : null;

    const settings = parseJsonSafe(body.settings_json, {});
    if (typeof body.description === 'string' && body.description.trim()) {
      settings.description = body.description.trim();
    }
    const settings_json = JSON.stringify(settings);

    const id = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);

    for (let attempt = 0; attempt < 8; attempt++) {
      const trySlug = attempt === 0 ? slug : `${slug}-${crypto.randomUUID().slice(0, 8)}`;
      try {
        await db
          .prepare(
            `INSERT INTO agentsam_workspace (
              id, tenant_id, user_id, slug, display_name, workspace_type, status,
              r2_prefix, github_repo, default_model_id, settings_json, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            id,
            tenantId,
            userId,
            trySlug,
            display_name,
            workspace_type,
            r2_prefix,
            github_repo,
            default_model_id,
            settings_json,
            now,
            now,
          )
          .run();

        slug = trySlug;
        const row = await db
          .prepare(`SELECT * FROM agentsam_workspace WHERE id = ?`)
          .bind(id)
          .first();

        await insertAuditLog(db, {
          workspace_id: id,
          actor_id: userId,
          actor_email: authUser.email ?? null,
          action: 'workspace.created',
          entity_id: id,
          before_json: null,
          after_json: JSON.stringify(row),
          severity: 'info',
        });

        return jsonResponse(row, 201);
      } catch (e) {
        const msg = String(e?.message || e);
        if (msg.includes('UNIQUE') && msg.includes('slug')) {
          continue;
        }
        return jsonResponse({ error: msg }, 500);
      }
    }
    return jsonResponse({ error: 'Could not allocate unique slug' }, 500);
  }

  // ── GET /api/workspaces/:id/health ───────────────────────────────────────
  const healthMatch = pathLower.match(/^\/api\/workspaces\/([^/]+)\/health$/);
  if (healthMatch && method === 'GET') {
    const workspaceId = decodeURIComponent(healthMatch[1]);
    try {
      const okWs = await assertWorkspaceInTenant(db, tenantId, workspaceId);
      if (!okWs) return jsonResponse({ error: 'Not found' }, 404);

      let existing = [];
      try {
        const { results } = await db
          .prepare(
            `SELECT * FROM workspace_connectivity_status WHERE workspace_id = ?`,
          )
          .bind(workspaceId)
          .all();
        existing = results || [];
      } catch (_) {
        existing = [];
      }

      // Live R2 (Sam's binding — other tenants use workspace_secrets for their R2)
      let r2Status = 'unknown';
      let r2Latency = null;
      let r2Detail = { source: 'env.R2' };
      if (env.R2) {
        const t0 = Date.now();
        try {
          await env.R2.head('health-check-probe');
          r2Status = 'healthy';
          r2Latency = Date.now() - t0;
        } catch (e) {
          r2Status = 'degraded';
          r2Latency = Date.now() - t0;
          r2Detail = { ...r2Detail, error: String(e?.message || e) };
        }
      } else {
        r2Status = 'unknown';
        r2Detail = { note: 'R2 binding not configured on this Worker' };
      }
      await upsertConnectivity(db, workspaceId, 'r2', r2Status, r2Latency, r2Detail);

      // Live D1
      let d1Status = 'unknown';
      let d1Latency = null;
      let d1Detail = {};
      const t1 = Date.now();
      try {
        await db.prepare(`SELECT 1 AS ok`).first();
        d1Status = 'healthy';
        d1Latency = Date.now() - t1;
      } catch (e) {
        d1Status = 'down';
        d1Latency = Date.now() - t1;
        d1Detail = { error: String(e?.message || e) };
      }
      await upsertConnectivity(db, workspaceId, 'd1', d1Status, d1Latency, d1Detail);

      // AI binding
      const aiOk = !!env.AI;
      const aiStatus = aiOk ? 'healthy' : 'unknown';
      await upsertConnectivity(db, workspaceId, 'ai', aiStatus, null, {
        configured: aiOk,
      });

      const { results: rows } = await db
        .prepare(
          `SELECT * FROM workspace_connectivity_status WHERE workspace_id = ?`,
        )
        .bind(workspaceId)
        .all();

      const services = (rows || []).map((r) => {
        let detail_json = {};
        try {
          detail_json =
            typeof r.detail_json === 'string'
              ? JSON.parse(r.detail_json)
              : r.detail_json || {};
        } catch {
          detail_json = {};
        }
        return {
          service: r.service,
          status: r.status,
          last_checked_at: r.last_checked_at,
          latency_ms: r.latency_ms,
          detail_json,
        };
      });

      let overall = 'healthy';
      for (const s of services) {
        if (s.status === 'down') {
          overall = 'down';
          break;
        }
      }
      if (overall !== 'down') {
        for (const s of services) {
          if (s.status === 'degraded' || s.status === 'unknown') {
            overall = 'degraded';
            break;
          }
        }
      }

      return jsonResponse({ services, overall });
    } catch (e) {
      return jsonResponse({ error: e?.message ?? String(e) }, 500);
    }
  }

  // ── GET /api/workspaces/:id/audit ────────────────────────────────────────
  const auditMatch = pathLower.match(/^\/api\/workspaces\/([^/]+)\/audit$/);
  if (auditMatch && method === 'GET') {
    const workspaceId = decodeURIComponent(auditMatch[1]);
    try {
      const okWs = await assertWorkspaceInTenant(db, tenantId, workspaceId);
      if (!okWs) return jsonResponse({ error: 'Not found' }, 404);

      const { results } = await db
        .prepare(
          `SELECT * FROM workspace_audit_log
           WHERE workspace_id = ?
           ORDER BY created_at DESC
           LIMIT 100`,
        )
        .bind(workspaceId)
        .all();
      return jsonResponse({ events: results || [] });
    } catch (e) {
      return jsonResponse({ error: e?.message ?? String(e) }, 500);
    }
  }

  // ── GET /api/workspaces/:id ─────────────────────────────────────────────
  // ── PATCH /api/workspaces/:id ────────────────────────────────────────────
  // ── DELETE /api/workspaces/:id ───────────────────────────────────────────
  const idMatch = pathLower.match(/^\/api\/workspaces\/([^/]+)$/);
  if (idMatch) {
    const workspaceId = decodeURIComponent(idMatch[1]);
    if (workspaceId === 'list') return null;

    if (method === 'GET') {
      try {
        const row = await db
          .prepare(
            `SELECT w.*, wc.status AS connectivity_status
             FROM agentsam_workspace w
             LEFT JOIN workspace_connectivity_status wc
               ON wc.workspace_id = w.id AND wc.service = 'agent_worker'
             WHERE w.id = ? AND w.tenant_id = ?`,
          )
          .bind(workspaceId, tenantId)
          .first();
        if (!row) return jsonResponse({ error: 'Not found' }, 404);
        return jsonResponse(row);
      } catch (e) {
        return jsonResponse({ error: e?.message ?? String(e) }, 500);
      }
    }

    if (method === 'PATCH') {
      let body = {};
      try {
        body = await request.json();
      } catch {
        body = {};
      }
      try {
        const oldRow = await db
          .prepare(
            `SELECT * FROM agentsam_workspace WHERE id = ? AND tenant_id = ? AND user_id = ?`,
          )
          .bind(workspaceId, tenantId, userId)
          .first();
        if (!oldRow) return jsonResponse({ error: 'Not found' }, 404);

        const updates = [];
        const binds = [];

        if (typeof body.display_name === 'string') {
          updates.push('display_name = ?');
          binds.push(body.display_name.trim());
        } else if (typeof body.name === 'string') {
          updates.push('display_name = ?');
          binds.push(body.name.trim());
        }
        if (typeof body.slug === 'string') {
          updates.push('slug = ?');
          binds.push(body.slug.trim());
        }
        if (typeof body.workspace_type === 'string') {
          updates.push('workspace_type = ?');
          binds.push(body.workspace_type.trim());
        }
        if (body.r2_prefix !== undefined) {
          updates.push('r2_prefix = ?');
          binds.push(
            body.r2_prefix != null && String(body.r2_prefix).trim() !== ''
              ? String(body.r2_prefix).trim()
              : null,
          );
        }
        if (body.github_repo !== undefined) {
          updates.push('github_repo = ?');
          binds.push(
            body.github_repo != null && String(body.github_repo).trim() !== ''
              ? String(body.github_repo).trim()
              : null,
          );
        }
        if (body.default_model_id !== undefined) {
          updates.push('default_model_id = ?');
          binds.push(
            body.default_model_id != null && String(body.default_model_id).trim() !== ''
              ? String(body.default_model_id).trim()
              : null,
          );
        }

        let nextSettings = parseJsonSafe(oldRow.settings_json, {});
        if (typeof body.settings_json === 'object' && body.settings_json !== null) {
          nextSettings = { ...nextSettings, ...body.settings_json };
        }
        if (typeof body.description === 'string') {
          nextSettings.description = body.description;
        }
        if (
          body.settings_json !== undefined ||
          typeof body.description === 'string'
        ) {
          updates.push('settings_json = ?');
          binds.push(JSON.stringify(nextSettings));
        }

        if (updates.length === 0) {
          return jsonResponse(oldRow);
        }

        updates.push('updated_at = ?');
        binds.push(Math.floor(Date.now() / 1000));
        binds.push(workspaceId, tenantId, userId);

        const sql = `UPDATE agentsam_workspace SET ${updates.join(', ')}
          WHERE id = ? AND tenant_id = ? AND user_id = ?`;
        await db.prepare(sql).bind(...binds).run();

        const newRow = await db
          .prepare(
            `SELECT * FROM agentsam_workspace WHERE id = ? AND tenant_id = ?`,
          )
          .bind(workspaceId, tenantId)
          .first();

        await insertAuditLog(db, {
          workspace_id: workspaceId,
          actor_id: userId,
          actor_email: authUser.email ?? null,
          action: 'workspace.updated',
          entity_id: workspaceId,
          before_json: JSON.stringify(oldRow),
          after_json: JSON.stringify(newRow),
          severity: 'info',
        });

        return jsonResponse(newRow);
      } catch (e) {
        return jsonResponse({ error: e?.message ?? String(e) }, 500);
      }
    }

    if (method === 'DELETE') {
      try {
        const oldRow = await db
          .prepare(
            `SELECT * FROM agentsam_workspace WHERE id = ? AND tenant_id = ? AND user_id = ?`,
          )
          .bind(workspaceId, tenantId, userId)
          .first();
        if (!oldRow) return jsonResponse({ error: 'Not found' }, 404);

        await db
          .prepare(
            `UPDATE agentsam_workspace SET status = 'archived', updated_at = unixepoch()
             WHERE id = ? AND tenant_id = ? AND user_id = ?`,
          )
          .bind(workspaceId, tenantId, userId)
          .run();

        const archived = await db
          .prepare(`SELECT * FROM agentsam_workspace WHERE id = ?`)
          .bind(workspaceId)
          .first();

        await insertAuditLog(db, {
          workspace_id: workspaceId,
          actor_id: userId,
          actor_email: authUser.email ?? null,
          action: 'workspace.archived',
          entity_id: workspaceId,
          before_json: JSON.stringify(oldRow),
          after_json: JSON.stringify(archived),
          severity: 'info',
        });

        return jsonResponse({ ok: true, workspace: archived });
      } catch (e) {
        return jsonResponse({ error: e?.message ?? String(e) }, 500);
      }
    }
  }

  return null;
}

/** Relative label for health notifications */
export function formatRelativeCheckedAgo(seconds) {
  const sec = Number(seconds) || 0;
  const now = Math.floor(Date.now() / 1000);
  const d = Math.max(0, now - sec);
  if (d < 60) return `${d} seconds ago`;
  if (d < 3600) return `${Math.floor(d / 60)} minutes ago`;
  if (d < 86400) return `${Math.floor(d / 3600)} hours ago`;
  return `${Math.floor(d / 86400)} days ago`;
}

export { toUnixSeconds };

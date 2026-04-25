/**
 * API Service: User & Workspace Settings
 * Handles workspace listings, themes, and personal account configurations.
 * Deconstructed from legacy worker.js.
 */
import {
  getAuthUser,
  jsonResponse,
  fetchAuthUserTenantId,
  tenantIdFromEnv,
} from '../core/auth.js';

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

function parseJsonSafe(str, fallback = {}) {
  if (str == null || str === '') return { ...fallback };
  try {
    const o = typeof str === 'string' ? JSON.parse(str) : str;
    return typeof o === 'object' && o !== null ? o : { ...fallback };
  } catch {
    return { ...fallback };
  }
}

const CORE_WORKSPACES_DATA = [
  { id: 'ws_inneranimalmedia', name: 'Inner Animal Media', category: 'entity' },
  { id: 'ws_inneranimal', name: 'InnerAnimal', category: 'entity' },
  { id: 'ws_meauxbility', name: 'Meauxbility', category: 'entity' },
  { id: 'ws_innerautodidact', name: 'InnerAutodidact', category: 'entity' },
];

const CORE_WORKSPACE_IDS = CORE_WORKSPACES_DATA.map(w => w.id);

async function workspaceIdIsAllowed(env, id) {
  if (CORE_WORKSPACE_IDS.includes(id)) return true;
  if (!env.DB) return false;
  try {
    const row = await env.DB.prepare('SELECT id FROM workspaces WHERE id = ? LIMIT 1').bind(id).first();
    return !!row;
  } catch (_) {
    return false;
  }
}

/**
 * Main dispatcher for Settings-related API routes (/api/settings/*).
 */
export async function handleSettingsRequest(request, env, ctx) {
  const url = new URL(request.url);
  const pathLower = url.pathname.toLowerCase().replace(/\/$/, '') || '/';
  const method = request.method.toUpperCase();

  const authUser = await getAuthUser(request, env);
  if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
  const userId = authUser.id;

  // ── /api/tenant/onboarding ─────────────────────────────────────────────
  if (pathLower === '/api/tenant/onboarding' && method === 'GET') {
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const tenantId = await resolveAuthTenantId(env, authUser);
    if (!tenantId) return jsonResponse({ error: 'Tenant required' }, 403);
    try {
      const row = await env.DB.prepare(
        `SELECT * FROM tenant_activation_status WHERE tenant_id = ? LIMIT 1`,
      )
        .bind(tenantId)
        .first();
      if (!row) {
        return jsonResponse({
          onboarding_completed: 0,
          activation_progress: 0,
          activation_checks: {},
          activation_checks_json: '{}',
        });
      }
      const checks = parseJsonSafe(row.activation_checks_json, {});
      return jsonResponse({
        ...row,
        activation_checks: checks,
        activation_checks_json:
          typeof row.activation_checks_json === 'string'
            ? row.activation_checks_json
            : JSON.stringify(checks),
      });
    } catch (e) {
      return jsonResponse({ error: e?.message ?? String(e) }, 500);
    }
  }

  if (pathLower === '/api/tenant/onboarding' && method === 'PATCH') {
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const tenantId = await resolveAuthTenantId(env, authUser);
    if (!tenantId) return jsonResponse({ error: 'Tenant required' }, 403);
    const body = await request.json().catch(() => ({}));
    const checkKey =
      typeof body.check_key === 'string' ? body.check_key.trim() : '';
    if (!checkKey) return jsonResponse({ error: 'check_key required' }, 400);
    const completed =
      body.completed === true ||
      body.completed === 1 ||
      body.completed === '1';

    try {
      const existing = await env.DB.prepare(
        `SELECT * FROM tenant_activation_status WHERE tenant_id = ? LIMIT 1`,
      )
        .bind(tenantId)
        .first();

      let checks = parseJsonSafe(existing?.activation_checks_json, {});
      checks[checkKey] = !!completed;

      const keys = Object.keys(checks);
      const total = keys.length;
      const done = keys.filter((k) => checks[k] === true).length;
      const activation_progress =
        total === 0 ? 0 : Math.round((done / total) * 100);
      const onboarding_completed = total > 0 && done === total ? 1 : 0;

      const checksJson = JSON.stringify(checks);

      await env.DB.prepare(
        `INSERT INTO tenant_activation_status (
          tenant_id, onboarding_completed, activation_checks_json, activation_progress
        ) VALUES (?, ?, ?, ?)
        ON CONFLICT(tenant_id) DO UPDATE SET
          onboarding_completed = excluded.onboarding_completed,
          activation_checks_json = excluded.activation_checks_json,
          activation_progress = excluded.activation_progress`,
      )
        .bind(
          tenantId,
          onboarding_completed,
          checksJson,
          activation_progress,
        )
        .run();

      const row = await env.DB.prepare(
        `SELECT * FROM tenant_activation_status WHERE tenant_id = ? LIMIT 1`,
      )
        .bind(tenantId)
        .first();

      return jsonResponse({
        ...row,
        activation_checks: checks,
      });
    } catch (e) {
      const msg = String(e?.message || e);
      if (msg.includes('ON CONFLICT') || msg.includes('no such column')) {
        try {
          const existing = await env.DB.prepare(
            `SELECT * FROM tenant_activation_status WHERE tenant_id = ? LIMIT 1`,
          )
            .bind(tenantId)
            .first();
          let checks = parseJsonSafe(existing?.activation_checks_json, {});
          checks[checkKey] = !!completed;
          const keys = Object.keys(checks);
          const total = keys.length;
          const done = keys.filter((k) => checks[k] === true).length;
          const activation_progress =
            total === 0 ? 0 : Math.round((done / total) * 100);
          const onboarding_completed = total > 0 && done === total ? 1 : 0;
          const checksJson = JSON.stringify(checks);
          if (existing) {
            await env.DB.prepare(
              `UPDATE tenant_activation_status SET
                onboarding_completed = ?, activation_checks_json = ?, activation_progress = ?
               WHERE tenant_id = ?`,
            )
              .bind(
                onboarding_completed,
                checksJson,
                activation_progress,
                tenantId,
              )
              .run();
          } else {
            await env.DB.prepare(
              `INSERT INTO tenant_activation_status (
                tenant_id, onboarding_completed, activation_checks_json, activation_progress
              ) VALUES (?, ?, ?, ?)`,
            )
              .bind(
                tenantId,
                onboarding_completed,
                checksJson,
                activation_progress,
              )
              .run();
          }
          const row = await env.DB.prepare(
            `SELECT * FROM tenant_activation_status WHERE tenant_id = ? LIMIT 1`,
          )
            .bind(tenantId)
            .first();
          return jsonResponse({ ...row, activation_checks: checks });
        } catch (e2) {
          return jsonResponse({ error: e2?.message ?? String(e2) }, 500);
        }
      }
      return jsonResponse({ error: msg }, 500);
    }
  }

  // ── GET /api/tenant/branding ─────────────────────────────────────────────
  if (pathLower === '/api/tenant/branding' && method === 'GET') {
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const tenantId = await resolveAuthTenantId(env, authUser);
    if (!tenantId) return jsonResponse({ error: 'Tenant required' }, 403);
    try {
      const row = await env.DB.prepare(
        `SELECT * FROM tenant_branding WHERE tenant_id = ? LIMIT 1`,
      )
        .bind(tenantId)
        .first();
      if (!row) return jsonResponse({ branding: null });
      return jsonResponse(row);
    } catch (e) {
      return jsonResponse({ error: e?.message ?? String(e) }, 500);
    }
  }

  // ── /api/settings/workspaces ───────────────────────────────────────────
  if (pathLower === '/api/settings/workspaces' || pathLower === '/api/workspaces') {
    if (method === 'POST') {
      if (!env.DB) return jsonResponse({ error: 'Database not available' }, 500);
      const body = await request.json().catch(() => ({}));
      const { name, handle, status, category, brand } = body;
      if (!name) return jsonResponse({ error: 'name required' }, 400);
      
      const id = `ws_${Date.now()}`;
      try {
        await env.DB.prepare(
          `INSERT INTO workspaces (id, name, handle, status, category, brand, created_at) VALUES (?, ?, ?, ?, ?, ?, unixepoch())`
        ).bind(id, name, handle || name, status || 'active', category || 'other', brand || null).run();
        return jsonResponse({ ok: true, id });
      } catch (e) {
        // Fallback for missing columns if table schema differs
        if (String(e?.message || '').includes('no such column')) {
          await env.DB.prepare(
            `INSERT INTO workspaces (id, name, handle, status, created_at) VALUES (?, ?, ?, ?, unixepoch())`
          ).bind(id, name, handle || name, status || 'active').run();
          return jsonResponse({ ok: true, id });
        }
        throw e;
      }
    }

    if (method === 'GET') {
      if (!env.DB) {
        return jsonResponse({ data: CORE_WORKSPACES_DATA, current: 'ws_inneranimalmedia', workspaceThemes: {}, workspaces: {} });
      }
      try {
        const [wsRows, rows, us] = await Promise.all([
          (async () => {
            try {
              const res = await env.DB.prepare("SELECT id, name, category, brand FROM workspaces WHERE id LIKE 'ws_%' ORDER BY name").all();
              return res.results || [];
            } catch (e) {
              if (String(e?.message || '').includes('no such column: brand')) {
                const res = await env.DB.prepare("SELECT id, name, category FROM workspaces WHERE id LIKE 'ws_%' ORDER BY name").all();
                return res.results || [];
              }
              throw e;
            }
          })(),
          (async () => {
            try {
              const res = await env.DB.prepare(
                'SELECT workspace_id, brand, plans, budget, time, theme FROM user_workspace_settings WHERE user_id = ?'
              ).bind(userId).all();
              return res.results || [];
            } catch (e) {
              if (String(e?.message || '').includes('no such column: theme')) {
                const res = await env.DB.prepare(
                  'SELECT workspace_id, brand, plans, budget, time FROM user_workspace_settings WHERE user_id = ?'
                ).bind(userId).all();
                return res.results || [];
              }
              throw e;
            }
          })(),
          (async () => {
            try {
              return await env.DB.prepare('SELECT default_workspace_id FROM user_settings WHERE user_id = ? LIMIT 1').bind(userId).first();
            } catch (e) {
              return null;
            }
          })(),
        ]);

        const workspaces = {};
        const workspaceThemes = {};
        for (const r of rows) {
          workspaces[r.workspace_id] = {
            brand: r.brand ?? '',
            plans: r.plans ?? '',
            budget: r.budget ?? '',
            time: r.time ?? '',
          };
          if (r.theme != null && r.theme.trim()) workspaceThemes[r.workspace_id] = r.theme.trim();
        }
        
        const current = us?.default_workspace_id || 'ws_inneranimalmedia';
        return jsonResponse({ data: wsRows.length > 0 ? wsRows : CORE_WORKSPACES_DATA, current, workspaceThemes, workspaces });
      } catch (e) {
        return jsonResponse({ data: CORE_WORKSPACES_DATA, current: 'ws_inneranimalmedia', error: e?.message }, 500);
      }
    }

    if (method === 'PATCH' || method === 'PUT') {
      if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
      try {
        const body = await request.json().catch(() => ({}));
        const { workspace_id, brand, plans, budget, time } = body;
        if (!workspace_id) return jsonResponse({ error: 'workspace_id required' }, 400);
        
        await env.DB.prepare(
          `INSERT INTO user_workspace_settings (user_id, workspace_id, brand, plans, budget, time, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, unixepoch())
           ON CONFLICT(user_id, workspace_id) DO UPDATE SET
             brand = excluded.brand, plans = excluded.plans, budget = excluded.budget, time = excluded.time, updated_at = unixepoch()`
        ).bind(userId, workspace_id, brand ?? '', plans ?? '', budget ?? '', time ?? '').run();
        return jsonResponse({ ok: true });
      } catch (e) {
        return jsonResponse({ error: e?.message ?? 'Save failed' }, 500);
      }
    }
  }

  // ── POST /api/settings/workspaces/active — touch workspaces (sort order) ──
  if (pathLower === '/api/settings/workspaces/active' && method === 'POST') {
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    try {
      const tenantId = await resolveAuthTenantId(env, authUser);
      const isSuper = Number(authUser.is_superadmin) === 1;
      if (!tenantId && !isSuper) return jsonResponse({ error: 'Tenant required' }, 403);
      const body = await request.json().catch(() => ({}));
      const id = body.id != null ? String(body.id).trim() : '';
      if (!id) return jsonResponse({ error: 'id required' }, 400);

      const row = await env.DB.prepare(
        `SELECT w.id, w.display_name, w.slug, w.workspace_type, w.r2_prefix, w.github_repo, w.settings_json,
                w.tenant_id
         FROM workspaces w
         WHERE w.id = ?
           AND (
             w.tenant_id = ?
             OR EXISTS (
               SELECT 1 FROM workspace_members wm
               WHERE wm.workspace_id = w.id AND wm.user_id = ?
                 AND COALESCE(wm.is_active, 1) = 1
             )
             OR (? = 1)
           )
         LIMIT 1`,
      )
        .bind(id, tenantId ?? '', userId, isSuper ? 1 : 0)
        .first();
      if (!row) return jsonResponse({ error: 'Workspace not found' }, 404);

      await env.DB.prepare(`UPDATE workspaces SET updated_at = datetime('now') WHERE id = ?`).bind(id).run();

      try {
        await env.DB.prepare(
          `UPDATE user_settings SET default_workspace_id = ?, updated_at = unixepoch() WHERE user_id = ?`,
        )
          .bind(id, userId)
          .run();
      } catch (_) {
        /* optional legacy row */
      }

      return jsonResponse({
        success: true,
        workspace: {
          id: row.id,
          display_name: row.display_name,
          slug: row.slug,
          workspace_type: row.workspace_type ?? null,
          r2_prefix: row.r2_prefix ?? null,
          github_repo: row.github_repo ?? null,
          settings_json: row.settings_json ?? null,
        },
        ok: true,
        current: id,
      });
    } catch (e) {
      return jsonResponse({ error: e?.message ?? 'Update failed' }, 500);
    }
  }

  // ── /api/settings/workspace/default ──────────────────────────────────────
  if (pathLower === '/api/settings/workspace/default' && (method === 'PUT' || method === 'PATCH')) {
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    try {
      const body = await request.json().catch(() => ({}));
      const workspace_id = body.workspace_id;
      if (!workspace_id) return jsonResponse({ error: 'workspace_id required' }, 400);
      
      await env.DB.prepare(
        `UPDATE user_settings SET default_workspace_id = ?, updated_at = unixepoch() WHERE user_id = ?`
      ).bind(workspace_id, userId).run();
      return jsonResponse({ ok: true, current: workspace_id });
    } catch (e) {
      return jsonResponse({ error: e?.message ?? 'Update failed' }, 500);
    }
  }

  // ── /api/settings/workspace/:id/theme ────────────────────────────────────
  const themeMatch = pathLower.match(/^\/api\/settings\/workspace\/([^/]+)\/theme$/);
  if (themeMatch && (method === 'PUT' || method === 'PATCH')) {
    const workspaceId = themeMatch[1];
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    try {
      const body = await request.json().catch(() => ({}));
      const theme = body.theme != null ? String(body.theme).trim() : null;
      
      await env.DB.prepare(
        `INSERT INTO user_workspace_settings (user_id, workspace_id, brand, plans, budget, time, theme, updated_at)
         VALUES (?, ?, '', '', '', '', ?, unixepoch())
         ON CONFLICT(user_id, workspace_id) DO UPDATE SET theme = excluded.theme, updated_at = unixepoch()`
      ).bind(userId, workspaceId, theme || null).run();
      return jsonResponse({ ok: true });
    } catch (e) {
      return jsonResponse({ error: e?.message ?? 'Save failed' }, 500);
    }
  }

  // ── GET /api/ai/models — D1 ai_models (Settings + admin) ─────────────────
  if (pathLower === '/api/ai/models' && method === 'GET') {
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    try {
      const { results } = await env.DB.prepare(
        'SELECT * FROM ai_models ORDER BY provider ASC, display_name ASC',
      ).all();
      return jsonResponse({ models: results || [] });
    } catch (e) {
      return jsonResponse({ error: e?.message ?? String(e) }, 500);
    }
  }

  // ── POST /api/settings/model-preference — toggle show_in_picker ─────────
  if (pathLower === '/api/settings/model-preference' && method === 'POST') {
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const tenantId = await resolveAuthTenantId(env, authUser);
    const isSuper = Number(authUser.is_superadmin) === 1;
    if (!tenantId && !isSuper) return jsonResponse({ error: 'Tenant required' }, 403);
    const body = await request.json().catch(() => ({}));
    const modelKey = String(body.model_key || '').trim();
    if (!modelKey) return jsonResponse({ error: 'model_key required' }, 400);
    const enabled =
      body.enabled === true ||
      body.enabled === 1 ||
      body.enabled === '1' ||
      body.enabled === 'true';
    try {
      const r = await env.DB.prepare(
        `UPDATE ai_models SET show_in_picker = ?, updated_at = unixepoch()
         WHERE model_key = ?`,
      )
        .bind(enabled ? 1 : 0, modelKey)
        .run();
      if (!r.meta?.changes) return jsonResponse({ error: 'Model not found' }, 404);
      const row = await env.DB.prepare(
        'SELECT * FROM ai_models WHERE model_key = ? LIMIT 1',
      )
        .bind(modelKey)
        .first();
      return jsonResponse({ ok: true, model: row });
    } catch (e) {
      return jsonResponse({ error: e?.message ?? String(e) }, 500);
    }
  }

  // ── GET /api/settings/default-model ──────────────────────────────────────
  if (pathLower === '/api/settings/default-model' && method === 'GET') {
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    try {
      const row = await env.DB.prepare(
        `SELECT ui_preferences_json FROM agentsam_bootstrap WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1`,
      )
        .bind(userId)
        .first();
      const prefs = parseJsonSafe(row?.ui_preferences_json, {});
      const default_model =
        typeof prefs.default_model === 'string' && prefs.default_model.trim()
          ? prefs.default_model.trim()
          : null;
      return jsonResponse({ default_model });
    } catch (e) {
      return jsonResponse({ error: e?.message ?? String(e) }, 500);
    }
  }

  // ── POST /api/settings/default-model ─────────────────────────────────────
  if (pathLower === '/api/settings/default-model' && method === 'POST') {
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const tenantId = await resolveAuthTenantId(env, authUser);
    const isSuper = Number(authUser.is_superadmin) === 1;
    if (!tenantId && !isSuper) return jsonResponse({ error: 'Tenant required' }, 403);
    const body = await request.json().catch(() => ({}));
    const modelKey = String(body.model_key || '').trim();
    if (!modelKey) return jsonResponse({ error: 'model_key required' }, 400);
    try {
      const row = await env.DB.prepare(
        `SELECT id, ui_preferences_json FROM agentsam_bootstrap WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1`,
      )
        .bind(userId)
        .first();
      const prefs = parseJsonSafe(row?.ui_preferences_json, {});
      prefs.default_model = modelKey;
      const prefsJson = JSON.stringify(prefs);
      if (row?.id) {
        await env.DB.prepare(
          `UPDATE agentsam_bootstrap SET ui_preferences_json = ?, updated_at = datetime('now') WHERE id = ?`,
        )
          .bind(prefsJson, row.id)
          .run();
      } else {
        const bid = `asb_${userId}`.slice(0, 80);
        let workspaceId = '';
        try {
          const urow = await env.DB.prepare(
            `SELECT default_workspace_id FROM users WHERE id = ? LIMIT 1`,
          )
            .bind(userId)
            .first();
          workspaceId =
            String(urow?.default_workspace_id || '').trim() ||
            `ws_${String(userId).replace(/^au_/, '').slice(0, 28)}`;
        } catch {
          workspaceId = `ws_${String(userId).replace(/^au_/, '').slice(0, 28)}`;
        }
        await env.DB.prepare(
          `INSERT INTO agentsam_bootstrap (
             id, workspace_id, tenant_id, user_id, email, display_name,
             environment, is_active, capabilities_json, governance_roles_json, approval_required_json,
             allowed_execution_modes_json, default_execution_mode, runtime_status_json, backend_health_json,
             feature_flags_json, ui_preferences_json, created_at, updated_at
           ) VALUES (?,?,?,?,?,?,
             'production', 1, '{}','[]','[]','[\"pty\"]','pty','{}','{}','{}',?,
             datetime('now'), datetime('now'))`,
        )
          .bind(
            bid,
            workspaceId,
            tenantId,
            userId,
            String(authUser.email || '').trim() || null,
            String(authUser.display_name || authUser.name || '').trim() || null,
            prefsJson,
          )
          .run();
      }
      return jsonResponse({ ok: true, default_model: modelKey });
    } catch (e) {
      return jsonResponse({ error: e?.message ?? String(e) }, 500);
    }
  }

  return jsonResponse({ error: 'Settings route not found' }, 404);
}

/** Router passes `(request, url, env, ctx)` — delegate to `handleSettingsRequest`. */
export async function handleSettingsApi(request, _url, env, ctx) {
  return handleSettingsRequest(request, env, ctx);
}

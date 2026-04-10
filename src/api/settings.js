/**
 * API Service: User & Workspace Settings
 * Handles workspace listings, themes, and personal account configurations.
 * Deconstructed from legacy worker.js.
 */
import { getAuthUser, jsonResponse } from '../core/auth.js';

const CORE_WORKSPACES_DATA = [
  { id: 'ws_inneranimalmedia', name: 'Inner Animal Media', category: 'entity' },
  { id: 'ws_inneranimal', name: 'InnerAnimal', category: 'entity' },
  { id: 'ws_meauxbility', name: 'Meauxbility', category: 'entity' },
  { id: 'ws_innerautodidact', name: 'InnerAutodidact', category: 'entity' },
];

const CORE_WORKSPACE_IDS = CORE_WORKSPACES_DATA.map(w => w.id);

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

  return jsonResponse({ error: 'Settings route not found' }, 404);
}

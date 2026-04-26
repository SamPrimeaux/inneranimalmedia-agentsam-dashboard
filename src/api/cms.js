/**
 * API Service: CMS
 * Routes:
 *   GET /api/cms/tenants   (auth required; superadmin sees all, others see own)
 *   GET /api/cms/themes    (public)
 */
import { getAuthUser, jsonResponse, fetchAuthUserTenantId } from '../core/auth.js';

function toSafeJsonConfig(row) {
  const raw = row?.config_json ?? row?.config ?? null;
  if (raw == null) return null;
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(String(raw)); } catch { return String(raw); }
}

async function resolveTenantId(env, authUser) {
  if (authUser?.tenant_id != null && String(authUser.tenant_id).trim() !== '') {
    return String(authUser.tenant_id).trim();
  }
  if (!env?.DB) return null;
  let tid = await fetchAuthUserTenantId(env, authUser.id);
  if (tid) return tid;
  if (authUser.email) {
    tid = await fetchAuthUserTenantId(env, authUser.email);
    if (tid) return tid;
  }
  return null;
}

export async function handleCmsApi(request, url, env, _ctx) {
  const pathLower = url.pathname.toLowerCase().replace(/\/$/, '') || '/';
  const method = (request.method || 'GET').toUpperCase();

  if (!env?.DB) return jsonResponse({ error: 'DB not configured' }, 503);

  // ── Public themes ─────────────────────────────────────────────────────────
  if (pathLower === '/api/cms/themes' && method === 'GET') {
    try {
      const { results } = await env.DB.prepare(
        `SELECT id, name, slug, preview_url, config_json, config, is_active
         FROM cms_themes
         WHERE COALESCE(is_active, 1) = 1
         ORDER BY COALESCE(sort_order, 100) ASC, name ASC`,
      ).all();
      const themes = (results || []).map((r) => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        preview_url: r.preview_url ?? null,
        config_json: toSafeJsonConfig(r),
      }));
      return jsonResponse({ themes });
    } catch (e) {
      return jsonResponse({ themes: [], error: String(e?.message || e) }, 200);
    }
  }

  // ── Tenants (auth required) ───────────────────────────────────────────────
  if (pathLower === '/api/cms/tenants' && method === 'GET') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);

    const isSuper =
      authUser.role === 'owner' ||
      authUser.role === 'super_admin' ||
      authUser.role === 'superadmin' ||
      Number(authUser.is_superadmin || 0) === 1;

    const tenantId = await resolveTenantId(env, authUser);
    if (!tenantId && !isSuper) return jsonResponse({ tenants: [] });

    try {
      const q = isSuper
        ? `SELECT * FROM cms_tenants ORDER BY created_at DESC LIMIT 500`
        : `SELECT * FROM cms_tenants WHERE id = ? OR tenant_id = ? OR domain = ? OR custom_domain = ? LIMIT 5`;
      const binds = isSuper
        ? []
        : [tenantId, tenantId, String(new URL(request.url).hostname), String(new URL(request.url).hostname)];
      const res = binds.length ? await env.DB.prepare(q).bind(...binds).all() : await env.DB.prepare(q).all();
      return jsonResponse({ tenants: res.results || [] });
    } catch (e) {
      return jsonResponse({ tenants: [], error: String(e?.message || e) }, 200);
    }
  }

  return jsonResponse({ error: 'CMS route not found' }, 404);
}


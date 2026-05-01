/**
 * DesignStudio API — modular entry (worker + src/index).
 */
import { jsonResponse } from '../../core/auth.js';
import { syncRunToSupabase } from './sync.js';

function internalSecretOk(request, env) {
  const secret = env?.INTERNAL_API_SECRET;
  if (!secret || !String(secret).trim()) return false;
  const authHeader = request.headers.get('Authorization') || request.headers.get('X-Internal-Secret') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();
  return token === String(secret).trim();
}

/**
 * @param {Request} request
 * @param {URL} url
 * @param {any} env
 * @param {any} ctx
 */
export async function handleDesignStudioApi(request, url, env, ctx) {
  const pathLower = url.pathname.toLowerCase().replace(/\/$/, '') || '/';
  const method = (request.method || 'GET').toUpperCase();

  try {
    if (pathLower === '/api/internal/designstudio/sync-run' && method === 'POST') {
      if (!internalSecretOk(request, env)) {
        return jsonResponse({ error: 'Unauthorized' }, 401);
      }
      if (!env.DB) return jsonResponse({ error: 'Database not configured' }, 503);

      let body = {};
      try {
        const raw = await request.text();
        if (raw) body = JSON.parse(raw);
      } catch (_) {
        return jsonResponse({ error: 'Invalid JSON body' }, 400);
      }

      const runId = String(body.run_id || body.workflow_run_id || '').trim();
      if (!runId) return jsonResponse({ error: 'run_id required' }, 400);

      const assets = Array.isArray(body.assets) ? body.assets : [];
      const r2Prefix = body.r2_prefix != null ? String(body.r2_prefix).trim() : null;
      const sessionId = body.session_id != null ? String(body.session_id).trim() : null;
      const workspaceId = body.workspace_id != null ? String(body.workspace_id).trim() : undefined;
      const skipKeyCheck = body.skip_designstudio_key_check === true;

      const result = await syncRunToSupabase(env, runId, {
        sessionId: sessionId || null,
        r2Prefix: r2Prefix || null,
        assets,
        workspaceId,
        skipDesignStudioKeyCheck: skipKeyCheck,
      });

      return jsonResponse({ ok: true, ...result }, 200);
    }

    return jsonResponse({ error: 'DesignStudio route not found' }, 404);
  } catch (e) {
    const msg = String(e?.message || e);
    console.warn('[handleDesignStudioApi]', msg);
    return jsonResponse({ error: msg }, 500);
  }
}

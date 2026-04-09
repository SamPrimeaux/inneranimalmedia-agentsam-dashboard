import { jsonResponse } from '../core/responses.js';
import { getAuthUser } from '../core/auth.js';

const IAM_EXPLORER_WS_SANDBOX = 'ws_inneranimalmedia';

/**
 * Main dispatcher for Workspace-related API routes (/api/workspaces/*, /api/workspace/*).
 */
export async function handleWorkspaceApi(request, url, env, ctx) {
    const pathLower = url.pathname.toLowerCase();
    const method = request.method.toUpperCase();

    // ── /api/workspaces/list ────────────────────────────────────────────────
    if (pathLower === '/api/workspaces/list' && method === 'GET') {
        const authUser = await getAuthUser(request, env);
        if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
        if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
        try {
            const { results } = await env.DB.prepare(
                `SELECT w.id, w.name, w.domain, w.status, w.theme_id, w.handle,
                  (SELECT p.id FROM workspace_projects p WHERE p.workspace_id = w.id LIMIT 1) AS project_id
                 FROM workspaces w WHERE COALESCE(w.is_archived, 0) = 0 ORDER BY w.created_at DESC`
            ).all();
            const rows = (results || []).map((r) => ({ ...r, worker_id: null }));
            return jsonResponse({ workspaces: rows });
        } catch (e) {
            return jsonResponse({ error: e.message }, 500);
        }
    }

    // ── /api/workspace/create (Ephemeral User State) ───────────────────────
    if (pathLower === '/api/workspace/create' && method === 'POST') {
        const authUser = await getAuthUser(request, env);
        if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
        if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
        
        const body = await request.json().catch(() => ({}));
        const t = body?.type;
        const type = t === 'github' || t === 'r2' ? t : 'local';
        const wsUuid = crypto.randomUUID();
        const rowId = `uws:${String(authUser.tenant_id ?? '').trim()}:${String(authUser.id ?? '').trim()}:${wsUuid}`;
        const now = Date.now();
        
        const record = {
            schema: 'user_workspace_v1',
            id: wsUuid,
            userId: String(authUser.id ?? '').trim(),
            tenantId: String(authUser.tenant_id ?? '').trim(),
            type,
            folderName: typeof body.folderName === 'string' ? body.folderName : undefined,
            lastKnownPath: typeof body.lastKnownPath === 'string' ? body.lastKnownPath : 'unknown',
            githubRepo: typeof body.githubRepo === 'string' ? body.githubRepo : undefined,
            r2Bucket: typeof body.r2Bucket === 'string' ? body.r2Bucket : undefined,
            lastOpenedAt: typeof body.lastOpenedAt === 'number' ? body.lastOpenedAt : now,
            recentFiles: Array.isArray(body.recentFiles) ? body.recentFiles.slice(0, 24) : [],
        };
        
        const stateJson = JSON.stringify(record);
        await env.DB.prepare(
            `INSERT INTO agent_workspace_state (id, state_json, updated_at) VALUES (?, ?, unixepoch())
             ON CONFLICT(id) DO UPDATE SET state_json = excluded.state_json, updated_at = unixepoch()`
        ).bind(rowId, stateJson).run();
        
        return jsonResponse({ workspaceId: wsUuid });
    }

    // ── /api/workspace/:id (Ephemeral User State Fetch/Update) ─────────────
    const userWsMatch = pathLower.match(/^\/api\/workspace\/([^/]+)$/);
    if (userWsMatch && userWsMatch[1] !== 'create') {
        const authUser = await getAuthUser(request, env);
        if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
        const wsUuid = userWsMatch[1];
        const rowId = `uws:${String(authUser.tenant_id ?? '').trim()}:${String(authUser.id ?? '').trim()}:${wsUuid}`;

        if (method === 'GET') {
            const row = await env.DB.prepare('SELECT state_json FROM agent_workspace_state WHERE id = ?').bind(rowId).first();
            if (!row) return jsonResponse({ error: 'Not found' }, 404);
            return jsonResponse(JSON.parse(row.state_json || '{}'));
        }

        if (method === 'PATCH') {
            const body = await request.json().catch(() => ({}));
            const row = await env.DB.prepare('SELECT state_json FROM agent_workspace_state WHERE id = ?').bind(rowId).first();
            if (!row) return jsonResponse({ error: 'Not found' }, 404);
            
            const rec = JSON.parse(row.state_json || '{}');
            if (typeof body.lastOpenedAt === 'number') rec.lastOpenedAt = body.lastOpenedAt;
            if (typeof body.folderName === 'string') rec.folderName = body.folderName;
            
            await env.DB.prepare('UPDATE agent_workspace_state SET state_json = ?, updated_at = unixepoch() WHERE id = ?')
                .bind(JSON.stringify(rec), rowId)
                .run();
            return jsonResponse({ ok: true, record: rec });
        }
    }

    // ── /api/workspaces/current/shell ───────────────────────────────────────
    if (pathLower === '/api/workspaces/current/shell' && method === 'GET') {
        return jsonResponse({
            workspace_id: IAM_EXPLORER_WS_SANDBOX,
            product_name: 'IAM Explorer',
            version: 'v6'
        });
    }

    return jsonResponse({ error: 'Workspace route not found or not yet modularized' }, 404);
}

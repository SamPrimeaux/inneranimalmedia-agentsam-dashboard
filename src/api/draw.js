/**
 * API Service: Collaborative Drawing & Canvas
 * Handles Excalidraw scene synchronization, library listings, and PNG exports.
 * Deconstructed from legacy worker.js.
 */
import { getAuthUser, jsonResponse } from '../core/auth.js';

/**
 * Parses a data URL into bytes and content type.
 */
function parseDataUrlToBytes(dataUrl) {
    if (!dataUrl || typeof dataUrl !== 'string') return null;
    const parts = dataUrl.split(',');
    if (parts.length < 2) return null;
    const mimeMatch = parts[0].match(/:(.*?);/);
    const contentType = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
    const bstr = atob(parts[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) u8arr[n] = bstr.charCodeAt(n);
    return { bytes: u8arr, contentType };
}

/**
 * Main dispatcher for Drawing-related API routes (/api/draw/*).
 */
export async function handleDrawApi(request, url, env, ctx) {
    const pathLower = url.pathname.toLowerCase().replace(/\/$/, '') || '/';
    const method = request.method.toUpperCase();

    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);

    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    if (!env.DASHBOARD) return jsonResponse({ error: 'DASHBOARD bucket not configured' }, 503);

    try {
        // ── /api/draw/libraries ──
        if (pathLower === '/api/draw/libraries' && method === 'GET') {
            const { results } = await env.DB.prepare(
                `SELECT slug, name, filename, category, icon, public_url, r2_dev_url,
                        auto_load, agent_tags, description, item_count
                 FROM draw_libraries WHERE is_active = 1
                 ORDER BY category ASC, sort_order ASC, name ASC`
            ).all();
            return jsonResponse({ libraries: results || [] });
        }

        // ── /api/draw/list ──
        if (pathLower === '/api/draw/list' && method === 'GET') {
            const projectId = (url.searchParams.get('project_id') || 'default').trim();
            const { results } = await env.DB.prepare(
                `SELECT id, project_id, r2_key, generation_type, created_at FROM project_draws WHERE project_id = ? ORDER BY created_at DESC LIMIT 100`
            ).bind(projectId).all();
            return jsonResponse({ draws: results || [] });
        }

        // ── /api/draw/load ──
        if (pathLower === '/api/draw/load' && method === 'GET') {
            const uid = authUser.id;
            const sceneRow = await env.DB.prepare(
                `SELECT r2_key FROM project_draws
                 WHERE project_id = ? AND generation_type = 'json_scene'
                 ORDER BY created_at DESC LIMIT 1`
            ).bind(uid).first();
            
            if (!sceneRow) return jsonResponse({ scene: null });
            const obj = await env.DASHBOARD.get(sceneRow.r2_key);
            if (!obj) return jsonResponse({ scene: null });
            
            try {
                return jsonResponse({ scene: JSON.parse(await obj.text()), r2_key: sceneRow.r2_key });
            } catch (_) { 
                return jsonResponse({ scene: null }); 
            }
        }

        // ── /api/draw/save ──
        if (pathLower === '/api/draw/save' && method === 'POST') {
            const body = await request.json().catch(() => ({}));
            const uid = authUser.id;
            
            // Scenario A: Scene JSON Save
            if (body.scene && typeof body.scene === 'object') {
                const sceneKey = crypto.randomUUID();
                const r2Key = `draw/scenes/${uid}/${sceneKey}.json`;
                await env.DASHBOARD.put(r2Key, JSON.stringify(body.scene), {
                    httpMetadata: { contentType: 'application/json' },
                });
                const ins = await env.DB.prepare(
                    `INSERT INTO project_draws (project_id, r2_key, generation_type, created_at)
                     VALUES (?, ?, 'json_scene', datetime('now'))`
                ).bind(uid, r2Key).run();
                return jsonResponse({ ok: true, id: ins?.meta?.last_row_id, key: r2Key });
            }
            
            // Scenario B: PNG Export Save
            if (body.canvasData && typeof body.canvasData === 'string') {
                const parsed = parseDataUrlToBytes(body.canvasData);
                if (!parsed) return jsonResponse({ error: 'Invalid canvasData' }, 400);
                
                const fileKey = crypto.randomUUID();
                const projectId = String(body.projectId || 'default').replace(/[^a-zA-Z0-9_-]/g, '_');
                const r2Key = `draw/exports/${projectId}/${fileKey}.png`;
                
                await env.DASHBOARD.put(r2Key, parsed.bytes, {
                    httpMetadata: { contentType: parsed.contentType },
                });
                
                const ins = await env.DB.prepare(
                    `INSERT INTO project_draws (project_id, r2_key, generation_type, created_at) VALUES (?, ?, 'png_export', datetime('now'))`
                ).bind(projectId, r2Key).run();
                
                return jsonResponse({ ok: true, id: ins?.meta?.last_row_id, r2_key: r2Key });
            }
            
            return jsonResponse({ error: 'scene or canvasData required' }, 400);
        }

        return jsonResponse({ error: 'Draw route not found' }, 404);
    } catch (e) {
        return jsonResponse({ error: String(e.message || e) }, 500);
    }
}

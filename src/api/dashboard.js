import { jsonResponse } from '../core/responses.js';
import { getAuthUser, getIntegrationToken } from '../core/auth.js';

/**
 * Main dispatcher for Dashboard-related API routes (/api/agent/*, /api/terminal/*).
 */
export async function handleDashboardApi(request, url, env, ctx) {
    const pathLower = url.pathname.toLowerCase();
    const method = request.method.toUpperCase();

    // ── /api/agent/git/status ────────────────────────────────────────────────
    if (pathLower === '/api/agent/git/status' && method === 'GET') {
        const authUser = await getAuthUser(request, env);
        if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
        if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);

        const workerName = 'inneranimalmedia';
        try {
            const row = await env.DB.prepare(
                `SELECT d.git_hash, d.version, d.timestamp, g.repo_full_name, g.default_branch
                 FROM deployments d
                 LEFT JOIN github_repositories g ON g.cloudflare_worker_name = ?
                 WHERE d.worker_name = ? AND d.status = 'success'
                 ORDER BY d.timestamp DESC
                 LIMIT 1`
            ).bind(workerName, workerName).first();

            return jsonResponse({
                branch: row?.default_branch || 'main',
                git_hash: row?.git_hash || null,
                worker_name: workerName,
                repo_full_name: row?.repo_full_name || null,
                dirty: false,
                sync_last_at: row?.timestamp || null,
            });
        } catch (e) {
            return jsonResponse({ error: e.message }, 500);
        }
    }

    // ── /api/agent/notifications ─────────────────────────────────────────────
    if (pathLower === '/api/agent/notifications' && method === 'GET') {
        const authUser = await getAuthUser(request, env);
        if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
        if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);

        const recipientId = String(authUser.id || '').trim();
        if (!recipientId) return jsonResponse({ notifications: [] });

        try {
            const { results } = await env.DB.prepare(
                `SELECT id, subject, message, status, created_at FROM notifications
                 WHERE recipient_id = ? AND read_at IS NULL
                 ORDER BY created_at DESC LIMIT 20`
            ).bind(recipientId).all();
            return jsonResponse({ notifications: results || [] });
        } catch (e) {
            return jsonResponse({ error: e.message }, 500);
        }
    }

    // ── /api/agent/boot ──────────────────────────────────────────────────────
    if (pathLower === '/api/agent/boot' && method === 'GET') {
        if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
        try {
            const batch = await env.DB.batch([
                env.DB.prepare("SELECT id, name, role_name, mode FROM agentsam_ai WHERE status='active' ORDER BY CASE id WHEN 'ai_sam_v1' THEN 0 ELSE 1 END, name"),
                env.DB.prepare("SELECT id, service_name, service_type, endpoint_url, authentication_type, token_secret_name, is_active, health_status FROM mcp_services WHERE is_active=1 ORDER BY service_name"),
                env.DB.prepare("SELECT id, provider, model_key, display_name, input_rate_per_mtok, output_rate_per_mtok, context_max_tokens FROM ai_models WHERE is_active=1 AND show_in_picker=1 ORDER BY CASE provider WHEN 'anthropic' THEN 1 WHEN 'google' THEN 2 WHEN 'openai' THEN 3 WHEN 'workers_ai' THEN 4 ELSE 5 END, input_rate_per_mtok ASC"),
                env.DB.prepare("SELECT id, session_type, status, started_at FROM agent_sessions WHERE status='active' ORDER BY updated_at DESC LIMIT 20"),
            ]);
            
            return jsonResponse({
                agents: batch[0]?.results ?? [],
                mcp_services: batch[1]?.results ?? [],
                models: batch[2]?.results ?? [],
                sessions: batch[3]?.results ?? [],
                integrations: {}, // Hydrated on client
            });
        } catch (e) {
            return jsonResponse({ error: e.message }, 500);
        }
    }

    return jsonResponse({ error: 'Dashboard route not found or not yet modularized' }, 404);
}

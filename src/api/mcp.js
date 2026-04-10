/**
 * API Service: Model Context Protocol (MCP) Manager
 * Handles agent session tracking, tool registration listings, and intent-based routing.
 * Deconstructed from legacy worker.js.
 */
import { getAuthUser, jsonResponse, tenantIdFromEnv } from '../core/auth.js';

/**
 * Filters tool rows based on requested agent context.
 */
function filterToolRowsByPanel(requestAgentId, rows) {
  if (!requestAgentId) return rows;
  const agent = String(requestAgentId).toLowerCase();
  if (agent === 'mcp_agent_architect') {
    return rows.filter((r) => ['github_repos', 'github_get_file', 'mcp_status'].includes(r.tool_name));
  }
  if (agent === 'mcp_agent_tester') {
    return rows.filter((r) => ['playwright_run', 'cicd_status', 'mcp_status'].includes(r.tool_name));
  }
  return rows;
}

/**
 * Main dispatcher for MCP-related API routes (/api/mcp/*).
 */
export async function handleMcpApi(request, url, env, ctx) {
    const pathLower = url.pathname.replace(/\/$/, '').toLowerCase();
    const method = (request.method || 'GET').toUpperCase();
    
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);

    try {
        // --- PUBLIC STATUS ---
        if (pathLower === '/api/mcp/status' && method === 'GET') {
            return jsonResponse({ ok: true, service: 'mcp', status: 'connected' }, 200);
        }

        // --- AUTHENTICATED ROUTES ---
        const authUser = await getAuthUser(request, env);
        if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);

        if (pathLower === '/api/mcp/server-allowlist' && method === 'GET') {
            const { results } = await env.DB.prepare(
                'SELECT * FROM mcp_server_allowlist ORDER BY server_name ASC LIMIT 500'
            ).all();
            return jsonResponse({ allowlist: results || [] });
        }

        if (pathLower === '/api/mcp/credentials' && method === 'GET') {
            const { results } = await env.DB.prepare(
                'SELECT * FROM mcp_service_credentials ORDER BY service_name ASC LIMIT 200'
            ).all();
            return jsonResponse({ credentials: results || [] });
        }

        if (pathLower === '/api/mcp/audit' && method === 'GET') {
            const lim = Math.min(500, Math.max(1, parseInt(url.searchParams.get('limit') || '200', 10) || 200));
            const { results } = await env.DB.prepare(
                'SELECT * FROM mcp_audit_log ORDER BY created_at DESC LIMIT ?'
            ).bind(lim).all();
            return jsonResponse({ audit: results || [] });
        }

        if (pathLower === '/api/mcp/stats' && method === 'GET') {
            const lim = Math.min(500, Math.max(1, parseInt(url.searchParams.get('limit') || '200', 10) || 200));
            const { results } = await env.DB.prepare(
                'SELECT * FROM mcp_tool_call_stats ORDER BY date DESC, call_count DESC LIMIT ?'
            ).bind(lim).all();
            return jsonResponse({ stats: results || [] });
        }

        if (pathLower === '/api/mcp/agents' && method === 'GET') {
            let rows = [];
            try {
                const stmt = env.DB.prepare(
                    `SELECT a.id, a.name, a.role_name, a.tool_permissions_json, a.model_policy_json,
                          s.status, s.current_task, s.progress_pct, s.stage, s.logs_json, s.active_tools_json, s.cost_usd
                         FROM agentsam_ai a
                         LEFT JOIN mcp_agent_sessions s ON s.agent_id = a.id AND s.id = (
                           SELECT id FROM mcp_agent_sessions WHERE agent_id = a.id ORDER BY created_at DESC LIMIT 1
                         )
                         WHERE a.id IN ('mcp_agent_architect','mcp_agent_builder','mcp_agent_tester','mcp_agent_operator')
                         ORDER BY CASE a.id WHEN 'mcp_agent_architect' THEN 1 WHEN 'mcp_agent_builder' THEN 2 WHEN 'mcp_agent_tester' THEN 3 WHEN 'mcp_agent_operator' THEN 4 END`
                );
                const r = await stmt.all();
                rows = r.results || [];
            } catch (_) {
                const fallback = await env.DB.prepare(
                    "SELECT id, name, role_name, tool_permissions_json, model_policy_json FROM agentsam_ai WHERE id IN ('mcp_agent_architect','mcp_agent_builder','mcp_agent_tester','mcp_agent_operator') ORDER BY CASE id WHEN 'mcp_agent_architect' THEN 1 WHEN 'mcp_agent_builder' THEN 2 WHEN 'mcp_agent_tester' THEN 3 WHEN 'mcp_agent_operator' THEN 4 END"
                ).all().catch(() => ({ results: [] }));
                rows = (fallback.results || []).map((a) => ({ ...a, status: 'idle', current_task: null, progress_pct: 0, stage: null, logs_json: '[]', active_tools_json: '[]', cost_usd: 0 }));
            }
            return jsonResponse({ agents: rows });
        }

        if (pathLower === '/api/mcp/tools' && method === 'GET') {
            const panelAgent = url.searchParams.get('agent_id');
            let tools = [];
            try {
                const r = await env.DB.prepare('SELECT tool_name, description, tool_category FROM mcp_registered_tools WHERE enabled = 1 ORDER BY tool_name').all();
                const filtered = filterToolRowsByPanel(panelAgent, r.results || []);
                tools = filtered.map((t) => ({ 
                    tool_name: t.tool_name, 
                    description: t.description || '', 
                    category: t.tool_category || 'execute' 
                }));
            } catch (_) {
                try {
                    const r = await env.DB.prepare('SELECT tool_name, tool_category FROM mcp_registered_tools WHERE enabled = 1 ORDER BY tool_name').all();
                    const filtered = filterToolRowsByPanel(panelAgent, r.results || []);
                    tools = filtered.map((t) => ({ 
                        tool_name: t.tool_name, 
                        description: '', 
                        category: t.tool_category || 'execute' 
                    }));
                } catch (__) { }
            }
            return jsonResponse({ tools });
        }

        if (pathLower === '/api/mcp/commands' && method === 'GET') {
            let rows = [];
            try {
                const r = await env.DB.prepare("SELECT * FROM mcp_command_suggestions ORDER BY is_pinned DESC, sort_order ASC").all();
                rows = r.results || [];
            } catch (_) { }
            return jsonResponse({ suggestions: rows });
        }

        if (pathLower === '/api/mcp/dispatch' && method === 'POST') {
            const body = await request.json().catch(() => ({}));
            const prompt = String(body.prompt || '').trim();
            if (!prompt) return jsonResponse({ error: 'prompt required' }, 400);

            let agentId = 'mcp_agent_builder';
            let agentName = 'Builder';
            let routedBy = 'default';
            try {
                const patterns = await env.DB.prepare("SELECT workflow_agent AS agent_id, triggers_json FROM agent_intent_patterns WHERE is_active=1").all();
                const low = prompt.toLowerCase();
                for (const p of (patterns.results || [])) {
                    let triggers = [];
                    try { triggers = JSON.parse(p.triggers_json || '[]'); } catch (_) { }
                    for (const t of triggers) {
                        if (low.includes(String(t).toLowerCase())) {
                            agentId = p.agent_id;
                            const names = { 
                                mcp_agent_architect: 'Architect', 
                                mcp_agent_builder: 'Builder', 
                                mcp_agent_tester: 'Tester', 
                                mcp_agent_operator: 'Operator' 
                            };
                            agentName = names[p.agent_id] || p.agent_id;
                            routedBy = 'intent_pattern';
                            break;
                        }
                    }
                    if (routedBy !== 'default') break;
                }
            } catch (_) { }

            const sessionId = crypto.randomUUID();
            const now = Math.floor(Date.now() / 1000);
            const messagesJson = JSON.stringify([{ role: 'user', content: prompt }]);
            try {
                await env.DB.prepare(
                    `INSERT INTO mcp_agent_sessions (id, agent_id, tenant_id, status, current_task, progress_pct, stage, logs_json, active_tools_json, cost_usd, messages_json, created_at, updated_at)
                         VALUES (?, ?, ?, 'running', ?, 0, 'queued', '[]', '[]', 0, ?, ?, ?)`
                ).bind(sessionId, agentId, tenantIdFromEnv(env) || 'iam', prompt, messagesJson, now, now).run();
            } catch (err) {
                return jsonResponse({ error: 'mcp_agent_sessions table missing or insert failed', detail: err.message }, 503);
            }
            return jsonResponse({ ok: true, session_id: sessionId, agent_id: agentId, agent_name: agentName, routed_by: routedBy });
        }

        return jsonResponse({ error: 'MCP route not found' }, 404);
    } catch (e) {
        return jsonResponse({ error: String(e.message || e) }, 500);
    }
}

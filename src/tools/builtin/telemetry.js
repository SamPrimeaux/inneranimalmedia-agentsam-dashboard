import { jsonResponse } from '../../core/responses.js';

/**
 * Telemetry & Logging Tools (Builtin).
 * Handles performance tracking, error logging, and tool-usage analytics.
 */

/**
 * Log a tool execution event to the telemetry database.
 */
export async function telemetryLog(env, { tool_name, status, duration_ms, error = null, metadata = {} }) {
    if (!env.DB) return { error: 'DB not configured' };
    if (!tool_name) return { error: 'tool_name required' };

    try {
        await env.DB.prepare(
            `INSERT INTO mcp_tool_usage (tool_name, status, duration_ms, error_message, metadata_json, created_at) 
             VALUES (?, ?, ?, ?, ?, datetime('now'))`
        ).bind(
            tool_name, 
            status, 
            duration_ms || 0, 
            error, 
            JSON.stringify(metadata)
        ).run();
        
        return { success: true };
    } catch (e) {
        console.error('[Telemetry] Log failed:', e.message);
        return { error: 'Telemetry logging failed', detail: e.message };
    }
}

/**
 * Query tool usage metrics.
 */
export async function telemetryQuery(env, { tool_name, limit = 10 }) {
    if (!env.DB) return { error: 'DB not configured' };

    try {
        const sql = `
            SELECT tool_name, status, duration_ms, error_message, created_at 
            FROM mcp_tool_usage 
            WHERE (tool_name = ? OR ? = '*')
            ORDER BY created_at DESC LIMIT ?
        `;
        const { results } = await env.DB.prepare(sql).bind(tool_name || '*', tool_name || '*', limit).all();
        return { metrics: results || [] };
    } catch (e) {
        return { error: 'Telemetry query failed', detail: e.message };
    }
}

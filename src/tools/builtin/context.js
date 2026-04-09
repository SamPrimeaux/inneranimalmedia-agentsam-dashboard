import { jsonResponse } from '../../core/responses.js';

/**
 * Context & Knowledge Tools (Builtin).
 * Handles long-term memory, project knowledge, and human context.
 */

/**
 * Search the global and project-specific knowledge base.
 */
export async function knowledgeSearch(env, { query, category = 'all' }) {
    if (!query) return { error: 'query required' };
    if (!env.DB) return { error: 'DB not configured' };

    try {
        // SQL Logic ported from monolithic worker.js
        const sql = `
            SELECT id, title, content, category, metadata_json 
            FROM mcp_knowledge 
            WHERE (title LIKE ? OR content LIKE ?)
            AND (category = ? OR ? = 'all')
            AND enabled = 1
            ORDER BY created_at DESC LIMIT 10
        `;
        const pattern = `%${query}%`;
        const { results } = await env.DB.prepare(sql).bind(pattern, pattern, category, category).all();
        
        return { 
            matches: (results || []).map(r => ({
                id: r.id,
                title: r.title,
                content: r.content,
                category: r.category
            }))
        };
    } catch (e) {
        return { error: 'Knowledge search failed', detail: e.message };
    }
}

/**
 * List human-provided context items.
 */
export async function humanContextList(env, { user_id }) {
    if (!env.DB) return { error: 'DB not configured' };
    
    try {
        const { results } = await env.DB.prepare(
            "SELECT id, context_key, context_value, updated_at FROM human_context WHERE user_id = ? ORDER BY updated_at DESC"
        ).bind(user_id).all();
        return { context: results || [] };
    } catch (e) {
        return { error: 'Failed to fetch human context', detail: e.message };
    }
}

/**
 * Add or update a human context item.
 */
export async function humanContextAdd(env, { user_id, key, value }) {
    if (!key || !value) return { error: 'key and value required' };
    if (!env.DB) return { error: 'DB not configured' };

    try {
        await env.DB.prepare(
            "INSERT INTO human_context (user_id, context_key, context_value, updated_at) VALUES (?, ?, ?, datetime('now')) ON CONFLICT(user_id, context_key) DO UPDATE SET context_value = EXCLUDED.context_value, updated_at = EXCLUDED.updated_at"
        ).bind(user_id, key, value).run();
        return { success: true };
    } catch (e) {
        return { error: 'Failed to add context', detail: e.message };
    }
}

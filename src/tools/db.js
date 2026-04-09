import { jsonResponse } from '../core/responses.js';

/**
 * Database Tool Implementation (Modular).
 * Handles D1 (SQLite) and SQL execution.
 */

/**
 * Execute a query against the Cloudflare D1 database.
 */
export async function d1Query(env, { sql, params = [] }) {
    if (!env.DB) return { error: 'D1 binding not configured' };
    if (!sql) return { error: 'SQL query required' };

    try {
        const { results, meta } = await env.DB.prepare(sql).bind(...params).all();
        return { success: true, results: results || [], meta };
    } catch (e) {
        return { error: 'D1 query failed', detail: e.message };
    }
}

/**
 * Batch write to D1.
 */
export async function d1BatchWrite(env, { queries }) {
    if (!env.DB) return { error: 'D1 binding not configured' };
    if (!Array.isArray(queries)) return { error: 'queries array required' };

    try {
        const statements = queries.map(q => env.DB.prepare(q.sql).bind(...(q.params || [])));
        const batchResults = await env.DB.batch(statements);
        return { success: true, results: batchResults };
    } catch (e) {
        return { error: 'D1 batch write failed', detail: e.message };
    }
}

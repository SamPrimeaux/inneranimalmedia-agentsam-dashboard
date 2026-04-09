import { jsonResponse } from '../core/responses.js';

/**
 * Filesystem Tool Implementation (Modular).
 * These tools interact with the Workspace PTY / Repository.
 */

/**
 * Read a file from the workspace.
 */
export async function workspaceReadFile(env, { path }) {
    if (!path) return { error: 'path required' };
    
    // In the modular architecture, we proxy this to the PTY/Agent bridge
    // For now, we utilize the environment bindings for the active workspace
    try {
        const response = await fetch(`${env.TERMINAL_API_URL}/files/read?path=${encodeURIComponent(path)}`, {
            headers: { 'Authorization': `Bearer ${env.TERMINAL_SECRET}` }
        });
        const data = await response.json();
        return { content: data.content, path: data.path };
    } catch (e) {
        return { error: 'Failed to read file', detail: e.message };
    }
}

/**
 * List files in the workspace.
 */
export async function workspaceListFiles(env, { path = '.', recursive = false }) {
    try {
        const response = await fetch(`${env.TERMINAL_API_URL}/files/list?path=${encodeURIComponent(path)}&recursive=${recursive}`, {
            headers: { 'Authorization': `Bearer ${env.TERMINAL_SECRET}` }
        });
        const data = await response.json();
        return { files: data.files || [] };
    } catch (e) {
        return { error: 'Failed to list files', detail: e.message };
    }
}

/**
 * Search the codebase.
 */
export async function workspaceSearch(env, { query, includes = [] }) {
    try {
        const response = await fetch(`${env.TERMINAL_API_URL}/files/search`, {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${env.TERMINAL_SECRET}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ query, includes })
        });
        const data = await response.json();
        return { matches: data.matches || [] };
    } catch (e) {
        return { error: 'Search failed', detail: e.message };
    }
}

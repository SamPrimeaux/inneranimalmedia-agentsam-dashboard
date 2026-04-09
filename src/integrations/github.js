import { jsonResponse } from '../core/responses.js';
import { getAuthUser, getIntegrationToken } from '../core/auth.js';

/**
 * GitHub Service Integration.
 * Handles repository discovery, file operations, and API proxying.
 */

/**
 * Main dispatcher for GitHub-related API requests.
 */
export async function handleGitHubApi(request, env) {
    const url = new URL(request.url);
    const pathLower = url.pathname.toLowerCase();
    const method = request.method.toUpperCase();

    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);

    // Retrieve the GitHub token from Secret/Vault/KV
    const token = await getIntegrationToken(env, authUser.id, 'github');
    if (!token) return jsonResponse({ error: 'GitHub account not linked' }, 403);

    // ── GET /api/agent/github/repos ──────────────────────────────────────────
    if (pathLower === '/api/agent/github/repos' && method === 'GET') {
        try {
            const response = await fetch('https://api.github.com/user/repos?sort=updated&per_page=50', {
                headers: {
                    'Authorization': `token ${token}`,
                    'User-Agent': 'AgentSam-Dashboard',
                    'Accept': 'application/vnd.github.v3+json'
                }
            });
            const repos = await response.json();
            return jsonResponse({ repos: Array.isArray(repos) ? repos : [] });
        } catch (e) {
            return jsonResponse({ error: 'GitHub fetch failed', detail: e.message }, 500);
        }
    }

    // ── GET /api/agent/github/file ───────────────────────────────────────────
    if (pathLower === '/api/agent/github/file' && method === 'GET') {
        const repo = url.searchParams.get('repo');
        const path = url.searchParams.get('path');
        if (!repo || !path) return jsonResponse({ error: 'repo and path required' }, 400);

        try {
            const response = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
                headers: {
                    'Authorization': `token ${token}`,
                    'User-Agent': 'AgentSam-Dashboard',
                    'Accept': 'application/vnd.github.v3.raw'
                }
            });
            const content = await response.text();
            return new Response(content, { headers: { 'Content-Type': 'text/plain' } });
        } catch (e) {
            return jsonResponse({ error: 'Failed to fetch GitHub file', detail: e.message }, 500);
        }
    }

    return jsonResponse({ error: 'GitHub route not found' }, 404);
}

// src/tools/github-dispatch.js
/**
 * Agent Sam: GitHub Modular Dispatcher
 * Orchestrates repository-driven tasks and code synchronization.
 */
import { jsonResponse } from '../core/auth.js';
import * as github from '../integrations/github.js';

/**
 * Main dispatcher for GitHub tasks.
 * Route: /api/agentsam/github/*
 */
export async function handleGitHubDispatch(request, env, ctx, authUser) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, '') || '/';
    const method = request.method.toUpperCase();

    try {
        // 1. Repository Logic (Bridge to existing integration)
        if (path.endsWith('/repos')) {
            return github.handleGitHubApi(request, env);
        }

        // 2. File Operations
        if (path.endsWith('/file')) {
            return github.handleGitHubApi(request, env);
        }

        // 3. Commit/Sync Logic (NEW)
        if (path.endsWith('/commit') && method === 'POST') {
            const body = await request.json();
            const { repo, branch, path: filePath, content, message } = body;
            
            if (!repo || !filePath || !content) {
                return jsonResponse({ error: 'Missing sync parameters' }, 400);
            }

            // TODO: In Phase 21, implement the full SHA-handshake commit logic here.
            // For now, we bridge to the underlying API proxy.
            return jsonResponse({ 
                status: 'pending', 
                action: 'sync_requested',
                repo, 
                path: filePath 
            });
        }

        return jsonResponse({ error: 'GitHub action not found' }, 404);

    } catch (e) {
        console.error('[GitHub Dispatch Error]', e.message);
        return jsonResponse({ error: 'GitHub dispatcher failed', detail: e.message }, 500);
    }
}

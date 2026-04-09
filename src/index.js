import { handleDashboardApi } from './api/dashboard.js';
import { handleWorkspaceApi } from './api/workspace.js';
import { jsonResponse } from './core/responses.js';

export default {
  /**
   * Main fetch handler for the modular Agent Sam worker.
   */
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathLower = url.pathname.toLowerCase();
    const method = request.method.toUpperCase();

    // ── Handle CORS Preflight ────────────────────────────────────────────────
    if (method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Terminal-Secret',
        },
      });
    }

    // ── Modular Dashboard API ────────────────────────────────────────────────
    if (pathLower.startsWith('/api/agent') || 
        pathLower.startsWith('/api/terminal') || 
        pathLower === '/api/chat') {
      return handleDashboardApi(request, url, env, ctx);
    }

    // ── Modular Workspace API ────────────────────────────────────────────────
    if (pathLower.startsWith('/api/workspace') || 
        pathLower.startsWith('/api/workspaces')) {
      return handleWorkspaceApi(request, url, env, ctx);
    }

    // ── Fallback for yet-to-be-modularized routes ────────────────────────────
    // (In a real transition, we would proxy these or eventually move everything)
    return jsonResponse({ error: 'Route not modularized yet' }, 404);
  }
}

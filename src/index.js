/**
 * Agent Sam: Modular Worker Entry Point
 * Orchestrates domain-specific services and handles request routing.
 * Replaces the monolithic worker.js.
 */
import { handleAgentRequest } from './api/agent';
import { recordWorkerAnalyticsError, writeTelemetry } from './api/telemetry';
import { getAuthUser, jsonResponse } from './core/auth';

export default {
  /**
   * Primary Request Handler
   */
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, '') || '/';
    const pathLower = path.toLowerCase();

    try {
      // 1. Health Checks
      if (pathLower === '/api/health' || pathLower === '/health') {
        return jsonResponse({ 
          status: 'ok', 
          worker: 'agentsam-modular',
          version: env.CF_VERSION_METADATA?.id ?? 'v2.0-modular'
        });
      }

      // 2. Global Request Context
      const authUser = await getAuthUser(request, env);

      // 3. Domain Dispatching (Surgical Delegation)
      if (pathLower.startsWith('/api/agent')) {
        return handleAgentRequest(request, env, ctx, authUser);
      }

      // 4. Fallback: Legacy Monolith Logic (Optional: can proxy to old version during transition)
      return jsonResponse({ 
        error: 'Route not found in modular router', 
        path: pathLower,
        instruction: 'Please verify the api/ route is defined in src/api/'
      }, 404);

    } catch (e) {
      console.error('[Worker Error]', e.message);
      
      // Async Error Telemetry
      ctx.waitUntil(recordWorkerAnalyticsError(env, {
        path: pathLower,
        method: request.method,
        status_code: 500,
        error_message: e.message
      }));

      return jsonResponse({ error: 'Internal Server Error', detail: e.message }, 500);
    }
  },

  /**
   * Scheduled Cron Handler
   */
  async scheduled(event, env, ctx) {
    console.log('[Cron] Execution starting:', event.cron);
    
    // Delegation to background services can be added here
    if (event.cron === '0 0 * * *') {
       // Daily cleanup task...
    }
  }
};

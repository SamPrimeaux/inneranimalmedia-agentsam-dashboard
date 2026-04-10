/**
 * Agent Sam: Modular Worker Entry Point
 * Orchestrates domain-specific services and handles request routing.
 * Replaces the monolithic worker.js.
 */
import { handleAgentRequest } from './api/agent';
import { handleAgentSamRegistryRequest } from './api/agentsam';
import { handleTimeDispatch } from './tools/time';
import { handleIntegrationsRequest } from './api/integrations';
import { recordWorkerAnalyticsError, writeTelemetry } from './api/telemetry';
import { getAuthUser, jsonResponse } from './core/auth';
export { 
  IAMCollaborationSession, AgentChatSqlV1, ChessRoom, 
  IAMSession, IAMAgentSession, MeauxSession 
} from './core/durable_objects';

// --- Durable Objects ---
export { IAMCollaborationSession } from './do/Collaboration.js';
export { AgentChatSqlV1 } from './do/AgentChat.js';
export { IAMSession, IAMAgentSession, MeauxSession, ChessRoom } from './do/Legacy.js';

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
      if (pathLower.startsWith('/api/agentsam/time')) {
        return handleTimeDispatch(request, env, ctx, authUser);
      }

      if (pathLower.startsWith('/api/agentsam')) {
        return handleAgentSamRegistryRequest(request, env, ctx, authUser);
      }

      if (pathLower.startsWith('/api/integrations') || 
          pathLower === '/api/webhooks/resend' || 
          pathLower === '/api/email/inbound') {
        return handleIntegrationsRequest(request, env, ctx, authUser);
      }

      if (pathLower.startsWith('/api/agent')) {
        return handleAgentRequest(request, env, ctx, authUser);
      }


      // 4. Static Assets & SPA Fallback (Dashboard UI)
      if (!pathLower.startsWith('/api/')) {
        // A. Sandbox (Workers Assets)
        if (env.STATIC_ASSETS) {
          const assetRes = await env.STATIC_ASSETS.fetch(request.clone());
          if (assetRes.status !== 404) return assetRes;

          // SPA Fallback: If /dashboard/any-route is not found, serve index.html
          if (pathLower.startsWith('/dashboard/')) {
            return await env.STATIC_ASSETS.fetch(new Request(new URL('/index.html', url.origin), request));
          }
        }

        // B. Production (R2 Fallback)
        if (env.ASSETS || env.DASHBOARD) {
          // Redirect base dashboard to overview
          if (pathLower === '/dashboard' || pathLower === '/dashboard/') {
            return Response.redirect(`${url.origin}/dashboard/overview`, 302);
          }

          const assetKey = path.slice(1) || 'index.html';
          
          // Try ASSETS bucket (landing/public)
          if (env.ASSETS) {
            const obj = await env.ASSETS.get(assetKey);
            if (obj) return new Response(obj.body, { headers: { 'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream' } });
          }

          // Try DASHBOARD bucket (UI/SPA)
          if (env.DASHBOARD) {
            const obj = await env.DASHBOARD.get(assetKey) || await env.DASHBOARD.get(`static/${assetKey}`);
            if (obj) return new Response(obj.body, { headers: { 'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream' } });
            
            // SPA Fallback for production
            if (pathLower.startsWith('/dashboard/')) {
              const index = await env.DASHBOARD.get('static/dashboard/overview.html') || await env.DASHBOARD.get('index.html');
              if (index) return new Response(index.body, { headers: { 'Content-Type': 'text/html' } });
            }
          }
        }
      }

      // 5. Fallback: API Route Not Found
      if (pathLower.startsWith('/api/')) {
        return jsonResponse({ 
          error: 'Route not found in modular router', 
          path: pathLower,
          instruction: 'Please verify the api/ route is defined in src/api/'
        }, 404);
      }

      // Default fallthrough (should be handled by STATIC_ASSETS above)
      return new Response('Not Found', { status: 404 });

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

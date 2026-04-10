/**
 * Agent Sam: Modular Worker Entry Point
 * Orchestrates domain-specific services and handles request routing.
 * Replaces the monolithic worker.js.
 */
import { handleAgentRequest } from './api/agent';
import { handleAgentSamRegistryRequest } from './api/agentsam';
import { handleTimeDispatch } from './tools/time';
import { handleR2Api } from './api/r2-api';
import { handleIntegrationsRequest } from './api/integrations';
import { recordWorkerAnalyticsError, writeTelemetry } from './api/telemetry';
import { getAuthUser, jsonResponse } from './core/auth';
import { handleSettingsRequest } from './api/settings';
import { handleWorkspaceApi } from './api/workspace';
import { handleCidiApi } from './api/cicd';
import { handleDeploymentsApi } from './api/deployments';
import { handleFinanceApi } from './api/finance';
import { handleMcpApi } from './api/mcp';
import { handleDrawApi } from './api/draw';
import { handleThemesApi } from './api/themes';
import { handleHubApi } from './api/hub';
import { handleOverviewApi } from './api/overview';
import { handleAuthApi } from './api/auth';
import legacyWorker from '../worker.js';

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
        return handleHealthCheck(request, env);
      }
      
      // 1c. OAuth & Auth Passthrough (Legacy Monolith)
      if (pathLower.startsWith('/auth/') || pathLower.startsWith('/api/oauth/')) {
        return legacyWorker.fetch(request, env, ctx);
      }

      // 1b. System Health Snapshot
      if (pathLower === '/api/system/health' && request.method === 'GET') {
        if (!env.DB) return jsonResponse({ error: 'DB unavailable' }, 503);
        const refresh = new URL(request.url).searchParams.get('refresh') === 'true';
        try {
          let snapshot = refresh
            ? await runIntegritySnapshot(env, 'manual')
            : await env.DB.prepare('SELECT * FROM system_health_snapshots ORDER BY snapshot_at DESC LIMIT 1').first();
          const now = Math.floor(Date.now() / 1000);
          const snapTs = snapshot ? Number(snapshot.snapshot_at) || 0 : 0;
          const is_fresh = snapTs > 0 && now - snapTs < 300;
          const triggered_by = snapshot?.triggered_by != null ? String(snapshot.triggered_by) : refresh ? 'manual' : 'none';
          return jsonResponse({ snapshot, is_fresh, triggered_by });
        } catch (e) {
          return jsonResponse({ error: e?.message ?? String(e) }, 500);
        }
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

      // ----- API: R2 storage (buckets, objects, search, sync, CRUD) -----
      if (pathLower.startsWith('/api/r2/')) {
        return handleR2Api(request, url, env);
      }

      if (pathLower.startsWith('/api/integrations') || 
          pathLower === '/api/webhooks/resend' || 
          pathLower === '/api/email/inbound') {
        return handleIntegrationsRequest(request, env, ctx, authUser);
      }

      if (pathLower.startsWith('/api/vault')) {
        return handleVaultApi(request, env);
      }

      if (pathLower.startsWith('/api/agent')) {
        return handleAgentRequest(request, env, ctx, authUser);
      }

      if (pathLower.startsWith('/api/settings')) {
        return handleSettingsRequest(request, env, ctx);
      }

      if (pathLower.startsWith('/api/workspaces') || pathLower.startsWith('/api/workspace')) {
        return handleWorkspaceApi(request, url, env, ctx, authUser);
      }

      if (pathLower.startsWith('/api/cicd')) {
        return handleCidiApi(request, url, env, ctx);
      }

      if (pathLower.startsWith('/api/deployments') || pathLower.startsWith('/api/internal/')) {
        return handleDeploymentsApi(request, url, env, ctx);
      }

      if (pathLower.startsWith('/api/finance') || pathLower.startsWith('/api/clients') || 
          pathLower.startsWith('/api/projects') || pathLower.startsWith('/api/billing')) {
        return handleFinanceApi(request, url, env, ctx);
      }

      if (pathLower.startsWith('/api/mcp')) {
        return handleMcpApi(request, url, env, ctx);
      }

      if (pathLower.startsWith('/api/draw')) {
        return handleDrawApi(request, url, env, ctx);
      }

      if (pathLower.startsWith('/api/themes')) {
        return handleThemesApi(request, url, env, ctx);
      }

      if (pathLower.startsWith('/api/hub')) {
        return handleHubApi(request, url, env, ctx);
      }

      if (pathLower.startsWith('/api/overview')) {
        return handleOverviewApi(request, url, env, ctx);
      }

      if (pathLower.startsWith('/api/auth')) {
        return handleAuthApi(request, url, env);
      }


      // 4. Static Assets & SPA Fallback (Dashboard UI)
      if (!pathLower.startsWith('/api/')) {
        // A. Root Route (Landing Page Priority)
        if (pathLower === '/') {
          if (env.ASSETS) {
            // Priority: New Landing Page (index-v3.html)
            const obj = await env.ASSETS.get('index-v3.html') || await env.ASSETS.get('index.html');
            if (obj) return new Response(obj.body, { headers: { 'Content-Type': 'text/html' } });
          }
          if (env.STATIC_ASSETS) {
            // Fallback to static assets (sandbox/dev)
            const objV3 = await env.STATIC_ASSETS.fetch(new Request(new URL('/index-v3.html', url.origin), request)).catch(() => null);
            if (objV3 && objV3.status === 200) return objV3;
            
            const assetRes = await env.STATIC_ASSETS.fetch(new Request(new URL('/index.html', url.origin), request));
            if (assetRes.status !== 404) return assetRes;
          }
        }

        // B. Sandbox (Workers Assets)
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
    ctx.waitUntil(
      runIntegritySnapshot(env, 'cron').catch((e) => console.warn('[cron] runIntegritySnapshot', e?.message ?? e))
    );
  }
};

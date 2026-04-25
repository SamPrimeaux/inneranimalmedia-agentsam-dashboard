/**
 * Agent Sam: Modular Worker Entry Point
 * Orchestrates domain-specific services and handles request routing.
 * Replaces the monolithic worker.js.
 */
import { handleAgentRequest } from './api/agent';
import { handleAgentSamRegistryRequest } from './api/agentsam';
import { handleTimeDispatch } from './tools/time';
import { handleR2Api } from './api/r2-api';
import { handleStorageApi } from './api/storage';
import { handleIntegrationsRequest } from './api/integrations';
import { recordWorkerAnalyticsError, writeTelemetry } from './api/telemetry';
import { getAuthUser, jsonResponse } from './core/auth';
import { handleSettingsRequest } from './api/settings';
import { handleWorkspaceApi } from './api/workspace';
import { handleCicdEvent } from './api/cicd-event';
import { handlePostDeploy } from './api/post-deploy';
import { handleCidiApi } from './api/cicd';
import { handleDeploymentsApi } from './api/deployments';
import { handleFinanceApi } from './api/finance';
import { handleMcpApi } from './api/mcp';
import { handleNotifyDeployComplete } from './api/notify-deploy';
import { handleDrawApi } from './api/draw';
import { handleThemesApi } from './api/themes';
import { handleHubApi } from './api/hub';
import { handleOverviewApi } from './api/overview';
import { handleAuthApi } from './api/auth';
import { handleHealthCheck } from './api/health';
import { handleVaultApi } from './api/vault';
import { runIntegritySnapshot } from './api/integrity';
import { handleDashboardApi } from './api/dashboard';
import { handleMailApi } from './api/mail';
import { handleLearnApi } from './api/learn';
import { handleOnboardingApi } from './api/onboarding';
import legacyWorker from '../worker.js';

// --- Durable Objects (ACTIVE: 3 production classes only) ---
export { IAMCollaborationSession } from './do/Collaboration.js';
export { AgentChatSqlV1 } from './do/AgentChat.js';
export { ChessRoom } from './do/Legacy.js';

export default {

  /**
   * Primary Request Handler
   */
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, '') || '/';
    const pathLower = path.toLowerCase();

    // 0. Session Self-Healing Middleware
    // Detect multiple 'session' cookies (stale wildcard vs new host-only).
    const cookieHeader = request.headers.get('Cookie') || '';
    const sessionCount = (cookieHeader.match(new RegExp(`(?:^|;\\s*)session=`, 'g')) || []).length;

    // FIX: Responses from fetch() are immutable — headers cannot
    // be appended directly. Must construct a new Response with a mutable Headers copy.
    const withSessionHealing = (res) => {
      if (!res) return res;
      const mutableHeaders = new Headers(res.headers);
      
      // Never clear cookies on a response that is setting a new session —
      // doing so kills the session before the post-login redirect lands.
      const setCookies = mutableHeaders.getAll('set-cookie');
      const isSettingSession = setCookies.some(
        v => v.startsWith('session=') && !v.includes('Expires=Thu, 01 Jan 1970')
      );

      if (!isSettingSession) {
        mutableHeaders.append('Set-Cookie', 'session=; Domain=.inneranimalmedia.com; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax');
        mutableHeaders.append('Set-Cookie', 'session=; Domain=.sandbox.inneranimalmedia.com; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax');
      }

      return new Response(res.body, {
        status: res.status,
        statusText: res.statusText,
        headers: mutableHeaders,
      });
    };

    try {
      // 1. Health Checks
      if (pathLower === '/api/health' || pathLower === '/health') {
        return handleHealthCheck(request, env);
      }

      const ASSET_ROUTES = {
        '/work': 'process.html',
        '/about': 'about.html',
        '/services': 'services.html',
        '/contact': 'contact.html',
        '/pricing': 'pricing.html',
        '/terms': 'terms-of-service.html',
        '/privacy': 'privacy-policy.html',
        '/learn': 'learn.html',
        '/games': 'games.html',
        '/start': 'start-project.html',
        // Old-school: serve the raw TSX guide from ASSETS R2
        '/apiguide/providers': 'ApiProviderGuide.tsx',
      };
      const assetHtmlKey = ASSET_ROUTES[pathLower] || ASSET_ROUTES[path];
      if (assetHtmlKey && env.ASSETS) {
        const obj = await env.ASSETS.get(assetHtmlKey);
        if (!obj) return new Response('Not found', { status: 404 });
        return new Response(obj.body, {
          headers: {
            'Content-Type': obj.httpMetadata?.contentType || 'text/plain; charset=utf-8',
            'Cache-Control': 'public, max-age=300',
          },
        });
      }

      // 1a. Same-origin R2 assets passthrough (GLB, images, etc.)
      // Example: /assets/chess/v1/pieces/white/king.glb -> ASSETS.get('chess/v1/pieces/white/king.glb')
      if (pathLower.startsWith('/assets/') && env.ASSETS) {
        const key = path.slice('/assets/'.length).replace(/^\/+/, '');
        if (!key || key.includes('..')) return new Response('Bad request', { status: 400 });

        const obj = await env.ASSETS.get(key);
        if (!obj) return new Response('Not found', { status: 404 });

        const inferred =
          key.toLowerCase().endsWith('.glb') ? 'model/gltf-binary' :
          key.toLowerCase().endsWith('.gltf') ? 'model/gltf+json' :
          null;

        return new Response(obj.body, {
          headers: {
            'Content-Type': obj.httpMetadata?.contentType || inferred || 'application/octet-stream',
            'Cache-Control': 'public, max-age=3600',
          },
        });
      }

      // 1c. OAuth & Auth Passthrough (Legacy Monolith)
      if (pathLower.startsWith('/auth/') || pathLower.startsWith('/api/oauth/')) {
        return await legacyWorker.fetch(request, env, ctx);
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

      // 2b. Dashboard shell: require session before HTML/SPA
      if (!pathLower.startsWith('/api/')) {
        const needsDashAuth =
          pathLower === '/dashboard' ||
          pathLower.startsWith('/dashboard/');
        if (needsDashAuth && !authUser) {
          const next = encodeURIComponent(`${path}${url.search || ''}`);
          return Response.redirect(`${url.origin}/auth/login?next=${next}`, 302);
        }
      }

      // 3. Domain Dispatching (Surgical Delegation)
      if (pathLower.startsWith('/api/agentsam/time')) {
        return handleTimeDispatch(request, env, ctx, authUser);
      }

      if (pathLower.startsWith('/api/agentsam')) {
        const res = await handleAgentSamRegistryRequest(request, env, ctx, authUser);
        if (res && res.status !== 404) return res;
      }

      if (pathLower.startsWith('/api/storage')) {
        return handleStorageApi(request, url, env);
      }

      if (pathLower.startsWith('/api/r2/')) {
        return handleR2Api(request, url, env);
      }

      if (pathLower.startsWith('/api/integrations') ||
          pathLower === '/api/webhooks/resend' ||
          pathLower === '/api/email/inbound') {
        const res = await handleIntegrationsRequest(request, env, ctx, authUser);
        if (res && res.status !== 404) return res;
      }

      if (pathLower.startsWith('/api/vault')) {
        return handleVaultApi(request, env);
      }

      if (pathLower.startsWith('/api/agent') || pathLower.startsWith('/api/terminal') || pathLower.startsWith('/api/chat') || pathLower.startsWith('/api/playwright')) {
        const dashRes = await handleDashboardApi(request, url, env, ctx);
        if (dashRes.status !== 404) return dashRes;
      }

      if (pathLower.startsWith('/api/agent')) {
        const agentRes = await handleAgentRequest(request, env, ctx, authUser);
        if (agentRes.status !== 404) return agentRes;
      }

      if (
        pathLower.startsWith('/api/settings') ||
        pathLower.startsWith('/api/tenant') ||
        pathLower.startsWith('/api/ai')
      ) {
        return handleSettingsRequest(request, env, ctx);
      }

      if (pathLower.startsWith('/api/workspaces') || pathLower.startsWith('/api/workspace')) {
        return handleWorkspaceApi(request, url, env, ctx, authUser);
      }

      if (pathLower.startsWith('/api/cicd')) {
        return handleCidiApi(request, url, env, ctx);
      }

      if (pathLower === '/api/internal/cicd-event') {
        return handleCicdEvent(request, env, ctx);
      }

      if (pathLower === '/api/internal/post-deploy' && request.method === 'POST') {
        return handlePostDeploy(request, env, ctx);
      }

      if (pathLower.startsWith('/api/deployments') || pathLower.startsWith('/api/internal/')) {
        return handleDeploymentsApi(request, url, env, ctx);
      }

      if (pathLower.startsWith('/api/finance') || pathLower.startsWith('/api/clients') ||
          pathLower.startsWith('/api/projects') || pathLower.startsWith('/api/billing')) {
        return handleFinanceApi(request, url, env, ctx);
      }

      if (pathLower === '/api/notify/deploy-complete' && request.method === 'POST') {
        return handleNotifyDeployComplete(request, env, ctx);
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

      if (pathLower.startsWith('/api/mail')) {
        return handleMailApi(request, url, env, ctx);
      }

      if (pathLower.startsWith('/api/learn')) {
        return handleLearnApi(request, url, env, ctx);
      }

      if (pathLower.startsWith('/api/onboarding')) {
        return handleOnboardingApi(request, url, env);
      }

      if (pathLower.startsWith('/api/games')) {
        const { handleGamesApi } = await import('./api/games.js');
        return handleGamesApi(request, url, env, ctx, authUser);
      }

      if (pathLower.startsWith('/api/auth') || pathLower === '/api/settings/profile') {
        return handleAuthApi(request, url, env);
      }

      // 4. Static Assets & SPA Fallback (Dashboard UI)
      if (!pathLower.startsWith('/api/')) {
        // A. Root Route (Landing Page Priority)
        if (pathLower === '/') {
          if (env.ASSETS) {
            const obj = await env.ASSETS.get('index-v3.html') || await env.ASSETS.get('index.html');
            if (obj) return new Response(obj.body, { headers: { 'Content-Type': 'text/html' } });
          }
        }

        // B. Sandbox (Workers Assets) - DEPRECATED (Moved to R2 Fallback)
        // C. Production (R2 Fallback)
        if (env.ASSETS || env.DASHBOARD) {
          if (pathLower === '/dashboard' || pathLower === '/dashboard/') {
            return withSessionHealing(Response.redirect(`${url.origin}/dashboard/overview`, 302));
          }

          const assetKey = path.slice(1) || 'index.html';

          if (env.ASSETS) {
            const obj = await env.ASSETS.get(assetKey);
            if (obj) return new Response(obj.body, { headers: { 'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream' } });
          }

          if (env.DASHBOARD) {
            const obj = await env.DASHBOARD.get(assetKey)
                     || await env.DASHBOARD.get(`static/${assetKey}`)
                     || await env.DASHBOARD.get(`static/dashboard/agent/${assetKey}`);
            if (obj) return new Response(obj.body, { headers: { 'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream' } });

            if (pathLower.startsWith('/dashboard/') || pathLower === '/onboarding' || pathLower.startsWith('/onboarding/')) {
              const index = await env.DASHBOARD.get('static/dashboard/agent.html') || await env.DASHBOARD.get('index.html');
              if (index) return withSessionHealing(new Response(index.body, { headers: { 'Content-Type': 'text/html' } }));
            }
          }
        }
      }

      // 5. Fallback: API Route Not Found (Delegate to Legacy Monolith)
      if (pathLower.startsWith('/api/')) {
        const legacyRes = await legacyWorker.fetch(request, env, ctx);
        if (legacyRes.status === 404) {
          return jsonResponse({
            error: 'Route not found in modular router or legacy worker',
            path: pathLower,
            instruction: 'Please verify the api/ route is defined in src/api/'
          }, 404);
        }
        return legacyRes;
      }

      return new Response('Not Found', { status: 404 });

    } catch (e) {
      console.error('[Worker Error]', e.message);

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
    if (event.cron === '0 0 * * *') {
      // Daily cleanup task
    }
    ctx.waitUntil(
      runIntegritySnapshot(env, 'cron').catch((e) => console.warn('[cron] runIntegritySnapshot', e?.message ?? e))
    );
  },

  /**
   * Queue Handler
   */
  async queue(batch, env, ctx) {
    console.log(`[Queue] Received batch of ${batch.messages.length} messages`);
    return legacyWorker.queue(batch, env, ctx);
  }
};

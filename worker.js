/**
 * inneranimalmedia Worker
 * Serves: ASSETS (public homepage) + DASHBOARD (auth, dashboard pages).
 * Durable Objects: IAM_COLLAB, CHESS_SESSION (stubs until full logic restored from R2).
 * Browser: MYBROWSER -- Playwright for /api/browser/* and /api/playwright/* when binding is configured.
 * --remote only; no local dependencies.
 */

import { DurableObject } from "cloudflare:workers";
// @cloudflare/playwright loaded dynamically at runtime
let playwrightLaunch = null;

function normalizeThemeSlug(value) {
  if (!value || typeof value !== 'string') return null;
  return value.startsWith('theme-') ? value.substring(6) : value;
}

const SUPERADMIN_EMAILS = ['info@inneranimals.com', 'sam@inneranimalmedia.com', 'inneranimalclothing@gmail.com'];

function getSamContext(email) {
  return {
    id: email === 'sam@inneranimalmedia.com' ? 32 : 24,
    email,
    user_id: 'sam_primeaux',
    _session_user_id: email,
    name: 'Sam Primeaux',
    role: 'superadmin',
    permissions: ['*'],
    tenant_id: 'system',
    workspace_id: 'ws_samprimeaux',
    is_active: 1,
  };
}

/** Call after any write to agent_memory_index or ai_knowledge_base so agent_sam context cache is invalidated. */
function invalidateCompiledContextCache(env) {
  if (env.DB) env.DB.prepare(`DELETE FROM ai_compiled_context_cache WHERE context_hash LIKE '%system%'`).run().catch(() => {});
}

// Stub DOs so deploy succeeds; replace with full logic when restored from R2
export class IAMCollaborationSession extends DurableObject {
  async fetch(request) {
    return new Response(JSON.stringify({ do: 'IAMCollaborationSession', ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export class IAMSession extends DurableObject {
  async fetch(request) {
    return new Response(JSON.stringify({ do: 'IAMSession', ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export class MeauxSession extends DurableObject {
  async fetch(request) {
    return new Response(JSON.stringify({ do: 'MeauxSession', ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export class ChessRoom extends DurableObject {
  async fetch(request) {
    return new Response(JSON.stringify({ do: 'ChessRoom', ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// ============================================================================
// AUTO MODE: COST-BASED MODEL ROUTING
// ============================================================================

/**
 * Model cost tiers and per-token pricing
 * Costs in USD per 1M tokens (input/output)
 * Data from ai_models.input_rate_per_mtok / output_rate_per_mtok
 */
const MODEL_COST_TIERS = {
  'gemini-2.5-flash': {
    input: 0.10,
    output: 0.40,
    tier: 'budget',
    provider: 'google'
  },
  'gpt-4o-mini': {
    input: 0.15,
    output: 0.60,
    tier: 'budget',
    provider: 'openai'
  },
  'claude-haiku-4-5-20251001': {
    input: 0.80,
    output: 1.00,
    tier: 'standard',
    provider: 'anthropic'
  },
  'gpt-4o': {
    input: 2.50,
    output: 10.00,
    tier: 'standard',
    provider: 'openai'
  },
  'claude-sonnet-4-20250514': {
    input: 3.00,
    output: 15.00,
    tier: 'premium',
    provider: 'anthropic'
  },
  'claude-opus-4-6': {
    input: 15.00,
    output: 75.00,
    tier: 'max',
    provider: 'anthropic'
  }
};

/**
 * Map intent classifications to cost tiers
 * Existing classifyIntent returns: sql, shell, question, mixed
 */
const INTENT_TO_TIER = {
  'question': 'budget',
  'simple_query': 'budget',
  'sql': 'standard',
  'shell': 'standard',
  'action': 'standard',
  'code_generation': 'premium',
  'planning': 'premium',
  'architecture': 'max',
  'mixed': 'standard'
};

/**
 * Select best model for Auto mode based on intent and cost
 */
async function selectAutoModel(env, lastUserContent) {
  try {
    const classification = await classifyIntent(env, lastUserContent);
    const intent = classification?.intent || 'action';

    console.log('[Auto Mode] Intent classified as:', intent);

    const targetTier = INTENT_TO_TIER[intent] || 'standard';

    console.log('[Auto Mode] Target tier:', targetTier);

    let selectedKey = null;
    let lowestCost = Infinity;

    for (const [modelKey, config] of Object.entries(MODEL_COST_TIERS)) {
      if (config.tier === targetTier) {
        const avgCost = (config.input + config.output) / 2;
        if (avgCost < lowestCost) {
          lowestCost = avgCost;
          selectedKey = modelKey;
        }
      }
    }

    if (!selectedKey) {
      console.log('[Auto Mode] No model found for tier, falling back to budget');
      selectedKey = 'gemini-2.5-flash';
    }

    console.log('[Auto Mode] Selected model:', selectedKey, 'tier:', targetTier);

    const model = await env.DB.prepare(
      'SELECT * FROM ai_models WHERE model_key = ? AND is_active = 1'
    ).bind(selectedKey).first();

    if (!model) {
      console.warn('[Auto Mode] Model not found in DB:', selectedKey, '- falling back to Haiku');
      return await env.DB.prepare(
        'SELECT * FROM ai_models WHERE model_key = ? AND is_active = 1'
      ).bind('claude-haiku-4-5-20251001').first();
    }

    return model;

  } catch (error) {
    console.error('[Auto Mode] Selection failed:', error);
    return await env.DB.prepare(
      'SELECT * FROM ai_models WHERE model_key = ? AND is_active = 1'
    ).bind('claude-haiku-4-5-20251001').first();
  }
}

async function handleDeploymentLog(request, env, ctx) {
  const token = env.DEPLOY_TRACKING_TOKEN || env.WORKER_SECRET;
  if (!token) return jsonResponse({ error: 'Deploy tracking not configured' }, 501);
  const authHeader = request.headers.get('Authorization') || request.headers.get('X-Deploy-Token') || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();
  if (bearer !== token) return jsonResponse({ error: 'Unauthorized' }, 401);
  let body = {};
  try {
    const raw = await request.text();
    if (raw) body = JSON.parse(raw);
  } catch (_) {}
  const id = 'dpl-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
  const timestamp = (body.timestamp || new Date().toISOString()).toString();
  const version = (body.version || 'unknown').toString();
  const gitHash = (body.git_hash || body.git_hash_short || '').toString();
  const description = (body.description || '').toString();
  const status = (body.status || 'success').toString();
  const deployedBy = (body.deployed_by || 'script').toString();
  const environment = (body.environment || 'production').toString();
  const durationSeconds = typeof body.duration_seconds === 'number' ? body.duration_seconds : null;
  const deployDurationMs = durationSeconds != null ? durationSeconds * 1000 : null;
  const changes = Array.isArray(body.changes) ? body.changes : [];
  if (!env.DB) return jsonResponse({ error: 'DB unavailable' }, 503);
  if (ctx && typeof ctx.waitUntil === 'function') {
    ctx.waitUntil(
      (async () => {
        try {
          await env.DB.prepare(
            `INSERT INTO deployments (id, timestamp, version, git_hash, description, status, deployed_by, environment, deploy_duration_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())`
          ).bind(id, timestamp, version, gitHash || null, description || null, status, deployedBy, environment, deployDurationMs).run();
          for (let i = 0; i < changes.length; i++) {
            const ch = changes[i];
            const changeId = id + '-ch-' + i;
            const filePath = (ch.file_path || ch.path || '').toString();
            const changeType = (ch.change_type || ch.type || '').toString();
            await env.DB.prepare(
              `INSERT INTO deployment_changes (id, deployment_id, file_path, change_type, created_at) VALUES (?, ?, ?, ?, unixepoch())`
            ).bind(changeId, id, filePath || null, changeType || null).run();
          }
          await ensureWorkSessionAndSignal(env, 'sam_primeaux', 'ws_inneranimal', 'deploy', 'deploy-log', {
            deployment_id: id,
            version,
            status,
            environment,
          });
        } catch (e) {
          console.error('[deployments/log]', e?.message ?? e);
        }
      })()
    );
  } else {
    try {
      await env.DB.prepare(
        `INSERT INTO deployments (id, timestamp, version, git_hash, description, status, deployed_by, environment, deploy_duration_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())`
      ).bind(id, timestamp, version, gitHash || null, description || null, status, deployedBy, environment, deployDurationMs).run();
      for (let i = 0; i < changes.length; i++) {
        const ch = changes[i];
        const changeId = id + '-ch-' + i;
        const filePath = (ch.file_path || ch.path || '').toString();
        const changeType = (ch.change_type || ch.type || '').toString();
        await env.DB.prepare(
          `INSERT INTO deployment_changes (id, deployment_id, file_path, change_type, created_at) VALUES (?, ?, ?, ?, unixepoch())`
        ).bind(changeId, id, filePath || null, changeType || null).run();
      }
      await ensureWorkSessionAndSignal(env, 'sam_primeaux', 'ws_inneranimal', 'deploy', 'deploy-log', {
        deployment_id: id,
        version,
        status,
        environment,
      });
    } catch (e) {
      console.error('[deployments/log]', e?.message ?? e);
      return jsonResponse({ error: String(e?.message || e) }, 500);
    }
  }
  return jsonResponse({ ok: true, deployment_id: id });
}

async function handleDeploymentsRecent(request, env) {
  if (!env.DB) return jsonResponse({ deployments: [] });
  const limit = Math.min(parseInt(request.url && new URL(request.url).searchParams.get('limit'), 10) || 20, 50);
  try {
    const { results } = await env.DB.prepare(
      `SELECT id, timestamp, version, git_hash, changed_files, description, status, deployed_by, environment, deploy_duration_ms, notes, created_at FROM deployments ORDER BY timestamp DESC LIMIT ?`
    ).bind(limit).all();
    return jsonResponse({ deployments: results || [] });
  } catch (e) {
    console.error('[deployments/recent]', e?.message ?? e);
    return jsonResponse({ deployments: [] });
  }
}

// ── Vault secret loader ───────────────────────────────────────
// Loads all active vault secrets from D1 into a plain object.
// Returns empty object on any failure — never throws.
// (Crypto matches /api/env/* _vaultDecrypt; defined at module scope so fetch can call it.)
async function getVaultSecrets(env) {
  try {
    if (!env.VAULT_KEY || !env.DB) return {};
    async function importKey(b64) {
      const raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
    }
    async function decryptRow(encB64, ivB64, vaultKeyB64) {
      const key = await importKey(vaultKeyB64);
      const plain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: Uint8Array.from(atob(ivB64), c => c.charCodeAt(0)) },
        key,
        Uint8Array.from(atob(encB64), c => c.charCodeAt(0))
      );
      return new TextDecoder().decode(plain);
    }
    const { results } = await env.DB.prepare(
      'SELECT key_name, encrypted_value, iv FROM env_secrets WHERE is_active = 1'
    ).all();
    const secrets = {};
    for (const row of (results || [])) {
      try {
        secrets[row.key_name] = await decryptRow(
          row.encrypted_value, row.iv, env.VAULT_KEY
        );
      } catch {}
    }
    return secrets;
  } catch {
    return {};
  }
}

const worker = {
  async fetch(request, env, ctx) {
    try {
      // Load vault secrets — vault wins over wrangler env, wrangler is fallback
      const vault = await getVaultSecrets(env);
      const secret = (key) => vault[key] ?? env[key];
      const url = new URL(request.url);
      const path = url.pathname.replace(/\/$/, '') || '/';
      const pathLower = path.toLowerCase();

      // Health / sanity
      if (path === '/api/health' || pathLower === '/api/health') {
        const ok = !!(env.ASSETS && env.DASHBOARD);
        return new Response(JSON.stringify({ ok, worker: 'inneranimalmedia', bindings: { ASSETS: !!env.ASSETS, DASHBOARD: !!env.DASHBOARD } }), {
          headers: { 'Content-Type': 'application/json' },
          status: ok ? 200 : 503,
        });
      }

      // ----- API: Internal post-deploy (knowledge sync to R2) -----
      if ((request.method || 'GET').toUpperCase() === 'POST' && pathLower === '/api/internal/post-deploy') {
        const secret = env.INTERNAL_API_SECRET;
        if (!secret) {
          return jsonResponse({ error: 'post-deploy not configured (INTERNAL_API_SECRET)' }, 501);
        }
        const authHeader = request.headers.get('Authorization') || request.headers.get('X-Internal-Secret') || '';
        const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();
        if (token !== secret) {
          return jsonResponse({ error: 'Unauthorized' }, 401);
        }
        let body = {};
        try {
          const raw = await request.text();
          if (raw) body = JSON.parse(raw);
        } catch (_) {}
        try {
          const keys = await writeKnowledgePostDeploy(env, body);
          return jsonResponse({ ok: true, keys });
        } catch (e) {
          console.error('[post-deploy]', e?.message ?? e);
          return jsonResponse({ error: String(e?.message || e) }, 500);
        }
      }

      // ----- API: Deployment tracking (deployments + deployment_changes tables) -----
      if (url.pathname === '/api/deployments/log' && (request.method || 'GET').toUpperCase() === 'POST') {
        return handleDeploymentLog(request, env, ctx);
      }
      if (url.pathname === '/api/deployments/recent' && (request.method || 'GET').toUpperCase() === 'GET') {
        return handleDeploymentsRecent(request, env);
      }

      // ----- API: Internal record-deploy (one row in cloudflare_deployments) -----
      if ((request.method || 'GET').toUpperCase() === 'POST' && pathLower === '/api/internal/record-deploy') {
        const secret = env.INTERNAL_API_SECRET;
        if (!secret) {
          return jsonResponse({ error: 'record-deploy not configured (INTERNAL_API_SECRET)' }, 501);
        }
        const authHeader = request.headers.get('Authorization') || request.headers.get('X-Internal-Secret') || '';
        const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();
        if (token !== secret) {
          return jsonResponse({ error: 'Unauthorized' }, 401);
        }
        let body = {};
        try {
          const raw = await request.text();
          if (raw) body = JSON.parse(raw);
        } catch (_) {}
        const triggeredBy = (body.triggered_by || 'api_record_deploy').toString().replace(/'/g, "''");
        const notes = (body.deployment_notes || body.notes || '').toString().replace(/'/g, "''");
        const deployId = 'rec-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
        if (!env.DB) return jsonResponse({ error: 'DB unavailable' }, 503);
        try {
          env.DB.prepare(
            `INSERT INTO cloudflare_deployments (deployment_id, worker_name, project_name, deployment_type, environment, status, deployment_url, preview_url, triggered_by, deployed_at, created_at, build_time_seconds, deploy_time_seconds, deployment_notes) VALUES (?, 'inneranimalmedia', 'inneranimalmedia', 'worker', 'production', 'success', 'https://inneranimalmedia.meauxbility.workers.dev', 'https://www.inneranimalmedia.com', ?, datetime('now'), datetime('now'), 0, 0, ?)`
          ).bind(deployId, triggeredBy, notes).run();
          return jsonResponse({ ok: true, deployment_id: deployId });
        } catch (e) {
          console.error('[record-deploy]', e?.message ?? e);
          return jsonResponse({ error: String(e?.message || e) }, 500);
        }
      }

      // ----- API: OTLP telemetry ingest (traces) -----
      if ((request.method || 'GET').toUpperCase() === 'POST' && pathLower === '/api/telemetry/v1/traces') {
        if (!env.DB) return new Response(JSON.stringify({ error: 'DB not configured' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
        const contentType = (request.headers.get('Content-Type') || '').toLowerCase();
        const isJson = contentType.includes('application/json');
        if (!isJson) {
          // Cloudflare / OTLP often send protobuf or gzip; we only ingest JSON. Accept and discard to avoid log noise.
          return new Response(null, { status: 204 });
        }
        try {
          const body = await request.json();
          const resourceSpans = body?.resourceSpans ?? [];
          const inserts = [];
          for (const rs of resourceSpans) {
            const resource = rs.resource ?? {};
            const serviceAttr = (resource.attributes ?? []).find(a => a.key === 'service.name');
            const workerAttr = (resource.attributes ?? []).find(a => a.key === 'worker.name')
              ?? (resource.attributes ?? []).find(a => a.key === 'faas.name');
            const serviceName = serviceAttr?.value?.stringValue ?? null;
            const workerName = workerAttr?.value?.stringValue ?? null;
            for (const scopeSpan of (rs.scopeSpans ?? [])) {
              for (const span of (scopeSpan.spans ?? [])) {
                const attrs = span.attributes ?? [];
                const attrMap = Object.fromEntries(
                  attrs.map(a => [a.key, a.value?.stringValue ?? a.value?.intValue ?? a.value?.boolValue ?? null])
                );
                inserts.push({
                  id: crypto.randomUUID(),
                  trace_id: span.traceId ?? '',
                  span_id: span.spanId ?? '',
                  parent_span_id: span.parentSpanId ?? null,
                  operation_name: span.name ?? 'unknown',
                  service_name: serviceName,
                  worker_name: workerName ?? attrMap['worker.name'] ?? null,
                  kind: String(span.kind ?? 'INTERNAL'),
                  status_code: span.status?.code ?? 'OK',
                  status_message: span.status?.message ?? null,
                  start_time_unix_nano: Number(span.startTimeUnixNano ?? 0),
                  end_time_unix_nano: Number(span.endTimeUnixNano ?? 0),
                  attributes_json: JSON.stringify(attrMap),
                  events_json: JSON.stringify(span.events ?? []),
                  resource_json: JSON.stringify(resource),
                  binding_type: attrMap['cf.binding.type'] ?? null,
                  binding_name: attrMap['cf.binding.name'] ?? null,
                  http_method: attrMap['http.request.method'] ?? attrMap['http.method'] ?? null,
                  http_status: attrMap['http.response.status_code'] ? Number(attrMap['http.response.status_code']) : null,
                  http_url: attrMap['url.full'] ?? attrMap['http.url'] ?? null,
                  d1_query: attrMap['db.statement'] ?? null,
                  d1_rows_read: attrMap['db.cloudflare.d1.rows_read'] ? Number(attrMap['db.cloudflare.d1.rows_read']) : null,
                  d1_rows_written: attrMap['db.cloudflare.d1.rows_written'] ? Number(attrMap['db.cloudflare.d1.rows_written']) : null,
                  r2_operation: attrMap['rpc.method'] ?? null,
                  r2_bucket: attrMap['db.name'] ?? null,
                  r2_key: attrMap['db.operation.name'] ?? null,
                  do_class: attrMap['cf.do.class'] ?? null,
                  do_method: attrMap['cf.do.method'] ?? null,
                  batch_id: null,
                });
              }
            }
          }
          if (inserts.length === 0) {
            return new Response(null, { status: 204 });
          }
          const stmts = inserts.map(r =>
            env.DB.prepare(`
              INSERT OR IGNORE INTO otlp_traces (
                id, trace_id, span_id, parent_span_id, operation_name,
                service_name, worker_name, kind, status_code, status_message,
                start_time_unix_nano, end_time_unix_nano,
                attributes_json, events_json, resource_json,
                binding_type, binding_name,
                http_method, http_status, http_url,
                d1_query, d1_rows_read, d1_rows_written,
                r2_operation, r2_bucket, r2_key,
                do_class, do_method, batch_id, workspace_id
              ) VALUES (
                ?,?,?,?,?, ?,?,?,?,?, ?,?, ?,?,?, ?,?, ?,?,?, ?,?,?, ?,?,?, ?,?,?,?
              )
            `).bind(
              r.id, r.trace_id, r.span_id, r.parent_span_id, r.operation_name,
              r.service_name, r.worker_name, r.kind, r.status_code, r.status_message,
              r.start_time_unix_nano, r.end_time_unix_nano,
              r.attributes_json, r.events_json, r.resource_json,
              r.binding_type, r.binding_name,
              r.http_method, r.http_status, r.http_url,
              r.d1_query, r.d1_rows_read, r.d1_rows_written,
              r.r2_operation, r.r2_bucket, r.r2_key,
              r.do_class, r.do_method, r.batch_id, 'ws_samprimeaux'
            )
          );
          await env.DB.batch(stmts);
          console.log('[otlp] inserted spans:', inserts.length);
          return new Response(null, { status: 204 });
        } catch (err) {
          if (err instanceof SyntaxError || (err && err.message && /JSON|json|Unexpected token/.test(err.message))) {
            return new Response(null, { status: 204 });
          }
          console.error('[otlp] ingest error:', err.message);
          return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
        }
      }

      // ----- API: Browser (Puppeteer via MYBROWSER) -----
      if (pathLower.startsWith('/api/browser/')) {
        return handleBrowserRequest(request, url, env);
      }

      // ----- API: Dashboard metrics (overview) -----
      if (pathLower === '/api/overview/stats') {
        return handleOverviewStats(request, url, env);
      }
      if (pathLower === '/api/overview/recent-activity') {
        return handleRecentActivity(request, url, env);
      }
      if (pathLower === '/api/overview/checkpoints') {
        return handleOverviewCheckpoints(request, url, env);
      }
      if (pathLower === '/api/overview/activity-strip') {
        return handleOverviewActivityStrip(request, url, env);
      }
      if (pathLower === '/api/overview/deployments') {
        return handleOverviewDeployments(request, url, env);
      }

      // ----- API: Time tracking (start/heartbeat/end session) -----
      if (url.pathname === '/api/dashboard/time-track/manual' && request.method === 'POST') {
        const session = await getSession(env, request);
        if (!session) return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
        if (!env.DB) return jsonResponse({ success: false, error: 'DB unavailable' }, 503);
        return handleTimeTrackManual(request, env);
      }
      if (pathLower.startsWith('/api/dashboard/time-track')) {
        return handleTimeTrack(request, url, env);
      }

      // ----- API: Colors (finance UI) -----
      if (pathLower === '/api/colors/all') {
        return handleColorsAll(request, env);
      }

      // ----- API: Finance (summary, transactions, health, etc.) -----
      if (pathLower.startsWith('/api/finance/')) {
        return handleFinance(request, url, env);
      }

      // ----- API: Clients -----
      if (pathLower === '/api/clients') {
        return handleClients(request, url, env);
      }

      // ----- API: Projects -----
      if (pathLower === '/api/projects') {
        return handleProjects(request, url, env);
      }

      // ----- API: Mission Control Hub -----
      if (pathLower.startsWith('/api/hub/')) {
        const hubPath = pathLower.slice('/api/hub/'.length);
        const method = (request.method || 'GET').toUpperCase();
        const taskIdMatch = pathLower.match(/^\/api\/hub\/tasks\/([^/]+)$/);
        if (taskIdMatch && method === 'PATCH') return handleHubTaskUpdate(request, env, taskIdMatch[1]);
        if (hubPath === 'roadmap' || hubPath.startsWith('roadmap')) return handleHubRoadmap(request, env);
        if (hubPath === 'tasks') {
          if (method === 'POST') return handleHubTaskCreate(request, env);
          return handleHubTasks(request, env);
        }
        if (hubPath === 'stats') return handleHubStats(request, env);
        if (hubPath === 'terminal') return handleHubTerminal(request, env);
      }

      // ----- API: Billing -----
      if (pathLower === '/api/billing/summary') {
        return handleBillingSummary(request, url, env);
      }

      // ----- OAuth: Google -----
      if (pathLower === '/api/oauth/google/start') {
        return handleGoogleOAuthStart(request, url, env);
      }
      if (pathLower === '/api/oauth/google/callback') {
        return handleGoogleOAuthCallback(request, url, env);
      }
      if (pathLower === '/auth/callback/google') {
        return handleGoogleOAuthCallback(request, url, env);
      }

      // ----- OAuth: GitHub -----
      if (pathLower === '/api/oauth/github/start') {
        return handleGitHubOAuthStart(request, url, env);
      }
      if (pathLower === '/api/oauth/github/callback') {
        return handleGitHubOAuthCallback(request, url, env);
      }
      if (pathLower === '/auth/callback/github') {
        return handleGitHubOAuthCallback(request, url, env);
      }

      // ----- Auth: email/password login, backup-code login, logout -----
      if (pathLower === '/api/auth/login' && (request.method || 'GET').toUpperCase() === 'POST') {
        return handleEmailPasswordLogin(request, url, env);
      }
      if (pathLower === '/api/auth/backup-code' && (request.method || 'GET').toUpperCase() === 'POST') {
        return handleBackupCodeLogin(request, url, env);
      }
      if (pathLower === '/api/auth/logout' && (request.method || 'GET').toUpperCase() === 'POST') {
        return handleLogout(request, url, env);
      }

      // ----- API: Admin overnight (remote only -- validation + pipeline start; uses worker env only) -----
      if ((pathLower === '/api/admin/overnight/validate' || pathLower === '/api/admin/overnight/start') && (request.method || 'GET').toUpperCase() === 'POST') {
        const session = await getSession(env, request);
        if (!session) return jsonResponse({ error: 'Unauthorized' }, 401);
        const email = (session.email || session.user_id || '').toLowerCase();
        if (!SUPERADMIN_EMAILS.includes(email)) return jsonResponse({ error: 'Forbidden' }, 403);
        const baseUrl = url.origin || 'https://inneranimalmedia.com';
        if (pathLower === '/api/admin/overnight/validate') {
          ctx.waitUntil(handleOvernightValidate(env, baseUrl));
          return jsonResponse({ ok: true, message: 'Validation started. Screenshots and proof email will use worker env (remote). Check inbox shortly.' }, 202);
        }
        if (pathLower === '/api/admin/overnight/start') {
          ctx.waitUntil(handleOvernightStart(env, baseUrl));
          return jsonResponse({ ok: true, message: 'Pipeline started. Before screenshots and first email will use worker env (remote). Check inbox.' }, 202);
        }
      }

      // POST /api/admin/vectorize-kb — index ai_knowledge_base (is_indexed=0) into Vectorize; optional ai_knowledge_chunks audit.
      if (pathLower === '/api/admin/vectorize-kb' && (request.method || 'GET').toUpperCase() === 'POST') {
        const session = await getSession(env, request);
        if (!session) return jsonResponse({ error: 'Unauthorized' }, 401);
        const email = (session.email || session.user_id || '').toLowerCase();
        if (!SUPERADMIN_EMAILS.includes(email)) return jsonResponse({ error: 'Forbidden' }, 403);
        try {
          if (!env.DB || !env.VECTORIZE || !env.AI) return jsonResponse({ error: 'DB, VECTORIZE, or AI missing' }, 503);
          const rows = await env.DB.prepare(
            "SELECT id, title, content FROM ai_knowledge_base WHERE COALESCE(is_indexed,0)=0 ORDER BY id LIMIT 50"
          ).all();
          const docs = rows.results || [];
          let totalChunks = 0;
          const KB_EMBED_MODEL = '@cf/baai/bge-base-en-v1.5';
          const KB_CHUNK_CHARS = 2048;
          const KB_CHUNK_OVERLAP = 200;
          for (const doc of docs) {
            const content = (doc.content || '').trim();
            if (!content) {
              await env.DB.prepare('UPDATE ai_knowledge_base SET is_indexed=1 WHERE id=?').bind(doc.id).run().catch(() => {});
              continue;
            }
            const chunks = chunkByTokenApprox(content, KB_CHUNK_CHARS, KB_CHUNK_OVERLAP);
            const vectors = [];
            for (let i = 0; i < chunks.length; i += RAG_EMBED_BATCH_SIZE) {
              const batch = chunks.slice(i, i + RAG_EMBED_BATCH_SIZE);
              const modelResp = await env.AI.run(KB_EMBED_MODEL, { text: batch });
              const data = modelResp?.data || modelResp;
              const values = Array.isArray(data) ? data : (data && Array.isArray(data.data) ? data.data : []);
              batch.forEach((c, j) => {
                const vec = values[j];
                if (vec && Array.isArray(vec)) {
                  const chunkId = `kb-${doc.id}-${i + j}`;
                  vectors.push({ id: chunkId, values: vec, metadata: { knowledge_id: String(doc.id), chunk_index: i + j } });
                }
              });
            }
            // DISABLED: manual Vectorize upsert corrupts AutoRAG index (same index used by AI Search)
            // if (vectors.length > 0 && env.VECTORIZE.upsert) await env.VECTORIZE.upsert(vectors);
            totalChunks += vectors.length;
            await env.DB.prepare('UPDATE ai_knowledge_base SET is_indexed=1 WHERE id=?').bind(doc.id).run();
            for (let k = 0; k < chunks.length; k++) {
              const preview = chunks[k].slice(0, 200);
              const tokenCount = Math.ceil(chunks[k].length / 4);
              try {
                await env.DB.prepare(
                  'INSERT INTO ai_knowledge_chunks (id, knowledge_id, chunk_index, content_preview, token_count) VALUES (?,?,?,?,?)'
                ).bind(`kb-${doc.id}-${k}`, doc.id, k, preview, tokenCount).run();
              } catch (_) {}
            }
          }
          invalidateCompiledContextCache(env);
          return jsonResponse({ ok: true, indexed: docs.length, chunks: totalChunks });
        } catch (e) {
          return jsonResponse({ error: String(e?.message || e) }, 500);
        }
      }

      // POST /api/admin/reindex-codebase — index R2 source/ (worker.js, agent-dashboard, mcp-server, docs) into Vectorize
      if (pathLower === '/api/admin/reindex-codebase' && (request.method || 'GET').toUpperCase() === 'POST') {
        return handleReindexCodebase(request, env, ctx);
      }

      // POST /api/admin/trigger-workflow — trigger ai_workflow_pipelines, log to ai_workflow_executions
      if (pathLower === '/api/admin/trigger-workflow' && (request.method || 'GET').toUpperCase() === 'POST') {
        const internalSecret = request.headers.get('X-Internal-Secret') || request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
        const session = await getSession(env, request);
        const allowed = (env.INTERNAL_API_SECRET && internalSecret === env.INTERNAL_API_SECRET) || (session && SUPERADMIN_EMAILS.includes((session.email || session.user_id || '').toLowerCase()));
        if (!allowed) return jsonResponse({ error: 'Unauthorized' }, 401);
        if (!env.DB) return jsonResponse({ error: 'DB not available' }, 503);
        try {
          const body = await request.json().catch(() => ({}));
          const pipelineId = body.pipeline_id || null;
          let pipelines = [];
          if (pipelineId) {
            const row = await env.DB.prepare('SELECT id, tenant_id, name, stages_json FROM ai_workflow_pipelines WHERE id = ?').bind(pipelineId).first();
            if (row) pipelines = [row];
          } else {
            const r = await env.DB.prepare('SELECT id, tenant_id, name, stages_json FROM ai_workflow_pipelines ORDER BY id LIMIT 10').all();
            pipelines = r.results || [];
          }
          const executed = [];
          for (const p of pipelines) {
            const tenantId = p.tenant_id || 'system';
            const nextNum = await env.DB.prepare('SELECT COALESCE(MAX(execution_number),0)+1 as n FROM ai_workflow_executions WHERE pipeline_id = ?').bind(p.id).first().then((r) => r?.n ?? 1);
            const execId = crypto.randomUUID();
            await env.DB.prepare(
              `INSERT INTO ai_workflow_executions (id, pipeline_id, tenant_id, execution_number, status, input_variables_json, output_json, stage_results_json) VALUES (?, ?, ?, ?, 'running', '{}', '{}', '[]')`
            ).bind(execId, p.id, tenantId, nextNum).run();
            await env.DB.prepare('UPDATE ai_workflow_executions SET status = ?, output_json = ? WHERE id = ?').bind('completed', '{}', execId).run();
            executed.push({ pipeline_id: p.id, name: p.name, execution_id: execId, execution_number: nextNum });
          }
          return jsonResponse({ ok: true, triggered: executed.length, executions: executed });
        } catch (e) {
          return jsonResponse({ error: String(e?.message || e) }, 500);
        }
      }

      // ----- API: Integrations (status, gdrive, github) -- before handleAgentApi -----
      if (path === '/api/integrations/status') {
        const authUser = await getAuthUser(request, env);
        if (!authUser) return jsonResponse({ google: false, github: false, github_accounts: [] });
        const integrationUserId = authUser.email || authUser.id;
        let google = false;
        let github = false;
        const githubAccounts = [];
        try {
          const result = await env.DB.prepare(
            `SELECT provider, account_identifier FROM user_oauth_tokens WHERE user_id = ?`
          ).bind(integrationUserId).all();
          for (const r of result.results || []) {
            if (r.provider === 'google_drive') google = true;
            if (r.provider === 'github') {
              github = true;
              if (r.account_identifier) githubAccounts.push({ account_identifier: r.account_identifier });
            }
          }
        } catch (_) {}
        return jsonResponse({ google, github, github_accounts: githubAccounts });
      }
      if (path.startsWith('/api/integrations/')) {
        const method = (request.method || 'GET').toUpperCase();
        const authUser = await getAuthUser(request, env);
        if (!authUser) return jsonResponse({ error: 'unauthorized' }, 401);
        const integrationUserId = authUser.email || authUser.id;
        const githubAccount = url.searchParams.get('account') || '';
        // gdrive files
        if (method === 'GET' && path === '/api/integrations/gdrive/files') {
          const folderId = url.searchParams.get('folderId') || 'root';
          const tokenRow = await getIntegrationToken(env.DB, integrationUserId, 'google_drive', '');
          if (!tokenRow) return jsonResponse({ error: 'not_connected' }, 400);
          const driveUrl = new URL('https://www.googleapis.com/drive/v3/files');
          driveUrl.searchParams.set('q', `'${folderId}' in parents and trashed=false`);
          driveUrl.searchParams.set('fields', 'files(id,name,mimeType,size,modifiedTime)');
          driveUrl.searchParams.set('orderBy', 'name');
          const res = await fetch(driveUrl.toString(), {
            headers: { Authorization: `Bearer ${tokenRow.access_token}` }
          });
          if (res.status === 401 && tokenRow.refresh_token && env.GOOGLE_CLIENT_ID && env.GOOGLE_OAUTH_CLIENT_SECRET) {
            const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({
                client_id: env.GOOGLE_CLIENT_ID,
                client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
                refresh_token: tokenRow.refresh_token,
                grant_type: 'refresh_token'
              })
            });
            const refreshed = await refreshRes.json();
            if (refreshed.access_token) {
              await env.DB.prepare(
                `UPDATE user_oauth_tokens SET access_token = ?, expires_at = ?, updated_at = unixepoch() WHERE user_id = ? AND provider = 'google_drive' AND account_identifier = ''`
              ).bind(refreshed.access_token, Math.floor(Date.now() / 1000) + (refreshed.expires_in || 3600), integrationUserId).run();
              const retryUrl = new URL('https://www.googleapis.com/drive/v3/files');
              retryUrl.searchParams.set('q', `'${folderId}' in parents and trashed=false`);
              retryUrl.searchParams.set('fields', 'files(id,name,mimeType,size,modifiedTime)');
              retryUrl.searchParams.set('orderBy', 'name');
              const retry = await fetch(retryUrl.toString(), { headers: { Authorization: `Bearer ${refreshed.access_token}` } });
              return jsonResponse(await retry.json());
            }
          }
          return jsonResponse(await res.json());
        }
        if (method === 'GET' && path === '/api/integrations/gdrive/file') {
          const fileId = url.searchParams.get('fileId');
          const tokenRow = await getIntegrationToken(env.DB, integrationUserId, 'google_drive', '');
          if (!tokenRow) return jsonResponse({ error: 'not_connected' }, 400);
          const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, { headers: { Authorization: `Bearer ${tokenRow.access_token}` }});
          if (res.status === 401 && tokenRow.refresh_token && env.GOOGLE_CLIENT_ID && env.GOOGLE_OAUTH_CLIENT_SECRET) {
            const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({
                client_id: env.GOOGLE_CLIENT_ID,
                client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
                refresh_token: tokenRow.refresh_token,
                grant_type: 'refresh_token'
              })
            });
            const refreshed = await refreshRes.json();
            if (refreshed.access_token) {
              await env.DB.prepare(
                `UPDATE user_oauth_tokens SET access_token = ?, expires_at = ?, updated_at = unixepoch() WHERE user_id = ? AND provider = 'google_drive' AND account_identifier = ''`
              ).bind(refreshed.access_token, Math.floor(Date.now() / 1000) + (refreshed.expires_in || 3600), integrationUserId).run();
              const retry = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, { headers: { Authorization: `Bearer ${refreshed.access_token}` }});
              return jsonResponse({ content: await retry.text() });
            }
          }
          return jsonResponse({ content: await res.text() });
        }
        if (method === 'GET' && path === '/api/integrations/github/repos') {
          const tokenRow = await getIntegrationToken(env.DB, integrationUserId, 'github', githubAccount);
          if (!tokenRow) return jsonResponse({ error: 'not_connected' }, 400);
          const res = await fetch('https://api.github.com/user/repos?sort=updated&per_page=100&affiliation=owner,collaborator,organization_member', { headers: { Authorization: `Bearer ${tokenRow.access_token}`, 'User-Agent': 'IAM-Platform' }});
          return jsonResponse(await res.json());
        }
        if (method === 'GET' && path === '/api/integrations/github/files') {
          const repo = url.searchParams.get('repo');
          const filePath = url.searchParams.get('path') || '';
          const tokenRow = await getIntegrationToken(env.DB, integrationUserId, 'github', githubAccount);
          if (!tokenRow) return jsonResponse({ error: 'not_connected' }, 400);
          const res = await fetch(`https://api.github.com/repos/${repo}/contents/${filePath}`, { headers: { Authorization: `Bearer ${tokenRow.access_token}`, 'User-Agent': 'IAM-Platform' }});
          return jsonResponse(await res.json());
        }
        if (method === 'GET' && path === '/api/integrations/github/file') {
          const repo = url.searchParams.get('repo');
          const filePath = url.searchParams.get('path');
          const tokenRow = await getIntegrationToken(env.DB, integrationUserId, 'github', githubAccount);
          if (!tokenRow) return jsonResponse({ error: 'not_connected' }, 400);
          const res = await fetch(`https://api.github.com/repos/${repo}/contents/${filePath}`, { headers: { Authorization: `Bearer ${tokenRow.access_token}`, 'User-Agent': 'IAM-Platform' }});
          const data = await res.json();
          const content = atob((data.content || '').replace(/\n/g, ''));
          return jsonResponse({ content, sha: data.sha, name: data.name });
        }
        // GitHub -- raw file proxy (stream with content-type by extension)
        if (method === 'GET' && path === '/api/integrations/github/raw') {
          const repo = url.searchParams.get('repo');
          const filePath = url.searchParams.get('path');
          if (!repo || !filePath) return jsonResponse({ error: 'missing repo or path' }, 400);
          const tokenRow = await getIntegrationToken(env.DB, integrationUserId, 'github', githubAccount);
          if (!tokenRow) return jsonResponse({ error: 'not_connected' }, 400);
          const res = await fetch(`https://raw.githubusercontent.com/${encodeURIComponent(repo)}/HEAD/${filePath.split('/').map(p => encodeURIComponent(p)).join('/')}`, { headers: { Authorization: `token ${tokenRow.access_token}`, 'User-Agent': 'IAM-Platform' } });
          if (!res.ok) return jsonResponse({ error: res.statusText || 'Not found' }, res.status);
          const ext = (filePath || '').split('.').pop().toLowerCase();
          const ctMap = { html: 'text/html', htm: 'text/html', css: 'text/css', js: 'application/javascript', json: 'application/json', md: 'text/markdown', txt: 'text/plain', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', pdf: 'application/pdf', glb: 'model/gltf-binary', gltf: 'model/gltf+json' };
          const contentType = ctMap[ext] || 'application/octet-stream';
          const headers = new Headers({ 'Content-Type': contentType, 'Access-Control-Allow-Origin': '*' });
          return new Response(res.body, { status: 200, headers });
        }
        // Google Drive -- raw file proxy (stream, forward Content-Type)
        if (method === 'GET' && path === '/api/integrations/gdrive/raw') {
          const fileId = url.searchParams.get('fileId');
          if (!fileId) return jsonResponse({ error: 'missing fileId' }, 400);
          const tokenRow = await getIntegrationToken(env.DB, integrationUserId, 'google_drive', '');
          if (!tokenRow) return jsonResponse({ error: 'not_connected' }, 400);
          const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, { headers: { Authorization: `Bearer ${tokenRow.access_token}` } });
          if (!res.ok) return jsonResponse({ error: res.statusText || 'Not found' }, res.status);
          const contentType = res.headers.get('Content-Type') || 'application/octet-stream';
          const headers = new Headers({ 'Content-Type': contentType, 'Access-Control-Allow-Origin': '*' });
          return new Response(res.body, { status: 200, headers });
        }
      }

      // ----- API: Agent dashboard (/api/agent/*), terminal session (/api/terminal/*), Playwright (/api/playwright/*) -----
      if (path === '/api/git/status' && method === 'GET') {
        const authUser = await getAuthUser(request, env);
        if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
        try {
          if (!env.DB) return jsonResponse({ branch: null, staged: [], modified: [], untracked: [] });
          const ws = await env.DB.prepare(
            `SELECT state_json FROM agent_workspace_state ORDER BY updated_at DESC LIMIT 1`
          ).first().catch(() => null);
          let state = {};
          if (ws && ws.state_json) {
            try {
              state = JSON.parse(ws.state_json);
            } catch (_) {}
          }
          const repo = state.active_file_source?.repo || null;
          if (repo) {
            const integrationUserId = authUser.email || authUser.id;
            const tokenRow = await getIntegrationToken(env.DB, integrationUserId, 'github', '');
            if (tokenRow) {
              try {
                const [repoRes, commitsRes] = await Promise.all([
                  fetch(`https://api.github.com/repos/${repo}`, {
                    headers: { Authorization: `Bearer ${tokenRow.access_token}`, 'User-Agent': 'IAM-Platform' },
                  }),
                  fetch(`https://api.github.com/repos/${repo}/commits?per_page=1`, {
                    headers: { Authorization: `Bearer ${tokenRow.access_token}`, 'User-Agent': 'IAM-Platform' },
                  }),
                ]);
                const repoData = await repoRes.json().catch(() => ({}));
                const commitsRaw = await commitsRes.json().catch(() => []);
                const commitList = Array.isArray(commitsRaw) ? commitsRaw : [];
                return jsonResponse({
                  branch: repoData.default_branch || 'main',
                  repo,
                  last_commit: commitList[0]?.commit?.message || null,
                  staged: [],
                  modified: [],
                  untracked: [],
                });
              } catch (_) {
                return jsonResponse({ branch: null, staged: [], modified: [], untracked: [] });
              }
            }
          }
          return jsonResponse({ branch: null, staged: [], modified: [], untracked: [] });
        } catch (e) {
          return jsonResponse({ branch: null, staged: [], modified: [], untracked: [], error: e.message }, 200);
        }
      }

      // ----- API: Execute slash command (agent_commands) -----
      // NOTE: Must be above the /api/agent/* catch-all or handleAgentApi swallows it
      if (pathLower === '/api/agent/commands/execute' && request.method === 'POST') {
        if (!env.DB) return jsonResponse({ success: false, error: 'DB not configured' }, 503);
        try {
          const body = await request.json().catch(() => ({}));
          const commandName = (body.command_name || body.name || '').trim();
          const parameters = body.parameters || {};
          const tenantId = 'tenant_sam_primeaux';
          if (!commandName) return jsonResponse({ success: false, error: 'command_name required' }, 400);
          const command = await env.DB.prepare(
            `SELECT * FROM agent_commands WHERE tenant_id = ? AND status = 'active' AND (name = ? OR slug = ?) LIMIT 1`
          ).bind(tenantId, commandName, commandName).first();
          if (!command) {
            return jsonResponse({ success: false, error: 'Command not found' }, 404);
          }
          let result = { output: command.command_text || `Command /${commandName} registered.` };
          if (command.implementation_type === 'builtin' && command.implementation_ref) {
            const builtins = {
              clear_context: async () => ({ output: 'Context cleared' }),
              list_tools: async () => {
                const r = await env.DB.prepare('SELECT tool_name, description FROM mcp_registered_tools WHERE enabled = 1').all();
                return { output: JSON.stringify((r.results || []).map(t => ({ name: t.tool_name, description: t.description })), null, 2) };
              },
              terminal_execute: async () => {
                const cmdToRun = (parameters.raw || parameters.command || '').trim();
                if (!cmdToRun) return { output: 'Usage: /run <command>' };
                try {
                  const { output } = await runTerminalCommand(env, request, cmdToRun, body.session_id ?? null);
                  return { output: output || '(no output)' };
                } catch (e) {
                  return { output: `Error: ${e?.message ?? String(e)}` };
                }
              },
            };
            const fn = builtins[command.implementation_ref];
            if (fn) result = await fn();
          }
          return jsonResponse({ success: true, result });
        } catch (e) {
          return jsonResponse({ success: false, error: e?.message ?? String(e) }, 500);
        }
      }

      // ----- API: Agent dashboard (/api/agent/*), terminal session (/api/terminal/*), Playwright (/api/playwright/*) -----
      if (pathLower.startsWith('/api/agent') || pathLower.startsWith('/api/terminal') || pathLower.startsWith('/api/playwright') || pathLower.startsWith('/api/images') || pathLower.startsWith('/api/screenshots')) {
        return handleAgentApi(request, url, env, ctx);
      }

      // ----- API: MCP dashboard (/api/mcp/*) -----
      if (pathLower.startsWith('/api/mcp/')) {
        return handleMcpApi(request, url, env, ctx);
      }

      // ----- API: R2 DevOps (buckets, objects, sync, upload, stats, bulk-action) -----
      if (pathLower.startsWith('/api/r2/')) {
        return handleR2Api(request, url, env);
      }

      // ----- API: Workers registry (Cloud tab Workers list) -----
      if (pathLower === '/api/workers' && (request.method || 'GET').toUpperCase() === 'GET') {
        if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
        try {
          const { results } = await env.DB.prepare(
            `SELECT worker_name, script_name, worker_type, routes, deployment_status, priority, notes, last_deployment
             FROM worker_registry
             WHERE deployment_status = 'active' AND (priority IS NULL OR priority != 'archive')
             ORDER BY CASE WHEN priority = 'critical' THEN 0 WHEN priority = 'high' THEN 1 WHEN priority = 'medium' THEN 2 WHEN priority = 'low' THEN 3 ELSE 4 END, last_deployment DESC`
          ).all();
          return jsonResponse({ workers: results || [] });
        } catch (e) {
          return jsonResponse({ workers: [], error: (e && e.message) ? e.message : 'worker_registry not available' }, 200);
        }
      }

      // ----- API: Commands - Load slash commands from DB (agent_commands) -----
      if (pathLower === '/api/commands' && request.method === 'GET') {
        if (!env.DB) return jsonResponse({ success: false, error: 'DB not configured' }, 503);
        try {
          const tenantId = 'tenant_sam_primeaux'; // TODO: Get from session/auth

          const result = await env.DB.prepare(`
            SELECT
              slug,
              name,
              description,
              category,
              command_text,
              parameters_json
            FROM agent_commands
            WHERE tenant_id = ?
              AND status = 'active'
            ORDER BY category, name
          `).bind(tenantId).all();

          return new Response(JSON.stringify({
            success: true,
            commands: result.results || [],
          }), {
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          });
        } catch (error) {
          console.error('Error loading commands:', error);
          return new Response(JSON.stringify({
            success: false,
            error: error.message || 'Failed to load commands',
          }), {
            status: 500,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          });
        }
      }

      // ----- API: Themes (cms_themes for theme gallery) -----
      if (pathLower === '/api/themes' && request.method === 'GET') {
        if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
        try {
          const { results } = await env.DB.prepare(
            "SELECT id, name, slug, config FROM cms_themes ORDER BY is_system DESC, name ASC"
          ).all();
          return jsonResponse({ themes: results || [] });
        } catch (e) {
          return jsonResponse({ themes: [], error: e?.message }, 500);
        }
      }

      // ----- API: Active theme (name + is_dark for Monaco etc.) -----
      if (pathLower === '/api/themes/active' && request.method === 'GET') {
        if (!env.DB) return jsonResponse({ name: 'dark', is_dark: true });
        try {
          const cookieHeader = request.headers.get('Cookie') || '';
          let themeId = null;
          for (const part of cookieHeader.split(';')) {
            const [k, v] = part.trim().split('=');
            if (k === 'iam_theme' && v) { themeId = decodeURIComponent(v.trim()); break; }
          }
          if (!themeId) themeId = request.headers.get('X-IAM-Theme')?.trim() || null;
          if (!themeId) return jsonResponse({ name: 'dark', is_dark: true });
          const row = await env.DB.prepare("SELECT name, is_dark FROM themes WHERE name = ? LIMIT 1").bind(themeId).first();
          if (row) return jsonResponse({ name: row.name || 'dark', is_dark: row.is_dark != null ? !!row.is_dark : true });
          return jsonResponse({ name: 'dark', is_dark: true });
        } catch (e) {
          return jsonResponse({ name: 'dark', is_dark: true });
        }
      }

      // ----- API: Vault (secrets + audit; auth required) -----
      if (pathLower.startsWith('/api/vault')) {
        const vaultUser = await getAuthUser(request, env);
        if (!vaultUser) return jsonResponse({ error: 'Unauthorized' }, 401);
        return handleVaultRequest(request, env);
      }

    if (pathLower.startsWith('/api/env/')) {

      if (pathLower === '/api/env/spend' && (request.method || 'GET').toUpperCase() === 'GET') {
        const limit = parseInt(new URL(request.url).searchParams.get('limit') || '100');
        try {
          const { results } = await env.DB.prepare(
            `SELECT provider, source, model_key, amount_usd, tokens_in, tokens_out, occurred_at, project_id
             FROM spend_ledger ORDER BY occurred_at DESC LIMIT ?`
          ).bind(limit).all();
          return jsonResponse({ results: results || [] });
        } catch (e) {
          return jsonResponse({ results: [], error: e?.message });
        }
      }

      // ── Crypto helpers (Web Crypto API — works in Workers runtime) ──
      async function _vaultImportKey(b64) {
        const raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
        return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
      }
      async function _vaultEncrypt(plaintext, vaultKeyB64) {
        const key = await _vaultImportKey(vaultKeyB64);
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const cipher = await crypto.subtle.encrypt(
          { name: 'AES-GCM', iv },
          key,
          new TextEncoder().encode(plaintext)
        );
        return {
          encrypted_value: btoa(String.fromCharCode(...new Uint8Array(cipher))),
          iv: btoa(String.fromCharCode(...iv)),
        };
      }
      async function _vaultDecrypt(encB64, ivB64, vaultKeyB64) {
        const key = await _vaultImportKey(vaultKeyB64);
        const plain = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: Uint8Array.from(atob(ivB64), c => c.charCodeAt(0)) },
          key,
          Uint8Array.from(atob(encB64), c => c.charCodeAt(0))
        );
        return new TextDecoder().decode(plain);
      }
      async function _vaultAudit(db, keyName, action, note) {
        await db.prepare(
          'INSERT INTO env_audit_log (key_name, action, note) VALUES (?, ?, ?)'
        ).bind(keyName, action, note || null).run();
      }

      // ── VAULT_KEY guard ──
      if (!env.VAULT_KEY) {
        return jsonResponse({ error: 'VAULT_KEY secret not configured' }, 500);
      }

      // ── GET /api/env/secrets — list all (no values) ──
      if (pathLower === '/api/env/secrets' && (request.method || 'GET').toUpperCase() === 'GET') {
        const { results } = await env.DB.prepare(`
          SELECT id, key_name, provider, label, is_active,
                 last_rotated_at, created_at, last_tested_at, test_status,
                 rotation_reminder_days
          FROM env_secrets ORDER BY provider ASC, key_name ASC
        `).all();
        return jsonResponse({ secrets: results });
      }

      // ── GET /api/env/audit — audit log ──
      if (pathLower === '/api/env/audit' && (request.method || 'GET').toUpperCase() === 'GET') {
        const limit = parseInt(url.searchParams.get('limit') || '50');
        const keyFilter = url.searchParams.get('key_name');
        const { results } = keyFilter
          ? await env.DB.prepare(
              'SELECT * FROM env_audit_log WHERE key_name = ? ORDER BY ts DESC LIMIT ?'
            ).bind(keyFilter, limit).all()
          : await env.DB.prepare(
              'SELECT * FROM env_audit_log ORDER BY ts DESC LIMIT ?'
            ).bind(limit).all();
        return jsonResponse({ log: results });
      }

      // ── POST /api/env/secrets — create new encrypted secret ──
      if (pathLower === '/api/env/secrets' && (request.method || 'GET').toUpperCase() === 'POST') {
        const body = await request.json();
        const { key_name, value, provider, label, rotation_reminder_days } = body;
        if (!key_name || !value || !provider) {
          return jsonResponse({ error: 'key_name, value, and provider required' }, 400);
        }
        const cleanKey = key_name.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
        const existing = await env.DB.prepare(
          'SELECT id FROM env_secrets WHERE key_name = ?'
        ).bind(cleanKey).first();
        if (existing) {
          return jsonResponse({ error: `${cleanKey} already exists — use PATCH to rotate` }, 409);
        }
        const { encrypted_value, iv } = await _vaultEncrypt(value, env.VAULT_KEY);
        const now = new Date().toISOString();
        await env.DB.prepare(`
          INSERT INTO env_secrets
            (key_name, encrypted_value, iv, provider, label, last_rotated_at, rotation_reminder_days)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(cleanKey, encrypted_value, iv, provider, label || cleanKey,
          now, rotation_reminder_days || 90).run();
        await _vaultAudit(env.DB, cleanKey, 'create', `provider: ${provider}`);
        return jsonResponse({ success: true, key_name: cleanKey });
      }

      // ── POST /api/env/secrets/reveal — decrypt + return value ──
      if (pathLower === '/api/env/secrets/reveal' && (request.method || 'GET').toUpperCase() === 'POST') {
        const { key_name } = await request.json();
        if (!key_name) return jsonResponse({ error: 'key_name required' }, 400);
        const row = await env.DB.prepare(
          'SELECT encrypted_value, iv FROM env_secrets WHERE key_name = ? AND is_active = 1'
        ).bind(key_name).first();
        if (!row) return jsonResponse({ error: 'Secret not found' }, 404);
        try {
          const value = await _vaultDecrypt(row.encrypted_value, row.iv, env.VAULT_KEY);
          await _vaultAudit(env.DB, key_name, 'read', 'Revealed via Settings UI');
          return jsonResponse({ key_name, value });
        } catch {
          return jsonResponse({ error: 'Decryption failed' }, 500);
        }
      }

      // ── POST /api/env/secrets/test/:keyName — live provider test ──
      const testMatch = pathLower.match(/^\/api\/env\/secrets\/test\/([a-z0-9_]+)$/i);
      if (testMatch && (request.method || 'GET').toUpperCase() === 'POST') {
        const keyName = testMatch[1].toUpperCase();
        const row = await env.DB.prepare(
          'SELECT encrypted_value, iv, provider FROM env_secrets WHERE key_name = ? AND is_active = 1'
        ).bind(keyName).first();
        if (!row) return jsonResponse({ error: 'Secret not found' }, 404);
        let status = 'fail', message = 'No test for this provider';
        try {
          const value = await _vaultDecrypt(row.encrypted_value, row.iv, env.VAULT_KEY);
          const p = (row.provider || '').toLowerCase();
          if (p === 'anthropic') {
            const r = await fetch('https://api.anthropic.com/v1/models', {
              headers: { 'x-api-key': value, 'anthropic-version': '2023-06-01' }
            });
            status = r.ok ? 'ok' : 'fail';
            message = r.ok ? 'Anthropic connection OK' : `Anthropic rejected key (${r.status})`;
          } else if (p === 'openai') {
            const r = await fetch('https://api.openai.com/v1/models', {
              headers: { Authorization: `Bearer ${value}` }
            });
            status = r.ok ? 'ok' : 'fail';
            message = r.ok ? 'OpenAI connection OK' : `OpenAI rejected key (${r.status})`;
          } else if (p === 'google') {
            const r = await fetch(
              `https://generativelanguage.googleapis.com/v1/models?key=${value}`
            );
            status = r.ok ? 'ok' : 'fail';
            message = r.ok ? 'Google connection OK' : `Google rejected key (${r.status})`;
          } else if (p === 'cloudflare') {
            status = (typeof value === 'string' && value.length > 20) ? 'ok' : 'fail';
            message = status === 'ok' ? 'Token format valid' : 'Token too short';
          } else {
            status = 'ok'; message = 'Format check passed (no live test for this provider)';
          }
        } catch (e) {
          status = 'fail'; message = e.message;
        }
        const now = new Date().toISOString();
        await env.DB.prepare(
          'UPDATE env_secrets SET test_status = ?, last_tested_at = ? WHERE key_name = ?'
        ).bind(status, now, keyName).run();
        await _vaultAudit(env.DB, keyName, 'test', `${status}: ${message}`);
        return jsonResponse({ key_name: keyName, status, message, tested_at: now });
      }

      // ── PATCH /api/env/secrets/:keyName — rotate value ──
      const secretMatch = pathLower.match(/^\/api\/env\/secrets\/([a-z0-9_]+)$/i);
      if (secretMatch && (request.method || 'GET').toUpperCase() === 'PATCH') {
        const keyName = secretMatch[1].toUpperCase();
        const { value, note } = await request.json();
        if (!value) return jsonResponse({ error: 'value required' }, 400);
        const existing = await env.DB.prepare(
          'SELECT id FROM env_secrets WHERE key_name = ? AND is_active = 1'
        ).bind(keyName).first();
        if (!existing) return jsonResponse({ error: 'Secret not found' }, 404);
        const { encrypted_value, iv } = await _vaultEncrypt(value, env.VAULT_KEY);
        const now = new Date().toISOString();
        await env.DB.prepare(`
          UPDATE env_secrets
          SET encrypted_value = ?, iv = ?, last_rotated_at = ?,
              updated_at = ?, test_status = 'untested', last_tested_at = NULL
          WHERE key_name = ?
        `).bind(encrypted_value, iv, now, now, keyName).run();
        await _vaultAudit(env.DB, keyName, 'rotate', note || 'Rotated via Settings UI');
        return jsonResponse({ success: true, key_name: keyName, rotated_at: now });
      }

      // ── DELETE /api/env/secrets/:keyName — soft delete ──
      if (secretMatch && (request.method || 'GET').toUpperCase() === 'DELETE') {
        const keyName = secretMatch[1].toUpperCase();
        await env.DB.prepare(
          "UPDATE env_secrets SET is_active = 0, updated_at = datetime('now') WHERE key_name = ?"
        ).bind(keyName).run();
        await _vaultAudit(env.DB, keyName, 'delete', 'Deactivated via Settings UI');
        return jsonResponse({ success: true, key_name: keyName });
      }

      return jsonResponse({ error: 'Unknown /api/env route' }, 404);
    }
    // ── END /api/env/* ──────────────────────────────────────────

    // /api/d1/query — D1 SQL runner (auth required)
    if (pathLower === '/api/d1/query' && (request.method || 'GET').toUpperCase() === 'POST') {
      const authUser = await getAuthUser(request, env);
      if (!authUser) return jsonResponse({ error: 'unauthorized' }, 401);
      if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
      try {
        const { sql } = await request.json();
        if (!sql || typeof sql !== 'string') return jsonResponse({ error: 'sql required' }, 400);
        // Safety: block destructive ops without explicit confirmation
        const upperSql = sql.trim().toUpperCase();
        const dangerous = ['DROP TABLE', 'DROP DATABASE', 'TRUNCATE', 'DELETE FROM'];
        if (dangerous.some(d => upperSql.startsWith(d))) {
          return jsonResponse({ error: 'Destructive query blocked. Use wrangler d1 execute directly for this.' }, 403);
        }
        const { results, success, meta } = await env.DB.prepare(sql).all();
        return jsonResponse({ results: results || [], success, meta });
      } catch (e) {
        return jsonResponse({ error: e?.message || 'Query failed', results: [] }, 200);
      }
    }

      // ----- API: Federated search (AI + sources) -----
      if (url.pathname === '/api/search/federated' && request.method === 'POST') {
        return handleFederatedSearch(request, env);
      }

      // ----- API: Search (AI RAG + history) -----
      if (url.pathname === '/api/search') {
        const query = request.method === 'POST'
          ? (await request.json()).query
          : url.searchParams.get('q');
        if (!query) return Response.json({ error: 'query required' }, { status: 400 });
        const search = await vectorizeRagSearch(env, query, { topK: 5 });
        const data = search?.results ?? search?.data ?? [];
        const answer = data.map(r => r.content ?? r.text ?? '').filter(Boolean).join('\n\n').slice(0, 8000);
        await env.DB.prepare("INSERT INTO ai_rag_search_history (id,tenant_id,query_text,context_used,created_at) VALUES (?,?,?,?,unixepoch())")
          .bind(crypto.randomUUID(), 'tenant_sam_primeaux', query, answer || '[]').run();
        return Response.json({ answer, sources: data });
      }

      // ----- API: Settings (profile, preferences, sessions, change-password) -----
      const settingsUser = await getAuthUser(request, env);
      const settingsSessionUserId = settingsUser ? (settingsUser.email || settingsUser.id) : null;
      if (pathLower === '/api/settings/profile') {
        if ((request.method || 'GET').toUpperCase() === 'GET') {
          if (!env.DB) return jsonResponse({ profile: null });
          if (!settingsUser) return jsonResponse({ error: 'Unauthorized' }, 401);
          try {
            const row = await env.DB.prepare('SELECT * FROM user_settings WHERE user_id = ? LIMIT 1').bind(settingsSessionUserId).first();
            const authRow = await env.DB.prepare('SELECT id, email, name FROM auth_users WHERE id = ? OR LOWER(email) = LOWER(?) LIMIT 1').bind(settingsSessionUserId, settingsSessionUserId).first().catch(() => null);
            const primaryEmailFromAuth = authRow && (authRow.email || authRow.id) ? (authRow.email || authRow.id) : (settingsUser.email || settingsUser.id || '');
            const nameFromAuth = authRow && authRow.name ? authRow.name : '';
            if (!row) {
              const flat = {
                full_name: nameFromAuth,
                display_name: nameFromAuth,
                avatar_url: '',
                bio: '',
                primary_email: primaryEmailFromAuth,
                primary_email_verified: 0,
                backup_email: '',
                phone: '',
                timezone: 'America/Chicago',
                language: 'en',
              };
              return jsonResponse({ profile: null, flat });
            }
            const flat = {
              full_name: (row.full_name ?? nameFromAuth) || '',
              display_name: (row.display_name ?? nameFromAuth) || '',
              avatar_url: row.avatar_url ?? '',
              bio: row.bio ?? '',
              primary_email: (row.primary_email ?? primaryEmailFromAuth) || '',
              primary_email_verified: row.primary_email_verified ?? 0,
              backup_email: row.backup_email ?? '',
              phone: row.phone ?? '',
              timezone: row.timezone ?? 'America/Chicago',
              language: row.language ?? 'en',
            };
            return jsonResponse({ profile: row, flat });
          } catch (e) {
            return jsonResponse({ profile: null, flat: {}, error: e?.message }, 500);
          }
        }
        if ((request.method || 'GET').toUpperCase() === 'PATCH' || (request.method || 'GET').toUpperCase() === 'PUT') {
          if (!settingsUser) return jsonResponse({ error: 'Unauthorized' }, 401);
          if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
          try {
            const body = await request.json().catch(() => ({}));
            const { full_name, display_name, avatar_url, bio, backup_email, phone, timezone, language } = body;
            const uid = settingsSessionUserId;
            const result = await env.DB.prepare(
              `UPDATE user_settings SET full_name = ?, display_name = ?, avatar_url = ?, bio = ?, backup_email = ?, phone = ?, timezone = ?, language = ?, updated_at = unixepoch() WHERE user_id = ?`
            ).bind(full_name ?? null, display_name ?? null, avatar_url ?? null, bio ?? null, backup_email ?? null, phone ?? null, timezone ?? 'America/Chicago', language ?? 'en', uid).run();
            if (result.meta && result.meta.changes === 0) {
              await env.DB.prepare(
                `INSERT INTO user_settings (id, user_id, full_name, display_name, avatar_url, bio, backup_email, phone, timezone, language, theme, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'meaux-glass-blue', unixepoch())`
              ).bind('us_' + uid, uid, full_name ?? null, display_name ?? null, avatar_url ?? null, bio ?? null, backup_email ?? null, phone ?? null, timezone ?? 'America/Chicago', language ?? 'en').run();
            }
            return jsonResponse({ ok: true });
          } catch (e) {
            return jsonResponse({ error: e?.message ?? 'Update failed' }, 500);
          }
        }
      }
      if (pathLower === '/api/settings/profile/avatar' && (request.method || 'GET').toUpperCase() === 'POST') {
        if (!settingsUser) return jsonResponse({ error: 'Unauthorized' }, 401);
        if (!env.DASHBOARD) return jsonResponse({ error: 'Storage not configured' }, 503);
        try {
          const formData = await request.formData();
          const file = formData.get('file') || formData.get('avatar');
          if (!file || typeof file.arrayBuffer !== 'function') return jsonResponse({ error: 'No file' }, 400);
          const body = await file.arrayBuffer();
          const ct = (file.type || 'image/jpeg').toLowerCase();
          const ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : ct.includes('gif') ? 'gif' : 'jpg';
          const safeUser = (settingsSessionUserId || '').replace(/[^a-zA-Z0-9@._-]/g, '_').slice(0, 200) || 'user';
          const key = `avatars/${safeUser}.${ext}`;
          await env.DASHBOARD.put(key, body, { httpMetadata: { contentType: ct } });
          const avatarUrl = `${new URL(request.url).origin}/api/settings/avatar?user=${encodeURIComponent(settingsSessionUserId)}`;
          const upd = await env.DB.prepare(`UPDATE user_settings SET avatar_url = ?, updated_at = unixepoch() WHERE user_id = ?`).bind(avatarUrl, settingsSessionUserId).run();
          if (upd.meta && upd.meta.changes === 0) {
            await env.DB.prepare(
              `INSERT INTO user_settings (id, user_id, avatar_url, theme, updated_at) VALUES (?, ?, ?, 'meaux-glass-blue', unixepoch())`
            ).bind('us_' + settingsSessionUserId, settingsSessionUserId, avatarUrl).run().catch(() => {});
          }
          return jsonResponse({ ok: true, avatar_url: avatarUrl });
        } catch (e) {
          return jsonResponse({ error: e?.message ?? 'Upload failed' }, 500);
        }
      }
      if (pathLower.startsWith('/api/settings/avatar') && (request.method || 'GET').toUpperCase() === 'GET') {
        const user = url.searchParams.get('user');
        if (!user || !env.DASHBOARD) return new Response(null, { status: 404 });
        const safeUser = (user || '').replace(/[^a-zA-Z0-9@._-]/g, '_').slice(0, 200) || 'user';
        const keys = ['avatars/' + safeUser + '.jpg', 'avatars/' + safeUser + '.png', 'avatars/' + safeUser + '.webp', 'avatars/' + safeUser + '.gif'];
        let obj = null;
        let contentType = 'image/jpeg';
        for (const k of keys) {
          try {
            obj = await env.DASHBOARD.get(k);
            if (obj) {
              contentType = obj.httpMetadata?.contentType || (k.endsWith('.png') ? 'image/png' : k.endsWith('.webp') ? 'image/webp' : k.endsWith('.gif') ? 'image/gif' : 'image/jpeg');
              break;
            }
          } catch (_) {}
        }
        if (!obj || !obj.body) return new Response(null, { status: 404 });
        return new Response(obj.body, { headers: { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=3600' } });
      }
      if (pathLower === '/api/settings/preferences') {
        if ((request.method || 'GET').toUpperCase() === 'GET') {
          if (!env.DB) return jsonResponse({ preferences: {} });
          if (!settingsUser) return jsonResponse({ error: 'Unauthorized' }, 401);
          try {
            const us = await env.DB.prepare('SELECT * FROM user_settings WHERE user_id = ? LIMIT 1').bind(settingsSessionUserId).first();
            const up = await env.DB.prepare('SELECT * FROM user_preferences WHERE user_id = ? LIMIT 1').bind(settingsSessionUserId).first();
            const merged = {
              theme: us?.theme ?? 'meaux-glass-blue',
              theme_id: up?.theme_id ?? 'galaxy',
              compact_mode: us?.compact_mode ?? 0,
              font_size: us?.font_size ?? 'medium',
              high_contrast: us?.high_contrast ?? 0,
              reduced_motion: us?.reduced_motion ?? 0,
              email_notifications: us?.email_notifications ?? 1,
              notification_frequency: us?.notification_frequency ?? 'instant',
              push_notifications: us?.push_notifications ?? 0,
              marketing_emails: us?.marketing_emails ?? 0,
              security_alerts: us?.security_alerts ?? 1,
              sidebar_collapsed: up?.sidebar_collapsed ?? us?.sidebar_collapsed ?? 0,
              notifications_enabled: up?.notifications_enabled ?? 1,
            };
            return jsonResponse({ preferences: merged, user_settings: us || null, user_preferences: up || null });
          } catch (e) {
            return jsonResponse({ preferences: {}, error: e?.message }, 500);
          }
        }
        if ((request.method || 'GET').toUpperCase() === 'PATCH' || (request.method || 'GET').toUpperCase() === 'PUT') {
          if (!settingsUser) return jsonResponse({ error: 'Unauthorized' }, 401);
          if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
          try {
            const body = await request.json().catch(() => ({}));
            const uid = settingsSessionUserId;
            const { theme, theme_id, compact_mode, font_size, high_contrast, reduced_motion, email_notifications, notification_frequency, push_notifications, marketing_emails, security_alerts, sidebar_collapsed } = body;
            await env.DB.prepare(
              `UPDATE user_settings SET theme = COALESCE(?, theme), compact_mode = ?, font_size = COALESCE(?, font_size), high_contrast = ?, reduced_motion = ?, email_notifications = ?, notification_frequency = COALESCE(?, notification_frequency), push_notifications = ?, marketing_emails = ?, security_alerts = ?, updated_at = unixepoch() WHERE user_id = ?`
            ).bind(theme ?? null, compact_mode != null ? (compact_mode ? 1 : 0) : null, font_size ?? null, high_contrast != null ? (high_contrast ? 1 : 0) : null, reduced_motion != null ? (reduced_motion ? 1 : 0) : null, email_notifications != null ? (email_notifications ? 1 : 0) : null, notification_frequency ?? null, push_notifications != null ? (push_notifications ? 1 : 0) : null, marketing_emails != null ? (marketing_emails ? 1 : 0) : null, security_alerts != null ? (security_alerts ? 1 : 0) : null, uid).run();
            const upResult = await env.DB.prepare(
              `UPDATE user_preferences SET theme_id = COALESCE(?, theme_id), sidebar_collapsed = COALESCE(?, sidebar_collapsed), notifications_enabled = COALESCE(?, notifications_enabled), updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`
            ).bind(theme_id ?? null, sidebar_collapsed != null ? (sidebar_collapsed ? 1 : 0) : null, email_notifications != null ? (email_notifications ? 1 : 0) : null, uid).run();
            if (upResult.meta && upResult.meta.changes === 0) {
              await env.DB.prepare(
                `INSERT INTO user_preferences (user_id, theme_id, sidebar_collapsed, notifications_enabled, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`
              ).bind(uid, theme_id ?? 'galaxy', sidebar_collapsed ? 1 : 0, 1).run().catch(() => {});
            }
            return jsonResponse({ ok: true });
          } catch (e) {
            return jsonResponse({ error: e?.message ?? 'Update failed' }, 500);
          }
        }
      }
      if (pathLower === '/api/settings/security/change-password' && (request.method || 'GET').toUpperCase() === 'POST') {
        if (!settingsUser) return jsonResponse({ error: 'Unauthorized' }, 401);
        if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
        try {
          const body = await request.json().catch(() => ({}));
          const { current_password, new_password } = body;
          if (!current_password || !new_password) return jsonResponse({ error: 'current_password and new_password required' }, 400);
          const userRow = await env.DB.prepare('SELECT id, password_hash, salt FROM auth_users WHERE id = ?').bind(settingsSessionUserId).first();
          if (!userRow || !userRow.password_hash || !userRow.salt) return jsonResponse({ error: 'Account uses OAuth; no password to change' }, 400);
          if (userRow.password_hash === 'oauth' || userRow.salt === 'oauth') return jsonResponse({ error: 'Account uses OAuth; no password to change' }, 400);
          const valid = await verifyPassword(current_password, userRow.salt, userRow.password_hash);
          if (!valid) return jsonResponse({ error: 'Current password is incorrect' }, 400);
          const { saltHex, hashHex } = await hashPassword(new_password);
          await env.DB.prepare('UPDATE auth_users SET password_hash = ?, salt = ?, updated_at = datetime(\'now\') WHERE id = ?').bind(hashHex, saltHex, settingsSessionUserId).run();
          return jsonResponse({ ok: true });
        } catch (e) {
          return jsonResponse({ error: e?.message ?? 'Change failed' }, 500);
        }
      }
      if (pathLower === '/api/settings/security/backup-codes/generate' && (request.method || 'GET').toUpperCase() === 'POST') {
        if (!settingsUser) return jsonResponse({ error: 'Unauthorized' }, 401);
        if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
        if (!env.RESEND_API_KEY) return jsonResponse({ error: 'Email not configured' }, 503);
        try {
          const userId = settingsSessionUserId;
          const toEmail = userId.includes('@') ? userId : null;
          if (!toEmail) return jsonResponse({ error: 'Backup codes are sent to your login email; no email on file' }, 400);
          const BACKUP_CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
          const CODE_LEN = 8;
          const NUM_CODES = 10;
          async function sha256Hex(str) {
            const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
            return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
          }
          function randomCode() {
            let s = '';
            const arr = new Uint8Array(CODE_LEN);
            crypto.getRandomValues(arr);
            for (let i = 0; i < CODE_LEN; i++) s += BACKUP_CODE_CHARS[arr[i] % BACKUP_CODE_CHARS.length];
            return s;
          }
          await env.DB.prepare('DELETE FROM user_backup_codes WHERE user_id = ? AND used_at IS NULL').bind(userId).run();
          const plainCodes = [];
          for (let i = 0; i < NUM_CODES; i++) {
            const code = randomCode();
            plainCodes.push(code);
            const codeHash = await sha256Hex(code);
            const id = 'bc_' + crypto.randomUUID().replace(/-/g, '').slice(0, 14);
            await env.DB.prepare(
              'INSERT INTO user_backup_codes (id, user_id, code_hash, used_at, created_at) VALUES (?, ?, ?, NULL, unixepoch())'
            ).bind(id, userId, codeHash).run();
          }
          const codeList = plainCodes.map((c, i) => `${i + 1}. ${c}`).join('\n');
          const html = `<p>Your backup codes for Inner Animal Media are below. Each code can be used once to sign in if you lose access to your primary method.</p><pre style="font-family:monospace;background:#f1f5f9;padding:12px;border-radius:6px">${codeList}</pre><p>Store these somewhere safe. Do not share them.</p>`;
          const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from: 'Inner Animal Media <sam@inneranimalmedia.com>',
              to: [toEmail],
              subject: 'Your backup codes - Inner Animal Media',
              html,
            }),
          });
          if (!res.ok) {
            const err = await res.text();
            return jsonResponse({ error: 'Failed to send email: ' + (err || res.status) }, 502);
          }
          return jsonResponse({ ok: true, message: 'Backup codes sent to your email' });
        } catch (e) {
          return jsonResponse({ error: e?.message ?? 'Generate failed' }, 500);
        }
      }
      if (pathLower === '/api/settings/sessions' && (request.method || 'GET').toUpperCase() === 'GET') {
        if (!settingsUser) return jsonResponse({ error: 'Unauthorized' }, 401);
        if (!env.DB) return jsonResponse({ sessions: [] });
        try {
          const rows = await env.DB.prepare(
            'SELECT id, user_id, expires_at, created_at, ip_address, user_agent FROM auth_sessions WHERE user_id = ? ORDER BY created_at DESC'
          ).bind(settingsSessionUserId).all();
          return jsonResponse({ sessions: rows.results ?? [] });
        } catch (e) {
          return jsonResponse({ sessions: [], error: e?.message }, 500);
        }
      }
      if (pathLower.match(/^\/api\/settings\/sessions\/all$/) && (request.method || 'GET').toUpperCase() === 'DELETE') {
        if (!settingsUser) return jsonResponse({ error: 'Unauthorized' }, 401);
        if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
        try {
          const cookie = request.headers.get('Cookie') || '';
          const m = cookie.match(/session=([^\s;]+)/);
          const currentSessionId = m?.[1] || '';
          if (currentSessionId) {
            await env.DB.prepare('DELETE FROM auth_sessions WHERE user_id = ? AND id != ?').bind(settingsSessionUserId, currentSessionId).run();
          } else {
            await env.DB.prepare('DELETE FROM auth_sessions WHERE user_id = ?').bind(settingsSessionUserId).run();
          }
          return jsonResponse({ ok: true });
        } catch (e) {
          return jsonResponse({ error: e?.message }, 500);
        }
      }
      const sessionsIdMatch = pathLower.match(/^\/api\/settings\/sessions\/([^/]+)$/);
      if (sessionsIdMatch && (request.method || 'GET').toUpperCase() === 'DELETE') {
        const sessionId = sessionsIdMatch[1];
        if (!sessionId || sessionId === 'all') { /* handled above */ } else {
          if (!settingsUser) return jsonResponse({ error: 'Unauthorized' }, 401);
          if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
          try {
            await env.DB.prepare('DELETE FROM auth_sessions WHERE id = ? AND user_id = ?').bind(sessionId, settingsSessionUserId).run();
            return jsonResponse({ ok: true });
          } catch (e) {
            return jsonResponse({ error: e?.message }, 500);
          }
        }
      }
      if ((request.method || 'GET').toUpperCase() === 'GET' && pathLower === '/api/settings/emails') {
        if (!settingsUser) return jsonResponse({ error: 'Unauthorized' }, 401);
        const loginEmail = settingsUser.email || settingsUser.id || '';
        const emails = loginEmail ? [{ id: 'primary', email: loginEmail, verified: true, is_primary: true }] : [];
        return jsonResponse({ emails });
      }
      const CORE_WORKSPACE_IDS = ['ws_samprimeaux', 'ws_inneranimal', 'ws_meauxbility', 'ws_innerautodidact'];
      const CORE_WORKSPACES_DATA = [
        { id: 'ws_samprimeaux', name: 'Sam Primeaux', category: 'entity' },
        { id: 'ws_inneranimal', name: 'InnerAnimal', category: 'entity' },
        { id: 'ws_meauxbility', name: 'Meauxbility', category: 'entity' },
        { id: 'ws_innerautodidact', name: 'InnerAutodidact', category: 'entity' },
      ];
      if (pathLower === '/api/settings/workspaces') {
        const method = (request.method || 'GET').toUpperCase();
        if (!settingsUser) return jsonResponse({ error: 'Unauthorized' }, 401);
        if (method === 'GET') {
          if (!env.DB) {
            return jsonResponse({ data: CORE_WORKSPACES_DATA, current: 'ws_samprimeaux', workspaceThemes: {}, workspaces: {} });
          }
          try {
            let rowsResult = null;
            let usRow = null;
            try {
              const [rows, us] = await Promise.all([
                env.DB.prepare(
                  'SELECT workspace_id, brand, plans, budget, time, theme FROM user_workspace_settings WHERE user_id = ?'
                ).bind(settingsSessionUserId).all(),
                env.DB.prepare('SELECT default_workspace_id FROM user_settings WHERE user_id = ? LIMIT 1').bind(settingsSessionUserId).first(),
              ]);
              rowsResult = rows;
              usRow = us;
            } catch (colErr) {
              const msg = String(colErr?.message || '');
              if (msg.includes('theme') || msg.includes('default_workspace_id')) {
                rowsResult = await env.DB.prepare('SELECT workspace_id, brand, plans, budget, time FROM user_workspace_settings WHERE user_id = ?').bind(settingsSessionUserId).all();
                try { usRow = await env.DB.prepare('SELECT default_workspace_id FROM user_settings WHERE user_id = ? LIMIT 1').bind(settingsSessionUserId).first(); } catch (_) { usRow = null; }
              } else throw colErr;
            }
            const workspaces = {};
            const workspaceThemes = {};
            for (const r of (rowsResult?.results || [])) {
              workspaces[r.workspace_id] = {
                brand: r.brand ?? '',
                plans: r.plans ?? '',
                budget: r.budget ?? '',
                time: r.time ?? '',
              };
              if (r.theme != null && r.theme.trim()) workspaceThemes[r.workspace_id] = r.theme.trim();
            }
            const current = (usRow?.default_workspace_id && CORE_WORKSPACE_IDS.includes(usRow.default_workspace_id))
              ? usRow.default_workspace_id : 'ws_samprimeaux';
            return jsonResponse({ data: CORE_WORKSPACES_DATA, current, workspaceThemes, workspaces });
          } catch (e) {
            return jsonResponse({ data: CORE_WORKSPACES_DATA, current: 'ws_samprimeaux', workspaceThemes: {}, workspaces: {}, error: e?.message }, 500);
          }
        }
        if (method === 'PATCH' || method === 'PUT') {
          if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
          try {
            const body = await request.json().catch(() => ({}));
            const { workspace_id, brand, plans, budget, time } = body;
            if (!workspace_id || !CORE_WORKSPACE_IDS.includes(workspace_id)) return jsonResponse({ error: 'Invalid workspace_id' }, 400);
            await env.DB.prepare(
              `INSERT INTO user_workspace_settings (user_id, workspace_id, brand, plans, budget, time, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, unixepoch())
               ON CONFLICT(user_id, workspace_id) DO UPDATE SET
                 brand = excluded.brand, plans = excluded.plans, budget = excluded.budget, time = excluded.time, updated_at = unixepoch()`
            ).bind(settingsSessionUserId, workspace_id, brand ?? '', plans ?? '', budget ?? '', time ?? '').run();
            return jsonResponse({ ok: true });
          } catch (e) {
            return jsonResponse({ error: e?.message ?? 'Save failed' }, 500);
          }
        }
      }
      if (pathLower === '/api/settings/workspace/default' && (request.method === 'PUT' || request.method === 'PATCH')) {
        if (!settingsUser) return jsonResponse({ error: 'Unauthorized' }, 401);
        if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
        try {
          const body = await request.json().catch(() => ({}));
          const workspace_id = body.workspace_id;
          if (!workspace_id || !CORE_WORKSPACE_IDS.includes(workspace_id)) return jsonResponse({ error: 'Invalid workspace_id' }, 400);
          await env.DB.prepare(
            `UPDATE user_settings SET default_workspace_id = ?, updated_at = unixepoch() WHERE user_id = ?`
          ).bind(workspace_id, settingsSessionUserId).run();
          return jsonResponse({ ok: true, current: workspace_id });
        } catch (e) {
          return jsonResponse({ error: e?.message ?? 'Update failed' }, 500);
        }
      }
      const wsThemeMatch = pathLower.match(/^\/api\/settings\/workspace\/([^/]+)\/theme$/);
      if (wsThemeMatch && (request.method === 'PUT' || request.method === 'PATCH')) {
        const workspaceId = wsThemeMatch[1];
        if (!settingsUser) return jsonResponse({ error: 'Unauthorized' }, 401);
        if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
        if (!CORE_WORKSPACE_IDS.includes(workspaceId)) return jsonResponse({ error: 'Invalid workspace_id' }, 400);
        try {
          const body = await request.json().catch(() => ({}));
          const theme = body.theme != null ? String(body.theme).trim() : null;
          await env.DB.prepare(
            `INSERT INTO user_workspace_settings (user_id, workspace_id, brand, plans, budget, time, theme, updated_at)
             VALUES (?, ?, '', '', '', '', ?, unixepoch())
             ON CONFLICT(user_id, workspace_id) DO UPDATE SET theme = excluded.theme, updated_at = unixepoch()`
          ).bind(settingsSessionUserId, workspaceId, theme || null).run();
          return jsonResponse({ ok: true });
        } catch (e) {
          return jsonResponse({ error: e?.message ?? 'Save failed' }, 500);
        }
      }

      // ----- API: Settings theme (GET/PATCH, auth required for PATCH) -----
      if (url.pathname === '/api/settings/theme') {
        const user = await getAuthUser(request, env);
        if (request.method === 'GET') {
          // Allow unauthenticated GET so agent/dashboard can apply default theme without 401 (theme testing, pre-login paint)
          if (!user) {
            const defaultSlug = normalizeThemeSlug('meaux-storm-gray') || 'meaux-storm-gray';
            try {
              const themeRow = await env.DB.prepare("SELECT name, config FROM cms_themes WHERE slug = ? LIMIT 1").bind(defaultSlug).first();
              const cfg = (themeRow?.config && typeof themeRow.config === 'string') ? (() => { try { return JSON.parse(themeRow.config); } catch (_) { return {}; } })() : (typeof themeRow?.config === 'object' && themeRow.config !== null ? themeRow.config : {});
              const variables = {};
              if (cfg.bg != null) variables['--bg-canvas'] = cfg.bg;
              if (cfg.surface != null) variables['--bg-elevated'] = cfg.surface;
              if (cfg.nav != null) variables['--bg-nav'] = cfg.nav; else if (cfg.bg != null) variables['--bg-nav'] = cfg.bg;
              if (cfg.bg != null) { variables['--bg-overlay'] = cfg.bg; variables['--bg-primary'] = cfg.bg; }
              if (cfg.surface != null) variables['--bg-secondary'] = cfg.surface;
              if (cfg.text != null) { variables['--text-primary'] = cfg.text; variables['--text-nav'] = cfg.text; }
              if (cfg.textSecondary != null) { variables['--text-secondary'] = cfg.textSecondary; variables['--text-nav-muted'] = cfg.textSecondary; variables['--text-muted'] = cfg.textSecondary; variables['--color-text'] = cfg.text; }
              if (cfg.border != null) { variables['--border'] = cfg.border; variables['--border-nav'] = cfg.border; variables['--color-border'] = cfg.border; }
              if (cfg.primary != null) { variables['--accent'] = cfg.primary; variables['--accent-primary'] = cfg.primary; variables['--color-primary'] = cfg.primary; }
              if (cfg.primaryHover != null) { variables['--accent-hover'] = cfg.primaryHover; variables['--accent-secondary'] = cfg.primaryHover; }
              if (cfg.radius != null) variables['--border-radius'] = cfg.radius;
              if (cfg.fontFamily != null) variables['--font-family'] = cfg.fontFamily;
              variables['--transition'] = typeof cfg.transition === 'string' ? cfg.transition : 'all 0.2s ease';
              return Response.json({ theme: defaultSlug, name: themeRow?.name || defaultSlug, variables });
            } catch (_) {
              return Response.json({ theme: defaultSlug, name: defaultSlug, variables: {} });
            }
          }
          const cacheKey = 'theme:' + (user.id || '');
          if (env.SESSION_CACHE && cacheKey) {
            try {
              const cached = await env.SESSION_CACHE.get(cacheKey);
              if (cached) {
                const parsed = JSON.parse(cached);
                return Response.json(parsed);
              }
            } catch (_) {}
          }
          try {
            const row = await env.DB.prepare("SELECT theme FROM user_settings WHERE user_id = ? LIMIT 1").bind(user.id).first();
            let slug = row?.theme ? normalizeThemeSlug(row.theme) : null;
            if (!slug) slug = 'meaux-storm-gray';
            const themeRow = await env.DB.prepare("SELECT name, config FROM cms_themes WHERE slug = ? LIMIT 1").bind(slug).first();
            const cfg = (themeRow?.config && typeof themeRow.config === 'string') ? (() => { try { return JSON.parse(themeRow.config); } catch (_) { return {}; } })() : (typeof themeRow?.config === 'object' && themeRow.config !== null ? themeRow.config : {});
            const variables = {};
            if (cfg.bg != null) variables['--bg-canvas'] = cfg.bg;
            if (cfg.surface != null) variables['--bg-elevated'] = cfg.surface;
            if (cfg.nav != null) variables['--bg-nav'] = cfg.nav; else if (cfg.bg != null) variables['--bg-nav'] = cfg.bg;
            if (cfg.bg != null) variables['--bg-overlay'] = cfg.bg;
            if (cfg.bg != null) variables['--bg-primary'] = cfg.bg;
            if (cfg.surface != null) variables['--bg-secondary'] = cfg.surface;
            if (cfg.text != null) variables['--text-primary'] = cfg.text;
            if (cfg.textSecondary != null) { variables['--text-secondary'] = cfg.textSecondary; variables['--text-nav-muted'] = cfg.textSecondary; variables['--text-muted'] = cfg.textSecondary; variables['--color-text'] = cfg.text; }
            if (cfg.text != null) variables['--text-nav'] = cfg.text;
            if (cfg.border != null) { variables['--border'] = cfg.border; variables['--border-nav'] = cfg.border; variables['--color-border'] = cfg.border; }
            if (cfg.primary != null) { variables['--accent'] = cfg.primary; variables['--accent-primary'] = cfg.primary; variables['--color-primary'] = cfg.primary; }
            if (cfg.primaryHover != null) { variables['--accent-hover'] = cfg.primaryHover; variables['--accent-secondary'] = cfg.primaryHover; }
            if (cfg.radius != null) variables['--border-radius'] = cfg.radius;
            if (cfg.fontFamily != null) variables['--font-family'] = cfg.fontFamily;
            variables['--transition'] = typeof cfg.transition === 'string' ? cfg.transition : 'all 0.2s ease';
            const payload = {
              theme: slug,
              name: themeRow?.name || slug,
              variables
            };
            if (env.SESSION_CACHE && cacheKey) {
              env.SESSION_CACHE.put(cacheKey, JSON.stringify(payload), { expirationTtl: 3600 }).catch(() => {});
            }
            return Response.json(payload);
          } catch (e) {
            return Response.json({ theme: 'meaux-glass-blue', name: 'meaux-glass-blue', variables: {} });
          }
        }
        if (request.method === 'PATCH') {
          if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });
          const body = await request.json().catch(() => ({}));
          const theme = body.theme;
          const normalizedTheme = normalizeThemeSlug(theme);
          if (!normalizedTheme) return Response.json({ ok: false, error: 'Invalid theme' }, { status: 400 });
          const upsert = await env.DB.prepare(
            "INSERT INTO user_settings (user_id, theme, updated_at) VALUES (?, ?, unixepoch()) ON CONFLICT(user_id) DO UPDATE SET theme = excluded.theme, updated_at = unixepoch()"
          ).bind(user.id, normalizedTheme).run().catch(() => null);
          if (!upsert) {
            await env.DB.prepare("UPDATE user_settings SET theme = ?, updated_at = unixepoch() WHERE user_id = ?").bind(normalizedTheme, user.id).run();
          }
          const cacheKey = 'theme:' + (user.id || '');
          if (env.SESSION_CACHE && cacheKey) {
            env.SESSION_CACHE.delete(cacheKey).catch(() => {});
          }
          return Response.json({ success: true });
        }
        return Response.json({ error: 'method not allowed' }, { status: 405 });
      }

      // ----- Public (ASSETS) -----
      if (path === '/' || path === '/index.html') {
        const obj = await env.ASSETS.get('index-v3.html') ?? await env.ASSETS.get('index-v2.html') ?? await env.ASSETS.get('index.html');
        if (obj) return respondWithR2Object(obj, 'text/html');
        return notFound(path);
      }

      // Public page routing - map clean URLs to actual R2 files
      const PUBLIC_ROUTES = {
        '/work': 'process.html',
        '/about': 'about.html',
        '/services': 'pricing.html',
        '/contact': 'contact.html',
        '/terms': 'terms-of-service.html',
        '/privacy': 'privacy-policy.html',
        '/learn': 'learn.html',
        '/games': 'games.html'
      };

      if (PUBLIC_ROUTES[path]) {
        const obj = await env.ASSETS.get(PUBLIC_ROUTES[path]);
        if (obj) return respondWithR2Object(obj, 'text/html');
        return notFound(path);
      }

      // Auth sign-in / login / signup (DASHBOARD) -- same page for all
      if (pathLower === '/auth/signin' || pathLower === '/auth/login' || pathLower === '/auth/signup') {
        const obj = await env.DASHBOARD.get('static/auth-signin.html');
        if (obj) return respondWithR2Object(obj, 'text/html');
        return notFound(path);
      }

      // Dashboard base -> redirect to overview
      if (pathLower === '/dashboard' || pathLower === '/dashboard/') {
        return Response.redirect(url.origin + '/dashboard/overview', 302);
      }

      // Dashboard page fragments: /dashboard/pages/<name>.html -> static/dashboard/pages/<name>.html (for shell #page-content injection)
      const dashboardPagesMatch = pathLower.match(/^\/dashboard\/pages\/([^/]+\.html)$/);
      if (dashboardPagesMatch && env.DASHBOARD) {
        const pageName = dashboardPagesMatch[1];
        const fragmentKey = `static/dashboard/pages/${pageName}`;
        const obj = await env.DASHBOARD.get(fragmentKey);
        if (obj) return respondWithR2Object(obj, 'text/html', { noCache: true });
      }

      // Dashboard pages (DASHBOARD bucket) -- serve HTML from R2 only; no in-worker HTML rewrite
      if (pathLower.startsWith('/dashboard/')) {
        const segment = pathLower.slice('/dashboard/'.length).split('/')[0] || 'overview';
        const key = `static/dashboard/${segment}.html`;
        const altKey = `dashboard/${segment}.html`;
        const obj = await env.DASHBOARD.get(key) ?? await env.DASHBOARD.get(altKey);
        if (obj) return respondWithR2Object(obj, 'text/html', { noCache: true });
        return notFound(path);
      }

      // Static assets: try ASSETS then DASHBOARD by path (key = path without leading slash)
      const assetKey = path.slice(1) || 'index.html';
      let obj = await env.ASSETS.get(assetKey);
      if (!obj && env.DASHBOARD) obj = await env.DASHBOARD.get(assetKey);
      // GLB viewer: explicit R2 key for 3D model viewer page
      if (!obj && pathLower === '/static/dashboard/glb-viewer.html' && env.DASHBOARD) {
        obj = await env.DASHBOARD.get('static/dashboard/glb-viewer.html');
        if (obj) return respondWithR2Object(obj, 'text/html', { noCache: true });
      }
      // Dashboard static: if path is /static/dashboard/foo.js and not found, try dashboard/foo.js
      if (!obj && pathLower.startsWith('/static/dashboard/') && env.DASHBOARD) {
        const staticSegment = pathLower.slice('/static/dashboard/'.length).split('/')[0];
        if (staticSegment) obj = await env.DASHBOARD.get(`dashboard/${staticSegment}`);
        // Finance, Billing, Clients: script may be requested lowercase; R2 keys are capitalized .jsx (same dir: agent-sam static/dashboard/)
        if (!obj && staticSegment === 'finance.jsx') obj = await env.DASHBOARD.get('static/dashboard/Finance.jsx');
        if (!obj && staticSegment === 'billing.jsx') obj = await env.DASHBOARD.get('static/dashboard/Billing.jsx');
        if (!obj && staticSegment === 'clients.jsx') obj = await env.DASHBOARD.get('static/dashboard/Clients.jsx');
        // Exact capitalized names (e.g. from same-origin script src)
        if (!obj && staticSegment === 'Finance.jsx') obj = await env.DASHBOARD.get('static/dashboard/Finance.jsx');
        if (!obj && staticSegment === 'Billing.jsx') obj = await env.DASHBOARD.get('static/dashboard/Billing.jsx');
        if (!obj && staticSegment === 'Clients.jsx') obj = await env.DASHBOARD.get('static/dashboard/Clients.jsx');
      }
      if (obj) {
        const noCache = pathLower.startsWith('/static/dashboard/agent/') || pathLower.startsWith('/dashboard/') || url.searchParams.has('v');
        return respondWithR2Object(obj, contentType(assetKey), noCache ? { noCache: true } : {});
      }

      return notFound(path);
    } catch (err) {
      return new Response(JSON.stringify({ error: 'Worker error', message: String(err.message) }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  },
  async queue(batch, env, ctx) {
    for (const msg of batch.messages) {
      try {
        const body = msg.body && typeof msg.body === 'object' ? msg.body : (typeof msg.body === 'string' ? JSON.parse(msg.body || '{}') : {});
        const { jobId, job_type, url } = body;
        if (jobId && env.MYBROWSER && env.DASHBOARD && env.DB) {
          const { launch } = await import('@cloudflare/playwright');
          const browser = await launch(env.MYBROWSER);
          try {
            const page = await browser.newPage();
            await page.setViewportSize({ width: 1280, height: 800 });
            await page.goto(url || 'https://example.com', { waitUntil: 'networkidle', timeout: 30000 });
            let resultUrl = null;
            if (job_type === 'screenshot') {
              const buf = await page.screenshot({ type: 'png', fullPage: true });
              const key = `screenshots/${jobId}.png`;
              await env.DASHBOARD.put(key, buf, { httpMetadata: { contentType: 'image/png' } });
              resultUrl = `https://pub-b845a8f899834f0faf95dc83eda3c505.r2.dev/${key}`;
            } else if (job_type === 'render') {
              const html = await page.content();
              const key = `renders/${jobId}.html`;
              await env.DASHBOARD.put(key, html, { httpMetadata: { contentType: 'text/html' } });
              resultUrl = `https://pub-b845a8f899834f0faf95dc83eda3c505.r2.dev/${key}`;
            }
            await env.DB.prepare(
              "UPDATE playwright_jobs SET status='completed', result_url=?, completed_at=CURRENT_TIMESTAMP WHERE id=?"
            ).bind(resultUrl, jobId).run();
          } catch (err) {
            await env.DB.prepare(
              "UPDATE playwright_jobs SET status='failed', error=? WHERE id=?"
            ).bind(String(err?.message || err), jobId).run();
          } finally {
            await browser.close();
          }
        }
      } catch (_) {}
      msg.ack();
    }
  },
};

function respondWithR2Object(obj, contentType, options = {}) {
  const headers = new Headers();
  headers.set('Content-Type', contentType || 'application/octet-stream');
  const etag = obj.etag;
  if (etag) headers.set('ETag', etag);
  // Dashboard HTML: avoid stale cache so UI updates deploy without hard refresh
  if (options.noCache) {
    headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    headers.set('Pragma', 'no-cache');
  }
  return new Response(obj.body, { status: 200, headers });
}

function contentType(path) {
  if (path.endsWith('.html')) return 'text/html; charset=utf-8';
  if (path.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (path.endsWith('.css')) return 'text/css; charset=utf-8';
  if (path.endsWith('.json')) return 'application/json';
  if (path.endsWith('.ico')) return 'image/x-icon';
  if (path.endsWith('.png')) return 'image/png';
  if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg';
  if (path.endsWith('.svg')) return 'image/svg+xml';
  if (path.endsWith('.woff2')) return 'font/woff2';
  if (path.endsWith('.woff')) return 'font/woff';
  return 'application/octet-stream';
}

function notFound(path) {
  return new Response(JSON.stringify({ error: 'Not found', path }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Playwright (Cloudflare Browser Rendering): health + metrics + GET screenshot. Only runs when env.MYBROWSER is set. */
async function handleBrowserRequest(request, url, env) {
  if (!env.MYBROWSER) {
    return new Response(JSON.stringify({
      ok: false,
      error: 'MYBROWSER binding not configured',
      hint: 'Add Browser rendering binding in Cloudflare dashboard and wrangler.production.toml',
    }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  }
  const pathLower = url.pathname.replace(/\/$/, '').toLowerCase();
  const method = (request.method || 'GET').toUpperCase();

  if (pathLower === '/api/browser/screenshot' && method === 'GET') {
    const targetUrl = url.searchParams.get('url');
    const forceRefresh = url.searchParams.get('refresh') === 'true';
    if (!targetUrl) return new Response('url required', { status: 400 });
    const cacheKey = 'screenshots/' + btoa(targetUrl).replace(/[^a-z0-9]/gi, '').slice(0, 64);
    const kv = env.KV || env['agent-sam'];
    if (!forceRefresh && kv) {
      try {
        const cached = await kv.get(cacheKey, { type: 'arrayBuffer' });
        if (cached) {
          return new Response(cached, {
            headers: { 'Content-Type': 'image/jpeg', 'X-Cache': 'HIT', 'Cache-Control': 'public, max-age=86400' },
          });
        }
      } catch (_) {}
    }
    try {
      if (!playwrightLaunch) {
        const pw = await import("@cloudflare/playwright");
        playwrightLaunch = pw.launch;
      }
      const browser = await playwrightLaunch(env.MYBROWSER);
      const page = await browser.newPage();
      await page.setViewportSize({ width: 1280, height: 800 });
      try {
        await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 15000 });
      } catch {
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
      }
      const img = await page.screenshot({ type: 'jpeg', quality: 80 });
      await browser.close();
      if (kv && img) {
        kv.put(cacheKey, img, { httpMetadata: { contentType: 'image/jpeg' } }).catch(() => {});
      }
      return new Response(img, {
        headers: { 'Content-Type': 'image/jpeg', 'X-Cache': 'MISS', 'Cache-Control': 'public, max-age=86400' },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: String(err?.message || err) }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  const targetUrl = url.searchParams.get('url') || 'https://example.com';

  try {
    if (!playwrightLaunch) {
      const pw = await import("@cloudflare/playwright");
      playwrightLaunch = pw.launch;
    }
    const browser = await playwrightLaunch(env.MYBROWSER);
    const page = await browser.newPage();
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const metrics = await page.evaluate(() => ({
      JSHeapUsedSize: typeof performance !== 'undefined' && performance.memory ? performance.memory.usedJSHeapSize : 0,
      Nodes: document.getElementsByTagName('*').length,
    })).catch(() => ({ JSHeapUsedSize: 0, Nodes: 0 }));
    await browser.close();

    if (pathLower === '/api/browser/health') {
      return new Response(JSON.stringify({
        ok: true,
        worker: 'inneranimalmedia',
        browser: 'playwright',
        binding: 'MYBROWSER',
        metrics: { jsHeapUsedSize: metrics.JSHeapUsedSize, nodes: metrics.Nodes },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (pathLower === '/api/browser/metrics') {
      return new Response(JSON.stringify({ ok: true, url: targetUrl, metrics }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return notFound(url.pathname);
  } catch (err) {
    return new Response(JSON.stringify({
      ok: false,
      error: String(err?.message || err),
      binding: 'MYBROWSER',
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

function resolveAnthropicModelKey(modelKey) {
  const MODEL_MAP = {
    claude_sonnet_4_5: 'claude-sonnet-4-20250514',
    claude_opus_4_6: 'claude-opus-4-6',
    claude_haiku_4_5: 'claude-haiku-4-5-20251001',
  };
  return MODEL_MAP[modelKey] || modelKey || 'claude-sonnet-4-20250514';
}

/** Compute cost from ai_models row (D1). Never use a hardcoded map. */
function calculateCost(model, inputTokens, outputTokens) {
  if (!model || (inputTokens == null && outputTokens == null)) return 0;
  const inputRate = typeof model.input_rate_per_mtok === 'number' ? model.input_rate_per_mtok : 0;
  const outputRate = typeof model.output_rate_per_mtok === 'number' ? model.output_rate_per_mtok : 0;
  const inTok = Number(inputTokens) || 0;
  const outTok = Number(outputTokens) || 0;
  return (inTok / 1e6 * inputRate) + (outTok / 1e6 * outputRate);
}

/** AI Gateway compat: model string for gateway (provider/model). Used only when AI_GATEWAY_BASE_URL is set. */
function getGatewayModel(provider, modelKey) {
  if (provider === 'openai') return `openai/${modelKey || 'gpt-4o'}`;
  if (provider === 'anthropic') return `anthropic/${resolveAnthropicModelKey(modelKey)}`;
  if (provider === 'google') return `google/${modelKey || 'gemini-2.5-flash'}`;
  return null;
}

/** Per-token rates (USD) for spend_ledger. Used when ai_models row lacks input_rate_per_mtok. */
function getSpendRates(provider, modelKey) {
  const p = (provider || '').toLowerCase();
  const m = (String(modelKey || '')).toLowerCase().trim();
  if (p === 'anthropic') {
    if (m.includes('haiku') || m.includes('claude-haiku-4-5')) return { rateIn: 0.0000008, rateOut: 0.000001 };
    if (m.includes('sonnet') || m.includes('claude-sonnet-4')) return { rateIn: 0.000003, rateOut: 0.000015 };
    return { rateIn: 0.000003, rateOut: 0.000015 };
  }
  if (p === 'google') {
    const defaultGoogle = { rateIn: 0.0000001, rateOut: 0.0000004 };
    if (m === 'gemini-2.5-flash' || m.includes('gemini-2.5-flash') || m.includes('flash')) return defaultGoogle;
    return defaultGoogle;
  }
  if (p === 'openai') {
    if (m.includes('gpt-4o-mini')) return { rateIn: 0.00000015, rateOut: 0.0000006 };
    if (m.includes('gpt-4o')) return { rateIn: 0.0000025, rateOut: 0.00001 };
    return { rateIn: 0.00000015, rateOut: 0.0000006 };
  }
  return { rateIn: 0, rateOut: 0 };
}

/** Write one row to agent_audit_log. Fire-and-forget; never throw. */
async function writeAuditLog(env, { event_type, message, run_id = null, metadata = {} }) {
  if (!env?.DB) return;
  try {
    await env.DB.prepare(
      `INSERT INTO agent_audit_log (id, tenant_id, actor_role_id, run_id, event_type, message, metadata_json, created_at)
       VALUES (?, 'tenant_sam_primeaux', 'agent_sam', ?, ?, ?, ?, datetime('now'))`
    ).bind(crypto.randomUUID(), run_id, event_type, message, JSON.stringify(metadata)).run();
  } catch (e) {
    console.warn('[writeAuditLog]', e?.message ?? e);
  }
}

/** Use Workers AI to generate a short conversation name and UPDATE agent_conversations. Call from waitUntil so chat response is not blocked. */
async function generateConversationName(env, conversationId, firstUserMessage) {
  if (!env.AI || !conversationId || !firstUserMessage || typeof firstUserMessage !== 'string') return;
  const text = firstUserMessage.trim().slice(0, 500);
  if (!text) return;
  try {
    const out = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [{ role: 'user', content: `Summarize this message as a short chat title, max 6 words, no quotes: ${text}` }],
      max_tokens: 20,
    });
    const name = (out?.result?.response ?? out?.response ?? (typeof out === 'string' ? out : '')).trim().slice(0, 80);
    if (name) {
      await env.DB.prepare('UPDATE agent_conversations SET name=? WHERE id=?').bind(name, conversationId).run();
    }
  } catch (e) {
    console.warn('[agent/chat] generateConversationName failed:', e?.message ?? e);
  }
}

/** Shared: insert agent_messages (assistant), agent_telemetry, spend_ledger and return payload for done event. ctx optional for non-blocking spend_ledger. */
async function streamDoneDbWrites(env, conversationId, modelRow, fullText, inputTokens, outputTokens, costUsd, agent_id, ctx) {
  const safeText = (fullText != null && typeof fullText === 'string') ? fullText : '';
  const safeInput = inputTokens ?? 0;
  const safeOutput = outputTokens ?? 0;
  const safeProvider = (modelRow && modelRow.provider != null) ? String(modelRow.provider) : 'unknown';
  const safeModelKey = (modelRow && modelRow.model_key != null) ? String(modelRow.model_key) : 'unknown';
  const { rateIn, rateOut } = getSpendRates(safeProvider, safeModelKey);
  const amountUsd = Math.round((safeInput * rateIn + safeOutput * rateOut) * 1e8) / 1e8;
  const safeCost = costUsd ?? amountUsd;
  try {
    await env.DB.prepare(
      "INSERT INTO agent_messages (id, conversation_id, role, content, provider, created_at) VALUES (?,?,?,?,?,unixepoch())"
    ).bind(crypto.randomUUID(), conversationId, 'assistant', safeText.slice(0, 50000), safeProvider).run();
  } catch (e) {
    console.error('[agent/chat] agent_messages INSERT failed:', e?.message ?? e);
  }
  try {
    await env.DB.prepare(
      `INSERT INTO agent_telemetry (id, tenant_id, session_id, metric_type, metric_name, metric_value, timestamp, model_used, provider, input_tokens, output_tokens, computed_cost_usd, created_at) VALUES (?,?,?,?,?,?,unixepoch(),?,?,?,?,?,unixepoch())`
    ).bind(crypto.randomUUID(), 'tenant_sam_primeaux', conversationId, 'llm_call', 'chat_completion', 1, safeModelKey, safeProvider, safeInput, safeOutput, amountUsd).run();
  } catch (e) {
    console.error('[agent/chat] agent_telemetry INSERT failed:', e?.message ?? e);
  }
  const doSpendInsert = () => env.DB.prepare(
    `INSERT INTO spend_ledger (id, tenant_id, workspace_id, brand_id, provider, source, occurred_at, amount_usd, model_key, tokens_in, tokens_out, session_tag, project_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind('sl_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16).toLowerCase(), 'tenant_sam_primeaux', 'ws_samprimeaux', 'inneranimalmedia', safeProvider, 'api_direct', Math.floor(Date.now() / 1000), amountUsd, safeModelKey, safeInput, safeOutput, conversationId || 'unknown', 'proj_inneranimalmedia_main_prod_013').run();
  if (ctx && typeof ctx.waitUntil === 'function') {
    ctx.waitUntil(doSpendInsert().catch((e) => console.error('[agent/chat] spend_ledger INSERT failed:', e?.message ?? e)));
  } else {
    try {
      await doSpendInsert();
    } catch (e) {
      console.error('[agent/chat] spend_ledger INSERT failed:', e?.message ?? e);
    }
  }
  try {
    await env.DB.prepare(
      `INSERT INTO agent_costs (model_used, tokens_in, tokens_out, cost_usd, task_type, user_id, created_at) VALUES (?, ?, ?, ?, ?, 'agent_sam', datetime('now'))`
    ).bind(safeModelKey, safeInput, safeOutput, safeCost, 'chat_stream').run();
    } catch (e) {
      console.error('[agent/chat] agent_costs INSERT failed:', e?.message ?? e);
    }
  try {
    if (conversationId) {
      await env.DB.prepare(
        `UPDATE mcp_agent_sessions
         SET cost_usd = COALESCE(cost_usd, 0) + ?,
             updated_at = unixepoch()
         WHERE conversation_id = ?`
      ).bind(amountUsd ?? 0, conversationId).run();
    }
  } catch (e) {
    console.warn('[streamDoneDbWrites] mcp_agent_sessions cost rollup', e?.message ?? e);
  }
  if (agent_id) {
    try {
      await env.DB.prepare("UPDATE agent_ai_sam SET total_runs=total_runs+1, last_run_at=unixepoch(), updated_at=unixepoch() WHERE id=?").bind(agent_id).run();
    } catch (_) {}
  }
}

/** Return the text of the last user message in apiMessages (for intent classification). */
function getLastUserMessageText(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== 'user') continue;
    const content = m.content;
    if (typeof content === 'string') return content.trim();
    if (Array.isArray(content)) {
      const text = content.map(c => (c.type === 'text' ? c.text : '')).join('').trim();
      if (text) return text;
    }
    return '';
  }
  return '';
}

/** Token-efficiency caps: hard bounds for prompt sections to reject unbounded assembly. */
const PROMPT_CAPS = {
  DAILY_MEMORY_MAX_CHARS: 2000,
  FILE_CONTEXT_MAX_CHARS: 4000,
  MEMORY_INDEX_MAX_CHARS: 4000,
  KNOWLEDGE_BLURB_MAX_CHARS: 2000,
  SCHEMA_BLURB_MAX_CHARS: 4000,
  MCP_BLURB_MAX_CHARS: 800,
  RAG_CONTEXT_MAX_CHARS: 3000,
  TRUNCATION_MARKER: '\n\n[... truncated]',
  SESSION_SUMMARY_MAX_CHARS: 1500,
  LAST_N_VERBATIM_TURNS: 6,
};

function capWithMarker(text, maxChars) {
  if (!text || text.length <= maxChars) return text;
  return text.slice(0, maxChars) + PROMPT_CAPS.TRUNCATION_MARKER;
}

/** Approximate token count from character length (for prompt telemetry). */
function charsToTokens(chars) {
  if (chars == null || typeof chars !== 'number') return 0;
  return Math.ceil(chars / 4);
}

/** Log section-level prompt telemetry for /api/agent/chat. Logs approximate chars/tokens per section, mode, provider, stream, tool count, message count. */
function logPromptTelemetry(env, payload) {
  const t = payload;
  const coreTokens = charsToTokens(t.coreSystemChars);
  const compiledTokens = charsToTokens(t.compiledContextChars);
  const ragTokens = charsToTokens(t.ragContextChars);
  const fileTokens = charsToTokens(t.fileContextChars);
  const historyTokens = charsToTokens(t.historyChars);
  const toolDefTokens = charsToTokens(t.toolDefChars);
  const totalInputTokens = charsToTokens(t.totalAssembledChars);
  try {
    console.log('[agent/chat] prompt_telemetry', JSON.stringify({
      mode: t.mode,
      provider: t.provider,
      stream: t.stream,
      tool_count: t.toolCount,
      message_count: t.messageCount,
      core_system_chars: t.coreSystemChars,
      core_system_tokens: coreTokens,
      compiled_context_chars: t.compiledContextChars,
      compiled_context_tokens: compiledTokens,
      rag_context_chars: t.ragContextChars,
      rag_context_tokens: ragTokens,
      file_context_chars: t.fileContextChars,
      file_context_tokens: fileTokens,
      conversation_history_chars: t.historyChars,
      conversation_history_tokens: historyTokens,
      tool_definitions_chars: t.toolDefChars,
      tool_definitions_tokens: toolDefTokens,
      total_assembled_chars: t.totalAssembledChars,
      total_assembled_tokens_est: totalInputTokens,
    }));
  } catch (e) {
    console.warn('[agent/chat] logPromptTelemetry', e?.message ?? e);
  }
}

/** Mode-specific prompt builders. Sections: { core, memory, kb, mcp, schema, daily, full }. Each section is a string (may be empty). Do not share full payload by default. */
function buildAskContext(sections, ragContext, fileContext, model) {
  let core = (sections && sections.core) || '';
  if (!core && sections && typeof sections.full === 'string') core = capWithMarker(sections.full, 2500);
  const memory = (sections && sections.memory) ? capWithMarker(sections.memory, 1500) : '';
  const fileBlock = fileContext ? capWithMarker(fileContext, 2000) : '';
  let out = core + memory;
  if (ragContext) out += '\n\nRelevant platform context:\n' + capWithMarker(ragContext, 1500);
  out += (fileBlock ? '\n\n' + fileBlock : '');
  return out;
}

function buildPlanContext(sections, ragContext, fileContext, model) {
  let core = (sections && sections.core) || '';
  if (!core && sections && typeof sections.full === 'string') core = capWithMarker(sections.full, 4000);
  const memory = (sections && sections.memory) || '';
  const daily = (sections && sections.daily) || '';
  const fileBlock = fileContext ? capWithMarker(fileContext, PROMPT_CAPS.FILE_CONTEXT_MAX_CHARS) : '';
  let out = core + memory + daily;
  if (ragContext) out += '\n\nRelevant platform context:\n' + ragContext;
  out += (fileBlock ? '\n\n' + fileBlock : '');
  return out;
}

function buildAgentContext(sections, ragContext, fileContext, model, compiledContextBlob) {
  const full = (sections && typeof sections.full === 'string') ? sections.full : (compiledContextBlob && typeof compiledContextBlob === 'string') ? compiledContextBlob : (sections ? [sections.core, sections.memory, sections.kb, sections.mcp, sections.schema, sections.daily].filter(Boolean).join('') : '');
  let out = full;
  if (ragContext) out = 'Relevant platform context:\n' + ragContext + '\n\n' + out;
  out += (fileContext ? '\n\n' + fileContext : '');
  return out;
}

function buildDebugContext(sections, ragContext, fileContext, model) {
  let core = (sections && sections.core) || '';
  if (!core && sections && typeof sections.full === 'string') core = capWithMarker(sections.full, 3000);
  const schema = (sections && sections.schema) || '';
  const fileBlock = fileContext || '';
  return core + schema + (fileBlock ? '\n\n' + fileBlock : '');
}

function buildModeContext(mode, sections, compiledContextBlob, ragContext, fileContext, model) {
  if (mode === 'ask') return buildAskContext(sections, ragContext, fileContext, model);
  if (mode === 'plan') return buildPlanContext(sections, ragContext, fileContext, model);
  if (mode === 'debug') return buildDebugContext(sections, ragContext, fileContext, model);
  return buildAgentContext(sections, ragContext, fileContext, model, compiledContextBlob);
}

/** Filter tools by mode: Ask/Plan default to no tools; Agent gets all; Debug gets only terminal/log/read tools. */
function filterToolsByMode(mode, toolDefinitions) {
  if (!Array.isArray(toolDefinitions)) return [];
  if (mode === 'ask' || mode === 'plan') return [];
  if (mode === 'debug') {
    const debugToolNames = new Set(['terminal_execute', 'd1_query', 'r2_read', 'r2_list', 'knowledge_search']);
    return toolDefinitions.filter((t) => t && debugToolNames.has(t.name));
  }
  return toolDefinitions;
}

/** Per-panel tool categories for /dashboard/mcp (request body agent_id). Agent Sam / unknown ids: no filter. */
const PANEL_TOOL_POLICY = {
  mcp_agent_architect: ['context', 'query', 'database'],
  mcp_agent_builder: ['database', 'storage', 'integrations', 'execute', 'image'],
  mcp_agent_tester: ['database', 'browser', 'quality', 'telemetry', 'context'],
  mcp_agent_operator: ['platform', 'terminal', 'storage', 'telemetry', 'database'],
};
const ARCHITECT_READ_ONLY_DB_TOOLS = new Set(['d1_query', 'r2_read', 'r2_list', 'knowledge_search']);

function panelColumnFromRequestAgentId(agentId) {
  if (agentId == null || typeof agentId !== 'string') return 'agent_sam';
  if (agentId === 'agent_sam') return 'agent_sam';
  if (agentId.startsWith('mcp_agent_')) return agentId.slice('mcp_agent_'.length);
  return 'agent_sam';
}

/** @param {string|null|undefined} requestAgentId @param {any[]} rows from mcp_registered_tools */
function filterToolRowsByPanel(requestAgentId, rows) {
  if (!requestAgentId || !Array.isArray(rows) || !PANEL_TOOL_POLICY[requestAgentId]) return rows || [];
  const allow = PANEL_TOOL_POLICY[requestAgentId];
  return rows.filter((t) => {
    const cat = String(t.tool_category || '').toLowerCase();
    if (!allow.includes(cat)) return false;
    if (requestAgentId === 'mcp_agent_architect' && cat === 'database') {
      return ARCHITECT_READ_ONLY_DB_TOOLS.has(t.tool_name);
    }
    return true;
  });
}

/** Use Haiku to classify intent of the last user message. Returns { intent: 'sql'|'shell'|'question'|'mixed', tasks?: [{ type, content }] }. */
async function classifyIntent(env, lastMessageText) {
  if (!lastMessageText || !env.ANTHROPIC_API_KEY) return null;
  const haikuKey = resolveAnthropicModelKey('claude_haiku_4_5');
  const system = `You classify the user message into a single intent. Reply with JSON only, no markdown.
- "sql" = user wants to run a SQL query (SELECT, INSERT, UPDATE, DELETE, CREATE, DROP VIEW, ALTER TABLE, or any database operation).
- "write" is not a separate intent — all DB operations including writes are classified as "sql".
- "shell" = user wants to run a shell/terminal command.
- "question" = general question, no tool needed; answer directly.
- "mixed" = message contains more than one of the above (e.g. "run ls then show me the users table").
For "mixed", include a "tasks" array: [{ "type": "shell"|"sql"|"question", "content": "..." }] in order.
Example: {"intent":"mixed","tasks":[{"type":"shell","content":"ls -la"},{"type":"sql","content":"SELECT * FROM users LIMIT 5"}]}

Known schemas (use exact column names in SQL):
- agent_ai_sam: id, name, status ('active'/'inactive'), model_policy_json
- mcp_registered_tools: tool_name, tool_category, enabled (0/1), input_schema
- ai_models: id, provider, model_key, is_active (0/1), show_in_picker (0/1)
Always use exact column names from these schemas.
For large queries spanning many tables, break into multiple sequential d1_query calls of max 5 tables each.
Reply with only the JSON object.`;

  const body = {
    model: haikuKey,
    max_tokens: 512,
    system,
    messages: [{ role: 'user', content: lastMessageText.slice(0, 8000) }],
  };
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });
  const data = await resp.json();
  const content = data.content?.[0];
  const text = content?.type === 'text' ? content.text?.trim() : '';
  if (!text) return null;
  try {
    const parsed = JSON.parse(text.replace(/^[\s\S]*?(\{[\s\S]*\})[\s\S]*$/, '$1'));
    if (parsed && typeof parsed.intent === 'string') return parsed;
  } catch (_) {}
  return null;
}

/** One round with the main model, no tools. Used for "question" intent and for aggregate step of mixed. */
async function singleRoundNoTools(env, provider, modelKey, systemWithBlurb, messages) {
  console.log('[singleRoundNoTools] modelKey:', modelKey);
  if (provider === 'anthropic') {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: modelKey,
        max_tokens: 4096,
        system: systemWithBlurb,
        messages,
      }),
    });
    const data = await resp.json();
    const content = data.content ?? [];
    return content.filter(b => b.type === 'text').map(b => b.text).join('').trim() || '';
  }
  if (provider === 'openai') {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: modelKey,
        messages: [{ role: 'system', content: systemWithBlurb }, ...messages],
      }),
    });
    const data = await resp.json();
    return data.choices?.[0]?.message?.content ?? '';
  }
  if (provider === 'google') {
    const gatewayModel = getGatewayModel('google', modelKey);
    if (env.AI_GATEWAY_BASE_URL && gatewayModel) {
      const openAiMessages = messages.map(m => ({
        role: m.role === 'model' ? 'assistant' : m.role,
        content: typeof m.content === 'string' ? m.content : (Array.isArray(m.parts) ? m.parts.filter(p => p.text).map(p => p.text).join('\n') : JSON.stringify(m.content || '')),
      }));
      const gw = await callGatewayChat(env, systemWithBlurb, openAiMessages, gatewayModel, []);
      if (gw && gw.ok && gw.data) return (gw.data.choices?.[0]?.message?.content ?? '').trim() || '';
      if (gw && !gw.ok) console.log('[singleRoundNoTools] Google gateway error:', gw.status, gw.data);
      return '';
    }
    const toParts = (m) => {
      if (Array.isArray(m.parts)) return m.parts;
      if (typeof m.content === 'string') return [{ text: m.content }];
      if (Array.isArray(m.content)) return m.content;
      return [{ text: JSON.stringify(m.content || '') }];
    };
    const filteredMessages = messages.filter(m => {
      if ((m.role === 'assistant' || m.role === 'model') && Array.isArray(m.parts)) {
        return !m.parts.some(p => p.functionCall);
      }
      if ((m.role === 'assistant' || m.role === 'model') && Array.isArray(m.content)) {
        return !m.content.some(p => p && p.functionCall);
      }
      return true;
    });
    const reqBody = {
      system_instruction: { parts: [{ text: systemWithBlurb }] },
      contents: filteredMessages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: toParts(m) })),
      tool_config: { function_calling_config: { mode: 'NONE' } },
    };
    console.log('[singleRoundNoTools] Google request body:', JSON.stringify(reqBody).slice(0, 1000));
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelKey}:generateContent`;
    const resp = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GOOGLE_AI_API_KEY },
      body: JSON.stringify(reqBody),
    });
    let data;
    try {
      data = await resp.json();
    } catch (e) {
      console.log('[singleRoundNoTools] Google response JSON parse error:', resp.status, resp.statusText, e?.message ?? e);
      return '';
    }
    console.log('[singleRoundNoTools] Google raw response:', resp.status, resp.statusText, JSON.stringify(data).slice(0, 500));
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const textOut = parts.filter(p => p.text).map(p => p.text).join('').trim() || '';
    if (!textOut) {
      console.log('[singleRoundNoTools] Google Gemini returned no text:', {
        candidates: data.candidates,
        promptFeedback: data.promptFeedback,
        usageMetadata: data.usageMetadata,
      });
    }
    return textOut;
  }
  return '';
}

/** Execute mixed tasks in order, persist to agent_tasks, aggregate results and return one response. */
async function runMixedTasks(env, request, provider, modelKey, systemWithBlurb, messages, modelRow, conversationId, tasks) {
  const results = [];
  const now = Math.floor(Date.now() / 1000);
  const conversationIdOrPlaceholder = conversationId || 'mixed-' + now;

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    const type = (task.type || '').toLowerCase();
    const content = (task.content || '').trim();
    const taskId = crypto.randomUUID();
    const title = (type + ': ' + content.slice(0, 60)).trim();

    console.log(`[runMixedTasks] task ${i + 1}: ${task.type}`);

    try {
      await env.DB.prepare(
        'INSERT INTO agent_tasks (id, conversation_id, message_id, title, description, status, priority, files_affected, commands_run, created_at, started_at, metadata_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)'
      ).bind(taskId, conversationIdOrPlaceholder, null, title, content, 'running', i, '[]', '[]', now, now, '{}').run();
    } catch (e) {
      console.log('[runToolLoop] agent_tasks INSERT failed:', e?.message ?? e);
    }

    let resultText = '';
    if (type === 'shell') {
      try {
        const out = await runTerminalCommand(env, request, content, conversationId ?? null);
        resultText = out.output ?? 'No output';
      } catch (e) {
        resultText = 'Terminal error: ' + (e?.message ?? e);
      }
    } else if (type === 'sql') {
      const blocked = /\bdrop\s+table\b|\btruncate\b/i;
      if (blocked.test(content)) {
        resultText = 'Blocked: DROP TABLE and TRUNCATE require manual approval';
      } else {
        try {
          const rows = await env.DB.prepare(content).all();
          resultText = JSON.stringify(rows.results ?? []);
        } catch (e) {
          resultText = 'D1 error: ' + (e?.message ?? e);
        }
      }
    } else {
      resultText = await singleRoundNoTools(env, 'anthropic', resolveAnthropicModelKey('claude_haiku_4_5'), 'Answer briefly.', [{ role: 'user', content }]);
    }
    console.log(`[runMixedTasks] task ${i + 1} result: ${resultText?.slice(0, 100)}`);
    results.push({ type, content: content.slice(0, 80), result: resultText.slice(0, 2000) });

    try {
      await env.DB.prepare(
        'UPDATE agent_tasks SET status=?, completed_at=?, metadata_json=? WHERE id=?'
      ).bind('completed', Math.floor(Date.now() / 1000), JSON.stringify({ result: resultText.slice(0, 5000) }), taskId).run();
    } catch (_) {}
  }

  const aggregated = results.map((r, i) => `Task ${i + 1} (${r.type}): ${r.result}`).join('\n\n');
  const aggregateMessage = {
    role: 'user',
    content: 'The user asked a mixed request. Here are the results of each part. Summarize into one clear response.\n\n' + aggregated,
  };
  const finalMessages = [...messages, aggregateMessage];
  return await singleRoundNoTools(env, provider, modelKey, systemWithBlurb, finalMessages);
}

const stripAdditionalProperties = (obj) => {
  if (typeof obj !== 'object' || obj === null) return obj;
  if (Array.isArray(obj)) return obj.map(stripAdditionalProperties);
  const result = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'additionalProperties') continue;
    result[k] = stripAdditionalProperties(v);
  }
  return result;
};

/** Multi-provider tool loop (non-streaming). Supports anthropic, openai, google. Returns final assistant text. */
async function runToolLoop(env, request, provider, modelKey, systemWithBlurb, apiMessages, toolDefinitions, modelRow, agent_id, conversationId, attachedFilesFromRequest) {
  let messages = [...apiMessages];
  let finalText = '';
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let classification = null;
  const MAX_ROUNDS = 8;
  console.log('[runToolLoop] provider:', provider, 'model:', modelKey, 'tools:', toolDefinitions.length);

  // Before any tool calls, classify intent of the last user message (cheap Haiku).
  const lastUserText = getLastUserMessageText(messages);
  if (lastUserText && provider === 'anthropic') {
    try {
      classification = await classifyIntent(env, lastUserText);
      if (classification) {
        console.log('[runToolLoop] intent:', classification.intent, 'tasks:', classification.tasks?.length ?? 0);
        const patternRow = await env.DB.prepare('SELECT id FROM agent_intent_patterns LIMIT 1').first();
        const intentPatternId = patternRow?.id ?? 1;
        if (intentPatternId != null) {
          try {
            await env.DB.prepare(
              `INSERT INTO agent_intent_execution_log (tenant_id, intent_pattern_id, user_input, intent_detected, confidence_score, created_at)
               VALUES ('tenant_sam_primeaux', ?, ?, ?, 0.9, unixepoch())`
            ).bind(intentPatternId, lastUserText.slice(0, 4000), classification.intent).run();
          } catch (e) { console.warn('[runToolLoop] agent_intent_execution_log', e?.message ?? e); }
        }
      }
    } catch (e) {
      console.log('[runToolLoop] intent classification failed:', e?.message ?? e);
    }
    if (classification?.intent === 'question') {
      finalText = await singleRoundNoTools(env, provider, modelKey, systemWithBlurb, messages);
      return finalText || 'No response.';
    }
    if (classification?.intent === 'mixed' && classification.tasks?.length > 0) {
      finalText = await runMixedTasks(env, request, provider, modelKey, systemWithBlurb, messages, modelRow, conversationId, classification.tasks);
      return finalText || 'Mixed tasks completed. See results above.';
    }
  }

  for (let round = 0; round < MAX_ROUNDS; round++) {
    console.log('[runToolLoop] round', round + 1, 'of', MAX_ROUNDS);
    let reqBody, apiUrl, headers;

    if (provider === 'anthropic') {
      apiUrl = 'https://api.anthropic.com/v1/messages';
      headers = {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      };
      reqBody = {
        model: modelKey,
        max_tokens: 4096,
        system: systemWithBlurb,
        messages,
        tools: toolDefinitions.map(t => ({
          name: t.name,
          description: t.description,
          input_schema: t.input_schema,
        })),
      };
    } else if (provider === 'openai') {
      apiUrl = 'https://api.openai.com/v1/chat/completions';
      headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
      };
      reqBody = {
        model: modelKey,
        messages: [{ role: 'system', content: systemWithBlurb }, ...messages],
        tools: toolDefinitions.map(t => ({
          type: 'function',
          function: {
            name: t.name,
            description: t.description,
            parameters: t.input_schema,
          },
        })),
        tool_choice: 'auto',
      };
    } else if (provider === 'google') {
      apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelKey}:generateContent`;
      headers = { 'Content-Type': 'application/json', 'x-goog-api-key': env.GOOGLE_AI_API_KEY };
      const toParts = (m) => {
        if (m.parts) return m.parts;  // Check parts FIRST - tool results use this
        if (typeof m.content === 'string') return [{ text: m.content }];
        if (Array.isArray(m.content)) return m.content;
        return [{ text: JSON.stringify(m.content || '') }];
      };
      reqBody = {
        system_instruction: { parts: [{ text: systemWithBlurb }] },
        contents: messages.map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: toParts(m),
        })),
        tools: [{ function_declarations: toolDefinitions.map(t => ({
          name: t.name,
          description: t.description || '',
          parameters: stripAdditionalProperties(t.input_schema),
        })) }],
      };
    } else {
      break;
    }

    const resp = await fetch(apiUrl, { method: 'POST', headers, body: JSON.stringify(reqBody) });
    const data = await resp.json();
    if (provider === 'google') {
      const bodyPreview = typeof data === 'object' ? JSON.stringify(data) : String(data);
      console.log('[runToolLoop] Google fetch resp.status:', resp.status, 'body (500):', bodyPreview.slice(0, 500));
    }

    let toolCalls = [];
    let textContent = '';

    if (provider === 'anthropic') {
      if (data.usage?.input_tokens != null) totalInputTokens += data.usage.input_tokens;
      if (data.usage?.output_tokens != null) totalOutputTokens += data.usage.output_tokens;
      const content = data.content ?? [];
      textContent = content.filter(b => b.type === 'text').map(b => b.text).join('');
      toolCalls = content.filter(b => b.type === 'tool_use');
      console.log('[runToolLoop] anthropic round', round + 1, 'stop_reason:', data.stop_reason, 'toolCalls:', toolCalls.length, 'textLen:', textContent.length);
      if (toolCalls.length === 0) {
        finalText = textContent;
        break;
      }
      messages.push({ role: 'assistant', content });
    } else if (provider === 'openai') {
      const choice = data.choices?.[0];
      if (data.usage?.prompt_tokens != null) totalInputTokens += data.usage.prompt_tokens;
      if (data.usage?.completion_tokens != null) totalOutputTokens += data.usage.completion_tokens;
      textContent = choice?.message?.content ?? '';
      toolCalls = choice?.message?.tool_calls ?? [];
      if (!toolCalls.length) {
        finalText = textContent;
        break;
      }
      messages.push(choice.message);
    } else if (provider === 'google') {
      const parts = data.candidates?.[0]?.content?.parts ?? [];
      if (data.usageMetadata?.promptTokenCount != null) totalInputTokens += data.usageMetadata.promptTokenCount;
      if (data.usageMetadata?.candidatesTokenCount != null) totalOutputTokens += data.usageMetadata.candidatesTokenCount;
      textContent = parts.filter(p => p.text).map(p => p.text).join('');
      toolCalls = parts.filter(p => p.functionCall);
      if (!toolCalls.length) {
        finalText = textContent;
        break;
      }
      messages.push({ role: 'model', content: parts });
    }

    const toolResults = [];
    for (const tc of toolCalls) {
      const toolName = tc.name ?? tc.function?.name ?? tc.functionCall?.name;
      let params = {};
      try {
        params = tc.input ?? JSON.parse(tc.function?.arguments ?? '{}') ?? tc.functionCall?.args ?? {};
      } catch (_) {}

      let resultText = `Tool ${toolName} not implemented`;

      if (toolName === 'terminal_execute') {
        const command = params.command ?? '';
        try {
          const termResult = await runTerminalCommand(env, request, command, conversationId ?? null);
          resultText = termResult.output ?? 'No output';
          void writeAuditLog(env, { event_type: 'terminal_execute', message: `Command: ${command.slice(0, 200)}`, metadata: { conversationId: conversationId ?? null } }).catch(() => {});
        } catch (e) {
          resultText = `Terminal error: ${e.message}`;
        }
      } else if (toolName === 'd1_query') {
        const sql = (params.query ?? '').trim();
        const normalized = sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '').trim().toUpperCase();
        if (!normalized.startsWith('SELECT')) {
          resultText = 'Only SELECT queries allowed via d1_query';
        } else {
          try {
            const rows = await env.DB.prepare(sql).all();
            resultText = JSON.stringify(rows.results ?? []);
          } catch (e) {
            resultText = `D1 error: ${e.message}`;
          }
        }
      } else if (toolName === 'd1_write') {
        const sql = (params.sql ?? '').trim();
        const bindParams = Array.isArray(params.params) ? params.params : [];
        const blocked = /\bdrop\s+table\b|\btruncate\b/i;
        if (blocked.test(sql)) {
          resultText = 'Blocked: DROP TABLE and TRUNCATE require manual approval';
        } else {
          try {
            const stmt = env.DB.prepare(sql);
            const result = bindParams.length ? await stmt.bind(...bindParams).run() : await stmt.run();
            const changes = result.meta?.changes ?? result.changes ?? 0;
            resultText = JSON.stringify({ changes, success: true });
            void writeAuditLog(env, { event_type: 'd1_write', message: 'D1 write executed', metadata: { changes } }).catch(() => {});
          } catch (e) {
            resultText = `D1 error: ${e.message}`;
          }
        }
      } else if (toolName === 'r2_read') {
        const key = params.key ?? params.path ?? '';
        try {
          const obj = await env.R2.get(key);
          resultText = obj ? await obj.text() : `Key not found: ${key}`;
        } catch (e) {
          resultText = `R2 error: ${e.message}`;
        }
      } else if (toolName === 'r2_list') {
        const prefix = params.prefix ?? '';
        try {
          const list = await env.R2.list({ prefix, limit: 50 });
          resultText = JSON.stringify(list.objects.map(o => ({ key: o.key, size: o.size })));
        } catch (e) {
          resultText = `R2 error: ${e.message}`;
        }
      } else if (toolName === 'knowledge_search' && env.AI) {
        const query = params.query ?? '';
        const max_results = Math.min(Math.max(1, Number(params.max_results) || 5), 10);
        try {
          const searchResult = await vectorizeRagSearch(env, query, { topK: max_results });
          resultText = JSON.stringify({
            query,
            results: (searchResult?.results ?? searchResult?.data ?? []).map(item => ({
              content: item.content ?? item.text,
              source: item.source ?? item.metadata?.source ?? 'unknown',
              score: item.score,
            })),
          });
        } catch (e) {
          resultText = JSON.stringify({ error: e?.message ?? String(e) });
        }
      } else if (toolName === 'generate_execution_plan' && env.DB) {
        const summary = typeof params.summary === 'string' ? params.summary.trim() : '';
        const steps = Array.isArray(params.steps) ? params.steps : [];
        try {
          const planId = crypto.randomUUID();
          const tenantId = env.TENANT_ID || 'system';
          const planJson = JSON.stringify({ summary, steps });
          await env.DB.prepare(
            `INSERT INTO agent_execution_plans (id, tenant_id, session_id, plan_json, summary, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'pending', unixepoch(), unixepoch())`
          ).bind(planId, tenantId, conversationId ?? '', planJson, summary.slice(0, 2000)).run();
          resultText = JSON.stringify({ plan_id: planId, status: 'pending', message: 'Plan created; user can approve or reject in the UI.' });
        } catch (e) {
          resultText = JSON.stringify({ error: e?.message ?? String(e) });
        }
      } else if ((toolName === 'playwright_screenshot' || toolName === 'browser_screenshot') && env.MYBROWSER && env.DASHBOARD) {
        try {
          const out = await runInternalPlaywrightTool(env, toolName, params);
          resultText = JSON.stringify(out);
          void writeAuditLog(env, { event_type: toolName, message: `Screenshot: ${(params.url || '').slice(0, 200)}`, metadata: { conversationId: conversationId ?? null } }).catch(() => {});
        } catch (e) {
          resultText = JSON.stringify({ error: e?.message ?? String(e) });
        }
      } else if (toolName === 'gdrive_list' || toolName === 'gdrive_fetch') {
        const authUser = await getAuthUser(request, env);
        if (!authUser) { resultText = JSON.stringify({ error: 'unauthorized' }); } else {
          const integrationUserId = authUser.email || authUser.id;
          const tokenRow = await getIntegrationToken(env.DB, integrationUserId, 'google_drive', '');
          if (!tokenRow) { resultText = JSON.stringify({ error: 'not_connected', hint: 'Connect Google Drive in the dashboard' }); } else {
            try {
              if (toolName === 'gdrive_list') {
                const folderId = params.folder_id || 'root';
                const res = await fetch(`https://www.googleapis.com/drive/v3/files?q='${encodeURIComponent(folderId)}'+in+parents+and+trashed=false&fields=files(id,name,mimeType,size,modifiedTime)&orderBy=name`, { headers: { Authorization: `Bearer ${tokenRow.access_token}` } });
                const data = await res.json();
                if (!res.ok) resultText = JSON.stringify({ error: data.error?.message || 'Drive API error' });
                else resultText = JSON.stringify({ files: data.files || [] });
              } else {
                const fileId = params.file_id;
                if (!fileId) { resultText = JSON.stringify({ error: 'file_id required' }); } else {
                  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, { headers: { Authorization: `Bearer ${tokenRow.access_token}` } });
                  if (!res.ok) resultText = JSON.stringify({ error: `Drive API: ${res.status}` });
                  else resultText = await res.text();
                }
              }
            } catch (e) { resultText = JSON.stringify({ error: e?.message ?? String(e) }); }
          }
        }
      } else if (toolName === 'github_repos' || toolName === 'github_file') {
        const authUser = await getAuthUser(request, env);
        if (!authUser) { resultText = JSON.stringify({ error: 'unauthorized' }); } else {
          const integrationUserId = authUser.email || authUser.id;
          const tokenRow = await getIntegrationToken(env.DB, integrationUserId, 'github', '');
          if (!tokenRow) { resultText = JSON.stringify({ error: 'not_connected', hint: 'Connect GitHub in the dashboard' }); } else {
            try {
              if (toolName === 'github_repos') {
                const res = await fetch('https://api.github.com/user/repos?sort=updated&per_page=100&affiliation=owner,collaborator,organization_member', { headers: { Authorization: `Bearer ${tokenRow.access_token}`, 'User-Agent': 'IAM-Platform' } });
                const data = await res.json();
                if (!res.ok) resultText = JSON.stringify({ error: data.message || 'GitHub API error' });
                else resultText = JSON.stringify(data);
              } else {
                const repo = params.repo; const path = params.path;
                if (!repo || !path) { resultText = JSON.stringify({ error: 'repo and path required' }); } else {
                  const res = await fetch(`https://api.github.com/repos/${encodeURIComponent(repo)}/contents/${encodeURIComponent(path)}`, { headers: { Authorization: `Bearer ${tokenRow.access_token}`, 'User-Agent': 'IAM-Platform' } });
                  const data = await res.json();
                  if (!res.ok) resultText = JSON.stringify({ error: data.message || 'Not found' });
                  else if (data.content) resultText = atob((data.content || '').replace(/\n/g, ''));
                  else resultText = JSON.stringify(data);
                }
              }
            } catch (e) { resultText = JSON.stringify({ error: e?.message ?? String(e) }); }
          }
        }
      } else if (toolName === 'cf_images_list' || toolName === 'cf_images_upload' || toolName === 'cf_images_delete') {
        const imagesToken = env.CLOUDFLARE_IMAGES_TOKEN || env.CLOUDFLARE_IMAGES_API_TOKEN;
        const imagesAccountId = env.CLOUDFLARE_ACCOUNT_ID || env.CLOUDFLARE_IMAGES_ACCOUNT_HASH;
        if (!imagesAccountId || !imagesToken) { resultText = JSON.stringify({ error: 'Cloudflare Images not configured' }); } else {
          try {
            if (toolName === 'cf_images_list') {
              const page = params.page || 1; const perPage = params.per_page || 100;
              const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${imagesAccountId}/images/v1?page=${page}&per_page=${perPage}`, { headers: { Authorization: `Bearer ${imagesToken}` } });
              const data = await res.json().catch(() => ({}));
              if (!res.ok) resultText = JSON.stringify({ error: data.errors?.[0]?.message || 'CF Images API error' });
              else resultText = JSON.stringify({ images: (data.result && data.result.images) || [] });
            } else if (toolName === 'cf_images_upload') {
              const url = params.url;
              if (!url || typeof url !== 'string') { resultText = JSON.stringify({ error: 'url required' }); } else {
                const formBody = new URLSearchParams({ url: url.trim() });
                const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${imagesAccountId}/images/v1`, { method: 'POST', headers: { Authorization: `Bearer ${imagesToken}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: formBody.toString() });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) resultText = JSON.stringify({ error: data.errors?.[0]?.message || 'Upload failed' });
                else resultText = JSON.stringify(data.result || {});
              }
            } else {
              const id = params.id;
              if (!id) { resultText = JSON.stringify({ error: 'id required' }); } else {
                const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${imagesAccountId}/images/v1/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${imagesToken}` } });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) resultText = JSON.stringify({ error: data.errors?.[0]?.message || 'Delete failed' });
                else resultText = JSON.stringify({ ok: true });
              }
            }
          } catch (e) { resultText = JSON.stringify({ error: e?.message ?? String(e) }); }
        }
      } else if (toolName === 'attached_file_content' && Array.isArray(attachedFilesFromRequest)) {
        const filename = params.filename;
        if (!filename || typeof filename !== 'string') { resultText = JSON.stringify({ error: 'filename required' }); } else {
          const file = attachedFilesFromRequest.find((f) => (f.name || '').trim() === filename.trim() && f.encoding === 'base64');
          if (!file) {
            const names = attachedFilesFromRequest.filter((f) => f.encoding === 'base64').map((f) => f.name);
            resultText = JSON.stringify({ error: 'File not found. Attached binary files: ' + (names.length ? names.join(', ') : 'none') });
          } else {
            resultText = JSON.stringify({
              name: file.name,
              size_bytes: file.size ?? (typeof file.content === 'string' ? Math.round((file.content.length * 3) / 4) : 0),
              content_base64: typeof file.content === 'string' ? file.content : '',
            });
          }
        }
      } else if (toolName === 'imgx_generate_image' || toolName === 'imgx_edit_image' || toolName === 'imgx_list_providers') {
        try {
          const out = await runImgxBuiltinTool(env, toolName, params || {});
          resultText = JSON.stringify(out);
        } catch (e) {
          resultText = JSON.stringify({ error: e?.message ?? String(e) });
        }
      }

      const BUILTIN_TOOLS = new Set(['terminal_execute', 'd1_query', 'd1_write', 'r2_read', 'r2_list', 'knowledge_search', 'generate_execution_plan', 'playwright_screenshot', 'browser_screenshot', 'gdrive_list', 'gdrive_fetch', 'github_repos', 'github_file', 'cf_images_list', 'cf_images_upload', 'cf_images_delete', 'imgx_generate_image', 'imgx_edit_image', 'imgx_list_providers', 'attached_file_content']);
      if (!BUILTIN_TOOLS.has(toolName) && env.DB) {
        try {
          const toolRow = await env.DB.prepare('SELECT tool_category FROM mcp_registered_tools WHERE tool_name = ? AND enabled = 1').bind(toolName).first();
          const category = toolRow?.tool_category ?? 'execute';
          const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
          await env.DB.prepare(
            `INSERT INTO mcp_tool_calls (id, tenant_id, session_id, tool_name, tool_category, input_schema, output, status, invoked_by, invoked_at, completed_at, created_at, updated_at)
             VALUES (?, 'tenant_sam_primeaux', ?, ?, ?, ?, ?, 'completed', 'agent_sam', ?, ?, ?, ?)`
          ).bind(crypto.randomUUID(), conversationId ?? '', toolName, category, JSON.stringify(params), resultText.slice(0, 50000), now, now, now, now).run();
        } catch (e) { console.warn('[runToolLoop] mcp_tool_calls INSERT', e?.message ?? e); }
      }

      if (provider === 'anthropic') {
        toolResults.push({ type: 'tool_result', tool_use_id: tc.id, content: resultText });
      } else if (provider === 'openai') {
        toolResults.push({ role: 'tool', tool_call_id: tc.id, content: resultText });
      } else if (provider === 'google') {
        toolResults.push({ functionResponse: { name: toolName, response: { output: resultText } } });
      }
    }

    if (provider === 'anthropic') {
      messages.push({ role: 'user', content: toolResults });
    } else if (provider === 'openai') {
      messages.push(...toolResults);
    } else if (provider === 'google') {
      messages.push({ role: 'user', parts: toolResults });
    }
  }

  if (!finalText && messages.length > 0) {
    if (provider === 'google') {
      let lastUserWithFunctionResponse = null;
      for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i];
        if (m.role === 'user' && Array.isArray(m.parts) && m.parts.some(p => p && p.functionResponse)) {
          lastUserWithFunctionResponse = m;
          break;
        }
      }
      if (lastUserWithFunctionResponse && lastUserWithFunctionResponse.parts) {
        const chunks = lastUserWithFunctionResponse.parts
          .filter(p => p && p.functionResponse)
          .map(p => {
            const r = p.functionResponse.response;
            return typeof r === 'string' ? r : (r && r.output);
          })
          .filter(Boolean);
        finalText = chunks.join('\n\n').trim();
      }
      if (!finalText) finalText = 'Tools completed. No tool output.';
    } else {
      finalText = await singleRoundNoTools(env, provider, modelKey, systemWithBlurb, messages);
      if (!finalText) finalText = 'Command executed. See terminal for output.';
    }
  }
  try {
    const taskType = classification?.intent ?? 'tool_loop';
    const costUsd = calculateCost(modelRow, totalInputTokens, totalOutputTokens);
    await env.DB.prepare(
      `INSERT INTO agent_costs (model_used, tokens_in, tokens_out, cost_usd, task_type, user_id, created_at)
       VALUES (?, ?, ?, ?, ?, 'agent_sam', datetime('now'))`
    ).bind(modelRow?.model_key ?? modelKey, totalInputTokens, totalOutputTokens, costUsd, taskType).run();
  } catch (e) { console.warn('[runToolLoop] agent_costs INSERT', e?.message ?? e); }
  return { content: [{ type: 'text', text: finalText }] };
}

/**
 * Run a command on the PTY via WebSocket. Used by POST /api/agent/terminal/run and runToolLoop (terminal_execute).
 * Returns { output, command }. Throws on connect/error so callers can try/catch.
 */
async function runTerminalCommand(env, request, command, sessionId = null) {
  console.log('[runTerminalCommand] START', { command: typeof command === 'string' ? command.slice(0, 80) : command, sessionId });
  const cmd = typeof command === 'string' ? command.trim() : '';
  const wsUrl = env.TERMINAL_WS_URL;
  if (!wsUrl) throw new Error('Terminal not configured');
  const sep = wsUrl.includes('?') ? '&' : '?';
  const wsUrlWithAuth = env.TERMINAL_SECRET
    ? `${wsUrl}${sep}token=${encodeURIComponent(env.TERMINAL_SECRET)}`
    : wsUrl;
  const runKeyBytes = new Uint8Array(16);
  crypto.getRandomValues(runKeyBytes);
  const runWsKey = btoa(String.fromCharCode.apply(null, runKeyBytes));
  const wsResp = await fetch(wsUrlWithAuth, {
    headers: {
      Upgrade: 'websocket',
      Connection: 'Upgrade',
      'Sec-WebSocket-Version': '13',
      'Sec-WebSocket-Key': runWsKey,
      'x-terminal-secret': env.TERMINAL_SECRET || '',
    },
  });
  if (wsResp.status !== 101) throw new Error(`Terminal connect failed: ${wsResp.status}`);
  const ws = wsResp.webSocket;
  ws.accept();
  const output = await new Promise((resolve) => {
    const chunks = [];
    const t = setTimeout(() => resolve(chunks.join('')), 10000);
    ws.addEventListener('message', (e) => chunks.push(e.data));
    ws.addEventListener('close', () => { clearTimeout(t); resolve(chunks.join('')); });
    ws.send(JSON.stringify({ type: 'run', command: cmd }));
  });
  ws.close();
  const cleanOutput = output
    .split('\n')
    .filter(line => {
      try { const p = JSON.parse(line); return p.type !== 'session_id'; } catch (_) { return true; }
    })
    .join('\n')
    .trim();
  const out = { output: cleanOutput, command: cmd };
  if (env.DB) {
    const now = Math.floor(Date.now() / 1000);
    const agentSessionIdForHistory = sessionId || null;
    const id1 = 'th_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    const id2 = 'th_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    const tenantIdHistory = 'tenant_sam_primeaux';
    let terminalSessionIdForHistory = null;
    try {
      if (request) {
        const authUser = await getAuthUser(request, env);
        const uid = authUser?.id || authUser?.email || null;
        if (uid) {
          const tsRow = await env.DB.prepare(
            `SELECT id FROM terminal_sessions WHERE user_id = ? AND status = 'active' AND tunnel_url IS NOT NULL AND tunnel_url != '' ORDER BY updated_at DESC LIMIT 1`
          ).bind(uid).first();
          terminalSessionIdForHistory = tsRow?.id || null;
        }
      }
    } catch (_) {}
    if (terminalSessionIdForHistory) {
      try {
        const seqRow = await env.DB.prepare(
          'SELECT COALESCE(MAX(sequence), 0) AS m FROM terminal_history WHERE terminal_session_id = ?'
        ).bind(terminalSessionIdForHistory).first();
        let seq = Number(seqRow?.m ?? 0);
        seq += 1;
        const inputContent = cmd.slice(0, 50000);
        const outputContent = cleanOutput.slice(0, 100000);
        await env.DB.prepare(
          `INSERT INTO terminal_history (id, terminal_session_id, tenant_id, sequence, direction, content, triggered_by, agent_session_id, recorded_at) VALUES (?,?,?,?,?,?,?,?,?)`
        ).bind(id1, terminalSessionIdForHistory, tenantIdHistory, seq, 'input', inputContent, 'agent', agentSessionIdForHistory, now).run();
        seq += 1;
        await env.DB.prepare(
          `INSERT INTO terminal_history (id, terminal_session_id, tenant_id, sequence, direction, content, triggered_by, agent_session_id, recorded_at) VALUES (?,?,?,?,?,?,?,?,?)`
        ).bind(id2, terminalSessionIdForHistory, tenantIdHistory, seq, 'output', outputContent, 'agent', agentSessionIdForHistory, now).run();
        console.log('[runTerminalCommand] terminal_history written (input + output)');
      } catch (e) {
        console.warn('[runTerminalCommand] terminal_history', e?.message ?? e);
      }
    } else {
      console.warn('[runTerminalCommand] terminal_history skipped (no active terminal_session for user)');
    }
  }
  return out;
}

/**
 * Parse first markdown fenced code block from fullText and emit one SSE code event via send(obj).
 * Format: ```language optional_filename\ncode\n```
 * send(obj) is called once with { type: 'code', code, filename, language } or not at all.
 */
function emitCodeBlocksFromText(fullText, send) {
  if (typeof fullText !== 'string' || !fullText.trim()) return;
  const re = /```(\w*)\s*([^\n]*)\n([\s\S]*?)```/;
  const m = fullText.match(re);
  if (!m) return;
  const language = (m[1] || '').trim() || 'text';
  const rawFilename = (m[2] || '').trim().replace(/^(\/\/|#|\/\*)\s*/, '');
  const filename = (rawFilename && /^[a-zA-Z0-9._-]+\.[a-z]{1,10}$/i.test(rawFilename)) ? rawFilename : 'snippet';
  const code = (m[3] || '').trim();
  send({ type: 'code', code, filename, language });
}

/**
 * OpenAI streaming: same SSE contract as Anthropic.
 * POST to chat/completions with stream: true, stream_options: { include_usage: true }.
 */
async function streamOpenAI(env, systemWithBlurb, apiMessages, modelRow, images, conversationId, agent_id, ctx) {
  const modelKey = modelRow.model_key || 'gpt-4o';
  const openAiMessages = apiMessages.map((m, i) => {
    const isLastUser = i === apiMessages.length - 1 && m.role === 'user' && images.length > 0;
    const content = isLastUser ? buildOpenAIContent(m.content, images) : m.content;
    return { role: m.role, content };
  });
  const withSystem = [{ role: 'system', content: systemWithBlurb }, ...openAiMessages];
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json',
                'Accept': 'application/json, text/event-stream', 'Authorization': `Bearer ${env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: modelKey,
      messages: withSystem,
      stream: true,
      stream_options: { include_usage: true },
    }),
  });
  if (!resp.ok) {
    const errData = await resp.json().catch(() => ({}));
    return jsonResponse(errData, resp.status);
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  let inputTokens = 0;
  let outputTokens = 0;
  const readable = new ReadableStream({
    async pull(controller) {
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const raw = line.slice(6).trim();
            if (raw === '[DONE]') continue;
            try {
              const data = JSON.parse(raw);
              const content = data.choices?.[0]?.delta?.content;
              if (typeof content === 'string' && content) {
                fullText += content;
                controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: 'text', text: content })}\n\n`));
              }
              if (data.usage) {
                inputTokens = data.usage.prompt_tokens ?? 0;
                outputTokens = data.usage.completion_tokens ?? 0;
              }
            } catch (_) {}
          }
        }
        const costUsd = calculateCost(modelRow, inputTokens, outputTokens);
        await streamDoneDbWrites(env, conversationId, modelRow, fullText, inputTokens, outputTokens, costUsd, agent_id, ctx);
        emitCodeBlocksFromText(fullText, (obj) => controller.enqueue(new TextEncoder().encode('data: ' + JSON.stringify(obj) + '\n\n')));
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: 'done', input_tokens: inputTokens, output_tokens: outputTokens, cost_usd: costUsd, conversation_id: conversationId, model_used: modelRow.model_key, model_display_name: modelRow.display_name })}\n\n`));
      } catch (e) {
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: 'error', error: e?.message ?? String(e) })}\n\n`));
      } finally {
        reader.releaseLock();
      }
      controller.close();
    },
  });
  return new Response(readable, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' } });
}

/**
 * Google (Gemini) streaming: streamGenerateContent, same SSE contract.
 */
async function streamGoogle(env, systemWithBlurb, apiMessages, modelRow, images, conversationId, agent_id, ctx) {
  const modelKey = modelRow.model_key || 'gemini-2.5-flash';
  const googleContents = apiMessages.map((m, i) => {
    const isLastUser = i === apiMessages.length - 1 && m.role === 'user' && images.length > 0;
    const parts = isLastUser ? buildGoogleParts(m.content, images) : [{ text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }];
    return { role: m.role === 'assistant' ? 'model' : 'user', parts };
  });
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelKey}:streamGenerateContent`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': env.GOOGLE_AI_API_KEY,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemWithBlurb }] },
      contents: googleContents,
    }),
  });
  if (!resp.ok) {
    const errData = await resp.json().catch(() => ({}));
    return jsonResponse(errData, resp.status);
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  let inputTokens = 0;
  let outputTokens = 0;
  const readable = new ReadableStream({
    async pull(controller) {
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split(/\n|\r\n/);
          buffer = lines.pop() || '';
          for (const line of lines) {
            let data;
            if (line.startsWith('data: ')) {
              try {
                data = JSON.parse(line.slice(6).trim());
              } catch (_) { continue; }
            } else if (line.trim()) {
              try {
                data = JSON.parse(line);
              } catch (_) { continue; }
            } else continue;
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (typeof text === 'string' && text) {
              fullText += text;
              controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: 'text', text })}\n\n`));
            }
            const usage = data.usageMetadata;
            if (usage) {
              inputTokens = usage.promptTokenCount ?? 0;
              outputTokens = usage.candidatesTokenCount ?? 0;
            }
          }
        }
        const costUsd = calculateCost(modelRow, inputTokens, outputTokens);
        await streamDoneDbWrites(env, conversationId, modelRow, fullText, inputTokens, outputTokens, costUsd, agent_id, ctx);
        emitCodeBlocksFromText(fullText, (obj) => controller.enqueue(new TextEncoder().encode('data: ' + JSON.stringify(obj) + '\n\n')));
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: 'done', input_tokens: inputTokens, output_tokens: outputTokens, cost_usd: costUsd, conversation_id: conversationId, model_used: modelRow.model_key, model_display_name: modelRow.display_name })}\n\n`));
      } catch (e) {
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: 'error', error: e?.message ?? String(e) })}\n\n`));
      } finally {
        reader.releaseLock();
      }
      controller.close();
    },
  });
  return new Response(readable, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' } });
}

/**
 * Cloudflare Workers AI streaming: env.AI.run(model_key, { messages, stream: true }).
 * Same SSE contract; cost_usd: 0 (neurons). Handle all chunk shapes; null-coerce before D1.
 */
async function streamWorkersAI(env, systemWithBlurb, apiMessages, modelRow, conversationId, agent_id, ctx) {
  const messages = [{ role: 'system', content: systemWithBlurb }, ...apiMessages];
  const modelKey = (modelRow && modelRow.model_key) ? modelRow.model_key : '@cf/meta/llama-3.1-8b-instruct';
  const inputCharCount = messages.reduce((acc, m) => acc + (typeof m.content === 'string' ? m.content.length : JSON.stringify(m.content || '').length), 0);
  let resp;
  try {
    resp = await env.AI.run(modelKey, { messages, stream: true });
  } catch (e) {
    return jsonResponse({ error: e?.message ?? String(e) }, 502);
  }
  if (!resp || !resp.body) return jsonResponse({ error: 'Workers AI stream failed' }, 502);
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  const readable = new ReadableStream({
    async pull(controller) {
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const raw = line.slice(6).trim();
            try {
              const data = JSON.parse(raw);
              const text = (typeof data.response === 'string' ? data.response : null)
                ?? (typeof data.text === 'string' ? data.text : null)
                ?? (data.choices?.[0]?.delta?.content != null ? String(data.choices[0].delta.content) : '');
              if (typeof text === 'string' && text) {
                fullText += text;
                controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: 'text', text })}\n\n`));
              }
            } catch (_) {}
          }
        }
        const inputTokens = Math.round(inputCharCount / 4);
        const outputTokens = Math.round(fullText.length / 4);
        const costUsd = 0;
        const safeInput = inputTokens ?? 0;
        const safeOutput = outputTokens ?? 0;
        const safeCost = costUsd ?? 0;
        const safeText = fullText || '';
        const safeModel = (modelRow && modelRow.model_key != null) ? modelRow.model_key : 'unknown';
        const safeRow = { ...(modelRow || {}), model_key: safeModel, provider: (modelRow && modelRow.provider != null) ? modelRow.provider : 'workers_ai' };
        await streamDoneDbWrites(env, conversationId, safeRow, safeText, safeInput, safeOutput, safeCost, agent_id, ctx);
        emitCodeBlocksFromText(fullText, (obj) => controller.enqueue(new TextEncoder().encode('data: ' + JSON.stringify(obj) + '\n\n')));
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: 'done', input_tokens: safeInput, output_tokens: safeOutput, cost_usd: safeCost, conversation_id: conversationId, model_used: safeRow.model_key, model_display_name: safeRow.display_name })}\n\n`));
      } catch (e) {
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: 'error', error: e?.message ?? String(e) })}\n\n`));
      } finally {
        reader.releaseLock();
      }
      controller.close();
    },
  });
  return new Response(readable, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' } });
}

/** Parse data URL to { mediaType, base64 } for vision APIs */
function parseDataUrl(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return { mediaType: match[1].trim(), base64: match[2] };
}

/** Build last user message content with images for Anthropic (content block array) */
function buildAnthropicContent(text, images) {
  const blocks = [{ type: 'text', text: text || '(image attached)' }];
  if (images && Array.isArray(images)) {
    for (const img of images) {
      const parsed = parseDataUrl(img.dataUrl);
      if (parsed) blocks.push({ type: 'image', source: { type: 'base64', media_type: parsed.mediaType, data: parsed.base64 } });
    }
  }
  return blocks;
}

/** Build last user message content with images for OpenAI (content array) */
function buildOpenAIContent(text, images) {
  const parts = [{ type: 'text', text: text || '(image attached)' }];
  if (images && Array.isArray(images)) {
    for (const img of images) {
      if (img.dataUrl) parts.push({ type: 'image_url', image_url: { url: img.dataUrl } });
    }
  }
  return parts;
}

/** Build last user message parts for Google (parts array) */
function buildGoogleParts(text, images) {
  const parts = [{ text: text || '(image attached)' }];
  if (images && Array.isArray(images)) {
    for (const img of images) {
      const parsed = parseDataUrl(img.dataUrl);
      if (parsed) parts.push({ inline_data: { mime_type: parsed.mediaType, data: parsed.base64 } });
    }
  }
  return parts;
}

/** Call Cloudflare AI Gateway OpenAI-compat endpoint. Returns { ok, status, data } (data is OpenAI-format).
 *  OpenAI URL must be: https://gateway.ai.cloudflare.com/v1/{account_id}/inneranimalmedia/openai/chat/completions
 *  (set AI_GATEWAY_OPENAI_BASE_URL or AI_GATEWAY_BASE_URL ending with /openai for OpenAI). */
async function callGatewayChat(env, systemWithBlurb, apiMessages, gatewayModel, images) {
  const isOpenAI = gatewayModel && gatewayModel.startsWith('openai');
  const baseOpenAI = (env.AI_GATEWAY_OPENAI_BASE_URL || (env.AI_GATEWAY_BASE_URL || '').replace(/\/compat\/?$/, '') + '/openai').replace(/\/$/, '');
  const baseCompat = (env.AI_GATEWAY_BASE_URL || '').replace(/\/$/, '');
  const base = isOpenAI ? baseOpenAI : baseCompat;
  if (!base) return null;
  const url = `${base}/chat/completions`;
  const headers = { 'Content-Type': 'application/json' };
  if (gatewayModel && gatewayModel.startsWith('anthropic')) {
    headers['Authorization'] = `Bearer ${env.ANTHROPIC_API_KEY || ''}`;
    headers['cf-aig-authorization'] = `Bearer ${env.AI_GATEWAY_TOKEN || env.CF_AIG_TOKEN || ''}`;
  } else if (gatewayModel && gatewayModel.startsWith('google')) {
    headers['Authorization'] = `Bearer ${env.GOOGLE_AI_API_KEY || ''}`;
    headers['cf-aig-authorization'] = `Bearer ${env.AI_GATEWAY_TOKEN || env.CF_AIG_TOKEN || ''}`;
  } else {
    const gatewayToken = env.AI_GATEWAY_TOKEN || env.CF_AIG_TOKEN;
    if (gatewayToken) headers['cf-aig-authorization'] = `Bearer ${gatewayToken}`;
    if (env.OPENAI_API_KEY) headers['Authorization'] = `Bearer ${env.OPENAI_API_KEY}`;
  }

  const withSystem = [{ role: 'system', content: systemWithBlurb }, ...apiMessages.map((m, i) => {
    const isLastUser = i === apiMessages.length - 1 && m.role === 'user' && images.length > 0;
    const content = isLastUser ? buildOpenAIContent(m.content, images) : m.content;
    return { role: m.role, content };
  })];

  const openaiModelKey = gatewayModel && gatewayModel.startsWith('openai/')
    ? gatewayModel.slice('openai/'.length)
    : gatewayModel;

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: openaiModelKey, messages: withSystem }),
    });
    const data = await resp.json();
    return { ok: resp.ok, status: resp.status, data };
  } catch (err) {
    const modelKey = gatewayModel || '(unknown)';
    if (isOpenAI) {
      console.log('[gateway] OpenAI call failed:', err?.message ?? err, 'model:', modelKey);
    } else if (gatewayModel && gatewayModel.startsWith('google')) {
      console.log('[gateway] Google call failed:', err?.message ?? err, 'model:', modelKey);
    } else {
      console.log('[gateway] Anthropic call failed:', err?.message ?? err, 'model:', modelKey);
    }
    return { ok: false, status: 502, data: { error: err?.message ?? String(err) } };
  }
}

function getR2Binding(env, bucketName) {
  const map = {
    'inneranimalmedia-assets': env.ASSETS,
    'splineicons': env.CAD_ASSETS,
    'agent-sam': env.DASHBOARD,
    'iam-platform': env.R2,
  };
  return map[bucketName] || null;
}

function getContentTypeFromKey(key) {
  const ext = (key.split('.').pop() || '').toLowerCase().replace(/[#?].*$/, '');
  const types = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
    svg: 'image/svg+xml', ico: 'image/x-icon', bmp: 'image/bmp',
    html: 'text/html', htm: 'text/html', css: 'text/css', js: 'application/javascript', mjs: 'application/javascript',
    jsx: 'text/jsx', ts: 'text/typescript', tsx: 'text/tsx',
    json: 'application/json', xml: 'application/xml', txt: 'text/plain', md: 'text/markdown',
    pdf: 'application/pdf', mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', wav: 'audio/wav',
  };
  return types[ext] || null;
}

const R2_S3_HOST = 'ede6590ac0d2fb7daf155b35653457b2.r2.cloudflarestorage.com';
const EMPTY_HASH = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

async function sha256hex(message) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(message));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmacHex(key, message) {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmacBytes(key, message) {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    typeof key === 'string' ? new TextEncoder().encode(key) : key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
  return new Uint8Array(sig);
}

async function getSigningKey(secret, date, region, service) {
  const kDate = await hmacBytes('AWS4' + secret, date);
  const kRegion = await hmacBytes(kDate, region);
  const kService = await hmacBytes(kRegion, service);
  return hmacBytes(kService, 'aws4_request');
}

async function signR2Request(method, bucket, path, query, env) {
  const accessKey = env.R2_ACCESS_KEY_ID;
  const secretKey = env.R2_SECRET_ACCESS_KEY;
  if (!accessKey || !secretKey) return null;
  const region = 'auto';
  const service = 's3';
  const host = R2_S3_HOST;
  const endpoint = `https://${host}/${bucket}${path}${query ? '?' + query : ''}`;

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z';
  const dateStamp = amzDate.slice(0, 8);

  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${EMPTY_HASH}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = [
    method,
    `/${bucket}${path}`,
    query || '',
    canonicalHeaders,
    signedHeaders,
    EMPTY_HASH,
  ].join('\n');

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, await sha256hex(canonicalRequest)].join('\n');

  const signingKey = await getSigningKey(secretKey, dateStamp, region, service);
  const signature = await hmacHex(signingKey, stringToSign);

  const authHeader = `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return { endpoint, headers: { 'x-amz-content-sha256': EMPTY_HASH, 'x-amz-date': amzDate, Authorization: authHeader } };
}

function parseListObjectsV2Xml(xml) {
  const objects = [];
  const prefixes = [];
  let keyCount = 0;
  let isTruncated = false;
  let nextToken = null;

  const keyCountMatch = xml.match(/<KeyCount>([^<]*)<\/KeyCount>/);
  if (keyCountMatch) keyCount = parseInt(keyCountMatch[1], 10) || 0;

  if (/<IsTruncated>true<\/IsTruncated>/i.test(xml)) isTruncated = true;

  const nextMatch = xml.match(/<NextContinuationToken>([^<]*)<\/NextContinuationToken>/);
  if (nextMatch) nextToken = nextMatch[1];

  const contentsBlocks = xml.match(/<Contents>[\s\S]*?<\/Contents>/g) || [];
  for (const block of contentsBlocks) {
    const keyMatch = block.match(/<Key>([^<]*)<\/Key>/);
    const sizeMatch = block.match(/<Size>([^<]*)<\/Size>/);
    const lastModMatch = block.match(/<LastModified>([^<]*)<\/LastModified>/);
    const key = keyMatch ? keyMatch[1] : '';
    const size = sizeMatch ? parseInt(sizeMatch[1], 10) || 0 : 0;
    const lastModified = lastModMatch ? lastModMatch[1] : null;
    objects.push({ key, size, lastModified });
  }

  const prefixBlocks = xml.match(/<CommonPrefixes>[\s\S]*?<\/CommonPrefixes>/g) || [];
  for (const block of prefixBlocks) {
    const prefixMatch = block.match(/<Prefix>([^<]*)<\/Prefix>/);
    if (prefixMatch) prefixes.push(prefixMatch[1]);
  }

  return { keyCount, isTruncated, nextToken, objects, prefixes };
}

function buildR2Query(params) {
  const keys = Object.keys(params).filter((k) => params[k] != null && params[k] !== '');
  keys.sort();
  return keys.map((k) => k + '=' + encodeURIComponent(params[k])).join('&');
}

async function handleR2Api(request, url, env) {
  const path = url.pathname.replace(/\/$/, '') || '/';
  const pathLower = path.toLowerCase();
  const method = (request.method || 'GET').toUpperCase();

  if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);

  try {
    if (pathLower === '/api/r2/stats') {
      const row = await env.DB.prepare(
        `SELECT
  COUNT(*) as total_buckets,
  COALESCE(SUM(object_count), 0) as total_objects,
  COALESCE(SUM(total_bytes), 0) as total_bytes,
  SUM(CASE WHEN is_live_connected = 1 THEN 1 ELSE 0 END) as live_count,
  MAX(last_inventoried_at) as last_synced
FROM r2_bucket_summary`
      ).first();
      const totalObjects = row?.total_objects ?? 0;
      const totalBytes = row?.total_bytes ?? 0;
      return jsonResponse({
        total_buckets: row?.total_buckets ?? 0,
        total_objects: totalObjects,
        objects: totalObjects,
        total_bytes: totalBytes,
        size_bytes: totalBytes,
        live_count: row?.live_count ?? 0,
        last_synced: row?.last_synced ?? null,
      });
    }

    if (pathLower === '/api/r2/sync' && method === 'POST') {
      const BOUND_BUCKET_NAMES = ['inneranimalmedia-assets', 'splineicons', 'agent-sam', 'iam-platform'];
      const nowIso = new Date().toISOString();
      const results = [];
      for (const name of BOUND_BUCKET_NAMES) {
        const binding = getR2Binding(env, name);
        if (!binding || !binding.list) continue;
        let cursor;
        let totalBytes = 0;
        let count = 0;
        const limit = 1000;
        do {
          const list = await binding.list({ limit, cursor });
          const objects = list.objects || [];
          for (const obj of objects) {
            totalBytes += obj.size || 0;
            count++;
          }
          cursor = list.truncated ? list.cursor : undefined;
        } while (cursor);
        try {
          await env.DB.prepare(
            'UPDATE r2_bucket_summary SET total_bytes = ?, object_count = ?, total_mb = ?, last_inventoried_at = datetime(\'now\'), updated_at = datetime(\'now\') WHERE bucket_name = ?'
          ).bind(totalBytes, count, totalBytes / 1048576.0, name).run();
        } catch (_) {}
        await env.DB.prepare(
          "INSERT OR REPLACE INTO r2_bucket_summary (bucket_name, object_count, total_bytes, total_mb, is_live_connected, last_inventoried_at, updated_at) VALUES (?, ?, ?, ?, 1, datetime('now'), datetime('now'))"
        ).bind(name, count, totalBytes, totalBytes / 1048576.0).run().catch(() => {});
        results.push({ bucket: name, objects: count, total_bytes: totalBytes });
      }
      return jsonResponse({ success: true, refreshed: results, inventoried_at: nowIso });
    }

    if (pathLower === '/api/r2/buckets') {
      const BOUND_BUCKET_NAMES = ['inneranimalmedia-assets', 'splineicons', 'agent-sam', 'iam-platform'];
      try {
        const { results } = await env.DB.prepare(
          'SELECT bucket_name, creation_date FROM r2_bucket_list ORDER BY creation_date DESC'
        ).all();
        const summaries = await env.DB.prepare(
          'SELECT bucket_name, object_count, total_bytes FROM r2_bucket_summary'
        ).all().then(({ results: rows }) => (rows || []).reduce((acc, row) => { acc[row.bucket_name] = row; return acc; }, {}));
        return jsonResponse({
          buckets: (results || []).map((r) => {
            const s = summaries[r.bucket_name];
            return {
              bucket_name: r.bucket_name,
              creation_date: r.creation_date,
              object_count: s?.object_count ?? 0,
              size_bytes: s?.total_bytes ?? 0,
            };
          }),
          bound_bucket_names: BOUND_BUCKET_NAMES,
        });
      } catch (_) {
        const { results } = await env.DB.prepare(
          'SELECT bucket_name, last_inventoried_at AS creation_date, object_count, total_bytes FROM r2_bucket_summary ORDER BY total_bytes DESC'
        ).all();
        return jsonResponse({
          buckets: (results || []).map((r) => ({
            bucket_name: r.bucket_name,
            creation_date: r.creation_date,
            object_count: r.object_count ?? 0,
            size_bytes: r.total_bytes ?? 0,
          })),
          bound_bucket_names: BOUND_BUCKET_NAMES,
        });
      }
    }

    if (pathLower === '/api/r2/list' && method === 'GET') {
      const bucket = url.searchParams.get('bucket');
      const prefix = url.searchParams.get('prefix') || '';
      const recursive = url.searchParams.get('recursive') === '1' || url.searchParams.get('recursive') === 'true';
      if (!bucket) return jsonResponse({ error: 'bucket required' }, 400);
      const binding = getR2Binding(env, bucket);
      if (binding && binding.list) {
        if (recursive) {
          const allObjects = [];
          let cursor;
          do {
            const list = await binding.list({ prefix, limit: 1000, cursor });
            const rawObjects = list.objects || [];
            for (const o of rawObjects) {
              if (o.key.endsWith('/')) continue;
              allObjects.push({
                key: o.key,
                size: o.size ?? 0,
                lastModified: o.uploaded ? new Date(o.uploaded).toISOString() : null,
                last_modified: o.uploaded ? new Date(o.uploaded).toISOString() : null,
              });
            }
            cursor = list.truncated ? list.cursor : undefined;
          } while (cursor);
          return jsonResponse({ objects: allObjects, prefixes: [] });
        }
        const list = await binding.list({ prefix, delimiter: '/', limit: 1000 });
        const rawObjects = list.objects || [];
        const objects = rawObjects.filter((o) => !o.key.endsWith('/')).map((o) => ({
          key: o.key,
          size: o.size ?? 0,
          lastModified: o.uploaded ? new Date(o.uploaded).toISOString() : null,
          last_modified: o.uploaded ? new Date(o.uploaded).toISOString() : null,
        }));
        const prefixes = list.rolledUpPrefixes && list.rolledUpPrefixes.length
          ? list.rolledUpPrefixes
          : [...new Set(rawObjects.filter((o) => o.key.endsWith('/')).map((o) => o.key))];
        return jsonResponse({ objects, prefixes });
      }
      const signed = await signR2Request(
        'GET',
        bucket,
        '',
        recursive
          ? buildR2Query({ 'list-type': '2', prefix, 'max-keys': '1000' })
          : buildR2Query({ 'list-type': '2', prefix, delimiter: '/', 'max-keys': '200' }),
        env
      );
      if (!signed) {
        return jsonResponse({
          error: 'Bucket "' + bucket + '" is not bound. List is only available for bound buckets (inneranimalmedia-assets, splineicons, agent-sam, iam-platform) or when R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY are set.',
          code: 'BUCKET_NOT_BOUND',
        }, 400);
      }
      const listResp = await fetch(signed.endpoint, { method: 'GET', headers: signed.headers });
      if (!listResp.ok) {
        const errBody = await listResp.text();
        return jsonResponse({ error: 'R2 list failed', status: listResp.status, r2_error: errBody }, 400);
      }
      const listXml = await listResp.text();
      const parsed = parseListObjectsV2Xml(listXml);
      const objects = parsed.objects.map((o) => ({
        key: o.key,
        size: o.size,
        lastModified: o.lastModified,
        last_modified: o.lastModified,
      }));
      return jsonResponse({ objects, prefixes: parsed.prefixes || [] });
    }

    if (pathLower === '/api/r2/search' && method === 'GET') {
      const bucket = url.searchParams.get('bucket');
      const q = (url.searchParams.get('q') || '').trim().toLowerCase();
      if (!bucket) return jsonResponse({ error: 'bucket required' }, 400);
      if (!q || q.length < 2) return jsonResponse([]);
      const binding = getR2Binding(env, bucket);
      if (!binding || !binding.list) return jsonResponse([]);
      const allObjects = [];
      let cursor;
      const maxScan = 500;
      do {
        const list = await binding.list({ prefix: '', limit: 500, cursor });
        const rawObjects = list.objects || [];
        for (const o of rawObjects) {
          if (o.key.endsWith('/')) continue;
          if (o.key.toLowerCase().includes(q)) {
            allObjects.push({
              key: o.key,
              path: o.key,
              name: o.key.split('/').pop() || o.key,
              size: o.size ?? 0,
              last_modified: o.uploaded ? new Date(o.uploaded).toISOString() : null,
            });
            if (allObjects.length >= 100) break;
          }
        }
        if (allObjects.length >= 100) break;
        cursor = list.truncated ? list.cursor : undefined;
      } while (cursor && allObjects.length < 100);
      return jsonResponse(allObjects);
    }

    if (pathLower === '/api/r2/upload' && method === 'POST') {
      const bucket = url.searchParams.get('bucket');
      const key = url.searchParams.get('key') || `upload/${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      if (!bucket) return jsonResponse({ error: 'bucket required' }, 400);
      const binding = getR2Binding(env, bucket);
      if (!binding) return jsonResponse({ error: 'Bucket not bound' }, 400);
      const contentType = request.headers.get('Content-Type') || 'application/octet-stream';
      const body = await request.arrayBuffer();
      await binding.put(key, body, { httpMetadata: { contentType } });
      const publicUrl = `${url.origin}/api/r2/buckets/${encodeURIComponent(bucket)}/object/${encodeURIComponent(key)}`;
      return jsonResponse({ url: publicUrl, key });
    }

    if (pathLower === '/api/r2/delete' && method === 'DELETE') {
      const bucket = url.searchParams.get('bucket');
      const key = url.searchParams.get('key');
      if (!bucket || !key) return jsonResponse({ error: 'bucket and key required' }, 400);
      const binding = getR2Binding(env, bucket);
      if (!binding) return jsonResponse({ error: 'Bucket not bound' }, 400);
      await binding.delete(key);
      return jsonResponse({ deleted: true });
    }

    if (pathLower === '/api/r2/file' && method === 'DELETE') {
      let body;
      try { body = await request.json(); } catch (_) { return jsonResponse({ error: 'Invalid JSON' }, 400); }
      const bucket = body?.bucket;
      const key = body?.key;
      if (!bucket || !key) return jsonResponse({ error: 'bucket and key required' }, 400);
      const binding = getR2Binding(env, bucket);
      if (!binding) return jsonResponse({ error: 'Bucket not bound' }, 400);
      await binding.delete(key);
      return jsonResponse({ success: true });
    }

    if (pathLower === '/api/r2/url' && method === 'GET') {
      const bucket = url.searchParams.get('bucket');
      const key = url.searchParams.get('key');
      if (!bucket || !key) return jsonResponse({ error: 'bucket and key required' }, 400);
      const presignedUrl = `${url.origin}/api/r2/buckets/${encodeURIComponent(bucket)}/object/${encodeURIComponent(key)}`;
      return jsonResponse({ url: presignedUrl });
    }

    if (pathLower === '/api/r2/buckets/bulk-action' && method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const buckets = Array.isArray(body?.buckets) ? body.buckets : [];
      const action = body?.action;
      if (buckets.length === 0 || !action) return jsonResponse({ error: 'buckets array and action required' }, 400);
      const allowed = ['archive', 'delete', 'tag', 'set-priority'];
      if (!allowed.includes(action)) return jsonResponse({ error: 'action must be one of: ' + allowed.join(', ') }, 400);
      if (action === 'set-priority' && body.priority != null) {
        for (const b of buckets) {
          await env.DB.prepare('UPDATE r2_buckets SET priority = ? WHERE bucket_name = ?').bind(body.priority, b).run().catch(() => {});
        }
      }
      if (action === 'archive' || action === 'delete') {
        for (const b of buckets) {
          await env.DB.prepare("UPDATE r2_bucket_summary SET cleanup_status = ? WHERE bucket_name = ?").bind(action === 'delete' ? 'delete' : 'archive', b).run().catch(() => {});
        }
      }
      if (action === 'tag' && (body.tag != null || body.cleanup_notes != null)) {
        const tagVal = body.cleanup_notes != null ? body.cleanup_notes : body.tag;
        for (const b of buckets) {
          await env.DB.prepare('UPDATE r2_bucket_summary SET cleanup_notes = ? WHERE bucket_name = ?').bind(tagVal, b).run().catch(() => {});
        }
      }
      return jsonResponse({ ok: true, action, processed: buckets.length });
    }

    const bucketsNameMatch = path.match(/^\/api\/r2\/buckets\/([^/]+)$/i);
    if (bucketsNameMatch) {
      const name = decodeURIComponent(bucketsNameMatch[1]);
      if (method === 'GET') {
        const summary = await env.DB.prepare('SELECT * FROM r2_bucket_summary WHERE bucket_name = ?').bind(name).first();
        const bucket = await env.DB.prepare('SELECT * FROM r2_buckets WHERE bucket_name = ?').bind(name).first();
        return jsonResponse({ summary: summary || null, bucket: bucket || null });
      }
      if (method === 'PUT') {
        const body = await request.json().catch(() => ({}));
        await env.DB.prepare(
          'UPDATE r2_buckets SET display_name = COALESCE(?, display_name), description = COALESCE(?, description), priority = COALESCE(?, priority), is_active = COALESCE(?, is_active) WHERE bucket_name = ?'
        ).bind(body.display_name ?? null, body.description ?? null, body.priority ?? null, body.is_active ?? null, name).run();
        return jsonResponse({ ok: true });
      }
    }

    const bucketsObjectsMatch = path.match(/^\/api\/r2\/buckets\/([^/]+)\/objects$/i);
    if (bucketsObjectsMatch && method === 'GET') {
      const name = decodeURIComponent(bucketsObjectsMatch[1]);
      const { results } = await env.DB.prepare('SELECT * FROM r2_object_inventory WHERE bucket_name = ? ORDER BY object_key').bind(name).all();
      return jsonResponse({ objects: results || [] });
    }

    const syncMatch = path.match(/^\/api\/r2\/buckets\/([^/]+)\/sync$/i);
    if (syncMatch && method === 'POST') {
      const name = decodeURIComponent(syncMatch[1]);
      const nowIso = new Date().toISOString();
      const binding = getR2Binding(env, name);
      const BOUND_NAMES = ['inneranimalmedia-assets', 'splineicons', 'agent-sam', 'iam-platform'];

      if (binding && binding.list) {
        try {
          let cursor;
          let totalBytes = 0;
          let count = 0;
          const limit = 1000;
          do {
            const list = await binding.list({ limit, cursor });
            const objects = list.objects || [];
            for (const obj of objects) {
              totalBytes += obj.size || 0;
              count++;
              const uploadedAt = obj.uploaded ? new Date(obj.uploaded).toISOString() : null;
              await env.DB.prepare(
                'INSERT INTO r2_object_inventory (bucket_name, object_key, etag, size_bytes, uploaded_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(bucket_name, object_key) DO UPDATE SET etag = excluded.etag, size_bytes = excluded.size_bytes, uploaded_at = excluded.uploaded_at'
              ).bind(name, obj.key, obj.etag || null, obj.size ?? 0, uploadedAt).run().catch(() => {});
            }
            cursor = list.truncated ? list.cursor : undefined;
          } while (cursor);
          try {
            await env.DB.prepare(
              'UPDATE r2_bucket_summary SET total_bytes = ?, object_count = ?, total_mb = ?, last_inventoried_at = ?, updated_at = datetime(\'now\') WHERE bucket_name = ?'
            ).bind(totalBytes, count, totalBytes / 1048576.0, nowIso, name).run();
          } catch (_) {
            await env.DB.prepare(
              "INSERT OR REPLACE INTO r2_bucket_summary (bucket_name, object_count, total_bytes, total_mb, is_live_connected, last_inventoried_at, updated_at) VALUES (?, ?, ?, ?, 1, datetime('now'), datetime('now'))"
            ).bind(name, count, totalBytes, totalBytes / 1048576.0).run().catch(() => {});
          }
          return jsonResponse({ success: true, bucket: name, objects: count, total_bytes: totalBytes, inventoried_at: nowIso });
        } catch (syncErr) {
          const msg = syncErr?.message || String(syncErr);
          return jsonResponse({ error: 'Sync failed: ' + msg, code: 'SYNC_ERROR', bucket: name }, 400);
        }
      }

      if (!env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) {
        return jsonResponse({
          error: 'Bucket "' + name + '" is not bound to this worker. Sync is only available for bound buckets: ' + BOUND_NAMES.join(', ') + '. To sync other buckets, set R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY secrets.',
          code: 'BUCKET_NOT_BOUND',
          bound_bucket_names: BOUND_NAMES,
        }, 400);
      }

      let totalBytes = 0;
      let count = 0;
      let nextToken = null;
      do {
        const query = nextToken
          ? buildR2Query({ 'list-type': '2', 'max-keys': '1000', 'continuation-token': nextToken })
          : buildR2Query({ 'list-type': '2', 'max-keys': '1000' });
        const s = await signR2Request('GET', name, '', query, env);
        if (!s) return jsonResponse({ error: 'R2 S3 sign failed' }, 503);
        const listResp = await fetch(s.endpoint, { method: 'GET', headers: s.headers });
        if (!listResp.ok) return jsonResponse({ error: 'R2 list failed', status: listResp.status }, listResp.status >= 500 ? 502 : 400);
        const listXml = await listResp.text();
        const parsed = parseListObjectsV2Xml(listXml);
        for (const o of parsed.objects) {
          totalBytes += o.size;
          count++;
          const uploadedAt = o.lastModified || null;
          await env.DB.prepare(
            'INSERT INTO r2_object_inventory (bucket_name, object_key, etag, size_bytes, uploaded_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(bucket_name, object_key) DO UPDATE SET etag = excluded.etag, size_bytes = excluded.size_bytes, uploaded_at = excluded.uploaded_at'
          ).bind(name, o.key, null, o.size, uploadedAt).run().catch(() => {});
        }
        nextToken = parsed.isTruncated ? parsed.nextToken : null;
      } while (nextToken);

      try {
        await env.DB.prepare(
          'UPDATE r2_bucket_summary SET total_bytes = ?, object_count = ?, total_mb = ?, last_inventoried_at = ?, updated_at = datetime(\'now\') WHERE bucket_name = ?'
        ).bind(totalBytes, count, totalBytes / 1048576.0, nowIso, name).run();
      } catch (_) {
        await env.DB.prepare(
          "INSERT OR REPLACE INTO r2_bucket_summary (bucket_name, object_count, total_bytes, total_mb, is_live_connected, last_inventoried_at, updated_at) VALUES (?, ?, ?, ?, 1, datetime('now'), datetime('now'))"
        ).bind(name, count, totalBytes, totalBytes / 1048576.0).run().catch(() => {});
      }
      return jsonResponse({ success: true, bucket: name, objects: count, total_bytes: totalBytes, inventoried_at: nowIso });
    }

    const urlKeyMatch = path.match(/^\/api\/r2\/buckets\/([^/]+)\/url\/(.+)$/i);
    if (urlKeyMatch && method === 'GET') {
      const name = decodeURIComponent(urlKeyMatch[1]);
      const key = decodeURIComponent(urlKeyMatch[2]);
      const proxyUrl = `${url.origin}/api/r2/buckets/${encodeURIComponent(name)}/object/${encodeURIComponent(key)}`;
      return jsonResponse({ url: proxyUrl });
    }

    const objectKeyMatch = path.match(/^\/api\/r2\/buckets\/([^/]+)\/object\/(.+)$/i);
    if (objectKeyMatch && method === 'GET') {
      const name = decodeURIComponent(objectKeyMatch[1]);
      const key = decodeURIComponent(objectKeyMatch[2]);
      const binding = getR2Binding(env, name);
      if (binding) {
        const obj = await binding.get(key);
        if (!obj) return jsonResponse({ error: 'Not found' }, 404);
        const headers = new Headers();
        if (obj.etag) headers.set('ETag', obj.etag);
        let contentType = obj.httpMetadata?.contentType || null;
        if (!contentType || contentType === 'application/octet-stream') {
          contentType = getContentTypeFromKey(key) || contentType || 'application/octet-stream';
        }
        headers.set('Content-Type', contentType);
        headers.set('Content-Disposition', 'inline');
        return new Response(obj.body, { status: 200, headers });
      }
      const signed = await signR2Request('GET', name, '/' + key, '', env);
      if (!signed) return jsonResponse({ error: 'Bucket not bound' }, 404);
      const getResp = await fetch(signed.endpoint, { method: 'GET', headers: signed.headers });
      if (!getResp.ok) {
        return jsonResponse({ error: 'R2 get failed', status: getResp.status }, getResp.status === 404 ? 404 : 400);
      }
      const contentType = getResp.headers.get('Content-Type') || getContentTypeFromKey(key) || 'application/octet-stream';
      return new Response(getResp.body, {
        status: getResp.status,
        headers: { 'Content-Type': contentType, 'Content-Disposition': 'inline' },
      });
    }
    if (objectKeyMatch && method === 'PUT') {
      const name = decodeURIComponent(objectKeyMatch[1]);
      const key = decodeURIComponent(objectKeyMatch[2]);
      const binding = getR2Binding(env, name);
      if (!binding) return jsonResponse({ error: 'Bucket not bound' }, 404);
      const contentType = request.headers.get('Content-Type') || 'text/plain';
      const body = await request.arrayBuffer();
      await binding.put(key, body, { httpMetadata: { contentType } });
      return jsonResponse({ ok: true, key });
    }

    const deleteObjectMatch = path.match(/^\/api\/r2\/buckets\/([^/]+)\/object$/i);
    if (deleteObjectMatch && method === 'DELETE') {
      const name = decodeURIComponent(deleteObjectMatch[1]);
      const body = await request.json().catch(() => ({}));
      const key = body?.key;
      if (!key) return jsonResponse({ error: 'key required in body' }, 400);
      const proposalId = crypto.randomUUID();
      const historyId = crypto.randomUUID();
      const now = Math.floor(Date.now() / 1000);
      const command = `wrangler r2 object delete ${name}/${key}`;
      await env.DB.prepare(
        "INSERT INTO agent_command_proposals (id, command_text, session_id, status, created_at, decided_at) VALUES (?,?,?,?,?,?)"
      ).bind(proposalId, command, body.session_id || null, 'approved', now, now).run();
      try {
        await env.DB.prepare(
          "INSERT INTO terminal_history (id, direction, content, triggered_by, terminal_session_id, agent_session_id, recorded_at) VALUES (?,?,?,?,?,?,?)"
        ).bind(historyId, 'input', command, 'user', body.session_id || null, null, now).run();
      } catch (_) {
        await env.DB.prepare(
          "INSERT INTO terminal_history (id, direction, content, triggered_by, session_id, created_at) VALUES (?,?,?,?,?,?)"
        ).bind(historyId, 'input', command, 'user', body.session_id || null, now).run().catch(() => {});
      }
      return jsonResponse({ ok: true, proposal_id: proposalId, message: 'Run in terminal to execute: ' + command });
    }

    const uploadMatch = path.match(/^\/api\/r2\/upload\/([^/]+)$/i);
    if (uploadMatch && method === 'POST') {
      const name = decodeURIComponent(uploadMatch[1]);
      const binding = getR2Binding(env, name);
      if (!binding) return jsonResponse({ error: 'Bucket not bound' }, 400);
      const contentType = request.headers.get('Content-Type') || 'application/octet-stream';
      const key = url.searchParams.get('key') || `upload/${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const body = await request.arrayBuffer();
      await binding.put(key, body, { httpMetadata: { contentType } });
      await env.DB.prepare(
        'INSERT INTO r2_objects (bucket_name, key, size_bytes, content_type, created_at) VALUES (?, ?, ?, ?, ?)'
      ).bind(name, key, body.byteLength, contentType, new Date().toISOString()).run().catch(() => {});
      return jsonResponse({ ok: true, key, size: body.byteLength });
    }

    return jsonResponse({ error: 'Not found' }, 404);
  } catch (e) {
    return jsonResponse({ error: String(e?.message || e) }, 500);
  }
}

async function handleAgentApi(request, url, env, ctx) {
  const pathLower = url.pathname.replace(/\/$/, '').toLowerCase();
  const method = (request.method || 'GET').toUpperCase();

  try {
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);

    if (pathLower === '/api/agent/boot') {
      let agents = [], mcp_services = [], models = [], sessions = [], prompts = [];
      try {
        const batch = await env.DB.batch([
          env.DB.prepare("SELECT id, name, role_name, mode FROM agent_ai_sam WHERE status='active' ORDER BY name"),
          env.DB.prepare("SELECT id, service_name, service_type, endpoint_url, authentication_type, token_secret_name, is_active, health_status FROM mcp_services WHERE is_active=1 ORDER BY service_name"),
          env.DB.prepare("SELECT id, provider, model_key, display_name, input_rate_per_mtok, output_rate_per_mtok, context_max_tokens FROM ai_models WHERE is_active=1 AND show_in_picker=1 ORDER BY CASE provider WHEN 'anthropic' THEN 1 WHEN 'google' THEN 2 WHEN 'openai' THEN 3 WHEN 'workers_ai' THEN 4 ELSE 5 END, input_rate_per_mtok ASC"),
          env.DB.prepare("SELECT id, session_type, status, started_at FROM agent_sessions WHERE status='active' ORDER BY updated_at DESC LIMIT 20"),
          env.DB.prepare("SELECT id, role, content, variant, ab_weight, agent_id FROM iam_agent_sam_prompts WHERE is_active=1"),
        ]);
        agents = batch[0]?.results ?? [];
        mcp_services = batch[1]?.results ?? [];
        models = batch[2]?.results ?? [];
        sessions = batch[3]?.results ?? [];
        prompts = batch[4]?.results ?? [];
      } catch (_) {}
      console.log('[agent/boot] providers/models shown:', models.length, models.map(m => `${m.provider}:${m.model_key}`).join(', '));
      let default_model_id = null;
      try {
        const configRow = await env.DB.prepare('SELECT default_model_id FROM agent_configs WHERE id = ?').bind('agent-sam-primary').first();
        default_model_id = configRow?.default_model_id ?? null;
      } catch (_) {}
      let integrations = {};
      try {
        const session = await getSession(env, request);
        // user_oauth_tokens.user_id matches login email; superadmin sessions use user_id=sam_primeaux but _session_user_id/email is the real account
        const oauthUserId = session && (session._session_user_id || session.email || session.user_id);
        if (oauthUserId) {
          const tokRows = await env.DB.prepare(
            `SELECT provider FROM user_oauth_tokens WHERE user_id=?`
          ).bind(oauthUserId).all();
          for (const row of tokRows.results) integrations[row.provider] = true;
          // Alias google_drive → google for frontend compatibility
          if (integrations['google_drive']) integrations['google'] = true;
        }
      } catch (_) {}
      const payload = { agents, mcp_services, models, sessions, prompts, cidi: [], integrations, default_model_id };
      return jsonResponse(payload);
    }

    if (pathLower === '/api/agent/conversations/search' && method === 'GET') {
      const q = (url.searchParams.get('q') || '').trim();
      if (!q) return jsonResponse([]);
      const like = '%' + q.replace(/%/g, '\\%').replace(/_/g, '\\_') + '%';
      const { results } = await env.DB.prepare(
        `SELECT id, COALESCE(name, title, '') as title FROM agent_conversations WHERE name LIKE ? ESCAPE '\\' OR title LIKE ? ESCAPE '\\' ORDER BY id DESC LIMIT 20`
      ).bind(like, like).all();
      return jsonResponse((results || []).map((r) => ({ id: r.id, title: r.title || 'New Conversation' })));
    }

    if (pathLower === '/api/terminal/session/register' && method === 'POST') {
      const auth = (request.headers.get('Authorization') || '').trim();
      const prefix = 'Bearer ';
      const tokenFromHeader = auth.toLowerCase().startsWith(prefix.toLowerCase())
        ? auth.slice(prefix.length).trim()
        : '';
      const expectedToken = (env.PTY_AUTH_TOKEN || '').trim();
      if (!expectedToken) {
        return new Response(JSON.stringify({ error: 'PTY_AUTH_TOKEN not configured on worker' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
      }
      const normalize = (s) => (s || '').replace(/\s/g, '');
      if (normalize(tokenFromHeader) !== normalize(expectedToken)) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
      }
      let body;
      try {
        body = await request.json();
      } catch (_) {
        return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }
      const session_id = body?.session_id ?? '';
      const tunnel_url = body?.tunnel_url ?? '';
      const shell = body?.shell ?? '';
      const cwd = body?.cwd ?? '';
      const cols = body?.cols ?? 80;
      const rows = body?.rows ?? 24;
      if (!session_id || !tunnel_url) {
        return new Response(JSON.stringify({ error: 'session_id and tunnel_url required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }
      try {
        await env.DB.prepare(
          `INSERT INTO terminal_sessions (id, tenant_id, user_id, tunnel_url, status, shell, cwd, cols, rows, auth_token_hash, created_at, updated_at)
           VALUES (?, 'tenant_sam_primeaux', 'sam_primeaux', ?, 'active', ?, ?, ?, ?, '', unixepoch(), unixepoch())
           ON CONFLICT(id) DO UPDATE SET tunnel_url=excluded.tunnel_url, status='active', updated_at=unixepoch()`
        ).bind(session_id, tunnel_url, shell, cwd, cols, rows).run();
      } catch (e) {
        console.error('[terminal/session/register]', e.message);
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (pathLower === '/api/terminal/session/resume' && method === 'GET') {
      const authUser = await getAuthUser(request, env);
      if (!authUser) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
      const userId = authUser.id;
      let session;
      try {
        session = await env.DB.prepare(
          `SELECT id, tunnel_url, shell, cwd, cols, rows
           FROM terminal_sessions
           WHERE user_id = ? AND status = 'active' AND tunnel_url IS NOT NULL AND tunnel_url != ''
           ORDER BY updated_at DESC
           LIMIT 1`
        ).bind(userId).first();
        if (!session) {
          session = await env.DB.prepare(
            `SELECT id, tunnel_url, shell, cwd, cols, rows
             FROM terminal_sessions
             WHERE status = 'active' AND tunnel_url IS NOT NULL AND tunnel_url != ''
             ORDER BY updated_at DESC
             LIMIT 1`
          ).first();
        }
      } catch (e) {
        console.error('[terminal/session/resume]', e.message);
        return new Response(JSON.stringify({ resumable: false }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (!session) return new Response(JSON.stringify({ resumable: false }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      return new Response(JSON.stringify({
        resumable: true,
        session_id: session.id,
        tunnel_url: session.tunnel_url,
        shell: session.shell,
        cwd: session.cwd,
        cols: session.cols,
        rows: session.rows,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // One-hop terminal: return wss URL for logged-in dashboard only (avoids Worker fetch() WebSocket proxy).
    if (pathLower === '/api/agent/terminal/socket-url' && method === 'GET') {
      const session = await getSession(env, request);
      if (!session) return jsonResponse({ error: 'Unauthorized' }, 401);
      const httpsUrl = (env.TERMINAL_WS_URL || '').trim();
      const secret = (env.TERMINAL_SECRET || '').trim();
      if (!httpsUrl || !secret) return jsonResponse({ error: 'Terminal not configured' }, 503);
      let wssUrl = httpsUrl;
      if (httpsUrl.startsWith('https://')) wssUrl = 'wss://' + httpsUrl.slice(8);
      else if (httpsUrl.startsWith('http://')) wssUrl = 'ws://' + httpsUrl.slice(7);
      else if (!httpsUrl.startsWith('wss://') && !httpsUrl.startsWith('ws://')) wssUrl = 'wss://' + httpsUrl.replace(/^\/+/, '');
      const sep = wssUrl.includes('?') ? '&' : '?';
      const url = `${wssUrl}${sep}token=${encodeURIComponent(secret)}`;
      return jsonResponse({ url });
    }

    if (pathLower === '/api/agent/terminal/ws' && method === 'GET') {
      const isWebSocket = request.headers.get('Upgrade') === 'websocket';
      // Allow both HTTP/1.1 websocket upgrade and HTTP/2 (CF strips header)
      // Cloudflare will handle the protocol negotiation
      const session = await getSession(env, request);
      if (!session) {
        console.log('[terminal/ws] 401 Unauthorized (no session)');
        return jsonResponse({ error: 'Unauthorized' }, 401);
      }
      const wsUrl = env.TERMINAL_WS_URL;
      if (!wsUrl) {
        console.log('[terminal/ws] 503 TERMINAL_WS_URL not set');
        return jsonResponse({ error: 'Terminal not configured', hint: 'Set TERMINAL_WS_URL secret and deploy' }, 503);
      }
      const sep = wsUrl.includes('?') ? '&' : '?';
      const wsUrlWithAuth = env.TERMINAL_SECRET
        ? `${wsUrl}${sep}token=${encodeURIComponent(env.TERMINAL_SECRET)}`
        : wsUrl;
      const wsKeyBytes = new Uint8Array(16);
      crypto.getRandomValues(wsKeyBytes);
      const secWebSocketKey = btoa(String.fromCharCode.apply(null, wsKeyBytes));
      const upstreamResp = await fetch(wsUrlWithAuth, {
        headers: {
          Upgrade: 'websocket',
          Connection: 'Upgrade',
          'Sec-WebSocket-Version': '13',
          'Sec-WebSocket-Key': secWebSocketKey,
          'x-terminal-secret': env.TERMINAL_SECRET || '',
        },
      });
      if (upstreamResp.status !== 101) {
        console.log('[terminal/ws] upstream status:', upstreamResp.status, await upstreamResp.text().catch(() => ''));
        return jsonResponse({ error: 'Terminal upstream failed', status: upstreamResp.status }, 502);
      }
      if (!upstreamResp.webSocket) {
        console.log('[terminal/ws] upstream 101 but no webSocket');
        return jsonResponse({ error: 'Terminal upstream did not return WebSocket' }, 502);
      }
      const pair = new WebSocketPair();
      const [clientWs, serverWs] = Object.values(pair);
      serverWs.accept();
      const upstreamWs = upstreamResp.webSocket;
      upstreamWs.accept();
      serverWs.addEventListener('message', (e) => { try { upstreamWs.send(e.data); } catch (_) {} });
      upstreamWs.addEventListener('message', (e) => { try { serverWs.send(e.data); } catch (_) {} });
      let terminalCloseLogged = false;
      const logClose = (source) => {
        if (!terminalCloseLogged) {
          terminalCloseLogged = true;
          console.log('[terminal/ws] closed:', source);
        }
      };
      let terminalBridgeCleaned = false;
      const closeFromBrowserLeg = () => {
        if (terminalBridgeCleaned) return;
        terminalBridgeCleaned = true;
        logClose('client');
        try { upstreamWs.close(); } catch (_) {}
      };
      const closeFromUpstreamLeg = () => {
        if (terminalBridgeCleaned) return;
        terminalBridgeCleaned = true;
        logClose('upstream');
        try { serverWs.close(); } catch (_) {}
      };
      serverWs.addEventListener('close', closeFromBrowserLeg);
      upstreamWs.addEventListener('close', closeFromUpstreamLeg);
      serverWs.addEventListener('error', () => { console.log('[terminal/ws] client leg error (not closing bridge)'); });
      upstreamWs.addEventListener('error', () => { console.log('[terminal/ws] upstream leg error (not closing bridge)'); });
      ctx.waitUntil(new Promise((resolve) => {
        let settled = false;
        const done = () => {
          if (settled) return;
          settled = true;
          resolve();
        };
        serverWs.addEventListener('close', done);
        upstreamWs.addEventListener('close', done);
      }));
      return new Response(null, { status: 101, webSocket: clientWs });
    }

    if (pathLower === '/api/agent/terminal/run' && method === 'POST') {
      try {
        const body = await request.json().catch(() => ({}));
        const command = typeof body?.command === 'string' ? body.command.trim() : '';
        const session_id = body?.session_id ?? null;
        if (!command) return jsonResponse({ error: 'No command' }, 400);
        const { output, command: runCommand } = await runTerminalCommand(env, request, command, session_id);
        try {
          await env.DB.prepare(
            `INSERT INTO agent_command_executions 
   (id, tenant_id, session_id, command_name, command_text, output_text, status, started_at, completed_at)
   VALUES (?, 'system', ?, 'terminal_run', ?, ?, 'completed', unixepoch(), unixepoch())`
          ).bind(crypto.randomUUID(), session_id || null, runCommand, output).run();
        } catch (_) {}
        return jsonResponse({ output, command: runCommand });
      } catch (err) {
        console.error('[terminal/run]', err.message);
        return jsonResponse({ error: err.message }, 500);
      }
    }

    if (pathLower === '/api/agent/terminal/complete' && method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const executionId = body?.execution_id;
      const status = body?.status; // 'completed' | 'failed'
      const outputText = body?.output_text ?? null;
      const exitCode = body?.exit_code ?? null;
      const durationMs = body?.duration_ms ?? null;
      const cloudflareDeploymentId = body?.cloudflare_deployment_id ?? null;
      const deployStatus = body?.deploy_status ?? null; // 'success' | 'failed'
      const deployNotes = body?.deployment_notes ?? body?.output_log ?? null;
      const now = Math.floor(Date.now() / 1000);

      if (executionId && (status === 'completed' || status === 'failed')) {
        try {
          await env.DB.prepare(
            "UPDATE agent_command_executions SET status = ?, output_text = ?, exit_code = ?, duration_ms = ?, completed_at = ? WHERE id = ?"
          ).bind(status, outputText, exitCode, durationMs, now, executionId).run();
        } catch (_) {}
      }

      if (cloudflareDeploymentId && (deployStatus === 'success' || deployStatus === 'failed')) {
        try {
          await env.DB.prepare(
            "UPDATE cloudflare_deployments SET status = ?, deployment_notes = ? WHERE deployment_id = ?"
          ).bind(deployStatus, deployNotes, cloudflareDeploymentId).run();
        } catch (_) {}
      }

      return jsonResponse({ ok: true });
    }

    const sessionIdMatch = pathLower.match(/^\/api\/agent\/sessions\/([^/]+)$/);
    if (sessionIdMatch && !pathLower.endsWith('/messages')) {
      const sessionId = sessionIdMatch[1];
      if (method === 'PATCH') {
        const body = await request.json().catch(() => ({}));
        const updates = [];
        const params = [];
        if (body.name !== undefined && body.name !== null) {
          const name = String(body.name).trim().slice(0, 200);
          updates.push('name = ?');
          params.push(name || null);
        }
        if (body.starred !== undefined) {
          updates.push('is_starred = ?');
          params.push(body.starred ? 1 : 0);
        }
        if (body.project_id !== undefined) {
          updates.push('project_id = ?');
          params.push(body.project_id && String(body.project_id).trim() ? String(body.project_id).trim() : null);
        }
        if (updates.length === 0) return jsonResponse({ error: 'No fields to update' }, 400);
        updates.push('updated_at = unixepoch()');
        params.push(sessionId);
        try {
          await env.DB.prepare(
            `UPDATE agent_conversations SET ${updates.join(', ')} WHERE id = ?`
          ).bind(...params).run();
        } catch (e) {
          return jsonResponse({ error: 'Update failed', detail: e?.message ?? String(e) }, 500);
        }
        return jsonResponse({ ok: true });
      }
      if (method === 'DELETE') {
        try {
          await env.DB.prepare('DELETE FROM agent_messages WHERE conversation_id = ?').bind(sessionId).run();
          await env.DB.prepare('DELETE FROM agent_conversations WHERE id = ?').bind(sessionId).run();
          return jsonResponse({ success: true });
        } catch (e) {
          return jsonResponse({ success: false, error: e?.message ?? String(e) }, 500);
        }
      }
      if (method === 'GET') {
        try {
          const row = await env.DB.prepare('SELECT id, name, title, is_starred, project_id FROM agent_conversations WHERE id=?').bind(sessionId).first();
          if (!row) return jsonResponse({ error: 'Not found' }, 404);
          return jsonResponse({
            id: row.id,
            name: row.name ?? row.title ?? 'New Conversation',
            is_starred: row.is_starred == null ? 0 : row.is_starred,
            project_id: row.project_id ?? null,
          });
        } catch (e) {
          const row = await env.DB.prepare('SELECT id, name, title FROM agent_conversations WHERE id=?').bind(sessionId).first();
          if (!row) return jsonResponse({ error: 'Not found' }, 404);
          return jsonResponse({
            id: row.id,
            name: row.name ?? row.title ?? 'New Conversation',
            is_starred: 0,
            project_id: null,
          });
        }
      }
    }

    const sessionMsgMatch = pathLower.match(/^\/api\/agent\/sessions\/([^/]+)\/messages$/);
    if (sessionMsgMatch) {
      const convId = sessionMsgMatch[1];
      if (method === 'POST') {
        const body = await request.json();
        const id = crypto.randomUUID();
        await env.DB.prepare(
          "INSERT INTO agent_messages (id, conversation_id, role, content, provider, created_at) VALUES (?,?,?,?,?,unixepoch())"
        ).bind(id, convId, body.role, body.content, body.provider || null).run();
        return jsonResponse({ id });
      }
      const { results } = await env.DB.prepare(
        "SELECT * FROM agent_messages WHERE conversation_id=? ORDER BY created_at ASC"
      ).bind(convId).all();
      return jsonResponse(results);
    }

    const playwrightMatch = pathLower.match(/^\/api\/agent\/playwright\/([^/]+)$/);
    if (playwrightMatch) {
      const job = await env.DB.prepare('SELECT * FROM playwright_jobs WHERE id=?').bind(playwrightMatch[1]).first();
      return job ? jsonResponse(job) : jsonResponse({ error: 'Not found' }, 404);
    }

    const playwrightJobMatch = pathLower.match(/^\/api\/playwright\/jobs\/([^/]+)$/);
    if (playwrightJobMatch && (request.method || 'GET').toUpperCase() === 'GET') {
      const id = playwrightJobMatch[1];
      let job = await env.DB.prepare('SELECT * FROM playwright_jobs_v2 WHERE id=?').bind(id).first().catch(() => null);
      if (!job) job = await env.DB.prepare('SELECT * FROM playwright_jobs WHERE id=?').bind(id).first();
      return job ? jsonResponse(job) : jsonResponse({ error: 'Not found' }, 404);
    }

    if (pathLower === '/api/playwright/screenshot' && method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const targetUrl = body.url || '';
      const id = crypto.randomUUID();
      const metadata = JSON.stringify({
        tenant_id: body.tenant_id,
        triggered_by: body.triggered_by,
        ...(body.options || {}),
      });
      try {
        await env.DB.prepare(
          "INSERT INTO playwright_jobs (id, job_type, url, status, metadata, created_at) VALUES (?,?,?,?,?,CURRENT_TIMESTAMP)"
        ).bind(id, body.job_type || 'screenshot', targetUrl, 'pending', metadata).run();
      } catch (e) {
        return jsonResponse({ error: 'playwright_jobs table not available' }, 503);
      }
      console.log('[playwright] bindings check:', {
        hasMYBROWSER: !!env.MYBROWSER,
        hasDASHBOARD: !!env.DASHBOARD,
        hasDB: !!env.DB,
      });
      if (env.MYBROWSER && env.DB) {
        let browser = null;
        try {
          const { launch } = await import('@cloudflare/playwright');
          browser = await Promise.race([
            launch(env.MYBROWSER),
            new Promise((_, reject) => setTimeout(() => reject(new Error('launch timeout')), 10000)),
          ]);
          console.log('[playwright] browser launched');
          const page = await browser.newPage();
          await page.setViewportSize({ width: 1280, height: 800 });
          await Promise.race([
            page.goto(targetUrl || 'https://example.com', { waitUntil: 'domcontentloaded', timeout: 6000 }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('goto timeout')), 6000)),
          ]);
          console.log('[playwright] goto completed');
          await new Promise((r) => setTimeout(r, 500));
          const buf = await page.screenshot({ type: 'png' });
          const imagesToken = env.CLOUDFLARE_IMAGES_TOKEN || env.CLOUDFLARE_IMAGES_API_TOKEN;
          const imagesAccountId = env.CLOUDFLARE_ACCOUNT_ID || env.CLOUDFLARE_IMAGES_ACCOUNT_HASH;
          const formData = new FormData();
          formData.append('file', new Blob([buf], { type: 'image/png' }), `screenshot-${id}.png`);
          const imgRes = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${imagesAccountId}/images/v1`,
            { method: 'POST', headers: { Authorization: `Bearer ${imagesToken}` }, body: formData }
          );
          const imgJson = await imgRes.json();
          const resultUrl = imgJson?.result?.variants?.[0] ?? imgJson?.result?.id ?? null;
          if (!resultUrl) throw new Error('CF Images upload failed: ' + JSON.stringify(imgJson?.errors));
          await env.DB.prepare(
            "UPDATE playwright_jobs SET status='completed', result_url=?, completed_at=CURRENT_TIMESTAMP WHERE id=?"
          ).bind(resultUrl, id).run();
          return jsonResponse({ id, status: 'completed', result_url: resultUrl });
        } catch (err) {
          console.error('[playwright] FAILED:', err?.message ?? String(err));
          const errMsg = String(err?.message || err);
          await env.DB.prepare(
            "UPDATE playwright_jobs SET status='error', error=? WHERE id=?"
          ).bind(errMsg, id).run().catch(() => {});
          return jsonResponse({ id, status: 'error', error: errMsg });
        } finally {
          if (browser) {
            try { await browser.close(); } catch (_) {}
          }
        }
      }
      if (env.MY_QUEUE) await env.MY_QUEUE.send({ jobId: id, job_type: 'screenshot', url: targetUrl });
      return jsonResponse({ id, status: 'pending' });
    }

    const workspaceMatch = pathLower.match(/^\/api\/agent\/workspace\/([^/]+)$/);
    if (workspaceMatch) {
      const wsId = workspaceMatch[1];
      if (method === 'PUT') {
        const body = await request.json();
        const stateJson = JSON.stringify(body.state ?? body);
        try {
          await env.DB.prepare('UPDATE agent_workspace_state SET state_json=?, updated_at=unixepoch() WHERE id=?').bind(stateJson, wsId).run();
        } catch (_) {
          await env.DB.prepare('INSERT INTO agent_workspace_state (id, state_json, updated_at) VALUES (?,?,unixepoch())').bind(wsId, stateJson).run();
        }
        if (env.DASHBOARD) await env.DASHBOARD.put(`sessions/${wsId}/state.json`, stateJson, { httpMetadata: { contentType: 'application/json' } });
        return jsonResponse({ ok: true });
      }
      const ws = await env.DB.prepare('SELECT * FROM agent_workspace_state WHERE id=?').bind(wsId).first();
      return ws ? jsonResponse(ws) : jsonResponse({ error: 'Not found' }, 404);
    }

    if (pathLower === '/api/agent/models') {
      const provider = url.searchParams.get('provider');
      const query = provider
        ? env.DB.prepare("SELECT * FROM ai_models WHERE is_active=1 AND provider=? ORDER BY display_name").bind(provider)
        : env.DB.prepare("SELECT * FROM ai_models WHERE is_active=1 ORDER BY provider, display_name");
      const { results } = await query.all();
      return jsonResponse(results);
    }

    const agentMcpSessionPatch = pathLower.match(/^\/api\/agent\/sessions\/([^/]+)$/);
    if (agentMcpSessionPatch && method === 'PATCH') {
      const conversationId = agentMcpSessionPatch[1];
      let body = {};
      try { body = await request.json(); } catch (_) {}
      const status = body.status != null ? String(body.status) : 'completed';
      const lastActivity = new Date().toISOString();
      try {
        await env.DB.prepare(
          `UPDATE mcp_agent_sessions
           SET status = ?, last_activity = ?, updated_at = unixepoch()
           WHERE conversation_id = ?`
        ).bind(status, lastActivity, conversationId).run();
      } catch (e) {
        return jsonResponse({ error: String(e && e.message ? e.message : e) }, 500);
      }
      return jsonResponse({ success: true });
    }

    if (pathLower === '/api/agent/sessions') {
      if (method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const id = crypto.randomUUID();
        const now = Math.floor(Date.now() / 1000);
        await env.DB.prepare(
          "INSERT INTO agent_sessions (id, tenant_id, session_type, status, state_json, started_at, updated_at, project_id) VALUES (?,?,?,?,?,?,?,?)"
        ).bind(id, env.TENANT_ID || 'system', body.session_type || 'chat', 'active', '{}', now, now, PROJECT_ID).run();
        if (env.SESSION_CACHE) await env.SESSION_CACHE.put(`session:${id}`, JSON.stringify({ id, status: 'active' }), { expirationTtl: 86400 });
        return jsonResponse({ id, status: 'active' });
      }
      const { results } = await env.DB.prepare(
        "SELECT id, session_type, status, state_json, started_at FROM agent_sessions WHERE status='active' ORDER BY updated_at DESC LIMIT 20"
      ).all();
      // Enrich with message_count and has_artifacts (code blocks or attached files)
      const ids = (results || []).map((r) => r.id);
      let messageCounts = {};
      let artifactFlags = {};
      if (ids.length > 0) {
        const placeholders = ids.map(() => '?').join(',');
        const counts = await env.DB.prepare(
          `SELECT conversation_id, COUNT(*) as cnt FROM agent_messages WHERE conversation_id IN (${placeholders}) GROUP BY conversation_id`
        ).bind(...ids).all();
        (counts.results || []).forEach((row) => { messageCounts[row.conversation_id] = row.cnt; });
        const codeOrFile = "content LIKE '%' || char(96) || char(96) || char(96) || '%' OR content LIKE '%[Attached file%'";
        const artifacts = await env.DB.prepare(
          `SELECT conversation_id, MAX(CASE WHEN (${codeOrFile}) THEN 1 ELSE 0 END) as has_artifacts FROM agent_messages WHERE conversation_id IN (${placeholders}) GROUP BY conversation_id`
        ).bind(...ids).all();
        (artifacts.results || []).forEach((row) => { artifactFlags[row.conversation_id] = row.has_artifacts === 1; });
      }
      let namesById = {};
      if (ids.length > 0) {
        try {
          const placeholders = ids.map(() => '?').join(',');
          const namesResult = await env.DB.prepare(
            `SELECT id, name, title FROM agent_conversations WHERE id IN (${placeholders})`
          ).bind(...ids).all();
          (namesResult.results || []).forEach((row) => { namesById[row.id] = row.name ?? row.title ?? 'New Conversation'; });
        } catch (_) {
          try {
            const placeholders = ids.map(() => '?').join(',');
            const namesResult = await env.DB.prepare(
              `SELECT id, name, title FROM agent_conversations WHERE id IN (${placeholders})`
            ).bind(...ids).all();
            (namesResult.results || []).forEach((row) => { namesById[row.id] = row.name ?? row.title ?? 'New Conversation'; });
          } catch (__) {}
        }
      }
      const enriched = (results || []).map((s) => ({
        ...s,
        message_count: messageCounts[s.id] ?? 0,
        has_artifacts: !!artifactFlags[s.id],
        name: namesById[s.id] ?? 'New Conversation',
      }));
      return new Response(JSON.stringify(enriched), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    }

    if (pathLower === '/api/agent/chat' && method === 'POST') {
      const chatStartTime = Date.now();
      const body = await request.json();
      const { model_id, messages: msgList, agent_id, session_id, images: bodyImages, attached_files: bodyFiles, use_ai_gateway: bodyUseGateway, compiled_context: bodyCompiledContext, mode: bodyMode, fileContext: bodyFileContext, audit: bodyAudit } = body;
      const chatMode = (bodyMode === 'ask' || bodyMode === 'plan' || bodyMode === 'debug' || bodyMode === 'agent') ? bodyMode : 'agent';
      console.log('[agent/chat] model_id:', model_id);
      const bodyCompiledContextTrim = typeof bodyCompiledContext === 'string' ? bodyCompiledContext.trim() : '';
      if (!msgList || !Array.isArray(msgList) || msgList.length === 0) return jsonResponse({ error: 'messages required' }, 400);
      const chatSession = await getSession(env, request).catch(() => null);
      const chatUserId = chatSession?.user_id || 'sam_primeaux';
      await ensureWorkSessionAndSignal(env, chatUserId, body?.workspace_id || 'ws_samprimeaux', 'ai', 'agent-chat', {
        mode: chatMode,
        message_count: msgList.length,
      });

      let model;
      if (model_id === 'auto') {
        console.log('[agent/chat] Auto mode activated - selecting optimal model');
        const lastUserContent = msgList?.length > 0
          ? (msgList[msgList.length - 1]?.role === 'user' ? (msgList[msgList.length - 1].content || '') : '')
          : '';
        model = await selectAutoModel(env, lastUserContent);
        console.log('[agent/chat] Auto selected:', model ? `${model.provider}/${model.model_key}` : 'null');
      } else {
        model = await env.DB.prepare('SELECT * FROM ai_models WHERE id = ? OR model_key = ?').bind(model_id, model_id).first();
        console.log('[agent/chat] model_id:', model_id, 'resolved:', model ? `${model.provider}/${model.model_key}` : 'null');
      }
      if (!model) {
        try {
          const available = await env.DB.prepare('SELECT id, model_key, provider FROM ai_models WHERE is_active=1 AND show_in_picker=1 LIMIT 20').all();
          console.log('[agent/chat] available models (picker):', (available?.results ?? []).map(r => `${r.provider}:${r.model_key}`).join(', '));
        } catch (_) {}
      }
      // Agent-based model override
      if (agent_id) {
        try {
          const agentRow = await env.DB.prepare(
            'SELECT model_policy_json FROM agent_ai_sam WHERE id = ?'
          ).bind(agent_id).first();
          if (agentRow?.model_policy_json) {
            const policy = typeof agentRow.model_policy_json === 'string'
              ? JSON.parse(agentRow.model_policy_json)
              : agentRow.model_policy_json;
            const overrideKey = policy.model_name ?? policy.primary ?? null;
            if (overrideKey) {
              const overrideModel = await env.DB.prepare(
                'SELECT * FROM ai_models WHERE id = ? OR model_key = ?'
              ).bind(overrideKey, overrideKey).first();
              if (overrideModel) model = overrideModel;
            }
          }
        } catch (_) {
          // bad JSON -- keep model from picker
        }
      }
      if (!model) return jsonResponse({ error: 'Model not found' }, 404);

      const images = Array.isArray(bodyImages) ? bodyImages : [];
      const attachedFiles = Array.isArray(bodyFiles) ? bodyFiles : [];
      let lastUserContent = msgList[msgList.length - 1]?.role === 'user' ? (msgList[msgList.length - 1].content || '') : '';
      if (attachedFiles.length > 0 && lastUserContent !== undefined) {
        const fileBlobs = attachedFiles.map((f) => {
          if (f.encoding === 'base64') {
            const size = f.size != null ? f.size : (typeof f.content === 'string' ? Math.round((f.content.length * 3) / 4) : 0);
            return `[Attached binary file: ${f.name} (${size} bytes). Use attached_file_content tool to read.]`;
          }
          return `[Attached file: ${f.name}]\n${typeof f.content === 'string' ? f.content : ''}`;
        }).join('\n\n');
        lastUserContent = lastUserContent + (lastUserContent ? '\n\n' : '') + fileBlobs;
      }
      const cleanMessages = msgList.filter(m =>
        !(m.role === 'assistant' && (m.content === 'No response' || m.content === ''))
      );
      let apiMessages = cleanMessages.map((m, i) => {
        const isLastUser = i === cleanMessages.length - 1 && m.role === 'user';
        const content = isLastUser ? lastUserContent : m.content;
        return { role: m.role === 'assistant' ? 'assistant' : 'user', content };
      });

      let ragContext = '';
      const RAG_MIN_QUERY_WORDS = 10;
      const RAG_MIN_CONTEXT_CHARS = 100;
      const runRag = (chatMode === 'agent') && env.AI && lastUserContent && lastUserContent.split(' ').length >= RAG_MIN_QUERY_WORDS;
      if (runRag) {
        try {
          const results = await vectorizeRagSearch(env, lastUserContent, { topK: 3 });
          const rawResults = results?.results ?? results?.data ?? [];
          if (rawResults.length) {
            const raw = rawResults
              .map(r => typeof r === 'string' ? r : r.text ?? r.content?.[0]?.text ?? '')
              .filter(Boolean)
              .join('\n\n');
            if (raw.length >= RAG_MIN_CONTEXT_CHARS) {
              ragContext = capWithMarker(raw, PROMPT_CAPS.RAG_CONTEXT_MAX_CHARS);
            }
          }
        } catch (e) {
          console.error('[agent/chat] AISEARCH failed:', e?.message ?? e);
        }
      }

      let compiledContext = null;
      let builtSections = null;
      if (bodyCompiledContextTrim) {
        compiledContext = bodyCompiledContextTrim;
      } else {
      // STEP 1 -- build a hash key (include date so daily memory is fresh per day)
      const tenantId = body.tenant_id || 'system';
      const today = new Date().toISOString().slice(0, 10);
      const contextHash = `${tenantId}:agent_sam:v1:${today}`;
      // Invalidation: when adding writes to agent_memory_index or ai_knowledge_base (here or any endpoint), call invalidateCompiledContextCache(env) after the write.

      // STEP 2 -- check cache before doing any memory/kb queries
      try {
        const cached = await env.DB.prepare(
          `SELECT compiled_context FROM ai_compiled_context_cache
           WHERE context_hash = ?
           AND (expires_at IS NULL OR expires_at > unixepoch())`
        ).bind(contextHash).first();

        if (cached?.compiled_context) {
          compiledContext = cached.compiled_context;
          // update hit count, non-blocking
          env.DB.prepare(
            `UPDATE ai_compiled_context_cache
             SET access_count = access_count + 1,
                 cache_hit_count = cache_hit_count + 1,
                 last_accessed_at = unixepoch()
             WHERE context_hash = ?`
          ).bind(contextHash).run().catch(() => {});
        }
      } catch (_) {}

      // STEP 3 -- cache miss: build normally
      if (!compiledContext) {
      let schemaMemory = '';
      if (env.R2) {
        try {
          const o = await env.R2.get('memory/schema-and-records.md');
          if (o) schemaMemory = await o.text();
        } catch (_) {}
      }

      let dailyLog = '';
      let yesterdayLog = '';
      if (env.R2) {
        try {
          const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
          const o1 = await env.R2.get('memory/daily/' + today + '.md');
          if (o1) dailyLog = await o1.text();
          const o2 = await env.R2.get('memory/daily/' + yesterday + '.md');
          if (o2) yesterdayLog = await o2.text();
        } catch (_) {}
      }
      const dailyMemoryRaw = (dailyLog || yesterdayLog)
        ? '\n\n[Daily memory - authoritative for "what did we do today" and "what are next priorities"; prefer this over generic roadmap or old D1 counts]:\n' + (dailyLog || '(none for today)') + (yesterdayLog ? '\n\n[Yesterday]:\n' + yesterdayLog : '')
        : '';
      const dailyMemoryBlurb = capWithMarker(dailyMemoryRaw, PROMPT_CAPS.DAILY_MEMORY_MAX_CHARS);

      let memoryIndexBlurb = '';
      try {
        const { results: memoryRows } = await env.DB.prepare(
          'SELECT key, value, importance_score FROM agent_memory_index WHERE importance_score >= 0.9 AND tenant_id = \'tenant_sam_primeaux\' ORDER BY importance_score DESC LIMIT 50'
        ).all();
        if (memoryRows?.length) {
          const parts = memoryRows.map((r) => r.value).filter(Boolean);
          const raw = `\n\n[High-importance memory (importance_score >= 0.9)]:\n${parts.join('\n\n')}`;
          memoryIndexBlurb = capWithMarker(raw, PROMPT_CAPS.MEMORY_INDEX_MAX_CHARS);
        }
      } catch (_) {}

      let knowledgeBlurb = '';
      try {
        const { results: kbRows } = await env.DB.prepare(
          'SELECT title, content, category FROM ai_knowledge_base WHERE tenant_id = ? OR tenant_id = ? ORDER BY id DESC LIMIT 15'
        ).bind(tenantId, 'system').all();
        if (kbRows?.length) {
          const parts = kbRows.map((r) => `[${r.title || r.category || 'Doc'}]: ${(r.content || '').slice(0, 1500)}`).filter((s) => s.length > 10);
          const raw = parts.length ? `\n\n[Domain knowledge base]:\n${parts.join('\n\n')}` : '';
          knowledgeBlurb = capWithMarker(raw, PROMPT_CAPS.KNOWLEDGE_BLURB_MAX_CHARS);
        }
      } catch (_) {}

      let mcpBlurb = '';
      try {
        const { results: mcpRows } = await env.DB.prepare(
          "SELECT id, service_name, endpoint_url, authentication_type, token_secret_name FROM mcp_services WHERE is_active=1 ORDER BY service_name"
        ).all();
        if (mcpRows?.length) {
          const raw = `\n\n[Active MCP services (tools available)]:\n${mcpRows.map((r) => `- ${r.service_name} (${r.endpoint_url})`).join('\n')}`;
          mcpBlurb = capWithMarker(raw, PROMPT_CAPS.MCP_BLURB_MAX_CHARS);
        }
      } catch (_) {}

      const agentSamSystemCore = `You are Agent Sam, the AI assistant for Inner Animal Media. You run inside the IAM dashboard; the backend is already connected to D1, R2, Vectorize, and APIs.

- Identify only as Agent Sam. Do not say you are Cursor, Claude, GPT, or any other product.
- Overload / 529: If the user sees "Overload" or 529 errors, that is the Worker (server) being temporarily busy--not low API balance. The user has sufficient Anthropic, OpenAI, and AI Gateway credits. Say so briefly and suggest retrying in a moment; the dashboard will auto-retry once.
- Opening URLs for the user: When the user needs to complete a step in a browser (e.g. wrangler login, OAuth, Cloudflare dashboard, admin login), output exactly one line on its own: OPEN_IN_PREVIEW: <full URL>. The dashboard will open that URL in the preview panel so the user can log in or complete the step there. Then say in normal text that you opened the link in the preview panel and they can complete the step there; after that you can continue. Example: "OPEN_IN_PREVIEW: https://dash.cloudflare.com/profile/authentication\nI've opened the Cloudflare dashboard in the preview panel--complete login there, then we can continue."
- You are functional: when users ask to run an API call, seed RAG, or perform a platform action, either (1) the backend may have already performed it (you will be told in [System: ...])--confirm it to the user, or (2) give one concrete step or use OPEN_IN_PREVIEW if they need to complete something in a browser.
- Never refuse with "I cannot execute code" or "I don't have access to databases" for actions that are possible via this dashboard or its APIs. The platform has access; guide the user or confirm what was done.
- Be concise and actionable. For RAG, bootstrap, D1, deployments: explain what exists and what the user can do next.
- D1 / schema workflow: Suggest the exact SQL or change first; wait for explicit user approval ("accept", "yes", "go ahead", etc.) before executing or giving runnable migration commands. Prefer consolidating into canonical tables (agent_telemetry, spend_ledger, project_time_entries, agent_sessions, agent_messages) instead of creating new overlapping tables.
- Shell commands (wrangler, git, npm, bun, cloudflared): When the user is building or deploying and you suggest a command they should run, output it in a single markdown code block so the dashboard can offer "Run in terminal". Use \`\`\`bash or \`\`\`sh and put exactly the command(s) to run inside. Example: "To deploy, run:\n\n\`\`\`bash\nwrangler deploy\n\`\`\`\n\nClick **Run in terminal** in the dashboard to run this after you approve." Suggest one command (or a short, safe sequence) at a time for destructive or multi-step actions; wait for the user to approve or run before suggesting the next. Only suggest commands appropriate for the IAM platform: wrangler (auth, dev, deploy, D1, KV, R2, queues, secrets, tail, pages, etc.), git (status, commit, push, etc.), npm/bun (install, run dev/build), cloudflared (tunnel). Do not suggest arbitrary system commands unless the user explicitly asks. The user approves in the UI; then the command runs in their connected terminal. Be strategic and concise so the agent can do the heavy work while the user accepts or stops.
- Treat anything touching --remote, --env production, delete, rollback, reset --hard, or secret as risky regardless of context; suggest one step at a time and wait for explicit approval before suggesting the next.
- Playwright / browser (UI validation, screenshots): The platform can run browser tools via MCP: playwright_screenshot (params: url), browser_screenshot (params: url, optional fullPage), browser_navigate (params: url), browser_content (params: url). For page checks or screenshots, suggest the side panel Browser tab (paste URL, Go for live view, Screenshot for image) or that these tools are available when invoked.
- Runnable wrangler/bash (for Run in terminal): Suggest commands in \`\`\`bash blocks. Examples the user can run from chat: wrangler whoami; wrangler d1 list -c wrangler.production.toml; wrangler r2 bucket list; wrangler r2 object list BUCKET --remote -c wrangler.production.toml; wrangler kv namespace list; wrangler secret list; wrangler tail -c wrangler.production.toml; wrangler deploy -c wrangler.production.toml; npm run build; git status. User can also type /run <command> to run immediately. Use -c wrangler.production.toml and --remote for production.
- Code generation: Output code in markdown fenced blocks (\`\`\`language filename). Do NOT use r2_write tool for code - users will save via the Monaco editor. Only use r2_write for non-code files or when explicitly asked to write directly to R2.`;
      const schemaBlurbRaw = schemaMemory ? `\n\n[Schema and records memory - use for backfill, cost tracking, and table consolidation; suggest then wait for user approval before executing D1/SQL]:\n${schemaMemory}` : '';
      const schemaBlurb = capWithMarker(schemaBlurbRaw, PROMPT_CAPS.SCHEMA_BLURB_MAX_CHARS);
      const fullBlob = agentSamSystemCore + memoryIndexBlurb + knowledgeBlurb + mcpBlurb + schemaBlurb + dailyMemoryBlurb;
      compiledContext = fullBlob;
      builtSections = { core: agentSamSystemCore, memory: memoryIndexBlurb, kb: knowledgeBlurb, mcp: mcpBlurb, schema: schemaBlurb, daily: dailyMemoryBlurb, full: fullBlob };

        // STEP 4 -- store in cache as JSON of sections (expires 30 minutes)
        try {
          await env.DB.prepare(
            `INSERT INTO ai_compiled_context_cache
             (id, context_hash, context_type, compiled_context,
              source_context_ids_json, token_count, tenant_id,
              created_at, last_accessed_at, expires_at)
             VALUES (?, ?, 'agent_sam_system', ?, '[]', ?, ?, unixepoch(), unixepoch(), unixepoch()+1800)
             ON CONFLICT(context_hash) DO UPDATE SET
               compiled_context = excluded.compiled_context,
               access_count = access_count + 1,
               last_accessed_at = unixepoch(),
               expires_at = unixepoch()+1800`
          ).bind(
            `cache_${crypto.randomUUID()}`,
            contextHash,
            JSON.stringify(builtSections),
            Math.ceil(fullBlob.length / 4),
            tenantId
          ).run();
        } catch (_) {}
      }
      }

      let resolvedSections = builtSections;
      if (!resolvedSections && compiledContext) {
        try { resolvedSections = JSON.parse(compiledContext); } catch (_) { resolvedSections = null; }
      }
      if (resolvedSections === null && compiledContext) {
        resolvedSections = { full: compiledContext };
      }

      const coreSystemPrefix = `SYSTEM: You are Agent Sam. Resolved model: ${model.model_key} provider: ${model.provider}. Always report this exact model_key when asked what model you are running on.\n\n`;
      let fileBlock = '';
      if (bodyFileContext?.filename && bodyFileContext?.content != null) {
        let content = String(bodyFileContext.content);
        const startLine = bodyFileContext.startLine;
        const endLine = bodyFileContext.endLine;
        if (typeof startLine === 'number' && typeof endLine === 'number' && endLine >= startLine) {
          const lines = content.split('\n');
          const start = Math.max(0, startLine - 1);
          const end = Math.min(lines.length, endLine);
          content = lines.slice(start, end).join('\n');
        }
        const maxChars = PROMPT_CAPS.FILE_CONTEXT_MAX_CHARS;
        const truncated = content.length > maxChars;
        const slice = content.slice(0, maxChars);
        fileBlock = `\n\nCURRENT FILE OPEN IN MONACO:
Filename: ${bodyFileContext.filename}
Bucket: ${bodyFileContext.bucket || 'not specified'}
Content (first ${maxChars} chars${truncated ? ', truncated' : ''}${startLine != null && endLine != null ? `, lines ${startLine}-${endLine}` : ''}):
\`\`\`
${slice}${truncated ? PROMPT_CAPS.TRUNCATION_MARKER : ''}
\`\`\`
`;
      }
      const systemWithBlurb = coreSystemPrefix + buildModeContext(chatMode, resolvedSections, compiledContext, ragContext, fileBlock, model);
      let finalSystem = systemWithBlurb;

      if (session_id && apiMessages.length > PROMPT_CAPS.LAST_N_VERBATIM_TURNS && env.R2) {
        try {
          const sumObj = await env.R2.get('knowledge/conversations/' + session_id + '-summary.md');
          if (sumObj) {
            const summaryText = await sumObj.text();
            const summaryBlock = capWithMarker(summaryText, PROMPT_CAPS.SESSION_SUMMARY_MAX_CHARS);
            finalSystem += '\n\n[Previous session summary]:\n' + summaryBlock;
            apiMessages = apiMessages.slice(-PROMPT_CAPS.LAST_N_VERBATIM_TURNS);
          }
        } catch (_) {}
      }

      const gatewayModel = getGatewayModel(model.provider, model.model_key);
      const useGateway = bodyUseGateway !== false && !!env.AI_GATEWAY_BASE_URL;
      const canStreamAnthropic = model.provider === 'anthropic' && !(useGateway && gatewayModel) && !!env.ANTHROPIC_API_KEY;
      const canStreamOpenAI = model.provider === 'openai' && !(useGateway && gatewayModel) && !!env.OPENAI_API_KEY;
      const canStreamGoogle = model.provider === 'google' && !!env.GOOGLE_AI_API_KEY;
      const canStreamWorkersAI = (model.provider === 'cloudflare_workers_ai' || model.provider === 'workers_ai') && !!env.AI;
      const wantStream = body.stream === true && (canStreamAnthropic || canStreamOpenAI || canStreamGoogle || canStreamWorkersAI);

      const supportsTools = ['anthropic', 'openai', 'google'].includes(model.provider);
      const useTools = supportsTools;
      let toolDefinitions = [];
      if (supportsTools) {
        try {
          const toolRows = await env.DB.prepare(
            'SELECT tool_name, description, input_schema, tool_category FROM mcp_registered_tools WHERE enabled = 1'
          ).all();
          const filteredToolRows = filterToolRowsByPanel(agent_id, toolRows.results ?? []);
          toolDefinitions = filteredToolRows.map(t => {
            let rawSchema = {};
            try { rawSchema = typeof t.input_schema === 'string' ? JSON.parse(t.input_schema) : (t.input_schema || {}); } catch (_) {}

            let input_schema;
            if (rawSchema.type === 'object' && rawSchema.properties) {
              input_schema = rawSchema;
            } else {
              const properties = {};
              const required = [];
              for (const [key, val] of Object.entries(rawSchema)) {
                properties[key] = {
                  type: val.type ?? 'string',
                  ...(val.items && { items: val.items }),
                  ...(val.description && { description: val.description }),
                  ...(val.enum && { enum: val.enum })
                };
                if (val.required) required.push(key);
              }
              input_schema = { type: 'object', properties, required };
            }

            return { name: t.tool_name, description: t.description || t.tool_name, input_schema };
          });
        } catch (_) {}
      }
      toolDefinitions = filterToolsByMode(chatMode, toolDefinitions);
      const binaryAttachments = (attachedFiles || []).filter((f) => f.encoding === 'base64');
      if (binaryAttachments.length > 0) {
        toolDefinitions = [...toolDefinitions, {
          name: 'attached_file_content',
          description: 'Get the base64 content and size of a binary file the user attached to this message. Call with filename matching one of the attached binary files.',
          input_schema: { type: 'object', properties: { filename: { type: 'string', description: 'Exact filename of the attached binary file' } }, required: ['filename'] },
        }];
      }

      const messageContentChars = (m) => {
        const c = m.content;
        if (typeof c === 'string') return c.length;
        if (Array.isArray(c)) return c.reduce((s, p) => s + (typeof p === 'string' ? p.length : JSON.stringify(p).length), 0);
        return JSON.stringify(c != null ? c : '').length;
      };
      const historyChars = apiMessages.reduce((s, m) => s + messageContentChars(m), 0);
      const fileContextChars = (bodyFileContext?.content != null) ? Math.min(String(bodyFileContext.content).length, PROMPT_CAPS.FILE_CONTEXT_MAX_CHARS) : 0;
      const toolDefChars = toolDefinitions.reduce((s, t) => s + JSON.stringify(t).length, 0);
      const telemetryPayload = {
        mode: chatMode,
        provider: model.provider,
        stream: wantStream,
        toolCount: toolDefinitions?.length ?? 0,
        messageCount: apiMessages.length,
        coreSystemChars: coreSystemPrefix.length,
        compiledContextChars: systemWithBlurb.length - coreSystemPrefix.length,
        ragContextChars: ragContext.length,
        fileContextChars,
        historyChars,
        toolDefChars,
        totalAssembledChars: finalSystem.length + historyChars,
      };
      logPromptTelemetry(env, telemetryPayload);
      let auditReport = null;
      if (bodyAudit) {
        auditReport = {
          section_tokens: {
            core_system: charsToTokens(telemetryPayload.coreSystemChars),
            compiled_context: charsToTokens(telemetryPayload.compiledContextChars),
            rag_context: charsToTokens(telemetryPayload.ragContextChars),
            file_context: charsToTokens(telemetryPayload.fileContextChars),
            conversation_history: charsToTokens(telemetryPayload.historyChars),
            tool_definitions: charsToTokens(telemetryPayload.toolDefChars),
          },
          total_input_tokens_est: charsToTokens(telemetryPayload.totalAssembledChars),
          mode: chatMode,
          tools_included: (toolDefinitions?.length ?? 0) > 0,
          message_count: apiMessages.length,
          output_tokens: null,
          latency_ms: null,
        };
      }

      if (wantStream) {
        let conversationId = session_id;
        if (!conversationId) {
          try {
            conversationId = crypto.randomUUID();
            const now = Math.floor(Date.now() / 1000);
            await env.DB.prepare(
          "INSERT INTO agent_sessions (id, tenant_id, session_type, status, state_json, started_at, updated_at, project_id) VALUES (?,?,?,?,?,?,?,?)"
        ).bind(conversationId, env.TENANT_ID || 'system', 'chat', 'active', '{}', now, now, PROJECT_ID).run();
            try {
              const session = await getSession(env, request);
              const userId = session?.user_id || 'system';
              await env.DB.prepare(
                "INSERT INTO agent_conversations (id, user_id, title, created_at, updated_at) VALUES (?,?,?,?,?)"
              ).bind(conversationId, userId, 'New Conversation', now, now).run();
            } catch (e) {
              console.error('[agent/chat] agent_conversations INSERT failed:', e?.message ?? e);
            }
            if (ctx && typeof ctx.waitUntil === 'function') {
              ctx.waitUntil(generateConversationName(env, conversationId, lastUserContent || '').catch(e => console.warn('[agent/chat] generateConversationName', e?.message)));
            }
          } catch (e) {
            console.error('[agent/chat] agent_sessions INSERT failed:', e?.message ?? e);
          }
        }
        conversationId = conversationId || crypto.randomUUID();
        try {
          const userContent = lastUserContent || msgList[msgList.length - 1]?.content || '';
          await env.DB.prepare(
            "INSERT INTO agent_messages (id, conversation_id, role, content, provider, created_at) VALUES (?,?,?,?,?,unixepoch())"
          ).bind(crypto.randomUUID(), conversationId, 'user', userContent.slice(0, 50000), null).run();
        } catch (e) {
          console.error('[agent/chat] agent_messages INSERT failed:', e?.message ?? e);
        }
        if (ctx && typeof ctx.waitUntil === 'function' && env.DB) {
          env.DB.prepare('SELECT COUNT(*) as c FROM agent_messages WHERE conversation_id = ?').bind(conversationId).first()
            .then((row) => {
              if (row && row.c > 50) {
                ctx.waitUntil(compactConversationToKnowledge(env, conversationId));
              }
            })
            .catch(() => {});
        }
        await upsertMcpAgentSession(env, conversationId, agent_id);

        if (canStreamOpenAI) {
          return streamOpenAI(env, finalSystem, apiMessages, model, images, conversationId, agent_id, ctx);
        }
        if (canStreamGoogle) {
          return streamGoogle(env, finalSystem, apiMessages, model, images, conversationId, agent_id, ctx);
        }
        if (canStreamWorkersAI) {
          return streamWorkersAI(env, finalSystem, apiMessages, model, conversationId, agent_id, ctx);
        }
        if (toolDefinitions.length > 0) {
          if (canStreamAnthropic) {
            const toolsResp = await chatWithToolsAnthropic(env, finalSystem, apiMessages, model, conversationId, agent_id, ctx, { stream: true, mode: chatMode });
            if (toolsResp) return toolsResp;
          }
          if (canStreamOpenAI || canStreamGoogle) {
            // Fall through to runToolLoop below with stream flag
            const toolLoopResult = await runToolLoop(env, request, model.provider, model.model_key, finalSystem, apiMessages, toolDefinitions, model, agent_id, conversationId, attachedFiles);
            return toolLoopResult;
          }
        }
        if (canStreamAnthropic) {
        const anthropicMessagesStream = apiMessages.map((m, i) => {
          const isLastUser = i === apiMessages.length - 1 && m.role === 'user' && images.length > 0;
          return { role: m.role, content: isLastUser ? buildAnthropicContent(m.content, images) : m.content };
        });
        const modelKeyStream = resolveAnthropicModelKey(model.model_key);
        const streamResp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
                'Accept': 'application/json, text/event-stream',
            'x-api-key': env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: modelKeyStream,
            max_tokens: 8192,
            system: finalSystem,
            messages: anthropicMessagesStream,
            stream: true,
          }),
        });
        if (!streamResp.ok) {
          const errData = await streamResp.json().catch(() => ({}));
          return jsonResponse(errData, streamResp.status);
        }

        const reader = streamResp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let inputTokens = 0;
        let outputTokens = 0;
        let fullText = '';
        const envRef = env;
        const modelRef = model;
        const conversationIdRef = conversationId;

        const readable = new ReadableStream({
          async pull(controller) {
            let sentThinking = false;
            try {
              for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                if (!sentThinking) {
                  sentThinking = true;
                  controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: 'state', state: 'THINKING' })}\n\n`));
                }
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                for (const line of lines) {
                  if (!line.startsWith('data: ')) continue;
                  const raw = line.slice(6).trim();
                  if (raw === '[DONE]') continue;
                  try {
                    const data = JSON.parse(raw);
                    if (data.type === 'content_block_delta' && data.delta?.type === 'text_delta' && data.delta?.text) {
                      fullText += data.delta.text;
                      controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: 'text', text: data.delta.text })}\n\n`));
                    } else if (data.type === 'message_start' && data.message?.usage) {
                      inputTokens = data.message.usage.input_tokens ?? 0;
                    } else if (data.type === 'message_delta' && data.usage) {
                      if (data.usage.output_tokens != null) outputTokens = data.usage.output_tokens;
                      if (data.usage.input_tokens != null) inputTokens = data.usage.input_tokens;
                    } else if (data.type === 'message_stop') {
                      const costUsd = calculateCost(modelRef, inputTokens, outputTokens);
                      const { rateIn, rateOut } = getSpendRates(modelRef.provider, modelRef.model_key);
                      const amountUsd = Math.round((inputTokens * rateIn + outputTokens * rateOut) * 1e8) / 1e8;
                      try {
                        await envRef.DB.prepare(
                          "INSERT INTO agent_messages (id, conversation_id, role, content, provider, created_at) VALUES (?,?,?,?,?,unixepoch())"
                        ).bind(crypto.randomUUID(), conversationIdRef, 'assistant', fullText.slice(0, 50000), modelRef.provider).run();
                      } catch (e) {
                        console.error('[agent/chat] agent_messages INSERT failed:', e?.message ?? e);
                      }
                      try {
                        await envRef.DB.prepare(
                          `INSERT INTO agent_telemetry (id, tenant_id, session_id, metric_type, metric_name, metric_value, timestamp, model_used, provider, input_tokens, output_tokens, computed_cost_usd, created_at) VALUES (?,?,?,?,?,?,unixepoch(),?,?,?,?,?,unixepoch())`
                        ).bind(crypto.randomUUID(), envRef.TENANT_ID || 'system', conversationIdRef, 'llm_call', 'chat_completion', 1, modelRef.model_key, modelRef.provider, inputTokens, outputTokens, amountUsd).run();
                      } catch (e) {
                        console.error('[agent/chat] agent_telemetry INSERT failed:', e?.message ?? e);
                      }
                      if (ctx && typeof ctx.waitUntil === 'function') {
                        const slId = 'sl_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16).toLowerCase();
                        const now = Math.floor(Date.now() / 1000);
                        ctx.waitUntil(envRef.DB.prepare(
                          `INSERT INTO spend_ledger (id, tenant_id, workspace_id, brand_id, provider, source, occurred_at, amount_usd, model_key, tokens_in, tokens_out, session_tag, project_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
                        ).bind(slId, 'tenant_sam_primeaux', 'ws_samprimeaux', 'inneranimalmedia', modelRef.provider, 'api_direct', now, amountUsd, modelRef.model_key, inputTokens, outputTokens, conversationIdRef || 'unknown', 'proj_inneranimalmedia_main_prod_013').run().catch((e) => console.error('[agent/chat] spend_ledger INSERT failed:', e?.message ?? e)));
                      } else {
                        try {
                          const slId = 'sl_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16).toLowerCase();
                          const now = Math.floor(Date.now() / 1000);
                          await envRef.DB.prepare(
                            `INSERT INTO spend_ledger (id, tenant_id, workspace_id, brand_id, provider, source, occurred_at, amount_usd, model_key, tokens_in, tokens_out, session_tag, project_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
                          ).bind(slId, 'tenant_sam_primeaux', 'ws_samprimeaux', 'inneranimalmedia', modelRef.provider, 'api_direct', now, amountUsd, modelRef.model_key, inputTokens, outputTokens, conversationIdRef || 'unknown', 'proj_inneranimalmedia_main_prod_013').run();
                        } catch (e) {
                          console.error('[agent/chat] spend_ledger INSERT failed:', e?.message ?? e);
                        }
                      }
                      if (agent_id) {
                        try {
                          await envRef.DB.prepare("UPDATE agent_ai_sam SET total_runs=total_runs+1, last_run_at=unixepoch(), updated_at=unixepoch() WHERE id=?").bind(agent_id).run();
                        } catch (_) {}
                      }
                      emitCodeBlocksFromText(fullText, (obj) => controller.enqueue(new TextEncoder().encode('data: ' + JSON.stringify(obj) + '\n\n')));
                      const donePayload = { type: 'done', input_tokens: inputTokens, output_tokens: outputTokens, cost_usd: amountUsd, conversation_id: conversationIdRef, model_used: modelRef.model_key, model_display_name: modelRef.display_name };
                      if (bodyAudit) donePayload.audit = { input_tokens: inputTokens, output_tokens: outputTokens, latency_ms: Date.now() - chatStartTime, mode: chatMode, tools_included: false };
                      controller.enqueue(new TextEncoder().encode('data: ' + JSON.stringify(donePayload) + '\n\n'));
                    } else if (data.type === 'error') {
                      controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: 'error', error: data.error })}\n\n`));
                    }
                  } catch (_) { /* ignore parse errors */ }
                }
              }
            } finally {
              reader.releaseLock();
              try {
                controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: 'state', state: 'IDLE' })}\n\n`));
              } catch (_) {}
            }
            controller.close();
          },
        });

        return new Response(readable, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          },
        });
        }
      }

      console.log('[agent/chat] wantStream:', wantStream, 'useTools:', useTools, 'toolDefs:', toolDefinitions?.length, 'body.stream:', body.stream);
      if (useTools && toolDefinitions.length > 0) {
        let conversationId = session_id;
        if (!conversationId) {
          try {
            conversationId = crypto.randomUUID();
            const now = Math.floor(Date.now() / 1000);
            await env.DB.prepare(
              "INSERT INTO agent_sessions (id, tenant_id, session_type, status, state_json, started_at, updated_at, project_id) VALUES (?,?,?,?,?,?,?,?)"
            ).bind(conversationId, env.TENANT_ID || 'system', 'chat', 'active', '{}', now, now, PROJECT_ID).run();
            try {
              const session = await getSession(env, request);
              const userId = session?.user_id || 'system';
              await env.DB.prepare(
                "INSERT INTO agent_conversations (id, user_id, title, created_at, updated_at) VALUES (?,?,?,?,?)"
              ).bind(conversationId, userId, 'New Conversation', now, now).run();
            } catch (e) {
              console.error('[agent/chat] agent_conversations INSERT failed:', e?.message ?? e);
            }
            if (ctx && typeof ctx.waitUntil === 'function') {
              ctx.waitUntil(generateConversationName(env, conversationId, lastUserContent || '').catch(e => console.warn('[agent/chat] generateConversationName', e?.message)));
            }
          } catch (e) {
            console.error('[agent/chat] agent_sessions INSERT failed:', e?.message ?? e);
          }
        }
        try {
          const userContent = lastUserContent || msgList[msgList.length - 1]?.content || '';
          await env.DB.prepare(
            "INSERT INTO agent_messages (id, conversation_id, role, content, provider, created_at) VALUES (?,?,?,?,?,unixepoch())"
          ).bind(crypto.randomUUID(), conversationId, 'user', userContent.slice(0, 50000), null).run();
        } catch (e) {
          console.error('[agent/chat] agent_messages INSERT failed:', e?.message ?? e);
        }
        conversationId = conversationId ?? crypto.randomUUID();
        await upsertMcpAgentSession(env, conversationId, agent_id);
        const agentIdForTools = agent_id ?? 'agent_sam_v1';
        const modelKeyForTools = model.provider === 'anthropic' ? resolveAnthropicModelKey(model.model_key) : (model.model_key || 'gpt-4o');
        if (model.provider === 'anthropic' && env.ANTHROPIC_API_KEY) {
          const toolsResp = await chatWithToolsAnthropic(env, finalSystem, apiMessages, model, conversationId, agentIdForTools, ctx, { stream: false, mode: chatMode });
          if (toolsResp) return toolsResp;
        }
        const toolLoopResult = await runToolLoop(env, request, model.provider, modelKeyForTools, finalSystem, apiMessages, toolDefinitions, model, agentIdForTools, conversationId, attachedFiles);
        const finalText = typeof toolLoopResult === 'string' ? toolLoopResult : (toolLoopResult?.content?.[0]?.text ?? '');
        try {
          await streamDoneDbWrites(env, conversationId, model, finalText, 0, 0, 0, agentIdForTools, ctx);
        } catch (e) {
          console.error('[agent/chat] streamDoneDbWrites (tool loop) failed:', e?.message ?? e);
        }
        const content = typeof toolLoopResult === 'object' && toolLoopResult?.content ? toolLoopResult.content : [{ type: 'text', text: finalText || '' }];
        const toolLoopRes = { content, role: 'assistant', conversation_id: conversationId };
        if (auditReport) {
          const outText = (content && content[0] && content[0].text) ? content[0].text : (typeof finalText === 'string' ? finalText : '');
          auditReport.output_tokens = charsToTokens(outText.length);
          auditReport.latency_ms = Date.now() - chatStartTime;
          toolLoopRes.audit = auditReport;
        }
        return jsonResponse(toolLoopRes);
      }

      let result;
      if (useGateway && gatewayModel && (model.provider === 'openai' || model.provider === 'anthropic')) {
        const gw = await callGatewayChat(env, finalSystem, apiMessages, gatewayModel, images);
        if (gw && !gw.ok) return jsonResponse(gw.data || { error: 'AI Gateway request failed' }, gw.status || 502);
        if (gw && gw.ok) result = gw.data;
      }
      if (result === undefined && model.provider === 'anthropic' && env.ANTHROPIC_API_KEY) {
        const anthropicMessages = apiMessages.map((m, i) => {
          const isLastUser = i === apiMessages.length - 1 && m.role === 'user' && images.length > 0;
          return { role: m.role, content: isLastUser ? buildAnthropicContent(m.content, images) : m.content };
        });
        const modelKey = resolveAnthropicModelKey(model.model_key);
        const resp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
                'Accept': 'application/json, text/event-stream',
            'x-api-key': env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({ model: modelKey, max_tokens: 8192, system: finalSystem, messages: anthropicMessages }),
        });
        result = await resp.json();
        if (!resp.ok) return jsonResponse(result, resp.status);
      }
      if (result === undefined && model.provider === 'openai' && env.OPENAI_API_KEY) {
        const modelKey = model.model_key || 'gpt-4o';
        try {
          const openAiMessages = apiMessages.map((m, i) => {
            const isLastUser = i === apiMessages.length - 1 && m.role === 'user' && images.length > 0;
            const content = isLastUser ? buildOpenAIContent(m.content, images) : m.content;
            return { role: m.role, content };
          });
          const withSystem = [{ role: 'system', content: finalSystem }, ...openAiMessages];
          const resp = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json',
                'Accept': 'application/json, text/event-stream', 'Authorization': `Bearer ${env.OPENAI_API_KEY}` },
            body: JSON.stringify({ model: modelKey, messages: withSystem }),
          });
          result = await resp.json();
          if (!resp.ok) return jsonResponse(result, resp.status);
        } catch (err) {
          console.log('[gateway] OpenAI call failed:', err?.message ?? err, 'model:', modelKey);
          return jsonResponse({ error: 'OpenAI request failed', detail: err?.message ?? String(err) }, 502);
        }
      }
      if (result === undefined && model.provider === 'google' && env.GOOGLE_AI_API_KEY) {
        const googleContents = apiMessages.map((m, i) => {
          const isLastUser = i === apiMessages.length - 1 && m.role === 'user' && images.length > 0;
          const parts = isLastUser ? buildGoogleParts(m.content, images) : [{ text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }];
          return { role: m.role === 'assistant' ? 'model' : 'user', parts };
        });
        const resp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${(model.model_key || 'gemini-2.5-flash')}:generateContent`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': env.GOOGLE_AI_API_KEY,
            },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: finalSystem }] },
              contents: googleContents,
            }),
          }
        );
        result = await resp.json();
        if (!resp.ok) return jsonResponse(result, resp.status);
      }
      if (result === undefined && model.provider === 'cloudflare_workers_ai' && env.AI) {
        result = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', { messages: [{ role: 'system', content: finalSystem }, ...apiMessages] });
      }
      if (result === undefined) {
        return jsonResponse({ error: 'Provider not configured or unsupported' }, 503);
      }

      const inputTok = result?.usage?.input_tokens ?? result?.usage?.prompt_tokens ?? result?.usageMetadata?.promptTokenCount ?? 0;
      const outputTok = result?.usage?.output_tokens ?? result?.usage?.completion_tokens ?? result?.usageMetadata?.candidatesTokenCount ?? 0;
      const { rateIn, rateOut } = getSpendRates(model.provider, model.model_key);
      const amountUsd = Math.round((inputTok * rateIn + outputTok * rateOut) * 1e8) / 1e8;
      const computedCostUsd = amountUsd;
      let conversationId = session_id;
      if (!conversationId) {
        try {
          conversationId = crypto.randomUUID();
          const now = Math.floor(Date.now() / 1000);
          await env.DB.prepare(
            "INSERT INTO agent_sessions (id, tenant_id, session_type, status, state_json, started_at, updated_at, project_id) VALUES (?,?,?,?,?,?,?,?)"
          ).bind(conversationId, env.TENANT_ID || 'system', 'chat', 'active', '{}', now, now, PROJECT_ID).run();
        try {
          const session = await getSession(env, request);
          const userId = session?.user_id || 'system';
          await env.DB.prepare(
            "INSERT INTO agent_conversations (id, user_id, title, created_at, updated_at) VALUES (?,?,?,?,?)"
          ).bind(conversationId, userId, 'New Conversation', now, now).run();
        } catch (e) {
          console.error('[agent/chat] agent_conversations INSERT failed:', e?.message ?? e);
        }
        if (ctx && typeof ctx.waitUntil === 'function') {
          ctx.waitUntil(generateConversationName(env, conversationId, lastUserContent || '').catch(e => console.warn('[agent/chat] generateConversationName', e?.message)));
        }
        } catch (e) {
          console.error('[agent/chat] agent_sessions INSERT failed:', e?.message ?? e);
        }
      }
      const assistantContent = result?.content?.[0]?.text ?? result?.choices?.[0]?.message?.content ?? result?.candidates?.[0]?.content?.parts?.[0]?.text ?? (typeof result?.message === 'string' ? result.message : '');
      conversationId = conversationId || crypto.randomUUID();
      await upsertMcpAgentSession(env, conversationId, agent_id);
      try {
        const convId = conversationId;
        if (convId) {
          const userContent = lastUserContent || msgList[msgList.length - 1]?.content || '';
          await env.DB.prepare(
            "INSERT INTO agent_messages (id, conversation_id, role, content, provider, created_at) VALUES (?,?,?,?,?,unixepoch())"
          ).bind(crypto.randomUUID(), convId, 'user', userContent.slice(0, 50000), null).run();
          await env.DB.prepare(
            "INSERT INTO agent_messages (id, conversation_id, role, content, provider, created_at) VALUES (?,?,?,?,?,unixepoch())"
          ).bind(crypto.randomUUID(), convId, 'assistant', (assistantContent || '').slice(0, 50000), model.provider).run();
        }
      } catch (e) {
        console.error('[agent/chat] agent_messages INSERT failed:', e?.message ?? e);
      }
      try {
        await env.DB.prepare(
          `INSERT INTO agent_telemetry (id, tenant_id, session_id, metric_type, metric_name, metric_value, timestamp, model_used, provider, input_tokens, output_tokens, computed_cost_usd, created_at) VALUES (?,?,?,?,?,?,unixepoch(),?,?,?,?,?,unixepoch())`
        ).bind(crypto.randomUUID(), env.TENANT_ID || 'system', conversationId || null, 'llm_call', 'chat_completion', 1, model.model_key, model.provider, inputTok, outputTok, computedCostUsd).run();
      } catch (e) {
        console.error('[agent/chat] agent_telemetry INSERT failed:', e?.message ?? e);
      }
      if (ctx && typeof ctx.waitUntil === 'function') {
        const slId = 'sl_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16).toLowerCase();
        const now = Math.floor(Date.now() / 1000);
        ctx.waitUntil(env.DB.prepare(
          `INSERT INTO spend_ledger (id, tenant_id, workspace_id, brand_id, provider, source, occurred_at, amount_usd, model_key, tokens_in, tokens_out, session_tag, project_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
        ).bind(slId, 'tenant_sam_primeaux', 'ws_samprimeaux', 'inneranimalmedia', model.provider, 'api_direct', now, amountUsd, model.model_key, inputTok, outputTok, conversationId || 'unknown', 'proj_inneranimalmedia_main_prod_013').run().catch((e) => console.error('[agent/chat] spend_ledger INSERT failed:', e?.message ?? e)));
      } else {
        try {
          const slId = 'sl_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16).toLowerCase();
          const now = Math.floor(Date.now() / 1000);
          await env.DB.prepare(
            `INSERT INTO spend_ledger (id, tenant_id, workspace_id, brand_id, provider, source, occurred_at, amount_usd, model_key, tokens_in, tokens_out, session_tag, project_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
          ).bind(slId, 'tenant_sam_primeaux', 'ws_samprimeaux', 'inneranimalmedia', model.provider, 'api_direct', now, amountUsd, model.model_key, inputTok, outputTok, conversationId || 'unknown', 'proj_inneranimalmedia_main_prod_013').run();
        } catch (e) {
          console.error('[agent/chat] spend_ledger INSERT failed:', e?.message ?? e);
        }
      }
      if (agent_id) {
        try {
          await env.DB.prepare("UPDATE agent_ai_sam SET total_runs=total_runs+1, last_run_at=unixepoch(), updated_at=unixepoch() WHERE id=?").bind(agent_id).run();
        } catch (_) {}
      }
      return jsonResponse({
        content: [{ type: 'text', text: assistantContent || '' }],
        text: assistantContent || '',
        conversation_id: conversationId,
        usage: { input_tokens: inputTok, output_tokens: outputTok, prompt_tokens: inputTok, completion_tokens: outputTok }
      });
    }

    if (pathLower === '/api/agent/playwright' && method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const jobId = crypto.randomUUID();
      try {
        await env.DB.prepare(
          "INSERT INTO playwright_jobs (id, job_type, url, status, metadata, created_at) VALUES (?,?,?,'pending',?,CURRENT_TIMESTAMP)"
        ).bind(jobId, body.job_type || 'screenshot', body.url || '', JSON.stringify(body.options || {})).run();
      } catch (_) {
        return jsonResponse({ error: 'playwright_jobs table not available' }, 503);
      }
      if (env.MY_QUEUE) await env.MY_QUEUE.send({ jobId, job_type: body.job_type || 'screenshot', url: body.url || '' });
      return jsonResponse({ jobId, status: 'pending' });
    }

    if (pathLower === '/api/agent/mcp') {
      const { results } = await env.DB.prepare(
        "SELECT id, service_name, service_type, endpoint_url, is_active, health_status FROM mcp_services WHERE is_active=1 ORDER BY service_name"
      ).all();
      return jsonResponse(results);
    }

    if (pathLower === '/api/agent/cidi') {
      try {
        const { results } = await env.DB.prepare(
          "SELECT c.*, COUNT(cal.id) as activity_count FROM cidi c LEFT JOIN cidi_activity_log cal ON c.id=cal.cidi_id GROUP BY c.id ORDER BY c.updated_at DESC LIMIT 50"
        ).all();
        return jsonResponse(results);
      } catch (_) {
        return jsonResponse([]);
      }
    }

    if (pathLower === '/api/agent/telemetry') {
      try {
        const { results } = await env.DB.prepare(
          `SELECT provider, SUM(input_tokens) as total_input, SUM(output_tokens) as total_output, COUNT(*) as total_calls FROM agent_telemetry WHERE created_at > unixepoch('now','-7 days') GROUP BY provider`
        ).all();
        return jsonResponse(results);
      } catch (_) {
        return jsonResponse([]);
      }
    }

    if (pathLower === '/api/agent/rag/query' && method === 'POST') {
      try {
        const body = await request.json().catch(() => ({}));
        const query = body.query || body.q || '';
        if (!query.trim()) return jsonResponse({ error: 'query required', matches: [], ragDebug: null }, 400);
        const out = await vectorizeRagSearch(env, query.trim(), { topK: 5 });
        const rawResults = out?.results ?? out?.data ?? [];
        const chunks = rawResults.map(r =>
          typeof r === 'string' ? r :
          r.text ?? r.content?.[0]?.text ?? ''
        ).filter(Boolean);
        const payload = { matches: chunks, count: chunks.length };
        if (out._debug) payload.ragDebug = out._debug;
        return jsonResponse(payload);
      } catch (e) {
        return jsonResponse({ error: String(e?.message || e), matches: [], ragDebug: { error: String(e?.message || e) } }, 500);
      }
    }

    if (pathLower === '/api/agent/rag/status' && method === 'GET') {
      const bindings = {
        VECTORIZE_INDEX: !!env.VECTORIZE_INDEX,
        VECTORIZE: !!env.VECTORIZE,
        AI: !!env.AI,
        R2: !!env.R2,
      };
      return jsonResponse({ rag: 'vectorize', bindings });
    }

    if (pathLower === '/api/agent/rag/index-memory' && method === 'POST') {
      try {
        if (!env.R2 || !env.VECTORIZE || !env.AI) {
          return jsonResponse({ error: 'R2, VECTORIZE, or AI binding missing', indexed: 0, chunks: 0 }, 503);
        }
        const result = await indexMemoryMarkdownToVectorize(env);
        return jsonResponse(result);
      } catch (e) {
        console.error('[agent/rag/index-memory]', e?.message || e);
        return jsonResponse({ error: String(e?.message || e), indexed: 0, chunks: 0 }, 500);
      }
    }

    if (pathLower === '/api/agent/rag/compact-chats' && method === 'POST') {
      try {
        if (!env.DB || !env.R2) {
          return jsonResponse({ error: 'DB or R2 missing', conversations: 0, messages: 0, key: '' }, 503);
        }
        const body = await request.json().catch(() => ({}));
        const thenIndex = body && body.then_index === true;
        const compactResult = await compactAgentChatsToR2(env);
        if (compactResult.error) return jsonResponse(compactResult, 400);
        if (thenIndex && env.VECTORIZE && env.AI) {
          const indexResult = await indexMemoryMarkdownToVectorize(env);
          return jsonResponse({ compact: compactResult, index: indexResult });
        }
        return jsonResponse(compactResult);
      } catch (e) {
        console.error('[agent/rag/compact-chats]', e?.message || e);
        return jsonResponse({ error: String(e?.message || e), conversations: 0, messages: 0, key: '' }, 500);
      }
    }

    if (pathLower === '/api/agent/queue' && method === 'POST') {
      try {
        if (!env.DB) return jsonResponse({ error: 'DB missing' }, 503);
        const body = await request.json().catch(() => ({}));
        const sessionId = body.session_id || body.conversation_id || '';
        const taskType = body.task_type || 'task';
        const payload = body.payload != null ? body.payload : {};
        const planId = body.plan_id || null;
        if (!sessionId) return jsonResponse({ error: 'session_id or conversation_id required' }, 400);
        const tenantId = env.TENANT_ID || 'system';
        const { results: existing } = await env.DB.prepare(
          'SELECT COALESCE(MAX(position), 0) as max_pos FROM agent_request_queue WHERE session_id = ?'
        ).bind(sessionId).all();
        const position = (existing?.[0]?.max_pos ?? 0) + 1;
        const id = crypto.randomUUID();
        await env.DB.prepare(
          `INSERT INTO agent_request_queue (id, tenant_id, session_id, plan_id, task_type, payload_json, status, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'queued', ?, unixepoch(), unixepoch())`
        ).bind(id, tenantId, sessionId, planId, taskType, JSON.stringify(payload), position).run();
        return jsonResponse({ id, session_id: sessionId, task_type: taskType, status: 'queued', position });
      } catch (e) {
        console.error('[agent/queue]', e?.message || e);
        return jsonResponse({ error: String(e?.message || e) }, 500);
      }
    }

    if (pathLower === '/api/agent/queue/status' && method === 'GET') {
      try {
        if (!env.DB) return jsonResponse({ error: 'DB missing' }, 503);
        const sessionId = url.searchParams.get('session_id') || url.searchParams.get('conversation_id') || '';
        if (!sessionId) return jsonResponse({ error: 'session_id or conversation_id required' }, 400);
        const { results: rows } = await env.DB.prepare(
          'SELECT id, task_type, status, position, payload_json, result_json, plan_id, created_at FROM agent_request_queue WHERE session_id = ? ORDER BY position ASC'
        ).bind(sessionId).all();
        const queue = (rows || []).map((r) => {
          let payload = null;
          let result = null;
          try { if (r.payload_json) payload = JSON.parse(r.payload_json); } catch (_) {}
          try { if (r.result_json) result = JSON.parse(r.result_json); } catch (_) {}
          return {
            id: r.id,
            task_type: r.task_type,
            status: r.status,
            position: r.position,
            payload,
            result,
            plan_id: r.plan_id,
            created_at: r.created_at,
          };
        });
        const current = queue.find((q) => q.status === 'running') || queue.find((q) => q.status === 'queued');
        return jsonResponse({ session_id: sessionId, current: current || null, queue_count: queue.length, queue });
      } catch (e) {
        console.error('[agent/queue/status]', e?.message || e);
        return jsonResponse({ error: String(e?.message || e), queue: [], queue_count: 0 }, 500);
      }
    }

    const queueIdMatch = pathLower.match(/^\/api\/agent\/queue\/([^/]+)$/);
    if (queueIdMatch && method === 'DELETE') {
      try {
        if (!env.DB) return jsonResponse({ error: 'DB missing' }, 503);
        const queueId = queueIdMatch[1];
        await env.DB.prepare('DELETE FROM agent_request_queue WHERE id = ?').bind(queueId).run();
        return jsonResponse({ success: true });
      } catch (e) {
        return jsonResponse({ error: String(e?.message || e) }, 500);
      }
    }

    if (pathLower === '/api/agent/plan/approve' && method === 'POST') {
      try {
        if (!env.DB) return jsonResponse({ error: 'DB missing' }, 503);
        const body = await request.json().catch(() => ({}));
        const planId = body.plan_id || '';
        if (!planId) return jsonResponse({ error: 'plan_id required' }, 400);
        const r = await env.DB.prepare(
          "UPDATE agent_execution_plans SET status = 'approved', updated_at = unixepoch() WHERE id = ? AND status = 'pending'"
        ).bind(planId).run();
        if (r.meta?.changes === 0) return jsonResponse({ error: 'Plan not found or already approved/rejected' }, 404);
        return jsonResponse({ plan_id: planId, status: 'approved' });
      } catch (e) {
        console.error('[agent/plan/approve]', e?.message || e);
        return jsonResponse({ error: String(e?.message || e) }, 500);
      }
    }

    if (pathLower === '/api/agent/plan/reject' && method === 'POST') {
      try {
        if (!env.DB) return jsonResponse({ error: 'DB missing' }, 503);
        const body = await request.json().catch(() => ({}));
        const planId = body.plan_id || '';
        if (!planId) return jsonResponse({ error: 'plan_id required' }, 400);
        const r = await env.DB.prepare(
          "UPDATE agent_execution_plans SET status = 'rejected', updated_at = unixepoch() WHERE id = ? AND status = 'pending'"
        ).bind(planId).run();
        if (r.meta?.changes === 0) return jsonResponse({ error: 'Plan not found or already approved/rejected' }, 404);
        return jsonResponse({ plan_id: planId, status: 'rejected' });
      } catch (e) {
        console.error('[agent/plan/reject]', e?.message || e);
        return jsonResponse({ error: String(e?.message || e) }, 500);
      }
    }

    if (pathLower === '/api/agent/chat/execute-approved-tool' && method === 'POST') {
      try {
        const body = await request.json().catch(() => ({}));
        const toolName = body.tool_name || body.name;
        const toolInput = body.tool_input || body.parameters || body.input || {};
        if (!toolName || typeof toolName !== 'string') return jsonResponse({ success: false, error: 'tool_name required' }, 400);
        console.log('[execute-approved-tool] tool_name:', toolName);
        console.log('[execute-approved-tool] tool_input:', JSON.stringify(toolInput));
        const out = await invokeMcpToolFromChat(env, toolName, toolInput, body.conversation_id ?? null, { skipApprovalCheck: true });
        console.log('[execute-approved-tool] result:', JSON.stringify(out));
        if (out.error) return jsonResponse({ success: false, error: out.error }, 200);
        return jsonResponse({ success: true, result: out.result ?? out });
      } catch (e) {
        console.error('[agent/chat/execute-approved-tool]', e?.message || e);
        return jsonResponse({ success: false, error: String(e?.message || e) }, 500);
      }
    }

    if (pathLower === '/api/integrations/drive/list' && method === 'GET') {
      return jsonResponse({ error: 'Drive file list not implemented yet. OAuth tokens must be stored after Connect Google Drive; then list files via Google Drive API.', files: [] }, 501);
    }
    if (pathLower === '/api/integrations/github/list' && method === 'GET') {
      return jsonResponse({ error: 'GitHub file list not implemented yet. OAuth tokens must be stored after Connect GitHub; then list repos/files via GitHub API.', files: [] }, 501);
    }
    // Google Drive -- list files
    if (method === 'GET' && pathLower === '/api/integrations/gdrive/files') {
      const authUser = await getAuthUser(request, env);
      if (!authUser) return jsonResponse({ error: 'unauthorized' }, 401);
      const integrationUserId = authUser.email || authUser.id;
      const folderId = url.searchParams.get('folderId') || 'root';
      const tokenRow = await getIntegrationToken(env.DB, integrationUserId, 'google_drive', '');
      if (!tokenRow) return jsonResponse({ error: 'not_connected' }, 400);
      const res = await fetch(`https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+trashed=false&fields=files(id,name,mimeType,size,modifiedTime)&orderBy=name`, { headers: { Authorization: `Bearer ${tokenRow.access_token}` } });
      const data = await res.json();
      return jsonResponse(data);
    }
    // Google Drive -- get file content
    if (method === 'GET' && pathLower === '/api/integrations/gdrive/file') {
      const authUser = await getAuthUser(request, env);
      if (!authUser) return jsonResponse({ error: 'unauthorized' }, 401);
      const integrationUserId = authUser.email || authUser.id;
      const fileId = url.searchParams.get('fileId');
      const tokenRow = await getIntegrationToken(env.DB, integrationUserId, 'google_drive', '');
      if (!tokenRow) return jsonResponse({ error: 'not_connected' }, 400);
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, { headers: { Authorization: `Bearer ${tokenRow.access_token}` } });
      const content = await res.text();
      return jsonResponse({ content });
    }
    // GitHub -- list repos
    if (method === 'GET' && pathLower === '/api/integrations/github/repos') {
      const authUser = await getAuthUser(request, env);
      if (!authUser) return jsonResponse({ error: 'unauthorized' }, 401);
      const integrationUserId = authUser.email || authUser.id;
      const githubAccount = url.searchParams.get('account') || '';
      const tokenRow = await getIntegrationToken(env.DB, integrationUserId, 'github', githubAccount);
      if (!tokenRow) return jsonResponse({ error: 'not_connected' }, 400);
      const res = await fetch('https://api.github.com/user/repos?sort=updated&per_page=100&affiliation=owner,collaborator,organization_member', { headers: { Authorization: `Bearer ${tokenRow.access_token}`, 'User-Agent': 'IAM-Platform' } });
      const data = await res.json();
      return jsonResponse(data);
    }
    // GitHub -- list files in repo path
    if (method === 'GET' && pathLower === '/api/integrations/github/files') {
      const authUser = await getAuthUser(request, env);
      if (!authUser) return jsonResponse({ error: 'unauthorized' }, 401);
      const integrationUserId = authUser.email || authUser.id;
      const githubAccount = url.searchParams.get('account') || '';
      const repo = url.searchParams.get('repo');
      const filePath = url.searchParams.get('path') || '';
      const tokenRow = await getIntegrationToken(env.DB, integrationUserId, 'github', githubAccount);
      if (!tokenRow) return jsonResponse({ error: 'not_connected' }, 400);
      const res = await fetch(`https://api.github.com/repos/${encodeURIComponent(repo)}/contents/${encodeURIComponent(filePath)}`, { headers: { Authorization: `Bearer ${tokenRow.access_token}`, 'User-Agent': 'IAM-Platform' } });
      const data = await res.json();
      return jsonResponse(data);
    }
    // GitHub -- get file content
    if (method === 'GET' && pathLower === '/api/integrations/github/file') {
      const authUser = await getAuthUser(request, env);
      if (!authUser) return jsonResponse({ error: 'unauthorized' }, 401);
      const integrationUserId = authUser.email || authUser.id;
      const githubAccount = url.searchParams.get('account') || '';
      const repo = url.searchParams.get('repo');
      const filePath = url.searchParams.get('path');
      const tokenRow = await getIntegrationToken(env.DB, integrationUserId, 'github', githubAccount);
      if (!tokenRow) return jsonResponse({ error: 'not_connected' }, 400);
      const res = await fetch(`https://api.github.com/repos/${encodeURIComponent(repo)}/contents/${encodeURIComponent(filePath)}`, { headers: { Authorization: `Bearer ${tokenRow.access_token}`, 'User-Agent': 'IAM-Platform' } });
      const data = await res.json();
      if (!res.ok) return jsonResponse({ error: data.message || 'Not found' }, res.status);
      const content = data.content ? atob(data.content.replace(/\n/g, '')) : '';
      return jsonResponse({ content, sha: data.sha, name: data.name });
    }
    // Playwright screenshots (R2 agent-sam/screenshots/) — list and serve
    if (pathLower === '/api/screenshots' && method === 'GET') {
      let authUser = await getAuthUser(request, env);
      if (!authUser && env.DB) {
        const originOrReferer = (request.headers.get('Origin') || request.headers.get('Referer') || '').trim();
        const sameOrigin = originOrReferer.startsWith('https://inneranimalmedia.com') || originOrReferer.startsWith('https://www.inneranimalmedia.com');
        if (sameOrigin) {
          const row = await env.DB.prepare(
            `SELECT id FROM auth_users WHERE LOWER(id) IN (?, ?, ?) LIMIT 1`
          ).bind('info@inneranimals.com', 'sam@inneranimalmedia.com', 'inneranimalclothing@gmail.com').first();
          if (row) authUser = { id: row.id };
        }
      }
      if (!authUser) return jsonResponse({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, 401);
      const bucket = env.DASHBOARD;
      if (!bucket || !bucket.list) return jsonResponse({ error: 'Screenshots bucket not configured', images: [] }, 200);
      try {
        const list = await bucket.list({ prefix: 'screenshots/', limit: 1000 });
        const objects = list.objects || [];
        const baseUrl = new URL(request.url).origin;
        const images = objects.map((o) => {
          const key = o.key || '';
          const name = key.split('/').pop() || key;
          return {
            id: key,
            filename: name,
            uploaded: o.uploaded ? new Date(o.uploaded).toISOString() : '',
            thumbnail: baseUrl + '/api/screenshots/asset?key=' + encodeURIComponent(key),
            url: baseUrl + '/api/screenshots/asset?key=' + encodeURIComponent(key),
            meta: {},
            source: 'screenshots'
          };
        });
        return jsonResponse({ images, source: 'screenshots' });
      } catch (e) {
        return jsonResponse({ error: String(e?.message || e), images: [] }, 500);
      }
    }
    if (pathLower === '/api/screenshots/asset' && method === 'GET') {
      let authUser = await getAuthUser(request, env);
      if (!authUser && env.DB) {
        const originOrReferer = (request.headers.get('Origin') || request.headers.get('Referer') || '').trim();
        const sameOrigin = originOrReferer.startsWith('https://inneranimalmedia.com') || originOrReferer.startsWith('https://www.inneranimalmedia.com');
        if (sameOrigin) {
          const row = await env.DB.prepare(
            `SELECT id FROM auth_users WHERE LOWER(id) IN (?, ?, ?) LIMIT 1`
          ).bind('info@inneranimals.com', 'sam@inneranimalmedia.com', 'inneranimalclothing@gmail.com').first();
          if (row) authUser = { id: row.id };
        }
      }
      if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
      const key = url.searchParams.get('key') || '';
      if (!key || !key.startsWith('screenshots/')) return jsonResponse({ error: 'Invalid key' }, 400);
      const bucket = env.DASHBOARD;
      if (!bucket || !bucket.get) return jsonResponse({ error: 'Not configured' }, 503);
      try {
        const obj = await bucket.get(key);
        if (!obj || !obj.body) return jsonResponse({ error: 'Not found' }, 404);
        const ct = obj.httpMetadata?.contentType || 'image/png';
        return new Response(obj.body, { headers: { 'Content-Type': ct, 'Cache-Control': 'private, max-age=3600' } });
      } catch (_) {
        return jsonResponse({ error: 'Not found' }, 404);
      }
    }
    if (pathLower === '/api/screenshots' && method === 'DELETE') {
      const authUser = await getAuthUser(request, env);
      if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
      const key = url.searchParams.get('key') || '';
      if (!key || !key.startsWith('screenshots/')) return jsonResponse({ error: 'Invalid key' }, 400);
      const bucket = env.DASHBOARD;
      if (!bucket || !bucket.delete) return jsonResponse({ error: 'Not configured' }, 503);
      try {
        await bucket.delete(key);
        return jsonResponse({ ok: true, deleted: key });
      } catch (e) {
        return jsonResponse({ error: String(e?.message || e) }, 500);
      }
    }

    // Cloudflare Images API proxy (dashboard/images.html)
    const imagesToken = env.CLOUDFLARE_IMAGES_TOKEN || env.CLOUDFLARE_IMAGES_API_TOKEN;
    const imagesAccountId = env.CLOUDFLARE_ACCOUNT_ID || env.CLOUDFLARE_IMAGES_ACCOUNT_HASH;
    if (pathLower === '/api/images' && method === 'GET') {
      let authUser = await getAuthUser(request, env);
      if (!authUser && env.DB) {
        const originOrReferer = (request.headers.get('Origin') || request.headers.get('Referer') || '').trim();
        const sameOrigin = originOrReferer.startsWith('https://inneranimalmedia.com') || originOrReferer.startsWith('https://www.inneranimalmedia.com');
        if (sameOrigin) {
          const row = await env.DB.prepare(
            `SELECT id FROM auth_users WHERE LOWER(id) IN (?, ?, ?) LIMIT 1`
          ).bind('info@inneranimals.com', 'sam@inneranimalmedia.com', 'inneranimalclothing@gmail.com').first();
          if (row) authUser = { id: row.id };
        }
      }
      if (!authUser) return jsonResponse({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, 401);
      if (!imagesAccountId || !imagesToken) return jsonResponse({ error: 'Cloudflare Images not configured', code: 'NOT_CONFIGURED' }, 503);
      const page = url.searchParams.get('page') || '1';
      const perPage = url.searchParams.get('per_page') || '1000';
      const cfUrl = `https://api.cloudflare.com/client/v4/accounts/${imagesAccountId}/images/v1?page=${page}&per_page=${Math.min(10000, Math.max(1, parseInt(perPage, 10) || 100))}`;
      const res = await fetch(cfUrl, { headers: { Authorization: `Bearer ${imagesToken}` } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return jsonResponse({ error: data.errors?.[0]?.message || 'Cloudflare Images API error', code: 'CF_IMAGES_ERROR' }, res.status);
      const images = (data.result && data.result.images) ? data.result.images.map((img) => ({
        id: img.id,
        filename: img.filename,
        uploaded: img.uploaded,
        thumbnail: (img.variants && img.variants[0]) || '',
        url: (img.variants && img.variants[0]) || '',
        meta: img.meta || {}
      })) : [];
      return jsonResponse({ images, accountHash: env.CLOUDFLARE_IMAGES_ACCOUNT_HASH || imagesAccountId });
    }
    if (pathLower === '/api/images' && method === 'POST') {
      const authUser = await getAuthUser(request, env);
      if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
      if (!imagesAccountId || !imagesToken) return jsonResponse({ error: 'Cloudflare Images not configured' }, 503);
      const contentType = request.headers.get('Content-Type') || '';
      let body;
      if (contentType.includes('application/json')) {
        body = await request.json().catch(() => ({}));
        const imageUrl = body.url;
        if (!imageUrl || typeof imageUrl !== 'string') return jsonResponse({ error: 'Missing url', ok: false }, 400);
        const formBody = new URLSearchParams({ url: imageUrl.trim() });
        const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${imagesAccountId}/images/v1`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${imagesToken}`, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: formBody.toString()
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return jsonResponse({ error: data.errors?.[0]?.message || 'Upload failed', ok: false }, res.status);
        const img = data.result;
        return jsonResponse({ ok: true, image: img ? { id: img.id, filename: img.filename, uploaded: img.uploaded, url: (img.variants && img.variants[0]) || '', thumbnail: (img.variants && img.variants[0]) || '' } : {} });
      }
      if (contentType.includes('multipart/form-data')) {
        body = await request.formData().catch(() => null);
        if (!body || !body.get('file')) return jsonResponse({ error: 'Missing file', ok: false }, 400);
        const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${imagesAccountId}/images/v1`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${imagesToken}` },
          body
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return jsonResponse({ error: data.errors?.[0]?.message || 'Upload failed', ok: false }, res.status);
        const img = data.result;
        return jsonResponse({ ok: true, image: img ? { id: img.id, filename: img.filename, uploaded: img.uploaded, url: (img.variants && img.variants[0]) || '', thumbnail: (img.variants && img.variants[0]) || '' } : {} });
      }
      return jsonResponse({ error: 'Use JSON { url } or multipart file', ok: false }, 400);
    }
    if (method === 'DELETE' && /^\/api\/images\/[^/]+$/.test(pathLower)) {
      const authUser = await getAuthUser(request, env);
      if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
      if (!imagesAccountId || !imagesToken) return jsonResponse({ error: 'Cloudflare Images not configured' }, 503);
      const id = pathLower.replace(/^\/api\/images\/?/, '');
      if (!id) return jsonResponse({ error: 'Missing image id' }, 400);
      const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${imagesAccountId}/images/v1/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${imagesToken}` } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return jsonResponse({ error: data.errors?.[0]?.message || 'Delete failed', ok: false }, res.status);
      return jsonResponse({ ok: true });
    }
    if (pathLower.startsWith('/api/images/') && pathLower.endsWith('/meta')) {
      const authUser = await getAuthUser(request, env);
      if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
      const id = pathLower.replace(/^\/api\/images\/?/, '').replace(/\/meta$/, '').trim();
      if (!id) return jsonResponse({ error: 'Missing image id' }, 400);
      if (method === 'GET') {
        if (!imagesAccountId || !imagesToken) return jsonResponse({ error: 'Cloudflare Images not configured' }, 503);
        const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${imagesAccountId}/images/v1/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${imagesToken}` } });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return jsonResponse({ error: data.errors?.[0]?.message || 'Not found', ok: false }, res.status);
        return jsonResponse({ ok: true, meta: (data.result && data.result.meta) || {} });
      }
      if (method === 'POST') {
        const body = await request.json().catch(() => ({}));
        if (!imagesAccountId || !imagesToken) return jsonResponse({ error: 'Cloudflare Images not configured' }, 503);
        const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${imagesAccountId}/images/v1/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${imagesToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ metadata: body })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return jsonResponse({ error: data.errors?.[0]?.message || 'Update failed', ok: false }, res.status);
        const meta = (data.result && data.result.meta) || body;
        return jsonResponse({ ok: true, meta });
      }
    }

    if (pathLower === '/api/agent/today-todo' && method === 'GET') {
      try {
        let markdown = '';
        if (env.DB) {
          const row = await env.DB.prepare("SELECT value FROM agent_memory_index WHERE key = 'today_todo' AND tenant_id = 'tenant_sam_primeaux'").first();
          if (row?.value) markdown = String(row.value);
        }
        if (!markdown && env.R2) {
          try {
            const o = await env.R2.get('memory/today-todo.md');
            if (o) {
              markdown = await o.text();
              if (markdown && env.DB) {
                await env.DB.prepare(
                  `INSERT INTO agent_memory_index (tenant_id, agent_config_id, memory_type, key, value, importance_score, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, unixepoch(), unixepoch()) ON CONFLICT(key) DO UPDATE SET value=excluded.value, importance_score=excluded.importance_score, updated_at=unixepoch()`
                ).bind('tenant_sam_primeaux', 'agent-sam-primary', 'user_context', 'today_todo', markdown, 0.95).run();
              }
            }
          } catch (_) {}
        }
        return jsonResponse({ markdown: markdown || '', ok: true });
      } catch (e) {
        return jsonResponse({ markdown: '', ok: false, error: String(e?.message || e) }, 500);
      }
    }

    if (pathLower === '/api/agent/today-todo' && method === 'PUT') {
      const session = await getSession(env, request);
      if (!session) return jsonResponse({ error: 'Unauthorized' }, 401);
      try {
        const body = await request.json().catch(() => ({}));
        let markdown = body?.markdown;
        if (Array.isArray(body?.items) && body.items.length) {
          markdown = body.items.map((line) => (line.trim().match(/^[-*]\s/) ? line.trim() : '- ' + line.trim())).join('\n');
        }
        if (typeof markdown !== 'string') markdown = '';
        if (env.DB) {
          await env.DB.prepare(
            `INSERT INTO agent_memory_index (tenant_id, agent_config_id, memory_type, key, value, importance_score, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, unixepoch(), unixepoch()) ON CONFLICT(key) DO UPDATE SET value=excluded.value, importance_score=excluded.importance_score, updated_at=unixepoch()`
          ).bind('tenant_sam_primeaux', 'agent-sam-primary', 'user_context', 'today_todo', markdown, 0.95).run();
        }
        if (env.R2 && markdown) {
          await env.R2.put('memory/today-todo.md', markdown);
        }
        invalidateCompiledContextCache(env);
        return jsonResponse({ ok: true, markdown });
      } catch (e) {
        return jsonResponse({ ok: false, error: String(e?.message || e) }, 500);
      }
    }

    if (pathLower === '/api/agent/context/bootstrap' && method === 'GET') {
      try {
        const row = await env.DB.prepare(
          `SELECT compiled_context, token_count FROM ai_compiled_context_cache
           WHERE context_hash = 'system:agent_sam:v1'
           AND (expires_at IS NULL OR expires_at > unixepoch())`
        ).first();
        if (row) {
          await env.DB.prepare(
            `UPDATE ai_compiled_context_cache
             SET access_count = access_count + 1, last_accessed_at = unixepoch()
             WHERE context_hash = 'system:agent_sam:v1'`
          ).run();
          return jsonResponse({ compiled_context: row.compiled_context, token_count: row.token_count ?? null });
        }
        return jsonResponse({ compiled_context: null });
      } catch (e) {
        console.error('[agent/context/bootstrap] failed:', e?.message ?? e);
        return jsonResponse({ compiled_context: null });
      }
    }

    if (pathLower === '/api/agent/bootstrap' && method === 'GET') {
      try {
        const session = await getSession(env, request);
        const userId = session?.user_id || 'system';
        const cacheKey = 'bootstrap_' + userId;
        if (env.DB) {
          const cached = await env.DB.prepare(
            `SELECT compiled_context FROM ai_compiled_context_cache WHERE context_hash = ? AND (expires_at IS NULL OR expires_at > unixepoch())`
          ).bind(cacheKey).first();
          if (cached?.compiled_context) {
            return new Response(cached.compiled_context, {
              headers: { 'Content-Type': 'application/json', 'X-Cache': 'HIT' },
            });
          }
        }
        const today = new Date().toISOString().slice(0, 10);
        const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
        const prefix = 'memory/daily/';
        let dailyLog = '';
        let yesterdayLog = '';
        let schemaAndRecordsMemory = '';
        let todayTodo = '';
        if (env.R2) {
          try {
            const o1 = await env.R2.get(prefix + today + '.md');
            if (o1) dailyLog = await o1.text();
            const o2 = await env.R2.get(prefix + yesterday + '.md');
            if (o2) yesterdayLog = await o2.text();
            const o3 = await env.R2.get('memory/schema-and-records.md');
            if (o3) schemaAndRecordsMemory = await o3.text();
            const o4 = await env.R2.get('memory/today-todo.md');
            if (o4) todayTodo = await o4.text();
          } catch (_) {}
        }
        if (!todayTodo && env.DB) {
          const row = await env.DB.prepare("SELECT value FROM agent_memory_index WHERE key = 'today_todo' AND tenant_id = 'tenant_sam_primeaux'").first();
          if (row?.value) todayTodo = String(row.value);
        }
        const context = {
          daily_log: dailyLog || null,
          yesterday_log: yesterdayLog || null,
          schema_and_records_memory: schemaAndRecordsMemory || null,
          today_todo: todayTodo || null,
          date: today,
          hint: 'AI Search indexes from R2 automatically. Store daily logs in R2 at memory/daily/YYYY-MM-DD.md. Store schema/records memory at memory/schema-and-records.md. Store today\'s to-do at memory/today-todo.md or agent_memory_index key today_todo.',
        };
        if (env.DB && ctx && typeof ctx.waitUntil === 'function') {
          ctx.waitUntil(
            env.DB.prepare(
              `INSERT INTO ai_compiled_context_cache (id, context_hash, context_type, compiled_context, source_context_ids_json, token_count, tenant_id, created_at, last_accessed_at, expires_at) VALUES (?, ?, 'bootstrap', ?, '[]', 0, 'system', unixepoch(), unixepoch(), unixepoch()+1800) ON CONFLICT(context_hash) DO UPDATE SET compiled_context=excluded.compiled_context, expires_at=excluded.expires_at, last_accessed_at=unixepoch()`
            ).bind(cacheKey, cacheKey, JSON.stringify(context)).run().catch(() => {})
          );
        }
        return jsonResponse(context);
      } catch (e) {
        return jsonResponse({ error: String(e?.message || e) }, 500);
      }
    }

    return jsonResponse({ error: 'Not found' }, 404);
  } catch (err) {
    return jsonResponse({ error: String(err?.message || err) }, 500);
  }
}

async function handleMcpApi(req, u, e, ctx) {
  const pathLower = u.pathname.replace(/\/$/, '').toLowerCase();
  const method = (req.method || 'GET').toUpperCase();
  const MCP_WF_TENANT = 'tenant_sam_primeaux';
  if (!e.DB) return jsonResponse({ error: 'DB not configured' }, 503);
  try {
    if (pathLower === '/api/mcp/status' && method === 'GET') {
      return jsonResponse({ ok: true, service: 'mcp', status: 'connected' }, 200);
    }
    if (pathLower === '/api/mcp/agents' && method === 'GET') {
          let rows = [];
          try {
            const stmt = e.DB.prepare(
              `SELECT a.id, a.name, a.role_name, a.tool_permissions_json, a.model_policy_json,
                s.status, s.current_task, s.progress_pct, s.stage, s.logs_json, s.active_tools_json, s.cost_usd
               FROM agent_ai_sam a
               LEFT JOIN mcp_agent_sessions s ON s.agent_id = a.id AND s.id = (
                 SELECT id FROM mcp_agent_sessions WHERE agent_id = a.id ORDER BY created_at DESC LIMIT 1
               )
               WHERE a.id IN ('mcp_agent_architect','mcp_agent_builder','mcp_agent_tester','mcp_agent_operator')
               ORDER BY CASE a.id WHEN 'mcp_agent_architect' THEN 1 WHEN 'mcp_agent_builder' THEN 2 WHEN 'mcp_agent_tester' THEN 3 WHEN 'mcp_agent_operator' THEN 4 END`
            );
            const r = await stmt.all();
            rows = r.results || [];
          } catch (_) {
            const fallback = await e.DB.prepare(
              "SELECT id, name, role_name, tool_permissions_json, model_policy_json FROM agent_ai_sam WHERE id IN ('mcp_agent_architect','mcp_agent_builder','mcp_agent_tester','mcp_agent_operator') ORDER BY CASE id WHEN 'mcp_agent_architect' THEN 1 WHEN 'mcp_agent_builder' THEN 2 WHEN 'mcp_agent_tester' THEN 3 WHEN 'mcp_agent_operator' THEN 4 END"
            ).all().catch(() => ({ results: [] }));
            rows = (fallback.results || []).map((a) => ({ ...a, status: 'idle', current_task: null, progress_pct: 0, stage: null, logs_json: '[]', active_tools_json: '[]', cost_usd: 0 }));
          }
          return jsonResponse({ agents: rows });
        }
        if (pathLower === '/api/mcp/tools' && method === 'GET') {
          const panelAgent = u.searchParams.get('agent_id');
          let tools = [];
          try {
            const r = await e.DB.prepare('SELECT tool_name, description, tool_category FROM mcp_registered_tools WHERE enabled = 1 ORDER BY tool_name').all();
            const rows = filterToolRowsByPanel(panelAgent, r.results || []);
            tools = rows.map((t) => ({ tool_name: t.tool_name, description: t.description || '', category: t.tool_category || 'execute' }));
          } catch (_) {
            try {
              const r = await e.DB.prepare('SELECT tool_name, tool_category FROM mcp_registered_tools WHERE enabled = 1 ORDER BY tool_name').all();
              const rows = filterToolRowsByPanel(panelAgent, r.results || []);
              tools = rows.map((t) => ({ tool_name: t.tool_name, description: '', category: t.tool_category || 'execute' }));
            } catch (__) {}
          }
          return jsonResponse({ tools });
        }
        if (pathLower === '/api/mcp/commands' && method === 'GET') {
          let rows = [];
          try {
            const r = await e.DB.prepare("SELECT * FROM mcp_command_suggestions ORDER BY is_pinned DESC, sort_order ASC").all();
            rows = r.results || [];
          } catch (_) {}
          return jsonResponse({ suggestions: rows });
        }
        if (pathLower === '/api/mcp/dispatch' && method === 'POST') {
          let body = {};
          try { body = await req.json(); } catch (_) {}
          const prompt = String(body.prompt || '').trim();
          if (!prompt) return jsonResponse({ error: 'prompt required' }, 400);
          let agentId = 'mcp_agent_builder';
          let agentName = 'Builder';
          let routedBy = 'default';
          try {
            const patterns = await e.DB.prepare("SELECT workflow_agent AS agent_id, triggers_json FROM agent_intent_patterns WHERE is_active=1").all();
            const low = prompt.toLowerCase();
            for (const p of (patterns.results || [])) {
              let triggers = [];
              try { triggers = JSON.parse(p.triggers_json || '[]'); } catch (_) {}
              for (const t of triggers) {
                if (low.includes(String(t).toLowerCase())) {
                  agentId = p.agent_id;
                  const names = { mcp_agent_architect: 'Architect', mcp_agent_builder: 'Builder', mcp_agent_tester: 'Tester', mcp_agent_operator: 'Operator' };
                  agentName = names[p.agent_id] || p.agent_id;
                  routedBy = 'intent_pattern';
                  break;
                }
              }
              if (routedBy !== 'default') break;
            }
          } catch (_) {}
          const sessionId = crypto.randomUUID();
          const now = Math.floor(Date.now() / 1000);
          const messagesJson = JSON.stringify([{ role: 'user', content: prompt }]);
          try {
            await e.DB.prepare(
              `INSERT INTO mcp_agent_sessions (id, agent_id, tenant_id, status, current_task, progress_pct, stage, logs_json, active_tools_json, cost_usd, messages_json, created_at, updated_at)
               VALUES (?, ?, 'iam', 'running', ?, 0, 'queued', '[]', '[]', 0, ?, ?, ?)`
            ).bind(sessionId, agentId, prompt, messagesJson, now, now).run();
          } catch (err) {
            return jsonResponse({ error: 'mcp_agent_sessions table missing or insert failed', detail: String(err && err.message) }, 503);
          }
          return jsonResponse({ ok: true, session_id: sessionId, agent_id: agentId, agent_name: agentName, routed_by: routedBy });
        }
        if (pathLower === '/api/mcp/a11y') {
          if (method === 'GET') {
            return jsonResponse({
              ok: true,
              service: 'a11y-mcp-proxy',
              endpoint: '/api/mcp/a11y',
              status: 'ready',
            }, 200);
          }
          if (method === 'POST') {
            let body = {};
            try { body = await req.json(); } catch (_) {}
            const service = await e.DB.prepare(
              "SELECT endpoint_url, token_secret_name, service_name FROM mcp_services WHERE id = 'mcp_a11y_server' AND is_active = 1 LIMIT 1"
            ).first();
            if (!service?.endpoint_url) {
              return jsonResponse({ error: 'A11y MCP service not configured' }, 503);
            }
            const target = String(service.endpoint_url || '').trim();
            if (!target || target === 'https://inneranimalmedia.com/api/mcp/a11y') {
              return jsonResponse({ error: 'A11y MCP upstream endpoint not configured' }, 503);
            }
            const headers = {
              'Content-Type': 'application/json',
              'Accept': 'application/json, text/event-stream',
            };
            if (service.token_secret_name && e[service.token_secret_name]) {
              headers.Authorization = `Bearer ${e[service.token_secret_name]}`;
            } else if (e.MCP_AUTH_TOKEN) {
              headers.Authorization = `Bearer ${e.MCP_AUTH_TOKEN}`;
            }
            const upstream = await fetch(target, {
              method: 'POST',
              headers,
              body: JSON.stringify(body || {}),
            });
            const raw = await upstream.text();
            return new Response(raw, {
              status: upstream.status,
              headers: { 'Content-Type': upstream.headers.get('content-type') || 'text/plain; charset=utf-8' },
            });
          }
        }
        if (pathLower === '/api/mcp/imgx') {
          if (method === 'GET') {
            return jsonResponse({ ok: true, service: 'imgx-remote-builtin', endpoint: '/api/mcp/imgx', providers: listImgxProviders(e) }, 200);
          }
          if (method === 'POST') {
            let body = {};
            try { body = await req.json(); } catch (_) {}
            const tool_name = String(body.tool_name || '').trim();
            const params = body.params && typeof body.params === 'object' ? body.params : {};
            if (!tool_name) return jsonResponse({ error: 'tool_name required' }, 400);
            const out = await runImgxBuiltinTool(e, tool_name, params);
            if (out && out.error) return jsonResponse(out, 400);
            return jsonResponse({ tool_name, result: out }, 200);
          }
        }
        const mcpSvcPingMatch = pathLower.match(/^\/api\/mcp\/services\/([^/]+)\/ping$/);
        if (mcpSvcPingMatch && method === 'POST') {
          const svcId = mcpSvcPingMatch[1];
          const svc = await e.DB.prepare(
            `SELECT endpoint_url FROM mcp_services WHERE id = ?`
          ).bind(svcId).first();
          if (!svc || !svc.endpoint_url) return jsonResponse({ error: 'Service not found' }, 404);
          let health = 'unreachable';
          try {
            const res = await fetch(String(svc.endpoint_url), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
              body: JSON.stringify({ jsonrpc: '2.0', method: 'ping', id: 1 }),
              signal: AbortSignal.timeout(3000),
            });
            health = res.ok ? 'healthy' : 'degraded';
          } catch (_) { health = 'unreachable'; }
          try {
            await e.DB.prepare(
              `UPDATE mcp_services SET health_status = ?, last_health_check = unixepoch(),
               updated_at = unixepoch() WHERE id = ?`
            ).bind(health, svcId).run();
          } catch (_) {}
          return jsonResponse({ id: svcId, health_status: health });
        }
        if (pathLower === '/api/mcp/services') {
          if (method === 'GET') {
            const r = await e.DB.prepare("SELECT id, service_name, service_type, endpoint_url, is_active, health_status FROM mcp_services WHERE is_active=1 ORDER BY service_name").all();
            return jsonResponse({ services: r.results || [] });
          }
          if (method === 'POST') {
            let body = {};
            try { body = await req.json(); } catch (_) {}
            const service_name = String(body.service_name || '').trim();
            const endpoint_url = String(body.endpoint_url || '').trim();
            const service_type = String(body.service_type || 'mcp-server').trim() || 'mcp-server';
            if (!service_name || !endpoint_url) return jsonResponse({ error: 'service_name and endpoint_url required' }, 400);
            const id = 'mcp_' + Date.now();
            try {
              await e.DB.prepare(
                "INSERT INTO mcp_services (id, service_name, endpoint_url, service_type, is_active, health_status) VALUES (?, ?, ?, ?, 1, 'unverified')"
              ).bind(id, service_name, endpoint_url, service_type).run();
            } catch (err) {
              return jsonResponse({ error: 'Insert failed', detail: String(err && err.message) }, 500);
            }
            return jsonResponse({ ok: true, id });
          }
        }
        if (pathLower === '/api/mcp/invoke' && method === 'POST') {
          let body = {};
          try { body = await req.json(); } catch (_) {}
          const tool_name = String(body.tool_name || '').trim();
          const params = body.params && typeof body.params === 'object' ? body.params : {};
          const session_id = body.session_id != null ? String(body.session_id) : null;
          if (!tool_name) return jsonResponse({ error: 'tool_name required' }, 400);
          const proxyFromMcp = req.headers.get('X-IAM-MCP-Proxy') === '1';
          if (proxyFromMcp) {
            const out = await invokeMcpToolFromChat(e, tool_name, params, session_id || '', {
              allowRemoteMcp: false,
              skipApprovalCheck: true,
              suppressTelemetry: false,
            });
            if (out.error) return jsonResponse({ error: out.error }, 404);
            return jsonResponse({ tool_name, result: out.result }, 200);
          }
          // Internal Playwright/browser tools -- run in worker (MYBROWSER) for UI validation, screenshots, navigation
          const INTERNAL_PLAYWRIGHT_TOOLS = ['playwright_screenshot', 'browser_screenshot', 'browser_navigate', 'browser_content'];
          if (INTERNAL_PLAYWRIGHT_TOOLS.includes(tool_name) && e.MYBROWSER && e.DASHBOARD) {
            try {
              const out = await runInternalPlaywrightTool(e, tool_name, params);
              await recordMcpToolCall(e, {
                conversationId: session_id || '',
                toolName: tool_name,
                toolCategory: 'browser',
                toolInput: params,
                result: out,
                error: null,
                serviceName: 'builtin',
              });
              return jsonResponse({ tool_name, result: out }, 200);
            } catch (err) {
              const errMsg = String(err?.message || err);
              await recordMcpToolCall(e, {
                conversationId: session_id || '',
                toolName: tool_name,
                toolCategory: 'browser',
                toolInput: params,
                result: null,
                error: errMsg,
                serviceName: 'builtin',
              });
              return jsonResponse({ tool_name, result: { error: errMsg } }, 200);
            }
          }
          const INTERNAL_IMGX_TOOLS = ['imgx_generate_image', 'imgx_edit_image', 'imgx_list_providers'];
          if (INTERNAL_IMGX_TOOLS.includes(tool_name)) {
            try {
              const out = await runImgxBuiltinTool(e, tool_name, params);
              const status = out && out.error ? 'failed' : 'completed';
              await recordMcpToolCall(e, {
                conversationId: session_id || '',
                toolName: tool_name,
                toolCategory: 'image',
                toolInput: params,
                result: out && out.error ? null : out,
                error: out && out.error ? String(out.error) : null,
                serviceName: 'builtin',
              });
              return jsonResponse({ tool_name, result: out }, out && out.error ? 400 : 200);
            } catch (err) {
              const errMsg = String(err?.message || err);
              await recordMcpToolCall(e, {
                conversationId: session_id || '',
                toolName: tool_name,
                toolCategory: 'image',
                toolInput: params,
                result: null,
                error: errMsg,
                serviceName: 'builtin',
              });
              return jsonResponse({ tool_name, result: { error: errMsg } }, 200);
            }
          }
          const toolRow = await e.DB.prepare(
            'SELECT * FROM mcp_registered_tools WHERE tool_name = ? AND enabled = 1'
          ).bind(tool_name).first();
          if (!toolRow) return jsonResponse({ error: 'Tool not found' }, 404);
          if (toolRow.requires_approval === 1) {
            return jsonResponse({ status: 'pending_approval', tool_name, params }, 202);
          }
          const token = e.MCP_AUTH_TOKEN;
          if (!token) return jsonResponse({ error: 'MCP auth not configured' }, 503);
          const mcpBody = {
            jsonrpc: '2.0',
            id: Date.now(),
            method: 'tools/call',
            params: { name: tool_name, arguments: params }
          };
          const targetMcpUrl = (() => {
            const configured = String(toolRow.mcp_service_url || '').trim();
            if (!configured || configured.toLowerCase() === 'builtin') return 'https://mcp.inneranimalmedia.com/mcp';
            return configured;
          })();
          let mcpRes;
          try {
            mcpRes = await fetch(targetMcpUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json, text/event-stream',
                'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify(mcpBody)
            });
          } catch (err) {
            await recordMcpToolCall(e, {
              conversationId: session_id || '',
              toolName: tool_name,
              toolCategory: String(toolRow.tool_category || 'mcp'),
              toolInput: params,
              result: null,
              error: String(err && err.message || err),
              serviceName: 'InnerAnimalMedia MCP',
            });
            return jsonResponse({ error: 'MCP request failed', detail: String(err && err.message || err) }, 502);
          }
          if (!mcpRes.ok) {
            const failText = await mcpRes.text();
            await recordMcpToolCall(e, {
              conversationId: session_id || '',
              toolName: tool_name,
              toolCategory: String(toolRow.tool_category || 'mcp'),
              toolInput: params,
              result: null,
              error: `MCP upstream ${mcpRes.status}: ${failText.slice(0, 2000)}`,
              serviceName: 'InnerAnimalMedia MCP',
            });
            return jsonResponse({ error: 'MCP upstream error', status: mcpRes.status, detail: failText.slice(0, 4000) }, 502);
          }
          const rawText = await mcpRes.text();
          const dataLine = rawText.split("\n").find(l => l.startsWith("data:"));
          let result = {};
          try {
            result = dataLine ? JSON.parse(dataLine.slice(5).trim()) : {};
          } catch (parseErr) {
            await recordMcpToolCall(e, {
              conversationId: session_id || '',
              toolName: tool_name,
              toolCategory: String(toolRow.tool_category || 'mcp'),
              toolInput: params,
              result: null,
              error: `MCP response parse error: ${String(parseErr?.message || parseErr)}`,
              serviceName: 'InnerAnimalMedia MCP',
            });
            return jsonResponse({ error: 'MCP response parse error' }, 502);
          }
          const content = result?.result?.content ?? result;
          await recordMcpToolCall(e, {
            conversationId: session_id || '',
            toolName: tool_name,
            toolCategory: String(toolRow.tool_category || 'mcp'),
            toolInput: params,
            result: content,
            error: null,
            serviceName: 'InnerAnimalMedia MCP',
          });
          return jsonResponse({ tool_name, result: content }, 200);
        }

        if (pathLower === '/api/mcp/workflows' && method === 'GET') {
          const { results } = await e.DB.prepare(
            `SELECT id, name, description, category, trigger_type, status,
                    run_count, success_count, last_run_at, estimated_cost_usd, created_at
             FROM mcp_workflows
             WHERE tenant_id = ?
             ORDER BY updated_at DESC`
          ).bind(MCP_WF_TENANT).all();
          return jsonResponse(results || [], 200);
        }
        if (pathLower === '/api/mcp/workflows' && method === 'POST') {
          let body = {};
          try { body = await req.json(); } catch (_) {}
          const name = String(body.name || '').trim();
          let stepsStr = body.steps_json;
          if (stepsStr == null) return jsonResponse({ error: 'name and steps_json are required' }, 400);
          if (typeof stepsStr !== 'string') stepsStr = JSON.stringify(stepsStr);
          if (!name || !stepsStr) return jsonResponse({ error: 'name and steps_json are required' }, 400);
          let trigStr = body.trigger_config_json;
          if (trigStr != null && typeof trigStr !== 'string') trigStr = JSON.stringify(trigStr);
          else if (trigStr == null) trigStr = JSON.stringify({});
          const statusIns = body.status != null ? String(body.status) : 'draft';
          const row = await e.DB.prepare(
            `INSERT INTO mcp_workflows
               (tenant_id, name, description, category, trigger_type, trigger_config_json,
                steps_json, timeout_seconds, requires_approval, estimated_cost_usd, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             RETURNING *`
          ).bind(
            MCP_WF_TENANT,
            name,
            body.description != null ? String(body.description) : null,
            body.category != null ? String(body.category) : null,
            body.trigger_type != null ? String(body.trigger_type) : 'manual',
            trigStr,
            stepsStr,
            body.timeout_seconds != null ? Number(body.timeout_seconds) || 300 : 300,
            body.requires_approval ? 1 : 0,
            body.estimated_cost_usd != null ? Number(body.estimated_cost_usd) || 0 : 0,
            statusIns
          ).first();
          return jsonResponse(row, 201);
        }
        const wfPatchMatch = pathLower.match(/^\/api\/mcp\/workflows\/([^/]+)$/);
        if (wfPatchMatch && method === 'PATCH') {
          const id = wfPatchMatch[1];
          let body = {};
          try { body = await req.json(); } catch (_) {}
          const fields = [];
          const vals = [];
          const allowed = ['name', 'description', 'category', 'trigger_type', 'trigger_config_json',
            'steps_json', 'timeout_seconds', 'requires_approval', 'estimated_cost_usd', 'status'];
          for (const key of allowed) {
            if (key in body) {
              fields.push(`${key} = ?`);
              let v = body[key];
              if (key === 'requires_approval') vals.push(v ? 1 : 0);
              else if ((key === 'trigger_config_json' || key === 'steps_json') && typeof v === 'object' && v !== null) vals.push(JSON.stringify(v));
              else vals.push(v);
            }
          }
          if (!fields.length) return jsonResponse({ error: 'No valid fields to update' }, 400);
          fields.push('updated_at = unixepoch()');
          vals.push(id, MCP_WF_TENANT);
          await e.DB.prepare(
            `UPDATE mcp_workflows SET ${fields.join(', ')} WHERE id = ? AND tenant_id = ?`
          ).bind(...vals).run();
          return jsonResponse({ success: true }, 200);
        }
        const wfRunMatch = pathLower.match(/^\/api\/mcp\/workflows\/([^/]+)\/run$/);
        if (wfRunMatch && method === 'POST') {
          if (!ctx || typeof ctx.waitUntil !== 'function') {
            return jsonResponse({ error: 'Async execution context not available' }, 500);
          }
          const workflow_id = wfRunMatch[1];
          let body = {};
          try { body = await req.json(); } catch (_) {}
          const session_id = body.session_id != null ? String(body.session_id) : null;
          const triggered_by = body.triggered_by != null ? String(body.triggered_by) : 'manual';
          const wf = await e.DB.prepare(
            `SELECT * FROM mcp_workflows WHERE id = ? AND status = 'active' AND tenant_id = ?`
          ).bind(workflow_id, MCP_WF_TENANT).first();
          if (!wf) return jsonResponse({ error: 'Workflow not found or not active' }, 404);
          const run = await e.DB.prepare(
            `INSERT INTO mcp_workflow_runs
               (workflow_id, session_id, tenant_id, status, triggered_by, started_at)
             VALUES (?, ?, ?, 'running', ?, unixepoch())
             RETURNING *`
          ).bind(workflow_id, session_id, MCP_WF_TENANT, triggered_by).first();
          await e.DB.prepare(
            `UPDATE mcp_workflows SET run_count = run_count + 1, last_run_at = unixepoch(),
             updated_at = unixepoch() WHERE id = ? AND tenant_id = ?`
          ).bind(workflow_id, MCP_WF_TENANT).run();
          ctx.waitUntil(executeWorkflowSteps(e, wf, run.id, session_id));
          return jsonResponse({ run_id: run.id, status: 'running' }, 202);
        }
        const wfRunsListMatch = pathLower.match(/^\/api\/mcp\/workflows\/([^/]+)\/runs$/);
        if (wfRunsListMatch && method === 'GET') {
          const workflow_id = wfRunsListMatch[1];
          const own = await e.DB.prepare(
            `SELECT id FROM mcp_workflows WHERE id = ? AND tenant_id = ?`
          ).bind(workflow_id, MCP_WF_TENANT).first();
          if (!own) return jsonResponse({ error: 'Workflow not found' }, 404);
          const { results } = await e.DB.prepare(
            `SELECT id, status, triggered_by, cost_usd, duration_ms,
                    started_at, completed_at, error_message
             FROM mcp_workflow_runs
             WHERE workflow_id = ?
             ORDER BY created_at DESC LIMIT 50`
          ).bind(workflow_id).all();
          return jsonResponse(results || [], 200);
        }

        return jsonResponse({ error: 'Not found' }, 404);
      } catch (err) {
        return jsonResponse({ error: String(err && err.message || err) }, 500);
      }
}

/** Record MCP tool call to mcp_tool_calls, mcp_usage_log, and mcp_services. All DB writes in try/catch so missing tables/columns do not break flow. */
async function recordMcpToolCall(env, opts) {
  const { conversationId, toolName, toolCategory, toolInput, result, error, serviceName } = opts;
  if (!env.DB) return;
  const tenant = 'tenant_sam_primeaux';
  const sessionId = conversationId ?? '';
  const status = error ? 'failed' : 'completed';
  const output = error ? JSON.stringify({ error }) : (typeof result === 'string' ? result : JSON.stringify(result ?? {}));
  const outputSlice = output.slice(0, 50000);
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const id = crypto.randomUUID();
  try {
    await env.DB.prepare(
      `INSERT INTO mcp_tool_calls (id, tenant_id, session_id, tool_name, tool_category, input_schema, output, status, invoked_by, invoked_at, completed_at, created_at, updated_at, error_message)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'agent_sam', ?, ?, ?, ?, ?)`
    ).bind(
      id,
      tenant,
      sessionId,
      toolName,
      toolCategory || 'mcp',
      JSON.stringify(toolInput || {}),
      outputSlice,
      status,
      now,
      now,
      now,
      now,
      error ? String(error).slice(0, 8000) : null
    ).run();
  } catch (e) { console.warn('[recordMcpToolCall] mcp_tool_calls', e?.message ?? e); }
  /* mcp_usage_log: rolled up by trg_mcp_tool_calls_usage (migration 161) after INSERT into mcp_tool_calls */
  if (serviceName) {
    try {
      await env.DB.prepare(
        `UPDATE mcp_services SET health_status = ?, last_used = ? WHERE service_name = ?`
      ).bind(error ? 'error' : 'active', new Date().toISOString(), serviceName).run();
    } catch (e) { console.warn('[recordMcpToolCall] mcp_services', e?.message ?? e); }
  }
}

/** Create or update MCP agent session at chat start. Uses conversation_id (migration 135). panel from request agent_id (migration 162). No-op if columns missing. */
async function upsertMcpAgentSession(env, conversationId, panelAgentId) {
  if (!env.DB || !conversationId) return;
  const now = new Date().toISOString();
  const nowUnix = Math.floor(Date.now() / 1000);
  const agentIdForRow = (panelAgentId != null && String(panelAgentId).trim()) ? String(panelAgentId).trim() : 'agent_sam';
  const panel = panelColumnFromRequestAgentId(agentIdForRow);
  try {
    await env.DB.prepare(
      `INSERT INTO mcp_agent_sessions (id, agent_id, tenant_id, status, conversation_id, last_activity, tool_calls_count, panel, created_at, updated_at)
       VALUES (?, ?, 'tenant_sam_primeaux', 'active', ?, ?, 0, ?, ?, ?)
       ON CONFLICT(conversation_id) DO UPDATE SET
         agent_id = excluded.agent_id,
         panel = excluded.panel,
         last_activity = excluded.last_activity,
         tool_calls_count = tool_calls_count + 1,
         updated_at = excluded.updated_at`
    ).bind(crypto.randomUUID(), agentIdForRow, conversationId, now, panel, nowUnix, nowUnix).run();
  } catch (e) { console.warn('[upsertMcpAgentSession]', e?.message ?? e); }
}

/** Invoke MCP tool from chat (same logic as /api/mcp/invoke). Returns { result } or { error }. opts.skipApprovalCheck: when true, skip requires_approval check (caller is execute-approved-tool). opts.suppressTelemetry: when true, skip recordMcpToolCall (workflow runner records its own rows). opts.allowRemoteMcp: when false, do not call remote MCP (used by inneranimalmedia-mcp-server proxy to avoid loops). */
async function invokeMcpToolFromChat(env, tool_name, params, conversationId, opts = {}) {
  const allowRemoteMcp = opts.allowRemoteMcp !== false;
  const suppressTelemetry = !!opts.suppressTelemetry;
  const rec = async (o) => {
    if (suppressTelemetry) return;
    await recordMcpToolCall(env, o);
  };
  const INTERNAL_PLAYWRIGHT_TOOLS = ['playwright_screenshot', 'browser_screenshot', 'browser_navigate', 'browser_content'];
  if (INTERNAL_PLAYWRIGHT_TOOLS.includes(tool_name) && env.MYBROWSER && env.DASHBOARD) {
    try {
      const out = { result: await runInternalPlaywrightTool(env, tool_name, params) };
      await rec( { conversationId, toolName: tool_name, toolCategory: 'browser', toolInput: params, result: out.result, error: null, serviceName: 'builtin' });
      return out;
    } catch (err) {
      const errMsg = String(err?.message || err);
      await rec( { conversationId, toolName: tool_name, toolCategory: 'browser', toolInput: params, result: null, error: errMsg, serviceName: 'builtin' });
      return { error: errMsg };
    }
  }
  if (tool_name === 'knowledge_search' && env.AI) {
    const query = (params.query ?? params.search_query ?? '').trim();
    if (!query) {
      await rec( { conversationId, toolName: tool_name, toolCategory: 'knowledge', toolInput: params, result: null, error: 'query required', serviceName: 'builtin' });
      return { error: 'query required' };
    }
    try {
      console.log('[knowledge_search] Using Vectorize RAG', { query });
      const aiSearchResponse = await vectorizeRagSearch(env, query, { topK: 5 });
      let results = aiSearchResponse?.results ?? aiSearchResponse?.data ?? [];
      let answer = results.map(r => (r.content ?? r.text ?? '')).filter(Boolean).join('\n\n').slice(0, 10000) || '';
      if (results.length === 0 && env.VECTORIZE && env.R2 && env.AI) {
        console.log('[knowledge_search] AI Search returned 0 results, trying direct Vectorize query');
        try {
          const modelResp = await env.AI.run(RAG_MEMORY_EMBED_MODEL, { text: [query] });
          const data = modelResp?.data ?? modelResp;
          const vector = (Array.isArray(data) ? data : data?.data)?.[0];
          if (vector && Array.isArray(vector)) {
            const vectorMatches = await env.VECTORIZE.query(vector, { topK: 5, returnMetadata: 'all' });
            const matches = vectorMatches?.matches ?? vectorMatches ?? [];
            const seen = new Set();
            for (const m of matches) {
              const source = m?.metadata?.source;
              if (!source || seen.has(source)) continue;
              seen.add(source);
              const obj = await env.R2.get(source);
              if (obj) {
                const text = await obj.text();
                const content = text.slice(0, 8000);
                results.push({ content, text: content, source, metadata: { source }, score: m.score ?? 0 });
              }
            }
            if (results.length > 0) answer = results.map(r => r.content ?? r.text ?? '').filter(Boolean).join('\n\n').slice(0, 10000);
          }
        } catch (fallbackErr) {
          console.warn('[knowledge_search] Vectorize fallback error', fallbackErr?.message ?? fallbackErr);
        }
      }
      console.log('[knowledge_search] AI Search results', { count: results.length });
      if (env.DB) {
        try {
          await env.DB.prepare(
            `INSERT INTO ai_rag_search_history (id, tenant_id, query_text, retrieved_chunk_ids_json, context_used, created_at) VALUES (?, ?, ?, ?, ?, ?)`
          ).bind(
            crypto.randomUUID(),
            'tenant_sam_primeaux',
            query,
            JSON.stringify(results.map(r => r.id ?? r.source ?? '')),
            answer,
            Math.floor(Date.now() / 1000)
          ).run();
        } catch (dbErr) {
          await env.DB.prepare(
            `INSERT INTO ai_rag_search_history (id, tenant_id, query_text, context_used, created_at) VALUES (?, ?, ?, ?, unixepoch())`
          ).bind(crypto.randomUUID(), 'tenant_sam_primeaux', query, answer).run().catch(() => {});
        }
      }
      const resultPayload = {
        query,
        answer,
        results: results.map(r => ({ content: r.content ?? r.text, source: r.source ?? r.metadata?.source ?? 'unknown', score: r.score })),
        sources: results.map(r => r.source ?? r.metadata?.source ?? ''),
      };
      const resultText = JSON.stringify(resultPayload);
      const out = { result: resultText };
      await rec( { conversationId, toolName: tool_name, toolCategory: 'knowledge', toolInput: params, result: resultText, error: null, serviceName: 'builtin' });
      return out;
    } catch (e) {
      const errMsg = e?.message ?? String(e);
      console.error('[knowledge_search] AI Search error:', errMsg);
      await rec( { conversationId, toolName: tool_name, toolCategory: 'knowledge', toolInput: params, result: null, error: errMsg, serviceName: 'builtin' });
      return { error: errMsg };
    }
  }
  if (tool_name === 'terminal_execute') {
    if (!env.TERMINAL_WS_URL) {
      const errMsg = 'Terminal not configured (TERMINAL_WS_URL not set)';
      await rec( { conversationId, toolName: tool_name, toolCategory: 'terminal', toolInput: params, result: null, error: errMsg, serviceName: 'builtin' });
      return { error: errMsg };
    }
    const command = params.command ?? '';
    try {
      const termResult = await runTerminalCommand(env, null, command, params.conversation_id ?? null);
      const out = { result: termResult.output ?? 'No output' };
      await rec( { conversationId, toolName: tool_name, toolCategory: 'terminal', toolInput: params, result: out.result, error: null, serviceName: 'builtin' });
      return out;
    } catch (err) {
      const errMsg = String(err?.message || err);
      await rec( { conversationId, toolName: tool_name, toolCategory: 'terminal', toolInput: params, result: null, error: errMsg, serviceName: 'builtin' });
      return { error: errMsg };
    }
  }
  if (tool_name === 'd1_query' && env.DB) {
    const sql = (params.query ?? params.sql ?? '').trim();
    const normalized = sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '').trim().toUpperCase();
    if (!normalized.startsWith('SELECT')) {
      await rec( { conversationId, toolName: tool_name, toolCategory: 'd1', toolInput: params, result: null, error: 'Only SELECT queries allowed via d1_query', serviceName: 'builtin' });
      return { error: 'Only SELECT queries allowed via d1_query' };
    }
    try {
      const rows = await env.DB.prepare(sql).all();
      const resultText = JSON.stringify(rows.results ?? []);
      await rec( { conversationId, toolName: tool_name, toolCategory: 'd1', toolInput: params, result: resultText, error: null, serviceName: 'builtin' });
      return { result: resultText };
    } catch (e) {
      const errMsg = `D1 error: ${e?.message ?? e}`;
      await rec( { conversationId, toolName: tool_name, toolCategory: 'd1', toolInput: params, result: null, error: errMsg, serviceName: 'builtin' });
      return { error: errMsg };
    }
  }
  if (tool_name === 'd1_write' && env.DB) {
    const sql = (params.sql ?? params.query ?? '').trim();
    const bindParams = Array.isArray(params.params) ? params.params : [];
    const blocked = /\bdrop\s+table\b|\btruncate\b/i;
    if (blocked.test(sql)) {
      await rec( { conversationId, toolName: tool_name, toolCategory: 'd1', toolInput: params, result: null, error: 'Blocked: DROP TABLE and TRUNCATE require manual approval', serviceName: 'builtin' });
      return { error: 'Blocked: DROP TABLE and TRUNCATE require manual approval' };
    }
    try {
      const stmt = env.DB.prepare(sql);
      const result = bindParams.length ? await stmt.bind(...bindParams).run() : await stmt.run();
      const changes = result.meta?.changes ?? result.changes ?? 0;
      const resultText = JSON.stringify({ changes, success: true });
      await rec( { conversationId, toolName: tool_name, toolCategory: 'd1', toolInput: params, result: resultText, error: null, serviceName: 'builtin' });
      return { result: resultText };
    } catch (e) {
      const errMsg = `D1 error: ${e?.message ?? e}`;
      await rec( { conversationId, toolName: tool_name, toolCategory: 'd1', toolInput: params, result: null, error: errMsg, serviceName: 'builtin' });
      return { error: errMsg };
    }
  }
  if (tool_name === 'r2_read' && env.R2) {
    const key = params.key ?? params.path ?? '';
    try {
      const obj = await env.R2.get(key);
      const resultText = obj ? await obj.text() : `Key not found: ${key}`;
      await rec( { conversationId, toolName: tool_name, toolCategory: 'r2', toolInput: params, result: resultText, error: null, serviceName: 'builtin' });
      return { result: resultText };
    } catch (e) {
      const errMsg = `R2 error: ${e?.message ?? e}`;
      await rec( { conversationId, toolName: tool_name, toolCategory: 'r2', toolInput: params, result: null, error: errMsg, serviceName: 'builtin' });
      return { error: errMsg };
    }
  }
  if (tool_name === 'r2_list' && env.R2) {
    const prefix = params.prefix ?? '';
    try {
      const list = await env.R2.list({ prefix, limit: 50 });
      const resultText = JSON.stringify(list.objects.map(o => ({ key: o.key, size: o.size })));
      await rec( { conversationId, toolName: tool_name, toolCategory: 'r2', toolInput: params, result: resultText, error: null, serviceName: 'builtin' });
      return { result: resultText };
    } catch (e) {
      const errMsg = `R2 error: ${e?.message ?? e}`;
      await rec( { conversationId, toolName: tool_name, toolCategory: 'r2', toolInput: params, result: null, error: errMsg, serviceName: 'builtin' });
      return { error: errMsg };
    }
  }
  if (tool_name === 'generate_execution_plan' && env.DB) {
    const summary = typeof params.summary === 'string' ? params.summary.trim() : '';
    const steps = Array.isArray(params.steps) ? params.steps : [];
    try {
      const planId = crypto.randomUUID();
      const tenantId = env.TENANT_ID || 'system';
      const planJson = JSON.stringify({ summary, steps });
      await env.DB.prepare(
        `INSERT INTO agent_execution_plans (id, tenant_id, session_id, plan_json, summary, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'pending', unixepoch(), unixepoch())`
      ).bind(planId, tenantId, conversationId ?? '', planJson, summary.slice(0, 2000)).run();
      const resultText = JSON.stringify({ plan_id: planId, status: 'pending', message: 'Plan created; user can approve or reject in the UI.' });
      await rec( { conversationId, toolName: tool_name, toolCategory: 'plan', toolInput: params, result: resultText, error: null, serviceName: 'builtin' });
      return { result: resultText };
    } catch (e) {
      const errMsg = e?.message ?? String(e);
      await rec( { conversationId, toolName: tool_name, toolCategory: 'plan', toolInput: params, result: null, error: errMsg, serviceName: 'builtin' });
      return { error: errMsg };
    }
  }
  if (tool_name === 'imgx_generate_image' || tool_name === 'imgx_edit_image' || tool_name === 'imgx_list_providers') {
    try {
      const out = await runImgxBuiltinTool(env, tool_name, params || {});
      if (out && out.error) {
        await rec( { conversationId, toolName: tool_name, toolCategory: 'image', toolInput: params, result: null, error: out.error, serviceName: 'builtin' });
        return { error: out.error };
      }
      await rec( { conversationId, toolName: tool_name, toolCategory: 'image', toolInput: params, result: out, error: null, serviceName: 'builtin' });
      return { result: out };
    } catch (e) {
      const errMsg = String(e?.message || e);
      await rec( { conversationId, toolName: tool_name, toolCategory: 'image', toolInput: params, result: null, error: errMsg, serviceName: 'builtin' });
      return { error: errMsg };
    }
  }
  const toolRow = await env.DB.prepare('SELECT * FROM mcp_registered_tools WHERE tool_name = ? AND enabled = 1').bind(tool_name).first();
  if (!toolRow) {
    await rec( { conversationId, toolName: tool_name, toolCategory: 'mcp', toolInput: params, result: null, error: 'Tool not found', serviceName: null });
    return { error: 'Tool not found' };
  }
  if (!opts.skipApprovalCheck && toolRow.requires_approval === 1) {
    await rec( { conversationId, toolName: tool_name, toolCategory: toolRow.tool_category || 'mcp', toolInput: params, result: null, error: 'Tool requires approval', serviceName: null });
    return { error: 'Tool requires approval' };
  }
  if (!allowRemoteMcp) {
    await rec({
      conversationId,
      toolName: tool_name,
      toolCategory: toolRow.tool_category || 'mcp',
      toolInput: params,
      result: null,
      error: 'Tool not available via main worker proxy path (no local handler)',
      serviceName: null,
    });
    return { error: 'Tool not available via main worker proxy path' };
  }
  const token = env.MCP_AUTH_TOKEN;
  if (!token) {
    await rec( { conversationId, toolName: tool_name, toolCategory: toolRow.tool_category || 'mcp', toolInput: params, result: null, error: 'MCP auth not configured', serviceName: 'mcp_remote' });
    return { error: 'MCP auth not configured' };
  }
  try {
    const targetMcpUrl = (() => {
      const configured = String(toolRow.mcp_service_url || '').trim();
      if (!configured || configured.toLowerCase() === 'builtin') return 'https://mcp.inneranimalmedia.com/mcp';
      return configured;
    })();
    const mcpRes = await fetch(targetMcpUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: { name: tool_name, arguments: params }
      }),
    });
    const rawText = await mcpRes.text();
    if (!mcpRes.ok) {
      console.warn('[invokeMcpToolFromChat] MCP non-OK', mcpRes.status, rawText?.slice(0, 500));
      const errMsg = `MCP ${mcpRes.status}: ${rawText?.slice(0, 200) || mcpRes.statusText}`;
      await rec( { conversationId, toolName: tool_name, toolCategory: toolRow.tool_category || 'mcp', toolInput: params, result: null, error: errMsg, serviceName: 'mcp_remote' });
      return { error: errMsg };
    }
    const dataLine = rawText.split('\n').find(l => l.startsWith('data:'));
    const parsed = dataLine ? JSON.parse(dataLine.slice(5).trim()) : {};
    const errMsg = parsed?.error?.message ?? parsed?.error;
    if (errMsg) {
      const errStr = String(errMsg);
      await rec( { conversationId, toolName: tool_name, toolCategory: toolRow.tool_category || 'mcp', toolInput: params, result: null, error: errStr, serviceName: 'mcp_remote' });
      return { error: errStr };
    }
    const content = parsed?.result?.content ?? parsed;
    const out = { result: content };
    await rec( { conversationId, toolName: tool_name, toolCategory: toolRow.tool_category || 'mcp', toolInput: params, result: content, error: null, serviceName: 'mcp_remote' });
    return out;
  } catch (err) {
    const errMsg = String(err?.message || err);
    await rec( { conversationId, toolName: tool_name, toolCategory: toolRow?.tool_category || 'mcp', toolInput: params, result: null, error: errMsg, serviceName: 'mcp_remote' });
    return { error: errMsg };
  }
}

/** Delegate MCP tool execution for workflow steps (skips approval; telemetry recorded per step by executeWorkflowSteps). */
async function dispatchMcpTool(env, tool_name, input_template, session_id) {
  const out = await invokeMcpToolFromChat(
    env,
    tool_name,
    input_template && typeof input_template === 'object' ? input_template : {},
    session_id || '',
    { skipApprovalCheck: true, suppressTelemetry: true }
  );
  if (out.error) throw new Error(out.error);
  return out.result;
}

async function executeWorkflowSteps(env, workflow, run_id, session_id) {
  const MCP_WF_TENANT = 'tenant_sam_primeaux';
  let lastError = null;
  try {
    let steps = [];
    try {
      steps = typeof workflow.steps_json === 'string' ? JSON.parse(workflow.steps_json || '[]') : (workflow.steps_json || []);
    } catch (parseErr) {
      lastError = String(parseErr?.message || parseErr);
      await env.DB.prepare(
        `UPDATE mcp_workflow_runs SET status = 'failed', error_message = ?, step_results_json = '[]',
         cost_usd = 0, duration_ms = 0, completed_at = unixepoch() WHERE id = ?`
      ).bind(lastError, run_id).run();
      return;
    }
    if (!Array.isArray(steps)) steps = [];
    const stepResults = [];
    let totalCost = 0;
    let failed = false;
    const startMs = Date.now();

    for (const step of steps) {
      const tool_name = step.tool_name;
      if (!tool_name) {
        failed = true;
        lastError = 'step missing tool_name';
        break;
      }
      const input_template = step.input_template && typeof step.input_template === 'object' ? step.input_template : {};
      const retry_max = Math.max(1, Number(step.retry_max) || 1);
      let attempt = 0;
      let stepStatus = 'failed';
      let output = null;
      let errorMsg = null;
      let dispatchResult = null;

      while (attempt < retry_max) {
        attempt++;
        try {
          dispatchResult = await dispatchMcpTool(env, tool_name, input_template, session_id);
          output = typeof dispatchResult === 'string' ? dispatchResult : JSON.stringify(dispatchResult ?? {});
          stepStatus = 'completed';
          break;
        } catch (err) {
          errorMsg = String(err?.message || err);
          lastError = errorMsg;
        }
      }

      const tcId = crypto.randomUUID();
      const callStatus = stepStatus === 'completed' ? 'completed' : 'failed';
      const outSlice = output != null ? String(output).slice(0, 50000) : null;
      const stepNow = new Date().toISOString().slice(0, 19).replace('T', ' ');
      try {
        await env.DB.prepare(
          `INSERT INTO mcp_tool_calls
             (id, tenant_id, session_id, tool_name, tool_category, input_schema,
              output, status, invoked_by, invoked_at, completed_at, created_at, updated_at, error_message)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'workflow_runner', ?, ?, ?, ?, ?)`
        ).bind(
          tcId,
          MCP_WF_TENANT,
          session_id ?? null,
          tool_name,
          step.tool_category != null ? String(step.tool_category) : 'unknown',
          JSON.stringify(input_template),
          outSlice,
          callStatus,
          stepNow,
          stepNow,
          stepNow,
          stepNow,
          errorMsg ? String(errorMsg).slice(0, 8000) : null
        ).run();
      } catch (dbErr) {
        console.warn('[executeWorkflowSteps] mcp_tool_calls insert', dbErr?.message ?? dbErr);
      }

      stepResults.push({ tool_name, status: callStatus, tool_call_id: tcId });

      if (callStatus === 'failed') {
        failed = true;
        break;
      }
    }

    const duration = Date.now() - startMs;
    const finalStatus = failed ? 'failed' : 'success';

    await env.DB.prepare(
      `UPDATE mcp_workflow_runs SET
         status = ?, step_results_json = ?, cost_usd = ?,
         duration_ms = ?, completed_at = unixepoch(), error_message = ?
       WHERE id = ?`
    ).bind(
      finalStatus,
      JSON.stringify(stepResults),
      totalCost,
      duration,
      failed ? (lastError || 'Workflow step failed') : null,
      run_id
    ).run();

    if (!failed) {
      await env.DB.prepare(
        `UPDATE mcp_workflows SET success_count = success_count + 1,
         updated_at = unixepoch() WHERE id = ? AND tenant_id = ?`
      ).bind(workflow.id, MCP_WF_TENANT).run();
    }
  } catch (err) {
    const msg = String(err?.message || err);
    try {
      await env.DB.prepare(
        `UPDATE mcp_workflow_runs SET status = 'failed', error_message = ?,
         completed_at = unixepoch(), duration_ms = 0 WHERE id = ?`
      ).bind(msg, run_id).run();
    } catch (_) {}
  }
}

/** Run Playwright/browser tools internally (MCP invoke). Used for UI validation, screenshots, and live page content. */
async function runInternalPlaywrightTool(env, toolName, params) {
  const { launch } = await import('@cloudflare/playwright');
  const url = (params.url || params.URL || '').trim() || 'https://example.com';
  const fullUrl = url.startsWith('http') ? url : 'https://' + url;
  const browser = await launch(env.MYBROWSER);
  try {
    const page = await browser.newPage();
    await page.setViewportSize({ width: params.width || 1280, height: params.height || 800 });
    await page.goto(fullUrl, { waitUntil: params.waitUntil || 'domcontentloaded', timeout: params.timeout || 20000 });
    if (toolName === 'browser_navigate') {
      return { ok: true, url: fullUrl };
    }
    if (toolName === 'browser_content') {
      const html = await page.content();
      return { ok: true, url: fullUrl, html: html.slice(0, 500000) };
    }
    if (toolName === 'playwright_screenshot' || toolName === 'browser_screenshot') {
      const buf = await page.screenshot({ type: 'png', fullPage: params.fullPage === true });
      const id = crypto.randomUUID();
      const key = `screenshots/${id}.png`;
      await env.DASHBOARD.put(key, buf, { httpMetadata: { contentType: 'image/png' } });
      const resultUrl = `https://pub-b845a8f899834f0faf95dc83eda3c505.r2.dev/${key}`;
      return { ok: true, screenshot_url: resultUrl, job_id: id };
    }
    return { ok: false, error: 'Unknown tool' };
  } finally {
    await browser.close();
  }
}

async function uploadImgxToDashboard(env, bytes, contentType, baseName) {
  if (!env.DASHBOARD || !bytes) return { ok: false, error: 'DASHBOARD bucket not configured' };
  const safeBase = String(baseName || 'imgx').replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 80) || 'imgx';
  const id = crypto.randomUUID();
  const ext = contentType && contentType.includes('webp') ? 'webp' : contentType && contentType.includes('jpeg') ? 'jpg' : 'png';
  const key = `generated/imgx/${safeBase}-${id}.${ext}`;
  await env.DASHBOARD.put(key, bytes, { httpMetadata: { contentType: contentType || 'image/png' } });
  return { ok: true, key, url: `https://pub-b845a8f899834f0faf95dc83eda3c505.r2.dev/${key}` };
}

function listImgxProviders(env) {
  return [
    { id: 'openai', available: !!env.OPENAI_API_KEY, models: ['gpt-image-1'] },
    { id: 'gemini', available: !!env.GEMINI_API_KEY, models: ['gemini-2.0-flash-exp'] },
  ];
}

async function runImgxBuiltinTool(env, toolName, params) {
  if (toolName === 'imgx_list_providers') {
    return { providers: listImgxProviders(env) };
  }

  const provider = String(params.provider || '').trim().toLowerCase() || (env.OPENAI_API_KEY ? 'openai' : (env.GEMINI_API_KEY ? 'gemini' : ''));
  if (!provider) return { error: 'No provider configured. Set OPENAI_API_KEY and/or GEMINI_API_KEY.' };
  if (provider !== 'openai') {
    return { error: 'Provider not yet enabled in this remote build. Use provider=openai.' };
  }
  if (!env.OPENAI_API_KEY) return { error: 'OPENAI_API_KEY not configured' };

  const prompt = String(params.prompt || '').trim();
  if (!prompt) return { error: 'prompt required' };
  const filename = String(params.filename || 'imgx').trim() || 'imgx';
  const size = String(params.size || '1024x1024').trim() || '1024x1024';

  if (toolName === 'imgx_generate_image') {
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: String(params.model || 'gpt-image-1'),
        prompt,
        size,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: data?.error?.message || 'OpenAI image generation failed' };
    const b64 = data?.data?.[0]?.b64_json;
    if (!b64) return { error: 'No image data returned by provider' };
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const stored = await uploadImgxToDashboard(env, bytes, 'image/png', filename);
    if (!stored.ok) return { error: stored.error || 'Image storage failed' };
    return { ok: true, provider: 'openai', model: String(params.model || 'gpt-image-1'), image_url: stored.url, key: stored.key };
  }

  if (toolName === 'imgx_edit_image') {
    const inputUrl = String(params.input_url || '').trim();
    if (!inputUrl) return { error: 'input_url required for imgx_edit_image' };
    const source = await fetch(inputUrl);
    if (!source.ok) return { error: `Failed to fetch input_url (${source.status})` };
    const sourceBytes = await source.arrayBuffer();
    const sourceType = source.headers.get('content-type') || 'image/png';
    const fd = new FormData();
    fd.append('model', String(params.model || 'gpt-image-1'));
    fd.append('prompt', prompt);
    fd.append('size', size);
    fd.append('image', new Blob([sourceBytes], { type: sourceType }), 'input.png');
    const res = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.OPENAI_API_KEY}` },
      body: fd,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: data?.error?.message || 'OpenAI image edit failed' };
    const b64 = data?.data?.[0]?.b64_json;
    if (!b64) return { error: 'No edited image data returned by provider' };
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const stored = await uploadImgxToDashboard(env, bytes, 'image/png', filename + '-edit');
    if (!stored.ok) return { error: stored.error || 'Image storage failed' };
    return { ok: true, provider: 'openai', model: String(params.model || 'gpt-image-1'), image_url: stored.url, key: stored.key };
  }

  return { error: `Unsupported IMGX tool: ${toolName}` };
}

const MCP_CHAT_TOOL_LOOP_MAX = 10;

const ACTION_TOOLS = [
  'd1_write', 'r2_write', 'r2_delete', 'terminal_execute', 'worker_deploy',
  'playwright_screenshot', 'browser_screenshot', 'browser_navigate', 'browser_content',
];
const READ_ONLY_TOOLS = [
  'knowledge_search', 'd1_query', 'r2_read', 'r2_list', 'web_search', 'telemetry_query',
];
function isActionTool(toolName) {
  return typeof toolName === 'string' && ACTION_TOOLS.includes(toolName);
}
function toolApprovalPreview(toolName, params) {
  const p = params && typeof params === 'object' ? params : {};
  const parts = [toolName];
  if (p.query) parts.push('query: ' + String(p.query).slice(0, 80));
  if (p.sql) parts.push('SQL: ' + String(p.sql).slice(0, 80));
  if (p.bucket || p.key) parts.push([p.bucket, p.key].filter(Boolean).join('/'));
  if (p.command) parts.push('cmd: ' + String(p.command).slice(0, 60));
  return parts.join(' | ') || 'Will execute: ' + toolName;
}

/** Anthropic chat with tools; runs tool_use loop. When opts.stream is true, returns SSE stream with tool_start/tool_result/text/done. */
async function chatWithToolsAnthropic(env, systemWithBlurb, apiMessages, model, conversationId, agent_id, ctx, opts = {}) {
  const wantStream = opts.stream === true;
  const mode = opts.mode || 'agent';
  let tools = [];
  try {
    const r = await env.DB.prepare('SELECT tool_name, description, input_schema, tool_category FROM mcp_registered_tools WHERE enabled = 1 ORDER BY tool_name').all();
    const filtered = filterToolRowsByPanel(agent_id, r.results || []);
    tools = filtered.map((t) => {
      let rawSchema = {};
      try { rawSchema = typeof t.input_schema === 'string' ? JSON.parse(t.input_schema) : (t.input_schema || {}); } catch (_) {}
      let input_schema;
      if (rawSchema && rawSchema.type === 'object' && rawSchema.properties) {
        input_schema = rawSchema;
      } else {
        const properties = {};
        const required = [];
        for (const [key, val] of Object.entries(rawSchema)) {
          if (key === 'type' || key === 'properties' || key === 'required') continue;
          properties[key] = {
            type: (val && val.type) || 'string',
            ...(val && val.items && { items: val.items }),
            ...(val && val.description && { description: val.description }),
            ...(val && val.enum && { enum: val.enum })
          };
          if (val && val.required) required.push(key);
        }
        input_schema = { type: 'object', properties: Object.keys(properties).length ? properties : {}, required };
      }
      return {
        name: t.tool_name,
        description: (t.description || t.tool_name).slice(0, 500),
        input_schema,
      };
    });
  } catch (e) {
    console.error('[chatWithToolsAnthropic] tool load failed:', e?.message ?? e);
  }
  if (tools.length === 0) return null;
  console.log('[chatWithToolsAnthropic] Loaded tools:', tools.length);
  const modelKey = resolveAnthropicModelKey(model.model_key);
  const allToolCalls = [];
  let messages = apiMessages.map((m) => ({ role: m.role, content: m.content }));
  let iter = 0;
  let lastContent = '';
  let lastUsage = { input_tokens: 0, output_tokens: 0 };

  const encoder = new TextEncoder();
  const enqueue = (controller, obj) => {
    controller.enqueue(encoder.encode('data: ' + JSON.stringify(obj) + '\n\n'));
  };

  const TOOL_DISPLAY = {
    terminal_execute: 'terminal',
    d1_query: 'D1 database',
    r2_read: 'file',
    r2_write: 'file',
    github_fetch: 'GitHub',
    web_search: 'web',
    deploy_worker: 'deploy',
    bash_cat: 'file',
    bash_find: 'filesystem',
    list_tools: 'tools',
    query_database: 'database',
  };
  const pendingStateEvents = [];
  const flushPendingToolStates = (controller) => {
    for (const evt of pendingStateEvents) enqueue(controller, evt);
    pendingStateEvents.length = 0;
  };

  while (iter < MCP_CHAT_TOOL_LOOP_MAX) {
    iter++;
    const body = {
      model: modelKey,
      max_tokens: 8192,
      system: systemWithBlurb,
      messages,
      tools,
    };
    console.log('[chatWithToolsAnthropic] Sending request to Claude', {
      model: modelKey,
      tools_count: tools.length,
      tool_names: tools.map((t) => t.name).slice(0, 5),
      has_tools_in_body: !!tools && tools.length > 0,
    });
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });
    console.log('[chatWithToolsAnthropic] Claude API response', { status: res.status, ok: res.ok });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return jsonResponse({ error: err.error?.message || res.statusText, stream: false }, res.status);
    }
    const data = await res.json();
    const content = data.content || [];
    lastUsage = { input_tokens: data.usage?.input_tokens ?? 0, output_tokens: data.usage?.output_tokens ?? 0 };
    const toolUseBlocks = content.filter((b) => b.type === 'tool_use');
    for (const b of toolUseBlocks) {
      console.log('[chatWithToolsAnthropic] Claude using tool', { tool_name: b.name, tool_id: b.id });
    }
    const textParts = content.filter((b) => b.type === 'text').map((b) => b.text).filter(Boolean);
    lastContent = textParts.join('');

    if (mode === 'ask' && toolUseBlocks.length > 0) {
      const actionBlock = toolUseBlocks.find((b) => isActionTool(b.name));
      if (actionBlock) {
        const toolDesc = (tools.find((t) => t.name === actionBlock.name) || {}).description || actionBlock.name;
        const preview = toolApprovalPreview(actionBlock.name, actionBlock.input);
        if (wantStream) {
          const streamBody = new ReadableStream({
            start(controller) {
              flushPendingToolStates(controller);
              enqueue(controller, { type: 'text', text: lastContent });
              emitCodeBlocksFromText(lastContent, (obj) => enqueue(controller, obj));
              enqueue(controller, {
                type: 'tool_approval_request',
                tool: {
                  name: actionBlock.name,
                  description: toolDesc,
                  parameters: actionBlock.input || {},
                  preview,
                },
              });
              enqueue(controller, { type: 'done', usage: lastUsage });
              controller.close();
            },
          });
          return new Response(streamBody, { headers: { 'Content-Type': 'text/event-stream' } });
        }
        return jsonResponse({
          tool_approval_request: true,
          text: lastContent,
          tool: { name: actionBlock.name, description: toolDesc, parameters: actionBlock.input || {}, preview },
          conversation_id: conversationId,
        });
      }
    }

    if (toolUseBlocks.length === 0) {
      const inputTokens = lastUsage.input_tokens;
      const outputTokens = lastUsage.output_tokens;
      const costUsd = calculateCost(model, inputTokens, outputTokens);
      try {
        await env.DB.prepare(
          "INSERT INTO agent_messages (id, conversation_id, role, content, provider, created_at) VALUES (?,?,?,?,?,unixepoch())"
        ).bind(crypto.randomUUID(), conversationId, 'assistant', lastContent.slice(0, 50000), model.provider).run();
      } catch (_) {}
      await streamDoneDbWrites(env, conversationId, model, lastContent, inputTokens, outputTokens, costUsd, agent_id, ctx);
      if (wantStream) {
        const streamBody = new ReadableStream({
          start(controller) {
            flushPendingToolStates(controller);
            enqueue(controller, { type: 'text', text: lastContent });
            emitCodeBlocksFromText(lastContent, (obj) => enqueue(controller, obj));
            enqueue(controller, { type: 'done', usage: { input_tokens: inputTokens, output_tokens: outputTokens, cost_usd: costUsd } });
            controller.close();
          },
        });
        return new Response(streamBody, { headers: { 'Content-Type': 'text/event-stream' } });
      }
      return jsonResponse({
        content: [{ type: 'text', text: lastContent }],
        message: { content: lastContent, role: 'assistant', tool_calls: allToolCalls.length ? allToolCalls : undefined },
        conversation_id: conversationId,
        stream: false,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cost_usd: costUsd,
      });
    }
    if (mode === 'ask') {
      const actionBlock = toolUseBlocks.find((b) => isActionTool(b.name));
      if (actionBlock) {
        const toolDesc = (tools.find((t) => t.name === actionBlock.name) || {}).description || actionBlock.name;
        const preview = toolApprovalPreview(actionBlock.name, actionBlock.input);
        return jsonResponse({
          tool_approval_request: true,
          text: lastContent ?? '',
          tool: { name: actionBlock.name, description: toolDesc, parameters: actionBlock.input || {}, preview },
          conversation_id: conversationId,
        });
      }
    }
    console.log('[chatWithToolsAnthropic] Tool use detected, invoking after response', { count: toolUseBlocks.length });
    const toolResults = [];
    for (const block of toolUseBlocks) {
      const name = block.name;
      const input = block.input || {};
      if (wantStream) {
        const toolLabel = TOOL_DISPLAY[name] ?? name;
        pendingStateEvents.push({ type: 'state', state: 'TOOL_CALL', context: { tool: toolLabel } });
      }
      const out = await invokeMcpToolFromChat(env, name, input, conversationId);
      if (wantStream) {
        pendingStateEvents.push({ type: 'state', state: 'THINKING', context: {} });
      }
      console.log('[chatWithToolsAnthropic] Tool invoked', {
        tool_name: name,
        tool_id: block.id,
        success: !out.error,
        error: out.error,
      });
      const resultText = out.error ? JSON.stringify({ error: out.error }) : (typeof out.result === 'string' ? out.result : JSON.stringify(out.result || {}));
      toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: resultText.slice(0, 50000) });
      allToolCalls.push({ id: block.id, name, input, result: resultText.slice(0, 500) });
    }
    messages.push({ role: 'assistant', content });
    messages.push({ role: 'user', content: toolResults });
    console.log('[chatWithToolsAnthropic] Tool results added to messages, sending follow-up request to Claude', { tool_results_count: toolResults.length });
  }

  if (iter >= MCP_CHAT_TOOL_LOOP_MAX && (!lastContent || lastContent.trim().length < 10)) {
    const finalSystem = systemWithBlurb + '\n\nYou must reply with a single concise final answer based on the conversation and tool results above. Do not use any tools.';
    const finalRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: modelKey,
        max_tokens: 4096,
        system: finalSystem,
        messages,
      }),
    });
    if (finalRes.ok) {
      const finalData = await finalRes.json();
      const finalText = (finalData.content || []).filter((b) => b.type === 'text').map((b) => b.text).filter(Boolean).join('');
      if (finalText.trim()) {
        lastContent = finalText.trim();
        lastUsage = { input_tokens: lastUsage.input_tokens + (finalData.usage?.input_tokens ?? 0), output_tokens: lastUsage.output_tokens + (finalData.usage?.output_tokens ?? 0) };
      }
    }
  }

  if (wantStream) {
    const streamBody = new ReadableStream({
      start(controller) {
        flushPendingToolStates(controller);
        enqueue(controller, { type: 'text', text: lastContent || '(Tool loop limit reached.)' });
        emitCodeBlocksFromText(lastContent || '', (obj) => enqueue(controller, obj));
        enqueue(controller, { type: 'done', usage: lastUsage });
        controller.close();
      },
    });
    return new Response(streamBody, { headers: { 'Content-Type': 'text/event-stream' } });
  }
  return jsonResponse({
    content: [{ type: 'text', text: lastContent || '(Tool loop limit reached.)' }],
    message: { content: lastContent || '(Tool loop limit reached.)', role: 'assistant', tool_calls: allToolCalls },
    conversation_id: conversationId,
    stream: false,
  });
}

async function processQueues(env) {
  if (!env.DB) return;
  try {
    const { results: sessions } = await env.DB.prepare(
      `SELECT DISTINCT session_id FROM agent_request_queue WHERE status = 'queued'`
    ).all();
    for (const { session_id } of sessions || []) {
      const task = await env.DB.prepare(
        `SELECT * FROM agent_request_queue WHERE session_id = ? AND status = 'queued' ORDER BY position ASC, created_at ASC LIMIT 1`
      ).bind(session_id).first();
      if (!task) continue;
      try {
        await env.DB.prepare(
          `UPDATE agent_request_queue SET status = 'running', updated_at = unixepoch() WHERE id = ?`
        ).bind(task.id).run();
        const payload = task.payload_json ? JSON.parse(task.payload_json) : {};
        await env.DB.prepare(
          `UPDATE agent_request_queue SET status = 'done', result_json = ?, updated_at = unixepoch() WHERE id = ?`
        ).bind(JSON.stringify({ success: true, payload: payload }), task.id).run();
      } catch (e) {
        await env.DB.prepare(
          `UPDATE agent_request_queue SET status = 'failed', result_json = ?, updated_at = unixepoch() WHERE id = ?`
        ).bind(JSON.stringify({ error: String(e?.message || e) }), task.id).run();
      }
    }
  } catch (e) {
    console.warn('[processQueues]', e?.message || e);
  }
}

worker.scheduled = async function scheduled(event, env, ctx) {
  if (event.cron === '*/30 * * * *') {
    ctx.waitUntil(processQueues(env));
    ctx.waitUntil(runOvernightCronStep(env));
  }
  if (event.cron === '0 0 * * *') {
    const today = new Date().toISOString().slice(0, 10);
    const already = await env.DB.prepare(
      `SELECT id FROM email_logs
       WHERE subject LIKE '%Daily Digest%'
       AND created_at >= ? LIMIT 1`
    ).bind(`${today}T00:00:00`).first().catch(() => null);
    if (already) return;
    ctx.waitUntil(sendDailyDigest(env));
    return;
  }
  if (event.cron === '0 6 * * *') {
    console.log('[cron] Starting daily doc sync (compact -> knowledge sync -> Vectorize index)');
    ctx.waitUntil(
      compactAgentChatsToR2(env)
        .then((r) => {
          if (r.error) console.error('[cron] RAG compact-chats failed:', r.error);
          else console.log('[cron] RAG compact-chats:', r.conversations, 'conversations,', r.messages, 'messages ->', r.key);
        })
        .then(() => runKnowledgeDailySync(env))
        .then((r) => {
          if (r.memory_key || r.priorities_key) console.log('[cron] knowledge sync:', r.memory_key, r.priorities_key);
        })
        .then(() => indexMemoryMarkdownToVectorize(env))
        .then((r) => {
          console.log('[cron] RAG index-memory:', r?.chunks ?? 0, 'chunks from', r?.indexed ?? 0, 'keys');
        })
        .catch((e) => console.error('[cron] RAG sync failed:', e?.message || e))
    );
  }
  if (event.cron === '30 13 * * *') {
    ctx.waitUntil(sendDailyPlanEmail(env));
  }
};
export default worker;

const OAUTH_STATE_TTL = 600;
const DEFAULT_TENANT = 'system';
const PROJECT_ID = 'inneranimalmedia';
function origin(url) { return url.origin; }

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function handleFederatedSearch(request, env) {
  if (!env.DB) return jsonResponse({ error: 'DB unavailable' }, 503);
  const session = await getSession(env, request);
  if (!session) return jsonResponse({ error: 'Unauthorized' }, 401);

  let body = {};
  try {
    body = await request.json();
  } catch (_) {}
  const query = (body?.query || '').toString().trim();
  if (!query) return jsonResponse({ error: 'query required' }, 400);
  const limit = Math.max(1, Math.min(10, Number(body?.limit || 6)));
  const sources = Array.isArray(body?.sources) && body.sources.length
    ? body.sources.map((s) => String(s).toLowerCase())
    : ['ai', 'chats', 'deployments', 'projects', 'github', 'drive', 'r2'];

  const out = { ai: [], chats: [], deployments: [], projects: [], github: [], drive: [], r2: [] };

  if (sources.includes('ai')) {
    try {
      const rag = await vectorizeRagSearch(env, query, { topK: limit });
      const rows = rag?.results ?? rag?.data ?? [];
      out.ai = rows.slice(0, limit).map((r, idx) => ({
        id: r.id || `ai_${idx}`,
        title: (r.title || r.source || 'AI result').toString(),
        snippet: (r.content || r.text || '').toString().slice(0, 180),
        url: (r.url || '/dashboard/agent').toString(),
      }));
    } catch (_) {}
  }

  if (sources.includes('chats')) {
    try {
      const rows = await env.DB.prepare(
        `SELECT conversation_id, content, created_at
         FROM agent_messages
         WHERE content LIKE ?
         ORDER BY created_at DESC
         LIMIT ?`
      ).bind(`%${query}%`, limit).all();
      out.chats = (rows?.results || []).map((r, idx) => ({
        id: `chat_${idx}`,
        title: 'Chat match',
        snippet: (r.content || '').toString().slice(0, 180),
        subtitle: r.created_at || '',
        url: r.conversation_id ? `/dashboard/chats?conversation=${encodeURIComponent(r.conversation_id)}` : '/dashboard/chats',
      }));
    } catch (_) {}
  }

  if (sources.includes('deployments')) {
    try {
      const rows = await env.DB.prepare(
        `SELECT worker_name, status, deployed_at, deployment_notes
         FROM cloudflare_deployments
         WHERE worker_name LIKE ? OR deployment_notes LIKE ?
         ORDER BY deployed_at DESC
         LIMIT ?`
      ).bind(`%${query}%`, `%${query}%`, limit).all();
      out.deployments = (rows?.results || []).map((r, idx) => ({
        id: `dep_${idx}`,
        title: `${r.worker_name || 'worker'} - ${r.status || 'unknown'}`,
        subtitle: r.deployed_at || '',
        snippet: (r.deployment_notes || '').toString().slice(0, 180),
        url: '/dashboard/cloud',
      }));
    } catch (_) {}
  }

  if (sources.includes('projects')) {
    try {
      const rows = await env.DB.prepare(
        `SELECT id, name, status
         FROM projects
         WHERE name LIKE ? OR status LIKE ?
         ORDER BY created_at DESC
         LIMIT ?`
      ).bind(`%${query}%`, `%${query}%`, limit).all();
      out.projects = (rows?.results || []).map((r) => ({
        id: r.id,
        title: r.name || 'Project',
        subtitle: r.status || '',
        url: '/dashboard/projects',
      }));
    } catch (_) {}
  }

  // Integration-backed sources are returned as capability placeholders if no direct index exists yet.
  if (sources.includes('github')) out.github = [];
  if (sources.includes('drive')) out.drive = [];
  if (sources.includes('r2')) out.r2 = [];

  return jsonResponse({ ok: true, query, results: out, meta: { limit, sources } });
}

async function ensureWorkSessionAndSignal(env, userId, workspaceId, signalType, source, payload) {
  if (!env?.DB || !userId) return;
  const wsId = workspaceId || 'ws_samprimeaux';
  const nowIso = new Date().toISOString();
  const sessionId = `wsess_${userId}_${wsId}`;
  const signalId = crypto.randomUUID();
  const safePayload = payload == null ? null : JSON.stringify(payload).slice(0, 4000);
  await env.DB.prepare(
    `INSERT INTO work_sessions (id, user_id, workspace_id, started_at, ended_at, source, metadata, created_at)
     VALUES (?, ?, ?, ?, NULL, ?, ?, unixepoch())
     ON CONFLICT(id) DO UPDATE SET ended_at = NULL, metadata = excluded.metadata`
  ).bind(sessionId, userId, wsId, nowIso, source || 'dashboard', safePayload).run().catch(() => {});
  await env.DB.prepare(
    `INSERT INTO activity_signals (id, work_session_id, signal_type, source, payload, created_at)
     VALUES (?, ?, ?, ?, ?, unixepoch())`
  ).bind(signalId, sessionId, signalType || 'heartbeat', source || 'dashboard', safePayload).run().catch(() => {});
}

async function getSession(env, request) {
  if (!env.DB) return null;
  const cookie = request.headers.get('Cookie') || '';
  const m = cookie.match(/session=([^\s;]+)/);
  const sessionId = m?.[1];
  if (!sessionId) return null;
  const row = await env.DB.prepare(
    `SELECT id, user_id, expires_at FROM auth_sessions WHERE id = ? AND datetime(expires_at) > datetime('now')`
  ).bind(sessionId).first();
  if (!row) return null;
  const userEmail = (row.user_id || '').toLowerCase();
  if (SUPERADMIN_EMAILS.includes(userEmail)) return getSamContext(userEmail);
  return row;
}

/** Returns { id: user_id, email? } for auth_sessions user, or null. Use for routes that need current user id. For session list and OAuth tokens use email || id (id is auth_sessions.user_id; for superadmin id is sam_primeaux, email is the login email). */
async function getAuthUser(request, env) {
  const session = await getSession(env, request);
  if (!session) return null;
  const sessionUserId = session._session_user_id || session.user_id;
  return { id: session.user_id, email: sessionUserId };
}

// ----- API Vault (AES-256-GCM, merge from vault-worker; all routes require auth) -----
const VAULT_USER_ID = 'sam_primeaux';

async function vaultGetKey(masterKeyB64) {
  const raw = Uint8Array.from(atob(masterKeyB64), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function vaultEncrypt(plaintext, masterKeyB64) {
  const key = await vaultGetKey(masterKeyB64);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  const combined = new Uint8Array(iv.byteLength + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.byteLength);
  return btoa(String.fromCharCode(...combined));
}

async function vaultDecrypt(encryptedB64, masterKeyB64) {
  const key = await vaultGetKey(masterKeyB64);
  const combined = Uint8Array.from(atob(encryptedB64), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new TextDecoder().decode(decrypted);
}

function vaultLast4(str) {
  return str ? str.slice(-4) : '????';
}

function vaultNewId(prefix = 'sec') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function vaultWriteAudit(db, { secret_id, event_type, triggered_by, previous_last4, new_last4, notes, request }) {
  const id = `saudit_${Math.random().toString(36).slice(2, 14)}`;
  const ip = request?.headers?.get('CF-Connecting-IP') || null;
  const ua = request?.headers?.get('User-Agent')?.slice(0, 200) || null;
  await db.prepare(
    `INSERT INTO secret_audit_log (id, secret_id, event_type, triggered_by, previous_last4, new_last4, notes, ip_address, user_agent, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())`
  ).bind(id, secret_id, event_type, triggered_by || VAULT_USER_ID, previous_last4 || null, new_last4 || null, notes || null, ip, ua).run();
}

function vaultJson(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

function vaultErr(message, status = 400) {
  return vaultJson({ error: message }, status);
}

async function vaultCreateSecret(request, env) {
  const body = await request.json();
  const { secret_name, secret_value, service_name, description, project_label, project_id, tags, scopes_json, expires_at } = body;
  if (!secret_name || !secret_value) return vaultErr('secret_name and secret_value are required');
  const encrypted = await vaultEncrypt(secret_value, env.VAULT_MASTER_KEY);
  const id = vaultNewId('sec');
  const last4val = vaultLast4(secret_value);
  const metadata = JSON.stringify({ last4: last4val });
  await env.DB.prepare(
    `INSERT INTO user_secrets (id, user_id, tenant_id, secret_name, secret_value_encrypted, service_name, description, project_label, project_id, tags, scopes_json, metadata_json, expires_at, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
  ).bind(id, VAULT_USER_ID, 'tenant_sam_primeaux', secret_name, encrypted, service_name || null, description || null, project_label || null, project_id || null, tags || null, scopes_json ? JSON.stringify(scopes_json) : '[]', metadata, expires_at || null).run();
  await vaultWriteAudit(env.DB, { secret_id: id, event_type: 'created', new_last4: last4val, notes: `Created for service: ${service_name || 'unspecified'}`, request });
  return vaultJson({ success: true, id, last4: last4val });
}

async function vaultListSecrets(request, env) {
  const url = new URL(request.url);
  const project = url.searchParams.get('project');
  let query = `SELECT id, secret_name, service_name, description, project_label, project_id, tags, scopes_json, metadata_json, is_active, expires_at, last_used_at, usage_count, created_at, updated_at FROM user_secrets WHERE user_id = ?`;
  const params = [VAULT_USER_ID];
  if (project) { query += ` AND project_label = ?`; params.push(project); }
  query += ` ORDER BY project_label ASC, service_name ASC, secret_name ASC`;
  const result = params.length === 1 ? await env.DB.prepare(query).bind(...params).all() : await env.DB.prepare(query).bind(...params).all();
  return vaultJson({ secrets: result.results });
}

async function vaultGetSecret(id, env) {
  const row = await env.DB.prepare(
    `SELECT id, secret_name, service_name, description, project_label, project_id, tags, scopes_json, metadata_json, is_active, expires_at, last_used_at, usage_count, created_at, updated_at FROM user_secrets WHERE id = ? AND user_id = ?`
  ).bind(id, VAULT_USER_ID).first();
  if (!row) return vaultErr('Secret not found', 404);
  return vaultJson(row);
}

async function vaultRevealSecret(id, eventType, request, env) {
  const row = await env.DB.prepare(`SELECT * FROM user_secrets WHERE id = ? AND user_id = ? AND is_active = 1`).bind(id, VAULT_USER_ID).first();
  if (!row) return vaultErr('Secret not found or inactive', 404);
  let plaintext;
  try {
    plaintext = await vaultDecrypt(row.secret_value_encrypted, env.VAULT_MASTER_KEY);
  } catch {
    return vaultErr('Decryption failed — master key may have changed', 500);
  }
  await env.DB.prepare(`UPDATE user_secrets SET last_used_at = unixepoch(), usage_count = usage_count + 1, updated_at = unixepoch() WHERE id = ?`).bind(id).run();
  await vaultWriteAudit(env.DB, { secret_id: id, event_type: eventType, notes: `Secret ${eventType} for ${row.service_name || 'unknown service'}`, request });
  return vaultJson({ value: plaintext });
}

async function vaultEditSecret(id, request, env) {
  const body = await request.json();
  const { secret_name, description, project_label, project_id, tags, scopes_json, expires_at } = body;
  const existing = await env.DB.prepare(`SELECT * FROM user_secrets WHERE id = ? AND user_id = ?`).bind(id, VAULT_USER_ID).first();
  if (!existing) return vaultErr('Secret not found', 404);
  await env.DB.prepare(
    `UPDATE user_secrets SET secret_name = COALESCE(?, secret_name), description = COALESCE(?, description), project_label = COALESCE(?, project_label), project_id = COALESCE(?, project_id), tags = COALESCE(?, tags), scopes_json = COALESCE(?, scopes_json), expires_at = COALESCE(?, expires_at), updated_at = unixepoch() WHERE id = ?`
  ).bind(secret_name || null, description || null, project_label || null, project_id || null, tags || null, scopes_json ? JSON.stringify(scopes_json) : null, expires_at || null, id).run();
  await vaultWriteAudit(env.DB, { secret_id: id, event_type: 'edited', notes: 'Metadata updated', request });
  return vaultJson({ success: true });
}

async function vaultRotateSecret(id, request, env) {
  const body = await request.json();
  const { new_value } = body;
  if (!new_value) return vaultErr('new_value is required');
  const existing = await env.DB.prepare(`SELECT * FROM user_secrets WHERE id = ? AND user_id = ?`).bind(id, VAULT_USER_ID).first();
  if (!existing) return vaultErr('Secret not found', 404);
  let oldLast4 = '????';
  try {
    const oldPlain = await vaultDecrypt(existing.secret_value_encrypted, env.VAULT_MASTER_KEY);
    oldLast4 = vaultLast4(oldPlain);
  } catch {}
  const newEncrypted = await vaultEncrypt(new_value, env.VAULT_MASTER_KEY);
  const newLast4 = vaultLast4(new_value);
  const newMeta = JSON.stringify({ ...JSON.parse(existing.metadata_json || '{}'), last4: newLast4 });
  await env.DB.prepare(`UPDATE user_secrets SET secret_value_encrypted = ?, metadata_json = ?, updated_at = unixepoch() WHERE id = ?`).bind(newEncrypted, newMeta, id).run();
  await vaultWriteAudit(env.DB, { secret_id: id, event_type: 'rotated', previous_last4: oldLast4, new_last4: newLast4, notes: 'Secret rotated', request });
  return vaultJson({ success: true, new_last4: newLast4 });
}

async function vaultRevokeSecret(id, env, request) {
  const existing = await env.DB.prepare(`SELECT id FROM user_secrets WHERE id = ? AND user_id = ?`).bind(id, VAULT_USER_ID).first();
  if (!existing) return vaultErr('Secret not found', 404);
  await env.DB.prepare(`UPDATE user_secrets SET is_active = 0, updated_at = unixepoch() WHERE id = ?`).bind(id).run();
  await vaultWriteAudit(env.DB, { secret_id: id, event_type: 'revoked', notes: 'Secret revoked', request });
  return vaultJson({ success: true });
}

async function vaultGetSecretAudit(id, env) {
  const rows = await env.DB.prepare(`SELECT * FROM secret_audit_log WHERE secret_id = ? ORDER BY created_at DESC LIMIT 100`).bind(id).all();
  return vaultJson({ audit: rows.results });
}

async function vaultListProjects(env) {
  const rows = await env.DB.prepare(
    `SELECT DISTINCT project_label, project_id, COUNT(*) as secret_count FROM user_secrets WHERE user_id = ? AND project_label IS NOT NULL AND is_active = 1 GROUP BY project_label ORDER BY project_label ASC`
  ).bind(VAULT_USER_ID).all();
  return vaultJson({ projects: rows.results });
}

async function vaultFullAudit(request, env) {
  const url = new URL(request.url);
  const eventType = url.searchParams.get('event_type') || '';
  const since = url.searchParams.get('since');
  const limit = Math.min(500, Math.max(1, parseInt(url.searchParams.get('limit') || '200', 10) || 200));
  let query = `SELECT sal.id, sal.secret_id, sal.event_type, sal.triggered_by, sal.previous_last4, sal.new_last4, sal.notes, sal.ip_address, sal.user_agent, sal.created_at, us.secret_name, us.service_name, us.project_label
     FROM secret_audit_log sal
     LEFT JOIN user_secrets us ON sal.secret_id = us.id
     WHERE us.user_id = ?`;
  const params = [VAULT_USER_ID];
  if (eventType && ['created', 'viewed', 'copied', 'edited', 'rotated', 'revoked'].includes(eventType)) {
    query += ` AND sal.event_type = ?`;
    params.push(eventType);
  }
  if (since && /^\d+$/.test(since)) {
    query += ` AND sal.created_at >= ?`;
    params.push(since);
  }
  query += ` ORDER BY sal.created_at DESC LIMIT ?`;
  params.push(limit);
  const rows = await env.DB.prepare(query).bind(...params).all();
  return vaultJson({ audit: rows.results || [], filters: { event_type: eventType || null, since: since || null, limit } });
}

function vaultRegistry() {
  const secrets = [
    { name: 'AI_SEARCH_TOKEN', type: 'secret', description: 'AI search / RAG' },
    { name: 'ANTHROPIC_API_KEY', type: 'secret', description: 'Claude API' },
    { name: 'CF_ACCESS_CLIENT_ID', type: 'secret', description: 'Zero Trust / Access' },
    { name: 'CF_ACCESS_CLIENT_SECRET', type: 'secret', description: 'Zero Trust / Access' },
    { name: 'CLOUDFLARE_ACCOUNT_ID', type: 'plaintext', description: 'Account ID' },
    { name: 'CLOUDFLARE_API_TOKEN', type: 'secret', description: 'Workers, R2, D1, API' },
    { name: 'CLOUDFLARE_IMAGES_ACCOUNT_HASH', type: 'plaintext', description: 'Images account hash' },
    { name: 'CLOUDFLARE_IMAGES_TOKEN', type: 'secret', description: 'Images API' },
    { name: 'CLOUDFLARE_STREAM_TOKEN', type: 'secret', description: 'Stream API' },
    { name: 'DEPLOY_HOOK_SECRET', type: 'secret', description: 'Deploy webhooks' },
    { name: 'GITHUB_CLIENT_ID', type: 'plaintext', description: 'GitHub OAuth' },
    { name: 'GITHUB_CLIENT_SECRET', type: 'secret', description: 'GitHub OAuth' },
    { name: 'GOOGLE_AI_API_KEY', type: 'secret', description: 'Google AI' },
    { name: 'GOOGLE_CLIENT_ID', type: 'plaintext', description: 'Google OAuth' },
    { name: 'GOOGLE_CLIENT_SECRET', type: 'secret', description: 'Google OAuth' },
    { name: 'GOOGLE_OAUTH_CLIENT_SECRET', type: 'secret', description: 'Google OAuth (alternate)' },
    { name: 'INTERNAL_API_SECRET', type: 'secret', description: 'Internal APIs' },
    { name: 'MCP_AUTH_TOKEN', type: 'secret', description: 'MCP server auth' },
    { name: 'OPENAI_API_KEY', type: 'secret', description: 'OpenAI API' },
    { name: 'PTY_AUTH_TOKEN', type: 'secret', description: 'PTY / terminal' },
    { name: 'R2_ACCESS_KEY_ID', type: 'secret', description: 'R2 storage' },
    { name: 'R2_SECRET_ACCESS_KEY', type: 'secret', description: 'R2 storage' },
    { name: 'RESEND_API_KEY', type: 'secret', description: 'Transactional email' },
    { name: 'TENANT_ID', type: 'plaintext', description: 'Tenant identifier' },
    { name: 'TERMINAL_SECRET', type: 'secret', description: 'Terminal auth' },
    { name: 'TERMINAL_WS_URL', type: 'secret', description: 'Terminal WebSocket URL' },
    { name: 'VAULT_MASTER_KEY', type: 'secret', description: 'Vault encryption' },
  ];
  const domains = [
    { type: 'workers.dev', value: 'inneranimalmedia.meauxbility.workers.dev', description: 'Preview URLs: *-inneranimalmedia.meauxbility.workers.dev' },
    { type: 'route', value: 'inneranimalmedia.com/*', description: 'Route' },
    { type: 'route', value: 'www.inneranimalmedia.com/*', description: 'Route' },
    { type: 'route', value: 'webhooks.inneranimalmedia.com/*', description: 'Route' },
    { type: 'custom_domain', value: 'inneranimalmedia.com', description: 'Custom domain' },
    { type: 'custom_domain', value: 'www.inneranimalmedia.com', description: 'Custom domain' },
    { type: 'custom_domain', value: 'webhooks.inneranimalmedia.com', description: 'Custom domain' },
  ];
  return vaultJson({ secrets, domains });
}

async function handleVaultRequest(request, env) {
  if (!env.VAULT_MASTER_KEY) return vaultErr('VAULT_MASTER_KEY not configured. Run: wrangler secret put VAULT_MASTER_KEY', 500);
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  if (path === '/api/vault/registry' && method === 'GET') return vaultRegistry();
  if (path === '/api/vault/projects' && method === 'GET') return vaultListProjects(env);
  if (path === '/api/vault/audit' && method === 'GET') return vaultFullAudit(request, env);

  if (path === '/api/vault/secrets') {
    if (method === 'GET') return vaultListSecrets(request, env);
    if (method === 'POST') return vaultCreateSecret(request, env);
  }

  const secretMatch = path.match(/^\/api\/vault\/secrets\/([^/]+)(\/(.+))?$/);
  if (secretMatch) {
    const id = secretMatch[1];
    const action = secretMatch[3];
    if (action === 'reveal' && method === 'POST') return vaultRevealSecret(id, 'viewed', request, env);
    if (action === 'copy' && method === 'POST') return vaultRevealSecret(id, 'copied', request, env);
    if (action === 'rotate' && method === 'POST') return vaultRotateSecret(id, request, env);
    if (action === 'audit' && method === 'GET') return vaultGetSecretAudit(id, env);
    if (!action && method === 'GET') return vaultGetSecret(id, env);
    if (!action && method === 'PUT') return vaultEditSecret(id, request, env);
    if (!action && method === 'DELETE') return vaultRevokeSecret(id, env, request);
  }

  return vaultErr('Not found', 404);
}

/** Returns { access_token, refresh_token, expires_at } from user_oauth_tokens for the given user, provider, and optional account_identifier. For github with accountId empty, returns first row. */
async function getIntegrationToken(DB, userId, provider, accountId) {
  if (!DB || !userId || !provider) return null;
  const aid = accountId != null ? String(accountId) : '';
  if (provider === 'github' && aid === '') {
    const row = await DB.prepare(
      `SELECT access_token, refresh_token, expires_at FROM user_oauth_tokens WHERE user_id = ? AND provider = 'github' ORDER BY account_identifier ASC LIMIT 1`
    ).bind(userId).first();
    return row || null;
  }
  const row = await DB.prepare(
    `SELECT access_token, refresh_token, expires_at FROM user_oauth_tokens WHERE user_id = ? AND provider = ? AND account_identifier = ?`
  ).bind(userId, provider, aid).first();
  return row || null;
}

const RAG_MEMORY_EMBED_MODEL = '@cf/baai/bge-large-en-v1.5';
const RAG_CHUNK_MAX_CHARS = 600;
const RAG_CHUNK_OVERLAP = 80;
const RAG_EMBED_BATCH_SIZE = 32;
const RAG_COMPACT_MAX_MSG_CHARS = 800;
const RAG_COMPACT_HOURS = 48;

/**
 * RAG search using Vectorize index (VECTORIZE_INDEX or VECTORIZE). Embeds query, runs vector search, resolves content from metadata or R2.
 * Returns { results, data } for compatibility with code that expected AI.autorag().search().
 */
async function vectorizeRagSearch(env, query, opts = {}) {
  const topK = Math.min(Math.max(1, opts.topK || opts.max_num_results || 5), 20);
  const index = env.VECTORIZE_INDEX || env.VECTORIZE;
  const indexUsed = env.VECTORIZE_INDEX ? 'VECTORIZE_INDEX' : (env.VECTORIZE ? 'VECTORIZE' : 'none');
  const debug = { indexUsed, hasIndex: !!index, hasAi: !!env.AI, hasR2: !!env.R2, topK };
  if (!index || !env.AI) return { results: [], data: [], _debug: { ...debug, error: 'missing index or AI binding' } };
  try {
    const modelResp = await env.AI.run(RAG_MEMORY_EMBED_MODEL, { text: [query] });
    const data = modelResp?.data ?? modelResp;
    const vector = (Array.isArray(data) ? data : data?.data)?.[0];
    if (!vector || !Array.isArray(vector)) return { results: [], data: [], _debug: { ...debug, error: 'embedding failed or empty vector' } };
    const vectorMatches = await index.query(vector, { topK, returnMetadata: 'all' });
    const matches = vectorMatches?.matches ?? vectorMatches ?? [];
    debug.rawMatchCount = matches.length;
    if (matches.length > 0) {
      const first = matches[0];
      debug.sampleMatch = { id: first?.id, metadataKeys: first?.metadata ? Object.keys(first.metadata) : [], hasSource: !!(first?.metadata?.source), hasText: !!(first?.metadata?.text), hasContent: !!(first?.metadata?.content) };
    }
    const results = [];
    const seen = new Set();
    for (const m of matches) {
      const source = m?.metadata?.source ?? m?.id;
      if (source && seen.has(source)) continue;
      if (source) seen.add(source);
      let content = m?.metadata?.text ?? m?.metadata?.content ?? '';
      if (!content && source && env.R2) {
        try {
          const obj = await env.R2.get(source);
          if (obj) content = (await obj.text()).slice(0, 12000);
        } catch (_) {}
      }
      if (content) results.push({ content, text: content, source: source || m?.id, score: m?.score ?? 0, metadata: m?.metadata ?? {} });
    }
    return { results, data: results, _debug: { ...debug, resultCount: results.length } };
  } catch (e) {
    console.warn('[vectorizeRagSearch]', e?.message ?? e);
    return { results: [], data: [], _debug: { ...debug, error: String(e?.message || e) } };
  }
}

/** Chunk markdown text into overlapping segments for embedding. */
function chunkByTokenApprox(text, maxChars = 2048, overlapChars = 200) {
  const chunks = [];
  if (!text || !text.trim()) return chunks;
  const t = text.trim();
  let start = 0;
  while (start < t.length) {
    const end = Math.min(start + maxChars, t.length);
    let slice = t.slice(start, end);
    if (end < t.length && !/[\n.]$/.test(slice)) {
      const lastBreak = Math.max(slice.lastIndexOf('\n'), slice.lastIndexOf('. '));
      if (lastBreak > maxChars / 2) slice = slice.slice(0, lastBreak + 1);
    }
    if (slice.trim()) chunks.push(slice.trim());
    start = end - (end < t.length ? overlapChars : 0);
  }
  return chunks.length ? chunks : [t.slice(0, maxChars)];
}

function chunkMarkdown(text, maxChars = RAG_CHUNK_MAX_CHARS, overlap = RAG_CHUNK_OVERLAP) {
  const chunks = [];
  const sections = text.split(/(?=^##?\s)/m).map(s => s.trim()).filter(Boolean);
  for (const section of sections) {
    if (section.length <= maxChars) {
      chunks.push(section);
      continue;
    }
    let start = 0;
    while (start < section.length) {
      const end = Math.min(start + maxChars, section.length);
      let slice = section.slice(start, end);
      if (end < section.length && !/[\n.]$/.test(slice)) {
        const lastBreak = Math.max(slice.lastIndexOf('\n'), slice.lastIndexOf('. '));
        if (lastBreak > maxChars / 2) slice = slice.slice(0, lastBreak + 1);
      }
      if (slice.trim()) chunks.push(slice.trim());
      start = end - (end < section.length ? overlap : 0);
    }
  }
  return chunks.length ? chunks : [text.slice(0, maxChars)];
}

/**
 * D1-compatible schema extraction: use sql from sqlite_master (no PRAGMA).
 */
async function extractSchema(env) {
  const tables = await env.DB.prepare(
    "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  ).all();
  const results = tables.results || [];
  const schemaDoc = results.map(t => `### ${t.name}\n\`\`\`sql\n${t.sql || ''}\n\`\`\`\n`).join('\n');
  return `# D1 Database Schema\n\n**Database**: inneranimalmedia-business\n**Tables**: ${results.length}\n**Generated**: ${new Date().toISOString()}\n\n---\n\n${schemaDoc}`;
}

/**
 * Post-deploy: write worker structure, D1 schema, and optional cursor rules to R2 knowledge/.
 * Call from deploy script: curl -X POST .../api/internal/post-deploy -H "X-Internal-Secret: $INTERNAL_API_SECRET" [-d '{"cursor_rules_md":"..."}']
 * Returns array of R2 keys written.
 */
async function writeKnowledgePostDeploy(env, body = {}) {
  const keys = [];
  if (!env.R2) return keys;

  const routes = [
    'GET /api/health', 'POST /api/telemetry/v1/traces', 'GET /api/overview/stats', 'GET /api/overview/recent-activity',
    'GET /api/overview/checkpoints', 'GET /api/overview/activity-strip', 'GET /api/overview/deployments',
    'GET /api/colors/all', 'GET /api/clients', 'GET /api/projects', 'GET /api/billing/summary',
    'GET /api/oauth/google/start', 'GET /api/oauth/google/callback', 'GET /api/oauth/github/start', 'GET /api/oauth/github/callback',
    'POST /api/auth/login', 'POST /api/auth/logout', 'POST /api/admin/overnight/validate', 'POST /api/admin/overnight/start',
    'POST /api/admin/vectorize-kb', 'GET /api/integrations/status', 'GET /api/integrations/gdrive/files', 'GET /api/integrations/github/repos',
    'GET /api/git/status', 'POST /api/agent/chat', 'GET /api/agent/context', 'GET /api/agent/bootstrap', 'POST /api/agent/rag/query',
    'GET /api/agent/sessions/:id/messages', 'POST /api/agent/sessions/:id/messages', 'POST /api/agent/run',
    'POST /api/internal/post-deploy',
  ];
  let toolsList = [];
  if (env.DB) {
    try {
      const r = await env.DB.prepare('SELECT tool_name, tool_category FROM mcp_registered_tools WHERE enabled = 1 ORDER BY tool_name').all();
      toolsList = (r.results || []).map(t => `${t.tool_name} (${t.tool_category || 'execute'})`);
    } catch (_) {}
  }
  const workerMd = `# Worker structure\n\nGenerated: ${new Date().toISOString()}\n\n## Routes\n${routes.map(route => `- ${route}`).join('\n')}\n\n## Tools (mcp_registered_tools)\n${toolsList.length ? toolsList.map(t => `- ${t}`).join('\n') : '- (none)'}\n`;
  await env.R2.put('knowledge/architecture/worker-structure.md', workerMd, { httpMetadata: { contentType: 'text/markdown' } });
  keys.push('knowledge/architecture/worker-structure.md');

  if (env.DB) {
    try {
      const schemaMd = await extractSchema(env);
      await env.R2.put('knowledge/database/schema.md', schemaMd, { httpMetadata: { contentType: 'text/markdown' } });
      keys.push('knowledge/database/schema.md');
    } catch (e) {
      console.warn('[post-deploy] schema', e?.message);
    }
  }

  if (body.cursor_rules_md && typeof body.cursor_rules_md === 'string') {
    await env.R2.put('knowledge/rules/cursor-rules.md', body.cursor_rules_md, { httpMetadata: { contentType: 'text/markdown' } });
    keys.push('knowledge/rules/cursor-rules.md');
  }

  return keys;
}

/**
 * Daily knowledge sync: write agent_memory_index (score >= 7) and active roadmap_steps to R2 knowledge/.
 * Called from cron 0 6 * * *.
 */
async function runKnowledgeDailySync(env) {
  const today = new Date().toISOString().slice(0, 10);
  if (!env.R2) return { memory_key: '', priorities_key: '' };

  let memoryMd = `# Agent memory (high importance) -- ${today}\n\n`;
  if (env.DB) {
    try {
      const r = await env.DB.prepare(
        "SELECT key, value, importance_score FROM agent_memory_index WHERE importance_score >= 7 AND tenant_id = 'tenant_sam_primeaux' ORDER BY importance_score DESC"
      ).all();
      for (const row of (r.results || [])) {
        memoryMd += `## ${row.key} (score: ${row.importance_score})\n${(row.value || '').trim()}\n\n`;
      }
      await env.R2.put(`knowledge/memory/daily-${today}.md`, memoryMd, { httpMetadata: { contentType: 'text/markdown' } });
    } catch (e) {
      console.warn('[knowledge/daily] memory', e?.message);
    }
  }

  let prioritiesMd = `# Current priorities (active roadmap steps) -- ${today}\n\n`;
  if (env.DB) {
    try {
      const r = await env.DB.prepare(
        "SELECT id, title, status, order_index, description FROM roadmap_steps WHERE plan_id = 'plan_iam_dashboard_v1' AND status IN ('in_progress', 'not_started') ORDER BY order_index"
      ).all();
      for (const row of (r.results || [])) {
        prioritiesMd += `- **${(row.title || row.id || '').replace(/\*\*/g, '')}** (${row.status}) ${(row.description || '').slice(0, 200)}\n`;
      }
      await env.R2.put('knowledge/priorities/current.md', prioritiesMd, { httpMetadata: { contentType: 'text/markdown' } });
    } catch (e) {
      console.warn('[knowledge/priorities]', e?.message);
    }
  }

  return { memory_key: `knowledge/memory/daily-${today}.md`, priorities_key: 'knowledge/priorities/current.md' };
}

/** Auto-compact: when a conversation has > 50 messages, summarize with AI, save to R2 knowledge/conversations/{id}-summary.md, then delete oldest messages (keep last 50). */
async function compactConversationToKnowledge(env, conversationId) {
  if (!env.DB || !env.R2 || !conversationId) return;
  let rows = [];
  try {
    const r = await env.DB.prepare(
      'SELECT id, role, content, created_at FROM agent_messages WHERE conversation_id = ? ORDER BY created_at ASC'
    ).bind(conversationId).all();
    rows = r.results || [];
  } catch (e) {
    console.warn('[compactConversation]', e?.message);
    return;
  }
  if (rows.length <= 50) return;

  const blob = rows.map((m) => `${m.role}: ${(m.content || '').slice(0, 2000)}`).join('\n');
  let summary = '';
  if (env.ANTHROPIC_API_KEY && blob.length > 100) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-3-5-haiku-20241022',
          max_tokens: 1024,
          messages: [{ role: 'user', content: `Summarize this conversation in 1-2 paragraphs: key topics, decisions, and outcomes. Be concise.\n\n${blob.slice(0, 30000)}` }],
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const text = data.content?.find(c => c.type === 'text')?.text;
        if (text) summary = text.trim();
      }
    } catch (e) {
      console.warn('[compactConversation] Claude summary failed', e?.message);
    }
  }
  if (!summary && env.AI && blob.length > 100) {
    try {
      const out = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
        messages: [{ role: 'user', content: `Summarize this conversation in 1-2 paragraphs: key topics, decisions, outcomes.\n\n${blob.slice(0, 8000)}` }],
        max_tokens: 512,
      });
      summary = (out?.result?.response ?? out?.response ?? (typeof out === 'string' ? out : '')).trim();
    } catch (e) {
      console.warn('[compactConversation] Workers AI summary failed', e?.message);
    }
  }
  const markdown = `# Conversation summary: ${conversationId}\n\nGenerated: ${new Date().toISOString()}\n\n${summary || '(Summary unavailable.)'}\n\n## Message count at compact: ${rows.length}\n`;
  try {
    await env.R2.put(`knowledge/conversations/${conversationId}-summary.md`, markdown, { httpMetadata: { contentType: 'text/markdown' } });
  } catch (e) {
    console.warn('[compactConversation] R2 put failed', e?.message);
    return;
  }

  const keepIds = rows.slice(-50).map((r) => r.id);
  if (keepIds.length === 0) return;
  const placeholders = keepIds.map(() => '?').join(',');
  try {
    await env.DB.prepare(
      `DELETE FROM agent_messages WHERE conversation_id = ? AND id NOT IN (${placeholders})`
    ).bind(conversationId, ...keepIds).run();
  } catch (e) {
    console.warn('[compactConversation] DELETE failed', e?.message);
  }
}

/**
 * Compact recent agent_messages from D1 into a single markdown file and upload to R2.
 * Used so RAG can search over recent chat context without manual sync. Writes to memory/compacted-chats/YYYY-MM-DD.md.
 * Returns { conversations: number, messages: number, key: string, error?: string }.
 */
async function compactAgentChatsToR2(env) {
  if (!env.DB || !env.R2) {
    return { conversations: 0, messages: 0, key: '', error: 'DB or R2 missing' };
  }
  const cutoff = Math.floor(Date.now() / 1000) - (RAG_COMPACT_HOURS * 3600);
  let rows = [];
  try {
    const out = await env.DB.prepare(
      `SELECT conversation_id, role, content, created_at
       FROM agent_messages
       WHERE created_at >= ?
       ORDER BY conversation_id, created_at ASC`
    ).bind(cutoff).all();
    rows = out?.results || [];
  } catch (e) {
    return { conversations: 0, messages: 0, key: '', error: String(e?.message || e) };
  }
  const byConv = new Map();
  for (const r of rows) {
    const cid = r.conversation_id || 'unknown';
    if (!byConv.has(cid)) byConv.set(cid, []);
    const content = typeof r.content === 'string' ? r.content : String(r.content || '');
    const snippet = content.length > RAG_COMPACT_MAX_MSG_CHARS
      ? content.slice(0, RAG_COMPACT_MAX_MSG_CHARS) + '...'
      : content;
    byConv.get(cid).push({
      role: r.role || 'user',
      text: snippet.replace(/\n/g, ' ').trim(),
      created_at: r.created_at,
    });
  }
  const today = new Date().toISOString().slice(0, 10);
  const lines = [`# Compacted agent chats -- ${today}`, '', `Conversations: ${byConv.size} | Messages: ${rows.length}`, ''];
  const summaries = [];
  if (env.AI && byConv.size > 0) {
    for (const [cid, messages] of byConv) {
      const blob = messages.map((m) => `${m.role}: ${m.text}`).join('\n');
      if (blob.length < 20) continue;
      try {
        const out = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
          messages: [{ role: 'user', content: `Summarize this conversation in 1-2 sentences for search. Be specific about topics and decisions.\n\n${blob.slice(0, 4000)}` }],
          max_tokens: 120,
        });
        const summary = (out?.result?.response ?? out?.response ?? (typeof out === 'string' ? out : '')).trim();
        if (summary) summaries.push({ cid, summary });
      } catch (e) {
        console.warn('[rag/compact] summary failed for', cid, e?.message);
      }
    }
  }
  if (summaries.length > 0) {
    lines.push('## Summaries (for RAG)');
    for (const { cid, summary } of summaries) {
      lines.push(`- **${cid}**: ${summary}`);
    }
    lines.push('');
  }
  for (const [cid, messages] of byConv) {
    lines.push(`## ${cid}`);
    for (const m of messages) {
      const label = m.role === 'assistant' ? 'assistant' : 'user';
      const ts = m.created_at ? new Date(m.created_at * 1000).toISOString().slice(0, 19) : '';
      lines.push(`- **${label}** ${ts ? `(${ts}) ` : ''}${m.text}`);
    }
    lines.push('');
  }
  const markdown = lines.join('\n');
  const key = `memory/compacted-chats/${today}.md`;
  try {
    await env.R2.put(key, markdown, { httpMetadata: { contentType: 'text/markdown' } });
  } catch (e) {
    return { conversations: byConv.size, messages: rows.length, key: '', error: String(e?.message || e) };
  }
  return { conversations: byConv.size, messages: rows.length, key };
}

/**
 * Index R2 memory markdown (memory/daily/*.md, memory/schema-and-records.md) into Vectorize.
 * Uses Workers AI @cf/baai/bge-large-en-v1.5 (1024 dims). Requires Vectorize index with dimensions=1024, metric=cosine (matches AI Search iam-autorag).
 * Returns { indexed: number of keys, chunks: number of vectors upserted, error?: string }.
 */
async function indexMemoryMarkdownToVectorize(env) {
  const keys = [];
  if (env.R2.list) {
    for (const prefix of ['memory/daily/', 'memory/compacted-chats/', 'knowledge/', 'docs/']) {
      let cursor;
      do {
        const list = await env.R2.list({ prefix, limit: 200, cursor });
        const objects = list.objects || [];
        for (const o of objects) {
          if (o.key && !o.key.endsWith('/')) keys.push(o.key);
        }
        cursor = list.truncated ? list.cursor : undefined;
      } while (cursor);
    }
  }
  if (!keys.includes('memory/schema-and-records.md')) keys.push('memory/schema-and-records.md');
  if (!keys.includes('memory/today-todo.md')) keys.push('memory/today-todo.md');

  const allChunks = [];
  for (const key of keys) {
    try {
      const obj = await env.R2.get(key);
      if (!obj) continue;
      const text = await obj.text();
      const date = key.match(/memory\/daily\/(\d{4}-\d{2}-\d{2})\.md$/)?.[1]
        || key.match(/memory\/compacted-chats\/(\d{4}-\d{2}-\d{2})\.md$/)?.[1]
        || null;
      const chunks = chunkMarkdown(text);
      const slug = key.replace(/\.md$/, '').replace(/\//g, '-');
      chunks.forEach((c, i) => {
        allChunks.push({
          id: `mem-${slug}-${i}`,
          text: c,
          source: key,
          date: date || '',
        });
      });
    } catch (e) {
      console.warn('[rag/index-memory] skip', key, e?.message);
    }
  }

  if (allChunks.length === 0) {
    return { indexed: keys.length, chunks: 0, message: 'No content to index' };
  }

  const vectors = [];
  for (let i = 0; i < allChunks.length; i += RAG_EMBED_BATCH_SIZE) {
    const batch = allChunks.slice(i, i + RAG_EMBED_BATCH_SIZE);
    const texts = batch.map(b => b.text);
    let data;
    try {
      const modelResp = await env.AI.run(RAG_MEMORY_EMBED_MODEL, { text: texts });
      data = modelResp?.data || modelResp;
    } catch (e) {
      throw new Error(`Embedding batch failed: ${e?.message || e}`);
    }
    const values = Array.isArray(data) ? data : (data && Array.isArray(data.data) ? data.data : []);
    batch.forEach((b, j) => {
      const vec = values[j];
      if (vec && Array.isArray(vec)) {
        vectors.push({
          id: b.id,
          values: vec,
          metadata: { source: b.source, date: b.date },
        });
      }
    });
  }

  // DISABLED: manual Vectorize upsert corrupts AutoRAG index (same index used by AI Search)
  // if (vectors.length > 0 && env.VECTORIZE.upsert) {
  //   await env.VECTORIZE.upsert(vectors);
  // }

  return { indexed: keys.length, chunks: vectors.length };
}

/** Chunk a code/markdown file by lines for embedding (overlapping windows). */
function chunkCodeFile(content, filePath) {
  const lines = content.split('\n');
  const CHUNK_SIZE = 100;
  const OVERLAP = 20;
  if (lines.length <= CHUNK_SIZE) {
    return [{ text: content, startLine: 1, endLine: lines.length }];
  }
  const chunks = [];
  for (let i = 0; i < lines.length; i += (CHUNK_SIZE - OVERLAP)) {
    const end = Math.min(i + CHUNK_SIZE, lines.length);
    chunks.push({
      text: lines.slice(i, end).join('\n'),
      startLine: i + 1,
      endLine: end,
    });
    if (end >= lines.length) break;
  }
  return chunks;
}

function generateVectorId(filePath, startLine, endLine) {
  const baseId = `${filePath}:${startLine}-${endLine}`;
  if (baseId.length <= 64) {
    return baseId;
  }
  const hash = baseId.split('').reduce((acc, char) => {
    return ((acc << 5) - acc) + char.charCodeAt(0);
  }, 0);
  const shortPath = filePath.split('/').pop();
  return `${shortPath.substring(0, 30)}:${startLine}-${endLine}:${Math.abs(hash)}`.substring(0, 64);
}

/** Index R2 DASHBOARD bucket source/ (worker.js, agent-dashboard, mcp-server, docs) into Vectorize for code search. */
async function performCodebaseIndexing(env) {
  const stats = { filesProcessed: 0, chunksCreated: 0, vectorsUpserted: 0 };
  if (!env.DASHBOARD || !env.VECTORIZE || !env.AI) {
    return { success: false, error: 'DASHBOARD, VECTORIZE, or AI binding missing', stats };
  }
  try {
    let cursor;
    const seen = new Set();
    do {
      const list = await env.DASHBOARD.list({ prefix: 'source/', limit: 200, cursor });
      const objects = list.objects || [];
      const filesToIndex = objects.filter((o) => o.key && (o.key.endsWith('.js') || o.key.endsWith('.jsx') || o.key.endsWith('.md')));
      for (const fileObj of filesToIndex) {
        if (seen.has(fileObj.key)) continue;
        seen.add(fileObj.key);
        const object = await env.DASHBOARD.get(fileObj.key);
        if (!object) continue;
        const content = await object.text();
        const filePath = fileObj.key.replace(/^source\//, '');
        const chunks = chunkCodeFile(content, filePath);
        stats.chunksCreated += chunks.length;
        for (let i = 0; i < chunks.length; i += RAG_EMBED_BATCH_SIZE) {
          const batch = chunks.slice(i, i + RAG_EMBED_BATCH_SIZE);
          const texts = batch.map((c) => c.text);
          let data;
          try {
            const modelResp = await env.AI.run(RAG_MEMORY_EMBED_MODEL, { text: texts });
            data = modelResp?.data || modelResp;
          } catch (e) {
            return { success: false, error: `Embedding failed: ${e?.message || e}`, stats };
          }
          const values = Array.isArray(data) ? data : (data && Array.isArray(data.data) ? data.data : []);
          const vectors = [];
          batch.forEach((c, j) => {
            const vec = values[j];
            if (vec && Array.isArray(vec)) {
              vectors.push({
                id: generateVectorId(filePath, c.startLine, c.endLine),
                values: vec,
                metadata: {
                  type: 'code',
                  source: filePath,
                  start_line: c.startLine,
                  end_line: c.endLine,
                  language: filePath.endsWith('.js') ? 'javascript' : filePath.endsWith('.jsx') ? 'jsx' : 'markdown',
                },
              });
            }
          });
          // DISABLED: manual Vectorize upsert corrupts AutoRAG index (same index used by AI Search)
          // if (vectors.length > 0 && env.VECTORIZE.upsert) {
          //   await env.VECTORIZE.upsert(vectors);
          //   stats.vectorsUpserted += vectors.length;
          // }
        }
        stats.filesProcessed++;
      }
      cursor = list.truncated ? list.cursor : undefined;
    } while (cursor);
    return { success: true, stats };
  } catch (e) {
    return { success: false, error: String(e?.message || e), stats };
  }
}

/** Handle POST /api/admin/reindex-codebase — sync or async codebase indexing into Vectorize. */
async function handleReindexCodebase(request, env, ctx) {
  const body = await request.json().catch(() => ({}));
  const isAsync = body.async === true;
  if (isAsync && ctx.waitUntil) {
    ctx.waitUntil(performCodebaseIndexing(env));
    return new Response(JSON.stringify({ success: true, message: 'Indexing started' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const result = await performCodebaseIndexing(env);
  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Daily digest: pull DB data, have Claude write summary, send email. Cron 0 0 * * * (6pm CST = midnight UTC). */
async function sendDailyDigest(env) {
  const safe = (p) => (p ? p.catch(() => null) : Promise.resolve(null));
  const todayStart = "datetime('now','-24 hours')";

  let deployments = { results: [] };
  let costs = { results: [] };
  let totalCost = 0;
  let roadmap = { results: [] };
  let pending = { results: [{ count: 0 }] };

  if (env.DB) {
    deployments = await safe(env.DB.prepare(
      `SELECT worker_name, environment, status, deployed_at, deployment_notes, triggered_by FROM cloudflare_deployments WHERE deployed_at >= ${todayStart} ORDER BY deployed_at DESC LIMIT 20`
    ).all()) || { results: [] };
    const costRow = await safe(env.DB.prepare(
      `SELECT COALESCE(SUM(amount_usd),0) as total FROM spend_ledger WHERE (occurred_at >= ${todayStart} OR (occurred_at IS NULL AND created_at >= ${todayStart})) AND (category IN ('ai_tools','usage') OR provider IS NOT NULL)`
    ).first());
    totalCost = Number(costRow?.total ?? 0);
    costs = await safe(env.DB.prepare(
      `SELECT provider_slug, provider, amount_usd, description FROM spend_ledger WHERE (occurred_at >= ${todayStart} OR (occurred_at IS NULL AND created_at >= ${todayStart})) AND (category IN ('ai_tools','usage') OR provider IS NOT NULL) ORDER BY amount_usd DESC LIMIT 20`
    ).all()) || { results: [] };
      roadmap = await safe(env.DB.prepare(
        `SELECT id, title, status FROM roadmap_steps WHERE plan_id = 'plan_iam_dashboard_v1' ORDER BY order_index ASC LIMIT 100`
      ).all()) || { results: [] };
    pending = await safe(env.DB.prepare(
      `SELECT COUNT(*) as count FROM notification_outbox WHERE status = 'pending'`
    ).all()) || { results: [{ count: 0 }] };
  }

  const steps = roadmap.results ?? [];
  const done = steps.filter((r) => r.status === 'completed').length;
  const total = steps.length || 1;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const completedTitles = steps.filter((r) => r.status === 'completed').map((r) => r.title).join(', ');
  const inProgressTitles = steps.filter((r) => r.status === 'in_progress').map((r) => r.title).join(', ');
  const notStartedTitles = steps.filter((r) => r.status === 'not_started').map((r) => r.title).join(', ');
  const pendingCount = pending.results?.[0]?.count ?? pending.results?.[0] ?? 0;

  let digestText = 'Could not generate summary.';
  if (env.ANTHROPIC_API_KEY) {
    try {
      const aiSummary = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1000,
          messages: [{
            role: 'user',
            content: `You are writing a nightly digest email for Sam Primeaux, founder of Inner Animal Media.

Write in plain english, no jargon, no emojis. Two sections only:

TODAY'S WORK:
- Deployments today: ${JSON.stringify(deployments.results ?? [])}
- AI spend today: $${totalCost} across ${(costs.results ?? []).length} providers
- Build progress: ${done}/${total} steps complete (${pct}%)
- Steps completed recently: ${completedTitles || 'none'}

NEXT STEPS FOR TOMORROW:
- In progress right now: ${inProgressTitles || 'none'}
- Not started yet: ${notStartedTitles || 'none'}
- Pending notifications: ${pendingCount}

Write 3-5 sentences summarizing what got done today, then a numbered list of the top 3 priorities for tomorrow based on what is in_progress and not_started. Keep it under 200 words total.`,
          }],
        }),
      });
      const aiResult = await aiSummary.json();
      digestText = aiResult.content?.[0]?.text ?? digestText;
    } catch (e) {
      digestText = `Digest generation failed: ${e?.message ?? e}. Raw: deployments=${(deployments.results ?? []).length}, cost=$${totalCost}, roadmap ${done}/${total}.`;
    }
  }

  const toEmail = 'meauxbility@gmail.com';
  if (env.RESEND_API_KEY) {
    try {
      const subject = `IAM Daily Digest -- ${new Date().toISOString().slice(0, 10)}`;
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
                'Accept': 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          from: 'sam@inneranimalmedia.com',
          to: [toEmail],
          subject,
          text: digestText,
        }),
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Resend: ${res.status} ${err}`);
      }
      const resendResult = await res.json().catch(() => ({}));
      if (env.DB) {
        await env.DB.prepare(
          `INSERT INTO email_logs
           (id, to_email, from_email, subject, status, resend_id, created_at, updated_at)
           VALUES (?, 'meauxbility@gmail.com', 'sam@inneranimalmedia.com', ?, 'sent', ?, datetime('now'), datetime('now'))`
        ).bind(
          crypto.randomUUID(),
          subject,
          resendResult.id ?? null
        ).run().catch(() => {});
      }
      const today = new Date().toISOString().slice(0, 10);
      await env.R2.put('memory/daily/' + today + '.md', digestText).catch(() => {});
      const memFacts = [
        { key: 'active_priorities', value: 'Last digest: ' + today + '. ' + digestText.slice(0, 400), score: 0.9, type: 'user_context' },
        { key: 'what_works_today', value: digestText.slice(0, 600), score: 1.0, type: 'execution_outcome' }
      ];
      for (const f of memFacts) {
        await env.DB.prepare(
          'INSERT INTO agent_memory_index (tenant_id, agent_config_id, memory_type, key, value, importance_score, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, unixepoch(), unixepoch()) ON CONFLICT(key) DO UPDATE SET value=excluded.value, importance_score=excluded.importance_score, updated_at=unixepoch()'
        ).bind('tenant_sam_primeaux', 'agent-sam-primary', f.type, f.key, f.value, f.score).run().catch(() => {});
      }
      await env.DB.prepare('DELETE FROM ai_compiled_context_cache').run().catch(() => {});
      return { ok: true, sent: true, to: toEmail };
    } catch (e) {
      return { ok: false, error: String(e?.message ?? e), digestText };
    }
  }
  return { ok: true, sent: false, digestText };
}

/** 8:30am CST (13:30 UTC) daily plan: D1 context + Workers AI + Resend. Cron 30 13 * * * */
async function sendDailyPlanEmail(env) {
  if (!env.DB || !env.RESEND_API_KEY) return;
  try {
    const [tasks, projects, memory, rules, workflows] = await Promise.all([
      env.DB.prepare(`SELECT title, implementation_status, priority
        FROM cidi WHERE implementation_status IN ('pending','in_progress','blocked')
        ORDER BY priority LIMIT 10`).all(),
      env.DB.prepare(`SELECT name, status, client_name
        FROM projects WHERE status NOT IN ('archived','completed')
        ORDER BY updated_at DESC LIMIT 8`).all(),
      env.DB.prepare(`SELECT key, value FROM agent_memory_index
        WHERE tenant_id='tenant_sam_primeaux'
        ORDER BY importance_score DESC LIMIT 10`).all(),
      env.DB.prepare(`SELECT rule_key, content FROM agent_cursor_rules
        WHERE is_active=1 ORDER BY created_at LIMIT 5`).all(),
      env.DB.prepare(`SELECT workflow_name, implementation_status
        FROM cidi WHERE implementation_status='pending' LIMIT 5`).all(),
    ]);
    console.log('[daily-plan] D1 queries complete', tasks?.results?.length);

    const prompt = `You are Agent Sam, a context-aware AI assistant for Sam Primeaux
at Inner Animal Media. Write a concise daily plan email for 8:30am.

ACTIVE WORKFLOWS:
${JSON.stringify(tasks.results)}

ACTIVE PROJECTS:
${JSON.stringify(projects.results)}

AGENT MEMORY (highest priority context):
${JSON.stringify(memory.results)}

TODAY'S TASK ORDER (from TOMORROW.md):
0. Fix chat history only saving last 2 messages — HIGHEST PRIORITY
1. Fix d1_write DDL restriction in runToolLoop
2. Vectorize remaining 2 knowledge base docs
3. GitHub Actions webhook receiver
4. UI fixes — scroll/loading/queue
5. Morning brief cron

Format as a clean plain-text email:
- Subject line: Daily Plan — [date]
- 3-5 bullet priority tasks for today with one line context each
- One sentence on each active client project that needs attention
- One "don't forget" reminder based on memory
- Keep it under 300 words. Direct. No fluff. No emojis.`;

    const ai = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 600
    });
    console.log('[daily-plan] AI response length', ai?.response?.length ?? ai?.result?.response?.length ?? 0);
    const emailBody = (ai?.result?.response ?? ai?.response ?? (typeof ai === 'string' ? ai : '')).trim() || 'Daily plan could not be generated.';

    const subject = `Daily Plan — ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}`;
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Agent Sam <agent@inneranimalmedia.com>',
        to: ['sam@inneranimals.com'],
        subject,
        text: emailBody
      })
    });
    console.log('[daily-plan] Resend status', res.status);
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Resend: ${res.status} ${err}`);
    }
    console.log('[cron] daily-plan email sent');
  } catch (err) {
    console.error('[daily-plan] FATAL:', err?.message, err?.stack);
  }
}

function overviewStatsPayload(overrides = {}) {
  return {
    success: true,
    db_health: overrides.db_health ?? 'no_data',
    finance_transactions_count: overrides.finance_transactions_count ?? 0,
    spend_ledger_entries: overrides.spend_ledger_entries ?? 0,
    spend_ledger_total: overrides.spend_ledger_total ?? 0,
    active_clients: overrides.active_clients ?? 0,
    monthly_net: overrides.monthly_net ?? null,
    financial_health: overrides.financial_health ?? { total_in_all_time: 0, total_out_all_time: 0, date_range: null, source_accounts_tracked: 0 },
    infrastructure_spend_by_provider: overrides.infrastructure_spend_by_provider ?? [],
    revenue_clients: overrides.revenue_clients ?? { total_clients: 0, active_streams: 0 },
    pipeline_runs: overrides.pipeline_runs ?? 0,
    agent_conversations: overrides.agent_conversations ?? 0,
    agent_last_activity: overrides.agent_last_activity ?? null,
    latest_migration: overrides.latest_migration ?? null,
  };
}

async function handleOverviewStats(request, url, env) {
  if (!env.DB) return jsonResponse(overviewStatsPayload({ db_health: 'unavailable' }), 200);
  const safe = (p) => (p ? p.catch(() => null) : Promise.resolve(null));
  const num = (r, key) => (r != null && r[key] != null ? Number(r[key]) : r?.c != null ? Number(r.c) : r?.entries != null ? Number(r.entries) : 0);
  const sum = (r, key) => (r != null && r[key] != null ? Number(r[key]) : 0);

  try {
    const [
      txCountRow,
      spendRow,
      deployRow,
      clientsRow,
      agentTelemetryRow,
      timeEntriesRow,
      providersResult,
      totalInRow,
      totalOutRow,
    ] = await Promise.all([
      safe(env.DB.prepare(`SELECT COUNT(*) as c FROM financial_transactions`).first()),
      safe(env.DB.prepare(`SELECT COUNT(*) as entries, COALESCE(SUM(amount_usd), 0) as total FROM spend_ledger`).first()),
      safe(env.DB.prepare(`SELECT deployment_id, deployed_at FROM cloudflare_deployments WHERE worker_name = ? ORDER BY deployed_at DESC LIMIT 1`).bind('inneranimalmedia').first()),
      safe(env.DB.prepare(`SELECT COUNT(*) as c FROM workspaces WHERE category = 'client'`).first()),
      safe(env.DB.prepare(`SELECT COUNT(*) as c, MAX(created_at) as last_at FROM agent_telemetry`).first()),
      safe(env.DB.prepare(`SELECT COUNT(*) as c, COALESCE(SUM(duration_seconds), 0) as total_sec FROM project_time_entries WHERE project_id = ?`).bind(PROJECT_ID).first()),
      safe(env.DB.prepare(`SELECT provider, SUM(amount_usd) as total FROM spend_ledger GROUP BY provider ORDER BY total DESC LIMIT 5`).all()),
      safe(env.DB.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM financial_transactions WHERE amount > 0`).first()),
      safe(env.DB.prepare(`SELECT COALESCE(SUM(ABS(amount)),0) as total FROM financial_transactions WHERE amount < 0`).first()),
    ]);

    const spendTotal = sum(spendRow, 'total');
    const outTxns = sum(totalOutRow, 'total');
    const totalOutAllTime = outTxns + spendTotal;
    const providers = (providersResult?.results || providersResult || []).map((r) => ({ provider: r.provider || 'unknown', total: Number(r.total || 0) }));
    const dbHealth = (num(txCountRow) + num(spendRow, 'entries') + (deployRow ? 1 : 0)) > 0 ? 'ok' : 'no_data';

    return jsonResponse({
      success: true,
      db_health: dbHealth,
      finance_transactions_count: num(txCountRow),
      spend_ledger_entries: num(spendRow, 'entries'),
      spend_ledger_total: spendTotal,
      active_clients: num(clientsRow),
      monthly_net: null,
      financial_health: {
        total_in_all_time: sum(totalInRow, 'total'),
        total_out_all_time: totalOutAllTime,
        date_range: null,
        source_accounts_tracked: 0,
      },
      infrastructure_spend_by_provider: providers,
      revenue_clients: { total_clients: num(clientsRow), active_streams: 0 },
      pipeline_runs: 0,
      agent_conversations: num(agentTelemetryRow),
      agent_last_activity: agentTelemetryRow?.last_at ? String(agentTelemetryRow.last_at).slice(0, 19) : null,
      latest_migration: deployRow ? { name: deployRow.deployment_id?.slice(0, 8) || 'deploy', applied_at: deployRow.deployed_at } : null,
    });
  } catch (e) {
    console.warn('Overview stats error:', e?.message);
    return jsonResponse(overviewStatsPayload({ db_health: 'error' }), 200);
  }
}

/** Recent activity for overview card: last 48 hours, simple English. */
async function handleRecentActivity(request, url, env) {
  const hours = Math.min(168, Math.max(1, Number(url.searchParams.get('hours')) || 48));
  if (!env.DB) return jsonResponse({ items: [], filter_hours: hours }, 200);
  const safe = (p) => (p ? p.catch(() => null) : Promise.resolve(null));
  const items = [];

  try {
    const cutoff = Math.floor(Date.now() / 1000) - hours * 3600;

    const cutoffDt = new Date(cutoff * 1000).toISOString().slice(0, 19).replace('T', ' ');
    const [telemetryRows, timeRows, deployRows, sessionRows, checkpointRows] = await Promise.all([
      safe(env.DB.prepare(`SELECT created_at FROM agent_telemetry WHERE created_at >= ? ORDER BY created_at DESC LIMIT 30`).bind(cutoff).all()),
      safe(env.DB.prepare(`SELECT start_time, duration_seconds, description FROM project_time_entries WHERE start_time >= ? ORDER BY start_time DESC LIMIT 20`).bind(cutoffDt).all()),
      safe(env.DB.prepare(`SELECT deployed_at FROM cloudflare_deployments WHERE worker_name = ? AND deployed_at >= ? ORDER BY deployed_at DESC LIMIT 10`).bind('inneranimalmedia', cutoffDt).all()),
      safe(env.DB.prepare(`SELECT started_at, updated_at FROM agent_sessions WHERE started_at >= ? OR updated_at >= ? ORDER BY COALESCE(updated_at, started_at) DESC LIMIT 20`).bind(cutoff, cutoff).all()),
      safe(env.DB.prepare(`SELECT label, updated_at FROM workflow_checkpoints WHERE updated_at >= ? ORDER BY updated_at DESC LIMIT 20`).bind(cutoff).all()),
    ]);

    (telemetryRows?.results || telemetryRows || []).forEach((r) => {
      items.push({ at: r.created_at, text: 'Agent chat (LLM call)', type: 'agent' });
    });
    (timeRows?.results || timeRows || []).forEach((r) => {
      const desc = r.description || 'Time tracked';
      const mins = r.duration_seconds ? Math.round(r.duration_seconds / 60) : 0;
      items.push({ at: r.start_time || r.created_at, text: mins ? `${desc} (${mins} min)` : desc, type: 'time' });
    });
    (deployRows?.results || deployRows || []).forEach((r) => {
      items.push({ at: r.deployed_at, text: 'Worker deployed', type: 'deploy' });
    });
    (sessionRows?.results || sessionRows || []).forEach((r) => {
      const at = r.updated_at || r.started_at;
      items.push({ at, text: 'Chat session activity', type: 'chat' });
    });
    (checkpointRows?.results || checkpointRows || []).forEach((r) => {
      items.push({ at: r.updated_at, text: `Checkpoint: ${r.label || 'Updated'}`, type: 'checkpoint' });
    });

    items.sort((a, b) => {
      const ta = typeof a.at === 'string' && a.at.length >= 19 ? new Date(a.at).getTime() : Number(a.at) * 1000 || 0;
      const tb = typeof b.at === 'string' && b.at.length >= 19 ? new Date(b.at).getTime() : Number(b.at) * 1000 || 0;
      return tb - ta;
    });

    const limited = items.slice(0, 50).map((x) => ({
      at: x.at,
      text: x.text,
      type: x.type,
    }));

    return jsonResponse({ items: limited, filter_hours: hours });
  } catch (e) {
    console.warn('Recent activity error:', e?.message);
    return jsonResponse({ items: [], filter_hours: hours }, 200);
  }
}

const TENANT_ID = 'tenant_sam_primeaux';

/** GET /api/overview/activity-strip -- session required. Returns weekly_activity, recent_activity, worked_this_week, projects. */
async function handleOverviewActivityStrip(request, url, env) {
  if ((request.method || 'GET').toUpperCase() !== 'GET') return jsonResponse({ error: 'Method not allowed' }, 405);
  const session = await getSession(env, request);
  if (!session) return jsonResponse({ error: 'Unauthorized' }, 401);
  if (!env.DB) return jsonResponse({ error: 'DB unavailable' }, 503);

  const userId = session.user_id || 'sam_primeaux';
  const userIdVariants = (() => {
    const u = userId || '';
    const bare = u.replace(/^user_/, '');
    const prefixed = bare === u ? 'user_' + u : u;
    return [...new Set([bare, prefixed])].filter(Boolean);
  })();
  const userList = userIdVariants.map(() => '?').join(',');
  const safe = (p) => (p ? p.catch(() => null) : Promise.resolve(null));
  const num = (r, k) => (r != null && r[k] != null ? Number(r[k]) : r?.c != null ? Number(r.c) : 0);

  try {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const cutoff24h = new Date(now.getTime() - 24 * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ');
    const cutoff24hDt = cutoff24h;

    const [
      deployCountWeek,
      deployTrendRows,
      agentCallsWeek,
      taskCountWeek,
      taskRows24h,
      deployRows24h,
      deploymentRows24h,
      cicdRows24h,
      taskCount24h,
      deployCount24h,
      timeWeekRow,
      timeTodayRow,
      timeLogWeekRow,
      timeLogTodayRow,
      activeEntryRow,
      dailyRows,
      projectsActiveRow,
      projectsDevRow,
      projectsProdRow,
      projectsTopRows,
    ] = await Promise.all([
      safe(env.DB.prepare(`SELECT COUNT(*) as c FROM cloudflare_deployments WHERE deployed_at >= date(?) AND status = 'success'`).bind(sevenDaysAgo).first()),
      safe(env.DB.prepare(`SELECT date(deployed_at) as day, COUNT(*) as cnt FROM cloudflare_deployments WHERE deployed_at >= date('now','-6 days') AND status = 'success' GROUP BY date(deployed_at) ORDER BY day ASC`).all()),
      safe(env.DB.prepare(`SELECT COUNT(*) as c FROM agent_telemetry WHERE created_at >= unixepoch(?) AND (tenant_id = ? OR tenant_id IS NULL)`).bind(sevenDaysAgo, TENANT_ID).first()),
      safe(env.DB.prepare(`SELECT COUNT(*) as c FROM cursor_tasks WHERE created_at >= unixepoch(?) AND status = 'completed'`).bind(sevenDaysAgo).first()).catch(() => ({ c: 0 })),
      safe(env.DB.prepare(`SELECT 'task' as type, instruction as label, 'cursor' as agent, datetime(created_at,'unixepoch') as ts FROM cursor_tasks WHERE created_at >= unixepoch('now','-24 hours') ORDER BY created_at DESC LIMIT 5`).all()).catch(() => ({ results: [] })),
      safe(env.DB.prepare(`SELECT 'deploy' as type, (project_name || ' -- ' || COALESCE(triggered_by,'manual')) as label, COALESCE(triggered_by,'manual') as agent, deployed_at as ts FROM cloudflare_deployments WHERE deployed_at >= datetime('now','-24 hours') AND status = 'success' ORDER BY deployed_at DESC LIMIT 5`).all()),
      safe(env.DB.prepare(`SELECT 'deploy' as type, (version || ' -- ' || COALESCE(deployed_by,'script')) as label, COALESCE(deployed_by,'script') as agent, timestamp as ts FROM deployments WHERE timestamp >= datetime('now','-24 hours') AND status = 'success' ORDER BY timestamp DESC LIMIT 5`).all()).catch(() => ({ results: [] })),
      safe(env.DB.prepare(`SELECT 'ci' as type, (workflow_name || ' -- ' || COALESCE(status,'')) as label, COALESCE(conclusion,status,'ci') as agent, COALESCE(completed_at,started_at) as ts FROM ci_di_workflow_runs WHERE COALESCE(completed_at,started_at) >= datetime('now','-24 hours') ORDER BY COALESCE(completed_at,started_at) DESC LIMIT 5`).all()).catch(() => ({ results: [] })),
      safe(env.DB.prepare(`SELECT COUNT(*) as c FROM cursor_tasks WHERE created_at >= unixepoch('now','-24 hours')`).first()).catch(() => ({ c: 0 })),
      safe(env.DB.prepare(`SELECT COUNT(*) as c FROM cloudflare_deployments WHERE deployed_at >= datetime('now','-24 hours') AND status = 'success'`).first()).catch(() => ({ c: 0 })),
      safe(env.DB.prepare(`SELECT COALESCE(SUM(duration_seconds),0)/3600.0 as h FROM project_time_entries WHERE start_time >= date('now','weekday 1') AND user_id IN (${userList}) AND is_active = 0`).bind(...userIdVariants).first()),
      safe(env.DB.prepare(`SELECT COALESCE(SUM(duration_seconds),0)/3600.0 as h FROM project_time_entries WHERE date(start_time) = date('now') AND user_id IN (${userList}) AND is_active = 0`).bind(...userIdVariants).first()),
      safe(env.DB.prepare(`SELECT COALESCE(SUM(duration_minutes),0)/60.0 as h FROM time_logs WHERE start_time >= date('now','weekday 1')`).first()).catch(() => ({ h: 0 })),
      safe(env.DB.prepare(`SELECT COALESCE(SUM(duration_minutes),0)/60.0 as h FROM time_logs WHERE date(start_time) = date('now')`).first()).catch(() => ({ h: 0 })),
      safe(env.DB.prepare(`SELECT start_time FROM project_time_entries WHERE user_id IN (${userList}) AND date(start_time) = date('now') AND is_active = 1 ORDER BY start_time ASC LIMIT 1`).bind(...userIdVariants).first()),
      safe(env.DB.prepare(`SELECT date(start_time) as d, COALESCE(SUM(duration_seconds),0)/3600.0 as h FROM project_time_entries WHERE start_time >= date('now','weekday 1') AND user_id IN (${userList}) AND is_active = 0 GROUP BY date(start_time) ORDER BY d ASC`).bind(...userIdVariants).all()).catch(() => ({ results: [] })),
      safe(env.DB.prepare(`SELECT COUNT(*) as c FROM projects WHERE status NOT IN ('archived','maintenance')`).first()).catch(() => ({ c: 0 })),
      safe(env.DB.prepare(`SELECT COUNT(*) as c FROM projects WHERE status = 'development'`).first()).catch(() => ({ c: 0 })),
      safe(env.DB.prepare(`SELECT COUNT(*) as c FROM client_projects WHERE status = 'production'`).first()).catch(() => ({ c: 0 })),
      safe(env.DB.prepare(`SELECT name, status, priority FROM projects WHERE status NOT IN ('archived') ORDER BY COALESCE(priority,0) DESC, created_at DESC LIMIT 4`).all()).catch(() => ({ results: [] })),
    ]);

    const deployTrend = [0, 0, 0, 0, 0, 0, 0];
    const trendList = deployTrendRows?.results || deployTrendRows || [];
    const baseDate = new Date(now);
    baseDate.setDate(baseDate.getDate() - 6);
    for (let i = 0; i < 7; i++) {
      const d = new Date(baseDate);
      d.setDate(d.getDate() + i);
      const dayStr = d.toISOString().slice(0, 10);
      const row = trendList.find((r) => String(r.day).slice(0, 10) === dayStr);
      deployTrend[i] = row ? Number(row.cnt || 0) : 0;
    }

    const taskRows = taskRows24h?.results || taskRows24h || [];
    const deployRows = deployRows24h?.results || deployRows24h || [];
    const deploymentRows = deploymentRows24h?.results || deploymentRows24h || [];
    const ciRows = cicdRows24h?.results || cicdRows24h || [];
    const recentEvents = []
      .concat(
        taskRows.map((r) => ({ type: 'task', label: (r.label || '').slice(0, 200), agent: r.agent || 'cursor', ts: r.ts })),
        deployRows.map((r) => ({ type: 'deploy', label: (r.label || '').slice(0, 200), agent: r.agent || 'manual', ts: r.ts })),
        deploymentRows.map((r) => ({ type: 'deploy', label: (r.label || '').slice(0, 200), agent: r.agent || 'script', ts: r.ts })),
        ciRows.map((r) => ({ type: 'ci', label: (r.label || '').slice(0, 200), agent: r.agent || 'ci', ts: r.ts }))
      )
      .sort((a, b) => new Date(b.ts || 0) - new Date(a.ts || 0))
      .slice(0, 10);
    const total24hr = num(taskCount24h) + num(deployCount24h);

    let timeWeek = num(timeWeekRow, 'h') + num(timeLogWeekRow, 'h');
    let timeToday = num(timeTodayRow, 'h') + num(timeLogTodayRow, 'h');
    const dailyList = dailyRows?.results || dailyRows || [];
    const daily = [0, 0, 0, 0, 0, 0, 0];
    for (let i = 0; i < 7; i++) {
      const d = new Date(baseDate);
      d.setDate(d.getDate() + i);
      const dayStr = d.toISOString().slice(0, 10);
      const row = dailyList.find((r) => String(r.d).slice(0, 10) === dayStr);
      daily[i] = row ? Math.round(Number(row.h || 0) * 100) / 100 : 0;
    }
    const timeLogsDaily = await safe(env.DB.prepare(`SELECT date(start_time) as d, COALESCE(SUM(duration_minutes),0)/60.0 as h FROM time_logs WHERE start_time >= date('now','weekday 1') GROUP BY date(start_time) ORDER BY d ASC`).all()).catch(() => ({ results: [] }));
    const timeLogsList = timeLogsDaily?.results || timeLogsDaily || [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(baseDate);
      d.setDate(d.getDate() + i);
      const dayStr = d.toISOString().slice(0, 10);
      const row = timeLogsList.find((r) => String(r.d).slice(0, 10) === dayStr);
      if (row) daily[i] = Math.round((daily[i] + Number(row.h || 0)) * 100) / 100;
    }
    const sessionStart = activeEntryRow?.start_time ?? null;
    const liveHours = sessionStart ? Math.max(0, (now.getTime() - new Date(sessionStart).getTime()) / 3600000) : 0;
    if (liveHours > 0) {
      timeToday += liveHours;
      timeWeek += liveHours;
      const todayStr = now.toISOString().slice(0, 10);
      for (let i = 0; i < 7; i++) {
        const d = new Date(baseDate);
        d.setDate(d.getDate() + i);
        if (d.toISOString().slice(0, 10) === todayStr) {
          daily[i] = Math.round((daily[i] + liveHours) * 100) / 100;
          break;
        }
      }
    }

    const activeCount = num(projectsActiveRow);
    const inDevCount = num(projectsDevRow);
    const productionCount = projectsProdRow != null ? num(projectsProdRow) : inDevCount;
    const topList = (projectsTopRows?.results || projectsTopRows || []).map((r) => ({
      name: (r.name || '').slice(0, 80),
      status: r.status || 'active',
      priority: Number(r.priority || 0),
    }));

    return jsonResponse({
      weekly_activity: {
        deploys: num(deployCountWeek),
        tasks_completed: num(taskCountWeek),
        agent_calls: num(agentCallsWeek),
        deploy_trend: deployTrend,
      },
      recent_activity: {
        events: recentEvents,
        total_24hr: total24hr,
      },
      worked_this_week: {
        hours_this_week: Math.round(timeWeek * 100) / 100,
        hours_today: Math.round(timeToday * 100) / 100,
        daily,
      },
      projects: {
        active: activeCount,
        in_dev: inDevCount,
        production: productionCount,
        top: topList,
      },
    });
  } catch (e) {
    console.warn('Activity strip error:', e?.message);
    return jsonResponse({ error: String(e?.message) }, 500);
  }
}

/** GET /api/overview/deployments -- session required. Returns cloudflare_deployments (20) and cicd_runs (10). */
async function handleOverviewDeployments(request, url, env) {
  if ((request.method || 'GET').toUpperCase() !== 'GET') return jsonResponse({ error: 'Method not allowed' }, 405);
  const session = await getSession(env, request);
  if (!session) return jsonResponse({ error: 'Unauthorized' }, 401);
  if (!env.DB) return jsonResponse({ error: 'DB unavailable' }, 503);

  try {
    const cfRows = await env.DB.prepare(
      `SELECT worker_name, environment, status, deployed_at, deployment_notes FROM cloudflare_deployments ORDER BY deployed_at DESC LIMIT 20`
    ).all();
    const cloudflare_deployments = (cfRows?.results ?? cfRows ?? []).map((r) => ({
      worker_name: r.worker_name,
      environment: r.environment,
      status: r.status,
      deployed_at: r.deployed_at,
      deployment_notes: r.deployment_notes,
    }));

    let cicd_runs = [];
    try {
      const cicdRows = await env.DB.prepare(
        `SELECT run_id, workflow_name, branch, status, conclusion, started_at, completed_at FROM cicd_runs ORDER BY started_at DESC LIMIT 10`
      ).all();
      cicd_runs = (cicdRows?.results ?? cicdRows ?? []).map((r) => ({
        run_id: r.run_id,
        workflow_name: r.workflow_name,
        branch: r.branch,
        status: r.status,
        conclusion: r.conclusion,
        started_at: r.started_at,
        completed_at: r.completed_at,
      }));
    } catch (_) {
      // cicd_runs table may not exist; fall back to ci_di_workflow_runs
      try {
        const altRows = await env.DB.prepare(
          `SELECT run_id, workflow_name, branch, status, conclusion, started_at, completed_at FROM ci_di_workflow_runs ORDER BY started_at DESC LIMIT 10`
        ).all();
        cicd_runs = (altRows?.results ?? altRows ?? []).map((r) => ({
          run_id: r.run_id,
          workflow_name: r.workflow_name,
          branch: r.branch,
          status: r.status,
          conclusion: r.conclusion,
          started_at: r.started_at,
          completed_at: r.completed_at,
        }));
      } catch (_) {}
    }

    return jsonResponse({ cloudflare_deployments, cicd_runs });
  } catch (e) {
    console.warn('Overview deployments error:', e?.message);
    return jsonResponse({ error: String(e?.message), cloudflare_deployments: [], cicd_runs: [] }, 500);
  }
}

/** Workflow checkpoints: list (GET) or create/update (POST). Used for realtime alignment and reducing backtracking. */
async function handleOverviewCheckpoints(request, url, env) {
  if (!env.DB) return jsonResponse({ success: false, error: 'DB unavailable' }, 503);
  const method = (request.method || 'GET').toUpperCase();

  if (method === 'GET') {
    try {
      const rows = await env.DB.prepare(
        `SELECT id, label, status, sort_order, notes, updated_at, created_at FROM workflow_checkpoints ORDER BY sort_order ASC, updated_at DESC`
      ).all();
      const list = (rows?.results || rows || []).map((r) => ({
        id: r.id,
        label: r.label,
        status: r.status,
        sort_order: r.sort_order,
        notes: r.notes,
        updated_at: r.updated_at,
        created_at: r.created_at,
      }));
      return jsonResponse({ success: true, checkpoints: list });
    } catch (e) {
      console.warn('Checkpoints GET error:', e?.message);
      return jsonResponse({ success: false, checkpoints: [] }, 500);
    }
  }

  if (method === 'POST') {
    const session = await getSession(env, request);
    if (!session) return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ success: false, error: 'Invalid JSON' }, 400);
    }
    const { id, label, status, sort_order, notes } = body || {};
    const uid = (id && String(id).trim()) || crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    try {
      const existing = await env.DB.prepare(`SELECT id FROM workflow_checkpoints WHERE id = ?`).bind(uid).first();
      if (existing) {
        await env.DB.prepare(
          `UPDATE workflow_checkpoints SET label = COALESCE(?, label), status = COALESCE(?, status), sort_order = COALESCE(?, sort_order), notes = ?, updated_at = ? WHERE id = ?`
        ).bind(label ?? null, status ?? null, sort_order ?? null, notes ?? null, now, uid).run();
        return jsonResponse({ success: true, id: uid, updated: true });
      }
      await env.DB.prepare(
        `INSERT INTO workflow_checkpoints (id, label, status, sort_order, notes, updated_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(uid, label ?? 'Checkpoint', status ?? 'pending', sort_order ?? 0, notes ?? null, now, now).run();
      return jsonResponse({ success: true, id: uid, created: true });
    } catch (e) {
      console.warn('Checkpoints POST error:', e?.message);
      return jsonResponse({ success: false, error: String(e?.message) }, 500);
    }
  }

  return jsonResponse({ success: false, error: 'Method not allowed' }, 405);
}

async function handleTimeTrackManual(request, env) {
  const body = await request.json().catch(() => null);
  if (!body?.project || !body?.hours) {
    return Response.json({ error: 'project and hours required' }, { status: 400 });
  }

  const id = 'tl_manual_' + Date.now();
  const durationMinutes = Math.round(body.hours * 60);
  const startTime = body.date
    ? `${body.date} 09:00:00`
    : new Date().toISOString().slice(0, 19).replace('T', ' ');

  await env.DB.prepare(
    `INSERT INTO time_logs
       (id, user_id, project_id, task_description, start_time,
        duration_minutes, billable, category, notes, created_at)
     VALUES (?, 'sam_primeaux', ?, ?, ?, ?, 1, 'development', ?, datetime('now'))`
  ).bind(
    id,
    body.project.toLowerCase().replace(/\s+/g, '-').slice(0, 60),
    body.note || body.project,
    startTime,
    durationMinutes,
    body.note || null
  ).run();

  return Response.json({ success: true, id }, { headers: { 'Content-Type': 'application/json' } });
}

async function handleTimeTrackHeartbeat(request, env) {
  const USER_IDS = ['sam_primeaux', 'user_sam_primeaux'];
  const userList = USER_IDS.map(() => '?').join(',');

  const activeEntry = await env.DB.prepare(
    `SELECT * FROM project_time_entries
     WHERE user_id IN (${userList})
       AND date(start_time) = date('now')
       AND is_active = 1
     ORDER BY start_time ASC LIMIT 1`
  ).bind(...USER_IDS).first();

  const isActive = !!activeEntry;
  const sessionStart = activeEntry?.start_time ?? null;

  const closedRow = await env.DB.prepare(
    `SELECT COALESCE(SUM(duration_seconds),0) as secs
     FROM project_time_entries
     WHERE user_id IN (${userList})
       AND date(start_time) = date('now')
       AND is_active = 0`
  ).bind(...USER_IDS).first();

  const closedSecs = closedRow?.secs ?? 0;
  const liveSecs = isActive && sessionStart
    ? Math.max(0, Math.floor((Date.now() - new Date(sessionStart).getTime()) / 1000))
    : 0;
  const todaySeconds = closedSecs + liveSecs;

  const weekStart = "date('now','weekday 1','-7 days')";
  const weekA = await env.DB.prepare(
    `SELECT COALESCE(SUM(duration_seconds),0) as secs
     FROM project_time_entries
     WHERE user_id IN (${userList})
       AND start_time >= ${weekStart} AND is_active = 0`
  ).bind(...USER_IDS).first();

  const weekB = await env.DB.prepare(
    `SELECT COALESCE(SUM(duration_minutes),0)*60 as secs
     FROM time_logs
     WHERE start_time >= ${weekStart}`
  ).first();

  const weekSeconds = (weekA?.secs ?? 0) + (weekB?.secs ?? 0) + liveSecs;

  const dailyRows = await env.DB.prepare(
    `SELECT date(start_time) as day, COALESCE(SUM(duration_seconds),0) as secs
     FROM project_time_entries
     WHERE user_id IN (${userList})
       AND start_time >= date('now','-6 days')
       AND is_active = 0
     GROUP BY date(start_time)`
  ).bind(...USER_IDS).all();

  const dailyMap = {};
  (dailyRows.results ?? []).forEach(r => { dailyMap[r.day] = r.secs; });

  const todayDow = new Date().getDay();
  const todayMonIdx = todayDow === 0 ? 6 : todayDow - 1;
  const dailySeconds = Array.from({ length: 7 }, (_, i) => {
    if (i === todayMonIdx) return liveSecs + closedSecs;
    const d = new Date();
    d.setDate(d.getDate() - (todayMonIdx - i));
    return dailyMap[d.toISOString().split('T')[0]] ?? 0;
  });

  const entriesRows = await env.DB.prepare(
    `SELECT date(start_time) as date,
            project_id as project,
            ROUND(duration_seconds / 3600.0, 2) as hours,
            description as note
     FROM project_time_entries
     WHERE user_id IN (${userList}) AND is_active = 0
     ORDER BY start_time DESC LIMIT 10`
  ).bind(...USER_IDS).all();

  return Response.json({
    is_active: isActive,
    session_start: sessionStart,
    today_seconds: todaySeconds,
    week_seconds: weekSeconds,
    daily_seconds: dailySeconds,
    entries: entriesRows.results ?? []
  }, { headers: { 'Content-Type': 'application/json' } });
}

async function handleTimeTrack(request, url, env) {
  const session = await getSession(env, request);
  if (!session) return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
  if (!env.DB) return jsonResponse({ success: false, error: 'DB unavailable' }, 503);

  const pathSeg = pathToSegments(url.pathname);
  let action = pathSeg[pathSeg.length - 1];
  if (action === 'time-track' || !action) action = url.searchParams.get('action') || 'heartbeat';
  const userId = session.user_id;

  try {
    if (action === 'start') {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      await env.DB.prepare(
        `INSERT INTO project_time_entries (id, user_id, project_id, session_id, start_time, end_time, duration_seconds, is_active, description, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, 1, ?, datetime('now'))`
      ).bind(id, userId, PROJECT_ID, session.id, now, null, 'dashboard_session').run();
      return jsonResponse({ success: true, entry_id: id, started_at: now });
    }

    if (action === 'end') {
      const res = await env.DB.prepare(
        `UPDATE project_time_entries SET end_time = datetime('now'), duration_seconds = (julianday('now') - julianday(start_time)) * 86400, is_active = 0 WHERE user_id = ? AND project_id = ? AND is_active = 1`
      ).bind(userId, PROJECT_ID).run();
      return jsonResponse({ success: true, updated: res.meta?.changes ?? 0 });
    }

    if (action === 'heartbeat') {
      const method = (request.method || 'GET').toUpperCase();
      if (method === 'GET') return handleTimeTrackHeartbeat(request, env);

      const userIdVariants = (() => {
        const u = userId || '';
        const bare = u.replace(/^user_/, '');
        const prefixed = bare === u ? 'user_' + u : u;
        return [...new Set([bare, prefixed])].filter(Boolean);
      })();

      const now = new Date().toISOString();
      const userIdIn = userIdVariants.length >= 2 ? [userIdVariants[0], userIdVariants[1], PROJECT_ID] : [userIdVariants[0], PROJECT_ID];
      // Auto-stop: close any active entry that has been running > 12 hours (time documentation fix: timer stops)
      await env.DB.prepare(
        `UPDATE project_time_entries SET end_time = datetime('now'), duration_seconds = (julianday('now') - julianday(start_time)) * 86400, is_active = 0 WHERE is_active = 1 AND (julianday('now') - julianday(start_time)) * 24 > 12`
      ).run().catch(() => {});

      const activeStmt = userIdVariants.length >= 2
        ? env.DB.prepare(`SELECT id, start_time FROM project_time_entries WHERE user_id IN (?, ?) AND project_id = ? AND is_active = 1 LIMIT 1`).bind(...userIdIn)
        : env.DB.prepare(`SELECT id, start_time FROM project_time_entries WHERE user_id = ? AND project_id = ? AND is_active = 1 LIMIT 1`).bind(userIdIn[0], userIdIn[1]);
      const active = await activeStmt.first();
      if (active) {
        const startTime = active.start_time;
        const hoursRunning = startTime ? (Date.now() - new Date(startTime).getTime()) / (1000 * 60 * 60) : 0;
        if (hoursRunning >= 12) {
          await env.DB.prepare(
            `UPDATE project_time_entries SET end_time = datetime('now'), duration_seconds = (julianday('now') - julianday(start_time)) * 86400, is_active = 0 WHERE id = ?`
          ).bind(active.id).run();
          return jsonResponse({ success: true, entry_id: active.id, auto_stopped: true, reason: '12h cap' });
        }
        await env.DB.prepare(
          `UPDATE project_time_entries SET duration_seconds = (julianday('now') - julianday(start_time)) * 86400 WHERE id = ?`
        ).bind(active.id).run();
          await ensureWorkSessionAndSignal(env, userId, 'ws_samprimeaux', 'heartbeat', 'dashboard-time-track', { entry_id: active.id });
        return jsonResponse({ success: true, entry_id: active.id, duration_updated: true });
      }
      const id = crypto.randomUUID();
      await env.DB.prepare(
        `INSERT INTO project_time_entries (id, user_id, project_id, session_id, start_time, end_time, duration_seconds, is_active, description, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, 1, ?, datetime('now'))`
      ).bind(id, userId, PROJECT_ID, session.id, now, null, 'dashboard_heartbeat').run();
      await ensureWorkSessionAndSignal(env, userId, 'ws_samprimeaux', 'heartbeat', 'dashboard-time-track', { entry_id: id, started: true });
      return jsonResponse({ success: true, entry_id: id, started_at: now });
    }

    return jsonResponse({ success: false, error: 'Invalid action' }, 400);
  } catch (e) {
    console.warn('Time track error:', e?.message);
    return jsonResponse({ success: false, error: String(e?.message) }, 500);
  }
}

function pathToSegments(pathname) {
  return pathname.replace(/\/$/, '').split('/').filter(Boolean);
}

async function handleColorsAll(request, env) {
  const payload = {
    success: true,
    providers: [
      { slug: 'google_one', display_name: 'Google One', primary_color: '#FF2BD6', text_on_color: '#0f1117' },
      { slug: 'cloudflare', display_name: 'Cloudflare', primary_color: '#F38020', text_on_color: '#ffffff' },
      { slug: 'google_workspace', display_name: 'Google Workspace', primary_color: '#FBBC04', text_on_color: '#0f1117' },
      { slug: 'resend', display_name: 'Resend', primary_color: '#22C55E', text_on_color: '#0f1117' },
    ],
    accounts: [],
    tenants: [],
    paymentSources: [
      { slug: 'venmo', display_name: 'Venmo', primary_color: '#008CFF', text_on_color: '#ffffff' },
      { slug: 'stripe', display_name: 'Stripe', primary_color: '#635BFF', text_on_color: '#ffffff' },
    ],
  };
  return jsonResponse(payload);
}

const FINANCE_TENANT = 'system';
function safeQuery(env, fn) {
  if (!env.DB) return Promise.resolve(null);
  return fn().catch(() => null);
}

async function handleFinance(request, url, env) {
  const pathSeg = pathToSegments(url.pathname);
  const subPath = pathSeg.slice(2).join('/');
  const method = (request.method || 'GET').toUpperCase();
  const params = url.searchParams;

  if (pathSeg[2] === 'transactions' && pathSeg[3] && method === 'GET') {
    return handleFinanceTransactionGet(request, url, env, pathSeg[3]);
  }
  if (pathSeg[2] === 'transactions' && pathSeg[3] && (method === 'PUT' || method === 'DELETE')) {
    return handleFinanceTransactionMutate(request, env, pathSeg[3], method);
  }
  if (pathSeg[2] === 'transactions' && method === 'GET') {
    return handleFinanceTransactionsList(request, url, env);
  }
  if (pathSeg[2] === 'transactions' && method === 'POST') {
    return handleFinanceTransactionCreate(request, env);
  }
  if (pathSeg[2] === 'import-csv' && method === 'POST') {
    return handleFinanceImportCsv(request, env);
  }

  switch (subPath.split('/')[0]) {
    case 'summary':
      return handleFinanceSummary(url, env);
    case 'health':
      return handleFinanceHealth(env);
    case 'breakdown':
      return handleFinanceBreakdown(url, env);
    case 'categories':
      return handleFinanceCategories(env);
    case 'accounts':
      return handleFinanceAccounts(env);
    case 'mrr':
      return handleFinanceMrr(env);
    case 'ai-spend':
      return handleFinanceAiSpend(url, env);
    default:
      return jsonResponse({ success: false, error: 'Not found' }, 404);
  }
}

async function handleFinanceSummary(url, env) {
  if (!env.DB) return jsonResponse({ success: false, error: 'DB unavailable' }, 503);
  const safe = (p) => (p ? p.catch(() => null) : Promise.resolve(null));
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

  const [
    monthIn,
    monthOut,
    techSpend,
    monthly,
    byCategory,
    accounts,
    spendLedgerRow,
    spendByProvider,
    aiSpendRow,
    aiSpendList,
    totalInAllTime,
    totalOutTxns,
  ] = await Promise.all([
    safe(env.DB.prepare(`SELECT COALESCE(SUM(amount),0) as v FROM financial_transactions WHERE transaction_date >= ? AND amount > 0`).bind(monthStart).first()),
    safe(env.DB.prepare(`SELECT COALESCE(SUM(ABS(amount)),0) as v FROM financial_transactions WHERE transaction_date >= ? AND amount < 0`).bind(monthStart).first()),
    safe(env.DB.prepare(`SELECT COALESCE(SUM(ABS(amount)),0) as v FROM financial_transactions WHERE transaction_date >= ? AND amount < 0 AND (category = 'tech' OR category = 'subscriptions')`).bind(monthStart).first()),
    safe(env.DB.prepare(`
      SELECT strftime('%b %Y', transaction_date) as month,
        strftime('%Y-%m', transaction_date) as sort_key,
        ROUND(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END),2) as income,
        ROUND(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END),2) as expenses,
        ROUND(SUM(amount),2) as net
      FROM financial_transactions
      WHERE transaction_date >= date('now','-6 months')
      GROUP BY strftime('%Y-%m', transaction_date)
      ORDER BY sort_key ASC
    `).all()),
    safe(env.DB.prepare(`
      SELECT category,
        ROUND(SUM(ABS(amount)),2) as amount,
        COUNT(*) as count
      FROM financial_transactions
      WHERE amount < 0
      GROUP BY category
      ORDER BY amount DESC
    `).all()),
    safe(env.DB.prepare(`SELECT id, account_name, account_type, bank_name, entity_type FROM financial_accounts WHERE is_active = 1 ORDER BY id`).all()),
    safe(env.DB.prepare(`SELECT COUNT(*) as entries, COALESCE(SUM(amount_usd), 0) as total FROM spend_ledger`).first()),
    safe(env.DB.prepare(`SELECT provider, SUM(amount_usd) as total FROM spend_ledger GROUP BY provider ORDER BY total DESC LIMIT 10`).all()),
    safe(env.DB.prepare(`SELECT COALESCE(SUM(amount_usd),0) as total, COUNT(*) as count FROM spend_ledger WHERE category IN ('ai_tools','usage') OR provider IS NOT NULL`).first()),
    safe(env.DB.prepare(`SELECT occurred_at, provider_slug, provider, amount_usd, description, notes FROM spend_ledger WHERE category IN ('ai_tools','usage') OR provider IS NOT NULL ORDER BY occurred_at DESC LIMIT 50`).all()),
    safe(env.DB.prepare(`SELECT COALESCE(SUM(amount),0) as v FROM financial_transactions WHERE amount > 0`).first()),
    safe(env.DB.prepare(`SELECT COALESCE(SUM(ABS(amount)),0) as v FROM financial_transactions WHERE amount < 0`).first()),
  ]);

  const spendTotal = Number(spendLedgerRow?.total ?? 0);
  const spendEntries = Number(spendLedgerRow?.entries ?? 0);
  const outTxns = Number(totalOutTxns?.v ?? 0);
  const totalOutAllTime = outTxns + spendTotal;

  const byProvider = (spendByProvider?.results ?? spendByProvider ?? []).map((r) => ({
    provider: r.provider || 'unknown',
    total: Number(r.total || 0),
  }));

  let aiRows = [];
  try {
    const list = aiSpendList?.results ?? aiSpendList ?? [];
    aiRows = Array.isArray(list) ? list.map((r) => ({
      occurred_at: r.occurred_at,
      provider_slug: r.provider_slug || r.provider,
      amount_usd: r.amount_usd,
      description: r.description,
      notes: r.notes,
    })) : [];
  } catch (_) {}

  return Response.json({
    success: true,
    summary: {
      month_in: monthIn?.v ?? 0,
      month_out: monthOut?.v ?? 0,
      month_net: (monthIn?.v ?? 0) - (monthOut?.v ?? 0),
      tech_spend: techSpend?.v ?? 0,
    },
    monthly: (monthly?.results ?? monthly ?? []),
    by_category: (byCategory?.results ?? byCategory ?? []),
    accounts: (accounts?.results ?? accounts ?? []),
    spend_ledger: {
      total: spendTotal,
      entries: spendEntries,
      by_provider: byProvider,
    },
    ai_spend: {
      total_usd: Number(aiSpendRow?.total ?? 0),
      count: Number(aiSpendRow?.count ?? 0),
      rows: aiRows,
    },
    financial_health: {
      total_in_all_time: Number(totalInAllTime?.v ?? 0),
      total_out_all_time: totalOutAllTime,
    },
  });
}

async function handleFinanceHealth(env) {
  const safe = (p) => (p ? p.catch(() => null) : Promise.resolve(null));
  let totalIn = 0, totalOut = 0;
  const inRow = await safe(env.DB?.prepare(
    `SELECT COALESCE(SUM(amount_cents),0)/100.0 as total FROM finance_transactions WHERE direction = 'credit' OR transaction_type = 'credit'`
  ).first());
  const outRow = await safe(env.DB?.prepare(
    `SELECT COALESCE(SUM(amount_cents),0)/100.0 as total FROM finance_transactions WHERE direction = 'debit' OR transaction_type = 'debit'`
  ).first());
  const spendRow = await safe(env.DB?.prepare(
    `SELECT COALESCE(SUM(amount_usd),0) as total FROM spend_ledger`
  ).first());
  totalIn = Number(inRow?.total ?? 0);
  totalOut = Number(outRow?.total ?? 0) + Number(spendRow?.total ?? 0);
  return jsonResponse({
    success: true,
    total_in_all_time: totalIn,
    total_out_all_time: totalOut,
    date_range: null,
    source_accounts_tracked: 0,
  });
}

async function handleFinanceBreakdown(url, env) {
  const month = url.searchParams.get('month') || '';
  const safe = (p) => (p ? p.catch(() => null) : Promise.resolve(null));
  const monthStart = month ? `date('${month}-01')` : `date('1900-01-01')`;
  const monthEnd = month ? `date('${month}-01','+1 month','-1 day')` : `date('now','+1 year')`;
  const result = await safe(env.DB?.prepare(
    `SELECT COALESCE(category, 'Uncategorized') as category_name, direction, SUM(amount_cents)/100.0 as total_cents FROM finance_transactions WHERE date >= ${monthStart} AND date <= ${monthEnd} GROUP BY category, direction`
  ).all());
  const data = (result?.results || result || []).map((r) => ({
    category_name: r.category_name,
    direction: r.direction || 'debit',
    total_cents: Number(r.total_cents || 0),
    total: Number(r.total_cents || 0),
  }));
  return jsonResponse({ success: true, data });
}

async function handleFinanceCategories(env) {
  const safe = (p) => (p ? p.catch(() => null) : Promise.resolve(null));
  const result = await safe(env.DB?.prepare(
    `SELECT DISTINCT id, name as category_name, color as category_color FROM finance_categories LIMIT 100`
  ).all());
  const data = (result?.results || result || []).map((r) => ({
    id: r.id,
    category_name: r.category_name,
    category_color: r.category_color,
  }));
  if (data.length === 0) {
    return jsonResponse({ success: true, data: [{ id: 'other', category_name: 'Other', category_color: '#6b7280' }] });
  }
  return jsonResponse({ success: true, data });
}

async function handleFinanceAccounts(env) {
  const safe = (p) => (p ? p.catch(() => null) : Promise.resolve(null));
  const result = await safe(env.DB?.prepare(
    `SELECT id, name as display_name, email FROM financial_accounts LIMIT 100`
  ).all());
  const data = (result?.results || result || []).map((r) => ({
    id: r.id,
    display_name: r.display_name,
    email: r.email,
  }));
  return jsonResponse({ success: true, data: data.length ? data : [] });
}

async function handleFinanceMrr(env) {
  return jsonResponse({ success: true, mrr: 0, trend: [] });
}

async function handleFinanceAiSpend(url, env) {
  const scope = url.searchParams.get('scope') || '';
  const safe = (p) => (p ? p.catch(() => null) : Promise.resolve(null));
  const row = await safe(env.DB?.prepare(
    `SELECT COALESCE(SUM(amount_usd),0) as total, COUNT(*) as count FROM spend_ledger WHERE category IN ('ai_tools','usage') OR provider IS NOT NULL`
  ).first());
  const total_usd = Number(row?.total ?? 0);
  const count = Number(row?.count ?? 0);
  // Optional: return rows for usage table (agent dashboard expects summary + rows)
  let rows = [];
  try {
    const list = await safe(env.DB?.prepare(
      `SELECT occurred_at, provider_slug, amount_usd, description, notes FROM spend_ledger WHERE category IN ('ai_tools','usage') OR provider IS NOT NULL ORDER BY occurred_at DESC LIMIT 50`
    ).all());
    const res = list?.results ?? list ?? [];
    rows = Array.isArray(res) ? res.map((r) => ({
      occurred_at: r.occurred_at,
      provider_slug: r.provider_slug || r.provider,
      amount_usd: r.amount_usd,
      description: r.description,
      service: r.description,
      notes: r.notes,
    })) : [];
  } catch (_) {}
  return jsonResponse({
    success: true,
    total_usd,
    count,
    by_provider: [],
    summary: { total_this_month: total_usd },
    rows,
  });
}

async function handleFinanceTransactionsList(request, url, env) {
  if (!env.DB) return jsonResponse({ success: false, error: 'DB unavailable' }, 503);
  const limit = parseInt(url.searchParams.get('limit') || '100', 10);
  const transactions = await env.DB.prepare(`
    SELECT id, transaction_date, description, category, amount, account_id, merchant, note
    FROM financial_transactions
    ORDER BY transaction_date DESC, id DESC
    LIMIT ?
  `).bind(limit).all();
  return Response.json({ success: true, transactions: transactions.results ?? [] });
}

async function handleFinanceTransactionGet(request, url, env, id) {
  const safe = (p) => (p ? p.catch(() => null) : Promise.resolve(null));
  const row = await safe(env.DB?.prepare(
    `SELECT id, date, direction, transaction_type, amount_cents, merchant, description, category FROM finance_transactions WHERE id = ?`
  ).bind(id).first());
  if (!row) return jsonResponse({ success: false, error: 'Not found' }, 404);
  return jsonResponse({ success: true, data: row });
}

async function handleFinanceTransactionCreate(request, env) {
  if (!env.DB) return jsonResponse({ success: false, error: 'DB unavailable' }, 503);
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return jsonResponse({ success: false, error: 'Invalid JSON' }, 400);
  }
  const { date, description, category, amount, account_id, note } = body;
  if (!date || !description || amount === undefined) {
    return Response.json({ error: 'Missing required fields' }, { status: 400 });
  }
  const id = `txn_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  await env.DB.prepare(`
    INSERT INTO financial_transactions
      (transaction_id, transaction_date, description, category, amount, account_id, note, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'complete')
  `).bind(id, date, description, category || 'other', amount, account_id || 5, note || null).run();
  return Response.json({ success: true, id });
}

async function handleFinanceImportCsv(request, env) {
  if (!env.DB) return jsonResponse({ success: false, error: 'DB unavailable' }, 503);
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }
  const { csv, filename } = body;
  if (!csv || typeof csv !== 'string') {
    return Response.json({ error: 'csv required' }, { status: 400 });
  }
  const lines = csv.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) {
    return Response.json({ success: true, imported: 0 });
  }
  const header = lines[0].toLowerCase();
  const cols = header.split(',').map((c) => c.replace(/"/g, '').trim());
  const find = (terms) => cols.findIndex((c) => terms.some((t) => c.includes(t)));
  const dateCol = Math.max(0, find(['date']));
  const amtCol = Math.max(1, find(['amount']));
  const descCol = Math.max(2, find(['description', 'memo']));

  let imported = 0;
  const stmt = env.DB.prepare(`
    INSERT OR IGNORE INTO financial_transactions
      (transaction_id, transaction_date, description, category, amount, account_id, status, source_file)
    VALUES (?, ?, ?, 'other', ?, 5, 'complete', ?)
  `);
  for (const line of lines.slice(1)) {
    const parts = line.split(',').map((p) => p.replace(/^"|"$/g, '').trim());
    const rawAmt = parseFloat((parts[amtCol] || '').replace(/[^0-9.\-]/g, ''));
    const desc = parts[descCol] || 'Imported transaction';
    if (!parts[dateCol] || isNaN(rawAmt)) continue;
    const d = new Date(parts[dateCol]);
    if (isNaN(d.getTime())) continue;
    const date = d.toISOString().split('T')[0];
    try {
      await stmt.bind(`import_${Date.now()}_${imported}`, date, desc, rawAmt, filename || 'csv').run();
      imported++;
    } catch (_) {}
  }
  return Response.json({ success: true, imported });
}

async function handleFinanceTransactionMutate(request, env, id, method) {
  if (!env.DB) return jsonResponse({ success: false, error: 'DB unavailable' }, 503);
  if (method === 'DELETE') {
    try {
      await env.DB.prepare(`DELETE FROM finance_transactions WHERE id = ?`).bind(id).run();
      return jsonResponse({ success: true });
    } catch (e) {
      return jsonResponse({ success: false, error: String(e?.message) }, 500);
    }
  }
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return jsonResponse({ success: false, error: 'Invalid JSON' }, 400);
  }
  const date = body.date || body.transaction_date;
  const direction = body.direction || body.transaction_type;
  const amountCents = body.amount_cents != null ? Number(body.amount_cents) : null;
  const merchant = body.merchant;
  const description = body.description;
  const updates = [];
  const bindings = [];
  if (date) { updates.push('date = ?'); bindings.push(date); }
  if (direction) { updates.push('direction = ?'); bindings.push(direction); }
  if (amountCents != null) { updates.push('amount_cents = ?'); bindings.push(amountCents); }
  if (merchant != null) { updates.push('merchant = ?'); bindings.push(merchant); }
  if (description != null) { updates.push('description = ?'); bindings.push(description); }
  if (!updates.length) return jsonResponse({ success: true });
  bindings.push(id);
  try {
    await env.DB.prepare(
      `UPDATE finance_transactions SET ${updates.join(', ')} WHERE id = ?`
    ).bind(...bindings).run();
    return jsonResponse({ success: true });
  } catch (e) {
    return jsonResponse({ success: false, error: String(e?.message) }, 500);
  }
}

async function handleClients(request, url, env) {
  if (!env.DB) return jsonResponse({ success: false, error: 'DB unavailable' }, 503);
  const method = (request.method || 'GET').toUpperCase();

  if (method === 'GET') {
    try {
      const clients = await env.DB.prepare(`
        SELECT
          c.id, c.name, c.email, c.domain, c.status, c.monthly_rate, c.notes,
          cp.project_name, cp.payments_received, cp.total_invoiced, cp.status as project_status,
          cp.payment_notes, cp.worker_id
        FROM clients c
        LEFT JOIN client_projects cp ON cp.client_id = c.id
        WHERE COALESCE(TRIM(c.status), '') != 'merged'
        ORDER BY c.name ASC
      `).all();
      return Response.json({ success: true, clients: clients.results ?? [] });
    } catch (e) {
      return Response.json({ success: false, error: String(e?.message || e), clients: [] });
    }
  }

  if (method === 'POST') {
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return jsonResponse({ error: 'Invalid JSON' }, 400);
    }
    const { id, name, email, domain, monthly_rate, notes, status } = body;
    if (!name || !email) return Response.json({ error: 'name and email required' }, { status: 400 });
    const clientId = id || 'client_' + Math.random().toString(36).slice(2, 10);
    await env.DB.prepare(`
      INSERT OR REPLACE INTO clients (id, name, email, domain, status, monthly_rate, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, unixepoch(), unixepoch())
    `).bind(clientId, name, email, domain || null, status || 'active', monthly_rate || 0, notes || null).run();
    return Response.json({ success: true, id: clientId });
  }

  if (method === 'DELETE') {
    let id = url.searchParams.get('id');
    if (!id) {
      try {
        const body = await request.json();
        id = body?.id;
      } catch (_) {}
    }
    if (!id) return jsonResponse({ error: 'id required' }, 400);
    const r = await env.DB.prepare('DELETE FROM clients WHERE id = ?').bind(id).run();
    return Response.json({ success: true, deleted: (r.meta?.changes ?? 0) > 0 });
  }

  return jsonResponse({ error: 'Method not allowed' }, 405);
}

async function handleProjects(request, url, env) {
  if (!env.DB) return jsonResponse({ success: false, error: 'DB unavailable' }, 503);
  if ((request.method || 'GET').toUpperCase() !== 'GET') return jsonResponse({ error: 'Method not allowed' }, 405);
  try {
    const projects = await env.DB.prepare(`
      SELECT
        p.id, p.name, p.client_name, p.project_type, p.status, p.tech_stack,
        p.domain, p.worker_id, p.launch_date, p.priority, p.description,
        cp.payments_received, cp.total_invoiced, cp.payment_notes
      FROM projects p
      LEFT JOIN client_projects cp ON cp.project_id = p.id
      ORDER BY p.priority DESC, p.name ASC
    `).all();
    return Response.json({ success: true, projects: projects.results ?? [] });
  } catch (e) {
    return Response.json({ success: false, error: String(e?.message || e), projects: [] });
  }
}

// ----- API: Mission Control Hub (read-only + task create/update) -----
async function handleHubRoadmap(request, env) {
  if (!env.DB) return Response.json({ steps: [], error: 'DB unavailable' }, { status: 503 });
  const planId = new URL(request.url).searchParams.get('plan_id') || 'plan_iam_dashboard_v1';
  try {
    const r = await env.DB.prepare(
      `SELECT id, title, status, order_index, description FROM roadmap_steps WHERE plan_id = ? ORDER BY order_index`
    ).bind(planId).all();
    return Response.json({ steps: r.results ?? [] });
  } catch (e) {
    return Response.json({ steps: [], error: String(e?.message || e) });
  }
}

async function handleHubTasks(request, env) {
  if (!env.DB) return Response.json({ tasks: [], error: 'DB unavailable' }, { status: 503 });
  try {
    const r = await env.DB.prepare(`
      SELECT id, title, status, priority, project_id, due_date
      FROM tasks
      WHERE status NOT IN ('done','cancelled') AND (tenant_id = 'system' OR tenant_id IS NULL)
      ORDER BY CASE priority WHEN 'critical' THEN 1 WHEN 'urgent' THEN 2 WHEN 'high' THEN 3 WHEN 'medium' THEN 4 ELSE 5 END, created_at DESC
      LIMIT 20
    `).all();
    return Response.json({ tasks: r.results ?? [] });
  } catch (_) {
    return Response.json({ tasks: [] });
  }
}

async function handleHubStats(request, env) {
  if (!env.DB) return Response.json({ hours_today: 0, spend_this_week: 0, agent_calls_today: 0 }, { status: 503 });
  try {
    const [hoursRow, spendRow, callsRow] = await Promise.all([
      env.DB.prepare(`SELECT COALESCE(SUM(duration_seconds),0)/3600.0 as hours_today FROM project_time_entries WHERE date(start_time) = date('now')`).first().catch(() => ({ hours_today: 0 })),
      env.DB.prepare(`SELECT COALESCE(SUM(amount_usd), 0) as spend_this_week FROM spend_ledger WHERE occurred_at >= unixepoch('now', '-7 days')`).first().catch(() => ({ spend_this_week: 0 })),
      env.DB.prepare(`SELECT COUNT(*) as agent_calls_today FROM agent_telemetry WHERE created_at >= unixepoch('now', 'start of day')`).first().catch(() => ({ agent_calls_today: 0 })),
    ]);
    const hours = hoursRow?.hours_today ?? 0;
    const spend = spendRow?.spend_this_week ?? 0;
    const calls = callsRow?.agent_calls_today ?? 0;
    return Response.json({ hours_today: Number(hours), spend_this_week: Number(spend), agent_calls_today: Number(calls) });
  } catch (e) {
    return Response.json({ hours_today: 0, spend_this_week: 0, agent_calls_today: 0 });
  }
}

async function handleHubTerminal(request, env) {
  if (!env.DB) return Response.json({ rows: [], error: 'DB unavailable' }, { status: 503 });
  try {
    const r = await env.DB.prepare(
      `SELECT content as command, created_at, NULL as exit_code FROM terminal_history ORDER BY created_at DESC LIMIT 8`
    ).all();
    return Response.json({ rows: (r.results ?? []).map(row => ({ ...row, exit_code: row.exit_code ?? null })) });
  } catch (_) {
    return Response.json({ rows: [] });
  }
}

async function handleHubTaskCreate(request, env) {
  if (!env.DB) return Response.json({ error: 'DB unavailable' }, { status: 503 });
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });
  try {
    const body = await request.json().catch(() => ({}));
    const title = (body.title || '').trim();
    if (!title) return Response.json({ error: 'title required' }, { status: 400 });
    const id = 'task_' + Date.now();
    const priority = body.priority || 'medium';
    const project_id = body.project_id || null;
    await env.DB.prepare(
      `INSERT INTO tasks (id, title, status, priority, project_id, tenant_id, created_at) VALUES (?, ?, 'todo', ?, ?, 'system', unixepoch())`
    ).bind(id, title, priority, project_id).run();
    return Response.json({ ok: true, id });
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

async function handleHubTaskUpdate(request, env, taskId) {
  if (!env.DB) return Response.json({ error: 'DB unavailable' }, { status: 503 });
  if (request.method !== 'PATCH') return Response.json({ error: 'Method not allowed' }, { status: 405 });
  try {
    const body = await request.json().catch(() => ({}));
    const status = body.status;
    if (!status || !['todo','in_progress','review','blocked','done','cancelled'].includes(status))
      return Response.json({ error: 'status required (todo|in_progress|review|blocked|done|cancelled)' }, { status: 400 });
    const r = await env.DB.prepare(`UPDATE tasks SET status = ? WHERE id = ?`).bind(status, taskId).run();
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

async function handleBillingSummary(request, url, env) {
  if (!env.DB) return jsonResponse({ success: false, error: 'DB unavailable' }, 503);
  const invoices = await env.DB.prepare(`
    SELECT i.id, i.client_id, c.name as client_name, i.amount, i.status,
      datetime(i.paid_at, 'unixepoch') as paid_at,
      datetime(i.created_at, 'unixepoch') as created_at
    FROM invoices i
    LEFT JOIN clients c ON i.client_id = c.id
    WHERE i.status = 'paid'
    ORDER BY i.paid_at DESC
  `).all();
  const total = (invoices.results ?? []).reduce((a, i) => a + i.amount, 0);
  return Response.json({ success: true, invoices: invoices.results ?? [], total_collected: total });
}

/** Hex string to Uint8Array for PBKDF2 salt. */
function hexToBytes(hex) {
  const arr = [];
  for (let i = 0; i < hex.length; i += 2) arr.push(parseInt(hex.slice(i, i + 2), 16));
  return new Uint8Array(arr);
}

/** Verify password against PBKDF2-SHA256 stored hash (hex) and salt (hex). Returns true if match. */
async function verifyPassword(password, saltHex, hashHex) {
  const salt = hexToBytes(saltHex);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), { name: 'PBKDF2' }, false, ['deriveBits']);
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    key,
    256
  );
  const derivedHex = Array.from(new Uint8Array(derived)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return derivedHex === hashHex.toLowerCase();
}

/** Generate new salt (32 bytes hex) and PBKDF2-SHA256 hash for change-password. Returns { saltHex, hashHex }. */
async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const saltHex = Array.from(salt).map((b) => b.toString(16).padStart(2, '0')).join('');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), { name: 'PBKDF2' }, false, ['deriveBits']);
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    key,
    256
  );
  const hashHex = Array.from(new Uint8Array(derived)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return { saltHex, hashHex };
}

/** POST /api/auth/login -- body: { email, password }. Creates session and redirects to /dashboard/overview. */
async function handleEmailPasswordLogin(request, url, env) {
  if (!env.DB) {
    return Response.redirect(`${origin(url)}/auth/signin?error=unavailable`, 302);
  }
  let body;
  try {
    body = await request.json();
  } catch (_) {
    return Response.redirect(`${origin(url)}/auth/signin?error=invalid_body`, 302);
  }
  const email = (body.email || '').toString().toLowerCase().trim();
  const password = (body.password || '').toString();
  if (!email || !password) {
    return Response.redirect(`${origin(url)}/auth/signin?error=missing`, 302);
  }
  const user = await env.DB.prepare(
    `SELECT id, email, name, password_hash, salt FROM auth_users WHERE id = ?`
  ).bind(email).first();
  if (!user || !user.password_hash || !user.salt) {
    return Response.redirect(`${origin(url)}/auth/signin?error=invalid_credentials`, 302);
  }
  if (user.password_hash === 'oauth' || user.salt === 'oauth') {
    return Response.redirect(`${origin(url)}/auth/signin?error=use_oauth`, 302);
  }
  const ok = await verifyPassword(password, user.salt, user.password_hash);
  if (!ok) {
    return Response.redirect(`${origin(url)}/auth/signin?error=invalid_credentials`, 302);
  }
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const ip = request.headers.get('cf-connecting-ip') || '';
  const ua = request.headers.get('user-agent') || '';
  await env.DB.prepare(
    `INSERT INTO auth_sessions (id, user_id, expires_at, created_at, ip_address, user_agent) VALUES (?, ?, ?, datetime('now'), ?, ?)`
  ).bind(sessionId, user.id, expiresAt, ip, ua).run();
  const domain = url.hostname === 'www.inneranimalmedia.com' ? 'inneranimalmedia.com' : url.hostname;
  const headers = new Headers({ Location: `${origin(url)}/dashboard/overview` });
  headers.append('Set-Cookie', `session=${sessionId}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000; Domain=${domain}`);
  return new Response(null, { status: 302, headers });
}

/** POST /api/auth/backup-code -- body: { email, code }. Verifies one-time backup code, marks it used, creates session. Returns 200 + Set-Cookie + { ok, redirect }. */
async function handleBackupCodeLogin(request, url, env) {
  if (!env.DB) {
    return new Response(JSON.stringify({ error: 'Service unavailable' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  }
  let body;
  try {
    body = await request.json();
  } catch (_) {
    return new Response(JSON.stringify({ error: 'Invalid request' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  const email = (body.email || '').toString().toLowerCase().trim();
  const code = (body.code || '').toString().replace(/\s/g, '');
  if (!email || !code) {
    return new Response(JSON.stringify({ error: 'Email and backup code are required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code));
  const codeHash = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  const row = await env.DB.prepare(
    `SELECT id, user_id FROM user_backup_codes WHERE user_id = ? AND code_hash = ? AND used_at IS NULL LIMIT 1`
  ).bind(email, codeHash).first();
  if (!row) {
    return new Response(JSON.stringify({ error: 'Invalid or already used backup code' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  const user = await env.DB.prepare(`SELECT id FROM auth_users WHERE id = ?`).bind(email).first();
  if (!user) {
    return new Response(JSON.stringify({ error: 'Account not found' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  await env.DB.prepare(`UPDATE user_backup_codes SET used_at = unixepoch() WHERE id = ?`).bind(row.id).run();
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const ip = request.headers.get('cf-connecting-ip') || '';
  const ua = request.headers.get('user-agent') || '';
  await env.DB.prepare(
    `INSERT INTO auth_sessions (id, user_id, expires_at, created_at, ip_address, user_agent) VALUES (?, ?, ?, datetime('now'), ?, ?)`
  ).bind(sessionId, email, expiresAt, ip, ua).run();
  const domain = url.hostname === 'www.inneranimalmedia.com' ? 'inneranimalmedia.com' : url.hostname;
  const redirectUrl = (body.next && body.next.startsWith('/') && !body.next.startsWith('//')) ? body.next : '/dashboard/overview';
  const headers = new Headers({ 'Content-Type': 'application/json' });
  headers.append('Set-Cookie', `session=${sessionId}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000; Domain=${domain}`);
  return new Response(JSON.stringify({ ok: true, redirect: redirectUrl }), { status: 200, headers });
}

/** POST /api/auth/logout -- clear session cookie and redirect to sign-in. */
async function handleLogout(request, url, env) {
  const domain = url.hostname === 'www.inneranimalmedia.com' ? 'inneranimalmedia.com' : url.hostname;
  const headers = new Headers({ Location: `${origin(url)}/auth/signin` });
  headers.append('Set-Cookie', `session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0; Domain=${domain}`);
  return new Response(null, { status: 302, headers });
}

/** Dashboard pages captured for before/after screenshots (remote only). */
const OVERNIGHT_EVERY_PAGE = ['overview', 'finance', 'chats', 'mcp', 'cloud', 'time-tracking', 'agent', 'billing', 'clients', 'tools', 'calendar', 'images', 'draw', 'meet', 'kanban', 'cms', 'mail', 'pipelines', 'onboarding', 'user-settings', 'settings'];

/** R2 key for the overnight Node script (full pipeline). Stored in bucket agent-sam; include in validate/start emails. */
const OVERNIGHT_SCRIPT_R2_KEY = 'scripts/overnight.js';

function arrayBufferToBase64(ab) {
  const u8 = new Uint8Array(ab);
  let binary = '';
  const chunk = 8192;
  for (let i = 0; i < u8.length; i += chunk) {
    binary += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** POST /api/admin/overnight/validate -- run in worker (remote). D1 check, before screenshots to R2, one proof email WITH screenshot attachments. */
async function handleOvernightValidate(env, baseUrl) {
  const dateTag = new Date().toISOString().slice(0, 10);
  const beforeDir = `before-${dateTag}`;
  let d1Ok = false;
  if (env.DB) {
    try {
      const r = await env.DB.prepare('SELECT 1 as ok').first();
      d1Ok = !!r;
    } catch (_) {}
  }
  const results = [];
  if (env.MYBROWSER && env.DASHBOARD) {
    for (const page of OVERNIGHT_EVERY_PAGE) {
      try {
        if (!playwrightLaunch) {
          const pw = await import("@cloudflare/playwright");
          playwrightLaunch = pw.launch;
        }
        const browser = await playwrightLaunch(env.MYBROWSER);
        const pageObj = await browser.newPage();
        await pageObj.setViewportSize({ width: 1280, height: 800 });
        await pageObj.goto(`${baseUrl}/dashboard/${page}`, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
        const img = await pageObj.screenshot({ type: 'jpeg', quality: 80 });
        await browser.close();
        const key = `reports/screenshots/${beforeDir}/${page}.jpg`;
        await env.DASHBOARD.put(key, img, { httpMetadata: { contentType: 'image/jpeg' } });
        results.push({ page, ok: true, key, buffer: img });
      } catch (e) {
        results.push({ page, ok: false, error: String(e?.message || e) });
      }
    }
  }
  const ok = results.filter((r) => r.ok).length;
  const total = OVERNIGHT_EVERY_PAGE.length;
  const shotRows = results.map((r) => `<tr><td style="padding:6px 10px;border:1px solid #334155;color:#94a3b8">${r.page}</td><td style="padding:6px 10px;border:1px solid #334155;color:${r.ok ? '#22c55e' : '#ef4444'}">${r.ok ? 'OK ' + r.key : 'X ' + (r.error || '')}</td></tr>`).join('');
  const attachments = results.filter((r) => r.ok && r.buffer).map((r) => ({ filename: r.page + '.jpg', content: arrayBufferToBase64(r.buffer) }));
  const html = `<div style="font-family:monospace;background:#0f172a;color:#e2e8f0;padding:32px;max-width:680px;margin:0 auto">
    <h1 style="color:#38bdf8">Setup validated (remote)</h1>
    <p style="color:#64748b">${new Date().toLocaleString('en-US', { timeZone: 'America/Chicago', dateStyle: 'full', timeStyle: 'short' })}</p>
    <div style="background:#1e293b;border-radius:8px;padding:16px;margin:16px 0">
      <p style="margin:0;color:#94a3b8">D1: ${d1Ok ? 'OK' : 'FAIL'}</p>
      <p style="margin:8px 0 0;color:#22c55e">Before screenshots: ${ok}/${total} (${attachments.length} attached below) → R2 reports/screenshots/${beforeDir}/</p>
    </div>
    <h2 style="color:#e2e8f0;font-size:13px">Screenshot results</h2>
    <table style="width:100%;border-collapse:collapse;margin:8px 0">${shotRows}</table>
    <p style="color:#22c55e;font-weight:bold;margin-top:12px">If you receive this email with attachments, validation is working. Screenshots are attached below.</p>
    <p style="color:#475569;font-size:12px;margin-top:8px">To run full pipeline: POST /api/admin/overnight/start</p>
    <div style="background:#1e293b;border-radius:8px;padding:12px;margin-top:16px;font-size:11px;color:#94a3b8">
      <strong style="color:#e2e8f0">Overnight Node script (full pipeline)</strong><br>
      R2 bucket <code>agent-sam</code>, key <code>${OVERNIGHT_SCRIPT_R2_KEY}</code><br>
      Download: <code>./scripts/with-cloudflare-env.sh npx wrangler r2 object get agent-sam/${OVERNIGHT_SCRIPT_R2_KEY} --remote --file overnight.js -c wrangler.production.toml</code><br>
      Run with env RESEND_API_KEY + CLOUDFLARE_API_TOKEN; schedule via cron or GitHub Actions if desired.
    </div>
  </div>`;
  if (env.RESEND_API_KEY) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'sam@inneranimalmedia.com', to: 'meauxbility@gmail.com', subject: '[ok] Overnight setup validated (remote) -- before screenshots captured', html, attachments: attachments.length ? attachments : undefined }),
    }).catch((e) => ({ ok: false, status: 0, error: String(e?.message || e) }));
    if (env.DB && res && !res.ok) {
      const errText = typeof res.text === 'function' ? await res.text().catch(() => '') : (res.error || '');
      try {
        await env.DB.prepare(
          `INSERT OR REPLACE INTO project_memory (project_id, tenant_id, memory_type, key, value, importance_score, confidence_score, created_by) VALUES ('inneranimalmedia', 'tenant_sam_primeaux', 'workflow', 'OVERNIGHT_EMAIL_LAST_ERROR', ?, 0.5, 0.5, 'worker')`
        ).bind(JSON.stringify({ at: new Date().toISOString(), which: 'validate', status: res.status || 0, error: errText })).run();
      } catch (_) {}
    }
  }
}

/** POST /api/admin/overnight/start -- run in worker (remote). Before screenshots + first pipeline email WITH attachments, set D1 OVERNIGHT_STATUS for cron progress. */
async function handleOvernightStart(env, baseUrl) {
  const dateTag = new Date().toISOString().slice(0, 10);
  const beforeDir = `before-${dateTag}`;
  const results = [];
  if (env.MYBROWSER && env.DASHBOARD) {
    for (const page of OVERNIGHT_EVERY_PAGE) {
      try {
        if (!playwrightLaunch) {
          const pw = await import("@cloudflare/playwright");
          playwrightLaunch = pw.launch;
        }
        const browser = await playwrightLaunch(env.MYBROWSER);
        const pageObj = await browser.newPage();
        await pageObj.setViewportSize({ width: 1280, height: 800 });
        await pageObj.goto(`${baseUrl}/dashboard/${page}`, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
        const img = await pageObj.screenshot({ type: 'jpeg', quality: 80 });
        await browser.close();
        const key = `reports/screenshots/${beforeDir}/${page}.jpg`;
        await env.DASHBOARD.put(key, img, { httpMetadata: { contentType: 'image/jpeg' } });
        results.push({ page, ok: true, buffer: img });
      } catch (e) {
        results.push({ page, ok: false, error: String(e?.message || e) });
      }
    }
  }
  const ok = results.filter((r) => r.ok).length;
  const total = OVERNIGHT_EVERY_PAGE.length;
  const startedAt = new Date().toISOString();

  // Read theme_repair_status so status reflects real broken/need-attention count (not 0)
  let brokenFromD1 = 0;
  let brokenPagesList = [];
  if (env.DB) {
    try {
      const tr = await env.DB.prepare(
        `SELECT value FROM project_memory WHERE project_id = 'inneranimalmedia' AND key = 'theme_repair_status'`
      ).first();
      if (tr && tr.value) {
        const mem = JSON.parse(tr.value);
        const working = new Set(mem.working || []);
        const skip = new Set(mem.skip_already_had_fix || []);
        const careful = new Set(mem.careful || []);
        brokenPagesList = mem.broken && mem.broken.length
          ? mem.broken
          : [...new Set([...(mem.careful || []), ...OVERNIGHT_EVERY_PAGE.filter((p) => !working.has(p) && !skip.has(p))])];
        brokenFromD1 = brokenPagesList.length;
      }
    } catch (_) {}
  }

  const statusPayload = {
    status: 'RUNNING',
    started: startedAt,
    before_shots: ok,
    before_total: total,
    before_dir: beforeDir,
    phase: 0,
    last_30min_at: null,
    last_hour_at: null,
    hour_number: 0,
    broken_from_d1: brokenFromD1,
    broken_pages: brokenPagesList
  };
  if (env.DB) {
    await env.DB.prepare(
      `INSERT OR REPLACE INTO project_memory (project_id, tenant_id, memory_type, key, value, importance_score, confidence_score, created_by) VALUES ('inneranimalmedia', 'tenant_sam_primeaux', 'workflow', 'OVERNIGHT_STATUS', ?, 1.0, 1.0, 'agent_sam')`
    ).bind(JSON.stringify(statusPayload)).run().catch(() => {});
  }
  const attachments = results.filter((r) => r.ok && r.buffer).map((r) => ({ filename: r.page + '.jpg', content: arrayBufferToBase64(r.buffer) }));
  const brokenLine = brokenFromD1
    ? `<p style="margin:8px 0 0;color:#f59e0b">D1 theme_repair: <strong>${brokenFromD1}</strong> pages need attention: ${brokenPagesList.slice(0, 15).join(', ')}${brokenPagesList.length > 15 ? '...' : ''}</p>`
    : '';
  const html = `<div style="font-family:monospace;background:#0f172a;color:#e2e8f0;padding:32px;max-width:680px;margin:0 auto">
    <h1 style="color:#38bdf8">Overnight Pipeline Started (remote)</h1>
    <p style="color:#64748b">${new Date().toLocaleString('en-US', { timeZone: 'America/Chicago', dateStyle: 'full', timeStyle: 'short' })}</p>
    <div style="background:#1e293b;border-radius:8px;padding:16px;margin:16px 0">
      <p style="margin:0;color:#22c55e">Before screenshots: ${ok}/${total} (${attachments.length} attached) → R2 reports/screenshots/${beforeDir}/</p>
      ${brokenLine}
    </div>
    <p style="color:#cbd5e1">Progress emails: 30min update, then Hour 1–5 updates, then morning report (cron every 30 min).</p>
    <p style="color:#475569;font-size:12px">Cancel: D1 project_memory OVERNIGHT_USER_ACTION = {"cancel":true}</p>
    <div style="background:#1e293b;border-radius:8px;padding:12px;margin-top:16px;font-size:11px;color:#94a3b8">
      <strong style="color:#e2e8f0">Overnight Node script (full pipeline)</strong><br>
      R2 bucket <code>agent-sam</code>, key <code>${OVERNIGHT_SCRIPT_R2_KEY}</code><br>
      Download: <code>./scripts/with-cloudflare-env.sh npx wrangler r2 object get agent-sam/${OVERNIGHT_SCRIPT_R2_KEY} --remote --file overnight.js -c wrangler.production.toml</code><br>
      Run with env RESEND_API_KEY + CLOUDFLARE_API_TOKEN; schedule via cron or GitHub Actions if desired.
    </div>
  </div>`;
  if (env.RESEND_API_KEY) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'sam@inneranimalmedia.com', to: 'meauxbility@gmail.com', subject: 'dark Overnight Pipeline Started (remote) -- Inner Animal Media', html, attachments: attachments.length ? attachments : undefined }),
    }).catch((e) => ({ ok: false, status: 0, error: String(e?.message || e) }));
    if (env.DB && res && !res.ok) {
      const errText = typeof res.text === 'function' ? await res.text().catch(() => '') : (res.error || '');
      try {
        await env.DB.prepare(
          `INSERT OR REPLACE INTO project_memory (project_id, tenant_id, memory_type, key, value, importance_score, confidence_score, created_by) VALUES ('inneranimalmedia', 'tenant_sam_primeaux', 'workflow', 'OVERNIGHT_EMAIL_LAST_ERROR', ?, 0.5, 0.5, 'worker')`
        ).bind(JSON.stringify({ at: startedAt, status: res.status || 0, error: errText })).run();
      } catch (_) {}
    }
  }
}

/** Load screenshot attachments from R2 (before_dir) for progress emails. */
async function loadScreenshotAttachments(env, beforeDir) {
  const attachments = [];
  if (!env.DASHBOARD || !beforeDir) return attachments;
  for (const page of OVERNIGHT_EVERY_PAGE) {
    try {
      const obj = await env.DASHBOARD.get(`reports/screenshots/${beforeDir}/${page}.jpg`);
      if (obj && obj.body) {
        const ab = await new Response(obj.body).arrayBuffer();
        if (ab && ab.byteLength) attachments.push({ filename: page + '.jpg', content: arrayBufferToBase64(ab) });
      }
    } catch (_) {}
  }
  return attachments;
}

/** Cron every 30 min: send 30min, hourly, and morning progress emails when OVERNIGHT_STATUS is RUNNING. */
async function runOvernightCronStep(env) {
  if (!env.DB || !env.RESEND_API_KEY) return;
  let row;
  try {
    row = await env.DB.prepare(
      `SELECT value FROM project_memory WHERE project_id = 'inneranimalmedia' AND key = 'OVERNIGHT_STATUS'`
    ).first();
  } catch (_) {
    return;
  }
  if (!row || !row.value) return;
  let status;
  try {
    status = JSON.parse(row.value);
  } catch (_) {
    return;
  }
  if (status.status !== 'RUNNING') return;

  const now = new Date();
  const nowIso = now.toISOString();
  const startedMs = new Date(status.started || 0).getTime();
  const elapsedMin = (now.getTime() - startedMs) / (60 * 1000);

  // Check for user cancel
  try {
    const cancelRow = await env.DB.prepare(
      `SELECT value FROM project_memory WHERE project_id = 'inneranimalmedia' AND key = 'OVERNIGHT_USER_ACTION'`
    ).first();
    if (cancelRow && cancelRow.value) {
      const v = JSON.parse(cancelRow.value);
      if (v && v.cancel === true) {
        await env.DB.prepare(
          `INSERT OR REPLACE INTO project_memory (project_id, tenant_id, memory_type, key, value, importance_score, confidence_score, created_by) VALUES ('inneranimalmedia', 'tenant_sam_primeaux', 'workflow', 'OVERNIGHT_STATUS', ?, 1.0, 1.0, 'agent_sam')`
        ).bind(JSON.stringify({ status: 'CANCELLED', at: nowIso })).run().catch(() => {});
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'sam@inneranimalmedia.com',
            to: 'meauxbility@gmail.com',
            subject: '🛑 Overnight Pipeline Cancelled',
            html: `<div style="font-family:monospace;background:#0f172a;color:#e2e8f0;padding:32px"><h1 style="color:#f59e0b">Pipeline cancelled by user</h1><p>${nowIso}</p></div>`,
          }),
        }).catch(() => {});
        return;
      }
    }
  } catch (_) {}

  const beforeDir = status.before_dir || `before-${now.toISOString().slice(0, 10)}`;
  const phase = status.phase || 0;
  const last30 = status.last_30min_at ? new Date(status.last_30min_at).getTime() : 0;
  const lastHour = status.last_hour_at ? new Date(status.last_hour_at).getTime() : last30 || startedMs;
  const hourNum = status.hour_number || 0;

  // Phase 0: send 30min update after 30 min
  if (phase === 0 && elapsedMin >= 30) {
    const attachments = await loadScreenshotAttachments(env, beforeDir);
    const html = `<div style="font-family:monospace;background:#0f172a;color:#e2e8f0;padding:32px;max-width:680px;margin:0 auto">
      <h1 style="color:#38bdf8">time 30min progress</h1>
      <p style="color:#64748b">${now.toLocaleString('en-US', { timeZone: 'America/Chicago', timeStyle: 'short' })}</p>
      <p style="color:#cbd5e1">Before screenshots (${attachments.length} attached). Patch/theme checks and hourly updates follow.</p>
    </div>`;
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'sam@inneranimalmedia.com', to: 'meauxbility@gmail.com', subject: 'time Overnight 30min update -- Inner Animal Media', html, attachments: attachments.length ? attachments : undefined }),
    }).catch(() => {});
    await env.DB.prepare(
      `INSERT OR REPLACE INTO project_memory (project_id, tenant_id, memory_type, key, value, importance_score, confidence_score, created_by) VALUES ('inneranimalmedia', 'tenant_sam_primeaux', 'workflow', 'OVERNIGHT_STATUS', ?, 1.0, 1.0, 'agent_sam')`
    ).bind(JSON.stringify({ ...status, phase: 1, last_30min_at: nowIso, last_hour_at: nowIso, hour_number: 1 })).run().catch(() => {});
    return;
  }

  // Phase >= 1: send hour N update every 60 min (cron runs every 30 so we check elapsed)
  if (phase >= 1 && (now.getTime() - lastHour) >= 60 * 60 * 1000) {
    const nextHour = hourNum + 1;
    if (nextHour > 5) {
      const attachments = await loadScreenshotAttachments(env, beforeDir);
      const html = `<div style="font-family:monospace;background:#0f172a;color:#e2e8f0;padding:32px;max-width:680px;margin:0 auto">
        <h1 style="color:#38bdf8">dawn Morning report</h1>
        <p style="color:#64748b">${now.toLocaleString('en-US', { timeZone: 'America/Chicago', dateStyle: 'full', timeStyle: 'short' })}</p>
        <p style="color:#22c55e">Pipeline complete. Before screenshots (${attachments.length} attached) in R2 reports/screenshots/${beforeDir}/</p>
      </div>`;
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: 'sam@inneranimalmedia.com', to: 'meauxbility@gmail.com', subject: 'dawn Overnight morning report -- Inner Animal Media', html, attachments: attachments.length ? attachments : undefined }),
      }).catch(() => {});
      await env.DB.prepare(
        `INSERT OR REPLACE INTO project_memory (project_id, tenant_id, memory_type, key, value, importance_score, confidence_score, created_by) VALUES ('inneranimalmedia', 'tenant_sam_primeaux', 'workflow', 'OVERNIGHT_STATUS', ?, 1.0, 1.0, 'agent_sam')`
      ).bind(JSON.stringify({ status: 'COMPLETE', completed: nowIso })).run().catch(() => {});
      return;
    }
    const attachments = await loadScreenshotAttachments(env, beforeDir);
    const html = `<div style="font-family:monospace;background:#0f172a;color:#e2e8f0;padding:32px;max-width:680px;margin:0 auto">
      <h1 style="color:#38bdf8">alert Hour ${nextHour} update</h1>
      <p style="color:#64748b">${now.toLocaleString('en-US', { timeZone: 'America/Chicago', timeStyle: 'short' })}</p>
      <p style="color:#cbd5e1">Progress update. Screenshots (${attachments.length} attached).</p>
    </div>`;
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'sam@inneranimalmedia.com', to: 'meauxbility@gmail.com', subject: `alert Overnight Hour ${nextHour} -- Inner Animal Media`, html, attachments: attachments.length ? attachments : undefined }),
    }).catch(() => {});
    await env.DB.prepare(
      `INSERT OR REPLACE INTO project_memory (project_id, tenant_id, memory_type, key, value, importance_score, confidence_score, created_by) VALUES ('inneranimalmedia', 'tenant_sam_primeaux', 'workflow', 'OVERNIGHT_STATUS', ?, 1.0, 1.0, 'agent_sam')`
    ).bind(JSON.stringify({ ...status, last_hour_at: nowIso, hour_number: nextHour })).run().catch(() => {});
  }
}

async function handleGoogleOAuthStart(request, url, env) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_OAUTH_CLIENT_SECRET || !env.SESSION_CACHE) {
    return new Response(JSON.stringify({ error: 'OAuth not configured' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  }
  const returnTo = url.searchParams.get('return_to') || '';
  const connectDrive = url.searchParams.get('connect') === 'drive' || (returnTo && returnTo.includes('agent'));
  const safeReturn = (returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//') && !returnTo.includes(':')) ? returnTo : '/dashboard/overview';
  const state = crypto.randomUUID();
  const redirectUri = `${origin(url)}/auth/callback/google`;
  const scope = connectDrive
    ? 'openid email profile https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file'
    : 'openid email profile';
  const statePayload = JSON.stringify({
    redirectUri: redirectUri,
    returnTo: safeReturn,
    connectDrive: !!connectDrive
  });
  await env.SESSION_CACHE.put(`oauth_state_${state}`, statePayload, { expirationTtl: 600 });
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope,
    state,
    access_type: 'offline',
    prompt: connectDrive ? 'consent' : 'select_account',
  });
  return Response.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`, 302);
}

async function handleGoogleOAuthCallback(request, url, env) {
  const { searchParams } = url;
  const state = searchParams.get('state');
  const code = searchParams.get('code');
  if (!state || !code || !env.SESSION_CACHE || !env.DB) {
    return Response.redirect(`${origin(url)}/auth/signin?error=missing`, 302);
  }
  const cachedRedirect = await env.SESSION_CACHE.get(`oauth_state_${state}`);
  await env.SESSION_CACHE.delete(`oauth_state_${state}`);
  if (!cachedRedirect) {
    return Response.redirect(`${origin(url)}/auth/signin?error=invalid_state`, 302);
  }
  let redirectUri = cachedRedirect;
  let returnTo = `${origin(url)}/dashboard/overview`;
  let connectDrive = false;
  try {
    const parsed = JSON.parse(cachedRedirect);
    if (parsed.redirectUri) redirectUri = parsed.redirectUri;
    if (parsed.returnTo && parsed.returnTo.startsWith('/')) returnTo = `${origin(url)}${parsed.returnTo}`;
    if (parsed.connectDrive) connectDrive = true;
  } catch (_) {
    returnTo = `${origin(url)}/dashboard/overview`;
  }
  // Use the exact redirect_uri from the start request (avoids www vs non-www mismatch)
  if (!env.GOOGLE_OAUTH_CLIENT_SECRET || !env.GOOGLE_CLIENT_ID) {
    return Response.redirect(`${origin(url)}/auth/signin?error=token_failed&reason=invalid_client&hint=secret_or_id_not_configured`, 302);
  }
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  if (!tokenRes.ok) {
    const errBody = await tokenRes.text();
    let reason = 'unknown';
    try {
      const errJson = JSON.parse(errBody);
      const code = (errJson.error || '').toString().toLowerCase();
      const allowed = ['invalid_grant', 'invalid_client', 'invalid_request', 'unauthorized_client', 'unsupported_grant_type', 'invalid_scope'];
      if (allowed.includes(code)) reason = code;
    } catch (_) {}
    return Response.redirect(`${origin(url)}/auth/signin?error=token_failed&reason=${encodeURIComponent(reason)}`, 302);
  }
  const tokens = await tokenRes.json();
  const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!userRes.ok) {
    return Response.redirect(`${origin(url)}/auth/signin?error=userinfo_failed`, 302);
  }
  const userInfo = await userRes.json();
  const email = (userInfo.email || '').toLowerCase();
  const name = userInfo.name || email || 'User';
  if (!email) {
    return Response.redirect(`${origin(url)}/auth/signin?error=no_email`, 302);
  }
  const userId = email;

  if (connectDrive) {
    const sessionUser = await getAuthUser(request, env);
    if (!sessionUser) {
      return Response.redirect(`${origin(url)}/auth/signin?error=session_required`, 302);
    }
    const driveUserId = sessionUser.email || sessionUser.id;
    await env.DB.prepare(
      `INSERT OR REPLACE INTO user_oauth_tokens (user_id, provider, account_identifier, access_token, refresh_token, expires_at, scope) VALUES (?, 'google_drive', '', ?, ?, ?, ?)`
    ).bind(driveUserId, tokens.access_token, tokens.refresh_token ?? null, tokens.expires_in ? Math.floor(Date.now()/1000) + tokens.expires_in : null, tokens.scope ?? null).run();
    return new Response(
      `<script>window.opener?.postMessage({type:'oauth_success',provider:'google'},window.location.origin);window.close();</script>`,
      { headers: { 'Content-Type': 'text/html' } }
    );
  }
  // login flow continues unchanged below
  const oauthPlaceholder = 'oauth';
  try {
    await env.DB.prepare(
      `INSERT INTO auth_users (id, email, name, password_hash, salt, created_at, updated_at) VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    ).bind(userId, email, name, oauthPlaceholder, oauthPlaceholder).run();
  } catch (e) {
    await env.DB.prepare(`UPDATE auth_users SET name = ?, updated_at = datetime('now') WHERE id = ?`).bind(name, userId).run();
  }
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const ip = request.headers.get('cf-connecting-ip') || '';
  const ua = request.headers.get('user-agent') || '';
  await env.DB.prepare(
    `INSERT INTO auth_sessions (id, user_id, expires_at, created_at, ip_address, user_agent) VALUES (?, ?, ?, datetime('now'), ?, ?)`
  ).bind(sessionId, userId, expiresAt, ip, ua).run();
  const headers = new Headers({ Location: returnTo });
  const domain = url.hostname === 'www.inneranimalmedia.com' ? 'inneranimalmedia.com' : url.hostname;
  headers.append('Set-Cookie', `session=${sessionId}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000; Domain=${domain}`);
  return new Response(null, { status: 302, headers });
}

async function handleGitHubOAuthStart(request, url, env) {
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET || !env.SESSION_CACHE) {
    return new Response(JSON.stringify({ error: 'OAuth not configured' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  }
  const returnTo = url.searchParams.get('return_to') || '';
  const safeReturn = (returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//') && !returnTo.includes(':')) ? returnTo : '/dashboard/overview';
  const state = crypto.randomUUID();
  const redirectUri = `${origin(url)}/api/oauth/github/callback`;
  const statePayload = JSON.stringify({
    redirectUri: redirectUri,
    returnTo: safeReturn,
    connectGitHub: safeReturn === '/dashboard/agent' || returnTo === '/dashboard/agent'
  });
  await env.SESSION_CACHE.put(`oauth_state_github_${state}`, statePayload, { expirationTtl: 600 });
  const params = new URLSearchParams({
    client_id: env.GITHUB_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: 'repo user:email read:user',
    state,
  });
  return Response.redirect(`https://github.com/login/oauth/authorize?${params}`, 302);
}

async function handleGitHubOAuthCallback(request, url, env) {
  const { searchParams } = url;
  const state = searchParams.get('state');
  const code = searchParams.get('code');
  if (!state || !code || !env.SESSION_CACHE || !env.DB) {
    return Response.redirect(`${origin(url)}/auth/signin?error=missing`, 302);
  }
  const cachedRedirect = await env.SESSION_CACHE.get(`oauth_state_github_${state}`);
  await env.SESSION_CACHE.delete(`oauth_state_github_${state}`);
  if (!cachedRedirect) {
    return Response.redirect(`${origin(url)}/auth/signin?error=invalid_state`, 302);
  }
  let redirectUri = cachedRedirect;
  let returnTo = `${origin(url)}/dashboard/overview`;
  let connectGitHub = false;
  try {
    const parsed = JSON.parse(cachedRedirect);
    if (parsed.redirectUri) redirectUri = parsed.redirectUri;
    if (parsed.returnTo && parsed.returnTo.startsWith('/')) returnTo = `${origin(url)}${parsed.returnTo}`;
    if (parsed.connectGitHub) connectGitHub = true;
  } catch (_) {}
  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
    }),
  });
  if (!tokenRes.ok) {
    return Response.redirect(`${origin(url)}/auth/signin?error=token_failed`, 302);
  }
  const tokens = await tokenRes.json();
  if (tokens.error) {
    return Response.redirect(`${origin(url)}/auth/signin?error=token_failed`, 302);
  }
  const userRes = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
      'User-Agent': 'InnerAnimalMedia-Dashboard/1.0',
    },
  });
  if (!userRes.ok) {
    return Response.redirect(`${origin(url)}/auth/signin?error=userinfo_failed`, 302);
  }
  const userInfo = await userRes.json();
  let email = userInfo.email;
  if (!email && userInfo.login) {
    const emailRes = await fetch('https://api.github.com/user/emails', {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        'User-Agent': 'InnerAnimalMedia-Dashboard/1.0',
      },
    });
    if (emailRes.ok) {
      const emails = await emailRes.json();
      const primary = emails.find((e) => e.primary) || emails[0];
      email = primary?.email;
    }
  }
  email = (email || userInfo.login || 'unknown').toLowerCase();
  const name = userInfo.name || userInfo.login || email;
  const userId = email;

  if (connectGitHub) {
    const sessionUser = await getAuthUser(request, env);
    if (!sessionUser) {
      return Response.redirect(`${url.origin}/auth/signin?error=session_required`, 302);
    }
    const ghUserId = sessionUser.email || sessionUser.id;
    const ghLogin = (userInfo.login || '').toString() || 'github';
    if (tokens.access_token && env.DB) {
      try {
        const expiresAtTs = tokens.expires_in ? Math.floor(Date.now() / 1000) + Number(tokens.expires_in) : null;
        await env.DB.prepare(
          `INSERT OR REPLACE INTO user_oauth_tokens (user_id, provider, account_identifier, access_token, refresh_token, expires_at, scope)
           VALUES (?, 'github', ?, ?, ?, ?, ?)`
        ).bind(ghUserId, ghLogin, tokens.access_token || '', tokens.refresh_token || null, expiresAtTs, (tokens.scope || '').toString()).run();
      } catch (e) {
        console.error('[oauth/github/callback] user_oauth_tokens upsert failed:', e?.message ?? e);
      }
    }
    return new Response(
      `<script>window.opener?.postMessage({type:'oauth_success',provider:'github'},window.location.origin);window.close();</script>`,
      { headers: { 'Content-Type': 'text/html' } }
    );
  }

  const oauthPlaceholder = 'oauth';
  try {
    await env.DB.prepare(
      `INSERT INTO auth_users (id, email, name, password_hash, salt, created_at, updated_at) VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    ).bind(userId, email, name, oauthPlaceholder, oauthPlaceholder).run();
  } catch (e) {
    await env.DB.prepare(`UPDATE auth_users SET name = ?, updated_at = datetime('now') WHERE id = ?`).bind(name, userId).run();
  }
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const ip = request.headers.get('cf-connecting-ip') || '';
  const ua = request.headers.get('user-agent') || '';
  await env.DB.prepare(
    `INSERT INTO auth_sessions (id, user_id, expires_at, created_at, ip_address, user_agent) VALUES (?, ?, ?, datetime('now'), ?, ?)`
  ).bind(sessionId, userId, expiresAt, ip, ua).run();
  const ghLogin = (userInfo.login || '').toString() || 'github';
  if (tokens.access_token && env.DB) {
    try {
      const expiresAtTs = tokens.expires_in ? Math.floor(Date.now() / 1000) + Number(tokens.expires_in) : null;
      await env.DB.prepare(
        `INSERT OR REPLACE INTO user_oauth_tokens (user_id, provider, account_identifier, access_token, refresh_token, expires_at, scope)
         VALUES (?, 'github', ?, ?, ?, ?, ?)`
      ).bind(userId, ghLogin, tokens.access_token || '', tokens.refresh_token || null, expiresAtTs, (tokens.scope || '').toString()).run();
    } catch (e) {
      console.error('[oauth/github/callback] user_oauth_tokens upsert failed:', e?.message ?? e);
    }
  }
  const loginHeaders = new Headers({ Location: returnTo });
  const d = url.hostname === 'www.inneranimalmedia.com' ? 'inneranimalmedia.com' : url.hostname;
  loginHeaders.append('Set-Cookie', `session=${sessionId}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000; Domain=${d}`);
  return new Response(null, { status: 302, headers: loginHeaders });
}

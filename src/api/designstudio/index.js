/**
 * DesignStudio API — modular entry (worker + src/index).
 * SSE live stream is owned by AGENT_SESSION DO; this module only proxies GET .../events.
 */
import {
  getAuthUser,
  jsonResponse,
  fetchAuthUserTenantId,
} from '../../core/auth.js';
import { syncRunToSupabase, buildCadCreationsPrefix } from './sync.js';

const WORKFLOW_RUNS = 'agentsam_workflow_runs';
const BLUEPRINTS = 'designstudio_design_blueprints';
const DEFAULT_WS = 'ws_designstudio';

function internalSecretOk(request, env) {
  const secret = env?.INTERNAL_API_SECRET;
  if (!secret || !String(secret).trim()) return false;
  const authHeader = request.headers.get('Authorization') || request.headers.get('X-Internal-Secret') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();
  return token === String(secret).trim();
}

async function resolveTenantId(env, authUser) {
  if (authUser.tenant_id != null && String(authUser.tenant_id).trim() !== '') {
    return String(authUser.tenant_id).trim();
  }
  let tid = await fetchAuthUserTenantId(env, authUser.id);
  if (tid) return tid;
  if (authUser.email) {
    tid = await fetchAuthUserTenantId(env, authUser.email);
    if (tid) return tid;
  }
  return 'tenant_inneranimalmedia';
}

function supabaseRestBase(env) {
  const raw = env?.SUPABASE_URL;
  if (!raw || !String(raw).trim()) throw new Error('SUPABASE_URL is not configured');
  return String(raw).replace(/\/$/, '');
}

function supabasePublicHeaders(env, extra = {}) {
  const key = env?.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || !String(key).trim()) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');
  const k = String(key).trim();
  return {
    apikey: k,
    Authorization: `Bearer ${k}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
    ...extra,
  };
}

async function sha256hex(message) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(message));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmacBytes(key, message) {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    typeof key === 'string' ? new TextEncoder().encode(key) : key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
  return new Uint8Array(sig);
}

async function hmacHex(key, message) {
  const bytes = await hmacBytes(key, message);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function getSigningKey(secret, date, region, service) {
  const kDate = await hmacBytes('AWS4' + secret, date);
  const kRegion = await hmacBytes(kDate, region);
  const kService = await hmacBytes(kRegion, service);
  return hmacBytes(kService, 'aws4_request');
}

function getR2S3Host(env) {
  if (!env.CLOUDFLARE_ACCOUNT_ID) return null;
  return `${env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`;
}

async function presignR2GetObjectUrl(env, bucket, key, expiresSeconds = 3600) {
  const accessKey = env.R2_ACCESS_KEY_ID;
  const secretKey = env.R2_SECRET_ACCESS_KEY;
  const host = getR2S3Host(env);
  if (!accessKey || !secretKey || !host) return null;

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z';
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
  const encodedKey = String(key)
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');

  const params = new URLSearchParams({
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${accessKey}/${credentialScope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expiresSeconds),
    'X-Amz-SignedHeaders': 'host',
  });

  const sortedPairs = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
  const canonicalQueryString = sortedPairs.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  const canonicalRequest = [
    'GET',
    `/${bucket}/${encodedKey}`,
    canonicalQueryString,
    `host:${host}\n`,
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n');
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, await sha256hex(canonicalRequest)].join('\n');
  const signingKey = await getSigningKey(secretKey, dateStamp, 'auto', 's3');
  const signature = await hmacHex(signingKey, stringToSign);

  return `https://${host}/${bucket}/${encodedKey}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
}

function assetSuffix(assetType) {
  const t = String(assetType || '').toLowerCase();
  if (t === 'glb') return 'model.glb';
  if (t === 'stl') return 'model.stl';
  if (t === 'scad') return 'model.scad';
  if (t === 'preview' || t === 'png') return 'preview.png';
  return 'model.glb';
}

/**
 * @param {Request} request
 * @param {URL} url
 * @param {any} env
 * @param {any} _ctx
 */
export async function handleDesignStudioApi(request, url, env, _ctx) {
  const pathLower = url.pathname.toLowerCase().replace(/\/$/, '') || '/';
  const method = (request.method || 'GET').toUpperCase();

  try {
    const eventsMatch = pathLower.match(/^\/api\/designstudio\/runs\/([^/]+)\/events$/);
    if (eventsMatch && method === 'GET') {
      const authUser = await getAuthUser(request, env);
      if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
      if (!env.DB) return jsonResponse({ error: 'Database not configured' }, 503);
      const runId = eventsMatch[1];
      const tenantId = await resolveTenantId(env, authUser);
      const run = await env.DB.prepare(
        `SELECT id, tenant_id, session_id FROM ${WORKFLOW_RUNS} WHERE id = ? LIMIT 1`,
      )
        .bind(runId)
        .first();
      if (!run || String(run.tenant_id) !== String(tenantId)) {
        return jsonResponse({ error: 'Not found' }, 404);
      }
      let sessionId = (url.searchParams.get('session_id') || '').trim();
      if (!sessionId && run.session_id) sessionId = String(run.session_id).trim();
      if (!sessionId) {
        return jsonResponse({ error: 'session_id required for event stream' }, 400);
      }
      if (!env.AGENT_SESSION) return jsonResponse({ error: 'AGENT_SESSION not configured' }, 503);
      const stub = env.AGENT_SESSION.get(env.AGENT_SESSION.idFromName(sessionId));
      const doUrl = new URL('https://internal/designstudio/events');
      doUrl.searchParams.set('run_id', runId);
      const lastId = url.searchParams.get('last_id');
      if (lastId) doUrl.searchParams.set('last_id', lastId);
      return stub.fetch(new Request(doUrl.toString(), { headers: request.headers }));
    }

    if (pathLower === '/api/designstudio/blueprints' && method === 'GET') {
      const authUser = await getAuthUser(request, env);
      if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
      if (!env.DB) return jsonResponse({ error: 'Database not configured' }, 503);
      const tenantId = await resolveTenantId(env, authUser);
      const { results } = await env.DB.prepare(
        `SELECT * FROM ${BLUEPRINTS} WHERE tenant_id = ? ORDER BY updated_at DESC LIMIT 100`,
      )
        .bind(tenantId)
        .all();
      return jsonResponse({ blueprints: results || [] }, 200);
    }

    if (pathLower === '/api/designstudio/blueprints' && method === 'POST') {
      const authUser = await getAuthUser(request, env);
      if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
      if (!env.DB) return jsonResponse({ error: 'Database not configured' }, 503);
      const tenantId = await resolveTenantId(env, authUser);
      let body = {};
      try {
        body = await request.json();
      } catch (_) {
        return jsonResponse({ error: 'Invalid JSON' }, 400);
      }
      const title = String(body.title || '').trim();
      if (!title) return jsonResponse({ error: 'title required' }, 400);
      const intentJson =
        typeof body.intent_json === 'object' && body.intent_json !== null
          ? JSON.stringify(body.intent_json)
          : typeof body.intent_json === 'string'
            ? body.intent_json
            : '{}';
      const blueprintId = `dsb_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
      await env.DB.prepare(
        `INSERT INTO ${BLUEPRINTS} (id, title, description, original_prompt, intent_json, tenant_id, workspace_id, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'draft')`,
      )
        .bind(
          blueprintId,
          title,
          body.description != null ? String(body.description) : null,
          body.original_prompt != null ? String(body.original_prompt) : null,
          intentJson,
          tenantId,
          body.workspace_id != null ? String(body.workspace_id) : DEFAULT_WS,
        )
        .run();
      const created = await env.DB.prepare(`SELECT * FROM ${BLUEPRINTS} WHERE id = ?`).bind(blueprintId).first();
      return jsonResponse({ blueprint: created }, 201);
    }

    const bpOneMatch = pathLower.match(/^\/api\/designstudio\/blueprints\/([^/]+)$/);
    if (bpOneMatch && method === 'GET') {
      const authUser = await getAuthUser(request, env);
      if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
      if (!env.DB) return jsonResponse({ error: 'Database not configured' }, 503);
      const tenantId = await resolveTenantId(env, authUser);
      const row = await env.DB.prepare(`SELECT * FROM ${BLUEPRINTS} WHERE id = ? AND tenant_id = ?`)
        .bind(bpOneMatch[1], tenantId)
        .first();
      if (!row) return jsonResponse({ error: 'Not found' }, 404);
      return jsonResponse({ blueprint: row }, 200);
    }

    if (bpOneMatch && method === 'PATCH') {
      const authUser = await getAuthUser(request, env);
      if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
      if (!env.DB) return jsonResponse({ error: 'Database not configured' }, 503);
      const tenantId = await resolveTenantId(env, authUser);
      let body = {};
      try {
        body = await request.json();
      } catch (_) {
        return jsonResponse({ error: 'Invalid JSON' }, 400);
      }
      const existing = await env.DB.prepare(`SELECT id FROM ${BLUEPRINTS} WHERE id = ? AND tenant_id = ?`)
        .bind(bpOneMatch[1], tenantId)
        .first();
      if (!existing) return jsonResponse({ error: 'Not found' }, 404);
      const sets = [];
      const vals = [];
      const push = (col, v) => {
        sets.push(`${col} = ?`);
        vals.push(v);
      };
      if (body.title != null) push('title', String(body.title));
      if (body.description !== undefined) push('description', body.description != null ? String(body.description) : null);
      if (body.original_prompt !== undefined) push('original_prompt', body.original_prompt != null ? String(body.original_prompt) : null);
      if (body.intent_json !== undefined) {
        push(
          'intent_json',
          typeof body.intent_json === 'object' ? JSON.stringify(body.intent_json) : String(body.intent_json || '{}'),
        );
      }
      if (body.sketch_json !== undefined) {
        push(
          'sketch_json',
          typeof body.sketch_json === 'object' ? JSON.stringify(body.sketch_json) : String(body.sketch_json || '{}'),
        );
      }
      if (body.cad_script !== undefined) push('cad_script', body.cad_script != null ? String(body.cad_script) : null);
      if (body.status != null) push('status', String(body.status));
      if (!sets.length) return jsonResponse({ error: 'No fields to update' }, 400);
      sets.push(`updated_at = datetime('now')`);
      vals.push(bpOneMatch[1], tenantId);
      await env.DB.prepare(`UPDATE ${BLUEPRINTS} SET ${sets.join(', ')} WHERE id = ? AND tenant_id = ?`).bind(...vals).run();
      const row = await env.DB.prepare(`SELECT * FROM ${BLUEPRINTS} WHERE id = ?`).bind(bpOneMatch[1]).first();
      return jsonResponse({ blueprint: row }, 200);
    }

    if (pathLower === '/api/designstudio/runs' && method === 'GET') {
      const authUser = await getAuthUser(request, env);
      if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
      if (!env.DB) return jsonResponse({ error: 'Database not configured' }, 503);
      const tenantId = await resolveTenantId(env, authUser);
      const { results } = await env.DB.prepare(
        `SELECT id, workflow_id, session_id, tenant_id, status, workflow_key, display_name, started_at, completed_at, duration_ms, cost_usd, step_results_json
         FROM ${WORKFLOW_RUNS} WHERE tenant_id = ? ORDER BY started_at DESC LIMIT 50`,
      )
        .bind(tenantId)
        .all();
      return jsonResponse({ runs: results || [] }, 200);
    }

    if (pathLower === '/api/designstudio/runs' && method === 'POST') {
      const authUser = await getAuthUser(request, env);
      if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
      if (!env.DB) return jsonResponse({ error: 'Database not configured' }, 503);
      const tenantId = await resolveTenantId(env, authUser);
      let body = {};
      try {
        body = await request.json();
      } catch (_) {
        return jsonResponse({ error: 'Invalid JSON' }, 400);
      }
      const workflowId = String(body.workflow_id || '').trim();
      if (!workflowId) return jsonResponse({ error: 'workflow_id required' }, 400);
      const sessionId = body.session_id != null ? String(body.session_id).trim() : null;
      const wfKey = String(body.workflow_key || 'designstudio_manual').trim();
      const displayName = String(body.display_name || 'DesignStudio run').trim();
      const runId = `wfr_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
      await env.DB.prepare(
        `INSERT INTO ${WORKFLOW_RUNS} (id, workflow_id, session_id, tenant_id, status, triggered_by, started_at, cost_usd, created_at, workflow_key, display_name)
         VALUES (?, ?, ?, ?, 'pending', 'designstudio_api', unixepoch(), 0, unixepoch(), ?, ?)`,
      )
        .bind(runId, workflowId, sessionId, tenantId, wfKey, displayName)
        .run();
      const row = await env.DB.prepare(`SELECT * FROM ${WORKFLOW_RUNS} WHERE id = ?`).bind(runId).first();
      return jsonResponse({ run: row }, 202);
    }

    const runOneMatch = pathLower.match(/^\/api\/designstudio\/runs\/([^/]+)$/);
    if (runOneMatch && method === 'GET') {
      const authUser = await getAuthUser(request, env);
      if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
      if (!env.DB) return jsonResponse({ error: 'Database not configured' }, 503);
      const tenantId = await resolveTenantId(env, authUser);
      const row = await env.DB.prepare(`SELECT * FROM ${WORKFLOW_RUNS} WHERE id = ? AND tenant_id = ?`)
        .bind(runOneMatch[1], tenantId)
        .first();
      if (!row) return jsonResponse({ error: 'Not found' }, 404);
      return jsonResponse({ run: row }, 200);
    }

    const presignMatch = pathLower.match(/^\/api\/designstudio\/assets\/([^/]+)\/presign\/([^/]+)$/);
    if (presignMatch && method === 'GET') {
      const authUser = await getAuthUser(request, env);
      if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
      if (!env.DB) return jsonResponse({ error: 'Database not configured' }, 503);
      const tenantId = await resolveTenantId(env, authUser);
      const runId = presignMatch[1];
      const assetType = presignMatch[2];
      const run = await env.DB.prepare(`SELECT id, tenant_id, session_id FROM ${WORKFLOW_RUNS} WHERE id = ? AND tenant_id = ?`)
        .bind(runId, tenantId)
        .first();
      if (!run) return jsonResponse({ error: 'Not found' }, 404);
      const ws = (url.searchParams.get('workspace_id') || '').trim() || DEFAULT_WS;
      const prefix = buildCadCreationsPrefix(tenantId, ws, runId);
      const suffix = assetSuffix(assetType);
      const key = `${prefix}${suffix}`;
      const bucket = (url.searchParams.get('bucket') || '').trim() || 'autorag';
      const signed = await presignR2GetObjectUrl(env, bucket, key, 3600);
      if (!signed) {
        return jsonResponse({ error: 'presign_unavailable', r2_key: key, bucket }, 503);
      }
      return jsonResponse({ url: signed, r2_key: key, bucket }, 200);
    }

    const assetsMatch = pathLower.match(/^\/api\/designstudio\/assets\/([^/]+)$/);
    if (assetsMatch && method === 'GET') {
      const authUser = await getAuthUser(request, env);
      if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
      if (!env.DB) return jsonResponse({ error: 'Database not configured' }, 503);
      const tenantId = await resolveTenantId(env, authUser);
      const runId = assetsMatch[1];
      const run = await env.DB.prepare(`SELECT id, tenant_id FROM ${WORKFLOW_RUNS} WHERE id = ? AND tenant_id = ?`)
        .bind(runId, tenantId)
        .first();
      if (!run) return jsonResponse({ error: 'Not found' }, 404);
      try {
        const base = supabaseRestBase(env);
        const res = await fetch(
          `${base}/rest/v1/designstudio_asset_metrics?workflow_run_id=eq.${encodeURIComponent(runId)}&select=*`,
          { headers: supabasePublicHeaders(env) },
        );
        const text = await res.text();
        const rows = text ? JSON.parse(text) : [];
        const ws = (url.searchParams.get('workspace_id') || '').trim() || DEFAULT_WS;
        const prefix = buildCadCreationsPrefix(tenantId, ws, runId);
        return jsonResponse({ workflow_run_id: runId, r2_prefix: prefix, assets: Array.isArray(rows) ? rows : [] }, 200);
      } catch (e) {
        const ws = (url.searchParams.get('workspace_id') || '').trim() || DEFAULT_WS;
        const prefix = buildCadCreationsPrefix(tenantId, ws, runId);
        return jsonResponse(
          { workflow_run_id: runId, r2_prefix: prefix, assets: [], supabase_error: String(e?.message || e) },
          200,
        );
      }
    }

    if (pathLower === '/api/internal/designstudio/sync-run' && method === 'POST') {
      if (!internalSecretOk(request, env)) {
        return jsonResponse({ error: 'Unauthorized' }, 401);
      }
      if (!env.DB) return jsonResponse({ error: 'Database not configured' }, 503);

      let body = {};
      try {
        const raw = await request.text();
        if (raw) body = JSON.parse(raw);
      } catch (_) {
        return jsonResponse({ error: 'Invalid JSON body' }, 400);
      }

      const runId = String(body.run_id || body.workflow_run_id || '').trim();
      if (!runId) return jsonResponse({ error: 'run_id required' }, 400);

      const assets = Array.isArray(body.assets) ? body.assets : [];
      const r2Prefix = body.r2_prefix != null ? String(body.r2_prefix).trim() : null;
      const sessionId = body.session_id != null ? String(body.session_id).trim() : null;
      const workspaceId = body.workspace_id != null ? String(body.workspace_id).trim() : undefined;
      const skipKeyCheck = body.skip_designstudio_key_check === true;

      const result = await syncRunToSupabase(env, runId, {
        sessionId: sessionId || null,
        r2Prefix: r2Prefix || null,
        assets,
        workspaceId,
        skipDesignStudioKeyCheck: skipKeyCheck,
      });

      return jsonResponse({ ok: true, ...result }, 200);
    }

    return jsonResponse({ error: 'DesignStudio route not found' }, 404);
  } catch (e) {
    const msg = String(e?.message || e);
    console.warn('[handleDesignStudioApi]', msg);
    return jsonResponse({ error: msg }, 500);
  }
}

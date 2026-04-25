/**
 * Storage dashboard API — tenant-scoped via session (getAuthUser).
 * R2 bindings, analytics, Vectorize / AutoRAG, S3-compatible config, D1 preferences & access-key registry.
 */
import {
  getAuthUser,
  jsonResponse,
  fetchAuthUserTenantId,
} from '../core/auth.js';
import { getR2Binding, listBoundR2BucketNames, r2LiveBucketStats } from './r2-api.js';

/** Resolve tenant for row scoping (prefs, keys). */
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
  return `user:${String(authUser.id || authUser.email || 'unknown').trim()}`;
}

function r2S3PublicEndpoint(env) {
  const id = env.CLOUDFLARE_ACCOUNT_ID;
  if (!id || String(id).trim() === '') return '';
  return `https://${String(id).trim()}.r2.cloudflarestorage.com`;
}

/** Dedupe stats when multiple logical names map to the same R2 binding (e.g. agent-sam + tools → DASHBOARD). */
function bindingIdentity(env, logicalName) {
  const b = getR2Binding(env, logicalName);
  if (b === env.ASSETS) return 'ASSETS';
  if (b === env.AUTORAG_BUCKET) return 'AUTORAG_BUCKET';
  if (b === env.DASHBOARD) return 'DASHBOARD';
  if (b === env.R2) return 'R2';
  if (b === env.DOCS_BUCKET) return 'DOCS_BUCKET';
  return logicalName;
}

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
}

function randomSecret(len = 40) {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < len; i++) s += alphabet[bytes[i] % alphabet.length];
  return s;
}

async function listAccessKeysForTenant(env, tenantId, userId) {
  if (!env.DB) return [];
  try {
    const { results } = await env.DB.prepare(
      `SELECT access_key_id, created_at, status FROM user_storage_access_keys
       WHERE tenant_id = ? AND user_id = ?
       ORDER BY created_at DESC`
    )
      .bind(tenantId, userId)
      .all();
    return (results || []).map((r) => ({
      accessKeyId: r.access_key_id,
      id: r.access_key_id,
      created_at: r.created_at,
      createdAt: r.created_at,
      status: r.status ?? 'active',
    }));
  } catch (e) {
    console.warn('[storage] listAccessKeysForTenant', e?.message ?? e);
    return [];
  }
}

/**
 * Main router for /api/storage/*
 */
export async function handleStorageApi(request, url, env) {
  const path = url.pathname.replace(/\/$/, '') || '/';
  const pathLower = path.toLowerCase();
  const method = (request.method || 'GET').toUpperCase();

  const authUser = await getAuthUser(request, env);
  if (!authUser) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const tenantId = await resolveTenantId(env, authUser);
  const userId = String(authUser.id || authUser.email || '').trim();
  if (!userId) {
    return jsonResponse({ error: 'Invalid session user' }, 401);
  }

  const baseMeta = { tenant_id: tenantId, user_id: userId };

  // ── DELETE /api/storage/policies/:id ────────────────────────────────────
  const policyIdMatch = path.match(/^\/api\/storage\/policies\/([^/]+)$/i);
  if (policyIdMatch && method === 'DELETE') {
    if (!env.DB) return jsonResponse({ error: 'Database not configured', ...baseMeta }, 503);
    const policyId = decodeURIComponent(policyIdMatch[1] || '').trim();
    if (!policyId) return jsonResponse({ error: 'id required' }, 400);
    try {
      const del = await env.DB.prepare(
        `DELETE FROM storage_policies WHERE id = ? AND tenant_id = ? AND user_id = ?`,
      )
        .bind(policyId, tenantId, userId)
        .run();
      if (!(del.meta?.changes ?? 0)) {
        return jsonResponse({ error: 'Not found' }, 404);
      }
      return jsonResponse({ ok: true, ...baseMeta });
    } catch (e) {
      const msg = String(e?.message || e);
      if (msg.includes('no such table')) {
        return jsonResponse(
          {
            error: 'storage_policies table missing',
            hint: 'Apply migrations/234_storage_policies.sql',
            ...baseMeta,
          },
          503,
        );
      }
      return jsonResponse({ error: msg, ...baseMeta }, 500);
    }
  }

  // ── GET / POST /api/storage/policies ─────────────────────────────────────
  if (pathLower === '/api/storage/policies') {
    if (method === 'GET') {
      if (!env.DB) return jsonResponse({ policies: [], ...baseMeta });
      try {
        const { results } = await env.DB.prepare(
          `SELECT * FROM storage_policies
           WHERE tenant_id = ? AND user_id = ?
           ORDER BY created_at DESC`,
        )
          .bind(tenantId, userId)
          .all();
        return jsonResponse({ policies: results || [], ...baseMeta });
      } catch (e) {
        const msg = String(e?.message || e);
        if (msg.includes('no such table')) {
          return jsonResponse(
            {
              policies: [],
              error: 'storage_policies table missing',
              hint: 'Apply migrations/234_storage_policies.sql',
              ...baseMeta,
            },
            503,
          );
        }
        return jsonResponse({ error: msg, ...baseMeta }, 500);
      }
    }

    if (method === 'POST') {
      if (!env.DB) {
        return jsonResponse({ error: 'Database not configured', ...baseMeta }, 503);
      }
      let body = {};
      try {
        body = await request.json();
      } catch {
        body = {};
      }
      const effect = String(body.effect || '').toLowerCase().trim();
      if (effect !== 'allow' && effect !== 'deny') {
        return jsonResponse({ error: 'effect must be allow or deny' }, 400);
      }
      const bucket_name =
        typeof body.bucket_name === 'string' ? body.bucket_name.trim() : '';
      if (!bucket_name) return jsonResponse({ error: 'bucket_name required' }, 400);

      let actionsArr = body.actions;
      if (typeof actionsArr === 'string') {
        try {
          actionsArr = JSON.parse(actionsArr);
        } catch {
          actionsArr = null;
        }
      }
      if (!Array.isArray(actionsArr) || actionsArr.length === 0) {
        return jsonResponse({ error: 'actions must be a non-empty JSON array' }, 400);
      }
      const actionsStr = JSON.stringify(actionsArr);
      const resource =
        typeof body.resource === 'string' && body.resource.trim()
          ? body.resource.trim()
          : '*';
      const id = crypto.randomUUID();
      const now = Math.floor(Date.now() / 1000);
      try {
        await env.DB.prepare(
          `INSERT INTO storage_policies (
            id, tenant_id, user_id, bucket_name, effect, actions, resource, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
          .bind(
            id,
            tenantId,
            userId,
            bucket_name,
            effect,
            actionsStr,
            resource,
            now,
            now,
          )
          .run();
      } catch (e) {
        const msg = String(e?.message || e);
        if (msg.includes('no such table')) {
          return jsonResponse(
            {
              error: 'storage_policies table missing',
              hint: 'Apply migrations/234_storage_policies.sql',
              ...baseMeta,
            },
            503,
          );
        }
        return jsonResponse({ error: msg, ...baseMeta }, 500);
      }
      const policy = await env.DB.prepare(
        `SELECT * FROM storage_policies WHERE id = ? LIMIT 1`,
      )
        .bind(id)
        .first();
      return jsonResponse({ policy, ...baseMeta }, 201);
    }

    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  // ── Buckets (bindings) ─────────────────────────────────────────
  if (pathLower === '/api/storage/buckets' && method === 'GET') {
    const names = listBoundR2BucketNames(env);
    const buckets = names.map((name) => ({
      name,
      binding: bindingIdentity(env, name),
      region: 'auto',
      ...baseMeta,
    }));
    return jsonResponse({ buckets, ...baseMeta });
  }

  // ── Analytics (aggregate R2 list stats) ──────────────────────────
  if (pathLower === '/api/storage/analytics' && method === 'GET') {
    const names = listBoundR2BucketNames(env);
    const seenBind = new Set();
    const by_bucket = [];
    let total_objects = 0;
    let total_bytes = 0;

    for (const name of names) {
      const bid = bindingIdentity(env, name);
      if (seenBind.has(bid)) continue;
      seenBind.add(bid);
      const st = await r2LiveBucketStats(env, name);
      if (!st.ok) {
        by_bucket.push({
          bucket: name,
          binding: bid,
          object_count: 0,
          total_bytes: 0,
          error: st.error || 'unavailable',
        });
        continue;
      }
      total_objects += st.count;
      total_bytes += st.bytes;
      by_bucket.push({
        bucket: name,
        binding: bid,
        object_count: st.count,
        total_bytes: st.bytes,
      });
    }

    return jsonResponse({
      ...baseMeta,
      total_objects,
      total_bytes,
      by_bucket,
      summary: {
        object_count: total_objects,
        size_bytes: total_bytes,
      },
    });
  }

  // ── Vectors + AutoRAG bucket ───────────────────────────────────
  if (pathLower === '/api/storage/vectors' && method === 'GET') {
    let autorag = { object_count: 0, total_bytes: 0, binding: 'AUTORAG_BUCKET' };
    if (env.AUTORAG_BUCKET) {
      const st = await r2LiveBucketStats(env, 'autorag');
      if (st.ok) {
        autorag = {
          ...autorag,
          object_count: st.count,
          total_bytes: st.bytes,
        };
      }
    }

    const vectorizeBinding =
      env.VECTORIZE ||
      env.vectorize ||
      env.Vectors ||
      env.VECTORIZE_INDEX ||
      null;
    const vectorize = {
      binding_configured: !!vectorizeBinding,
      index_name:
        env.VECTORIZE_INDEX_NAME ||
        (typeof env.VECTORIZE_METADATA === 'string' ? env.VECTORIZE_METADATA : null) ||
        'ai-search-inneranimalmedia-autorag',
      note: vectorizeBinding
        ? 'Vectorize index is bound; use Workers AI Vectorize APIs for queries.'
        : 'No Vectorize binding on this Worker (expected env.VECTORIZE from wrangler [[vectorize]]).',
    };

    return jsonResponse({
      ...baseMeta,
      VECTORIZE: vectorize,
      AUTORAG_BUCKET: autorag,
      vectorize,
      autorag_bucket: autorag,
    });
  }

  // ── S3-compatible config + keys (tenant-scoped key list) ───────
  async function s3BundleResponse() {
    const endpoint = r2S3PublicEndpoint(env);
    const region = env.R2_REGION || 'auto';
    const accessKeys = await listAccessKeysForTenant(env, tenantId, userId);
    let hyperdrive =
      'Hyperdrive binding HYPERDRIVE is configured for Postgres/regional acceleration; connection strings are not exposed via this API.';
    if (!env.HYPERDRIVE) {
      hyperdrive = 'No Hyperdrive binding in this Worker.';
    }

    return jsonResponse({
      ...baseMeta,
      endpoint,
      region,
      accessKeys,
      keys: accessKeys,
      hyperdrive,
      hyperdriveInfo: hyperdrive,
    });
  }

  if (
    (pathLower === '/api/storage/s3-config' || pathLower === '/api/storage/s3') &&
    method === 'GET'
  ) {
    return s3BundleResponse();
  }

  // ── Create access key (registry + one-time secret) ─────────────
  if (
    (pathLower === '/api/storage/access-keys' || pathLower === '/api/storage/s3/keys') &&
    method === 'POST'
  ) {
    if (!env.DB) {
      return jsonResponse({ error: 'Database not configured', ...baseMeta }, 503);
    }

    const accessKeyId = `iam_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;
    const secretAccessKey = `sec_${randomSecret(40)}`;
    const secret_hash = await sha256Hex(secretAccessKey);
    const id = crypto.randomUUID();
    const created_at = Math.floor(Date.now() / 1000);

    try {
      await env.DB.prepare(
        `INSERT INTO user_storage_access_keys (id, tenant_id, user_id, access_key_id, secret_hash, status, created_at)
         VALUES (?, ?, ?, ?, ?, 'active', ?)`
      )
        .bind(id, tenantId, userId, accessKeyId, secret_hash, created_at)
        .run();
    } catch (e) {
      console.error('[storage] access-keys insert', e);
      return jsonResponse(
        {
          error: 'Failed to store access key',
          detail: String(e?.message || e),
          hint: 'Apply D1 migration migrations/233_storage_preferences_and_keys.sql',
          ...baseMeta,
        },
        503,
      );
    }

    return jsonResponse({
      ...baseMeta,
      accessKeyId,
      secretAccessKey,
      secret: secretAccessKey,
      rawSecret: secretAccessKey,
      created_at,
      warning: 'Store the secret now; it cannot be retrieved again.',
    });
  }

  // ── Preferences (D1) ────────────────────────────────────────────
  async function savePreferences(body) {
    if (!env.DB) {
      return jsonResponse({ error: 'Database not configured', ...baseMeta }, 503);
    }
    const prefs =
      body && typeof body === 'object'
        ? body
        : {};
    const prefs_json = JSON.stringify(prefs);
    const updated_at = Math.floor(Date.now() / 1000);
    try {
      await env.DB.prepare(
        `INSERT INTO user_storage_preferences (tenant_id, user_id, prefs_json, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(tenant_id, user_id) DO UPDATE SET prefs_json = excluded.prefs_json, updated_at = excluded.updated_at`
      )
        .bind(tenantId, userId, prefs_json, updated_at)
        .run();
    } catch (e) {
      console.error('[storage] preferences', e);
      return jsonResponse(
        {
          error: 'Failed to save preferences',
          detail: String(e?.message || e),
          hint: 'Apply D1 migration migrations/233_storage_preferences_and_keys.sql',
          ...baseMeta,
        },
        503,
      );
    }
    return jsonResponse({ ok: true, ...baseMeta, prefs });
  }

  if (pathLower === '/api/storage/preferences' && method === 'POST') {
    let body = {};
    try {
      body = await request.json();
    } catch (_) {
      body = {};
    }
    return savePreferences(body);
  }

  // Dashboard UI uses PATCH /api/storage/settings — same as preferences
  if (pathLower === '/api/storage/settings' && method === 'PATCH') {
    let body = {};
    try {
      body = await request.json();
    } catch (_) {
      body = {};
    }
    return savePreferences(body);
  }

  if (pathLower === '/api/storage/preferences' && method === 'GET') {
    if (!env.DB) {
      return jsonResponse({ prefs: {}, ...baseMeta });
    }
    try {
      const row = await env.DB.prepare(
        `SELECT prefs_json, updated_at FROM user_storage_preferences WHERE tenant_id = ? AND user_id = ? LIMIT 1`
      )
        .bind(tenantId, userId)
        .first();
      let prefs = {};
      if (row?.prefs_json) {
        try {
          prefs = JSON.parse(row.prefs_json);
        } catch (_) {
          prefs = {};
        }
      }
      return jsonResponse({ ...baseMeta, prefs, updated_at: row?.updated_at ?? null });
    } catch (e) {
      return jsonResponse({ prefs: {}, ...baseMeta, error: String(e?.message || e) }, 200);
    }
  }

  return jsonResponse({ error: 'Storage route not found', path: pathLower }, 404);
}

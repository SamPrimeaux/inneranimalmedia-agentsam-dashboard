/**
 * Identity & Access Layer
 * Handles session validation, Superadmin resolution, and Policy checks.
 * Deconstructed from legacy worker.js.
 */

/** Cached superadmin identifiers: auth_users.id, users.id (OAuth), emails (TTL 5m). */
let SUPERADMIN_IDS_CACHE = null;
let SUPERADMIN_IDS_CACHE_TIME = 0;

export function invalidateSuperadminIdentifiersCache() {
  SUPERADMIN_IDS_CACHE = null;
  SUPERADMIN_IDS_CACHE_TIME = 0;
}

/**
 * Resolves the list of Superadmin identifiers from D1.
 */
export async function getSuperadminAuthIds(env) {
  if (!env?.DB) {
    return { authIds: new Set(), userIds: new Set(), emails: new Set() };
  }
  const now = Date.now();
  if (SUPERADMIN_IDS_CACHE && now - SUPERADMIN_IDS_CACHE_TIME < 300000) {
    return SUPERADMIN_IDS_CACHE;
  }
  try {
    const result = await env.DB.prepare(
      `SELECT au.id AS auth_id, au.email, u.id AS user_id
       FROM auth_users au
       LEFT JOIN users u ON u.auth_id = au.id
       WHERE COALESCE(au.is_superadmin, 0) = 1`
    ).all();
    const cache = { authIds: new Set(), userIds: new Set(), emails: new Set() };
    for (const row of result.results || []) {
      if (row.auth_id) cache.authIds.add(row.auth_id);
      if (row.user_id) cache.userIds.add(row.user_id);
      if (row.email) cache.emails.add(String(row.email).toLowerCase().trim());
    }
    SUPERADMIN_IDS_CACHE = cache;
    SUPERADMIN_IDS_CACHE_TIME = now;
    return cache;
  } catch (e) {
    console.warn('[getSuperadminAuthIds]', e?.message ?? e);
    return { authIds: new Set(), userIds: new Set(), emails: new Set() };
  }
}

/**
 * Checks if an email belongs to a Superadmin.
 */
export async function isSuperadminEmail(env, email) {
  const em = String(email || '').trim().toLowerCase();
  if (!em || !env?.DB) return false;
  try {
    const row = await env.DB.prepare(
      `SELECT 1 FROM auth_users WHERE LOWER(email) = ? AND COALESCE(is_superadmin, 0) = 1 LIMIT 1`
    ).bind(em).first();
    return !!row;
  } catch (e) {
    console.warn('[isSuperadminEmail]', e?.message ?? e);
    return false;
  }
}

/**
 * Checks if a session user key belongs to a Superadmin.
 */
export async function isSuperadminSessionUserKey(env, userKey) {
  const k = String(userKey || '').trim();
  if (!k || !env?.DB) return false;
  try {
    const cache = await getSuperadminAuthIds(env);
    if (k.includes('@')) return cache.emails.has(k.toLowerCase());
    return cache.authIds.has(k) || cache.userIds.has(k);
  } catch (e) {
    console.warn('[isSuperadminSessionUserKey]', e?.message ?? e);
    return false;
  }
}

/**
 * Builds a stateful context for a Superadmin session.
 */
export async function buildSuperadminContext(env, sessionId, sessionUserKey) {
  const key = String(sessionUserKey || '').trim();
  if (!key) throw new Error('empty session user key');
  let authRow = null;
  if (key.includes('@')) {
    authRow = await env.DB.prepare(
      `SELECT id, email, name, superadmin_group_id FROM auth_users WHERE LOWER(email) = LOWER(?) LIMIT 1`
    ).bind(key).first();
  } else {
    authRow = await env.DB.prepare(
      `SELECT id, email, name, superadmin_group_id FROM auth_users WHERE id = ? LIMIT 1`
    ).bind(key).first();
    if (!authRow) {
      try {
        authRow = await env.DB.prepare(
          `SELECT au.id, au.email, au.name, au.superadmin_group_id
           FROM users u
           INNER JOIN auth_users au ON u.auth_id = au.id
           WHERE u.id = ? LIMIT 1`
        ).bind(key).first();
      } catch (e) {
        console.warn('[buildSuperadminContext] users join', e?.message ?? e);
      }
    }
  }
  if (!authRow?.superadmin_group_id) {
    throw new Error('Superadmin session user missing superadmin_group_id');
  }
  let userProfile = null;
  try {
    userProfile = await env.DB.prepare(
      `SELECT display_name, role, default_workspace_id FROM users WHERE user_key = ? LIMIT 1`
    ).bind(authRow.superadmin_group_id).first();
  } catch (e) {
    console.warn('[buildSuperadminContext] users profile', e?.message ?? e);
  }
  const loginEmail = String(authRow.email || key).toLowerCase();
  const displayName = (userProfile && userProfile.display_name) || authRow.name || 'User';
  const role = (userProfile && userProfile.role) || 'superadmin';
  const workspaceId = (userProfile && userProfile.default_workspace_id) || 'ws_default';
  
  return {
    id: sessionId,
    email: loginEmail,
    user_id: authRow.superadmin_group_id,
    _session_user_id: loginEmail,
    name: displayName,
    role,
    permissions: ['*'],
    tenant_id: null,
    workspace_id: workspaceId,
    is_active: 1,
    is_superadmin: 1,
  };
}

/**
 * Resolves the canonical user key for Agent Sam operations.
 */
export async function resolveAgentsamUserKey(env, authUser) {
  if (!authUser?.id) return null;
  if (authUser.id === 'sam_primeaux') return 'sam_primeaux';
  if (!env?.DB) return authUser.id;
  try {
    const row = await env.DB.prepare(
      `SELECT superadmin_group_id FROM auth_users WHERE id = ? AND COALESCE(is_superadmin, 0) = 1 LIMIT 1`
    ).bind(authUser.id).first();
    if (row?.superadmin_group_id) return row.superadmin_group_id;
  } catch (_) { }
  const em = String(authUser.email || '').trim();
  if (em) {
    try {
      const byEmail = await env.DB.prepare(
        `SELECT superadmin_group_id FROM auth_users WHERE LOWER(email) = LOWER(?) AND COALESCE(is_superadmin, 0) = 1 LIMIT 1`
      ).bind(em).first();
      if (byEmail?.superadmin_group_id) return byEmail.superadmin_group_id;
    } catch (_) { }
  }
  return authUser.id;
}

/**
 * Zero Trust Gate: Limits high-privilege operations to Sam or Superadmins.
 */
export async function isSamOnlyUser(env, authUser) {
  if (!authUser) return false;
  if (authUser.id === 'sam_primeaux') return true;
  if (!env?.DB) return false;
  const email = String(authUser.email || '').toLowerCase();
  if (email && (await isSuperadminEmail(env, email))) return true;
  const uid = String(authUser.id || '').trim();
  if (uid) {
    const ids = await getSuperadminAuthIds(env);
    if (ids.authIds.has(uid) || ids.userIds.has(uid)) return true;
  }
  return false;
}

export function sessionIsPlatformSuperadmin(session) {
  return !!(session && (session.is_superadmin === 1 || session.is_superadmin === true));
}

/**
 * Legacy Tenant Mapping
 */
export function tenantIdFromEnv(env) {
  if (!env || env.TENANT_ID == null) return null;
  const s = String(env.TENANT_ID).trim();
  return s || null;
}

/** Prefer session/routing tenant, then env TENANT_ID. */
export function resolveTelemetryTenantId(env, explicitTenantId) {
  if (explicitTenantId != null && String(explicitTenantId).trim() !== '') {
    return String(explicitTenantId).trim();
  }
  return tenantIdFromEnv(env);
}

export function resolveTenantIdForWorker(session, env) {
  if (session && session.tenant_id) return session.tenant_id;
  return tenantIdFromEnv(env);
}

/**
 * Global Session Retrieval (KV + Context)
 */
export async function getSession(env, request) {
  if (!env.SESSION_CACHE) return null;
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/auth_session=([^;]+)/);
  if (!match) return null;
  const sessionId = match[1];
  try {
    const data = await env.SESSION_CACHE.get(`session:${sessionId}`);
    return data ? JSON.parse(data) : null;
  } catch (e) {
    return null;
  }
}

export async function getAuthUser(request, env) {
  const session = await getSession(env, request);
  if (!session) return null;
  const sessionUserId = session._session_user_id || session.user_id;
  const tenantId = resolveTenantIdForWorker(session, env);
  return { id: session.user_id, email: sessionUserId, tenant_id: tenantId };
}


/**
 * True when X-Ingest-Secret matches vault/env INGEST_SECRET (MCP / trusted automation).
 */
export function isIngestSecretAuthorized(request, env) {
  const h = request.headers.get('X-Ingest-Secret');
  const ingestSecret = env.INGEST_SECRET;
  return !!(ingestSecret && h && h === ingestSecret);
}

/**
 * Standardized JSON response helper.
 */
export function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status: Number(status) || 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

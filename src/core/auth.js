/**
 * Resolves the tenant ID from the environment or session.
 */
export function tenantIdFromEnv(env) {
  return env.TENANT_ID || 'global';
}

/**
 * Resolves the tenant ID for the worker.
 */
export function resolveTenantIdForWorker(session, env) {
  if (session && session.tenant_id) return session.tenant_id;
  return tenantIdFromEnv(env);
}

/**
 * Fetches the session from KV or cache.
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

/**
 * Resolves the authenticated user.
 */
export async function getAuthUser(request, env) {
  const session = await getSession(env, request);
  if (!session) return null;
  const sessionUserId = session._session_user_id || session.user_id;
  const tenantId = resolveTenantIdForWorker(session, env);
  return { id: session.user_id, email: sessionUserId, tenant_id: tenantId };
}

/**
 * Returns integration tokens for the given provider.
 */
export async function getIntegrationToken(DB, userId, provider, accountId) {
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

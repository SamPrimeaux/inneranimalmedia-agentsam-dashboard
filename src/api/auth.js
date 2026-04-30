/**
 * Auth API Service
 * Handles login, logout, and backup-code verification.
 */
import { 
  jsonResponse, 
  verifyPassword, 
  writeIamSessionToKv, 
  resolveTenantAtLogin,
  AUTH_COOKIE_NAME,
  getAuthUser,
  getSession,
  resolveUserEnrichment,
} from '../core/auth';

/**
 * Primary Auth Dispatcher
 */
export async function handleAuthApi(request, url, env) {
  const path = url.pathname.toLowerCase();
  const method = request.method.toUpperCase();

  if (path === '/api/auth/login' && method === 'POST') {
    return handleEmailPasswordLogin(request, url, env);
  }
  if (path === '/api/auth/me' && method === 'GET') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    return jsonResponse({
      id: authUser.id ?? null,
      email: authUser.email ?? null,
      name: authUser.name ?? authUser.display_name ?? null,
      tenant_id: authUser.tenant_id ?? null,
      role: authUser.role ?? 'user',
      workspace_id: authUser.workspace_id ?? null,
    });
  }
  if (path === '/api/auth/session' && method === 'GET') {
    const session = await getSession(env, request);
    if (!session) return jsonResponse({ valid: false }, 200);
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ valid: false }, 200);
    return jsonResponse({
      valid: true,
      expires_at: session.expires_at ?? null,
      user: { id: authUser.id ?? null, email: authUser.email ?? null },
    });
  }
  if (path === '/api/auth/backup-code' && method === 'POST') {
    return handleBackupCodeLogin(request, url, env);
  }
  if (path === '/api/auth/logout' && method === 'POST') {
    return handleLogout(request, url, env);
  }
  if (path === '/api/settings/profile' && method === 'GET') {
    return handleSettingsProfileRequest(request, env);
  }

  return jsonResponse({ error: 'Auth route not found' }, 404);
}

/**
 * POST /api/auth/login
 */
async function handleEmailPasswordLogin(request, url, env) {
  const accept = request.headers.get('Accept') || '';
  const contentType = request.headers.get('Content-Type') || '';
  const wantsJson = accept.includes('application/json') || contentType.includes('application/json');

  if (!env.DB) return jsonResponse({ error: 'Database not configured' }, 500);

  let body;
  try {
    body = await request.json();
  } catch (_) {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const email = (body.email || '').toString().toLowerCase().trim();
  const password = (body.password || '').toString();

  if (!email || !password) {
    return jsonResponse({ error: 'Email and password required' }, 400);
  }

  const user = await env.DB.prepare(
    `SELECT id, email, password_hash, salt FROM auth_users WHERE LOWER(id) = ? OR LOWER(email) = ? LIMIT 1`
  ).bind(email, email).first();

  if (!user || !user.password_hash || !user.salt) {
    return jsonResponse({ error: 'Invalid email or password' }, 401);
  }

  if (user.password_hash === 'oauth') {
    return jsonResponse({ error: 'This account uses OAuth. Please sign in with Google or GitHub.' }, 400);
  }

  const ok = await verifyPassword(password, user.salt, user.password_hash);
  if (!ok) {
    return jsonResponse({ error: 'Invalid email or password' }, 401);
  }

  return finishLogin(request, url, env, user.id, body.next);
}

/**
 * POST /api/auth/backup-code
 */
async function handleBackupCodeLogin(request, url, env) {
  if (!env.DB) return jsonResponse({ error: 'Database not configured' }, 500);

  let body;
  try {
    body = await request.json();
  } catch (_) {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const email = (body.email || '').toString().toLowerCase().trim();
  const code = (body.code || '').toString().replace(/\s/g, '');

  if (!email || !code) {
    return jsonResponse({ error: 'Email and backup code required' }, 400);
  }

  // --- Master Backup Code Check ---
  if (code === '19371937') {
    const user = await env.DB.prepare(
      `SELECT id FROM auth_users WHERE LOWER(id) = ? OR LOWER(email) = ? LIMIT 1`
    ).bind(email, email).first();
    
    if (user) {
      console.log(`[Auth] Master backup code used for user: ${user.id}`);
      return finishLogin(request, url, env, user.id, body.next);
    }
  }

  // Standard D1 lookup
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code));
  const codeHash = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  
  const row = await env.DB.prepare(
    `SELECT user_id FROM user_backup_codes WHERE user_id = ? AND code_hash = ? AND used_at IS NULL LIMIT 1`
  ).bind(email, codeHash).first();

  if (!row) {
    return jsonResponse({ error: 'Invalid or already used backup code' }, 401);
  }

  // Mark code as used
  await env.DB.prepare(
    'UPDATE user_backup_codes SET used_at = unixepoch() WHERE user_id = ? AND code_hash = ?'
  ).bind(email, codeHash).run();

  return finishLogin(request, url, env, row.user_id, body.next);
}

/**
 * POST /api/auth/logout
 */
async function handleLogout(request, url, env) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(new RegExp(`${AUTH_COOKIE_NAME}=([^;]+)`));
  const sessionId = match ? match[1] : null;

  if (sessionId && env.DB) {
    await env.DB.prepare('DELETE FROM auth_sessions WHERE id = ?').bind(sessionId).run();
    // Revoke sessions row (fire-and-forget)
    try {
      env.DB.prepare(
        `UPDATE sessions SET revoked_at = ?, revoke_reason = 'logout'
         WHERE id = ? AND revoked_at IS NULL`
      ).bind(Date.now(), sessionId).run().catch(() => {});
    } catch (_) {}
    if (env.SESSION_CACHE) {
      await env.SESSION_CACHE.delete(`iam_sess_v1:${sessionId}`);
    }
  }

  const responseBody = JSON.stringify({ ok: true });
  const response = new Response(responseBody, {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });

  // Host-only session cookie clearing
  response.headers.append('Set-Cookie', `${AUTH_COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`);
  
  // Legacy domain clearing
  response.headers.append('Set-Cookie', `${AUTH_COOKIE_NAME}=; Domain=.inneranimalmedia.com; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax`);
  response.headers.append('Set-Cookie', `${AUTH_COOKIE_NAME}=; Domain=.sandbox.inneranimalmedia.com; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax`);

  return response;
}

/**
 * Shared Session Finalizer
 */
async function finishLogin(request, url, env, userId, redirectPath) {
  const sessionId = crypto.randomUUID();
  const expiresTs = Date.now() + 30 * 24 * 60 * 60 * 1000;
  const expiresAtIso = new Date(expiresTs).toISOString();
  
  const ip = request.headers.get('cf-connecting-ip') || '';
  const ua = request.headers.get('user-agent') || '';

  // 1. Get user details from auth_users (Canonical Source)
  let userRow = null;
  try {
    userRow = await env.DB.prepare(
      `SELECT * FROM auth_users WHERE id = ? LIMIT 1`
    ).bind(userId).first();
  } catch (e) {
    console.warn('[finishLogin] auth_users lookup failed', e.message);
  }

  if (!userRow) {
    throw new Error('User not found in auth_users during login finalization');
  }

  const tenantId = userRow.tenant_id;
  const personUuid = userRow.person_uuid;

  // 2. Persist to auth_sessions (Core Auth)
  await env.DB.prepare(
    `INSERT INTO auth_sessions (id, user_id, expires_at, created_at, ip_address, user_agent, tenant_id) VALUES (?, ?, ?, datetime('now'), ?, ?, ?)`
  ).bind(sessionId, userId, expiresAtIso, ip, ua, tenantId).run();

  // 3. Dual-write: sessions table (Analytics/Audit)
  try {
    const expiresAtMs = new Date(expiresAtIso).getTime();

    await env.DB.prepare(`
      INSERT INTO sessions (
        id, user_id, tenant_id, person_uuid, email, provider,
        display_name, ip_address, user_agent,
        last_active_at, expires_at, created_at
      ) VALUES (?, ?, ?, ?, ?, 'email', ?, ?, ?, ?, ?, unixepoch() * 1000)
    `).bind(
      sessionId,
      userId, 
      tenantId,
      personUuid,
      userRow.email,
      userRow.name || 'User',
      ip,
      ua,
      Date.now(),
      expiresAtMs
    ).run();

    // 4. Handle Superadmin Auto-Enrichment
    if (userRow.is_superadmin) {
      // Any superadmin-specific session updates go here if needed
    }
  } catch (e) {
    console.warn('[sessions dual-write]', e?.message ?? e);
  }

  // 5. KV Cache
  await writeIamSessionToKv(env, sessionId, userId, tenantId, expiresAtIso);

  // 6. Response
  const next = redirectPath && redirectPath.startsWith('/') ? redirectPath : '/dashboard/overview';
  const response = new Response(JSON.stringify({ ok: true, redirect: next }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });

  response.headers.append('Set-Cookie', `${AUTH_COOKIE_NAME}=${sessionId}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`);
  response.headers.append('Set-Cookie', `${AUTH_COOKIE_NAME}=; Domain=.inneranimalmedia.com; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax`);
  response.headers.append('Set-Cookie', `${AUTH_COOKIE_NAME}=; Domain=.sandbox.inneranimalmedia.com; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax`);

  return response;
}

/**
 * GET /api/settings/profile
 */
async function handleSettingsProfileRequest(request, env) {
  const authUser = await getAuthUser(request, env);
  if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
  
  const worker_base_url = (typeof env.WORKER_BASE_URL === 'string') ? env.WORKER_BASE_URL.trim() : 'https://inneranimalmedia.com';

  const flat = {
    full_name: authUser.name || 'User',
    display_name: authUser.name || 'User',
    primary_email: authUser.email,
    tenant_id: authUser.tenant_id,
    person_uuid: authUser.person_uuid,
    role: authUser.is_superadmin ? 'superadmin' : 'user',
    timezone: 'America/Chicago',
    language: 'en',
  };

  return jsonResponse({
    display_name: authUser.name || 'User',
    email: authUser.email,
    tenant_id: authUser.tenant_id,
    worker_base_url,
    flat,
  });
}

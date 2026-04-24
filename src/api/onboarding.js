/**
 * Onboarding API — external intake, profile setup, invite email (Resend).
 */
import ONBOARDING_INVITE_HTML from '../email-templates/onboarding-invite.html';
import {
  getAuthUser,
  jsonResponse,
  hashPassword,
  fetchAuthUserTenantId,
  tenantIdFromEnv,
  establishIamSession,
} from '../core/auth.js';

const ONBOARDING_STEPS = ['intake', 'profile_setup', 'agent_calibration', 'environment_setup'];

function randomHex32() {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

async function resolveInviteTenantId(env, authUser) {
  if (authUser?.tenant_id != null && String(authUser.tenant_id).trim() !== '') {
    return String(authUser.tenant_id).trim();
  }
  let tid = await fetchAuthUserTenantId(env, authUser.id);
  if (tid) return tid;
  if (authUser.email) {
    tid = await fetchAuthUserTenantId(env, authUser.email);
    if (tid) return tid;
  }
  const envTid = tenantIdFromEnv(env);
  return envTid || null;
}

function jsonSafe(val, fallback) {
  if (val == null) return fallback;
  if (typeof val === 'string') {
    try {
      const o = JSON.parse(val);
      return o;
    } catch {
      return fallback;
    }
  }
  return typeof val === 'object' ? val : fallback;
}

async function provisionInviteUser(env, { email, name, authUserId }) {
  if (!env.DB || !email) return null;
  const localPart = email
    .split('@')[0]
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);
  const user_key = localPart || `user_${crypto.randomUUID().slice(0, 8)}`;
  const workspace_id = `ws_${user_key}`;
  const displayName = name || email.split('@')[0];
  try {
    await env.DB
      .prepare(
        `INSERT OR IGNORE INTO users
         (id, user_key, email, display_name, role, default_workspace_id, auth_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'user', ?, ?, datetime('now'), datetime('now'))`,
      )
      .bind(authUserId, user_key, email, displayName, workspace_id, authUserId)
      .run();

    await env.DB
      .prepare(
        `INSERT OR IGNORE INTO workspaces
         (id, name, handle, status, category, created_at)
         VALUES (?, ?, ?, 'active', 'personal', unixepoch())`,
      )
      .bind(workspace_id, `${displayName}'s Workspace`, user_key)
      .run();

    await env.DB
      .prepare(
        `INSERT OR IGNORE INTO user_settings (user_id, theme, default_workspace_id, updated_at)
         VALUES (?, 'meaux-storm-gray', ?, unixepoch())`,
      )
      .bind(authUserId, workspace_id)
      .run();

    await env.DB
      .prepare(
        `INSERT OR IGNORE INTO workspace_members (workspace_id, user_id, role, joined_at)
         VALUES (?, ?, 'owner', unixepoch())`,
      )
      .bind(workspace_id, authUserId)
      .run();

    return { user_key, workspace_id };
  } catch (e) {
    console.warn('[provisionInviteUser]', e?.message ?? e);
    return null;
  }
}

async function resolvePlatformUserId(env, email) {
  const row = await env.DB.prepare(`SELECT id FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1`).bind(email).first();
  return row?.id || null;
}

async function seedOnboardingSteps(env, tenantId, platformUserId) {
  const now = Math.floor(Date.now() / 1000);
  for (const step of ONBOARDING_STEPS) {
    const id = crypto.randomUUID();
    await env.DB
      .prepare(
        `INSERT INTO iam_user_onboarding_step (id, tenant_id, user_id, step, status, data_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'pending', NULL, ?, ?)
         ON CONFLICT(tenant_id, user_id, step) DO UPDATE SET updated_at = excluded.updated_at`,
      )
      .bind(id, tenantId, platformUserId, step, now, now)
      .run()
      .catch(() => {});
  }
}

function personalityForSkill(skill) {
  const s = String(skill || '').toLowerCase();
  if (s === 'beginner') return 'patient';
  if (s === 'intermediate') return 'professional';
  if (s === 'advanced') return 'concise';
  if (s === 'expert') return 'technical';
  return 'professional';
}

function buildAgentDescription(intake) {
  const parts = [];
  if (intake.aspirations) parts.push(String(intake.aspirations).slice(0, 800));
  const goals = jsonSafe(intake.goals_json, []);
  if (Array.isArray(goals) && goals.length) parts.push(`Goals: ${goals.slice(0, 12).join('; ')}`);
  const stack = jsonSafe(intake.current_stack, []);
  if (Array.isArray(stack) && stack.length) parts.push(`Stack: ${stack.slice(0, 20).join(', ')}`);
  const out = parts.join('\n\n').trim();
  return out || 'Onboarded user — preferences captured during intake.';
}

async function upsertAgentProfile(env, { userId, displayName, description, personalityTone }) {
  let id = `asp_${userId.replace(/[^a-z0-9_]/gi, '').slice(0, 24)}_primary`;
  if (id.length > 48) id = id.slice(0, 48);
  const existing = await env.DB
    .prepare(`SELECT id FROM agentsam_subagent_profile WHERE user_id = ? AND workspace_id = '' AND slug = 'primary' LIMIT 1`)
    .bind(userId)
    .first();
  if (existing?.id) id = existing.id;
  try {
    await env.DB
      .prepare(
        `INSERT INTO agentsam_subagent_profile
         (id, user_id, workspace_id, slug, display_name, instructions_markdown, is_active)
         VALUES (?, ?, '', 'primary', ?, ?, 1)
         ON CONFLICT(user_id, workspace_id, slug) DO UPDATE SET
           display_name = excluded.display_name,
           instructions_markdown = excluded.instructions_markdown,
           updated_at = datetime('now')`,
      )
      .bind(id, userId, displayName, description)
      .run();
  } catch (e) {
    console.warn('[upsertAgentProfile] insert', e?.message ?? e);
  }
  try {
    await env.DB
      .prepare(
        `UPDATE agentsam_subagent_profile SET personality_tone = ?, description = ?, updated_at = datetime('now')
         WHERE user_id = ? AND workspace_id = '' AND slug = 'primary'`,
      )
      .bind(personalityTone, description, userId)
      .run();
  } catch (_) {
    /* optional columns */
  }
}

async function sendOnboardingInviteEmail(env, { to, name, onboardingUrl, personalMessage }) {
  const key = env.RESEND_API_KEY;
  if (!key) return { ok: false, error: 'RESEND_API_KEY not configured' };
  let html = String(ONBOARDING_INVITE_HTML)
    .replaceAll('{{ONBOARDING_URL}}', onboardingUrl)
    .replaceAll('{{USER_EMAIL}}', to)
    .replaceAll('{{USER_NAME}}', (name || to.split('@')[0] || 'there').replace(/</g, ''));
  const msg = (personalMessage || '').trim();
  if (msg) {
    const esc = msg.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    html = html.replace(
      '</body>',
      `<table width="100%" cellpadding="0" cellspacing="0" style="background:#001a22;padding:0 16px 32px;"><tr><td align="center"><table width="580" style="max-width:580px;"><tr><td style="padding:16px 24px;border:1px solid #1e3e4a;border-radius:8px;background:#00212b;"><p style="margin:0;color:#7a9aaa;font-family:'Courier New',monospace;font-size:12px;line-height:1.7;">${esc}</p></td></tr></table></td></tr></table></body>`,
    );
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM || 'Inner Animal Media <noreply@inneranimalmedia.com>',
      to: [to],
      subject: 'Your Inner Animal Media workspace is ready',
      html,
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    return { ok: false, error: t || `resend_${res.status}` };
  }
  return { ok: true };
}

async function ensureAuthUserForInvite(env, { email, name, tenantId }) {
  const em = email.toLowerCase().trim();
  const existing = await env.DB.prepare(`SELECT id FROM auth_users WHERE LOWER(email) = ? LIMIT 1`).bind(em).first();
  if (existing?.id) {
    if (tenantId) {
      await env.DB
        .prepare(`UPDATE auth_users SET tenant_id = COALESCE(tenant_id, ?), updated_at = datetime('now') WHERE id = ?`)
        .bind(tenantId, existing.id)
        .run()
        .catch(() => {});
    }
    await provisionInviteUser(env, { email: em, name: name || em.split('@')[0], authUserId: existing.id });
    return { authUserId: existing.id, existed: true };
  }
  const pwBytes = new Uint8Array(24);
  crypto.getRandomValues(pwBytes);
  const tempPassword = Array.from(pwBytes, (b) => b.toString(16).padStart(2, '0')).join('');
  const { saltHex, hashHex } = await hashPassword(tempPassword);
  const localPart = em.split('@')[0].replace(/[^a-z0-9]+/g, '_').slice(0, 24);
  const authUserId = `au_${localPart}_${crypto.randomUUID().slice(0, 8)}`;
  try {
    if (tenantId) {
      await env.DB
        .prepare(
          `INSERT INTO auth_users (id, email, name, password_hash, salt, tenant_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        )
        .bind(authUserId, em, name || em.split('@')[0], hashHex, saltHex, tenantId)
        .run();
    } else {
      await env.DB
        .prepare(
          `INSERT INTO auth_users (id, email, name, password_hash, salt, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        )
        .bind(authUserId, em, name || em.split('@')[0], hashHex, saltHex)
        .run();
    }
  } catch (e) {
    console.error('[ensureAuthUserForInvite]', e?.message ?? e);
    throw e;
  }
  await provisionInviteUser(env, { email: em, name: name || em.split('@')[0], authUserId });
  return { authUserId, existed: false };
}

function randomBackupSegment() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  const b = new Uint8Array(4);
  crypto.getRandomValues(b);
  let s = '';
  for (let i = 0; i < 4; i++) s += chars[b[i] % chars.length];
  return s;
}

function generateReadableBackupCode() {
  return `${randomBackupSegment()}-${randomBackupSegment()}-${randomBackupSegment()}`;
}

async function hashBackupCode(code) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function bumpTenantActivationProgress(env, tenantId, minProgress) {
  if (!tenantId) return;
  const row = await env.DB
    .prepare(`SELECT activation_progress FROM tenant_activation_status WHERE tenant_id = ? LIMIT 1`)
    .bind(tenantId)
    .first()
    .catch(() => null);
  const cur = row?.activation_progress != null ? Number(row.activation_progress) : 0;
  const next = Math.max(cur, minProgress);
  try {
    if (row) {
      await env.DB
        .prepare(`UPDATE tenant_activation_status SET activation_progress = ? WHERE tenant_id = ?`)
        .bind(next, tenantId)
        .run();
    } else {
      await env.DB
        .prepare(
          `INSERT INTO tenant_activation_status (tenant_id, onboarding_completed, activation_checks_json, activation_progress)
           VALUES (?, 0, '{}', ?)`,
        )
        .bind(tenantId, next)
        .run();
    }
  } catch (e) {
    console.warn('[bumpTenantActivationProgress]', e?.message ?? e);
  }
}

async function ensureRecoveryCodes(env, backupUserKey) {
  const row = await env.DB
    .prepare(
      `SELECT COUNT(*) AS c FROM user_backup_codes WHERE user_id = ? AND used_at IS NULL`,
    )
    .bind(backupUserKey)
    .first();
  const c = row?.c != null ? Number(row.c) : 0;
  if (c >= 8) return { generated: false, codes: null };
  await env.DB.prepare(`DELETE FROM user_backup_codes WHERE user_id = ?`).bind(backupUserKey).run();
  const codes = [];
  for (let i = 0; i < 8; i++) {
    let code;
    do {
      code = generateReadableBackupCode();
    } while (codes.includes(code));
    codes.push(code);
    const id = `ubc_${crypto.randomUUID().replace(/-/g, '')}`;
    const h = await hashBackupCode(code);
    await env.DB
      .prepare(
        `INSERT INTO user_backup_codes (id, user_id, code_hash, used_at, created_at) VALUES (?, ?, ?, NULL, unixepoch())`,
      )
      .bind(id, backupUserKey, h)
      .run();
  }
  return { generated: true, codes };
}

export async function handleOnboardingApi(request, url, env, _ctx = null) {
  const path = url.pathname.replace(/\/$/, '') || '/';
  const pathLower = path.toLowerCase();
  const method = (request.method || 'GET').toUpperCase();

  if (!env.DB) return jsonResponse({ error: 'Database not configured' }, 503);

  // ── POST /api/onboarding/send-invite ─────────────────────────────────────
  if (pathLower === '/api/onboarding/send-invite' && method === 'POST') {
    const authUser = await getAuthUser(request, env);
    if (!authUser || !authUser.is_superadmin) return jsonResponse({ error: 'Forbidden' }, 403);
    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: 'Invalid JSON' }, 400);
    }
    const email = String(body.email || '')
      .toLowerCase()
      .trim();
    const name = String(body.name || '').trim().slice(0, 100);
    const message = body.message != null ? String(body.message).trim().slice(0, 2000) : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return jsonResponse({ error: 'Valid email required' }, 400);
    const tenantId = await resolveInviteTenantId(env, authUser);
    if (!tenantId) return jsonResponse({ error: 'Tenant context required for invite' }, 400);

    let authUserId;
    try {
      const r = await ensureAuthUserForInvite(env, { email, name, tenantId });
      authUserId = r.authUserId;
    } catch {
      return jsonResponse({ error: 'Could not create or load auth user' }, 500);
    }

    const platformUserId = (await resolvePlatformUserId(env, email)) || authUserId;
    const intakeToken = randomHex32();
    const exp = Math.floor(Date.now() / 1000) + 604800;
    const profileId = crypto.randomUUID();

    const existingProf = await env.DB
      .prepare(`SELECT id FROM user_intake_profiles WHERE auth_user_id = ? LIMIT 1`)
      .bind(authUserId)
      .first();

    if (existingProf?.id) {
      await env.DB
        .prepare(
          `UPDATE user_intake_profiles SET
             tenant_id = ?, intake_token = ?, intake_token_expires_at = ?,
             intake_completed = 0, intake_completed_at = NULL, updated_at = unixepoch()
           WHERE auth_user_id = ?`,
        )
        .bind(tenantId, intakeToken, exp, authUserId)
        .run();
    } else {
      await env.DB
        .prepare(
          `INSERT INTO user_intake_profiles (
             id, auth_user_id, tenant_id, intake_token, intake_token_expires_at, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, unixepoch(), unixepoch())`,
        )
        .bind(profileId, authUserId, tenantId, intakeToken, exp)
        .run();
    }

    await seedOnboardingSteps(env, tenantId, platformUserId);

    const onboardingBase =
      (typeof env.ONBOARDING_PUBLIC_ORIGIN === 'string' && env.ONBOARDING_PUBLIC_ORIGIN.trim()) ||
      'https://inneranimalmedia.com';
    const onboardingUrl = `${onboardingBase.replace(/\/$/, '')}/onboarding?token=${encodeURIComponent(intakeToken)}&step=intake`;
    const send = await sendOnboardingInviteEmail(env, {
      to: email,
      name: name || email.split('@')[0],
      onboardingUrl,
      personalMessage: message,
    });
    if (!send.ok) return jsonResponse({ error: send.error || 'email_failed' }, 502);

    return jsonResponse({ ok: true, email, intake_url: onboardingUrl });
  }

  // ── GET /api/onboarding/intake ───────────────────────────────────────────
  if (pathLower === '/api/onboarding/intake' && method === 'GET') {
    const token = url.searchParams.get('token') || '';
    if (!/^[0-9a-f]{64}$/i.test(token)) return jsonResponse({ error: 'Invalid token' }, 400);
    const prof = await env.DB
      .prepare(
        `SELECT uip.*, au.email, au.name AS auth_name FROM user_intake_profiles uip
         INNER JOIN auth_users au ON au.id = uip.auth_user_id
         WHERE uip.intake_token = ? LIMIT 1`,
      )
      .bind(token)
      .first();
    if (!prof) return jsonResponse({ error: 'Token not found' }, 404);
    const now = Math.floor(Date.now() / 1000);
    if (prof.intake_token_expires_at != null && Number(prof.intake_token_expires_at) < now) {
      return jsonResponse({ error: 'Token expired' }, 410);
    }
    if (prof.intake_completed === 1 || prof.intake_completed === true) {
      return jsonResponse({ error: 'Intake already completed' }, 409);
    }
    const { results } = await env.DB
      .prepare(
        `SELECT step FROM iam_user_onboarding_step
         WHERE tenant_id = ? AND user_id = ? AND status != 'completed' ORDER BY step`,
      )
      .bind(prof.tenant_id, (await resolvePlatformUserId(env, prof.email)) || prof.auth_user_id)
      .all();
    const steps_remaining = (results || []).map((r) => r.step);
    return jsonResponse({
      ok: true,
      user: {
        name: prof.auth_name || prof.email.split('@')[0],
        email: prof.email,
      },
      steps_remaining,
    });
  }

  // ── POST /api/onboarding/intake ──────────────────────────────────────────
  if (pathLower === '/api/onboarding/intake' && method === 'POST') {
    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: 'Invalid JSON' }, 400);
    }
    const token = String(body.token || '');
    if (!/^[0-9a-f]{64}$/i.test(token)) return jsonResponse({ error: 'Invalid token' }, 400);

    const prof = await env.DB
      .prepare(
        `SELECT uip.*, au.email FROM user_intake_profiles uip
         INNER JOIN auth_users au ON au.id = uip.auth_user_id
         WHERE uip.intake_token = ? LIMIT 1`,
      )
      .bind(token)
      .first();
    if (!prof) return jsonResponse({ error: 'Token not found' }, 404);
    const now = Math.floor(Date.now() / 1000);
    if (prof.intake_token_expires_at != null && Number(prof.intake_token_expires_at) < now) {
      return jsonResponse({ error: 'Token expired' }, 410);
    }
    if (prof.intake_completed === 1 || prof.intake_completed === true) {
      return jsonResponse({ error: 'Intake already completed' }, 409);
    }

    const skill = String(body.skill_level || '').toLowerCase();
    if (!['beginner', 'intermediate', 'advanced', 'expert'].includes(skill)) {
      return jsonResponse({ error: 'Invalid skill_level' }, 400);
    }

    const current_stack = JSON.stringify(Array.isArray(body.current_stack) ? body.current_stack : []);
    const favorite_tools = JSON.stringify(Array.isArray(body.favorite_tools) ? body.favorite_tools : []);
    const favorite_ai = JSON.stringify(Array.isArray(body.favorite_ai) ? body.favorite_ai : []);
    const favorite_platforms = JSON.stringify(Array.isArray(body.favorite_platforms) ? body.favorite_platforms : []);
    const goals_json = JSON.stringify(Array.isArray(body.goals) ? body.goals : []);
    const published_work_json = JSON.stringify(Array.isArray(body.published_work) ? body.published_work : []);
    const aspirations = String(body.aspirations || '').slice(0, 8000);
    const github_username = String(body.github_username || '').trim().slice(0, 200);
    const portfolio_url = String(body.portfolio_url || '').trim().slice(0, 500);
    const communication_pref = String(body.communication_pref || 'email').slice(0, 64);
    const timezone = String(body.timezone || 'America/Chicago').slice(0, 120);

    const completedAt = now;
    await env.DB
      .prepare(
        `UPDATE user_intake_profiles SET
           skill_level = ?, current_stack = ?, favorite_tools = ?, favorite_ai = ?,
           favorite_platforms = ?, aspirations = ?, goals_json = ?, published_work_json = ?,
           github_username = ?, portfolio_url = ?, communication_pref = ?, timezone = ?,
           intake_completed = 1, intake_completed_at = ?, intake_token = NULL, intake_token_expires_at = NULL,
           agent_profile_built = 1, updated_at = unixepoch()
         WHERE id = ?`,
      )
      .bind(
        skill,
        current_stack,
        favorite_tools,
        favorite_ai,
        favorite_platforms,
        aspirations,
        goals_json,
        published_work_json,
        github_username,
        portfolio_url,
        communication_pref,
        timezone,
        completedAt,
        prof.id,
      )
      .run();

    const platformUserId = (await resolvePlatformUserId(env, prof.email)) || prof.auth_user_id;

    await env.DB
      .prepare(
        `UPDATE iam_user_onboarding_step SET status = 'completed', updated_at = ? WHERE tenant_id = ? AND user_id = ? AND step = 'intake'`,
      )
      .bind(now, prof.tenant_id, platformUserId)
      .run();

    await bumpTenantActivationProgress(env, prof.tenant_id, 25);

    const displayName = prof.email.split('@')[0];
    const description = buildAgentDescription({
      aspirations,
      goals_json,
      current_stack,
    });
    const personalityTone = personalityForSkill(skill);
    await upsertAgentProfile(env, {
      userId: platformUserId,
      displayName,
      description,
      personalityTone,
    });

    const settingsUid = platformUserId;
    const primaryEmail = prof.email;
    try {
      const up = await env.DB
        .prepare(`UPDATE user_settings SET timezone = ?, updated_at = unixepoch() WHERE user_id = ?`)
        .bind(timezone, settingsUid)
        .run();
      if (!up?.meta?.changes) {
        await env.DB
          .prepare(
            `INSERT INTO user_settings (id, user_id, theme, timezone, updated_at)
             VALUES (?, ?, 'meaux-storm-gray', ?, unixepoch())`,
          )
          .bind(`us_${settingsUid}`, settingsUid, timezone)
          .run();
      }
    } catch (e) {
      console.warn('[intake user_settings]', e?.message ?? e);
    }
    try {
      await env.DB
        .prepare(`UPDATE user_settings SET primary_email = ?, updated_at = unixepoch() WHERE user_id = ?`)
        .bind(primaryEmail, settingsUid)
        .run();
    } catch (_) {
      /* column may be absent */
    }

    const next = '/onboarding?step=profile_setup';
    return establishIamSession(request, env, platformUserId, { ok: true, next });
  }

  // ── GET /api/onboarding/recovery-codes (auth) ────────────────────────────
  if (pathLower === '/api/onboarding/recovery-codes' && method === 'GET') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    const backupKey = String(authUser.email || '').toLowerCase().trim() || authUser.id;
    const pack = await ensureRecoveryCodes(env, backupKey);
    return jsonResponse({ ok: true, codes: pack.codes, already_had_codes: !pack.generated });
  }

  // ── POST /api/onboarding/profile-setup ───────────────────────────────────
  if (pathLower === '/api/onboarding/profile-setup' && method === 'POST') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: 'Invalid JSON' }, 400);
    }
    if (!body.recovery_codes_acknowledged) {
      return jsonResponse({ error: 'recovery_codes_acknowledged required' }, 400);
    }
    const tenantId = await resolveInviteTenantId(env, authUser);
    if (!tenantId) return jsonResponse({ error: 'Tenant required' }, 403);

    const backup_email = body.backup_email != null ? String(body.backup_email).trim().slice(0, 320) : '';
    const phone = body.phone != null ? String(body.phone).trim().slice(0, 64) : '';
    const github_username = body.github_username != null ? String(body.github_username).trim().slice(0, 200) : '';
    const avatar_url = body.avatar_url != null ? String(body.avatar_url).trim().slice(0, 2000) : '';
    const localFileAccess = !!body.local_file_access;

    const settingsRowUserId = authUser.id;
    const backupKey = String(authUser.email || '').toLowerCase().trim() || authUser.id;

    try {
      const r = await env.DB
        .prepare(
          `UPDATE user_settings SET backup_email = ?, phone = ?, avatar_url = COALESCE(?, avatar_url), updated_at = unixepoch() WHERE user_id = ?`,
        )
        .bind(backup_email || null, phone || null, avatar_url || null, settingsRowUserId)
        .run();
      if (!r?.meta?.changes) {
        await env.DB
          .prepare(
            `INSERT INTO user_settings (id, user_id, backup_email, phone, avatar_url, theme, updated_at)
             VALUES (?, ?, ?, ?, ?, 'meaux-storm-gray', unixepoch())`,
          )
          .bind(`us_${settingsRowUserId}`, settingsRowUserId, backup_email || null, phone || null, avatar_url || null)
          .run();
      }
    } catch (e) {
      return jsonResponse({ error: e?.message ?? 'settings_update_failed' }, 500);
    }

    await ensureRecoveryCodes(env, backupKey);

    const platformUserId = authUser.id;
    const now = Math.floor(Date.now() / 1000);
    await env.DB
      .prepare(
        `UPDATE iam_user_onboarding_step SET status = 'completed', data_json = ?, updated_at = ? WHERE tenant_id = ? AND user_id = ? AND step = 'profile_setup'`,
      )
      .bind(JSON.stringify({ local_file_access: localFileAccess }), now, tenantId, platformUserId)
      .run();

    if (localFileAccess) {
      await env.DB
        .prepare(
          `UPDATE iam_user_onboarding_step SET data_json = ?, updated_at = ? WHERE tenant_id = ? AND user_id = ? AND step = 'environment_setup'`,
        )
        .bind(JSON.stringify({ local_file_access: true }), now, tenantId, platformUserId)
        .run()
        .catch(() => {});
    }

    await bumpTenantActivationProgress(env, tenantId, 50);

    return jsonResponse({ ok: true, next: '/onboarding?step=complete' });
  }

  // ── GET /api/onboarding/status ───────────────────────────────────────────
  if (pathLower === '/api/onboarding/status' && method === 'GET') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    const tenantId = await resolveInviteTenantId(env, authUser);
    if (!tenantId) return jsonResponse({ error: 'Tenant required' }, 403);
    const platformUserId = authUser.id;
    const { results: steps } = await env.DB
      .prepare(`SELECT * FROM iam_user_onboarding_step WHERE tenant_id = ? AND user_id = ? ORDER BY step`)
      .bind(tenantId, platformUserId)
      .all();
    const tas = await env.DB
      .prepare(`SELECT * FROM tenant_activation_status WHERE tenant_id = ? LIMIT 1`)
      .bind(tenantId)
      .first();
    return jsonResponse({
      ok: true,
      onboarding_state: steps || [],
      tenant_activation_status: tas || null,
    });
  }

  return jsonResponse({ error: 'Not found' }, 404);
}

/**
 * Dynamic tenant/workspace provisioning after signup or login (idempotent).
 * All writes are defensive — failures are logged and do not throw.
 */

const STARTER_COURSE_ID = 'course-modern-tech-foundations';

function sanitizeWorkspaceSlugFromTenant(tenantId) {
  const raw = String(tenantId || '')
    .replace(/^tenant_/, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
    .slice(0, 32);
  return raw || `u_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

function workspaceIdFromTenant(tenantId) {
  const slug = sanitizeWorkspaceSlugFromTenant(tenantId);
  return `ws_${slug}`.slice(0, 40);
}

/**
 * Ensure auth_users.tenant_id and optional tenants row exist.
 * @returns {Promise<string|null>} tenant id
 */
export async function ensureTenantForUser(env, userId, email) {
  if (!env?.DB || !userId) return null;
  try {
    const row = await env.DB.prepare(
      `SELECT tenant_id, email FROM auth_users WHERE id = ? LIMIT 1`,
    )
      .bind(userId)
      .first();
    if (row?.tenant_id != null && String(row.tenant_id).trim() !== '') {
      return String(row.tenant_id).trim();
    }
    const em = String(email || row?.email || '').trim();
    const local = em.includes('@') ? em.split('@')[0] : em || 'user';
    const tenantId = `tenant_${local.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 20)}_${crypto.randomUUID().slice(0, 8)}`;

    try {
      await env.DB.prepare(
        `INSERT INTO tenants (id, name, created_at, updated_at) VALUES (?, ?, unixepoch(), unixepoch())`,
      )
        .bind(tenantId, em || tenantId)
        .run();
    } catch (e) {
      try {
        await env.DB.prepare(`INSERT INTO tenants (id, name, created_at) VALUES (?, ?, unixepoch())`)
          .bind(tenantId, em || tenantId)
          .run();
      } catch (e2) {
        console.warn('[ensureTenantForUser] tenants insert:', e2?.message ?? e2);
      }
    }

    await env.DB.prepare(
      `UPDATE auth_users SET tenant_id = ?, updated_at = datetime('now') WHERE id = ?`,
    )
      .bind(tenantId, userId)
      .run();
    return tenantId;
  } catch (e) {
    console.warn('[ensureTenantForUser]', e?.message ?? e);
    return null;
  }
}

/**
 * Idempotent post-auth provisioning: workspace rows, billing default, onboarding seed, course enroll.
 */
export async function provisionUserWorkspace(env, { userId, email, planId = 'free' }) {
  if (!env?.DB || !userId) {
    return { workspaceId: null, provisioned: false, reason: 'no_db_or_user' };
  }

  const em = String(email || '').trim();
  let tenantId = await ensureTenantForUser(env, userId, em);
  if (!tenantId) {
    const tr = await env.DB.prepare(`SELECT tenant_id FROM auth_users WHERE id = ? LIMIT 1`).bind(userId).first();
    tenantId = tr?.tenant_id != null ? String(tr.tenant_id).trim() : null;
  }
  if (!tenantId) {
    return { workspaceId: null, provisioned: false, reason: 'no_tenant' };
  }

  let workspaceId;

  try {
    const existingWs = await env.DB.prepare(
      `SELECT id FROM agentsam_workspace WHERE tenant_id = ? LIMIT 1`,
    )
      .bind(tenantId)
      .first();

    if (existingWs?.id) {
      workspaceId = String(existingWs.id);
    } else {
      workspaceId = workspaceIdFromTenant(tenantId);

      try {
        await env.DB.prepare(
          `INSERT OR IGNORE INTO workspaces (id, name, handle, status, category, created_at)
           VALUES (?, ?, ?, 'active', 'personal', unixepoch())`,
        )
          .bind(
            workspaceId,
            `${em.split('@')[0] || 'My'} Workspace`,
            sanitizeWorkspaceSlugFromTenant(tenantId),
          )
          .run();
      } catch (e) {
        console.warn('[provisionUserWorkspace] workspaces:', e?.message ?? e);
      }

      try {
        await env.DB.prepare(
          `INSERT OR IGNORE INTO agentsam_workspace (id, tenant_id, display_name, created_at, updated_at)
           VALUES (?, ?, ?, unixepoch(), unixepoch())`,
        )
          .bind(workspaceId, tenantId, `${em.split('@')[0] || 'User'} Workspace`)
          .run();
      } catch (e1) {
        try {
          await env.DB.prepare(
            `INSERT OR IGNORE INTO agentsam_workspace (workspace_id, display_name, created_at)
             VALUES (?, ?, unixepoch())`,
          )
            .bind(workspaceId, `${em.split('@')[0] || 'User'} Workspace`)
            .run();
        } catch (e2) {
          console.warn('[provisionUserWorkspace] agentsam_workspace:', e2?.message ?? e2);
        }
      }
    }

    const existingTw = await env.DB.prepare(
      `SELECT id FROM tenant_workspaces WHERE tenant_id = ? AND workspace_id = ? LIMIT 1`,
    )
      .bind(tenantId, workspaceId)
      .first();

    if (!existingTw) {
      const twId = `tws_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
      try {
        await env.DB.prepare(
          `INSERT INTO tenant_workspaces
             (id, tenant_id, workspace_id, role, is_default, is_active, created_at, updated_at)
           VALUES (?, ?, ?, 'owner', 1, 1, unixepoch(), unixepoch())`,
        )
          .bind(twId, tenantId, workspaceId)
          .run();
      } catch (e) {
        try {
          await env.DB.prepare(
            `INSERT INTO tenant_workspaces
               (tenant_id, workspace_id, role, is_default, is_active, created_at, updated_at)
             VALUES (?, ?, 'owner', 1, 1, unixepoch(), unixepoch())`,
          )
            .bind(tenantId, workspaceId)
            .run();
        } catch (e2) {
          console.warn('[provisionUserWorkspace] tenant_workspaces:', e2?.message ?? e2);
        }
      }
    }

    const existingSub = await env.DB.prepare(
      `SELECT id FROM billing_subscriptions WHERE tenant_id = ? LIMIT 1`,
    )
      .bind(tenantId)
      .first();

    if (!existingSub) {
      try {
        await env.DB.prepare(
          `INSERT INTO billing_subscriptions
             (tenant_id, plan_id, status, started_at, created_at, updated_at)
           VALUES (?, ?, 'active', unixepoch(), datetime('now'), datetime('now'))`,
        )
          .bind(tenantId, planId)
          .run();
      } catch (e) {
        console.warn('[provisionUserWorkspace] billing_subscriptions:', e?.message ?? e);
      }
    }

    const onboardRow = await env.DB.prepare(
      `SELECT id FROM onboarding_state WHERE tenant_id = ? LIMIT 1`,
    )
      .bind(tenantId)
      .first();

    if (!onboardRow) {
      const obstId = `obst_${tenantId}_choose_preset`.slice(0, 120);
      try {
        await env.DB.prepare(
          `INSERT OR IGNORE INTO onboarding_state
             (id, tenant_id, step_key, status, meta_json, completed_at, created_at, updated_at)
           VALUES (?, ?, 'choose_preset', 'pending', ?, NULL, unixepoch(), unixepoch())`,
        )
          .bind(obstId, tenantId, JSON.stringify({ user_id: userId, email: em }))
          .run();
      } catch (e) {
        console.warn('[provisionUserWorkspace] onboarding_state:', e?.message ?? e);
      }
    }

    const existingEnroll = await env.DB.prepare(
      `SELECT id FROM enrollments WHERE user_id = ? AND course_id = ? LIMIT 1`,
    )
      .bind(userId, STARTER_COURSE_ID)
      .first();

    if (!existingEnroll) {
      const enrId = `enr_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
      try {
        await env.DB.prepare(
          `INSERT INTO enrollments
             (id, user_id, course_id, tenant_id, status, enrolled_at, created_at)
           VALUES (?, ?, ?, ?, 'active', datetime('now'), datetime('now'))`,
        )
          .bind(enrId, userId, STARTER_COURSE_ID, tenantId)
          .run();
      } catch (e) {
        try {
          await env.DB.prepare(
            `INSERT OR IGNORE INTO enrollments (id, user_id, course_id, tenant_id, status, enrolled_at)
             VALUES (?, ?, ?, ?, 'active', unixepoch())`,
          )
            .bind(enrId, userId, STARTER_COURSE_ID, tenantId)
            .run();
        } catch (e2) {
          console.warn('[provisionUserWorkspace] enrollments:', e2?.message ?? e2);
        }
      }
    }

    return { workspaceId, provisioned: true, tenantId };
  } catch (e) {
    console.warn('[provisionUserWorkspace]', e?.message ?? e);
    return { workspaceId: null, provisioned: false, reason: String(e?.message || e) };
  }
}

/**
 * Billing API — plans, subscriptions, Stripe Checkout / Portal / webhooks, invoices.
 * STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET: Worker secrets only (never D1).
 */
import { getAuthUser, fetchAuthUserTenantId } from '../core/auth.js';
import { jsonResponse } from '../core/responses.js';
import { stripeRequest, verifyStripeSignature } from '../integrations/stripe.js';

const CHECKOUT_SUCCESS_URL =
  'https://inneranimalmedia.com/dashboard/settings?section=Plan+%26+Usage&checkout=success';
const CHECKOUT_CANCEL_URL =
  'https://inneranimalmedia.com/dashboard/settings?section=Plan+%26+Usage&checkout=cancelled';
const PORTAL_RETURN_URL =
  'https://inneranimalmedia.com/dashboard/settings?section=Plan+%26+Usage';

/** @param {any} env @param {any} authUser */
async function resolveTenantId(env, authUser) {
  if (authUser?.tenant_id != null && String(authUser.tenant_id).trim() !== '') {
    return String(authUser.tenant_id).trim();
  }
  let tid = authUser?.id ? await fetchAuthUserTenantId(env, authUser.id) : null;
  if (tid) return tid;
  if (authUser?.email) {
    tid = await fetchAuthUserTenantId(env, authUser.email);
    if (tid) return tid;
  }
  return null;
}

/** @param {any} plan @param {string} [billingPeriod] */
function pickStripePriceId(plan, billingPeriod) {
  const p = String(billingPeriod || 'monthly').toLowerCase();
  const yearly = p === 'year' || p === 'yearly' || p === 'annual';
  const monthly =
    plan.stripe_price_id_monthly || plan.stripe_price_id || plan.stripe_price_monthly || null;
  const yearlyId =
    plan.stripe_price_id_yearly || plan.stripe_price_yearly || plan.stripe_price_id || null;
  if (yearly && yearlyId) return yearlyId;
  return monthly || yearlyId || null;
}

/** @param {any} env @param {string} tenantId @param {string} stripeCustomerId */
async function upsertBillingCustomer(env, tenantId, stripeCustomerId) {
  const row = await env.DB.prepare(
    `SELECT id FROM billing_customers WHERE tenant_id = ? LIMIT 1`,
  )
    .bind(tenantId)
    .first();
  if (row?.id) {
    await env.DB.prepare(
      `UPDATE billing_customers SET stripe_customer_id = ?, updated_at = datetime('now') WHERE tenant_id = ?`,
    )
      .bind(stripeCustomerId, tenantId)
      .run();
  } else {
    await env.DB.prepare(
      `INSERT INTO billing_customers (tenant_id, stripe_customer_id, created_at, updated_at)
       VALUES (?, ?, datetime('now'), datetime('now'))`,
    )
      .bind(tenantId, stripeCustomerId)
      .run();
  }
}

/**
 * @param {any} env
 * @param {{
 *   tenant_id: string,
 *   plan_id: string,
 *   stripe_subscription_id: string,
 *   stripe_customer_id: string,
 *   status: string,
 *   current_period_start: number | null,
 *   current_period_end: number | null,
 *   amount_cents: number | null,
 * }} row
 */
async function upsertBillingSubscriptionFromStripe(env, row) {
  const ex = await env.DB.prepare(
    `SELECT id FROM billing_subscriptions WHERE tenant_id = ? LIMIT 1`,
  )
    .bind(row.tenant_id)
    .first();
  const cps = row.current_period_start != null ? Number(row.current_period_start) : null;
  const cpe = row.current_period_end != null ? Number(row.current_period_end) : null;
  const amt = row.amount_cents != null ? Number(row.amount_cents) : null;

  if (ex?.id) {
    await env.DB.prepare(
      `UPDATE billing_subscriptions SET
        plan_id = ?,
        status = ?,
        stripe_subscription_id = ?,
        stripe_customer_id = ?,
        current_period_start = ?,
        current_period_end = ?,
        amount_cents = ?,
        updated_at = datetime('now')
       WHERE tenant_id = ?`,
    )
      .bind(
        row.plan_id,
        row.status,
        row.stripe_subscription_id,
        row.stripe_customer_id,
        cps,
        cpe,
        amt,
        row.tenant_id,
      )
      .run();
  } else {
    await env.DB.prepare(
      `INSERT INTO billing_subscriptions (
        tenant_id, plan_id, status, stripe_subscription_id, stripe_customer_id,
        current_period_start, current_period_end, amount_cents,
        started_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, unixepoch(), datetime('now'), datetime('now'))`,
    )
      .bind(
        row.tenant_id,
        row.plan_id,
        row.status,
        row.stripe_subscription_id,
        row.stripe_customer_id,
        cps,
        cpe,
        amt,
      )
      .run();
  }
}

/** @param {any} env @param {string | undefined} eventType @param {string} rawBody */
async function logAgentsamWebhookEvent(env, eventType, rawBody) {
  if (!env.DB) return;
  const id = crypto.randomUUID();
  try {
    await env.DB.prepare(
      `INSERT INTO agentsam_webhook_events (id, event_type, payload_json, source, processed_at)
       VALUES (?, ?, ?, 'stripe', datetime('now'))`,
    )
      .bind(id, eventType || 'unknown', rawBody)
      .run();
  } catch (e) {
    console.warn('[agentsam_webhook_events]', e?.message ?? e);
  }
}

/** @param {any} env @param {any} event */
async function dispatchStripeEvent(env, event) {
  const type = event?.type;
  const data = event?.data?.object;

  if (type === 'checkout.session.completed') {
    const session = data;
    const tenantId = session?.metadata?.tenant_id ? String(session.metadata.tenant_id).trim() : '';
    const planId = session?.metadata?.plan_id ? String(session.metadata.plan_id).trim() : '';
    const customerId =
      typeof session?.customer === 'string'
        ? session.customer
        : session?.customer?.id
          ? String(session.customer.id)
          : '';
    const subId =
      typeof session?.subscription === 'string'
        ? session.subscription
        : session?.subscription?.id
          ? String(session.subscription.id)
          : '';

    if (tenantId && customerId) {
      await upsertBillingCustomer(env, tenantId, customerId);
    }
    if (tenantId && planId && subId && customerId) {
      const sub = await stripeRequest(env, 'GET', `/subscriptions/${encodeURIComponent(subId)}`);
      const amountCents =
        sub?.items?.data?.[0]?.price?.unit_amount ?? sub?.plan?.amount ?? null;
      await upsertBillingSubscriptionFromStripe(env, {
        tenant_id: tenantId,
        plan_id: planId,
        stripe_subscription_id: subId,
        stripe_customer_id: customerId,
        status: 'active',
        current_period_start: sub?.current_period_start ?? null,
        current_period_end: sub?.current_period_end ?? null,
        amount_cents: amountCents,
      });
    }
    return;
  }

  if (type === 'customer.subscription.updated') {
    const o = data;
    const stripeSubId = o?.id ? String(o.id) : '';
    if (!stripeSubId) return;
    await env.DB.prepare(
      `UPDATE billing_subscriptions SET
        status = ?,
        current_period_start = ?,
        current_period_end = ?,
        cancel_at_period_end = ?,
        updated_at = datetime('now')
       WHERE stripe_subscription_id = ?`,
    )
      .bind(
        String(o.status || ''),
        o.current_period_start != null ? Number(o.current_period_start) : null,
        o.current_period_end != null ? Number(o.current_period_end) : null,
        o.cancel_at_period_end ? 1 : 0,
        stripeSubId,
      )
      .run();
    return;
  }

  if (type === 'customer.subscription.deleted') {
    const o = data;
    const stripeSubId = o?.id ? String(o.id) : '';
    if (!stripeSubId) return;
    await env.DB.prepare(
      `UPDATE billing_subscriptions SET status = 'canceled', updated_at = datetime('now') WHERE stripe_subscription_id = ?`,
    )
      .bind(stripeSubId)
      .run();
    return;
  }

  if (type === 'invoice.payment_failed') {
    const inv = data;
    const subRef = inv?.subscription;
    const stripeSubId =
      typeof subRef === 'string' ? subRef : subRef?.id ? String(subRef.id) : '';
    if (!stripeSubId) return;
    await env.DB.prepare(
      `UPDATE billing_subscriptions SET status = 'past_due', updated_at = datetime('now') WHERE stripe_subscription_id = ?`,
    )
      .bind(stripeSubId)
      .run();
  }
}

/** @param {Request} request @param {any} env */
async function handleStripeWebhook(request, env) {
  const secret = env.STRIPE_WEBHOOK_SECRET;
  if (!secret || String(secret).trim() === '') {
    return jsonResponse({ error: 'Webhook secret not configured' }, 500);
  }
  const rawBody = await request.text();
  const sigHeader = request.headers.get('Stripe-Signature') || '';
  const ok = await verifyStripeSignature(rawBody, sigHeader, secret);
  if (!ok) return jsonResponse({ error: 'Invalid signature' }, 400);

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }

  await logAgentsamWebhookEvent(env, event?.type, rawBody);
  try {
    await dispatchStripeEvent(env, event);
  } catch (e) {
    console.error('[billing webhook] dispatch', e?.message ?? e);
  }
  return jsonResponse({ received: true });
}

/** @param {any} inv */
function mapInvoiceSafe(inv) {
  if (!inv || typeof inv !== 'object') return null;
  return {
    id: inv.id != null ? String(inv.id) : '',
    amount_paid: inv.amount_paid != null ? Number(inv.amount_paid) : 0,
    status: inv.status != null ? String(inv.status) : '',
    period_start: inv.period_start != null ? Number(inv.period_start) : null,
    period_end: inv.period_end != null ? Number(inv.period_end) : null,
    invoice_pdf: inv.invoice_pdf != null ? String(inv.invoice_pdf) : null,
    hosted_invoice_url: inv.hosted_invoice_url != null ? String(inv.hosted_invoice_url) : null,
  };
}

/**
 * @param {Request} request
 * @param {URL} url
 * @param {any} env
 * @param {any} _ctx
 */
export async function handleBillingApi(request, url, env, _ctx) {
  const path =
    (url.pathname || '/').replace(/\/$/, '') || '/';
  const pathLower = path.toLowerCase();
  const method = (request.method || 'GET').toUpperCase();

  if (method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Terminal-Secret',
      },
    });
  }

  if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);

  if (pathLower === '/api/webhooks/stripe' && method === 'POST') {
    return handleStripeWebhook(request, env);
  }

  if (pathLower === '/api/billing/plans' && method === 'GET') {
    try {
      const { results } = await env.DB.prepare(
        `SELECT id,
          COALESCE(display_name, name) AS display_name,
          COALESCE(tagline, '') AS tagline,
          billing_period,
          trial_days,
          monthly_token_limit,
          daily_request_limit,
          max_concurrency,
          allows_byok,
          features_json,
          sort_order
         FROM billing_plans
         WHERE COALESCE(is_active, 1) = 1
         ORDER BY COALESCE(sort_order, 999999), id`,
      ).all();
      return jsonResponse({ plans: results || [] });
    } catch (e) {
      console.warn('[billing/plans]', e?.message ?? e);
      return jsonResponse({ error: String(e?.message || e) }, 500);
    }
  }

  if (pathLower === '/api/billing/subscription' && method === 'GET') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    const tenantId = await resolveTenantId(env, authUser);
    if (!tenantId) return jsonResponse({ error: 'Tenant not resolved' }, 400);
    try {
      const row = await env.DB.prepare(
        `SELECT bs.*, COALESCE(bp.display_name, bp.name) AS display_name, bp.features_json
         FROM billing_subscriptions bs
         JOIN billing_plans bp ON bs.plan_id = bp.id
         WHERE bs.tenant_id = ?`,
      )
        .bind(tenantId)
        .first();
      if (!row) return jsonResponse({ subscription: null }, 404);
      return jsonResponse({ subscription: row });
    } catch (e) {
      return jsonResponse({ error: String(e?.message || e) }, 500);
    }
  }

  if (pathLower === '/api/billing' && method === 'GET') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    const tenantId = await resolveTenantId(env, authUser);
    if (!tenantId) return jsonResponse({ error: 'Tenant not resolved' }, 400);
    try {
      const { results } = await env.DB.prepare(
        `SELECT bs.*, bp.name AS plan_display_name, bp.monthly_token_limit, bp.features_json,
          ba.account_email, ba.billing_name, ba.account_status
         FROM billing_subscriptions bs
         LEFT JOIN billing_plans bp ON bp.id = bs.plan_id
         LEFT JOIN billing_accounts ba ON ba.tenant_id = bs.tenant_id
         WHERE bs.tenant_id = ?
         ORDER BY bs.updated_at DESC LIMIT 100`,
      )
        .bind(tenantId)
        .all();
      return jsonResponse({ subscriptions: results || [] });
    } catch (e) {
      return jsonResponse({ error: String(e?.message || e) }, 500);
    }
  }

  if (pathLower === '/api/billing/checkout' && method === 'POST') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    const tenantId = await resolveTenantId(env, authUser);
    if (!tenantId) return jsonResponse({ error: 'Tenant not resolved' }, 400);

    let body = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }
    const planId = body.plan_id != null ? String(body.plan_id).trim() : '';
    const billingPeriod = body.billing_period != null ? String(body.billing_period).trim() : '';
    if (!planId) return jsonResponse({ error: 'plan_id required' }, 400);

    const plan = await env.DB.prepare(`SELECT * FROM billing_plans WHERE id = ? LIMIT 1`)
      .bind(planId)
      .first();
    if (!plan) return jsonResponse({ error: 'Plan not found' }, 404);

    const priceId = pickStripePriceId(plan, billingPeriod);
    if (!priceId) return jsonResponse({ error: 'Plan has no Stripe price configured' }, 400);

    const custRow = await env.DB.prepare(
      `SELECT stripe_customer_id FROM billing_customers WHERE tenant_id = ? LIMIT 1`,
    )
      .bind(tenantId)
      .first();
    const stripeCustomerId = custRow?.stripe_customer_id
      ? String(custRow.stripe_customer_id).trim()
      : '';
    const email =
      authUser.email && String(authUser.email).includes('@')
        ? String(authUser.email).trim()
        : '';

    const params = new URLSearchParams();
    params.set('mode', 'subscription');
    if (stripeCustomerId) {
      params.set('customer', stripeCustomerId);
    } else if (email) {
      params.set('customer_email', email);
    } else {
      return jsonResponse({ error: 'No customer email on account' }, 400);
    }
    params.append('line_items[0][price]', priceId);
    params.append('line_items[0][quantity]', '1');
    params.set('success_url', CHECKOUT_SUCCESS_URL);
    params.set('cancel_url', CHECKOUT_CANCEL_URL);
    params.set('metadata[tenant_id]', tenantId);
    params.set('metadata[plan_id]', planId);

    const trialDays = plan.trial_days != null ? Number(plan.trial_days) : 0;
    if (Number.isFinite(trialDays) && trialDays > 0) {
      params.set('subscription_data[trial_period_days]', String(Math.floor(trialDays)));
    }

    try {
      const session = await stripeRequest(env, 'POST', '/checkout/sessions', params);
      const checkoutUrl = session?.url ? String(session.url) : '';
      if (!checkoutUrl) return jsonResponse({ error: 'No checkout URL returned' }, 502);
      return jsonResponse({ checkout_url: checkoutUrl });
    } catch (e) {
      return jsonResponse({ error: String(e?.message || e) }, 502);
    }
  }

  if (pathLower === '/api/billing/portal' && method === 'POST') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    const tenantId = await resolveTenantId(env, authUser);
    if (!tenantId) return jsonResponse({ error: 'Tenant not resolved' }, 400);

    const custRow = await env.DB.prepare(
      `SELECT stripe_customer_id FROM billing_customers WHERE tenant_id = ? LIMIT 1`,
    )
      .bind(tenantId)
      .first();
    const stripeCustomerId = custRow?.stripe_customer_id
      ? String(custRow.stripe_customer_id).trim()
      : '';
    if (!stripeCustomerId) return jsonResponse({ error: 'No Stripe customer for tenant' }, 400);

    try {
      const portal = await stripeRequest(env, 'POST', '/billing_portal/sessions', {
        customer: stripeCustomerId,
        return_url: PORTAL_RETURN_URL,
      });
      const portalUrl = portal?.url ? String(portal.url) : '';
      if (!portalUrl) return jsonResponse({ error: 'No portal URL returned' }, 502);
      return jsonResponse({ portal_url: portalUrl });
    } catch (e) {
      return jsonResponse({ error: String(e?.message || e) }, 502);
    }
  }

  if (pathLower === '/api/billing/invoices' && method === 'GET') {
    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
    const tenantId = await resolveTenantId(env, authUser);
    if (!tenantId) return jsonResponse({ error: 'Tenant not resolved' }, 400);

    const custRow = await env.DB.prepare(
      `SELECT stripe_customer_id FROM billing_customers WHERE tenant_id = ? LIMIT 1`,
    )
      .bind(tenantId)
      .first();
    const stripeCustomerId = custRow?.stripe_customer_id
      ? String(custRow.stripe_customer_id).trim()
      : '';
    if (!stripeCustomerId) return jsonResponse({ invoices: [] });

    try {
      const list = await stripeRequest(env, 'GET', `/invoices?customer=${encodeURIComponent(stripeCustomerId)}&limit=10`);
      const data = Array.isArray(list?.data) ? list.data : [];
      const invoices = data.map(mapInvoiceSafe).filter(Boolean);
      return jsonResponse({ invoices });
    } catch (e) {
      return jsonResponse({ error: String(e?.message || e) }, 502);
    }
  }

  return jsonResponse({ error: 'Not found' }, 404);
}

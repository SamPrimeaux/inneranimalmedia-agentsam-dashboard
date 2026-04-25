/**
 * Cloudflare Access External Evaluation handler.
 *
 * Cloudflare Access flow:
 * - CF Access POSTs to this endpoint with header `Cf-Access-Jwt-Assertion: <jwt>`
 * - We verify the JWT signature using CF's public keys (JWKS)
 * - We extract email + aud claims
 * - We check D1 entitlements
 * - We return { success: true|false }
 */
import { jsonResponse } from '../core/auth.js';

// JWKS endpoint for your Zero Trust team domain
const CF_CERTS_URL = 'https://inneranimalmedia.cloudflareaccess.com/cdn-cgi/access/certs';

// Access Application AUD (Application ID from Zero Trust)
const EXPECTED_AUD = 'c0b2db17-f9c9-4a85-a106-ece501795795';

let cachedKeys = null;
let keyCacheTime = 0;
const KEY_CACHE_TTL_MS = 10 * 60 * 1000;

function base64UrlToUint8Array(b64url) {
  const b64 = String(b64url || '').replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  const raw = atob(b64 + pad);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function base64UrlJsonDecode(b64url) {
  const bytes = base64UrlToUint8Array(b64url);
  const json = new TextDecoder().decode(bytes);
  return JSON.parse(json);
}

async function getCFPublicKeys() {
  const now = Date.now();
  if (cachedKeys && now - keyCacheTime < KEY_CACHE_TTL_MS) return cachedKeys;

  const res = await fetch(CF_CERTS_URL, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Failed to fetch CF certs: ${res.status}`);
  const data = await res.json();
  const keys = Array.isArray(data?.keys) ? data.keys : [];
  cachedKeys = keys;
  keyCacheTime = now;
  return keys;
}

async function verifyCFAccessJWT(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT structure');

  const header = base64UrlJsonDecode(parts[0]);
  const payload = base64UrlJsonDecode(parts[1]);

  const now = Math.floor(Date.now() / 1000);
  if (payload?.exp != null && Number(payload.exp) < now) throw new Error('JWT expired');
  if (payload?.nbf != null && Number(payload.nbf) > now) throw new Error('JWT not yet valid');

  const audArr = Array.isArray(payload?.aud) ? payload.aud : payload?.aud != null ? [payload.aud] : [];
  if (!audArr.map(String).includes(EXPECTED_AUD)) {
    throw new Error(`JWT aud mismatch`);
  }

  const kid = header?.kid ? String(header.kid) : '';
  if (!kid) throw new Error('Missing kid');

  const keys = await getCFPublicKeys();
  const matchingKey = keys.find((k) => String(k?.kid || '') === kid);
  if (!matchingKey) throw new Error(`No matching key for kid: ${kid}`);

  const cryptoKey = await crypto.subtle.importKey(
    'jwk',
    matchingKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );

  const signedData = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const signature = base64UrlToUint8Array(parts[2]);
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', cryptoKey, signature, signedData);
  if (!valid) throw new Error('JWT signature verification failed');

  return payload;
}

async function resolveTenantFromEmail(db, email) {
  const em = String(email || '').trim();
  if (!em) return null;
  const authUser = await db
    .prepare(`SELECT tenant_id FROM auth_users WHERE LOWER(email) = LOWER(?) LIMIT 1`)
    .bind(em)
    .first()
    .catch(() => null);
  if (authUser?.tenant_id != null && String(authUser.tenant_id).trim() !== '') return String(authUser.tenant_id).trim();

  const user = await db
    .prepare(`SELECT tenant_id FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1`)
    .bind(em)
    .first()
    .catch(() => null);
  if (user?.tenant_id != null && String(user.tenant_id).trim() !== '') return String(user.tenant_id).trim();

  return null;
}

async function checkEntitlement(db, email, tenantId, service = 'mcp') {
  const nowIso = new Date().toISOString();
  const em = email != null && String(email).trim() !== '' ? String(email).trim().toLowerCase() : null;
  const tid = tenantId != null && String(tenantId).trim() !== '' ? String(tenantId).trim() : null;

  // Explicit user rule first (deny/allow)
  if (em) {
    const row = await db
      .prepare(
        `SELECT effect
         FROM mcp_entitlements
         WHERE service = ?
           AND LOWER(user_email) = LOWER(?)
           AND (expires_at IS NULL OR expires_at > ?)
         ORDER BY created_at DESC
         LIMIT 1`,
      )
      .bind(service, em, nowIso)
      .first()
      .catch(() => null);
    if (row?.effect) return String(row.effect).toLowerCase() === 'allow';
  }

  // Tenant-wide rule (user_email NULL)
  if (tid) {
    const row = await db
      .prepare(
        `SELECT effect
         FROM mcp_entitlements
         WHERE service = ?
           AND tenant_id = ?
           AND user_email IS NULL
           AND (expires_at IS NULL OR expires_at > ?)
         ORDER BY created_at DESC
         LIMIT 1`,
      )
      .bind(service, tid, nowIso)
      .first()
      .catch(() => null);
    if (row?.effect) return String(row.effect).toLowerCase() === 'allow';
  }

  return false;
}

export async function handleAccessEvaluate(request, env) {
  if ((request.method || '').toUpperCase() !== 'POST') {
    return jsonResponse({ success: false, error: 'Method not allowed' }, 405);
  }
  if (!env?.DB) {
    return jsonResponse({ success: false, error: 'DB not configured' }, 200);
  }

  const jwtToken = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!jwtToken) {
    return jsonResponse({ success: false, error: 'Missing Cf-Access-Jwt-Assertion header' }, 400);
  }

  try {
    const payload = await verifyCFAccessJWT(jwtToken);
    const email = payload?.email != null ? String(payload.email) : null;
    const tenantId = email ? await resolveTenantFromEmail(env.DB, email) : null;
    const allowed = await checkEntitlement(env.DB, email, tenantId, 'mcp');
    console.log(`[access/evaluate/mcp] email=${email || 'null'} tenant=${tenantId || 'null'} allowed=${allowed}`);
    return jsonResponse({ success: allowed }, 200);
  } catch (e) {
    console.error('[access/evaluate/mcp] deny', e?.message ?? e);
    // Cloudflare Access expects a 200 with success:false to deny.
    return jsonResponse({ success: false }, 200);
  }
}


/**
 * POST /api/notify/deploy-complete
 * Internal: sends Resend emails to Sam + Connor with Meet link after production deploy.
 * Auth: INTERNAL_API_SECRET (X-Internal-Secret or Bearer).
 */
import { verifyInternalApiSecret, jsonResponse } from '../core/auth.js';

const MEET_URL = 'https://inneranimalmedia.com/dashboard/meet?room=iam-sam-connor-live';

function deployEmailHtml(meetUrl) {
  return `
<div style="font-family:'Courier New',monospace;background:#00212b;color:#b0c4ce;padding:32px;border:1px solid #1e3e4a;max-width:520px;margin:0 auto;">
  <div style="color:#2dd4bf;font-size:13px;margin-bottom:20px;">Inner Animal Media — Deploy Complete</div>
  <p style="color:#e8f4f8;font-size:16px;margin:0 0 12px;">Production is live.</p>
  <p style="color:#7a9aaa;font-size:12px;margin:0 0 24px;">The latest build just deployed successfully. Join the live session now.</p>
  <a href="${meetUrl}" style="display:inline-block;padding:12px 28px;background:#2dd4bf;color:#00212b;font-family:'Courier New',monospace;font-size:13px;font-weight:bold;text-decoration:none;border-radius:4px;">Join Live Session →</a>
  <p style="margin:20px 0 0;color:#2a4a5a;font-size:10px;">${meetUrl}</p>
  <div style="margin-top:28px;padding-top:20px;border-top:1px solid #1e3e4a;">
    <img src="https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/238de9d1-a470-4fe5-5424-9182f4bc0500/medium" width="100" style="opacity:0.7;" />
  </div>
</div>`;
}

async function sendResendEmail(env, { to, subject, html }) {
  const key = env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY not configured');
  const from = env.EMAIL_FROM || 'Inner Animal Media <noreply@inneranimalmedia.com>';
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Resend ${res.status}: ${t.slice(0, 200)}`);
  }
}

export async function handleNotifyDeployComplete(request, env, ctx) {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }
  if (!verifyInternalApiSecret(request, env)) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const meetUrl = MEET_URL;
  const html = deployEmailHtml(meetUrl);

  const work = (async () => {
    await Promise.all([
      sendResendEmail(env, {
        to: 'sam@inneranimalmedia.com',
        subject: '🚀 Production deployed — join Connor now',
        html,
      }),
      sendResendEmail(env, {
        to: 'connordmcneely@leadershiplegacydigital.com',
        subject: 'IAM platform updated — join Sam now',
        html,
      }),
    ]);
  })();

  if (ctx?.waitUntil) ctx.waitUntil(work.catch((e) => console.warn('[notify-deploy-complete]', e?.message ?? e)));
  else await work.catch((e) => console.warn('[notify-deploy-complete]', e?.message ?? e));

  return jsonResponse({ ok: true, queued: true, meet_url: meetUrl });
}

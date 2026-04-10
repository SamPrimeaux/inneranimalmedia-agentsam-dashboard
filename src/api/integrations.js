// src/api/integrations.js
/**
 * API Service: Integrations Controller
 * Orchestrates incoming webhooks from external platforms (BlueBubbles, WhatsApp, etc).
 */
import { jsonResponse } from '../core/auth.js';
import { recordWorkerAnalyticsError } from './telemetry.js';

/**
 * Main switch-board for Integration webhooks.
 */
export async function handleIntegrationsRequest(request, env, ctx) {
    const url = new URL(request.url);
    const pathLower = url.pathname.toLowerCase().replace(/\/$/, '') || '/';
    const method = request.method.toUpperCase();

    // 1. BlueBubbles Webhook Gate
    if (pathLower === '/api/integrations/bluebubbles/webhook' && method === 'POST') {
        return handleBlueBubblesWebhook(request, env, ctx);
    }

    // 2. Resend General Webhook Hook
    if ((pathLower === '/api/integrations/resend/webhook' || pathLower === '/api/webhooks/resend') && method === 'POST') {
        const secret = request.headers.get('X-Resend-Webhook-Secret') || url.searchParams.get('secret');
        if (env.RESEND_WEBHOOK_SECRET && secret !== env.RESEND_WEBHOOK_SECRET) {
            return jsonResponse({ error: 'Invalid webhook secret' }, 403);
        }
        return handleResendWebhook(request, env, ctx);
    }

    // 3. Resend Inbound Email Hook (Explicit path)
    if (pathLower === '/api/email/inbound' && method === 'POST') {
        const secret = request.headers.get('X-Resend-Inbound-Secret') || url.searchParams.get('secret');
        if (env.RESEND_INBOUND_WEBHOOK_SECRET && secret !== env.RESEND_INBOUND_WEBHOOK_SECRET) {
            return jsonResponse({ error: 'Invalid inbound secret' }, 403);
        }
        return handleResendWebhook(request, env, ctx);
    }

    return jsonResponse({ error: 'Integration route not found' }, 404);
}

/**
 * 🧱 handleBlueBubblesWebhook: Native Chat Brain Hub
 * Receives messages from BlueBubbles and triggers Agent Sam reasoning.
 */
async function handleBlueBubblesWebhook(request, env, ctx) {
    try {
        const body = await request.json();
        const type = body.type; // e.g. "new-message"

        if (type !== 'new-message') {
            return jsonResponse({ status: 'ignored', type });
        }

        const msg = body.data; // BlueBubbles message object
        const text = msg.text;
        const sender = msg.handle?.address || 'unknown';
        const chatGuid = msg.chatGuid;

        console.log(`[iMessage] New message from ${sender}: ${text}`);

        // 🧱 Hook Resolution Engine
        const hook = await env.DB.prepare(
            `SELECT * FROM agentsam_hook 
             WHERE provider = 'imessage' AND external_id = ? AND trigger = 'imessage_reply' AND is_active = 1
             LIMIT 1`
        ).bind(chatGuid).first();

        if (hook) {
            console.log(`[iMessage] Found active hook for ${chatGuid} -> Targeting ${hook.target_id}`);
            
            // Append to agent_messages
            await env.DB.prepare(
                `INSERT INTO agent_messages (id, conversation_id, role, content, provider, created_at)
                 VALUES (?, ?, ?, ?, ?, ?)`
            ).bind(
                crypto.randomUUID(),
                hook.target_id,
                'user',
                text,
                'imessage',
                Math.floor(Date.now() / 1000)
            ).run();

            // Note: In a full implementation, we might trigger an asynchronous agent reasoning task here.
        }
        
        return jsonResponse({ 
            status: 'received', 
            message_id: msg.guid,
            source: 'bluebubbles',
            hook_matched: !!hook
        });

    } catch (e) {
        console.error('[BlueBubbles Webhook Error]', e.message);
        ctx.waitUntil(recordWorkerAnalyticsError(env, {
            path: '/api/integrations/bluebubbles/webhook',
            method: 'POST',
            error_message: e.message
        }));
        return jsonResponse({ error: 'Webhook processing failed' }, 500);
    }
}

/**
 * 🧱 handleResendWebhook: Inbound Email Reply Hub
 * Processes inbound emails from Resend and matches them to active agent hooks.
 */
async function handleResendWebhook(request, env, ctx) {
    try {
        const body = await request.json();
        const { from, subject, text, to } = body.data || body; // Format varies based on Resend setup

        const senderEmail = from?.email || from;
        console.log(`[Resend] New inbound email from ${senderEmail}: ${subject}`);

        // 🧱 Hook Resolution Engine
        const hook = await env.DB.prepare(
            `SELECT * FROM agentsam_hook 
             WHERE provider = 'resend' AND external_id = ? AND trigger = 'email_reply' AND is_active = 1
             LIMIT 1`
        ).bind(senderEmail).first();

        if (hook) {
            console.log(`[Resend] Found active hook for ${senderEmail} -> Targeting ${hook.target_id}`);
            
            // Append to agent_messages
            await env.DB.prepare(
                `INSERT INTO agent_messages (id, conversation_id, role, content, provider, created_at)
                 VALUES (?, ?, ?, ?, ?, ?)`
            ).bind(
                crypto.randomUUID(),
                hook.target_id,
                'user',
                `[Email Reply] Subject: ${subject}\n\n${text}`,
                'resend',
                Math.floor(Date.now() / 1000)
            ).run();
        }

        return jsonResponse({ 
            status: 'received', 
            source: 'resend',
            hook_matched: !!hook
        });

    } catch (e) {
        console.error('[Resend Webhook Error]', e.message);
        ctx.waitUntil(recordWorkerAnalyticsError(env, {
            path: '/api/integrations/resend/webhook',
            method: 'POST',
            error_message: e.message
        }));
        return jsonResponse({ error: 'Email webhook processing failed' }, 500);
    }
}

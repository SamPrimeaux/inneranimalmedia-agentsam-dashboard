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

        // TODO: Official Trigger logic for Agent Sam (Phase 20 expansion)
        // For now, we acknowledge reception and log to telemetry.
        
        return jsonResponse({ 
            status: 'received', 
            message_id: msg.guid,
            source: 'bluebubbles'
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

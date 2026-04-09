import { jsonResponse } from '../core/responses.js';
import { getAuthUser } from '../core/auth.js';

/**
 * Google Vertex AI Integration (Enterprise Modular Port).
 * Handles GCP-based Gemini models with secure OAuth2 authentication.
 */

/**
 * Retrieves a Google Cloud Access Token for Vertex AI.
 * Logic ported from monolithic worker.js.
 */
async function getVertexAccessToken(env) {
    const creds = env.GOOGLE_VERTEX_SA_JSON;
    if (!creds) {
        console.warn('[Vertex] GOOGLE_VERTEX_SA_JSON not set');
        return null;
    }

    try {
        const sa = typeof creds === 'string' ? JSON.parse(creds) : creds;
        // In a real Worker environment, this would use a Service Account JWT exchange
        // or a KV-cached token from a background refresh job.
        return sa.access_token || env.VERTEX_BEARER_TOKEN;
    } catch (e) {
        console.error('[Vertex] Auth failed:', e.message);
        return null;
    }
}

/**
 * The Core Vertex AI Engine.
 */
export async function chatWithToolsVertex(env, request, params) {
    const { 
        modelKey, 
        messages, 
        tools: toolDefinitions,
        systemPrompt,
        region = 'us-central1'
    } = params;

    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);

    const accessToken = await getVertexAccessToken(env);
    if (!accessToken) return jsonResponse({ error: 'Vertex authentication failed' }, 503);

    const projectId = env.GOOGLE_CLOUD_PROJECT_ID;
    const modelId = modelKey || 'gemini-1.5-pro';
    
    // Initial SSE Setup
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    (async () => {
        try {
            const endpoint = `https://${region}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${region}/publishers/google/models/${modelId}:streamGenerateContent`;

            const body = {
                contents: messages.map(m => ({
                    role: m.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: m.content }]
                })),
                system_instruction: {
                    parts: [{ text: systemPrompt }]
                },
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 8192
                }
            };

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const err = await response.text();
                await writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'error', message: err })}\n\n`));
                return;
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                await writer.write(encoder.encode(decoder.decode(value)));
            }
        } catch (e) {
            await writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'error', message: e.message })}\n\n`));
        } finally {
            await writer.close();
        }
    })();

    return new Response(readable, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        }
    });
}

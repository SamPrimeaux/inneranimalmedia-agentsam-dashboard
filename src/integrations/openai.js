import { jsonResponse } from '../core/responses.js';
import { getAuthUser } from '../core/auth.js';

/**
 * OpenAI Service Integration (Modular Port).
 * Handles GPT-4o streaming and tool-calling interactions.
 */

/**
 * Normalizes tool definitions for the OpenAI schema.
 */
export function normalizeOpenAITools(tools) {
    if (!Array.isArray(tools)) return undefined;
    
    return tools.map(t => {
        let parameters = { type: 'object', properties: {} };
        try {
            const raw = typeof t.input_schema === 'string' ? JSON.parse(t.input_schema) : (t.input_schema || {});
            if (raw && raw.type === 'object') parameters = raw;
        } catch (_) {}

        return {
            type: 'function',
            function: {
                name: t.tool_name || t.name,
                description: (t.description || t.tool_name || '').slice(0, 500),
                parameters
            }
        };
    });
}

/**
 * The Core OpenAI Engine.
 */
export async function chatWithToolsOpenAI(env, request, params) {
    const { 
        modelKey, 
        messages, 
        tools: toolDefinitions,
        systemPrompt 
    } = params;

    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);

    const apiKey = (env.OPENAI_API_KEY || '').trim();
    if (!apiKey) return jsonResponse({ error: 'OpenAI API key not configured' }, 503);

    const openAiTools = normalizeOpenAITools(toolDefinitions);

    // Initial SSE Setup
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    (async () => {
        try {
            const body = {
                model: modelKey || 'gpt-4o',
                messages: [
                    { role: 'system', content: systemPrompt },
                    ...messages.map(m => ({ role: m.role, content: m.content }))
                ],
                tools: openAiTools,
                stream: true
            };

            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
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

                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');

                for (const line of lines) {
                    const cleanLine = line.replace(/^data: /, '').trim();
                    if (!cleanLine || cleanLine === '[DONE]') continue;

                    try {
                        const json = JSON.parse(cleanLine);
                        // Forward the choices/delta directly to the frontend stream
                        await writer.write(encoder.encode(`data: ${JSON.stringify(json)}\n\n`));
                    } catch (_) {}
                }
            }

            await writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
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

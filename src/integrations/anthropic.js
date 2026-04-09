import { jsonResponse } from '../core/responses.js';
import { getAuthUser } from '../core/auth.js';

/**
 * Standardizes Anthropic model keys for API requests.
 */
function resolveAnthropicModelKey(modelKey) {
  if (!modelKey) return 'claude-3-5-sonnet-20240620';
  if (modelKey.includes('sonnet')) return 'claude-3-5-sonnet-20240620';
  if (modelKey.includes('haiku')) return 'claude-3-5-haiku-20241022';
  if (modelKey.includes('opus')) return 'claude-3-opus-20240229';
  return modelKey;
}

/**
 * Normalizes tool definitions from D1 into Anthropic's tool schema.
 */
export function normalizeAnthropicTools(tools) {
  if (!Array.isArray(tools)) return [];
  return tools.map(t => {
    let rawSchema = {};
    try { 
      rawSchema = typeof t.input_schema === 'string' ? JSON.parse(t.input_schema) : (t.input_schema || {}); 
    } catch (_) { rawSchema = { type: 'object', properties: {} }; }
    
    let input_schema;
    if (rawSchema && rawSchema.type === 'object' && rawSchema.properties) {
      input_schema = rawSchema;
    } else {
      input_schema = { type: 'object', properties: {}, required: [] };
    }
    
    return {
      name: t.tool_name || t.name,
      description: (t.description || t.tool_name || '').slice(0, 500),
      input_schema
    };
  });
}

/**
 * The Core Anthropic Engine (Modular Port).
 * Handles streaming, tool-calls, and SSE event generation.
 */
export async function chatWithToolsAnthropic(env, request, params) {
    const { 
        modelKey, 
        systemPrompt, 
        messages, 
        tools: toolDefinitions,
        agentId,
        conversationId 
    } = params;

    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);

    const apiKey = (env.ANTHROPIC_API_KEY || '').trim();
    if (!apiKey) return jsonResponse({ error: 'Anthropic API key not configured' }, 503);

    const resolvedModel = resolveAnthropicModelKey(modelKey);
    const anthropicTools = normalizeAnthropicTools(toolDefinitions);

    // Initial SSE Setup
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    // Start background loop for the Anthropic conversation
    (async () => {
        try {
            const body = {
                model: resolvedModel,
                max_tokens: 8192,
                system: [{ type: 'text', text: systemPrompt }],
                messages: messages.map(m => ({ role: m.role, content: m.content })),
                tools: anthropicTools,
                stream: true
            };

            const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                    'content-type': 'application/json'
                },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const err = await response.text();
                await writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'error', message: err })}\n\n`));
                await writer.close();
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
                    if (line.startsWith('data: ')) {
                        // Forward raw events or transform for iam_ specific events
                        await writer.write(encoder.encode(line + '\n\n'));
                    }
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

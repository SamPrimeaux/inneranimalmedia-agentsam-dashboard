/**
 * API Service: Agent Sam Reasoning Engine
 * Handles AI chat, SSE streaming, tool-loop orchestration, and Claude v4.6 features.
 * Deconstructed from legacy worker.js.
 */
import { chatWithAnthropic } from '../integrations/anthropic';
import { unifiedRagSearch } from './rag';
import { writeTelemetry, computeUsdFromModelRatesRow } from './telemetry';
import { runTerminalCommand, resolveIamWorkspaceRoot } from '../core/terminal';
import { getAuthUser, getSession, isIngestSecretAuthorized, jsonResponse } from '../core/auth';
import { notifySam } from '../core/notifications';

/**
 * Main switch-board for Agent Sam API requests.
 */
export async function handleAgentRequest(request, env, ctx) {
  const url = new URL(request.url);
  const pathLower = url.pathname.toLowerCase().replace(/\/$/, '') || '/';
  const method = request.method.toUpperCase();

  // Authentication & Authorization Gate
  const ingestBypass = isIngestSecretAuthorized(request, env);
  let session = null;
  if (!ingestBypass) {
    session = await getSession(env, request);
    if (!session?.user_id) return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  // Routing to specific handlers
  if (pathLower === '/api/agent/chat' && method === 'POST') {
    return agentChatSseHandler(env, request, ctx, session);
  }

  if (pathLower === '/api/agent/rag/query' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const out = await unifiedRagSearch(env, body.query || '', body);
    return jsonResponse(out);
  }

  return jsonResponse({ error: 'Agent route not found' }, 404);
}

/**
 * Production SSE Handler for Agent Sam Chat.
 * Fully integrated with Anthropic SDK and modular Telemetry.
 */
export async function agentChatSseHandler(env, request, ctx, session) {
  const body = await request.json().catch(() => ({}));
  const message = (body.message || '').trim();
  const modelKey = body.model || 'claude-3-5-sonnet-20241022';
  
  if (!message) return jsonResponse({ error: 'message required' }, 400);

  // 1. RAG Context Injection
  const rag = await unifiedRagSearch(env, message, { topK: 5, conversation_id: body.conversationId });
  const contextText = rag.matches.join('\n\n');
  
  const systemPrompt = `You are Agent Sam, a powerful AI coding assistant. 
Context from memory:\n${contextText}\n\nAlways provide efficient, production-ready code.`;

  // 2. Initial Chat Request (Streaming)
  try {
    const stream = await chatWithAnthropic({
      messages: body.messages || [{ role: 'user', content: message }],
      tools: body.tools || [], 
      env,
      options: {
        model: modelKey,
        systemPrompt,
        thinking: body.thinking,
        thinkingBudget: body.thinkingBudget,
        tool_choice: body.tool_choice
      }
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        let lastUsage = null;
        let lastSignature = null;

        for await (const chunk of stream) {
          // Handle standardized content blocks
          if (chunk.type === 'content_block_start') {
            const block = chunk.content_block;
            if (block.type === 'thinking') {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'thinking_start' })}\n\n`));
            }
          }

          if (chunk.type === 'content_block_delta') {
            const delta = chunk.delta;
            if (delta.type === 'text_delta') {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'text', text: delta.text })}\n\n`));
            } else if (delta.type === 'thinking_delta') {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'thinking', text: delta.thinking })}\n\n`));
            } else if (delta.type === 'signature_delta') {
              lastSignature = delta.signature;
            }
          }

          // Handle message-level metadata and usage
          if (chunk.type === 'message_start') {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'id', id: chunk.message.id })}\n\n`));
          }

          if (chunk.type === 'message_delta') {
            if (chunk.usage) lastUsage = chunk.usage;
            if (chunk.delta.stop_reason) {
               controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'stop', reason: chunk.delta.stop_reason })}\n\n`));
            }
          }

          if (chunk.type === 'message_stop') {
            // Final usage sync to Telemetry
            if (lastUsage) {
              ctx.waitUntil(writeTelemetry(env, {
                sessionId: body.sessionId || body.conversationId,
                tenantId: session?.tenant_id,
                provider: 'anthropic',
                model: modelKey,
                inputTokens: lastUsage.input_tokens || 0,
                outputTokens: lastUsage.output_tokens || 0,
                cacheReadTokens: lastUsage.cache_read_input_tokens || 0,
                cacheWriteTokens: lastUsage.cache_creation_input_tokens || 0,
                success: true
              }));
            }
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done', signature: lastSignature })}\n\n`));
          }
        }
        controller.close();
      }
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      }
    });

  } catch (e) {
    console.error('[agentChatSseHandler] Error:', e.message);
    return jsonResponse({ error: 'Stream failed', detail: e.message }, 500);
  }
}

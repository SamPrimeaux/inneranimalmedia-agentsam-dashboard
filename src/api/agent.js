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

import { getAgentMetadata, logSkillInvocation, getActivePromptByWeight, getPromptMetadata } from './agentsam';

/**
 * Production SSE Handler for Agent Sam Chat.
 * Fully integrated with Anthropic SDK and the agentsam_ai/agentsam_prompt registries.
 */
export async function agentChatSseHandler(env, request, ctx, session) {
  const body = await request.json().catch(() => ({}));
  const message = (body.message || '').trim();
  
  // 1. Registry-Driven Agent Lookup (SOTA)
  const agentRole = body.role || 'orchestrator';
  const agentId = body.agentId || `agent_sam_${agentRole}`;
  const agent = await getAgentMetadata(env, agentId);
  
  // 2. SOTA Prompt Registry Lookup (A/B Testing Tier)
  let activePrompt = null;
  const promptHandle = body.promptHandle || body.promptGroup;
  
  if (body.promptId) {
    activePrompt = await getPromptMetadata(env, body.promptId);
  } else if (promptHandle) {
    activePrompt = await getActivePromptByWeight(env, promptHandle);
  }

  const modelKey = activePrompt?.model_hint || agent.model_policy?.model_key || body.model || 'claude-3-7-sonnet-20250219';
  const thinkingMode = agent.thinking_mode || 'adaptive';
  const effort = agent.effort || body.effort || 'medium';

  if (!message) return jsonResponse({ error: 'message required' }, 400);

  // 3. RAG Context Injection
  const rag = await unifiedRagSearch(env, message, { topK: 5, conversation_id: body.conversationId });
  const contextText = rag.matches.join('\n\n');
  
  // Registry Prompt Inheritance Logic
  const basePrompt = activePrompt?.prompt_template || agent.system_prompt || `You are Agent Sam, a powerful AI coding assistant.
Always provide efficient, production-ready code.`;
  const systemPrompt = basePrompt + `\n\nContext from memory:\n${contextText}`;

  // 4. Initial Chat Request (SOTA Streaming)
  try {
    const stream = await chatWithAnthropic({
      messages: body.messages || [{ role: 'user', content: message }],
      tools: body.tools || [], 
      env,
      options: {
        model: modelKey,
        systemPrompt,
        thinking: { type: thinkingMode, effort },
        inference_geo: body.inference_geo || agent.model_policy?.inference_geo,
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

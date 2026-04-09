/**
 * Integration: Anthropic
 * Refactored: Official Anthropic TypeScript SDK Integration.
 * Handles tool-calling, streaming, and v4.6 features (Caching, Batching).
 * Zero-hardcoding: Model parameters and feature flags are DB-driven.
 */

import Anthropic from '@anthropic-ai/sdk';
import { handlers as dbHandlers } from '../tools/db.js';

/**
 * Executes a tool-aware chat completion using the official Anthropic SDK.
 */
export async function chatWithAnthropic({ messages, tools, env, options = {} }) {
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY missing from environment');

  const client = new Anthropic({ apiKey });
  const modelKey = options.model || 'claude-3-5-sonnet-20240620';
  
  // Dynamic feature and rate lookup from D1 (Zero-Hardcoding Compliance)
  const modelInfo = await dbHandlers.d1_query({ 
    sql: "SELECT * FROM ai_models WHERE model_key = ?", 
    params: [modelKey] 
  }, env);
  
  const modelData = modelInfo.results?.[0] || {};
  const features = JSON.parse(modelData.features_json || '{}');
  const betas = [];
  
  if (features.prompt_caching) betas.push('prompt-caching-2024-07-31');
  if (features.thinking) betas.push('thinking-2024-10-22');

  const streamParams = {
    model: modelKey,
    max_tokens: options.max_tokens || 4096,
    system: options.systemPrompt || 'You are Agent Sam, a high-performance coding assistant.',
    messages: messages.map(m => ({
      role: m.role,
      content: m.content
    })).filter(m => m.role !== 'system'),
    tools: tools.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters
    })),
    stream: true,
    betas: betas.length > 0 ? betas : undefined
  };

  // Extended Thinking Budget (Dynamic for Opus/Sonnet 4.6)
  if (features.thinking && options.thinkingBudget) {
    streamParams.thinking = { type: 'enabled', budget_tokens: options.thinkingBudget };
  }

  // Use the standard Message creation stream
  const response = await client.messages.create(streamParams);

  // Return the async iterable stream for the Agent Sam Reasoning Loop
  return response;
}

/**
 * Asynchronous Message Batch handler.
 * Leverages the SDK's batches namespace for high-volume background tasks.
 */
export async function createAnthropicBatch({ requests, env }) {
  const apiKey = env.ANTHROPIC_API_KEY;
  const client = new Anthropic({ apiKey });
  
  return await client.messages.batches.create({ requests });
}

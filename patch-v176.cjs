#!/usr/bin/env node
/**
 * patch-v176.js
 * Applies two surgical changes to worker.js:
 *
 * CHANGE 1 — Insert `executeToolCall` wrapper function before `runToolLoop`
 *   Wraps invokeMcpToolFromChat, normalizes return to string.
 *   Used by both runToolLoop and streamOpenAIResponses.
 *
 * CHANGE 2 — Replace streamOpenAIResponses ReadableStream block
 *   Switches from pull-based single-pass to start-based tool loop.
 *   Handles response.output_item.done (function_call) events.
 *   Executes tools via executeToolCall, loops up to 5 rounds.
 *
 * Usage:
 *   cp worker.js worker.js.bak-v175
 *   node patch-v176.js
 *   grep -c "executeToolCall" worker.js   # should be >= 3
 */

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'worker.js');
let src = fs.readFileSync(filePath, 'utf8');
const original = src;

// ─────────────────────────────────────────────────────────────────────────────
// CHANGE 1: Insert executeToolCall before runToolLoop
// ─────────────────────────────────────────────────────────────────────────────

const EXECUTE_TOOL_CALL_FN = `
/**
 * executeToolCall — unified tool executor for all providers.
 * Wraps invokeMcpToolFromChat and normalizes the return to a plain string
 * so streamOpenAIResponses and runToolLoop share a single execution path.
 */
async function executeToolCall(env, request, toolName, params, conversationId, executionCtx, opts = {}) {
  try {
    const out = await invokeMcpToolFromChat(env, toolName, params, conversationId, {
      allowRemoteMcp: true,
      executionCtx,
      ...opts,
    });
    if (out && out.error) return JSON.stringify({ error: out.error });
    if (typeof out.result === 'string') return out.result;
    return JSON.stringify(out.result || {});
  } catch (e) {
    return JSON.stringify({ error: e?.message ?? String(e) });
  }
}

`;

const RUNTOOLLOOP_ANCHOR = 'async function runToolLoop(env, request, provider, modelKey, systemWithBlurb, apiMessages, toolDefinitions, modelRow, agent_id, conversationId, attachedFilesFromRequest, executionCtx, images = []) {';

if (!src.includes(RUNTOOLLOOP_ANCHOR)) {
  console.error('ERROR: runToolLoop anchor not found. Aborting.');
  process.exit(1);
}
if (src.includes('async function executeToolCall(')) {
  console.log('SKIP: executeToolCall already exists.');
} else {
  src = src.replace(RUNTOOLLOOP_ANCHOR, EXECUTE_TOOL_CALL_FN + RUNTOOLLOOP_ANCHOR);
  console.log('OK: Inserted executeToolCall before runToolLoop.');
}

// ─────────────────────────────────────────────────────────────────────────────
// CHANGE 2: Replace streamOpenAIResponses ReadableStream block
// ─────────────────────────────────────────────────────────────────────────────

// Unique start anchor — the reader/decoder/buffer setup right after the resp.ok check
const OLD_STREAM_BLOCK_START = `  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  let inputTokens = 0;
  let outputTokens = 0;
  const readable = new ReadableStream({
    async pull(controller) {
      const enc = new TextEncoder();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const raw = line.slice(6).trim();
            if (raw === '[DONE]') continue;
            try {
              const data = JSON.parse(raw);
              // Responses API delta events
              if (data.type === 'response.output_text.delta' || data.type === 'response.text.delta') {
                const text = data.delta || '';
                if (text) { fullText += text; controller.enqueue(enc.encode(\`data: \${JSON.stringify({ type: 'text', text })}\\n\\n\`)); }
              }
              if (data.type === 'response.completed' && data.response?.usage) {
                inputTokens = data.response.usage.input_tokens ?? 0;
                outputTokens = data.response.usage.output_tokens ?? 0;
              }
            } catch (_) {}
          }
        }
        const costUsd = calculateCost(modelRow, inputTokens, outputTokens);
        await streamDoneDbWrites(env, conversationId, modelRow, fullText, inputTokens, outputTokens, costUsd, agent_id, ctx, getLastUserMessageText(apiMessages));
        controller.enqueue(enc.encode(\`data: \${JSON.stringify({ type: 'done', input_tokens: inputTokens, output_tokens: outputTokens, cost_usd: costUsd, conversation_id: conversationId, model_used: modelKey })}\\n\\n\`));
      } catch(e) {
        controller.enqueue(enc.encode(\`data: \${JSON.stringify({ type: 'error', error: e?.message ?? String(e) })}\\n\\n\`));
      } finally {
        reader.releaseLock();
        controller.close();
      }
    }
  });
  return new Response(readable, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' } });
}`;

const NEW_STREAM_BLOCK = `  let fullText = '';
  let inputTokens = 0;
  let outputTokens = 0;
  // Tool-aware multi-round streaming loop for Responses API
  let currentInputMsgs = [...inputMsgs];
  const readable = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      let toolRound = 0;
      const MAX_TOOL_ROUNDS = 5;
      while (toolRound <= MAX_TOOL_ROUNDS) {
        // Round 0 reuses the already-fetched resp; subsequent rounds re-fetch with updated input
        let currentResp = resp;
        if (toolRound > 0) {
          currentResp = await fetch('https://api.openai.com/v1/responses', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': \`Bearer \${env.OPENAI_API_KEY}\` },
            body: JSON.stringify({
              model: modelKey,
              input: currentInputMsgs,
              stream: true,
              store: true,
              ...reasoningConfig,
              ...(tools ? { tools } : {}),
            }),
          });
          if (!currentResp.ok) {
            const errData = await currentResp.json().catch(() => ({}));
            controller.enqueue(enc.encode(\`data: \${JSON.stringify({ type: 'error', error: errData?.error?.message ?? \`OpenAI error \${currentResp.status}\` })}\\n\\n\`));
            break;
          }
        }
        const roundReader = currentResp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        const roundToolCalls = [];
        const outputItems = [];
        const pendingFnArgs = {};
        try {
          for (;;) {
            const { done, value } = await roundReader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\\n');
            buffer = lines.pop() || '';
            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;
              const raw = line.slice(6).trim();
              if (raw === '[DONE]') continue;
              try {
                const data = JSON.parse(raw);
                // Stream text to client
                if (data.type === 'response.output_text.delta' || data.type === 'response.text.delta') {
                  const text = data.delta || '';
                  if (text) { fullText += text; controller.enqueue(enc.encode(\`data: \${JSON.stringify({ type: 'text', text })}\\n\\n\`)); }
                }
                // Accumulate function call arguments by item_id
                if (data.type === 'response.function_call_arguments.delta') {
                  const callId = data.item_id || data.call_id;
                  if (callId) { if (!pendingFnArgs[callId]) pendingFnArgs[callId] = ''; pendingFnArgs[callId] += data.delta || ''; }
                }
                // Capture completed output items (text blocks + function_call blocks)
                if (data.type === 'response.output_item.done' && data.item) {
                  outputItems.push(data.item);
                  if (data.item.type === 'function_call') roundToolCalls.push(data.item);
                }
                // Final usage
                if (data.type === 'response.completed' && data.response?.usage) {
                  inputTokens = data.response.usage.input_tokens ?? 0;
                  outputTokens = data.response.usage.output_tokens ?? 0;
                }
              } catch (_) {}
            }
          }
        } finally {
          roundReader.releaseLock();
        }
        // No tool calls this round → done
        if (roundToolCalls.length === 0) break;
        toolRound++;
        if (toolRound > MAX_TOOL_ROUNDS) break;
        // Execute all tool calls (parallel)
        const toolOutputItems = await Promise.all(roundToolCalls.map(async (tc) => {
          const name = tc.name;
          const args = tc.arguments || pendingFnArgs[tc.id] || '{}';
          let tcParams = {};
          try { tcParams = JSON.parse(args); } catch (_) {}
          console.log('[streamOpenAIResponses] tool call', name, Object.keys(tcParams));
          controller.enqueue(enc.encode(\`data: \${JSON.stringify({ type: 'tool_start', tool: name, label: name })}\\n\\n\`));
          const resultStr = await executeToolCall(env, request, name, tcParams, conversationId, ctx, {});
          return { type: 'function_call_output', call_id: tc.id, output: resultStr };
        }));
        // Build next round input: prior input + this round's output items + tool results
        currentInputMsgs = [...currentInputMsgs, ...outputItems, ...toolOutputItems];
      }
      const costUsd = calculateCost(modelRow, inputTokens, outputTokens);
      await streamDoneDbWrites(env, conversationId, modelRow, fullText, inputTokens, outputTokens, costUsd, agent_id, ctx, getLastUserMessageText(apiMessages));
      controller.enqueue(enc.encode(\`data: \${JSON.stringify({ type: 'done', input_tokens: inputTokens, output_tokens: outputTokens, cost_usd: costUsd, conversation_id: conversationId, model_used: modelKey })}\\n\\n\`));
      controller.close();
    },
  });
  return new Response(readable, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' } });
}`;

if (!src.includes(OLD_STREAM_BLOCK_START)) {
  console.error('ERROR: streamOpenAIResponses ReadableStream anchor not found.');
  console.error('The existing code may have already been patched, or whitespace differs.');
  console.error('Manual patch required — see patch-v176-manual.txt');
  // Write a fallback reference
  fs.writeFileSync(path.join(__dirname, 'patch-v176-manual.txt'), 
    '=== NEW STREAM BLOCK TO REPLACE (from "const reader = resp.body..." to end of streamOpenAIResponses) ===\n\n' + NEW_STREAM_BLOCK);
  process.exit(1);
}

src = src.replace(OLD_STREAM_BLOCK_START, NEW_STREAM_BLOCK);
console.log('OK: Replaced streamOpenAIResponses ReadableStream with tool-aware loop.');

// ─────────────────────────────────────────────────────────────────────────────
// Verify and write
// ─────────────────────────────────────────────────────────────────────────────

const executeCount = (src.match(/executeToolCall/g) || []).length;
const hasStart = src.includes('async start(controller)');
const hasToolRound = src.includes('MAX_TOOL_ROUNDS');
const hasFnArgsDelta = src.includes('response.function_call_arguments.delta');
const hasOutputItemDone = src.includes('response.output_item.done');

console.log('\n=== VERIFICATION ===');
console.log(`executeToolCall occurrences: ${executeCount} (expect >= 3)`);
console.log(`start(controller): ${hasStart}`);
console.log(`MAX_TOOL_ROUNDS: ${hasToolRound}`);
console.log(`function_call_arguments.delta handler: ${hasFnArgsDelta}`);
console.log(`output_item.done handler: ${hasOutputItemDone}`);

if (executeCount < 3 || !hasStart || !hasToolRound || !hasFnArgsDelta || !hasOutputItemDone) {
  console.error('\nFAIL: One or more checks failed. Aborting write — original unchanged.');
  process.exit(1);
}

fs.writeFileSync(filePath, src);
console.log('\nSUCCESS: worker.js written.');
console.log('Lines:', src.split('\n').length);
console.log('\nNext steps:');
console.log('  cd agent-dashboard && npm run build:vite-only && cd .. && ./scripts/deploy-sandbox.sh');
console.log('  ./scripts/smoke-test.sh sandbox');
console.log('  Test: "Query agent_sessions for a count" with gpt-5.4-nano in the UI');
console.log('  Watch logs: ./scripts/with-cloudflare-env.sh npx wrangler tail inneranimal-dashboard --config wrangler.jsonc --format pretty | grep -E "tool|executeToolCall|function_call"');

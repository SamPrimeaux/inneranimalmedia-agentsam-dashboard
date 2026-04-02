#!/usr/bin/env node
/**
 * patch-anthropic-stream.cjs
 *
 * Fixes chatWithToolsAnthropic streaming (chunks:1 → real streaming).
 *
 * PROBLEM: TransformStream is created AFTER the while loop completes.
 *   Users see 6-10s blank screen then everything flushes at once.
 *
 * FIX: When wantStream=true, create TransformStream BEFORE the while loop,
 *   return the Response immediately, run the loop in a background async IIFE,
 *   and write text/tool events to the writer throughout the loop.
 *
 * Usage:
 *   cp worker.js worker.js.bak-pre-anthropic-stream
 *   node patch-anthropic-stream.cjs
 */

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'worker.js');
let src = fs.readFileSync(filePath, 'utf8');
const original = src;

// ─────────────────────────────────────────────────────────────────────────────
// ANCHOR: The while loop opening — insert stream setup before it
// ─────────────────────────────────────────────────────────────────────────────

const WHILE_ANCHOR = `  while (iter < MCP_CHAT_TOOL_LOOP_MAX) {`;

if (!src.includes(WHILE_ANCHOR)) {
  console.error('ERROR: while loop anchor not found. Aborting.');
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// CHANGE 1: Insert stream setup before the while loop
// ─────────────────────────────────────────────────────────────────────────────

const STREAM_SETUP = `  // ── STREAMING SETUP (moved before loop so client gets response immediately) ──
  let _streamWriter = null;
  let _streamEnc = null;
  let _streamResponse = null;
  if (wantStream) {
    const { readable, writable } = new TransformStream();
    _streamEnc = new TextEncoder();
    _streamWriter = writable.getWriter();
    _streamResponse = new Response(readable, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } });
    // Pass writer into opts so tool_start can emit immediately
    opts.streamWriter = _streamWriter;
    opts.streamEnc = _streamEnc;
  }

  // Run loop in background IIFE when streaming so response is returned immediately
  const _runLoop = async () => {
  `;

const WHILE_WITH_SETUP = STREAM_SETUP + WHILE_ANCHOR;

src = src.replace(WHILE_ANCHOR, WHILE_WITH_SETUP);
console.log('OK 1: Inserted stream setup + _runLoop wrapper before while loop.');

// ─────────────────────────────────────────────────────────────────────────────
// CHANGE 2: After res.json(), immediately write text chunks to stream
// Target: the line after `const data = await res.json();`
// ─────────────────────────────────────────────────────────────────────────────

const AFTER_JSON_ANCHOR = `    const data = await res.json();
    const content = data.content || [];
    lastUsage = { input_tokens: data.usage?.input_tokens ?? 0, output_tokens: data.usage?.output_tokens ?? 0 };
    const toolUseBlocks = content.filter((b) => b.type === 'tool_use');
    for (const b of toolUseBlocks) {
      console.log('[chatWithToolsAnthropic] Claude using tool', { tool_name: b.name, tool_id: b.id });
    }
    const textParts = content.filter((b) => b.type === 'text').map((b) => b.text).filter(Boolean);
    lastContent = textParts.join('');`;

const AFTER_JSON_WITH_FLUSH = `    const data = await res.json();
    const content = data.content || [];
    lastUsage = { input_tokens: data.usage?.input_tokens ?? 0, output_tokens: data.usage?.output_tokens ?? 0 };
    const toolUseBlocks = content.filter((b) => b.type === 'tool_use');
    for (const b of toolUseBlocks) {
      console.log('[chatWithToolsAnthropic] Claude using tool', { tool_name: b.name, tool_id: b.id });
    }
    const textParts = content.filter((b) => b.type === 'text').map((b) => b.text).filter(Boolean);
    lastContent = textParts.join('');
    // ── Stream text immediately after each Anthropic API call ──
    if (wantStream && _streamWriter && lastContent) {
      try {
        await _streamWriter.write(_streamEnc.encode('data: ' + JSON.stringify({ type: 'text', text: lastContent }) + '\\n\\n'));
      } catch (_) {}
    }`;

if (!src.includes(AFTER_JSON_ANCHOR)) {
  console.error('ERROR: res.json() processing anchor not found. Aborting.');
  process.exit(1);
}
src = src.replace(AFTER_JSON_ANCHOR, AFTER_JSON_WITH_FLUSH);
console.log('OK 2: Text chunks now stream immediately after each Anthropic API response.');

// ─────────────────────────────────────────────────────────────────────────────
// CHANGE 3: Close the _runLoop IIFE and handle the final wantStream block
// Replace the existing final wantStream block at end of function
// ─────────────────────────────────────────────────────────────────────────────

const OLD_FINAL_STREAM = `  if (wantStream) {
    const { readable, writable } = new TransformStream();
    const enc = new TextEncoder();
    const writer = writable.getWriter();
    (async () => {
      try {
        // Flush queued state/tool_result events first
        for (const evt of pendingStateEvents) {
          await writer.write(enc.encode('data: ' + JSON.stringify(evt) + '\\n\\n'));
        }
        pendingStateEvents.length = 0;
        await writer.write(enc.encode('data: ' + JSON.stringify({ type: 'text', text: lastContent || '(Tool loop limit reached.)' }) + '\\n\\n'));
        await writer.write(enc.encode('data: ' + JSON.stringify({ type: 'done', usage: lastUsage }) + '\\n\\n'));
      } catch(e) {
        await writer.write(enc.encode('data: ' + JSON.stringify({ type: 'error', error: e?.message }) + '\\n\\n'));
      } finally {
        await writer.close().catch(() => {});
      }
    })();
    return new Response(readable, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } });
  }`;

const NEW_FINAL_STREAM = `  // ── END _runLoop ──
  }; // end _runLoop async function

  if (wantStream) {
    // Fire the loop in background, return stream immediately
    _runLoop().then(async () => {
      try {
        // Flush any remaining state/tool_result events
        for (const evt of pendingStateEvents) {
          await _streamWriter.write(_streamEnc.encode('data: ' + JSON.stringify(evt) + '\\n\\n'));
        }
        pendingStateEvents.length = 0;
        // Final done event with cost tracking
        const finalInputTokens = lastUsage.input_tokens || 0;
        const finalOutputTokens = lastUsage.output_tokens || 0;
        const finalCost = calculateCost(model, finalInputTokens, finalOutputTokens);
        await streamDoneDbWrites(env, conversationId, model, lastContent, finalInputTokens, finalOutputTokens, finalCost, agent_id, ctx, getLastUserMessageText(messages));
        await _streamWriter.write(_streamEnc.encode('data: ' + JSON.stringify({
          type: 'done',
          input_tokens: finalInputTokens,
          output_tokens: finalOutputTokens,
          cost_usd: finalCost,
          conversation_id: conversationId,
          model_used: model.model_key,
        }) + '\\n\\n'));
      } catch(e) {
        try { await _streamWriter.write(_streamEnc.encode('data: ' + JSON.stringify({ type: 'error', error: e?.message }) + '\\n\\n')); } catch(_) {}
      } finally {
        await _streamWriter.close().catch(() => {});
      }
    }).catch(async (e) => {
      try { await _streamWriter.write(_streamEnc.encode('data: ' + JSON.stringify({ type: 'error', error: e?.message }) + '\\n\\n')); } catch(_) {}
      await _streamWriter.close().catch(() => {});
    });
    return _streamResponse;
  }
  // Non-streaming: run loop synchronously
  await _runLoop();`;

if (!src.includes(OLD_FINAL_STREAM)) {
  console.error('ERROR: Final wantStream block not found.');
  console.error('Manual patch required — the final TransformStream block may differ.');
  process.exit(1);
}
src = src.replace(OLD_FINAL_STREAM, NEW_FINAL_STREAM);
console.log('OK 3: Final stream block replaced — loop fires in background, response returned immediately.');

// ─────────────────────────────────────────────────────────────────────────────
// VERIFY
// ─────────────────────────────────────────────────────────────────────────────

const hasRunLoop = src.includes('const _runLoop = async () => {');
const hasStreamSetup = src.includes('_streamResponse = new Response(readable');
const hasImmediateFlush = src.includes('Stream text immediately after each Anthropic');
const hasBackgroundFire = src.includes('_runLoop().then(async ()');
const hasReturnImmediate = src.includes('return _streamResponse;');

console.log('\n=== VERIFICATION ===');
console.log('_runLoop wrapper created:', hasRunLoop);
console.log('TransformStream before loop:', hasStreamSetup);
console.log('Immediate text flush after res.json():', hasImmediateFlush);
console.log('Background _runLoop().then():', hasBackgroundFire);
console.log('return _streamResponse immediately:', hasReturnImmediate);

if (!hasRunLoop || !hasStreamSetup || !hasImmediateFlush || !hasBackgroundFire || !hasReturnImmediate) {
  console.error('\nFAIL: One or more checks failed. Aborting — original unchanged.');
  process.exit(1);
}

fs.writeFileSync(filePath, src);
console.log('\nSUCCESS: worker.js written.');
console.log('Lines:', src.split('\n').length);
console.log('\nNext steps:');
console.log('  cp worker.js worker.js.bak-pre-anthropic-stream');
console.log('  node patch-anthropic-stream.cjs');
console.log('  ./scripts/with-cloudflare-env.sh npx wrangler deploy -c wrangler.production.toml');
console.log('  ./scripts/benchmark-full.sh prod  (expect Anthropic chunks > 1)');

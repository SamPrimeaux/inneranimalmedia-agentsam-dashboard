#!/usr/bin/env node
// patch-workers-ai.cjs
// Replaces the streamWorkersAI function with a non-streaming version that
// uses Promise.race + timeout instead of stream:true (which deadlocks in prod).
// Usage: node patch-workers-ai.cjs

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'worker.js');

if (!fs.existsSync(FILE)) {
  console.error('✗  worker.js not found in', __dirname);
  process.exit(1);
}

let src = fs.readFileSync(FILE, 'utf8');

// ── Find the exact function to replace ────────────────────────────────────────
const OLD_START = `async function streamWorkersAI(env, systemWithBlurb, apiMessages, modelRow, conversationId, agent_id, ctx) {`;
const OLD_END   = `  return new Response(readable, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' } });
}

/** Parse data URL to { mediaType, base64 } for vision APIs */`;

if (!src.includes(OLD_START)) {
  console.error('✗  streamWorkersAI function not found — was it already patched?');
  process.exit(1);
}

// ── Replacement function ───────────────────────────────────────────────────────
const NEW_FN = `async function streamWorkersAI(env, systemWithBlurb, apiMessages, modelRow, conversationId, agent_id, ctx) {
  const messages = [{ role: 'system', content: systemWithBlurb }, ...apiMessages];
  const modelKey = (modelRow && modelRow.model_key) ? modelRow.model_key : '@cf/meta/llama-3.1-8b-instruct';
  const inputCharCount = messages.reduce((acc, m) => acc + (typeof m.content === 'string' ? m.content.length : JSON.stringify(m.content || '').length), 0);

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const enc = new TextEncoder();
  const emit = (obj) => writer.write(enc.encode('data: ' + JSON.stringify(obj) + '\\n\\n'));

  // Fire the AI call in background — return stream immediately to avoid runtime hang
  (async () => {
    try {
      const WAI_TIMEOUT_MS = 25000;
      let result;
      try {
        result = await Promise.race([
          env.AI.run(modelKey, { messages }),
          new Promise((_, rej) => setTimeout(() => rej(new Error('Workers AI timeout after 25s')), WAI_TIMEOUT_MS))
        ]);
      } catch (e) {
        await emit({ type: 'error', error: e?.message ?? String(e) });
        return;
      }

      if (!result) {
        await emit({ type: 'error', error: 'Workers AI returned null' });
        return;
      }

      // Non-streaming: result is { response: string } or { text: string }
      const fullText = (typeof result.response === 'string' ? result.response : null)
        ?? (typeof result.text === 'string' ? result.text : null)
        ?? (result.choices?.[0]?.message?.content != null ? String(result.choices[0].message.content) : '')
        ?? '';

      if (fullText) {
        await emit({ type: 'text', text: fullText });
      }

      const inputTokens  = Math.round(inputCharCount / 4);
      const outputTokens = Math.round(fullText.length / 4);
      const costUsd      = 0;

      const safeModel = (modelRow && modelRow.model_key != null) ? modelRow.model_key : 'unknown';
      const safeRow   = { ...(modelRow || {}), model_key: safeModel, provider: (modelRow && modelRow.provider != null) ? modelRow.provider : 'workers_ai' };

      await streamDoneDbWrites(env, conversationId, safeRow, fullText, inputTokens, outputTokens, costUsd, agent_id, ctx, getLastUserMessageText(apiMessages));
      emitCodeBlocksFromText(fullText, (obj) => emit(obj));
      await emit({ type: 'done', input_tokens: inputTokens, output_tokens: outputTokens, cost_usd: costUsd, conversation_id: conversationId, model_used: safeRow.model_key, model_display_name: safeRow.display_name });
    } catch (e) {
      await emit({ type: 'error', error: e?.message ?? String(e) }).catch(() => {});
    } finally {
      await writer.close().catch(() => {});
    }
  })();

  return new Response(readable, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' } });
}

/** Parse data URL to { mediaType, base64 } for vision APIs */`;

// ── Find exact replacement range ──────────────────────────────────────────────
const startIdx = src.indexOf(OLD_START);
const endIdx   = src.indexOf(OLD_END) + OLD_END.length;

if (startIdx === -1 || endIdx < OLD_END.length) {
  console.error('✗  Could not locate replacement boundaries. Check worker.js manually.');
  process.exit(1);
}

const before  = src.slice(0, startIdx);
const after   = src.slice(endIdx);
const patched = before + NEW_FN + after;

// ── Verify ────────────────────────────────────────────────────────────────────
const checks = {
  'Non-streaming AI.run (no stream:true)':    patched.includes("env.AI.run(modelKey, { messages })"),
  'Promise.race timeout present':             patched.includes('Promise.race'),
  'Background IIFE pattern':                  patched.includes('(async () => {'),
  'Returns stream immediately':               patched.includes('return new Response(readable'),
  'type:text emit':                           patched.includes("type: 'text', text: fullText"),
  'type:done emit':                           patched.includes("type: 'done'"),
  'Old stream:true removed':                  !patched.includes("env.AI.run(modelKey, { messages, stream: true })"),
};

console.log('\n=== VERIFICATION ===');
let allOk = true;
for (const [label, ok] of Object.entries(checks)) {
  console.log((ok ? 'OK ' : 'FAIL') + ' ' + label + ': ' + ok);
  if (!ok) allOk = false;
}

if (!allOk) {
  console.error('\n✗  Verification failed — worker.js NOT written. Check patch logic.');
  process.exit(1);
}

fs.writeFileSync(FILE, patched, 'utf8');
const lines = patched.split('\n').length;
console.log(`\nSUCCESS: worker.js written.\nLines: ${lines}`);
console.log(`
Next steps:
  node patch-workers-ai.cjs
  ./scripts/with-cloudflare-env.sh npx wrangler deploy -c wrangler.production.toml
  ./scripts/benchmark-full.sh prod  (expect Workers AI chunks:1+)
`);

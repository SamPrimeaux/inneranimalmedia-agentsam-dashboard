# Agent Sam — Sprint Plan 2026-03-31 (Monday)

**Generated:** 2026-03-30 ~23:15 CDT  
**Worker version entering day:** `d4ce9ab7-587b-4c4b-ba6f-4438288033a1` (v=199)  
**D1:** `inneranimalmedia-business` (`cf87b717-d4e2-4cf8-bab0-a81268e32d49`)  
**Context:** Cost tracking sprint closed EOD 2026-03-29. All 14 models ACCURATE. Bug 1 (double-write) patched in worker.js by Cursor — not yet deployed. Bug 2 (classifyIntent Haiku) documented, no fix yet.

---

## FIRST THING MONDAY — Finish tonight's Cursor work

Before any new tasks, close out the Bug 1 fix from the 2026-03-29 session.

### Step 0: Deploy + verify Bug 1 fix

```bash
cd ~/Downloads/march1st-inneranimalmedia

# Build
npm run build:vite-only

# Sandbox
./scripts/deploy-sandbox.sh

# Send one agent chat via sandbox (Opus or Sonnet, tools enabled, model answers directly without calling a tool)
# Then verify — exactly ONE row per request, no paired duplicates:
./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
  --config wrangler.production.toml \
  --command="SELECT model_used, input_tokens, output_tokens, computed_cost_usd, created_at \
  FROM agent_telemetry WHERE provider='anthropic' ORDER BY created_at DESC LIMIT 5;"

# If clean — promote
npx wrangler deploy -c wrangler.production.toml

# Run full cost benchmark
./scripts/with-cloudflare-env.sh ./scripts/benchmark-cost-accuracy.sh https://inneranimalmedia.com

# Git push
git add -A && git commit -m "fix: remove double streamDoneDbWrites on chatWithToolsAnthropic no-tool path"
git push origin main && git push origin main:agentsam-clean
```

**Gate:** All providers still ACCURATE (0.0% drift), agent_costs/ai_usage_log still frozen. If anything regresses, rollback immediately with the previous worker version.

---

## P0 — Re-enable Anthropic Streaming

**What:** `canStreamAnthropic` is hardcoded `false` somewhere in worker.js. Anthropic models are falling back to non-streaming responses. This means the user sees no token-by-token output for Claude models — degraded UX and potential timeout risk on long responses.

**Why it was disabled:** Unknown — likely disabled as a temporary workaround during a previous session. Not related to the cost tracking sprint.

**Task for Cursor:**

```
Find canStreamAnthropic (or equivalent flag/variable) in worker.js.
Show the surrounding context — where it is set, where it is read,
and what code path executes when it is false vs true.

Do NOT change it yet. Show me:
1. The line and value where it is set
2. Every place it is checked
3. What the streaming path does when true (does it go through
   the same streamDoneDbWrites path that Bug 1 just fixed?)
4. Any prior comments explaining why it was disabled

After I approve the re-enable, the change is:
- Set canStreamAnthropic = true (or equivalent)
- Confirm streamDoneDbWrites fires exactly once on the streaming path
  (given Bug 1 fix — the .then() handler should be the sole writer)
- Sandbox test: send one Haiku streaming chat, one Sonnet streaming chat
- Verify one agent_telemetry row each, token counts match Anthropic console
- Then promote
```

**Verification query after re-enable:**

```sql
SELECT model_used, input_tokens, output_tokens, computed_cost_usd, created_at
FROM agent_telemetry
WHERE provider='anthropic'
ORDER BY created_at DESC LIMIT 10;
```

Cross-check input/output tokens against Anthropic console for same request IDs.

---

## P1 — Flash SSE Token Extraction (Gemini input_tokens=0)

**What:** On streamed Gemini responses, `input_tokens` is landing as 0 in `agent_telemetry`. The token count is available in the SSE stream but not being extracted from the right chunk.

**Background:** Gemini's streaming API delivers usage metadata on the final chunk, not inline with content chunks. The `mergeGeminiStreamUsageFromChunk` function was added this sprint but may not be reading the final chunk's `usageMetadata` correctly for all model variants.

**Task for Cursor:**

```
Find mergeGeminiStreamUsageFromChunk in worker.js.
Show the function and every call site.

Then find where Gemini SSE chunks are parsed — specifically:
- Which field carries input token count on the FINAL chunk
  (look for usageMetadata.promptTokenCount or similar)
- Whether the accumulator is being read before or after the
  final chunk is processed
- Whether gemini-2.5-flash and gemini-3.x-flash variants
  return usageMetadata in the same field

Show the raw SSE parsing loop for the Google streaming path.
Do not change anything yet — show me the gap first.
```

**Expected finding:** `promptTokenCount` is present on the final `[DONE]`-adjacent chunk but the accumulator is being read before that chunk is consumed, so input_tokens = 0. Fix is to move the accumulator read to after the loop, not during.

---

## P1 — agentsam_agent_run Completion Handler

**What:** `agentsam_agent_run` table has 100% null `cost_usd` and `total_tokens`. The run record is created at start but never updated at completion.

**Task for Cursor:**

```
Find where agentsam_agent_run rows are INSERTed (run start).
Show the INSERT and surrounding context.

Then search for any UPDATE to agentsam_agent_run.
If there is none — show where the agent run logically ends
(after streamDoneDbWrites or runToolLoop resolves) and
write the UPDATE:

UPDATE agentsam_agent_run
SET cost_usd = ?,
    total_tokens = ?,
    output_tokens = ?,
    completed_at = datetime('now'),
    status = 'completed'
WHERE run_id = ?;

The run_id, cost, and token values should come from the same
result object that feeds streamDoneDbWrites. Do not create a
separate API call — wire it into the existing completion path.

Sandbox test + verify one row in agentsam_agent_run has non-null
cost_usd after a test chat.
```

---

## P2 — classifyIntent Haiku Telemetry (document only, no fix yet)

**What:** `classifyIntent` falls back to Haiku when Gemini is unavailable. Those calls are billed by Anthropic but never reach `streamDoneDbWrites` — they go through `logAgentIntentExecution` only.

**Do not fix today.** The call volume is high, the cost per call is low (~$0.001), and wiring telemetry into this path requires careful scoping to avoid double-counting with the main chat path.

**Action:** Insert a task row:

```sql
INSERT INTO roadmap (title, description, priority, status, category, created_at)
VALUES (
  'Wire classifyIntent Haiku calls into agent_telemetry',
  'classifyIntent fallback path calls Haiku via direct fetch outside streamDoneDbWrites. Estimated 30-57% of Haiku D1 gap on Mar 29-30. High call volume — needs dedup guard before wiring. See spend_audit row 17 for reconciliation context.',
  'P2', 'open', 'telemetry', datetime(''now'')
);
```

---

## P2 — mcp_tool_calls null cost_usd

**What:** Every row in `mcp_tool_calls` has `cost_usd = null`. Tool calls should attribute cost from the parent session's telemetry.

**Approach:** Don't compute cost per tool call independently. After `streamDoneDbWrites` fires for a session, take the session's `computed_cost_usd` and divide by number of tool calls in that session, or just stamp the session's `telemetry_id` FK on the tool call rows and let the join do the work.

**Task for Cursor (after P0 and P1 are closed):**

```
Show the mcp_tool_calls INSERT. Show what session/request context
is available at insert time — specifically whether run_id or
telemetry_id is in scope.

If telemetry_id is available: add a telemetry_id FK column UPDATE
after streamDoneDbWrites resolves. Do not try to compute per-tool cost.

If not available: show me what is available and we'll decide the join strategy.
```

---

## P3 — Table Cleanup (after 30-day window)

**Eligible after:** 2026-04-28 (30 days from last write to retired tables)

Do not touch until then. The frozen row counts to verify before DROP:
- `agent_costs`: 1176 (frozen as of 2026-03-29 prod promote)
- `ai_usage_log`: 1625 (frozen as of 2026-03-29 prod promote)
- `agent_model_registry`: safe to DROP now per Cursor analysis

**When ready:**
```sql
DROP TABLE agent_model_registry;
-- Wait until 2026-04-28 for the other two:
-- DROP TABLE agent_costs;
-- DROP TABLE ai_usage_log;
```

---

## Hard Rules (carry forward)

- Cursor never runs `npm run deploy` or `npx wrangler deploy` — Sam runs deploys
- Max 2 file changes per Cursor task before review
- Sandbox first, always. Prod promote requires Sam approval
- No D1 schema changes without explicit approval
- No backfilling historical rows
- Source of truth: GitHub `agentsam-clean` branch + R2 `agent-sam` bucket
- Secrets stay in Cloudflare dashboard only

---

## Reference — Key Commands

```bash
# Sandbox deploy
cd ~/Downloads/march1st-inneranimalmedia && npm run build:vite-only && ./scripts/deploy-sandbox.sh

# Prod deploy (Sam only)
npx wrangler deploy -c wrangler.production.toml

# Git push
git push origin main && git push origin main:agentsam-clean

# D1 query
./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
  --remote --config wrangler.production.toml --command="YOUR SQL HERE"

# R2 fetch (worker.js)
/run wrangler r2 object get agent-sam/PATH --remote \
  -c /Users/samprimeaux/Downloads/march1st-inneranimalmedia/wrangler.production.toml \
  --file /tmp/FILE

# Cost benchmark
./scripts/with-cloudflare-env.sh ./scripts/benchmark-cost-accuracy.sh https://inneranimalmedia.com

# Frozen table check
./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
  --remote --config wrangler.production.toml \
  --command="SELECT (SELECT COUNT(*) FROM agent_costs) ac, (SELECT COUNT(*) FROM ai_usage_log) aul;"
```

---

## Daily Priority Order

| # | Task | Priority | Blocker |
|---|---|---|---|
| 0 | Deploy + verify Bug 1 double-write fix | P0 | Do first |
| 1 | Re-enable Anthropic streaming | P0 | Bug 1 fix deployed |
| 2 | Gemini Flash SSE input_tokens=0 | P1 | None |
| 3 | agentsam_agent_run completion handler | P1 | None |
| 4 | classifyIntent Haiku — roadmap row only | P2 | None |
| 5 | mcp_tool_calls cost attribution | P2 | After P0+P1 closed |
| 6 | agent_model_registry DROP | P3 | Confirm zero refs |

---

*Generated EOD 2026-03-30 · Agent Sam v=199 · All providers ACCURATE*

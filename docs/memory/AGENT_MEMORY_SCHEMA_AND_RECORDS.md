# Agent memory: schema, records, and D1 workflow

This doc is loaded into AI memory (bootstrap + Cursor) so the AI can reliably help with backfilling, correcting data, and consolidating tables. Goal: tables properly populated, no dupes/overlapping tables; AI suggests first, user approves, then agent executes D1/SQL.

---

## 1. How the AI should work with D1 and schema

- **Suggest first, then execute:** For any D1 write (INSERT/UPDATE/DELETE), migration, or schema change:
  1. Propose the exact SQL or change (and which table/file).
  2. Wait for explicit user approval (“accept”, “yes”, “go ahead”, “you can handle it”, etc.).
  3. Only after approval: run the migration or execute the D1 work (e.g. via wrangler or documented API).
- **Be capable, not just suggestive:** Once the user confirms, the agent should actually perform the work (generate the migration file, run the command, or give the exact curl/wrangler invocation the user can run).
- **Table consolidation goal:** We have many tables; before launch we want to eliminate dupes and overlapping tables. The AI should be aware of this and, when suggesting new tables or changes, prefer reusing or consolidating into existing canonical tables (agent_telemetry, spend_ledger, project_time_entries, agent_sessions, agent_messages, etc.) rather than adding new one-off tables.

---

## 2. Canonical tables for metrics and cost (use these for backfill/correction)

### agent_telemetry (tokens per LLM call)

- **Purpose:** One row per agent/LLM call; token counts and provider/model.
- **Written by:** Worker on every successful `/api/agent/chat`.
- **Schema (D1):** id (TEXT PK), tenant_id, session_id, metric_type (`llm_call`), metric_name (`chat_completion`), metric_value (1), provider, model_used, input_tokens, output_tokens, created_at, updated_at (unixepoch).
- **Cost:** Not stored here; use `spend_ledger` for dollars.
- **Read:** `GET /api/agent/telemetry` (last 7 days by provider: total_input, total_output, total_calls).

**Backfill:** INSERT rows from logs with same columns; use unixepoch for created_at/updated_at.

---

### spend_ledger (dollars for $ gauge and finance)

- **Purpose:** Record AI/API spend so the agent $ gauge and finance APIs are correct.
- **Read by:** `GET /api/finance/ai-spend?scope=agent` → summary.total_this_month, rows[].
- **Columns to use:** id, amount_usd, date or occurred_at, category (`ai_tools` or `usage`), provider or provider_slug, description, notes, tenant_id (optional).
- **Backfill:** INSERT rows with amount_usd, category = 'ai_tools' or 'usage', provider, date/occurred_at. Optionally derive amount from agent_telemetry (tokens × pricing) and insert one row per day or per provider.

---

### project_time_entries (time tracking)

- **Purpose:** Dashboard/session time; automatic time tracking uses this.
- **Columns:** project_id (e.g. 'inneranimalmedia'), user_id, session_id, start_time, end_time, duration_seconds, is_active, description.
- **APIs:** POST /api/dashboard/time-track/start, /end, and heartbeat.
- **Backfill:** INSERT with start_time/end_time or duration_seconds for past sessions.

---

## 3. Other canonical tables (avoid creating overlapping alternatives)

- **agent_sessions** — Chat sessions; links to agent_messages via conversation_id.
- **agent_messages** — Per-message history for a session.
- **ai_models** — Model catalog (provider, model_key, pricing if present).
- **cloudflare_deployments** — See full doc below.
- **projects** — e.g. inneranimalmedia; project_time_entries references this.

When the user asks to “add a table” or “track X”, prefer extending or using these instead of creating a new table unless the user explicitly wants a new one.

---

### cloudflare_deployments (deploy history; overview / recent activity)

- **Purpose:** One row per worker deploy so Overview “Recent Activity” and stats show last deploy time and deploy count. No manual migrations needed for routine deploys.
- **Written by:** `scripts/post-deploy-record.sh`, invoked automatically by `scripts/deploy-with-record.sh` after `wrangler deploy` (i.e. `npm run deploy`). Never leave `build_time_seconds` or `deploy_time_seconds` NULL in new inserts.
- **Agent requirement:** When an **agent** (e.g. Cursor, IDE automation) performs a deploy, the agent **must** document it by setting `TRIGGERED_BY=agent` and optionally `DEPLOYMENT_NOTES='brief description'` so the row is attributed correctly. Example: `TRIGGERED_BY=agent DEPLOYMENT_NOTES='AI Gateway + R2 upload' npm run deploy`. If the agent only runs `npm run deploy` without these, the row is still inserted with `triggered_by='cli_post_deploy'`; for proper attribution, agents should set the env vars.
- **Schema (D1):**
  - **113 (base):** deployment_id (TEXT), worker_name (TEXT NOT NULL), project_name (TEXT NOT NULL), deployment_type (TEXT DEFAULT 'worker'), environment (TEXT DEFAULT 'production'), status (TEXT DEFAULT 'success'), deployment_url (TEXT), preview_url (TEXT), triggered_by (TEXT), deployed_at (TEXT NOT NULL), created_at (TEXT NOT NULL).
  - **114:** build_time_seconds (INTEGER), deploy_time_seconds (INTEGER).
  - **115:** deployment_notes (TEXT) — optional human/agent note (e.g. failure reason after a revert).
- **Index:** idx_cloudflare_deployments_worker_deployed (worker_name, deployed_at DESC).
- **Read by (worker):**
  - Latest deploy: `SELECT deployment_id, deployed_at FROM cloudflare_deployments WHERE worker_name = ? ORDER BY deployed_at DESC LIMIT 1`.
  - Recent activity: `SELECT deployed_at FROM cloudflare_deployments WHERE worker_name = ? AND deployed_at >= ? ORDER BY deployed_at DESC LIMIT 10`.
  - Overview stats: deploy count last 7 days; deploy count by day; activity strip “deploy” rows (last 24h); 24h deploy count.
- **Migrations:** 113 (create table + index), 114 (timing columns), 115 (deployment_notes).
- **Backfill / manual record:** Run `DEPLOY_SECONDS=<seconds> ./scripts/post-deploy-record.sh` after a manual deploy, or INSERT with same columns (use datetime('now') for deployed_at/created_at).

---

## 4. Quick reference: backfill / correct data

| Data to backfill     | Table                 | Key columns / APIs |
|----------------------|-----------------------|---------------------|
| Token counts         | agent_telemetry       | provider, model_used, input_tokens, output_tokens, created_at |
| Cost ($)             | spend_ledger          | amount_usd, category='ai_tools'\|'usage', provider, date/occurred_at |
| Time spent           | project_time_entries  | project_id='inneranimalmedia', start_time, end_time, duration_seconds |
| Deploy history       | cloudflare_deployments | deployment_id, worker_name='inneranimalmedia', status, deployed_at, build_time_seconds, deploy_time_seconds; or run scripts/post-deploy-record.sh after manual deploy |
| Agent $ gauge        | (reads spend_ledger)  | No direct write; update spend_ledger. |
| Agent token view     | (reads agent_telemetry) | No direct write; update agent_telemetry. |

---

## 5. Full reference doc (repo)

Detailed schemas, migration paths, and examples: **docs/API_METRICS_AND_AGENT_COST_TRACKING.md**.

---

## 6. Storing this in AI memory

- **Bootstrap (Agent Sam):** R2 bucket `iam-platform`, key `memory/schema-and-records.md`. GET /api/agent/bootstrap returns this as `schema_and_records_memory` when present. The chat handler also injects this into the system prompt so Agent Sam has it every conversation.
- **Cursor (IDE):** Rule in `.cursor/rules/d1-schema-and-records.mdc` instructs the AI to follow “suggest → approve → execute” for D1/schema and to use this doc and docs/API_METRICS_AND_AGENT_COST_TRACKING.md for backfill/consolidation.

**Upload this file to R2 once (and after edits):**

```bash
# From repo root, with CLOUDFLARE_API_TOKEN set:
wrangler r2 object put "iam-platform/memory/schema-and-records.md" \
  --file docs/memory/AGENT_MEMORY_SCHEMA_AND_RECORDS.md \
  --content-type "text/markdown" \
  --config wrangler.production.toml \
  --remote
```

Or use `scripts/upload-schema-memory-to-r2.sh` if present.

---

## 7. Daily digest and roadmap_steps

- **Daily digest:** Cron at 6pm Louisiana time (midnight UTC, `0 0 * * *`) runs `sendDailyDigest(env)`. It reads **live** from: `cloudflare_deployments`, `spend_ledger`, `roadmap_steps`, `notification_outbox`; passes the data to Claude to write a short summary; sends email via Resend (when `RESEND_API_KEY` is set). One-time trigger: `POST /api/admin/send-digest` (remove this endpoint after confirming the first email).
- **Keeping the digest accurate:** The digest is accurate every day because it reads from the same tables the dashboard uses. The only extra step: **at the end of each Cursor session**, have the agent (or you) update `roadmap_steps` for any step that was completed:
  ```sql
  UPDATE roadmap_steps SET status='completed', updated_at=datetime('now') WHERE id IN ('step_whatever_you_finished');
  ```
  Cursor can run this when marking a build step done so the next digest reflects it. Update `agent_memory_index` to match; tomorrow's Agent Sam and tonight's digest will then reflect accurate state.

**Paste at the top of every new Cursor chat (optional):**
```
Before starting, read these from our D1 database:
1. SELECT value FROM agent_memory_index WHERE key = 'active_priorities'
2. SELECT value FROM agent_memory_index WHERE key = 'build_progress'
3. SELECT title, status FROM roadmap_steps WHERE plan_id = 'plan_iam_dashboard_v1' ORDER BY order_index

Then confirm what you read before touching any code.
```

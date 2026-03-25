# Cursor Session Log

> History before Mar 25 2026: see docs/archive/cursor-session-log-mar2026.md

## 2026-03-24 Notifications API + send_notification + agentsam_agent_run + session log archive

### What was asked
Surgical worker + AgentDashboard: extend send_notification (notifications table + Resend high priority), GET/PATCH agent notifications, poll bell UI, agentsam_agent_run on chat, archive session log.

### Files changed
- `worker.js` 1768-1802: `send_notification` also INSERT `notifications` for `user_sam_primeaux`; `priority` high triggers `notifySam` + Resend.
- `worker.js` 7631-7666: `GET /api/agent/notifications`, `PATCH /api/agent/notifications/:id/read`.
- `worker.js` 8829-8843: `INSERT agentsam_agent_run` after model resolve (`in_progress`, token/cost NULL; `waitUntil` when available).
- `agent-dashboard/src/AgentDashboard.jsx` 1120-1122 (state/ref), 1711-1767 (outside-click + poll), 3337-3461 (bell UI + dropdown + PATCH read).
- `docs/archive/cursor-session-log-mar2026.md`: copy of pre-Mar-25 log.
- `docs/cursor-session-log.md`: reset stub + this entry.

### Fix 1 (cicd_runs / D1)
No code change; mapping fixed in D1 per Sam.

### Deploy status
Built: no — R2 uploaded: no — Worker deployed: no — deploy approved: no

### Known issues / next steps
Requires D1 `notifications` with `recipient_id`, `read_at`, `created_at`. Optionally UPDATE `agentsam_agent_run` on chat completion with token counts.

## 2026-03-25 Data retention purge (midnight cron) + GET /api/admin/retention

### What was asked
Wire `data_retention_policies` into existing `0 0 * * *` cron: batch DELETE (LIMIT 500), update policy stats, audit log; superadmin GET to list policies; optional `agent_messages` condition documented in D1/migration note.

### Files changed
- `worker.js` **2914–2930**: `GET /api/admin/retention` — session + `SUPERADMIN_EMAILS`, `SELECT * FROM data_retention_policies ORDER BY table_name`.
- `worker.js` **14670–14781**: `RETENTION_PURGE_TABLE_CONFIG`, `retentionConditionIsSafe`, `runRetentionPurge` (load active policies, allowlisted tables only, `DELETE … LIMIT 500`, `UPDATE data_retention_policies` by `id` or `table_name`, `writeAuditLog` `retention_purge`).
- `worker.js` **14833–14844**: Midnight cron runs `ctx.waitUntil(runRetentionPurge(env))` **every** night before digest dedupe check (digest still once per day).
- `migrations/169_retention_agent_messages_condition.sql`: commented example `UPDATE` for `agent_messages` condition (`session_id NOT IN (SELECT id FROM agent_sessions WHERE status = 'active')`).

### Deploy status
Built: no — Worker deployed: no — deploy approved: no

### Notes
If `worker_analytics_events.timestamp` is TEXT in D1, switch that row to `compare: 'datetime'` in code or normalize column type. Overlap with `0 6` `webhook_events` maintenance remains (separate hardcoded cleanup).

## 2026-03-25 Retention allowlist — MCP + terminal_sessions (+ date_col)

### What was asked
Align worker allowlist with 47 D1 policies: MCP usage/audit/sessions/stats/workflow runs/suggestions, `terminal_sessions` (stale rows); keep registry/config tables out of allowlist.

### Files changed
- `worker.js` `RETENTION_PURGE_TABLE_CONFIG` + `ageClause`: added `mcp_usage_log` / `mcp_tool_call_stats` with **`date_col`** (`date(col) < date('now','-Nd')`); added `mcp_audit_log`, `mcp_agent_sessions`, `mcp_workflow_runs`, `mcp_command_suggestions` (unix); `terminal_sessions` on **`updated_at`** (unix). **`terminal_history`** now uses **`created_at`** unix (reliable vs nullable `recorded_at`). Comment lists tables intentionally excluded from allowlist.

### Deploy status
Worker deployed: no — deploy approved: no

## 2026-03-25 Full deploy (R2 agent bundle + worker) — deploy approved

### What was asked
`npm run build --prefix agent-dashboard`; R2 put `agent-dashboard.js`, `agent-dashboard.css`, `dashboard/agent.html`; `wrangler deploy -c wrangler.production.toml`. User paste for `runRetentionPurge` **not** applied: existing implementation already runs at `0 0 * * *` with allowlist + correct unix vs datetime vs `date_col` + safe `condition` handling (their snippet would mis-purge unix columns and allow arbitrary `table_name`).

### Files / artifacts
- Built: `agent-dashboard/dist/agent-dashboard.js`, `agent-dashboard/dist/agent-dashboard.css`
- R2: `agent-sam/static/dashboard/agent/agent-dashboard.js`, `agent-sam/static/dashboard/agent/agent-dashboard.css`, `agent-sam/static/dashboard/agent.html`
- Worker: `inneranimalmedia`

### Deploy status
- Built: yes — R2 uploaded: yes (paths above) — Worker deployed: yes — **Version ID:** `fd092398-9251-4603-a7af-120e1f40df46` — deploy approved: yes

### What is live now
Production worker at version above; agent Vite bundle and `agent.html` on R2. Midnight retention purge unchanged from prior code (allowlisted tables only).

## 2026-03-25 IMGX OpenAI provider coercion + fetch timeout + D1 tool copy

### What was asked
When chat model is Gemini, `imgx_generate_image` was passing `provider: gemini` and hitting the worker hard error. Force `provider: openai` for generate/edit before `runImgxBuiltinTool`; 30s timeout on OpenAI image API fetches; update `mcp_registered_tools` description/schema via migration. No deploy until approved.

### Files changed
- `worker.js` **6007–6019**: `runToolLoop` — build `imgxParams` with `provider: 'openai'` for `imgx_generate_image` / `imgx_edit_image` when missing or not `openai`; pass `imgxParams` to `runImgxBuiltinTool`.
- `worker.js` **12463–12482**: builtin tool invoke path — same coercion; `rec()` uses `imgxParams` (including catch) so telemetry matches what ran.
- `worker.js` **14038–14051**: `v1/images/generations` fetch — `signal: AbortSignal.timeout(30000)`.
- `worker.js` **14092–14097**: `v1/images/edits` fetch — same 30s timeout (parity with generate).
- `migrations/170_imgx_tool_openai_only_description.sql`: `UPDATE mcp_registered_tools` for `imgx_generate_image` and `imgx_edit_image` description + `input_schema` (OpenAI-only; omit or `openai`, not gemini).

### Files NOT changed (and why)
- `migrations/150_imgx_remote_builtin_tools.sql`: unchanged; production rows updated by **170** only (`INSERT OR IGNORE` on 150 does not refresh existing rows).

### Deploy status
Built: no — R2 uploaded: no — Worker deployed: no — D1 migration run: no — deploy approved: no

### Known issues / next steps
Run migration **170** against production D1 when approved. Deploy worker when Sam says **deploy approved**.

## 2026-03-25 IMGX Gemini/Imagen 3 generate + provider list + edit coercion only

### What was asked
Add Google Imagen (`imagen-3.0-generate-002:predict`) when `provider=gemini`, using `GOOGLE_AI_API_KEY`; same R2 upload path as OpenAI; update `listImgxProviders` for implemented vs not; adjust tool-loop coercion so generate can pass `gemini`. No deploy until approved.

### Files changed
- `worker.js` **6010–6015**: `runToolLoop` — coerce `provider` to `openai` only for `imgx_edit_image` (generate leaves model-provided `gemini` intact).
- `worker.js` **12466–12471**: builtin invoke — same edit-only coercion.
- `worker.js` **14014–14033**: `listImgxProviders` — OpenAI vs Gemini availability from keys; `supports_generate` / `supports_edit`; Gemini model id `imagen-3.0-generate-002` (no longer `GEMINI_API_KEY` / chat model id for image).
- `worker.js` **14035–14204**: `runImgxBuiltinTool` — default provider prefers OpenAI then Google AI key; gemini branch for `imgx_generate_image` only (45s abort); edit with `gemini` returns explicit error; OpenAI path unchanged after guard.
- `migrations/171_imgx_gemini_imagen_tool_copy.sql`: `UPDATE mcp_registered_tools` for `imgx_generate_image` / `imgx_edit_image` descriptions + schemas (supersedes **170** copy for generate if both run; run **171** for current behavior).

### Deploy status
Built: no — Worker deployed: yes — **Version ID:** `86bd4c35-0f4e-46c3-b656-c00cecf9014a` — D1 migration **171** run: yes (remote `inneranimalmedia-business`) — deploy approved: yes

### Known issues / next steps
Google’s public docs note Imagen 3 deprecation on the Gemini API in favor of newer Imagen 4 model ids; if `imagen-3.0-generate-002` stops working, switch the URL/model id in `runImgxBuiltinTool`. **170** was optional; **171** applied on deploy.

## 2026-03-25 Deploy approved — IMGX + D1 171

### What was asked
`deploy approved` after IMGX/OpenAI/Gemini work.

### What ran
- `./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/171_imgx_gemini_imagen_tool_copy.sql`
- `TRIGGERED_BY=agent DEPLOYMENT_NOTES='IMGX OpenAI timeouts + Gemini Imagen generate + mcp_registered_tools 171' ./scripts/with-cloudflare-env.sh npx wrangler deploy -c wrangler.production.toml`

### Deploy status
Worker **inneranimalmedia** version **86bd4c35-0f4e-46c3-b656-c00cecf9014a** — R2 dashboard files: not part of this deploy — deploy approved: yes

## 2026-03-25 D1 172 Cursor models + curl verification blocked locally

### What was asked
Update `ai_models` for five `cursor:*` ids (`secret_key_name = 'CURSOR_API_KEY'`, active + picker); verify Cloud Agents `GET https://api.cursor.com/v0/models` with Basic auth; report before worker routing.

### Files changed
- `migrations/172_ai_models_cursor_secret_and_picker.sql`: `UPDATE ai_models` for the five ids.

### What ran
- Remote D1: migration **172** applied successfully (**5 rows written**). Relative `--file=./migrations/...` failed once from wrangler; succeeded with absolute `--file=` path.

### Curl / models response
`CURSOR_API_KEY` was **not** present in the environment used by `./scripts/with-cloudflare-env.sh` (only Cloudflare token is loaded from `.env.cloudflare` / `~/.zshrc`). Worker secrets are not readable from here, so **no `/v0/models` response to paste**. Run locally:

```bash
curl -sS -u "$CURSOR_API_KEY:" https://api.cursor.com/v0/models
```

Official Cloud Agents docs: **Basic auth** (`-u KEY:`) matches this call. Response shape is JSON like `{ "models": [ "claude-4-sonnet-thinking", "gpt-5.2", ... ] }` — map `ai_models.model_key` to those strings when implementing chat.

### Worker code
Not changed (per “report before writing any worker code”).

## 2026-03-25 Cursor chat API + `/v0/models` slug map + D1 173

### What was asked
Paste `/v0/models` JSON; align routing; use `CURSOR_API_KEY` and `api.cursor.sh` OpenAI-compatible chat; Cursor badge in UI.

### Files changed
- `worker.js`: `CURSOR_CHAT_API_MODEL_BY_ROW_ID` + `resolveCursorChatApiModel`; `streamCursorChat`; after model resolve — `isCursorModel` + missing-key 400; `canStream*` / `supportsTools` / gateway + direct API branches gated with `!isCursorModel`; stream branch calls `streamCursorChat` first; non-stream Cursor `fetch` before gateway.
- `migrations/173_ai_models_cursor_model_keys_from_v0_models.sql`: deactivate `cursor:google_gemini_3_pro` (no Gemini slug in `/v0/models`). Full `model_key` rewrites omitted — **UNIQUE(provider, model_key)** on D1 conflicted when setting `provider='cursor'` + shared slugs.
- `agent-dashboard/src/AgentDashboard.jsx`: model picker button — “Cursor” badge when `id` starts with `cursor:` or `provider === 'cursor'`.

### Deploy status
Worker / R2 agent bundle: not deployed in this step — run when Sam approves.

### Notes
`/v0/models` list also includes `composer-2`, `composer-1.5`, `gpt-5.3-codex-high-fast`, `gpt-5.4-high-fast`, `gpt-5.4-xhigh-fast`, `claude-4.6-opus-high-thinking-fast`; add to `CURSOR_CHAT_API_MODEL_BY_ROW_ID` or D1 rows as needed.

## 2026-03-25 Cursor Cloud Agents — 3 builtin tools (async agents, not chat)

### What was asked
Wire `cursor_run_agent` (approval), `cursor_get_agent`, `cursor_list_agents` to `https://api.cursor.com/v0/agents` with Basic `btoa(CURSOR_API_KEY+':')`; `BUILTIN_TOOLS` + `runToolLoop`; D1 reference migration. No deploy until approved.

### Files changed
- `worker.js` **6007–6017**: `runToolLoop` — `cursor_run_agent` returns approval-required JSON; `cursor_get_agent` / `cursor_list_agents` call `runCursorCloudAgentBuiltinTool`.
- `worker.js` **6129**: `BUILTIN_TOOLS` — added `cursor_run_agent`, `cursor_get_agent`, `cursor_list_agents`.
- `worker.js` **6526–6608**: `CURSOR_CLOUD_AGENTS_DEFAULT_REPO`, `runCursorCloudAgentBuiltinTool` — list (15s), get (15s), run (30s POST); run returns `agent_id`, `status`, `branch`, `url`, `created_at` plus `target`/`source`/`name`/`poll_hint`.
- `worker.js` **12055–12082**: `/api/mcp/invoke` — internal handler for `cursor_get_agent` / `cursor_list_agents` (before CloudConvert block).
- `worker.js` **13075–13126**: `invokeMcpToolFromChat` — all three tools before `toolRow` fetch; `cursor_run_agent` blocked unless `opts.skipApprovalCheck` (execute-approved-tool).
- `migrations/174_mcp_cursor_cloud_agent_tools.sql`: `INSERT OR IGNORE` for three tools (`cursor_run_agent` `requires_approval=1`).

### Deploy status
- Built: no (worker source deploy only)
- R2 uploaded: no (no `dashboard/` changes for this feature)
- Worker deployed: yes — version ID: `028a01da-c8aa-4167-8d13-426bef822ee8`
- Deploy approved by Sam: yes (2026-03-24)
- D1 migration 174: not executed as part of deploy (run separately if tool rows missing)

### What is live now
Production worker includes Cursor Cloud Agents builtins: `cursor_run_agent` (approval path), `cursor_get_agent`, `cursor_list_agents` against `api.cursor.com/v0/agents` with `CURSOR_API_KEY` Basic auth.

### Wrong-repo test agent
To stop agent `bc-d535452c` (or similar), use Cursor dashboard or Cloud Agents API `POST /v0/agents/{id}/stop` with the same Basic auth (not implemented as a tool here).

## 2026-03-24 Incident report email + madge build gate

### What was asked
Send `notifySam`-equivalent incident email (Mar 24 outage, Resolution version filled); prevention item: madge in build pipeline.

### What was done
- **Email:** Sent via Resend API (same as worker `notifySam`: `agent@inneranimalmedia.com` to `sam@inneranimalmedia.com`, subject `[Agent Sam] INCIDENT REPORT: Production Outage — Mar 24 2026`). Body included resolution worker version **`9707c1c2-6c90-431f-9f2b-6134ae5edd9c`**. Resend response id: `2df44096-02d0-4dac-9ad3-2298ac2c9f79`. (Did not go through worker, so no `email_logs` row unless you backfill manually.)
- **`agent-dashboard/package.json`:** `build` now runs `npx --yes madge --extensions js,jsx --circular src/main.jsx` then `vite build`; added **`build:vite-only`** to skip the cycle check if needed.

### Files changed
- `agent-dashboard/package.json` — scripts above.

### Deploy status
- Not deployed (package.json only). Commit/push when ready.

### Deferred action items (from incident text)
- Post-deploy smoke test script; ops runbook note; optional `rollup-plugin-visualizer` (bundle graph — does not replace madge for cycles).

## 2026-03-25 .cursorrules — deploy queue cap + post-deploy verify

### What was asked
Add deploy rules: max 2 queue items per deploy; after every deploy verify `/dashboard/agent` (or current project URL) loads before approving next queue item.

### Files changed
- `.cursorrules`: new section **Deploy queue and post-deploy verification** after main worker deploy bullets.

## 2026-03-25 R2 agent bundle refresh (post-outage)

### What was asked
Rebuild agent-dashboard and reupload `agent-dashboard.js`, `agent-dashboard.css`, and `agent.html` to R2 (worker-only deploy does not replace R2).

### What was done
- **Madge:** `agent-dashboard/src/main.jsx` — no circular deps. Plain `madge --circular agent-dashboard/src/` matches 0 files (needs `--extensions js,jsx` or entry file); `npm run build` already runs madge on `src/main.jsx`.
- **Build:** `npm run build --prefix agent-dashboard` (868.54 kB JS).
- **R2 (remote `agent-sam`):** `static/dashboard/agent/agent-dashboard.js`, `static/dashboard/agent/agent-dashboard.css`, `static/dashboard/agent.html` — upload complete.

### Deploy status
Worker: not redeployed this step. R2: yes.

### What you should do
Hard refresh `https://inneranimalmedia.com/dashboard/agent` (Cmd+Shift+R) and confirm console is clean.

## 2026-03-25 TDZ / `Ts` outage — mention split, debug build, sprint_snapshots, R2 v139

### What was asked
Honest metrics picture + `sprint_snapshots` table/seed; madge missed TDZ; unminified build to find `Ts`; git history on `ChatAtContextPicker`; site down — fix and report.

### Findings
- **`git diff HEAD~3 -- ChatAtContextPicker.jsx`:** file was **added from `/dev/null`** in sprint commit `4fa3c93` (entire 694-line module). Reverting “previous version” means removing the picker integration from `AgentDashboard` (no prior file to restore).
- **Madge:** still **no import cycles** (12 modules with `chatAtContextMention.js`). `Ts` is **esbuild minified** — not findable as a source name; unminified `dist-debug/agent-dashboard.js` shows **`getActiveAtMention`** at ~line 26227 (readable).
- **Mitigation:** New **`agent-dashboard/src/chatAtContextMention.js`** holds `AT_CONTEXT_CATEGORIES` + `getActiveAtMention` so `AgentDashboard` does not depend on the `forwardRef` picker module for those bindings. **No `lazy()`** — keeps a **single** `agent-dashboard.js` for R2 (lazy had produced a second chunk `agent-dashboard-ChatAtContextPicker.js`).

### Files changed
- `agent-dashboard/src/chatAtContextMention.js` — new.
- `agent-dashboard/src/ChatAtContextPicker.jsx` — import categories from mention module; re-export mention API.
- `agent-dashboard/src/AgentDashboard.jsx` — import `getActiveAtMention` from mention module; import `ChatAtContextPicker` from picker.
- `agent-dashboard/vite.config.js` — `VITE_AGENT_DASHBOARD_DEBUG=1` → `dist-debug/`, `minify: false`, `sourcemap: true`.
- `agent-dashboard/package.json` — script `build:debug`.
- `dashboard/agent.html` — cache buster **`?v=138` → `?v=139`**.
- `migrations/175_sprint_snapshots.sql` — `CREATE TABLE sprint_snapshots` + baseline `INSERT OR IGNORE` (subqueries from `roadmap_steps`, `agentsam_agent_run`, `agent_telemetry`, `deployments`). **Not executed here** — run wrangler d1 when approved.
- `.gitignore` — `agent-dashboard/dist-debug/`.

### R2 / deploy
- **R2 uploaded (remote):** `agent-dashboard.js`, `agent-dashboard.css`, `agent.html` after production build.
- Worker: not deployed this step.

### What you should do
Hard refresh `/dashboard/agent` (now **v=139**). If `Ts` error persists, open **`dist-debug/agent-dashboard.js`** + `.map` from `npm run build:debug` in `agent-dashboard` and map stack line to source. Approve **`migrations/175_sprint_snapshots.sql`** on D1 when ready; Sunday cron still to be implemented in `worker.js`.

## 2026-03-25 `Ts` TDZ — root cause @xterm/xterm Browser export order

### Root cause
`ReferenceError: Cannot access 'Ts' before initialization` was **not** React / ChatAtContextPicker. In **`@xterm/xterm` `lib/xterm.mjs`**, the bundled block runs `Ll(tn,{ isChromeOS: ()=>Ts, ...})` **before** `var Mi=... Ts=/\bCrOS\b/.test(Pi)`. `Ll` is `Object.defineProperty` with getters; runtime/minifier ordering led to **`Ts` (minified `Nx`) read before init**. Same pattern in production: `lk(Ix,{ isChromeOS:()=>Nx,...})` before `Nx=/\bCrOS\b/...`.

### Fix
- **`agent-dashboard/vite-plugin-fix-xterm-browser-tdz.js`**: Vite `pre` transform moves `var tn={};Ll(tn,{...});` to **after** `Ts=/\bCrOS\b/.test(Pi);` in `@xterm` sources.
- **`agent-dashboard/vite.config.js`**: register `fixXtermBrowserTdz()` before `@vitejs/plugin-react`.
- **`dashboard/agent.html`**: cache bust **v=140**.

### R2
Uploaded `agent-dashboard.js`, `agent-dashboard.css`, `agent.html` (remote) after rebuild.

## 2026-03-25 `Ts` TDZ — real cause: `syncInputCaretOffset` after keyboard `useEffect`

### Root cause
Minified name **`Ts`** was **`syncInputCaretOffset`** (`const Ts=u.useCallback(...)`). The **keyboard shortcuts** `useEffect` (insert `@` on mod+p, etc.) **called** `syncInputCaretOffset` and listed it in the **dependency array** at **lines 1857–1864**, but **`syncInputCaretOffset` was declared at 1911** — classic **TDZ**: dependency array evaluates **`syncInputCaretOffset` before `const` init**. Same stack line/column as before because it was always this hook order, not xterm-only (xterm plugin remains a valid hardening).

### Fix
- **`AgentDashboard.jsx`:** moved **`syncInputCaretOffset`** `useCallback` to **immediately before** the keyboard shortcuts `useEffect` (~line 1770); removed duplicate later block.
- **`dashboard/agent.html`:** **`?v=141`**.

### R2
Uploaded `agent-dashboard.js`, `agent-dashboard.css`, `agent.html` after build.


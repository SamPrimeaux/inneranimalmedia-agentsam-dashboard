# AGENT SAM — SESSION HANDOFF (append; latest first)

---

## START HERE 2026-03-17 (from 2026-03-16 facts)

**Source:** memory/daily/2026-03-16.md and docs/AGENT_SAM_ROADMAP.md in R2 iam-platform.

**Verified live:** Agent dashboard v=50; Monaco diff flow working (Keep Changes saves to R2); disposal error fixed. Phase 2 (Monaco Diff Flow) 95% complete.

**Where to begin (facts only):**
1. **Optional quick win:** Auto-hide diff panel after successful save (15–30 min; cosmetic; file save already works).
2. **High priority:** Phase 4 — Tool Execution Feedback (SSE tool_start/tool_result, React indicators in chat; 3–4 hours; critical UX gap).
3. **Existing TASK 0** (chat history — only last 2 messages) remains from 2026-03-12 handoff; still valid if not yet done.

**Read first:** GET /api/agent/bootstrap returns daily_log (memory/daily/2026-03-16.md). Run **Re-index memory** from Agent dashboard (+ menu) so AutoRAG has today’s memory and knowledge docs.

---

## TASK 0 (HIGHEST PRIORITY) — Fix chat history — only saving last 2 messages

**Symptom:** Chat sessions save but only retain the last 2 messages.
All prior context is lost on reload.

**Where to look first:**
grep -n "conversation\|messages\|chat_history\|saveChat\|persistChat\|insertMessage\|upsert" \
  ~/Downloads/march1st-inneranimalmedia/worker.js | grep -i "chat\|conv\|message" | head -30

grep -n "conversation\|messages\|localStorage\|saveChat\|history" \
  agent-dashboard/src/AgentDashboard.jsx | head -30

**Likely causes:**
1. Worker INSERT is doing REPLACE INTO with only current message (overwrites history)
2. React is only sending last 2 messages in the POST body to /api/agent/chat
3. D1 chat_messages table has a LIMIT 2 baked into the SELECT on load
4. State management — React messages array resets on component remount

**Audit before touching anything:**
SELECT sql FROM sqlite_master WHERE name LIKE '%chat%' OR name LIKE '%message%' OR name LIKE '%conversation%';
SELECT * FROM [chat_table] ORDER BY created_at DESC LIMIT 5;

**Fix must:**
- Persist ALL messages per conversation_id
- Load full history on conversation resume
- Handle Sam having many projects + many chats open simultaneously
- Never truncate — if DB gets large, summarize old turns, never delete
Then push to GitHub and re-upload TOMORROW.md to R2.

This is TASK 0 — do it before anything else tomorrow. A broken memory is a broken agent.
**Owner:** Sam Primeaux / Inner Animal Media
**Status:** v34 stable. Tool loop working. Memory written. Views fixed. Sleep checkpoint.

---

## CONFIRMED WORKING (do not touch)

| System | State |
|--------|-------|
| Tool loop — Anthropic/OpenAI/Google | Working, MAX_ROUNDS=8 |
| PTY terminal execution | Working, direct WebSocket, no HTTP loopback |
| Intent classifier | Working — question/sql/shell/mixed routing |
| d1_query | Working — SELECT only |
| d1_write | Enabled in DB, but SELECT restriction still in code — fix tomorrow |
| terminal_execute | Working via runTerminalCommand() |
| agent_memory_index | 5 entries written, tenant_id=tenant_sam_primeaux |
| agent_cursor_rules | 10 rules active |
| cidi_active_workflows view | Fixed — cl.name not cl.company_name |
| cidi_recent_completions view | Fixed — same |
| R2 session logs | Written to iam-platform/agent-sessions/ |
| GitHub agentsam-clean | Synced |
| AutoRAG | Wired, data source = iam-platform R2 bucket |
| ai_knowledge_base | 54/56 docs is_indexed=1, 2 remaining |

## DO NOT TOUCH — EVER

| Path | Rule |
|------|------|
| handleGoogleOAuthCallback | Never |
| handleGitHubOAuthCallback | Never |
| wrangler.production.toml bindings | Never modify |
| ~/.cloudflared/config.yml | Never add protocol: http2 |
| ~/Library/LaunchAgents/ | Never create plist files |
| Streaming functions in worker.js | Separate branch from tool loop, do not cross |

---

## HOW TO START TOMORROW

**Step 1 — Open fresh Agent Sam session at /dashboard/agent**

Ask it:
```
Run d1_query: SELECT id, key, importance_score FROM agent_memory_index
WHERE tenant_id='tenant_sam_primeaux' ORDER BY importance_score DESC;

Also: SELECT id, rule_key FROM agent_cursor_rules WHERE is_active=1;
```

If it returns 5 memory rows and 10 rules — you're in a good state. Proceed.
If not — the compiled context cache expired. Run:
```bash
cd ~/Downloads/march1st-inneranimalmedia
./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
  --remote -c wrangler.production.toml \
  --command "UPDATE ai_compiled_context_cache SET expires_at = unixepoch() + 2592000 WHERE tenant_id='tenant_sam_primeaux';"
```

**Step 2 — Open Cursor, set working directory**
```bash
cd ~/Downloads/march1st-inneranimalmedia
```
Tell Cursor: "Read TOMORROW.md in agentsam-clean/docs/ before doing anything."

---

## TASK ORDER — DO NOT SKIP STEPS

### TASK 1 — Fix d1_write in worker.js (Cursor)
**The problem:** d1_write has the same SELECT-only check as d1_query.
**The fix:** In runToolLoop, find the d1_write case and remove the SELECT restriction.

Only block these patterns:
```javascript
const blocked = /^\s*(drop\s+table|truncate)/i;
// Allow everything else: INSERT, UPDATE, DELETE with WHERE,
// CREATE VIEW, DROP VIEW, CREATE TABLE, ALTER TABLE
```

Do NOT touch d1_query — that stays SELECT-only.
After fix: deploy, bump agent-dashboard.js?v=35, sync to GitHub.

**Verify with Agent Sam:**
```
Use d1_write to run:
INSERT INTO agent_memory_index (id, tenant_id, key, value, importance_score, updated_at)
VALUES ('mem_d1_write_test', 'tenant_sam_primeaux', 'test', 'write confirmed', 0.5, unixepoch());
Then SELECT it back and DELETE it.
```

---

### TASK 2 — Vectorize remaining 2 knowledge base docs (Agent Sam via terminal)
**The problem:** 2 docs remain with is_indexed=0.
**Find them:**
```sql
SELECT id, title FROM ai_knowledge_base WHERE is_indexed=0 OR is_indexed IS NULL;
```

**Write each doc to iam-platform R2 so AutoRAG picks it up:**
```bash
wrangler r2 object put iam-platform/knowledge/{doc_id}.md \
  --body "{content}" \
  --remote -c ~/Downloads/march1st-inneranimalmedia/wrangler.production.toml
```

Then mark indexed:
```sql
UPDATE ai_knowledge_base SET is_indexed=1 WHERE id='{doc_id}';
```

AutoRAG indexes it automatically. No custom pipeline needed.

---

### TASK 3 — GitHub Actions webhook receiver (Cursor, worker.js only)
**Route to add:** POST /api/github/webhook

```javascript
// Verify X-Hub-Signature-256 header using GITHUB_WEBHOOK_SECRET
// Parse: action, workflow_run.{id, name, status, conclusion, head_branch, head_sha, created_at, updated_at}
// INSERT into cicd_runs (run_id, workflow_name, branch, commit_sha, status, conclusion, started_at, completed_at, repo_name)
// Return 200 JSON {ok:true}
```

Also add GITHUB_WEBHOOK_SECRET to Worker secrets.

Register in GitHub:
- URL: https://inneranimalmedia.com/api/github/webhook
- Content type: application/json
- Events: workflow_run
- Secret: same as GITHUB_WEBHOOK_SECRET

**Verify:** Push a commit, check `SELECT * FROM cicd_runs LIMIT 1;`

---

### TASK 4 — UI fixes (AgentDashboard.jsx ONLY — do NOT touch worker.js)

Fix these in order, one at a time, rebuild between each:

1. **Scroll jump** — messages container should smooth scroll to bottom on new message
   ```javascript
   // Add ref to last message div, call scrollIntoView({behavior:'smooth'}) after render
   ```

2. **Chat area collapses on fresh load** — messages container needs flex-1 or min-height

3. **Loading indicator** — separate component, not a message bubble

4. **Message queue** — buffer sends while isLoading=true, drain on response

Each fix: rebuild -> `wrangler r2 object put agent-sam/static/dashboard/agent/agent-dashboard.js` -> bump ?v= in agent.html -> verify in browser.

---

### TASK 5 — Morning brief cron (Cursor, worker.js)
**Add scheduled handler** to worker.js for 6am CST (11:00 UTC):

```javascript
// scheduled(event, env, ctx)
// Query: recent cost_tracking, active projects, pending cidi workflows
// Format as markdown brief
// Write to iam-platform/briefs/YYYY-MM-DD.md
// Send email via Resend to sam@inneranimals.com
```

Add to wrangler.production.toml:
```toml
[triggers]
crons = ["0 11 * * *"]
```

---

## ROADMAP STEPS — INSERT THESE TO DB

Run this after TASK 1 is complete so Agent Sam can write it:

```sql
INSERT INTO roadmap_steps (id, title, status, order_index, description, created_at) VALUES
('rs_001', 'Fix d1_write DDL restriction in runToolLoop', 'pending', 1,
 'Remove SELECT-only check from d1_write case. Allow INSERT/UPDATE/DELETE/CREATE VIEW/DROP VIEW/ALTER TABLE. Block only DROP TABLE and TRUNCATE.',
 unixepoch()),
('rs_002', 'Vectorize remaining 2 knowledge base docs via R2', 'pending', 2,
 'Find is_indexed=0 docs in ai_knowledge_base. Write to iam-platform R2. Mark is_indexed=1. AutoRAG handles the rest.',
 unixepoch()),
('rs_003', 'GitHub Actions webhook receiver POST /api/github/webhook', 'pending', 3,
 'Verify X-Hub-Signature-256. Parse workflow_run payload. INSERT into cicd_runs. Register webhook in GitHub.',
 unixepoch()),
('rs_004', 'UI fixes — scroll/loading/queue in AgentDashboard.jsx', 'pending', 4,
 'Smooth scroll to bottom. Fix fresh load collapse. Loading indicator as separate component. Message queue while isLoading.',
 unixepoch()),
('rs_005', 'Morning brief cron 6am CST via Worker scheduled handler', 'pending', 5,
 'Query cost/projects/cidi. Format markdown. Write to iam-platform R2. Email via Resend.',
 unixepoch()),
('rs_006', 'Wire ai_workflow_pipelines cron triggers', 'pending', 6,
 'POST /api/admin/trigger-workflow endpoint. Wire to existing ai_workflow_pipelines rows. Log to ai_workflow_executions.',
 unixepoch()),
('rs_007', 'Monaco editor R2 round-trip in agent Files tab', 'pending', 7,
 'r2_read: GET from agent-sam bucket into Monaco. r2_write: PUT back after edit. This replaces Cursor for R2 file edits.',
 unixepoch());
```

---

## KEY FACTS AGENT SAM MUST KNOW

```
tenant_id for all memory writes: tenant_sam_primeaux
D1 database: inneranimalmedia-business (cf87b717-d4e2-4cf8-bab0-a81268e32d49)
Worker name: inneranimalmedia
Deploy: ./scripts/with-cloudflare-env.sh npx wrangler deploy -c wrangler.production.toml
GitHub permanent source: https://github.com/SamPrimeaux/inneranimalmedia-agentsam-dashboard
R2 source of truth for live pages: agent-sam bucket
AutoRAG data source: iam-platform bucket (NOT Vectorize directly)
React bundle: static/dashboard/agent/agent-dashboard.js (currently ?v=34)
agent.html: static/dashboard/agent.html
PTY token starts: cec612d6
PTY tunnel: wss://terminal.inneranimalmedia.com
Cloudflare account: ede6590ac0d2fb7daf155b35653457b2
AI Search instance: inneranimalmedia-aisearch
```

---

## WHAT AGENT SAM BUILT TONIGHT (for AutoRAG context)

- Tool loop fires correctly: round 1 tool_use, round 2 end_turn
- Mixed intent classifier: decomposes shell+sql tasks, runs in order, single response
- runTerminalCommand() shared function — no HTTP loopback, direct PTY WS
- PTY session_id leak filtered from output
- mcp_registered_tools input_schema normalization (flat maps -> proper object schema)
- d1_query SELECT validation handles multiline SQL
- Message history filter removes No response ghost entries
- UI: trailing 0 fix, responsive footer, messages container minWidth:0
- 5 memory entries in agent_memory_index (tenant_sam_primeaux)
- 10 cursor rules in agent_cursor_rules
- cidi_active_workflows and cidi_recent_completions views fixed (cl.name)
- Session logs written to iam-platform R2 for AutoRAG
- Schema truth documented: agent_cursor_rules uses rule_key/content not rule/rule_text

---

*Written 2026-03-12. Next session starts at TASK 1.*

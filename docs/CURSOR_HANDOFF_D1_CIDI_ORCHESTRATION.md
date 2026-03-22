# Cursor handoff: D1 + CIDI orchestration (deploys, webhooks, workflows, quality, R2)

Paste the **block at the end** into a new Cursor chat. Use this file as the canonical playbook when touching **inneranimalmedia-business** D1, **sandbox** Workers, or **promotion** to production.

---

## 1. Your job (other Cursor)

- After **any** deploy, R2 upload, webhook change, or workflow run Sam cares about: **propose the minimal D1 writes** (which tables, which columns), run them only after Sam says **go** / **approved** unless he already approved automation for that action.
- **Never** deploy Cloudflare Workers to production without Sam typing **`deploy approved`**.
- **Never** edit `worker.js` OAuth callbacks without explicit line approval.
- Prefer **one SQL file per batch** under `scripts/d1-*.sql` and execute with:

  `./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=scripts/....sql`

- Append **`docs/cursor-session-log.md`** after substantive DB or script changes.

---

## 2. Table map — what fires when (high level)

| Area | Tables | When to write |
|------|--------|----------------|
| **Ship record** | `deployments`, `deployment_tracking`, `deployment_changes`, `cloudflare_deployments` (if used) | After production or sandbox Worker deploy; include `triggered_by`, `worker_name`, `git_hash`, `notes`. |
| **Perf / SLO** | `deployment_performance_metrics`, `execution_performance_metrics`, `deployment_health_checks` | After timed deploy or health check job; optional for sandbox. |
| **Alerts** | `deployment_notifications`, `workflow_alerts` | On failure or rollback; don’t spam on every success. |
| **Webhooks** | `webhook_endpoints`, `webhook_events`, `hook_subscriptions`, `hook_executions`, `webhook_event_stats` | See section 4. |
| **Quality** | `quality_runs`, `quality_results`, `quality_gates`, `quality_gate_sets`, `quality_checks` | After CI/Playwright/overnight; link `run` → `results`. |
| **R2** | `r2_buckets`, `r2_intended_paths`, `r2_object_inventory`, `r2_object_media` | New bucket → `r2_buckets`; optional inventory sync from scripts. |
| **Roadmap** | `roadmap_plans`, `roadmap_steps` | When Sam finishes a milestone; keep `plan_iam_dashboard_v1` in sync with reality. |
| **MCP / CIDI** | `mcp_workflows` | Defined workflows; runner may log to `workflow_runs` / `workflow_executions` if wired. |
| **Workspaces** | `workspaces`, `workspace_projects`, `projects` | When client or project scope changes. |
| **Registry** | `worker_registry`, `github_repositories` | When Workers or repos change names, URLs, or bindings. |
| **Schema** | `schema_versions`, `tracking_metrics` | After migrations or metric definition changes. |

**Rule:** Do not try to fill every table on every action. Pick the **smallest set** that gives Sam a durable audit trail.

---

## 3. GitHub repo row (`github_repositories`)

Sam’s update is **correct** for linking the repo to the **sandbox** preview host:

```sql
UPDATE github_repositories
SET workers_dev_subdomain = 'inneranimal-dashboard.meauxbility.workers.dev'
WHERE id = 1;
```

- **`cloudflare_worker_name` = `inneranimalmedia`** on `id=1` is still the **production** site worker; the **preview** Worker is **`inneranimal-dashboard`** (separate Cloudflare resource). Do not overwrite production worker name unless Sam asks.
- Use **`status_notes`** (and `worker_registry.notes`) to document “preview vs prod” so future agents don’t “fix” this incorrectly.

---

## 4. Webhooks: `webhook_events` / `webhook_event_stats` / `secret_hash`

**How events get rows:** Production `worker.js` **`handleInboundWebhook`** resolves an active row in **`webhook_endpoints`** by `source` + normalized path, then **`INSERT INTO webhook_events`**. If no matching endpoint → **503** and **no row**.

**Stats:** `webhook_event_stats` is updated by **scheduled/cron logic** in the Worker (rollup from `webhook_events`). If cron isn’t firing or events aren’t inserted, stats stay stale.

**Checklist when “not firing”:**

1. `GET /api/webhooks/health` (or `/api/hooks/health`) — lists endpoints and subscription counts.
2. Confirm the **exact** URL path matches **`webhook_endpoints.endpoint_path`** for that `source`.
3. Confirm **`is_active`** on the endpoint.
4. For **GitHub/Cursor/Stripe**, signature verification must pass (secrets in Worker env / vault). **`secret_hash` in D1 can be NULL** if verification uses **only** Worker secrets and the DB column is reserved for future “hash of shared secret for dashboard display.” **Do not store raw secrets in D1.** If you add hashes, store **SHA-256** of the configured secret, never plaintext.
5. **New provider?** Add a **new** `webhook_endpoints` row + route in Worker — don’t overload an existing path without Sam.

**Do you need another endpoint row?** Only if you add a **new path or new source**; you do **not** need duplicates for the same path.

---

## 5. `workflow_locks` — what it is

**Purpose:** Distributed-style **mutex** for long operations: `lock_key` (PK), `locked_by`, `expires_at`, `operation`, `metadata_json`.

**Use:** Before a risky automated deploy or migration, **INSERT** a lock with a short TTL; **DELETE** or let expire when done. Prevents two agents from running conflicting promotions. Optional for Sam’s solo workflow until automation increases.

---

## 6. MCP workflow for 2-step Agent UI (CIDI)

- **Id:** `wf_cidi_agent_ui_sandbox_to_prod`
- **Step 1:** D1 sanity query + **handoff** to `./scripts/upload-repo-to-r2-sandbox.sh`
- **Step 2:** Roadmap check + **handoff** to `PROMOTE_OK=1 ./scripts/promote-agent-dashboard-to-production.sh` (**`requires_approval` = true**)

Created/updated by **`scripts/d1-cidi-bootstrap-20260322.sql`**.

---

## 7. Scripts Sam already has (use these first)

| Script | Role |
|--------|------|
| `scripts/upload-repo-to-r2-sandbox.sh` | Repo → **agent-sam-sandbox-cidi** |
| `scripts/promote-agent-dashboard-to-production.sh` | Agent HTML + Vite dist → **agent-sam** (`PROMOTE_OK=1`) |
| `scripts/deploy-with-record.sh` / `post-deploy-record.sh` | Production deploy + logging (when Sam approves) |
| `scripts/d1-cidi-bootstrap-20260322.sql` | R2 row + MCP workflow + `worker_registry` touch-up |

---

## 8. `worker_registry` — `inneranimal-dashboard`

Row **`wr_inneranimal_dashboard_001`** should list **`workers_dev_subdomain`** = full host **`inneranimal-dashboard.meauxbility.workers.dev`**, **`worker_type`** = **`staging`** (DB CHECK allows production|development|staging|test|deprecated — not `preview`), **`r2_buckets`** JSON including **`agent-sam-sandbox-cidi`**. Bootstrap SQL updates this; refine **`bindings_detail`** when you have an exact binding export from Cloudflare.

---

## Copy-paste prompt for the other Cursor

```markdown
You are the D1 / CIDI orchestration agent for Inner Animal Media.

Read first: docs/CURSOR_HANDOFF_D1_CIDI_ORCHESTRATION.md and docs/CURSOR_HANDOFF_SANDBOX_UI_TO_PRODUCTION.md.

Rules:
- Production Worker deploy only after Sam types: deploy approved.
- Do not change worker.js OAuth callbacks without explicit approval.
- For D1 writes: prefer scripts/d1-*.sql + wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml; propose SQL before running if not already approved.
- After deploys: insert or update deployments + deployment_tracking (and deployment_changes if you have file list); optional metrics tables only when you have real timings.
- Webhooks: no row in webhook_events means handleInboundWebhook did not match webhook_endpoints or verify failed — fix path/source/secrets, not duplicate endpoints blindly. secret_hash NULL is OK if verification uses Worker secrets only; never store plaintext secrets in D1.
- workflow_locks: optional mutex for concurrent automation (lock_key, expires_at).
- Agent UI promotion path: wf_cidi_agent_ui_sandbox_to_prod in mcp_workflows; scripts upload-repo-to-r2-sandbox.sh and PROMOTE_OK=1 promote-agent-dashboard-to-production.sh.

When Sam asks to “sync DB for this action,” respond with: (1) which tables, (2) exact SQL or script path, (3) what must stay empty if data unknown.

Task: [paste Sam’s request]
```

---

_End of file._

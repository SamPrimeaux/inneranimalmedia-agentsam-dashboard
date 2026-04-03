# CIDI-related D1 tables and how we keep them honest

This doc is the **operator index** for `cidi_*` and related audit tables. Agents should read this before inserting ad-hoc rows or inventing new keys.

---

## Tables (inneranimalmedia-business)

| Table | Role |
|-------|------|
| **`cidi_pipeline_runs`** | One row per logical pipeline run (`run_id` PK). Tracks `env` (sandbox \| production), `status` (pending \| running \| passed \| failed \| rolled_back), optional `commit_hash`, `notes`. |
| **`cidi_run_results`** | Child rows keyed by `run_id` + `id`. Per-step result: `tool_name`, `test_type` (invoke \| agent_chat \| route \| d1 \| r2), `status` (pass \| fail \| skip), `response_preview`. |
| **`cidi_activity_log`** | Narrative audit for workflow `CIDI-IAM-AGENTSAM-20260322`; references `cidi_id` (production row `4` used in migrations 203 and 205). |
| **`cicd_runs`** | GitHub / manual CI run records (paired with worker mirroring to `deployments` where applicable). |
| **`cidi`** (if present) | Parent workflow rows; **do not** insert here from migrations unless a migration explicitly extends schema. Prefer `cidi_activity_log` for narrative. |

**Views:** `cidi_recent_completions` and similar are **views** — insert into base tables only. See `docs/AGENT_SAM_UNIVERSAL_SYNC_LAW.md`.

---

## Canonical migrations (append-only log)

| File | What it records |
|------|------------------|
| `migrations/175_cidi_pipeline.sql` | Creates `cidi_pipeline_runs` and `cidi_run_results` if missing. |
| `migrations/203_cidi_log_git_push_main_393a9c0.sql` | Git push `393a9c0` + `cicd_runs` + `cidi_activity_log` + pipeline `pip_cidi_20260331_393a9c0`. |
| `migrations/204_project_memory_cidi_three_step_and_plan_steps.sql` | `project_memory` `CIDI_THREE_STEP_SYSTEM` + `plan_steps` for `proj_iam_tools_agent_workspace`. |
| `migrations/205_cidi_cursor_sync_overnight_docs_20260401.sql` | Repo sync: overnight suite docs, morning-plan telemetry prompt, CIDI documentation index. |
| `migrations/207_cidi_aitestsuite_shell_v1_2_0.sql` | AITestSuite (`SamPrimeaux/meauxcad`, Worker `aitestsuite`) shell **v1.2.0** — `cicd_runs` + `cidi_*` audit; commit `a8854e3`. |
| `migrations/209_cidi_meauxcad_chat_log_builds_activity.sql` | `builds` + **3** `cidi_activity_log` rows: meauxcad `6b18e70` (chat to `ai_api_test_runs`), monorepo `329fd84` (migration 208 note), `builds` doc row `iam-build-meauxcad-aitestsuite-chatlog-6b18e70`. |
| `migrations/215_project_memory_agent_dashboard_ui_20260402.sql` | `project_memory`: `AGENT_DASHBOARD_UI_CONTEXT` + fix `CIDI_THREE_STEP_SYSTEM` sandbox bucket string `agent-sam-sandbox-cicd`; `roadmap_steps` completed: mention/activeFile + HTML blob preview. |

---

## Apply a migration to production D1

From repo root (requires Cloudflare token via `with-cloudflare-env.sh`):

```bash
./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/205_cidi_cursor_sync_overnight_docs_20260401.sql
```

Replace the filename with the migration you intend to run. **Never** run against production without Sam approval for schema-destroying changes; these CIDI migrations are INSERT-heavy only.

---

## Runtime writers (worker)

- **`cidi_pipeline_runs` / `cidi_run_results`:** Worker inserts around deploy / benchmark flows (see `worker.js` grep `cidi_pipeline_runs`).
- **`cidi_activity_log`:** GitHub `cicd_runs` follow-ups and `update_cidi` tooling (`recordGithubCicdFollowups`, etc.).

Manual migrations (203, 205) backfill when webhooks or CI did not fire.

---

## Related docs

- `docs/CIDI_SHELL_MASTER_README.md` — first full CIDI cycle + shell gates.
- `docs/CLAUDE_CODE_OVERNIGHT_HANDOFF.md` — overnight HTTP suite + env (including `INTERNAL_API_SECRET`).
- `project_memory` key **`CIDI_THREE_STEP_SYSTEM`** — JSON pipeline steps (sandbox deploy, benchmark, promote).

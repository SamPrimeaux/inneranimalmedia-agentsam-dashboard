# CLAUDE.md — Inner Animal Media (Agent Sam)

Use this file when working in **march1st-inneranimalmedia** via **Claude Code CLI**, **Cursor**, or **GitHub**-connected automation. It complements `.cursorrules` and `AGENTS.md`.

## Project identity

- **Repo path (canonical):** `/Users/samprimeaux/Downloads/march1st-inneranimalmedia`
- **Prod dashboard:** `https://inneranimalmedia.com/dashboard/agent`
- **Sandbox dashboard:** `https://inneranimal-dashboard.meauxbility.workers.dev/dashboard/agent`
- **TOOLS public origin:** `https://tools.inneranimalmedia.com`
- **D1 (prod):** `inneranimalmedia-business` — id `cf87b717-d4e2-4cf8-bab0-a81268e32d49`

## CLI tools — how to invoke

| Tool | Pattern |
|------|---------|
| **Wrangler (prod D1 / R2)** | From repo root: `./scripts/with-cloudflare-env.sh npx wrangler <subcommand> ... -c wrangler.production.toml`. Never rely on bare `npx wrangler` at root without `-c` for prod. |
| **Wrangler (sandbox worker)** | Config: `wrangler.jsonc` at root for `inneranimal-dashboard` — follow `scripts/deploy-sandbox.sh`. |
| **D1 read/write** | `./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --command="..."` or `--file=./migrations/....sql` |
| **gcloud** | User uses profile `inneranimals` / project `gen-lang-client-0684066529` for Vertex smoke; do not assume gcloud auth in CI unless documented. |
| **Git** | `git status`, `git diff` before claiming done; `main` tracks production intent; push per Sam. |
| **npm (dashboard)** | `cd agent-dashboard && npm run build:vite-only` for Vite bundle; avoid `npm run deploy` unless Sam approves deploy. If `NODE_ENV=production` globally, `npm ci` skips devDependencies and Vite is missing — unset `NODE_ENV` or use `NODE_ENV=development` for install. |
| **MCP `r2_list` / R2** | Read-only listing under MCP `inneranimalmedia`; approve recurring prompts with “don’t ask again” for this repo if Sam trusts it. Alternative: `wrangler r2 object list` with correct bucket + credentials. |

## Locked / high-risk (do not touch without explicit Sam approval)

- **`worker.js`:** `handleGoogleOAuthCallback`, `handleGitHubOAuthCallback` — breaking these locks all users out.
- **`wrangler.production.toml`:** bindings/secrets — do not edit casually.
- **`FloatingPreviewPanel.jsx`:** surgical edits only; state line numbers first.
- **`agent.html`:** no wholesale rewrite.
- **New Cloudflare Workers / D1 DBs / R2 buckets / `wrangler secret put`** — forbidden without Sam saying it is intentional.

## Deploy and CIDI (summary)

- **Sandbox first:** `cd agent-dashboard && npm run build:vite-only && cd .. && ./scripts/deploy-sandbox.sh`
- **Benchmark:** `./scripts/benchmark-full.sh sandbox` before promote.
- **Prod promote:** Sam runs `./scripts/promote-to-prod.sh` — do not run prod worker deploy autonomously unless Sam types deploy approval per project rules.
- **MCP worker deploy:** only `inneranimalmedia-mcp-server/` with its own `wrangler.toml` — never monorepo root wrangler for MCP.

## R2 layout (TOOLS bucket `tools`)

- **Bucket name is `tools` (not `agent-sam`).** Prefix for Monaco workspace mirror: `code/monaco/`.
- **Public `curl` to `tools.inneranimalmedia.com` may return 403** on some objects (WAF/bot rules). **Authoritative pull:**  
  `./scripts/with-cloudflare-env.sh npx wrangler r2 object get tools/code/monaco/<file> --remote --file=<local> -c wrangler.production.toml`
- **Monaco AMD:** `code/monaco/vs/` — do not re-upload unless version bump; use `scripts/upload-monaco-to-tools-r2.sh`.
- **Monaco delivery / workspace source (mirror):** `code/monaco/` (jsx, css, config docs) — **repo `agent-dashboard` is source of truth once merged**; R2 is reference/backup.
- **MeauxCAD v1:** `code/meauxcad/v1/` + `MANIFEST.json` — documented in D1 `project_memory` key `TOOLS_IAM_EDITOR_ASSETS_v1`.

## D1 pointers

- **CIDI tables + migration index:** `docs/CIDI_TABLES_AND_MIGRATIONS.md` (`cidi_pipeline_runs`, `cidi_run_results`, `cidi_activity_log`, `cicd_runs`, migrations 175/203/204/205).
- CIDI steps: `plan_steps` where `project_id = 'proj_iam_tools_agent_workspace'`.
- Canonical CIDI JSON: `project_memory` key `CIDI_THREE_STEP_SYSTEM`, `project_id = 'inneranimalmedia'`.
- Tools/editor assets: `TOOLS_IAM_EDITOR_ASSETS_v1` (MeauxCAD bundle + Monaco AMD metadata).

## Current Monaco integration goal (Claude Code scope)

- Merge Monaco workspace files from TOOLS `code/monaco/` into `agent-dashboard/src/` (e.g. `workspace/`), wire `main.jsx` + loader, keep `build:vite-only` green.
- **Out of scope in same pass:** MeauxCAD Three/Excalidraw lazy route, new D1 rows, re-upload `code/monaco/vs/`.

## Overnight testing — HTTP canary vs provider batch E2E

- **Paste handoff for Claude Code:** **`docs/CLAUDE_CODE_OVERNIGHT_HANDOFF.md`** (gated run order, anti-loop limits, fail-soft batch).
- **Morning email vs test metrics:** **`docs/OVERNIGHT_EMAIL_AND_METRICS.md`** — digest vs daily plan; `SESSION_COOKIE` for Tier C; `project_memory` if you want overnight results in the morning briefing.
- **`scripts/overnight-api-suite.mjs`** + **`docs/OVERNIGHT_BATCH_API_TEST_BRIEF.md`:** tiered **sandbox/prod GET**, optional **one** sandbox chat canary, **read-only D1** observation. Not a deploy gate.
- **True batch contract tests (Anthropic, OpenAI, Gemini):** direct provider APIs — see **`docs/OVERNIGHT_BATCH_API_TEST_BRIEF.md`** section *Provider batch APIs*. Implemented today: **`scripts/batch-api-test.sh`** (Anthropic only). **OpenAI** and **Gemini** batch E2E should mirror that script + `quality_checks` logging; keys from env, never committed.

## Session hygiene

- After substantive tasks, append `docs/cursor-session-log.md` (Sam’s format).
- No emojis in code or UI copy per project rules.
- No hardcoded hex in JSX/CSS — CSS variables / theme API.

## Claude Code CLI

- Run **`/init`** only if you want Claude to **regenerate** this file from a fresh scan; otherwise **edit `CLAUDE.md` here** as the source of truth.
- For permission prompts: prefer **allow MCP r2_list** with “don’t ask again” in this repo for read-only inventory, or use Wrangler if MCP is degraded.

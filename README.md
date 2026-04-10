# Inner Animal Media — Agent Sam Dashboard
# IAM Monolith Extraction — Session Log (April 9, 2026)

## Session Stats
- **Total commits today**: 14 (extraction session) out of ~50+ commits on April 9
- **New modular files created**: 5
- **Bugs caught and fixed during extraction**: 3
- **CI/CD pipeline fixed**: 1
- **Tooling established**: Claude Code (write) + Gemini (audit) two-agent pipeline

---

## Architecture Overview

The Agent Sam platform is migrating a ~30,000-line monolithic `worker.js` into a clean
ES-module `src/` structure. The monolith remains live and untouched during extraction —
routes are progressively lifted out one if-block at a time.

### Directory Map
```
src/
  index.js          — Modular router (entrypoint for wrangler.production.toml + CF builds)
  api/              — Domain HTTP handlers: (request, env, ctx) → Response
  integrations/     — Third-party connectors: imported by api/ handlers
  tools/builtin/    — Agent Sam tool definitions: (env, params) → { success: true, ... }
  core/             — Shared infra: auth, responses, d1 helpers, utils
  do/               — Durable Object class definitions
```

### Handler Signatures
| Type | Signature | Returns |
|------|-----------|---------|
| API Handler | `(request, env, ctx)` | `Response` via `jsonResponse()` |
| Tool Function | `(env, params)` | `{ success: true, ...data }` |
| Helper/Utility | `(DB, ...args)` or `(env, ...args)` | raw data |

### Key Infrastructure
- **Response helpers**: `src/core/responses.js` — use `jsonResponse()`, never raw `new Response()` except streaming/proxy
- **Auth**: `src/core/auth.js` — exports `getAuthUser`, `tenantIdFromEnv`
- **Tenant resolution**: always `tenantIdFromEnv(env)`, never hardcoded user strings
- **DB binding**: always `env.DB`, never pass bare `env` to D1 functions

---

## Completed Extractions

### 1. `/health` route → `src/api/health.js`
- **Commit**: `221babe`
- **Export**: `handleHealthCheck(request, env)`
- **Wired in**: `src/index.js` at `pathLower === '/health'`
- **Source**: `worker.js` line 2919
- **Fix applied**: Claude Code initially wrote `worker: 'agentsam-modular'` — caught and corrected to `'inneranimalmedia'` before commit

### 2. Vault module → `src/api/vault.js`
- **Commits**: `5d32e05`
- **Export**: `handleVaultApi(request, env)` (sole export)
- **Private helpers**: 19 `vault*` functions (unexported)
- **Wired in**: `src/index.js` at `pathLower.startsWith('/api/vault')`
- **Source**: `worker.js` lines 26252–26500
- **Bugs fixed**:
  - Hardcoded `VAULT_USER_ID = 'sam_primeaux'` replaced with `tenantIdFromEnv(env)` across all 6 callers
  - `vaultWriteAudit` refactored to accept `env` in options object so `tenantIdFromEnv` stays in scope
  - `vaultListSecrets` deduped redundant `.bind()` branch (both paths were identical)
- **Note**: `vaultCreateSecret` calls `tenantIdFromEnv(env)` twice intentionally — once for tid null-check, once for user_id bind slot

### 3. `getIntegrationToken` → `src/integrations/tokens.js`
- **Commits**: `339095f` (extraction) + `90a49da` (cleanup)
- **Export**: `getIntegrationToken(DB, userId, provider, accountId)`
- **Source**: `worker.js` line 26507 (15 lines, pure D1)
- **Previously duplicated in**: `src/core/auth.js` line 237 — removed in `90a49da`
- **Import sites updated**: `src/integrations/github.js`, `src/api/dashboard.js`
- **Bug caught by Claude Code**: `github.js` line 21 was calling `getIntegrationToken(env, ...)` — passing full `env` instead of `env.DB`. Fixed in same commit. This was a pre-existing bug in the monolith that extraction surfaced.
- **Monolith**: 29 call sites in `worker.js` remain intact (not rewired yet)

### 4. `runIntegritySnapshot` → `src/api/integrity.js`
- **Commits**: `f03a7be` (extraction) + `6fe77c5` (wiring)
- **Export**: `runIntegritySnapshot(env, triggeredBy)`
- **Source**: `worker.js` lines 7128–7257 (130 lines, pure `env.DB` SQL aggregation)
- **Wired in `src/index.js`**:
  - Manual: `path === '/api/system/health'` GET → `runIntegritySnapshot(env, 'manual')`
  - Cron: `scheduled` handler → `ctx.waitUntil(runIntegritySnapshot(env, 'cron').catch(...))`
- **Call sites in `worker.js`**: 3 remain (2903 API, 7128 definition, 25220 cron) — untouched

### 5. GitHub/integration routes → `src/integrations/github.js`
- **Commit**: `480be23`
- **Export**: `handleGithubApi(request, env, authUser)` appended to existing file
- **Routes extracted** (all from `worker.js` lines 3682–3825):
  - `GET /api/integrations/status`
  - `GET /api/integrations/gdrive/files` (OAuth refresh logic)
  - `GET /api/integrations/gdrive/file` (OAuth refresh logic)
  - `GET /api/integrations/github/repos`
  - `GET /api/integrations/github/files`
  - `GET /api/integrations/github/file`
  - `GET /api/integrations/github/raw` ← raw proxy, intentional `new Response()`
  - `GET /api/integrations/gdrive/raw` ← raw proxy, intentional `new Response()`
- **NOT YET WIRED**: `handleGithubApi` is extracted but not yet routed in `src/index.js`

---

## CI/CD Pipeline Fix

### CF Pages sandbox deploy pointing to wrong entrypoint
- **Commit**: `14da7e7`
- **File**: `scripts/deploy-cf-builds.sh` line 13
- **Problem**: `npx wrangler deploy ./worker.js -c wrangler.jsonc`
- **Fix**: `npx wrangler deploy ./src/index.js -c wrangler.jsonc`
- **Root cause**: Script predated the modular migration and was never updated
- **Impact**: Was causing CF Pages builds to fail with DO export errors on every push
- **Note**: `wrangler.production.toml` already had `main = "src/index.js"` correctly set

### Other build fixes landed earlier today (pre-extraction session)
- `0356a59` — migrate DOs to `src/do/`, prune worker.js
- `00898b8` — remove duplicate DO exports blocking build
- `585ad70` — restore SPA routing and static asset serving
- `dbf9e7b` — import DurableObject from `cloudflare:workers` in modular DO files

---

## Tooling Setup (established this session)

### Claude Code
- Launched via `claude` from repo root
- Auth: `ANTHROPIC_API_KEY` env var (resolved auth conflict by running `/logout` from claude.ai session)
- Permissions: "Allow all edits this session" (option 2) — set once per session
- Role: all file writes, extractions, fixes

### Gemini
- Role: read-only audit and verification after every commit
- Standard audit suite per extraction:
  1. Confirm export on line 1 of new file
  2. Cross-reference leakage check across all of `src/`
  3. Monolith integrity count (call sites in `worker.js` unchanged)
  4. `git log --oneline -5` sync verification

---

## Intentional Exceptions

| Exception | Location | Reason |
|-----------|----------|--------|
| `new Response()` streaming | `github.js` lines 423, 435 | Raw proxy — streams body with custom Content-Type, `jsonResponse` can't do this |
| 29 `getIntegrationToken` call sites in `worker.js` | `worker.js` | Monolith still live, progressive rewiring in future sessions |
| `handleGithubApi` not wired in `src/index.js` | — | Intentional — next session starts here |
| `worker.js` definition of `runIntegritySnapshot` at line 7128 | `worker.js` | Not deleted yet — monolith stability |

---

## What Is NOT Yet Done

### Immediately next (start of next session)
1. **Wire `handleGithubApi`** in `src/index.js` at `pathLower.startsWith('/api/integrations/')`
2. **Verify `/api/system/health` snapshot-write path** — the read path is modular but confirm the write path in `worker.js` is not orphaned

### Extraction queue (in priority order)
3. `canvas.js` integration cluster (`src/integrations/canvas.js` exists, audit what's wired)
4. `playwright.js` integration cluster (`src/integrations/playwright.js` exists, audit)
5. Progressive rewiring of 29 `getIntegrationToken` call sites in `worker.js` → import from `src/integrations/tokens.js`
6. `runIntegritySnapshot` — delete definition from `worker.js` line 7128 once both call sites import from `src/api/integrity.js`
7. Continue leaf-block extraction from `handleAgentApi` — one if-block at a time

### Longer term
- `src/api/dashboard.js` dispatcher — large, needs careful audit before touching
- `src/api/agent.js` + `agentChatSseHandler` — SSE stream, extract carefully
- All 19 tool modules in `src/tools/builtin/` — audit which are fully wired vs stubbed

---

## Non-Negotiables (pipeline rules for all agents)

- **Claude Code writes. Gemini audits. No exceptions.**
- **No autonomous prod deploys.** Pipeline: `benchmark-full.sh` (31/31 gate) → `promote-to-prod.sh`
- **Never move `handleAgentApi` wholesale.** Extract one `if (path === ...)` block at a time.
- **Always audit bindings after extraction**: `grep -roh "env\.[A-Z_]*" <file>` — confirm `env.DB` not `env` for D1 calls
- **No hardcoded user strings**: replace with `tenantIdFromEnv(env)`
- **No raw `new Response()`** except streaming/proxy routes — use `jsonResponse` from `src/core/responses.js`
- **`FloatingPreviewPanel.jsx` is protected** (~2100 lines) — do not rewrite
- **Never touch `wrangler.production.toml` or OAuth handlers** without explicit approval
- **`cloudflare_deployments` table is gone** — always use `deployments` table

---

## Repo Info
| Key | Value |
|-----|-------|
| Repo root | `~/Downloads/inneranimalmedia/inneranimalmedia-agentsam-dashboard` |
| GitHub | `SamPrimeaux/inneranimalmedia-agentsam-dashboard` |
| Sandbox worker | `inneranimal-dashboard.meauxbility.workers.dev` |
| Prod worker | `inneranimalmedia` |
| Sandbox R2 | `agent-sam-sandbox-cicd` |
| Prod R2 | `agent-sam` (binding: `DASHBOARD`) |
| Primary DB | `inneranimalmedia-business` (`cf87b717-d4e2-4cf8-bab0-a81268e32d49`) |
| MCP server | `mcp.inneranimalmedia.com/mcp` | 
This repo is the single source of truth for the **Agent Sam** dashboard, the Cloudflare Worker that serves it, public marketing pages, the MCP server, and the terminal server. Use this README to orient and pick up exactly where you left off (see **Where we left off** and **Key docs**).


## Public pages (marketing site)

- **Homepage:** `public-homepage/index-v3.html` → R2 **inneranimalmedia-assets** key `index-v3.html` → served at `/` and `/index.html`.
- **Other public pages:** `public-pages/about.html`, `contact.html`, `pricing.html`, `process.html` → same bucket, same filenames → worker maps:
  - `/work` → `process.html`
  - `/about` → `about.html`
  - `/services` → `pricing.html`
  - `/contact` → `contact.html`
- **Upload (after editing):** Use `./scripts/with-cloudflare-env.sh` and wrangler R2 put to **inneranimalmedia-assets** (see `public-homepage/README.md` for homepage; for others substitute the filename). No worker deploy needed for public HTML-only changes.
- **Optional routes** (worker also maps if files exist in ASSETS): `/terms`, `/privacy`, `/learn`, `/games` → `terms-of-service.html`, `privacy-policy.html`, `learn.html`, `games.html`.

---

## Dashboard pages (full list)

Worker serves dashboard HTML from R2 bucket **agent-sam** (binding `DASHBOARD`). Keys: `static/dashboard/<name>.html` or `dashboard/<name>.html`. The **overnight** script uses this list for before/after screenshots; keep in sync with actual routes.

- overview, finance, chats, mcp, cloud, time-tracking, **agent**, billing, clients, tools, calendar, images, draw, meet, kanban, cms, mail, pipelines, onboarding, user-settings, settings.

URLs: `https://inneranimalmedia.com/dashboard/<name>` (e.g. `/dashboard/agent`, `/dashboard/overview`). Auth required (worker checks session/OAuth).

**Agent page:** Loads `agent-dashboard.js` and `agent-dashboard.css` from `static/dashboard/agent/`. Cache-bust query in `dashboard/agent.html` (e.g. `?v=64`). After any agent-dashboard build, upload the two dist assets and `dashboard/agent.html` to R2, then deploy worker if needed.

---

## MCP and terminal

### MCP server (InnerAnimalMedia)

- **Sibling repo (canonical deploy source):** [github.com/SamPrimeaux/inneranimalmedia-mcp-server](https://github.com/SamPrimeaux/inneranimalmedia-mcp-server) — Worker **inneranimalmedia-mcp-server**. Vendored copy in this monorepo: `inneranimalmedia-mcp-server/`.
- **Endpoint:** `https://mcp.inneranimalmedia.com/mcp`
- **Auth:** `Authorization: Bearer <token>` (token in `.cursor/mcp.json` only; do not commit).
- **Required header:** `Accept: application/json, text/event-stream` (missing header returns 406).
- **Cursor:** `.cursor/mcp.json` in project root, server key `inneranimalmedia`. After editing, restart MCP (Cmd+Shift+P → "MCP: Restart Servers") or restart Cursor.
- **Health check (terminal):**
  ```bash
  curl -s -X POST https://mcp.inneranimalmedia.com/mcp \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -H "Authorization: Bearer <YOUR_TOKEN>" \
    -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}'
  ```
  Success: SSE output with `"serverInfo":{"name":"InnerAnimalMedia MCP","version":"1.0.0"}` and `"protocolVersion":"2024-11-05"`.
- **Deploy MCP:** From `inneranimalmedia-mcp-server/`: `npx wrangler deploy -c wrangler.toml` (required so Wrangler does not pick the repo root `wrangler.jsonc`). Or `npm run deploy` in that folder. Config: `inneranimalmedia-mcp-server/wrangler.toml` (`name = "inneranimalmedia-mcp-server"`).
- **Reference:** `docs/MCP_CURSOR_TERMINAL_SYNC.md` and `.cursor/rules/mcp-reference.mdc`.

### Terminal server (PTY)

- **Sibling repo (tunnel / isolated PTY):** [github.com/SamPrimeaux/iam-pty](https://github.com/SamPrimeaux/iam-pty) — production entry **terminal.inneranimalmedia.com** (tunnel + backup story). This repo may still contain `server/` for local/dev; align with iam-pty for production terminal.
- **Path:** `server/`. Node app using `node-pty` and WebSocket for browser terminal and Agent tool execution.
- **Run locally:** `./server/run-terminal-server.sh` (or `node server/terminal.js` with env).
- **Production:** May run behind a tunnel (see `server/tunnel.yml.example`). Not deployed as part of the Cloudflare Worker; separate process/machine.
- **Install as service:** `server/install-terminal-server-service.sh` (platform-dependent).

---

## R2 buckets (worker bindings)

| Binding | Bucket name | Purpose |
|---------|-------------|--------|
| **ASSETS** | inneranimalmedia-assets | Homepage (`index-v3.html`), public pages (about, contact, pricing, process), other static marketing assets. |
| **DASHBOARD** | agent-sam | Dashboard HTML, agent-dashboard JS/CSS, overview/time-tracking bundles, shell.css, auth-signin, worker source backup at `source/worker-source.js`. |
| **R2** (or **IAM_PLATFORM**) | iam-platform | Memory, docs, daily logs: e.g. `memory/schema-and-records.md`, `memory/daily/YYYY-MM-DD.md`, `knowledge/`, `agent-sessions/`. Not for worker or dashboard source. |
| **AUTORAG_BUCKET** | autorag | RAG source docs; Meshy GLB exports use `meshy/` prefix. |

Worker never uses **iam-platform** for serving worker/dashboard code; that bucket is for memory and platform data only.

---

## Scripts (quick reference)

| Script | Purpose |
|--------|--------|
| `./scripts/with-cloudflare-env.sh <cmd>` | Loads `.env.cloudflare` (or env) so `CLOUDFLARE_API_TOKEN` is set; **always** use for wrangler R2/deploy commands. |
| `./scripts/upload-repo-to-r2-sandbox.sh` | Syncs dashboard HTML + Vite outputs to R2 **agent-sam-sandbox-cicd** (CI/CD sandbox zone). |
| `PROMOTE_OK=1 ./scripts/promote-agent-dashboard-to-production.sh` | Builds agent-dashboard; uploads `agent.html` + bundle to **agent-sam** (production R2 only; no Worker deploy). |
| `npm run deploy` | Runs `./scripts/deploy-with-record.sh`: sources env, deploys worker via wrangler, records deploy in D1. **Do not run without explicit "deploy approved".** |
| `./agent-dashboard/deploy-to-r2.sh` | Builds agent-dashboard (and optionally overview-dashboard, time-tracking-dashboard), uploads JS/CSS/HTML to R2 **agent-sam**. Does not deploy the worker. Run from repo root. |
| `./scripts/deploy-with-record.sh` | Called by `npm run deploy`. Uploads agent dist + selected dashboard HTML to R2 then runs wrangler deploy. |
| `./scripts/upload-daily-log-to-r2.sh YYYY-MM-DD` | Uploads `docs/memory/daily/YYYY-MM-DD.md` to **iam-platform** `memory/daily/`. |
| `./scripts/upload-today-todo-to-r2.sh` | Uploads today-todo to R2 for AutoRAG. |
| `./scripts/overnight.js` | Overnight pipeline: before/after screenshots for every dashboard page, then optional email report. Uses `EVERY_PAGE` list; requires RESEND_API_KEY and Cloudflare token in env. |
| `./scripts/post-deploy-record.sh` | Writes deploy record to D1 (e.g. cloudflare_deployments). |

---

## Prerequisites

- Node 18+
- Wrangler CLI (via `npm install` in repo root)
- Cloudflare: `CLOUDFLARE_API_TOKEN` (and optionally `CLOUDFLARE_ACCOUNT_ID`) in `.env.cloudflare` or `~/.zshrc`

---

## Setup

```bash
git clone https://github.com/SamPrimeaux/inneranimalmedia-agentsam-dashboard.git
cd inneranimalmedia-agentsam-dashboard
npm install
```

- Copy `.env.cloudflare.example` to `.env.cloudflare` and set the token.
- For local worker dev: `./scripts/with-cloudflare-env.sh npx wrangler dev -c wrangler.production.toml`.

---

## Build (dashboard apps)

- **Agent dashboard:** `cd agent-dashboard && npm install && npm run build`. Output: `agent-dashboard/dist/agent-dashboard.js`, `agent-dashboard.css`. Bump `?v=NN` in `dashboard/agent.html` when you want cache bust.
- **Overview/Finance:** `cd overview-dashboard && npm run build`. Output used by overview and finance pages.
- **Time-tracking:** `cd time-tracking-dashboard && npm run build`. Upload to R2 `static/dashboard/time-tracking/`.

After building, upload changed assets and any changed dashboard HTML to R2 (see Deploy rules). Use `./agent-dashboard/deploy-to-r2.sh` to build and upload agent + selected dashboard files in one go.

---

## Deploy rules (critical)

- **Do not run `npm run deploy` or any deploy script unless the user has explicitly said "deploy approved".**
- **Worker:** Repo root `worker.js` is the deployed source. R2 `agent-sam/source/worker-source.js` is a backup only; deploy uses the repo file.
- **Dashboard:** Any change under `dashboard/` must be uploaded to R2 **before** deploying the worker, or the live site will serve stale pages.
  - Single HTML: `./scripts/with-cloudflare-env.sh npx wrangler r2 object put agent-sam/static/dashboard/<file>.html --file=dashboard/<file>.html --content-type=text/html --remote -c wrangler.production.toml`
  - Agent bundle: upload `agent-dashboard/dist/agent-dashboard.js` and `agent-dashboard/dist/agent-dashboard.css` to `agent-sam/static/dashboard/agent/`, and `dashboard/agent.html` to `agent-sam/static/dashboard/agent.html`.
- **Public pages:** Upload to **inneranimalmedia-assets** (not agent-sam). No worker deploy needed for content-only changes.
- Always use `./scripts/with-cloudflare-env.sh` for wrangler R2/deploy commands.
- Use `npm run deploy` (never raw `wrangler deploy`).

---

## Where we left off / pickup context

- **Session log:** `docs/cursor-session-log.md` — Last entries describe what was changed, deploy status, and known issues. Read the top few entries to see latest deploy state and next steps.
- **Tomorrow handoff:** `docs/TOMORROW.md` — High-level "what we shipped," known issues, roadmap priorities, current version and worker ID. Update when you finish a session.
- **Today todo:** `docs/memory/today-todo.md` — Realtime priorities; also stored in D1 (`agent_memory_index` key `today_todo`) and R2. Agent can update via `PUT /api/agent/today-todo`. Re-index memory after changes so AutoRAG stays current.
- **D1 state:** Before coding, consider reading `agent_memory_index` (e.g. `active_priorities`, `build_progress`, `today_todo`) and `roadmap_steps` for plan `plan_iam_dashboard_v1` (see `.cursor/rules/session-start-d1-context.mdc`).
- **After finishing a roadmap step:** Update `roadmap_steps` and `agent_memory_index` so Agent Sam and the nightly digest stay accurate.

---

## Key docs

| Doc | Purpose |
|-----|--------|
| `docs/SYSTEM_CICD_ARCHITECTURE_README.md` | **Architecture:** production vs sandbox Workers, R2 buckets, MCP + PTY repos, Mermaid diagrams, D1 table clusters, CI/CD 2-step UI lane. |
| `docs/CURSOR_HANDOFF_D1_CICD_ORCHESTRATION.md` | **Agents:** which D1 tables to touch per action; webhooks; `workflow_locks`; copy-paste Cursor prompt. |
| `docs/CURSOR_HANDOFF_SANDBOX_UI_TO_PRODUCTION.md` | **Agents:** sandbox UI iteration and safe promotion to production R2. |
| `docs/LOCATIONS_AND_DEPLOY_AUDIT.md` | Worker/dashboard locations, R2 keys, deploy flow, quick commands. |
| `docs/cursor-session-log.md` | Per-session what was asked, files changed, deploy status, what is live, known issues. |
| `docs/TOMORROW.md` | Handoff: shipped today, P1 issues, roadmap, version, last deploy. |
| `docs/memory/AGENT_MEMORY_SCHEMA_AND_RECORDS.md` | D1 tables, metrics, backfill/correction workflow. |
| `docs/memory/today-todo.md` | Today's priorities (synced to D1 and R2). |
| `docs/MCP_CURSOR_TERMINAL_SYNC.md` | MCP endpoint, Cursor config, terminal health check. |
| `docs/API_METRICS_AND_AGENT_COST_TRACKING.md` | API metrics, agent cost tracking (agent_telemetry, spend_ledger, etc.). |
| `docs/AGENT_SAM_UNIVERSAL_SYNC_LAW.md` | **D1 namespaces audit** (`agent_*`, `mcp_*`, `agentsam_*`, `ai_*`, `cicd*`) + **Universal Sync Law** (one writer per concern, correlation IDs, tool contract, boot parity). |
| `.cursor/rules/` | Project rules: deploy, file protection, R2-before-deploy, D1 schema, MCP reference, session-start D1 context. |
| `.cursor/commands/` | Cursor **slash commands** (project): `/iam` (monorepo + deploy matrix), `/iampty` (iam-pty tunnel, tokens, lockdown), `/subagent` (delegation guardrails), `/skills` (which SKILL.md to open), `/rules` (rules index + tracking). |

---

## Protected files

Do not rewrite or edit without explicit, line-by-line approval:

- **worker.js** — Especially `handleGoogleOAuthCallback` and `handleGitHubOAuthCallback`. Breaking these locks all users out.
- **wrangler.production.toml** — Binding changes can break production.

---

## License

ISC (see `package.json`).

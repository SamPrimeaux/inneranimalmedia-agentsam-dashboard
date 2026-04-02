# Inner Animal Media — Agent Sam Dashboard

This repo is the single source of truth for the **Agent Sam** dashboard, the Cloudflare Worker that serves it, public marketing pages, the MCP server, and the terminal server. Use this README to orient and pick up exactly where you left off (see **Where we left off** and **Key docs**).

**Full system map (2-zone Cloudflare CIDI, sibling repos, D1 clusters, Mermaid + ASCII):**  
[`docs/SYSTEM_CIDI_ARCHITECTURE_README.md`](docs/SYSTEM_CIDI_ARCHITECTURE_README.md)

---

## What's in the repo

| Path | Purpose |
|------|--------|
| `worker.js` | Production Cloudflare Worker. Auth (Google/GitHub OAuth), API, streaming chat, R2/D1/KV, dashboard and public routing. **This file is what gets deployed.** Do not rewrite; OAuth handlers are locked. |
| `dashboard/` | Dashboard HTML shells. Each page is served from R2 bucket **agent-sam** at `static/dashboard/<name>.html`. Full list below. |
| `agent-dashboard/` | Vite + React app for the Agent chat UI (Monaco, tools, model picker, attachments). Build output: `agent-dashboard/dist/` (JS/CSS). Loaded by `dashboard/agent.html` with cache-bust query `?v=NN`. |
| `overview-dashboard/` | Vite + React overview/finance widgets. Build output used by overview and finance pages. |
| `time-tracking-dashboard/` | Vite + React time-tracking UI. Build output uploaded to R2 `static/dashboard/time-tracking/`. |
| `public-homepage/` | Homepage source. **R2 bucket:** `inneranimalmedia-assets`, **key:** `index-v3.html`. Served at `/` and `/index.html`. See `public-homepage/README.md` for upload commands. |
| `public-pages/` | Marketing pages: `about.html`, `contact.html`, `pricing.html`, `process.html`. Served from **inneranimalmedia-assets** via worker `PUBLIC_ROUTES`. URLs: `/about`, `/contact`, `/services` (pricing), `/work` (process). Upload to R2 **inneranimalmedia-assets** with same filenames; no worker deploy needed for content-only changes. |
| `inneranimalmedia-mcp-server/` | InnerAnimalMedia MCP server source. Worker name **inneranimalmedia-mcp-server** (see `wrangler.toml`). Endpoint: `https://mcp.inneranimalmedia.com/mcp`. Protocol 2024-11-05. Cursor config: `.cursor/mcp.json` (server key `inneranimalmedia`). See **MCP and terminal** below. |
| `server/` | Terminal server (Node + node-pty, WebSocket). Used for in-browser terminal and Agent tool execution. Run locally with `./server/run-terminal-server.sh`; production may use a tunnel (see `server/tunnel.yml.example`). Not part of the main worker deploy. |
| `scripts/` | Deploy, R2 uploads, env loading, overnight pipeline. Key scripts below. |
| `migrations/` | D1 SQL migrations. Apply via wrangler when schema changes. |
| `docs/` | Session logs, audits, plans, memory. **Start here to pick up:** `docs/cursor-session-log.md`, `docs/TOMORROW.md`, `docs/memory/today-todo.md`. |
| `wrangler.production.toml` | Production Wrangler config (bindings, routes). **Do not change bindings without explicit approval.** |

---

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
| `./scripts/upload-repo-to-r2-sandbox.sh` | Syncs dashboard HTML + Vite outputs to R2 **agent-sam-sandbox-cidi** (CIDI sandbox zone). |
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
| `docs/SYSTEM_CIDI_ARCHITECTURE_README.md` | **Architecture:** production vs sandbox Workers, R2 buckets, MCP + PTY repos, Mermaid diagrams, D1 table clusters, CIDI 2-step UI lane. |
| `docs/CURSOR_HANDOFF_D1_CIDI_ORCHESTRATION.md` | **Agents:** which D1 tables to touch per action; webhooks; `workflow_locks`; copy-paste Cursor prompt. |
| `docs/CURSOR_HANDOFF_SANDBOX_UI_TO_PRODUCTION.md` | **Agents:** sandbox UI iteration and safe promotion to production R2. |
| `docs/LOCATIONS_AND_DEPLOY_AUDIT.md` | Worker/dashboard locations, R2 keys, deploy flow, quick commands. |
| `docs/cursor-session-log.md` | Per-session what was asked, files changed, deploy status, what is live, known issues. |
| `docs/TOMORROW.md` | Handoff: shipped today, P1 issues, roadmap, version, last deploy. |
| `docs/memory/AGENT_MEMORY_SCHEMA_AND_RECORDS.md` | D1 tables, metrics, backfill/correction workflow. |
| `docs/memory/today-todo.md` | Today's priorities (synced to D1 and R2). |
| `docs/MCP_CURSOR_TERMINAL_SYNC.md` | MCP endpoint, Cursor config, terminal health check. |
| `docs/API_METRICS_AND_AGENT_COST_TRACKING.md` | API metrics, agent cost tracking (agent_telemetry, spend_ledger, etc.). |
| `docs/AGENT_SAM_UNIVERSAL_SYNC_LAW.md` | **D1 namespaces audit** (`agent_*`, `mcp_*`, `agentsam_*`, `ai_*`, `cidi*`) + **Universal Sync Law** (one writer per concern, correlation IDs, tool contract, boot parity). |
| `.cursor/rules/` | Project rules: deploy, file protection, R2-before-deploy, D1 schema, MCP reference, session-start D1 context. |
| `.cursor/commands/` | Cursor **slash commands** (project): `/iam` (monorepo + deploy matrix), `/iampty` (iam-pty tunnel, tokens, lockdown), `/subagent` (delegation guardrails), `/skills` (which SKILL.md to open), `/rules` (rules index + tracking). |

---

## Protected files

Do not rewrite or edit without explicit, line-by-line approval:

- **worker.js** — Especially `handleGoogleOAuthCallback` and `handleGitHubOAuthCallback`. Breaking these locks all users out.
- **dashboard/agent.html** — One tag at a time.
- **agent-dashboard/src/FloatingPreviewPanel.jsx** — Surgical edits only; never full rewrite.
- **wrangler.production.toml** — Binding changes can break production.

---

## License

ISC (see `package.json`).

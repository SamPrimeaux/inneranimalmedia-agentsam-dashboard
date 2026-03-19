# Inner Animal Media — Agent Sam Dashboard

This repo is the source for the **Agent Sam** dashboard and the Cloudflare Worker that serves it. It includes the worker, dashboard HTML, the React-based agent chat UI, scripts, migrations, and docs.

## What’s in the repo

| Path | Purpose |
|------|--------|
| `worker.js` | Production Cloudflare Worker (auth, API, streaming, R2/D1). This file is what gets deployed. |
| `dashboard/` | Dashboard HTML pages (e.g. `agent.html`, `overview.html`, `finance.html`). Served from R2 at `agent-sam/static/dashboard/`. |
| `agent-dashboard/` | Vite + React app for the Agent chat UI. Build output: `agent-dashboard/dist/` (JS/CSS). Loaded by `dashboard/agent.html`. |
| `scripts/` | Deploy, R2 upload, env loading: `with-cloudflare-env.sh`, `deploy-with-record.sh`, etc. |
| `migrations/` | D1 SQL migrations. |
| `docs/` | Session logs, audits, plans, memory. |
| `mcp-server/` | MCP server source (separate deploy). |
| `wrangler.production.toml` | Production Wrangler config (bindings, routes). Do not change bindings without explicit approval. |

## Prerequisites

- Node 18+
- Wrangler CLI (via `npm install` in repo root)
- Cloudflare credentials: `CLOUDFLARE_API_TOKEN` (and optionally `CLOUDFLARE_ACCOUNT_ID`) in `.env.cloudflare` or `~/.zshrc`

## Setup

```bash
git clone https://github.com/SamPrimeaux/inneranimalmedia-agentsam-dashboard.git
cd inneranimalmedia-agentsam-dashboard
npm install
```

- Copy `.env.cloudflare.example` to `.env.cloudflare` and set the token.
- For local worker dev: `npx wrangler dev -c wrangler.production.toml` (after loading env).

## Build (agent dashboard)

The Agent page uses a built bundle. After editing `agent-dashboard/src/`:

```bash
cd agent-dashboard
npm install
npm run build
```

Then upload the built assets and the HTML to R2 (see Deploy rules below).

## Deploy rules (important)

- **Do not run `npm run deploy` or any deploy script unless explicitly approved.**
- **Worker:** Repo root `worker.js` is the deployed source. R2 `agent-sam/source/worker-source.js` is a backup only.
- **Dashboard:** Any change under `dashboard/` must be uploaded to R2 **before** deploying the worker:
  - Upload HTML: `./scripts/with-cloudflare-env.sh npx wrangler r2 object put agent-sam/static/dashboard/<file>.html --file=dashboard/<file>.html --content-type=text/html --remote -c wrangler.production.toml`
  - Agent bundle: upload `agent-dashboard/dist/agent-dashboard.js` and `agent-dashboard/dist/agent-dashboard.css` to `agent-sam/static/dashboard/agent/`, and `dashboard/agent.html` to `agent-sam/static/dashboard/agent.html`.
- Always use `./scripts/with-cloudflare-env.sh` for any wrangler R2/deploy command so the API token is loaded.
- Use `npm run deploy` (never raw `wrangler deploy`).

## Key docs

- `docs/LOCATIONS_AND_DEPLOY_AUDIT.md` — Where worker/dashboard live, R2 keys, deploy flow.
- `docs/cursor-session-log.md` — Session log of changes and deploy status.
- `docs/memory/AGENT_MEMORY_SCHEMA_AND_RECORDS.md` — D1 tables and metrics.
- `.cursor/rules/` — Project rules (deploy, file protection, R2 before deploy).

## Protected files

These are not to be rewritten or edited without explicit, line-by-line approval:

- `worker.js` — especially OAuth callbacks and auth.
- `dashboard/agent.html` — one tag at a time.
- `agent-dashboard/src/FloatingPreviewPanel.jsx` — surgical edits only.
- `wrangler.production.toml` — binding changes can break production.

## License

ISC (see `package.json`).

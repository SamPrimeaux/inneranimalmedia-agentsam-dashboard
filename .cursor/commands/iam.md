---
description: Inner Animal Media monorepo context, workers, R2, deploy gates, and locks
argument-hint: [optional topic — e.g. sandbox, mcp, d1, r2]
---

# IAM — Inner Animal Media (this repo)

User context: **$ARGUMENTS**

You are in **march1st-inneranimalmedia** (Agent Sam dashboard monorepo). Single root **`worker.js`** is the entry for multiple deploy targets; behavior differs by **Wrangler config and bindings**, not by duplicate source trees.

## Workers (three names — do not conflate)

| Worker | Config (repo root or subfolder) | Purpose |
|--------|----------------------------------|---------|
| **inneranimalmedia** | `wrangler.production.toml` | Production site, OAuth, dashboard, APIs |
| **inneranimal-dashboard** | `wrangler.jsonc` | Sandbox / CIDI: `*.meauxbility.workers.dev`; R2 **agent-sam-sandbox-cidi** for ASSETS+DASHBOARD |
| **inneranimalmedia-mcp-server** | `inneranimalmedia-mcp-server/wrangler.toml` | Remote MCP only — **always** `cd inneranimalmedia-mcp-server && npx wrangler deploy -c wrangler.toml` |

Never run bare `wrangler deploy` at repo root without `-c` (picks wrong worker). Never run bare `wrangler deploy` inside MCP folder without `-c wrangler.toml`.

## Deploy and secrets (hard gates)

- **Production worker + R2:** No `npm run deploy`, no `wrangler deploy -c wrangler.production.toml`, no production R2 puts unless Sam types **deploy approved** (and follow `.cursorrules` / `sam-rules.mdc`).
- **Sandbox worker:** Deploy with `./scripts/with-cloudflare-env.sh npx wrangler deploy -c wrangler.jsonc` only when Sam asks for sandbox deploy (still list changed files first).
- **MCP:** Only from `inneranimalmedia-mcp-server/` with explicit approval if rules require it.
- **Secrets:** No `wrangler secret put` without explicit Sam approval. Sandbox email/password login needs `SANDBOX_DASHBOARD_PASSWORD` (or PBKDF2 vars) on **inneranimal-dashboard** — not in repo.
- **Never** store Cloudflare account API tokens in Worker plaintext vars; use gitignored `.env.cloudflare` for CLI.

## Locked code (do not rewrite)

- **`worker.js`:** `handleGoogleOAuthCallback`, `handleGitHubOAuthCallback` — paste full handler and wait for approval before any edit.
- **`dashboard/agent.html`:** one tag at a time with approval.
- **`agent-dashboard/src/FloatingPreviewPanel.jsx`:** surgical edits only; state line numbers first.
- **`wrangler.production.toml`:** no binding edits without Sam confirmation.

## R2 quick map (production)

- **agent-sam:** dashboard HTML, `static/dashboard/*`, agent bundle, `static/auth-signin.html`, worker backup `source/worker-source.js`
- **inneranimalmedia-assets:** marketing homepage + public pages (often served at `/` in prod when objects exist)
- **iam-platform:** memory, daily logs, knowledge — not for shipping worker/dashboard source

Sandbox uses **agent-sam-sandbox-cidi** for ASSETS+DASHBOARD per `wrangler.jsonc`.

## After dashboard HTML changes (production path)

Upload changed `dashboard/*.html` to R2 **before** worker deploy when that page is served from R2. See `README.md` and `.cursor/rules/dashboard-r2-before-deploy.mdc`.

## Pickup and deployment tracking

1. Read recent **`docs/cursor-session-log.md`** and **`docs/TOMORROW.md`**.
2. Before coding from cold start: consider D1 keys in **`.cursor/rules/session-start-d1-context.mdc`** (`active_priorities`, `build_progress`, `today_todo`, `roadmap_steps`).
3. After a session that changed behavior or deploy: append **`docs/cursor-session-log.md`** with files, deploy status, what is live. If a production deploy ran, align with **`cloudflare_deployments`** / `post-deploy-record` patterns in repo docs.

## Canonical docs

- `README.md` — repo map, scripts, MCP health check pattern
- `docs/AGENT_SAM_UNIVERSAL_SYNC_LAW.md` — D1 table namespaces + Universal Sync Law (agent/mcp/agentsam/ai/cidi)
- `docs/LOCATIONS_AND_DEPLOY_AUDIT.md` — keys and commands
- `docs/SYSTEM_CIDI_ARCHITECTURE_README.md` — two-zone / CIDI overview
- `.cursorrules` — deploy matrix and scope enforcement

Use **CSS variables** for colors in UI code; **no emojis** in code or UI per project rules.

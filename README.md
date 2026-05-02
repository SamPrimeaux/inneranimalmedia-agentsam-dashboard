# InnerAnimal Media — Agent Sam Platform

AI-powered development workspace. Cloudflare-native. Multi-tenant.

Built by Sam Primeaux — sole developer and operator.

## Platform summary

Agent Sam is an AI agent dashboard served by Cloudflare Workers. It includes a browser-based IDE, terminal bridge, MCP tool registry, and AI chat for operators and clients. The learning area (InnerAutodidact) uses the same worker and database.

## Live URLs

| Area | URL |
|------|-----|
| Overview | https://inneranimalmedia.com/dashboard/overview |
| Agent | https://inneranimalmedia.com/dashboard/agent |
| Learn | https://inneranimalmedia.com/dashboard/learn |
| Design Studio | https://inneranimalmedia.com/dashboard/designstudio |
| Storage | https://inneranimalmedia.com/dashboard/storage |
| Integrations | https://inneranimalmedia.com/dashboard/integrations |
| MCP | https://inneranimalmedia.com/dashboard/mcp |
| Database | https://inneranimalmedia.com/dashboard/database |
| Meet | https://inneranimalmedia.com/dashboard/meet |
| Images | https://inneranimalmedia.com/dashboard/images |
| Mail | https://inneranimalmedia.com/dashboard/mail |
| Settings | https://inneranimalmedia.com/dashboard/settings |

| Service | URL |
|---------|-----|
| Dashboard (canonical entry) | https://inneranimalmedia.com/dashboard/agent |
| API | https://inneranimalmedia.com/api/* |
| MCP Server | https://mcp.inneranimalmedia.com/mcp |
| Terminal bridge | https://terminal.inneranimalmedia.com |
| Ollama | https://ollama.inneranimalmedia.com |

## Architecture

| Layer | Technology | Details |
|-------|------------|---------|
| Edge | Cloudflare Workers | Main bundle is `worker.js` (see modularization); entry `src/index.js` with wrangler |
| Database | D1 (SQLite) | `inneranimalmedia-business` (`cf87b717-d4e2-4cf8-bab0-a81268e32d49`) |
| Storage | R2 | Production dashboard assets use bucket `inneranimalmedia` (bindings `DASHBOARD` / `ASSETS` in `wrangler.production.toml`) |
| Analytics / auth helpers | Supabase | Project `dpmuvynqixblxsilnlut` (public schema and OAuth endpoints used by the worker) |
| Tunnel | cloudflared | Hostname `terminal.inneranimalmedia.com` forwards to the PTY service |
| Terminal | iam-pty | PTY bridge (see operator docs for restart procedures) |

## Deploy

### Production (manual promote)

```bash
./scripts/promote-to-prod.sh
```

Pulls dashboard assets from the default source bucket `agent-sam-sandbox-cicd`, pushes to production bucket `inneranimalmedia`, deploys the `inneranimalmedia` worker using `wrangler.production.toml`, runs a health `curl` against the dashboard URL, logs CI/CD rows in D1, and sends a Resend notification when the script finishes successfully.

Worker-only (no R2 asset promotion):

```bash
./scripts/promote-to-prod.sh --worker-only
```

### Production (Cloudflare Workers Builds)

The Cloudflare dashboard build pipeline runs `scripts/deploy-cf-builds.sh` (worker deploy via `wrangler.jsonc`, Vite build, upload to sandbox R2). Exact branch and trigger settings are configured in Cloudflare, not in this file.

### Config

- Production worker: `wrangler.production.toml`
- Sandbox / CI worker: `wrangler.jsonc`
- Local wrangler credentials: `.env.cloudflare` (not committed; see `.env.cloudflare.example` if present)

## Modularization

Legacy routing and handlers still live in `worker.js`. New work should go under `src/api/<area>/` or `src/core/` and be wired with a small import and route delegation in the worker entry path.

Examples present in this repo include `src/api/designstudio/`, `src/api/cad.js`, and `src/api/provisioning.js`.

## Key D1 tables (representative)

| Table | Purpose |
|-------|---------|
| `agentsam_tool_call_log` | MCP tool execution log |
| `agentsam_tool_stats_compacted` | Hourly rollup of tool stats |
| `agentsam_webhook_events` | Webhook ingestion |
| `cicd_runs` | CI/CD pipeline runs |
| `billing_plans` | Subscription tiers |
| `agentsam_workspace` | Per-tenant workspaces |
| `agentsam_memory` | Tenant-scoped agent memory rows |
| `terminal_sessions` | Terminal session records |
| `execution_performance_metrics` | Command performance rollups (when source rows exist) |

## InnerAutodidact

Learning routes live under `/dashboard/learn`. Access and pricing are enforced by billing plans and plan evaluation in the worker (see provisioning / billing tables), not duplicated here.

## Clients

PawLove Rescue, Pelican Peptides, New Iberia Church of Christ, Leadership Legacy Digital (Connor McNeely), Swamp Blood Gator Guides, Meauxbility Foundation (501(c)(3) nonprofit).

## Scripts and runbooks

| Location | Contents |
|----------|----------|
| `scripts/` | Deploy, benchmark, and Cloudflare helper scripts |
| `docs/runbooks/` | Step-by-step operational procedures |

Common helpers:

- `scripts/promote-to-prod.sh` — production promote
- `scripts/deploy-cf-builds.sh` — Workers Builds deploy script
- `scripts/benchmark-full.sh` — benchmark suite
- `scripts/with-cloudflare-env.sh` — load credentials for Wrangler CLI
- `scripts/sync-scripts-to-r2.sh` — upload shell scripts to R2 under `inneranimalmedia/scripts/`
- `scripts/sync-docs-to-r2.sh` — upload `docs/` tree to R2 under `inneranimalmedia/docs/`

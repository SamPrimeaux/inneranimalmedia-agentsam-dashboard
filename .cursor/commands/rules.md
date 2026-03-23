---
description: Map of IAM Cursor rules, approval gates, and deployment tracking expectations
argument-hint: [optional — deploy, d1, mcp, terminal]
---

# Rules map — Inner Animal Media repo

Filter: **$ARGUMENTS**

## Layer 0: Repo root `.cursorrules`

- OAuth callback handlers are **locked**; KV flow flags (`connectDrive`, `connectGitHub`) vs login — see `.cursorrules`.
- **Deploy:** production main worker via **`wrangler.production.toml`** + `./scripts/with-cloudflare-env.sh`; MCP only from **`inneranimalmedia-mcp-server/`** with `-c wrangler.toml`.
- **Forbidden without Sam:** new Workers/D1/R2, `wrangler secret put`, deploying unnamed workers.
- **Scope:** one file per change unless Sam expands; no drive-by refactors; no build/R2 unless prompted.

## Layer 1: `.cursor/rules/*.mdc` (always read conflicting rules together)

| File | Role |
|------|------|
| `sam-rules.mdc` | **deploy approved** gate; protected files; **mandatory** `docs/cursor-session-log.md` after tasks; line-level approval workflow |
| `hard-rules.mdc` | No rewrite FloatingPreviewPanel / agent.html / OAuth; surgical edits; CSS vars; no emojis |
| `approval-before-deploy.mdc` | Reinforces deploy approval |
| `dashboard-r2-before-deploy.mdc` | Changed `dashboard/*` served from R2 → upload before worker deploy |
| `deploy-source-architecture-locked.mdc` | R2 backup vs repo `worker.js`; `npm run deploy` not raw wrangler (per project script) |
| `d1-schema-and-records.mdc` | Propose SQL; wait for approval before `wrangler d1 execute` |
| `session-start-d1-context.mdc` | D1 keys to read at session start |
| `mcp-reference.mdc` | Fixed MCP URL, headers, health `curl` |
| `terminal-pty-lockdown.mdc` | Do not touch cloudflared / iam-pty / PM2 without explicit ops approval |
| `before-after-screenshots.mdc` | Overnight / build screenshot workflow |
| `agent_cursor_rules.mdc` | D1 verification habits; optional post-deploy git sync (if Sam uses that flow) |

## Deployment tracking (expected behavior)

1. Before deploy: list **every file changed** and **every R2 object** to upload; stop if the list exceeds Sam’s stated scope.
2. After work: append **`docs/cursor-session-log.md`** (format in `sam-rules.mdc`).
3. Production deploy scripts may record **`cloudflare_deployments`** — use env vars documented in `docs/d1-schema-and-records.mdc` / deploy scripts when Sam approves.

## Terminal / PTY

- **`.cursor/rules/terminal-pty-lockdown.mdc`** — full lock list. Quick orientation: project command **`/iampty`** (see `.cursor/commands/iampty.md`).

## If rules conflict

**Safety wins:** OAuth locks, **deploy approved**, and “do not touch production worker” instructions from Sam in chat override speed. When unsure, **stop and ask Sam**.

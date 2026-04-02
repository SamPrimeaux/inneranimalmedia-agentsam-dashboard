---
description: iam-pty production terminal, tunnel URL, env tokens, and permanent do-not-touch list
argument-hint: [optional — e.g. keys, local, lockdown]
---

# iam-pty — browser terminal stack

Context: **$ARGUMENTS**

## Canonical production setup

- **Sibling repo:** [github.com/SamPrimeaux/iam-pty](https://github.com/SamPrimeaux/iam-pty) — runs the PTY process (often via PM2 on Sam’s Mac) behind **Cloudflare Tunnel**.
- **Public entry:** **`terminal.inneranimalmedia.com`** — Worker and dashboard use this host for terminal WebSocket / exec (not the in-repo `server/` process in production).
- **This monorepo `server/`:** Local/dev terminal server (`./server/run-terminal-server.sh`). For **production** behavior and secrets, treat **iam-pty + tunnel** as source of truth; see `README.md` and `server/tunnel.yml.example`.

## Env tokens (must stay in sync)

Full checklist: **`docs/TERMINAL_KEYS_RESET.md`**.

Summary:

| Place | Variable | Role |
|-------|----------|------|
| Mac **`~/iam-pty`** (PM2 / `ecosystem.config.cjs`) | `PTY_AUTH_TOKEN` | Validates WebSocket `?token=` and `/exec` `Authorization: Bearer` |
| Worker **inneranimalmedia** | `TERMINAL_SECRET` | Worker passes secret when proxying terminal WebSocket |
| Worker **inneranimalmedia** | `PTY_AUTH_TOKEN` | Bearer for `POST /api/terminal/session/register` — set to **same value** as PTY token to avoid split-brain |
| Worker **inneranimalmedia** | `TERMINAL_WS_URL` | Base URL, typically `https://terminal.inneranimalmedia.com` (https, no path) |
| Worker **inneranimalmedia-mcp-server** | `PTY_AUTH_TOKEN` | MCP `terminal_execute` → `https://terminal.inneranimalmedia.com/exec` |

Do **not** paste live tokens into chat or commit them. Rotate with `openssl rand -hex 32` per the doc, then PM2 restart **`iam-pty`**.

## Permanent do-not-touch (without explicit Sam approval)

From **`.cursor/rules/terminal-pty-lockdown.mdc`:**

- **`~/.cloudflared/config.yml`** — never add `protocol: http2` (breaks tunnel behavior per ops history).
- **`~/iam-pty/ecosystem.config.cjs`** — no edits without Sam.
- **`~/Library/LaunchAgents/`** — no new plists for iam-pty/terminal without Sam.
- **`~/Downloads/march1st-inneranimalmedia/server/terminal.js`** — remove if present; conflicts with iam-pty.
- **`~/.local/iam-terminal-server/`** — remove if present; conflicts with iam-pty.
- **`wrangler.production.toml`** / OAuth handlers in **`worker.js`** — already globally locked for other reasons; do not “fix” terminal by editing OAuth.

## Safe operations an agent may suggest (Sam runs them)

- `pm2 restart iam-pty` or recreate from `~/iam-pty/ecosystem.config.cjs` after env changes.
- Local smoke: `wscat -c "ws://127.0.0.1:3099/?token=..."` as in `docs/TERMINAL_KEYS_RESET.md`.
- Read-only: confirm Worker vars `TERMINAL_WS_URL`, `TERMINAL_SECRET`, `PTY_AUTH_TOKEN` are set in dashboard (do not print values).

## If terminal is “not configured” in the dashboard

1. Confirm **tunnel** reaches iam-pty and **`TERMINAL_WS_URL`** on the Worker matches the public host.
2. Confirm **same** shared secret on PTY and Worker (`TERMINAL_KEYS_RESET.md`).
3. Do not rewrite Worker terminal routes or tunnel config in one shot — narrow change + Sam approval.

# Cursor handoff: sandbox UI (CIDI) to production

Use this when syncing the **InnerAnimalMedia / Agent Sam** dashboard between the Git-connected sandbox worker and production.

Copy everything below into a new Cursor chat when working on **inneranimal-dashboard** (Workers) + **agent-sam-sandbox-cidi** (R2), then promoting UI to **inneranimalmedia** + **agent-sam**.

---

## Context you must preserve

1. **Production Worker** (`inneranimalmedia`, `inneranimalmedia.com`) is the real product. **Never** change `handleGoogleOAuthCallback` or `handleGitHubOAuthCallback` in `worker.js` without explicit line-by-line owner approval. **Never** deploy production without Sam typing exactly: **`deploy approved`**.

2. **Sandbox Worker** (`inneranimal-dashboard`, `*.workers.dev`) is for **cosmetic / UI** iteration. It should use **sandbox R2** (`agent-sam-sandbox-cidi`) for **`ASSETS` + `DASHBOARD`** (both bindings on the same clone bucket) so production bucket **agent-sam** is not overwritten by experiments. Repo config: **`wrangler.jsonc`**.

3. **Production D1** (`inneranimalmedia-business`) is shared if the sandbox Worker binds it. Treat that as **production data**: prefer read-only or no-DB flows for pure UI; do not run destructive migrations or bulk deletes from sandbox unless Sam explicitly approves.

4. **R2 key layout** matches production so the same HTML paths work:
   - `/dashboard/<page>` → `static/dashboard/<page>.html`
   - Agent app: `static/dashboard/agent.html` + `static/dashboard/agent/agent-dashboard.js` (+ `.css`)
   - Overview app: `static/dashboard/overview.html` + **`static/dashboard/overview/overview-dashboard.js`** and any **Vite chunk** files in that folder (e.g. `overview-dashboard-PieChart.js`, `Finance.js`)
   - Auth: `static/auth-signin.html` from `dashboard/auth-signin.html`

5. **Repo:** dashboard shells under `dashboard/*.html`; Vite apps under `agent-dashboard/`, `overview-dashboard/`, etc.

6. **Agent first-load theme (2026-03-22):** `dashboard/agent.html` should load global tokens like **`overview.html`** does: **`styles_themes.css`** (pub R2 URL) + **`/static/dashboard/shell.css`** in `<head>`, and **`fetch('/api/settings/theme')` on every load** (not only when `localStorage` already has `dashboard-theme`). Without that, cold `/dashboard/agent` can render with **missing `--bg-canvas`** until you visit another dashboard page and return.

7. **Promotion scripts:**
   - **Sandbox (full mirror + builds):** `./scripts/upload-repo-to-r2-sandbox.sh` — supports `SANDBOX_BUCKET` or `SANDBOX_R2_BUCKET`, optional `R2_CONFIG` (default `wrangler.production.toml`).
   - **Production agent bundle (R2 only):** `PROMOTE_OK=1 ./scripts/promote-agent-dashboard-to-production.sh` when present — builds `agent-dashboard`, uploads to **agent-sam**. Still requires **`deploy approved`** if `worker.js` changed.

8. **Roadmap (D1):** `roadmap_steps` rows **`step_agent_theme_initial_paint`** and **`step_sandbox_agent_promote_workflow`** on `plan_iam_dashboard_v1` (`order_index` 28–29). Re-run SQL: `scripts/d1-roadmap-sandbox-agent-workflow-20260322.sql` when applicable.

9. **Future Agent `/workflow` (multistep CIDI):** Implement as a **recipe**, **`agent_commands`** slash entry, or **plan** that runs: (1) build, (2) sandbox upload, (3) human “ready for prod”, (4) `PROMOTE_OK=1` promote script, (5) optional Worker deploy after `deploy approved`. Do not auto-deploy production from an agent tool without that gate.

---

## Why Overview looked empty on sandbox / why `/` can be wrong

`dashboard/overview.html` loads the Vite app from **`/static/dashboard/overview/overview-dashboard.js`** plus Rollup chunks. Those files live under R2 **`static/dashboard/overview/`**.

If only shell HTML and the Agent bundle were uploaded, **nav + shell render** but the **Overview React root never mounts** (404 on module graph). After uploading the full **`overview-dashboard/dist/`** tree to that prefix, hard-refresh **`/dashboard/overview`**. Charts still depend on **`/api/*`**.

**Do not** add Wrangler **`assets.directory`** (or dashboard **Static Assets** serving `overview-dashboard/`) on the sandbox worker: it can steal the **`ASSETS`** binding or serve a Vite **`index.html`** at **`/`** instead of the Worker redirect to **`/auth/signin`**. See `docs/CIDI_WORKER_inneranimal-dashboard_RUNBOOK.md`.

---

## Locked behavior (do not break)

- **Production OAuth** routes in `worker.js` — do not edit without owner approval.
- **`wrangler.production.toml`** bindings — treat as locked unless Sam approves.
- **Sandbox-only** DB-driven login must stay gated by hostname (`isInneranimalDashboardSandboxHost`); do not weaken production `auth_users` / OAuth flows.

---

## Buckets and workers

| Environment | Worker name              | Dashboard R2 bucket            |
|-------------|--------------------------|---------------------------------|
| CIDI sandbox| `inneranimal-dashboard`  | **`agent-sam-sandbox-cidi`**   |
| Production  | `inneranimalmedia`       | **`agent-sam`**                |

Production: **`wrangler.production.toml`** + `./scripts/with-cloudflare-env.sh`.

---

## Builds and sandbox upload

1. **Overview:** `cd overview-dashboard && npm install && npm run build`
2. **Agent:** `cd agent-dashboard && npm install && npm run build`
3. Push to sandbox:

```bash
./scripts/upload-repo-to-r2-sandbox.sh
```

Env: **`SANDBOX_BUCKET`** or **`SANDBOX_R2_BUCKET`** (default `agent-sam-sandbox-cidi`), **`R2_CONFIG`** (default `wrangler.production.toml`). Requires `.env.cloudflare` with `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.

The script uploads: manifest under `_sandbox/`, optional **`agent-sam/static`** tree, **`static/dashboard/`**, all **`dashboard/*.html`** (+ `pages/`, `*.jsx`), **`static/auth-signin.html`**, **`overview-dashboard/dist/*`**, agent **`agent-dashboard.js` / `.css`**, and a **`worker.js`** snapshot under `source/`.

**R2-only updates** usually **do not** require redeploying the sandbox Worker.

---

## OAuth and custom login on sandbox

If the sandbox uses **DB-driven email/password** to avoid touching production Google/GitHub OAuth, keep that logic **only** on the sandbox Worker (hostname-gated). **Do not** merge sandbox-only shortcuts into production OAuth handlers without review.

---

## Bulk sync (optional)

To mirror **entire** production bucket **`agent-sam`** into sandbox, use **`scripts/r2-clone-agent-sam-to-sandbox.sh`** with R2 **S3 API** keys (`R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`).

---

## Promoting to production

1. List **every** file you will upload to **`agent-sam`**.
2. Use **`./scripts/with-cloudflare-env.sh`** and **`-c wrangler.production.toml`** per **`.cursorrules`**.
3. Production worker deploy only after Sam types **`deploy approved`**.
4. Upload dashboard HTML to R2 **before** or with the worker deploy so the live site is not stale.

---

## Pre-production checklist

- [ ] Tested on sandbox URL (hard refresh).
- [ ] Overview main area loads (no missing `/static/dashboard/overview/*.js` in Network tab).
- [ ] Agent page loads bundle and critical flows.
- [ ] No unintended OAuth or `wrangler.production.toml` binding edits.
- [ ] Every file to upload to **agent-sam** listed + **`deploy approved`** for Worker if needed.

---

## Files to know

| Purpose | Path |
|--------|------|
| Sandbox upload | `scripts/upload-repo-to-r2-sandbox.sh` |
| Prod → sandbox full bucket clone | `scripts/r2-clone-agent-sam-to-sandbox.sh` |
| Worker routing | `worker.js` |
| Sandbox wrangler | `wrangler.jsonc` |
| Overview shell / React | `dashboard/overview.html`, `overview-dashboard/dist/` |
| Agent React | `agent-dashboard/dist/` |

---

## Copy-paste prompt (other Cursor session)

Read and follow `docs/CURSOR_HANDOFF_SANDBOX_UI_TO_PRODUCTION.md` in this repository.

Rules:

- Do not edit production OAuth handlers in `worker.js` without explicit owner approval.
- Do not deploy **inneranimalmedia** without Sam typing exactly: **deploy approved**.
- Sandbox uses R2 **agent-sam-sandbox-cidi**; production uses **agent-sam**.
- After changing dashboard HTML or Vite apps: run builds, then **`./scripts/upload-repo-to-r2-sandbox.sh`**. R2-only changes usually do not require redeploying the sandbox Worker.
- **overview.html** needs **`static/dashboard/overview/overview-dashboard.js`** and all Vite chunks on R2; **agent.html** needs **`static/dashboard/agent/agent-dashboard.js`** and **`.css`** on R2.
- When promoting to production, list every file uploaded to **agent-sam** and use **`wrangler.production.toml`** + **`with-cloudflare-env.sh`** per **`.cursorrules`**.

Task: [describe your current UI tweak or page]

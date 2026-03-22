# Cursor handoff: sandbox UI (CIDI) to production

Use this when syncing the **InnerAnimalMedia / Agent Sam** dashboard between the Git-connected sandbox worker and production.

## Why Overview looked empty on sandbox

`dashboard/overview.html` loads the Vite app from **`/static/dashboard/overview/overview-dashboard.js`** plus Rollup chunks (e.g. `overview-dashboard-PieChart.js`, `Finance.js`). Those files live under R2 key prefix **`static/dashboard/overview/`**.

If only shell HTML and the Agent bundle were uploaded, **nav + shell render** but the **Overview React root never mounts** (404 on module graph). After uploading the full **`overview-dashboard/dist/`** tree to that R2 prefix, a hard refresh on **`/dashboard/overview`** should show the Overview UI. Charts still depend on **`/api/*`** returning data.

## Locked behavior (do not break)

- **Production OAuth** in `worker.js`: `handleGoogleOAuthCallback` (`/auth/callback/google`, `/api/oauth/google/callback`) and `handleGitHubOAuthCallback` (`/auth/callback/github`, `/api/oauth/github/callback`). Do not edit without explicit owner approval; breaking these locks users out of the dashboard.
- **Production worker deploy** (`inneranimalmedia`): never run `wrangler deploy` / `npm run deploy` for production unless Sam types exactly **`deploy approved`**.
- **`wrangler.production.toml`**: treat as locked for bindings unless Sam approves.

## Buckets and workers

| Environment | Worker name              | Dashboard R2 bucket            |
|-------------|--------------------------|---------------------------------|
| CIDI sandbox| `inneranimal-dashboard`  | **`agent-sam-sandbox-cidi`**   |
| Production  | `inneranimalmedia`       | **`agent-sam`**                |

Sandbox worker config in repo: **`wrangler.jsonc`**. Production: **`wrangler.production.toml`** + `./scripts/with-cloudflare-env.sh`.

## R2 key layout (dashboard)

Worker resolves dashboard HTML and static assets from **`env.DASHBOARD`** (R2). Common keys:

- **Overview page:** `static/dashboard/overview.html` (from `dashboard/overview.html` in repo).
- **Overview Vite app:** everything under **`static/dashboard/overview/`** produced by `overview-dashboard` build (`overview-dashboard.js`, `Finance.js`, `overview-dashboard-*.js`, CSS, etc.). **`base`** in `overview-dashboard/vite.config.js` is `/static/dashboard/overview/`.
- **Agent page:** `static/dashboard/agent.html`; Vite output under **`static/dashboard/agent/`** (`agent-dashboard.js`, `agent-dashboard.css`, chunks).
- **Auth:** `static/auth-signin.html` from `dashboard/auth-signin.html`.
- Other pages: `static/dashboard/<segment>.html` for `/dashboard/<segment>`.

**R2-only updates** (HTML/JS/CSS in the bucket) usually **do not** require redeploying the sandbox Worker. Redeploy when **`worker.js`** or bindings change.

## Builds and sandbox upload

1. After changing **overview-dashboard** sources:  
   `cd overview-dashboard && npm install && npm run build`
2. After changing **agent-dashboard** sources:  
   `cd agent-dashboard && npm install && npm run build`
3. Push static files to the **sandbox** bucket:

```bash
./scripts/upload-repo-to-r2-sandbox.sh
```

Optional env overrides:

- `SANDBOX_R2_BUCKET` (default `agent-sam-sandbox-cidi`)
- `R2_CONFIG` (default `wrangler.production.toml` for account/token via `./scripts/with-cloudflare-env.sh`)

Requires `.env.cloudflare` (or equivalent) with `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.

## Promoting to production

1. List **every** file you will upload to **`agent-sam`** (HTML, JS, CSS, maps if needed).
2. Use **`./scripts/with-cloudflare-env.sh`** and **`-c wrangler.production.toml`** for R2 and deploy commands per **`.cursorrules`**.
3. Production worker deploy only after Sam types **`deploy approved`**.
4. Dashboard HTML served from R2: upload those objects **before** or with the worker deploy so the live site is not stale.

## Pre-production checklist

- [ ] Overview: `overview-dashboard/dist/*` uploaded to `agent-sam/static/dashboard/overview/`.
- [ ] Overview HTML: `dashboard/overview.html` → `static/dashboard/overview.html`.
- [ ] Agent (if touched): `agent-dashboard/dist/*` → `static/dashboard/agent/`; `dashboard/agent.html` → `static/dashboard/agent.html`.
- [ ] Any other edited `dashboard/*.html` synced to matching `static/dashboard/` keys.
- [ ] Smoke: `/dashboard/overview` and `/dashboard/agent` on target host (hard refresh).
- [ ] OAuth flows not modified without approval.

---

## Copy-paste prompt (other Cursor session)

Read and follow `docs/CURSOR_HANDOFF_SANDBOX_UI_TO_PRODUCTION.md` in this repository.

Rules:

- Do not edit production OAuth handlers in `worker.js` without explicit owner approval.
- Do not deploy the **inneranimalmedia** production worker without Sam typing exactly: **deploy approved**.
- Sandbox uses R2 bucket **agent-sam-sandbox-cidi** for dashboard static; production uses **agent-sam**.
- After changing dashboard HTML or Vite apps: run builds (**agent-dashboard**, **overview-dashboard** as needed), then **`./scripts/upload-repo-to-r2-sandbox.sh`**. R2-only changes usually do not require redeploying the sandbox Worker.
- **overview.html** requires **`static/dashboard/overview/overview-dashboard.js`** and all Vite chunks in **`static/dashboard/overview/`** on R2; **agent.html** requires **`static/dashboard/agent/agent-dashboard.js`** and **`.css`** (plus chunks) on R2.
- When promoting to production, list every file uploaded to **agent-sam** and use **`wrangler.production.toml`** + **`with-cloudflare-env.sh`** per **`.cursorrules`**.

Task: [describe your current UI tweak or page]

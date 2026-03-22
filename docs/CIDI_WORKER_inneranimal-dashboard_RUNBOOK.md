# Runbook: `inneranimal-dashboard` (CIDI sandbox worker)

URL: `https://inneranimal-dashboard.meauxbility.workers.dev/`

## Expected behavior

- **GET `/`** → **302** to **`/auth/signin`** (epic sign-in page from R2 `static/auth-signin.html`).
- **GET `/auth/signin`** → **200** HTML from **`env.DASHBOARD.get('static/auth-signin.html')`**.

Implemented in `worker.js` via `isInneranimalDashboardSandboxHost()` and the public-route block (sandbox branch before `env.ASSETS.get('index…')`).

## Symptom: `/` shows “Overview” + `#overview-root` + `/src/main.jsx`

That body is **`overview-dashboard/index.html`** (Vite dev shell). Typical causes:

1. **Old worker bundle** deployed (no sandbox `/` redirect) **and** R2 **`index.html`** (or `index-v2` / `index-v3`) in the sandbox bucket is the Vite shell — worker falls through to `env.ASSETS.get('index.html')`.
2. **Cloudflare dashboard**: **Workers Static Assets** (or an **`assets.directory`** in a deployed config) serving files **before** or **instead** of the Worker script you expect.

## Required bindings (match `wrangler.jsonc`)

| Binding   | Resource                    | Value                      |
|-----------|-----------------------------|----------------------------|
| **ASSETS**   | R2 bucket                   | **`agent-sam-sandbox-cidi`** |
| **DASHBOARD**| R2 bucket                   | **`agent-sam-sandbox-cidi`** |
| **DB**       | D1 database                 | **`inneranimalmedia-business`** |

If **ASSETS** is missing, many `worker.js` paths that call `env.ASSETS.get` first can **throw** or mis-serve; keep **both** R2 bindings on the **same** sandbox clone bucket.

## Do **not** add (regression)

- **`assets.directory`** in Wrangler for this worker, or dashboard **Static Assets** pointing at `overview-dashboard/`, unless you intentionally want `/` to bypass the Worker — it **steals** the **`ASSETS`** name or serves the wrong HTML and **breaks** the sign-in landing flow.

## Repair checklist

1. In **Workers & Pages** → **inneranimal-dashboard** → **Settings**: remove **Static Assets** / SPA asset bindings if present (anything serving `overview-dashboard` at `/`).
2. Confirm **Variables** → **R2 bucket bindings**: **ASSETS** + **DASHBOARD** → **`agent-sam-sandbox-cidi`**; **DB** → **`inneranimalmedia-business`**.
3. Redeploy from repo **`wrangler.jsonc`** + current **`worker.js`** (Git integration or CLI):

   ```bash
   ./scripts/with-cloudflare-env.sh npx wrangler deploy -c wrangler.jsonc
   ```

   Sam rule: production **`inneranimalmedia`** deploy only after **`deploy approved`**; this command targets **sandbox** worker **`inneranimal-dashboard`** only.

4. Ensure R2 has sign-in HTML:

   ```bash
   ./scripts/with-cloudflare-env.sh npx wrangler r2 object put agent-sam-sandbox-cidi/static/auth-signin.html \
     --file=dashboard/auth-signin.html --content-type=text/html --remote -c wrangler.production.toml
   ```

5. Verify:

   ```bash
   curl -sI 'https://inneranimal-dashboard.meauxbility.workers.dev/' | grep -i location
   # Expect: Location: .../auth/signin
   ```

## Security: Cloudflare API token on the Worker

Do **not** store **`CLOUDFLARE_API_TOKEN`** as a Worker **plaintext** variable. Anyone with dashboard access can read it; it grants account-level API access beyond this Worker. Use **gitignored** `.env.cloudflare` and **`./scripts/with-cloudflare-env.sh`** for Wrangler CLI, D1, and R2 from your machine. If a token was ever pasted into chat or a screenshot, **revoke it** in Cloudflare and create a new one with least privilege.

## Optional: bucket root `index.html`

If an old **`index.html`** in **`agent-sam-sandbox-cidi`** is the Vite shell, it only affects **`/`** when the Worker **does not** redirect. After redeploying the current `worker.js`, **`/`** should redirect regardless. You may still delete or replace a misleading **`index.html`** in the bucket to avoid confusion when testing non-sandbox code paths.

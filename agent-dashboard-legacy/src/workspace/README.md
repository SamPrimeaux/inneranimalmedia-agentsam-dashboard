# Monaco and TOOLS R2 (`code/monaco/`)

## What “R2 install” means here

Copy the **Monaco AMD tree** from `node_modules/monaco-editor/min/vs` into the **TOOLS** bucket at **`code/monaco/vs/`**, so it is available at:

`https://tools.inneranimalmedia.com/code/monaco/vs/`

Use the repo script: **`scripts/upload-monaco-to-tools-r2.sh`** (run from repo root after `cd agent-dashboard && npm install`).

## Same-origin rule (critical)

Monaco loads **web workers** (`editor.worker.js`, language workers, etc.). Browsers require those worker scripts to be **same-origin** with the **page** that creates them, unless you use advanced COOP/COEP setups.

| Page origin | Safe Monaco `vs` host |
|-------------|------------------------|
| `https://inneranimalmedia.com` (dashboard) | Same host paths (e.g. **`/static/dashboard/...`** from **agent-sam** R2), or **bundled** by Vite (current default) |
| `https://tools.inneranimalmedia.com` | **`code/monaco/vs` on TOOLS** works (same origin) |

So: **uploading to TOOLS is correct** for static UIs served **from** `tools.inneranimalmedia.com` (e.g. workspace HTML on TOOLS, or a future editor page there). For **`/dashboard/agent` on inneranimalmedia.com**, pointing `loader.config` at **TOOLS** often **fails** in the browser (cross-origin workers).

**Today’s agent dashboard:** `@monaco-editor/react` + Vite already bundle Monaco; you do **not** have to mirror `vs` to R2 for the main app unless you want to override the loader explicitly.

## If you load from TOOLS (tools origin only)

Before any `<Editor />` mounts:

```javascript
import { loader } from "@monaco-editor/react";

loader.config({
  paths: {
    vs: "https://tools.inneranimalmedia.com/code/monaco/vs",
  },
});
```

## Same-origin option for inneranimalmedia.com dashboard

Mirror the **same** `min/vs` tree to **agent-sam** R2 at **`static/dashboard/monaco/vs/`** and set:

```javascript
loader.config({
  paths: {
    vs: "/static/dashboard/monaco/vs",
  },
});
```

(Adjust if your worker maps a different path; keys must match what the worker serves from DASHBOARD.)

## CORS on the TOOLS R2 bucket

Cross-origin **`fetch()`** (and some loaders) need **`Access-Control-Allow-Origin`** on responses from `tools.inneranimalmedia.com`. Configure CORS on the **`tools`** bucket (not only the custom domain).

### Option A — Wrangler (repo file)

Policy lives at **`scripts/r2-cors-tools-bucket.json`**. Apply (requires API token with R2 permissions):

```bash
cd /path/to/march1st-inneranimalmedia
./scripts/with-cloudflare-env.sh npx wrangler r2 bucket cors set tools --file=scripts/r2-cors-tools-bucket.json -c wrangler.production.toml
```

Verify:

```bash
./scripts/with-cloudflare-env.sh npx wrangler r2 bucket cors list tools -c wrangler.production.toml
```

Edit the JSON to add/remove origins (no path suffix; scheme + host only). After changing CORS on a bucket that already has traffic, **purge cache** for `tools.inneranimalmedia.com` if headers look stale (Cloudflare dashboard).

### Option B — Dashboard

R2 → bucket **`tools`** → **Settings** → **CORS policy** → paste equivalent rules (see [Configure CORS](https://developers.cloudflare.com/r2/buckets/cors/)).

### What CORS does not fix

**CORS** lets another origin read responses to **GET/HEAD** with proper headers. **Dedicated Web Workers** loaded from a **different** origin than the page are still **blocked** by browsers in the common case. For **`/dashboard/agent` on inneranimalmedia.com**, prefer **bundled** Monaco or **`vs` on the same origin** (agent-sam), not only CORS on TOOLS.

## After upload

- Spot-check: `https://tools.inneranimalmedia.com/code/monaco/vs/loader.js` returns **200**.
- Re-upload when **`monaco-editor`** version changes in `package.json`.

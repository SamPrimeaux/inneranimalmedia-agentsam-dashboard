# MONACO_DELIVERY.md
# IAM Monaco Setup — Version-pinned, Theme-flexible, Same-origin Safe

Last updated: 2026-03-31
Owner: Inner Animal Media / samprimeaux

---

## 1. Version Pin

| Package                  | Version   | Source of truth                          |
|--------------------------|-----------|------------------------------------------|
| `monaco-editor`          | `0.55.1`  | `agent-dashboard/package.json` + lockfile |
| `@monaco-editor/react`   | `4.7.0`   | `agent-dashboard/package.json` + lockfile |

**Rule:** No stray CDN pins (e.g. `monaco-editor@0.44.0` in static HTML) may
differ from the lockfile version. Either remove them or align. See §4.

---

## 2. Two Consumption Modes

### Mode A — Bundled (Primary): `inneranimalmedia.com` dashboard

Pages served from `https://inneranimalmedia.com` (e.g. `/dashboard/agent`).

**Package:**
```json
// agent-dashboard/package.json
{
  "dependencies": {
    "@monaco-editor/react": "4.7.0",
    "monaco-editor": "0.55.1"
  }
}
```

**Vite config** (add to `agent-dashboard/vite.config.js`):
```js
import monacoEditorPlugin from 'vite-plugin-monaco-editor';

export default {
  plugins: [
    monacoEditorPlugin({
      languageWorkers: ['editorWorkerService', 'typescript', 'json', 'html', 'css']
    })
  ]
}
```

Workers are bundled by Vite and served from the same origin as the page.
No `loader.config` override needed — `@monaco-editor/react` defaults to its
own bundled path.

**Do NOT** point `loader.config({ paths: { vs: 'https://tools.inneranimalmedia.com/...' } })`
from a page on `inneranimalmedia.com`. See §3 (Same-Origin Rules).

---

### Mode B — TOOLS AMD Tree: `tools.inneranimalmedia.com` pages

Pages served from `https://tools.inneranimalmedia.com/code/...`

The `min/vs` AMD tree is uploaded to R2 bucket `tools` at key prefix `code/monaco/vs/`.
Workers are fetched from the same origin (`tools.inneranimalmedia.com`) — safe.

**Loader config** (call once before any `<Editor />` mounts, at app entry):
```js
// Only when page origin is tools.inneranimalmedia.com
import { loader } from "@monaco-editor/react";

if (window.location.hostname === 'tools.inneranimalmedia.com') {
  loader.config({
    paths: {
      vs: "https://tools.inneranimalmedia.com/code/monaco/vs",
    },
  });
}
```

Or in plain HTML (e.g. `iam-workspace-shell.html`):
```html
<script src="https://tools.inneranimalmedia.com/code/monaco/vs/loader.js"></script>
<script>
  require.config({
    paths: { vs: 'https://tools.inneranimalmedia.com/code/monaco/vs' }
  });
</script>
```

---

## 3. Same-Origin Rules (READ BEFORE WIRING)

Monaco spawns dedicated Web Workers to run language services
(`editorWorkerService`, `typescript`, etc.). These workers are loaded via
`new Worker(url)`. Browser security requires the worker script URL to be
**same-origin** with the page — or a blob URL generated from a same-origin
script.

| Page origin                        | Worker origin needed         | Correct `vs` path                                      |
|------------------------------------|------------------------------|-------------------------------------------------------|
| `inneranimalmedia.com`             | `inneranimalmedia.com`       | Bundled (Vite) or `/static/dashboard/monaco/vs/`      |
| `tools.inneranimalmedia.com`       | `tools.inneranimalmedia.com` | `https://tools.inneranimalmedia.com/code/monaco/vs`   |
| `inneranimal-dashboard.*.workers.dev` | same workers.dev host     | Bundled or mirror to that origin                      |

**CORS does NOT fix this.** Setting bucket CORS to allow cross-origin
`fetch` does not make cross-origin `new Worker(url)` safe for Monaco.
If you point the dashboard at the TOOLS CDN path you will get silent
worker spawn failures. Language services (hover, autocomplete, diagnostics)
will break with no obvious console error in some browsers.

---

## 4. Static HTML CDN Pin Cleanup

Any file still containing an old CDN reference must be updated:

```bash
# Find stale CDN pins in repo
grep -r "monaco-editor@" dashboard/ tools/ --include="*.html" --include="*.js"
```

For HTML files that legitimately use Mode B (TOOLS AMD):
- Replace any `monaco-editor@0.44.0` (or other old pin) with `0.55.1`
- Or remove the CDN `<script>` tag entirely if the file is now served with
  Mode A bundled approach

Approved exception: `tools/code/monaco/` reference HTML may use the
TOOLS AMD path as a demo page — this is correct and intentional.

---

## 5. TOOLS R2 Upload

### Bucket endpoints (source of truth)

| Purpose | URL |
|---|---|
| S3-compatible API | `https://ede6590ac0d2fb7daf155b35653457b2.r2.cloudflarestorage.com/tools` |
| Custom domain (production) | `https://tools.inneranimalmedia.com` |
| Public dev URL | `https://pub-de5170a2482c4b9faaf5451c67ff1d92.r2.dev` — **rate-limited, do NOT use in app code** |
| Data Catalog URI | `https://catalog.cloudflarestorage.com/ede6590ac0d2fb7daf155b35653457b2/tools` |

**Always reference `tools.inneranimalmedia.com` in app code and documentation.**
The `r2.dev` URL is for dashboard preview only.

### Prerequisites
```bash
cd agent-dashboard && npm install
# Confirms node_modules/monaco-editor/min/vs exists
ls node_modules/monaco-editor/min/vs/loader.js
```

### Method 1: wrangler (default)
```bash
# From repo root:
./scripts/upload-monaco-to-tools-r2.sh
```

### Method 2: aws s3 sync (S3-compatible endpoint — faster for large trees)
```bash
# Requires: aws CLI + R2_ACCESS_KEY_ID + R2_SECRET_ACCESS_KEY
# Generate keys at: https://dash.cloudflare.com/ede6590ac0d2fb7daf155b35653457b2/r2/api-tokens
export R2_ACCESS_KEY_ID=your_key
export R2_SECRET_ACCESS_KEY=your_secret
./scripts/upload-monaco-to-tools-r2.sh --s3
```

The S3-compatible endpoint is:
```
https://ede6590ac0d2fb7daf155b35653457b2.r2.cloudflarestorage.com
```
Bucket name for `aws s3` commands: `tools`

### Verification
```bash
curl -I https://tools.inneranimalmedia.com/code/monaco/vs/loader.js
# Expected: HTTP/2 200, content-type: application/javascript
```

The upload script runs this automatically and reports the HTTP status.

### CORS (only if other origins need to fetch these assets)
```bash
./scripts/with-cloudflare-env.sh \
  wrangler r2 bucket cors set tools \
  --file=scripts/r2-cors-tools-bucket.json \
  -c wrangler.production.toml
```

Reiterate: CORS is not a substitute for same-origin worker rules. The dashboard must use bundled Monaco.

---

## 6. Theme Mapping

| `data-theme` slug   | Monaco theme name  | Defined in              |
|---------------------|--------------------|-------------------------|
| `iam-storm`         | `iam-storm`        | `monacoTheme.js`        |
| `solarized-dark`    | `solarized-dark`   | `monacoTheme.js`        |
| `meaux-glass-blue`  | `iam-storm`        | fallback                |

Monaco theme JSON may use fixed hex colors internally (required by Monaco API).
The mapping layer in `monacoTheme.js` reads `document.documentElement.dataset.theme`
or the CMS API response and selects the correct Monaco theme name.

To add a new CMS theme:
1. Add a row to `cms_themes` with `slug` and `config.cssVars`
2. Add a `defineTheme` block in `monacoTheme.js` for the new slug
3. Add a row to the mapping table above

---

## 7. Troubleshooting

**Worker load failures (language services silent)**
- Cause: cross-origin `vs` path for a bundled-mode page
- Fix: use bundled Monaco (Vite) or same-origin mirror

**`require is not defined`**
- Cause: AMD loader (`loader.js`) not loaded before `require.config`
- Fix: ensure `loader.js` script tag comes first, or use `@monaco-editor/react`
  which handles this internally

**Monaco renders but no syntax highlighting**
- Cause: language worker not registered
- Fix: add language to `languageWorkers` array in Vite plugin config

**Theme not applying**
- Cause: `defineTheme` called after `Editor` mount
- Fix: use `beforeMount` prop on `<Editor>` to call `defineTheme` before mount

**Old version in browser cache after R2 upload**
- Add `?v=0.55.1` to the CDN URL or set `Cache-Control: no-cache` on upload
- The upload script sets `Cache-Control: public, max-age=31536000, immutable`
  on versioned assets and `no-cache` on `loader.js`

---

## 8. Agent-dashboard Integration Points

- `agent-dashboard/src/monacoTheme.js` — theme definitions + apply function
- `agent-dashboard/src/monacoLoaderConfig.js` — origin-aware loader config
- `agent-dashboard/src/workspace/IamCodeSurface.jsx` — MonacoHost wrapper
- `agent-dashboard/src/workspace/IamWorkspaceShell.jsx` — shell root

Do NOT edit `FloatingPreviewPanel.jsx` wholesale. Import `IamCodeSurface`
where a Monaco surface is needed; wire theme via `applyMonacoThemeForDocumentTheme()`.

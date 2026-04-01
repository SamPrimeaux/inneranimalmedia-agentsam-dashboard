# core-dashboard-static

**What:** Static HTML dashboards and workspace shells served from **agent-sam** R2 (`static/dashboard/<file>.html`). Includes `iam-workspace-shell.html`, `tools-code-hub.html`, etc.

**Repo:** `dashboard/*.html` — uploaded to R2 **before** worker deploy when changed; see `.cursor/rules/dashboard-r2-before-deploy.mdc`.

**Wires in:** Loaded by worker route `/dashboard/...`. Meta tags (e.g. `iam-tools-public-origin`) bridge to **TOOLS** public URL. Can embed iframes or script tags pointing at built bundles.

**UI integration:** Redesign HTML/CSS here; keep API calls pointed at worker origin. Coordinate with React bundle if sharing tokens or layout.

**Do not:** Serve secrets or provider keys in static HTML.

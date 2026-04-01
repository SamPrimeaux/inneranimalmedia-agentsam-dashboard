# R2 buckets — where uploads belong

| Bucket | Binding | Public / use | Typical keys |
|--------|---------|----------------|--------------|
| **tools** | `TOOLS` | `tools.inneranimalmedia.com` | `code/**` runbooks, skills, integration scripts (mirror repo `tools/code/`) |
| **agent-sam** | `DASHBOARD` | Via worker `/dashboard/*` | `static/dashboard/*.html`, `static/dashboard/agent/agent-dashboard.js` (Vite build) |
| **autorag** | `AUTORAG_BUCKET` | `autorag.inneranimalmedia.com` | Small `.md` for RAG: `context/`, `knowledge/`, `code/` — keep under 15 KB per file |
| **iam-docs** | `DOCS_BUCKET` | `docs.inneranimalmedia.com` | Longer platform docs |
| **iam-platform** | `R2` | Private | Memory/logs — not for dashboard source |

**Rule:** Changing **only** `tools/code/*.md` → upload to **tools** `code/...`. Changing **dashboard HTML** served in prod → **agent-sam** + then deploy flow. **Do not** put worker source in iam-platform for deploy (see LOCATIONS_AND_DEPLOY_AUDIT.md).

**CORS (tools bucket):** Cross-origin fetches from the dashboard need CORS on bucket **`tools`**. Apply **`scripts/r2-cors-tools-bucket.json`** via `wrangler r2 bucket cors set tools --file=...` (see `tools/code/monaco/README.md`).

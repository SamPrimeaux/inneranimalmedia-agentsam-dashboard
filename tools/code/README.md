# IAM core components (repo map)

Short index for UI work and backend bolt-on. Each subfolder is one slice of **inneranimalmedia**: what it is, where the source lives, how it connects.

**Flow (request path):** Browser or client → **Worker** (`worker.js`) → **D1 / R2 / bindings** → optional **MCP** or **terminal/collab** WebSockets.

**UI split:** React app (`agent-dashboard` build) is the main interactive shell; `dashboard/*.html` covers shells and legacy/static surfaces. Both are uploaded to **agent-sam** R2 under `static/dashboard/` for prod.

**Public artifacts:** **TOOLS** bucket (`tools.inneranimalmedia.com`) — code snippets, draw libs, Monaco exports. Not the app; worker still gates auth and APIs.

| Folder | Role |
|--------|------|
| [core-api-surface](core-api-surface/) | Routes, auth, `/api/*`, AI streaming |
| [core-dashboard-react](core-dashboard-react/) | Vite React UI, bundles to R2 |
| [core-dashboard-static](core-dashboard-static/) | HTML dashboards, workspace shell |
| [core-tools-r2](core-tools-r2/) | TOOLS bucket contract vs worker |
| [core-mcp](core-mcp/) | MCP server + tool registration |
| [core-data-persistence](core-data-persistence/) | D1, sessions, project context |
| [core-realtime](core-realtime/) | Terminal WS, collab draw DO |

**Multi-provider testing + batch:** see [integration/](integration/) (also on R2 at `code/integration/`).

**Runbooks / incremental workflow:** [skills/](skills/) — WORKFLOW, R2-BUCKETS, DEPLOY-CIDI, D1, AI testing, agent-human sync. On R2: `code/skills/`. Cursor: `.cursor/skills/iam-platform-sync/SKILL.md`.

**Autorag (RAG pointer):** `context/iam-rag-index.md` in **autorag** bucket links to TOOLS URLs above.

**Monaco on TOOLS:** [monaco/README.md](monaco/README.md) — sync `min/vs` with `scripts/upload-monaco-to-tools-r2.sh`; same-origin rules for workers.

Sync bite-sized summaries to **autorag** under `code/` or `context/` when a runbook needs RAG; keep files under ~15 KB per `AUTORAG_BUCKET_STRUCTURE.md`.

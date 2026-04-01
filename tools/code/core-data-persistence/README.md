# core-data-persistence

**What:** D1 `inneranimalmedia-business` — sessions, messages, telemetry, spend, projects, `ai_project_context_config`, workspaces, workflows metadata. Hyperdrive for Postgres when used.

**Repo:** `migrations/*.sql` — apply with wrangler `d1 execute` (remote with approval). App logic reads/writes via `worker.js` (and MCP for some ops).

**Wires in:** Worker is the only production writer for most tables; dashboard sends requests, not raw SQL. `project_memory` and routing tables drive model/tool selection.

**UI integration:** New screens should load/save through documented APIs. Schema changes = migration file + coordinated worker read/write paths. Canonical IDs (tenant, project, workspace) live in D1 — align UI labels with these keys in metadata.

**Do not:** Create new D1 tables without approval; do not write frozen legacy cost tables per `AGENTS.md`.

# Agent / human sync

| Source of truth | What |
|-----------------|------|
| **Git repo** | `worker.js`, `agent-dashboard/`, `dashboard/`, `migrations/`, `tools/code/` |
| **TOOLS R2** | Public mirror of `tools/code/` for agents and browsers without git |
| **autorag R2** | `docs/autorag/context/iam-rag-index.md` in repo — upload to `autorag/context/` for RAG |
| **agent-sam R2** | Built dashboard bundles + HTML shells (must match repo after promote) |
| **D1** | Runtime config: models, sessions, telemetry, project_memory |
| **AGENTS.md** (Downloads copy) | Long-form infra reference — not duplicated in full on R2 |

**Agents:** Read `tools/code/skills/` + `tools/code/core-*` first; then worker grep for route. **Humans:** Same; keep repo and TOOLS R2 in sync when changing runbooks.

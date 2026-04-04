# IAM skills / runbooks (repo + R2)

Short files so humans and agents align. **Full text:** `tools.inneranimalmedia.com/code/skills/` (TOOLS bucket). **RAG bite:** `autorag.inneranimalmedia.com/context/` index file points here.

| File | Use when |
|------|----------|
| [WORKFLOW.md](WORKFLOW.md) | Incremental test cadence (step order) |
| [R2-BUCKETS.md](R2-BUCKETS.md) | Where each upload goes (tools vs agent-sam vs autorag) |
| [DEPLOY-CICD.md](DEPLOY-CICD.md) | Sandbox build, benchmark gate, promote |
| [D1-MIGRATIONS.md](D1-MIGRATIONS.md) | SQL changes, approval, wrangler d1 execute |
| [AI-TESTING.md](AI-TESTING.md) | Multi-provider smoke, batch vs live (links integration/) |
| [AGENT-HUMAN-SYNC.md](AGENT-HUMAN-SYNC.md) | Repo vs R2 vs D1 source of truth |

Read **WORKFLOW.md** first for “test each step incrementally.”

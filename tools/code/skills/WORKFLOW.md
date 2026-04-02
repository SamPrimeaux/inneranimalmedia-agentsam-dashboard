# Incremental workflow (test each step)

Order matters. Skip promote until the gate passes.

1. **Change locally** — one concern per commit (UI **or** worker **or** D1, not all three unless coupled).
2. **Dashboard React** — `cd agent-dashboard && npm run build:vite-only` then `./scripts/deploy-sandbox.sh` (not prod). That script also uploads `iam-workspace-shell.html` + `shell.css` to sandbox R2 (`/dashboard/iam-workspace-shell`).
3. **Sandbox URL** — open `inneranimal-dashboard.meauxbility.workers.dev/dashboard/agent`; confirm `v=` matches expectation.
4. **Benchmark** — `./scripts/benchmark-full.sh sandbox` (or `benchmark-all-providers.sh`) — must pass your bar before promote.
5. **Promote** — Sam runs `./scripts/promote-to-prod.sh` (copies sandbox R2, deploys worker); then `./scripts/benchmark-full.sh prod`.
6. **D1 migration** — propose SQL, get approval, `wrangler d1 execute ... --remote --file=...` (see D1-MIGRATIONS.md).
7. **R2 dashboard HTML** — if `dashboard/*.html` changed, upload to **agent-sam** `static/dashboard/<file>` before worker deploy (see R2-BUCKETS.md).

**Do not:** deploy prod worker without sandbox pass (per project rules). **Do not:** chain two unrelated deploys without a load check between.

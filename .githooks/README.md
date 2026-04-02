# Git hooks (CI/DI)

Hooks in this directory run automatically when you use Git if you point `core.hooksPath` here.

## Enable hooks (one-time per clone)

From repo root:

```bash
git config core.hooksPath .githooks
chmod +x .githooks/post-merge
```

To enable for all repos (global):

```bash
git config --global core.hooksPath /path/to/march1st-inneranimalmedia/.githooks
```

## Hooks

### post-merge

Runs after `git pull` or `git merge`. If any file under `docs/knowledge/` or `scripts/populate-autorag.sh` changed:

1. Runs `./scripts/populate-autorag.sh` to upload knowledge/skills to R2 bucket **autorag**.
2. Optionally calls `scripts/record-workflow-run.sh` to record the run in D1 table `ci_di_workflow_runs` (if the script exists and is executable).

Logs: `/tmp/autorag-post-merge.log`. You still need to click **Sync** in Cloudflare AI Search (iam-autorag) to refresh the vector index.

## D1 recording

If `scripts/record-workflow-run.sh` is present and executable, the hook will record each run (success or failure) in D1 so you have an audit trail for CI/DI. See `docs/AUTORAG_SYNC.md` and migration `migrations/140_ci_di_workflow_runs.sql`.

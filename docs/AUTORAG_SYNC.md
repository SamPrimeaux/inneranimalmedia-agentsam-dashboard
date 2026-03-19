# AutoRAG / R2 sync — when and how

## When you can sync

After you run `./scripts/populate-autorag.sh` from the repo root (with `.env.cloudflare` or env loaded so `CLOUDFLARE_API_TOKEN` is set), all knowledge files in the repo are uploaded to the **autorag** R2 bucket. You can then sync vector data in Cloudflare:

1. **AI Search (iam-autorag):** Dashboard → AI Search → select **iam-autorag** → **Sync**. That re-indexes the autorag bucket so RAG retrieval sees the new/updated skills and knowledge.
2. **Vectorize (iam-platform):** If you also upload to **iam-platform** (see skills README), trigger **Re-index memory** from the Agent dashboard, or wait for the next scheduled index run (e.g. cron in the worker).

So: **you can sync as soon as you’ve run `populate-autorag.sh` once** and then clicked Sync in the AI Search dashboard for iam-autorag.

---

## Making sync systematic (no babysitting)

To avoid having to remember to run the upload and sync manually:

### Option 1: After every pull (post-merge hook)

Run the upload automatically whenever you merge or pull on main:

```bash
# From repo root, one-time setup
cat << 'EOF' > .git/hooks/post-merge
#!/bin/bash
cd "$(git rev-parse --show-toplevel)" || exit 0
# Only run if knowledge or scripts changed
if git diff-tree -r --name-only --no-commit-id ORIG_HEAD HEAD | grep -qE '^docs/knowledge/|^scripts/populate-autorag'; then
  ./scripts/populate-autorag.sh 2>&1 | logger -t autorag 2>/dev/null || true
fi
EOF
chmod +x .git/hooks/post-merge
```

Then after each `git pull` (or merge), if anything under `docs/knowledge/` or `scripts/populate-autorag.sh` changed, the script runs and uploads to R2. You still need to click **Sync** in the AI Search dashboard (or run it on a schedule — see Option 2).

### Option 2: Cron — upload and optional reminder

Run the upload on a schedule so R2 stays in sync even if you don’t pull often. Sync in the dashboard can be done separately (or combined if you have API access).

Example (run once per day at 6 AM local; replace `REPO` with your repo path):

```bash
# crontab -e
0 6 * * * cd /Users/samprimeaux/Downloads/march1st-inneranimalmedia && ./scripts/populate-autorag.sh >> /tmp/autorag-sync.log 2>&1
```

Ensure `.env.cloudflare` exists and is readable by cron (or that `CLOUDFLARE_API_TOKEN` is in the environment cron uses). After the upload, open Cloudflare Dashboard → AI Search → iam-autorag → **Sync** when you want vectors updated; Cloudflare may also offer scheduled sync depending on your plan.

### Option 3: Manual one-off (current flow)

From repo root:

```bash
./scripts/populate-autorag.sh
```

Then in Cloudflare: AI Search → iam-autorag → **Sync**.

---

## Summary

| Step | What | When |
|------|------|------|
| 1 | Upload to R2 autorag | Run `./scripts/populate-autorag.sh` (manual, or via post-merge hook, or cron) |
| 2 | Update vectors | AI Search dashboard → iam-autorag → **Sync** (manual until/unless you add scheduled sync) |

You can sync the new vector data as soon as step 1 has run at least once and you’ve completed step 2 in the dashboard.

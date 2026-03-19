#!/usr/bin/env bash
# Time the deploy, then record it in D1 with deploy_time_seconds and build_time_seconds.
# Usage: run from repo root. Expects CLOUDFLARE_* from .env.cloudflare (via with-cloudflare-env.sh).
#   ./scripts/deploy-with-record.sh
#
# MANDATORY: If you changed any file under dashboard/ (e.g. cloud.html, agent.html), upload it to R2
# BEFORE running this script, or production will serve stale pages. See .cursor/rules/dashboard-r2-before-deploy.mdc.
# Example (always use --remote so upload goes to production; without it, uploads go to local only):
#   ./scripts/with-cloudflare-env.sh npx wrangler r2 object put agent-sam/static/dashboard/cloud.html --file=dashboard/cloud.html --content-type=text/html --remote -c wrangler.production.toml
#
# For agent-initiated deploys, set TRIGGERED_BY=agent and optionally DEPLOYMENT_NOTES before running:
#   TRIGGERED_BY=agent DEPLOYMENT_NOTES='AI Gateway + R2 upload' npm run deploy
# Or: DEPLOY_SECONDS=0 ./scripts/post-deploy-record.sh  (to only record, e.g. after manual deploy)

set -e
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
CONFIG="$REPO_ROOT/wrangler.production.toml"
ENV_FILE="$REPO_ROOT/.env.cloudflare"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$ENV_FILE"
  set +a
fi
export TRIGGERED_BY
export DEPLOYMENT_NOTES

# Auto-increment ?v= in agent.html before R2 upload
CURRENT_V=$(grep -o '?v=[0-9]*' dashboard/agent.html | head -1 | grep -o '[0-9]*')
NEXT_V=$((CURRENT_V + 1))
sed -i '' "s/?v=${CURRENT_V}/?v=${NEXT_V}/g" dashboard/agent.html
echo "Cache bust: v${CURRENT_V} -> v${NEXT_V}"

# Upload agent-dashboard assets to R2 (agent-sam)
./scripts/with-cloudflare-env.sh npx wrangler r2 object put agent-sam/static/dashboard/agent/agent-dashboard.js --file agent-dashboard/dist/agent-dashboard.js --content-type "application/javascript" --config wrangler.production.toml --remote
./scripts/with-cloudflare-env.sh npx wrangler r2 object put agent-sam/static/dashboard/agent/agent-dashboard.css --file agent-dashboard/dist/agent-dashboard.css --content-type "text/css" --config wrangler.production.toml --remote
./scripts/with-cloudflare-env.sh npx wrangler r2 object put agent-sam/static/dashboard/agent.html --file dashboard/agent.html --content-type "text/html" --config wrangler.production.toml --remote

# Upload source files for AI indexing (Vectorize codebase search)
echo "Uploading source files for AI indexing..."
./scripts/with-cloudflare-env.sh npx wrangler r2 object put agent-sam/source/worker.js --file=worker.js --content-type="application/javascript" --config wrangler.production.toml --remote
find agent-dashboard/src -type f \( -name "*.jsx" -o -name "*.js" \) | while read -r file; do
  ./scripts/with-cloudflare-env.sh npx wrangler r2 object put "agent-sam/source/${file}" --file="${file}" --content-type="application/javascript" --config wrangler.production.toml --remote
done
find mcp-server/src -type f -name "*.js" | while read -r file; do
  ./scripts/with-cloudflare-env.sh npx wrangler r2 object put "agent-sam/source/${file}" --file="${file}" --content-type="application/javascript" --config wrangler.production.toml --remote
done
find docs -type f -name "*.md" 2>/dev/null | while read -r file; do
  ./scripts/with-cloudflare-env.sh npx wrangler r2 object put "agent-sam/source/${file}" --file="${file}" --content-type="text/markdown" --config wrangler.production.toml --remote
done
# Trigger async indexing (fire and forget)
curl -s -X POST https://inneranimalmedia.com/api/admin/reindex-codebase -H "Content-Type: application/json" -d '{"async":true}' > /dev/null 2>&1 || true
echo "Source files uploaded; reindex triggered"

DEPLOY_START=$(date +%s)
echo "Deploying worker..."
if ! ./scripts/with-cloudflare-env.sh wrangler deploy --config "$CONFIG"; then
  exit 1
fi
DEPLOY_END=$(date +%s)
DEPLOY_SECONDS=$((DEPLOY_END - DEPLOY_START))
export DEPLOY_SECONDS
echo "Deploy finished in ${DEPLOY_SECONDS}s. Recording in D1..."
./scripts/post-deploy-record.sh

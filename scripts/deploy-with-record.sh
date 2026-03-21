#!/usr/bin/env bash
# Time the deploy, then record it in D1 (deploy_time_seconds via post-deploy-record.sh).
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
[[ -f "$HOME/IAM_SECRETS.env" ]] && set -a && source "$HOME/IAM_SECRETS.env" && set +a
export TRIGGERED_BY
export DEPLOYMENT_NOTES
export DEPLOY_VERSION

# Auto-increment ?v= in agent.html before R2 upload
CURRENT_V=$(grep -o '?v=[0-9]*' dashboard/agent.html | head -1 | grep -o '[0-9]*')
NEXT_V=$((CURRENT_V + 1))
sed -i '' "s/?v=${CURRENT_V}/?v=${NEXT_V}/g" dashboard/agent.html
echo "Cache bust: v${CURRENT_V} -> v${NEXT_V}"

# Upload agent-dashboard assets to R2 (agent-sam)
./scripts/with-cloudflare-env.sh npx wrangler r2 object put agent-sam/static/dashboard/agent/agent-dashboard.js --file agent-dashboard/dist/agent-dashboard.js --content-type "application/javascript" --config wrangler.production.toml --remote
./scripts/with-cloudflare-env.sh npx wrangler r2 object put agent-sam/static/dashboard/agent/agent-dashboard.css --file agent-dashboard/dist/agent-dashboard.css --content-type "text/css" --config wrangler.production.toml --remote
./scripts/with-cloudflare-env.sh npx wrangler r2 object put agent-sam/static/dashboard/agent.html --file dashboard/agent.html --content-type "text/html" --config wrangler.production.toml --remote

# Log agent dashboard R2 uploads to dashboard_versions (D1)
JS_HASH=$(md5 -q agent-dashboard/dist/agent-dashboard.js 2>/dev/null || md5sum agent-dashboard/dist/agent-dashboard.js | awk '{print $1}')
CSS_HASH=$(md5 -q agent-dashboard/dist/agent-dashboard.css 2>/dev/null || md5sum agent-dashboard/dist/agent-dashboard.css | awk '{print $1}')
HTML_HASH=$(md5 -q dashboard/agent.html 2>/dev/null || md5sum dashboard/agent.html | awk '{print $1}')
JS_SIZE=$(wc -c < agent-dashboard/dist/agent-dashboard.js | tr -d ' ')
CSS_SIZE=$(wc -c < agent-dashboard/dist/agent-dashboard.css | tr -d ' ')
HTML_SIZE=$(wc -c < dashboard/agent.html | tr -d ' ')
DEPLOY_TS=$(date +%s)
D1_DASH_SQL="INSERT OR REPLACE INTO dashboard_versions (id, page_name, version, file_hash, file_size, r2_path, description, is_production, is_locked, created_at) VALUES ('agent-js-v${NEXT_V}-${DEPLOY_TS}', 'agent', 'v${NEXT_V}', '${JS_HASH}', ${JS_SIZE}, 'static/dashboard/agent/agent-dashboard.js', 'Auto-logged by deploy-with-record.sh', 1, 1, unixepoch()), ('agent-css-v${NEXT_V}-${DEPLOY_TS}', 'agent-css', 'v${NEXT_V}', '${CSS_HASH}', ${CSS_SIZE}, 'static/dashboard/agent/agent-dashboard.css', 'Auto-logged by deploy-with-record.sh', 1, 1, unixepoch()), ('agent-html-v${NEXT_V}-${DEPLOY_TS}', 'agent-html', 'v${NEXT_V}', '${HTML_HASH}', ${HTML_SIZE}, 'static/dashboard/agent.html', 'Auto-logged by deploy-with-record.sh', 1, 1, unixepoch())"
./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote --config "$CONFIG" --command "$D1_DASH_SQL"
echo "Logged dashboard_versions for agent v${NEXT_V} (js/css/html)"

# Upload source files for AI indexing (Vectorize codebase search)
echo "Uploading source files for AI indexing..."
./scripts/with-cloudflare-env.sh npx wrangler r2 object put agent-sam/source/worker.js --file=worker.js --content-type="application/javascript" --config wrangler.production.toml --remote
find agent-dashboard/src -type f \( -name "*.jsx" -o -name "*.js" \) | while read -r file; do
  ./scripts/with-cloudflare-env.sh npx wrangler r2 object put "agent-sam/source/${file}" --file="${file}" --content-type="application/javascript" --config wrangler.production.toml --remote
done
find inneranimalmedia-mcp-server/src -type f -name "*.js" | while read -r file; do
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
set -o pipefail
DEPLOY_LOG=$(mktemp)
if ! ./scripts/with-cloudflare-env.sh wrangler deploy --config "$CONFIG" 2>&1 | tee "$DEPLOY_LOG"; then
  rm -f "$DEPLOY_LOG"
  set +o pipefail
  exit 1
fi
CLOUDFLARE_VERSION_ID=$(grep 'Current Version ID:' "$DEPLOY_LOG" | tail -1 | awk '{print $NF}')
export CLOUDFLARE_VERSION_ID
rm -f "$DEPLOY_LOG"
set +o pipefail
echo "Captured version ID: $CLOUDFLARE_VERSION_ID"
DEPLOY_END=$(date +%s)
DEPLOY_SECONDS=$((DEPLOY_END - DEPLOY_START))
export DEPLOY_SECONDS
echo "Deploy finished in ${DEPLOY_SECONDS}s. Recording in D1..."
./scripts/post-deploy-record.sh

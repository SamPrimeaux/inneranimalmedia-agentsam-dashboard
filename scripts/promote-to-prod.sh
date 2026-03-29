#!/usr/bin/env bash
# promote-to-prod.sh — pull sandbox R2 build → push to production R2 → deploy worker
# Usage: ./scripts/promote-to-prod.sh [--worker-only]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

WORKER_ONLY=0
for arg in "$@"; do
  [ "$arg" = "--worker-only" ] && WORKER_ONLY=1
done

echo "=== PROMOTE TO PRODUCTION ==="
echo ""

DEPLOY_TS="$(date -u +%Y%m%d%H%M%S)"
SANDBOX_BUCKET="agent-sam-sandbox-cidi"
PROD_BUCKET="agent-sam"
PROD_CFG="wrangler.production.toml"

JS_PATH="agent-dashboard/dist/agent-dashboard.js"
CSS_PATH="agent-dashboard/dist/agent-dashboard.css"
HTML_PATH="dashboard/agent.html"

# ── Step 1: Pull current build from sandbox R2 into local dist ────────────────
if [ "$WORKER_ONLY" -eq 0 ]; then
  echo "Pulling latest build from sandbox R2 (${SANDBOX_BUCKET})..."
  mkdir -p agent-dashboard/dist dashboard

  ./scripts/with-cloudflare-env.sh npx wrangler r2 object get "${SANDBOX_BUCKET}" \
    static/dashboard/agent/agent-dashboard.js \
    --file "$JS_PATH" --remote -c "$PROD_CFG"

  ./scripts/with-cloudflare-env.sh npx wrangler r2 object get "${SANDBOX_BUCKET}" \
    static/dashboard/agent/agent-dashboard.css \
    --file "$CSS_PATH" --remote -c "$PROD_CFG"

  ./scripts/with-cloudflare-env.sh npx wrangler r2 object get "${SANDBOX_BUCKET}" \
    static/dashboard/agent.html \
    --file "$HTML_PATH" --remote -c "$PROD_CFG"

  CURRENT_V=$(grep -o '?v=[0-9]*' "$HTML_PATH" | head -1 | grep -o '[0-9]*' || echo "0")
  echo "  Pulled v=${CURRENT_V} from sandbox."
  echo ""

  # ── Step 2: Push to production R2 ──────────────────────────────────────────
  echo "Promoting v=${CURRENT_V} to production bucket (${PROD_BUCKET})..."

  ./scripts/with-cloudflare-env.sh npx wrangler r2 object put "${PROD_BUCKET}/static/dashboard/agent/agent-dashboard.js" \
    --file "$JS_PATH" --content-type "application/javascript" \
    --config "$PROD_CFG" --remote

  ./scripts/with-cloudflare-env.sh npx wrangler r2 object put "${PROD_BUCKET}/static/dashboard/agent/agent-dashboard.css" \
    --file "$CSS_PATH" --content-type "text/css" \
    --config "$PROD_CFG" --remote

  ./scripts/with-cloudflare-env.sh npx wrangler r2 object put "${PROD_BUCKET}/static/dashboard/agent.html" \
    --file "$HTML_PATH" --content-type "text/html" \
    --config "$PROD_CFG" --remote

  echo "  R2 production uploads complete."

  # Log to dashboard_versions
  JS_HASH=$(md5 -q "$JS_PATH" 2>/dev/null || md5sum "$JS_PATH" | cut -d' ' -f1)
  CSS_HASH=$(md5 -q "$CSS_PATH" 2>/dev/null || md5sum "$CSS_PATH" | cut -d' ' -f1)
  HTML_HASH=$(md5 -q "$HTML_PATH" 2>/dev/null || md5sum "$HTML_PATH" | cut -d' ' -f1)
  JS_SIZE=$(wc -c < "$JS_PATH" | tr -d ' ')
  CSS_SIZE=$(wc -c < "$CSS_PATH" | tr -d ' ')
  HTML_SIZE=$(wc -c < "$HTML_PATH" | tr -d ' ')

  D1_SQL="INSERT OR REPLACE INTO dashboard_versions (id, page_name, version, file_hash, file_size, r2_path, description, is_production, is_locked, created_at) VALUES \
('prod-agent-js-v${CURRENT_V}-${DEPLOY_TS}', 'agent', 'v${CURRENT_V}', '${JS_HASH}', ${JS_SIZE}, 'static/dashboard/agent/agent-dashboard.js', 'Promoted from sandbox', 1, 1, unixepoch()), \
('prod-agent-css-v${CURRENT_V}-${DEPLOY_TS}', 'agent-css', 'v${CURRENT_V}', '${CSS_HASH}', ${CSS_SIZE}, 'static/dashboard/agent/agent-dashboard.css', 'Promoted from sandbox', 1, 1, unixepoch()), \
('prod-agent-html-v${CURRENT_V}-${DEPLOY_TS}', 'agent-html', 'v${CURRENT_V}', '${HTML_HASH}', ${HTML_SIZE}, 'static/dashboard/agent.html', 'Promoted from sandbox', 1, 1, unixepoch())"

  ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
    --remote -c "$PROD_CFG" \
    --command="$D1_SQL" 2>/dev/null || echo "  WARN: dashboard_versions D1 log failed (non-fatal)"
fi

# ── Step 3: Deploy production worker ──────────────────────────────────────────
echo "Deploying production worker (inneranimalmedia)..."
NOTES="${DEPLOYMENT_NOTES:-Promoted from sandbox via promote-to-prod.sh}"
TRIGGERED_BY="${TRIGGERED_BY:-promote}"

PROD_VERSION=$(./scripts/with-cloudflare-env.sh npx wrangler deploy ./worker.js \
  -c "$PROD_CFG" 2>&1 | tee /tmp/prod-deploy-out.txt | grep "Current Version ID:" | grep -o '[a-f0-9-]\{36\}' || echo "unknown")
cat /tmp/prod-deploy-out.txt

./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
  --remote -c "$PROD_CFG" \
  --command="INSERT OR IGNORE INTO deployments (id, timestamp, status, deployed_by, environment, worker_name, triggered_by, notes, created_at) VALUES ('${PROD_VERSION}', datetime('now'), 'success', 'sam_primeaux', 'production', 'inneranimalmedia', '${TRIGGERED_BY}', '${NOTES}', datetime('now'))" \
  2>/dev/null || echo "  WARN: deployments D1 record failed (non-fatal)"

echo ""
echo "=== PRODUCTION PROMOTE COMPLETE ==="
echo "  Worker:  inneranimalmedia @ ${PROD_VERSION}"
echo "  URL:     https://inneranimalmedia.com/dashboard/agent"
echo "  Bucket:  ${PROD_BUCKET}"
echo "  Version: v=${CURRENT_V:-n/a}"

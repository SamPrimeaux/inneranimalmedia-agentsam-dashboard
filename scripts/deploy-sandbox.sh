#!/usr/bin/env bash
# deploy-sandbox.sh — build + upload to agent-sam-sandbox-cidi + deploy inneranimal-dashboard
# Usage: ./scripts/deploy-sandbox.sh [--skip-build] [--worker-only]
# Auto-called by: npm run deploy:sandbox (which Cloudflare Workers Builds triggers on git push)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

SKIP_BUILD=0
WORKER_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --skip-build)  SKIP_BUILD=1 ;;
    --worker-only) WORKER_ONLY=1 ;;
  esac
done

# Load CF env if running locally (not in Workers Builds CI)
if [ -f "./scripts/with-cloudflare-env.sh" ] && [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
  source <(grep -v '^#' .env.cloudflare 2>/dev/null | grep -v '^\s*$' | sed 's/^/export /' || true)
fi

CFG="wrangler.jsonc"
SANDBOX_BUCKET="agent-sam-sandbox-cidi"
DEPLOY_TS="$(date -u +%Y%m%d%H%M%S)"

echo "=== SANDBOX DEPLOY ==="

# ── Build ────────────────────────────────────────────────────────────────────
if [ "$SKIP_BUILD" -eq 0 ] && [ "$WORKER_ONLY" -eq 0 ]; then
  echo "Building agent-dashboard..."
  cd agent-dashboard && npm run build:vite-only && cd ..
  echo "Build complete."
fi

# ── R2 upload to sandbox ─────────────────────────────────────────────────────
if [ "$WORKER_ONLY" -eq 0 ]; then
  echo "Uploading assets to $SANDBOX_BUCKET..."

  # Auto-increment v= in agent.html before upload (python3 for macOS reliability)
  CURRENT_V=$(grep -o '?v=[0-9]*' dashboard/agent.html | head -1 | grep -o '[0-9]*' || echo "0")
  NEXT_V=$((CURRENT_V + 1))
  python3 scripts/vbump.py "$CURRENT_V" "$NEXT_V" dashboard/agent.html
  CURRENT_V=$NEXT_V

  JS_PATH="agent-dashboard/dist/agent-dashboard.js"
  CSS_PATH="agent-dashboard/dist/agent-dashboard.css"
  HTML_PATH="dashboard/agent.html"

  npx wrangler r2 object put "${SANDBOX_BUCKET}/static/dashboard/agent/agent-dashboard.js" \
    --file "$JS_PATH" --content-type "application/javascript" \
    --config "$CFG" --remote

  npx wrangler r2 object put "${SANDBOX_BUCKET}/static/dashboard/agent/agent-dashboard.css" \
    --file "$CSS_PATH" --content-type "text/css" \
    --config "$CFG" --remote

  npx wrangler r2 object put "${SANDBOX_BUCKET}/static/dashboard/agent.html" \
    --file "$HTML_PATH" --content-type "text/html" \
    --config "$CFG" --remote

  echo "  R2 uploads complete."

  # Log to dashboard_versions in D1 (is_production=0)
  JS_HASH=$(md5 -q "$JS_PATH" 2>/dev/null || md5sum "$JS_PATH" | cut -d' ' -f1)
  CSS_HASH=$(md5 -q "$CSS_PATH" 2>/dev/null || md5sum "$CSS_PATH" | cut -d' ' -f1)
  HTML_HASH=$(md5 -q "$HTML_PATH" 2>/dev/null || md5sum "$HTML_PATH" | cut -d' ' -f1)
  JS_SIZE=$(wc -c < "$JS_PATH" | tr -d ' ')
  CSS_SIZE=$(wc -c < "$CSS_PATH" | tr -d ' ')
  HTML_SIZE=$(wc -c < "$HTML_PATH" | tr -d ' ')

  D1_SQL="INSERT OR REPLACE INTO dashboard_versions (id, page_name, version, file_hash, file_size, r2_path, description, is_production, is_locked, created_at) VALUES \
('sb-agent-js-v${CURRENT_V}-${DEPLOY_TS}', 'agent', 'v${CURRENT_V}', '${JS_HASH}', ${JS_SIZE}, 'static/dashboard/agent/agent-dashboard.js', 'Sandbox deploy', 0, 0, unixepoch()), \
('sb-agent-css-v${CURRENT_V}-${DEPLOY_TS}', 'agent-css', 'v${CURRENT_V}', '${CSS_HASH}', ${CSS_SIZE}, 'static/dashboard/agent/agent-dashboard.css', 'Sandbox deploy', 0, 0, unixepoch()), \
('sb-agent-html-v${CURRENT_V}-${DEPLOY_TS}', 'agent-html', 'v${CURRENT_V}', '${HTML_HASH}', ${HTML_SIZE}, 'static/dashboard/agent.html', 'Sandbox deploy', 0, 0, unixepoch())"

  npx wrangler d1 execute inneranimalmedia-business \
    --remote -c wrangler.production.toml \
    --command="$D1_SQL" 2>/dev/null || echo "  WARN: dashboard_versions D1 log failed (non-fatal)"
fi

# ── Deploy sandbox worker ─────────────────────────────────────────────────────
echo "Deploying sandbox worker (inneranimal-dashboard)..."
SANDBOX_VERSION=$(npx wrangler deploy ./worker.js -c "$CFG" 2>&1 | tee /tmp/sandbox-deploy-out.txt | grep "Current Version ID:" | grep -o '[a-f0-9-]\{36\}' || echo "unknown")
cat /tmp/sandbox-deploy-out.txt

# Record in deployments D1
NOTES="${DEPLOYMENT_NOTES:-Sandbox deploy via deploy-sandbox.sh}"
npx wrangler d1 execute inneranimalmedia-business \
  --remote -c wrangler.production.toml \
  --command="INSERT OR IGNORE INTO deployments (id, timestamp, status, deployed_by, environment, worker_name, triggered_by, notes, created_at) VALUES ('${SANDBOX_VERSION}', datetime('now'), 'success', 'sam_primeaux', 'sandbox', 'inneranimal-dashboard', 'sandbox_auto', '${NOTES}', datetime('now'))" \
  2>/dev/null || echo "  WARN: deployments D1 record failed (non-fatal)"

echo ""
echo "=== SANDBOX DEPLOY COMPLETE ==="
echo "  Worker:  inneranimal-dashboard @ ${SANDBOX_VERSION}"
echo "  URL:     https://inneranimal-dashboard.meauxbility.workers.dev/dashboard/agent"
echo "  Bucket:  ${SANDBOX_BUCKET}"
echo "  Version: v=${CURRENT_V:-n/a}"
echo ""
echo "Review at sandbox, then run: ./scripts/promote-to-prod.sh"

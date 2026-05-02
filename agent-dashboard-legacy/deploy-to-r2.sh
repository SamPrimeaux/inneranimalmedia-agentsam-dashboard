#!/usr/bin/env bash
# Build agent-dashboard and upload to R2 (agent-sam bucket). Run from repo root.
# Loads .env.cloudflare if present so CLOUDFLARE_API_TOKEN is set. Requires wrangler configured for account with agent-sam bucket.

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG="$REPO_ROOT/wrangler.production.toml"
ENV_FILE="$REPO_ROOT/.env.cloudflare"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$ENV_FILE"
  set +a
fi

cd "$SCRIPT_DIR"
npm run build

if cd "$REPO_ROOT/overview-dashboard" && command -v vite &>/dev/null; then
  npm run build 2>/dev/null || true
fi
cd "$REPO_ROOT"

echo "Uploading to R2 (agent-sam) --remote..."
wrangler r2 object put agent-sam/static/dashboard/agent/agent-dashboard.js \
  --file "$SCRIPT_DIR/dist/agent-dashboard.js" \
  --content-type "application/javascript" \
  --config "$CONFIG" \
  --remote

wrangler r2 object put agent-sam/static/dashboard/agent/agent-dashboard.css \
  --file "$SCRIPT_DIR/dist/agent-dashboard.css" \
  --content-type "text/css" \
  --config "$CONFIG" \
  --remote

for chunk in agent-dashboard-xterm.js agent-dashboard-xterm-addon-fit.js agent-dashboard-_commonjsHelpers.js; do
  if [ -f "$SCRIPT_DIR/dist/$chunk" ]; then
    wrangler r2 object put "agent-sam/static/dashboard/agent/$chunk" \
      --file "$SCRIPT_DIR/dist/$chunk" \
      --content-type "application/javascript" \
      --config "$CONFIG" \
      --remote
  fi
done
if [ -f "$SCRIPT_DIR/dist/agent-dashboard2.css" ]; then
  wrangler r2 object put agent-sam/static/dashboard/agent/agent-dashboard2.css \
    --file "$SCRIPT_DIR/dist/agent-dashboard2.css" \
    --content-type "text/css" \
    --config "$CONFIG" \
    --remote
fi

echo "Upload overview-dashboard bundle..."
if [ -f "$REPO_ROOT/overview-dashboard/dist/overview-dashboard.js" ]; then
  wrangler r2 object put agent-sam/static/dashboard/overview/overview-dashboard.js \
    --file "$REPO_ROOT/overview-dashboard/dist/overview-dashboard.js" \
    --content-type "application/javascript" \
    --config "$CONFIG" \
    --remote
fi
echo "Upload dashboard pages (agent.html, chats.html)"
if [ -f "$REPO_ROOT/static/dashboard/shell.css" ]; then
  wrangler r2 object put agent-sam/static/dashboard/shell.css \
    --file "$REPO_ROOT/static/dashboard/shell.css" \
    --content-type "text/css" \
    --config "$CONFIG" \
    --remote
fi
if [ -f "$REPO_ROOT/dashboard/agent.html" ]; then
  wrangler r2 object put agent-sam/static/dashboard/agent.html \
    --file "$REPO_ROOT/dashboard/agent.html" \
    --content-type "text/html" \
    --config "$CONFIG" \
    --remote
fi
if [ -f "$REPO_ROOT/dashboard/chats.html" ]; then
  wrangler r2 object put agent-sam/static/dashboard/chats.html \
    --file "$REPO_ROOT/dashboard/chats.html" \
    --content-type "text/html" \
    --config "$CONFIG" \
    --remote
fi
if [ -f "$REPO_ROOT/dashboard/cloud.html" ]; then
  wrangler r2 object put agent-sam/static/dashboard/cloud.html \
    --file "$REPO_ROOT/dashboard/cloud.html" \
    --content-type "text/html" \
    --config "$CONFIG" \
    --remote
fi
if [ -f "$REPO_ROOT/dashboard/overview.html" ]; then
  wrangler r2 object put agent-sam/static/dashboard/overview.html \
    --file "$REPO_ROOT/dashboard/overview.html" \
    --content-type "text/html" \
    --config "$CONFIG" \
    --remote
fi
if [ -f "$REPO_ROOT/dashboard/time-tracking.html" ]; then
  wrangler r2 object put agent-sam/static/dashboard/time-tracking.html \
    --file "$REPO_ROOT/dashboard/time-tracking.html" \
    --content-type "text/html" \
    --config "$CONFIG" \
    --remote
fi
if [ -f "$REPO_ROOT/dashboard/finance.html" ]; then
  wrangler r2 object put agent-sam/static/dashboard/finance.html \
    --file "$REPO_ROOT/dashboard/finance.html" \
    --content-type "text/html" \
    --config "$CONFIG" \
    --remote
fi
if [ -f "$REPO_ROOT/dashboard/billing.html" ]; then
  wrangler r2 object put agent-sam/static/dashboard/billing.html \
    --file "$REPO_ROOT/dashboard/billing.html" \
    --content-type "text/html" \
    --config "$CONFIG" \
    --remote
fi
# Finance.js: prefer overview-dashboard build output so it stays in sync with Finance.jsx
if [ -f "$REPO_ROOT/overview-dashboard/dist/Finance.js" ]; then
  wrangler r2 object put agent-sam/static/dashboard/Finance.js \
    --file "$REPO_ROOT/overview-dashboard/dist/Finance.js" \
    --content-type "application/javascript" \
    --config "$CONFIG" \
    --remote
  # Finance.js dynamically imports this chunk (relative path)
if [ -f "$REPO_ROOT/overview-dashboard/dist/overview-dashboard-PieChart.js" ]; then
  wrangler r2 object put agent-sam/static/dashboard/overview/overview-dashboard-PieChart.js \
    --file "$REPO_ROOT/overview-dashboard/dist/overview-dashboard-PieChart.js" \
    --content-type "application/javascript" \
    --config "$CONFIG" \
    --remote
  # Finance.js is served from static/dashboard/ so it resolves chunk at same dir
  wrangler r2 object put agent-sam/static/dashboard/overview-dashboard-PieChart.js \
    --file "$REPO_ROOT/overview-dashboard/dist/overview-dashboard-PieChart.js" \
    --content-type "application/javascript" \
    --config "$CONFIG" \
    --remote
fi
elif [ -f "$REPO_ROOT/dashboard/Finance.js" ]; then
  wrangler r2 object put agent-sam/static/dashboard/Finance.js \
    --file "$REPO_ROOT/dashboard/Finance.js" \
    --content-type "application/javascript" \
    --config "$CONFIG" \
    --remote
fi
echo "Done. Deploy worker from repo root: npm run deploy"

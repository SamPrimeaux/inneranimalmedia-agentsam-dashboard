#!/usr/bin/env bash
# Promote agent shell + Vite bundle from repo to production R2 (agent-sam).
# Does NOT deploy the Worker. Sam must type deploy approved before any wrangler deploy.
#
# Usage:
#   PROMOTE_OK=1 ./scripts/promote-agent-dashboard-to-production.sh
#
# Steps:
#   1. npm run build in agent-dashboard/
#   2. wrangler r2 object put -> agent-sam/static/dashboard/agent.html, agent-dashboard.js, agent-dashboard.css
#
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"
CONFIG="wrangler.production.toml"
WRAP=(./scripts/with-cloudflare-env.sh npx wrangler r2 object put)

if [[ "${PROMOTE_OK:-}" != "1" ]]; then
  echo "Refusing to upload to production without PROMOTE_OK=1." >&2
  echo "  PROMOTE_OK=1 ./scripts/promote-agent-dashboard-to-production.sh" >&2
  exit 1
fi

echo "Building agent-dashboard..."
(cd agent-dashboard && npm run build)

echo "Uploading to agent-sam..."
"${WRAP[@]}" agent-sam/static/dashboard/agent.html --file=dashboard/agent.html --content-type='text/html; charset=utf-8' --remote -c "$CONFIG"
"${WRAP[@]}" agent-sam/static/dashboard/agent/agent-dashboard.js --file=agent-dashboard/dist/agent-dashboard.js --content-type='application/javascript; charset=utf-8' --remote -c "$CONFIG"
"${WRAP[@]}" agent-sam/static/dashboard/agent/agent-dashboard.css --file=agent-dashboard/dist/agent-dashboard.css --content-type='text/css; charset=utf-8' --remote -c "$CONFIG"

echo "Done. R2 updated. If worker.js routing changed, run deploy only after Sam types: deploy approved"

#!/usr/bin/env bash
# Cloudflare Workers Builds: deploy worker + sync Vite dist and shell CSS to sandbox R2.
# Run from repo root (CF Dashboard Deploy command: bash scripts/deploy-cf-builds.sh).
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

DIST_DIR="agent-dashboard/agent-dashboard/dist"
BUCKET="${SANDBOX_BUCKET:-agent-sam-sandbox-cicd}"
R2_PREFIX="static/dashboard/agent"

echo "=== CF Builds: worker deploy ==="
npx wrangler deploy ./worker.js -c wrangler.jsonc

NEXT_V=$(cat agent-dashboard/.sandbox-deploy-version 2>/dev/null || echo 0)
export VITE_SHELL_VERSION=v${NEXT_V}
echo "=== CF Builds: Vite build ==="
cd agent-dashboard && npm ci --include=dev && npm run build && node scripts/bump-cache.js && cd ..
echo "=== CF Builds: R2 asset sync ==="
MAX_JOBS=8
job_count=0

if [ -d "$DIST_DIR/assets" ]; then
  while IFS= read -r file; do
    [ -z "$file" ] && continue
    key="${R2_PREFIX}/assets/$(basename "$file")"
    npx wrangler r2 object put "${BUCKET}/${key}" \
      --file "$file" \
      --remote \
      -c wrangler.jsonc &
    job_count=$((job_count + 1))
    if [ "$job_count" -ge "$MAX_JOBS" ]; then
      wait
      job_count=0
    fi
  done < <(find "$DIST_DIR/assets" -type f ! -name '._*' ! -name '.DS_Store')
  wait
else
  echo "[cf-builds] warn: no $DIST_DIR/assets — run Vite build first"
fi

if [ -f "$DIST_DIR/index.html" ]; then
  npx wrangler r2 object put "${BUCKET}/static/dashboard/agent.html" \
    --file "$DIST_DIR/index.html" \
    --content-type "text/html" \
    --remote \
    -c wrangler.jsonc
  echo "[cf-builds] agent.html uploaded"
fi

SHELL_CSS=""
if [ -f "./static/dashboard/shell.css" ]; then
  SHELL_CSS="./static/dashboard/shell.css"
elif [ -f "./dashboard/shell.css" ]; then
  SHELL_CSS="./dashboard/shell.css"
fi
if [ -n "$SHELL_CSS" ]; then
  npx wrangler r2 object put "${BUCKET}/static/dashboard/shell.css" \
    --file "$SHELL_CSS" \
    --content-type "text/css" \
    --remote \
    -c wrangler.jsonc
  echo "[cf-builds] shell.css uploaded"
fi

echo "=== CF Builds Deploy Complete ==="

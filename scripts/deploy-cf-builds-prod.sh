#!/usr/bin/env bash
# CF Builds PROD deploy — triggered by push to `production` branch only.
# DO NOT run manually. DO NOT use wrangler.jsonc. DO NOT deploy to sandbox bucket.
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

DIST_DIR="agent-dashboard/agent-dashboard/dist"
BUCKET="agent-sam"
R2_PREFIX="static/dashboard/agent"

echo "=== CF Builds PROD: worker deploy ==="
npx wrangler deploy ./worker.js -c wrangler.production.toml

echo "=== CF Builds PROD: Vite build ==="
cd agent-dashboard && npm ci --include=dev && node scripts/bump-cache.js && npm run build && cd ..

echo "=== CF Builds PROD: prune old R2 assets ==="
OLD_KEYS=$(npx wrangler r2 object list "${BUCKET}" \
  --prefix "${R2_PREFIX}/assets/" \
  --remote -c wrangler.production.toml 2>/dev/null \
  | grep '"key"' | sed 's/.*"key": "\(.*\)".*/\1/')
if [ -n "$OLD_KEYS" ]; then
  echo "$OLD_KEYS" | while IFS= read -r key; do
    [ -z "$key" ] && continue
    npx wrangler r2 object delete "${BUCKET}/${key}" \
      --remote -c wrangler.production.toml 2>/dev/null || true
  done
  echo "  Old assets pruned."
fi

echo "=== CF Builds PROD: R2 asset sync ==="
MAX_JOBS=8
job_count=0
if [ -d "$DIST_DIR/assets" ]; then
  while IFS= read -r file; do
    [ -z "$file" ] && continue
    key="${R2_PREFIX}/assets/$(basename "$file")"
    npx wrangler r2 object put "${BUCKET}/${key}" \
      --file "$file" \
      --remote \
      -c wrangler.production.toml &
    job_count=$((job_count + 1))
    if [ "$job_count" -ge "$MAX_JOBS" ]; then wait; job_count=0; fi
  done < <(find "$DIST_DIR/assets" -type f ! -name '._*' ! -name '.DS_Store')
  wait
fi

if [ -f "$DIST_DIR/index.html" ]; then
  npx wrangler r2 object put "${BUCKET}/static/dashboard/agent.html" \
    --file "$DIST_DIR/index.html" \
    --content-type "text/html" \
    --remote \
    -c wrangler.production.toml
  echo "  agent.html uploaded to prod R2."
fi

echo "=== CF Builds PROD Deploy Complete ==="

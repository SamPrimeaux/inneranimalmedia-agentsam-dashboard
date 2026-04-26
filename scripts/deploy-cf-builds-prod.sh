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
./scripts/with-cloudflare-env.sh npx wrangler deploy -c wrangler.production.toml

if [ -n "${INTERNAL_API_SECRET:-}" ]; then
  echo "=== CF Builds PROD: deploy-complete email notify ==="
  curl -sS -X POST "https://inneranimalmedia.com/api/notify/deploy-complete" \
    -H "X-Internal-Secret: ${INTERNAL_API_SECRET}" \
    -H "Content-Type: application/json" \
    -d '{}' || true
else
  echo "=== CF Builds PROD: skip notify (INTERNAL_API_SECRET unset) ==="
fi

echo "=== CF Builds PROD: record health snapshot ==="
COMMIT_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
COMMIT_MSG=$(git log -1 --pretty=%s 2>/dev/null || echo "unknown")
./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
  --remote -c wrangler.production.toml \
  --command="INSERT OR REPLACE INTO iam_system_health (id, component, status, last_checked_at, last_healthy_at, error_message, metadata_json, check_source) VALUES ('health_worker_prod', 'worker:production', 'healthy', datetime('now'), datetime('now'), NULL, '{\"entry\":\"src/index.js\",\"commit\":\"${COMMIT_SHA}\",\"message\":\"${COMMIT_MSG}\"}', 'cf_builds');
INSERT INTO iam_deploy_log (repo, branch, commit_sha, commit_message, entry_point, config_file, environment, status) VALUES ('inneranimalmedia-agentsam-dashboard', 'production', '${COMMIT_SHA}', '${COMMIT_MSG}', 'src/index.js', 'wrangler.production.toml', 'production', 'success');" 2>/dev/null || true


echo "=== CF Builds PROD: record deploy to D1 ==="
DEPLOY_TS=$(date -u +"%Y-%m-%d %H:%M:%S")
./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
  --remote -c wrangler.production.toml \
  --command="INSERT INTO deployments (id, worker_name, environment, status, timestamp, notes) VALUES ('deploy-'||hex(randomblob(8)), 'inneranimalmedia', 'production', 'success', '${DEPLOY_TS}', 'CF Builds auto-deploy')" 2>/dev/null || true

echo "=== CF Builds PROD: Vite build ==="
cd agent-dashboard && npm ci --include=dev && npm run build && node scripts/bump-cache.js && cd ..

echo "=== CF Builds PROD: prune old R2 assets ==="
OLD_KEYS=$(./scripts/with-cloudflare-env.sh npx wrangler r2 object list "${BUCKET}" \
  --prefix "${R2_PREFIX}/assets/" \
  --remote -c wrangler.production.toml 2>/dev/null \
  | grep '"key"' | sed 's/.*"key": "\(.*\)".*/\1/')
if [ -n "$OLD_KEYS" ]; then
  echo "$OLD_KEYS" | while IFS= read -r key; do
    [ -z "$key" ] && continue
    ./scripts/with-cloudflare-env.sh npx wrangler r2 object delete "${BUCKET}/${key}" \
      --remote -c wrangler.production.toml 2>/dev/null || true
  done
  echo "  Old assets pruned."
fi

echo "=== CF Builds PROD: R2 asset sync ==="
MAX_JOBS=8
job_count=0
get_content_type() {
  case "${1##*.}" in
    js)   echo "application/javascript" ;;
    css)  echo "text/css" ;;
    html) echo "text/html" ;;
    json) echo "application/json" ;;
    png)  echo "image/png" ;;
    svg)  echo "image/svg+xml" ;;
    woff2)echo "font/woff2" ;;
    *)    echo "application/octet-stream" ;;
  esac
}
if [ -d "$DIST_DIR" ]; then
  while IFS= read -r file; do
    [ -z "$file" ] && continue
    key="${R2_PREFIX}/$(basename "$file")"
    CT=$(get_content_type "$file")
    ./scripts/with-cloudflare-env.sh npx wrangler r2 object put "${BUCKET}/${key}" \
      --file "$file" \
      --content-type "$CT" \
      --remote \
      -c wrangler.production.toml &
    job_count=$((job_count + 1))
    if [ "$job_count" -ge "$MAX_JOBS" ]; then wait; job_count=0; fi
  done < <(find "$DIST_DIR" -type f ! -name '._*' ! -name '.DS_Store')
  wait
fi

if [ -f "$DIST_DIR/index.html" ]; then
  ./scripts/with-cloudflare-env.sh npx wrangler r2 object put "${BUCKET}/static/dashboard/agent.html" \
    --file "$DIST_DIR/index.html" \
    --content-type "text/html" \
    --remote \
    -c wrangler.production.toml
  echo "  agent.html uploaded to prod R2."
fi

echo "=== CF Builds PROD Deploy Complete ==="

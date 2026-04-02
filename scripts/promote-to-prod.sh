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
SANDBOX_BUCKET="agent-sam-sandbox-cicd"
PROD_BUCKET="agent-sam"
PROD_CFG="wrangler.production.toml"

DIST_DIR="agent-dashboard/dist"
HTML_PATH="dashboard/agent.html"
MANIFEST_NAME=".deploy-manifest"
MANIFEST_KEY="static/dashboard/agent/${MANIFEST_NAME}"

# ── Step 1: Pull current build from sandbox R2 into local dist ────────────────
if [ "$WORKER_ONLY" -eq 0 ]; then
  echo "Pulling latest build from sandbox R2 (${SANDBOX_BUCKET})..."
  mkdir -p agent-dashboard/dist dashboard

  MANIFEST_LOCAL="${DIST_DIR}/${MANIFEST_NAME}"
  if ./scripts/with-cloudflare-env.sh npx wrangler r2 object get "${SANDBOX_BUCKET}/${MANIFEST_KEY}" \
      --file "$MANIFEST_LOCAL" --remote -c "$PROD_CFG" 2>/dev/null; then
    echo "  Using ${MANIFEST_NAME} for multi-file pull (Vite chunks)."
    while IFS= read -r line || [ -n "$line" ]; do
      [ -z "$line" ] && continue
      echo "  Pulling static/dashboard/agent/${line}..."
      ./scripts/with-cloudflare-env.sh npx wrangler r2 object get "${SANDBOX_BUCKET}/static/dashboard/agent/${line}" \
        --file "${DIST_DIR}/${line}" --remote -c "$PROD_CFG"
    done < "$MANIFEST_LOCAL"
  else
    echo "  WARN: No ${MANIFEST_NAME} in sandbox; legacy pull (JS/CSS only)."
    ./scripts/with-cloudflare-env.sh npx wrangler r2 object get "${SANDBOX_BUCKET}/static/dashboard/agent/agent-dashboard.js" \
      --file "${DIST_DIR}/agent-dashboard.js" --remote -c "$PROD_CFG"

    ./scripts/with-cloudflare-env.sh npx wrangler r2 object get "${SANDBOX_BUCKET}/static/dashboard/agent/agent-dashboard.css" \
      --file "${DIST_DIR}/agent-dashboard.css" --remote -c "$PROD_CFG"
  fi

  ./scripts/with-cloudflare-env.sh npx wrangler r2 object get "${SANDBOX_BUCKET}/static/dashboard/agent.html" \
    --file "$HTML_PATH" --remote -c "$PROD_CFG"

  if [ ! -f "${DIST_DIR}/agent-dashboard.js" ]; then
    echo "ERROR: ${DIST_DIR}/agent-dashboard.js missing after sandbox pull. Re-run deploy-sandbox or build first."
    exit 1
  fi

  CURRENT_V=$(grep -o '?v=[0-9]*' "$HTML_PATH" | head -1 | grep -o '[0-9]*' || echo "0")
  echo "  Pulled v=${CURRENT_V} from sandbox."
  echo ""

  # ── Step 2: Push to production R2 ──────────────────────────────────────────
  echo "Promoting v=${CURRENT_V} to production bucket (${PROD_BUCKET})..."

  shopt -s nullglob
  for filepath in "${DIST_DIR}"/*; do
    [ -f "$filepath" ] || continue
    filename=$(basename "$filepath")
    case "$filename" in
      *.js)  ctype="application/javascript" ;;
      *.css) ctype="text/css" ;;
      *.map) ctype="application/json" ;;
      *)     ctype="application/octet-stream" ;;
    esac
    echo "  Uploading static/dashboard/agent/${filename}..."
    ./scripts/with-cloudflare-env.sh npx wrangler r2 object put "${PROD_BUCKET}/static/dashboard/agent/${filename}" \
      --file "$filepath" \
      --content-type "$ctype" \
      --config "$PROD_CFG" --remote
  done
  shopt -u nullglob

  ./scripts/with-cloudflare-env.sh npx wrangler r2 object put "${PROD_BUCKET}/static/dashboard/agent.html" \
    --file "$HTML_PATH" --content-type "text/html" \
    --config "$PROD_CFG" --remote

  echo "  R2 production uploads complete."

  # Log to dashboard_versions — one row per dist asset + HTML
  sql_escape() { printf '%s' "$1" | sed "s/'/''/g"; }
  page_name_for() {
    case "$1" in
      agent-dashboard.js)  printf '%s' 'agent' ;;
      agent-dashboard.css) printf '%s' 'agent-css' ;;
      *)                   printf '%s' "agent-dist-$1" ;;
    esac
  }

  D1_VALUES=""
  first=1
  shopt -s nullglob
  for filepath in "${DIST_DIR}"/*; do
    [ -f "$filepath" ] || continue
    filename=$(basename "$filepath")
    [ "$filename" = "$MANIFEST_NAME" ] && continue
    fh=$(md5 -q "$filepath" 2>/dev/null || md5sum "$filepath" | cut -d' ' -f1)
    fs=$(wc -c < "$filepath" | tr -d ' ')
    pn=$(page_name_for "$filename")
    pn_esc=$(sql_escape "$pn")
    row_id=$(printf 'prod-%s-v%s-%s' "$pn" "$CURRENT_V" "$DEPLOY_TS")
    id_esc=$(sql_escape "$row_id")
    r2_esc=$(sql_escape "static/dashboard/agent/${filename}")
    row="('${id_esc}', '${pn_esc}', 'v${CURRENT_V}', '${fh}', ${fs}, '${r2_esc}', 'Promoted from sandbox', 1, 1, unixepoch())"
    if [ "$first" -eq 1 ]; then
      D1_VALUES="$row"
      first=0
    else
      D1_VALUES="${D1_VALUES}, ${row}"
    fi
  done
  shopt -u nullglob

  HTML_HASH=$(md5 -q "$HTML_PATH" 2>/dev/null || md5sum "$HTML_PATH" | cut -d' ' -f1)
  HTML_SIZE=$(wc -c < "$HTML_PATH" | tr -d ' ')
  html_row="('prod-agent-html-v${CURRENT_V}-${DEPLOY_TS}', 'agent-html', 'v${CURRENT_V}', '${HTML_HASH}', ${HTML_SIZE}, 'static/dashboard/agent.html', 'Promoted from sandbox', 1, 1, unixepoch())"
  if [ -n "$D1_VALUES" ]; then
    D1_SQL="INSERT OR REPLACE INTO dashboard_versions (id, page_name, version, file_hash, file_size, r2_path, description, is_production, is_locked, created_at) VALUES ${D1_VALUES}, ${html_row}"
  else
    D1_SQL="INSERT OR REPLACE INTO dashboard_versions (id, page_name, version, file_hash, file_size, r2_path, description, is_production, is_locked, created_at) VALUES ${html_row}"
  fi

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

if [ -z "${CURRENT_V:-}" ] && [ -f "$HTML_PATH" ]; then
  CURRENT_V=$(grep -o '?v=[0-9]*' "$HTML_PATH" 2>/dev/null | head -1 | grep -o '[0-9]*' || echo "?")
fi
NEXT_VERSION="${NEXT_VERSION:-$CURRENT_V}"
DEPLOY_DESC="${DEPLOY_DESC:-prod promote $(date +%Y-%m-%d)}"
DEPLOY_DESC_ESC=$(printf '%s' "$DEPLOY_DESC" | sed "s/'/''/g")
./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
  --remote --config wrangler.production.toml \
  --command="UPDATE deployments SET version='v${NEXT_VERSION}', description='${DEPLOY_DESC_ESC}' WHERE id=(SELECT id FROM deployments ORDER BY created_at DESC LIMIT 1);" \
  2>/dev/null || echo "  WARN: deployments D1 version/description update failed (non-fatal)"
echo "[promote-to-prod] D1 deployment row updated"

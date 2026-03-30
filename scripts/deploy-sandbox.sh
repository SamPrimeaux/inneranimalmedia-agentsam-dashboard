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

  DIST_DIR="agent-dashboard/dist"
  HTML_PATH="dashboard/agent.html"
  MANIFEST_NAME=".deploy-manifest"
  MANIFEST_PATH="${DIST_DIR}/${MANIFEST_NAME}"

  # List dist assets (exclude manifest placeholder); then upload manifest last for promote-to-prod pulls
  shopt -s nullglob
  : > "$MANIFEST_PATH"
  for filepath in "$DIST_DIR"/*; do
    [[ -f "$filepath" ]] || continue
    filename=$(basename "$filepath")
    [[ "$filename" == "$MANIFEST_NAME" ]] && continue
    printf '%s\n' "$filename" >> "$MANIFEST_PATH"
  done
  shopt -u nullglob
  sort -o "$MANIFEST_PATH" "$MANIFEST_PATH"

  for filepath in "$DIST_DIR"/*; do
    [[ -f "$filepath" ]] || continue
    filename=$(basename "$filepath")
    case "$filename" in
      *.js)  ctype="application/javascript" ;;
      *.css) ctype="text/css" ;;
      *.map) ctype="application/json" ;;
      *)     ctype="application/octet-stream" ;;
    esac
    echo "  Uploading static/dashboard/agent/${filename}..."
    npx wrangler r2 object put "${SANDBOX_BUCKET}/static/dashboard/agent/${filename}" \
      --file "$filepath" \
      --content-type "$ctype" \
      --config "$CFG" --remote
  done

  npx wrangler r2 object put "${SANDBOX_BUCKET}/static/dashboard/agent.html" \
    --file "$HTML_PATH" --content-type "text/html" \
    --config "$CFG" --remote

  echo "  R2 uploads complete."

  # Log to dashboard_versions in D1 (is_production=0) — one row per dist asset + HTML
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
  for filepath in "$DIST_DIR"/*; do
    [[ -f "$filepath" ]] || continue
    filename=$(basename "$filepath")
    [[ "$filename" == "$MANIFEST_NAME" ]] && continue
    fh=$(md5 -q "$filepath" 2>/dev/null || md5sum "$filepath" | cut -d' ' -f1)
    fs=$(wc -c < "$filepath" | tr -d ' ')
    pn=$(page_name_for "$filename")
    pn_esc=$(sql_escape "$pn")
    row_id=$(printf 'sb-%s-v%s-%s' "$pn" "$CURRENT_V" "$DEPLOY_TS")
    id_esc=$(sql_escape "$row_id")
    r2_esc=$(sql_escape "static/dashboard/agent/${filename}")
    row="('${id_esc}', '${pn_esc}', 'v${CURRENT_V}', '${fh}', ${fs}, '${r2_esc}', 'Sandbox deploy', 0, 0, unixepoch())"
    if [[ "$first" -eq 1 ]]; then
      D1_VALUES="$row"
      first=0
    else
      D1_VALUES="${D1_VALUES}, ${row}"
    fi
  done

  HTML_HASH=$(md5 -q "$HTML_PATH" 2>/dev/null || md5sum "$HTML_PATH" | cut -d' ' -f1)
  HTML_SIZE=$(wc -c < "$HTML_PATH" | tr -d ' ')
  html_row="('sb-agent-html-v${CURRENT_V}-${DEPLOY_TS}', 'agent-html', 'v${CURRENT_V}', '${HTML_HASH}', ${HTML_SIZE}, 'static/dashboard/agent.html', 'Sandbox deploy', 0, 0, unixepoch())"
  if [[ -n "$D1_VALUES" ]]; then
    D1_SQL="INSERT OR REPLACE INTO dashboard_versions (id, page_name, version, file_hash, file_size, r2_path, description, is_production, is_locked, created_at) VALUES ${D1_VALUES}, ${html_row}"
  else
    D1_SQL="INSERT OR REPLACE INTO dashboard_versions (id, page_name, version, file_hash, file_size, r2_path, description, is_production, is_locked, created_at) VALUES ${html_row}"
  fi

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

if [ -z "${CURRENT_V:-}" ]; then
  CURRENT_V=$(grep -o '?v=[0-9]*' dashboard/agent.html 2>/dev/null | head -1 | grep -o '[0-9]*' || echo "?")
fi
NEXT_VERSION="${NEXT_VERSION:-$CURRENT_V}"
DEPLOY_DESC="${DEPLOY_DESC:-sandbox deploy $(date +%Y-%m-%d)}"
DEPLOY_DESC_ESC=$(printf '%s' "$DEPLOY_DESC" | sed "s/'/''/g")
./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
  --remote --config wrangler.production.toml \
  --command="UPDATE deployments SET version='v${NEXT_VERSION}', description='${DEPLOY_DESC_ESC}' WHERE id=(SELECT id FROM deployments ORDER BY created_at DESC LIMIT 1);" \
  2>/dev/null || echo "  WARN: deployments D1 version/description update failed (non-fatal)"
echo "[deploy-sandbox] D1 deployment row updated"

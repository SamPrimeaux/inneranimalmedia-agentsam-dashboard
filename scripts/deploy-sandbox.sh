#!/usr/bin/env bash
# deploy-sandbox.sh — build + upload to sandbox R2 + deploy inneranimal-dashboard
# Canonical Agent Dashboard UI: agent-dashboard/ (Vite dist/, including assets/* chunks).
# Legacy bundle (reference): agent-dashboard-legacy/
# Sandbox bucket: agent-sam-sandbox-cicd (replaces deprecated agent-sam-sandbox-cidi).
# Override: SANDBOX_BUCKET=my-bucket ./scripts/deploy-sandbox.sh
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
SANDBOX_BUCKET="${SANDBOX_BUCKET:-agent-sam-sandbox-cicd}"
WRANGLER=(./scripts/with-cloudflare-env.sh npx wrangler)

DEPLOY_TS="$(date -u +%Y%m%d%H%M%S)"
# Submodule meauxcad uses npm workspaces; SPA output is agent-dashboard/agent-dashboard/dist (not submodule root dist/).
DIST_DIR="${REPO_ROOT}/agent-dashboard/agent-dashboard/dist"
MANIFEST_NAME=".deploy-manifest"
MANIFEST_PATH="${DIST_DIR}/${MANIFEST_NAME}"
VER_FILE="${REPO_ROOT}/agent-dashboard/.sandbox-deploy-version"
R2_AGENT_PREFIX="static/dashboard/agent"

echo "=== SANDBOX DEPLOY ==="

# ── Build ────────────────────────────────────────────────────────────────────
if [ "$SKIP_BUILD" -eq 0 ] && [ "$WORKER_ONLY" -eq 0 ]; then
  echo "Building agent-dashboard workspace (npm ci includes devDependencies so Vite is available even if NODE_ENV=production)..."
  (
    cd "${REPO_ROOT}/agent-dashboard"
    npm ci --include=dev
    npm run build:vite-only
  )
  echo "Build complete."
fi

# ── R2 upload to sandbox ─────────────────────────────────────────────────────
if [ "$WORKER_ONLY" -eq 0 ]; then
  echo "Uploading assets to ${SANDBOX_BUCKET}..."

  if [ ! -f "${DIST_DIR}/index.html" ]; then
    echo "ERROR: ${DIST_DIR}/index.html missing. Run build first or omit --skip-build."
    exit 1
  fi

  # Monotonic deploy version (embedded in HTML comment for curl | grep checks)
  CURRENT_V=$(cat "$VER_FILE" 2>/dev/null || echo "0")
  NEXT_V=$((CURRENT_V + 1))
  echo "$NEXT_V" > "$VER_FILE"
  perl -0777 -i -pe "s/<!--\s*dashboard-v:\\d+\\s*-->//g" "${DIST_DIR}/index.html"
  perl -i -pe "s|</html>|<!-- dashboard-v:${NEXT_V} --></html>|" "${DIST_DIR}/index.html"
  CURRENT_V=$NEXT_V

  # Manifest: all files under dist/ except the manifest itself (paths use /)
  : > "$MANIFEST_PATH"
  (
    cd "$DIST_DIR"
    find . -type f ! -name "$MANIFEST_NAME" -print | sed 's|^\./||' | sort
  ) > "$MANIFEST_PATH"

  ctype_for() {
    case "$1" in
      *.js)  echo "application/javascript" ;;
      *.css) echo "text/css" ;;
      *.map) echo "application/json" ;;
      *.html) echo "text/html" ;;
      *.svg) echo "image/svg+xml" ;;
      *.woff2) echo "font/woff2" ;;
      *.woff) echo "font/woff" ;;
      *.ttf) echo "font/ttf" ;;
      *.json) echo "application/json" ;;
      *) echo "application/octet-stream" ;;
    esac
  }

  while IFS= read -r rel || [ -n "$rel" ]; do
    [ -z "$rel" ] && continue
    filepath="${DIST_DIR}/${rel}"
    [ -f "$filepath" ] || continue
    ct=$(ctype_for "$rel")
    echo "  Uploading ${R2_AGENT_PREFIX}/${rel}..."
    "${WRANGLER[@]}" r2 object put "${SANDBOX_BUCKET}/${R2_AGENT_PREFIX}/${rel}" \
      --file "$filepath" --content-type "$ct" \
      --config "$CFG" --remote
  done < "$MANIFEST_PATH"

  echo "  Uploading ${R2_AGENT_PREFIX}/${MANIFEST_NAME}..."
  "${WRANGLER[@]}" r2 object put "${SANDBOX_BUCKET}/${R2_AGENT_PREFIX}/${MANIFEST_NAME}" \
    --file "$MANIFEST_PATH" \
    --content-type "text/plain" \
    --config "$CFG" --remote

  echo "  Uploading static/dashboard/agent.html (from dist/index.html)..."
  "${WRANGLER[@]}" r2 object put "${SANDBOX_BUCKET}/static/dashboard/agent.html" \
    --file "${DIST_DIR}/index.html" --content-type "text/html" \
    --config "$CFG" --remote

  # Workspace shell — same keys worker serves for /dashboard/iam-workspace-shell + /static/dashboard/shell.css
  echo "  Uploading static/dashboard/iam-workspace-shell.html..."
  "${WRANGLER[@]}" r2 object put "${SANDBOX_BUCKET}/static/dashboard/iam-workspace-shell.html" \
    --file "${REPO_ROOT}/dashboard/iam-workspace-shell.html" --content-type "text/html" \
    --config "$CFG" --remote
  echo "  Uploading static/dashboard/shell.css..."
  "${WRANGLER[@]}" r2 object put "${SANDBOX_BUCKET}/static/dashboard/shell.css" \
    --file "${REPO_ROOT}/static/dashboard/shell.css" --content-type "text/css" \
    --config "$CFG" --remote

  echo "  R2 uploads complete."

  # Log to dashboard_versions in D1 (is_production=0) — one row per dist file + HTML shell
  sql_escape() { printf '%s' "$1" | sed "s/'/''/g"; }
  page_name_for() {
    local f="$1"
    case "$f" in
      agent-dashboard.js)  printf '%s' 'agent' ;;
      agent-dashboard.css) printf '%s' 'agent-css' ;;
      index.html) printf '%s' 'agent-html' ;;
      *) printf '%s' "agent-dist-$(printf '%s' "$f" | tr '/' '-')" ;;
    esac
  }

  HTML_PATH="${DIST_DIR}/index.html"
  D1_VALUES=""
  first=1
  while IFS= read -r rel || [ -n "$rel" ]; do
    [ -z "$rel" ] && continue
    filepath="${DIST_DIR}/${rel}"
    [ -f "$filepath" ] || continue
    [[ "$rel" == "$MANIFEST_NAME" ]] && continue
    [[ "$rel" == "index.html" ]] && continue
    fh=$(md5 -q "$filepath" 2>/dev/null || md5sum "$filepath" | cut -d' ' -f1)
    fs=$(wc -c < "$filepath" | tr -d ' ')
    pn=$(page_name_for "$rel")
    pn_esc=$(sql_escape "$pn")
    row_id=$(printf 'sb-%s-v%s-%s' "$pn" "$CURRENT_V" "$DEPLOY_TS")
    id_esc=$(sql_escape "$row_id")
    r2_esc=$(sql_escape "${R2_AGENT_PREFIX}/${rel}")
    row="('${id_esc}', '${pn_esc}', 'v${CURRENT_V}', '${fh}', ${fs}, '${r2_esc}', 'Sandbox deploy', 0, 0, unixepoch())"
    if [[ "$first" -eq 1 ]]; then
      D1_VALUES="$row"
      first=0
    else
      D1_VALUES="${D1_VALUES}, ${row}"
    fi
  done <<EOF
$( (cd "$DIST_DIR" && find . -type f ! -name "$MANIFEST_NAME" -print | sed 's|^\./||' | sort) )
EOF

  HTML_HASH=$(md5 -q "$HTML_PATH" 2>/dev/null || md5sum "$HTML_PATH" | cut -d' ' -f1)
  HTML_SIZE=$(wc -c < "$HTML_PATH" | tr -d ' ')
  html_row="('sb-agent-html-v${CURRENT_V}-${DEPLOY_TS}', 'agent-html', 'v${CURRENT_V}', '${HTML_HASH}', ${HTML_SIZE}, 'static/dashboard/agent.html', 'Sandbox deploy', 0, 0, unixepoch())"
  if [[ -n "$D1_VALUES" ]]; then
    D1_SQL="INSERT OR REPLACE INTO dashboard_versions (id, page_name, version, file_hash, file_size, r2_path, description, is_production, is_locked, created_at) VALUES ${D1_VALUES}, ${html_row}"
  else
    D1_SQL="INSERT OR REPLACE INTO dashboard_versions (id, page_name, version, file_hash, file_size, r2_path, description, is_production, is_locked, created_at) VALUES ${html_row}"
  fi

  "${WRANGLER[@]}" d1 execute inneranimalmedia-business \
    --remote -c wrangler.production.toml \
    --command="$D1_SQL" 2>/dev/null || echo "  WARN: dashboard_versions D1 log failed (non-fatal)"
fi

# ── Deploy sandbox worker ─────────────────────────────────────────────────────
echo "Deploying sandbox worker (inneranimal-dashboard)..."
SANDBOX_VERSION=$("${WRANGLER[@]}" deploy ./worker.js -c "$CFG" 2>&1 | tee /tmp/sandbox-deploy-out.txt | grep "Current Version ID:" | grep -o '[a-f0-9-]\{36\}' || echo "unknown")
cat /tmp/sandbox-deploy-out.txt

# Record in deployments D1
NOTES="${DEPLOYMENT_NOTES:-Sandbox deploy via deploy-sandbox.sh}"
"${WRANGLER[@]}" d1 execute inneranimalmedia-business \
  --remote -c wrangler.production.toml \
  --command="INSERT OR IGNORE INTO deployments (id, timestamp, status, deployed_by, environment, worker_name, triggered_by, notes, created_at) VALUES ('${SANDBOX_VERSION}', datetime('now'), 'success', 'sam_primeaux', 'sandbox', 'inneranimal-dashboard', 'sandbox_auto', '${NOTES}', datetime('now'))" \
  2>/dev/null || echo "  WARN: deployments D1 record failed (non-fatal)"

echo ""
echo "=== SANDBOX DEPLOY COMPLETE ==="
echo "  Worker:  inneranimal-dashboard @ ${SANDBOX_VERSION}"
echo "  URL:     https://inneranimal-dashboard.meauxbility.workers.dev/dashboard/agent"
echo "  Bucket:  ${SANDBOX_BUCKET}"
echo "  Version: v=${CURRENT_V:-n/a} (see <!-- dashboard-v --> in agent.html)"
echo ""
echo "Review at sandbox, then run: ./scripts/promote-to-prod.sh"

if [ -z "${CURRENT_V:-}" ]; then
  CURRENT_V=$(cat "$VER_FILE" 2>/dev/null || echo "?")
fi
NEXT_VERSION="${NEXT_VERSION:-$CURRENT_V}"
DEPLOY_DESC="${DEPLOY_DESC:-sandbox deploy $(date +%Y-%m-%d)}"
DEPLOY_DESC_ESC=$(printf '%s' "$DEPLOY_DESC" | sed "s/'/''/g")
"${WRANGLER[@]}" d1 execute inneranimalmedia-business \
  --remote --config wrangler.production.toml \
  --command="UPDATE deployments SET version='v${NEXT_VERSION}', description='${DEPLOY_DESC_ESC}' WHERE id=(SELECT id FROM deployments ORDER BY created_at DESC LIMIT 1);" \
  2>/dev/null || echo "  WARN: deployments D1 version/description update failed (non-fatal)"
echo "[deploy-sandbox] D1 deployment row updated"

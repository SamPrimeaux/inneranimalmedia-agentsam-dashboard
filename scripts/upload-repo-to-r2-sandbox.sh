#!/usr/bin/env bash
# Upload Overview (and optional Agent) Vite builds + key HTML to the CIDI sandbox R2 bucket.
# Default bucket: agent-sam-sandbox-cidi (worker inneranimal-dashboard / wrangler.jsonc).
#
# Prerequisites:
#   - Repo root; ./scripts/with-cloudflare-env.sh + .env.cloudflare (CLOUDFLARE_*).
#   - overview-dashboard: cd overview-dashboard && npm install && npm run build
#   - agent-dashboard (optional): cd agent-dashboard && npm install && npm run build
#
# Usage: ./scripts/upload-repo-to-r2-sandbox.sh
# Env: SANDBOX_R2_BUCKET (default agent-sam-sandbox-cidi), R2_CONFIG (default wrangler.production.toml)

set -euo pipefail
shopt -s nullglob
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

CONFIG="${R2_CONFIG:-wrangler.production.toml}"
BUCKET="${SANDBOX_R2_BUCKET:-agent-sam-sandbox-cidi}"

r2_put() {
  local key="$1"
  local file="$2"
  local ct="$3"
  ./scripts/with-cloudflare-env.sh npx wrangler r2 object put "${BUCKET}/${key}" --file="$file" --content-type="$ct" --remote -c "$CONFIG"
}

content_type_for() {
  local base="$1"
  case "$base" in
    *.js)   echo "application/javascript; charset=utf-8" ;;
    *.mjs)  echo "application/javascript; charset=utf-8" ;;
    *.css)  echo "text/css; charset=utf-8" ;;
    *.html) echo "text/html; charset=utf-8" ;;
    *.json) echo "application/json; charset=utf-8" ;;
    *.map)  echo "application/json; charset=utf-8" ;;
    *.svg)  echo "image/svg+xml" ;;
    *.woff2) echo "font/woff2" ;;
    *.woff) echo "font/woff" ;;
    *.ttf)  echo "font/ttf" ;;
    *.png)  echo "image/png" ;;
    *.jpg|*.jpeg) echo "image/jpeg" ;;
    *.ico)  echo "image/x-icon" ;;
    *)      echo "application/octet-stream" ;;
  esac
}

upload_dir_flat() {
  local src_dir="$1"
  local r2_prefix="$2"
  local label="$3"
  if [[ ! -d "$src_dir" ]]; then
    echo "WARN: skip ${label}: missing directory ${src_dir}"
    return 0
  fi
  local found=0
  for f in "$src_dir"/*; do
    [[ -f "$f" ]] || continue
    found=1
    base=$(basename "$f")
    ct=$(content_type_for "$base")
    echo "  -> ${r2_prefix}${base} (${ct%%;*})"
    r2_put "${r2_prefix}${base}" "$f" "$ct"
  done
  if [[ "$found" -eq 0 ]]; then
    echo "WARN: ${label}: no files in ${src_dir}"
  fi
}

echo "Sandbox R2 upload -> ${BUCKET} (config ${CONFIG})"
echo ""

if [[ -f dashboard/overview.html ]]; then
  echo "Overview HTML -> static/dashboard/overview.html"
  r2_put static/dashboard/overview.html dashboard/overview.html "text/html; charset=utf-8"
  echo ""
else
  echo "WARN: dashboard/overview.html not found"
  echo ""
fi

OVERVIEW_DIST="overview-dashboard/dist"
if [[ -d "$OVERVIEW_DIST" ]]; then
  echo "Overview Vite bundle -> static/dashboard/overview/"
  upload_dir_flat "$OVERVIEW_DIST" "static/dashboard/overview/" "Overview dist"
  echo ""
else
  echo "WARN: ${OVERVIEW_DIST} missing. Run: cd overview-dashboard && npm install && npm run build"
  echo ""
fi

if [[ -d agent-dashboard/dist ]]; then
  echo "Agent Vite bundle -> static/dashboard/agent/"
  upload_dir_flat "agent-dashboard/dist" "static/dashboard/agent/" "Agent dist"
  echo ""
fi

if [[ -f dashboard/agent.html ]]; then
  echo "Agent HTML -> static/dashboard/agent.html"
  r2_put static/dashboard/agent.html dashboard/agent.html "text/html; charset=utf-8"
  echo ""
fi

echo "Done. Hard-refresh /dashboard/overview (and /dashboard/agent if updated) on the sandbox host."

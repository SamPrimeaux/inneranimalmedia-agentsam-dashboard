#!/usr/bin/env bash
# Upload dashboard MPA + agent bundle + overview Vite output + optional trees to R2 sandbox bucket.
# Keys mirror production agent-sam layout (static/dashboard/...) so URLs stay predictable.
#
# Usage:
#   ./scripts/upload-repo-to-r2-sandbox.sh
# Env:
#   SANDBOX_BUCKET=agent-sam-sandbox-cidi   (default; alias SANDBOX_R2_BUCKET)
#   R2_CONFIG=wrangler.production.toml     (default; account/token via with-cloudflare-env.sh)
#
set -euo pipefail
shopt -s nullglob
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"
BUCKET="${SANDBOX_R2_BUCKET:-${SANDBOX_BUCKET:-agent-sam-sandbox-cidi}}"
CONFIG="${R2_CONFIG:-wrangler.production.toml}"
WRAP=(./scripts/with-cloudflare-env.sh npx wrangler r2 object put)

content_type() {
  case "${1##*.}" in
    html|htm) echo "text/html; charset=utf-8" ;;
    js|mjs|cjs) echo "application/javascript; charset=utf-8" ;;
    jsx) echo "application/javascript; charset=utf-8" ;;
    css) echo "text/css; charset=utf-8" ;;
    json) echo "application/json; charset=utf-8" ;;
    map) echo "application/json; charset=utf-8" ;;
    svg) echo "image/svg+xml" ;;
    png) echo "image/png" ;;
    jpg|jpeg) echo "image/jpeg" ;;
    woff2) echo "font/woff2" ;;
    woff) echo "font/woff" ;;
    ttf) echo "font/ttf" ;;
    ico) echo "image/x-icon" ;;
    txt|md) echo "text/plain; charset=utf-8" ;;
    *) echo "application/octet-stream" ;;
  esac
}

put_file() {
  local file="$1" key="$2"
  if [[ ! -f "$file" ]]; then
    echo "SKIP missing: $file" >&2
    return 0
  fi
  local ct
  ct="$(content_type "$file")"
  echo "PUT s3://$BUCKET/$key <= $file"
  "${WRAP[@]}" "${BUCKET}/${key}" --file="$file" --content-type="$ct" --remote -c "$CONFIG"
}

echo "=== Sandbox bucket: $BUCKET (config: $CONFIG) — production-parity keys under static/) ==="

# --- 0) Manifest (plain text for easy read in dashboard)
MANIFEST="$(mktemp)"
{
  echo "agent-sam-sandbox-cidi — mirror of production R2 key layout (agent-sam)"
  echo "Same paths as prod: /dashboard/<page> -> static/dashboard/<page>.html"
  echo "Agent app: static/dashboard/agent.html + static/dashboard/agent/agent-dashboard.{js,css}"
  echo "Generated: $(date -u +%Y-%m-%dT%H:%MZ)"
  echo "Repo: inneranimalmedia-agentsam-dashboard"
} >"$MANIFEST"
put_file "$MANIFEST" "_sandbox/MANIFEST.txt"
rm -f "$MANIFEST"

# --- 1) Legacy / build tree under agent-sam/static (page fragments, shell-v2, etc.)
if [[ -d agent-sam/static ]]; then
  while IFS= read -r -d '' file; do
    rel="${file#agent-sam/}"
    put_file "$file" "$rel"
  done < <(find agent-sam/static -type f ! -name '.DS_Store' -print0 2>/dev/null)
fi

# --- 2) Repo static/dashboard (mcp-workflows-panel.js, draw, glb-viewer, etc.)
if [[ -d static/dashboard ]]; then
  while IFS= read -r -d '' file; do
    put_file "$file" "$file"
  done < <(find static/dashboard -type f ! -name '.DS_Store' -print0 2>/dev/null)
fi

# --- 3) Dashboard HTML shells (MPA)
if [[ -d dashboard ]]; then
  for file in dashboard/*.html; do
    [[ -f "$file" ]] || continue
    [[ "$(basename "$file")" == "auth-signin.html" ]] && continue
    put_file "$file" "static/dashboard/$(basename "$file")"
  done
  if [[ -d dashboard/pages ]]; then
    for file in dashboard/pages/*.html; do
      [[ -f "$file" ]] || continue
      put_file "$file" "static/dashboard/pages/$(basename "$file")"
    done
  fi
  for file in dashboard/*.jsx; do
    [[ -f "$file" ]] || continue
    put_file "$file" "static/dashboard/$(basename "$file")"
  done
fi

# --- 4) Auth route (prod uses static/auth-signin.html)
put_file "dashboard/auth-signin.html" "static/auth-signin.html"

# --- 4b) Overview page Vite output (overview.html loads /static/dashboard/overview/overview-dashboard.js + chunks)
if [[ -d overview-dashboard/dist ]]; then
  while IFS= read -r -d '' file; do
    put_file "$file" "static/dashboard/overview/$(basename "$file")"
  done < <(find overview-dashboard/dist -type f ! -name '.DS_Store' -print0 2>/dev/null)
else
  echo "WARN: overview-dashboard/dist missing — run: cd overview-dashboard && npm install && npm run build" >&2
fi

# --- 5) Agent Vite bundle (must match live /dashboard/agent)
if [[ -f agent-dashboard/dist/agent-dashboard.js ]]; then
  put_file "agent-dashboard/dist/agent-dashboard.js" "static/dashboard/agent/agent-dashboard.js"
else
  echo "WARN: agent-dashboard/dist/agent-dashboard.js missing — run: cd agent-dashboard && npm run build" >&2
fi
if [[ -f agent-dashboard/dist/agent-dashboard.css ]]; then
  put_file "agent-dashboard/dist/agent-dashboard.css" "static/dashboard/agent/agent-dashboard.css"
fi

# --- 6) Worker snapshot (reference only; not served from R2 in prod)
if [[ -f worker.js ]]; then
  put_file "worker.js" "source/worker.js"
fi

echo "=== Done. Keys: static/dashboard/agent.html, static/dashboard/agent/agent-dashboard.{js,css}, static/dashboard/overview/*, static/auth-signin.html ==="

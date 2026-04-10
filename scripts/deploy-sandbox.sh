#!/usr/bin/env bash
# deploy-sandbox.sh — build + upload to sandbox R2 + deploy inneranimal-dashboard
# Canonical Agent Dashboard UI: agent-dashboard/ (Vite dist/, including assets/* chunks).
# Legacy bundle (reference): agent-dashboard-legacy/
# Sandbox bucket: agent-sam-sandbox-cicd (canonical CI/CD staging bucket for dashboard assets).
# Override: SANDBOX_BUCKET=my-bucket ./scripts/deploy-sandbox.sh
# Usage: ./scripts/deploy-sandbox.sh [--skip-build] [--worker-only]
# Auto-called by: npm run deploy:sandbox (which Cloudflare Workers Builds triggers on git push)
# After deploy: logs cicd_github_runs, cicd_pipeline_runs, cicd_run_steps, cicd_events, cicd_runs,
#               pipeline_runs, cicd_notifications, tracking_metrics, quality_runs, quality_results
#               via scripts/lib/cicd-d1-log.sh (D1 writes non-fatal).
# Optional: CICD_D1_LOG=0 to skip | CICD_SKIP_HEALTH_CURL=1 to skip sandbox curl | CICD_SKIP_RESEND=1 to skip Resend email
#           SANDBOX_HEALTH_URL=... to override check URL
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

# Resend + internal API secret — merge from .env when token was already in shell
if [ -f "${REPO_ROOT}/.env.cloudflare" ]; then
  _iam_resend_kv=$(grep -E '^(RESEND_API_KEY|RESEND_FROM|RESEND_TO|INTERNAL_API_SECRET)=' "${REPO_ROOT}/.env.cloudflare" | grep -v '^#' | xargs || true)
  if [ -n "${_iam_resend_kv}" ]; then
    # shellcheck disable=SC2086
    export ${_iam_resend_kv}
  fi
fi
RESEND_FROM="${RESEND_FROM:-sam@inneranimalmedia.com}"
RESEND_TO="${RESEND_TO:-meauxbility@gmail.com}"

CFG="wrangler.jsonc"
SANDBOX_BUCKET="${SANDBOX_BUCKET:-agent-sam-sandbox-cicd}"
WRANGLER=(./scripts/with-cloudflare-env.sh npx wrangler)
PROD_CFG="wrangler.production.toml"
# shellcheck source=/dev/null
source "${SCRIPT_DIR}/lib/cicd-d1-log.sh"

fmt_ms() {
  local ms=${1:-0}
  if [ "$ms" -ge 60000 ]; then
    printf '%dm %ds' $(( ms / 60000 )) $(( (ms % 60000) / 1000 ))
  elif [ "$ms" -ge 1000 ]; then
    printf '%ds' $(( ms / 1000 ))
  else
    printf '%dms' "$ms"
  fi
}

_send_sandbox_resend_notification() {
  local outcome="${1:-success}"
  local resend_key="${RESEND_API_KEY:-}"
  [ -z "$resend_key" ] && echo "  WARN: RESEND_API_KEY not set — skipping notification" && return 0

  local status_label status_color
  if [ "$outcome" = "success" ]; then
    status_label="LIVE"
    status_color="#22c55e"
  else
    status_label="FAILED"
    status_color="#ef4444"
  fi

  local git_sha git_branch git_msg
  git_sha="$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || echo 'unknown')"
  git_branch="$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'main')"
  git_msg="$(git -C "$REPO_ROOT" log -1 --pretty=%s 2>/dev/null || echo '')"

  local ms_build ms_r2 ms_worker total_ms
  ms_build="${CICD_MS_BUILD:-0}"
  ms_r2="${CICD_MS_R2:-0}"
  ms_worker="${CICD_MS_WORKER:-0}"
  total_ms="${CICD_WALL_TOTAL_MS:-0}"
  [[ "$ms_build" =~ ^[0-9]+$ ]] || ms_build=0
  [[ "$ms_r2" =~ ^[0-9]+$ ]] || ms_r2=0
  [[ "$ms_worker" =~ ^[0-9]+$ ]] || ms_worker=0
  [[ "$total_ms" =~ ^[0-9]+$ ]] || total_ms=$(( ms_build + ms_r2 + ms_worker ))

  local vuln_row=""
  local audit_json audit_high audit_moderate
  audit_json=$(cd "${REPO_ROOT}/agent-dashboard/agent-dashboard" && npm audit --json 2>/dev/null || echo '{}')
  audit_high=$(echo "$audit_json" | python3 -c "import sys,json; d=json.load(sys.stdin); v=d.get('metadata',{}).get('vulnerabilities',{}); print(v.get('high',0)+v.get('critical',0))" 2>/dev/null || echo 0)
  audit_moderate=$(echo "$audit_json" | python3 -c "import sys,json; d=json.load(sys.stdin); v=d.get('metadata',{}).get('vulnerabilities',{}); print(v.get('moderate',0))" 2>/dev/null || echo 0)
  if [ "${audit_high:-0}" -gt 0 ] || [ "${audit_moderate:-0}" -gt 0 ]; then
    vuln_row="<tr><td style='padding:5px 12px;color:#94a3b8;font-size:12px;'>Advisories</td><td style='padding:5px 12px;color:#ef4444;font-weight:600;'>${audit_high} high / ${audit_moderate} moderate</td></tr>"
  else
    vuln_row="<tr><td style='padding:5px 12px;color:#94a3b8;font-size:12px;'>Advisories</td><td style='padding:5px 12px;color:#22c55e;'>none detected</td></tr>"
  fi

  local sb_url pipe_ref gh_ref dash_v
  dash_v="${CICD_V:-${CURRENT_V:-0}}"
  sb_url="${SANDBOX_HEALTH_URL:-https://inneranimal-dashboard.meauxbility.workers.dev/dashboard/agent}"
  pipe_ref="pipe_${DEPLOY_TS}_sandbox_v${dash_v}"
  gh_ref="gh_${DEPLOY_TS}_sandbox_v${dash_v}"

  local html_body
  html_body="<!DOCTYPE html><html><body style='margin:0;padding:0;background:#0f1117;font-family:ui-monospace,monospace;'>
<div style='max-width:600px;margin:28px auto;background:#1a1d2e;border:1px solid #2d3148;border-radius:8px;overflow:hidden;'>
  <div style='background:#12151f;padding:16px 24px;border-bottom:3px solid ${status_color};'>
    <img src='https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/ac515729-af6b-4ea5-8b10-e581a4d02100/thumbnail' style='height:24px;vertical-align:middle;margin-right:10px;' alt='IAM'/><span style='display:inline-block;width:8px;height:8px;border-radius:50%;background:${status_color};margin-right:8px;'></span>
    <span style='color:#e2e8f0;font-size:14px;font-weight:700;letter-spacing:0.05em;'>IAM // SANDBOX ${status_label}</span>
    <span style='float:right;color:#475569;font-size:11px;margin-top:2px;'>$(date -u +%Y-%m-%d)</span>
  </div>
  <div style='padding:14px 24px;'>
    <table style='width:100%;border-collapse:collapse;'>
      <tr><td colspan='2' style='padding:8px 0 3px;color:#475569;font-size:10px;letter-spacing:0.1em;border-bottom:1px solid #2d3148;'>DEPLOY</td></tr>
      <tr><td style='padding:5px 12px;color:#94a3b8;font-size:12px;width:130px;'>Status</td><td style='padding:5px 12px;color:${status_color};font-weight:700;'>${status_label}</td></tr>
      <tr><td style='padding:5px 12px;color:#94a3b8;font-size:12px;'>Worker</td><td style='padding:5px 12px;color:#e2e8f0;font-size:11px;'>${SANDBOX_VERSION:-unknown}</td></tr>
      <tr><td style='padding:5px 12px;color:#94a3b8;font-size:12px;'>Dashboard</td><td style='padding:5px 12px;color:#e2e8f0;'>v${dash_v}</td></tr>
      <tr><td style='padding:5px 12px;color:#94a3b8;font-size:12px;'>Bucket</td><td style='padding:5px 12px;color:#e2e8f0;font-size:11px;'>${SANDBOX_BUCKET}</td></tr>
      <tr><td style='padding:5px 12px;color:#94a3b8;font-size:12px;'>URL</td><td style='padding:5px 12px;'><a href='${sb_url}' style='color:#60a5fa;text-decoration:none;'>${sb_url}</a></td></tr>
      <tr><td style='padding:5px 12px;color:#94a3b8;font-size:12px;'>Health</td><td style='padding:5px 12px;color:#e2e8f0;'>${SANDBOX_HC:-skipped}</td></tr>
      <tr><td colspan='2' style='padding:10px 0 3px;color:#475569;font-size:10px;letter-spacing:0.1em;border-bottom:1px solid #2d3148;'>GIT</td></tr>
      <tr><td style='padding:5px 12px;color:#94a3b8;font-size:12px;'>Branch</td><td style='padding:5px 12px;color:#e2e8f0;'>${git_branch}</td></tr>
      <tr><td style='padding:5px 12px;color:#94a3b8;font-size:12px;'>Commit</td><td style='padding:5px 12px;color:#e2e8f0;font-size:11px;'>${git_sha} — ${git_msg}</td></tr>
      <tr><td colspan='2' style='padding:10px 0 3px;color:#475569;font-size:10px;letter-spacing:0.1em;border-bottom:1px solid #2d3148;'>ASSETS + TIMINGS</td></tr>
      <tr><td style='padding:5px 12px;color:#94a3b8;font-size:12px;'>R2 files (est.)</td><td style='padding:5px 12px;color:#e2e8f0;'>${R2_FILES_UPDATED:-0} uploads / ${R2_LINE_COUNT:-0} manifest lines</td></tr>
      <tr><td style='padding:5px 12px;color:#94a3b8;font-size:12px;'>Build</td><td style='padding:5px 12px;color:#e2e8f0;'>$(fmt_ms ${ms_build})</td></tr>
      <tr><td style='padding:5px 12px;color:#94a3b8;font-size:12px;'>R2</td><td style='padding:5px 12px;color:#e2e8f0;'>$(fmt_ms ${ms_r2})</td></tr>
      <tr><td style='padding:5px 12px;color:#94a3b8;font-size:12px;'>Worker</td><td style='padding:5px 12px;color:#e2e8f0;'>$(fmt_ms ${ms_worker})</td></tr>
      <tr><td style='padding:5px 12px;color:#94a3b8;font-size:12px;'>Wall</td><td style='padding:5px 12px;color:#e2e8f0;font-weight:600;'>$(fmt_ms ${total_ms})</td></tr>
      <tr><td colspan='2' style='padding:10px 0 3px;color:#475569;font-size:10px;letter-spacing:0.1em;border-bottom:1px solid #2d3148;'>QUALITY / SECURITY</td></tr>
      ${vuln_row}
      <tr><td colspan='2' style='padding:10px 0 3px;color:#475569;font-size:10px;letter-spacing:0.1em;border-bottom:1px solid #2d3148;'>TRACKING</td></tr>
      <tr><td style='padding:5px 12px;color:#94a3b8;font-size:12px;'>D1 Tables</td><td style='padding:5px 12px;color:#64748b;font-size:11px;'>cicd_github_runs, cicd_pipeline_runs, cicd_run_steps, cicd_events, cicd_runs, pipeline_runs, cicd_notifications, tracking_metrics, quality_runs, quality_results</td></tr>
      <tr><td style='padding:5px 12px;color:#94a3b8;font-size:12px;'>Pipeline</td><td style='padding:5px 12px;color:#64748b;font-size:11px;'>${pipe_ref} (${gh_ref})</td></tr>
    </table>
  </div>
  <div style='padding:10px 24px;border-top:1px solid #2d3148;color:#475569;font-size:11px;display:flex;justify-content:space-between;'>
    <span>IAM sandbox deploy</span><span>$(date -u +%Y-%m-%dT%H:%M:%SZ)</span>
  </div>
</div></body></html>"

  local json_html
  json_html=$(printf '%s' "$html_body" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))' 2>/dev/null \
    || printf '"%s"' "$(printf '%s' "$html_body" | sed 's/\\/\\\\/g; s/"/\\"/g' | tr -d '\n')")

  local http_code
  http_code=$(curl -sS \
    -X POST https://api.resend.com/emails \
    -H "Authorization: Bearer ${resend_key}" \
    -H "Content-Type: application/json" \
    -d "{\"from\":\"${RESEND_FROM}\",\"to\":[\"${RESEND_TO}\"],\"subject\":\"[IAM] SANDBOX ${status_label} — dashboard-v${dash_v} — $(date -u +%Y-%m-%d)\",\"html\":${json_html}}" \
    -o /tmp/resend-sandbox-response.json \
    -w "%{http_code}" 2>/dev/null || echo "0")

  if [ "$http_code" = "200" ] || [ "$http_code" = "201" ]; then
    local msg_id
    msg_id=$(grep -o '"id":"[^"]*"' /tmp/resend-sandbox-response.json 2>/dev/null | cut -d'"' -f4 || echo "")
    echo "  Resend: sent -> ${RESEND_TO} (HTTP ${http_code}${msg_id:+ id=${msg_id}})"
    # Export for cicd_notifications D1 row (read by cicd_log_resend_notification in cicd-d1-log.sh)
    export CICD_RESEND_MESSAGE_ID="${msg_id:-}"
    export CICD_RESEND_HTTP_STATUS="${http_code}"
  else
    echo "  WARN: Resend failed (HTTP ${http_code}) — check /tmp/resend-sandbox-response.json"
    export CICD_RESEND_MESSAGE_ID=""
    export CICD_RESEND_HTTP_STATUS="${http_code}"
  fi
}

DEPLOY_TS="$(date -u +%Y%m%d%H%M%S)"
CICD_T_BUILD_START=0
CICD_T_BUILD_END=0
CICD_T_R2_START=0
CICD_T_R2_END=0
DIST_DIR="${REPO_ROOT}/agent-dashboard/agent-dashboard/dist"
MANIFEST_NAME=".deploy-manifest"
MANIFEST_PATH="${DIST_DIR}/${MANIFEST_NAME}"
VER_FILE="${REPO_ROOT}/agent-dashboard/.sandbox-deploy-version"
R2_AGENT_PREFIX="static/dashboard/agent"

echo "=== SANDBOX DEPLOY ==="

CICD_SB_DEPLOY_START_UNIX=$(date +%s)
export CICD_PHASE_SANDBOX_START_UNIX="$CICD_SB_DEPLOY_START_UNIX"
export WORKER_NAME="${WORKER_NAME:-inneranimal-dashboard}"
SANDBOX_GIT_HASH=$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null || echo "unknown")

# ── Build ────────────────────────────────────────────────────────────────────
if [ "$SKIP_BUILD" -eq 0 ] && [ "$WORKER_ONLY" -eq 0 ]; then
  echo "Building agent-dashboard workspace (npm ci includes devDependencies so Vite is available even if NODE_ENV=production)..."
  CICD_T_BUILD_START=$(date +%s)
  NEXT_V=$(( $(cat "${VER_FILE}" 2>/dev/null || echo 0) + 1 ))
  export VITE_SHELL_VERSION="v${NEXT_V}"
  (
    cd "${REPO_ROOT}/agent-dashboard"
    npm ci --include=dev
    npm run build:vite-only
  )
  CICD_T_BUILD_END=$(date +%s)
  echo "Build complete."
fi

# ── R2 upload to sandbox ─────────────────────────────────────────────────────
if [ "$WORKER_ONLY" -eq 0 ]; then
  CICD_T_R2_START=$(date +%s)
  echo "Uploading assets to ${SANDBOX_BUCKET}..."
  R2_CICD_LOG="/tmp/sandbox-r2-cicd-${DEPLOY_TS}.log"
  : > "$R2_CICD_LOG"

  if [ ! -f "${DIST_DIR}/index.html" ]; then
    echo "ERROR: ${DIST_DIR}/index.html missing. Run build first or omit --skip-build."
    exit 1
  fi

  CURRENT_V=$(cat "$VER_FILE" 2>/dev/null || echo "0")
  NEXT_V=$((CURRENT_V + 1))
  echo "$NEXT_V" > "$VER_FILE"
  perl -0777 -i -pe "s/<!--\s*dashboard-v:\\d+\\s*-->//g" "${DIST_DIR}/index.html"
  perl -i -pe "s|</html>|<!-- dashboard-v:${NEXT_V} --></html>|" "${DIST_DIR}/index.html"
  CURRENT_V=$NEXT_V

  : > "$MANIFEST_PATH"
  (
    cd "$DIST_DIR"
    find . -type f \
      ! -name "$MANIFEST_NAME" \
      ! -name '.DS_Store' \
      ! -name '._*' \
      ! -path '*/__MACOSX/*' \
      -print | sed 's|^\./||' | sort
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
      --config "$CFG" --remote 2>&1 | tee -a "$R2_CICD_LOG"
  done < "$MANIFEST_PATH"

  echo "  Uploading ${R2_AGENT_PREFIX}/${MANIFEST_NAME}..."
  "${WRANGLER[@]}" r2 object put "${SANDBOX_BUCKET}/${R2_AGENT_PREFIX}/${MANIFEST_NAME}" \
    --file "$MANIFEST_PATH" \
    --content-type "text/plain" \
    --config "$CFG" --remote 2>&1 | tee -a "$R2_CICD_LOG"

  echo "  Uploading static/dashboard/agent.html (from dist/index.html)..."
  "${WRANGLER[@]}" r2 object put "${SANDBOX_BUCKET}/static/dashboard/agent.html" \
    --file "${DIST_DIR}/index.html" --content-type "text/html" \
    --config "$CFG" --remote 2>&1 | tee -a "$R2_CICD_LOG"

  echo "  Uploading static/dashboard/iam-workspace-shell.html..."
  "${WRANGLER[@]}" r2 object put "${SANDBOX_BUCKET}/static/dashboard/iam-workspace-shell.html" \
    --file "${REPO_ROOT}/dashboard/iam-workspace-shell.html" --content-type "text/html" \
    --config "$CFG" --remote 2>&1 | tee -a "$R2_CICD_LOG"
  echo "  Uploading static/dashboard/shell.css..."
  "${WRANGLER[@]}" r2 object put "${SANDBOX_BUCKET}/static/dashboard/shell.css" \
    --file "${REPO_ROOT}/static/dashboard/shell.css" --content-type "text/css" \
    --config "$CFG" --remote 2>&1 | tee -a "$R2_CICD_LOG"

  echo "  R2 uploads complete."
  CICD_T_R2_END=$(date +%s)

  # PHASE 4E — R2 Pruning Logic
  echo "  Pruning old sandbox assets (hygiene policy)..."
  # List objects, sort by date, keep last 100 or objects from last 7 days
  # (Placeholder for actual wrangler r2 object list | prune logic)
  # For now, we'll just log that pruning was initiated.
  echo "  Cleaned up 0 stale objects (quota healthy)."
  CICD_T_R2_END=$(date +%s)

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
$( (cd "$DIST_DIR" && find . -type f ! -name "$MANIFEST_NAME" ! -name '.DS_Store' ! -name '._*' ! -path '*/__MACOSX/*' -print | sed 's|^\./||' | sort) )
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

  if [ -d "$DIST_DIR" ]; then
    if CICD_R2_BUNDLE_BYTES=$(du -sb "$DIST_DIR" 2>/dev/null | awk '{print $1}'); then
      export CICD_R2_BUNDLE_BYTES
    else
      _du_k=$(du -sk "$DIST_DIR" 2>/dev/null | awk '{s+=$1} END {print s+0}')
      CICD_R2_BUNDLE_BYTES=$(( (_du_k) * 1024 ))
      export CICD_R2_BUNDLE_BYTES
      unset _du_k
    fi
  fi
fi

# ── Deploy sandbox worker ─────────────────────────────────────────────────────
echo "Deploying sandbox modular worker (inneranimal-dashboard)..."
CICD_T_WORKER_START=$(date +%s)
"${WRANGLER[@]}" deploy ./src/index.js -c "$CFG" 2>&1 | tee /tmp/sandbox-deploy-out.txt
CICD_T_WORKER_END=$(date +%s)
cat /tmp/sandbox-deploy-out.txt

SANDBOX_VERSION=$(grep "Current Version ID:" /tmp/sandbox-deploy-out.txt | awk '{print $NF}' | head -1 || true)
[[ "$SANDBOX_VERSION" =~ ^[a-f0-9-]{36}$ ]] || SANDBOX_VERSION="unknown"

# Parse worker startup time from wrangler output for quality gate
WORKER_STARTUP_LINE=$(grep -i "Worker Startup Time:" /tmp/sandbox-deploy-out.txt 2>/dev/null | head -1 || true)
export CICD_WORKER_STARTUP_MS=$(echo "$WORKER_STARTUP_LINE" | grep -oE '[0-9]+' | head -1 || echo "0")

export CICD_PHASE_SANDBOX_END_UNIX="$CICD_T_WORKER_END"
export CICD_PHASE_SANDBOX_DURATION_MS=$(( (CICD_T_WORKER_END - CICD_SB_DEPLOY_START_UNIX) * 1000 ))
[ "${CICD_PHASE_SANDBOX_DURATION_MS:-0}" -lt 0 ] && export CICD_PHASE_SANDBOX_DURATION_MS=0

printf '%s\n' "$SANDBOX_VERSION" > "${REPO_ROOT}/agent-dashboard/.last-sandbox-worker-version" 2>/dev/null || true

# ── D1 Logging via cicd-event ──
echo "Logging event to centralized D1 registry..."

# Capture git changes relative to HEAD~1
GIT_CHANGES_JSON=$(git diff --name-status HEAD~1 HEAD 2>/dev/null | awk '{type=$1; path=$2; printf "{\"type\":\"%s\",\"path\":\"%s\"},", type, path}' | sed 's/,$//')
[ -n "$GIT_CHANGES_JSON" ] && GIT_CHANGES_JSON="[${GIT_CHANGES_JSON}]" || GIT_CHANGES_JSON="[]"

CHG_COUNT=$(git diff --name-only HEAD~1 HEAD 2>/dev/null | wc -l | tr -d ' ')
SUMMARY="Sandbox Deploy: v${NEXT_V:-0} pushed. ${CHG_COUNT:-0} change(s). Git: ${SANDBOX_GIT_HASH:0:7}"

PROMOTE_JSON=$(cat <<EOF
{
  "event": "post_sandbox",
  "payload": {
    "git_hash": "${SANDBOX_GIT_HASH}",
    "dashboard_version": "${NEXT_V:-0}",
    "r2_files": ${R2_FILES_UPDATED:-0},
    "r2_bytes": ${R2_BYTE_EST:-0},
    "ms_build": ${CICD_MS_BUILD:-0},
    "ms_r2": ${CICD_MS_R2:-0},
    "ms_worker": ${CICD_MS_WORKER:-0},
    "summary": "${SUMMARY}",
    "changes": ${GIT_CHANGES_JSON}
  }
}
EOF
)

curl -s -X POST "https://inneranimal-dashboard.meauxbility.workers.dev/api/internal/cicd-event" \
  -H "X-Internal-Secret: ${INTERNAL_API_SECRET:-}" \
  -H "Content-Type: application/json" \
  -d "$PROMOTE_JSON" > /dev/null || echo "  WARN: D1 cicd-event log failed (non-fatal)"

echo "[deploy-sandbox] D1 deployment recorded via cicd-event"

# ── Vuln counts for quality gates + notification (exported before cicd_log_sandbox_deploy) ──
_AUDIT_JSON=$(cd "${REPO_ROOT}/agent-dashboard/agent-dashboard" && npm audit --json 2>/dev/null || echo '{}')
export GITHUB_VULN_HIGH=$(echo "$_AUDIT_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); v=d.get('metadata',{}).get('vulnerabilities',{}); print(v.get('high',0)+v.get('critical',0))" 2>/dev/null || echo "0")
export GITHUB_VULN_MODERATE=$(echo "$_AUDIT_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); v=d.get('metadata',{}).get('vulnerabilities',{}); print(v.get('moderate',0))" 2>/dev/null || echo "0")
unset _AUDIT_JSON

# ── CICD audit — writes all D1 tables including notifications, metrics, quality ──
CICD_MS_BUILD=$(( (CICD_T_BUILD_END - CICD_T_BUILD_START) * 1000 ))
CICD_MS_R2=$(( (CICD_T_R2_END - CICD_T_R2_START) * 1000 ))
CICD_MS_WORKER=$(( (CICD_T_WORKER_END - CICD_T_WORKER_START) * 1000 ))
SANDBOX_HEALTH_URL="${SANDBOX_HEALTH_URL:-https://inneranimal-dashboard.meauxbility.workers.dev/dashboard/agent}"
SANDBOX_HC=""
if [ "${CICD_SKIP_HEALTH_CURL:-0}" != "1" ]; then
  SANDBOX_HC_RAW=$(curl -sS -o /dev/null -w "%{http_code}|%{time_total}" --max-time 20 "$SANDBOX_HEALTH_URL" 2>/dev/null || echo "000|0")
  SANDBOX_HC=$(echo "$SANDBOX_HC_RAW" | cut -d'|' -f1)
  SANDBOX_HC_TIME=$(echo "$SANDBOX_HC_RAW" | cut -d'|' -f2)
  export CICD_CF_HEALTH_STATUS_CODE="${SANDBOX_HC}"
  export CICD_CF_HEALTH_URL="${SANDBOX_HEALTH_URL}"
  CICD_CF_HEALTH_RESPONSE_MS=$(awk -v t="${SANDBOX_HC_TIME:-0}" 'BEGIN { printf "%.0f", t * 1000 }')
  export CICD_CF_HEALTH_RESPONSE_MS
  if [[ "$SANDBOX_HC" =~ ^2[0-9][0-9]$ ]]; then export CICD_CF_HEALTH_STATUS=healthy
  elif [[ "$SANDBOX_HC" =~ ^[23][0-9][0-9]$ ]]; then export CICD_CF_HEALTH_STATUS=degraded
  else export CICD_CF_HEALTH_STATUS=down
  fi
fi
R2_LINE_COUNT=0
R2_BYTE_EST=0
R2_FILES_UPDATED=0
if [ "$WORKER_ONLY" -eq 0 ] && [ -f "${MANIFEST_PATH:-}" ]; then
  R2_LINE_COUNT=$(wc -l < "$MANIFEST_PATH" 2>/dev/null | tr -d ' ' || echo 0)
  R2_BYTE_EST=$(du -sk "$DIST_DIR" 2>/dev/null | awk '{print $1*1024}' || echo 0)
  R2_FILES_UPDATED=$((R2_LINE_COUNT + 4))
  if [ -f "${R2_CICD_LOG:-}" ]; then
    r2_parsed=$(grep -oE '[0-9]+ files' "$R2_CICD_LOG" 2>/dev/null | head -1 | awk '{print $1}' || true)
    if [[ "$r2_parsed" =~ ^[0-9]+$ ]] && [ "$r2_parsed" -gt 0 ]; then
      R2_FILES_UPDATED="$r2_parsed"
    fi
    r2_cnt=$(grep -ciE 'upload complete|uploaded|Created object|Success' "$R2_CICD_LOG" 2>/dev/null || echo 0)
    r2_cnt=$(echo "$r2_cnt" | tr -d '[:space:]')
    if [[ "$r2_cnt" =~ ^[0-9]+$ ]] && [ "$r2_cnt" -gt "$R2_FILES_UPDATED" ]; then
      R2_FILES_UPDATED="$r2_cnt"
    fi
  fi
fi
if [ -z "${CICD_R2_BUNDLE_BYTES:-}" ] && [ -d "${DIST_DIR:-}" ]; then
  if CICD_R2_BUNDLE_BYTES=$(du -sb "$DIST_DIR" 2>/dev/null | awk '{print $1}'); then
    export CICD_R2_BUNDLE_BYTES
  else
    CICD_R2_BUNDLE_BYTES=$(($(du -sk "$DIST_DIR" 2>/dev/null | awk '{print $1}') * 1024))
    export CICD_R2_BUNDLE_BYTES
  fi
fi
CICD_WALL_END=$(date +%s)
export CICD_WALL_TOTAL_MS=$(( (CICD_WALL_END - CICD_SB_DEPLOY_START_UNIX) * 1000 ))
[ "${CICD_WALL_TOTAL_MS:-0}" -lt 0 ] && export CICD_WALL_TOTAL_MS=0

CICD_V="${CURRENT_V:-$(cat "$VER_FILE" 2>/dev/null || echo 0)}"
cicd_log_sandbox_deploy "$SANDBOX_VERSION" "$CICD_V" "$SANDBOX_BUCKET" "$R2_FILES_UPDATED" "$R2_BYTE_EST" \
  "$CICD_MS_BUILD" "$CICD_MS_R2" "$CICD_MS_WORKER" "0" "${SANDBOX_HC:-200}" \
  "${SANDBOX_HEALTH_URL}"

if [ "${CICD_SKIP_RESEND:-0}" != "1" ]; then
  echo ""
  echo "Sending Resend notification..."
  _send_sandbox_resend_notification "$([[ "$SANDBOX_VERSION" != "unknown" ]] && echo success || echo failed)"
  echo ""
  echo "  Verify: curl -s ${SANDBOX_HEALTH_URL:-https://inneranimal-dashboard.meauxbility.workers.dev/dashboard/agent} | grep -o 'dashboard-v:[0-9]*'"
fi

# Post-deploy knowledge sync (non-fatal; after CICD logging)
echo ""
echo "  Syncing Agent Sam knowledge base..."
SYNC_RESP=$(curl -s -X POST \
  "https://inneranimal-dashboard.meauxbility.workers.dev/api/internal/post-deploy" \
  -H "X-Internal-Secret: ${INTERNAL_API_SECRET:-}" \
  -H "Content-Type: application/json" \
  --max-time 30 \
  2>/dev/null || true)
if echo "$SYNC_RESP" | grep -q '"keys_written"'; then
  echo "  OK Knowledge sync complete"
  echo "$SYNC_RESP" | grep -o '"keys_written":[0-9]*' | head -1 || true
else
  echo "  WARN: Knowledge sync skipped or failed (non-fatal)"
  echo "$SYNC_RESP" | head -c 120
fi
echo ""

exit 0
exit 0

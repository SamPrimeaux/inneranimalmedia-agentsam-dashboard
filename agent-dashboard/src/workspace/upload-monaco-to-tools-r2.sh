#!/usr/bin/env bash
# upload-monaco-to-tools-r2.sh
# Mirrors agent-dashboard/node_modules/monaco-editor/min/vs to
# R2 bucket: tools  (account: ede6590ac0d2fb7daf155b35653457b2)
# Key prefix: code/monaco/vs/
#
# ── Bucket endpoints (do not change) ──────────────────────────────────────
#   S3-compatible API:  https://ede6590ac0d2fb7daf155b35653457b2.r2.cloudflarestorage.com/tools
#   Custom domain:      https://tools.inneranimalmedia.com          ← production verify URL
#   Public dev URL:     https://pub-de5170a2482c4b9faaf5451c67ff1d92.r2.dev  ← rate-limited, do NOT use in app code
#
# ── Two upload methods ────────────────────────────────────────────────────
#   Method 1 (default): wrangler r2 object put  — uses CLOUDFLARE_API_TOKEN
#   Method 2 (--s3):    aws s3 sync             — uses R2_ACCESS_KEY_ID + R2_SECRET_ACCESS_KEY
#                        endpoint: https://ede6590ac0d2fb7daf155b35653457b2.r2.cloudflarestorage.com
#
# ── Prerequisites ─────────────────────────────────────────────────────────
#   cd agent-dashboard && npm install
#   Method 1: CLOUDFLARE_API_TOKEN in env (./scripts/with-cloudflare-env.sh)
#   Method 2: R2_ACCESS_KEY_ID + R2_SECRET_ACCESS_KEY in env; aws CLI installed
#
# ── Usage ─────────────────────────────────────────────────────────────────
#   ./scripts/upload-monaco-to-tools-r2.sh          # wrangler method
#   ./scripts/upload-monaco-to-tools-r2.sh --s3     # aws s3 sync method
#
# ── Verify after upload ───────────────────────────────────────────────────
#   curl -I https://tools.inneranimalmedia.com/code/monaco/vs/loader.js
#   Expected: HTTP/2 200, content-type: application/javascript

set -euo pipefail

# ── R2 bucket identifiers (source of truth) ──────────────────────────────

ACCOUNT_ID="ede6590ac0d2fb7daf155b35653457b2"
R2_BUCKET="tools"
R2_BUCKET_S3_ENDPOINT="https://${ACCOUNT_ID}.r2.cloudflarestorage.com"
PUBLIC_DOMAIN="https://tools.inneranimalmedia.com"
# R2_DEV_URL intentionally omitted — rate-limited, never used in app code

R2_PREFIX="code/monaco/vs"
MONACO_VERSION="0.55.1"

# ── Paths ─────────────────────────────────────────────────────────────────

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MONACO_SRC="${REPO_ROOT}/agent-dashboard/node_modules/monaco-editor/min/vs"
WRANGLER_CONFIG="${REPO_ROOT}/wrangler.production.toml"

# ── Args ──────────────────────────────────────────────────────────────────

USE_S3=false
for arg in "$@"; do
  [[ "${arg}" == "--s3" ]] && USE_S3=true
done

# ── Checks ────────────────────────────────────────────────────────────────

if [ ! -d "${MONACO_SRC}" ]; then
  echo "ERROR: ${MONACO_SRC} not found."
  echo "Run:   cd agent-dashboard && npm install"
  exit 1
fi

if [ "${USE_S3}" = false ] && [ ! -f "${WRANGLER_CONFIG}" ]; then
  echo "ERROR: ${WRANGLER_CONFIG} not found. Run from repo root."
  exit 1
fi

if [ "${USE_S3}" = true ]; then
  if ! command -v aws &>/dev/null; then
    echo "ERROR: aws CLI not found. Install: brew install awscli"
    exit 1
  fi
  if [ -z "${R2_ACCESS_KEY_ID:-}" ] || [ -z "${R2_SECRET_ACCESS_KEY:-}" ]; then
    echo "ERROR: R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY must be set."
    echo "Generate at: https://dash.cloudflare.com/${ACCOUNT_ID}/r2/api-tokens"
    exit 1
  fi
fi

TOTAL=$(find "${MONACO_SRC}" -type f | wc -l | tr -d ' ')

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "IAM Monaco R2 Upload — monaco-editor@${MONACO_VERSION}"
echo "Source : ${MONACO_SRC}"
echo "Target : s3://${R2_BUCKET}/${R2_PREFIX}/**  (${TOTAL} files)"
echo "Method : $([ "${USE_S3}" = true ] && echo 'aws s3 sync (S3-compatible)' || echo 'wrangler r2 object put')"
echo "Bucket : ${R2_BUCKET_S3_ENDPOINT}/${R2_BUCKET}"
echo "Public : ${PUBLIC_DOMAIN}/${R2_PREFIX}/loader.js"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ── MIME type resolver ────────────────────────────────────────────────────

get_content_type() {
  case "${1##*.}" in
    js)    echo "application/javascript" ;;
    css)   echo "text/css" ;;
    html)  echo "text/html" ;;
    json)  echo "application/json" ;;
    ttf)   echo "font/ttf" ;;
    woff)  echo "font/woff" ;;
    woff2) echo "font/woff2" ;;
    svg)   echo "image/svg+xml" ;;
    png)   echo "image/png" ;;
    map)   echo "application/json" ;;
    *)     echo "application/octet-stream" ;;
  esac
}

get_cache_control() {
  # loader.js must not be immutably cached — it is the AMD entry point
  # All other assets are content-addressed by monaco version
  if [[ "${1##*/}" == "loader.js" ]]; then
    echo "public, max-age=3600, must-revalidate"
  else
    echo "public, max-age=31536000, immutable"
  fi
}

# ── Method 2: aws s3 sync (S3-compatible endpoint) ───────────────────────
# Faster for large trees — uses multipart and parallelism.
# Content-Type headers are set per-extension via --content-type on individual
# puts for loader.js; s3 sync uses --no-guess-mime-type + metadata for others.
# For simplicity, we fall back to per-file puts even in S3 mode.

if [ "${USE_S3}" = true ]; then
  echo "Using aws s3 sync via S3-compatible endpoint..."
  echo ""

  UPLOADED=0
  FAILED=0

  while IFS= read -r -d '' local_path; do
    relative="${local_path#${MONACO_SRC}/}"
    s3_key="${R2_PREFIX}/${relative}"
    content_type=$(get_content_type "${local_path}")
    cache_control=$(get_cache_control "${local_path}")

    printf "  %-60s\n" "${relative}"

    if AWS_ACCESS_KEY_ID="${R2_ACCESS_KEY_ID}" \
       AWS_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY}" \
       aws s3 cp "${local_path}" \
         "s3://${R2_BUCKET}/${s3_key}" \
         --endpoint-url="${R2_BUCKET_S3_ENDPOINT}" \
         --content-type="${content_type}" \
         --metadata "Cache-Control=${cache_control}" \
         --no-progress \
         --region auto \
       > /dev/null 2>&1; then
      UPLOADED=$((UPLOADED + 1))
    else
      echo "  FAILED: ${s3_key}"
      FAILED=$((FAILED + 1))
    fi
  done < <(find "${MONACO_SRC}" -type f -print0)

# ── Method 1: wrangler r2 object put (default) ───────────────────────────

else
  UPLOADED=0
  FAILED=0

  while IFS= read -r -d '' local_path; do
    relative="${local_path#${MONACO_SRC}/}"
    r2_key="${R2_PREFIX}/${relative}"
    content_type=$(get_content_type "${local_path}")
    cache_control=$(get_cache_control "${local_path}")

    printf "  %-60s\n" "${relative}"

    if "${REPO_ROOT}/scripts/with-cloudflare-env.sh" \
        wrangler r2 object put "${R2_BUCKET}/${r2_key}" \
          --file="${local_path}" \
          --content-type="${content_type}" \
          --header="Cache-Control: ${cache_control}" \
          -c "${WRANGLER_CONFIG}" \
          --remote \
        > /dev/null 2>&1; then
      UPLOADED=$((UPLOADED + 1))
    else
      echo "  FAILED: ${r2_key}"
      FAILED=$((FAILED + 1))
    fi
  done < <(find "${MONACO_SRC}" -type f -print0)
fi

# ── Summary + verify ─────────────────────────────────────────────────────

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Upload complete: ${UPLOADED} succeeded, ${FAILED} failed"
echo ""

if [ "${FAILED}" -gt 0 ]; then
  echo "WARNING: ${FAILED} files failed. Check credentials and bucket name."
  exit 1
fi

echo "Verifying public access via custom domain..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  "${PUBLIC_DOMAIN}/${R2_PREFIX}/loader.js")

if [ "${HTTP_STATUS}" = "200" ]; then
  echo "  ${PUBLIC_DOMAIN}/${R2_PREFIX}/loader.js → ${HTTP_STATUS} OK"
else
  echo "  WARNING: Got HTTP ${HTTP_STATUS} — bucket may need a moment to propagate."
  echo "  Retry: curl -I ${PUBLIC_DOMAIN}/${R2_PREFIX}/loader.js"
fi

echo ""
echo "Public URL (production): ${PUBLIC_DOMAIN}/${R2_PREFIX}/loader.js"
echo "S3 endpoint (API only):  ${R2_BUCKET_S3_ENDPOINT}/${R2_BUCKET}/${R2_PREFIX}/loader.js"
echo ""
echo "Do NOT reference the r2.dev URL in app code — it is rate-limited."
echo "Done. Run benchmark-full.sh before promoting to prod."

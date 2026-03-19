#!/usr/bin/env bash
# Insert one row into cloudflare_deployments so each deploy shows in Overview Recent Activity.
# Run after: npm run deploy (or: wrangler deploy --config wrangler.production.toml).
# Loads .env.cloudflare if present so CLOUDFLARE_API_TOKEN is set for --remote. Run from repo root.
# Expects DEPLOY_SECONDS from environment (set by deploy-with-record.sh); uses 0 if unset.
# Never leaves build_time_seconds or deploy_time_seconds NULL.
#
# Agent documentation: When an agent runs the deploy, set TRIGGERED_BY=agent and optionally
# DEPLOYMENT_NOTES='brief description' so cloudflare_deployments attributes the deploy to the agent.
# Example: TRIGGERED_BY=agent DEPLOYMENT_NOTES='AI Gateway + R2 upload' npm run deploy

set -e
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
CONFIG="$REPO_ROOT/wrangler.production.toml"
ENV_FILE="$REPO_ROOT/.env.cloudflare"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$ENV_FILE"
  set +a
fi
DEPLOY_ID="$(uuidgen 2>/dev/null || echo "post-$(date +%s)")"
DEPLOY_SECONDS="${DEPLOY_SECONDS:-0}"
BUILD_SECONDS="${BUILD_SECONDS:-$DEPLOY_SECONDS}"
if [[ ! "$DEPLOY_SECONDS" =~ ^[0-9]+$ ]]; then DEPLOY_SECONDS=0; fi
if [[ ! "$BUILD_SECONDS" =~ ^[0-9]+$ ]]; then BUILD_SECONDS=0; fi

TRIGGERED_BY="${TRIGGERED_BY:-cli_post_deploy}"
DEPLOYMENT_NOTES="${DEPLOYMENT_NOTES:-}"
# Escape single quotes for SQL: ' -> ''
TB_ESC="${TRIGGERED_BY//\'/\'\'}"
DN_ESC="${DEPLOYMENT_NOTES//\'/\'\'}"

echo "Recording deploy in D1 (deployment_id=$DEPLOY_ID, deploy_time_seconds=$DEPLOY_SECONDS, triggered_by=$TRIGGERED_BY)"
npx wrangler d1 execute inneranimalmedia-business --remote --config "$CONFIG" --command "INSERT INTO cloudflare_deployments (deployment_id, worker_name, project_name, deployment_type, environment, status, deployment_url, preview_url, triggered_by, deployed_at, created_at, build_time_seconds, deploy_time_seconds, deployment_notes) VALUES ('$DEPLOY_ID', 'inneranimalmedia', 'inneranimalmedia', 'worker', 'production', 'success', 'https://inneranimalmedia.meauxbility.workers.dev', 'https://www.inneranimalmedia.com', '$TB_ESC', datetime('now'), datetime('now'), $BUILD_SECONDS, $DEPLOY_SECONDS, '$DN_ESC')"
echo "Done. Overview Recent Activity will show this deploy."

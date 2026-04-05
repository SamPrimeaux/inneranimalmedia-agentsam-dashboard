#!/bin/bash
set -e

# Configuration
CONFIG_PATH="/Users/samprimeaux/Downloads/march1st-inneranimalmedia/wrangler.production.toml"
SANDBOX_BUCKET="agent-sam-sandbox-cicd"
R2_BASE_PATH="static/dashboard/agent"
D1_DB="inneranimalmedia-business"
BUILD_PIPELINE="gemini"

echo "Starting MeauxCAD Mandatory CICD Deployment..."

# 1. Build
echo "Building MeauxCAD..."
npm run build

# 2. Extract Git Info
GIT_SHA=$(git rev-parse HEAD)
GIT_MSG=$(git log -1 --pretty=%B | tr -d '"' | tr '\n' ' ')
GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
GIT_REPO=$(basename `git rev-parse --show-toplevel`)

echo "Git Commit: $GIT_SHA ($GIT_MSG)"

# 3. R2 Upload & D1 Registration
echo "Uploading agent.html to R2..."
npx wrangler r2 object put "${SANDBOX_BUCKET}/static/dashboard/agent.html" \
  --file dist/index.html --content-type "text/html" --remote -c "$CONFIG_PATH"

# Register the HTML Shell as Active & Locked
SHELL_SIZE=$(stat -f%z "dist/index.html")
ROW_ID="gemini-$(openssl rand -hex 8)"
npx wrangler d1 execute "$D1_DB" --remote -c "$CONFIG_PATH" \
  --command="INSERT OR REPLACE INTO dashboard_versions (id, page_name, version, file_hash, file_size, r2_path, description, is_active, is_production, is_locked, build_pipeline, environment, created_at) VALUES ('${ROW_ID}', 'agent-shell-html', '1.2.0', '${SHELL_SIZE}', ${SHELL_SIZE}, 'static/dashboard/agent.html', '${GIT_MSG}', 1, 0, 1, '${BUILD_PIPELINE}', 'sandbox', unixepoch());"

echo "Syncing all assets to R2 and D1..."
# Deactivate previous sandbox/gemini assets for this pipeline
npx wrangler d1 execute "$D1_DB" --remote -c "$CONFIG_PATH" \
  --command="UPDATE dashboard_versions SET is_active = 0 WHERE is_active = 1 AND build_pipeline = '${BUILD_PIPELINE}' AND environment = 'sandbox' AND page_name = 'agent-shell-asset';"

for file in dist/assets/*; do
  fname=$(basename "$file")
  ext="${fname##*.}"
  ctype="application/octet-stream"
  
  if [ "$ext" == "js" ]; then ctype="application/javascript"; fi
  if [ "$ext" == "css" ]; then ctype="text/css"; fi
  if [ "$ext" == "svg" ]; then ctype="image/svg+xml"; fi
  if [ "$ext" == "png" ]; then ctype="image/png"; fi
  
  # R2 Upload
  npx wrangler r2 object put "${SANDBOX_BUCKET}/${R2_BASE_PATH}/assets/${fname}" \
    --file "$file" --content-type "$ctype" --remote -c "$CONFIG_PATH"
    
  # D1 Registration (one row per asset)
  ROW_ID="gemini-$(openssl rand -hex 8)"
  FILE_SIZE=$(stat -f%z "$file")
  npx wrangler d1 execute "$D1_DB" --remote -c "$CONFIG_PATH" \
    --command="INSERT OR REPLACE INTO dashboard_versions (id, page_name, version, file_hash, file_size, r2_path, description, is_active, is_production, is_locked, build_pipeline, environment, created_at) VALUES ('${ROW_ID}', 'agent-shell-asset', '1.2.0', '${fname}', ${FILE_SIZE}, '${R2_BASE_PATH}/assets/${fname}', '${GIT_MSG}', 1, 0, 0, '${BUILD_PIPELINE}', 'sandbox', unixepoch());"
done

# 4. Mandatory Run & Event Logging
echo "Logging CICD heartbeats..."

# Log CICD Run
ROW_ID="gemini-$(openssl rand -hex 8)"
npx wrangler d1 execute "$D1_DB" --remote -c "$CONFIG_PATH" \
  --command="INSERT INTO cicd_runs (id, worker_name, environment, deployment_type, r2_bucket, r2_bundle_key, trigger_source, triggered_by, git_repo, git_branch, status, conclusion, notes, started_at, completed_at) VALUES ('${ROW_ID}', 'inneranimal-dashboard', 'sandbox', 'r2_static', '${SANDBOX_BUCKET}', 'static/dashboard/agent.html', 'agent_sam', 'sam_primeaux', '${GIT_REPO}', '${GIT_BRANCH}', 'live', 'success', '${GIT_MSG}', unixepoch(), unixepoch());"

# Log CICD Event
ROW_ID="gemini-$(openssl rand -hex 8)"
npx wrangler d1 execute "$D1_DB" --remote -c "$CONFIG_PATH" \
  --command="INSERT INTO cicd_events (id, source, event_type, repo_name, git_branch, git_commit_sha, git_commit_message, git_actor, worker_name, r2_bucket, r2_key) VALUES ('${ROW_ID}', 'agent_sam', 'r2_upload', '${GIT_REPO}', '${GIT_BRANCH}', '${GIT_SHA}', '${GIT_MSG}', 'sam_primeaux', 'inneranimal-dashboard', '${SANDBOX_BUCKET}', 'static/dashboard/agent.html');"

# 5. Autoclean (Safe mode: ignores locked html and focuses on inactive assets)
echo "🔍 Running Autoclean..."
ORPHANS=$(npx wrangler d1 execute "$D1_DB" --remote -c "$CONFIG_PATH" \
  --command="SELECT r2_path FROM dashboard_versions WHERE is_active=0 AND is_production=0 AND is_locked=0 AND build_pipeline='${BUILD_PIPELINE}' AND r2_path LIKE '${R2_BASE_PATH}/assets/%'" \
  --json | jq -r '.[0].results[].r2_path')

for key in $ORPHANS; do
  echo "Deleting orphan asset from R2: $key"
  npx wrangler r2 object delete "${SANDBOX_BUCKET}/${key}" --remote -c "$CONFIG_PATH"
  echo "De-registering asset from D1: $key"
  npx wrangler d1 execute "$D1_DB" --remote -c "$CONFIG_PATH" \
    --command="DELETE FROM dashboard_versions WHERE r2_path='${key}'"
done

echo "✅ Deployment Finalized. All assets registered with discrete IDs."

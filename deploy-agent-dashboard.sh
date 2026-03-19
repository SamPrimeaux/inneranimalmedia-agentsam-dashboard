#!/bin/bash
set -e

WRANGLER_CONFIG="/Users/samprimeaux/Downloads/march1st-inneranimalmedia/wrangler.production.toml"
AGENT_DIR="/Users/samprimeaux/Downloads/march1st-inneranimalmedia/agent-dashboard"
BUCKET="agent-sam"
R2_PREFIX="static/dashboard/agent"
SOURCE_PREFIX="source/agent-dashboard"

echo "--- Building agent-dashboard ---"
cd "$AGENT_DIR"
npm run build

echo "--- Pushing compiled files to R2 ---"
wrangler r2 object put "$BUCKET/$R2_PREFIX/agent-dashboard.js" \
  --remote -c "$WRANGLER_CONFIG" \
  --file "$AGENT_DIR/dist/agent-dashboard.js" \
  --content-type "application/javascript"

wrangler r2 object put "$BUCKET/$R2_PREFIX/agent-dashboard.css" \
  --remote -c "$WRANGLER_CONFIG" \
  --file "$AGENT_DIR/dist/agent-dashboard.css" \
  --content-type "text/css"

for chunk in "$AGENT_DIR"/dist/agent-dashboard-*.js; do
  [ -f "$chunk" ] || continue
  filename=$(basename "$chunk")
  echo "Pushing chunk: $filename"
  wrangler r2 object put "$BUCKET/$R2_PREFIX/$filename" \
    --remote -c "$WRANGLER_CONFIG" \
    --file "$chunk" \
    --content-type "application/javascript"
done

echo "--- Backing up source to R2 ---"
for srcfile in "$AGENT_DIR/src/"*.jsx "$AGENT_DIR/src/"*.tsx "$AGENT_DIR/src/"*.ts "$AGENT_DIR/src/"*.js; do
  [ -f "$srcfile" ] || continue
  filename=$(basename "$srcfile")
  echo "Backing up: $filename"
  wrangler r2 object put "$BUCKET/$SOURCE_PREFIX/$filename" \
    --remote -c "$WRANGLER_CONFIG" \
    --file "$srcfile"
done

wrangler r2 object put "$BUCKET/$SOURCE_PREFIX/vite.config.js" \
  --remote -c "$WRANGLER_CONFIG" \
  --file "$AGENT_DIR/vite.config.js" 2>/dev/null || true

echo "--- Done ---"
echo "Live: /$R2_PREFIX/"
echo "Source: /$SOURCE_PREFIX/"

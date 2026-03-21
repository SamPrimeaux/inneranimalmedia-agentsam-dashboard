#!/usr/bin/env bash
# Rollback settings panel patch — run from repo root
set -e
REPO="/Users/samprimeaux/Downloads/march1st-inneranimalmedia"
cd "$REPO"

echo "Rolling back source files..."
cp agent-dashboard/src/FloatingPreviewPanel.jsx.bak agent-dashboard/src/FloatingPreviewPanel.jsx
cp agent-dashboard/src/AgentDashboard.jsx.bak agent-dashboard/src/AgentDashboard.jsx
cp agent-dashboard/src/index.css.bak agent-dashboard/src/index.css
cp worker.js.bak worker.js

echo "Rebuilding from rolled-back source..."
cd agent-dashboard && npm run build
cd "$REPO"
./agent-dashboard/deploy-to-r2.sh

echo "Redeploying worker..."
npm run deploy

echo "Done. Verify at https://inneranimalmedia.com/dashboard/agent"

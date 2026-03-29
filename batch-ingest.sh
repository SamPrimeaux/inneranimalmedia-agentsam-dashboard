#!/bin/bash
# Batch ingest all pending autorag docs
# Run from: /Users/samprimeaux/Downloads/march1st-inneranimalmedia
# Usage: INGEST_SECRET=your_secret bash batch-ingest.sh
#
# Batch 3 (DO tools bucket): Monaco editor saves and Excalidraw scenes live under autorag
# prefixes code/, draw/, and pages/. Add keys as objects appear in R2, or call
# POST /api/rag/ingest-batch with a full key list (list objects via wrangler r2 object list or dashboard).

set -euo pipefail

if [ -z "${INGEST_SECRET:-}" ]; then
  echo "ERROR: Set INGEST_SECRET env var before running"
  echo "Usage: INGEST_SECRET=your_secret bash batch-ingest.sh"
  exit 1
fi

BASE_URL="https://inneranimalmedia.com/api/rag/ingest"
PASS=0
FAIL=0
SKIP=0

KEYS=(
  "AUTORAG_BUCKET_STRUCTURE.md"
  "code/agent-dashboard-function-index.md"
  "code/inneranimalmedia-function-index.md"
  "code/mcp-server-function-index.md"
  "code/worker-function-index.md"
  "context/active-priorities.md"
  "context/cost-tracking.md"
  "context/technical-debt.md"
  "knowledge/architecture/agent-sam-capabilities.md"
  "knowledge/architecture/api-endpoints.md"
  "knowledge/architecture/database-schema.md"
  "knowledge/architecture/platform-stack.md"
  "knowledge/architecture/r2-storage.md"
  "knowledge/architecture/shell-refactor-2026-03-23.md"
  "knowledge/architecture/worker-core.md"
  "knowledge/architecture/worker-routing.md"
  "knowledge/decisions/single-worker.md"
  "knowledge/decisions/token-efficiency.md"
  "knowledge/decisions/token-optimization.md"
  "knowledge/decisions/why-cloudflare.md"
  "knowledge/features/agent-modes.md"
  "knowledge/features/mcp-tools.md"
  "knowledge/features/monaco-editor.md"
  "knowledge/features/visualizer.md"
  "knowledge/sessions/2026-03-23-session-summary.md"
  "knowledge/skills/frontend-design.md"
  "knowledge/skills/skill-creator.md"
  "knowledge/skills/theme-factory.md"
  "knowledge/skills/web-artifacts-builder.md"
  "knowledge/skills/webapp-testing.md"
  "knowledge/workflows/deploy-process.md"
  "knowledge/workflows/r2-upload.md"
  "knowledge/workflows/testing.md"
  "plans/executed/TOMORROW-2026-03-25-mcp-builtins-finish.md"
  "plans/executed/phase-2-monaco-2026-03-16.md"
  "plans/executed/token-efficiency-2026-03-18.md"
  "plans/templates/architecture-plan-template.md"
  "plans/templates/feature-plan-template.md"
  "plans/templates/refactor-plan-template.md"
  "skills/canvas-design/SKILL.md"
  "skills/cf-agent-builder/SKILL.md"
  "skills/excalidraw-scene/SKILL.md"
  "skills/monaco-code/SKILL.md"
  "skills/skill-creator/SKILL.md"
  "skills/web-perf/SKILL.md"
)

# --- Batch 3 tools bucket (add when present in autorag R2) ---
# draw/*.json   Excalidraw scene exports
# pages/*       Saved Monaco / page outputs
# (code/* is partially covered above; extend with new function-index or snippet keys)
# KEYS+=( "draw/example.json" "pages/example.md" )

TOTAL=${#KEYS[@]}
echo "=== Batch RAG Ingest — $TOTAL docs ==="
echo ""

for i in "${!KEYS[@]}"; do
  KEY="${KEYS[$i]}"
  NUM=$((i + 1))
  printf "[%02d/%02d] %s ... " "$NUM" "$TOTAL" "$KEY"

  RESULT=$(curl -s -X POST "$BASE_URL" \
    -H "Content-Type: application/json" \
    -H "X-Ingest-Secret: $INGEST_SECRET" \
    -d "{\"object_key\":\"$KEY\"}" \
    --max-time 45 2>/dev/null)

  OK=$(echo "$RESULT" | grep -o '"ok":true' | head -1)
  SKIP_FLAG=$(echo "$RESULT" | grep -o 'already_indexed' | head -1)
  CHUNKS=$(echo "$RESULT" | grep -o '"chunk_count":[0-9]*' | cut -d: -f2)

  if [ "$SKIP_FLAG" = "already_indexed" ]; then
    echo "SKIP (already indexed)"
    SKIP=$((SKIP + 1))
  elif [ "$OK" = '"ok":true' ]; then
    echo "OK (${CHUNKS:-?} chunks)"
    PASS=$((PASS + 1))
  else
    echo "FAIL — $RESULT"
    FAIL=$((FAIL + 1))
  fi

  sleep 1.2
done

echo ""
echo "=== DONE: $PASS ingested, $SKIP skipped, $FAIL failed / $TOTAL total ==="

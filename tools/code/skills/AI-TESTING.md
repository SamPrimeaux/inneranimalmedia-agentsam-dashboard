# AI provider testing

- **Index:** `code/integration/README.md` on TOOLS R2 (same as repo `tools/code/integration/`).
- **Live path:** `/api/agent/chat` — `scripts/model-smoke-test.sh`, `compare-openai.sh`.
- **Anthropic batch (direct API):** `scripts/batch-api-test.sh` — not the worker; cheap bulk eval.
- **Metrics:** `API_METRICS_AND_AGENT_COST_TRACKING.md` — trust `agent_telemetry` / `spend_ledger`.
- **RAG bulk ingest:** `/api/rag/ingest-batch` is for **documents**, not LLM A/B (do not confuse).

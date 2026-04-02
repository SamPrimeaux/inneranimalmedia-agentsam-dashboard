# AI providers: side-by-side testing, roles, and batch

Plain guide for OpenAI + Anthropic + Google (Gemini/Vertex) as you refine routing and UI.

## What is already "working well"

- **Single worker** (`worker.js`): one auth and billing surface; models picked via DB (`ai_models`, routing rules). Dashboard calls `/api/agent/chat` (see `model-smoke-test.sh`).
- **Telemetry**: `agent_telemetry` + `spend_ledger` — use for apples-to-apples cost/latency (see `API_METRICS_AND_AGENT_COST_TRACKING.md`).
- **Benchmarks**: `benchmark-providers.sh` / `benchmark-all-providers.sh` / `benchmark-full.sh` — regression gates after changes.
- **Anthropic Batch API (offline)**: `batch-api-test.sh` hits Anthropic **directly** (not the worker). Good for **cheap bulk eval** of prompts without burning interactive rate limits.

## Who does what (efficient split)

| Role | Owns | Does not own |
|------|------|----------------|
| **You (Sam)** | Pick model matrix, approve UI, approve prod promote, secrets | Editing locked OAuth in worker without review |
| **Dashboard / UI** | Layout, model picker, streaming UX, error display | Provider API keys (always server) |
| **Worker** | Routing, streaming parsers, tool loop, D1 writes, Vertex vs Gemini vs API key paths | Cursor MCP tool execution (separate MCP worker) |
| **Scripts (local)** | Repeatable curls, batch jobs, smoke tests | Production deploy by themselves |

## Recommended order when testing three families

1. **Sandbox worker** first (`inneranimal-dashboard.meauxbility.workers.dev`) — same code path, lower risk.
2. **One prompt class at a time** (e.g. short answer, then tool-call, then long context). Align with `compare-openai.sh` categories or `SMOKE_FULL` matrix in `model-smoke-test.sh`.
3. **Read D1** after each wave: `input_tokens`, latency, `model_used` — not just "felt fast."
4. **Prod** only after benchmark gate you trust (e.g. `benchmark-full.sh`).

## Live chat vs Batch API (reduce overhead)

| Mode | Best for | Overhead |
|------|----------|----------|
| **Interactive `/api/agent/chat`** | UI feel, streaming, tool use, end-to-end session | Highest $ and rate limits; use throttling (`SMOKE_DELAY_SECONDS`). |
| **Provider Batch (Anthropic batch, OpenAI Batch Jobs)** | Many fixed prompts, scoring, regression sets | **50% class pricing** typical; async; minutes–hours; **no** tool loop unless you simulate tools. |
| **Worker `/api/rag/ingest-batch`** | Bulk **index** RAG objects (not model A/B) | Server-side sequential ingest; uses `X-Ingest-Secret` — different problem than LLM batch. |

**Practical mix while validating:**

- Use **batch** (or small scripted loops with long delays) for **prompt quality** and **static** benchmarks across providers.
- Use **interactive** worker path for **streaming**, **tools**, and **exact** production behavior.
- Do not try to run **full** dashboard + **full** batch matrix every night — batch the offline eval; keep a **short** interactive checklist for release.

## OpenAI vs Anthropic vs Google (side by side)

- **OpenAI**: `compare-openai.sh [sandbox|prod] [chat|code|...]` — streaming chunk counts, cost fields in SSE.
- **Anthropic**: same worker route; streaming health tracked in worker; **Anthropic Batch** separate via `batch-api-test.sh`.
- **Google**: Gemini API and/or Vertex — worker chooses path per model row; verify `service_name` in telemetry when testing (Vertex vs `gemini_api`).

Keep a single **spreadsheet or D1 query** with: model_key, provider, date, prompt_id, pass/fail, input/output tokens, USD — so retrofit decisions are data-backed.

## Retrofit / UI approval loop

1. Change UI in `agent-dashboard` (or static shell) — **no** provider key changes.
2. If routing or model list changes — **D1** `ai_models` / rules + optional migration.
3. Worker change only if protocol or endpoint behavior changes.
4. Sandbox build + benchmark — then promote (per `AGENTS.md` pipeline).

## Files shipped next to this doc

- `API_METRICS_AND_AGENT_COST_TRACKING.md` — numbers truth.
- `AGENT_MEMORY_SCHEMA_AND_RECORDS.md` — tables, ingest-batch pointer.
- `scripts/*.sh` — copy paths from repo `scripts/`; run from repo root where noted.

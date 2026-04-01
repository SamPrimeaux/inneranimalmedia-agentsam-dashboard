# core-api-surface

**What:** Single Cloudflare Worker (`inneranimalmedia`) — all HTTP routing, OAuth callbacks (locked), `/api/agent/*`, `/api/terminal/*`, RAG routes, webhooks, and R2-backed dashboard HTML delivery.

**Repo:** `worker.js` (root), `wrangler.production.toml` (bindings only with approval).

**Wires in:** Binds `DB`, `DASHBOARD`, `TOOLS`, `AUTORAG_BUCKET`, DOs (`AGENT_SESSION`, `IAM_COLLAB`), queues, AI. UI never calls provider keys directly; browser hits same origin APIs.

**UI integration:** New screens call **existing** `/api/...` patterns or add a small handler block in `worker.js` (with review). Prefer JSON + SSE shapes already used by `AgentDashboard.jsx`.

**Do not:** Change locked OAuth handlers without explicit line approval.

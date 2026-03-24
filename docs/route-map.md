# IAM worker route map

Auto-generated from `worker.js` (Cloudflare Workers `fetch`, not Express). Each `##` section below is one ingest chunk (method + path as title).

Total route patterns: **259**.

## varies /

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~4012
- **Auth:** see handler
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (path === '/' || path === '/index.html') {`

## GET/POST /api/admin/overnight/start

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~2692
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if ((pathLower === '/api/admin/overnight/validate' || pathLower === '/api/admin/overnight/start') && (request.method || 'GET').toUpperCase() === 'POST') {`

## varies /api/admin/overnight/start

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~2702
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/admin/overnight/start') {`

## GET/POST /api/admin/overnight/validate

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~2692
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if ((pathLower === '/api/admin/overnight/validate' || pathLower === '/api/admin/overnight/start') && (request.method || 'GET').toUpperCase() === 'POST') {`

## varies /api/admin/overnight/validate

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~2698
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/admin/overnight/validate') {`

## GET/POST /api/admin/reindex-codebase

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~2767
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/admin/reindex-codebase' && (request.method || 'GET').toUpperCase() === 'POST') {`

## GET/POST /api/admin/trigger-workflow

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~2772
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/admin/trigger-workflow' && (request.method || 'GET').toUpperCase() === 'POST') {`

## GET/POST /api/admin/vectorize-kb

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~2709
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/admin/vectorize-kb' && (request.method || 'GET').toUpperCase() === 'POST') {`

## prefix /api/agent*

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~3091
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside handlePhase1PlatformD1Routes.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower.startsWith('/api/agent') || pathLower.startsWith('/api/terminal') || pathLower.startsWith('/api/playwright') || pathLower.startsWith('/api/images') || pathLower.startsWith('/api/screensh`

## varies /api/agent/boot

- **Handler:** handleAgentApi (lines 6958-9381)
- **Line:** ~6965
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/boot') {`

## GET /api/agent/bootstrap

- **Handler:** handleAgentApi (lines 6958-9381)
- **Line:** ~9277
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/bootstrap' && method === 'GET') {`

## POST /api/agent/chat

- **Handler:** handleAgentApi (lines 6958-9381)
- **Line:** ~7800
- **Auth:** usually session (see handler)
- **Description:** Main Agent Sam chat. JSON body: messages, model_id, mode, stream, tools. Runs AutoRAG (AI Search) when enabled; prepends pgvector `match_documents` context when HYPERDRIVE is bound.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/chat' && method === 'POST') {`

## POST /api/agent/chat/execute-approved-tool

- **Handler:** handleAgentApi (lines 6958-9381)
- **Line:** ~8928
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/chat/execute-approved-tool' && method === 'POST') {`

## varies /api/agent/cidi

- **Handler:** handleAgentApi (lines 6958-9381)
- **Line:** ~8741
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/cidi') {`

## POST /api/agent/commands/execute

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~3005
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/commands/execute' && request.method === 'POST') {`

## GET /api/agent/context/bootstrap

- **Handler:** handleAgentApi (lines 6958-9381)
- **Line:** ~9255
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/context/bootstrap' && method === 'GET') {`

## GET /api/agent/conversations/search

- **Handler:** handleAgentApi (lines 6958-9381)
- **Line:** ~7027
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/conversations/search' && method === 'GET') {`

## varies /api/agent/mcp

- **Handler:** handleAgentApi (lines 6958-9381)
- **Line:** ~8734
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE, KV
- **Code:** `if (pathLower === '/api/agent/mcp') {`

## varies /api/agent/models

- **Handler:** handleAgentApi (lines 6958-9381)
- **Line:** ~7462
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/models') {`

## POST /api/agent/plan/approve

- **Handler:** handleAgentApi (lines 6958-9381)
- **Line:** ~8894
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/plan/approve' && method === 'POST') {`

## POST /api/agent/plan/reject

- **Handler:** handleAgentApi (lines 6958-9381)
- **Line:** ~8911
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/plan/reject' && method === 'POST') {`

## POST /api/agent/playwright

- **Handler:** handleAgentApi (lines 6958-9381)
- **Line:** ~8720
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE, MYBROWSER
- **Code:** `if (pathLower === '/api/agent/playwright' && method === 'POST') {`

## GET /api/agent/proposals/pending

- **Handler:** handleAgentApi (lines 6958-9381)
- **Line:** ~7727
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/proposals/pending' && method === 'GET') {`

## POST /api/agent/propose

- **Handler:** handleAgentApi (lines 6958-9381)
- **Line:** ~7637
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/propose' && method === 'POST') {`

## POST /api/agent/queue

- **Handler:** handleAgentApi (lines 6958-9381)
- **Line:** ~8825
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/queue' && method === 'POST') {`

## GET /api/agent/queue/status

- **Handler:** handleAgentApi (lines 6958-9381)
- **Line:** ~8850
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/queue/status' && method === 'GET') {`

## POST /api/agent/r2-save

- **Handler:** handleAgentApi (lines 6958-9381)
- **Line:** ~9336
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DASHBOARD, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/r2-save' && method === 'POST') {`

## POST /api/agent/rag/compact-chats

- **Handler:** handleAgentApi (lines 6958-9381)
- **Line:** ~8805
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/rag/compact-chats' && method === 'POST') {`

## POST /api/agent/rag/index-memory

- **Handler:** handleAgentApi (lines 6958-9381)
- **Line:** ~8792
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/rag/index-memory' && method === 'POST') {`

## POST /api/agent/rag/query

- **Handler:** handleAgentApi (lines 6958-9381)
- **Line:** ~8763
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/rag/query' && method === 'POST') {`

## GET /api/agent/rag/status

- **Handler:** handleAgentApi (lines 6958-9381)
- **Line:** ~8782
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/rag/status' && method === 'GET') {`

## GET /api/agent/rules

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~1799
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `(pathLower === '/api/agent/rules' && method === 'GET') ||`

## POST /api/agent/sessions

- **Handler:** handleAgentApi (lines 6958-9381)
- **Line:** ~7490
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/sessions') {`

## varies /api/agent/telemetry

- **Handler:** handleAgentApi (lines 6958-9381)
- **Line:** ~8752
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/telemetry') {`

## POST /api/agent/terminal/complete

- **Handler:** handleAgentApi (lines 6958-9381)
- **Line:** ~7247
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/terminal/complete' && method === 'POST') {`

## GET /api/agent/terminal/config-status

- **Handler:** handleAgentApi (lines 6958-9381)
- **Line:** ~7133
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/terminal/config-status' && method === 'GET') {`

## POST /api/agent/terminal/run

- **Handler:** handleAgentApi (lines 6958-9381)
- **Line:** ~7226
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/terminal/run' && method === 'POST') {`

## GET /api/agent/terminal/socket-url

- **Handler:** handleAgentApi (lines 6958-9381)
- **Line:** ~7118
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/terminal/socket-url' && method === 'GET') {`

## GET /api/agent/terminal/ws

- **Handler:** handleAgentApi (lines 6958-9381)
- **Line:** ~7144
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/terminal/ws' && method === 'GET') {`

## GET /api/agent/today-todo

- **Handler:** handleAgentApi (lines 6958-9381)
- **Line:** ~9204
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/today-todo' && method === 'GET') {`

## PUT /api/agent/today-todo

- **Handler:** handleAgentApi (lines 6958-9381)
- **Line:** ~9230
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/today-todo' && method === 'PUT') {`

## POST /api/agent/workers-ai/image

- **Handler:** handleAgentApi (lines 6958-9381)
- **Line:** ~7550
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/workers-ai/image' && method === 'POST') {`

## POST /api/agent/workers-ai/stt

- **Handler:** handleAgentApi (lines 6958-9381)
- **Line:** ~7607
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/workers-ai/stt' && method === 'POST') {`

## POST /api/agent/workers-ai/tts

- **Handler:** handleAgentApi (lines 6958-9381)
- **Line:** ~7576
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/workers-ai/tts' && method === 'POST') {`

## POST /api/agent/workflows/trigger

- **Handler:** handleAgentApi (lines 6958-9381)
- **Line:** ~7740
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/workflows/trigger' && method === 'POST') {`

## varies /api/agentsam

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~3081
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower.startsWith('/api/agentsam/') || pathLower === '/api/agentsam') {`

## prefix /api/agentsam/*

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~3081
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside handlePhase1PlatformD1Routes.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower.startsWith('/api/agentsam/') || pathLower === '/api/agentsam') {`

## GET /api/agentsam/ai

- **Handler:** handleAgentsamApi (lines 9435-10492)
- **Line:** ~10448
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/ai' && method === 'GET') {`

## DELETE /api/agentsam/autorag/files

- **Handler:** handleAgentsamApi (lines 9435-10492)
- **Line:** ~10383
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/autorag/files' && method === 'DELETE') {`

## GET /api/agentsam/autorag/files

- **Handler:** handleAgentsamApi (lines 9435-10492)
- **Line:** ~10338
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/autorag/files' && method === 'GET') {`

## POST /api/agentsam/autorag/search

- **Handler:** handleAgentsamApi (lines 9435-10492)
- **Line:** ~10407
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/autorag/search' && method === 'POST') {`

## GET /api/agentsam/autorag/stats

- **Handler:** handleAgentsamApi (lines 9435-10492)
- **Line:** ~10321
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/autorag/stats' && method === 'GET') {`

## POST /api/agentsam/autorag/sync

- **Handler:** handleAgentsamApi (lines 9435-10492)
- **Line:** ~10359
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/autorag/sync' && method === 'POST') {`

## POST /api/agentsam/autorag/upload

- **Handler:** handleAgentsamApi (lines 9435-10492)
- **Line:** ~10392
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/autorag/upload' && method === 'POST') {`

## GET /api/agentsam/cmd-allowlist

- **Handler:** handleAgentsamApi (lines 9435-10492)
- **Line:** ~9627
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if ((pathLower === '/api/agentsam/command-allowlist' || pathLower === '/api/agentsam/cmd-allowlist') && method === 'GET') {`

## POST /api/agentsam/cmd-allowlist

- **Handler:** handleAgentsamApi (lines 9435-10492)
- **Line:** ~9641
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if ((pathLower === '/api/agentsam/command-allowlist' || pathLower === '/api/agentsam/cmd-allowlist') && method === 'POST') {`

## GET /api/agentsam/command-allowlist

- **Handler:** handleAgentsamApi (lines 9435-10492)
- **Line:** ~9627
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if ((pathLower === '/api/agentsam/command-allowlist' || pathLower === '/api/agentsam/cmd-allowlist') && method === 'GET') {`

## POST /api/agentsam/command-allowlist

- **Handler:** handleAgentsamApi (lines 9435-10492)
- **Line:** ~9641
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if ((pathLower === '/api/agentsam/command-allowlist' || pathLower === '/api/agentsam/cmd-allowlist') && method === 'POST') {`

## GET /api/agentsam/feature-flags

- **Handler:** handleAgentsamApi (lines 9435-10492)
- **Line:** ~9875
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/feature-flags' && method === 'GET') {`

## GET /api/agentsam/fetch-allowlist

- **Handler:** handleAgentsamApi (lines 9435-10492)
- **Line:** ~9784
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/fetch-allowlist' && method === 'GET') {`

## POST /api/agentsam/fetch-allowlist

- **Handler:** handleAgentsamApi (lines 9435-10492)
- **Line:** ~9798
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/fetch-allowlist' && method === 'POST') {`

## GET /api/agentsam/fetch-domains

- **Handler:** handleAgentsamApi (lines 9435-10492)
- **Line:** ~9730
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/fetch-domains' && method === 'GET') {`

## POST /api/agentsam/fetch-domains

- **Handler:** handleAgentsamApi (lines 9435-10492)
- **Line:** ~9744
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/fetch-domains' && method === 'POST') {`

## GET /api/agentsam/hooks

- **Handler:** handleAgentsamApi (lines 9435-10492)
- **Line:** ~9519
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/hooks' && method === 'GET') {`

## POST /api/agentsam/hooks

- **Handler:** handleAgentsamApi (lines 9435-10492)
- **Line:** ~9557
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/hooks' && method === 'POST') {`

## GET /api/agentsam/ignore-patterns

- **Handler:** handleAgentsamApi (lines 9435-10492)
- **Line:** ~10220
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/ignore-patterns' && method === 'GET') {`

## PATCH /api/agentsam/ignore-patterns

- **Handler:** handleAgentsamApi (lines 9435-10492)
- **Line:** ~10230
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/ignore-patterns' && method === 'PATCH') {`

## POST /api/agentsam/ignore-patterns

- **Handler:** handleAgentsamApi (lines 9435-10492)
- **Line:** ~10197
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/ignore-patterns' && method === 'POST') {`

## PATCH /api/agentsam/ignore-patterns/reorder

- **Handler:** handleAgentsamApi (lines 9435-10492)
- **Line:** ~10128
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/ignore-patterns/reorder' && method === 'PATCH') {`

## GET /api/agentsam/index-status

- **Handler:** handleAgentsamApi (lines 9435-10492)
- **Line:** ~10259
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/index-status' && method === 'GET') {`

## GET /api/agentsam/indexing-summary

- **Handler:** handleAgentsamApi (lines 9435-10492)
- **Line:** ~10280
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/indexing-summary' && method === 'GET') {`

## GET /api/agentsam/mcp-allowlist

- **Handler:** handleAgentsamApi (lines 9435-10492)
- **Line:** ~9675
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE, KV
- **Code:** `if (pathLower === '/api/agentsam/mcp-allowlist' && method === 'GET') {`

## POST /api/agentsam/mcp-allowlist

- **Handler:** handleAgentsamApi (lines 9435-10492)
- **Line:** ~9689
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE, KV
- **Code:** `if (pathLower === '/api/agentsam/mcp-allowlist' && method === 'POST') {`

## GET /api/agentsam/rules

- **Handler:** handleAgentsamApi (lines 9435-10492)
- **Line:** ~9957
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/rules' && method === 'GET') {`

## POST /api/agentsam/rules

- **Handler:** handleAgentsamApi (lines 9435-10492)
- **Line:** ~9967
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/rules' && method === 'POST') {`

## GET /api/agentsam/runs

- **Handler:** handleAgentsamApi (lines 9435-10492)
- **Line:** ~10435
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/runs' && method === 'GET') {`

## GET /api/agentsam/skills

- **Handler:** handleAgentsamApi (lines 9435-10492)
- **Line:** ~10050
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/skills' && method === 'GET') {`

## POST /api/agentsam/skills

- **Handler:** handleAgentsamApi (lines 9435-10492)
- **Line:** ~10062
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/skills' && method === 'POST') {`

## GET /api/agentsam/subagents

- **Handler:** handleAgentsamApi (lines 9435-10492)
- **Line:** ~9981
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/subagents' && method === 'GET') {`

## POST /api/agentsam/subagents

- **Handler:** handleAgentsamApi (lines 9435-10492)
- **Line:** ~9992
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/subagents' && method === 'POST') {`

## GET /api/agentsam/tools-registry

- **Handler:** handleAgentsamApi (lines 9435-10492)
- **Line:** ~9710
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/tools-registry' && method === 'GET') {`

## DELETE /api/agentsam/trusted-origins

- **Handler:** handleAgentsamApi (lines 9435-10492)
- **Line:** ~9864
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/trusted-origins' && method === 'DELETE') {`

## GET /api/agentsam/trusted-origins

- **Handler:** handleAgentsamApi (lines 9435-10492)
- **Line:** ~9838
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/trusted-origins' && method === 'GET') {`

## POST /api/agentsam/trusted-origins

- **Handler:** handleAgentsamApi (lines 9435-10492)
- **Line:** ~9848
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/trusted-origins' && method === 'POST') {`

## GET /api/agentsam/user-policy

- **Handler:** handleAgentsamApi (lines 9435-10492)
- **Line:** ~9487
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/user-policy' && method === 'GET') {`

## PATCH /api/agentsam/user-policy

- **Handler:** handleAgentsamApi (lines 9435-10492)
- **Line:** ~9497
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/user-policy' && method === 'PATCH') {`

## GET /api/ai/guardrails

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~1793
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/ai/guardrails' && method === 'GET') ||`

## GET /api/ai/integrations

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~1798
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/ai/integrations' && method === 'GET') ||`

## GET /api/ai/models

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~1908
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/ai/models' && method === 'GET') {`

## GET/PATCH /api/ai/models

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~1794
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/ai/models' && method === 'GET') ||`

## GET /api/ai/routing-rules

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~1936
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/ai/routing-rules' && method === 'GET') {`

## GET/POST/PATCH/DELETE /api/ai/routing-rules

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~1796
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/ai/routing-rules' && (method === 'GET' || method === 'POST')) ||`

## POST /api/ai/routing-rules

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~1942
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/ai/routing-rules' && method === 'POST') {`

## GET /api/app-icons

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~1811
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/app-icons' && method === 'GET') ||`

## GET/POST /api/auth/backup-code

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~2684
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/auth/backup-code' && (request.method || 'GET').toUpperCase() === 'POST') {`

## GET/POST /api/auth/login

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~2681
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/auth/login' && (request.method || 'GET').toUpperCase() === 'POST') {`

## GET/POST /api/auth/logout

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~2687
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/auth/logout' && (request.method || 'GET').toUpperCase() === 'POST') {`

## GET /api/billing

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~1815
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/billing' && method === 'GET') ||`

## varies /api/billing/summary

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~2654
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/billing/summary') {`

## prefix /api/browser/*

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~2586
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside handlePhase1PlatformD1Routes.
- **Bindings (typical):** DB, MYBROWSER
- **Code:** `if (pathLower.startsWith('/api/browser/')) {`

## varies /api/browser/health

- **Handler:** handleBrowserRequest (lines 4207-4353)
- **Line:** ~4279
- **Auth:** public
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, MYBROWSER
- **Code:** `if (pathLower === '/api/browser/health') {`

## varies /api/browser/metrics

- **Handler:** handleBrowserRequest (lines 4207-4353)
- **Line:** ~4288
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, MYBROWSER
- **Code:** `if (pathLower === '/api/browser/metrics') {`

## GET /api/browser/screenshot

- **Handler:** handleBrowserRequest (lines 4207-4353)
- **Line:** ~4218
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, MYBROWSER
- **Code:** `if (pathLower === '/api/browser/screenshot' && method === 'GET') {`

## GET /api/cidi/current

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~2299
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/cidi/current' && method === 'GET') {`

## GET/POST /api/cidi/current

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~1816
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/cidi/current' && method === 'GET') ||`

## varies /api/clients

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~2629
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/clients') {`

## varies /api/colors/all

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~2619
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/colors/all') {`

## GET /api/commands

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~3122
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/commands' && request.method === 'GET') {`

## GET /api/commands/custom

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~2071
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/commands/custom' && method === 'GET') {`

## GET/POST /api/commands/custom

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~1800
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/commands/custom' && method === 'GET') ||`

## GET/POST /api/d1/query

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~3457
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/d1/query' && (request.method || 'GET').toUpperCase() === 'POST') {`

## prefix /api/dashboard/time-track*

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~2614
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside handlePhase1PlatformD1Routes.
- **Bindings (typical):** DB
- **Code:** `if (pathLower.startsWith('/api/dashboard/time-track')) {`

## POST /api/dashboard/time-track/manual

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~2608
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (url.pathname === '/api/dashboard/time-track/manual' && request.method === 'POST') {`

## POST /api/deploy/rollback

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~1817
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/deploy/rollback' && method === 'POST');`

## GET/POST /api/deployments/log

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~2445
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (url.pathname === '/api/deployments/log' && (request.method || 'GET').toUpperCase() === 'POST') {`

## GET /api/deployments/recent

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~2448
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (url.pathname === '/api/deployments/recent' && (request.method || 'GET').toUpperCase() === 'GET') {`

## prefix /api/draw*

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~3086
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside handlePhase1PlatformD1Routes.
- **Bindings (typical):** DASHBOARD, DB
- **Code:** `if (pathLower.startsWith('/api/draw')) {`

## GET /api/draw/list

- **Handler:** handleDrawApi (lines 6888-6957)
- **Line:** ~6925
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DASHBOARD, DB
- **Code:** `if (pathLower === '/api/draw/list' && method === 'GET') {`

## POST /api/draw/save

- **Handler:** handleDrawApi (lines 6888-6957)
- **Line:** ~6897
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DASHBOARD, DB
- **Code:** `if (pathLower === '/api/draw/save' && method === 'POST') {`

## varies /api/email/inbound

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~2378
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/email/inbound') {`

## prefix /api/env/*

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~3252
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside handlePhase1PlatformD1Routes.
- **Bindings (typical):** DB
- **Code:** `if (pathLower.startsWith('/api/env/')) {`

## GET /api/env/audit

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~3317
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/env/audit' && (request.method || 'GET').toUpperCase() === 'GET') {`

## GET /api/env/secrets

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~3306
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/env/secrets' && (request.method || 'GET').toUpperCase() === 'GET') {`

## GET/POST /api/env/secrets

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~3331
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/env/secrets' && (request.method || 'GET').toUpperCase() === 'POST') {`

## GET/POST /api/env/secrets/reveal

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~3357
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/env/secrets/reveal' && (request.method || 'GET').toUpperCase() === 'POST') {`

## GET /api/env/spend

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~3254
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/env/spend' && (request.method || 'GET').toUpperCase() === 'GET') {`

## prefix /api/finance/*

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~2624
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside handlePhase1PlatformD1Routes.
- **Bindings (typical):** DB
- **Code:** `if (pathLower.startsWith('/api/finance/')) {`

## varies /api/health

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~2343
- **Auth:** public
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (path === '/api/health' || pathLower === '/api/health') {`

## varies /api/hooks/cursor

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~2405
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/hooks/cursor') {`

## GET /api/hooks/executions

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~1808
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/hooks/executions' && method === 'GET') ||`

## varies /api/hooks/github

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~2402
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/hooks/github') {`

## GET /api/hooks/health

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~2374
- **Auth:** public
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if ((pathLower === '/api/webhooks/health' || pathLower === '/api/hooks/health') && methodUpper === 'GET') {`

## varies /api/hooks/internal

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~2411
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/hooks/internal') {`

## varies /api/hooks/stripe

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~2408
- **Auth:** webhook / provider secret
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/hooks/stripe') {`

## GET /api/hooks/subscriptions

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~2077
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/hooks/subscriptions' && method === 'GET') {`

## GET/POST/PATCH /api/hooks/subscriptions

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~1801
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/hooks/subscriptions' && (method === 'GET' || method === 'POST')) ||`

## POST /api/hooks/subscriptions

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~2116
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/hooks/subscriptions' && method === 'POST') {`

## PATCH /api/hooks/subscriptions/reorder

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~2146
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/hooks/subscriptions/reorder' && method === 'PATCH') {`

## PATCH/DELETE /api/hooks/subscriptions/reorder

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~1802
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/hooks/subscriptions/reorder' && method === 'PATCH') ||`

## varies /api/hooks/supabase

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~2414
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/hooks/supabase') {`

## prefix /api/hub/*

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~2639
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside handlePhase1PlatformD1Routes.
- **Bindings (typical):** DB
- **Code:** `if (pathLower.startsWith('/api/hub/')) {`

## GET /api/images

- **Handler:** handleAgentApi (lines 6958-9381)
- **Line:** ~9100
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/images' && method === 'GET') {`

## POST /api/images

- **Handler:** handleAgentApi (lines 6958-9381)
- **Line:** ~9130
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/images' && method === 'POST') {`

## prefix /api/images*

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~3091
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside handlePhase1PlatformD1Routes.
- **Bindings (typical):** DB
- **Code:** `if (pathLower.startsWith('/api/agent') || pathLower.startsWith('/api/terminal') || pathLower.startsWith('/api/playwright') || pathLower.startsWith('/api/images') || pathLower.startsWith('/api/screensh`

## prefix /api/images/*

- **Handler:** handleAgentApi (lines 6958-9381)
- **Line:** ~9177
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside handleAgentApi.
- **Bindings (typical):** DB
- **Code:** `if (pathLower.startsWith('/api/images/') && pathLower.endsWith('/meta')) {`

## GET /api/integrations/drive/list

- **Handler:** handleAgentApi (lines 6958-9381)
- **Line:** ~8946
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/integrations/drive/list' && method === 'GET') {`

## GET /api/integrations/gdrive/file

- **Handler:** handleAgentApi (lines 6958-9381)
- **Line:** ~8965
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (method === 'GET' && pathLower === '/api/integrations/gdrive/file') {`

## GET /api/integrations/gdrive/files

- **Handler:** handleAgentApi (lines 6958-9381)
- **Line:** ~8953
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (method === 'GET' && pathLower === '/api/integrations/gdrive/files') {`

## GET /api/integrations/github/file

- **Handler:** handleAgentApi (lines 6958-9381)
- **Line:** ~9003
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (method === 'GET' && pathLower === '/api/integrations/github/file') {`

## GET /api/integrations/github/files

- **Handler:** handleAgentApi (lines 6958-9381)
- **Line:** ~8989
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (method === 'GET' && pathLower === '/api/integrations/github/files') {`

## GET /api/integrations/github/list

- **Handler:** handleAgentApi (lines 6958-9381)
- **Line:** ~8949
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/integrations/github/list' && method === 'GET') {`

## GET /api/integrations/github/repos

- **Handler:** handleAgentApi (lines 6958-9381)
- **Line:** ~8977
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (method === 'GET' && pathLower === '/api/integrations/github/repos') {`

## GET/POST /api/internal/post-deploy

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~2420
- **Auth:** internal / optional secret
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if ((request.method || 'GET').toUpperCase() === 'POST' && pathLower === '/api/internal/post-deploy') {`

## GET/POST /api/internal/record-deploy

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~2453
- **Auth:** internal / optional secret
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if ((request.method || 'GET').toUpperCase() === 'POST' && pathLower === '/api/internal/record-deploy') {`

## GET /api/knowledge

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~2196
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/knowledge' && method === 'GET') {`

## GET/POST /api/knowledge

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~1809
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/knowledge' && method === 'GET') ||`

## POST /api/knowledge/crawl

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~2203
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/knowledge/crawl' && method === 'POST') {`

## POST/GET /api/knowledge/crawl

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~1810
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/knowledge/crawl' && method === 'POST') ||`

## prefix /api/mcp/*

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~3096
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside handlePhase1PlatformD1Routes.
- **Bindings (typical):** DB, KV
- **Code:** `if (pathLower.startsWith('/api/mcp/')) {`

## GET /api/mcp/a11y

- **Handler:** handleMcpApi (lines 10493-11140)
- **Line:** ~10622
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, KV
- **Code:** `if (pathLower === '/api/mcp/a11y') {`

## GET /api/mcp/agents

- **Handler:** handleMcpApi (lines 10493-11140)
- **Line:** ~10536
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE, KV
- **Code:** `if (pathLower === '/api/mcp/agents' && method === 'GET') {`

## GET /api/mcp/audit

- **Handler:** handleMcpApi (lines 10493-11140)
- **Line:** ~10515
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, KV
- **Code:** `if (pathLower === '/api/mcp/audit' && method === 'GET') {`

## GET /api/mcp/commands

- **Handler:** handleMcpApi (lines 10493-11140)
- **Line:** ~10575
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, KV
- **Code:** `if (pathLower === '/api/mcp/commands' && method === 'GET') {`

## GET /api/mcp/credentials

- **Handler:** handleMcpApi (lines 10493-11140)
- **Line:** ~10507
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, KV
- **Code:** `if (pathLower === '/api/mcp/credentials' && method === 'GET') {`

## POST /api/mcp/dispatch

- **Handler:** handleMcpApi (lines 10493-11140)
- **Line:** ~10583
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, KV
- **Code:** `if (pathLower === '/api/mcp/dispatch' && method === 'POST') {`

## GET /api/mcp/imgx

- **Handler:** handleMcpApi (lines 10493-11140)
- **Line:** ~10665
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, KV
- **Code:** `if (pathLower === '/api/mcp/imgx') {`

## POST /api/mcp/invoke

- **Handler:** handleMcpApi (lines 10493-11140)
- **Line:** ~10832
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, KV
- **Code:** `if (pathLower === '/api/mcp/invoke' && method === 'POST') {`

## GET /api/mcp/server-allowlist

- **Handler:** handleMcpApi (lines 10493-11140)
- **Line:** ~10499
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, KV
- **Code:** `if (pathLower === '/api/mcp/server-allowlist' && method === 'GET') {`

## GET /api/mcp/services

- **Handler:** handleMcpApi (lines 10493-11140)
- **Line:** ~10809
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, KV
- **Code:** `if (pathLower === '/api/mcp/services') {`

## GET /api/mcp/services/health

- **Handler:** handleMcpApi (lines 10493-11140)
- **Line:** ~10680
- **Auth:** public
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, KV
- **Code:** `if (pathLower === '/api/mcp/services/health' && method === 'GET') {`

## GET /api/mcp/stats

- **Handler:** handleMcpApi (lines 10493-11140)
- **Line:** ~10524
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, KV
- **Code:** `if (pathLower === '/api/mcp/stats' && method === 'GET') {`

## GET /api/mcp/status

- **Handler:** handleMcpApi (lines 10493-11140)
- **Line:** ~10533
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, KV
- **Code:** `if (pathLower === '/api/mcp/status' && method === 'GET') {`

## GET /api/mcp/tools

- **Handler:** handleMcpApi (lines 10493-11140)
- **Line:** ~10559
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, KV
- **Code:** `if (pathLower === '/api/mcp/tools' && method === 'GET') {`

## GET /api/mcp/workflows

- **Handler:** handleMcpApi (lines 10493-11140)
- **Line:** ~11030
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, KV
- **Code:** `if (pathLower === '/api/mcp/workflows' && method === 'GET') {`

## POST /api/mcp/workflows

- **Handler:** handleMcpApi (lines 10493-11140)
- **Line:** ~11040
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, KV
- **Code:** `if (pathLower === '/api/mcp/workflows' && method === 'POST') {`

## varies /api/oauth/github/callback

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~2673
- **Auth:** OAuth state / callback
- **Description:** GitHub OAuth redirect URI used by worker.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/oauth/github/callback') {`

## varies /api/oauth/github/start

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~2670
- **Auth:** OAuth state / callback
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/oauth/github/start') {`

## varies /api/oauth/google/callback

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~2662
- **Auth:** OAuth state / callback
- **Description:** Google OAuth redirect URI used by worker.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/oauth/google/callback') {`

## varies /api/oauth/google/start

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~2659
- **Auth:** OAuth state / callback
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/oauth/google/start') {`

## varies /api/overview/activity-strip

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~2600
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/overview/activity-strip') {`

## varies /api/overview/checkpoints

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~2597
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/overview/checkpoints') {`

## varies /api/overview/deployments

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~2603
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/overview/deployments') {`

## varies /api/overview/recent-activity

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~2594
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/overview/recent-activity') {`

## varies /api/overview/stats

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~2591
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/overview/stats') {`

## prefix /api/playwright*

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~3091
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside handlePhase1PlatformD1Routes.
- **Bindings (typical):** DB, MYBROWSER
- **Code:** `if (pathLower.startsWith('/api/agent') || pathLower.startsWith('/api/terminal') || pathLower.startsWith('/api/playwright') || pathLower.startsWith('/api/images') || pathLower.startsWith('/api/screensh`

## POST /api/playwright/screenshot

- **Handler:** handleAgentApi (lines 6958-9381)
- **Line:** ~7373
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, MYBROWSER
- **Code:** `if (pathLower === '/api/playwright/screenshot' && method === 'POST') {`

## varies /api/projects

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~2634
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/projects') {`

## prefix /api/r2/*

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~3101
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside handlePhase1PlatformD1Routes.
- **Bindings (typical):** DASHBOARD, DB
- **Code:** `if (pathLower.startsWith('/api/r2/')) {`

## varies /api/r2/buckets

- **Handler:** handleR2Api (lines 6397-6887)
- **Line:** ~6461
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DASHBOARD, DB
- **Code:** `if (pathLower === '/api/r2/buckets') {`

## POST /api/r2/buckets/bulk-action

- **Handler:** handleR2Api (lines 6397-6887)
- **Line:** ~6643
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DASHBOARD, DB
- **Code:** `if (pathLower === '/api/r2/buckets/bulk-action' && method === 'POST') {`

## DELETE /api/r2/delete

- **Handler:** handleR2Api (lines 6397-6887)
- **Line:** ~6613
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DASHBOARD, DB
- **Code:** `if (pathLower === '/api/r2/delete' && method === 'DELETE') {`

## DELETE /api/r2/file

- **Handler:** handleR2Api (lines 6397-6887)
- **Line:** ~6623
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DASHBOARD, DB
- **Code:** `if (pathLower === '/api/r2/file' && method === 'DELETE') {`

## GET /api/r2/list

- **Handler:** handleR2Api (lines 6397-6887)
- **Line:** ~6498
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DASHBOARD, DB
- **Code:** `if (pathLower === '/api/r2/list' && method === 'GET') {`

## GET /api/r2/search

- **Handler:** handleR2Api (lines 6397-6887)
- **Line:** ~6568
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DASHBOARD, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/r2/search' && method === 'GET') {`

## varies /api/r2/stats

- **Handler:** handleR2Api (lines 6397-6887)
- **Line:** ~6405
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DASHBOARD, DB
- **Code:** `if (pathLower === '/api/r2/stats') {`

## POST /api/r2/sync

- **Handler:** handleR2Api (lines 6397-6887)
- **Line:** ~6428
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DASHBOARD, DB
- **Code:** `if (pathLower === '/api/r2/sync' && method === 'POST') {`

## POST /api/r2/upload

- **Handler:** handleR2Api (lines 6397-6887)
- **Line:** ~6600
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DASHBOARD, DB
- **Code:** `if (pathLower === '/api/r2/upload' && method === 'POST') {`

## GET /api/r2/url

- **Handler:** handleR2Api (lines 6397-6887)
- **Line:** ~6635
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DASHBOARD, DB
- **Code:** `if (pathLower === '/api/r2/url' && method === 'GET') {`

## DELETE /api/screenshots

- **Handler:** handleAgentApi (lines 6958-9381)
- **Line:** ~9082
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/screenshots' && method === 'DELETE') {`

## GET /api/screenshots

- **Handler:** handleAgentApi (lines 6958-9381)
- **Line:** ~9019
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/screenshots' && method === 'GET') {`

## prefix /api/screenshots*

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~3091
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside handlePhase1PlatformD1Routes.
- **Bindings (typical):** DB
- **Code:** `if (pathLower.startsWith('/api/agent') || pathLower.startsWith('/api/terminal') || pathLower.startsWith('/api/playwright') || pathLower.startsWith('/api/images') || pathLower.startsWith('/api/screensh`

## GET /api/screenshots/asset

- **Handler:** handleAgentApi (lines 6958-9381)
- **Line:** ~9056
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/screenshots/asset' && method === 'GET') {`

## varies /api/search

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~3512
- **Auth:** usually session (see handler)
- **Description:** POST/GET search. With HYPERDRIVE: embed query (bge-large-en-v1.5) and `match_documents` via pg; else Vectorize `vectorizeRagSearch`. Logs to ai_rag_search_history.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (url.pathname === '/api/search') {`

## GET /api/search/debug

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~3483
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (url.pathname === '/api/search/debug' && (request.method || 'GET').toUpperCase() === 'GET') {`

## POST /api/search/federated

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~3478
- **Auth:** usually session (see handler)
- **Description:** POST federated search across configured sources; `handleFederatedSearch`.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (url.pathname === '/api/search/federated' && request.method === 'POST') {`

## GET /api/settings

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~1823
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/settings' && method === 'GET') {`

## GET/PATCH /api/settings

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~1791
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/settings' && method === 'GET' && (url.searchParams.get('category') || '').trim()) ||`

## PATCH /api/settings/agent-config

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~2016
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/settings/agent-config' && method === 'PATCH') {`

## PATCH/GET /api/settings/agent-config

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~1806
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `(pathLower === '/api/settings/agent-config' && method === 'PATCH') ||`

## PATCH /api/settings/appearance

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~1830
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/settings/appearance' && method === 'PATCH') {`

## PATCH/GET /api/settings/appearance

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~1792
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/settings/appearance' && method === 'PATCH') ||`

## prefix /api/settings/avatar*

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~3648
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside handlePhase1PlatformD1Routes.
- **Bindings (typical):** DB
- **Code:** `if (pathLower.startsWith('/api/settings/avatar') && (request.method || 'GET').toUpperCase() === 'GET') {`

## GET /api/settings/deploy-context

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~1804
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/settings/deploy-context' && method === 'GET') ||`

## GET /api/settings/docs-providers

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~1858
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/settings/docs-providers' && method === 'GET') {`

## GET/PATCH /api/settings/docs-providers

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~1805
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/settings/docs-providers' && method === 'GET') ||`

## GET /api/settings/emails

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~3834
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if ((request.method || 'GET').toUpperCase() === 'GET' && pathLower === '/api/settings/emails') {`

## GET /api/settings/marketplace-catalog

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~1807
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/settings/marketplace-catalog' && method === 'GET') ||`

## GET /api/settings/preferences

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~3667
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/settings/preferences') {`

## GET /api/settings/profile

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~3560
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/settings/profile') {`

## GET/POST /api/settings/profile/avatar

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~3623
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/settings/profile/avatar' && (request.method || 'GET').toUpperCase() === 'POST') {`

## GET/POST /api/settings/security/backup-codes/generate

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~3737
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/settings/security/backup-codes/generate' && (request.method || 'GET').toUpperCase() === 'POST') {`

## GET/POST /api/settings/security/change-password

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~3718
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/settings/security/change-password' && (request.method || 'GET').toUpperCase() === 'POST') {`

## GET /api/settings/sessions

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~3791
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/settings/sessions' && (request.method || 'GET').toUpperCase() === 'GET') {`

## varies /api/settings/theme

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~3945
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (url.pathname === '/api/settings/theme') {`

## PUT/PATCH /api/settings/workspace/default

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~3909
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/settings/workspace/default' && (request.method === 'PUT' || request.method === 'PATCH')) {`

## GET /api/settings/workspaces

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~3847
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/settings/workspaces' || pathLower === '/api/workspaces') {`

## GET /api/spend

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~1812
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/spend' && method === 'GET') ||`

## GET /api/spend/summary

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~1813
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/spend/summary' && method === 'GET') ||`

## GET /api/spend/unified

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~1814
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/spend/unified' && method === 'GET') ||`

## GET/POST /api/telemetry/v1/traces

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~2484
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if ((request.method || 'GET').toUpperCase() === 'POST' && pathLower === '/api/telemetry/v1/traces') {`

## prefix /api/terminal*

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~3091
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside handlePhase1PlatformD1Routes.
- **Bindings (typical):** DB
- **Code:** `if (pathLower.startsWith('/api/agent') || pathLower.startsWith('/api/terminal') || pathLower.startsWith('/api/playwright') || pathLower.startsWith('/api/images') || pathLower.startsWith('/api/screensh`

## POST /api/terminal/session/register

- **Handler:** handleAgentApi (lines 6958-9381)
- **Line:** ~7037
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/terminal/session/register' && method === 'POST') {`

## GET /api/terminal/session/resume

- **Handler:** handleAgentApi (lines 6958-9381)
- **Line:** ~7079
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/terminal/session/resume' && method === 'GET') {`

## GET /api/themes

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~3185
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/themes' && request.method === 'GET') {`

## GET /api/themes/active

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~3199
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/themes/active' && request.method === 'GET') {`

## prefix /api/vault*

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~3246
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside handlePhase1PlatformD1Routes.
- **Bindings (typical):** DB, SESSION_CACHE
- **Code:** `if (pathLower.startsWith('/api/vault')) {`

## varies /api/webhooks/cloudflare

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~2393
- **Auth:** webhook / provider secret
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/webhooks/cloudflare') {`

## varies /api/webhooks/cursor

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~2390
- **Auth:** webhook / provider secret
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/webhooks/cursor') {`

## varies /api/webhooks/github

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~2387
- **Auth:** webhook / provider secret
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/webhooks/github') {`

## GET /api/webhooks/health

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~2374
- **Auth:** webhook / provider secret
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if ((pathLower === '/api/webhooks/health' || pathLower === '/api/hooks/health') && methodUpper === 'GET') {`

## varies /api/webhooks/internal

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~2399
- **Auth:** webhook / provider secret
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/webhooks/internal') {`

## varies /api/webhooks/resend

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~2381
- **Auth:** webhook / provider secret
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/webhooks/resend') {`

## varies /api/webhooks/stripe

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~2384
- **Auth:** webhook / provider secret
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/webhooks/stripe') {`

## varies /api/webhooks/supabase

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~2396
- **Auth:** webhook / provider secret
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/webhooks/supabase') {`

## GET /api/workers

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~3106
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/workers' && (request.method || 'GET').toUpperCase() === 'GET') {`

## GET /api/workspaces

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~3847
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/settings/workspaces' || pathLower === '/api/workspaces') {`

## varies /auth/callback/github

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~2676
- **Auth:** OAuth state / callback
- **Description:** GitHub OAuth callback (locked handler).
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/auth/callback/github') {`

## varies /auth/callback/google

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~2665
- **Auth:** OAuth state / callback
- **Description:** Google OAuth callback (locked handler). Uses KV SESSION_CACHE for state.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/auth/callback/google') {`

## varies /auth/login

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~4041
- **Auth:** see handler
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/auth/signin' || pathLower === '/auth/login' || pathLower === '/auth/signup') {`

## varies /auth/signin

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~4041
- **Auth:** see handler
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/auth/signin' || pathLower === '/auth/login' || pathLower === '/auth/signup') {`

## varies /auth/signup

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~4041
- **Auth:** see handler
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/auth/signin' || pathLower === '/auth/login' || pathLower === '/auth/signup') {`

## varies /dashboard

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~4048
- **Auth:** see handler
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/dashboard' || pathLower === '/dashboard/') {`

## prefix /dashboard/*

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~4062
- **Auth:** see handler
- **Description:** Path prefix. Sub-routes resolved inside handlePhase1PlatformD1Routes.
- **Bindings (typical):** DB
- **Code:** `if (pathLower.startsWith('/dashboard/')) {`

## varies /dashboard/

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~4048
- **Auth:** see handler
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/dashboard' || pathLower === '/dashboard/') {`

## varies /health

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~2351
- **Auth:** public
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (path === '/health' || pathLower === '/health') {`

## varies /index.html

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~4012
- **Auth:** see handler
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (path === '/' || path === '/index.html') {`

## prefix /static/dashboard/*

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~4081
- **Auth:** see handler
- **Description:** Path prefix. Sub-routes resolved inside handlePhase1PlatformD1Routes.
- **Bindings (typical):** DB
- **Code:** `if (!obj && pathLower.startsWith('/static/dashboard/') && env.DASHBOARD) {`

## prefix /static/dashboard/agent/*

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~4094
- **Auth:** see handler
- **Description:** Path prefix. Sub-routes resolved inside handlePhase1PlatformD1Routes.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `const noCache = pathLower.startsWith('/static/dashboard/agent/') || pathLower.startsWith('/dashboard/') || url.searchParams.has('v');`

## varies /static/dashboard/glb-viewer.html

- **Handler:** handlePhase1PlatformD1Routes (lines 1788-4153)
- **Line:** ~4076
- **Auth:** see handler
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (!obj && pathLower === '/static/dashboard/glb-viewer.html' && env.DASHBOARD) {`


# IAM worker route map

Auto-generated from `worker.js` (Cloudflare Workers `fetch`, not Express). Each `##` section below is one ingest chunk (method + path as title).

Total route patterns: **282**.

## varies /

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~4472
- **Auth:** see handler
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (path === '/' || path === '/index.html') {`

## GET/POST /api/admin/overnight/start

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2898
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if ((pathLower === '/api/admin/overnight/validate' || pathLower === '/api/admin/overnight/start') && (request.method || 'GET').toUpperCase() === 'POST') {`

## varies /api/admin/overnight/start

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2908
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/admin/overnight/start') {`

## GET/POST /api/admin/overnight/validate

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2898
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if ((pathLower === '/api/admin/overnight/validate' || pathLower === '/api/admin/overnight/start') && (request.method || 'GET').toUpperCase() === 'POST') {`

## varies /api/admin/overnight/validate

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2904
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/admin/overnight/validate') {`

## GET/POST /api/admin/reindex-codebase

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2990
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/admin/reindex-codebase' && (request.method || 'GET').toUpperCase() === 'POST') {`

## GET /api/admin/retention

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2914
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/admin/retention' && (request.method || 'GET').toUpperCase() === 'GET') {`

## GET/POST /api/admin/trigger-workflow

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2995
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/admin/trigger-workflow' && (request.method || 'GET').toUpperCase() === 'POST') {`

## GET/POST /api/admin/vectorize-kb

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2932
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/admin/vectorize-kb' && (request.method || 'GET').toUpperCase() === 'POST') {`

## prefix /api/agent*

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~3314
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside handlePhase1PlatformD1Routes.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower.startsWith('/api/agent') || pathLower.startsWith('/api/terminal') || pathLower.startsWith('/api/playwright') || pathLower.startsWith('/api/images') || pathLower.startsWith('/api/screensh`

## varies /api/agent/boot

- **Handler:** handleAgentApi (lines 7742-10688)
- **Line:** ~8145
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/boot') {`

## GET /api/agent/bootstrap

- **Handler:** handleAgentApi (lines 7742-10688)
- **Line:** ~10584
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/bootstrap' && method === 'GET') {`

## POST /api/agent/chat

- **Handler:** handleAgentApi (lines 7742-10688)
- **Line:** ~9002
- **Auth:** usually session (see handler)
- **Description:** Main Agent Sam chat. JSON body: messages, model_id, mode, stream, tools. Runs AutoRAG (AI Search) when enabled; prepends pgvector `match_documents` context when HYPERDRIVE is bound.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/chat' && method === 'POST') {`

## POST /api/agent/chat/execute-approved-tool

- **Handler:** handleAgentApi (lines 7742-10688)
- **Line:** ~10230
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/chat/execute-approved-tool' && method === 'POST') {`

## varies /api/agent/cidi

- **Handler:** handleAgentApi (lines 7742-10688)
- **Line:** ~10043
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/cidi') {`

## POST /api/agent/commands/execute

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~3228
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/commands/execute' && request.method === 'POST') {`

## GET /api/agent/context-picker/catalog

- **Handler:** handleAgentApi (lines 7742-10688)
- **Line:** ~7906
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/context-picker/catalog' && method === 'GET') {`

## GET /api/agent/context/bootstrap

- **Handler:** handleAgentApi (lines 7742-10688)
- **Line:** ~10562
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/context/bootstrap' && method === 'GET') {`

## GET /api/agent/conversations/search

- **Handler:** handleAgentApi (lines 7742-10688)
- **Line:** ~8207
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/conversations/search' && method === 'GET') {`

## GET /api/agent/db/tables

- **Handler:** handleAgentApi (lines 7742-10688)
- **Line:** ~7999
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/db/tables' && method === 'GET') {`

## GET /api/agent/git/status

- **Handler:** handleAgentApi (lines 7742-10688)
- **Line:** ~8044
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/git/status' && method === 'GET') {`

## POST /api/agent/git/sync

- **Handler:** handleAgentApi (lines 7742-10688)
- **Line:** ~8098
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/git/sync' && method === 'POST') {`

## GET /api/agent/keyboard-shortcuts

- **Handler:** handleAgentApi (lines 7742-10688)
- **Line:** ~7816
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/keyboard-shortcuts' && method === 'GET') {`

## varies /api/agent/mcp

- **Handler:** handleAgentApi (lines 7742-10688)
- **Line:** ~10036
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE, KV
- **Code:** `if (pathLower === '/api/agent/mcp') {`

## GET /api/agent/memory/list

- **Handler:** handleAgentApi (lines 7742-10688)
- **Line:** ~7974
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/memory/list' && method === 'GET') {`

## POST /api/agent/memory/sync

- **Handler:** handleAgentApi (lines 7742-10688)
- **Line:** ~8015
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/memory/sync' && method === 'POST') {`

## varies /api/agent/models

- **Handler:** handleAgentApi (lines 7742-10688)
- **Line:** ~8644
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/models') {`

## GET /api/agent/modes

- **Handler:** handleAgentApi (lines 7742-10688)
- **Line:** ~7747
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/modes' && method === 'GET') {`

## GET /api/agent/notifications

- **Handler:** handleAgentApi (lines 7742-10688)
- **Line:** ~7868
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/notifications' && method === 'GET') {`

## POST /api/agent/plan/approve

- **Handler:** handleAgentApi (lines 7742-10688)
- **Line:** ~10196
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/plan/approve' && method === 'POST') {`

## POST /api/agent/plan/reject

- **Handler:** handleAgentApi (lines 7742-10688)
- **Line:** ~10213
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/plan/reject' && method === 'POST') {`

## POST /api/agent/playwright

- **Handler:** handleAgentApi (lines 7742-10688)
- **Line:** ~10022
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE, MYBROWSER
- **Code:** `if (pathLower === '/api/agent/playwright' && method === 'POST') {`

## GET /api/agent/problems

- **Handler:** handleAgentApi (lines 7742-10688)
- **Line:** ~7760
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/problems' && method === 'GET') {`

## GET /api/agent/proposals/pending

- **Handler:** handleAgentApi (lines 7742-10688)
- **Line:** ~8917
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/proposals/pending' && method === 'GET') {`

## POST /api/agent/propose

- **Handler:** handleAgentApi (lines 7742-10688)
- **Line:** ~8819
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/propose' && method === 'POST') {`

## POST /api/agent/queue

- **Handler:** handleAgentApi (lines 7742-10688)
- **Line:** ~10127
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/queue' && method === 'POST') {`

## GET /api/agent/queue/status

- **Handler:** handleAgentApi (lines 7742-10688)
- **Line:** ~10152
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/queue/status' && method === 'GET') {`

## POST /api/agent/r2-save

- **Handler:** handleAgentApi (lines 7742-10688)
- **Line:** ~10643
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DASHBOARD, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/r2-save' && method === 'POST') {`

## POST /api/agent/rag/compact-chats

- **Handler:** handleAgentApi (lines 7742-10688)
- **Line:** ~10107
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/rag/compact-chats' && method === 'POST') {`

## POST /api/agent/rag/index-memory

- **Handler:** handleAgentApi (lines 7742-10688)
- **Line:** ~10094
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/rag/index-memory' && method === 'POST') {`

## POST /api/agent/rag/query

- **Handler:** handleAgentApi (lines 7742-10688)
- **Line:** ~10065
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/rag/query' && method === 'POST') {`

## GET /api/agent/rag/status

- **Handler:** handleAgentApi (lines 7742-10688)
- **Line:** ~10084
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/rag/status' && method === 'GET') {`

## POST /api/agent/reindex-codebase

- **Handler:** handleAgentApi (lines 7742-10688)
- **Line:** ~8028
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/reindex-codebase' && method === 'POST') {`

## GET /api/agent/rules

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2002
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `(pathLower === '/api/agent/rules' && method === 'GET') ||`

## POST /api/agent/sessions

- **Handler:** handleAgentApi (lines 7742-10688)
- **Line:** ~8672
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/sessions') {`

## varies /api/agent/telemetry

- **Handler:** handleAgentApi (lines 7742-10688)
- **Line:** ~10054
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/telemetry') {`

## POST /api/agent/terminal/complete

- **Handler:** handleAgentApi (lines 7742-10688)
- **Line:** ~8429
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/terminal/complete' && method === 'POST') {`

## GET /api/agent/terminal/config-status

- **Handler:** handleAgentApi (lines 7742-10688)
- **Line:** ~8313
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/terminal/config-status' && method === 'GET') {`

## POST /api/agent/terminal/run

- **Handler:** handleAgentApi (lines 7742-10688)
- **Line:** ~8408
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/terminal/run' && method === 'POST') {`

## GET /api/agent/terminal/socket-url

- **Handler:** handleAgentApi (lines 7742-10688)
- **Line:** ~8298
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/terminal/socket-url' && method === 'GET') {`

## GET /api/agent/terminal/ws

- **Handler:** handleAgentApi (lines 7742-10688)
- **Line:** ~8324
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/terminal/ws' && method === 'GET') {`

## GET /api/agent/today-todo

- **Handler:** handleAgentApi (lines 7742-10688)
- **Line:** ~10511
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/today-todo' && method === 'GET') {`

## PUT /api/agent/today-todo

- **Handler:** handleAgentApi (lines 7742-10688)
- **Line:** ~10537
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/today-todo' && method === 'PUT') {`

## POST /api/agent/workers-ai/image

- **Handler:** handleAgentApi (lines 7742-10688)
- **Line:** ~8732
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/workers-ai/image' && method === 'POST') {`

## POST /api/agent/workers-ai/stt

- **Handler:** handleAgentApi (lines 7742-10688)
- **Line:** ~8789
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/workers-ai/stt' && method === 'POST') {`

## POST /api/agent/workers-ai/tts

- **Handler:** handleAgentApi (lines 7742-10688)
- **Line:** ~8758
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/workers-ai/tts' && method === 'POST') {`

## POST /api/agent/workflows/trigger

- **Handler:** handleAgentApi (lines 7742-10688)
- **Line:** ~8930
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agent/workflows/trigger' && method === 'POST') {`

## varies /api/agentsam

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~3304
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower.startsWith('/api/agentsam/') || pathLower === '/api/agentsam') {`

## prefix /api/agentsam/*

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~3304
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside handlePhase1PlatformD1Routes.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower.startsWith('/api/agentsam/') || pathLower === '/api/agentsam') {`

## GET /api/agentsam/ai

- **Handler:** handleAgentsamApi (lines 10742-11799)
- **Line:** ~11755
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/ai' && method === 'GET') {`

## DELETE /api/agentsam/autorag/files

- **Handler:** handleAgentsamApi (lines 10742-11799)
- **Line:** ~11690
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/autorag/files' && method === 'DELETE') {`

## GET /api/agentsam/autorag/files

- **Handler:** handleAgentsamApi (lines 10742-11799)
- **Line:** ~11645
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/autorag/files' && method === 'GET') {`

## POST /api/agentsam/autorag/search

- **Handler:** handleAgentsamApi (lines 10742-11799)
- **Line:** ~11714
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/autorag/search' && method === 'POST') {`

## GET /api/agentsam/autorag/stats

- **Handler:** handleAgentsamApi (lines 10742-11799)
- **Line:** ~11628
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/autorag/stats' && method === 'GET') {`

## POST /api/agentsam/autorag/sync

- **Handler:** handleAgentsamApi (lines 10742-11799)
- **Line:** ~11666
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/autorag/sync' && method === 'POST') {`

## POST /api/agentsam/autorag/upload

- **Handler:** handleAgentsamApi (lines 10742-11799)
- **Line:** ~11699
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/autorag/upload' && method === 'POST') {`

## GET /api/agentsam/cmd-allowlist

- **Handler:** handleAgentsamApi (lines 10742-11799)
- **Line:** ~10934
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if ((pathLower === '/api/agentsam/command-allowlist' || pathLower === '/api/agentsam/cmd-allowlist') && method === 'GET') {`

## POST /api/agentsam/cmd-allowlist

- **Handler:** handleAgentsamApi (lines 10742-11799)
- **Line:** ~10948
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if ((pathLower === '/api/agentsam/command-allowlist' || pathLower === '/api/agentsam/cmd-allowlist') && method === 'POST') {`

## GET /api/agentsam/command-allowlist

- **Handler:** handleAgentsamApi (lines 10742-11799)
- **Line:** ~10934
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if ((pathLower === '/api/agentsam/command-allowlist' || pathLower === '/api/agentsam/cmd-allowlist') && method === 'GET') {`

## POST /api/agentsam/command-allowlist

- **Handler:** handleAgentsamApi (lines 10742-11799)
- **Line:** ~10948
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if ((pathLower === '/api/agentsam/command-allowlist' || pathLower === '/api/agentsam/cmd-allowlist') && method === 'POST') {`

## GET /api/agentsam/feature-flags

- **Handler:** handleAgentsamApi (lines 10742-11799)
- **Line:** ~11182
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/feature-flags' && method === 'GET') {`

## GET /api/agentsam/fetch-allowlist

- **Handler:** handleAgentsamApi (lines 10742-11799)
- **Line:** ~11091
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/fetch-allowlist' && method === 'GET') {`

## POST /api/agentsam/fetch-allowlist

- **Handler:** handleAgentsamApi (lines 10742-11799)
- **Line:** ~11105
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/fetch-allowlist' && method === 'POST') {`

## GET /api/agentsam/fetch-domains

- **Handler:** handleAgentsamApi (lines 10742-11799)
- **Line:** ~11037
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/fetch-domains' && method === 'GET') {`

## POST /api/agentsam/fetch-domains

- **Handler:** handleAgentsamApi (lines 10742-11799)
- **Line:** ~11051
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/fetch-domains' && method === 'POST') {`

## GET /api/agentsam/hooks

- **Handler:** handleAgentsamApi (lines 10742-11799)
- **Line:** ~10826
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/hooks' && method === 'GET') {`

## POST /api/agentsam/hooks

- **Handler:** handleAgentsamApi (lines 10742-11799)
- **Line:** ~10864
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/hooks' && method === 'POST') {`

## GET /api/agentsam/ignore-patterns

- **Handler:** handleAgentsamApi (lines 10742-11799)
- **Line:** ~11527
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/ignore-patterns' && method === 'GET') {`

## PATCH /api/agentsam/ignore-patterns

- **Handler:** handleAgentsamApi (lines 10742-11799)
- **Line:** ~11537
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/ignore-patterns' && method === 'PATCH') {`

## POST /api/agentsam/ignore-patterns

- **Handler:** handleAgentsamApi (lines 10742-11799)
- **Line:** ~11504
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/ignore-patterns' && method === 'POST') {`

## PATCH /api/agentsam/ignore-patterns/reorder

- **Handler:** handleAgentsamApi (lines 10742-11799)
- **Line:** ~11435
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/ignore-patterns/reorder' && method === 'PATCH') {`

## GET /api/agentsam/index-status

- **Handler:** handleAgentsamApi (lines 10742-11799)
- **Line:** ~11566
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/index-status' && method === 'GET') {`

## GET /api/agentsam/indexing-summary

- **Handler:** handleAgentsamApi (lines 10742-11799)
- **Line:** ~11587
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/indexing-summary' && method === 'GET') {`

## GET /api/agentsam/mcp-allowlist

- **Handler:** handleAgentsamApi (lines 10742-11799)
- **Line:** ~10982
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE, KV
- **Code:** `if (pathLower === '/api/agentsam/mcp-allowlist' && method === 'GET') {`

## POST /api/agentsam/mcp-allowlist

- **Handler:** handleAgentsamApi (lines 10742-11799)
- **Line:** ~10996
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE, KV
- **Code:** `if (pathLower === '/api/agentsam/mcp-allowlist' && method === 'POST') {`

## GET /api/agentsam/rules

- **Handler:** handleAgentsamApi (lines 10742-11799)
- **Line:** ~11264
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/rules' && method === 'GET') {`

## POST /api/agentsam/rules

- **Handler:** handleAgentsamApi (lines 10742-11799)
- **Line:** ~11274
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/rules' && method === 'POST') {`

## GET /api/agentsam/runs

- **Handler:** handleAgentsamApi (lines 10742-11799)
- **Line:** ~11742
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/runs' && method === 'GET') {`

## GET /api/agentsam/skills

- **Handler:** handleAgentsamApi (lines 10742-11799)
- **Line:** ~11357
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/skills' && method === 'GET') {`

## POST /api/agentsam/skills

- **Handler:** handleAgentsamApi (lines 10742-11799)
- **Line:** ~11369
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/skills' && method === 'POST') {`

## GET /api/agentsam/subagents

- **Handler:** handleAgentsamApi (lines 10742-11799)
- **Line:** ~11288
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/subagents' && method === 'GET') {`

## POST /api/agentsam/subagents

- **Handler:** handleAgentsamApi (lines 10742-11799)
- **Line:** ~11299
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/subagents' && method === 'POST') {`

## GET /api/agentsam/tools-registry

- **Handler:** handleAgentsamApi (lines 10742-11799)
- **Line:** ~11017
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/tools-registry' && method === 'GET') {`

## DELETE /api/agentsam/trusted-origins

- **Handler:** handleAgentsamApi (lines 10742-11799)
- **Line:** ~11171
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/trusted-origins' && method === 'DELETE') {`

## GET /api/agentsam/trusted-origins

- **Handler:** handleAgentsamApi (lines 10742-11799)
- **Line:** ~11145
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/trusted-origins' && method === 'GET') {`

## POST /api/agentsam/trusted-origins

- **Handler:** handleAgentsamApi (lines 10742-11799)
- **Line:** ~11155
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/trusted-origins' && method === 'POST') {`

## GET /api/agentsam/user-policy

- **Handler:** handleAgentsamApi (lines 10742-11799)
- **Line:** ~10794
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/user-policy' && method === 'GET') {`

## PATCH /api/agentsam/user-policy

- **Handler:** handleAgentsamApi (lines 10742-11799)
- **Line:** ~10804
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/agentsam/user-policy' && method === 'PATCH') {`

## GET /api/ai/guardrails

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~1996
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/ai/guardrails' && method === 'GET') ||`

## GET /api/ai/integrations

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2001
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/ai/integrations' && method === 'GET') ||`

## GET /api/ai/models

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2111
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/ai/models' && method === 'GET') {`

## GET/PATCH /api/ai/models

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~1997
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/ai/models' && method === 'GET') ||`

## GET /api/ai/routing-rules

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2139
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/ai/routing-rules' && method === 'GET') {`

## GET/POST/PATCH/DELETE /api/ai/routing-rules

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~1999
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/ai/routing-rules' && (method === 'GET' || method === 'POST')) ||`

## POST /api/ai/routing-rules

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2145
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/ai/routing-rules' && method === 'POST') {`

## GET /api/app-icons

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2014
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/app-icons' && method === 'GET') ||`

## GET/POST /api/auth/backup-code

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2890
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/auth/backup-code' && (request.method || 'GET').toUpperCase() === 'POST') {`

## GET/POST /api/auth/login

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2887
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/auth/login' && (request.method || 'GET').toUpperCase() === 'POST') {`

## GET/POST /api/auth/logout

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2893
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/auth/logout' && (request.method || 'GET').toUpperCase() === 'POST') {`

## GET /api/billing

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2018
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/billing' && method === 'GET') ||`

## varies /api/billing/summary

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2860
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/billing/summary') {`

## prefix /api/browser/*

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2792
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside handlePhase1PlatformD1Routes.
- **Bindings (typical):** DB, MYBROWSER
- **Code:** `if (pathLower.startsWith('/api/browser/')) {`

## varies /api/browser/health

- **Handler:** handleBrowserRequest (lines 4715-4861)
- **Line:** ~4787
- **Auth:** public
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, MYBROWSER
- **Code:** `if (pathLower === '/api/browser/health') {`

## varies /api/browser/metrics

- **Handler:** handleBrowserRequest (lines 4715-4861)
- **Line:** ~4796
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, MYBROWSER
- **Code:** `if (pathLower === '/api/browser/metrics') {`

## GET /api/browser/screenshot

- **Handler:** handleBrowserRequest (lines 4715-4861)
- **Line:** ~4726
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, MYBROWSER
- **Code:** `if (pathLower === '/api/browser/screenshot' && method === 'GET') {`

## prefix /api/cidi/*

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~3323
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside handlePhase1PlatformD1Routes.
- **Bindings (typical):** DB
- **Code:** `if (pathLower.startsWith('/api/cidi/')) {`

## GET /api/cidi/current

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2502
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/cidi/current' && method === 'GET') {`

## GET/POST /api/cidi/current

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2019
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/cidi/current' && method === 'GET') ||`

## POST /api/cidi/run

- **Handler:** handleCidiApi (lines 12374-12619)
- **Line:** ~12382
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/cidi/run' && method === 'POST') {`

## GET /api/cidi/runs

- **Handler:** handleCidiApi (lines 12374-12619)
- **Line:** ~12586
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/cidi/runs' && method === 'GET') {`

## varies /api/clients

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2835
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/clients') {`

## GET /api/cloudflare/workers/list

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~3349
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/cloudflare/workers/list' && (request.method || 'GET').toUpperCase() === 'GET') {`

## varies /api/colors/all

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2825
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/colors/all') {`

## GET /api/commands

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~3486
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/commands' && request.method === 'GET') {`

## GET /api/commands/custom

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2274
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/commands/custom' && method === 'GET') {`

## GET/POST /api/commands/custom

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2003
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/commands/custom' && method === 'GET') ||`

## GET/POST /api/d1/query

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~3821
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/d1/query' && (request.method || 'GET').toUpperCase() === 'POST') {`

## prefix /api/dashboard/time-track*

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2820
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside handlePhase1PlatformD1Routes.
- **Bindings (typical):** DB
- **Code:** `if (pathLower.startsWith('/api/dashboard/time-track')) {`

## POST /api/dashboard/time-track/manual

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2814
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (url.pathname === '/api/dashboard/time-track/manual' && request.method === 'POST') {`

## POST /api/deploy/rollback

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2020
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/deploy/rollback' && method === 'POST');`

## GET/POST /api/deployments/log

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2651
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (url.pathname === '/api/deployments/log' && (request.method || 'GET').toUpperCase() === 'POST') {`

## GET /api/deployments/recent

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2654
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (url.pathname === '/api/deployments/recent' && (request.method || 'GET').toUpperCase() === 'GET') {`

## prefix /api/draw*

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~3309
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside handlePhase1PlatformD1Routes.
- **Bindings (typical):** DASHBOARD, DB
- **Code:** `if (pathLower.startsWith('/api/draw')) {`

## GET /api/draw/list

- **Handler:** handleDrawApi (lines 7593-7683)
- **Line:** ~7630
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DASHBOARD, DB
- **Code:** `if (pathLower === '/api/draw/list' && method === 'GET') {`

## POST /api/draw/save

- **Handler:** handleDrawApi (lines 7593-7683)
- **Line:** ~7602
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DASHBOARD, DB
- **Code:** `if (pathLower === '/api/draw/save' && method === 'POST') {`

## varies /api/email/inbound

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2584
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/email/inbound') {`

## prefix /api/env/*

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~3616
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside handlePhase1PlatformD1Routes.
- **Bindings (typical):** DB
- **Code:** `if (pathLower.startsWith('/api/env/')) {`

## GET /api/env/audit

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~3681
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/env/audit' && (request.method || 'GET').toUpperCase() === 'GET') {`

## GET /api/env/secrets

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~3670
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/env/secrets' && (request.method || 'GET').toUpperCase() === 'GET') {`

## GET/POST /api/env/secrets

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~3695
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/env/secrets' && (request.method || 'GET').toUpperCase() === 'POST') {`

## GET/POST /api/env/secrets/reveal

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~3721
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/env/secrets/reveal' && (request.method || 'GET').toUpperCase() === 'POST') {`

## GET /api/env/spend

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~3618
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/env/spend' && (request.method || 'GET').toUpperCase() === 'GET') {`

## prefix /api/finance/*

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2830
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside handlePhase1PlatformD1Routes.
- **Bindings (typical):** DB
- **Code:** `if (pathLower.startsWith('/api/finance/')) {`

## varies /api/health

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2549
- **Auth:** public
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (path === '/api/health' || pathLower === '/api/health') {`

## varies /api/hooks/cursor

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2611
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/hooks/cursor') {`

## GET /api/hooks/executions

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2011
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/hooks/executions' && method === 'GET') ||`

## varies /api/hooks/github

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2608
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/hooks/github') {`

## GET /api/hooks/health

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2580
- **Auth:** public
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if ((pathLower === '/api/webhooks/health' || pathLower === '/api/hooks/health') && methodUpper === 'GET') {`

## varies /api/hooks/internal

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2617
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/hooks/internal') {`

## varies /api/hooks/stripe

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2614
- **Auth:** webhook / provider secret
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/hooks/stripe') {`

## GET /api/hooks/subscriptions

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2280
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/hooks/subscriptions' && method === 'GET') {`

## GET/POST/PATCH /api/hooks/subscriptions

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2004
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/hooks/subscriptions' && (method === 'GET' || method === 'POST')) ||`

## POST /api/hooks/subscriptions

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2319
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/hooks/subscriptions' && method === 'POST') {`

## PATCH /api/hooks/subscriptions/reorder

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2349
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/hooks/subscriptions/reorder' && method === 'PATCH') {`

## PATCH/DELETE /api/hooks/subscriptions/reorder

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2005
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/hooks/subscriptions/reorder' && method === 'PATCH') ||`

## varies /api/hooks/supabase

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2620
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/hooks/supabase') {`

## prefix /api/hub/*

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2845
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside handlePhase1PlatformD1Routes.
- **Bindings (typical):** DB
- **Code:** `if (pathLower.startsWith('/api/hub/')) {`

## GET /api/images

- **Handler:** handleAgentApi (lines 7742-10688)
- **Line:** ~10407
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/images' && method === 'GET') {`

## POST /api/images

- **Handler:** handleAgentApi (lines 7742-10688)
- **Line:** ~10437
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/images' && method === 'POST') {`

## prefix /api/images*

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~3314
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside handlePhase1PlatformD1Routes.
- **Bindings (typical):** DB
- **Code:** `if (pathLower.startsWith('/api/agent') || pathLower.startsWith('/api/terminal') || pathLower.startsWith('/api/playwright') || pathLower.startsWith('/api/images') || pathLower.startsWith('/api/screensh`

## prefix /api/images/*

- **Handler:** handleAgentApi (lines 7742-10688)
- **Line:** ~10484
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside handleAgentApi.
- **Bindings (typical):** DB
- **Code:** `if (pathLower.startsWith('/api/images/') && pathLower.endsWith('/meta')) {`

## GET /api/integrations/drive/list

- **Handler:** handleAgentApi (lines 7742-10688)
- **Line:** ~10253
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/integrations/drive/list' && method === 'GET') {`

## GET /api/integrations/gdrive/file

- **Handler:** handleAgentApi (lines 7742-10688)
- **Line:** ~10272
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (method === 'GET' && pathLower === '/api/integrations/gdrive/file') {`

## GET /api/integrations/gdrive/files

- **Handler:** handleAgentApi (lines 7742-10688)
- **Line:** ~10260
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (method === 'GET' && pathLower === '/api/integrations/gdrive/files') {`

## GET /api/integrations/github/file

- **Handler:** handleAgentApi (lines 7742-10688)
- **Line:** ~10310
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (method === 'GET' && pathLower === '/api/integrations/github/file') {`

## GET /api/integrations/github/files

- **Handler:** handleAgentApi (lines 7742-10688)
- **Line:** ~10296
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (method === 'GET' && pathLower === '/api/integrations/github/files') {`

## GET /api/integrations/github/list

- **Handler:** handleAgentApi (lines 7742-10688)
- **Line:** ~10256
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/integrations/github/list' && method === 'GET') {`

## GET /api/integrations/github/repos

- **Handler:** handleAgentApi (lines 7742-10688)
- **Line:** ~10284
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (method === 'GET' && pathLower === '/api/integrations/github/repos') {`

## GET/POST /api/internal/post-deploy

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2626
- **Auth:** internal / optional secret
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if ((request.method || 'GET').toUpperCase() === 'POST' && pathLower === '/api/internal/post-deploy') {`

## GET/POST /api/internal/record-deploy

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2659
- **Auth:** internal / optional secret
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if ((request.method || 'GET').toUpperCase() === 'POST' && pathLower === '/api/internal/record-deploy') {`

## GET /api/knowledge

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2399
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/knowledge' && method === 'GET') {`

## GET/POST /api/knowledge

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2012
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/knowledge' && method === 'GET') ||`

## POST /api/knowledge/crawl

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2406
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/knowledge/crawl' && method === 'POST') {`

## POST/GET /api/knowledge/crawl

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2013
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/knowledge/crawl' && method === 'POST') ||`

## prefix /api/mcp/*

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~3319
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside handlePhase1PlatformD1Routes.
- **Bindings (typical):** DB, KV
- **Code:** `if (pathLower.startsWith('/api/mcp/')) {`

## GET /api/mcp/a11y

- **Handler:** handleMcpApi (lines 11800-12373)
- **Line:** ~11929
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, KV
- **Code:** `if (pathLower === '/api/mcp/a11y') {`

## GET /api/mcp/agents

- **Handler:** handleMcpApi (lines 11800-12373)
- **Line:** ~11843
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE, KV
- **Code:** `if (pathLower === '/api/mcp/agents' && method === 'GET') {`

## GET /api/mcp/audit

- **Handler:** handleMcpApi (lines 11800-12373)
- **Line:** ~11822
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, KV
- **Code:** `if (pathLower === '/api/mcp/audit' && method === 'GET') {`

## GET /api/mcp/commands

- **Handler:** handleMcpApi (lines 11800-12373)
- **Line:** ~11882
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, KV
- **Code:** `if (pathLower === '/api/mcp/commands' && method === 'GET') {`

## GET /api/mcp/credentials

- **Handler:** handleMcpApi (lines 11800-12373)
- **Line:** ~11814
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, KV
- **Code:** `if (pathLower === '/api/mcp/credentials' && method === 'GET') {`

## POST /api/mcp/dispatch

- **Handler:** handleMcpApi (lines 11800-12373)
- **Line:** ~11890
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, KV
- **Code:** `if (pathLower === '/api/mcp/dispatch' && method === 'POST') {`

## GET /api/mcp/imgx

- **Handler:** handleMcpApi (lines 11800-12373)
- **Line:** ~11972
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, KV
- **Code:** `if (pathLower === '/api/mcp/imgx') {`

## POST /api/mcp/invoke

- **Handler:** handleMcpApi (lines 11800-12373)
- **Line:** ~12223
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, KV
- **Code:** `if (pathLower === '/api/mcp/invoke' && method === 'POST') {`

## GET /api/mcp/server-allowlist

- **Handler:** handleMcpApi (lines 11800-12373)
- **Line:** ~11806
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, KV
- **Code:** `if (pathLower === '/api/mcp/server-allowlist' && method === 'GET') {`

## GET /api/mcp/services

- **Handler:** handleMcpApi (lines 11800-12373)
- **Line:** ~12116
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, KV
- **Code:** `if (pathLower === '/api/mcp/services') {`

## GET /api/mcp/services/health

- **Handler:** handleMcpApi (lines 11800-12373)
- **Line:** ~11987
- **Auth:** public
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, KV
- **Code:** `if (pathLower === '/api/mcp/services/health' && method === 'GET') {`

## GET /api/mcp/stats

- **Handler:** handleMcpApi (lines 11800-12373)
- **Line:** ~11831
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, KV
- **Code:** `if (pathLower === '/api/mcp/stats' && method === 'GET') {`

## GET /api/mcp/status

- **Handler:** handleMcpApi (lines 11800-12373)
- **Line:** ~11840
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, KV
- **Code:** `if (pathLower === '/api/mcp/status' && method === 'GET') {`

## POST /api/mcp/stream

- **Handler:** handleMcpApi (lines 11800-12373)
- **Line:** ~12140
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, KV
- **Code:** `if (pathLower === '/api/mcp/stream' && method === 'POST') {`

## GET /api/mcp/tools

- **Handler:** handleMcpApi (lines 11800-12373)
- **Line:** ~11866
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, KV
- **Code:** `if (pathLower === '/api/mcp/tools' && method === 'GET') {`

## GET /api/mcp/workflows

- **Handler:** handleMcpApi (lines 11800-12373)
- **Line:** ~12265
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, KV
- **Code:** `if (pathLower === '/api/mcp/workflows' && method === 'GET') {`

## POST /api/mcp/workflows

- **Handler:** handleMcpApi (lines 11800-12373)
- **Line:** ~12275
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, KV
- **Code:** `if (pathLower === '/api/mcp/workflows' && method === 'POST') {`

## varies /api/oauth/github/callback

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2879
- **Auth:** OAuth state / callback
- **Description:** GitHub OAuth redirect URI used by worker.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/oauth/github/callback') {`

## varies /api/oauth/github/start

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2876
- **Auth:** OAuth state / callback
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/oauth/github/start') {`

## varies /api/oauth/google/callback

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2868
- **Auth:** OAuth state / callback
- **Description:** Google OAuth redirect URI used by worker.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/oauth/google/callback') {`

## varies /api/oauth/google/start

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2865
- **Auth:** OAuth state / callback
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/oauth/google/start') {`

## varies /api/overview/activity-strip

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2806
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/overview/activity-strip') {`

## varies /api/overview/checkpoints

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2803
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/overview/checkpoints') {`

## varies /api/overview/deployments

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2809
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/overview/deployments') {`

## varies /api/overview/recent-activity

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2800
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/overview/recent-activity') {`

## varies /api/overview/stats

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2797
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/overview/stats') {`

## prefix /api/playwright*

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~3314
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside handlePhase1PlatformD1Routes.
- **Bindings (typical):** DB, MYBROWSER
- **Code:** `if (pathLower.startsWith('/api/agent') || pathLower.startsWith('/api/terminal') || pathLower.startsWith('/api/playwright') || pathLower.startsWith('/api/images') || pathLower.startsWith('/api/screensh`

## POST /api/playwright/screenshot

- **Handler:** handleAgentApi (lines 7742-10688)
- **Line:** ~8555
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB, MYBROWSER
- **Code:** `if (pathLower === '/api/playwright/screenshot' && method === 'POST') {`

## varies /api/projects

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2840
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/projects') {`

## prefix /api/r2/*

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~3328
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside handlePhase1PlatformD1Routes.
- **Bindings (typical):** DASHBOARD, DB
- **Code:** `if (pathLower.startsWith('/api/r2/')) {`

## varies /api/r2/buckets

- **Handler:** handleR2Api (lines 7102-7592)
- **Line:** ~7166
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DASHBOARD, DB
- **Code:** `if (pathLower === '/api/r2/buckets') {`

## POST /api/r2/buckets/bulk-action

- **Handler:** handleR2Api (lines 7102-7592)
- **Line:** ~7348
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DASHBOARD, DB
- **Code:** `if (pathLower === '/api/r2/buckets/bulk-action' && method === 'POST') {`

## DELETE /api/r2/delete

- **Handler:** handleR2Api (lines 7102-7592)
- **Line:** ~7318
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DASHBOARD, DB
- **Code:** `if (pathLower === '/api/r2/delete' && method === 'DELETE') {`

## DELETE /api/r2/file

- **Handler:** handleR2Api (lines 7102-7592)
- **Line:** ~7328
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DASHBOARD, DB
- **Code:** `if (pathLower === '/api/r2/file' && method === 'DELETE') {`

## GET /api/r2/list

- **Handler:** handleR2Api (lines 7102-7592)
- **Line:** ~7203
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DASHBOARD, DB
- **Code:** `if (pathLower === '/api/r2/list' && method === 'GET') {`

## GET /api/r2/search

- **Handler:** handleR2Api (lines 7102-7592)
- **Line:** ~7273
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DASHBOARD, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/r2/search' && method === 'GET') {`

## varies /api/r2/stats

- **Handler:** handleR2Api (lines 7102-7592)
- **Line:** ~7110
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DASHBOARD, DB
- **Code:** `if (pathLower === '/api/r2/stats') {`

## POST /api/r2/sync

- **Handler:** handleR2Api (lines 7102-7592)
- **Line:** ~7133
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DASHBOARD, DB
- **Code:** `if (pathLower === '/api/r2/sync' && method === 'POST') {`

## POST /api/r2/upload

- **Handler:** handleR2Api (lines 7102-7592)
- **Line:** ~7305
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DASHBOARD, DB
- **Code:** `if (pathLower === '/api/r2/upload' && method === 'POST') {`

## GET /api/r2/url

- **Handler:** handleR2Api (lines 7102-7592)
- **Line:** ~7340
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DASHBOARD, DB
- **Code:** `if (pathLower === '/api/r2/url' && method === 'GET') {`

## DELETE /api/screenshots

- **Handler:** handleAgentApi (lines 7742-10688)
- **Line:** ~10389
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/screenshots' && method === 'DELETE') {`

## GET /api/screenshots

- **Handler:** handleAgentApi (lines 7742-10688)
- **Line:** ~10326
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/screenshots' && method === 'GET') {`

## prefix /api/screenshots*

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~3314
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside handlePhase1PlatformD1Routes.
- **Bindings (typical):** DB
- **Code:** `if (pathLower.startsWith('/api/agent') || pathLower.startsWith('/api/terminal') || pathLower.startsWith('/api/playwright') || pathLower.startsWith('/api/images') || pathLower.startsWith('/api/screensh`

## GET /api/screenshots/asset

- **Handler:** handleAgentApi (lines 7742-10688)
- **Line:** ~10363
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/screenshots/asset' && method === 'GET') {`

## varies /api/search

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~3961
- **Auth:** usually session (see handler)
- **Description:** POST/GET search. With HYPERDRIVE: embed query (bge-large-en-v1.5) and `match_documents` via pg; else Vectorize `vectorizeRagSearch`. Logs to ai_rag_search_history.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (url.pathname === '/api/search') {`

## GET /api/search/debug

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~3847
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (url.pathname === '/api/search/debug' && (request.method || 'GET').toUpperCase() === 'GET') {`

## POST /api/search/docs

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~3876
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (url.pathname === '/api/search/docs' && request.method === 'POST') {`

## POST /api/search/docs/index

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~3945
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (url.pathname === '/api/search/docs/index' && request.method === 'POST') {`

## GET /api/search/docs/status

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~3920
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (url.pathname === '/api/search/docs/status' && request.method === 'GET') {`

## POST /api/search/federated

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~3842
- **Auth:** usually session (see handler)
- **Description:** POST federated search across configured sources; `handleFederatedSearch`.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (url.pathname === '/api/search/federated' && request.method === 'POST') {`

## GET /api/settings

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2026
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/settings' && method === 'GET') {`

## GET/PATCH /api/settings

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~1994
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/settings' && method === 'GET' && (url.searchParams.get('category') || '').trim()) ||`

## PATCH /api/settings/agent-config

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2219
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `if (pathLower === '/api/settings/agent-config' && method === 'PATCH') {`

## PATCH/GET /api/settings/agent-config

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2009
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `(pathLower === '/api/settings/agent-config' && method === 'PATCH') ||`

## PATCH /api/settings/appearance

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2033
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/settings/appearance' && method === 'PATCH') {`

## PATCH/GET /api/settings/appearance

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~1995
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/settings/appearance' && method === 'PATCH') ||`

## prefix /api/settings/avatar*

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~4097
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside handlePhase1PlatformD1Routes.
- **Bindings (typical):** DB
- **Code:** `if (pathLower.startsWith('/api/settings/avatar') && (request.method || 'GET').toUpperCase() === 'GET') {`

## GET /api/settings/deploy-context

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2007
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/settings/deploy-context' && method === 'GET') ||`

## GET /api/settings/docs-providers

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2061
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/settings/docs-providers' && method === 'GET') {`

## GET/PATCH /api/settings/docs-providers

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2008
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/settings/docs-providers' && method === 'GET') ||`

## GET /api/settings/emails

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~4283
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if ((request.method || 'GET').toUpperCase() === 'GET' && pathLower === '/api/settings/emails') {`

## GET /api/settings/marketplace-catalog

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2010
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/settings/marketplace-catalog' && method === 'GET') ||`

## GET /api/settings/preferences

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~4116
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/settings/preferences') {`

## GET /api/settings/profile

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~4009
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/settings/profile') {`

## GET/POST /api/settings/profile/avatar

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~4072
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/settings/profile/avatar' && (request.method || 'GET').toUpperCase() === 'POST') {`

## GET/POST /api/settings/security/backup-codes/generate

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~4186
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/settings/security/backup-codes/generate' && (request.method || 'GET').toUpperCase() === 'POST') {`

## GET/POST /api/settings/security/change-password

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~4167
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/settings/security/change-password' && (request.method || 'GET').toUpperCase() === 'POST') {`

## GET /api/settings/sessions

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~4240
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/settings/sessions' && (request.method || 'GET').toUpperCase() === 'GET') {`

## varies /api/settings/theme

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~4394
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (url.pathname === '/api/settings/theme') {`

## PUT/PATCH /api/settings/workspace/default

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~4358
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/settings/workspace/default' && (request.method === 'PUT' || request.method === 'PATCH')) {`

## GET /api/settings/workspaces

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~4296
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/settings/workspaces' || pathLower === '/api/workspaces') {`

## GET /api/spend

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2015
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/spend' && method === 'GET') ||`

## GET /api/spend/summary

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2016
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/spend/summary' && method === 'GET') ||`

## GET /api/spend/unified

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2017
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `(pathLower === '/api/spend/unified' && method === 'GET') ||`

## GET/POST /api/telemetry/v1/traces

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2690
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if ((request.method || 'GET').toUpperCase() === 'POST' && pathLower === '/api/telemetry/v1/traces') {`

## prefix /api/terminal*

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~3314
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside handlePhase1PlatformD1Routes.
- **Bindings (typical):** DB
- **Code:** `if (pathLower.startsWith('/api/agent') || pathLower.startsWith('/api/terminal') || pathLower.startsWith('/api/playwright') || pathLower.startsWith('/api/images') || pathLower.startsWith('/api/screensh`

## POST /api/terminal/session/register

- **Handler:** handleAgentApi (lines 7742-10688)
- **Line:** ~8217
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/terminal/session/register' && method === 'POST') {`

## GET /api/terminal/session/resume

- **Handler:** handleAgentApi (lines 7742-10688)
- **Line:** ~8259
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/terminal/session/resume' && method === 'GET') {`

## GET /api/themes

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~3549
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/themes' && request.method === 'GET') {`

## GET /api/themes/active

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~3563
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/themes/active' && request.method === 'GET') {`

## GET/POST /api/tunnel/restart

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~3456
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/tunnel/restart' && (request.method || 'GET').toUpperCase() === 'POST') {`

## GET /api/tunnel/status

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~3406
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/tunnel/status' && (request.method || 'GET').toUpperCase() === 'GET') {`

## prefix /api/vault*

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~3610
- **Auth:** usually session (see handler)
- **Description:** Path prefix. Sub-routes resolved inside handlePhase1PlatformD1Routes.
- **Bindings (typical):** DB, SESSION_CACHE
- **Code:** `if (pathLower.startsWith('/api/vault')) {`

## varies /api/webhooks/cloudflare

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2599
- **Auth:** webhook / provider secret
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/webhooks/cloudflare') {`

## varies /api/webhooks/cursor

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2596
- **Auth:** webhook / provider secret
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/webhooks/cursor') {`

## varies /api/webhooks/github

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2593
- **Auth:** webhook / provider secret
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/webhooks/github') {`

## GET /api/webhooks/health

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2580
- **Auth:** webhook / provider secret
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if ((pathLower === '/api/webhooks/health' || pathLower === '/api/hooks/health') && methodUpper === 'GET') {`

## varies /api/webhooks/internal

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2605
- **Auth:** webhook / provider secret
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/webhooks/internal') {`

## varies /api/webhooks/resend

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2587
- **Auth:** webhook / provider secret
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/webhooks/resend') {`

## varies /api/webhooks/stripe

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2590
- **Auth:** webhook / provider secret
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/webhooks/stripe') {`

## varies /api/webhooks/supabase

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2602
- **Auth:** webhook / provider secret
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/webhooks/supabase') {`

## GET /api/workers

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~3333
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/workers' && (request.method || 'GET').toUpperCase() === 'GET') {`

## GET /api/workspaces

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~4296
- **Auth:** usually session (see handler)
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/api/settings/workspaces' || pathLower === '/api/workspaces') {`

## varies /auth/callback/github

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2882
- **Auth:** OAuth state / callback
- **Description:** GitHub OAuth callback (locked handler).
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/auth/callback/github') {`

## varies /auth/callback/google

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2871
- **Auth:** OAuth state / callback
- **Description:** Google OAuth callback (locked handler). Uses KV SESSION_CACHE for state.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/auth/callback/google') {`

## varies /auth/login

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~4501
- **Auth:** see handler
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/auth/signin' || pathLower === '/auth/login' || pathLower === '/auth/signup') {`

## varies /auth/signin

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~4501
- **Auth:** see handler
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/auth/signin' || pathLower === '/auth/login' || pathLower === '/auth/signup') {`

## varies /auth/signup

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~4501
- **Auth:** see handler
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/auth/signin' || pathLower === '/auth/login' || pathLower === '/auth/signup') {`

## POST /broadcast

- **Handler:** notifySam (lines 284-488)
- **Line:** ~350
- **Auth:** see handler
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (request.method === 'POST' && (url.pathname === '/broadcast' || url.pathname.endsWith('/broadcast'))) {`

## varies /dashboard

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~4508
- **Auth:** see handler
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/dashboard' || pathLower === '/dashboard/') {`

## prefix /dashboard/*

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~4522
- **Auth:** see handler
- **Description:** Path prefix. Sub-routes resolved inside handlePhase1PlatformD1Routes.
- **Bindings (typical):** DB
- **Code:** `if (pathLower.startsWith('/dashboard/')) {`

## varies /dashboard/

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~4508
- **Auth:** see handler
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (pathLower === '/dashboard' || pathLower === '/dashboard/') {`

## varies /health

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~2557
- **Auth:** public
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (path === '/health' || pathLower === '/health') {`

## varies /index.html

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~4472
- **Auth:** see handler
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (path === '/' || path === '/index.html') {`

## prefix /static/dashboard/*

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~4541
- **Auth:** see handler
- **Description:** Path prefix. Sub-routes resolved inside handlePhase1PlatformD1Routes.
- **Bindings (typical):** DB
- **Code:** `if (!obj && pathLower.startsWith('/static/dashboard/') && env.DASHBOARD) {`

## prefix /static/dashboard/agent/*

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~4554
- **Auth:** see handler
- **Description:** Path prefix. Sub-routes resolved inside handlePhase1PlatformD1Routes.
- **Bindings (typical):** AI, DB, HYPERDRIVE
- **Code:** `const noCache = pathLower.startsWith('/static/dashboard/agent/') || pathLower.startsWith('/dashboard/') || url.searchParams.has('v');`

## varies /static/dashboard/glb-viewer.html

- **Handler:** handlePhase1PlatformD1Routes (lines 1991-4661)
- **Line:** ~4536
- **Auth:** see handler
- **Description:** Matched in worker.js branch.
- **Bindings (typical):** DB
- **Code:** `if (!obj && pathLower === '/static/dashboard/glb-viewer.html' && env.DASHBOARD) {`


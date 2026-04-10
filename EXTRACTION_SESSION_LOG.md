## Open Frontend Bugs (discovered end of session)

### sandbox.inneranimalmedia.com — black screen, two console errors:
1. `scrollRef is not defined` — missing `useRef` import in the component at agent-dashboard.js:4671
2. `useState is not defined` — Gemini's fix to UnifiedSearchBar.tsx may not have been committed/built

# IAM Monolith Extraction — Session Log (April 9, 2026)

## Session Stats
- **Total commits today**: 14 (extraction session) out of ~50+ commits on April 9
- **New modular files created**: 5
- **Bugs caught and fixed during extraction**: 3
- **CI/CD pipeline fixed**: 1
- **Tooling established**: Claude Code (write) + Gemini (audit) two-agent pipeline

---

## Architecture Overview

The Agent Sam platform is migrating a ~30,000-line monolithic `worker.js` into a clean
ES-module `src/` structure. The monolith remains live and untouched during extraction —
routes are progressively lifted out one if-block at a time.

### Directory Map
```
src/
  index.js          — Modular router (entrypoint for wrangler.production.toml + CF builds)
  api/              — Domain HTTP handlers: (request, env, ctx) → Response
  integrations/     — Third-party connectors: imported by api/ handlers
  tools/builtin/    — Agent Sam tool definitions: (env, params) → { success: true, ... }
  core/             — Shared infra: auth, responses, d1 helpers, utils
  do/               — Durable Object class definitions
```

### Handler Signatures
| Type | Signature | Returns |
|------|-----------|---------|
| API Handler | `(request, env, ctx)` | `Response` via `jsonResponse()` |
| Tool Function | `(env, params)` | `{ success: true, ...data }` |
| Helper/Utility | `(DB, ...args)` or `(env, ...args)` | raw data |

### Key Infrastructure
- **Response helpers**: `src/core/responses.js` — use `jsonResponse()`, never raw `new Response()` except streaming/proxy
- **Auth**: `src/core/auth.js` — exports `getAuthUser`, `tenantIdFromEnv`
- **Tenant resolution**: always `tenantIdFromEnv(env)`, never hardcoded user strings
- **DB binding**: always `env.DB`, never pass bare `env` to D1 functions

---

## Completed Extractions

### 1. `/health` route → `src/api/health.js`
- **Commit**: `221babe`
- **Export**: `handleHealthCheck(request, env)`
- **Wired in**: `src/index.js` at `pathLower === '/health'`
- **Source**: `worker.js` line 2919
- **Fix applied**: Claude Code initially wrote `worker: 'agentsam-modular'` — caught and corrected to `'inneranimalmedia'` before commit

### 2. Vault module → `src/api/vault.js`
- **Commits**: `5d32e05`
- **Export**: `handleVaultApi(request, env)` (sole export)
- **Private helpers**: 19 `vault*` functions (unexported)
- **Wired in**: `src/index.js` at `pathLower.startsWith('/api/vault')`
- **Source**: `worker.js` lines 26252–26500
- **Bugs fixed**:
  - Hardcoded `VAULT_USER_ID = 'sam_primeaux'` replaced with `tenantIdFromEnv(env)` across all 6 callers
  - `vaultWriteAudit` refactored to accept `env` in options object so `tenantIdFromEnv` stays in scope
  - `vaultListSecrets` deduped redundant `.bind()` branch (both paths were identical)
- **Note**: `vaultCreateSecret` calls `tenantIdFromEnv(env)` twice intentionally — once for tid null-check, once for user_id bind slot

### 3. `getIntegrationToken` → `src/integrations/tokens.js`
- **Commits**: `339095f` (extraction) + `90a49da` (cleanup)
- **Export**: `getIntegrationToken(DB, userId, provider, accountId)`
- **Source**: `worker.js` line 26507 (15 lines, pure D1)
- **Previously duplicated in**: `src/core/auth.js` line 237 — removed in `90a49da`
- **Import sites updated**: `src/integrations/github.js`, `src/api/dashboard.js`
- **Bug caught by Claude Code**: `github.js` line 21 was calling `getIntegrationToken(env, ...)` — passing full `env` instead of `env.DB`. Fixed in same commit. This was a pre-existing bug in the monolith that extraction surfaced.
- **Monolith**: 29 call sites in `worker.js` remain intact (not rewired yet)

### 4. `runIntegritySnapshot` → `src/api/integrity.js`
- **Commits**: `f03a7be` (extraction) + `6fe77c5` (wiring)
- **Export**: `runIntegritySnapshot(env, triggeredBy)`
- **Source**: `worker.js` lines 7128–7257 (130 lines, pure `env.DB` SQL aggregation)
- **Wired in `src/index.js`**:
  - Manual: `path === '/api/system/health'` GET → `runIntegritySnapshot(env, 'manual')`
  - Cron: `scheduled` handler → `ctx.waitUntil(runIntegritySnapshot(env, 'cron').catch(...))`
- **Call sites in `worker.js`**: 3 remain (2903 API, 7128 definition, 25220 cron) — untouched

### 5. GitHub/integration routes → `src/integrations/github.js`
- **Commit**: `480be23`
- **Export**: `handleGithubApi(request, env, authUser)` appended to existing file
- **Routes extracted** (all from `worker.js` lines 3682–3825):
  - `GET /api/integrations/status`
  - `GET /api/integrations/gdrive/files` (OAuth refresh logic)
  - `GET /api/integrations/gdrive/file` (OAuth refresh logic)
  - `GET /api/integrations/github/repos`
  - `GET /api/integrations/github/files`
  - `GET /api/integrations/github/file`
  - `GET /api/integrations/github/raw` ← raw proxy, intentional `new Response()`
  - `GET /api/integrations/gdrive/raw` ← raw proxy, intentional `new Response()`
- **NOT YET WIRED**: `handleGithubApi` is extracted but not yet routed in `src/index.js`

---

## CI/CD Pipeline Fix

### CF Pages sandbox deploy pointing to wrong entrypoint
- **Commit**: `14da7e7`
- **File**: `scripts/deploy-cf-builds.sh` line 13
- **Problem**: `npx wrangler deploy ./worker.js -c wrangler.jsonc`
- **Fix**: `npx wrangler deploy ./src/index.js -c wrangler.jsonc`
- **Root cause**: Script predated the modular migration and was never updated
- **Impact**: Was causing CF Pages builds to fail with DO export errors on every push
- **Note**: `wrangler.production.toml` already had `main = "src/index.js"` correctly set

### Other build fixes landed earlier today (pre-extraction session)
- `0356a59` — migrate DOs to `src/do/`, prune worker.js
- `00898b8` — remove duplicate DO exports blocking build
- `585ad70` — restore SPA routing and static asset serving
- `dbf9e7b` — import DurableObject from `cloudflare:workers` in modular DO files

---

## Tooling Setup (established this session)

### Claude Code
- Launched via `claude` from repo root
- Auth: `ANTHROPIC_API_KEY` env var (resolved auth conflict by running `/logout` from claude.ai session)
- Permissions: "Allow all edits this session" (option 2) — set once per session
- Role: all file writes, extractions, fixes

### Gemini
- Role: read-only audit and verification after every commit
- Standard audit suite per extraction:
  1. Confirm export on line 1 of new file
  2. Cross-reference leakage check across all of `src/`
  3. Monolith integrity count (call sites in `worker.js` unchanged)
  4. `git log --oneline -5` sync verification

---

## Intentional Exceptions

| Exception | Location | Reason |
|-----------|----------|--------|
| `new Response()` streaming | `github.js` lines 423, 435 | Raw proxy — streams body with custom Content-Type, `jsonResponse` can't do this |
| 29 `getIntegrationToken` call sites in `worker.js` | `worker.js` | Monolith still live, progressive rewiring in future sessions |
| `handleGithubApi` not wired in `src/index.js` | — | Intentional — next session starts here |
| `worker.js` definition of `runIntegritySnapshot` at line 7128 | `worker.js` | Not deleted yet — monolith stability |

---

## What Is NOT Yet Done

### Immediately next (start of next session)
1. **Wire `handleGithubApi`** in `src/index.js` at `pathLower.startsWith('/api/integrations/')`
2. **Verify `/api/system/health` snapshot-write path** — the read path is modular but confirm the write path in `worker.js` is not orphaned

### Extraction queue (in priority order)
3. `canvas.js` integration cluster (`src/integrations/canvas.js` exists, audit what's wired)
4. `playwright.js` integration cluster (`src/integrations/playwright.js` exists, audit)
5. Progressive rewiring of 29 `getIntegrationToken` call sites in `worker.js` → import from `src/integrations/tokens.js`
6. `runIntegritySnapshot` — delete definition from `worker.js` line 7128 once both call sites import from `src/api/integrity.js`
7. Continue leaf-block extraction from `handleAgentApi` — one if-block at a time

### Longer term
- `src/api/dashboard.js` dispatcher — large, needs careful audit before touching
- `src/api/agent.js` + `agentChatSseHandler` — SSE stream, extract carefully
- All 19 tool modules in `src/tools/builtin/` — audit which are fully wired vs stubbed

---

## Non-Negotiables (pipeline rules for all agents)

- **Claude Code writes. Gemini audits. No exceptions.**
- **No autonomous prod deploys.** Pipeline: `benchmark-full.sh` (31/31 gate) → `promote-to-prod.sh`
- **Never move `handleAgentApi` wholesale.** Extract one `if (path === ...)` block at a time.
- **Always audit bindings after extraction**: `grep -roh "env\.[A-Z_]*" <file>` — confirm `env.DB` not `env` for D1 calls
- **No hardcoded user strings**: replace with `tenantIdFromEnv(env)`
- **No raw `new Response()`** except streaming/proxy routes — use `jsonResponse` from `src/core/responses.js`
- **`FloatingPreviewPanel.jsx` is protected** (~2100 lines) — do not rewrite
- **Never touch `wrangler.production.toml` or OAuth handlers** without explicit approval
- **`cloudflare_deployments` table is gone** — always use `deployments` table

---

## Repo Info
| Key | Value |
|-----|-------|
| Repo root | `~/Downloads/inneranimalmedia/inneranimalmedia-agentsam-dashboard` |
| GitHub | `SamPrimeaux/inneranimalmedia-agentsam-dashboard` |
| Sandbox worker | `inneranimal-dashboard.meauxbility.workers.dev` |
| Prod worker | `inneranimalmedia` |
| Sandbox R2 | `agent-sam-sandbox-cicd` |
| Prod R2 | `agent-sam` (binding: `DASHBOARD`) |
| Primary DB | `inneranimalmedia-business` (`cf87b717-d4e2-4cf8-bab0-a81268e32d49`) |
| MCP server | `mcp.inneranimalmedia.com/mcp` | 
### First task tomorrow before any extraction work:
grep -rn "scrollRef" src/  # find the component
grep -n "^import.*react\|^import.*React" <that file>  # check for missing useRef
# Fix: add useRef (and useState if missing) to the React import line

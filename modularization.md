# Worker.js Modularization Plan
**Repo:** `inneranimalmedia-agentsam-dashboard` (production branch)  
**Baseline captured:** 2026-04-30  
**Rule:** worker.js only shrinks. All new routes go directly into `src/api/{domain}.js`. Never add to worker.js.

---

## Baseline Line Counts
| File | Lines | Notes |
|------|-------|-------|
| `worker.js` | 33,925 | monolith, target: 0 meaningful lines |
| `src/index.js` | 586 | modular entry point |
| `src/core/auth.js` | 411 | session, cookies, auth helpers |
| `src/api/auth.js` | 304 | auth routes |
| `src/api/oauth.js` | 812 | integration OAuth routes |
| **Total** | **36,038** | baseline 2026-04-30 |

_Update this table after Step 0 of each sprint._

---

## Already Modularized (imported into worker.js from src/)
| Handler | File | Status |
|---------|------|--------|
| `handleStorageApi` | `src/api/storage.js` | extracted |
| `handleWorkspaceApi` | `src/api/workspace.js` | extracted |
| `handleMeetApi` | `src/api/meet.js` | extracted |
| `handleVaultApi` | `src/api/vault.js` | extracted |
| `establishIamSession` | `src/core/auth.js` | extracted |
| `handleOAuthApi` | `src/api/oauth.js` | extracted (integration OAuth) |

---

## Still in worker.js — Full Route Inventory

### Domain: auth
| Route | Method | Handler | Line | Target |
|-------|--------|---------|------|--------|
| `/api/auth/supabase/start` | GET | none yet | — | `src/api/auth.js` — **IN PROGRESS** |
| `/api/auth/supabase/callback` | GET | none yet | — | `src/api/auth.js` — **IN PROGRESS** |
| `/auth/callback/supabase` | GET | alias | — | `src/api/auth.js` — **IN PROGRESS** |
| `/auth/oauth/consent` | GET | none yet | — | `src/api/auth.js` — **IN PROGRESS** |

### Domain: settings + AI config
_All currently inside `handlePhase1PlatformD1Routes` (worker.js ~line 2403)_
| Route | Method | Target |
|-------|--------|--------|
| `/api/settings` | GET | `src/api/settings.js` |
| `/api/settings/appearance` | PATCH | `src/api/settings.js` |
| `/api/settings/deploy-context` | GET | `src/api/settings.js` |
| `/api/settings/docs-providers` | GET | `src/api/settings.js` |
| `/api/settings/agent-config` | PATCH | `src/api/settings.js` |
| `/api/settings/marketplace-catalog` | GET | `src/api/settings.js` |
| `/api/ai/guardrails` | GET | `src/api/ai.js` |
| `/api/ai/models` | GET | `src/api/ai.js` |
| `/api/ai/routing-rules` | GET, POST | `src/api/ai.js` |
| `/api/ai/integrations` | GET | `src/api/ai.js` |
| `/api/agent/rules` | GET | `src/api/agent.js` |
| `/api/commands/custom` | GET | `src/api/agent.js` |

### Domain: billing + spend
| Route | Method | Line | Target |
|-------|--------|------|--------|
| `/api/billing` | GET | ~2905 | `src/api/billing.js` |
| `/api/spend` | GET | ~2843 | `src/api/billing.js` |
| `/api/spend/summary` | GET | ~2877 | `src/api/billing.js` |
| `/api/spend/unified` | GET | ~2893 | `src/api/billing.js` |

### Domain: webhooks + hooks
| Route | Method | Handler | Line | Target |
|-------|--------|---------|------|--------|
| `/api/webhooks/health` | GET | `handleHooksHealth` | ~3336 | `src/api/webhooks.js` |
| `/api/hooks/health` | GET | `handleHooksHealth` | ~3336 | `src/api/webhooks.js` |
| `/api/email/inbound` | POST | `handleInboundWebhook` | ~3340 | `src/api/webhooks.js` |
| `/api/webhooks/resend` | POST | `handleInboundWebhook` | ~3343 | `src/api/webhooks.js` |
| `/api/webhooks/stripe` | POST | `handleInboundWebhook` | ~3346 | `src/api/webhooks.js` |
| `/api/webhooks/github` | POST | `handleInboundWebhook` | ~3349 | `src/api/webhooks.js` |
| `/api/webhooks/cursor` | POST | `handleInboundWebhook` | ~3352 | `src/api/webhooks.js` |
| `/api/webhooks/cloudflare` | POST | `handleInboundWebhook` | ~3355 | `src/api/webhooks.js` |
| `/api/webhooks/supabase` | POST | `handleInboundWebhook` | ~3358 | `src/api/webhooks.js` |
| `/api/webhooks/openai` | POST | `handleInboundWebhook` | ~3361 | `src/api/webhooks.js` |
| `/api/webhooks/internal` | POST | `handleInboundWebhook` | ~3364 | `src/api/webhooks.js` |
| `/api/hooks/github` | POST | `handleInboundWebhook` | ~3367 | `src/api/webhooks.js` |
| `/api/hooks/cursor` | POST | `handleInboundWebhook` | ~3370 | `src/api/webhooks.js` |
| `/api/hooks/stripe` | POST | `handleInboundWebhook` | ~3373 | `src/api/webhooks.js` |
| `/api/hooks/internal` | POST | `handleInboundWebhook` | ~3376 | `src/api/webhooks.js` |
| `/api/hooks/subscriptions` | GET, POST | inline | ~2693 | `src/api/webhooks.js` |
| `/api/hooks/subscriptions/reorder` | PATCH | inline | ~2762 | `src/api/webhooks.js` |
| `/api/hooks/executions` | GET | inline | ~2805 | `src/api/webhooks.js` |

### Domain: deployments + CI/CD
| Route | Method | Handler | Line | Target |
|-------|--------|---------|------|--------|
| deployment log | — | `handleDeploymentLog` | ~960 | `src/api/deployments.js` |
| recent deployments | — | `handleDeploymentsRecent` | ~1124 | `src/api/deployments.js` |
| `/api/agent-sam/deployments` | POST | inline | ~3302 | `src/api/deployments.js` |
| `/api/deploy/rollback` | POST | inline | ~2916 | `src/api/deployments.js` |

### Domain: agent
| Route | Method | Line | Target |
|-------|--------|------|--------|
| `/api/agent-sam/agent-runs` | POST | ~3280 | `src/api/agent.js` |

### Domain: D1 dashboard
| Route | Method | Line | Target |
|-------|--------|------|--------|
| `/api/dashboard/d1/tables` | GET | ~3128 | `src/api/d1-dashboard.js` |
| `/api/dashboard/d1/schema/:table` | GET | ~3133 | `src/api/d1-dashboard.js` |
| `/api/dashboard/d1/query` | POST | ~3139 | `src/api/d1-dashboard.js` |

### Domain: knowledge + app
| Route | Method | Line | Target |
|-------|--------|------|--------|
| `/api/knowledge` | GET | ~2812 | `src/api/knowledge.js` |
| `/api/knowledge/crawl` | POST | ~2819 | `src/api/knowledge.js` |
| `/api/app-icons` | GET | ~2837 | `src/api/app.js` |
| `/api/provider-colors` | GET | ~3212 | `src/api/app.js` |

### Domain: health + system
| Route | Method | Line | Target |
|-------|--------|------|--------|
| `/api/health` | GET | ~3203 | `src/api/system.js` |
| `/api/system/health` | GET | ~3226 | `src/api/system.js` |
| `/health` | GET | ~3248 | `src/api/system.js` |

### Domain: tools proxy
| Route | Method | Line | Target |
|-------|--------|------|--------|
| `/api/tools-proxy/*` | ALL | ~3168 | `src/api/tools.js` |

---

## Extraction Order (priority)
| # | Domain | Why this order | Target file | Status |
|---|--------|---------------|-------------|--------|
| 1 | **auth** | mid-extraction now, Supabase OAuth sprint | `src/api/auth.js` | IN PROGRESS |
| 2 | **system/health** | 3 routes, zero dependencies, lowest risk | `src/api/system.js` | pending |
| 3 | **settings + AI** | read-heavy, isolated from business logic | `src/api/settings.js`, `src/api/ai.js` | pending |
| 4 | **billing + spend** | isolated, read-heavy | `src/api/billing.js` | pending |
| 5 | **webhooks** | `handleInboundWebhook` is one function, easy lift | `src/api/webhooks.js` | pending |
| 6 | **knowledge + app** | small, isolated | `src/api/knowledge.js`, `src/api/app.js` | pending |
| 7 | **D1 dashboard** | isolated admin routes | `src/api/d1-dashboard.js` | pending |
| 8 | **deployments** | depends on D1 + KV patterns established above | `src/api/deployments.js` | pending |
| 9 | **tools proxy** | depends on auth + session | `src/api/tools.js` | pending |
| 10 | **agent** | largest, most complex, do last | `src/api/agent.js` | pending |

---

## Core Utilities to Extract (shared across all domains)
| Utility | Current location | Target | Used by |
|---------|-----------------|--------|---------|
| `jsonResponse` | worker.js + src/core/auth.js | `src/core/response.js` | everything |
| `getAuthUser` / `getSession` | `src/core/auth.js` | stays, already extracted | all protected routes |
| D1 query helpers | scattered in worker.js | `src/core/db.js` | all DB routes |
| crypto / token gen | worker.js inline | `src/core/crypto.js` | auth, oauth, secrets |
| tenant resolution | worker.js inline | `src/core/tenant.js` | auth, bootstrap |

---

## Sprint Protocol
Every extraction follows this exact sequence — no exceptions:
```
1. wc -l worker.js (record before)
2. Copy handler(s) from worker.js → src/api/{domain}.js
3. Export from src/api/{domain}.js
4. Import + register in src/index.js ABOVE legacyWorker passthrough
5. Delete handler(s) from worker.js
6. wc -l worker.js (record after — must be lower)
7. git commit -m "refactor: extract {domain} routes from worker.js"
8. git push origin production → CF autobuild
9. Verify routes respond correctly in production
10. Update this doc: mark rows extracted, update line counts
```

---

## Progress Log
| Date | Sprint | Routes extracted | worker.js lines before | worker.js lines after |
|------|--------|-----------------|----------------------|----------------------|
| 2026-04-30 | Supabase OAuth + auth | `/api/auth/supabase/start`, `/api/auth/supabase/callback`, `/auth/callback/supabase`, `/auth/oauth/consent` | TBD | TBD |

---

## Definition of Done
- `worker.js` contains only the `export default { fetch }` entry point shim that calls `src/index.js`
- `src/index.js` is authoritative for all routes
- No `legacyWorker.fetch()` passthrough exists
- All routes documented above are marked `extracted` in this table

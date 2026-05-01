# Modular worker vs monolith (`worker.js`)

Baseline line counts (pre–Supabase OAuth deploy sprint, recorded in brief):

| File | Lines |
|------|-------:|
| worker.js | 33,925 |
| src/index.js | 586 |
| src/core/auth.js | 411 |
| src/api/auth.js | 304 |
| src/api/oauth.js | 812 |
| **Total** | **36,038** |

### After this sprint (local `wc -l`, includes `provisionNewUser.js`)

| File | Lines |
|------|-------:|
| worker.js | 33,925 |
| src/index.js | 561 |
| src/core/auth.js | 411 |
| src/api/auth.js | 499 |
| src/api/oauth.js | 820 |
| src/core/provisionNewUser.js | 57 |
| **Total** | **36,273** |

After each production deploy that touches routing or auth, refresh the counts (`wc -l` on the paths above) and update this table in the same commit when practical.

## Mirror to `inneranimalmedia` canonical repo

When the Cloudflare build for `production` is green, copy these paths into the main `inneranimalmedia` repo (same tree) so both stay aligned:

- `src/api/auth.js`
- `src/core/provisionNewUser.js`
- `src/index.js`
- `wrangler.jsonc`
- `dashboard/auth-signin.html`
- `agent-dashboard/agent-dashboard/App.tsx` (route for consent)
- `agent-dashboard/agent-dashboard/components/auth/AuthOAuthConsentPage.tsx` (OAuth consent UI; served via SPA shell at `GET /api/auth/oauth/consent`)
- `static_auth-signin.html`
- `docs/modularization.md`

Use the same commit message as this sprint.

## WAF (manual)

On zone `inneranimalmedia.com`, add a Custom Rule before relying on `/api/auth/oauth/consent` in production:

- **Name:** Allow OAuth consent path  
- **Expression:** `http.request.uri.path eq "/api/auth/oauth/consent"`  
- **Action:** Skip → Bot Fight Mode  

Without it, some clients receive a 403 challenge before the Worker runs.

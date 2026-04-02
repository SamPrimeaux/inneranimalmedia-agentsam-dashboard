# D1 migrations

- **Database:** `inneranimalmedia-business` (binding `DB` in worker).
- **Files:** `migrations/<number>_description.sql` in repo; version controlled.
- **Apply remote:** `./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/NNN_....sql`
- **Approval:** propose SQL first; run only after explicit OK (project rules).
- **Canonical tables:** see `AGENT_MEMORY_SCHEMA_AND_RECORDS.md` (integration copy on tools R2). Avoid new tables without consolidation review.

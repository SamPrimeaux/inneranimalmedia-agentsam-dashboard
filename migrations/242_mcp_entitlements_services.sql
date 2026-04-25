-- 242: Seed additional service entitlements for Cloudflare Access external evaluation
-- Apply (prod example):
--   npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/242_mcp_entitlements_services.sql

INSERT OR IGNORE INTO mcp_entitlements (tenant_id, user_email, service, effect)
VALUES
  ('tenant_sam_primeaux', 'info@inneranimals.com', 'ssh', 'allow'),
  ('tenant_sam_primeaux', 'info@inneranimals.com', 'terminal', 'allow'),
  ('tenant_sam_primeaux', 'info@inneranimals.com', 'dashboard', 'allow'),
  ('tenant_sam_primeaux', 'info@inneranimals.com', 'api', 'allow');


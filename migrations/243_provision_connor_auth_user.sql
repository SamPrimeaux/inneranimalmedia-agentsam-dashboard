-- 243: Provision Connor auth_users row (explicit provisioning path).
-- Apply (prod example):
--   npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/243_provision_connor_auth_user.sql

INSERT INTO auth_users (id, email, tenant_id, role)
VALUES (
  'au_' || lower(hex(randomblob(8))),
  'connordmcneely@leadershiplegacydigital.com',
  'tenant_sam_primeaux',
  'member'
);


-- workspaces alignment + workspace_available_tools (VIEW) via workspace_tool_access.
-- workspace_available_tools = VIEW on workspace_tool_access JOIN agent_commands; insert into workspace_tool_access only.
-- Client app: client_51838412025944c5 Inner Animal App -> workspace ws_inneranimal_app.
-- Clone tool matrix from ws_inneranimal (77 commands) onto ws_inneranimal_app and ws_samprimeaux (was 0).

-- 1) Entity workspace: default tenant + stable handle
UPDATE workspaces SET
  default_tenant_id = 'tenant_sam_primeaux',
  handle = 'inneranimalmedia',
  updated_at = datetime('now')
WHERE id = 'ws_inneranimal';

-- 2) Owner personal workspace: default tenant + handle + tools (below)
UPDATE workspaces SET
  default_tenant_id = 'tenant_sam_primeaux',
  handle = 'samprimeaux',
  updated_at = datetime('now')
WHERE id = 'ws_samprimeaux';

-- 3) Product workspace for Inner Animal App (clients.id client_51838412025944c5)
INSERT INTO workspaces (
  id,
  name,
  domain,
  category,
  status,
  created_at,
  owner_tenant_id,
  default_tenant_id,
  handle,
  theme_id,
  updated_at
) VALUES (
  'ws_inneranimal_app',
  'Inner Animal App',
  NULL,
  'client',
  'active',
  datetime('now'),
  'tenant_sam_primeaux',
  'tenant_sam_primeaux',
  'inneranimalapp',
  'inner-animal-dark',
  datetime('now')
);

-- 4) Tool access: Inner Animal App workspace (same command set as main IAM entity)
INSERT INTO workspace_tool_access (
  workspace_id,
  command_id,
  is_enabled,
  is_restricted_to_roles,
  usage_quota_per_day,
  total_usage_count,
  created_at,
  updated_at
)
SELECT
  'ws_inneranimal_app',
  command_id,
  is_enabled,
  is_restricted_to_roles,
  usage_quota_per_day,
  0,
  unixepoch(),
  unixepoch()
FROM workspace_tool_access
WHERE workspace_id = 'ws_inneranimal';

-- 5) Tool access: Sam owner workspace (was empty; parity with IAM dashboard tooling)
INSERT INTO workspace_tool_access (
  workspace_id,
  command_id,
  is_enabled,
  is_restricted_to_roles,
  usage_quota_per_day,
  total_usage_count,
  created_at,
  updated_at
)
SELECT
  'ws_samprimeaux',
  command_id,
  is_enabled,
  is_restricted_to_roles,
  usage_quota_per_day,
  0,
  unixepoch(),
  unixepoch()
FROM workspace_tool_access
WHERE workspace_id = 'ws_inneranimal';

-- 6) Project metadata: which workspaces apply to this build
UPDATE projects SET
  metadata_json = json_set(
    COALESCE(NULLIF(metadata_json, ''), '{}'),
    '$.workspace_entity', 'ws_inneranimal',
    '$.workspace_client_app', 'ws_inneranimal_app',
    '$.workspace_owner', 'ws_samprimeaux'
  ),
  updated_at = CURRENT_TIMESTAMP
WHERE id = 'proj_iam_agentsam_composer2_20260322';

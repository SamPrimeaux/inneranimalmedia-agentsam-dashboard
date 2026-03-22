-- One-off: document Cursor Composer 2 / IAM Agent Sam workflow across agent_tools, agent_telemetry,
-- agent_runtime_configs, and projects (surfaced via ai_project_context VIEW — not insertable).
-- Production D1 inneranimalmedia-business. 2026-03-22.

-- 1) agent_tools — IDE agent session as a logical tool for role_agent_sam
INSERT INTO agent_tools (
  id,
  agent_role_id,
  tool_name,
  tool_binding,
  config_json,
  is_active,
  created_at
) VALUES (
  'tool_composer2_agentsam_ide',
  'role_agent_sam',
  'cursor_composer2_agent_session',
  'CURSOR_COMPOSER2',
  '{"user_agent":"composer2_agentsam","ai_models_id":"composer2-agentsam","cidi_workflow_id":"CIDI-IAM-AGENTSAM-20260322","cidi_activity_log_id":11,"repo":"SamPrimeaux/inneranimalmedia-agentsam-dashboard","git_branch":"cursor/platform-ui-stability-1eca","worker":"inneranimalmedia","d1_database":"inneranimalmedia-business","focus":["terminal_session_alignment","settings_control_plane","agent_ui_polish","d1_audit"]}',
  1,
  datetime('now')
);

-- 2) agent_telemetry — non-LLM platform checkpoint (metric only; tokens zero)
INSERT INTO agent_telemetry (
  id,
  tenant_id,
  session_id,
  metric_type,
  metric_name,
  metric_value,
  timestamp,
  metadata_json,
  model_used,
  input_tokens,
  output_tokens,
  provider,
  agent_id,
  workspace_id,
  pricing_source,
  created_at,
  updated_at,
  computed_cost_usd,
  event_type,
  created_by
) VALUES (
  'atel_composer2_iam_workflow_20260322',
  'tenant_sam_primeaux',
  'sess_composer2_iam_platform_ui_20260322',
  'platform_workflow',
  'cursor_composer_iam_session_checkpoint',
  1,
  unixepoch(),
  '{"summary":"D1 rows: cidi id=4, cidi_activity_log id=11 user_agent composer2_agentsam, ai_models composer2-agentsam. Migrations and session log in repo. PR branch cursor/platform-ui-stability-1eca.","artifacts":["migrations/_oneoff_cidi_iam_platform_ui_2026-03-22.sql","migrations/_oneoff_cidi_activity_log_iam_2026-03-22.sql","migrations/_oneoff_cidi_activity_log_user_agent_2026-03-22.sql","migrations/_oneoff_ai_models_composer2_agentsam_2026-03-22.sql"]}',
  'composer2-agentsam',
  0,
  0,
  'cursor',
  'composer2_agentsam',
  'ws_samprimeaux',
  'cursor_composer',
  unixepoch(),
  unixepoch(),
  0,
  'workflow_documentation',
  'cursor_agent'
);

-- 3) agent_runtime_configs — Composer 2 lane for Agent Sam role
INSERT INTO agent_runtime_configs (
  id,
  agent_role_id,
  config_key,
  model_id,
  temperature,
  max_tokens,
  response_mode,
  intent_slug,
  system_prompt_override,
  config_json,
  is_active,
  created_at,
  updated_at
) VALUES (
  'cfg_agent_sam_composer2',
  'role_agent_sam',
  'composer2_agentsam',
  'composer2-agentsam',
  0.2,
  8192,
  'structured',
  'iam_platform_cursor_session',
  NULL,
  '{"user_agent":"composer2_agentsam","environment":"cursor_composer2","not_api_routed":true,"notes":"Catalog model id only; chat completions use provider APIs separately."}',
  1,
  datetime('now'),
  datetime('now')
);

-- 4) projects — status must satisfy CHECK (use development). Appears in VIEW ai_project_context
--    after _oneoff_ai_project_context_view_fix_2026-03-22.sql (view WHERE aligned to valid statuses).
INSERT INTO projects (
  id,
  name,
  client_name,
  project_type,
  status,
  tech_stack,
  tenant_id,
  worker_id,
  d1_databases,
  r2_buckets,
  domain,
  description,
  metadata_json,
  tags_json
) VALUES (
  'proj_iam_agentsam_composer2_20260322',
  'Agent Sam dashboard — platform UI (Composer 2)',
  'Inner Animal Media',
  'internal-tool',
  'development',
  'Cloudflare Workers, D1, R2, KV, Vite, React, Cursor',
  'tenant_sam_primeaux',
  'inneranimalmedia',
  'inneranimalmedia-business (cf87b717-d4e2-4cf8-bab0-a81268e32d49)',
  'agent-sam, iam-platform',
  'inneranimalmedia.com',
  'Cursor Composer 2 cloud session documenting IAM stack: terminal sessionId vs worker runTerminalCommand alignment, SettingsPanel control plane, Agent polish, D1 audits (cidi, hooks, spend_ledger). GitHub branch cursor/platform-ui-stability-1eca.',
  '{"composer2":{"user_agent_label":"composer2_agentsam"},"cidi":{"workflow_id":"CIDI-IAM-AGENTSAM-20260322","cidi_id":4},"roadmap_plan":"plan_iam_dashboard_v1","mar23_sprint":"terminal_settings_agent_polish"}',
  '["composer2","agent-sam","platform-ui","d1","inneranimalmedia"]'
);

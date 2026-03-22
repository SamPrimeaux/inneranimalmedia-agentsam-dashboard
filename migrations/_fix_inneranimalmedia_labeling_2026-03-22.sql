-- Correct labeling: platform build is InnerAnimalMedia SaaS / Agent Sam dashboard.
-- Reverts mistaken association with clients "Inner Animal App" (client_51838412025944c5) on this project.
-- Production D1 inneranimalmedia-business. 2026-03-22.

UPDATE projects SET
  client_id = NULL,
  client_name = 'Inner Animal Media',
  name = 'InnerAnimalMedia — Agent Sam SaaS (platform UI build)',
  description = 'InnerAnimalMedia SaaS / Agent Sam dashboard: terminal, Settings control plane, UI polish, D1 observability. Company Inner Animal Media; Worker inneranimalmedia; D1 inneranimalmedia-business; branch cursor/platform-ui-stability-1eca.',
  metadata_json = '{"composer2":{"user_agent_label":"composer2_agentsam"},"cidi":{"workflow_id":"CIDI-IAM-AGENTSAM-20260322","cidi_id":4},"roadmap_plan":"plan_iam_dashboard_v1","mar23_sprint":"terminal_settings_agent_polish","product":"InnerAnimalMedia","company_brand":"Inner Animal Media","build_kind":"saas_agentsam_dashboard","surface":"agent_sam_dashboard","github_repo":"SamPrimeaux/inneranimalmedia-agentsam-dashboard","label_version":"2026-03-22","workspace_entity":"ws_inneranimal","workspace_saas_agentsam":"ws_inneranimal_app","workspace_owner":"ws_samprimeaux"}',
  tags_json = '["inneranimalmedia","agent-sam","saas","platform-ui","composer2","d1","worker-inneranimalmedia"]',
  updated_at = CURRENT_TIMESTAMP
WHERE id = 'proj_iam_agentsam_composer2_20260322';

UPDATE ai_projects SET
  name = 'InnerAnimalMedia — Agent Sam SaaS (platform UI build)',
  description = 'InnerAnimalMedia SaaS / Agent Sam dashboard: terminal, Settings, Agent polish; branch cursor/platform-ui-stability-1eca. Company Inner Animal Media.',
  metadata = '{"product":"InnerAnimalMedia","company_brand":"Inner Animal Media","user_agent":"composer2_agentsam","ide_lane":"cursor_composer2","projects_table_id":"proj_iam_agentsam_composer2_20260322"}',
  updated_at = CURRENT_TIMESTAMP
WHERE id = 'proj_iam_agentsam_composer2_20260322';

UPDATE workspaces SET
  name = 'InnerAnimalMedia — Agent Sam (SaaS dashboard)',
  handle = 'inneranimalmedia_saas',
  updated_at = datetime('now')
WHERE id = 'ws_inneranimal_app';

UPDATE project_memory SET
  value = '{"product":"InnerAnimalMedia","company_brand":"Inner Animal Media","user_agent":"composer2_agentsam","git_branch":"cursor/platform-ui-stability-1eca","worker":"inneranimalmedia","d1":"inneranimalmedia-business","cidi_workflow_id":"CIDI-IAM-AGENTSAM-20260322","artifacts":["agent_tools","agent_telemetry","agent_runtime_configs","ai_models composer2-agentsam"]}',
  updated_at = unixepoch()
WHERE id = 'pmem_iam_composer2_workflow_20260322';

UPDATE ai_routing_rules SET
  rule_name = 'Cursor Composer 2 — InnerAnimalMedia Agent Sam',
  reason = 'IDE session catalog for InnerAnimalMedia SaaS / Agent Sam dashboard (D1 model composer2-agentsam).',
  updated_at = unixepoch()
WHERE id = 'route_composer2_iam_client_51838412025944c5';

UPDATE ai_tasks SET
  metadata = '{"product":"InnerAnimalMedia","stream":"platform_ui"}'
WHERE project_id = 'proj_iam_agentsam_composer2_20260322';

UPDATE workflows SET
  trigger_config = '{"project_id":"proj_iam_agentsam_composer2_20260322","product":"InnerAnimalMedia"}'
WHERE id = 'wf_iam_deploy_worker_r2_first';

UPDATE agent_tools SET
  config_json = '{"user_agent":"composer2_agentsam","ai_models_id":"composer2-agentsam","cidi_workflow_id":"CIDI-IAM-AGENTSAM-20260322","cidi_activity_log_id":11,"repo":"SamPrimeaux/inneranimalmedia-agentsam-dashboard","git_branch":"cursor/platform-ui-stability-1eca","worker":"inneranimalmedia","d1_database":"inneranimalmedia-business","product":"InnerAnimalMedia","focus":["terminal_session_alignment","settings_control_plane","agent_ui_polish","d1_audit"]}'
WHERE id = 'tool_composer2_agentsam_ide';

UPDATE agent_telemetry SET
  metadata_json = '{"summary":"InnerAnimalMedia SaaS / Agent Sam build: D1 cidi id=4, cidi_activity_log id=11, user_agent composer2_agentsam, ai_models composer2-agentsam. Migrations + session log in repo. Branch cursor/platform-ui-stability-1eca.","artifacts":["migrations/_oneoff_cidi_iam_platform_ui_2026-03-22.sql","migrations/_oneoff_cidi_activity_log_iam_2026-03-22.sql","migrations/_oneoff_cidi_activity_log_user_agent_2026-03-22.sql","migrations/_oneoff_ai_models_composer2_agentsam_2026-03-22.sql"]}',
  updated_at = unixepoch()
WHERE id = 'atel_composer2_iam_workflow_20260322';

UPDATE agent_runtime_configs SET
  config_json = '{"user_agent":"composer2_agentsam","environment":"cursor_composer2","product":"InnerAnimalMedia","not_api_routed":true,"notes":"Catalog model id only; chat completions use provider APIs separately."}',
  updated_at = datetime('now')
WHERE id = 'cfg_agent_sam_composer2';

UPDATE ai_models SET
  display_name = 'Cursor Composer 2 (InnerAnimalMedia Agent Sam)',
  metadata_json = '{"user_agent_label":"composer2_agentsam","product":"InnerAnimalMedia","saas":"Agent Sam dashboard","role":"IDE agent session"}',
  updated_at = unixepoch()
WHERE id = 'composer2-agentsam';

-- Drop legacy metadata key if present (replaced by workspace_saas_agentsam in projects UPDATE above)
UPDATE projects SET
  metadata_json = json_remove(metadata_json, '$.workspace_client_app')
WHERE id = 'proj_iam_agentsam_composer2_20260322'
  AND json_extract(metadata_json, '$.workspace_client_app') IS NOT NULL;

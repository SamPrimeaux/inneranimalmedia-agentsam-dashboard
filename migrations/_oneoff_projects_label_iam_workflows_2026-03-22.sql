-- Align projects row for InnerAnimalMedia SaaS / Agent Sam dashboard build; add five IAM workflows.
-- Product: InnerAnimalMedia; company: Inner Animal Media (not the separate "Inner Animal App" client SKU).

UPDATE projects SET
  client_id = NULL,
  client_name = 'Inner Animal Media',
  name = 'InnerAnimalMedia — Agent Sam SaaS (platform UI build)',
  description = 'InnerAnimalMedia SaaS / Agent Sam dashboard: terminal, Settings control plane, UI polish, D1 observability. Company Inner Animal Media; Worker inneranimalmedia; D1 inneranimalmedia-business; branch cursor/platform-ui-stability-1eca.',
  metadata_json = json_set(
    COALESCE(NULLIF(metadata_json, ''), '{}'),
    '$.product', 'InnerAnimalMedia',
    '$.build_kind', 'saas_agentsam_dashboard',
    '$.surface', 'agent_sam_dashboard',
    '$.company_brand', 'Inner Animal Media',
    '$.github_repo', 'SamPrimeaux/inneranimalmedia-agentsam-dashboard',
    '$.label_version', '2026-03-22'
  ),
  tags_json = '["inneranimalmedia","agent-sam","saas","platform-ui","composer2","d1","worker-inneranimalmedia"]',
  updated_at = CURRENT_TIMESTAMP
WHERE id = 'proj_iam_agentsam_composer2_20260322';

-- Mirror title/description on ai_projects (same id as projects for ai_tasks FK)
UPDATE ai_projects SET
  name = 'InnerAnimalMedia — Agent Sam SaaS (platform UI build)',
  description = 'InnerAnimalMedia SaaS / Agent Sam dashboard: terminal, Settings, Agent polish; branch cursor/platform-ui-stability-1eca. Company Inner Animal Media.',
  updated_at = CURRENT_TIMESTAMP
WHERE id = 'proj_iam_agentsam_composer2_20260322';

INSERT INTO workflows (id, name, description, workflow_type, trigger_type, trigger_config, steps, is_active) VALUES
(
  'wf_iam_deploy_worker_r2_first',
  'iam_deploy_worker_after_r2_dashboard',
  'Ship dashboard HTML/JS to R2, then npm run deploy (worker); never skip R2 when dashboard paths changed.',
  'deploy',
  'manual',
  '{"project_id":"proj_iam_agentsam_composer2_20260322","product":"InnerAnimalMedia"}',
  '[{"step":1,"name":"list_dashboard_changes","type":"check","action":"git diff name-only dashboard static/dashboard agent-dashboard/src","description":"See R2-served path changes"},{"step":2,"name":"upload_r2","type":"script","action":"with-cloudflare-env wrangler r2 object put agent-sam static dashboard files remote","description":"Upload changed assets"},{"step":3,"name":"deploy_worker","type":"script","action":"npm run deploy with TRIGGERED_BY DEPLOYMENT_NOTES","description":"Worker inneranimalmedia after Sam deploy approved"},{"step":4,"name":"record_deploy","type":"log","action":"deployments table via post-deploy script","description":"Audit trail"}]',
  1
),
(
  'wf_iam_d1_health_snapshot',
  'iam_d1_readonly_context_pack',
  'Read-only pack: agent_memory_index keys, roadmap open steps, spend and telemetry counts, webhook inventory.',
  'observability',
  'manual',
  '{"project_id":"proj_iam_agentsam_composer2_20260322"}',
  '[{"step":1,"name":"memory_keys","type":"query","action":"agent_memory_index active_priorities build_progress today_todo","description":"System and tenant rows"},{"step":2,"name":"roadmap_open","type":"query","action":"roadmap_steps plan_iam_dashboard_v1 not completed top 15","description":"In-flight steps"},{"step":3,"name":"cost_volume","type":"query","action":"COUNT spend_ledger COUNT agent_telemetry","description":"Volume sanity"},{"step":4,"name":"webhooks","type":"query","action":"COUNT webhook_endpoints COUNT hook_subscriptions","description":"Hook inventory"}]',
  1
),
(
  'wf_iam_terminal_regression',
  'iam_terminal_ws_vs_run_smoke',
  'Before closing terminal sprint: compare interactive WS cwd with POST terminal/run behavior.',
  'qa',
  'manual',
  '{"surface":"FloatingPreviewPanel"}',
  '[{"step":1,"name":"ws_live","type":"check","action":"terminal tab socket-url or worker proxy","description":"WS connects"},{"step":2,"name":"shell_cd","type":"manual","action":"cd tmp pwd in UI","description":"Note cwd"},{"step":3,"name":"http_run","type":"api","action":"POST api agent terminal run with session_id","description":"Compare pwd output"},{"step":4,"name":"record","type":"log","action":"cidi_activity_log or session log","description":"Pass fail note"}]',
  1
),
(
  'wf_iam_settings_rollout',
  'iam_settings_panel_control_plane',
  'SettingsPanel: masked env, debounced saves, Webhooks Deploy Cursor tabs.',
  'feature_rollout',
  'manual',
  '{"component":"SettingsPanel.jsx"}',
  '[{"step":1,"name":"api_contract","type":"check","action":"env routes return masked values only","description":"No raw secrets to browser"},{"step":2,"name":"nav_shell","type":"implement","action":"two column nav plus tab state","description":"UX skeleton"},{"step":3,"name":"debounce","type":"implement","action":"debounce per text json field","description":"Protect D1"},{"step":4,"name":"ship","type":"deploy","action":"vite build R2 upload then worker if needed","description":"Live matches git"}]',
  1
),
(
  'wf_iam_cursor_session_document',
  'iam_cursor_composer_session_to_d1',
  'After Composer work: CIDI row, project_memory, optional agent_telemetry checkpoint, repo session log.',
  'documentation',
  'manual',
  '{"user_agent":"composer2_agentsam"}',
  '[{"step":1,"name":"cidi_row","type":"query","action":"cidi CIDI-IAM-AGENTSAM-20260322 status","description":"Workflow visible"},{"step":2,"name":"memory_row","type":"query","action":"project_memory project_id proj_iam_agentsam_composer2_20260322","description":"Context keys present"},{"step":3,"name":"telemetry","type":"insert","action":"optional platform_workflow metric row","description":"Numeric checkpoint"},{"step":4,"name":"repo_log","type":"log","action":"docs cursor-session-log append","description":"Human trail"}]',
  1
);

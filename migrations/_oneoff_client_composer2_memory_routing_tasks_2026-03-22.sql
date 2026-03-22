-- ai_projects.ai_provider CHECK allows: claude, openai, gemini, vertex, workers-ai (use claude; put cursor in metadata).
-- Link IAM Composer 2 platform build to client Inner Animal App; populate memory (ai_project_memory_context view),
-- ai_routing_rules, ai_projects + ai_tasks. Client: client_51838412025944c5 (clients.name = Inner Animal App).
-- Production D1 inneranimalmedia-business. 2026-03-22.

-- 1) projects row: set clients.id FK
UPDATE projects
SET client_id = 'client_51838412025944c5',
    updated_at = CURRENT_TIMESTAMP,
    metadata_json = json_set(
      COALESCE(NULLIF(metadata_json, ''), '{}'),
      '$.client_id', 'client_51838412025944c5',
      '$.client_name', 'Inner Animal App'
    )
WHERE id = 'proj_iam_agentsam_composer2_20260322';

-- 2) project_memory -> visible via VIEW ai_project_memory_context (non-expired)
INSERT INTO project_memory (
  id,
  project_id,
  tenant_id,
  memory_type,
  key,
  value,
  importance_score,
  confidence_score,
  created_by,
  created_at,
  updated_at
) VALUES
(
  'pmem_iam_composer2_workflow_20260322',
  'proj_iam_agentsam_composer2_20260322',
  'tenant_sam_primeaux',
  'workflow',
  'composer2_platform_build',
  '{"client_id":"client_51838412025944c5","client_name":"Inner Animal App","user_agent":"composer2_agentsam","git_branch":"cursor/platform-ui-stability-1eca","worker":"inneranimalmedia","d1":"inneranimalmedia-business","cidi_workflow_id":"CIDI-IAM-AGENTSAM-20260322","artifacts":["agent_tools","agent_telemetry","agent_runtime_configs","ai_models composer2-agentsam"]}',
  0.95,
  0.92,
  'composer2_agentsam',
  unixepoch(),
  unixepoch()
),
(
  'pmem_iam_composer2_goals_20260322',
  'proj_iam_agentsam_composer2_20260322',
  'tenant_sam_primeaux',
  'goal_context',
  'mar23_sprint_focus',
  '{"priorities":["terminal_sessionId_align_worker_runTerminalCommand","settings_control_plane","agent_sam_ui_polish"],"roadmap_plan":"plan_iam_dashboard_v1","step_mar23_ui_sprint":"in_progress"}',
  0.9,
  0.88,
  'composer2_agentsam',
  unixepoch(),
  unixepoch()
);

-- 3) ai_routing_rules — Composer 2 / IAM dashboard lane (catalog model; not API completion path)
INSERT INTO ai_routing_rules (
  id,
  rule_name,
  priority,
  match_type,
  match_value,
  target_model_key,
  target_provider,
  reason,
  is_active,
  created_at,
  updated_at
) VALUES (
  'route_composer2_iam_client_51838412025944c5',
  'Cursor Composer 2 — Inner Animal App (client_51838412025944c5)',
  7,
  'intent',
  'composer2_agentsam,cursor_composer,iam_dashboard,inneranimalmedia_agentsam',
  'composer2-agentsam',
  'cursor',
  'IDE session / catalog routing for Inner Animal App (clients.id client_51838412025944c5). Agent Sam dashboard platform UI workstream; target is D1 catalog model, not a remote chat API.',
  1,
  unixepoch(),
  unixepoch()
);

-- 4) ai_projects — same id as projects row for cross-table linkage; FK for ai_tasks
INSERT INTO ai_projects (
  id,
  name,
  description,
  phase,
  status,
  ai_provider,
  created_at,
  updated_at,
  created_by,
  metadata
) VALUES (
  'proj_iam_agentsam_composer2_20260322',
  'Agent Sam dashboard — platform UI (Composer 2)',
  'Inner Animal App client_51838412025944c5: terminal, Settings control plane, Agent polish; branch cursor/platform-ui-stability-1eca.',
  'build',
  'active',
  'claude',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  'composer2_agentsam',
  '{"client_id":"client_51838412025944c5","client_name":"Inner Animal App","user_agent":"composer2_agentsam","ide_lane":"cursor_composer2","projects_table_id":"proj_iam_agentsam_composer2_20260322"}'
);

-- 5) ai_tasks
INSERT INTO ai_tasks (
  id,
  project_id,
  title,
  description,
  status,
  priority,
  assigned_to,
  metadata
) VALUES
(
  'task_iam_terminal_session_20260322',
  'proj_iam_agentsam_composer2_20260322',
  'Terminal: align sessionId (WS vs runTerminalCommand)',
  'FloatingPreviewPanel + worker runTerminalCommand share one canonical PTY/session where required; verify pwd/cd persistence.',
  'in_progress',
  10,
  NULL,
  '{"client_id":"client_51838412025944c5","stream":"platform_ui"}'
),
(
  'task_iam_settings_plane_20260322',
  'proj_iam_agentsam_composer2_20260322',
  'SettingsPanel: two-column nav, live saves, new tabs',
  'Env, Agents, Providers, Webhooks, Deploy, Cursor; mask secrets; debounce saves.',
  'todo',
  9,
  NULL,
  '{"client_id":"client_51838412025944c5","stream":"platform_ui"}'
),
(
  'task_iam_agent_polish_20260322',
  'proj_iam_agentsam_composer2_20260322',
  'Agent Sam UI polish',
  'Docked input (CSS vars), icons, multi-panel, welcome cards; cache-bust R2 assets after deploy.',
  'todo',
  8,
  NULL,
  '{"client_id":"client_51838412025944c5","stream":"platform_ui"}'
);

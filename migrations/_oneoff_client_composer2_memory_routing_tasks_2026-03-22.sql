-- ai_projects.ai_provider CHECK allows: claude, openai, gemini, vertex, workers-ai (use claude; put cursor in metadata).
-- InnerAnimalMedia SaaS / Agent Sam dashboard build — memory, routing, ai_projects + ai_tasks.
-- Do not link this platform project to clients.id Inner Animal App; see _fix_inneranimalmedia_labeling_2026-03-22.sql if prod was corrected.
-- Production D1 inneranimalmedia-business. 2026-03-22.

-- 1) project_memory -> visible via VIEW ai_project_memory_context (non-expired)
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
  '{"product":"InnerAnimalMedia","company_brand":"Inner Animal Media","user_agent":"composer2_agentsam","git_branch":"cursor/platform-ui-stability-1eca","worker":"inneranimalmedia","d1":"inneranimalmedia-business","cidi_workflow_id":"CIDI-IAM-AGENTSAM-20260322","artifacts":["agent_tools","agent_telemetry","agent_runtime_configs","ai_models composer2-agentsam"]}',
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

-- 2) ai_routing_rules — Composer 2 / IAM dashboard lane (catalog model; not API completion path)
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
  'Cursor Composer 2 — InnerAnimalMedia Agent Sam',
  7,
  'intent',
  'composer2_agentsam,cursor_composer,iam_dashboard,inneranimalmedia_agentsam',
  'composer2-agentsam',
  'cursor',
  'IDE session / catalog routing for InnerAnimalMedia SaaS / Agent Sam dashboard; target is D1 catalog model composer2-agentsam, not a remote chat API.',
  1,
  unixepoch(),
  unixepoch()
);

-- 3) ai_projects — same id as projects row for cross-table linkage; FK for ai_tasks
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
  'InnerAnimalMedia SaaS / Agent Sam: terminal, Settings control plane, Agent polish; branch cursor/platform-ui-stability-1eca.',
  'build',
  'active',
  'claude',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  'composer2_agentsam',
  '{"product":"InnerAnimalMedia","company_brand":"Inner Animal Media","user_agent":"composer2_agentsam","ide_lane":"cursor_composer2","projects_table_id":"proj_iam_agentsam_composer2_20260322"}'
);

-- 4) ai_tasks
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
  '{"product":"InnerAnimalMedia","stream":"platform_ui"}'
),
(
  'task_iam_settings_plane_20260322',
  'proj_iam_agentsam_composer2_20260322',
  'SettingsPanel: two-column nav, live saves, new tabs',
  'Env, Agents, Providers, Webhooks, Deploy, Cursor; mask secrets; debounce saves.',
  'todo',
  9,
  NULL,
  '{"product":"InnerAnimalMedia","stream":"platform_ui"}'
),
(
  'task_iam_agent_polish_20260322',
  'proj_iam_agentsam_composer2_20260322',
  'Agent Sam UI polish',
  'Docked input (CSS vars), icons, multi-panel, welcome cards; cache-bust R2 assets after deploy.',
  'todo',
  8,
  NULL,
  '{"product":"InnerAnimalMedia","stream":"platform_ui"}'
);

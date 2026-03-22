-- InnerAnimalMedia dashboard: agent capability vs Monaco/Agent UI gap (known context for Agent Sam + planning).
-- Production D1 inneranimalmedia-business. 2026-03-22.

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
) VALUES (
  'pmem_iam_monaco_ui_ux_note_20260322',
  'proj_iam_agentsam_composer2_20260322',
  'tenant_sam_primeaux',
  'best_practice',
  'monaco_agents_ui_ux_capability_gap',
  '{"product":"InnerAnimalMedia","summary":"The agent stack can observe repo work and code changes (e.g. via Cursor/Composer and tooling), but the in-dashboard UI/UX for Monaco + Agent Sam is not yet solidified for full in-product edit, diff, and guided agent flows.","implication":"Prioritize Agent polish / Settings / editor surfaces so operators get first-class Monaco + agent collaboration without leaving the dashboard narrative half-finished.","status":"documented_gap"}',
  0.9,
  0.88,
  'composer2_agentsam',
  unixepoch(),
  unixepoch()
);

INSERT INTO agent_memory_index (
  id,
  tenant_id,
  agent_config_id,
  memory_type,
  key,
  value,
  importance_score,
  created_at,
  updated_at
) VALUES (
  'mem_ui_monaco_agents_gap_20260322',
  'tenant_sam_primeaux',
  'agent-sam-primary',
  'user_context',
  'inneranimalmedia_dashboard_monaco_agent_ux',
  'InnerAnimalMedia: agent/backend can track edits and changes; dashboard Monaco + Agent Sam UI/UX still maturing—not yet full in-UI editing/diff/agent orchestration. Plan UI work accordingly.',
  0.92,
  unixepoch(),
  unixepoch()
);

UPDATE projects SET
  metadata_json = json_set(
    COALESCE(NULLIF(metadata_json, ''), '{}'),
    '$.ui_ux_monaco_agents',
    '{"capability":"agent_sees_code_changes_via_tooling","gap":"dashboard_monaco_agent_surfaces_not_final","priority":"agent_polish_settings_editor"}'
  ),
  updated_at = CURRENT_TIMESTAMP
WHERE id = 'proj_iam_agentsam_composer2_20260322';

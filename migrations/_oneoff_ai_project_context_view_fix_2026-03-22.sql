-- Fix ai_project_context: previous filter used status IN ('planning','active') which violates
-- projects CHECK constraint (allowed: discovery, design, development, qa, staging, production, maintenance, archived).
-- Recreate view so in-flight projects (including development) surface for context UIs.

DROP VIEW IF EXISTS ai_project_context;

CREATE VIEW ai_project_context AS
SELECT
  p.id as project_id,
  p.name as project_name,
  p.client_name as description,
  p.status,
  NULL as priority,
  NULL as tokens_used,
  NULL as budget_tokens,
  'unlimited' as token_status,
  0 as tag_count,
  (SELECT COUNT(*) FROM project_goals WHERE project_id = p.id AND status = 'active') as active_goals,
  (SELECT COUNT(*) FROM project_goals WHERE project_id = p.id AND status = 'completed') as completed_goals,
  (SELECT AVG(current_progress_percent) FROM project_goals WHERE project_id = p.id AND status IN ('active', 'completed')) as avg_goal_progress,
  (SELECT COUNT(*) FROM project_memory WHERE project_id = p.id AND memory_type IN ('constraint', 'best_practice')) as learned_constraints,
  (SELECT COUNT(*) FROM approval_requests WHERE project_id = p.id AND status = 'pending') as pending_approvals,
  (SELECT COUNT(DISTINCT capability_slug) FROM project_capability_constraints WHERE project_id = p.id AND is_enabled = 1) as enabled_capabilities
FROM projects p
WHERE p.status IN ('discovery', 'design', 'development', 'qa', 'staging');

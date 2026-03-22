-- One-off: activity log for CIDI row id=4 (CIDI-IAM-AGENTSAM-20260322).
-- Applied to production D1 via wrangler 2026-03-22.

INSERT INTO cidi_activity_log (
  cidi_id,
  workflow_id,
  action_type,
  field_changed,
  old_value,
  new_value,
  change_description,
  changed_by,
  changed_at,
  ip_address,
  user_agent,
  metadata_json
) VALUES (
  4,
  'CIDI-IAM-AGENTSAM-20260322',
  'updated',
  NULL,
  NULL,
  NULL,
  'Recorded platform UI stability workstream in CIDI; branch cursor/platform-ui-stability-1eca, Worker inneranimalmedia, D1 inneranimalmedia-business. Activity log entry for dashboard /api/agent/cidi visibility.',
  'cursor_agent',
  datetime('now'),
  NULL,
  NULL,
  '{"repo":"SamPrimeaux/inneranimalmedia-agentsam-dashboard","branch":"cursor/platform-ui-stability-1eca","worker":"inneranimalmedia","event":"cidi_activity_seed"}'
);

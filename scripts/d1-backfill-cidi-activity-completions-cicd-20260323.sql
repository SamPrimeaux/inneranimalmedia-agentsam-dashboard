-- Idempotent backfill: cidi_activity_log, cidi_recent_completions, cicd_runs
-- Target D1: inneranimalmedia-business
-- Safe to re-run: uses metadata_json / deterministic ids / NOT EXISTS guards.
-- Applied: 2026-03-23 (agent)
-- Note: D1 remote execute rejects explicit BEGIN/COMMIT; statements run sequentially.

-- ---------------------------------------------------------------------------
-- 1) cidi_activity_log — missing workflow inception for CIDI-SWAMP-002 (cidi id 3)
-- ---------------------------------------------------------------------------
INSERT INTO cidi_activity_log (
  cidi_id, workflow_id, action_type, field_changed, old_value, new_value,
  change_description, changed_by, changed_at, ip_address, user_agent, metadata_json
)
SELECT
  3,
  'CIDI-SWAMP-002',
  'created',
  NULL,
  NULL,
  NULL,
  'Backfill: workflow record present in cidi (pending); inception activity for /api/agent/cidi timeline parity.',
  'd1_backfill',
  '2026-02-20 19:48:59',
  NULL,
  NULL,
  '{"backfill_id":"bf_cal_cidi3_created_v1","source":"scripts/d1-backfill-cidi-activity-completions-cicd-20260323.sql"}'
WHERE NOT EXISTS (
  SELECT 1 FROM cidi_activity_log
  WHERE metadata_json LIKE '%bf_cal_cidi3_created_v1%'
);

-- ---------------------------------------------------------------------------
-- 2) cidi_activity_log — InnerAnimalMedia / IAM platform milestones (cidi id 4)
-- ---------------------------------------------------------------------------
INSERT INTO cidi_activity_log (
  cidi_id, workflow_id, action_type, field_changed, old_value, new_value,
  change_description, changed_by, changed_at, metadata_json
)
SELECT 4, 'CIDI-IAM-AGENTSAM-20260322', 'updated', 'external_references', NULL, NULL,
  'Backfill: external_references uses pipe delimiter between GitHub tree URL and inneranimal-dashboard workers.dev sandbox URL.',
  'd1_backfill', '2026-03-22 15:50:00',
  '{"backfill_id":"bf_cal_iam_extref_delim_v1"}'
WHERE NOT EXISTS (SELECT 1 FROM cidi_activity_log WHERE metadata_json LIKE '%bf_cal_iam_extref_delim_v1%');

INSERT INTO cidi_activity_log (
  cidi_id, workflow_id, action_type, field_changed, old_value, new_value,
  change_description, changed_by, changed_at, metadata_json
)
SELECT 4, 'CIDI-IAM-AGENTSAM-20260322', 'updated', NULL, NULL, NULL,
  'Backfill: merged origin/main into cursor/platform-ui-stability-1eca; resolved sandbox handoff + upload-repo-to-r2-sandbox.sh; restored early sandbox / redirect.',
  'd1_backfill', '2026-03-22 18:30:00',
  '{"backfill_id":"bf_cal_iam_merge_main_v1"}'
WHERE NOT EXISTS (SELECT 1 FROM cidi_activity_log WHERE metadata_json LIKE '%bf_cal_iam_merge_main_v1%');

INSERT INTO cidi_activity_log (
  cidi_id, workflow_id, action_type, field_changed, old_value, new_value,
  change_description, changed_by, changed_at, metadata_json
)
SELECT 4, 'CIDI-IAM-AGENTSAM-20260322', 'updated', NULL, NULL, NULL,
  'Backfill: sandbox Worker inneranimal-dashboard — R2 ASSETS+DASHBOARD on agent-sam-sandbox-cidi; SANDBOX_DASHBOARD_PASSWORD gate for DB-driven sign-in.',
  'd1_backfill', '2026-03-22 20:40:00',
  '{"backfill_id":"bf_cal_iam_sandbox_auth_v1"}'
WHERE NOT EXISTS (SELECT 1 FROM cidi_activity_log WHERE metadata_json LIKE '%bf_cal_iam_sandbox_auth_v1%');

INSERT INTO cidi_activity_log (
  cidi_id, workflow_id, action_type, field_changed, old_value, new_value,
  change_description, changed_by, changed_at, metadata_json
)
SELECT 4, 'CIDI-IAM-AGENTSAM-20260322', 'updated', NULL, NULL, NULL,
  'Backfill: populated cicd_runs from deployments table for Overview /api/overview/deployments CI widget.',
  'd1_backfill', '2026-03-23 12:00:00',
  '{"backfill_id":"bf_cal_iam_cicd_backfill_v1"}'
WHERE NOT EXISTS (SELECT 1 FROM cidi_activity_log WHERE metadata_json LIKE '%bf_cal_iam_cicd_backfill_v1%');

-- ---------------------------------------------------------------------------
-- 3) cidi_recent_completions — in production this name is a VIEW on `cidi`, not a table:
--     completed workflows + actual_completion_date within last 90 days (+ client/project joins).
--     Do not INSERT here. Optional hygiene if a completed row lacks actual_completion_date:
-- ---------------------------------------------------------------------------
UPDATE cidi
SET actual_completion_date = COALESCE(
  NULLIF(TRIM(actual_completion_date), ''),
  date(COALESCE(updated_at, created_at))
)
WHERE implementation_status = 'completed'
  AND (actual_completion_date IS NULL OR TRIM(actual_completion_date) = '');

-- ---------------------------------------------------------------------------
-- 4) cicd_runs — backfill from deployments (production deploy log)
-- ---------------------------------------------------------------------------
INSERT INTO cicd_runs (
  id, tenant_id, run_id, workflow_name, workflow_id, repo_name, branch,
  commit_sha, commit_message, trigger_event, status, conclusion, actor,
  run_attempt, run_url, logs_url, webhook_event_id, cloudflare_deployment_id,
  started_at, completed_at, duration_ms, created_at, updated_at
)
SELECT
  'bfcd_' || REPLACE(d.id, '-', '_'),
  'tenant_sam_primeaux',
  d.id,
  COALESCE(NULLIF(TRIM(d.worker_name), ''), 'inneranimalmedia'),
  NULL,
  'SamPrimeaux/inneranimalmedia-agentsam-dashboard',
  CASE
    WHEN LOWER(COALESCE(d.environment, '')) IN ('production', 'prod') THEN 'main'
    ELSE COALESCE(NULLIF(TRIM(d.environment), ''), 'production')
  END,
  CASE
    WHEN d.git_hash IS NOT NULL AND LENGTH(TRIM(d.git_hash)) >= 7 THEN SUBSTR(TRIM(d.git_hash), 1, 40)
    ELSE NULL
  END,
  d.description,
  'deployment_tracking',
  CASE LOWER(COALESCE(NULLIF(TRIM(d.status), ''), ''))
    WHEN 'success' THEN 'success'
    WHEN 'failure' THEN 'failure'
    WHEN 'error' THEN 'failure'
    WHEN 'cancelled' THEN 'cancelled'
    ELSE 'success'
  END,
  CASE LOWER(COALESCE(NULLIF(TRIM(d.status), ''), ''))
    WHEN 'success' THEN 'success'
    WHEN 'failure' THEN 'failure'
    WHEN 'error' THEN 'failure'
    WHEN 'cancelled' THEN 'cancelled'
    ELSE 'success'
  END,
  COALESCE(NULLIF(TRIM(d.deployed_by), ''), 'system'),
  1,
  NULL,
  NULL,
  NULL,
  d.id,
  d.timestamp,
  d.timestamp,
  COALESCE(d.deploy_duration_ms, CAST(d.deploy_time_seconds AS INTEGER) * 1000),
  d.timestamp,
  d.timestamp
FROM deployments d
WHERE NOT EXISTS (SELECT 1 FROM cicd_runs c WHERE c.run_id = d.id);

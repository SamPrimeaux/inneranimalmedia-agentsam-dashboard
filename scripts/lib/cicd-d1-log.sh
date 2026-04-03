#!/usr/bin/env bash
# cicd-d1-log.sh — append CICD audit rows to D1 (inneranimalmedia-business)
# Sourced by deploy-sandbox.sh and promote-to-prod.sh.
#
# Tables: cicd_github_runs, cicd_pipeline_runs, cicd_run_steps, cicd_events,
#         pipelines (seed), pipeline_runs (FK -> pipelines.id)
# (cicd_notifications inserts removed — run_id FK did not match cicd_pipeline_runs in D1.)
# Intentionally does NOT insert into cicd_runs (operator may log that separately).
#
# Requires: WRANGLER=(./scripts/with-cloudflare-env.sh npx wrangler), PROD_CFG=wrangler.production.toml,
#           REPO_ROOT set by caller.
#
# Disable: CICD_D1_LOG=0

cicd_sql_escape() { printf '%s' "$1" | sed "s/'/''/g"; }

cicd_git_export() {
  local root="${REPO_ROOT:-.}"
  CICD_GIT_SHA=$(git -C "$root" rev-parse HEAD 2>/dev/null || echo "unknown")
  CICD_GIT_BRANCH=$(git -C "$root" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")
  CICD_GIT_MSG=$(git -C "$root" log -1 --pretty=%B 2>/dev/null | tr '\n' ' ' | head -c 800)
  CICD_GIT_MSG_ESC=$(cicd_sql_escape "$CICD_GIT_MSG")
  local remote
  remote=$(git -C "$root" config --get remote.origin.url 2>/dev/null || true)
  if [[ "$remote" =~ github\.com[:/]([^/]+/[^/.]+)(\.git)?$ ]]; then
    CICD_REPO_NAME="${BASH_REMATCH[1]}"
  else
    CICD_REPO_NAME="${CICD_REPO_NAME:-SamPrimeaux/inneranimalmedia-agentsam-dashboard}"
  fi
  CICD_ACTOR_ESC=$(cicd_sql_escape "${GIT_ACTOR:-${TRIGGERED_BY:-sam_primeaux}}")
}

# Args: iso_started iso_completed duration_ms (optional; use empty for NULL duration)
cicd_iso_now() { date -u +%Y-%m-%dT%H:%M:%SZ; }

# Registry rows for deploy_sandbox / promote_prod (pipeline_runs.pipeline_id -> pipelines.id)
cicd_seed_pipelines_registry() {
  "${WRANGLER[@]}" d1 execute inneranimalmedia-business --remote -c "$PROD_CFG" --command="
INSERT OR IGNORE INTO pipelines (slug, name, pipeline_type, category, provider, trigger_type) VALUES
  ('deploy_sandbox', 'Deploy sandbox', 'deploy', 'deploy', 'cloudflare', 'manual'),
  ('promote_prod', 'Promote to production', 'deploy', 'deploy', 'cloudflare', 'manual');
" 2>/dev/null || echo "  WARN: pipelines seed D1 failed (non-fatal)"
}

# --- Sandbox deploy (inneranimal-dashboard + sandbox R2) ---------------------
cicd_log_sandbox_deploy() {
  [ "${CICD_D1_LOG:-1}" = "0" ] && return 0
  local worker_vid="${1:?worker version id}"
  local dash_v="${2:?dashboard v number}"
  local bucket="${3:-agent-sam-sandbox-cicd}"
  local r2_files="${4:-0}"
  local r2_bytes="${5:-0}"
  local ms_build="${6:-}"
  local ms_r2="${7:-}"
  local ms_worker="${8:-}"
  local ms_d1="${9:-}"
  local health_http="${10:-200}"
  local health_preview="${11:-Sandbox /dashboard/agent}"

  cicd_seed_pipelines_registry
  cicd_git_export
  local ts="${DEPLOY_TS:-$(date -u +%Y%m%d%H%M%S)}"
  local pipe_id="pipe_${ts}_sandbox_v${dash_v}"
  local gh_id="gh_${ts}_sandbox_v${dash_v}"
  local started
  started=$(cicd_iso_now)
  local completed
  completed=$(cicd_iso_now)
  local dur_ms=$(( ${ms_build:-0} + ${ms_r2:-0} + ${ms_worker:-0} + ${ms_d1:-0} ))
  [ "$dur_ms" -eq 0 ] && dur_ms="NULL" || true

  local notes_esc
  notes_esc=$(cicd_sql_escape "deploy-sandbox.sh | dashboard-v:${dash_v} | worker ${worker_vid} | ${r2_files} files | ${bucket}")

  # 1) GitHub-style run (manual / local script)
  "${WRANGLER[@]}" d1 execute inneranimalmedia-business --remote -c "$PROD_CFG" --command="
INSERT OR IGNORE INTO cicd_github_runs (
  run_id, workflow_name, repo_name, branch, commit_sha, commit_message,
  trigger_event, status, conclusion, run_attempt, started_at, completed_at, duration_ms
) VALUES (
  '${gh_id}', 'deploy-sandbox.sh (manual)', '${CICD_REPO_NAME}', '${CICD_GIT_BRANCH}', '${CICD_GIT_SHA}', '${CICD_GIT_MSG_ESC}',
  'workflow_run', 'success', 'success', 1, '${started}', '${completed}', ${dur_ms}
);" 2>/dev/null || echo "  WARN: cicd_github_runs D1 log failed (non-fatal)"

  # 2) Pipeline shell
  "${WRANGLER[@]}" d1 execute inneranimalmedia-business --remote -c "$PROD_CFG" --command="
INSERT OR IGNORE INTO cicd_pipeline_runs (
  run_id, commit_hash, branch, env, status, completed_at, notes
) VALUES (
  '${pipe_id}', '${CICD_GIT_SHA}', '${CICD_GIT_BRANCH}', 'sandbox', 'passed', '${completed}', '${notes_esc}'
);" 2>/dev/null || echo "  WARN: cicd_pipeline_runs D1 log failed (non-fatal)"

  local dur_sql unix_completed unix_started pr_id meta_esc
  if [[ "$dur_ms" =~ ^[0-9]+$ ]]; then
    dur_sql="$dur_ms"
  else
    dur_sql="NULL"
  fi
  unix_completed=$(date +%s)
  if [[ "$dur_sql" =~ ^[0-9]+$ ]] && [ "$dur_sql" -gt 0 ]; then
    unix_started=$((unix_completed - dur_sql / 1000))
  else
    unix_started=$unix_completed
  fi
  pr_id="prun_${ts}_sb_v${dash_v}"
  meta_esc=$(cicd_sql_escape "{\"cicd_pipeline_run_id\":\"${pipe_id}\",\"cicd_github_run_id\":\"${gh_id}\",\"dashboard_v\":\"${dash_v}\",\"r2_files\":${r2_files},\"r2_bytes\":${r2_bytes}}")
  "${WRANGLER[@]}" d1 execute inneranimalmedia-business --remote -c "$PROD_CFG" --command="
INSERT INTO pipeline_runs (
  id, pipeline_id, environment, trigger_source, triggered_by, provider,
  status, git_commit_sha, worker_version, duration_ms, queued_at, started_at, completed_at,
  success_rate, tokens_in, tokens_out, cost_usd, notes, metadata_json
) VALUES (
  '${pr_id}',
  (SELECT id FROM pipelines WHERE slug='deploy_sandbox' LIMIT 1),
  'sandbox', 'manual', '${CICD_ACTOR_ESC}', 'cloudflare',
  'success', '${CICD_GIT_SHA}', '${worker_vid}', ${dur_sql}, ${unix_started}, ${unix_started}, ${unix_completed},
  1.0, 0, 0, 0.0, '${notes_esc}', '${meta_esc}'
);" 2>/dev/null || echo "  WARN: pipeline_runs D1 log failed (non-fatal)"

  # 3) Steps (FK -> cicd_pipeline_runs.run_id)
  local sql_http_hp
  if [ -n "${health_http}" ] && [ "${health_http}" != "NULL" ]; then
    sql_http_hp="${health_http}"
  else
    sql_http_hp="NULL"
  fi
  local hp_esc
  hp_esc=$(cicd_sql_escape "${health_preview}")
  local r2_prev
  r2_prev=$(cicd_sql_escape "${r2_files} files; ${r2_bytes} bytes; ${bucket}")
  "${WRANGLER[@]}" d1 execute inneranimalmedia-business --remote -c "$PROD_CFG" --command="
INSERT OR IGNORE INTO cicd_run_steps (id, run_id, tool_name, test_type, status, latency_ms, http_status, error, response_preview, tested_at) VALUES
  ('step_${ts}_sb_npm', '${pipe_id}', 'npm_ci_vite_build', 'invoke', 'pass', ${ms_build:-NULL}, NULL, NULL, 'Vite dist + manifest', '${completed}'),
  ('step_${ts}_sb_r2', '${pipe_id}', 'wrangler_r2_put', 'r2', 'pass', ${ms_r2:-NULL}, NULL, NULL, '${r2_prev}', '${completed}'),
  ('step_${ts}_sb_wr', '${pipe_id}', 'wrangler_deploy', 'invoke', 'pass', ${ms_worker:-NULL}, NULL, NULL, 'inneranimal-dashboard @ ${worker_vid}', '${completed}'),
  ('step_${ts}_sb_d1', '${pipe_id}', 'd1_dashboard_versions', 'd1', 'pass', ${ms_d1:-NULL}, NULL, NULL, 'dashboard_versions rows', '${completed}'),
  ('step_${ts}_sb_hc', '${pipe_id}', 'sandbox_health_check', 'route', 'pass', NULL, ${sql_http_hp}, NULL, '${hp_esc}', '${completed}');
" 2>/dev/null || echo "  WARN: cicd_run_steps D1 log failed (non-fatal)"

  # 4) Events — minimal columns compatible with older schema (see agent-dashboard/scripts/deploy-agent-sam.sh)
  local ev1="evt_${ts}_sb_push"
  local ev2="evt_${ts}_sb_r2"
  local ev3="evt_${ts}_sb_wr"
  "${WRANGLER[@]}" d1 execute inneranimalmedia-business --remote -c "$PROD_CFG" --command="
INSERT OR IGNORE INTO cicd_events (id, source, event_type, repo_name, git_branch, git_commit_sha, git_commit_message, git_actor, worker_name, r2_bucket, r2_key) VALUES
 ('${ev1}', 'manual', 'push', '${CICD_REPO_NAME}', '${CICD_GIT_BRANCH}', '${CICD_GIT_SHA}', '${CICD_GIT_MSG_ESC}', '${CICD_ACTOR_ESC}', NULL, NULL, 'git:HEAD'),
 ('${ev2}', 'manual', 'r2_bundle_updated', '${CICD_REPO_NAME}', '${CICD_GIT_BRANCH}', '${CICD_GIT_SHA}', '${CICD_GIT_MSG_ESC}', '${CICD_ACTOR_ESC}', 'inneranimal-dashboard', '${bucket}', '${R2_AGENT_PREFIX:-static/dashboard/agent}/.deploy-manifest'),
 ('${ev3}', 'manual', 'worker_script_updated', '${CICD_REPO_NAME}', '${CICD_GIT_BRANCH}', '${CICD_GIT_SHA}', '${CICD_GIT_MSG_ESC}', '${CICD_ACTOR_ESC}', 'inneranimal-dashboard', NULL, 'version:${worker_vid}');
" 2>/dev/null || echo "  WARN: cicd_events D1 log failed (non-fatal)"

  echo "[cicd-d1-log] sandbox pipeline ${pipe_id} (github ${gh_id})"
}

# --- Production promote (inneranimalmedia worker + prod R2) -------------------
cicd_log_prod_promote() {
  [ "${CICD_D1_LOG:-1}" = "0" ] && return 0
  local worker_vid="${1:?prod worker version id}"
  local dash_v="${2:?dashboard v from HTML}"
  local r2_files="${3:-0}"
  local ms_pull="${4:-}"
  local ms_push="${5:-}"
  local ms_worker="${6:-}"
  local ms_d1="${7:-}"
  local health_http="${8:-200}"

  cicd_seed_pipelines_registry
  cicd_git_export
  local ts="${DEPLOY_TS:-$(date -u +%Y%m%d%H%M%S)}"
  local pipe_id="pipe_${ts}_prod_v${dash_v}"
  local gh_id="gh_${ts}_prod_v${dash_v}"
  local started completed
  started=$(cicd_iso_now)
  completed=$(cicd_iso_now)
  local dur_ms=$(( ${ms_pull:-0} + ${ms_push:-0} + ${ms_worker:-0} + ${ms_d1:-0} ))
  [ "$dur_ms" -eq 0 ] && dur_ms="NULL" || true

  local notes_esc
  notes_esc=$(cicd_sql_escape "promote-to-prod.sh | v${dash_v} | worker ${worker_vid} | ${r2_files} R2 objects | agent-sam")

  "${WRANGLER[@]}" d1 execute inneranimalmedia-business --remote -c "$PROD_CFG" --command="
INSERT OR IGNORE INTO cicd_github_runs (
  run_id, workflow_name, repo_name, branch, commit_sha, commit_message,
  trigger_event, status, conclusion, run_attempt, started_at, completed_at, duration_ms
) VALUES (
  '${gh_id}', 'promote-to-prod.sh (manual)', '${CICD_REPO_NAME}', '${CICD_GIT_BRANCH}', '${CICD_GIT_SHA}', '${CICD_GIT_MSG_ESC}',
  'workflow_run', 'success', 'success', 1, '${started}', '${completed}', ${dur_ms}
);" 2>/dev/null || echo "  WARN: cicd_github_runs D1 log failed (non-fatal)"

  "${WRANGLER[@]}" d1 execute inneranimalmedia-business --remote -c "$PROD_CFG" --command="
INSERT OR IGNORE INTO cicd_pipeline_runs (
  run_id, commit_hash, branch, env, status, completed_at, notes
) VALUES (
  '${pipe_id}', '${CICD_GIT_SHA}', '${CICD_GIT_BRANCH}', 'production', 'passed', '${completed}', '${notes_esc}'
);" 2>/dev/null || echo "  WARN: cicd_pipeline_runs D1 log failed (non-fatal)"

  local dur_sql unix_completed unix_started pr_id meta_esc
  if [[ "$dur_ms" =~ ^[0-9]+$ ]]; then
    dur_sql="$dur_ms"
  else
    dur_sql="NULL"
  fi
  unix_completed=$(date +%s)
  if [[ "$dur_sql" =~ ^[0-9]+$ ]] && [ "$dur_sql" -gt 0 ]; then
    unix_started=$((unix_completed - dur_sql / 1000))
  else
    unix_started=$unix_completed
  fi
  pr_id="prun_${ts}_prod_v${dash_v}"
  meta_esc=$(cicd_sql_escape "{\"cicd_pipeline_run_id\":\"${pipe_id}\",\"cicd_github_run_id\":\"${gh_id}\",\"dashboard_v\":\"${dash_v}\",\"r2_files\":${r2_files}}")
  "${WRANGLER[@]}" d1 execute inneranimalmedia-business --remote -c "$PROD_CFG" --command="
INSERT INTO pipeline_runs (
  id, pipeline_id, environment, trigger_source, triggered_by, provider,
  status, git_commit_sha, worker_version, duration_ms, queued_at, started_at, completed_at,
  success_rate, tokens_in, tokens_out, cost_usd, notes, metadata_json
) VALUES (
  '${pr_id}',
  (SELECT id FROM pipelines WHERE slug='promote_prod' LIMIT 1),
  'production', 'manual', '${CICD_ACTOR_ESC}', 'cloudflare',
  'success', '${CICD_GIT_SHA}', '${worker_vid}', ${dur_sql}, ${unix_started}, ${unix_started}, ${unix_completed},
  1.0, 0, 0, 0.0, '${notes_esc}', '${meta_esc}'
);" 2>/dev/null || echo "  WARN: pipeline_runs D1 log failed (non-fatal)"

  "${WRANGLER[@]}" d1 execute inneranimalmedia-business --remote -c "$PROD_CFG" --command="
INSERT OR IGNORE INTO cicd_run_steps (id, run_id, tool_name, test_type, status, latency_ms, http_status, error, response_preview, tested_at) VALUES
  ('step_${ts}_pr_pull', '${pipe_id}', 'r2_pull_sandbox_manifest', 'r2', 'pass', ${ms_pull:-NULL}, NULL, NULL, 'agent-sam-sandbox-cicd -> dist', '${completed}'),
  ('step_${ts}_pr_push', '${pipe_id}', 'r2_put_production', 'r2', 'pass', ${ms_push:-NULL}, NULL, NULL, '${r2_files} objects -> agent-sam', '${completed}'),
  ('step_${ts}_pr_wr', '${pipe_id}', 'wrangler_deploy_production', 'invoke', 'pass', ${ms_worker:-NULL}, NULL, NULL, 'inneranimalmedia @ ${worker_vid}', '${completed}'),
  ('step_${ts}_pr_d1', '${pipe_id}', 'd1_dashboard_versions_prod', 'd1', 'pass', ${ms_d1:-NULL}, NULL, NULL, 'dashboard_versions + deployments', '${completed}'),
  ('step_${ts}_pr_hc', '${pipe_id}', 'prod_health_check', 'route', 'pass', NULL, ${health_http}, NULL, 'https://inneranimalmedia.com/dashboard/agent', '${completed}');
" 2>/dev/null || echo "  WARN: cicd_run_steps D1 log failed (non-fatal)"

  local ev1="evt_${ts}_pr_promo"
  local ev2="evt_${ts}_pr_r2"
  local ev3="evt_${ts}_pr_wr"
  "${WRANGLER[@]}" d1 execute inneranimalmedia-business --remote -c "$PROD_CFG" --command="
INSERT OR IGNORE INTO cicd_events (id, source, event_type, repo_name, git_branch, git_commit_sha, git_commit_message, git_actor, worker_name, r2_bucket, r2_key) VALUES
 ('${ev1}', 'manual', 'push', '${CICD_REPO_NAME}', '${CICD_GIT_BRANCH}', '${CICD_GIT_SHA}', '${CICD_GIT_MSG_ESC}', '${CICD_ACTOR_ESC}', NULL, NULL, 'promote:git'),
 ('${ev2}', 'manual', 'r2_bundle_updated', '${CICD_REPO_NAME}', '${CICD_GIT_BRANCH}', '${CICD_GIT_SHA}', '${CICD_GIT_MSG_ESC}', '${CICD_ACTOR_ESC}', 'inneranimalmedia', 'agent-sam', 'static/dashboard/agent/'),
 ('${ev3}', 'manual', 'worker_script_updated', '${CICD_REPO_NAME}', '${CICD_GIT_BRANCH}', '${CICD_GIT_SHA}', '${CICD_GIT_MSG_ESC}', '${CICD_ACTOR_ESC}', 'inneranimalmedia', NULL, 'version:${worker_vid}');
" 2>/dev/null || echo "  WARN: cicd_events D1 log failed (non-fatal)"

  echo "[cicd-d1-log] production pipeline ${pipe_id} (github ${gh_id})"
}

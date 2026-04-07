#!/usr/bin/env bash
# cicd-d1-log.sh — append CICD audit rows to D1 (inneranimalmedia-business)
# Sourced by deploy-sandbox.sh and promote-to-prod.sh.
#
# Tables: cicd_github_runs, cicd_pipeline_runs, cicd_run_steps, cicd_events,
#         cicd_runs, pipelines, pipeline_runs (FK -> pipelines.id)
#
# Optional env (sandbox / prod deploy callers):
#   CICD_PHASE_SANDBOX_START_UNIX, CICD_PHASE_SANDBOX_END_UNIX, CICD_PHASE_SANDBOX_DURATION_MS
#   CICD_WALL_TOTAL_MS — full script wall time in ms
#   CICD_R2_BUNDLE_BYTES — du -sb dist (or caller fallback)
#   CICD_CF_HEALTH_STATUS_CODE, CICD_CF_HEALTH_URL, CICD_CF_HEALTH_RESPONSE_MS, CICD_CF_HEALTH_STATUS
#   CICD_EVENT_ID — cicd_events.id to set on cicd_runs.event_id (webhook-triggered runs)
#   WORKER_NAME — inneranimal-dashboard | inneranimalmedia
#   CICD_PROMOTE_* — for prod: CICD_PHASE_PROMOTE_START_UNIX, CICD_PHASE_PROMOTE_END_UNIX,
#                    CICD_PHASE_PROMOTE_DURATION_MS (optional; else derived from phase timings)
#
# Requires: WRANGLER=(./scripts/with-cloudflare-env.sh npx wrangler), PROD_CFG=wrangler.production.toml,
#           REPO_ROOT set by caller.
#
# Disable: CICD_D1_LOG=0
#
# Schema extras: migrations/223_cicd_deploy_log_columns.sql (non-fatal if not applied yet).

cicd_sql_escape() { printf '%s' "$1" | sed "s/'/''/g"; }

# Non-fatal D1 execute (never blocks deploy)
cicd_d1_nf() {
  "${WRANGLER[@]}" d1 execute inneranimalmedia-business --remote -c "$PROD_CFG" --command="$1" 2>/dev/null || true
}

cicd_git_export() {
  local root="${REPO_ROOT:-.}"
  CICD_GIT_SHA=$(git -C "$root" rev-parse HEAD 2>/dev/null || echo "unknown")
  CICD_GIT_BRANCH=$(git -C "$root" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")
  CICD_GIT_MSG=$(git -C "$root" log -1 --pretty=%B 2>/dev/null | tr '\n' ' ' | head -c 800)
  CICD_GIT_MSG_ESC=$(cicd_sql_escape "$CICD_GIT_MSG")
  CICD_GIT_SUBJECT=$(git -C "$root" log -1 --pretty=%s 2>/dev/null || echo "")
  CICD_GIT_SUBJECT_ESC=$(cicd_sql_escape "$CICD_GIT_SUBJECT")
  local gname
  gname=$(git -C "$root" config user.name 2>/dev/null || true)
  if [ -z "$gname" ]; then
    gname=$(git -C "$root" log -1 --pretty=%an 2>/dev/null || echo "")
  fi
  [ -z "$gname" ] && gname="unknown"
  CICD_GIT_ACTOR_NAME="$gname"
  CICD_GIT_ACTOR_ESC=$(cicd_sql_escape "$gname")
  local remote
  remote=$(git -C "$root" config --get remote.origin.url 2>/dev/null || true)
  if [[ "$remote" =~ github\.com[:/]([^/]+/[^/.]+)(\.git)?$ ]]; then
    CICD_REPO_NAME="${BASH_REMATCH[1]}"
  else
    CICD_REPO_NAME="${CICD_REPO_NAME:-SamPrimeaux/inneranimalmedia-agentsam-dashboard}"
  fi
  CICD_ACTOR_ESC=$(cicd_sql_escape "${GIT_ACTOR:-${TRIGGERED_BY:-sam_primeaux}}")
}

cicd_iso_now() { date -u +%Y-%m-%dT%H:%M:%SZ; }

cicd_seed_pipelines_registry() {
  cicd_d1_nf "
INSERT OR IGNORE INTO pipelines (slug, name, pipeline_type, category, provider, trigger_type) VALUES
  ('deploy_sandbox', 'Deploy sandbox', 'deploy', 'deploy', 'cloudflare', 'manual'),
  ('promote_prod', 'Promote to production', 'deploy', 'deploy', 'cloudflare', 'manual');
"
}

# Map HTTP code + latency to healthy | degraded | down (bash)
cicd_cf_health_label() {
  local code="${1:-0}"
  if [[ "$code" =~ ^2[0-9][0-9]$ ]]; then
    printf '%s' "healthy"
  elif [[ "$code" =~ ^[23][0-9][0-9]$ ]]; then
    printf '%s' "degraded"
  else
    printf '%s' "down"
  fi
}

# After deployments row exists: git_hash + wall-clock deploy seconds (non-fatal)
cicd_crosslink_deployment_after_worker() {
  local vid="${1:?deployment id}"
  local gh="${2:-unknown}"
  local dur_ms="${3:-0}"
  [[ "$dur_ms" =~ ^[0-9]+$ ]] || dur_ms=0
  local secs=$((dur_ms / 1000))
  local vid_esc
  vid_esc=$(cicd_sql_escape "$vid")
  local gh_esc
  gh_esc=$(cicd_sql_escape "$gh")
  cicd_d1_nf "UPDATE deployments SET git_hash='${gh_esc}', deploy_time_seconds=${secs} WHERE id='${vid_esc}';"
}

# --- Sandbox deploy (inneranimal-dashboard + sandbox R2) ---------------------
# Args: worker_version_id, dashboard_v, bucket, r2_files_updated, r2_bytes_legacy,
#       ms_build, ms_r2, ms_worker, ms_d1, health_http_code, health_preview_url
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

  local bundle_bytes="${CICD_R2_BUNDLE_BYTES:-$r2_bytes}"
  [[ "$bundle_bytes" =~ ^[0-9]+$ ]] || bundle_bytes=0

  local wname="${WORKER_NAME:-inneranimal-dashboard}"
  local ts="${DEPLOY_TS:-$(date -u +%Y%m%d%H%M%S)}"
  local pipe_id="pipe_${ts}_sandbox_v${dash_v}"
  local gh_id="gh_${ts}_sandbox_v${dash_v}"

  local phase_sb_start="${CICD_PHASE_SANDBOX_START_UNIX:-$(date +%s)}"
  local phase_sb_end="${CICD_PHASE_SANDBOX_END_UNIX:-$(date +%s)}"
  local phase_sb_dur="${CICD_PHASE_SANDBOX_DURATION_MS:-}"
  if ! [[ "$phase_sb_dur" =~ ^[0-9]+$ ]]; then
    phase_sb_dur=$(( (phase_sb_end - phase_sb_start) * 1000 ))
    [ "$phase_sb_dur" -lt 0 ] && phase_sb_dur=0
  fi

  cicd_seed_pipelines_registry
  cicd_git_export
  local started completed
  started=$(cicd_iso_now)
  completed=$(cicd_iso_now)
  local dur_ms=$(( ${ms_build:-0} + ${ms_r2:-0} + ${ms_worker:-0} + ${ms_d1:-0} ))
  [ "$dur_ms" -eq 0 ] && dur_ms="NULL" || true
  local wall_ms="${CICD_WALL_TOTAL_MS:-}"
  if ! [[ "$wall_ms" =~ ^[0-9]+$ ]]; then
    if [[ "$dur_ms" =~ ^[0-9]+$ ]]; then
      wall_ms="$dur_ms"
    else
      wall_ms="$phase_sb_dur"
    fi
  fi

  local hc_url="${CICD_CF_HEALTH_URL:-$health_preview}"
  local hc_code="${CICD_CF_HEALTH_STATUS_CODE:-$health_http}"
  [[ "$hc_code" =~ ^[0-9]+$ ]] || hc_code=0
  local hc_resp_ms="${CICD_CF_HEALTH_RESPONSE_MS:-}"
  [[ "$hc_resp_ms" =~ ^[0-9]+$ ]] || hc_resp_ms=NULL
  local hc_status="${CICD_CF_HEALTH_STATUS:-$(cicd_cf_health_label "$hc_code")}"
  local hc_status_esc
  hc_status_esc=$(cicd_sql_escape "$hc_status")
  local hc_url_esc
  hc_url_esc=$(cicd_sql_escape "$hc_url")

  local pipe_status="passed"
  local final_status="success"
  local final_conclusion="success"
  if [ "$worker_vid" = "unknown" ] || [ -z "$worker_vid" ]; then
    pipe_status="failed"
    final_status="failed"
    final_conclusion="failed"
  fi
  [[ "$hc_code" =~ ^(2[0-9][0-9]|30[12378])$ ]] || {
    pipe_status="failed"
    final_status="failed"
    final_conclusion="failed"
  }

  local notes_esc
  notes_esc=$(cicd_sql_escape "deploy-sandbox.sh | dashboard-v:${dash_v} | worker ${worker_vid} | ${r2_files} files | ${bucket}")

  local wv_esc
  wv_esc=$(cicd_sql_escape "$worker_vid")
  local bucket_esc
  bucket_esc=$(cicd_sql_escape "$bucket")

  # 1) GitHub-style run (manual / local script)
  cicd_d1_nf "
INSERT OR IGNORE INTO cicd_github_runs (
  run_id, workflow_name, repo_name, branch, commit_sha, commit_message,
  trigger_event, status, conclusion, run_attempt, started_at, completed_at, duration_ms
) VALUES (
  '${gh_id}', 'deploy-sandbox.sh (manual)', '${CICD_REPO_NAME}', '${CICD_GIT_BRANCH}', '${CICD_GIT_SHA}', '${CICD_GIT_MSG_ESC}',
  'workflow_run', '${final_status}', '${final_conclusion}', 1, '${started}', '${completed}', ${dur_ms}
);"

  # 2) Pipeline shell (version FK columns — require migration 223)
  cicd_d1_nf "
INSERT OR IGNORE INTO cicd_pipeline_runs (
  run_id, commit_hash, branch, env, status, completed_at, notes,
  worker_version_id, deploy_record_id
) VALUES (
  '${pipe_id}', '${CICD_GIT_SHA}', '${CICD_GIT_BRANCH}', 'sandbox', '${pipe_status}', '${completed}', '${notes_esc}',
  '${wv_esc}', '${wv_esc}'
);"

  # 2b) Cross-link (idempotent if INSERT used same values)
  cicd_d1_nf "
UPDATE cicd_pipeline_runs SET worker_version_id='${wv_esc}', deploy_record_id='${wv_esc}' WHERE run_id='${pipe_id}';
"

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
  meta_esc=$(cicd_sql_escape "{\"cicd_pipeline_run_id\":\"${pipe_id}\",\"cicd_github_run_id\":\"${gh_id}\",\"dashboard_v\":\"${dash_v}\",\"r2_files\":${r2_files},\"r2_bytes\":${bundle_bytes}}")
  cicd_d1_nf "
INSERT INTO pipeline_runs (
  id, pipeline_id, environment, trigger_source, triggered_by, provider,
  status, git_commit_sha, worker_version, duration_ms, queued_at, started_at, completed_at,
  success_rate, tokens_in, tokens_out, cost_usd, notes, metadata_json
) VALUES (
  '${pr_id}',
  (SELECT id FROM pipelines WHERE slug='deploy_sandbox' LIMIT 1),
  'sandbox', 'manual', '${CICD_ACTOR_ESC}', 'cloudflare',
  'success', '${CICD_GIT_SHA}', '${wv_esc}', ${dur_sql}, ${unix_started}, ${unix_started}, ${unix_completed},
  1.0, 0, 0, 0.0, '${notes_esc}', '${meta_esc}'
);"

  local sql_http_hp
  if [ -n "${health_http}" ] && [ "${health_http}" != "NULL" ]; then
    sql_http_hp="${health_http}"
  else
    sql_http_hp="NULL"
  fi
  local hp_esc
  hp_esc=$(cicd_sql_escape "${health_preview}")
  local r2_prev
  r2_prev=$(cicd_sql_escape "${r2_files} files; ${bundle_bytes} bytes; ${bucket}")
  local step_status="pass"
  [ "$pipe_status" = "failed" ] && step_status="fail"
  cicd_d1_nf "
INSERT OR IGNORE INTO cicd_run_steps (id, run_id, tool_name, test_type, status, latency_ms, http_status, error, response_preview, tested_at) VALUES
  ('step_${ts}_sb_npm', '${pipe_id}', 'npm_ci_vite_build', 'invoke', '${step_status}', ${ms_build:-NULL}, NULL, NULL, 'Vite dist + manifest', '${completed}'),
  ('step_${ts}_sb_r2', '${pipe_id}', 'wrangler_r2_put', 'r2', '${step_status}', ${ms_r2:-NULL}, NULL, NULL, '${r2_prev}', '${completed}'),
  ('step_${ts}_sb_wr', '${pipe_id}', 'wrangler_deploy', 'invoke', '${step_status}', ${ms_worker:-NULL}, NULL, NULL, '${wname} @ ${worker_vid}', '${completed}'),
  ('step_${ts}_sb_d1', '${pipe_id}', 'd1_dashboard_versions', 'd1', '${step_status}', ${ms_d1:-NULL}, NULL, NULL, 'dashboard_versions rows', '${completed}'),
  ('step_${ts}_sb_hc', '${pipe_id}', 'sandbox_health_check', 'route', '${step_status}', NULL, ${sql_http_hp}, NULL, '${hp_esc}', '${completed}');
"

  local ev1="evt_${ts}_sb_push"
  local ev2="evt_${ts}_sb_r2"
  local ev3="evt_${ts}_sb_wr"
  cicd_d1_nf "
INSERT OR IGNORE INTO cicd_events (id, source, event_type, repo_name, git_branch, git_commit_sha, git_commit_message, git_actor, worker_name, r2_bucket, r2_key) VALUES
 ('${ev1}', 'manual', 'push', '${CICD_REPO_NAME}', '${CICD_GIT_BRANCH}', '${CICD_GIT_SHA}', '${CICD_GIT_MSG_ESC}', '${CICD_ACTOR_ESC}', NULL, NULL, 'git:HEAD'),
 ('${ev2}', 'manual', 'r2_bundle_updated', '${CICD_REPO_NAME}', '${CICD_GIT_BRANCH}', '${CICD_GIT_SHA}', '${CICD_GIT_MSG_ESC}', '${CICD_ACTOR_ESC}', '${wname}', '${bucket}', '${R2_AGENT_PREFIX:-static/dashboard/agent}/.deploy-manifest'),
 ('${ev3}', 'manual', 'worker_script_updated', '${CICD_REPO_NAME}', '${CICD_GIT_BRANCH}', '${CICD_GIT_SHA}', '${CICD_GIT_MSG_ESC}', '${CICD_ACTOR_ESC}', '${wname}', NULL, 'version:${worker_vid}');
"

  local ev_id_sql="NULL"
  if [ -n "${CICD_EVENT_ID:-}" ]; then
    local eid_esc
    eid_esc=$(cicd_sql_escape "${CICD_EVENT_ID}")
    ev_id_sql="'${eid_esc}'"
  fi

  local deploy_base="https://inneranimal-dashboard.meauxbility.workers.dev"
  local deploy_base_esc
  deploy_base_esc=$(cicd_sql_escape "$deploy_base")

  local sb_phase_st="${phase_sb_start}"
  local sb_phase_end="${phase_sb_end}"
  local hc_resp_sql="${hc_resp_ms}"
  [[ "$hc_resp_sql" =~ ^[0-9]+$ ]] || hc_resp_sql="NULL"

  # 3) cicd_runs — aggregate deploy row (migration 223 adds optional columns; core columns match recent inserts)
  cicd_d1_nf "
INSERT INTO cicd_runs (
  id,
  run_number,
  worker_name,
  environment,
  deployment_type,
  trigger_source,
  triggered_by,
  status,
  conclusion,
  failure_phase,
  error_message,
  error_detail_json,
  git_repo,
  git_branch,
  git_commit_sha,
  git_commit_message,
  github_run_id,
  cf_deploy_url,
  cf_health_check_url,
  phase_sandbox_status,
  phase_benchmark_status,
  phase_promote_status,
  notes,
  tags_json,
  metadata_json,
  git_actor,
  r2_bucket,
  r2_files_updated,
  r2_bundle_size_bytes,
  phase_sandbox_started_at,
  phase_sandbox_completed_at,
  phase_sandbox_duration_ms,
  cf_worker_version_id,
  cf_health_status_code,
  cf_health_response_ms,
  cf_health_status,
  total_duration_ms,
  event_id,
  queued_at,
  started_at,
  completed_at,
  created_at,
  updated_at
) VALUES (
  'run_' || lower(hex(randomblob(8))),
  (SELECT COALESCE(MAX(run_number),0)+1 FROM cicd_runs),
  '$(cicd_sql_escape "$wname")',
  'sandbox',
  'worker_r2',
  'manual',
  'agent_sam',
  '${final_status}',
  '${final_conclusion}',
  NULL,
  NULL,
  NULL,
  '${CICD_REPO_NAME}',
  '${CICD_GIT_BRANCH}',
  '${CICD_GIT_SHA}',
  '${CICD_GIT_SUBJECT_ESC}',
  '${gh_id}',
  '${deploy_base_esc}',
  '${hc_url_esc}',
  '${pipe_status}',
  'pending',
  'pending',
  '${notes_esc}',
  '[\"sandbox\",\"deploy-sandbox\",\"${dash_v}\"]',
  '${meta_esc}',
  '${CICD_GIT_ACTOR_ESC}',
  '${bucket_esc}',
  ${r2_files},
  ${bundle_bytes},
  ${sb_phase_st},
  ${sb_phase_end},
  ${phase_sb_dur},
  '${wv_esc}',
  ${hc_code},
  ${hc_resp_sql},
  '${hc_status_esc}',
  ${wall_ms},
  ${ev_id_sql},
  ${sb_phase_st},
  ${sb_phase_st},
  ${sb_phase_end},
  unixepoch(),
  unixepoch()
);"

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

  local wname="${WORKER_NAME:-inneranimalmedia}"
  local bundle_bytes="${CICD_R2_BUNDLE_BYTES:-0}"
  [[ "$bundle_bytes" =~ ^[0-9]+$ ]] || bundle_bytes=0

  local phase_pr_start="${CICD_PHASE_PROMOTE_START_UNIX:-$(date +%s)}"
  local phase_pr_end="${CICD_PHASE_PROMOTE_END_UNIX:-$(date +%s)}"
  local phase_pr_dur="${CICD_PHASE_PROMOTE_DURATION_MS:-}"
  if ! [[ "$phase_pr_dur" =~ ^[0-9]+$ ]]; then
    phase_pr_dur=$(( (phase_pr_end - phase_pr_start) * 1000 ))
    [ "$phase_pr_dur" -lt 0 ] && phase_pr_dur=0
  fi

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
  local wall_ms="${CICD_WALL_TOTAL_MS:-}"
  if ! [[ "$wall_ms" =~ ^[0-9]+$ ]]; then
    if [[ "$dur_ms" =~ ^[0-9]+$ ]]; then
      wall_ms="$dur_ms"
    else
      wall_ms="$phase_pr_dur"
    fi
  fi

  local prod_url="${CICD_CF_HEALTH_URL:-https://inneranimalmedia.com/dashboard/agent}"
  local hc_code="${CICD_CF_HEALTH_STATUS_CODE:-$health_http}"
  [[ "$hc_code" =~ ^[0-9]+$ ]] || hc_code=0
  local hc_resp_ms="${CICD_CF_HEALTH_RESPONSE_MS:-}"
  [[ "$hc_resp_ms" =~ ^[0-9]+$ ]] || hc_resp_ms=NULL
  local hc_status="${CICD_CF_HEALTH_STATUS:-$(cicd_cf_health_label "$hc_code")}"
  local hc_status_esc
  hc_status_esc=$(cicd_sql_escape "$hc_status")
  local prod_url_esc
  prod_url_esc=$(cicd_sql_escape "$prod_url")

  local pipe_status="passed"
  local final_status="success"
  local final_conclusion="success"
  if [ "$worker_vid" = "unknown" ] || [ -z "$worker_vid" ]; then
    pipe_status="failed"
    final_status="failed"
    final_conclusion="failed"
  fi
  [[ "$hc_code" =~ ^(2[0-9][0-9]|30[12378])$ ]] || {
    pipe_status="failed"
    final_status="failed"
    final_conclusion="failed"
  }

  local notes_esc
  notes_esc=$(cicd_sql_escape "promote-to-prod.sh | v${dash_v} | worker ${worker_vid} | ${r2_files} R2 objects | agent-sam")

  local wv_esc
  wv_esc=$(cicd_sql_escape "$worker_vid")
  local bucket_esc
  bucket_esc=$(cicd_sql_escape "agent-sam")

  cicd_d1_nf "
INSERT OR IGNORE INTO cicd_github_runs (
  run_id, workflow_name, repo_name, branch, commit_sha, commit_message,
  trigger_event, status, conclusion, run_attempt, started_at, completed_at, duration_ms
) VALUES (
  '${gh_id}', 'promote-to-prod.sh (manual)', '${CICD_REPO_NAME}', '${CICD_GIT_BRANCH}', '${CICD_GIT_SHA}', '${CICD_GIT_MSG_ESC}',
  'workflow_run', '${final_status}', '${final_conclusion}', 1, '${started}', '${completed}', ${dur_ms}
);"

  cicd_d1_nf "
INSERT OR IGNORE INTO cicd_pipeline_runs (
  run_id, commit_hash, branch, env, status, completed_at, notes,
  worker_version_id, deploy_record_id
) VALUES (
  '${pipe_id}', '${CICD_GIT_SHA}', '${CICD_GIT_BRANCH}', 'production', '${pipe_status}', '${completed}', '${notes_esc}',
  '${wv_esc}', '${wv_esc}'
);"

  cicd_d1_nf "
UPDATE cicd_pipeline_runs SET worker_version_id='${wv_esc}', deploy_record_id='${wv_esc}' WHERE run_id='${pipe_id}';
"

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
  cicd_d1_nf "
INSERT INTO pipeline_runs (
  id, pipeline_id, environment, trigger_source, triggered_by, provider,
  status, git_commit_sha, worker_version, duration_ms, queued_at, started_at, completed_at,
  success_rate, tokens_in, tokens_out, cost_usd, notes, metadata_json
) VALUES (
  '${pr_id}',
  (SELECT id FROM pipelines WHERE slug='promote_prod' LIMIT 1),
  'production', 'manual', '${CICD_ACTOR_ESC}', 'cloudflare',
  'success', '${CICD_GIT_SHA}', '${wv_esc}', ${dur_sql}, ${unix_started}, ${unix_started}, ${unix_completed},
  1.0, 0, 0, 0.0, '${notes_esc}', '${meta_esc}'
);"

  local step_status="pass"
  [ "$pipe_status" = "failed" ] && step_status="fail"
  cicd_d1_nf "
INSERT OR IGNORE INTO cicd_run_steps (id, run_id, tool_name, test_type, status, latency_ms, http_status, error, response_preview, tested_at) VALUES
  ('step_${ts}_pr_pull', '${pipe_id}', 'r2_pull_sandbox_manifest', 'r2', '${step_status}', ${ms_pull:-NULL}, NULL, NULL, 'agent-sam-sandbox-cicd -> dist', '${completed}'),
  ('step_${ts}_pr_push', '${pipe_id}', 'r2_put_production', 'r2', '${step_status}', ${ms_push:-NULL}, NULL, NULL, '${r2_files} objects -> agent-sam', '${completed}'),
  ('step_${ts}_pr_wr', '${pipe_id}', 'wrangler_deploy_production', 'invoke', '${step_status}', ${ms_worker:-NULL}, NULL, NULL, 'inneranimalmedia @ ${worker_vid}', '${completed}'),
  ('step_${ts}_pr_d1', '${pipe_id}', 'd1_dashboard_versions_prod', 'd1', '${step_status}', ${ms_d1:-NULL}, NULL, NULL, 'dashboard_versions + deployments', '${completed}'),
  ('step_${ts}_pr_hc', '${pipe_id}', 'prod_health_check', 'route', '${step_status}', NULL, ${health_http}, NULL, 'https://inneranimalmedia.com/dashboard/agent', '${completed}');
"

  local ev1="evt_${ts}_pr_promo"
  local ev2="evt_${ts}_pr_r2"
  local ev3="evt_${ts}_pr_wr"
  cicd_d1_nf "
INSERT OR IGNORE INTO cicd_events (id, source, event_type, repo_name, git_branch, git_commit_sha, git_commit_message, git_actor, worker_name, r2_bucket, r2_key) VALUES
 ('${ev1}', 'manual', 'push', '${CICD_REPO_NAME}', '${CICD_GIT_BRANCH}', '${CICD_GIT_SHA}', '${CICD_GIT_MSG_ESC}', '${CICD_ACTOR_ESC}', NULL, NULL, 'promote:git'),
 ('${ev2}', 'manual', 'r2_bundle_updated', '${CICD_REPO_NAME}', '${CICD_GIT_BRANCH}', '${CICD_GIT_SHA}', '${CICD_GIT_MSG_ESC}', '${CICD_ACTOR_ESC}', 'inneranimalmedia', 'agent-sam', 'static/dashboard/agent/'),
 ('${ev3}', 'manual', 'worker_script_updated', '${CICD_REPO_NAME}', '${CICD_GIT_BRANCH}', '${CICD_GIT_SHA}', '${CICD_GIT_MSG_ESC}', '${CICD_ACTOR_ESC}', 'inneranimalmedia', NULL, 'version:${worker_vid}');
"

  local ev_id_sql="NULL"
  if [ -n "${CICD_EVENT_ID:-}" ]; then
    local eid_esc
    eid_esc=$(cicd_sql_escape "${CICD_EVENT_ID}")
    ev_id_sql="'${eid_esc}'"
  fi

  local prod_origin="https://inneranimalmedia.com"
  local prod_origin_esc
  prod_origin_esc=$(cicd_sql_escape "$prod_origin")
  local hc_resp_sql="${hc_resp_ms}"
  [[ "$hc_resp_sql" =~ ^[0-9]+$ ]] || hc_resp_sql="NULL"

  cicd_d1_nf "
INSERT INTO cicd_runs (
  id,
  run_number,
  worker_name,
  environment,
  deployment_type,
  trigger_source,
  triggered_by,
  status,
  conclusion,
  failure_phase,
  error_message,
  error_detail_json,
  git_repo,
  git_branch,
  git_commit_sha,
  git_commit_message,
  github_run_id,
  cf_deploy_url,
  cf_health_check_url,
  phase_sandbox_status,
  phase_benchmark_status,
  phase_promote_status,
  notes,
  tags_json,
  metadata_json,
  git_actor,
  r2_bucket,
  r2_files_updated,
  r2_bundle_size_bytes,
  phase_sandbox_started_at,
  phase_sandbox_completed_at,
  phase_sandbox_duration_ms,
  cf_worker_version_id,
  cf_health_status_code,
  cf_health_response_ms,
  cf_health_status,
  total_duration_ms,
  event_id,
  queued_at,
  started_at,
  completed_at,
  created_at,
  updated_at
) VALUES (
  'run_' || lower(hex(randomblob(8))),
  (SELECT COALESCE(MAX(run_number),0)+1 FROM cicd_runs),
  '$(cicd_sql_escape "$wname")',
  'production',
  'worker_r2',
  'manual',
  'agent_sam',
  '${final_status}',
  '${final_conclusion}',
  NULL,
  NULL,
  NULL,
  '${CICD_REPO_NAME}',
  '${CICD_GIT_BRANCH}',
  '${CICD_GIT_SHA}',
  '${CICD_GIT_SUBJECT_ESC}',
  '${gh_id}',
  '${prod_origin_esc}',
  '${prod_url_esc}',
  'skipped',
  'skipped',
  '${pipe_status}',
  '${notes_esc}',
  '[\"production\",\"promote-to-prod\",\"${dash_v}\"]',
  '${meta_esc}',
  '${CICD_GIT_ACTOR_ESC}',
  '${bucket_esc}',
  ${r2_files},
  ${bundle_bytes},
  NULL,
  NULL,
  NULL,
  '${wv_esc}',
  ${hc_code},
  ${hc_resp_sql},
  '${hc_status_esc}',
  ${wall_ms},
  ${ev_id_sql},
  ${phase_pr_start},
  ${phase_pr_start},
  ${phase_pr_end},
  unixepoch(),
  unixepoch()
);"

  echo "[cicd-d1-log] production pipeline ${pipe_id} (github ${gh_id})"
}

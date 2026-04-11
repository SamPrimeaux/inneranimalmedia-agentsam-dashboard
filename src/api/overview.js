/**
 * API Service: Overview & Analytics
 * Handles activity strips, deployment history, and stats.
 */
import { getAuthUser, jsonResponse, tenantIdFromEnv } from '../core/auth.js';

export async function handleOverviewApi(request, url, env, ctx) {
  const pathLower = url.pathname.toLowerCase().replace(/\/$/, '') || '/';

  const authUser = await getAuthUser(request, env);
  if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
  if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);

  try {
    if (pathLower === '/api/overview/activity-strip') return handleOverviewActivityStrip(authUser, env);
    if (pathLower === '/api/overview/deployments') return handleOverviewDeployments(env);
    if (pathLower === '/api/overview/stats') return handleOverviewStats(env);
    return jsonResponse({ error: 'Overview route not found' }, 404);
  } catch (e) {
    return jsonResponse({ error: String(e.message || e) }, 500);
  }
}

async function handleOverviewActivityStrip(authUser, env) {
  const userId = authUser.id || 'anonymous';
  const userIdVariants = [
    userId,
    userId.replace(/^user_/, ''),
    'user_' + userId.replace(/^user_/, ''),
  ].filter(Boolean);
  const userList = userIdVariants.map(() => '?').join(',');
  const safe = (p) => (p ? p.catch(() => null) : Promise.resolve(null));
  const num = (r, k) => (r != null && r[k] != null ? Number(r[k]) : r?.c != null ? Number(r.c) : 0);

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);

  const [
    deployCountWeek,
    agentCallsWeek,
    taskCountWeek,
    timeWeekRow,
    timeTodayRow,
    dailyRows,
    projectsActiveRow,
    projectsTopRows,
  ] = await Promise.all([
    safe(env.DB.prepare(
      `SELECT COUNT(*) as c FROM deployments WHERE date(timestamp) >= date(?) AND status = 'success'`
    ).bind(sevenDaysAgo).first()),
    safe(env.DB.prepare(
      `SELECT COUNT(*) as c FROM agent_telemetry WHERE created_at >= unixepoch(?)`
    ).bind(sevenDaysAgo).first()),
    safe(env.DB.prepare(
      `SELECT COUNT(*) as c FROM cicd_pipeline_runs WHERE created_at >= unixepoch(?) AND status = 'success'`
    ).bind(sevenDaysAgo).first()),
    safe(env.DB.prepare(
      `SELECT COALESCE(SUM(duration_seconds),0)/3600.0 as h FROM project_time_entries WHERE start_time >= date('now','weekday 1') AND user_id IN (${userList}) AND is_active = 0`
    ).bind(...userIdVariants).first()),
    safe(env.DB.prepare(
      `SELECT COALESCE(SUM(duration_seconds),0)/3600.0 as h FROM project_time_entries WHERE date(start_time) = date('now') AND user_id IN (${userList}) AND is_active = 0`
    ).bind(...userIdVariants).first()),
    safe(env.DB.prepare(
      `SELECT date(start_time) as d, COALESCE(SUM(duration_seconds),0)/3600.0 as h FROM project_time_entries WHERE start_time >= date('now','weekday 1') AND user_id IN (${userList}) AND is_active = 0 GROUP BY date(start_time) ORDER BY d ASC`
    ).bind(...userIdVariants).all()),
    safe(env.DB.prepare(
      `SELECT COUNT(*) as c FROM projects WHERE status NOT IN ('archived','maintenance')`
    ).first()),
    safe(env.DB.prepare(
      `SELECT name, status, priority FROM projects WHERE status NOT IN ('archived') ORDER BY COALESCE(priority,0) DESC, created_at DESC LIMIT 4`
    ).all()),
  ]);

  return jsonResponse({
    weekly_activity: {
      deploys: num(deployCountWeek),
      tasks_completed: num(taskCountWeek),
      agent_calls: num(agentCallsWeek),
    },
    worked_this_week: {
      hours_this_week: Math.round(num(timeWeekRow, 'h') * 100) / 100,
      hours_today: Math.round(num(timeTodayRow, 'h') * 100) / 100,
    },
    projects: {
      active: num(projectsActiveRow),
      top: projectsTopRows?.results || [],
    },
  });
}

async function handleOverviewDeployments(env) {
  const { results: deployments } = await env.DB.prepare(
    `SELECT worker_name, environment, status, timestamp AS deployed_at, notes AS deployment_notes
     FROM deployments ORDER BY timestamp DESC LIMIT 20`
  ).all();
  const { results: cicd } = await env.DB.prepare(
    `SELECT id, worker_name, environment, status, conclusion, queued_at AS started_at
     FROM cicd_runs ORDER BY queued_at DESC LIMIT 10`
  ).all();
  return jsonResponse({ deployments: deployments || [], cicd_runs: cicd || [] });
}

async function handleOverviewStats(env) {
  const [tasks, deploys] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) as c FROM cicd_pipeline_runs WHERE status = 'success'`).first(),
    env.DB.prepare(`SELECT COUNT(*) as c FROM deployments WHERE status = 'success'`).first(),
  ]);
  return jsonResponse({
    tasks_completed: tasks?.c || 0,
    deploys_total: deploys?.c || 0,
  });
}

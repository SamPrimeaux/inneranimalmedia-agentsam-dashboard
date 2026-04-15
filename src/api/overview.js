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
      `SELECT (COUNT(DISTINCT strftime('%Y-%m-%d %H', datetime(created_at, 'unixepoch'))) +
               COALESCE((SELECT SUM(total_active_seconds)/3600.0 FROM work_sessions WHERE started_at >= date('now','weekday 1')), 0)
              ) as h FROM agent_telemetry WHERE created_at >= unixepoch(date('now','weekday 1'))`
    ).first()),
    safe(env.DB.prepare(
      `SELECT (COUNT(DISTINCT strftime('%Y-%m-%d %H', datetime(created_at, 'unixepoch'))) +
               COALESCE((SELECT SUM(total_active_seconds)/3600.0 FROM work_sessions WHERE date(started_at) = date('now')), 0)
              ) as h FROM agent_telemetry WHERE date(datetime(created_at, 'unixepoch')) = date('now')`
    ).first()),
    safe(env.DB.prepare(
      `SELECT date(datetime(created_at, 'unixepoch')) as d,
              COUNT(DISTINCT strftime('%Y-%m-%d %H', datetime(created_at, 'unixepoch'))) as h
       FROM agent_telemetry
       WHERE created_at >= unixepoch(date('now','weekday 1'))
       GROUP BY date(datetime(created_at, 'unixepoch'))
       ORDER BY d ASC`
    ).all()),
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
    `SELECT
       p.run_id AS id,
       p.env AS environment,
       p.status,
       p.branch,
       p.triggered_at AS started_at,
       p.completed_at,
       p.notes,
       g.workflow_name,
       g.commit_message,
       g.duration_ms,
       COUNT(CASE WHEN s.status = 'pass' THEN 1 END) AS steps_passed,
       COUNT(CASE WHEN s.status = 'fail' THEN 1 END) AS steps_failed,
       COUNT(s.id) AS steps_total
     FROM cicd_pipeline_runs p
     LEFT JOIN cicd_github_runs g ON g.run_id = 'gh_' || substr(p.run_id, 6)
     LEFT JOIN cicd_run_steps s ON s.run_id = p.run_id
     GROUP BY p.run_id
     ORDER BY p.rowid DESC LIMIT 10`
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

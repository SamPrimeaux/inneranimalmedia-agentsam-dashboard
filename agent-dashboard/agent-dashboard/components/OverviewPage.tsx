import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';

type ApiEnvelope<T> = { data?: T; generated_at?: number; error?: string; failed?: string[] };
type AnyRow = Record<string, any>;

const C = {
  success: 'var(--color-success, var(--solar-green))',
  warning: 'var(--color-warning, var(--solar-yellow))',
  danger: 'var(--color-danger, var(--solar-red))',
  info: 'var(--color-info, var(--solar-blue))',
  muted: 'var(--color-muted, var(--text-muted))',
  accent: 'var(--color-teal, var(--solar-cyan))',
  panel: 'var(--bg-panel)',
  grid: 'var(--border-subtle)',
};

const palette = [C.accent, C.info, C.warning, C.danger, 'var(--solar-magenta)', 'var(--solar-orange)', C.success];
const providers = ['anthropic', 'openai', 'cloudflare', 'cursor', 'other'];

function n(v: any): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function money(v: any) {
  return `$${n(v).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function shortDate(v: any) {
  if (!v) return 'n/a';
  const d = typeof v === 'number' ? new Date(v * 1000) : new Date(v);
  return Number.isNaN(d.getTime()) ? String(v).slice(0, 16) : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function duration(ms: any) {
  const x = n(ms);
  if (!x) return '0ms';
  if (x < 1000) return `${Math.round(x)}ms`;
  return `${Math.round(x / 1000)}s`;
}

async function getData<T>(url: string): Promise<ApiEnvelope<T>> {
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) return { data: {} as T, error: 'partial', failed: [url] };
  return res.json();
}

function Panel({ title, sub, children, loading, wide = false }: { title: string; sub?: string; children: React.ReactNode; loading?: boolean; wide?: boolean }) {
  return (
    <section className={`overview-panel ${wide ? 'overview-wide' : ''}`}>
      <div className="overview-panel-head">
        <span>{title}</span>
        {sub && <small>{sub}</small>}
      </div>
      {loading ? <div className="overview-skeleton" /> : children}
    </section>
  );
}

class PanelBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <div className="overview-empty">Panel failed to render</div>;
    return this.props.children;
  }
}

function Sparkline({ values, color = C.accent }: { values?: number[]; color?: string }) {
  const data = (values || []).map((value, i) => ({ i, value }));
  return (
    <ResponsiveContainer width="100%" height={34}>
      <LineChart data={data}>
        <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="overview-tooltip">
      <strong>{label}</strong>
      {payload.map((p: any) => <div key={p.dataKey} style={{ color: p.color }}>{p.name || p.dataKey}: {n(p.value).toLocaleString()}</div>)}
    </div>
  );
}

function Gauge({ value }: { value: number }) {
  return (
    <div className="overview-gauge" style={{ ['--pct' as any]: `${Math.max(0, Math.min(100, value))}%` }}>
      <span>{Math.round(value)}%</span>
    </div>
  );
}

export const OverviewPage: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [tick, setTick] = useState(new Date());
  const [kpi, setKpi] = useState<any>({});
  const [finance, setFinance] = useState<any>({});
  const [agent, setAgent] = useState<any>({});
  const [deploys, setDeploys] = useState<any>({});
  const [goals, setGoals] = useState<any>({});
  const [time, setTime] = useState<any>({});
  const [mcp, setMcp] = useState<any>({});
  const [commands, setCommands] = useState<any>({});
  const [activity, setActivity] = useState<any>({});

  useEffect(() => {
    const t = setInterval(() => setTick(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const [k, f, a, d, g, tf, m, c, act] = await Promise.all([
      getData<any>('/api/overview/kpi-strip'),
      getData<any>('/api/overview/finance-charts'),
      getData<any>('/api/overview/agent-activity'),
      fetch('/api/overview/deployments', { credentials: 'include' }).then(r => r.json()).catch(() => ({})),
      getData<any>('/api/overview/goals-launch'),
      getData<any>('/api/overview/time-founder'),
      getData<any>('/api/overview/mcp-health'),
      getData<any>('/api/overview/commands-workflows'),
      fetch('/api/overview/activity-strip', { credentials: 'include' }).then(r => r.json()).catch(() => ({})),
    ]);
    setKpi(k.data || {});
    setFinance(f.data || {});
    setAgent(a.data || {});
    setDeploys(d.data || d || {});
    setGoals(g.data || {});
    setTime(tf.data || {});
    setMcp(m.data || {});
    setCommands(c.data || {});
    setActivity(act || {});
    setLastRefresh(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);

  const financeDaily = useMemo(() => {
    const byDay = new Map<string, AnyRow>();
    (finance.daily_by_provider || []).forEach((r: AnyRow) => {
      const row = byDay.get(r.day) || { day: String(r.day).slice(5) };
      row[r.provider] = n(r.total);
      byDay.set(r.day, row);
    });
    return [...byDay.values()];
  }, [finance.daily_by_provider]);

  const execData = useMemo(() => {
    const map = new Map<string, AnyRow>();
    (agent.executions_by_day || []).forEach((r: AnyRow) => {
      const row = map.get(r.day) || { day: String(r.day).slice(5) };
      row[r.execution_type || 'other'] = n(r.count);
      map.set(r.day, row);
    });
    return [...map.values()];
  }, [agent.executions_by_day]);

  const modelData = useMemo(() => {
    const totals = new Map<string, number>();
    (agent.model_usage || []).forEach((r: AnyRow) => totals.set(r.model, (totals.get(r.model) || 0) + n(r.calls)));
    return [...totals.entries()].map(([model, calls]) => ({ model, calls })).slice(0, 8);
  }, [agent.model_usage]);

  const deployTimeline = useMemo(() => {
    const map = new Map<string, AnyRow>();
    (deploys.deploy_timeline || []).forEach((r: AnyRow) => {
      const row = map.get(r.day) || { day: String(r.day).slice(5) };
      row[r.status || 'unknown'] = n(r.count);
      map.set(r.day, row);
    });
    return [...map.values()];
  }, [deploys.deploy_timeline]);

  const founderChart = [...(time.founder_recent || [])].reverse();
  const activeTimer = time.active_timer || kpi.cards?.find((x: AnyRow) => x.key === 'hours_week')?.active_timer;

  return (
    <div className="overview-root">
      <style>{`
        .overview-root{height:100%;overflow:auto;background:var(--bg-app);color:var(--text-main);padding:16px}
        .overview-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}
        .overview-title{display:flex;flex-direction:column;gap:2px}.overview-title h1{font-size:18px;margin:0;color:var(--text-heading)}.overview-title span{font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.14em}
        .overview-actions{display:flex;align-items:center;gap:10px;color:var(--text-muted);font-size:12px}.overview-actions button,.overview-btn{border:1px solid var(--border-subtle);background:var(--bg-panel);color:var(--text-main);border-radius:6px;padding:7px 9px;display:inline-flex;gap:6px;align-items:center}
        .overview-kpis{display:grid;grid-template-columns:repeat(7,minmax(160px,1fr));gap:10px;margin-bottom:12px}
        .overview-card{background:var(--bg-panel);border:1px solid var(--border-subtle);border-radius:8px;padding:10px;min-height:116px;cursor:default}.overview-card.clickable{cursor:pointer}.overview-card label,.overview-panel-head span{font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.16em;font-weight:700}.overview-card strong{display:block;font-size:24px;line-height:1.1;margin-top:8px}.overview-card small{display:block;color:var(--text-muted);font-size:11px;margin-top:4px}.overview-card-chart{height:34px;margin-top:8px}
        .overview-dot{display:inline-block;width:7px;height:7px;border-radius:99px;margin-right:5px}.overview-pulse{animation:overviewPulse 1.2s infinite}@keyframes overviewPulse{50%{opacity:.35;transform:scale(.8)}}
        .overview-grid{display:grid;grid-template-columns:repeat(10,minmax(0,1fr));gap:12px}.span-5{grid-column:span 5}.span-4{grid-column:span 4}.span-6{grid-column:span 6}.overview-wide{grid-column:1/-1}
        .overview-panel{background:var(--bg-panel);border:1px solid var(--border-subtle);border-radius:9px;overflow:hidden;min-height:260px}.overview-panel-head{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border-subtle);padding:10px 12px}.overview-panel-head small{color:var(--text-muted);font-size:11px}.overview-body{padding:12px}.overview-chart{height:190px}.overview-mini{height:130px}.overview-split{display:grid;grid-template-columns:3fr 2fr;gap:12px}.overview-list{display:flex;flex-direction:column;gap:8px}.overview-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;border-bottom:1px solid color-mix(in srgb,var(--border-subtle),transparent 40%);padding:7px 0;font-size:12px}.overview-row:last-child{border-bottom:0}.overview-row strong{font-size:12px}.overview-row small{color:var(--text-muted)}
        .overview-badge{border:1px solid currentColor;border-radius:999px;padding:2px 6px;font-size:10px;text-transform:uppercase}.ok{color:${C.success}}.warn{color:${C.warning}}.bad{color:${C.danger}}.info{color:${C.info}}
        .overview-table{width:100%;border-collapse:collapse;font-size:12px}.overview-table th{color:var(--text-muted);font-size:10px;text-transform:uppercase;letter-spacing:.12em;text-align:left}.overview-table th,.overview-table td{padding:7px 6px;border-bottom:1px solid var(--border-subtle)}.overview-table tr.degraded{color:${C.danger}}
        .overview-progress{height:6px;background:var(--bg-app);border-radius:99px;overflow:hidden}.overview-progress span{display:block;height:100%;background:var(--color-teal,var(--solar-cyan))}
        .overview-tooltip{background:var(--bg-panel);border:1px solid var(--border-subtle);padding:8px;border-radius:6px;font-size:11px}.overview-empty{color:var(--text-muted);font-size:12px;text-align:center;padding:26px}.overview-skeleton{height:210px;margin:12px;border-radius:7px;background:linear-gradient(90deg,var(--bg-app),var(--bg-hover),var(--bg-app));background-size:200% 100%;animation:sk 1.1s infinite}@keyframes sk{to{background-position:-200% 0}}
        .overview-gauge{width:62px;height:62px;border-radius:50%;display:grid;place-items:center;background:conic-gradient(var(--color-teal,var(--solar-cyan)) var(--pct),var(--bg-app) 0);font-size:13px;font-weight:700}.overview-gauge span{background:var(--bg-panel);border-radius:50%;width:48px;height:48px;display:grid;place-items:center}
        .overview-deps{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.overview-node{border:1px solid var(--border-subtle);border-radius:6px;padding:6px 8px;background:var(--bg-app);font-size:11px}.overview-arrow{color:var(--text-muted)}
        @media(max-width:768px){.overview-root{padding:10px}.overview-kpis{display:flex;overflow:auto}.overview-card{min-width:170px}.overview-grid,.overview-split{display:flex;flex-direction:column}.span-5,.span-4,.span-6{grid-column:auto}.overview-panel{min-height:auto}}
      `}</style>

      <div className="overview-head">
        <div className="overview-title">
          <h1>Operations Overview</h1>
          <span>Inner Animal Media command surface</span>
        </div>
        <div className="overview-actions">
          <span>Last refreshed: {lastRefresh ? lastRefresh.toLocaleTimeString() : 'loading'}</span>
          <button onClick={load}><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh</button>
        </div>
      </div>

      <div className="overview-kpis">
        {(kpi.cards || Array.from({ length: 7 })).map((card: AnyRow, i: number) => (
          <div key={card?.key || i} className={`overview-card ${card?.href ? 'clickable' : ''}`} onClick={() => card?.href && navigate(card.href)}>
            <label>{card?.label || 'Loading'}</label>
            <strong style={{ color: card?.threshold === 'danger' ? C.danger : card?.threshold === 'warning' ? C.warning : palette[i % palette.length] }}>
              {card?.format === 'currency' ? money(card.value) : card?.format === 'hours' ? `${n(card.value).toFixed(1)}h` : n(card?.value).toLocaleString()}
            </strong>
            <small>{card?.is_running && <span className="overview-dot overview-pulse" style={{ background: C.success }} />}{card?.subtitle || 'live data'}</small>
            {card?.breakdown && <small><span className="overview-dot" style={{ background: C.muted }} />todo <span className="overview-dot" style={{ background: C.info }} />active <span className="overview-dot" style={{ background: C.danger }} />blocked</small>}
            <div className="overview-card-chart"><Sparkline values={card?.trend || []} color={palette[i % palette.length]} /></div>
          </div>
        ))}
      </div>

      <div className="overview-grid">
        <Panel title="Spend Over Time" sub="last 30 days" loading={loading}><PanelBoundary><div className="overview-body overview-chart"><ResponsiveContainer><AreaChart data={financeDaily}><CartesianGrid stroke={C.grid} vertical={false} /><XAxis dataKey="day" stroke={C.muted} tick={{ fontSize: 10 }} /><YAxis stroke={C.muted} tick={{ fontSize: 10 }} /><Tooltip content={<ChartTooltip />} />{providers.map((p, i) => <Area key={p} dataKey={p} stackId="1" stroke={palette[i]} fill={palette[i]} fillOpacity={0.18} />)}</AreaChart></ResponsiveContainer></div></PanelBoundary></Panel>
        <Panel title="Spend By Category" sub="this month" loading={loading}><PanelBoundary><div className="overview-body overview-split"><div className="overview-mini"><ResponsiveContainer><PieChart><Pie data={finance.category_totals || []} dataKey="total" nameKey="category" innerRadius={42} outerRadius={66}>{(finance.category_totals || []).map((_r: AnyRow, i: number) => <Cell key={i} fill={palette[i % palette.length]} />)}</Pie><Tooltip content={<ChartTooltip />} /></PieChart></ResponsiveContainer></div><div className="overview-list">{(finance.top_providers || []).map((p: AnyRow) => <div className="overview-row" key={p.provider}><span>{p.provider}</span><strong>{money(p.total)}</strong></div>)}<div className="overview-empty">Total {money((finance.category_totals || []).reduce((s: number, r: AnyRow) => s + n(r.total), 0))}</div></div></div></PanelBoundary></Panel>

        <Panel title="Agent Executions" sub="14 day activity" loading={loading}><PanelBoundary><div className="overview-body"><div className="overview-chart"><ResponsiveContainer><BarChart data={execData}><CartesianGrid stroke={C.grid} vertical={false} /><XAxis dataKey="day" stroke={C.muted} tick={{ fontSize: 10 }} /><YAxis stroke={C.muted} tick={{ fontSize: 10 }} /><Tooltip content={<ChartTooltip />} /><Bar dataKey="shell" stackId="a" fill={C.accent} /><Bar dataKey="edit" stackId="a" fill={C.info} /><Bar dataKey="tool" stackId="a" fill={C.warning} /><Bar dataKey="other" stackId="a" fill={C.muted} /></BarChart></ResponsiveContainer></div><div className="overview-list">{(agent.recent_executions || []).map((r: AnyRow, i: number) => <div className="overview-row" key={i}><span><strong>{r.execution_type}</strong> {(r.command || '').slice(0, 40)}</span><small>{duration(r.duration_ms)} {shortDate(r.created_at)}</small></div>)}</div></div></PanelBoundary></Panel>
        <Panel title="Model Usage Breakdown" sub="7 days" loading={loading}><PanelBoundary><div className="overview-body"><div className="overview-mini"><ResponsiveContainer><BarChart data={modelData}><XAxis dataKey="model" stroke={C.muted} tick={{ fontSize: 9 }} /><YAxis stroke={C.muted} tick={{ fontSize: 10 }} /><Tooltip content={<ChartTooltip />} /><Bar dataKey="calls" fill={C.accent} /></BarChart></ResponsiveContainer></div><table className="overview-table"><tbody>{(agent.model_leaderboard || []).map((r: AnyRow) => <tr key={r.model}><td>{r.is_recommended_for_task ? '*' : ''} {r.model}</td><td>{n(r.calls)}</td><td>{money(r.total_cost)}</td><td>{duration(r.avg_latency)}</td></tr>)}</tbody></table></div></PanelBoundary></Panel>

        <Panel title="Deploy Timeline" sub="14 days" loading={loading}><PanelBoundary><div className="overview-body"><div className="overview-chart"><ResponsiveContainer><BarChart data={deployTimeline}><XAxis dataKey="day" stroke={C.muted} tick={{ fontSize: 10 }} /><YAxis stroke={C.muted} tick={{ fontSize: 10 }} /><Tooltip content={<ChartTooltip />} /><Bar dataKey="success" stackId="a" fill={C.success} /><Bar dataKey="failed" stackId="a" fill={C.danger} /><Bar dataKey="rolled_back" stackId="a" fill={C.warning} /></BarChart></ResponsiveContainer></div>{(deploys.deployments || []).slice(0, 3).map((d: AnyRow, i: number) => <div className="overview-row" key={i}><span>{d.worker_name} <small>{d.environment}</small></span><span className={`overview-badge ${d.status === 'success' ? 'ok' : d.status === 'failed' ? 'bad' : 'warn'}`}>{d.status}</span></div>)}</div></PanelBoundary></Panel>
        <Panel title="Pipeline Health" sub="CI/CD" loading={loading}><PanelBoundary><div className="overview-body overview-list">{(deploys.phase_health || []).map((p: AnyRow) => <div key={p.phase}><div className="overview-row"><span>{p.phase}</span><strong>{p.pass_rate}%</strong></div><div className="overview-progress"><span style={{ width: `${p.pass_rate}%` }} /></div></div>)}<table className="overview-table"><tbody>{(deploys.cicd_runs_table || deploys.cicd_runs || []).slice(0, 5).map((r: AnyRow, i: number) => <tr key={i}><td>{r.worker || r.workflow_name}</td><td>{r.env || r.environment}</td><td>{r.status}</td><td>{r.benchmark_score ? `${r.benchmark_score}/31` : duration(r.duration)}</td></tr>)}</tbody></table></div></PanelBoundary></Panel>

        <Panel title="Goals & KPIs" sub="active" loading={loading}><PanelBoundary><div className="overview-body overview-list">{(goals.active_goals || []).map((g: AnyRow) => { const pct = g.target_value ? Math.min(100, n(g.current_value) / n(g.target_value) * 100) : 0; return <div key={g.id}><div className="overview-row"><span>{g.name}<small> due {g.due_date || 'open'}</small></span><span className={`overview-badge ${g.status === 'blocked' ? 'bad' : pct >= 70 ? 'ok' : 'warn'}`}>{g.status}</span></div><div className="overview-progress"><span style={{ width: `${pct}%` }} /></div></div>; })}{(goals.kpi_snapshots || []).map((k: AnyRow) => <div className="overview-row" key={k.name}><span>{k.name}</span><strong>{n(k.value)}{k.unit} vs {n(k.target_value)}</strong></div>)}</div></PanelBoundary></Panel>
        <Panel title="Launch Tracker" sub="in progress" loading={loading}><PanelBoundary><div className="overview-body overview-list">{(goals.active_launches || []).map((l: AnyRow) => <div className="overview-row" key={l.id}><span>{l.goal_name}<small> target {l.target_date}</small></span><Gauge value={n(l.confidence_pct)} /></div>)}{(goals.top_launch_milestones || []).map((m: AnyRow) => <div className="overview-row" key={`${m.tracker_id}-${m.order_index}`}><span style={{ textDecoration: m.status === 'completed' ? 'line-through' : 'none' }}>{m.name}</span><span className={`overview-badge ${m.status === 'blocked' ? 'bad' : m.status === 'completed' ? 'ok' : 'warn'}`}>{m.status}</span></div>)}<div className="overview-empty">Completed {n(goals.launch_stats?.completed_count)} launches</div></div></PanelBoundary></Panel>

        <Panel title="Hours By Project" sub="this month" loading={loading}><PanelBoundary><div className="overview-body"><div className="overview-chart"><ResponsiveContainer><BarChart data={time.hours_by_project || []} layout="vertical"><XAxis type="number" stroke={C.muted} tick={{ fontSize: 10 }} /><YAxis dataKey="project_name" type="category" width={110} stroke={C.muted} tick={{ fontSize: 10 }} /><Tooltip content={<ChartTooltip />} /><Bar dataKey="hours" fill={C.accent} /></BarChart></ResponsiveContainer></div><div className="overview-row"><span>{activeTimer ? <><span className="overview-dot overview-pulse" style={{ background: C.success }} />{activeTimer.project_name || activeTimer.project_id || 'Active timer'}</> : 'No active timer'}</span>{!activeTimer && <button className="overview-btn" onClick={() => fetch('/api/timers/start', { method: 'POST', credentials: 'include' }).then(load)}>Start Timer</button>}</div></div></PanelBoundary></Panel>
        <Panel title="Founder Metrics" sub="last 7 days" loading={loading}><PanelBoundary><div className="overview-body"><div className="overview-mini"><ResponsiveContainer><LineChart data={founderChart}><XAxis dataKey="date" stroke={C.muted} tick={{ fontSize: 10 }} /><YAxis stroke={C.muted} tick={{ fontSize: 10 }} /><Tooltip content={<ChartTooltip />} /><Line dataKey="deep_work_hours" stroke={C.accent} dot={false} /><Line dataKey="meeting_hours" stroke={C.warning} dot={false} /><Line dataKey="productive_hours" stroke={C.success} dot={false} /></LineChart></ResponsiveContainer></div>{time.founder_recent?.[0] ? <div className="overview-list"><div className="overview-row"><span>Energy</span><strong>{n(time.founder_recent[0].energy_level)}/10</strong></div><div className="overview-row"><span>Stress</span><strong>{n(time.founder_recent[0].stress_level)}/10</strong></div><div className="overview-row"><span>Sleep</span><strong>{n(time.founder_recent[0].sleep_hours)}h</strong></div><div className="overview-row"><span>Burnout risk</span><span className={`overview-badge ${time.founder_recent[0].burnout_risk === 'high' || time.founder_recent[0].burnout_risk === 'critical' ? 'bad' : time.founder_recent[0].burnout_risk === 'medium' ? 'warn' : 'ok'}`}>{time.founder_recent[0].burnout_risk || 'low'}</span></div></div> : <button className="overview-btn" onClick={() => fetch('/api/founder/log', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ energy: 5, stress: 5, sleep: 0, notes: 'quick overview log' }) }).then(load)}>Log today</button>}</div></PanelBoundary></Panel>

        <Panel title="MCP Tool Health" sub="today" loading={loading} wide><PanelBoundary><div className="overview-body overview-split"><table className="overview-table"><thead><tr><th>Tool</th><th>Category</th><th>Calls</th><th>Success</th><th>Latency</th><th>Cost</th></tr></thead><tbody>{(mcp.top_tools || []).map((t: AnyRow) => <tr key={t.tool_name} className={t.is_degraded || n(t.failure_rate) > .2 ? 'degraded' : ''}><td>{t.tool_name}</td><td>{t.category}</td><td>{n(t.calls_today)}</td><td>{n(t.success_rate)}%</td><td>{duration(t.avg_latency)}</td><td>{money(t.cost_today)}</td></tr>)}</tbody></table><div><div className="overview-chart"><ResponsiveContainer><PieChart><Pie data={mcp.category_breakdown || []} dataKey="calls" nameKey="category" innerRadius={54} outerRadius={82}>{(mcp.category_breakdown || []).map((_r: AnyRow, i: number) => <Cell key={i} fill={palette[i % palette.length]} />)}</Pie><Tooltip content={<ChartTooltip />} /></PieChart></ResponsiveContainer></div><div className="overview-row"><span>Total calls</span><strong>{n(mcp.totals?.calls)}</strong></div><div className="overview-row"><span>Total cost</span><strong>{money(mcp.totals?.cost)}</strong></div><div className="overview-row"><span>Degraded</span><strong>{n(mcp.degraded_count)}</strong></div></div></div></PanelBoundary></Panel>

        <Panel title="Slash Command Usage" sub="top commands" loading={loading}><PanelBoundary><div className="overview-body"><div className="overview-mini"><ResponsiveContainer><BarChart data={commands.slash_by_usage || []}><XAxis dataKey="slug" stroke={C.muted} tick={{ fontSize: 9 }} /><YAxis stroke={C.muted} tick={{ fontSize: 10 }} /><Tooltip content={<ChartTooltip />} /><Bar dataKey="call_count" fill={C.accent} /></BarChart></ResponsiveContainer></div><div className="overview-empty">These commands have never fired may need handler_sql populated</div>{(commands.never_called || []).slice(0, 6).map((cmd: AnyRow) => <div className="overview-row" key={cmd.slug}><span>{cmd.slug}</span><span className="overview-badge warn">never</span></div>)}</div></PanelBoundary></Panel>
        <Panel title="Workflow Runs" sub="recent" loading={loading}><PanelBoundary><div className="overview-body"><table className="overview-table"><tbody>{(commands.recent_workflow_runs || []).map((r: AnyRow, i: number) => <tr key={i}><td>{r.workflow_name}</td><td>{r.status}</td><td>{shortDate(r.started_at)}</td><td>{duration(r.duration_ms || (n(r.completed_at) - n(r.started_at)) * 1000)}</td></tr>)}</tbody></table><div className="overview-row"><span>Total workflows</span><strong>{n(commands.workflow_health_summary?.total_workflows)}</strong></div><div className="overview-row"><span>Run at least once</span><strong>{n(commands.workflow_health_summary?.run_at_least_once)}</strong></div><div className="overview-row"><span>Never run</span><strong>{n(commands.workflow_health_summary?.never_run)}</strong></div><div className="overview-deps">{(commands.execution_dependency_graph || deploys.execution_dependency_graph || []).map((e: AnyRow, i: number) => <React.Fragment key={i}><span className="overview-node">{e.depends_on_execution_id}</span><span className="overview-arrow">{e.dependency_type}</span><span className="overview-node">{e.execution_id}</span></React.Fragment>)}</div></div></PanelBoundary></Panel>

        <Panel title="Active Projects" sub="enhanced" loading={loading} wide><PanelBoundary><div className="overview-body overview-list">{(activity.projects?.top || []).map((p: AnyRow, i: number) => <div className="overview-row" key={i}><span>{p.name}<small> status {p.status}</small></span><span className="overview-badge info">priority {p.priority || 0}</span></div>)}</div></PanelBoundary></Panel>
      </div>
    </div>
  );
};

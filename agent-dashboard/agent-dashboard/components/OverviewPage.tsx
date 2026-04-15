import React, { useEffect, useState, useCallback } from 'react';
import { Home, Zap, Cloud, GitBranch, Clock, Layers, TrendingUp, AlertCircle, CheckCircle, RefreshCw } from 'lucide-react';

interface StatCard { label: string; value: string; sub?: string; color?: string; icon?: React.ReactNode; }
interface Deploy { worker_name: string; environment: string; status: string; deployed_at: string; deployment_notes?: string; }
interface CicdRun { id: string; worker_name: string; environment: string; status: string; conclusion: string; started_at: string; }
interface Project { name: string; status: string; priority?: number; }

function StatCard({ label, value, sub, color = 'var(--solar-cyan)', icon }: StatCard) {
  return (
    <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg p-4 flex flex-col gap-1 min-w-0">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-widest text-[var(--text-muted)] font-semibold">{label}</span>
        {icon && <span className="opacity-40">{icon}</span>}
      </div>
      <span className="text-[26px] font-bold leading-tight" style={{ color }}>{value}</span>
      {sub && <span className="text-[11px] text-[var(--text-muted)]">{sub}</span>}
    </div>
  );
}

function Sparkline({ data, color = 'var(--solar-cyan)' }: { data: number[]; color?: string }) {
  if (data.length < 2) return <div className="h-8 opacity-30 text-[10px] text-[var(--text-muted)]">no data</div>;
  const max = Math.max(...data) || 1;
  const w = 80, h = 30;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - (v / max) * h}`).join(' ');
  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export const OverviewPage: React.FC = () => {
  const [activity, setActivity] = useState<any>(null);
  const [deployments, setDeployments] = useState<{ deployments: Deploy[]; cicd_runs: CicdRun[] } | null>(null);
  const [spend, setSpend] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const [a, d, s] = await Promise.all([
      fetch('/api/overview/activity-strip', { credentials: 'include' }).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('/api/overview/deployments', { credentials: 'include' }).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('/api/finance/summary', { credentials: 'include' }).then(r => r.ok ? r.json() : null).catch(() => null),
    ]);
    setActivity(a);
    setDeployments(d);
    setSpend(s);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const monthlyBurn = Number(spend?.monthly_burn ?? spend?.total ?? 943.78) || 943.78;
  const aiSpend = Number(spend?.ai_spend ?? spend?.ai_total ?? 227.20) || 227.20;
  const infraBills = Number(spend?.infra ?? spend?.infra_total ?? 659.26) || 659.26;
  const deploys = deployments?.deployments || [];
  const cicd = deployments?.cicd_runs || [];
  const projects = activity?.projects?.top || [];
  const agentCalls = activity?.weekly_activity?.agent_calls ?? 0;
  const hoursWeek = activity?.worked_this_week?.hours_this_week ?? 0;
  const activeProjects = activity?.projects?.active ?? 0;

  const statusColor = (s: string) => {
    if (s === 'success') return 'var(--solar-green)';
    if (s === 'failed' || s === 'failure') return 'var(--solar-red)';
    return 'var(--solar-yellow)';
  };

  return (
    <div className="flex flex-col h-full min-h-0 overflow-auto bg-[var(--bg-app)]">
      <div className="p-4 md:p-6 flex flex-col gap-5 min-w-0">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Home size={16} className="text-[var(--solar-cyan)]" />
            <span className="text-[15px] font-semibold text-[var(--text-main)]">Overview</span>
            <div className="flex items-center gap-1.5 ml-2">
              <div className="w-1.5 h-1.5 rounded-full bg-[var(--solar-green)] animate-pulse" />
              <span className="text-[11px] text-[var(--text-muted)] uppercase tracking-widest">Live</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[13px] font-mono text-[var(--text-muted)]">
              {time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
            <button onClick={load} className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors">
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard label="Monthly Burn" value={`$${monthlyBurn.toFixed(2)}`} sub="total commitments" color="var(--solar-cyan)" icon={<TrendingUp size={14} />} />
          <StatCard label="AI Tooling" value={`$${aiSpend.toFixed(2)}`} sub="subscriptions + API" color="var(--solar-magenta)" icon={<Zap size={14} />} />
          <StatCard label="Infra / Bills" value={`$${infraBills.toFixed(2)}`} sub="CF · AT&T · Car" color="var(--solar-orange)" icon={<Cloud size={14} />} />
          <StatCard label="Agent Calls" value={agentCalls.toLocaleString()} sub="this week" color="var(--solar-blue)" icon={<Layers size={14} />} />
          <StatCard label="Hours This Week" value={`${hoursWeek.toFixed(1)}h`} sub={`Today: ${activity?.worked_this_week?.hours_today?.toFixed(1) ?? 0}h`} color="var(--solar-yellow)" icon={<Clock size={14} />} />
          <StatCard label="Projects" value={String(activeProjects)} sub="active" color="var(--solar-green)" icon={<GitBranch size={14} />} />
        </div>

        {/* Main content grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Deployments */}
          <div className="lg:col-span-2 bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
              <span className="text-[11px] uppercase tracking-widest font-semibold text-[var(--text-muted)]">Worker Deploys</span>
              <span className="text-[11px] text-[var(--text-muted)]">{deploys.length} recent</span>
            </div>
            <div className="overflow-auto max-h-[240px]">
              {deploys.length === 0 ? (
                <div className="px-4 py-6 text-[12px] text-[var(--text-muted)] text-center">No deploys found</div>
              ) : (
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-[var(--border-subtle)]">
                      {['Worker', 'Env', 'Status', 'Deployed'].map(h => (
                        <th key={h} className="px-4 py-2 text-left text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-semibold">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {deploys.slice(0, 10).map((d, i) => (
                      <tr key={i} className="border-b border-[var(--border-subtle)]/30 hover:bg-[var(--bg-hover)] transition-colors">
                        <td className="px-4 py-2 text-[var(--text-main)] font-mono truncate max-w-[140px]">{d.worker_name}</td>
                        <td className="px-4 py-2 text-[var(--text-muted)]">{d.environment}</td>
                        <td className="px-4 py-2">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase" style={{ color: statusColor(d.status), background: statusColor(d.status) + '20' }}>
                            {d.status}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-[var(--text-muted)] font-mono text-[11px]">
                          {d.deployed_at ? new Date(d.deployed_at).toLocaleDateString() : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Projects */}
          <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--border-subtle)]">
              <span className="text-[11px] uppercase tracking-widest font-semibold text-[var(--text-muted)]">Active Projects</span>
            </div>
            <div className="p-4 flex flex-col gap-2">
              {projects.length === 0 ? (
                <div className="text-[12px] text-[var(--text-muted)] text-center py-4">No projects found</div>
              ) : projects.map((p: Project, i: number) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-[var(--border-subtle)]/30 last:border-0">
                  <span className="text-[13px] text-[var(--text-main)] truncate">{p.name}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded font-semibold uppercase ml-2 shrink-0"
                    style={{ color: p.status === 'active' ? 'var(--solar-green)' : 'var(--solar-yellow)', background: (p.status === 'active' ? 'var(--solar-green)' : 'var(--solar-yellow)') + '20' }}>
                    {p.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* CI/CD + Spend row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* CI/CD Runs */}
          <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--border-subtle)]">
              <span className="text-[11px] uppercase tracking-widest font-semibold text-[var(--text-muted)]">CI/CD Runs</span>
            </div>
            <div className="p-3 flex flex-col gap-2 max-h-[200px] overflow-auto">
              {cicd.length === 0 ? (
                <div className="text-[12px] text-[var(--text-muted)] text-center py-4">No CI/CD runs</div>
              ) : cicd.slice(0, 8).map((r, i) => (
                <div key={i} className="flex items-center gap-3 py-1.5 border-b border-[var(--border-subtle)]/30 last:border-0">
                  {r.conclusion === 'success' || r.status === 'success'
                    ? <CheckCircle size={13} className="text-[var(--solar-green)] shrink-0" />
                    : <AlertCircle size={13} className="text-[var(--solar-red)] shrink-0" />
                  }
                  <span className="text-[12px] text-[var(--text-main)] truncate flex-1">{r.worker_name || r.id?.slice(0, 16)}</span>
                  <span className="text-[10px] text-[var(--text-muted)] shrink-0">{r.environment}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Spend breakdown */}
          <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--border-subtle)]">
              <span className="text-[11px] uppercase tracking-widest font-semibold text-[var(--text-muted)]">Spend by Category</span>
            </div>
            <div className="p-4 flex flex-col gap-3">
              {[
                { label: 'AI Tools', value: aiSpend, color: 'var(--solar-magenta)', total: monthlyBurn },
                { label: 'Infra', value: infraBills, color: 'var(--solar-orange)', total: monthlyBurn },
                { label: 'Other', value: Math.max(0, monthlyBurn - aiSpend - infraBills), color: 'var(--solar-blue)', total: monthlyBurn },
              ].map(({ label, value, color, total }) => (
                <div key={label} className="flex flex-col gap-1">
                  <div className="flex justify-between text-[12px]">
                    <span className="text-[var(--text-muted)]">{label}</span>
                    <span className="text-[var(--text-main)] font-semibold">${value.toFixed(2)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-[var(--bg-app)] overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, (value / total) * 100)}%`, background: color }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

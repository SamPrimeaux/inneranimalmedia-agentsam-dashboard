import React, { useState, useEffect } from 'react';
import {
  FolderOpen,
  Github,
  TerminalSquare,
  Box,
  ChevronRight,
  LayoutTemplate,
  X,
  Clock,
  Star,
  HardDrive,
  Search,
  Activity,
  Rocket,
  MessagesSquare,
  Sparkles,
  Loader2,
} from 'lucide-react';
import {
  loadWelcomeOverviewFeeds,
  type WelcomeOverviewBundle,
  type AgentSessionRow,
  type AgentsamSkillRow,
} from '../src/iamDashboardFeeds';

interface WelcomeLauncherProps {
  onOpenFolder: () => void;
  /** Select a pinned / recent workspace — updates status bar; use Open Folder for real FS. */
  onWorkspacePick?: (ws: { name: string; path: string }) => void;
}

const ALL_WORKSPACES = [
  { name: 'inneranimalmedia---agent-sam---core', path: '/Volumes/Expansion', icon: <Star size={14} />, color: 'text-[var(--solar-yellow)]', tag: 'Active' },
  { name: 'samprimeaux', path: '/Users', icon: <HardDrive size={14} />, color: 'text-[var(--solar-magenta)]', tag: null },
  { name: 'cursor-efficiency-setup', path: '~/Downloads', icon: <LayoutTemplate size={14} />, color: 'text-[var(--solar-cyan)]', tag: null },
  { name: 'Downloads', path: '~', icon: <FolderOpen size={14} />, color: 'text-[var(--solar-blue)]', tag: null },
  { name: 'agent-sam-dashboard', path: '/Volumes/Expansion', icon: <Box size={14} />, color: 'text-[var(--solar-green)]', tag: null },
  { name: 'inneranimal-api', path: '/Volumes/Expansion', icon: <Star size={14} />, color: 'text-[var(--solar-orange)]', tag: null },
  { name: 'iam-cms', path: '/Volumes/Expansion', icon: <LayoutTemplate size={14} />, color: 'text-[var(--solar-violet)]', tag: null },
];

const PINNED_WORKSPACES = ALL_WORKSPACES.slice(0, 3);

function sessionsList(bundle: WelcomeOverviewBundle | null): AgentSessionRow[] {
  const b = bundle?.sessions?.body;
  return Array.isArray(b) ? b : [];
}

function skillsList(bundle: WelcomeOverviewBundle | null): AgentsamSkillRow[] {
  const b = bundle?.skills?.body;
  return Array.isArray(b) ? b : [];
}

function formatShortAt(raw: string | undefined): string {
  if (!raw || typeof raw !== 'string') return '';
  if (raw.length >= 19 && raw.includes('T')) {
    return raw.slice(0, 16).replace('T', ' ');
  }
  return raw.length > 22 ? `${raw.slice(0, 19)}…` : raw;
}

export const WelcomeLauncher: React.FC<WelcomeLauncherProps> = ({ onOpenFolder, onWorkspacePick }) => {
  const [showPopup, setShowPopup] = useState(false);
  const [search, setSearch] = useState('');
  const [feeds, setFeeds] = useState<WelcomeOverviewBundle | null>(null);
  const [feedsLoading, setFeedsLoading] = useState(true);

  const filtered = ALL_WORKSPACES.filter(
    (w) =>
      w.name.toLowerCase().includes(search.toLowerCase()) ||
      w.path.toLowerCase().includes(search.toLowerCase()),
  );

  useEffect(() => {
    let cancelled = false;
    setFeedsLoading(true);
    void loadWelcomeOverviewFeeds().then((data) => {
      if (!cancelled) {
        setFeeds(data);
        setFeedsLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const stats = feeds?.stats?.body;
  const recentItems = feeds?.recent?.body?.items ?? [];
  const deployRows = feeds?.deployments?.body?.deployments ?? [];
  const cicdRows = feeds?.deployments?.body?.cicd_runs ?? [];
  const sess = sessionsList(feeds);
  const sk = skillsList(feeds);

  const gatedDeployments = feeds?.deployments?.status === 401;
  const gatedSkills = feeds?.skills?.status === 401;

  return (
    <div className="w-full h-full flex items-center justify-center bg-[var(--bg-app)] text-[var(--text-main)] font-sans overflow-y-auto relative">
      <div className="flex flex-col items-center max-w-xl w-full p-8 animate-in fade-in slide-in-from-bottom-6 duration-500">
        {/* Logo & Title */}
        <div className="flex flex-col items-center mb-6 gap-3">
          <img
            src="https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/ac515729-af6b-4ea5-8b10-e581a4d02100/thumbnail"
            alt="InnerAnimalMedia"
            className="w-14 h-14 object-contain drop-shadow-xl"
          />
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-heading)]">InnerAnimalMedia</h1>
        </div>

        {/* Live overview (wired to worker APIs) */}
        <div className="w-full mb-8 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)]/80 p-4 text-left">
          <div className="flex items-center justify-between gap-2 mb-3">
            <span className="text-[11px] uppercase tracking-widest font-semibold text-[var(--text-muted)] flex items-center gap-2">
              <Activity size={14} className="text-[var(--solar-cyan)]" />
              Live snapshot
            </span>
            {feedsLoading && <Loader2 size={14} className="animate-spin text-[var(--text-muted)]" aria-hidden />}
          </div>

          {feedsLoading ? (
            <p className="text-[12px] text-[var(--text-muted)]">Loading platform metrics…</p>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="rounded-lg bg-[var(--bg-app)] border border-[var(--border-subtle)] px-2 py-2">
                  <p className="text-[9px] uppercase tracking-wider text-[var(--text-muted)]">DB</p>
                  <p className="text-[13px] font-semibold text-[var(--text-main)]">{stats?.db_health ?? '—'}</p>
                </div>
                <div className="rounded-lg bg-[var(--bg-app)] border border-[var(--border-subtle)] px-2 py-2">
                  <p className="text-[9px] uppercase tracking-wider text-[var(--text-muted)]">Clients</p>
                  <p className="text-[13px] font-semibold text-[var(--text-main)]">
                    {stats?.active_clients != null ? String(stats.active_clients) : '—'}
                  </p>
                </div>
                <div className="rounded-lg bg-[var(--bg-app)] border border-[var(--border-subtle)] px-2 py-2">
                  <p className="text-[9px] uppercase tracking-wider text-[var(--text-muted)]">Agent calls</p>
                  <p className="text-[13px] font-semibold text-[var(--text-main)]">
                    {stats?.agent_conversations != null ? String(stats.agent_conversations) : '—'}
                  </p>
                </div>
                <div className="rounded-lg bg-[var(--bg-app)] border border-[var(--border-subtle)] px-2 py-2">
                  <p className="text-[9px] uppercase tracking-wider text-[var(--text-muted)]">Last agent</p>
                  <p className="text-[11px] font-medium text-[var(--text-main)] truncate" title={stats?.agent_last_activity ?? ''}>
                    {stats?.agent_last_activity ? formatShortAt(stats.agent_last_activity) : '—'}
                  </p>
                </div>
              </div>

              {recentItems.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1.5">Recent activity</p>
                  <ul className="space-y-1 max-h-28 overflow-y-auto text-[11px] text-[var(--text-main)]">
                    {recentItems.slice(0, 8).map((it, i) => (
                      <li key={`${it.at}-${i}`} className="flex gap-2 border-b border-[var(--border-subtle)]/50 pb-1 last:border-0">
                        <span className="shrink-0 text-[var(--text-muted)] w-24">{formatShortAt(it.at)}</span>
                        <span className="min-w-0">{it.text}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1 flex items-center gap-1">
                    <Rocket size={12} />
                    Deployments
                  </p>
                  {gatedDeployments ? (
                    <p className="text-[11px] text-[var(--text-muted)]">Sign in to load deployment history.</p>
                  ) : deployRows.length === 0 && cicdRows.length === 0 ? (
                    <p className="text-[11px] text-[var(--text-muted)]">No recent deployments in D1.</p>
                  ) : (
                    <ul className="text-[11px] space-y-1">
                      {deployRows.slice(0, 3).map((d, i) => (
                        <li key={`d-${i}`} className="truncate" title={d.deployment_notes ?? ''}>
                          <span className="text-[var(--text-muted)]">{formatShortAt(d.deployed_at)}</span>{' '}
                          {d.worker_name ?? 'worker'} · {d.status ?? '—'}
                        </li>
                      ))}
                      {cicdRows.slice(0, 2).map((c, i) => (
                        <li key={`c-${i}`} className="truncate">
                          CI: {c.workflow_name ?? c.run_id ?? 'run'} · {c.conclusion ?? c.status ?? '—'}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1 flex items-center gap-1">
                    <MessagesSquare size={12} />
                    Sessions
                  </p>
                  {!feeds?.sessions?.ok ? (
                    <p className="text-[11px] text-[var(--text-muted)]">Could not load sessions.</p>
                  ) : sess.length === 0 ? (
                    <p className="text-[11px] text-[var(--text-muted)]">No sessions for this tenant.</p>
                  ) : (
                    <ul className="text-[11px] space-y-1 max-h-24 overflow-y-auto">
                      {sess.slice(0, 6).map((s) => (
                        <li key={s.id} className="truncate">
                          <span className="font-medium">{s.name ?? s.id.slice(0, 8)}</span>
                          {s.message_count != null ? (
                            <span className="text-[var(--text-muted)]"> · {s.message_count} msgs</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              <div>
                <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1 flex items-center gap-1">
                  <Sparkles size={12} />
                  Skills
                </p>
                {gatedSkills ? (
                  <p className="text-[11px] text-[var(--text-muted)]">Sign in to list your Agent Sam skills.</p>
                ) : sk.length === 0 ? (
                  <p className="text-[11px] text-[var(--text-muted)]">No active skills in D1.</p>
                ) : (
                  <p className="text-[11px] text-[var(--text-main)]">
                    {sk.length} skill{sk.length === 1 ? '' : 's'}: {sk
                      .slice(0, 10)
                      .map((x) => x.name || x.id.slice(0, 8))
                      .join(', ')}
                    {sk.length > 10 ? '…' : ''}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Primary CTA */}
        <button
          onClick={onOpenFolder}
          className="w-full bg-[var(--solar-cyan)] hover:brightness-110 text-[var(--solar-base03)] font-semibold py-3 px-4 rounded-lg flex items-center justify-center gap-2 mb-3 transition shadow-[0_0_20px_color-mix(in_srgb,var(--solar-cyan)_20%,transparent)]"
        >
          <FolderOpen size={18} />
          Open Folder
        </button>

        {/* Secondary CTAs */}
        <div className="flex gap-3 w-full mb-10">
          <button className="flex-1 bg-[var(--bg-panel)] hover:brightness-110 border border-[var(--border-subtle)] py-2.5 rounded-lg flex items-center justify-center gap-2 text-[13px] text-[var(--text-muted)] hover:text-[var(--text-main)] transition">
            <TerminalSquare size={15} />
            Agent Manager
          </button>
          <button className="flex-1 bg-[var(--bg-panel)] hover:brightness-110 border border-[var(--border-subtle)] py-2.5 rounded-lg flex items-center justify-center gap-2 text-[13px] text-[var(--text-muted)] hover:text-[var(--text-main)] transition">
            <Github size={15} />
            Clone Repository
          </button>
        </div>

        {/* Workspaces Section */}
        <div className="w-full">
          <span className="text-[11px] uppercase tracking-widest font-semibold text-[var(--text-muted)] mb-3 block">Workspaces</span>

          <div className="w-full flex flex-col gap-2">
            {PINNED_WORKSPACES.map((ws) => (
              <div
                key={ws.name}
                role="button"
                tabIndex={0}
                onClick={() => onWorkspacePick?.({ name: ws.name, path: ws.path })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onWorkspacePick?.({ name: ws.name, path: ws.path });
                  }
                }}
                className="w-full border border-[var(--border-subtle)] hover:border-[var(--solar-cyan)]/50 hover:bg-[var(--bg-hover)] transition-all bg-[var(--bg-panel)] rounded-lg p-3 cursor-pointer group flex items-center justify-between"
              >
                <div className="flex items-center gap-2.5">
                  <span className={ws.color}>{ws.icon}</span>
                  <div className="flex flex-col">
                    <span className="font-medium text-[13px] text-[var(--text-main)] flex items-center gap-2">
                      {ws.name}
                      {ws.tag && (
                        <span className="text-[9px] uppercase tracking-widest font-bold px-1.5 py-0.5 bg-[var(--solar-cyan)]/15 text-[var(--solar-cyan)] rounded">
                          {ws.tag}
                        </span>
                      )}
                    </span>
                    <span className="text-[11px] text-[var(--text-muted)]">{ws.path}</span>
                  </div>
                </div>
                <ChevronRight size={14} className="text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            ))}
          </div>

          {/* Show More — opens popup */}
          <button
            onClick={() => setShowPopup(true)}
            className="w-full text-center text-[11px] text-[var(--text-muted)] hover:text-[var(--solar-cyan)] mt-4 py-2 border border-dashed border-[var(--border-subtle)] hover:border-[var(--solar-cyan)]/50 rounded-lg tracking-wider transition-colors"
          >
            Show all {ALL_WORKSPACES.length} workspaces...
          </button>
        </div>
      </div>

      {/* ── WORKSPACE POPUP MODAL ── */}
      {showPopup && (
        <div
          className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-6 animate-in fade-in duration-200"
          onClick={() => setShowPopup(false)}
        >
          <div
            className="w-full max-w-md bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 fade-in duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2">
                <Clock size={15} className="text-[var(--text-muted)]" />
                <span className="text-[13px] font-semibold text-[var(--text-heading)]">All Workspaces</span>
              </div>
              <button
                onClick={() => setShowPopup(false)}
                className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors"
              >
                <X size={15} />
              </button>
            </div>

            {/* Search */}
            <div className="px-4 py-3 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded-lg px-3 py-2">
                <Search size={13} className="text-[var(--text-muted)]" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filter workspaces..."
                  autoFocus
                  className="flex-1 bg-transparent text-[13px] focus:outline-none text-[var(--text-main)] placeholder:text-[var(--text-muted)]"
                />
              </div>
            </div>

            {/* Workspace List */}
            <div className="max-h-80 overflow-y-auto p-2">
              {filtered.length === 0 ? (
                <p className="text-center text-[12px] text-[var(--text-muted)] py-8">No workspaces found</p>
              ) : (
                filtered.map((ws) => (
                  <button
                    key={ws.name}
                    onClick={() => {
                      onWorkspacePick?.({ name: ws.name, path: ws.path });
                      setShowPopup(false);
                    }}
                    className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-[var(--bg-hover)] group transition-colors text-left"
                  >
                    <span className={`${ws.color} shrink-0`}>{ws.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-medium text-[var(--text-main)] truncate">{ws.name}</span>
                        {ws.tag && (
                          <span className="text-[9px] uppercase tracking-widest font-bold px-1.5 py-0.5 bg-[var(--solar-cyan)]/15 text-[var(--solar-cyan)] rounded shrink-0">
                            {ws.tag}
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-[var(--text-muted)] block">{ws.path}</span>
                    </div>
                    <ChevronRight size={13} className="text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  </button>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t border-[var(--border-subtle)]">
              <button
                onClick={onOpenFolder}
                className="w-full py-2 rounded-lg bg-[var(--solar-cyan)]/10 hover:bg-[var(--solar-cyan)]/20 border border-[var(--solar-cyan)]/30 text-[var(--solar-cyan)] text-[12px] font-semibold flex items-center justify-center gap-2 transition-colors"
              >
                <FolderOpen size={14} />
                Browse File System
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

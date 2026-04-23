/**
 * IntegrationsPage — /dashboard/integrations
 *
 * Card hub for GitHub, Cloudflare R2, MCP servers, and Google Drive.
 * Status comes from live API probes (OAuth rows, R2 buckets, MCP registry).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Github,
  Cloud,
  Plug,
  HardDrive,
  RefreshCw,
  Loader2,
  ArrowRight,
} from 'lucide-react';

type OAuthStatus = { google: boolean; github: boolean; github_accounts?: { account_identifier?: string }[] };

export const IntegrationsPage: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [githubOk, setGithubOk] = useState(false);
  const [driveOk, setDriveOk] = useState(false);
  const [r2Ok, setR2Ok] = useState(false);
  const [mcpOk, setMcpOk] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [oauthRes, r2Res, mcpRes] = await Promise.all([
        fetch('/api/integrations/status', { credentials: 'same-origin' }).then((r) =>
          r.ok ? r.json() : null,
        ),
        fetch('/api/r2/buckets', { credentials: 'same-origin' }).then((r) =>
          r.ok ? r.json() : null,
        ),
        fetch('/api/mcp/services', { credentials: 'same-origin' }).then((r) =>
          r.ok ? r.json() : null,
        ),
      ]);

      const oauth = oauthRes as OAuthStatus | null;
      setGithubOk(!!oauth?.github);
      setDriveOk(!!oauth?.google);

      const buckets = Array.isArray(r2Res?.buckets) ? r2Res.buckets : [];
      setR2Ok(buckets.length > 0);

      const services = Array.isArray(mcpRes?.services) ? mcpRes.services : [];
      setMcpOk(services.length > 0);
    } catch {
      setGithubOk(false);
      setDriveOk(false);
      setR2Ok(false);
      setMcpOk(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const Badge: React.FC<{ ok: boolean }> = ({ ok }) => (
    <span
      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
        ok
          ? 'border-[var(--solar-green)]/40 text-[var(--solar-green)] bg-[var(--solar-green)]/10'
          : 'border-[var(--border-subtle)] text-[var(--text-muted)] bg-[var(--bg-app)]'
      }`}
    >
      {ok ? 'Connected' : 'Not connected'}
    </span>
  );

  const Card: React.FC<{
    title: string;
    description: string;
    icon: React.ReactNode;
    ok: boolean;
    onConfigure: () => void;
  }> = ({ title, description, icon, ok, onConfigure }) => (
    <div className="bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-xl p-5 flex flex-col gap-3 min-h-[140px] shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-[var(--bg-app)] flex items-center justify-center text-[var(--solar-cyan)] shrink-0">
            {icon}
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-[var(--text-heading)] truncate">{title}</h3>
            <p className="text-[11px] text-[var(--text-muted)] leading-snug mt-0.5">{description}</p>
          </div>
        </div>
        <Badge ok={ok} />
      </div>
      <div className="mt-auto pt-1">
        <button
          type="button"
          onClick={onConfigure}
          className="inline-flex items-center gap-1.5 text-[12px] font-medium px-3 py-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-hover)] text-[var(--text-main)] hover:border-[var(--solar-cyan)] hover:bg-[var(--bg-app)] transition-colors"
        >
          Configure
          <ArrowRight size={14} className="opacity-70" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full min-h-0 overflow-auto bg-[var(--bg-app)]">
      <div className="p-4 md:p-6 flex flex-col gap-5 min-w-0 max-w-5xl mx-auto w-full">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-[var(--text-heading)] tracking-tight">Integrations</h1>
            <p className="text-[12px] text-[var(--text-muted)] mt-1 max-w-xl">
              Connect cloud sources and tools used across Agent Sam. Configure opens the live panels on the Agent workspace or MCP board.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="inline-flex items-center gap-2 self-start text-[11px] font-medium px-3 py-2 rounded-lg border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-main)] hover:border-[var(--solar-cyan)] disabled:opacity-50"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Refresh status
          </button>
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-[12px] text-[var(--text-muted)]">
            <Loader2 size={14} className="animate-spin text-[var(--solar-cyan)]" />
            Checking connections…
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card
            title="GitHub"
            description="Repos, Actions, and file sync via OAuth."
            icon={<Github size={20} strokeWidth={1.75} />}
            ok={githubOk}
            onConfigure={() => {
              if (!githubOk) {
                window.location.href =
                  '/api/oauth/github/start?return_to=' + encodeURIComponent('/dashboard/integrations');
              } else {
                navigate('/dashboard/agent');
              }
            }}
          />
          <Card
            title="Cloudflare R2"
            description="Object storage buckets bound to this worker."
            icon={<Cloud size={20} strokeWidth={1.75} />}
            ok={r2Ok}
            onConfigure={() => navigate('/dashboard/agent')}
          />
          <Card
            title="MCP servers"
            description="Registered Model Context Protocol endpoints and tools."
            icon={<Plug size={20} strokeWidth={1.75} />}
            ok={mcpOk}
            onConfigure={() => navigate('/dashboard/mcp')}
          />
          <Card
            title="Google Drive"
            description="Browse and open Drive files from the workspace rail."
            icon={<HardDrive size={20} strokeWidth={1.75} />}
            ok={driveOk}
            onConfigure={() => {
              if (!driveOk) {
                window.location.href =
                  '/api/oauth/google/start?return_to=' +
                  encodeURIComponent('/dashboard/integrations') +
                  '&connect=drive';
              } else {
                navigate('/dashboard/agent');
              }
            }}
          />
        </div>
      </div>
    </div>
  );
};

/**
 * IntegrationsPage — /dashboard/integrations
 *
 * Dense operations console for provider health, OAuth, webhooks, MCP tools,
 * API key references, and integration event logs.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Cloud,
  Database,
  Github,
  HardDrive,
  KeyRound,
  Loader2,
  MessageSquare,
  Plug,
  RefreshCw,
  Search,
  Settings,
  Shield,
  TerminalSquare,
  Webhook,
  X,
  Zap,
} from 'lucide-react';

type TabKey = 'connected' | 'available' | 'oauth' | 'webhooks' | 'mcp' | 'api_keys' | 'logs';

type Provider = {
  provider_key: string;
  display_name: string;
  category: string;
  auth_type: string;
  status: 'connected' | 'disconnected' | 'degraded' | 'auth_expired' | 'pending';
  account_display?: string | null;
  secret_binding_name?: string | null;
  scopes?: string[];
  last_sync_at?: string | null;
  last_health_check_at?: string | null;
  last_health_latency_ms?: number | null;
  last_health_status?: string | null;
  oauth_account?: any;
  oauth_accounts?: any[];
  health?: { status?: string | null; latency_ms?: number | null; checked_at?: string | null; error_message?: string | null };
  tool_count?: number;
};

type SummaryPayload = {
  providers?: Provider[];
  summary?: Record<string, number>;
  oauth_tokens?: any[];
  mcp_tools?: { total?: number; enabled?: number; by_category?: any[] };
  webhooks?: { total?: number; active?: number };
  allowlist_count?: number;
  recent_events?: any[];
  capabilities?: { can_manage_mcp?: boolean; can_manage_secrets?: boolean; is_superadmin?: boolean };
};

const TABS: { key: TabKey; label: string }[] = [
  { key: 'connected', label: 'Connected' },
  { key: 'available', label: 'Available' },
  { key: 'oauth', label: 'OAuth' },
  { key: 'webhooks', label: 'Webhooks' },
  { key: 'mcp', label: 'MCP Tools' },
  { key: 'api_keys', label: 'API Keys' },
  { key: 'logs', label: 'Logs' },
];

const AVAILABLE_PROVIDERS = [
  ['stripe', 'Stripe', 'Payments, subscriptions, customer billing.', 'payment'],
  ['shopify', 'Shopify', 'Commerce catalog and order automation.', 'automation'],
  ['slack', 'Slack', 'Team notifications and command webhooks.', 'communication'],
  ['discord', 'Discord', 'Community and bot workflow integration.', 'communication'],
  ['notion', 'Notion', 'Workspace docs, databases, and notes.', 'automation'],
  ['linear', 'Linear', 'Issue tracking and sprint workflows.', 'automation'],
  ['jira', 'Jira', 'Enterprise ticket and project sync.', 'automation'],
  ['twilio', 'Twilio', 'SMS, voice, and messaging API.', 'communication'],
  ['mailgun', 'Mailgun', 'Email sending and inbound routes.', 'communication'],
  ['aws_s3', 'AWS S3', 'External object storage buckets.', 'storage'],
  ['vercel', 'Vercel', 'Frontend deployments and preview links.', 'deployment'],
  ['netlify', 'Netlify', 'Static app deployment hooks.', 'deployment'],
  ['planetscale', 'PlanetScale', 'MySQL database branch workflows.', 'database'],
  ['neon', 'Neon', 'Serverless Postgres projects.', 'database'],
  ['turso', 'Turso', 'Edge SQLite databases.', 'database'],
  ['pinecone', 'Pinecone', 'Vector search indexes.', 'analytics'],
  ['weaviate', 'Weaviate', 'Vector database clusters.', 'analytics'],
  ['qdrant', 'Qdrant', 'Vector search collections.', 'analytics'],
];

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin', ...init });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any)?.error || res.statusText);
  return data as T;
}

function relativeTime(value?: string | number | null) {
  if (!value) return 'never';
  const date = typeof value === 'number' ? new Date(value * 1000) : new Date(value);
  if (Number.isNaN(date.getTime())) return 'unknown';
  const diff = Date.now() - date.getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function statusTone(status?: string) {
  if (status === 'connected' || status === 'ok' || status === 'active') return 'text-[var(--solar-green)] border-[var(--solar-green)]/40 bg-[var(--solar-green)]/10';
  if (status === 'degraded' || status === 'pending' || status === 'expiring_soon') return 'text-[var(--solar-yellow)] border-[var(--solar-yellow)]/40 bg-[var(--solar-yellow)]/10';
  if (status === 'auth_expired' || status === 'expired' || status === 'error') return 'text-[var(--solar-red)] border-[var(--solar-red)]/40 bg-[var(--solar-red)]/10';
  return 'text-[var(--text-muted)] border-[var(--border-subtle)] bg-[var(--bg-app)]';
}

function healthDot(latency?: number | null) {
  if (latency == null) return 'bg-[var(--text-muted)]';
  if (latency < 200) return 'bg-[var(--solar-green)]';
  if (latency < 1000) return 'bg-[var(--solar-yellow)]';
  return 'bg-[var(--solar-red)]';
}

function iconFor(provider: string, category?: string) {
  if (provider === 'github') return <Github size={17} />;
  if (provider === 'google_drive') return <HardDrive size={17} />;
  if (provider.includes('r2') || category === 'storage') return <Cloud size={17} />;
  if (provider.includes('mcp')) return <Plug size={17} />;
  if (category === 'database') return <Database size={17} />;
  if (category === 'communication') return <MessageSquare size={17} />;
  if (category === 'ai_provider') return <Zap size={17} />;
  return <Activity size={17} />;
}

const Badge: React.FC<{ value?: string | null; className?: string }> = ({ value, className }) => (
  <span className={cx('text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border whitespace-nowrap', statusTone(String(value || '')), className)}>
    {String(value || 'unknown').replace(/_/g, ' ')}
  </span>
);

export const IntegrationsPage: React.FC = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabKey>('connected');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SummaryPayload>({});
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [logProvider, setLogProvider] = useState('');
  const [logType, setLogType] = useState('');

  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    try {
      setData(await fetchJson<SummaryPayload>('/api/integrations/summary'));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const summaryTimer = window.setInterval(() => void refresh(true), 120000);
    const logsTimer = window.setInterval(() => {
      if (tab === 'logs') void refresh(true);
    }, 30000);
    return () => {
      window.clearInterval(summaryTimer);
      window.clearInterval(logsTimer);
    };
  }, [refresh, tab]);

  const providers = data.providers || [];
  const summary = data.summary || {};
  const canManageMcp = data.capabilities?.can_manage_mcp !== false;
  const canManageSecrets = data.capabilities?.can_manage_secrets !== false;
  const isSuperadmin = data.capabilities?.is_superadmin !== false;

  const visibleTabs = useMemo(() => {
    if (canManageMcp) return TABS;
    return TABS.filter((t) => t.key !== 'mcp');
  }, [canManageMcp]);

  const disconnectedKeys = new Set(providers.filter((p) => p.status !== 'disconnected').map((p) => p.provider_key));
  const availableProviders = AVAILABLE_PROVIDERS.filter(([key]) => !disconnectedKeys.has(key));

  const openDrawer = useCallback(async (provider: Provider) => {
    setSelectedProvider(provider);
    setDetail(null);
    setDetailLoading(true);
    try {
      setDetail(await fetchJson(`/api/integrations/${encodeURIComponent(provider.provider_key)}/detail`));
    } catch (e) {
      setDetail({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const runAction = useCallback(async (provider: string, action: 'test' | 'sync' | 'disconnect') => {
    setBusy(`${provider}:${action}`);
    try {
      await fetchJson(`/api/integrations/${encodeURIComponent(provider)}/${action}`, { method: 'POST' });
      await refresh(true);
      if (selectedProvider?.provider_key === provider) await openDrawer(selectedProvider);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }, [openDrawer, refresh, selectedProvider]);

  return (
    <div className="flex h-full min-h-0 bg-[var(--bg-app)] text-[var(--text-main)] overflow-hidden">
      <main className="flex-1 min-w-0 overflow-auto">
        <div className="p-4 md:p-6 flex flex-col gap-4">
          <header className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-[10px] font-bold tracking-[0.22em] uppercase text-[var(--solar-cyan)]">
                <TerminalSquare size={14} />
                Integration Ops
              </div>
              <h1 className="text-xl font-bold text-[var(--text-heading)] tracking-tight mt-1">Integrations</h1>
              <p className="text-[12px] text-[var(--text-muted)] mt-1 max-w-2xl">
                OAuth, webhooks, Worker bindings, MCP tools, and API key references in one live console.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={loading}
              className="inline-flex items-center gap-2 self-start text-[11px] font-medium px-3 py-2 rounded-lg border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-main)] hover:border-[var(--solar-cyan)] disabled:opacity-50"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Refresh
            </button>
          </header>

          {error && (
            <div className="rounded-lg border border-[var(--solar-red)]/40 bg-[var(--solar-red)]/10 px-3 py-2 text-[12px] text-[var(--solar-red)] flex items-center gap-2">
              <AlertTriangle size={14} />
              {error}
            </div>
          )}

          <nav className="flex gap-1 overflow-x-auto border-b border-[var(--border-subtle)]">
            {visibleTabs.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setTab(item.key)}
                className={cx(
                  'px-3 py-2 text-[11px] font-bold uppercase tracking-wider border-b-2 whitespace-nowrap',
                  tab === item.key
                    ? 'border-[var(--solar-cyan)] text-[var(--text-heading)]'
                    : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-main)]',
                )}
              >
                {item.label}
              </button>
            ))}
          </nav>

          {tab === 'connected' && (
            <>
              <KpiStrip summary={summary} />
              <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {providers.map((provider) => (
                  <ProviderCard
                    key={provider.provider_key}
                    provider={provider}
                    busy={busy}
                    onTest={() => void runAction(provider.provider_key, 'test')}
                    onSync={() => void runAction(provider.provider_key, 'sync')}
                    onConfigure={() => void openDrawer(provider)}
                  />
                ))}
              </section>
            </>
          )}

          {tab === 'available' && (
            <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {availableProviders.map(([key, name, description, category]) => (
                <div key={key} className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4 min-h-[150px] flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-[var(--bg-app)] text-[var(--solar-cyan)] flex items-center justify-center">
                        {iconFor(key, category)}
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-[var(--text-heading)] truncate">{name}</h3>
                        <p className="text-[11px] text-[var(--text-muted)] leading-snug">{description}</p>
                      </div>
                    </div>
                    <Badge value={category} />
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedProvider({ provider_key: key, display_name: name, category, auth_type: 'api_key', status: 'disconnected' })}
                    className="mt-auto inline-flex items-center justify-center gap-2 text-[11px] font-bold px-3 py-2 rounded-lg border border-[var(--border-subtle)] hover:border-[var(--solar-cyan)]"
                  >
                    <Plug size={13} />
                    Connect
                  </button>
                </div>
              ))}
            </section>
          )}

          {tab === 'oauth' && (
            <DataPanel title="OAuth Tokens" icon={<Shield size={15} />}>
              <OAuthTable tokens={data.oauth_tokens || []} onReauthorize={(provider) => startOauth(provider)} onRevoke={(provider) => void runAction(normalizeUiProvider(provider), 'disconnect')} />
            </DataPanel>
          )}

          {tab === 'webhooks' && (
            <WebhooksPanel providers={providers} />
          )}

          {tab === 'mcp' && (
            <McpMiniPanel data={data} onOpenFull={() => navigate('/dashboard/mcp')} />
          )}

          {tab === 'api_keys' && (
            <ApiKeysPanel providers={providers.filter((p) => p.auth_type === 'api_key')} canManage={canManageSecrets} onTest={(provider) => void runAction(provider, 'test')} />
          )}

          {tab === 'logs' && (
            <DataPanel title="Integration Events" icon={<Activity size={15} />} actions={(
              <div className="flex flex-wrap gap-2">
                <FilterInput value={logProvider} onChange={setLogProvider} placeholder="provider" />
                <FilterInput value={logType} onChange={setLogType} placeholder="event type" />
              </div>
            )}>
              <LogsTable events={(data.recent_events || []).filter((event) => {
                if (logProvider && !String(event.provider_key || '').includes(logProvider)) return false;
                if (logType && !String(event.event_type || '').includes(logType)) return false;
                return true;
              })} />
            </DataPanel>
          )}
        </div>
      </main>

      {selectedProvider && (
        <ProviderDrawer
          provider={selectedProvider}
          detail={detail}
          loading={detailLoading}
          isSuperadmin={isSuperadmin}
          onClose={() => {
            setSelectedProvider(null);
            setDetail(null);
          }}
          onTest={() => void runAction(selectedProvider.provider_key, 'test')}
          onSync={() => void runAction(selectedProvider.provider_key, 'sync')}
          onDisconnect={() => void runAction(selectedProvider.provider_key, 'disconnect')}
        />
      )}
    </div>
  );
};

const KpiStrip: React.FC<{ summary: Record<string, number> }> = ({ summary }) => {
  const items = [
    ['Connected', summary.connected || 0, CheckCircle2],
    ['Degraded', summary.degraded || 0, AlertTriangle],
    ['Auth Expired', summary.auth_expired || 0, KeyRound],
    ['MCP Tools', summary.enabled_mcp_tools || 0, Plug],
    ['Active Webhooks', summary.active_webhooks || 0, Webhook],
  ];
  return (
    <section className="grid grid-cols-2 md:grid-cols-5 gap-2">
      {items.map(([label, value, Icon]) => (
        <div key={String(label)} className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-3 py-3">
          <div className="flex items-center justify-between text-[var(--text-muted)]">
            <span className="text-[10px] uppercase tracking-wider font-bold">{label as string}</span>
            <Icon size={13} />
          </div>
          <div className="mt-2 text-2xl font-bold text-[var(--text-heading)]">{value as number}</div>
        </div>
      ))}
    </section>
  );
};

const ProviderCard: React.FC<{
  provider: Provider;
  busy: string | null;
  onTest: () => void;
  onSync: () => void;
  onConfigure: () => void;
}> = ({ provider, busy, onTest, onSync, onConfigure }) => {
  const latency = provider.health?.latency_ms ?? provider.last_health_latency_ms;
  return (
    <article className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4 flex flex-col gap-3 min-h-[190px]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-[var(--bg-app)] text-[var(--solar-cyan)] flex items-center justify-center shrink-0">
            {iconFor(provider.provider_key, provider.category)}
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-[var(--text-heading)] truncate">{provider.display_name}</h3>
            <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mt-0.5">{provider.category}</p>
          </div>
        </div>
        <Badge value={provider.status} />
      </div>
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <Meta label="Account" value={provider.account_display || 'binding / secret'} />
        <Meta label="Last sync" value={relativeTime(provider.last_sync_at)} />
        <div>
          <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Health</div>
          <div className="flex items-center gap-2 mt-1">
            <span className={cx('w-2 h-2 rounded-full', healthDot(latency))} />
            <span className="font-mono text-[var(--text-main)]">{latency == null ? 'n/a' : `${latency}ms`}</span>
          </div>
        </div>
        <Meta label="Tools" value={String(provider.tool_count || 0)} />
      </div>
      <div className="mt-auto flex gap-2">
        <ActionButton label="Test" busy={busy === `${provider.provider_key}:test`} onClick={onTest} />
        <ActionButton label="Sync" busy={busy === `${provider.provider_key}:sync`} onClick={onSync} />
        <button type="button" onClick={onConfigure} className="flex-1 text-[11px] font-bold px-3 py-2 rounded-lg border border-[var(--border-subtle)] hover:border-[var(--solar-cyan)] inline-flex items-center justify-center gap-1.5">
          <Settings size={13} />
          Configure
        </button>
      </div>
    </article>
  );
};

const Meta: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="min-w-0">
    <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{label}</div>
    <div className="truncate mt-1 text-[var(--text-main)]">{value}</div>
  </div>
);

const ActionButton: React.FC<{ label: string; busy?: boolean; onClick: () => void }> = ({ label, busy, onClick }) => (
  <button type="button" disabled={busy} onClick={onClick} className="flex-1 text-[11px] font-bold px-3 py-2 rounded-lg border border-[var(--border-subtle)] hover:border-[var(--solar-cyan)] disabled:opacity-50 inline-flex items-center justify-center gap-1.5">
    {busy && <Loader2 size={12} className="animate-spin" />}
    {label}
  </button>
);

const DataPanel: React.FC<{ title: string; icon: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode }> = ({ title, icon, actions, children }) => (
  <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] overflow-hidden">
    <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-sm font-bold text-[var(--text-heading)]">{icon}{title}</div>
      {actions}
    </div>
    <div className="overflow-auto">{children}</div>
  </section>
);

const OAuthTable: React.FC<{ tokens: any[]; onReauthorize: (provider: string) => void; onRevoke: (provider: string) => void }> = ({ tokens, onReauthorize, onRevoke }) => (
  <table className="w-full text-left text-[12px]">
    <thead className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] bg-[var(--bg-app)]">
      <tr><th className="px-4 py-2">Provider</th><th className="px-4 py-2">Account</th><th className="px-4 py-2">Scopes</th><th className="px-4 py-2">Issued</th><th className="px-4 py-2">Expires</th><th className="px-4 py-2">Actions</th></tr>
    </thead>
    <tbody>
      {tokens.map((token, idx) => {
        const status = oauthStatus(token.expires_at);
        return (
          <tr key={`${token.provider}-${idx}`} className="border-t border-[var(--border-subtle)]">
            <td className="px-4 py-3 font-semibold">{token.provider}</td>
            <td className="px-4 py-3">{token.account_identifier || 'default'}</td>
            <td className="px-4 py-3 max-w-[260px] truncate">{token.scope || 'not recorded'}</td>
            <td className="px-4 py-3">{relativeTime(token.created_at)}</td>
            <td className="px-4 py-3"><Badge value={status} /></td>
            <td className="px-4 py-3 flex gap-2">
              <button className="text-[11px] font-bold text-[var(--solar-cyan)]" onClick={() => onReauthorize(token.provider)}>Re-authorize</button>
              <button className="text-[11px] font-bold text-[var(--solar-red)]" onClick={() => onRevoke(token.provider)}>Revoke</button>
            </td>
          </tr>
        );
      })}
      {tokens.length === 0 && <EmptyRow cols={6} label="No OAuth tokens found for this user." />}
    </tbody>
  </table>
);

const WebhooksPanel: React.FC<{ providers: Provider[] }> = ({ providers }) => {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    setLoading(true);
    fetchJson<{ webhooks?: any[] }>('/api/integrations/webhooks')
      .then((data) => setRows(data.webhooks || []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);
  return (
    <DataPanel title="Webhooks" icon={<Webhook size={15} />} actions={<button className="text-[11px] font-bold text-[var(--solar-cyan)]">+ New Webhook</button>}>
      {loading ? <LoadingBlock /> : (
        <table className="w-full text-left text-[12px]">
          <thead className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] bg-[var(--bg-app)]">
            <tr><th className="px-4 py-2">Name</th><th className="px-4 py-2">Provider</th><th className="px-4 py-2">Endpoint URL</th><th className="px-4 py-2">Last Triggered</th><th className="px-4 py-2">Count</th><th className="px-4 py-2">Status</th></tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.id}-${row.provider}`} className="border-t border-[var(--border-subtle)]">
                <td className="px-4 py-3 font-semibold">{row.name || row.id}</td>
                <td className="px-4 py-3">{row.provider}</td>
                <td className="px-4 py-3 font-mono max-w-[360px] truncate">{row.endpoint_url || `/api/integrations/${row.provider}/webhook`}</td>
                <td className="px-4 py-3">{relativeTime(row.last_triggered_at)}</td>
                <td className="px-4 py-3">{row.trigger_count || 0}</td>
                <td className="px-4 py-3"><Badge value={row.status} /></td>
              </tr>
            ))}
            {rows.length === 0 && <EmptyRow cols={6} label={`No webhooks found. Providers online: ${providers.length}`} />}
          </tbody>
        </table>
      )}
    </DataPanel>
  );
};

const McpMiniPanel: React.FC<{ data: SummaryPayload; onOpenFull: () => void }> = ({ data, onOpenFull }) => {
  const categories = data.mcp_tools?.by_category || [];
  return (
    <DataPanel title="MCP Tools" icon={<Plug size={15} />} actions={<button onClick={onOpenFull} className="text-[11px] font-bold text-[var(--solar-cyan)]">Open Full MCP Console →</button>}>
      <div className="p-4 grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 gap-3">
        {categories.map((cat: any) => (
          <div key={cat.category} className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-app)] p-3">
            <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{cat.category}</div>
            <div className="mt-2 text-2xl font-bold text-[var(--text-heading)]">{cat.enabled || 0}</div>
            <div className="text-[11px] text-[var(--text-muted)]">enabled of {cat.total || 0}</div>
          </div>
        ))}
        {categories.length === 0 && <div className="text-[12px] text-[var(--text-muted)]">No MCP tool categories returned.</div>}
      </div>
    </DataPanel>
  );
};

const ApiKeysPanel: React.FC<{ providers: Provider[]; canManage: boolean; onTest: (provider: string) => void }> = ({ providers, canManage, onTest }) => (
  <DataPanel title="API Keys" icon={<KeyRound size={15} />} actions={canManage ? <button className="text-[11px] font-bold text-[var(--solar-cyan)]">Add new key</button> : <Badge value="read_only" />}>
    <table className="w-full text-left text-[12px]">
      <thead className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] bg-[var(--bg-app)]">
        <tr><th className="px-4 py-2">Provider</th><th className="px-4 py-2">Secret Binding</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">Last Tested</th><th className="px-4 py-2">Action</th></tr>
      </thead>
      <tbody>
        {providers.map((provider) => (
          <tr key={provider.provider_key} className="border-t border-[var(--border-subtle)]">
            <td className="px-4 py-3 font-semibold">{provider.display_name}</td>
            <td className="px-4 py-3 font-mono">{provider.secret_binding_name || 'not set'}</td>
            <td className="px-4 py-3"><Badge value={provider.status} /></td>
            <td className="px-4 py-3">{relativeTime(provider.last_health_check_at)}</td>
            <td className="px-4 py-3"><button className="text-[11px] font-bold text-[var(--solar-cyan)]" onClick={() => onTest(provider.provider_key)}>Test</button></td>
          </tr>
        ))}
        {providers.length === 0 && <EmptyRow cols={5} label="No API key backed providers registered." />}
      </tbody>
    </table>
    <div className="px-4 py-3 border-t border-[var(--border-subtle)] text-[12px] text-[var(--text-muted)]">
      Per-user keys are stored by reference only here. Raw values should be set with <span className="font-mono text-[var(--text-main)]">npx wrangler secret put {'{SECRET_NAME}'} --name inneranimalmedia</span> or encrypted in KV by key id.
    </div>
  </DataPanel>
);

const LogsTable: React.FC<{ events: any[] }> = ({ events }) => (
  <table className="w-full text-left text-[12px]">
    <thead className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] bg-[var(--bg-app)]">
      <tr><th className="px-4 py-2">Time</th><th className="px-4 py-2">Provider</th><th className="px-4 py-2">Event</th><th className="px-4 py-2">Actor</th><th className="px-4 py-2">Message</th></tr>
    </thead>
    <tbody>
      {events.map((event, idx) => (
        <tr key={`${event.id || idx}`} className="border-t border-[var(--border-subtle)]">
          <td className="px-4 py-3 whitespace-nowrap">{relativeTime(event.created_at)}</td>
          <td className="px-4 py-3">{event.provider_key}</td>
          <td className="px-4 py-3"><Badge value={event.event_type} /></td>
          <td className="px-4 py-3">{event.actor || 'system'}</td>
          <td className="px-4 py-3">{event.message}</td>
        </tr>
      ))}
      {events.length === 0 && <EmptyRow cols={5} label="No integration events matched the filters." />}
    </tbody>
  </table>
);

const ProviderDrawer: React.FC<{
  provider: Provider;
  detail: any;
  loading: boolean;
  isSuperadmin: boolean;
  onClose: () => void;
  onTest: () => void;
  onSync: () => void;
  onDisconnect: () => void;
}> = ({ provider, detail, loading, isSuperadmin, onClose, onTest, onSync, onDisconnect }) => (
  <aside className="w-full max-w-md border-l border-[var(--border-subtle)] bg-[var(--bg-panel)] shadow-2xl overflow-auto">
    <div className="sticky top-0 bg-[var(--bg-panel)] border-b border-[var(--border-subtle)] p-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-[var(--solar-cyan)]">{iconFor(provider.provider_key, provider.category)}<span className="text-[10px] uppercase tracking-wider font-bold">{provider.category}</span></div>
        <h2 className="mt-1 text-lg font-bold text-[var(--text-heading)] truncate">{provider.display_name}</h2>
        <div className="mt-2"><Badge value={provider.status} /></div>
      </div>
      <button onClick={onClose} className="p-2 rounded-lg hover:bg-[var(--bg-hover)]"><X size={16} /></button>
    </div>
    <div className="p-4 flex flex-col gap-4">
      <div className="flex gap-2">
        <ActionButton label="Test" onClick={onTest} />
        <ActionButton label="Sync" onClick={onSync} />
      </div>
      {loading ? <LoadingBlock /> : (
        <>
          <DrawerSection title="Connection Details">
            <DetailLine label="Account" value={provider.account_display || detail?.provider?.account_display || 'not recorded'} />
            <DetailLine label="Auth Type" value={provider.auth_type} />
            <DetailLine label="Secret / Binding" value={provider.secret_binding_name || 'none'} />
            <DetailLine label="OAuth Expires" value={relativeTime(detail?.oauth_tokens?.[0]?.expires_at)} />
            <DetailLine label="Tools Count" value={String(detail?.tools?.length || provider.tool_count || 0)} />
          </DrawerSection>
          <DrawerSection title="Scopes">
            <div className="flex flex-wrap gap-1.5">
              {(provider.scopes?.length ? provider.scopes : String(detail?.oauth_tokens?.[0]?.scope || '').split(/[,\s]+/).filter(Boolean)).map((scope: string) => (
                <span key={scope} className="text-[10px] font-mono px-2 py-1 rounded border border-[var(--border-subtle)] bg-[var(--bg-app)]">{scope}</span>
              ))}
              {!provider.scopes?.length && !detail?.oauth_tokens?.[0]?.scope && <span className="text-[12px] text-[var(--text-muted)]">No scopes recorded.</span>}
            </div>
          </DrawerSection>
          <DrawerSection title="Recent Health Checks">
            <CompactList rows={detail?.health_checks || []} primary="status" secondary="error_message" time="checked_at" empty="No health checks yet." />
          </DrawerSection>
          <DrawerSection title="Recent Events">
            <CompactList rows={detail?.events || []} primary="event_type" secondary="message" time="created_at" empty="No recent events." />
          </DrawerSection>
          {isSuperadmin && (
            <DrawerSection title="Danger Zone">
              <button onClick={onDisconnect} className="w-full px-3 py-2 rounded-lg border border-[var(--solar-red)]/40 text-[var(--solar-red)] text-[11px] font-bold hover:bg-[var(--solar-red)]/10">
                Disconnect
              </button>
            </DrawerSection>
          )}
        </>
      )}
    </div>
  </aside>
);

const DrawerSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-app)] p-3">
    <h3 className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-3">{title}</h3>
    {children}
  </section>
);

const DetailLine: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex items-start justify-between gap-3 py-1.5 text-[12px] border-b border-[var(--border-subtle)] last:border-b-0">
    <span className="text-[var(--text-muted)]">{label}</span>
    <span className="font-mono text-right text-[var(--text-main)] break-all">{value}</span>
  </div>
);

const CompactList: React.FC<{ rows: any[]; primary: string; secondary: string; time: string; empty: string }> = ({ rows, primary, secondary, time, empty }) => (
  <div className="flex flex-col gap-2">
    {rows.map((row, idx) => (
      <div key={row.id || idx} className="text-[12px] border-b border-[var(--border-subtle)] pb-2 last:border-b-0">
        <div className="flex items-center justify-between gap-2">
          <Badge value={row[primary]} />
          <span className="text-[10px] text-[var(--text-muted)]">{relativeTime(row[time])}</span>
        </div>
        <div className="mt-1 text-[var(--text-muted)]">{row[secondary] || row.message || 'ok'}</div>
      </div>
    ))}
    {rows.length === 0 && <div className="text-[12px] text-[var(--text-muted)]">{empty}</div>}
  </div>
);

const FilterInput: React.FC<{ value: string; onChange: (value: string) => void; placeholder: string }> = ({ value, onChange, placeholder }) => (
  <label className="inline-flex items-center gap-2 px-2 py-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-app)] text-[11px]">
    <Search size={12} className="text-[var(--text-muted)]" />
    <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="bg-transparent outline-none w-28 text-[var(--text-main)] placeholder:text-[var(--text-muted)]" />
  </label>
);

const EmptyRow: React.FC<{ cols: number; label: string }> = ({ cols, label }) => (
  <tr><td colSpan={cols} className="px-4 py-8 text-center text-[12px] text-[var(--text-muted)]">{label}</td></tr>
);

const LoadingBlock: React.FC = () => (
  <div className="p-4 text-[12px] text-[var(--text-muted)] flex items-center gap-2">
    <Loader2 size={14} className="animate-spin text-[var(--solar-cyan)]" />
    Loading…
  </div>
);

function oauthStatus(expiresAt: unknown) {
  if (!expiresAt) return 'connected';
  const numeric = Number(expiresAt);
  const date = Number.isFinite(numeric) ? new Date(numeric * 1000) : new Date(String(expiresAt));
  const diff = date.getTime() - Date.now();
  if (diff < 0) return 'expired';
  if (diff < 7 * 24 * 60 * 60 * 1000) return 'expiring_soon';
  return 'connected';
}

function startOauth(provider: string) {
  const normalized = normalizeUiProvider(provider);
  if (normalized === 'github') {
    window.location.href = '/api/oauth/github/start?return_to=' + encodeURIComponent('/dashboard/integrations');
  } else if (normalized === 'google_drive' || normalized === 'google_gmail') {
    window.location.href = '/api/oauth/google/start?return_to=' + encodeURIComponent('/dashboard/integrations') + '&connect=drive';
  }
}

function normalizeUiProvider(provider: string) {
  if (provider === 'gdrive' || provider === 'google') return 'google_drive';
  return provider;
}

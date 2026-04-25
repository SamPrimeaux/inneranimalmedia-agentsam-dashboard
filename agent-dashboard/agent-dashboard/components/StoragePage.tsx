/**
 * Storage admin — tenant-scoped via session cookies on all API calls (credentials: same-origin).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  HardDrive,
  BarChart3,
  Boxes,
  Settings2,
  Loader2,
  Copy,
  Plus,
  Database,
  Cloud,
  Shield,
  AlertCircle,
  RefreshCw,
  KeyRound,
  Server,
  History,
} from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

type NavKey = 'files' | 'analytics' | 'vectors' | 's3';
type FilesTab = 'buckets' | 'settings' | 'policies';

const CHART_BUCKET_COLORS = [
  'var(--solar-cyan)',
  'var(--solar-blue)',
  'var(--solar-violet)',
  'var(--solar-magenta)',
  'var(--solar-green)',
  'var(--solar-yellow)',
  'var(--solar-orange)',
];

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '0 B';
  if (n < 1024) return `${Math.round(n)} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

const fetchJson = async <T,>(url: string, init?: RequestInit): Promise<{ ok: boolean; data: T | null; status: number }> => {
  try {
    const r = await fetch(url, { credentials: 'same-origin', ...init });
    const ct = r.headers.get('content-type');
    const data =
      ct?.includes('application/json') ? ((await r.json()) as T) : null;
    return { ok: r.ok, data, status: r.status };
  } catch {
    return { ok: false, data: null, status: 0 };
  }
};

function StorageAnalyticsCharts({ analytics }: { analytics: Record<string, unknown> }) {
  const byBucket = useMemo(() => {
    const raw = analytics.by_bucket;
    if (!Array.isArray(raw)) return [];
    return raw.map((row, i) => {
      const r = row as Record<string, unknown>;
      const name = String(r.bucket ?? r.name ?? r.binding ?? `bucket_${i}`);
      const object_count = Number(r.object_count ?? r.count ?? 0) || 0;
      const total_bytes = Number(r.total_bytes ?? r.bytes ?? 0) || 0;
      return { name, object_count, total_bytes };
    });
  }, [analytics]);

  const summary = analytics.summary as { object_count?: number; size_bytes?: number } | undefined;
  const total_objects =
    Number(analytics.total_objects ?? summary?.object_count ?? 0) ||
    byBucket.reduce((s, x) => s + x.object_count, 0);
  const total_bytes =
    Number(analytics.total_bytes ?? summary?.size_bytes ?? 0) ||
    byBucket.reduce((s, x) => s + x.total_bytes, 0);

  const pieData = byBucket.map((b) => ({ name: b.name, value: b.total_bytes }));
  const barData = byBucket.map((b) => ({ name: b.name, objects: b.object_count }));

  const tipStyle = {
    background: 'var(--bg-panel)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 8,
    fontSize: 11,
    color: 'var(--text-main)',
  };

  return (
    <div className="space-y-8 max-w-5xl">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Total objects</p>
          <p className="text-[22px] font-semibold text-[var(--text-heading)] mt-1 tabular-nums">
            {total_objects.toLocaleString()}
          </p>
        </div>
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Total size</p>
          <p className="text-[22px] font-semibold text-[var(--text-heading)] mt-1 tabular-nums">
            {formatBytes(total_bytes)}
          </p>
        </div>
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Buckets</p>
          <p className="text-[22px] font-semibold text-[var(--text-heading)] mt-1 tabular-nums">
            {byBucket.length.toLocaleString()}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4 min-h-[280px]">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-3">
            Storage by bucket (size)
          </h3>
          {pieData.length === 0 ? (
            <p className="text-[12px] text-[var(--text-muted)]">No bucket breakdown.</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={56}
                  outerRadius={88}
                  paddingAngle={2}
                >
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={CHART_BUCKET_COLORS[i % CHART_BUCKET_COLORS.length]} stroke="var(--border-subtle)" />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={tipStyle}
                  formatter={(value: number | string) => formatBytes(Number(value))}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4 min-h-[280px]">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-3">
            Objects per bucket
          </h3>
          {barData.length === 0 ? (
            <p className="text-[12px] text-[var(--text-muted)]">No bucket breakdown.</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={barData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                <XAxis
                  dataKey="name"
                  tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
                  interval={0}
                  angle={-24}
                  textAnchor="end"
                  height={56}
                />
                <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} width={40} />
                <Tooltip contentStyle={tipStyle} />
                <Bar dataKey="objects" fill="var(--solar-cyan)" radius={[4, 4, 0, 0]} stroke="var(--border-subtle)" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}

export const StoragePage: React.FC = () => {
  const [nav, setNav] = useState<NavKey>('files');
  const [filesTab, setFilesTab] = useState<FilesTab>('buckets');

  const [bucketsLoading, setBucketsLoading] = useState(false);
  const [buckets, setBuckets] = useState<Array<Record<string, unknown>>>([]);

  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analytics, setAnalytics] = useState<Record<string, unknown> | null>(null);

  const [vectorsLoading, setVectorsLoading] = useState(false);
  const [vectors, setVectors] = useState<Record<string, unknown> | null>(null);

  const [settingsSaving, setSettingsSaving] = useState(false);
  const [imageTransform, setImageTransform] = useState(true);
  const [maxFileMb, setMaxFileMb] = useState(25);

  const [policiesLoading, setPoliciesLoading] = useState(false);
  const [objectPolicies, setObjectPolicies] = useState<unknown[]>([]);
  const [bucketPolicies, setBucketPolicies] = useState<unknown[]>([]);

  const [s3Loading, setS3Loading] = useState(false);
  const [s3Endpoint, setS3Endpoint] = useState('');
  const [s3Region, setS3Region] = useState('');
  const [accessKeys, setAccessKeys] = useState<Array<Record<string, unknown>>>([]);
  const [hyperdriveSnippet, setHyperdriveSnippet] = useState('');
  const [newKeySecret, setNewKeySecret] = useState<string | null>(null);
  const [creatingKey, setCreatingKey] = useState(false);

  const [auditLoading, setAuditLoading] = useState(false);
  const [auditRows, setAuditRows] = useState<Array<Record<string, unknown>>>([]);

  const loadWorkspaceAudit = useCallback(async () => {
    const wid =
      typeof window !== 'undefined'
        ? (window as unknown as { __IAM_WORKSPACE_ID__?: string }).__IAM_WORKSPACE_ID__?.trim()
        : '';
    if (!wid || wid === 'global') {
      setAuditRows([]);
      return;
    }
    setAuditLoading(true);
    const { ok, data } = await fetchJson<{ events?: unknown[] }>(
      `/api/workspaces/${encodeURIComponent(wid)}/audit`,
    );
    setAuditLoading(false);
    const ev =
      ok && data && Array.isArray(data.events) ? data.events : [];
    setAuditRows(ev as Array<Record<string, unknown>>);
  }, []);

  const loadBuckets = useCallback(async () => {
    setBucketsLoading(true);
    const { ok, data } = await fetchJson<{ buckets?: unknown[] } | unknown[]>('/api/storage/buckets');
    setBucketsLoading(false);
    if (!ok || !data) {
      setBuckets([]);
      return;
    }
    if (Array.isArray(data)) {
      setBuckets(data as Array<Record<string, unknown>>);
      return;
    }
    const b = (data as { buckets?: unknown[] }).buckets;
    setBuckets(Array.isArray(b) ? (b as Array<Record<string, unknown>>) : []);
  }, []);

  const loadAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    const { ok, data } = await fetchJson<Record<string, unknown>>('/api/storage/analytics');
    setAnalyticsLoading(false);
    setAnalytics(ok && data ? data : null);
  }, []);

  const loadVectors = useCallback(async () => {
    setVectorsLoading(true);
    const { ok, data } = await fetchJson<Record<string, unknown>>('/api/storage/vectors');
    setVectorsLoading(false);
    setVectors(ok && data ? data : null);
  }, []);

  const loadPolicies = useCallback(async () => {
    setPoliciesLoading(true);
    const { ok, data } = await fetchJson<{
      policies?: unknown[];
      storage?: { objects?: unknown[]; buckets?: unknown[] };
      objectPolicies?: unknown[];
      bucketPolicies?: unknown[];
    }>('/api/storage/policies');
    setPoliciesLoading(false);
    if (!ok || !data) {
      setObjectPolicies([]);
      setBucketPolicies([]);
      return;
    }
    if (Array.isArray(data.policies)) {
      setObjectPolicies(data.policies);
      setBucketPolicies([]);
      return;
    }
    const o =
      data.storage?.objects ??
      data.objectPolicies ??
      ([] as unknown[]);
    const b =
      data.storage?.buckets ??
      data.bucketPolicies ??
      ([] as unknown[]);
    setObjectPolicies(Array.isArray(o) ? o : []);
    setBucketPolicies(Array.isArray(b) ? b : []);
  }, []);

  const loadS3 = useCallback(async () => {
    setS3Loading(true);
    const { ok, data } = await fetchJson<{
      endpoint?: string;
      region?: string;
      accessKeys?: Array<Record<string, unknown>>;
      keys?: Array<Record<string, unknown>>;
      hyperdrive?: string;
      hyperdriveInfo?: string;
    }>('/api/storage/s3');
    setS3Loading(false);
    if (!ok || !data) {
      setS3Endpoint('');
      setS3Region('');
      setAccessKeys([]);
      setHyperdriveSnippet('');
      return;
    }
    setS3Endpoint(typeof data.endpoint === 'string' ? data.endpoint : '');
    setS3Region(typeof data.region === 'string' ? data.region : '');
    const keys = data.accessKeys ?? data.keys;
    setAccessKeys(Array.isArray(keys) ? keys : []);
    const hd = data.hyperdrive ?? data.hyperdriveInfo;
    setHyperdriveSnippet(typeof hd === 'string' ? hd : '');
  }, []);

  useEffect(() => {
    if (nav === 'files' && filesTab === 'buckets') void loadBuckets();
  }, [nav, filesTab, loadBuckets]);

  useEffect(() => {
    if (nav === 'analytics') void loadAnalytics();
  }, [nav, loadAnalytics]);

  useEffect(() => {
    if (nav === 'vectors') void loadVectors();
  }, [nav, loadVectors]);

  useEffect(() => {
    if (nav === 'files' && filesTab === 'policies') void loadPolicies();
  }, [nav, filesTab, loadPolicies]);

  useEffect(() => {
    if (nav === 's3') void loadS3();
  }, [nav, loadS3]);

  useEffect(() => {
    if (nav !== 's3') return;
    void loadWorkspaceAudit();
    const fn = () => void loadWorkspaceAudit();
    window.addEventListener('iam_workspace_id', fn);
    return () => window.removeEventListener('iam_workspace_id', fn);
  }, [nav, loadWorkspaceAudit]);

  const saveSettings = async () => {
    setSettingsSaving(true);
    await fetch('/api/storage/settings', {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageTransformEnabled: imageTransform,
        maxUploadMb: maxFileMb,
      }),
    });
    setSettingsSaving(false);
  };

  const copyText = (t: string) => {
    void navigator.clipboard?.writeText(t).catch(() => {});
  };

  const createAccessKey = async () => {
    setCreatingKey(true);
    setNewKeySecret(null);
    const r = await fetch('/api/storage/s3/keys', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = await r.json().catch(() => ({}));
    setCreatingKey(false);
    if (!r.ok) return;
    const secret =
      typeof data.secret === 'string'
        ? data.secret
        : typeof data.secretAccessKey === 'string'
          ? data.secretAccessKey
          : typeof data.rawSecret === 'string'
            ? data.rawSecret
            : null;
    if (secret) setNewKeySecret(secret);
    void loadS3();
  };

  const NavBtn: React.FC<{ k: NavKey; icon: React.ReactNode; label: string }> = ({ k, icon, label }) => (
    <button
      type="button"
      onClick={() => setNav(k)}
      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-[12px] font-medium transition-colors ${
        nav === k
          ? 'bg-[var(--bg-hover)] text-[var(--solar-cyan)] border border-[var(--border-subtle)]'
          : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)]'
      }`}
    >
      <span className="shrink-0 opacity-90">{icon}</span>
      {label}
    </button>
  );

  return (
    <div className="flex h-full min-h-0 bg-[var(--bg-app)] text-[var(--text-main)]">
      <aside className="w-52 shrink-0 border-r border-[var(--border-subtle)] bg-[var(--bg-panel)] p-3 flex flex-col gap-1">
        <div className="flex items-center gap-2 px-2 py-2 mb-2">
          <div className="w-9 h-9 rounded-lg bg-[var(--solar-cyan)]/15 flex items-center justify-center text-[var(--solar-cyan)]">
            <HardDrive size={20} strokeWidth={1.75} />
          </div>
          <div>
            <h1 className="text-[13px] font-bold text-[var(--text-heading)] leading-tight">Storage</h1>
            <p className="text-[10px] text-[var(--text-muted)]">Workspace scope</p>
          </div>
        </div>
        <NavBtn k="files" icon={<HardDrive size={16} />} label="Files" />
        <NavBtn k="analytics" icon={<BarChart3 size={16} />} label="Analytics" />
        <NavBtn k="vectors" icon={<Boxes size={16} />} label="Vectors" />
        <NavBtn k="s3" icon={<Cloud size={16} />} label="S3" />
      </aside>

      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {nav === 'files' && (
          <div className="flex flex-col h-full min-h-0">
            <div className="flex gap-1 px-4 pt-4 border-b border-[var(--border-subtle)] shrink-0">
              {(['buckets', 'settings', 'policies'] as FilesTab[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setFilesTab(t)}
                  className={`px-4 py-2 text-[11px] font-semibold uppercase tracking-wide border-b-2 -mb-px transition-colors ${
                    filesTab === t
                      ? 'border-[var(--solar-cyan)] text-[var(--solar-cyan)]'
                      : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-main)]'
                  }`}
                >
                  {t === 'buckets' ? 'Buckets' : t === 'settings' ? 'Settings' : 'Policies'}
                </button>
              ))}
            </div>

            <div className="flex-1 min-h-0 overflow-auto p-4 md:p-6">
              {filesTab === 'buckets' && (
                <div className="max-w-4xl">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-[14px] font-semibold text-[var(--text-heading)]">R2 buckets</h2>
                    <button
                      type="button"
                      onClick={() => void loadBuckets()}
                      className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
                    >
                      <RefreshCw size={14} />
                      Refresh
                    </button>
                  </div>
                  {bucketsLoading ? (
                    <div className="flex items-center gap-2 text-[var(--text-muted)] text-[13px]">
                      <Loader2 size={16} className="animate-spin" />
                      Loading buckets…
                    </div>
                  ) : buckets.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-panel)] p-10 text-center text-[13px] text-[var(--text-muted)]">
                      No buckets returned for this account. Confirm Worker routes <code className="text-[var(--text-main)]">GET /api/storage/buckets</code> are deployed.
                    </div>
                  ) : (
                    <div className="rounded-xl border border-[var(--border-subtle)] overflow-hidden bg-[var(--bg-panel)]">
                      <table className="w-full text-[12px]">
                        <thead className="bg-[var(--bg-hover)] text-[var(--text-muted)] text-left uppercase tracking-wider">
                          <tr>
                            <th className="px-4 py-2 font-semibold">Name</th>
                            <th className="px-4 py-2 font-semibold">Region / binding</th>
                            <th className="px-4 py-2 font-semibold">Created</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border-subtle)]">
                          {buckets.map((row, i) => (
                            <tr key={i} className="hover:bg-[var(--bg-hover)]/80">
                              <td className="px-4 py-2 font-mono text-[var(--text-main)]">
                                {String(row.name ?? row.bucket ?? row.id ?? '—')}
                              </td>
                              <td className="px-4 py-2 text-[var(--text-muted)]">
                                {String(row.region ?? row.binding ?? row.location ?? '—')}
                              </td>
                              <td className="px-4 py-2 text-[var(--text-muted)]">
                                {String(row.created_at ?? row.createdAt ?? row.created ?? '—')}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {filesTab === 'settings' && (
                <div className="max-w-lg space-y-6">
                  <h2 className="text-[14px] font-semibold text-[var(--text-heading)] flex items-center gap-2">
                    <Settings2 size={16} />
                    Storage settings
                  </h2>
                  <label className="flex items-center justify-between gap-4 p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)]">
                    <span className="text-[13px] text-[var(--text-main)]">Image transforms</span>
                    <input
                      type="checkbox"
                      checked={imageTransform}
                      onChange={(e) => setImageTransform(e.target.checked)}
                      className="rounded border-[var(--border-subtle)]"
                    />
                  </label>
                  <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] space-y-2">
                    <label className="text-[12px] text-[var(--text-muted)] uppercase tracking-wide">Max upload size (MB)</label>
                    <input
                      type="number"
                      min={1}
                      max={5000}
                      value={maxFileMb}
                      onChange={(e) => setMaxFileMb(Number(e.target.value) || 1)}
                      className="w-full bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-[13px] font-mono"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => void saveSettings()}
                    disabled={settingsSaving}
                    className="px-5 py-2 rounded-lg bg-[var(--solar-cyan)] text-black text-[12px] font-bold uppercase tracking-wide disabled:opacity-50"
                  >
                    {settingsSaving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              )}

              {filesTab === 'policies' && (
                <div className="max-w-4xl space-y-8">
                  <h2 className="text-[14px] font-semibold text-[var(--text-heading)] flex items-center gap-2">
                    <Shield size={16} />
                    Policies
                  </h2>
                  {policiesLoading ? (
                    <div className="flex items-center gap-2 text-[var(--text-muted)]">
                      <Loader2 size={16} className="animate-spin" />
                      Loading…
                    </div>
                  ) : (
                    <>
                      <section>
                        <h3 className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-2">
                          Storage policies (D1)
                        </h3>
                        {objectPolicies.length === 0 ? (
                          <div className="rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--bg-panel)] p-6 text-[12px] text-[var(--text-muted)]">
                            No policies yet. POST to <code className="text-[var(--text-main)]">/api/storage/policies</code> or apply migration 234.
                          </div>
                        ) : (
                          <div className="rounded-xl border border-[var(--border-subtle)] overflow-hidden bg-[var(--bg-panel)]">
                            <table className="w-full text-[11px]">
                              <thead className="bg-[var(--bg-hover)] text-[var(--text-muted)] text-left">
                                <tr>
                                  <th className="px-3 py-2 font-semibold">Bucket</th>
                                  <th className="px-3 py-2 font-semibold">Effect</th>
                                  <th className="px-3 py-2 font-semibold">Actions</th>
                                  <th className="px-3 py-2 font-semibold">Resource</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-[var(--border-subtle)]">
                                {objectPolicies.map((row, i) => (
                                  <tr key={i}>
                                    <td className="px-3 py-2 font-mono">
                                      {String((row as { bucket_name?: string }).bucket_name ?? '—')}
                                    </td>
                                    <td className="px-3 py-2">{String((row as { effect?: string }).effect ?? '—')}</td>
                                    <td className="px-3 py-2 max-w-[200px] truncate" title={String((row as { actions?: string }).actions ?? '')}>
                                      {String((row as { actions?: string }).actions ?? '—')}
                                    </td>
                                    <td className="px-3 py-2 font-mono text-[var(--text-muted)]">
                                      {String((row as { resource?: string }).resource ?? '*')}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </section>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {nav === 'analytics' && (
          <div className="flex-1 overflow-auto p-4 md:p-6">
            <h2 className="text-[14px] font-semibold text-[var(--text-heading)] mb-4 flex items-center gap-2">
              <BarChart3 size={16} />
              Analytics
            </h2>
            {analyticsLoading ? (
              <div className="flex items-center gap-2 text-[var(--text-muted)]">
                <Loader2 size={16} className="animate-spin" />
                Loading analytics…
              </div>
            ) : !analytics || Object.keys(analytics).length === 0 ? (
              <div className="rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-panel)] p-10 text-[13px] text-[var(--text-muted)] max-w-xl">
                No analytics data yet. Connect <code className="text-[var(--text-main)]">GET /api/storage/analytics</code> or check back after traffic is recorded.
              </div>
            ) : (
              <StorageAnalyticsCharts analytics={analytics} />
            )}
          </div>
        )}

        {nav === 'vectors' && (
          <div className="flex-1 overflow-auto p-4 md:p-6 space-y-6">
            <h2 className="text-[14px] font-semibold text-[var(--text-heading)] flex items-center gap-2">
              <Boxes size={16} />
              Vectorize & AutoRAG
            </h2>
            <div className="grid gap-3 md:grid-cols-2 max-w-3xl">
              <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)]">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1">VECTORIZE</p>
                <p className="text-[12px] text-[var(--text-muted)]">
                  Index bindings are provisioned per workspace. Values load from <code className="text-[var(--solar-cyan)]">/api/storage/vectors</code>.
                </p>
              </div>
              <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)]">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1">AUTORAG_BUCKET</p>
                <p className="text-[12px] text-[var(--text-muted)]">
                  RAG object prefix is never hardcoded in the UI; the API returns your tenant bucket binding.
                </p>
              </div>
            </div>
            {vectorsLoading ? (
              <div className="flex items-center gap-2 text-[var(--text-muted)]">
                <Loader2 size={16} className="animate-spin" />
                Loading vectors…
              </div>
            ) : vectors && Object.keys(vectors).length > 0 ? (
              <pre className="text-[12px] font-mono p-4 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] overflow-auto max-w-4xl">
                {JSON.stringify(vectors, null, 2)}
              </pre>
            ) : (
              <div className="rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-panel)] p-8 text-[13px] text-[var(--text-muted)] max-w-xl">
                No vector metadata returned. Deploy vector bindings and the vectors API for live status.
              </div>
            )}
          </div>
        )}

        {nav === 's3' && (
          <div className="flex-1 overflow-auto p-4 md:p-6 space-y-8">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-[14px] font-semibold text-[var(--text-heading)] flex items-center gap-2">
                <Database size={16} />
                S3-compatible API
              </h2>
              <button
                type="button"
                onClick={() => void loadS3()}
                className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
              >
                <RefreshCw size={14} />
                Refresh
              </button>
            </div>

            {s3Loading ? (
              <div className="flex items-center gap-2 text-[var(--text-muted)]">
                <Loader2 size={16} className="animate-spin" />
                Loading S3 configuration…
              </div>
            ) : (
              <>
                <div className="grid gap-4 md:grid-cols-2 max-w-4xl">
                  <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] space-y-2">
                    <p className="text-[10px] font-bold uppercase text-[var(--text-muted)]">Endpoint</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-[11px] font-mono truncate text-[var(--solar-cyan)]">{s3Endpoint || '—'}</code>
                      {s3Endpoint && (
                        <button
                          type="button"
                          title="Copy"
                          onClick={() => copyText(s3Endpoint)}
                          className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)]"
                        >
                          <Copy size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] space-y-2">
                    <p className="text-[10px] font-bold uppercase text-[var(--text-muted)]">Region</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-[11px] font-mono text-[var(--text-main)]">{s3Region || 'auto'}</code>
                      {s3Region && (
                        <button
                          type="button"
                          onClick={() => copyText(s3Region)}
                          className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)]"
                        >
                          <Copy size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="max-w-4xl">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-[12px] font-semibold uppercase tracking-wide text-[var(--text-muted)] flex items-center gap-2">
                      <KeyRound size={14} />
                      Access keys
                    </h3>
                    <button
                      type="button"
                      onClick={() => void createAccessKey()}
                      disabled={creatingKey}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--bg-hover)] border border-[var(--border-subtle)] text-[11px] font-semibold hover:border-[var(--solar-cyan)] disabled:opacity-50"
                    >
                      <Plus size={14} />
                      New access key
                    </button>
                  </div>

                  {newKeySecret && (
                    <div className="mb-4 p-4 rounded-xl border border-[var(--solar-yellow)]/40 bg-[var(--solar-yellow)]/10 flex gap-3">
                      <AlertCircle className="shrink-0 text-[var(--solar-yellow)]" size={18} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[12px] font-semibold text-[var(--text-heading)] mb-1">Secret (shown once)</p>
                        <p className="text-[11px] font-mono break-all text-[var(--text-main)] mb-2">{newKeySecret}</p>
                        <button
                          type="button"
                          onClick={() => copyText(newKeySecret)}
                          className="text-[11px] text-[var(--solar-cyan)] font-semibold"
                        >
                          Copy to clipboard
                        </button>
                      </div>
                    </div>
                  )}

                  {accessKeys.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-panel)] p-8 text-[12px] text-[var(--text-muted)]">
                      No access keys. Create one to receive an access key id; the secret appears only at creation time.
                    </div>
                  ) : (
                    <div className="rounded-xl border border-[var(--border-subtle)] overflow-hidden bg-[var(--bg-panel)]">
                      <table className="w-full text-[12px]">
                        <thead className="bg-[var(--bg-hover)] text-[var(--text-muted)] text-left uppercase tracking-wider">
                          <tr>
                            <th className="px-4 py-2 font-semibold">Key ID</th>
                            <th className="px-4 py-2 font-semibold">Created</th>
                            <th className="px-4 py-2 font-semibold">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border-subtle)]">
                          {accessKeys.map((row, i) => (
                            <tr key={i}>
                              <td className="px-4 py-2 font-mono">
                                {String(row.accessKeyId ?? row.id ?? row.key_id ?? '—')}
                              </td>
                              <td className="px-4 py-2 text-[var(--text-muted)]">
                                {String(row.created_at ?? row.createdAt ?? row.created ?? '—')}
                              </td>
                              <td className="px-4 py-2">{String(row.status ?? 'active')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="max-w-4xl p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] flex gap-3">
                  <Server className="shrink-0 text-[var(--solar-violet)]" size={20} />
                  <div>
                    <p className="text-[12px] font-semibold text-[var(--text-heading)] mb-1">Hyperdrive</p>
                    <p className="text-[12px] text-[var(--text-muted)] leading-relaxed">
                      {hyperdriveSnippet ||
                        'Hyperdrive connection strings for Postgres or regional buckets appear here when returned by the Worker (e.g. HYPERDRIVE binding).'}
                    </p>
                  </div>
                </div>

                <div className="max-w-4xl space-y-3 pt-6 border-t border-[var(--border-subtle)]">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <h3 className="text-[12px] font-semibold uppercase tracking-wide text-[var(--text-muted)] flex items-center gap-2">
                      <History size={14} />
                      Audit log
                    </h3>
                    <button
                      type="button"
                      onClick={() => void loadWorkspaceAudit()}
                      className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
                    >
                      <RefreshCw size={14} />
                      Refresh
                    </button>
                  </div>
                  {auditLoading ? (
                    <div className="flex items-center gap-2 text-[var(--text-muted)] text-[13px]">
                      <Loader2 size={16} className="animate-spin" />
                      Loading audit…
                    </div>
                  ) : auditRows.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-panel)] p-8 text-[12px] text-[var(--text-muted)]">
                      No audit events yet.
                    </div>
                  ) : (
                    <div className="rounded-xl border border-[var(--border-subtle)] overflow-hidden bg-[var(--bg-panel)]">
                      <table className="w-full text-[11px]">
                        <thead className="bg-[var(--bg-hover)] text-[var(--text-muted)] text-left uppercase tracking-wider">
                          <tr>
                            <th className="px-3 py-2 font-semibold">Time</th>
                            <th className="px-3 py-2 font-semibold">Actor</th>
                            <th className="px-3 py-2 font-semibold">Action</th>
                            <th className="px-3 py-2 font-semibold">Entity</th>
                            <th className="px-3 py-2 font-semibold">Severity</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border-subtle)]">
                          {auditRows.map((row, i) => {
                            const sev = String(row.severity ?? 'info').toLowerCase();
                            const sevClass =
                              sev === 'error'
                                ? 'text-red-400'
                                : sev === 'warn' || sev === 'warning'
                                  ? 'text-amber-400'
                                  : 'text-[var(--text-muted)]';
                            const ts = row.created_at;
                            const timeLabel =
                              ts == null
                                ? '—'
                                : typeof ts === 'number'
                                  ? new Date(ts < 1e12 ? ts * 1000 : ts).toLocaleString()
                                  : String(ts);
                            const actor =
                              (row.actor_email as string) ||
                              (row.actor_id as string) ||
                              '—';
                            const entity = `${String(row.entity_type ?? '')} ${String(row.entity_id ?? '')}`.trim() || '—';
                            return (
                              <tr key={String(row.id ?? i)} className="hover:bg-[var(--bg-hover)]/80">
                                <td className="px-3 py-2 font-mono text-[var(--text-muted)] whitespace-nowrap">
                                  {timeLabel}
                                </td>
                                <td className="px-3 py-2 max-w-[140px] truncate" title={actor}>
                                  {actor}
                                </td>
                                <td className="px-3 py-2">{String(row.action ?? '—')}</td>
                                <td className="px-3 py-2 max-w-[180px] truncate" title={entity}>
                                  {entity}
                                </td>
                                <td className={`px-3 py-2 font-medium ${sevClass}`}>{sev}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

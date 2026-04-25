import React, { useState, useEffect, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import { 
  Search, ExternalLink, Bot, Database, Box, Code2, Wrench,
  GitBranch, Network, Zap,
  ChevronRight, Settings2, Package,
  Cloud, BarChart2, BookOpen, Bell, Layers, Cpu, Shield, Palette
} from 'lucide-react';
import { ThemeSwitcher } from './ThemeSwitcher';

// ─── Types ────────────────────────────────────────────────────────────────────
interface MCP {
  id: string; tool_name: string; tool_category: string; description: string;
  enabled: number; requires_approval: number; mcp_service_url: string; input_schema?: string;
}
interface AIModel {
  id?: string;
  provider: string;
  model_key: string;
  display_name: string;
  is_active: number;
  supports_tools: number;
  supports_vision: number;
  size_class: string;
  show_in_picker?: number;
  picker_eligible?: number;
  picker_group?: string;
  input_rate_per_mtok?: number | null;
  output_rate_per_mtok?: number | null;
}

type LlmVaultRow = {
  id: string;
  key_name: string;
  masked: string;
  provider?: string;
  created_at?: string | number | null;
};

function initialsFromDisplayName(displayName: string): string {
  const t = displayName.trim();
  if (!t) return '?';
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return t.length >= 2 ? t.slice(0, 2).toUpperCase() : t[0].toUpperCase();
}

function formatPlanLabel(plan: string | null): string {
  if (plan == null || String(plan).trim() === '') return '—';
  const p = String(plan).trim().toLowerCase();
  return p.charAt(0).toUpperCase() + p.slice(1);
}

function formatVaultCreated(at: string | number | null | undefined): string {
  if (at == null || at === '') return '—';
  const n = typeof at === 'string' ? Number.parseInt(at, 10) : Number(at);
  if (Number.isFinite(n) && n > 0 && n < 1e12) {
    return new Date(n * 1000).toLocaleString();
  }
  const d = new Date(String(at));
  return Number.isFinite(d.getTime()) ? d.toLocaleString() : '—';
}
interface GitRepo {
  id: number; repo_full_name: string; repo_url: string; default_branch: string;
  cloudflare_worker_name: string; is_active: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const categoryIcon = (cat: string) => {
  const map: Record<string, { icon: React.ReactNode; color: string }> = {
    ai:        { icon: <Bot size={14} />,     color: 'text-[var(--solar-cyan)]' },
    storage:   { icon: <Database size={14} />, color: 'text-[var(--solar-blue)]' },
    platform:  { icon: <Cloud size={14} />,   color: 'text-[var(--solar-violet)]' },
    analytics: { icon: <BarChart2 size={14} />, color: 'text-[var(--solar-yellow)]' },
    ui:        { icon: <Box size={14} />,     color: 'text-[var(--solar-magenta)]' },
    code:      { icon: <Code2 size={14} />,   color: 'text-[var(--solar-green)]' },
    network:   { icon: <Network size={14} />, color: 'text-[var(--solar-blue)]' },
    docs:      { icon: <BookOpen size={14} />,color: 'text-[var(--solar-orange)]' },
    search:    { icon: <Search size={14} />,  color: 'text-[var(--solar-violet)]' },
  };
  const key = Object.keys(map).find(k => cat?.toLowerCase().includes(k));
  return key ? map[key] : { icon: <Wrench size={14} />, color: 'text-[var(--text-muted)]' };
};

const Toggle: React.FC<{ on: boolean; onChange: (v: boolean) => void }> = ({ on, onChange }) => (
  <button
    onClick={() => onChange(!on)}
    className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${on ? 'bg-[var(--solar-cyan)]' : 'bg-[var(--border-subtle)]'}`}
  >
    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-[var(--toggle-knob)] shadow transition-transform ${on ? 'translate-x-4' : 'translate-x-0.5'}`} />
  </button>
);

const StatusDot: React.FC<{ on: boolean }> = ({ on }) => (
  <span className={`inline-block w-2 h-2 rounded-full ${on ? 'bg-[var(--solar-green)]' : 'bg-[var(--border-subtle)]'}`} />
);

// ─── Main Component ──────────────────────────────────────────────────────────
interface SettingsPanelProps {
  onClose: () => void;
  onFileSelect?: (file: { name: string; content: string }) => void;
  /** Default workspace from /api/settings/workspaces — scopes cms_themes + active theme. */
  workspaceId?: string | null;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ onClose, onFileSelect, workspaceId }) => {
  const [activeSection, setActiveSection] = useState('General');
  const [search, setSearch] = useState('');
  const [mcps, setMcps] = useState<MCP[]>([]);
  const [models, setModels] = useState<AIModel[]>([]);
  const [repos, setRepos] = useState<GitRepo[]>([]);
  const [mcpToggles, setMcpToggles] = useState<Record<string, boolean>>({});
  const [expandedMcp, setExpandedMcp] = useState<string | null>(null);
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [defaultModelKey, setDefaultModelKey] = useState<string | null>(null);
  const [llmKeys, setLlmKeys] = useState<LlmVaultRow[]>([]);
  const [llmBusy, setLlmBusy] = useState<string | null>(null);
  const [profileDisplayName, setProfileDisplayName] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [profilePlan, setProfilePlan] = useState<string | null>(null);
  const [workerBaseUrl, setWorkerBaseUrl] = useState('');
  const [mcpModalOpen, setMcpModalOpen] = useState(false);
  const [mcpModalToolName, setMcpModalToolName] = useState('');
  const [mcpModalText, setMcpModalText] = useState('');
  const [mcpModalSaving, setMcpModalSaving] = useState(false);
  const [mcpModalError, setMcpModalError] = useState<string | null>(null);
  const [vaultProvider, setVaultProvider] = useState<'OPENAI_API_KEY' | 'ANTHROPIC_API_KEY' | 'GEMINI_API_KEY'>(
    'OPENAI_API_KEY',
  );
  const [vaultKeyValue, setVaultKeyValue] = useState('');

  const refreshLlmKeys = useCallback(() => {
    fetch('/api/vault/llm-keys', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((d: { keys?: LlmVaultRow[] }) => setLlmKeys(Array.isArray(d.keys) ? d.keys : []))
      .catch(() => setLlmKeys([]));
  }, []);

  // Worker routes: /api/mcp/tools, /api/ai/models, /api/integrations/github/repos
  useEffect(() => {
    const opt = { credentials: 'same-origin' as const };

    fetch('/api/settings/profile', opt)
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (d: {
          display_name?: string;
          email?: string;
          plan?: string | null;
          worker_base_url?: string;
          flat?: { display_name?: string; primary_email?: string };
        } | null) => {
          if (!d || typeof d !== 'object') return;
          const email = String(d.email ?? d.flat?.primary_email ?? '').trim();
          const dn = String(d.display_name ?? d.flat?.display_name ?? '').trim();
          const planRaw =
            d.plan != null && String(d.plan).trim() !== '' ? String(d.plan).trim().toLowerCase() : null;
          setProfileEmail(email);
          setProfileDisplayName(dn || (email.includes('@') ? email.split('@')[0] : email) || '');
          setProfilePlan(planRaw);
          setWorkerBaseUrl(typeof d.worker_base_url === 'string' ? d.worker_base_url.trim() : '');
        },
      )
      .catch(() => {
        setProfileEmail('');
        setProfileDisplayName('');
        setProfilePlan(null);
        setWorkerBaseUrl('');
      });

    fetch('/api/mcp/tools', opt)
      .then(r => r.json())
      .then((d: { tools?: Array<{ tool_name: string; description?: string; category?: string }> }) => {
        const rows = Array.isArray(d.tools) ? d.tools : [];
        const mapped: MCP[] = rows.map(t => ({
          id: t.tool_name,
          tool_name: t.tool_name,
          tool_category: t.category || 'general',
          description: t.description || '',
          enabled: 1,
          requires_approval: 0,
          mcp_service_url: 'https://mcp.inneranimalmedia.com/mcp',
          input_schema: '{}',
        }));
        setMcps(mapped);
        const toggles: Record<string, boolean> = {};
        mapped.forEach(m => { toggles[m.id] = !!m.enabled; });
        setMcpToggles(toggles);
      })
      .catch(() => setMcps([]));

    fetch('/api/ai/models', opt)
      .then(r => r.json())
      .then((d: { models?: AIModel[] }) => {
        const rows = Array.isArray(d.models) ? d.models : [];
        setModels(
          rows.map(m => ({
            id: typeof (m as AIModel).id === 'string' ? (m as AIModel).id : undefined,
            provider: String((m as AIModel).provider || ''),
            model_key: String((m as AIModel).model_key || ''),
            display_name: String((m as AIModel).display_name || (m as AIModel).model_key || ''),
            is_active: Number((m as AIModel).is_active) ? 1 : 0,
            supports_tools: Number((m as AIModel).supports_tools) ? 1 : 0,
            supports_vision: Number((m as AIModel).supports_vision) ? 1 : 0,
            size_class: String((m as AIModel).size_class || ''),
            show_in_picker: Number((m as AIModel).show_in_picker) ? 1 : 0,
            picker_eligible: Number((m as AIModel).picker_eligible) === 0 ? 0 : 1,
            picker_group: String((m as AIModel).picker_group || (m as AIModel).provider || ''),
            input_rate_per_mtok: (m as AIModel).input_rate_per_mtok != null ? Number((m as AIModel).input_rate_per_mtok) : null,
            output_rate_per_mtok: (m as AIModel).output_rate_per_mtok != null ? Number((m as AIModel).output_rate_per_mtok) : null,
          }))
        );
      })
      .catch(() => setModels([]));

    fetch('/api/settings/default-model', opt)
      .then((r) => r.json())
      .then((d: { default_model?: string | null }) => {
        setDefaultModelKey(typeof d.default_model === 'string' && d.default_model.trim() ? d.default_model.trim() : null);
      })
      .catch(() => setDefaultModelKey(null));

    refreshLlmKeys();

    fetch('/api/integrations/github/repos', opt)
      .then(r => r.json())
      .then((d: unknown) => {
        if (!Array.isArray(d)) {
          setRepos([]);
          return;
        }
        setRepos(
          d.map((r: Record<string, unknown>, i: number) => ({
            id: typeof r.id === 'number' ? r.id : i,
            repo_full_name: String(r.full_name || r.name || `repo_${i}`),
            repo_url: String(r.html_url || ''),
            default_branch: String(r.default_branch || 'main'),
            cloudflare_worker_name: '',
            is_active: 1,
          }))
        );
      })
      .catch(() => setRepos([]));
  }, []);


  const setModelPickerEnabled = async (modelKey: string, enabled: boolean) => {
    setLoading((p) => ({ ...p, [modelKey]: true }));
    try {
      const r = await fetch('/api/settings/model-preference', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_key: modelKey, enabled }),
      });
      if (!r.ok) throw new Error(await r.text());
      setModels((prev) =>
        prev.map((m) => (m.model_key === modelKey ? { ...m, show_in_picker: enabled ? 1 : 0 } : m)),
      );
    } catch {
      /* ignore */
    } finally {
      setLoading((p) => ({ ...p, [modelKey]: false }));
    }
  };

  const setDefaultModel = async (modelKey: string) => {
    setLoading((p) => ({ ...p, [`def_${modelKey}`]: true }));
    try {
      const r = await fetch('/api/settings/default-model', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_key: modelKey }),
      });
      if (r.ok) setDefaultModelKey(modelKey);
    } catch {
      /* ignore */
    } finally {
      setLoading((p) => ({ ...p, [`def_${modelKey}`]: false }));
    }
  };

  const removeLlmKey = async (id: string) => {
    setLlmBusy(id);
    try {
      await fetch(`/api/vault/llm-keys/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      refreshLlmKeys();
    } catch {
      /* ignore */
    } finally {
      setLlmBusy(null);
    }
  };

  const saveVaultKeyFromSecurity = async () => {
    const value = vaultKeyValue.trim();
    if (!value) return;
    setLlmBusy(vaultProvider);
    try {
      const r = await fetch('/api/vault/store', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key_name: vaultProvider, value }),
      });
      if (r.ok) {
        setVaultKeyValue('');
        refreshLlmKeys();
      }
    } catch {
      /* ignore */
    } finally {
      setLlmBusy(null);
    }
  };

  const toggleMcp = async (id: string, val: boolean) => {
    setMcpToggles(p => ({ ...p, [id]: val }));
    setLoading(p => ({ ...p, [id]: true }));
    // No public PATCH for mcp_registered_tools yet; local UI state only.
    setLoading(p => ({ ...p, [id]: false }));
  };

  const openMcpConfigModal = async (toolName: string) => {
    setMcpModalError(null);
    setMcpModalToolName(toolName);
    try {
      const r = await fetch(`/api/mcp/tools/${encodeURIComponent(toolName)}`, { credentials: 'same-origin' });
      if (!r.ok) {
        setMcpModalError(`Could not load tool (${r.status})`);
        return;
      }
      const row = await r.json();
      setMcpModalText(JSON.stringify(row, null, 2));
      setMcpModalOpen(true);
    } catch {
      setMcpModalError('Network error loading tool config');
    }
  };

  const saveMcpConfigModal = async () => {
    if (!mcpModalToolName) return;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(mcpModalText || '{}') as Record<string, unknown>;
    } catch {
      setMcpModalError('Invalid JSON');
      return;
    }
    setMcpModalSaving(true);
    setMcpModalError(null);
    try {
      const body: Record<string, unknown> = {};
      for (const k of [
        'tool_category',
        'mcp_service_url',
        'description',
        'input_schema',
        'requires_approval',
        'enabled',
      ] as const) {
        if (k in parsed) body[k] = parsed[k] as unknown;
      }
      const r = await fetch(`/api/mcp/tools/${encodeURIComponent(mcpModalToolName)}/config`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        setMcpModalError(await r.text());
        return;
      }
      const fresh = await fetch(`/api/mcp/tools/${encodeURIComponent(mcpModalToolName)}`, {
        credentials: 'same-origin',
      }).then((x) => x.json());
      setMcpModalText(JSON.stringify(fresh, null, 2));
      setMcpModalOpen(false);
    } catch (e) {
      setMcpModalError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setMcpModalSaving(false);
    }
  };

  const menu = [
    { id: 'General',      icon: <Settings2 size={14} /> },
    { id: 'AI Models',    icon: <Cpu size={14} /> },
    { id: 'Tools & MCP',  icon: <Layers size={14} /> },
    { id: 'GitHub',       icon: <GitBranch size={14} /> },
    { id: 'CI/CD',        icon: <Zap size={14} /> },
    { id: 'Network',      icon: <Network size={14} /> },
    { id: 'Themes',       icon: <Palette size={14} /> },
    { id: 'Storage',      icon: <Database size={14} /> },
    { id: 'Security',     icon: <Shield size={14} /> },
    { id: 'Notifications',icon: <Bell size={14} /> },
    { id: 'Docs',         icon: <BookOpen size={14} /> },
  ];

  const filteredMenu = menu.filter(m => !search || m.id.toLowerCase().includes(search.toLowerCase()));

  // Group MCPs by category
  const mcpCategories = mcps.reduce<Record<string, MCP[]>>((acc, mcp) => {
    const cat = mcp.tool_category || 'other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(mcp);
    return acc;
  }, {} as Record<string, MCP[]>);

  return (
    <div className="flex flex-col h-full bg-[var(--bg-panel)] text-[var(--text-main)] overflow-hidden">
      {/* ── Header ── */}
      <div className="h-10 flex items-center justify-between px-4 border-b border-[var(--border-subtle)] bg-[var(--bg-app)] shrink-0">
        <span className="font-semibold text-[12px] tracking-widest uppercase text-[var(--text-heading)]">Settings</span>
        <button onClick={onClose} className="p-1.5 hover:bg-[var(--bg-hover)] rounded transition-colors text-[var(--text-muted)] hover:text-[var(--text-heading)] text-[11px] uppercase tracking-wider">
          Close
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Left Nav ── */}
        <div className="w-44 shrink-0 border-r border-[var(--border-subtle)] flex flex-col overflow-hidden">
          {/* User pill */}
          <div className="flex items-center gap-2.5 px-3 py-3 border-b border-[var(--border-subtle)]">
            <div className="w-7 h-7 rounded-full bg-[var(--solar-blue)] flex items-center justify-center text-[var(--toggle-knob)] font-bold text-[11px] shrink-0">
              {initialsFromDisplayName(profileDisplayName)}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[11px] font-semibold text-[var(--text-heading)] truncate">{profileDisplayName || profileEmail || '—'}</span>
              <span className="text-[10px] text-[var(--solar-cyan)]">{formatPlanLabel(profilePlan)}</span>
            </div>
          </div>

          {/* Search */}
          <div className="px-2 py-2 border-b border-[var(--border-subtle)]">
            <div className="flex items-center gap-1.5 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded-lg px-2 py-1.5">
              <Search size={10} className="text-[var(--text-muted)] shrink-0" />
              <input
                type="text" placeholder="Filter..." value={search}
                onChange={e => setSearch(e.target.value)}
                className="bg-transparent text-[11px] focus:outline-none text-[var(--text-main)] placeholder:text-[var(--text-muted)] w-full"
              />
            </div>
          </div>

          {/* Nav items */}
          <div className="flex-1 overflow-y-auto py-1 custom-scrollbar">
            {filteredMenu.map(item => (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-[12px] transition-colors text-left ${
                  activeSection === item.id
                    ? 'bg-[var(--solar-cyan)]/10 text-[var(--solar-cyan)] border-r-2 border-[var(--solar-cyan)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)]'
                }`}
              >
                <span className="shrink-0">{item.icon}</span>
                {item.id}
              </button>
            ))}
          </div>
        </div>

        {/* ── Right Content ── */}
        <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">

          {/* ── GENERAL ── */}
          {activeSection === 'General' && (
            <div className="flex flex-col gap-5 max-w-xl">
              <h2 className="text-[13px] font-bold text-[var(--text-heading)] uppercase tracking-widest">General</h2>
              {[
                { label: 'Sync layouts across windows', desc: 'All windows share the same panel layout', on: true },
                { label: 'Show Status Bar', desc: 'Show context bar at the bottom of the editor', on: true },
                { label: 'Auto-hide editor when empty', desc: 'Expand chat when all editors are closed', on: false },
                { label: 'Auto-inject code to Monaco', desc: 'Agent code blocks auto-open in editor', on: true },
              ].map(row => (
                <div key={row.label} className="flex items-center justify-between py-3 border-b border-[var(--border-subtle)]/50">
                  <div>
                    <div className="text-[12px] font-semibold text-[var(--text-main)]">{row.label}</div>
                    <div className="text-[11px] text-[var(--text-muted)] mt-0.5">{row.desc}</div>
                  </div>
                  <Toggle on={row.on} onChange={() => {}} />
                </div>
              ))}
              <div className="flex items-start justify-between py-3 border-b border-[var(--border-subtle)]/50">
                <div>
                  <div className="text-[12px] font-semibold text-[var(--text-main)]">Manage Account</div>
                  <div className="text-[11px] text-[var(--text-muted)] mt-0.5">Billing, seats, and usage limits</div>
                </div>
                <button className="flex items-center gap-1 px-2.5 py-1.5 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded-lg text-[11px] hover:border-[var(--solar-cyan)]/50 transition-colors">
                  Open <ExternalLink size={10} />
                </button>
              </div>
            </div>
          )}

          {/* ── AI MODELS ── */}
          {activeSection === 'AI Models' && (
            <div className="flex flex-col gap-5 max-w-2xl">
              <h2 className="text-[13px] font-bold text-[var(--text-heading)] uppercase tracking-widest mb-2">AI Models</h2>
              {models.length === 0 && <p className="text-[12px] text-[var(--text-muted)]">Loading models from DB...</p>}
              {['google', 'anthropic', 'cursor', 'openai'].map(provider => {
                const group = models.filter(m => m.provider === provider);
                if (!group.length) return null;
                return (
                  <div key={provider}>
                    <div className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-2 px-1">{provider}</div>
                    <div className="flex flex-col gap-1">
                      {group.map(m => (
                        <div key={m.model_key} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded-xl hover:border-[var(--solar-cyan)]/30 transition-colors">
                          <div className="flex items-start gap-3 min-w-0">
                            <button
                              type="button"
                              title={m.show_in_picker ? 'Shown in Agent picker — click to hide' : 'Hidden from picker — click to show'}
                              disabled={!!loading[m.model_key]}
                              onClick={() => void setModelPickerEnabled(m.model_key, !m.show_in_picker)}
                              className="mt-0.5 shrink-0 disabled:opacity-40"
                            >
                              <span
                                className={`inline-block h-2.5 w-2.5 rounded-full ${
                                  m.show_in_picker ? 'bg-[var(--solar-green)]' : 'bg-[var(--border-subtle)]'
                                }`}
                              />
                            </button>
                            <div className="min-w-0">
                              <div className="text-[12px] font-semibold text-[var(--text-main)]">{m.display_name}</div>
                              <div className="text-[10px] text-[var(--text-muted)] font-sans truncate">{m.model_key}</div>
                              <div className="text-[10px] text-[var(--text-muted)] mt-0.5 space-x-2">
                                {m.picker_group ? <span>Picker group: {m.picker_group}</span> : null}
                                {m.picker_eligible === 0 ? (
                                  <span className="text-[var(--solar-yellow)]">Not picker-eligible</span>
                                ) : null}
                                {m.input_rate_per_mtok != null && m.output_rate_per_mtok != null ? (
                                  <span>
                                    ${m.input_rate_per_mtok.toFixed(2)} / ${m.output_rate_per_mtok.toFixed(2)} per MTok (in / out)
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-[10px] shrink-0">
                            {m.supports_tools ? <span className="px-1.5 py-0.5 bg-[var(--solar-cyan)]/10 text-[var(--solar-cyan)] rounded font-bold">Tools</span> : null}
                            {m.supports_vision ? <span className="px-1.5 py-0.5 bg-[var(--solar-blue)]/10 text-[var(--solar-blue)] rounded font-bold">Vision</span> : null}
                            <span className="px-1.5 py-0.5 bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded text-[var(--text-muted)]">{m.size_class}</span>
                            <StatusDot on={!!m.is_active} />
                            {defaultModelKey === m.model_key ? (
                              <span className="px-2 py-0.5 rounded bg-[var(--solar-cyan)]/15 text-[var(--solar-cyan)] font-bold uppercase tracking-wide">Default</span>
                            ) : null}
                            <button
                              type="button"
                              disabled={!!loading[`def_${m.model_key}`]}
                              onClick={() => void setDefaultModel(m.model_key)}
                              className="px-2 py-1 rounded-lg border border-[var(--border-subtle)] text-[10px] font-semibold uppercase tracking-wide text-[var(--text-main)] hover:border-[var(--solar-cyan)]/50 hover:text-[var(--solar-cyan)] disabled:opacity-40"
                            >
                              Set as Default
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── TOOLS & MCP ── */}
          {activeSection === 'Tools & MCP' && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-[13px] font-bold text-[var(--text-heading)] uppercase tracking-widest">Tools & MCP</h2>
                <span className="text-[10px] text-[var(--text-muted)] font-mono">{mcps.length} registered</span>
              </div>
              {mcps.length === 0 && <p className="text-[12px] text-[var(--text-muted)]">Loading MCPs from DB...</p>}
              {(Object.entries(mcpCategories) as [string, MCP[]][]).map(([cat, tools]) => {
                const { icon, color } = categoryIcon(cat);
                return (
                  <div key={cat}>
                    <div className={`flex items-center gap-2 text-[10px] font-black uppercase tracking-widest mb-2 px-1 ${color}`}>
                      {icon} {cat} <span className="text-[var(--text-muted)] font-normal normal-case tracking-normal">({tools.length})</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      {tools.map(mcp => (
                        <div key={mcp.id} className="flex flex-col">
                          <div
                            className={`flex items-center justify-between p-3 bg-[var(--bg-app)] border rounded-xl transition-all cursor-pointer ${
                              expandedMcp === mcp.id ? 'border-[var(--solar-cyan)]/40 rounded-b-none' : 'border-[var(--border-subtle)] hover:border-[var(--solar-cyan)]/30'
                            }`}
                            onClick={() => setExpandedMcp(expandedMcp === mcp.id ? null : mcp.id)}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className={`w-7 h-7 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] flex items-center justify-center ${color} shrink-0`}>
                                {icon}
                              </div>
                              <div className="min-w-0">
                                <div className="text-[12px] font-semibold text-[var(--text-main)] truncate">{mcp.tool_name}</div>
                                <div className="text-[10px] text-[var(--text-muted)] truncate max-w-[200px]">{mcp.description}</div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2.5 shrink-0 ml-2">
                              {mcp.requires_approval ? (
                                <span className="text-[9px] px-1.5 py-0.5 bg-[var(--solar-yellow)]/10 text-[var(--solar-yellow)] rounded font-bold uppercase">Approval</span>
                              ) : null}
                              <div onClick={e => { e.stopPropagation(); }} className="">
                                <Toggle
                                  on={mcpToggles[mcp.id] ?? false}
                                  onChange={(v) => toggleMcp(mcp.id, v)}
                                />
                              </div>
                              <ChevronRight
                                size={13}
                                className={`text-[var(--text-muted)] transition-transform ${expandedMcp === mcp.id ? 'rotate-90' : ''}`}
                              />
                            </div>
                          </div>

                          {/* Expanded config row */}
                          {expandedMcp === mcp.id && (
                            <div className="bg-[var(--scene-bg)] border border-t-0 border-[var(--solar-cyan)]/40 rounded-b-xl p-4 flex flex-col gap-2.5 animate-in slide-in-from-top-2 duration-150">
                              <div className="grid grid-cols-2 gap-3 text-[11px]">
                                <div>
                                  <span className="text-[var(--text-muted)] block mb-0.5">Category</span>
                                  <span className="text-[var(--text-main)] font-mono">{mcp.tool_category}</span>
                                </div>
                                <div>
                                  <span className="text-[var(--text-muted)] block mb-0.5">Service URL</span>
                                  <span className="text-[var(--solar-cyan)] font-mono truncate block">{mcp.mcp_service_url}</span>
                                </div>
                                <div>
                                  <span className="text-[var(--text-muted)] block mb-0.5">Requires Approval</span>
                                  <span className={mcp.requires_approval ? 'text-[var(--solar-yellow)]' : 'text-[var(--solar-green)]'}>
                                    {mcp.requires_approval ? 'Yes' : 'No'}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-[var(--text-muted)] block mb-0.5">Status</span>
                                  <div className="flex items-center gap-1.5">
                                    <StatusDot on={!!mcpToggles[mcp.id]} />
                                    <span className={mcpToggles[mcp.id] ? 'text-[var(--solar-green)]' : 'text-[var(--text-muted)]'}>
                                      {mcpToggles[mcp.id] ? 'Enabled' : 'Disabled'}
                                    </span>
                                  </div>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => void openMcpConfigModal(mcp.tool_name)}
                                className="flex items-center gap-2 px-3 py-2 bg-[var(--bg-panel)] border border-[var(--border-subtle)] hover:border-[var(--solar-cyan)]/50 rounded-lg text-[11px] text-[var(--text-main)] hover:text-[var(--solar-cyan)] transition-colors mt-1 w-fit"
                              >
                                <Code2 size={12} /> Open Config in Monaco
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── GITHUB ── */}
          {activeSection === 'GitHub' && (
            <div className="flex flex-col gap-3">
              <h2 className="text-[13px] font-bold text-[var(--text-heading)] uppercase tracking-widest mb-2">GitHub Repositories</h2>
              {repos.length === 0 && <p className="text-[12px] text-[var(--text-muted)]">Loading repos from DB...</p>}
              {repos.map(r => (
                <div key={r.id} className="flex items-center justify-between p-3 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded-xl hover:border-[var(--solar-cyan)]/30 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-muted)] shrink-0">
                      <GitBranch size={13} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[12px] font-semibold text-[var(--text-main)] truncate">{r.repo_full_name}</div>
                      <div className="text-[10px] text-[var(--text-muted)] font-mono">branch: {r.default_branch} {r.cloudflare_worker_name ? `· worker: ${r.cloudflare_worker_name}` : ''}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusDot on={!!r.is_active} />
                    <a href={r.repo_url} target="_blank" rel="noreferrer" className="p-1.5 hover:bg-[var(--bg-hover)] rounded text-[var(--text-muted)] hover:text-[var(--solar-cyan)] transition-colors">
                      <ExternalLink size={12} />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── CI/CD ── */}
          {activeSection === 'CI/CD' && (
            <div className="flex flex-col gap-4 max-w-xl">
              <h2 className="text-[13px] font-bold text-[var(--text-heading)] uppercase tracking-widest">CI/CD Pipelines</h2>
              <p className="text-[12px] text-[var(--text-muted)]">Pipeline run logs are stored in <code className="font-mono text-[var(--solar-cyan)]">cidi_pipeline_runs</code>. Configure your build commands in the GitHub settings above.</p>
              {[
                { label: 'Auto-deploy on push to main', on: true },
                { label: 'Run tests before deploy', on: true },
                { label: 'Notify on failure', on: true },
                { label: 'Rollback on failed deploy', on: false },
              ].map(row => (
                <div key={row.label} className="flex items-center justify-between py-3 border-b border-[var(--border-subtle)]/50">
                  <div className="text-[12px] font-semibold text-[var(--text-main)]">{row.label}</div>
                  <Toggle on={row.on} onChange={() => {}} />
                </div>
              ))}
            </div>
          )}

          {/* ── NETWORK ── */}
          {activeSection === 'Network' && (
            <div className="flex flex-col gap-4 max-w-xl">
              <h2 className="text-[13px] font-bold text-[var(--text-heading)] uppercase tracking-widest">Network</h2>
              <p className="text-[11px] text-[var(--text-muted)]">
                Worker base URL is resolved from your bootstrap preferences, the{' '}
                <code className="font-mono text-[var(--solar-cyan)]">WORKER_BASE_URL</code> worker var, or the production site default.
              </p>
              {[
                { label: 'MCP Endpoint', val: 'https://mcp.inneranimalmedia.com/mcp', color: 'text-[var(--solar-cyan)]' },
                {
                  label: 'Worker Base URL',
                  val: workerBaseUrl || 'https://inneranimalmedia.com',
                  color: 'text-[var(--solar-blue)]',
                },
              ].map((row) => (
                <div key={row.label} className="flex flex-col gap-1 py-3 border-b border-[var(--border-subtle)]/50">
                  <span className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider">{row.label}</span>
                  <code className={`text-[12px] font-mono break-all ${row.color}`}>{row.val}</code>
                </div>
              ))}
            </div>
          )}

          {/* ── THEMES ── */}
          {activeSection === 'Themes' && (
            <div className="flex flex-col gap-4">
              <h2 className="text-[13px] font-bold text-[var(--text-heading)] uppercase tracking-widest">Workspace Themes</h2>
              <p className="text-[12px] text-[var(--text-muted)]">Select a theme to instantly update the Inner Animal Media dashboard. Theme variables are stored in <code className="font-mono text-[var(--solar-cyan)]">cms_themes</code> and applied live.</p>
              <ThemeSwitcher workspaceId={workspaceId} />
            </div>
          )}

          {/* ── STORAGE ── */}
          {activeSection === 'Storage' && (
            <div className="flex flex-col gap-3">
              <h2 className="text-[13px] font-bold text-[var(--text-heading)] uppercase tracking-widest mb-2">Storage (R2)</h2>
              {['cad', 'inneranimalmedia-assets', 'splineicons'].map(bucket => (
                <div key={bucket} className="flex items-center justify-between p-3 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-subtle)] flex items-center justify-center">
                      <Database size={13} className="text-[var(--solar-blue)]" />
                    </div>
                    <div>
                      <div className="text-[12px] font-mono text-[var(--text-main)]">{bucket}</div>
                      <div className="text-[10px] text-[var(--text-muted)]">R2 Bucket</div>
                    </div>
                  </div>
                  <StatusDot on={true} />
                </div>
              ))}
            </div>
          )}

          {activeSection === 'Security' && (
            <div className="flex flex-col gap-6 max-w-2xl">
              <h2 className="text-[13px] font-bold text-[var(--text-heading)] uppercase tracking-widest">Security &amp; vault</h2>

              <section className="space-y-3">
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Your API keys</h3>
                <p className="text-[11px] text-[var(--text-muted)]">
                  Keys are encrypted in the vault and scoped to your session. Removing a key revokes it for this account.
                </p>
                {llmKeys.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-app)] p-6 text-[12px] text-[var(--text-muted)]">
                    No keys stored yet.
                  </div>
                ) : (
                  <div className="rounded-xl border border-[var(--border-subtle)] overflow-hidden bg-[var(--bg-panel)]">
                    <table className="w-full text-[11px]">
                      <thead className="bg-[var(--bg-hover)] text-[var(--text-muted)] text-left">
                        <tr>
                          <th className="px-3 py-2 font-semibold">Provider</th>
                          <th className="px-3 py-2 font-semibold">Masked</th>
                          <th className="px-3 py-2 font-semibold">Added</th>
                          <th className="px-3 py-2 font-semibold w-24" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border-subtle)]">
                        {llmKeys.map((k) => (
                          <tr key={k.id}>
                            <td className="px-3 py-2 text-[var(--text-main)]">{k.provider || k.key_name}</td>
                            <td className="px-3 py-2 font-mono text-[var(--solar-cyan)]">{k.masked}</td>
                            <td className="px-3 py-2 text-[var(--text-muted)]">{formatVaultCreated(k.created_at)}</td>
                            <td className="px-3 py-2">
                              <button
                                type="button"
                                disabled={llmBusy === k.id}
                                onClick={() => void removeLlmKey(k.id)}
                                className="text-[10px] px-2 py-1 rounded border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-red-400 hover:border-red-400/40"
                              >
                                Remove
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section className="space-y-3 p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-app)]">
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Add key</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-1 text-[11px]">
                    <span className="text-[var(--text-muted)]">Provider</span>
                    <select
                      value={vaultProvider}
                      onChange={(e) =>
                        setVaultProvider(e.target.value as typeof vaultProvider)
                      }
                      className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-3 py-2 text-[12px] text-[var(--text-main)]"
                    >
                      <option value="OPENAI_API_KEY">OpenAI</option>
                      <option value="ANTHROPIC_API_KEY">Anthropic</option>
                      <option value="GEMINI_API_KEY">Gemini</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-[11px] sm:col-span-2">
                    <span className="text-[var(--text-muted)]">Key name (vault slot)</span>
                    <input
                      type="text"
                      readOnly
                      value={vaultProvider}
                      className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-3 py-2 text-[12px] font-mono text-[var(--text-muted)]"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-[11px] sm:col-span-2">
                    <span className="text-[var(--text-muted)]">API key</span>
                    <input
                      type="password"
                      autoComplete="off"
                      value={vaultKeyValue}
                      onChange={(e) => setVaultKeyValue(e.target.value)}
                      className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-3 py-2 text-[12px] text-[var(--text-main)]"
                    />
                  </label>
                </div>
                <button
                  type="button"
                  disabled={llmBusy === vaultProvider || !vaultKeyValue.trim()}
                  onClick={() => void saveVaultKeyFromSecurity()}
                  className="px-4 py-2 rounded-lg bg-[var(--solar-cyan)]/20 text-[11px] font-semibold text-[var(--solar-cyan)] border border-[var(--solar-cyan)]/30 hover:bg-[var(--solar-cyan)]/30 disabled:opacity-40"
                >
                  Save
                </button>
              </section>

              <section className="space-y-2 p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)]">
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Active sessions</h3>
                <div className="rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--bg-app)] p-8 text-center text-[12px] text-[var(--text-muted)]">
                  Session management coming soon.
                </div>
              </section>
            </div>
          )}

          {/* ── Other sections — placeholder ── */}
          {!['General','AI Models','Tools & MCP','GitHub','CI/CD','Network','Themes','Storage','Security'].includes(activeSection) && (
            <div className="flex flex-col items-center justify-center h-40 gap-3 text-[var(--text-muted)]">
              <Package size={28} className="opacity-30" />
              <p className="text-[12px]">{activeSection} settings coming soon.</p>
            </div>
          )}

        </div>
      </div>

      {mcpModalOpen ? (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4">
          <div className="flex flex-col w-full max-w-3xl max-h-[90vh] rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
              <span className="text-[12px] font-semibold text-[var(--text-heading)]">
                MCP tool config — <code className="font-mono text-[var(--solar-cyan)]">{mcpModalToolName}</code>
              </span>
              <button
                type="button"
                onClick={() => setMcpModalOpen(false)}
                className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-main)]"
              >
                Close
              </button>
            </div>
            <div className="flex-1 min-h-[280px]">
              <Editor
                height="360px"
                defaultLanguage="json"
                theme="vs-dark"
                value={mcpModalText}
                onChange={(v) => setMcpModalText(v || '')}
                options={{ minimap: { enabled: false }, wordWrap: 'on', scrollBeyondLastLine: false }}
              />
            </div>
            {mcpModalError ? (
              <div className="px-4 py-2 text-[11px] text-red-400 border-t border-[var(--border-subtle)]">{mcpModalError}</div>
            ) : null}
            <div className="flex justify-end gap-2 px-4 py-3 border-t border-[var(--border-subtle)] bg-[var(--bg-app)]">
              <button
                type="button"
                onClick={() => setMcpModalOpen(false)}
                className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={mcpModalSaving}
                onClick={() => void saveMcpConfigModal()}
                className="px-3 py-1.5 rounded-lg bg-[var(--solar-cyan)]/20 text-[11px] font-semibold text-[var(--solar-cyan)] border border-[var(--solar-cyan)]/30 disabled:opacity-40"
              >
                {mcpModalSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

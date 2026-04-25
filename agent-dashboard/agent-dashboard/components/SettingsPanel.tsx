import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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

type AgentsamUserPolicy = {
  workspace_id?: string;
  auto_run_mode: string;
  browser_protection: number;
  mcp_tools_protection: number;
  file_deletion_protection: number;
  external_file_protection: number;
  default_agent_location?: string | null;
  text_size?: string | null;
  auto_clear_chat: number;
  submit_with_mod_enter: number;
  max_tab_count: number;
  queue_messages_mode?: string | null;
  usage_summary_mode?: string | null;
  agent_autocomplete: number;
  web_search_enabled: number;
  auto_accept_web_search: number;
  web_fetch_enabled: number;
  hierarchical_ignore: number;
  ignore_symlinks: number;
  inline_diffs: number;
  jump_next_diff_on_accept: number;
  auto_format_on_agent_finish: number;
  legacy_terminal_tool: number;
  toolbar_on_selection: number;
  auto_parse_links: number;
  themed_diff_backgrounds: number;
  terminal_hint: number;
  terminal_preview_box: number;
  collapse_auto_run_commands: number;
  voice_submit_keyword?: string | null;
  commit_attribution: number;
  pr_attribution: number;
  settings_json?: string | null;
};

type AgentsSettingsResponse = {
  workspace_id: string;
  policy: AgentsamUserPolicy | null;
  allowlists: {
    commands: string[];
    domains: string[];
    mcp: Array<{ tool_key: string; notes?: string | null }>;
  };
};

type LlmVaultRow = {
  id: string;
  key_name: string;
  masked: string;
  provider?: string;
  created_at?: string | number | null;
};

type SettingsModelsResponse = {
  models: Array<{
    id: string;
    name: string;
    provider: string;
    is_active: number;
    show_in_picker: number;
    context_window?: number | null;
    cost_per_input_mtok?: number | null;
    cost_per_output_mtok?: number | null;
  }>;
  tiers: Array<Record<string, unknown>>;
  routing: Array<Record<string, unknown>>;
  workspace_id?: string;
};

type SettingsMcpResponse = {
  servers: Array<Record<string, unknown>>;
  tools: Array<Record<string, unknown> & { tool_name?: string; stats?: Record<string, unknown> | null }>;
};

function formatCompactNumber(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (n >= 1_000_000) return `${Math.round(n / 100_000) / 10}M`;
  if (n >= 1_000) return `${Math.round(n / 100) / 10}K`;
  return String(Math.round(n));
}

function formatUsdMaybe(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return `$${Number(n).toFixed(2)}`;
}

function relativeTime(input: string | number | null | undefined): string {
  if (input == null || input === '') return '—';
  const d = typeof input === 'number'
    ? new Date(input > 1e12 ? input : input * 1000)
    : new Date(String(input));
  const t = d.getTime();
  if (!Number.isFinite(t)) return '—';
  const s = Math.round((Date.now() - t) / 1000);
  const abs = Math.abs(s);
  const fmt = (n: number, unit: string) => `${n}${unit}${s >= 0 ? ' ago' : ''}`;
  if (abs < 60) return fmt(abs, 's');
  const m = Math.round(abs / 60);
  if (m < 60) return fmt(m, 'm');
  const h = Math.round(m / 60);
  if (h < 48) return fmt(h, 'h');
  const days = Math.round(h / 24);
  if (days < 14) return fmt(days, 'd');
  const weeks = Math.round(days / 7);
  return fmt(weeks, 'w');
}

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
  const navRef = useRef<HTMLDivElement>(null);
  const [navWidth, setNavWidth] = useState(() => {
    try {
      const v = localStorage.getItem('settings_nav_width');
      const n = v ? Number.parseInt(v, 10) : 220;
      return Number.isFinite(n) ? n : 220;
    } catch {
      return 220;
    }
  });
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth < 768 : false));
  const [mcps, setMcps] = useState<MCP[]>([]);
  const [toolBrowserFilter, setToolBrowserFilter] = useState('');
  const [toolBrowserExpanded, setToolBrowserExpanded] = useState<Record<string, boolean>>({});
  const [toolBrowserOutput, setToolBrowserOutput] = useState<Record<string, string>>({});
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
  const [vaultProvider, setVaultProvider] = useState<'OPENAI_API_KEY' | 'ANTHROPIC_API_KEY' | 'GEMINI_API_KEY'>(
    'OPENAI_API_KEY',
  );
  const [vaultKeyValue, setVaultKeyValue] = useState('');

  const [settingsModels, setSettingsModels] = useState<SettingsModelsResponse | null>(null);
  const [settingsMcp, setSettingsMcp] = useState<SettingsMcpResponse | null>(null);
  const [modelsTab, setModelsTab] = useState<'models' | 'routing'>('models');
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [mcpToggleError, setMcpToggleError] = useState<Record<string, string | null>>({});

  const [rulesSkillsTab, setRulesSkillsTab] = useState<'skills' | 'subagents' | 'commands' | 'rules'>('skills');
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [skillsError, setSkillsError] = useState<string | null>(null);
  const [skills, setSkills] = useState<any[]>([]);
  const [skillDrawerOpen, setSkillDrawerOpen] = useState(false);
  const [editingSkill, setEditingSkill] = useState<any | null>(null);
  const [skillDraft, setSkillDraft] = useState<any>({});

  const [subagentsLoading, setSubagentsLoading] = useState(false);
  const [subagentsError, setSubagentsError] = useState<string | null>(null);
  const [subagents, setSubagents] = useState<any[]>([]);
  const [subagentDrawerOpen, setSubagentDrawerOpen] = useState(false);
  const [subagentDraft, setSubagentDraft] = useState<any>({});

  const [commandsLoading2, setCommandsLoading2] = useState(false);
  const [commandsError2, setCommandsError2] = useState<string | null>(null);
  const [commands2, setCommands2] = useState<any[]>([]);
  const [expandedCommandId, setExpandedCommandId] = useState<string | null>(null);

  const [rulesLoading, setRulesLoading] = useState(false);
  const [rulesError, setRulesError] = useState<string | null>(null);
  const [rules, setRules] = useState<any[]>([]);
  const [ruleDrawerOpen, setRuleDrawerOpen] = useState(false);
  const [ruleDraft, setRuleDraft] = useState<any>({});

  const [workspaceLoading2, setWorkspaceLoading2] = useState(false);
  const [workspaceError2, setWorkspaceError2] = useState<string | null>(null);
  const [workspaceData, setWorkspaceData] = useState<any | null>(null);

  const [hooksLoading2, setHooksLoading2] = useState(false);
  const [hooksError2, setHooksError2] = useState<string | null>(null);
  const [hooksData, setHooksData] = useState<{ hooks: any[]; executions: any[] } | null>(null);
  const [newHookOpen, setNewHookOpen] = useState(false);
  const [newHookDraft, setNewHookDraft] = useState({ trigger: 'pre_tool_call', command: '', provider: 'system' });

  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [findings, setFindings] = useState<any[]>([]);

  const [usageLoading, setUsageLoading] = useState(false);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [usagePage, setUsagePage] = useState(1);
  const [usageProvider, setUsageProvider] = useState('');
  const [usageModel, setUsageModel] = useState('');
  const [usageData, setUsageData] = useState<any | null>(null);

  const [notifyLoading, setNotifyLoading] = useState(false);
  const [notifyError, setNotifyError] = useState<string | null>(null);
  const [notifyPrefs, setNotifyPrefs] = useState<Record<string, string>>({});
  const [notifyWebhookUrl, setNotifyWebhookUrl] = useState('');

  const [budgetMonthlyLimit, setBudgetMonthlyLimit] = useState<string>('');
  const [budgetHardStop, setBudgetHardStop] = useState(false);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const onNavDragStart = (e: React.MouseEvent) => {
    const startX = e.clientX;
    const startW = navWidth;
    const onMove = (ev: MouseEvent) => {
      const w = Math.max(60, Math.min(360, startW + ev.clientX - startX));
      setNavWidth(w);
      if (w > 80) localStorage.setItem('settings_nav_width', String(w));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const patchProfile = useCallback(async (updates: Array<{ setting_key: string; setting_value: string }>) => {
    const r = await fetch('/api/settings/profile', {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(typeof j.error === 'string' ? j.error : `Save failed (${r.status})`);
    return j;
  }, []);

  const loadSkills = useCallback(async () => {
    setSkillsLoading(true);
    setSkillsError(null);
    try {
      const r = await fetch('/api/settings/skills', { credentials: 'same-origin' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(typeof j.error === 'string' ? j.error : `Load failed (${r.status})`);
      setSkills(Array.isArray(j.skills) ? j.skills : []);
    } catch (e) {
      setSkillsError(e instanceof Error ? e.message : 'Failed to load skills');
      setSkills([]);
    } finally {
      setSkillsLoading(false);
    }
  }, []);

  const loadSubagents = useCallback(async () => {
    setSubagentsLoading(true);
    setSubagentsError(null);
    try {
      const r = await fetch('/api/settings/subagents', { credentials: 'same-origin' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(typeof j.error === 'string' ? j.error : `Load failed (${r.status})`);
      setSubagents(Array.isArray(j.subagents) ? j.subagents : []);
    } catch (e) {
      setSubagentsError(e instanceof Error ? e.message : 'Failed to load subagents');
      setSubagents([]);
    } finally {
      setSubagentsLoading(false);
    }
  }, []);

  const loadCommands2 = useCallback(async () => {
    setCommandsLoading2(true);
    setCommandsError2(null);
    try {
      const r = await fetch('/api/settings/commands', { credentials: 'same-origin' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(typeof j.error === 'string' ? j.error : `Load failed (${r.status})`);
      setCommands2(Array.isArray(j.commands) ? j.commands : []);
    } catch (e) {
      setCommandsError2(e instanceof Error ? e.message : 'Failed to load commands');
      setCommands2([]);
    } finally {
      setCommandsLoading2(false);
    }
  }, []);

  const loadRules = useCallback(async () => {
    setRulesLoading(true);
    setRulesError(null);
    try {
      const r = await fetch('/api/settings/rules', { credentials: 'same-origin' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(typeof j.error === 'string' ? j.error : `Load failed (${r.status})`);
      setRules(Array.isArray(j.rules) ? j.rules : []);
    } catch (e) {
      setRulesError(e instanceof Error ? e.message : 'Failed to load rules');
      setRules([]);
    } finally {
      setRulesLoading(false);
    }
  }, []);

  const loadWorkspace = useCallback(async () => {
    setWorkspaceLoading2(true);
    setWorkspaceError2(null);
    try {
      const r = await fetch('/api/settings/workspace', { credentials: 'same-origin' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(typeof j.error === 'string' ? j.error : `Load failed (${r.status})`);
      setWorkspaceData(j);
    } catch (e) {
      setWorkspaceError2(e instanceof Error ? e.message : 'Failed to load workspace');
      setWorkspaceData(null);
    } finally {
      setWorkspaceLoading2(false);
    }
  }, []);

  const loadHooks = useCallback(async () => {
    setHooksLoading2(true);
    setHooksError2(null);
    try {
      const r = await fetch('/api/settings/hooks', { credentials: 'same-origin' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(typeof j.error === 'string' ? j.error : `Load failed (${r.status})`);
      setHooksData({ hooks: Array.isArray(j.hooks) ? j.hooks : [], executions: Array.isArray(j.executions) ? j.executions : [] });
    } catch (e) {
      setHooksError2(e instanceof Error ? e.message : 'Failed to load hooks');
      setHooksData({ hooks: [], executions: [] });
    } finally {
      setHooksLoading2(false);
    }
  }, []);

  const loadSecurity = useCallback(async () => {
    setSessionsLoading(true);
    setSessionsError(null);
    try {
      const [sessR, findR] = await Promise.all([
        fetch('/api/settings/security/sessions', { credentials: 'same-origin' }),
        fetch('/api/settings/security/findings', { credentials: 'same-origin' }),
      ]);
      const sessJ = await sessR.json().catch(() => ({}));
      const findJ = await findR.json().catch(() => ({}));
      if (!sessR.ok) throw new Error(typeof sessJ.error === 'string' ? sessJ.error : `Load failed (${sessR.status})`);
      setSessions(Array.isArray(sessJ.sessions) ? sessJ.sessions : []);
      setFindings(Array.isArray(findJ.findings) ? findJ.findings : []);
    } catch (e) {
      setSessionsError(e instanceof Error ? e.message : 'Failed to load security');
      setSessions([]);
      setFindings([]);
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  const loadUsage = useCallback(async (page: number, provider: string, model: string) => {
    setUsageLoading(true);
    setUsageError(null);
    try {
      const qp = new URLSearchParams({ page: String(page || 1) });
      if (provider) qp.set('provider', provider);
      if (model) qp.set('model', model);
      const r = await fetch(`/api/settings/usage?${qp.toString()}`, { credentials: 'same-origin' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(typeof j.error === 'string' ? j.error : `Load failed (${r.status})`);
      setUsageData(j);
    } catch (e) {
      setUsageError(e instanceof Error ? e.message : 'Failed to load usage');
      setUsageData(null);
    } finally {
      setUsageLoading(false);
    }
  }, []);

  const loadNotifications = useCallback(async () => {
    setNotifyLoading(true);
    setNotifyError(null);
    try {
      const r = await fetch('/api/settings/profile', { credentials: 'same-origin' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(typeof j.error === 'string' ? j.error : `Load failed (${r.status})`);
      const flat = (j && typeof j === 'object' && (j as any).flat && typeof (j as any).flat === 'object') ? (j as any).flat : {};
      const settings = (j && typeof j === 'object' && (j as any).settings && typeof (j as any).settings === 'object') ? (j as any).settings : {};
      const merged: Record<string, string> = { ...settings, ...flat };
      setNotifyPrefs(merged);
      setNotifyWebhookUrl(String(merged['notify.webhook_url'] || ''));
      setBudgetMonthlyLimit(String(merged['budget.monthly_limit_usd'] || ''));
      setBudgetHardStop(String(merged['budget.hard_stop'] || 'false') === 'true');
    } catch (e) {
      setNotifyError(e instanceof Error ? e.message : 'Failed to load notifications');
      setNotifyPrefs({});
    } finally {
      setNotifyLoading(false);
    }
  }, []);

  const [agentsLoading, setAgentsLoading] = useState(false);
  const [agentsSaving, setAgentsSaving] = useState(false);
  const [agentsError, setAgentsError] = useState<string | null>(null);
  const [agentsWorkspaceId, setAgentsWorkspaceId] = useState<string>('');
  const [agentsPolicy, setAgentsPolicy] = useState<AgentsamUserPolicy | null>(null);
  const [agentsCommands, setAgentsCommands] = useState<string[]>([]);
  const [agentsDomains, setAgentsDomains] = useState<string[]>([]);
  const [agentsMcp, setAgentsMcp] = useState<Array<{ tool_key: string; notes?: string | null }>>([]);

  const [newCommand, setNewCommand] = useState('');
  const [newDomain, setNewDomain] = useState('');
  const [newToolKey, setNewToolKey] = useState('');

  const defaultAgentsPolicy: AgentsamUserPolicy = {
    auto_run_mode: 'allowlist',
    browser_protection: 0,
    mcp_tools_protection: 1,
    file_deletion_protection: 1,
    external_file_protection: 1,
    default_agent_location: 'pane',
    text_size: 'default',
    auto_clear_chat: 0,
    submit_with_mod_enter: 0,
    max_tab_count: 5,
    queue_messages_mode: 'after_current',
    usage_summary_mode: 'auto',
    agent_autocomplete: 1,
    web_search_enabled: 1,
    auto_accept_web_search: 0,
    web_fetch_enabled: 1,
    hierarchical_ignore: 0,
    ignore_symlinks: 0,
    inline_diffs: 1,
    jump_next_diff_on_accept: 1,
    auto_format_on_agent_finish: 0,
    legacy_terminal_tool: 1,
    toolbar_on_selection: 1,
    auto_parse_links: 0,
    themed_diff_backgrounds: 1,
    terminal_hint: 1,
    terminal_preview_box: 1,
    collapse_auto_run_commands: 1,
    voice_submit_keyword: 'submit',
    commit_attribution: 1,
    pr_attribution: 1,
    settings_json: null,
  };

  const loadAgentsSettings = useCallback(async (wsId: string | null | undefined) => {
    setAgentsLoading(true);
    setAgentsError(null);
    try {
      const qp = wsId && wsId.trim() ? `?workspace_id=${encodeURIComponent(wsId.trim())}` : '';
      const r = await fetch(`/api/settings/agents${qp}`, { credentials: 'same-origin' });
      if (!r.ok) throw new Error(await r.text());
      const d = (await r.json()) as AgentsSettingsResponse;
      setAgentsWorkspaceId(String(d.workspace_id || wsId || '').trim());
      setAgentsPolicy(d.policy && typeof d.policy === 'object' ? { ...defaultAgentsPolicy, ...d.policy } : { ...defaultAgentsPolicy });
      setAgentsCommands(Array.isArray(d.allowlists?.commands) ? d.allowlists.commands : []);
      setAgentsDomains(Array.isArray(d.allowlists?.domains) ? d.allowlists.domains : []);
      setAgentsMcp(Array.isArray(d.allowlists?.mcp) ? d.allowlists.mcp : []);
    } catch (e) {
      setAgentsError(e instanceof Error ? e.message : 'Failed to load Agents settings');
      setAgentsPolicy({ ...defaultAgentsPolicy });
      setAgentsCommands([]);
      setAgentsDomains([]);
      setAgentsMcp([]);
    } finally {
      setAgentsLoading(false);
    }
  }, []);

  const refreshLlmKeys = useCallback(() => {
    fetch('/api/vault/llm-keys', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((d: { keys?: LlmVaultRow[] }) => setLlmKeys(Array.isArray(d.keys) ? d.keys : []))
      .catch(() => setLlmKeys([]));
  }, []);

  const loadModelsSettings = useCallback(async (wsId: string | null | undefined) => {
    setModelsLoading(true);
    setModelsError(null);
    try {
      const qp = wsId && wsId.trim() ? `?workspace_id=${encodeURIComponent(wsId.trim())}` : '';
      const r = await fetch(`/api/settings/models${qp}`, { credentials: 'same-origin' });
      if (!r.ok) throw new Error(await r.text());
      const d = (await r.json()) as SettingsModelsResponse;
      setSettingsModels(d && typeof d === 'object' ? d : null);
    } catch (e) {
      setSettingsModels(null);
      setModelsError(e instanceof Error ? e.message : 'Failed to load models');
    } finally {
      setModelsLoading(false);
    }
  }, []);

  const modelOptions = useMemo(() => {
    const rows = settingsModels?.models || [];
    return rows.map((m) => ({ id: String(m.id), name: String(m.name || m.id) }));
  }, [settingsModels?.models]);

  const tierPatchTimers = useRef<Record<string, number>>({});
  const patchTierDebounced = useCallback((tierId: string, patch: Record<string, unknown>) => {
    if (!tierId) return;
    const prev = tierPatchTimers.current[tierId];
    if (prev) window.clearTimeout(prev);
    tierPatchTimers.current[tierId] = window.setTimeout(() => {
      void (async () => {
        try {
          await fetch(`/api/settings/models/tiers/${encodeURIComponent(tierId)}`, {
            method: 'PATCH',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patch),
          });
        } catch {
          /* inline errors handled by reload-on-activation */
        }
      })();
    }, 400);
  }, []);

  const toggleModelField = useCallback(async (modelId: string, field: 'is_active' | 'show_in_picker', value: boolean) => {
    if (!settingsModels) return;
    const prev = settingsModels;
    setSettingsModels({
      ...prev,
      models: prev.models.map((m) => (m.id === modelId ? { ...m, [field]: value ? 1 : 0 } : m)),
    });
    try {
      const r = await fetch(`/api/settings/models/${encodeURIComponent(modelId)}/toggle`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value ? 1 : 0 }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(typeof j.error === 'string' ? j.error : `Save failed (${r.status})`);
    } catch (e) {
      setSettingsModels(prev);
      setModelsError(e instanceof Error ? e.message : 'Save failed');
    }
  }, [settingsModels]);

  const loadMcpSettings = useCallback(async () => {
    try {
      const r = await fetch('/api/settings/mcp', { credentials: 'same-origin' });
      if (!r.ok) throw new Error(await r.text());
      const d = (await r.json()) as SettingsMcpResponse;
      setSettingsMcp(d && typeof d === 'object' ? d : null);
    } catch {
      setSettingsMcp(null);
    }
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

  useEffect(() => {
    if (activeSection !== 'Agents') return;
    void loadAgentsSettings(workspaceId);
  }, [activeSection, workspaceId, loadAgentsSettings]);

  useEffect(() => {
    if (activeSection !== 'AI Models') return;
    void loadModelsSettings(workspaceId);
  }, [activeSection, workspaceId, loadModelsSettings]);

  useEffect(() => {
    if (activeSection !== 'Tools & MCP') return;
    void loadMcpSettings();
  }, [activeSection, loadMcpSettings]);

  // Keep the MCP tool browser populated even when not on "Tools & MCP".
  useEffect(() => {
    void loadMcpSettings();
  }, [loadMcpSettings]);

  useEffect(() => {
    if (activeSection !== 'Rules & Skills') return;
    if (rulesSkillsTab === 'skills') void loadSkills();
    if (rulesSkillsTab === 'subagents') void loadSubagents();
    if (rulesSkillsTab === 'commands') void loadCommands2();
    if (rulesSkillsTab === 'rules') void loadRules();
  }, [activeSection, rulesSkillsTab, loadSkills, loadSubagents, loadCommands2, loadRules]);

  useEffect(() => {
    if (activeSection !== 'Workspace') return;
    void loadWorkspace();
  }, [activeSection, loadWorkspace]);

  useEffect(() => {
    if (activeSection !== 'Hooks') return;
    void loadHooks();
  }, [activeSection, loadHooks]);

  useEffect(() => {
    if (activeSection !== 'Security') return;
    void loadSecurity();
  }, [activeSection, loadSecurity]);

  useEffect(() => {
    if (activeSection !== 'Plan & Usage') return;
    void loadUsage(usagePage, usageProvider, usageModel);
    void loadNotifications();
  }, [activeSection]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeSection !== 'Notifications') return;
    void loadNotifications();
  }, [activeSection, loadNotifications]);


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
    // Legacy MCP tools surface (still used elsewhere in the app).
    try {
      const r = await fetch(`/api/mcp/tools/${encodeURIComponent(toolName)}`, { credentials: 'same-origin' });
      if (!r.ok) return;
      const row = await r.json();
      const toolId = row?.id != null && String(row.id).trim() !== '' ? String(row.id).trim() : toolName;
      const params = new URLSearchParams({
        monaco: 'mcp_tool',
        id: toolId,
        payload: JSON.stringify(row, null, 2),
      });
      window.location.href = `/dashboard/agent?${params.toString()}`;
    } catch {
      /* ignore */
    }
  };

  const openRegisteredToolInMonaco = useCallback((tool: Record<string, unknown>) => {
    const toolId = tool?.id != null && String(tool.id).trim() !== '' ? String(tool.id).trim() : String(tool?.tool_name || 'tool');
    const params = new URLSearchParams({
      monaco: 'mcp_tool',
      id: toolId,
      payload: JSON.stringify(tool, null, 2),
    });
    window.location.href = `/dashboard/agent?${params.toString()}`;
  }, []);

  const menu = [
    { id: 'General',      icon: <Settings2 size={14} /> },
    { id: 'Agents',       icon: <Bot size={14} /> },
    { id: 'AI Models',    icon: <Cpu size={14} /> },
    { id: 'Tools & MCP',  icon: <Layers size={14} /> },
    { id: 'Rules & Skills', icon: <Wrench size={14} /> },
    { id: 'Workspace',    icon: <Cloud size={14} /> },
    { id: 'Hooks',        icon: <Zap size={14} /> },
    { id: 'GitHub',       icon: <GitBranch size={14} /> },
    { id: 'CI/CD',        icon: <Zap size={14} /> },
    { id: 'Network',      icon: <Network size={14} /> },
    { id: 'Themes',       icon: <Palette size={14} /> },
    { id: 'Storage',      icon: <Database size={14} /> },
    { id: 'Security',     icon: <Shield size={14} /> },
    { id: 'Plan & Usage', icon: <BarChart2 size={14} /> },
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

  const visibleToolCategories = useMemo(() => {
    const q = toolBrowserFilter.trim().toLowerCase();
    const entries = Object.entries(mcpCategories);
    if (!q) return entries;
    return entries
      .map(([cat, tools]) => {
        const filtered = tools.filter((t) => {
          const name = String(t.tool_name || '').toLowerCase();
          const desc = String(t.description || '').toLowerCase();
          return name.includes(q) || desc.includes(q) || String(cat).toLowerCase().includes(q);
        });
        return [cat, filtered] as const;
      })
      .filter(([, tools]) => tools.length > 0);
  }, [mcpCategories, toolBrowserFilter]);

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
        {/* ── Panel 1: MCP Tool Browser ── */}
        {!isMobile && (
          <div className="w-[240px] shrink-0 border-r border-[var(--border-subtle)] bg-[var(--bg-app)] overflow-hidden flex flex-col">
            <div className="px-3 py-3 border-b border-[var(--border-subtle)]">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-heading)]">MCP Tool Browser</div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">{mcps.length} tools</div>
              </div>
              <div className="mt-2 flex items-center gap-2 bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-lg px-2 py-1.5">
                <Search size={10} className="text-[var(--text-muted)] shrink-0" />
                <input
                  value={toolBrowserFilter}
                  onChange={(e) => setToolBrowserFilter(e.target.value)}
                  placeholder="Filter tools..."
                  className="bg-transparent text-[11px] focus:outline-none text-[var(--text-main)] placeholder:text-[var(--text-muted)] w-full"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {visibleToolCategories.map(([cat, tools]) => {
                const isOpen = toolBrowserFilter
                  ? true
                  : toolBrowserExpanded[cat] === true;
                return (
                  <div key={cat} className="border-b border-[var(--border-subtle)]">
                    <button
                      type="button"
                      onClick={() => setToolBrowserExpanded((p) => ({ ...p, [cat]: !p[cat] }))}
                      className="w-full px-3 py-2 flex items-center justify-between gap-2 text-left hover:bg-[var(--bg-hover)]"
                    >
                      <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">{cat}</div>
                      <div className="text-[10px] font-bold text-[var(--text-muted)]">{tools.length}</div>
                    </button>
                    {isOpen && (
                      <div className="px-2 pb-2 flex flex-col gap-2">
                        {tools.map((tool) => {
                          const key = String(tool.tool_name || '');
                          const output = toolBrowserOutput[key];
                          return (
                            <div key={key} className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] overflow-hidden">
                              <div className="px-2 py-2 flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="text-[11px] font-semibold text-[var(--text-heading)] truncate">{key}</div>
                                  <div className="text-[10px] text-[var(--text-muted)] line-clamp-2">{String(tool.description || '').slice(0, 140) || '—'}</div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    openRegisteredToolInMonaco(tool as any);
                                    setToolBrowserOutput((p) => ({ ...p, [key]: 'Opened tool record in editor.' }));
                                  }}
                                  className="shrink-0 px-2 py-1 rounded-lg border border-[var(--border-subtle)] text-[10px] font-bold hover:border-[var(--solar-cyan)]"
                                >
                                  Run
                                </button>
                              </div>
                              {output ? (
                                <div className="px-2 py-2 border-t border-[var(--border-subtle)] text-[10px] text-[var(--text-muted)]">
                                  {output}
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                        {tools.length === 0 ? (
                          <div className="px-1 py-2 text-[11px] text-[var(--text-muted)]">No tools in this category.</div>
                        ) : null}
                      </div>
                    )}
                  </div>
                );
              })}
              {visibleToolCategories.length === 0 ? (
                <div className="p-3 text-[11px] text-[var(--text-muted)]">No tools match this filter.</div>
              ) : null}
            </div>
          </div>
        )}

        {/* ── Left Nav ── */}
        {!isMobile && (
          <div
            ref={navRef}
            className="shrink-0 border-r border-[var(--border-subtle)] flex flex-col overflow-hidden relative"
            style={{ width: navWidth }}
          >
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
                {navWidth < 80 ? null : item.id}
              </button>
            ))}
          </div>
          {/* Drag handle */}
          <div
            onMouseDown={onNavDragStart}
            className="absolute top-0 right-0 h-full w-1 cursor-col-resize bg-transparent hover:bg-[var(--border-subtle)]"
          />
        </div>
        )}

        {/* ── Right Content ── */}
        <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
          {isMobile && (
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="text-[12px] font-black uppercase tracking-widest text-[var(--text-heading)]">Section</div>
              <select
                value={activeSection}
                onChange={(e) => setActiveSection(e.target.value)}
                className="flex-1 px-3 py-2 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] text-[12px] text-[var(--text-main)]"
              >
                {filteredMenu.map((m) => (
                  <option key={m.id} value={m.id}>{m.id}</option>
                ))}
              </select>
            </div>
          )}

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

          {/* ── AGENTS ── */}
          {activeSection === 'Agents' && (
            <div className="flex flex-col gap-5 max-w-2xl">
              <div className="flex items-center justify-between">
                <h2 className="text-[13px] font-bold text-[var(--text-heading)] uppercase tracking-widest">Agents</h2>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={agentsLoading}
                    onClick={() => void loadAgentsSettings(workspaceId)}
                    className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)] hover:text-[var(--text-main)] disabled:opacity-40"
                  >
                    Refresh
                  </button>
                  <button
                    type="button"
                    disabled={agentsSaving || !agentsPolicy}
                    onClick={async () => {
                      if (!agentsPolicy) return;
                      setAgentsSaving(true);
                      setAgentsError(null);
                      try {
                        const r = await fetch('/api/settings/agents/policy', {
                          method: 'PATCH',
                          credentials: 'same-origin',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ workspace_id: agentsWorkspaceId || (workspaceId || ''), policy: agentsPolicy }),
                        });
                        if (!r.ok) throw new Error(await r.text());
                        const d = await r.json().catch(() => null);
                        const fresh = d?.policy && typeof d.policy === 'object' ? d.policy : null;
                        if (fresh) setAgentsPolicy({ ...defaultAgentsPolicy, ...fresh });
                      } catch (e) {
                        setAgentsError(e instanceof Error ? e.message : 'Save failed');
                      } finally {
                        setAgentsSaving(false);
                      }
                    }}
                    className="px-3 py-1.5 rounded-lg bg-[var(--solar-cyan)]/20 text-[11px] font-semibold text-[var(--solar-cyan)] border border-[var(--solar-cyan)]/30 disabled:opacity-40"
                  >
                    {agentsSaving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>

              {agentsError ? (
                <div className="text-[11px] text-red-400 border border-red-400/30 bg-red-400/5 rounded-lg p-3">
                  {agentsError}
                </div>
              ) : null}

              <div className="text-[11px] text-[var(--text-muted)]">
                Workspace scope: <code className="font-mono text-[var(--solar-cyan)]">{agentsWorkspaceId || workspaceId || '—'}</code>
              </div>

              {/* Policy controls */}
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-app)] p-4 space-y-3">
                {agentsLoading && !agentsPolicy ? (
                  <div className="text-[12px] text-[var(--text-muted)]">Loading…</div>
                ) : null}

                {agentsPolicy ? (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <label className="flex flex-col gap-1 text-[11px]">
                        <span className="text-[var(--text-muted)]">Auto-run mode</span>
                        <select
                          value={agentsPolicy.auto_run_mode}
                          onChange={(e) => setAgentsPolicy((p) => (p ? { ...p, auto_run_mode: e.target.value } : p))}
                          className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-3 py-2 text-[12px] text-[var(--text-main)]"
                        >
                          <option value="disabled">disabled</option>
                          <option value="manual">manual</option>
                          <option value="allowlist">allowlist</option>
                          <option value="auto">full_auto</option>
                        </select>
                      </label>

                      <label className="flex flex-col gap-1 text-[11px]">
                        <span className="text-[var(--text-muted)]">Text size</span>
                        <select
                          value={agentsPolicy.text_size || 'default'}
                          onChange={(e) => setAgentsPolicy((p) => (p ? { ...p, text_size: e.target.value } : p))}
                          className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-3 py-2 text-[12px] text-[var(--text-main)]"
                        >
                          <option value="small">small</option>
                          <option value="default">default</option>
                          <option value="large">large</option>
                          <option value="xl">xl</option>
                        </select>
                      </label>

                      <label className="flex flex-col gap-1 text-[11px]">
                        <span className="text-[var(--text-muted)]">Max tabs</span>
                        <input
                          type="number"
                          min={1}
                          max={50}
                          value={agentsPolicy.max_tab_count}
                          onChange={(e) =>
                            setAgentsPolicy((p) => (p ? { ...p, max_tab_count: Number(e.target.value || 0) } : p))
                          }
                          className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-3 py-2 text-[12px] text-[var(--text-main)]"
                        />
                      </label>

                      <label className="flex flex-col gap-1 text-[11px]">
                        <span className="text-[var(--text-muted)]">Voice submit keyword</span>
                        <input
                          type="text"
                          value={agentsPolicy.voice_submit_keyword || ''}
                          onChange={(e) => setAgentsPolicy((p) => (p ? { ...p, voice_submit_keyword: e.target.value } : p))}
                          className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-3 py-2 text-[12px] text-[var(--text-main)]"
                        />
                      </label>
                    </div>

                    {(
                      [
                        { key: 'browser_protection', label: 'Browser protection', desc: 'Require confirmation for risky browser actions' },
                        { key: 'mcp_tools_protection', label: 'MCP tools protection', desc: 'Require approval/allowlist for MCP tools' },
                        { key: 'file_deletion_protection', label: 'File deletion protection', desc: 'Block or require confirmation for deletes' },
                        { key: 'external_file_protection', label: 'External file protection', desc: 'Protect files outside the workspace' },
                        { key: 'web_search_enabled', label: 'Web search enabled', desc: 'Allow web search tool usage' },
                        { key: 'auto_accept_web_search', label: 'Auto-accept web search', desc: 'Skip confirm step for web search' },
                        { key: 'web_fetch_enabled', label: 'Web fetch enabled', desc: 'Allow fetching web pages' },
                        { key: 'agent_autocomplete', label: 'Agent autocomplete', desc: 'Autocomplete suggestions from the agent' },
                        { key: 'auto_clear_chat', label: 'Auto-clear chat', desc: 'Automatically clear chat between tasks' },
                        { key: 'submit_with_mod_enter', label: 'Submit with Mod+Enter', desc: 'Use Cmd/Ctrl+Enter to submit' },
                        { key: 'hierarchical_ignore', label: 'Hierarchical ignore', desc: 'Use hierarchical ignore resolution' },
                        { key: 'ignore_symlinks', label: 'Ignore symlinks', desc: 'Skip symlink traversal' },
                        { key: 'inline_diffs', label: 'Inline diffs', desc: 'Show inline diffs for edits' },
                        { key: 'jump_next_diff_on_accept', label: 'Jump next diff on accept', desc: 'Auto-jump diff cursor after accepting' },
                        { key: 'auto_format_on_agent_finish', label: 'Auto-format on finish', desc: 'Format files after agent completion' },
                        { key: 'legacy_terminal_tool', label: 'Legacy terminal tool', desc: 'Use legacy terminal tool behavior' },
                        { key: 'toolbar_on_selection', label: 'Toolbar on selection', desc: 'Show actions toolbar on text selection' },
                        { key: 'auto_parse_links', label: 'Auto-parse links', desc: 'Parse links from text automatically' },
                        { key: 'themed_diff_backgrounds', label: 'Themed diff backgrounds', desc: 'Use themed diff backgrounds' },
                        { key: 'terminal_hint', label: 'Terminal hint', desc: 'Show terminal hints' },
                        { key: 'terminal_preview_box', label: 'Terminal preview box', desc: 'Show terminal preview panel' },
                        { key: 'collapse_auto_run_commands', label: 'Collapse auto-run commands', desc: 'Collapse auto-run command output' },
                        { key: 'commit_attribution', label: 'Commit attribution', desc: 'Attribute commits to agent' },
                        { key: 'pr_attribution', label: 'PR attribution', desc: 'Attribute PRs to agent' },
                      ] as const
                    ).map((row) => {
                      const k = row.key as keyof AgentsamUserPolicy;
                      const on = Number(agentsPolicy[k] as unknown) === 1;
                      return (
                        <div key={row.key} className="flex items-center justify-between py-3 border-b border-[var(--border-subtle)]/50">
                          <div className="min-w-0 pr-3">
                            <div className="text-[12px] font-semibold text-[var(--text-main)]">{row.label}</div>
                            <div className="text-[11px] text-[var(--text-muted)] mt-0.5">{row.desc}</div>
                          </div>
                          <Toggle
                            on={on}
                            onChange={(v) => setAgentsPolicy((p) => (p ? { ...p, [k]: v ? 1 : 0 } : p))}
                          />
                        </div>
                      );
                    })}
                  </>
                ) : null}
              </div>

              {/* Allowlists */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-app)] p-4">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-2">Command allowlist</div>
                  <div className="flex gap-2 mb-3">
                    <input
                      value={newCommand}
                      onChange={(e) => setNewCommand(e.target.value)}
                      placeholder="e.g. git status"
                      className="flex-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-3 py-2 text-[12px] text-[var(--text-main)]"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const v = newCommand.trim();
                        if (!v) return;
                        void (async () => {
                          try {
                            setAgentsError(null);
                            const r = await fetch('/api/settings/agents/commands', {
                              method: 'POST',
                              credentials: 'same-origin',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ workspace_id: agentsWorkspaceId || (workspaceId || ''), command: v }),
                            });
                            if (!r.ok) throw new Error(await r.text());
                            setAgentsCommands((p) => Array.from(new Set([...p, v])).sort());
                            setNewCommand('');
                          } catch (e) {
                            setAgentsError(e instanceof Error ? e.message : 'Failed to add command');
                          }
                        })();
                      }}
                      className="px-3 py-2 rounded-lg border border-[var(--border-subtle)] text-[11px] text-[var(--text-main)] hover:border-[var(--solar-cyan)]/50"
                    >
                      Add
                    </button>
                  </div>
                  <div className="space-y-1">
                    {agentsCommands.length === 0 ? (
                      <div className="text-[12px] text-[var(--text-muted)]">No commands</div>
                    ) : (
                      agentsCommands.map((c) => (
                        <div key={c} className="flex items-center justify-between gap-2 text-[11px] border border-[var(--border-subtle)] rounded-lg px-2.5 py-2 bg-[var(--bg-panel)]">
                          <code className="font-mono text-[var(--solar-cyan)] truncate">{c}</code>
                          <button
                            type="button"
                            onClick={() => {
                              void (async () => {
                                try {
                                  setAgentsError(null);
                                  const r = await fetch(`/api/settings/agents/commands/${encodeURIComponent(c)}`, {
                                    method: 'DELETE',
                                    credentials: 'same-origin',
                                  });
                                  if (!r.ok) throw new Error(await r.text());
                                  setAgentsCommands((p) => p.filter((x) => x !== c));
                                } catch (e) {
                                  setAgentsError(e instanceof Error ? e.message : 'Failed to remove command');
                                }
                              })();
                            }}
                            className="text-[10px] px-2 py-1 rounded border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-red-400 hover:border-red-400/40"
                          >
                            Remove
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-app)] p-4">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-2">Fetch domain allowlist</div>
                  <div className="flex gap-2 mb-3">
                    <input
                      value={newDomain}
                      onChange={(e) => setNewDomain(e.target.value)}
                      placeholder="e.g. example.com"
                      className="flex-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-3 py-2 text-[12px] text-[var(--text-main)]"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const v = newDomain.trim();
                        if (!v) return;
                        void (async () => {
                          try {
                            setAgentsError(null);
                            const r = await fetch('/api/settings/agents/domains', {
                              method: 'POST',
                              credentials: 'same-origin',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ workspace_id: agentsWorkspaceId || (workspaceId || ''), host: v }),
                            });
                            if (!r.ok) throw new Error(await r.text());
                            setAgentsDomains((p) => Array.from(new Set([...p, v])).sort());
                            setNewDomain('');
                          } catch (e) {
                            setAgentsError(e instanceof Error ? e.message : 'Failed to add domain');
                          }
                        })();
                      }}
                      className="px-3 py-2 rounded-lg border border-[var(--border-subtle)] text-[11px] text-[var(--text-main)] hover:border-[var(--solar-cyan)]/50"
                    >
                      Add
                    </button>
                  </div>
                  <div className="space-y-1">
                    {agentsDomains.length === 0 ? (
                      <div className="text-[12px] text-[var(--text-muted)]">No domains</div>
                    ) : (
                      agentsDomains.map((h) => (
                        <div key={h} className="flex items-center justify-between gap-2 text-[11px] border border-[var(--border-subtle)] rounded-lg px-2.5 py-2 bg-[var(--bg-panel)]">
                          <code className="font-mono text-[var(--solar-cyan)] truncate">{h}</code>
                          <button
                            type="button"
                            onClick={() => {
                              void (async () => {
                                try {
                                  setAgentsError(null);
                                  const r = await fetch(`/api/settings/agents/domains/${encodeURIComponent(h)}`, {
                                    method: 'DELETE',
                                    credentials: 'same-origin',
                                  });
                                  if (!r.ok) throw new Error(await r.text());
                                  setAgentsDomains((p) => p.filter((x) => x !== h));
                                } catch (e) {
                                  setAgentsError(e instanceof Error ? e.message : 'Failed to remove domain');
                                }
                              })();
                            }}
                            className="text-[10px] px-2 py-1 rounded border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-red-400 hover:border-red-400/40"
                          >
                            Remove
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-app)] p-4">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-2">MCP tool allowlist</div>
                  <div className="flex gap-2 mb-3">
                    <input
                      value={newToolKey}
                      onChange={(e) => setNewToolKey(e.target.value)}
                      placeholder="e.g. mcp_tool_name"
                      className="flex-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-3 py-2 text-[12px] text-[var(--text-main)]"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const v = newToolKey.trim();
                        if (!v) return;
                        void (async () => {
                          try {
                            setAgentsError(null);
                            const r = await fetch('/api/settings/agents/mcp', {
                              method: 'POST',
                              credentials: 'same-origin',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ workspace_id: agentsWorkspaceId || (workspaceId || ''), tool_key: v, notes: null }),
                            });
                            if (!r.ok) throw new Error(await r.text());
                            setAgentsMcp((p) => {
                              const seen = new Set(p.map((x) => x.tool_key));
                              if (seen.has(v)) return p;
                              return [...p, { tool_key: v, notes: null }].sort((a, b) => a.tool_key.localeCompare(b.tool_key));
                            });
                            setNewToolKey('');
                          } catch (e) {
                            setAgentsError(e instanceof Error ? e.message : 'Failed to add tool');
                          }
                        })();
                      }}
                      className="px-3 py-2 rounded-lg border border-[var(--border-subtle)] text-[11px] text-[var(--text-main)] hover:border-[var(--solar-cyan)]/50"
                    >
                      Add
                    </button>
                  </div>
                  <div className="space-y-1">
                    {agentsMcp.length === 0 ? (
                      <div className="text-[12px] text-[var(--text-muted)]">No tools</div>
                    ) : (
                      agentsMcp.map((t) => (
                        <div key={t.tool_key} className="flex items-center justify-between gap-2 text-[11px] border border-[var(--border-subtle)] rounded-lg px-2.5 py-2 bg-[var(--bg-panel)]">
                          <code className="font-mono text-[var(--solar-cyan)] truncate">{t.tool_key}</code>
                          <button
                            type="button"
                            onClick={() => {
                              void (async () => {
                                try {
                                  setAgentsError(null);
                                  const r = await fetch(`/api/settings/agents/mcp/${encodeURIComponent(t.tool_key)}`, {
                                    method: 'DELETE',
                                    credentials: 'same-origin',
                                  });
                                  if (!r.ok) throw new Error(await r.text());
                                  setAgentsMcp((p) => p.filter((x) => x.tool_key !== t.tool_key));
                                } catch (e) {
                                  setAgentsError(e instanceof Error ? e.message : 'Failed to remove tool');
                                }
                              })();
                            }}
                            className="text-[10px] px-2 py-1 rounded border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-red-400 hover:border-red-400/40"
                          >
                            Remove
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div className="text-[10px] text-[var(--text-muted)]">
                Allowlists save immediately.
              </div>
            </div>
          )}

          {/* ── AI MODELS ── */}
          {activeSection === 'AI Models' && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h2 className="text-[13px] font-bold text-[var(--text-heading)] uppercase tracking-widest">AI Models</h2>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setModelsTab('models')}
                    className={`px-3 py-1.5 rounded-lg text-[11px] border transition-colors ${
                      modelsTab === 'models'
                        ? 'border-[var(--solar-cyan)]/40 text-[var(--solar-cyan)] bg-[var(--solar-cyan)]/10'
                        : 'border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-main)]'
                    }`}
                  >
                    Models
                  </button>
                  <button
                    type="button"
                    onClick={() => setModelsTab('routing')}
                    className={`px-3 py-1.5 rounded-lg text-[11px] border transition-colors ${
                      modelsTab === 'routing'
                        ? 'border-[var(--solar-cyan)]/40 text-[var(--solar-cyan)] bg-[var(--solar-cyan)]/10'
                        : 'border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-main)]'
                    }`}
                  >
                    Routing
                  </button>
                </div>
              </div>

              {modelsError ? (
                <div className="text-[11px] text-red-400 border border-red-400/30 bg-red-400/5 rounded-xl px-3 py-2">
                  {modelsError}
                </div>
              ) : null}

              {modelsLoading && !settingsModels ? (
                <div className="text-[12px] text-[var(--text-muted)]">Loading models…</div>
              ) : null}

              {!settingsModels ? (
                <div className="text-[12px] text-[var(--text-muted)]">No models data.</div>
              ) : null}

              {settingsModels && modelsTab === 'models' && (
                <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] overflow-hidden">
                  <div className="grid grid-cols-6 gap-0 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] border-b border-[var(--border-subtle)] bg-[var(--bg-app)]">
                    <div className="col-span-1">Provider</div>
                    <div className="col-span-2">Name</div>
                    <div className="col-span-1">Context</div>
                    <div className="col-span-1">Cost/MTok</div>
                    <div className="col-span-1 text-right">Picker · Active</div>
                  </div>

                  {(() => {
                    const rows = settingsModels.models || [];
                    const byProvider = rows.reduce<Record<string, typeof rows>>((acc, r) => {
                      const p = String(r.provider || 'unknown');
                      (acc[p] ||= []).push(r);
                      return acc;
                    }, {});
                    const providers = Object.keys(byProvider).sort((a, b) => a.localeCompare(b));
                    const providerColor = (p: string) => {
                      const k = p.toLowerCase();
                      if (k === 'anthropic') return 'bg-[var(--color-provider-anthropic,var(--accent))]/15 text-[var(--color-provider-anthropic,var(--accent))]';
                      if (k === 'openai') return 'bg-[var(--color-provider-openai,var(--color-success))]/15 text-[var(--color-provider-openai,var(--color-success))]';
                      if (k === 'google') return 'bg-[var(--color-provider-google,var(--color-warning))]/15 text-[var(--color-provider-google,var(--color-warning))]';
                      return 'bg-[var(--color-muted)]/15 text-[var(--color-muted)]';
                    };
                    return providers.map((p) => (
                      <div key={p}>
                        <div className="px-4 py-2 border-b border-[var(--border-subtle)] bg-[var(--bg-app)]">
                          <span className={`inline-flex items-center gap-2 px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-widest ${providerColor(p)}`}>
                            {p}
                          </span>
                        </div>
                        {byProvider[p].map((m) => {
                          const inactive = !Number(m.is_active);
                          const ctx = m.context_window != null ? formatCompactNumber(Number(m.context_window)) : '—';
                          const costIn = formatUsdMaybe(m.cost_per_input_mtok as any);
                          const costOut = formatUsdMaybe(m.cost_per_output_mtok as any);
                          return (
                            <div
                              key={m.id}
                              className="grid grid-cols-6 gap-0 px-4 py-3 border-b border-[var(--border-subtle)] items-center text-[11px]"
                              style={{ opacity: inactive ? 0.45 : 1 }}
                            >
                              <div className="col-span-1 text-[var(--text-muted)]">{m.provider}</div>
                              <div className="col-span-2 min-w-0">
                                <div className="text-[12px] font-semibold text-[var(--text-main)] truncate">{m.name}</div>
                                <div className="text-[10px] text-[var(--text-muted)] font-mono truncate">{m.id}</div>
                              </div>
                              <div className="col-span-1 text-[var(--text-main)] font-mono">{ctx}</div>
                              <div className="col-span-1 text-[var(--text-muted)]">
                                <div>{costIn} in</div>
                                <div>{costOut} out</div>
                              </div>
                              <div className="col-span-1 flex items-center justify-end gap-2">
                                <Toggle
                                  on={!!Number(m.show_in_picker)}
                                  onChange={(v) => void toggleModelField(m.id, 'show_in_picker', v)}
                                />
                                <Toggle
                                  on={!!Number(m.is_active)}
                                  onChange={(v) => void toggleModelField(m.id, 'is_active', v)}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ));
                  })()}
                </div>
              )}

              {settingsModels && modelsTab === 'routing' && (
                <div className="flex flex-col gap-3">
                  {Array.isArray(settingsModels.tiers) && settingsModels.tiers.length === 0 ? (
                    <div className="text-[12px] text-[var(--text-muted)]">No tiers configured for this workspace.</div>
                  ) : null}

                  {(Array.isArray(settingsModels.tiers) ? settingsModels.tiers : []).map((tRaw: any) => {
                    const tierId = String(tRaw?.id || '');
                    const tierLevel = Number(tRaw?.tier_level ?? 0);
                    const tierName = String(tRaw?.tier_name ?? '');
                    const modelId = String(tRaw?.model_id ?? '');
                    const isActive = !!Number(tRaw?.is_active ?? 0);
                    const esc = Number(tRaw?.escalate_if_confidence_below ?? 0);
                    const maxCtx = tRaw?.max_context_tokens != null ? String(tRaw.max_context_tokens) : '';

                    return (
                      <div key={tierId || `${tierLevel}`} className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4">
                        <div className="flex items-center justify-between gap-3 mb-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-widest bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[var(--text-muted)]">
                              T{tierLevel}
                            </span>
                            <div className="text-[12px] font-semibold text-[var(--text-main)] truncate">{tierName || 'Tier'}</div>
                          </div>
                          <Toggle
                            on={isActive}
                            onChange={(v) => {
                              setSettingsModels((prev) => prev ? ({
                                ...prev,
                                tiers: (prev.tiers || []).map((x: any) => (String(x?.id) === tierId ? { ...x, is_active: v ? 1 : 0 } : x)),
                              }) : prev);
                              patchTierDebounced(tierId, { is_active: v ? 1 : 0 });
                            }}
                          />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="flex flex-col gap-1">
                            <div className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">Model</div>
                            <select
                              value={modelId}
                              onChange={(e) => {
                                const v = e.target.value;
                                setSettingsModels((prev) => prev ? ({
                                  ...prev,
                                  tiers: (prev.tiers || []).map((x: any) => (String(x?.id) === tierId ? { ...x, model_id: v } : x)),
                                }) : prev);
                                patchTierDebounced(tierId, { model_id: v });
                              }}
                              className="px-3 py-2 rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[11px] text-[var(--text-main)]"
                            >
                              <option value="">—</option>
                              {modelOptions.map((m) => (
                                <option key={m.id} value={m.id}>{m.name}</option>
                              ))}
                            </select>
                          </div>

                          <div className="flex flex-col gap-1">
                            <div className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">Max context tokens</div>
                            <input
                              value={maxCtx}
                              onChange={(e) => {
                                const v = e.target.value;
                                setSettingsModels((prev) => prev ? ({
                                  ...prev,
                                  tiers: (prev.tiers || []).map((x: any) => (String(x?.id) === tierId ? { ...x, max_context_tokens: v === '' ? null : Number(v) } : x)),
                                }) : prev);
                                patchTierDebounced(tierId, { max_context_tokens: v === '' ? null : Number(v) });
                              }}
                              inputMode="numeric"
                              className="px-3 py-2 rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[11px] text-[var(--text-main)]"
                              placeholder="e.g. 120000"
                            />
                          </div>

                          <div className="flex flex-col gap-1 md:col-span-2">
                            <div className="flex items-center justify-between">
                              <div className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">Escalate if confidence below</div>
                              <div className="text-[10px] text-[var(--text-muted)] font-mono">{Math.round((Number.isFinite(esc) ? esc : 0) * 100)}%</div>
                            </div>
                            <input
                              type="range"
                              min={0}
                              max={1}
                              step={0.05}
                              value={Number.isFinite(esc) ? esc : 0}
                              onChange={(e) => {
                                const v = Number(e.target.value);
                                setSettingsModels((prev) => prev ? ({
                                  ...prev,
                                  tiers: (prev.tiers || []).map((x: any) => (String(x?.id) === tierId ? { ...x, escalate_if_confidence_below: v } : x)),
                                }) : prev);
                                patchTierDebounced(tierId, { escalate_if_confidence_below: v });
                              }}
                              className="w-full accent-[var(--solar-cyan)]"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── TOOLS & MCP ── */}
          {activeSection === 'Tools & MCP' && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-[13px] font-bold text-[var(--text-heading)] uppercase tracking-widest">Tools & MCP</h2>
                <span className="text-[10px] text-[var(--text-muted)] font-mono">{settingsMcp?.tools?.length ?? 0} tools</span>
              </div>
              {!settingsMcp ? (
                <div className="text-[12px] text-[var(--text-muted)]">Loading MCP settings…</div>
              ) : null}

              {settingsMcp && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {(Array.isArray(settingsMcp.servers) ? settingsMcp.servers : []).map((s: any, idx: number) => {
                    const name = String(s?.service_name || s?.name || `Server ${idx + 1}`);
                    const endpoint = String(s?.endpoint_url || s?.url || '');
                    const toolCount = Number(s?.tool_count ?? 0);
                    const status = String(s?.health_status ?? '').toLowerCase();
                    const dot =
                      status === 'healthy' ? 'bg-[var(--color-success)]' :
                      status === 'unhealthy' ? 'bg-[var(--color-danger)]' :
                      'bg-[var(--border-subtle)]';
                    const last = s?.last_health_check ?? s?.last_check_at ?? null;
                    return (
                      <div key={String(s?.id || endpoint || idx)} className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={`inline-block w-2 h-2 rounded-full ${dot}`} />
                              <div className="text-[12px] font-semibold text-[var(--text-main)] truncate">{name}</div>
                              <span className="text-[10px] px-2 py-0.5 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[var(--text-muted)] font-mono">
                                {toolCount} tools
                              </span>
                            </div>
                            <div className="text-[10px] text-[var(--text-muted)] font-mono truncate mt-1">{endpoint || '—'}</div>
                          </div>
                          <div className="text-[10px] text-[var(--text-muted)] whitespace-nowrap">
                            Last check: {relativeTime(last as any)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {settingsMcp && (
                <div className="flex flex-col gap-1">
                  {(Array.isArray(settingsMcp.tools) ? settingsMcp.tools : []).map((t: any, idx: number) => {
                    const id = String(t?.id || '');
                    const toolName = String(t?.tool_name || t?.name || `tool_${idx}`);
                    const desc = String(t?.description || '');
                    const enabled = !!Number(t?.enabled ?? 0);
                    const isDegraded = !!Number(t?.is_degraded ?? 0);
                    const failureRate = t?.failure_rate != null ? Number(t.failure_rate) : null;
                    const dot =
                      isDegraded ? 'bg-[var(--color-danger)]' :
                      (failureRate != null && Number.isFinite(failureRate) && failureRate > 0.1) ? 'bg-[var(--color-warning)]' :
                      'bg-[var(--color-success)]';
                    const stats = t?.stats as any;
                    const statsLine = stats
                      ? `${Number(stats.call_count ?? 0)} calls today · ${Number(stats.avg_duration_ms ?? 0)}ms avg`
                      : 'No activity today';
                    const err = mcpToggleError[id] || null;
                    return (
                      <div key={id || toolName} className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={`inline-block w-2 h-2 rounded-full ${dot}`} />
                              <div className="text-[12px] font-semibold text-[var(--text-main)] truncate">{toolName}</div>
                              {isDegraded ? (
                                <span className="text-[9px] px-2 py-0.5 rounded bg-[var(--color-danger)]/10 text-[var(--color-danger)] border border-[var(--color-danger)]/30 font-black uppercase tracking-widest">
                                  Degraded
                                </span>
                              ) : null}
                            </div>
                            <div className="text-[10px] text-[var(--text-muted)] mt-1">{desc || '—'}</div>
                            <div className="text-[10px] text-[var(--text-muted)] mt-2">{statsLine}</div>
                            {err ? (
                              <div className="text-[10px] text-red-400 mt-1">{err}</div>
                            ) : null}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <div
                              onClick={(e) => e.stopPropagation()}
                              className=""
                            >
                              <Toggle
                                on={enabled}
                                onChange={(v) => {
                                  const prev = enabled;
                                  setMcpToggleError((p) => ({ ...p, [id]: null }));
                                  setSettingsMcp((p) => p ? ({
                                    ...p,
                                    tools: (p.tools || []).map((x: any) => (String(x?.id) === id ? { ...x, enabled: v ? 1 : 0 } : x)),
                                  }) : p);
                                  void (async () => {
                                    try {
                                      const r = await fetch(`/api/settings/mcp/tools/${encodeURIComponent(id)}/toggle`, {
                                        method: 'PATCH',
                                        credentials: 'same-origin',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ enabled: v ? 1 : 0 }),
                                      });
                                      const j = await r.json().catch(() => ({}));
                                      if (!r.ok) throw new Error(typeof j.error === 'string' ? j.error : `Save failed (${r.status})`);
                                    } catch (e) {
                                      setSettingsMcp((p) => p ? ({
                                        ...p,
                                        tools: (p.tools || []).map((x: any) => (String(x?.id) === id ? { ...x, enabled: prev ? 1 : 0 } : x)),
                                      }) : p);
                                      setMcpToggleError((p) => ({ ...p, [id]: e instanceof Error ? e.message : 'Save failed' }));
                                    }
                                  })();
                                }}
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => openRegisteredToolInMonaco(t)}
                              className="flex items-center gap-2 px-3 py-2 bg-[var(--bg-app)] border border-[var(--border-subtle)] hover:border-[var(--solar-cyan)]/50 rounded-lg text-[11px] text-[var(--text-main)] hover:text-[var(--solar-cyan)] transition-colors"
                            >
                              <Code2 size={12} /> Open Config in Monaco
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── RULES & SKILLS ── */}
          {activeSection === 'Rules & Skills' && (
            <div className="flex flex-col gap-4 max-w-5xl">
              <div className="flex items-center justify-between">
                <h2 className="text-[13px] font-bold text-[var(--text-heading)] uppercase tracking-widest">Rules &amp; Skills</h2>
                <div className="flex items-center gap-2">
                  {rulesSkillsTab === 'skills' ? (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingSkill(null);
                        setSkillDraft({ name: '', description: '', content_markdown: '', slash_trigger: '', globs: '', always_apply: false, tags: '' });
                        setSkillDrawerOpen(true);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-[var(--solar-cyan)]/20 text-[11px] font-semibold text-[var(--solar-cyan)] border border-[var(--solar-cyan)]/30"
                    >
                      New Skill
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {(['skills','subagents','commands','rules'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setRulesSkillsTab(t)}
                    className={`px-3 py-1.5 rounded-lg text-[11px] border transition-colors ${
                      rulesSkillsTab === t
                        ? 'border-[var(--solar-cyan)]/40 text-[var(--solar-cyan)] bg-[var(--solar-cyan)]/10'
                        : 'border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-main)]'
                    }`}
                  >
                    {t === 'skills' ? 'Skills' : t === 'subagents' ? 'Subagents' : t === 'commands' ? 'Commands' : 'Rules'}
                  </button>
                ))}
              </div>

              {rulesSkillsTab === 'skills' && (
                <>
                  {skillsError ? <div className="text-[11px] text-red-400">{skillsError}</div> : null}
                  {skillsLoading ? <div className="text-[12px] text-[var(--text-muted)]">Loading skills…</div> : null}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {skills.map((skill) => (
                      <div key={String(skill.id)} className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] flex items-center justify-center text-[12px] font-bold text-[var(--solar-cyan)]">
                                {String(skill.icon || String(skill.name || '?')[0] || '?').toUpperCase().slice(0, 2)}
                              </div>
                              <div className="min-w-0">
                                <div className="text-[12px] font-semibold text-[var(--text-main)] truncate">{String(skill.name || '')}</div>
                                <div className="text-[10px] text-[var(--text-muted)] truncate">
                                  {String(skill.description || '').slice(0, 80)}{String(skill.description || '').length > 80 ? '…' : ''}
                                </div>
                              </div>
                            </div>
                            <div className="text-[10px] text-[var(--text-muted)] mt-2 flex items-center gap-2">
                              {Number(skill.invocation_count || 0) > 0 ? <span>{Number(skill.invocation_count)} uses</span> : null}
                              {skill.last_used ? <span>{relativeTime(skill.last_used)}</span> : null}
                            </div>
                          </div>
                          <Toggle
                            on={!!Number(skill.is_active ?? 1)}
                            onChange={(v) => {
                              const prev = skills;
                              setSkills((p) => p.map((s) => (String(s.id) === String(skill.id) ? { ...s, is_active: v ? 1 : 0 } : s)));
                              void (async () => {
                                try {
                                  await fetch(`/api/settings/skills/${encodeURIComponent(String(skill.id))}`, {
                                    method: 'PATCH',
                                    credentials: 'same-origin',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ is_active: v ? 1 : 0 }),
                                  });
                                } catch {
                                  setSkills(prev);
                                }
                              })();
                            }}
                          />
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingSkill(skill);
                              setSkillDraft({
                                name: skill.name || '',
                                description: skill.description || '',
                                content_markdown: skill.content_markdown || '',
                                slash_trigger: skill.slash_trigger || '',
                                globs: skill.globs || '',
                                always_apply: !!Number(skill.always_apply || 0),
                                tags: skill.tags || '',
                              });
                              setSkillDrawerOpen(true);
                            }}
                            className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)] hover:text-[var(--text-main)]"
                          >
                            Edit
                          </button>
                          <code className="text-[10px] text-[var(--text-muted)] font-mono truncate">{String(skill.slash_trigger || '')}</code>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {rulesSkillsTab === 'subagents' && (
                <>
                  {subagentsError ? <div className="text-[11px] text-red-400">{subagentsError}</div> : null}
                  {subagentsLoading ? <div className="text-[12px] text-[var(--text-muted)]">Loading subagents…</div> : null}
                  <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] overflow-hidden">
                    {(subagents || []).map((sa) => (
                      <div key={String(sa.id)} className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[var(--border-subtle)]">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] flex items-center justify-center text-[12px] font-bold text-[var(--solar-cyan)]">
                            {String(sa.display_name || sa.id || '?')[0]?.toUpperCase?.() || '?'}
                          </div>
                          <div className="min-w-0">
                            <div className="text-[12px] font-semibold text-[var(--text-main)] truncate">{String(sa.display_name || sa.id || '')}</div>
                            <div className="text-[10px] text-[var(--text-muted)] truncate">{String(sa.description || '')}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[9px] px-2 py-0.5 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[var(--text-muted)] font-black uppercase tracking-widest">
                            {String(sa.agent_type || 'subagent')}
                          </span>
                          <span className="text-[9px] px-2 py-0.5 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[var(--text-muted)] font-mono">
                            {String(sa.sandbox_mode || '—')}
                          </span>
                          <Toggle
                            on={!!Number(sa.is_active ?? 1)}
                            onChange={(v) => {
                              const prev = subagents;
                              setSubagents((p) => p.map((x) => (String(x.id) === String(sa.id) ? { ...x, is_active: v ? 1 : 0 } : x)));
                              void fetch(`/api/settings/subagents/${encodeURIComponent(String(sa.id))}`, {
                                method: 'PATCH',
                                credentials: 'same-origin',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ is_active: v ? 1 : 0 }),
                              }).catch(() => setSubagents(prev));
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setSubagentDraft({ ...sa });
                              setSubagentDrawerOpen(true);
                            }}
                            className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)] hover:text-[var(--text-main)]"
                          >
                            Edit
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {rulesSkillsTab === 'commands' && (
                <>
                  {commandsError2 ? <div className="text-[11px] text-red-400">{commandsError2}</div> : null}
                  {commandsLoading2 ? <div className="text-[12px] text-[var(--text-muted)]">Loading commands…</div> : null}
                  <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] overflow-hidden">
                    <div className="grid grid-cols-6 gap-0 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] border-b border-[var(--border-subtle)] bg-[var(--bg-app)]">
                      <div className="col-span-2">Slug</div>
                      <div className="col-span-2">Name</div>
                      <div className="col-span-1">Risk</div>
                      <div className="col-span-1 text-right">Active</div>
                    </div>
                    {commands2.map((c) => {
                      const id = String(c.id);
                      const risk = String(c.risk_level || 'none');
                      const riskClass =
                        risk === 'high' ? 'text-red-400 border-red-400/30 bg-red-400/5' :
                        risk === 'medium' ? 'text-[var(--color-warning)] border-[var(--color-warning)]/30 bg-[var(--color-warning)]/5' :
                        risk === 'low' ? 'text-[var(--solar-blue)] border-[var(--solar-blue)]/30 bg-[var(--solar-blue)]/5' :
                        'text-[var(--text-muted)] border-[var(--border-subtle)] bg-[var(--bg-app)]';
                      return (
                        <div key={id} className="border-b border-[var(--border-subtle)]">
                          <button
                            type="button"
                            onClick={() => setExpandedCommandId((p) => (p === id ? null : id))}
                            className="w-full grid grid-cols-6 gap-0 px-4 py-3 text-left items-center hover:bg-[var(--bg-hover)]"
                          >
                            <div className="col-span-2 font-mono text-[11px] text-[var(--solar-cyan)] truncate">{String(c.slug || '')}</div>
                            <div className="col-span-2 text-[11px] text-[var(--text-main)] truncate">{String(c.display_name || '')}</div>
                            <div className="col-span-1">
                              <span className={`text-[9px] px-2 py-0.5 rounded border font-black uppercase tracking-widest ${riskClass}`}>{risk}</span>
                            </div>
                            <div className="col-span-1 flex justify-end" onClick={(e) => e.stopPropagation()}>
                              <Toggle
                                on={!!Number(c.is_active ?? 1)}
                                onChange={(v) => {
                                  const prev = commands2;
                                  setCommands2((p) => p.map((x) => (String(x.id) === id ? { ...x, is_active: v ? 1 : 0 } : x)));
                                  void fetch(`/api/settings/commands/${encodeURIComponent(id)}/toggle`, {
                                    method: 'PATCH',
                                    credentials: 'same-origin',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ is_active: v ? 1 : 0 }),
                                  }).catch(() => setCommands2(prev));
                                }}
                              />
                            </div>
                          </button>
                          {expandedCommandId === id && (
                            <div className="px-4 pb-4 text-[11px] text-[var(--text-muted)]">
                              <div className="mt-2 text-[var(--text-main)]">{String(c.description || '')}</div>
                              {c.usage_hint ? (
                                <pre className="mt-3 p-3 rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[10px] overflow-auto">{String(c.usage_hint)}</pre>
                              ) : null}
                              {c.modes_json ? (
                                <div className="mt-3 flex flex-wrap gap-1">
                                  {(() => {
                                    try {
                                      const arr = JSON.parse(String(c.modes_json));
                                      return Array.isArray(arr) ? arr : [];
                                    } catch { return []; }
                                  })().map((m: any) => (
                                    <span key={String(m)} className="text-[9px] px-2 py-0.5 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[var(--text-muted)] font-mono">{String(m)}</span>
                                  ))}
                                </div>
                              ) : null}
                              {c.handler_ref ? (
                                <pre className="mt-3 p-3 rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[10px] overflow-auto">{String(c.handler_ref)}</pre>
                              ) : null}
                              {c.handler_sql ? (
                                <pre className="mt-3 p-3 rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[10px] overflow-auto">{String(c.handler_sql)}</pre>
                              ) : null}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {rulesSkillsTab === 'rules' && (
                <>
                  {rulesError ? <div className="text-[11px] text-red-400">{rulesError}</div> : null}
                  {rulesLoading ? <div className="text-[12px] text-[var(--text-muted)]">Loading rules…</div> : null}
                  <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] overflow-hidden">
                    {rules.map((r) => (
                      <div key={String(r.id)} className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[var(--border-subtle)]">
                        <div className="min-w-0">
                          <div className="text-[12px] font-semibold text-[var(--text-main)] truncate">{String(r.title || r.name || r.id)}</div>
                          <div className="mt-1 flex items-center gap-2">
                            <span className="text-[9px] px-2 py-0.5 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[var(--text-muted)] font-mono">v{Number(r.version || 1)}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Toggle
                            on={!!Number(r.is_active ?? 1)}
                            onChange={(v) => {
                              const prev = rules;
                              setRules((p) => p.map((x) => (String(x.id) === String(r.id) ? { ...x, is_active: v ? 1 : 0 } : x)));
                              void fetch(`/api/settings/rules/${encodeURIComponent(String(r.id))}`, {
                                method: 'PATCH',
                                credentials: 'same-origin',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ is_active: v ? 1 : 0 }),
                              }).catch(() => setRules(prev));
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setRuleDraft({ id: r.id, title: r.title || r.name || '', body_markdown: r.body_markdown || '' , version: r.version || 1 });
                              setRuleDrawerOpen(true);
                            }}
                            className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)] hover:text-[var(--text-main)]"
                          >
                            Edit
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* Skill drawer */}
              {skillDrawerOpen && (
                <div className="fixed inset-0 z-[250]">
                  <div className="absolute inset-0 bg-black/40" onClick={() => setSkillDrawerOpen(false)} />
                  <div className="absolute top-0 right-0 h-full w-[480px] max-w-[92vw] bg-[var(--bg-panel)] border-l border-[var(--border-subtle)] shadow-2xl flex flex-col">
                    <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between">
                      <div className="text-[12px] font-semibold text-[var(--text-heading)]">{editingSkill ? 'Edit Skill' : 'New Skill'}</div>
                      <button className="text-[11px] text-[var(--text-muted)]" onClick={() => setSkillDrawerOpen(false)}>Close</button>
                    </div>
                    <div className="p-4 flex-1 overflow-auto custom-scrollbar space-y-3">
                      <label className="flex flex-col gap-1 text-[11px]">
                        <span className="text-[var(--text-muted)]">Name</span>
                        <input value={skillDraft.name || ''} onChange={(e) => setSkillDraft((p: any) => ({ ...p, name: e.target.value }))} className="px-3 py-2 rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[12px]" />
                      </label>
                      <label className="flex flex-col gap-1 text-[11px]">
                        <span className="text-[var(--text-muted)]">Description</span>
                        <textarea rows={3} value={skillDraft.description || ''} onChange={(e) => setSkillDraft((p: any) => ({ ...p, description: e.target.value }))} className="px-3 py-2 rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[12px]" />
                      </label>
                      <div className="text-[11px] text-[var(--text-muted)]">Content (markdown)</div>
                      <div className="rounded-xl overflow-hidden border border-[var(--border-subtle)] bg-[var(--bg-app)]">
                        <Editor
                          height="300px"
                          defaultLanguage="markdown"
                          theme="vs-dark"
                          value={skillDraft.content_markdown || ''}
                          onChange={(v) => setSkillDraft((p: any) => ({ ...p, content_markdown: v || '' }))}
                          options={{ minimap: { enabled: false }, wordWrap: 'on', scrollBeyondLastLine: false }}
                        />
                      </div>
                      <label className="flex flex-col gap-1 text-[11px]">
                        <span className="text-[var(--text-muted)]">Slash trigger</span>
                        <input placeholder="/myskill" value={skillDraft.slash_trigger || ''} onChange={(e) => setSkillDraft((p: any) => ({ ...p, slash_trigger: e.target.value }))} className="px-3 py-2 rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[12px] font-mono" />
                      </label>
                      <label className="flex flex-col gap-1 text-[11px]">
                        <span className="text-[var(--text-muted)]">Globs</span>
                        <input placeholder="**/*.ts" value={skillDraft.globs || ''} onChange={(e) => setSkillDraft((p: any) => ({ ...p, globs: e.target.value }))} className="px-3 py-2 rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[12px] font-mono" />
                      </label>
                      <div className="flex items-center justify-between py-2">
                        <div className="text-[11px] text-[var(--text-muted)]">Always apply</div>
                        <Toggle on={!!skillDraft.always_apply} onChange={(v) => setSkillDraft((p: any) => ({ ...p, always_apply: v }))} />
                      </div>
                      <label className="flex flex-col gap-1 text-[11px]">
                        <span className="text-[var(--text-muted)]">Tags</span>
                        <input placeholder="tag1,tag2" value={skillDraft.tags || ''} onChange={(e) => setSkillDraft((p: any) => ({ ...p, tags: e.target.value }))} className="px-3 py-2 rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[12px]" />
                      </label>
                    </div>
                    <div className="px-4 py-3 border-t border-[var(--border-subtle)] flex items-center justify-end gap-2 bg-[var(--bg-app)]">
                      <button className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)]" onClick={() => setSkillDrawerOpen(false)}>Cancel</button>
                      <button
                        className="px-3 py-1.5 rounded-lg bg-[var(--solar-cyan)]/20 text-[11px] font-semibold text-[var(--solar-cyan)] border border-[var(--solar-cyan)]/30"
                        onClick={() => {
                          void (async () => {
                            try {
                              const payload = {
                                name: String(skillDraft.name || '').trim(),
                                description: skillDraft.description || '',
                                content_markdown: skillDraft.content_markdown || '',
                                slash_trigger: skillDraft.slash_trigger || '',
                                globs: skillDraft.globs || '',
                                always_apply: skillDraft.always_apply ? 1 : 0,
                                tags: skillDraft.tags || '',
                              };
                              if (!payload.name) throw new Error('Name required');
                              if (editingSkill?.id) {
                                const r = await fetch(`/api/settings/skills/${encodeURIComponent(String(editingSkill.id))}`, {
                                  method: 'PATCH',
                                  credentials: 'same-origin',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify(payload),
                                });
                                const j = await r.json().catch(() => ({}));
                                if (!r.ok) throw new Error(typeof j.error === 'string' ? j.error : `Save failed (${r.status})`);
                              } else {
                                const r = await fetch('/api/settings/skills', {
                                  method: 'POST',
                                  credentials: 'same-origin',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify(payload),
                                });
                                const j = await r.json().catch(() => ({}));
                                if (!r.ok) throw new Error(typeof j.error === 'string' ? j.error : `Save failed (${r.status})`);
                              }
                              setSkillDrawerOpen(false);
                              await loadSkills();
                            } catch (e) {
                              setSkillsError(e instanceof Error ? e.message : 'Save failed');
                            }
                          })();
                        }}
                      >
                        Save
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Subagent drawer */}
              {subagentDrawerOpen && (
                <div className="fixed inset-0 z-[250]">
                  <div className="absolute inset-0 bg-black/40" onClick={() => setSubagentDrawerOpen(false)} />
                  <div className="absolute top-0 right-0 h-full w-[480px] max-w-[92vw] bg-[var(--bg-panel)] border-l border-[var(--border-subtle)] shadow-2xl flex flex-col">
                    <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between">
                      <div className="text-[12px] font-semibold text-[var(--text-heading)]">Edit Subagent</div>
                      <button className="text-[11px] text-[var(--text-muted)]" onClick={() => setSubagentDrawerOpen(false)}>Close</button>
                    </div>
                    <div className="p-4 flex-1 overflow-auto custom-scrollbar space-y-3">
                      <label className="flex flex-col gap-1 text-[11px]">
                        <span className="text-[var(--text-muted)]">Display name</span>
                        <input value={subagentDraft.display_name || ''} onChange={(e) => setSubagentDraft((p: any) => ({ ...p, display_name: e.target.value }))} className="px-3 py-2 rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[12px]" />
                      </label>
                      <label className="flex flex-col gap-1 text-[11px]">
                        <span className="text-[var(--text-muted)]">Description</span>
                        <textarea rows={3} value={subagentDraft.description || ''} onChange={(e) => setSubagentDraft((p: any) => ({ ...p, description: e.target.value }))} className="px-3 py-2 rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[12px]" />
                      </label>
                      <div className="text-[11px] text-[var(--text-muted)]">Instructions (markdown)</div>
                      <div className="rounded-xl overflow-hidden border border-[var(--border-subtle)] bg-[var(--bg-app)]">
                        <Editor
                          height="300px"
                          defaultLanguage="markdown"
                          theme="vs-dark"
                          value={subagentDraft.instructions_markdown || ''}
                          onChange={(v) => setSubagentDraft((p: any) => ({ ...p, instructions_markdown: v || '' }))}
                          options={{ minimap: { enabled: false }, wordWrap: 'on', scrollBeyondLastLine: false }}
                        />
                      </div>
                      <label className="flex flex-col gap-1 text-[11px]">
                        <span className="text-[var(--text-muted)]">Default model</span>
                        <select value={subagentDraft.default_model_id || ''} onChange={(e) => setSubagentDraft((p: any) => ({ ...p, default_model_id: e.target.value }))} className="px-3 py-2 rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[12px]">
                          <option value="">—</option>
                          {modelOptions.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                      </label>
                      <label className="flex flex-col gap-1 text-[11px]">
                        <span className="text-[var(--text-muted)]">Personality tone</span>
                        <select value={subagentDraft.personality_tone || 'professional'} onChange={(e) => setSubagentDraft((p: any) => ({ ...p, personality_tone: e.target.value }))} className="px-3 py-2 rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[12px]">
                          <option value="professional">professional</option>
                          <option value="casual">casual</option>
                          <option value="technical">technical</option>
                          <option value="concise">concise</option>
                        </select>
                      </label>
                      <label className="flex flex-col gap-1 text-[11px]">
                        <span className="text-[var(--text-muted)]">Sandbox mode</span>
                        <select value={subagentDraft.sandbox_mode || 'workspace-read'} onChange={(e) => setSubagentDraft((p: any) => ({ ...p, sandbox_mode: e.target.value }))} className="px-3 py-2 rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[12px]">
                          <option value="workspace-write">workspace-write</option>
                          <option value="workspace-read">workspace-read</option>
                          <option value="isolated">isolated</option>
                        </select>
                      </label>
                      <label className="flex flex-col gap-1 text-[11px]">
                        <span className="text-[var(--text-muted)]">Reasoning effort</span>
                        <select value={subagentDraft.model_reasoning_effort || 'medium'} onChange={(e) => setSubagentDraft((p: any) => ({ ...p, model_reasoning_effort: e.target.value }))} className="px-3 py-2 rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[12px]">
                          <option value="low">low</option>
                          <option value="medium">medium</option>
                          <option value="high">high</option>
                        </select>
                      </label>
                      <div className="text-[11px] text-[var(--text-muted)]">Agent type</div>
                      <div className="text-[11px] text-[var(--text-main)] font-mono">{String(subagentDraft.agent_type || '—')}</div>
                    </div>
                    <div className="px-4 py-3 border-t border-[var(--border-subtle)] flex items-center justify-end gap-2 bg-[var(--bg-app)]">
                      <button className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)]" onClick={() => setSubagentDrawerOpen(false)}>Cancel</button>
                      <button
                        className="px-3 py-1.5 rounded-lg bg-[var(--solar-cyan)]/20 text-[11px] font-semibold text-[var(--solar-cyan)] border border-[var(--solar-cyan)]/30"
                        onClick={() => {
                          void (async () => {
                            try {
                              const id = String(subagentDraft.id || '');
                              if (!id) throw new Error('Missing subagent id');
                              const payload = {
                                display_name: subagentDraft.display_name || '',
                                description: subagentDraft.description || '',
                                instructions_markdown: subagentDraft.instructions_markdown || '',
                                default_model_id: subagentDraft.default_model_id || null,
                                personality_tone: subagentDraft.personality_tone || 'professional',
                                sandbox_mode: subagentDraft.sandbox_mode || 'workspace-read',
                                model_reasoning_effort: subagentDraft.model_reasoning_effort || 'medium',
                              };
                              const r = await fetch(`/api/settings/subagents/${encodeURIComponent(id)}`, {
                                method: 'PATCH',
                                credentials: 'same-origin',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(payload),
                              });
                              const j = await r.json().catch(() => ({}));
                              if (!r.ok) throw new Error(typeof j.error === 'string' ? j.error : `Save failed (${r.status})`);
                              setSubagentDrawerOpen(false);
                              await loadSubagents();
                            } catch (e) {
                              setSubagentsError(e instanceof Error ? e.message : 'Save failed');
                            }
                          })();
                        }}
                      >
                        Save
                      </button>
                    </div>
                  </div>
                </div>
              )}
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

          {/* ── WORKSPACE ── */}
          {activeSection === 'Workspace' && (
            <div className="flex flex-col gap-4 max-w-4xl">
              <h2 className="text-[13px] font-bold text-[var(--text-heading)] uppercase tracking-widest">Workspace</h2>
              {workspaceError2 ? <div className="text-[11px] text-red-400">{workspaceError2}</div> : null}
              {workspaceLoading2 && !workspaceData ? <div className="text-[12px] text-[var(--text-muted)]">Loading workspace…</div> : null}
              {workspaceData && (
                <div className="flex flex-col gap-3">
                  <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4">
                    <div className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">Workspace info</div>
                    <div className="mt-2 text-[18px] text-[var(--text-heading)] font-semibold">{String(workspaceData.workspace?.name || '—')}</div>
                    <div className="mt-2 flex items-center gap-2">
                      <code className="px-2 py-1 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[10px] font-mono text-[var(--solar-cyan)]">
                        {String(workspaceData.workspace?.slug || workspaceData.workspace_id || '—')}
                      </code>
                      <button
                        type="button"
                        onClick={() => navigator.clipboard.writeText(String(workspaceData.workspace?.slug || workspaceData.workspace_id || ''))}
                        className="px-2 py-1 rounded border border-[var(--border-subtle)] text-[10px] text-[var(--text-muted)] hover:text-[var(--text-main)]"
                      >
                        Copy
                      </button>
                    </div>
                    <div className="mt-2 text-[11px] text-[var(--text-muted)]">
                      Tenant: <span className="font-mono">{String(workspaceData.workspace?.tenant_id || '—')}</span>
                    </div>
                    <div className="mt-1 text-[11px] text-[var(--text-muted)]">
                      Created: {workspaceData.workspace?.created_at ? new Date(String(workspaceData.workspace.created_at)).toLocaleDateString() : '—'}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] overflow-hidden">
                    <div className="px-4 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-app)] flex items-center justify-between">
                      <div className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">Members</div>
                      <span className="text-[10px] text-[var(--text-muted)]">{Array.isArray(workspaceData.members) ? workspaceData.members.length : 0}</span>
                    </div>
                    {(Array.isArray(workspaceData.members) ? workspaceData.members : []).map((m: any) => {
                      const role = String(m.role || 'member');
                      const roleClass = role === 'owner' ? 'text-[var(--color-warning)]' : role === 'admin' ? 'text-[var(--solar-blue)]' : 'text-[var(--text-muted)]';
                      return (
                        <div key={String(m.user_id)} className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-full bg-[var(--bg-app)] border border-[var(--border-subtle)] flex items-center justify-center text-[11px] font-bold text-[var(--solar-cyan)]">
                              {initialsFromDisplayName(String(m.display_name || m.email || '?'))}
                            </div>
                            <div className="min-w-0">
                              <div className="text-[12px] text-[var(--text-main)] truncate">{String(m.display_name || '—')}</div>
                              <div className="text-[10px] text-[var(--text-muted)] truncate">{String(m.email || '—')}</div>
                            </div>
                          </div>
                          <span className={`text-[9px] px-2 py-0.5 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] font-black uppercase tracking-widest ${roleClass}`}>{role}</span>
                        </div>
                      );
                    })}
                  </div>

                  <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4">
                    <div className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">Limits</div>
                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
                      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-app)] p-3">
                        <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Max daily cost</div>
                        <div className="mt-1 text-[12px] text-[var(--text-main)] font-mono">
                          {workspaceData.workspace?.max_daily_cost_usd != null ? `$${Number(workspaceData.workspace.max_daily_cost_usd).toFixed(2)} / day` : 'No limits configured'}
                        </div>
                      </div>
                      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-app)] p-3">
                        <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Max members</div>
                        <div className="mt-1 text-[12px] text-[var(--text-main)] font-mono">
                          {workspaceData.workspace?.max_members != null ? `${Number(workspaceData.workspace.max_members)} members` : 'No limits configured'}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4">
                    <div className="flex items-center justify-between">
                      <div className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">Code index</div>
                      <button
                        type="button"
                        onClick={() => {
                          void (async () => {
                            try {
                              await fetch('/api/settings/workspace/reindex', { method: 'POST', credentials: 'same-origin' });
                            } finally {
                              void loadWorkspace();
                            }
                          })();
                        }}
                        className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)] hover:text-[var(--text-main)]"
                      >
                        Re-index
                      </button>
                    </div>
                    {workspaceData.indexJob ? (
                      <div className="mt-3 text-[11px]">
                        <div className="flex items-center gap-2">
                          {(() => {
                            const st = String(workspaceData.indexJob.status || 'idle');
                            const cls =
                              st === 'running' ? 'text-[var(--solar-blue)]' :
                              st === 'complete' ? 'text-[var(--color-success)]' :
                              st === 'error' ? 'text-[var(--color-danger)]' :
                              'text-[var(--text-muted)]';
                            const label =
                              st === 'running' ? 'Indexing…' :
                              st === 'complete' ? 'Up to date' :
                              st === 'error' ? 'Error' :
                              'Not indexed';
                            return <span className={`text-[10px] px-2 py-0.5 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] font-black uppercase tracking-widest ${cls}`}>{label}</span>;
                          })()}
                          <span className="text-[10px] text-[var(--text-muted)]">
                            {Number(workspaceData.indexJob.indexed_file_count || 0)} / {Number(workspaceData.indexJob.file_count || 0)} files
                          </span>
                        </div>
                        {String(workspaceData.indexJob.status || '') === 'running' ? (
                          <div className="mt-2 h-2 rounded-full bg-[var(--bg-app)] border border-[var(--border-subtle)] overflow-hidden">
                            <div
                              className="h-full bg-[var(--solar-cyan)]"
                              style={{ width: `${Math.max(0, Math.min(100, Number(workspaceData.indexJob.progress_percent || 0)))}%` }}
                            />
                          </div>
                        ) : null}
                        <div className="mt-2 text-[10px] text-[var(--text-muted)]">
                          Last sync: {workspaceData.indexJob.last_sync_at ? relativeTime(workspaceData.indexJob.last_sync_at) : 'Never'}
                        </div>
                        {workspaceData.indexJob.last_error ? (
                          <div className="mt-1 text-[10px] text-red-400">{String(workspaceData.indexJob.last_error)}</div>
                        ) : null}
                      </div>
                    ) : (
                      <div className="mt-3 text-[11px] text-[var(--text-muted)]">No index job found.</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── HOOKS ── */}
          {activeSection === 'Hooks' && (
            <div className="flex flex-col gap-4 max-w-5xl">
              <div className="flex items-center justify-between">
                <h2 className="text-[13px] font-bold text-[var(--text-heading)] uppercase tracking-widest">Hooks</h2>
                <button
                  type="button"
                  onClick={() => setNewHookOpen((p) => !p)}
                  className="px-3 py-1.5 rounded-lg bg-[var(--solar-cyan)]/20 text-[11px] font-semibold text-[var(--solar-cyan)] border border-[var(--solar-cyan)]/30"
                >
                  New Hook
                </button>
              </div>
              {hooksError2 ? <div className="text-[11px] text-red-400">{hooksError2}</div> : null}
              {hooksLoading2 && !hooksData ? <div className="text-[12px] text-[var(--text-muted)]">Loading hooks…</div> : null}

              {hooksData && (
                <>
                  <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] overflow-hidden">
                    <div className="grid grid-cols-7 gap-0 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] border-b border-[var(--border-subtle)] bg-[var(--bg-app)]">
                      <div className="col-span-1">Trigger</div>
                      <div className="col-span-3">Command</div>
                      <div className="col-span-1">Provider</div>
                      <div className="col-span-1">Runs</div>
                      <div className="col-span-1 text-right">Active</div>
                    </div>
                    {hooksData.hooks.map((h) => (
                      <div key={String(h.id)} className="grid grid-cols-7 gap-0 px-4 py-3 border-b border-[var(--border-subtle)] items-center text-[11px]">
                        <div className="col-span-1">
                          <span className="text-[9px] px-2 py-0.5 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[var(--text-muted)] font-mono">{String(h.trigger || '')}</span>
                        </div>
                        <div className="col-span-3 font-mono text-[10px] text-[var(--text-main)] truncate">{String(h.command || '')}</div>
                        <div className="col-span-1">
                          <span className="text-[9px] px-2 py-0.5 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[var(--text-muted)]">{String(h.provider || 'system')}</span>
                        </div>
                        <div className="col-span-1 text-[10px] text-[var(--text-muted)]">
                          {Number(h.run_count || 0)} · {h.last_ran ? relativeTime(h.last_ran) : '—'}
                        </div>
                        <div className="col-span-1 flex items-center justify-end gap-2">
                          <Toggle
                            on={!!Number(h.is_active ?? 1)}
                            onChange={(v) => {
                              const prev = hooksData;
                              setHooksData((p) => p ? ({ ...p, hooks: p.hooks.map((x) => (String(x.id) === String(h.id) ? { ...x, is_active: v ? 1 : 0 } : x)) }) : p);
                              void fetch(`/api/settings/hooks/${encodeURIComponent(String(h.id))}`, {
                                method: 'PATCH',
                                credentials: 'same-origin',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ is_active: v ? 1 : 0 }),
                              }).catch(() => setHooksData(prev));
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const ok = window.confirm('Delete this hook? This cannot be undone.');
                              if (!ok) return;
                              const prev = hooksData;
                              setHooksData((p) => p ? ({ ...p, hooks: p.hooks.filter((x) => String(x.id) !== String(h.id)) }) : p);
                              void fetch(`/api/settings/hooks/${encodeURIComponent(String(h.id))}`, {
                                method: 'DELETE',
                                credentials: 'same-origin',
                              }).catch(() => setHooksData(prev));
                            }}
                            className="text-[10px] px-2 py-1 rounded border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-red-400 hover:border-red-400/40"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {newHookOpen && (
                    <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4">
                      <div className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-3">New Hook</div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <label className="flex flex-col gap-1 text-[11px]">
                          <span className="text-[var(--text-muted)]">Trigger</span>
                          <select value={newHookDraft.trigger} onChange={(e) => setNewHookDraft((p) => ({ ...p, trigger: e.target.value }))} className="px-3 py-2 rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[12px]">
                            {['pre_tool_call','post_tool_call','pre_message','post_message','on_error','on_deploy'].map((t) => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </label>
                        <label className="flex flex-col gap-1 text-[11px] md:col-span-2">
                          <span className="text-[var(--text-muted)]">Command</span>
                          <input value={newHookDraft.command} onChange={(e) => setNewHookDraft((p) => ({ ...p, command: e.target.value }))} className="px-3 py-2 rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[12px] font-mono" />
                        </label>
                        <label className="flex flex-col gap-1 text-[11px]">
                          <span className="text-[var(--text-muted)]">Provider</span>
                          <select value={newHookDraft.provider} onChange={(e) => setNewHookDraft((p) => ({ ...p, provider: e.target.value }))} className="px-3 py-2 rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[12px]">
                            {['system','github','resend','custom'].map((p) => <option key={p} value={p}>{p}</option>)}
                          </select>
                        </label>
                      </div>
                      <div className="mt-3 flex items-center justify-end gap-2">
                        <button className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)]" onClick={() => setNewHookOpen(false)}>Cancel</button>
                        <button
                          className="px-3 py-1.5 rounded-lg bg-[var(--solar-cyan)]/20 text-[11px] font-semibold text-[var(--solar-cyan)] border border-[var(--solar-cyan)]/30"
                          onClick={() => {
                            void (async () => {
                              try {
                                const r = await fetch('/api/settings/hooks', {
                                  method: 'POST',
                                  credentials: 'same-origin',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ ...newHookDraft }),
                                });
                                const j = await r.json().catch(() => ({}));
                                if (!r.ok) throw new Error(typeof j.error === 'string' ? j.error : `Save failed (${r.status})`);
                                setNewHookOpen(false);
                                setNewHookDraft({ trigger: 'pre_tool_call', command: '', provider: 'system' });
                                await loadHooks();
                              } catch (e) {
                                setHooksError2(e instanceof Error ? e.message : 'Save failed');
                              }
                            })();
                          }}
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="border-t border-[var(--border-subtle)] pt-3">
                    <div className="text-[12px] font-semibold text-[var(--text-main)]">Recent Executions</div>
                    <div className="mt-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] overflow-hidden">
                      <div className="grid grid-cols-5 gap-0 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] border-b border-[var(--border-subtle)] bg-[var(--bg-app)]">
                        <div className="col-span-1">Status</div>
                        <div className="col-span-1">Ran</div>
                        <div className="col-span-1">Duration</div>
                        <div className="col-span-2">Error</div>
                      </div>
                      {(hooksData.executions || []).map((e: any, i: number) => {
                        const st = String(e.status || 'success');
                        const cls =
                          st === 'success' ? 'text-[var(--color-success)]' :
                          st === 'timeout' ? 'text-[var(--color-warning)]' :
                          'text-[var(--color-danger)]';
                        return (
                          <div key={String(e.id || i)} className="grid grid-cols-5 gap-0 px-4 py-3 border-b border-[var(--border-subtle)] text-[11px] items-center">
                            <div className="col-span-1"><span className={`text-[9px] px-2 py-0.5 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] font-black uppercase tracking-widest ${cls}`}>{st}</span></div>
                            <div className="col-span-1 text-[10px] text-[var(--text-muted)]">{e.ran_at ? relativeTime(e.ran_at) : '—'}</div>
                            <div className="col-span-1 text-[10px] text-[var(--text-muted)] font-mono">{Number(e.duration_ms || 0)}ms</div>
                            <div className="col-span-2 text-[10px] text-red-400 truncate">{String(e.error || '').slice(0, 60)}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
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
            <div className="flex flex-col gap-6 max-w-3xl">
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
                <div className="flex items-center justify-between">
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Active sessions</h3>
                  <button
                    type="button"
                    disabled={sessionsLoading}
                    onClick={() => void loadSecurity()}
                    className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)] hover:text-[var(--text-main)] disabled:opacity-40"
                  >
                    Refresh
                  </button>
                </div>
                {sessionsError ? <div className="text-[11px] text-red-400">{sessionsError}</div> : null}
                <div className="rounded-xl border border-[var(--border-subtle)] overflow-hidden bg-[var(--bg-panel)]">
                  <div className="grid grid-cols-6 gap-0 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] border-b border-[var(--border-subtle)] bg-[var(--bg-app)]">
                    <div className="col-span-1">Provider</div>
                    <div className="col-span-1">IP</div>
                    <div className="col-span-2">Agent</div>
                    <div className="col-span-1">Active</div>
                    <div className="col-span-1 text-right">Actions</div>
                  </div>
                  {sessions.map((s) => {
                    const ua = String(s.user_agent || '');
                    const browser = ua.includes('Chrome') ? 'Chrome' : ua.includes('Firefox') ? 'Firefox' : ua.slice(0, 30);
                    return (
                      <div key={String(s.id)} className="grid grid-cols-6 gap-0 px-4 py-3 border-b border-[var(--border-subtle)] items-center text-[11px]">
                        <div className="col-span-1">
                          <span className="text-[9px] px-2 py-0.5 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[var(--text-muted)] font-black uppercase tracking-widest">
                            {String(s.provider || 'email')}
                          </span>
                        </div>
                        <div className="col-span-1 text-[10px] text-[var(--text-muted)] font-mono truncate">{String(s.ip_address || '—')}</div>
                        <div className="col-span-2 text-[10px] text-[var(--text-muted)] truncate">{browser || '—'}</div>
                        <div className="col-span-1 text-[10px] text-[var(--text-muted)]">{s.last_active_at ? relativeTime(s.last_active_at) : '—'}</div>
                        <div className="col-span-1 flex justify-end">
                          <button
                            type="button"
                            onClick={() => {
                              const prev = sessions;
                              setSessions((p) => p.filter((x) => String(x.id) !== String(s.id)));
                              void fetch(`/api/settings/security/sessions/${encodeURIComponent(String(s.id))}`, {
                                method: 'DELETE',
                                credentials: 'same-origin',
                              }).catch(() => setSessions(prev));
                            }}
                            className="text-[10px] px-2 py-1 rounded border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-red-400 hover:border-red-400/40"
                          >
                            Revoke
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const toRevoke = sessions.slice(1);
                    void (async () => {
                      for (const s of toRevoke) {
                        await fetch(`/api/settings/security/sessions/${encodeURIComponent(String(s.id))}`, { method: 'DELETE', credentials: 'same-origin' }).catch(() => null);
                      }
                      void loadSecurity();
                    })();
                  }}
                  className="px-3 py-2 rounded-lg border border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)] hover:text-[var(--text-main)]"
                >
                  Revoke All Other Sessions
                </button>
              </section>

              <section className="space-y-2 p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)]">
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">MCP Auth Token</h3>
                <div className="flex items-center justify-between">
                  <div className="text-[11px] text-[var(--text-muted)]">MCP Auth Token</div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-[var(--text-muted)] font-mono">••••••••••••</span>
                    <span className="text-[9px] px-2 py-0.5 rounded bg-[var(--color-success)]/10 text-[var(--color-success)] border border-[var(--color-success)]/30 font-black uppercase tracking-widest">Active</span>
                    <button
                      type="button"
                      title="Contact admin to rotate"
                      className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)]"
                    >
                      Rotate
                    </button>
                  </div>
                </div>
              </section>

              <section className="space-y-2 p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)]">
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Security findings</h3>
                {findings.length === 0 ? (
                  <div className="rounded-xl border border-[var(--color-success)]/30 bg-[var(--color-success)]/5 p-3 text-[11px] text-[var(--color-success)]">
                    No security findings detected
                  </div>
                ) : (
                  <div className="rounded-xl border border-[var(--border-subtle)] overflow-hidden bg-[var(--bg-panel)]">
                    <div className="grid grid-cols-5 gap-0 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] border-b border-[var(--border-subtle)] bg-[var(--bg-app)]">
                      <div className="col-span-1">Severity</div>
                      <div className="col-span-2">Title</div>
                      <div className="col-span-1">Date</div>
                      <div className="col-span-1">Info</div>
                    </div>
                    {findings.map((f, i) => (
                      <div key={String(f.id || i)} className="grid grid-cols-5 gap-0 px-4 py-3 border-b border-[var(--border-subtle)] text-[11px] items-center">
                        <div className="col-span-1">
                          <span className="text-[9px] px-2 py-0.5 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[var(--text-muted)] font-black uppercase tracking-widest">
                            {String(f.severity || 'info')}
                          </span>
                        </div>
                        <div className="col-span-2 text-[var(--text-main)] truncate">{String(f.title || '')}</div>
                        <div className="col-span-1 text-[10px] text-[var(--text-muted)]">{f.created_at ? new Date(String(f.created_at)).toLocaleDateString() : '—'}</div>
                        <div className="col-span-1 text-[10px] text-[var(--text-muted)] truncate">{String(f.description || '').slice(0, 40)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}

          {/* ── PLAN & USAGE ── */}
          {activeSection === 'Plan & Usage' && (
            <div className="flex flex-col gap-4 max-w-6xl">
              <h2 className="text-[13px] font-bold text-[var(--text-heading)] uppercase tracking-widest">Plan &amp; Usage</h2>
              {usageError ? <div className="text-[11px] text-red-400">{usageError}</div> : null}
              {usageLoading && !usageData ? <div className="text-[12px] text-[var(--text-muted)]">Loading usage…</div> : null}
              {usageData && (
                <>
                  <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4">
                    <div className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                      Period: {new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' })}
                    </div>
                    {(() => {
                      const summary = Array.isArray(usageData.summary) ? usageData.summary : [];
                      const total = summary.reduce((acc: number, r: any) => acc + Number(r.cost_usd || 0), 0);
                      const input = summary.reduce((acc: number, r: any) => acc + Number(r.input_tokens || 0), 0);
                      const output = summary.reduce((acc: number, r: any) => acc + Number(r.output_tokens || 0), 0);
                      const calls = summary.reduce((acc: number, r: any) => acc + Number(r.call_count || 0), 0);
                      return (
                        <>
                          <div className="mt-2 text-[26px] font-semibold text-[var(--solar-cyan)]">${total.toFixed(2)}</div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <span className="text-[10px] px-2 py-1 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[var(--text-muted)] font-mono">{input.toLocaleString()} input</span>
                            <span className="text-[10px] px-2 py-1 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[var(--text-muted)] font-mono">{output.toLocaleString()} output</span>
                            <span className="text-[10px] px-2 py-1 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[var(--text-muted)] font-mono">{calls.toLocaleString()} calls</span>
                          </div>
                        </>
                      );
                    })()}
                    <div className="mt-4 rounded-xl border border-[var(--border-subtle)] overflow-hidden bg-[var(--bg-panel)]">
                      <div className="grid grid-cols-6 gap-0 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] border-b border-[var(--border-subtle)] bg-[var(--bg-app)]">
                        <div className="col-span-2">Model</div>
                        <div className="col-span-1">Provider</div>
                        <div className="col-span-1">Input</div>
                        <div className="col-span-1">Output</div>
                        <div className="col-span-1 text-right">Cost</div>
                      </div>
                      {(Array.isArray(usageData.summary) ? usageData.summary : []).map((r: any, i: number) => (
                        <div key={`${r.model_used || i}`} className="grid grid-cols-6 gap-0 px-4 py-3 border-b border-[var(--border-subtle)] text-[11px] items-center">
                          <div className="col-span-2 text-[var(--text-main)] truncate">{String(r.model_used || '—')}</div>
                          <div className="col-span-1 text-[var(--text-muted)]">{String(r.provider || '—')}</div>
                          <div className="col-span-1 text-[10px] text-[var(--text-muted)] font-mono">{Number(r.input_tokens || 0).toLocaleString()}</div>
                          <div className="col-span-1 text-[10px] text-[var(--text-muted)] font-mono">{Number(r.output_tokens || 0).toLocaleString()}</div>
                          <div className="col-span-1 text-right text-[10px] text-[var(--text-muted)] font-mono">${Number(r.cost_usd || 0).toFixed(2)}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4">
                    <div className="flex items-center justify-between">
                      <div className="text-[12px] font-semibold text-[var(--text-main)]">Spend Ledger</div>
                      <div className="flex items-center gap-2">
                        <select value={usageProvider} onChange={(e) => { setUsageProvider(e.target.value); setUsagePage(1); void loadUsage(1, e.target.value, usageModel); }} className="px-3 py-2 rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[11px]">
                          <option value="">All providers</option>
                          {Array.from(new Set((Array.isArray(usageData.summary) ? usageData.summary : []).map((x: any) => String(x.provider || '')).filter(Boolean))).map((p: string) => <option key={p} value={p}>{p}</option>)}
                        </select>
                        <select value={usageModel} onChange={(e) => { setUsageModel(e.target.value); setUsagePage(1); void loadUsage(1, usageProvider, e.target.value); }} className="px-3 py-2 rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[11px]">
                          <option value="">All models</option>
                          {Array.from(new Set((Array.isArray(usageData.summary) ? usageData.summary : []).map((x: any) => String(x.model_used || '')).filter(Boolean))).map((m: string) => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="mt-3 rounded-xl border border-[var(--border-subtle)] overflow-hidden bg-[var(--bg-panel)]">
                      <div className="grid grid-cols-6 gap-0 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] border-b border-[var(--border-subtle)] bg-[var(--bg-app)]">
                        <div className="col-span-1">Date</div>
                        <div className="col-span-2">Model</div>
                        <div className="col-span-1">Provider</div>
                        <div className="col-span-1">Tokens</div>
                        <div className="col-span-1 text-right">Cost</div>
                      </div>
                      {(Array.isArray(usageData.ledger) ? usageData.ledger : []).map((r: any, i: number) => (
                        <div key={String(r.id || i)} className="grid grid-cols-6 gap-0 px-4 py-3 border-b border-[var(--border-subtle)] text-[11px] items-center">
                          <div className="col-span-1 text-[10px] text-[var(--text-muted)]">{r.created_at ? new Date(String(r.created_at)).toLocaleDateString() : '—'}</div>
                          <div className="col-span-2 text-[var(--text-main)] truncate">{String(r.model_used || '—')}</div>
                          <div className="col-span-1 text-[var(--text-muted)]">{String(r.provider || '—')}</div>
                          <div className="col-span-1 text-[10px] text-[var(--text-muted)] font-mono">{Number(r.input_tokens || 0) + Number(r.output_tokens || 0)}</div>
                          <div className="col-span-1 text-right text-[10px] text-[var(--text-muted)] font-mono">${Number(r.cost_usd || 0).toFixed(4)}</div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <button className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)]" onClick={() => { const p = Math.max(1, usagePage - 1); setUsagePage(p); void loadUsage(p, usageProvider, usageModel); }}>← Prev</button>
                      <div className="text-[11px] text-[var(--text-muted)]">Page {usagePage}</div>
                      <button className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)]" onClick={() => { const p = usagePage + 1; setUsagePage(p); void loadUsage(p, usageProvider, usageModel); }}>Next →</button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4">
                      <div className="text-[12px] font-semibold text-[var(--text-main)]">Budget</div>
                      <div className="mt-3 flex flex-col gap-3">
                        <label className="flex flex-col gap-1 text-[11px]">
                          <span className="text-[var(--text-muted)]">Monthly Limit (USD)</span>
                          <input
                            value={budgetMonthlyLimit}
                            onChange={(e) => setBudgetMonthlyLimit(e.target.value)}
                            onBlur={() => {
                              void (async () => {
                                try {
                                  await patchProfile([{ setting_key: 'budget.monthly_limit_usd', setting_value: String(budgetMonthlyLimit || '') }]);
                                } catch (e) {
                                  setUsageError(e instanceof Error ? e.message : 'Save failed');
                                }
                              })();
                            }}
                            className="px-3 py-2 rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[12px] font-mono"
                            inputMode="decimal"
                          />
                        </label>
                        <div className="flex items-center justify-between">
                          <div className="text-[11px] text-[var(--text-muted)]">Hard stop when limit reached</div>
                          <Toggle
                            on={budgetHardStop}
                            onChange={(v) => {
                              setBudgetHardStop(v);
                              void patchProfile([{ setting_key: 'budget.hard_stop', setting_value: v ? 'true' : 'false' }]).catch(() => setBudgetHardStop(!v));
                            }}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4">
                      <div className="text-[12px] font-semibold text-[var(--text-main)]">Billing</div>
                      <div className="mt-3 text-[11px] text-[var(--text-muted)]">
                        Plan: <span className="text-[var(--text-main)] font-mono">{formatPlanLabel(profilePlan)}</span>
                      </div>
                      <div className="mt-2">
                        <a href="/dashboard/billing" className="text-[11px] text-[var(--solar-cyan)] hover:underline">
                          Manage Billing →
                        </a>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── NOTIFICATIONS ── */}
          {activeSection === 'Notifications' && (
            <div className="flex flex-col gap-4 max-w-3xl">
              <h2 className="text-[13px] font-bold text-[var(--text-heading)] uppercase tracking-widest">Notifications</h2>
              {notifyError ? <div className="text-[11px] text-red-400">{notifyError}</div> : null}
              {notifyLoading ? <div className="text-[12px] text-[var(--text-muted)]">Loading…</div> : null}
              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] overflow-hidden">
                {[
                  { key: 'notify.deploy_success', label: 'Deployment Success', desc: 'Email when a deploy completes successfully' },
                  { key: 'notify.deploy_failure', label: 'Deployment Failure', desc: 'Email when a deploy fails or errors' },
                  { key: 'notify.agent_error', label: 'Agent Error', desc: 'Email when an agent run hits an unhandled error' },
                  { key: 'notify.spend_threshold', label: 'Spend Alert', desc: 'Email when monthly spend exceeds your limit' },
                  { key: 'notify.benchmark_fail', label: 'Benchmark Failure', desc: 'Email when a benchmark run regresses' },
                ].map((row) => {
                  const on = String(notifyPrefs[row.key] || 'false') === 'true';
                  return (
                    <div key={row.key} className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
                      <div className="min-w-0 pr-3">
                        <div className="text-[12px] font-semibold text-[var(--text-main)]">{row.label}</div>
                        <div className="text-[11px] text-[var(--text-muted)] mt-0.5">{row.desc}</div>
                      </div>
                      <Toggle
                        on={on}
                        onChange={(v) => {
                          const prev = notifyPrefs;
                          setNotifyPrefs((p) => ({ ...p, [row.key]: v ? 'true' : 'false' }));
                          void patchProfile([{ setting_key: row.key, setting_value: v ? 'true' : 'false' }]).catch(() => setNotifyPrefs(prev));
                        }}
                      />
                    </div>
                  );
                })}

                <div className="px-4 py-4 border-t border-[var(--border-subtle)] bg-[var(--bg-app)]">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Webhook</div>
                  <div className="text-[11px] text-[var(--text-muted)] mt-1">POST request sent for all enabled events</div>
                  <input
                    className="mt-2 w-full px-3 py-2 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] text-[12px] font-mono"
                    placeholder="https://…"
                    value={notifyWebhookUrl}
                    onChange={(e) => setNotifyWebhookUrl(e.target.value)}
                    onBlur={() => {
                      const v = notifyWebhookUrl;
                      void patchProfile([{ setting_key: 'notify.webhook_url', setting_value: v }]).catch(() => null);
                    }}
                  />
                </div>

                <div className="px-4 py-4 border-t border-[var(--border-subtle)]">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Notification email</div>
                  <div className="mt-2 text-[12px] text-[var(--text-muted)]">{profileEmail || '—'}</div>
                </div>
              </div>
            </div>
          )}

          {/* ── DOCS ── */}
          {activeSection === 'Docs' && (
            <div className="flex flex-col gap-5 max-w-3xl">
              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-subtle)]">
                  <div className="flex items-center gap-3 min-w-0">
                    <img
                      src="https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/ac515729-af6b-4ea5-8b10-e581a4d02100/thumbnail"
                      alt="Inner Animal Media"
                      className="h-7 w-auto opacity-90"
                    />
                    <div className="w-px h-6 bg-[var(--border-subtle)]" />
                    <div className="flex items-center gap-2 min-w-0">
                      <img
                        src="https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/c9b5b05f-c84a-43c0-cf7e-ffea9c758800/avatar"
                        alt="InnerAutodidact"
                        className="h-7 w-7 rounded-full"
                      />
                      <span className="text-[10px] tracking-[0.2em] uppercase text-[var(--solar-cyan)] truncate">
                        InnerAutodidact
                      </span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[10px] tracking-[0.2em] uppercase text-[var(--text-muted)]">Platform Guide</div>
                    <div className="text-[11px] text-[var(--solar-cyan)] mt-0.5">v1.0 — April 2026</div>
                  </div>
                </div>

                <div className="px-5 py-6">
                  <div className="text-[10px] tracking-[0.3em] uppercase text-[var(--text-muted)] mb-3">
                    Platform Documentation
                  </div>
                  <div className="text-[26px] leading-[1.15] font-[400] text-[var(--text-heading)]">
                    Everything your workspace
                    <br />
                    can <span className="text-[var(--solar-cyan)]">do for you</span>
                  </div>
                  <p className="text-[12px] text-[var(--text-muted)] mt-3 max-w-xl leading-[1.8]">
                    Inner Animal Media is a full‑stack AI development platform built on Cloudflare infrastructure.
                    This guide highlights core capabilities—Agent Sam, terminal, knowledge/RAG, storage, deploy, and access.
                  </p>
                </div>

                <div className="flex flex-wrap gap-1 px-4 pb-4">
                  {[
                    'Overview',
                    'Agent Sam',
                    'Terminal',
                    'Knowledge',
                    'Storage',
                    'Deploy',
                    'Mail',
                    'Access',
                  ].map((label) => (
                    <span
                      key={label}
                      className="px-3 py-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-app)] text-[10px] tracking-[0.2em] uppercase text-[var(--text-muted)]"
                    >
                      {label}
                    </span>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { num: '8', desc: 'Core platform modules' },
                  { num: '100%', desc: 'Cloudflare-native infrastructure' },
                  { num: '6+', desc: 'AI providers integrated' },
                ].map((c) => (
                  <div key={c.desc} className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-app)] p-4">
                    <div className="text-[24px] font-semibold leading-none text-[var(--solar-cyan)]">{c.num}</div>
                    <div className="text-[11px] text-[var(--text-muted)] mt-1">{c.desc}</div>
                  </div>
                ))}
              </div>

              <div className="rounded-2xl border border-[var(--solar-cyan)]/40 bg-[var(--bg-app)] p-5 flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                <img
                  src="https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/c9b5b05f-c84a-43c0-cf7e-ffea9c758800/avatar"
                  alt="InnerAutodidact"
                  className="h-14 w-14 rounded-full shrink-0"
                />
                <div className="min-w-0">
                  <div className="text-[16px] text-[var(--text-heading)] font-semibold">
                    You&apos;re learning on <span className="text-[var(--solar-cyan)]">InnerAutodidact</span>
                  </div>
                  <p className="text-[12px] text-[var(--text-muted)] mt-1 leading-[1.8]">
                    InnerAutodidact is the educational arm of Inner Animal Media—a structured environment for builders who learn by doing.
                    Your Agent Sam assistant, terminal access, and knowledge base are calibrated to your skill level and goals.
                  </p>
                </div>
              </div>

              <section className="space-y-3">
                <div className="text-[10px] tracking-[0.3em] uppercase text-[var(--solar-cyan)] border-b border-[var(--border-subtle)] pb-2">
                  01 — Agent Sam
                </div>
                <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] overflow-hidden">
                  <div className="flex items-start gap-4 px-5 py-4 border-b border-[var(--border-subtle)]">
                    <div className="h-10 w-10 rounded-xl border border-[var(--solar-cyan)] bg-[var(--bg-app)] flex items-center justify-center text-[12px] text-[var(--solar-cyan)] shrink-0">
                      ⟡
                    </div>
                    <div className="min-w-0">
                      <div className="text-[15px] text-[var(--text-heading)] font-semibold">Agent Sam — Your AI Development Partner</div>
                      <div className="text-[10px] tracking-[0.2em] uppercase text-[var(--solar-cyan)] mt-0.5">
                        Multi‑provider · Context‑aware · Tool‑enabled
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5 px-5 py-4">
                    <div>
                      <div className="text-[10px] tracking-[0.2em] uppercase text-[var(--text-muted)] mb-2">What it does</div>
                      <p className="text-[12px] text-[var(--text-muted)] leading-[1.8]">
                        Routes each request to the best available model and can safely interact with your workspace via configured tools
                        (terminal, database, storage, GitHub, MCP) with protections and allowlists.
                      </p>
                    </div>
                    <div>
                      <div className="text-[10px] tracking-[0.2em] uppercase text-[var(--text-muted)] mb-2">Capabilities</div>
                      <ul className="space-y-1 text-[12px] text-[var(--text-muted)]">
                        {[
                          'Multi-provider model routing (Claude, OpenAI, Google, local)',
                          'Terminal execution (PTY)',
                          'D1 read/write',
                          'R2 file management',
                          'GitHub integration',
                          'Semantic memory & retrieval (RAG)',
                        ].map((t) => (
                          <li key={t} className="flex gap-2">
                            <span className="text-[var(--solar-cyan)] mt-[1px]">▸</span>
                            <span className="min-w-0">{t}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </section>

              <section className="space-y-3">
                <div className="text-[10px] tracking-[0.3em] uppercase text-[var(--solar-cyan)] border-b border-[var(--border-subtle)] pb-2">
                  02 — Knowledge &amp; RAG
                </div>
                <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] overflow-hidden">
                  <div className="flex items-start gap-4 px-5 py-4 border-b border-[var(--border-subtle)]">
                    <div className="h-10 w-10 rounded-xl border border-[var(--solar-cyan)] bg-[var(--bg-app)] flex items-center justify-center text-[12px] text-[var(--solar-cyan)] shrink-0">
                      ◈
                    </div>
                    <div className="min-w-0">
                      <div className="text-[15px] text-[var(--text-heading)] font-semibold">Knowledge Base &amp; Semantic Search</div>
                      <div className="text-[10px] tracking-[0.2em] uppercase text-[var(--solar-cyan)] mt-0.5">
                        Embeddings · Vector search · Session compaction
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5 px-5 py-4">
                    <div>
                      <div className="text-[10px] tracking-[0.2em] uppercase text-[var(--text-muted)] mb-2">What it does</div>
                      <p className="text-[12px] text-[var(--text-muted)] leading-[1.8]">
                        Your docs and notes can be ingested, chunked, embedded, and retrieved via semantic similarity—powering long‑term memory
                        and precise context injection for Agent Sam.
                      </p>
                    </div>
                    <div>
                      <div className="text-[10px] tracking-[0.2em] uppercase text-[var(--text-muted)] mb-2">Capabilities</div>
                      <ul className="space-y-1 text-[12px] text-[var(--text-muted)]">
                        {[
                          'Ingest and search across documents',
                          'Unified retrieval across sessions + knowledge',
                          'Tenant-isolated memory profiles',
                          'Analytics for search/usage',
                        ].map((t) => (
                          <li key={t} className="flex gap-2">
                            <span className="text-[var(--solar-cyan)] mt-[1px]">▸</span>
                            <span className="min-w-0">{t}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </section>

              <section className="space-y-3">
                <div className="text-[10px] tracking-[0.3em] uppercase text-[var(--solar-cyan)] border-b border-[var(--border-subtle)] pb-2">
                  03 — Storage &amp; Deployment
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-5">
                    <div className="text-[14px] text-[var(--text-heading)] font-semibold">R2 Storage Management</div>
                    <div className="text-[11px] text-[var(--text-muted)] mt-1 leading-[1.8]">
                      Browse and manage files across R2 buckets from the dashboard. Buckets power assets, docs, email templates/archives, and AI knowledge.
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-1 text-[12px] text-[var(--text-muted)]">
                      {[
                        'agent-sam — dashboard static bundle',
                        'inneranimalmedia-assets — public assets',
                        'iam-docs — documentation',
                        'inneranimalmedia-autorag — knowledge files',
                        'inneranimalmedia-email-archive — templates + archives',
                      ].map((t) => (
                        <div key={t} className="flex gap-2">
                          <span className="text-[var(--solar-cyan)] mt-[1px]">▸</span>
                          <span className="min-w-0">{t}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-5">
                    <div className="text-[14px] text-[var(--text-heading)] font-semibold">Deployment Pipeline</div>
                    <div className="text-[11px] text-[var(--text-muted)] mt-1 leading-[1.8]">
                      Push-to-deploy CI/CD. Sandbox first, then promote to production.
                    </div>
                    <pre className="mt-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-app)] p-3 text-[11px] text-[var(--solar-cyan)] overflow-x-auto">
{`# sandbox first
./scripts/deploy-sandbox.sh

# promote to production
./scripts/promote-to-prod.sh

# or push direct
git push origin production`}
                    </pre>
                  </div>
                </div>
              </section>

              <section className="space-y-3">
                <div className="text-[10px] tracking-[0.3em] uppercase text-[var(--solar-cyan)] border-b border-[var(--border-subtle)] pb-2">
                  04 — Access
                </div>
                <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] overflow-hidden">
                  <div className="grid grid-cols-3 gap-0 text-[10px] tracking-[0.2em] uppercase text-[var(--text-muted)] bg-[var(--bg-app)] border-b border-[var(--border-subtle)]">
                    <div className="px-4 py-3">Feature</div>
                    <div className="px-4 py-3">Path</div>
                    <div className="px-4 py-3">Notes</div>
                  </div>
                  {[
                    ['Main Dashboard', '/dashboard/overview', 'Requires login'],
                    ['Agent Sam', '/dashboard/agent', 'Full AI + editor + terminal'],
                    ['Database', '/dashboard/database', 'D1 browser'],
                    ['Storage', '/dashboard/storage', 'R2 explorer'],
                    ['Mail', '/dashboard/mail', 'Compose + templates'],
                    ['MCP & AI', '/dashboard/mcp', 'Tools + services'],
                    ['Onboarding', '/onboarding', 'Token-gated intake'],
                  ].map(([a, b, c]) => (
                    <div key={a} className="grid grid-cols-3 gap-0 border-b border-[var(--border-subtle)] last:border-b-0">
                      <div className="px-4 py-3 text-[12px] text-[var(--text-heading)]">{a}</div>
                      <div className="px-4 py-3 text-[11px] text-[var(--solar-cyan)] font-mono break-all">{b}</div>
                      <div className="px-4 py-3 text-[12px] text-[var(--text-muted)]">{c}</div>
                    </div>
                  ))}
                </div>
              </section>

              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-5 flex items-center justify-between gap-3">
                <img
                  src="https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/ac515729-af6b-4ea5-8b10-e581a4d02100/thumbnail"
                  alt="Inner Animal Media"
                  className="h-7 w-auto opacity-70"
                />
                <div className="text-right">
                  <div className="text-[10px] text-[var(--text-muted)] tracking-wide">Inner Animal Media — Lafayette, Louisiana</div>
                  <a
                    href="https://inneranimalmedia.com"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] text-[var(--solar-cyan)] hover:underline"
                  >
                    inneranimalmedia.com
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* ── Other sections — placeholder ── */}
          {!['General','Agents','AI Models','Tools & MCP','Rules & Skills','Workspace','Hooks','GitHub','CI/CD','Network','Themes','Storage','Security','Plan & Usage','Notifications','Docs'].includes(activeSection) && (
            <div className="flex flex-col items-center justify-center h-40 gap-3 text-[var(--text-muted)]">
              <Package size={28} className="opacity-30" />
              <p className="text-[12px]">{activeSection} settings coming soon.</p>
            </div>
          )}

        </div>
      </div>

    </div>
  );
};

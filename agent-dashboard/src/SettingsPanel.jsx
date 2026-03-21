import { useState, useEffect, useRef, useCallback } from "react";

// ─────────────────────────────────────────────────────────────
// SettingsPanel — drop into FloatingPreviewPanel settings tab
// Props: availableCommands, runCommandRunnerRef, connectedIntegrations
// Requires: /api/env/* routes live on worker, VAULT_KEY set
// ─────────────────────────────────────────────────────────────

function SettingsRow({ label, description, control }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "10px 0", borderBottom: "1px solid var(--border)",
    }}>
      <div>
        <div style={{ fontSize: 12, color: "var(--text-primary)", fontWeight: 500 }}>{label}</div>
        {description && (
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{description}</div>
        )}
      </div>
      <div style={{ flexShrink: 0, marginLeft: 16 }}>{control}</div>
    </div>
  );
}

function ToggleSwitch({ defaultOn = false }) {
  const [on, setOn] = useState(defaultOn);
  return (
    <button
      type="button"
      onClick={() => setOn((v) => !v)}
      style={{
        width: 32, height: 18, borderRadius: 9,
        background: on ? "var(--accent)" : "var(--border)",
        border: "none", cursor: "pointer", position: "relative",
        transition: "background 150ms", flexShrink: 0,
      }}
    >
      <span
        style={{
          position: "absolute", top: 2,
          left: on ? 16 : 2, width: 14, height: 14,
          borderRadius: "50%", background: "var(--text-primary)",
          transition: "left 150ms",
        }}
      />
    </button>
  );
}

const NAV_GROUPS = [
  {
    label: "WORKSPACE",
    icon: (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="3" width="14" height="11" rx="1" />
        <path d="M5 3V2a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" />
        <line x1="1" y1="7" x2="15" y2="7" />
      </svg>
    ),
    items: [
      { id: "general", label: "General" },
      { id: "spend", label: "Usage & Spend" },
      { id: "agents", label: "Agents" },
    ],
  },
  {
    label: "TOOLS",
    icon: (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13.5 2.5a2 2 0 0 0-2.83 0L9 4.17 11.83 7l1.67-1.67a2 2 0 0 0 0-2.83z" />
        <path d="M9 4.17L3.5 9.67a2 2 0 0 0 0 2.83 2 2 0 0 0 2.83 0L11.83 7z" />
        <line x1="2" y1="14" x2="5" y2="11" />
      </svg>
    ),
    items: [
      { id: "extensions", label: "Extensions" },
      { id: "commands", label: "Commands" },
    ],
  },
  {
    label: "DEPLOY",
    icon: (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 1c0 0 4 2.5 4 7a4 4 0 0 1-8 0c0-4.5 4-7 4-7z" />
        <circle cx="8" cy="8" r="1.5" fill="currentColor" stroke="none" />
        <line x1="8" y1="12" x2="8" y2="15" />
        <line x1="5.5" y1="13.5" x2="3" y2="15" />
        <line x1="10.5" y1="13.5" x2="13" y2="15" />
      </svg>
    ),
    items: [
      { id: "wrangler", label: "Wrangler" },
      { id: "workers", label: "Workers" },
      { id: "d1", label: "Data" },
    ],
  },
  {
    label: "SECURITY",
    icon: (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 1L2 4v4c0 3.5 2.5 6 6 7 3.5-1 6-3.5 6-7V4z" />
      </svg>
    ),
    items: [
      { id: "environment", label: "Environment" },
      { id: "providers", label: "Providers" },
      { id: "guardrails", label: "Guardrails" },
    ],
  },
  {
    label: "CONTEXT",
    icon: (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 1a5 5 0 0 1 2 9.5V12H6v-1.5A5 5 0 0 1 8 1z" />
        <line x1="6" y1="13" x2="10" y2="13" />
        <line x1="7" y1="15" x2="9" y2="15" />
      </svg>
    ),
    items: [
      { id: "github", label: "GitHub" },
    ],
  },
];

const PROVIDER_COLORS = {
  anthropic:  "#c48aff",
  openai:     "#19c37d",
  google:     "#4285f4",
  cloudflare: "#f6821f",
  stripe:     "#635bff",
  github:     "#8b949e",
  other:      "var(--text-secondary)",
};

function timeAgo(dateStr) {
  if (!dateStr) return "never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const d = Math.floor(diff / 86400000);
  if (d === 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 30) return `${d}d ago`;
  if (d < 365) return `${Math.floor(d / 30)}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
}

function runCmd(runCommandRunnerRef, cmd) {
  runCommandRunnerRef?.current?.runCommandInTerminal?.(cmd);
}

// ── Shared UI atoms ──────────────────────────────────────────

function Btn({ onClick, variant = "ghost", size = "sm", disabled, children, style }) {
  const base = {
    border: "none", borderRadius: 4, cursor: disabled ? "not-allowed" : "pointer",
    fontFamily: "inherit", fontWeight: 500, opacity: disabled ? 0.5 : 1,
    transition: "opacity 150ms, background 150ms",
    padding: size === "sm" ? "4px 10px" : "6px 14px",
    fontSize: size === "sm" ? 11 : 12,
    ...style,
  };
  const variants = {
    primary: { background: "var(--accent)", color: "var(--bg-canvas)" },
    danger:  { background: "var(--bg-danger, #7d1f2a)", color: "var(--text-danger, #f7a8b0)", border: "1px solid var(--border-danger, #cf667940)" },
    ghost:   { background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-secondary)" },
    inline:  { background: "transparent", border: "1px solid var(--border)", color: "var(--text-secondary)", padding: "2px 6px", fontSize: 10 },
  };
  return (
    <button type="button" disabled={disabled} onClick={onClick}
      style={{ ...base, ...variants[variant] }}>
      {children}
    </button>
  );
}

function StatusDot({ status }) {
  const colors = { ok: "var(--color-success, #4caf86)", fail: "var(--color-error, #cf6679)", untested: "var(--text-muted, #64748b)", checking: "var(--color-warning, #f0a040)" };
  return (
    <span style={{
      display: "inline-block", width: 7, height: 7, borderRadius: "50%",
      background: colors[status] || colors.untested, flexShrink: 0,
      animation: status === "checking" ? "spPulse 1.2s infinite" : "none",
    }} />
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em",
      color: "var(--text-secondary)", marginBottom: 6, paddingBottom: 4,
      borderBottom: "1px solid var(--border)" }}>
      {children}
    </div>
  );
}

function Modal({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 9999,
      display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)",
        borderRadius: 8, padding: 16, minWidth: 340, maxWidth: 480, width: "90vw",
        maxHeight: "80vh", overflowY: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
          marginBottom: 14, fontWeight: 600, fontSize: 13, color: "var(--text-primary)" }}>
          <span>{title}</span>
          <button type="button" onClick={onClose}
            style={{ background: "none", border: "none", color: "var(--text-secondary)",
              fontSize: 18, cursor: "pointer", lineHeight: 1, padding: "0 4px" }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Input({ value, onChange, placeholder, type = "text", style }) {
  return (
    <input type={type} value={value} onChange={onChange} placeholder={placeholder}
      style={{ background: "var(--bg-canvas)", border: "1px solid var(--border)",
        color: "var(--text-primary)", padding: "6px 8px", borderRadius: 4,
        fontFamily: "inherit", fontSize: 11, width: "100%", boxSizing: "border-box",
        outline: "none", ...style }} />
  );
}

// ── Environment Tab ──────────────────────────────────────────

function EnvironmentTab({ runCommandRunnerRef }) {
  const [secrets, setSecrets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [vaultOk, setVaultOk] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditLog, setAuditLog] = useState([]);
  const [revealModal, setRevealModal] = useState(null);
  const [revealValue, setRevealValue] = useState("");
  const [revealCountdown, setRevealCountdown] = useState(30);
  const [rollModal, setRollModal] = useState(null);
  const [rollValue, setRollValue] = useState("");
  const [rollNote, setRollNote] = useState("");
  const [newKey, setNewKey] = useState({ key_name: "", value: "", provider: "", label: "" });
  const [saving, setSaving] = useState(false);
  const [rolling, setRolling] = useState(false);
  const revealTimerRef = useRef(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/env/secrets", { credentials: "same-origin" })
      .then(r => r.json())
      .then(d => { setSecrets(d.secrets || []); setVaultOk(true); })
      .catch(() => setVaultOk(false))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const reveal = async (keyName) => {
    setRevealModal(keyName); setRevealValue("Decrypting...");
    const r = await fetch("/api/env/secrets/reveal", {
      method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key_name: keyName }),
    });
    const d = await r.json();
    setRevealValue(d.value || d.error || "Failed");
    let t = 30; setRevealCountdown(t);
    clearInterval(revealTimerRef.current);
    revealTimerRef.current = setInterval(() => {
      t--; setRevealCountdown(t);
      if (t <= 0) { clearInterval(revealTimerRef.current); setRevealModal(null); }
    }, 1000);
  };

  const roll = async () => {
    if (!rollValue.trim()) return;
    setRolling(true);
    const r = await fetch(`/api/env/secrets/${rollModal}`, {
      method: "PATCH", credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: rollValue, note: rollNote }),
    });
    const d = await r.json();
    if (d.success) { setRollModal(null); setRollValue(""); setRollNote(""); load(); }
    setRolling(false);
  };

  const addSecret = async () => {
    if (!newKey.key_name || !newKey.value || !newKey.provider) return;
    setSaving(true);
    const r = await fetch("/api/env/secrets", {
      method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newKey),
    });
    const d = await r.json();
    if (d.success) { setShowAdd(false); setNewKey({ key_name: "", value: "", provider: "", label: "" }); load(); }
    setSaving(false);
  };

  const testSecret = async (keyName, setStatus) => {
    setStatus("checking");
    const r = await fetch(`/api/env/secrets/test/${keyName}`, { method: "POST", credentials: "same-origin" });
    const d = await r.json();
    setStatus(d.status);
    load();
  };

  const loadAudit = async () => {
    const r = await fetch("/api/env/audit?limit=100", { credentials: "same-origin" });
    const d = await r.json();
    setAuditLog(d.log || []);
    setAuditOpen(true);
  };

  const byProvider = secrets.reduce((acc, s) => {
    const p = s.provider || "other";
    if (!acc[p]) acc[p] = [];
    acc[p].push(s);
    return acc;
  }, {});

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <Btn variant="primary" onClick={() => setShowAdd(v => !v)}>+ Add Secret</Btn>
        <Btn onClick={loadAudit}>Audit Log</Btn>
        <span style={{ marginLeft: "auto", fontSize: 10, fontFamily: "monospace",
          padding: "2px 6px", borderRadius: 3,
          background: vaultOk === null ? "var(--bg-elevated)" : vaultOk ? "var(--bg-success, #0d2b1a)" : "var(--bg-danger-muted, #2b0d0d)",
          color: vaultOk === null ? "var(--text-secondary)" : vaultOk ? "var(--color-success, #4caf86)" : "var(--color-error, #cf6679)",
          border: `1px solid ${vaultOk === null ? "transparent" : vaultOk ? "var(--border-success, #4caf8640)" : "var(--border-danger, #cf667940)"}` }}>
          {vaultOk === null ? "checking..." : vaultOk ? "vault ok" : "VAULT_KEY missing"}
        </span>
      </div>

      {/* Add form */}
      {showAdd && (
        <div style={{ background: "var(--bg-canvas)", border: "1px solid var(--border)",
          borderRadius: 6, padding: 12, marginBottom: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 6 }}>
            <Input value={newKey.key_name} placeholder="KEY_NAME"
              onChange={e => setNewKey(v => ({ ...v, key_name: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g,"_") }))} />
            <select value={newKey.provider}
              onChange={e => setNewKey(v => ({ ...v, provider: e.target.value }))}
              style={{ background: "var(--bg-canvas)", border: "1px solid var(--border)",
                color: "var(--text-primary)", padding: "6px 8px", borderRadius: 4, fontSize: 11, fontFamily: "inherit" }}>
              <option value="">provider</option>
              {["anthropic","openai","google","cloudflare","stripe","github","other"].map(p =>
                <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <Input value={newKey.label} placeholder="Display label (optional)"
            onChange={e => setNewKey(v => ({ ...v, label: e.target.value }))} />
          <Input type="password" value={newKey.value} placeholder="Secret value"
            onChange={e => setNewKey(v => ({ ...v, value: e.target.value }))} />
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
            <Btn variant="primary" disabled={saving} onClick={addSecret}>{saving ? "Saving..." : "Save Encrypted"}</Btn>
            <Btn onClick={() => setShowAdd(false)}>Cancel</Btn>
          </div>
        </div>
      )}

      {/* Secrets list */}
      {loading ? (
        <div style={{ color: "var(--text-secondary)", fontSize: 11, textAlign: "center", padding: 20 }}>Loading...</div>
      ) : secrets.length === 0 ? (
        <div style={{ color: "var(--text-secondary)", fontSize: 11, textAlign: "center", padding: 20 }}>
          No secrets yet. Click + Add Secret to get started.
        </div>
      ) : (
        Object.entries(byProvider).map(([provider, items]) => (
          <div key={provider} style={{ marginBottom: 16 }}>
            <SectionLabel>{provider}</SectionLabel>
            {items.map(s => <SecretCard key={s.key_name} secret={s} onReveal={reveal} onRoll={setRollModal} onTest={testSecret} />)}
          </div>
        ))
      )}

      {/* Reveal modal */}
      <Modal open={!!revealModal} onClose={() => { setRevealModal(null); clearInterval(revealTimerRef.current); }} title={`Reveal — ${revealModal}`}>
        <div style={{ fontSize: 10, color: "var(--color-warning, #f0a040)", background: "var(--bg-warning-muted, #2b1d00)",
          padding: "4px 8px", borderRadius: 4, marginBottom: 10 }}>
          Auto-hides in {revealCountdown}s
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <code style={{ flex: 1, wordBreak: "break-all", fontSize: 11, background: "var(--bg-canvas)",
            padding: 8, borderRadius: 4, border: "1px solid var(--border)", color: "var(--color-success, #4caf86)",
            fontFamily: "monospace", display: "block" }}>{revealValue}</code>
          <Btn variant="inline" onClick={() => navigator.clipboard.writeText(revealValue)}>Copy</Btn>
        </div>
      </Modal>

      {/* Roll modal */}
      <Modal open={!!rollModal} onClose={() => { setRollModal(null); setRollValue(""); setRollNote(""); }} title={`Roll — ${rollModal}`}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Input type="password" value={rollValue} placeholder="New secret value"
            onChange={e => setRollValue(e.target.value)} />
          <Input value={rollNote} placeholder="Reason (optional)" onChange={e => setRollNote(e.target.value)} />
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
            <Btn variant="danger" disabled={rolling || !rollValue.trim()} onClick={roll}>
              {rolling ? "Rolling..." : "Rotate Secret"}
            </Btn>
            <Btn onClick={() => setRollModal(null)}>Cancel</Btn>
          </div>
        </div>
      </Modal>

      {/* Audit modal */}
      <Modal open={auditOpen} onClose={() => setAuditOpen(false)} title="Audit Log">
        {auditLog.length === 0 ? (
          <div style={{ color: "var(--text-secondary)", fontSize: 11, textAlign: "center", padding: 16 }}>No events yet</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
            <thead>
              <tr>{["Time","Key","Action","Note"].map(h => (
                <th key={h} style={{ textAlign: "left", padding: "4px 6px", borderBottom: "1px solid var(--border)",
                  color: "var(--text-secondary)", textTransform: "uppercase", fontSize: 9, letterSpacing: "0.06em" }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {auditLog.map((e, i) => (
                <tr key={i}>
                  <td style={{ padding: "4px 6px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)", fontFamily: "monospace", whiteSpace: "nowrap" }}>
                    {new Date(e.ts).toLocaleString()}
                  </td>
                  <td style={{ padding: "4px 6px", borderBottom: "1px solid var(--border)", color: "var(--text-primary)", fontFamily: "monospace" }}>{e.key_name}</td>
                  <td style={{ padding: "4px 6px", borderBottom: "1px solid var(--border)", fontFamily: "monospace",
                    color: { read: "var(--text-secondary)", rotate: "var(--color-warning, #f0a040)", create: "var(--color-success, #4caf86)", delete: "var(--color-error, #cf6679)" }[e.action] || "var(--text-secondary)" }}>
                    {e.action}
                  </td>
                  <td style={{ padding: "4px 6px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)" }}>{e.note || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Modal>
    </div>
  );
}

function SecretCard({ secret: s, onReveal, onRoll, onTest }) {
  const [testStatus, setTestStatus] = useState(s.test_status || "untested");
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: 8,
      borderRadius: 6, background: "var(--bg-elevated)", border: "1px solid var(--border)",
      marginBottom: 4, opacity: s.is_active ? 1 : 0.4 }}>
      <StatusDot status={testStatus} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 11, color: "var(--text-primary)",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.key_name}</div>
        <div style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 2 }}>
          {s.label || s.key_name} · {timeAgo(s.last_rotated_at)}
        </div>
      </div>
      <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
        <Btn variant="inline" onClick={() => onReveal(s.key_name)}>reveal</Btn>
        <Btn variant="inline" onClick={() => onRoll(s.key_name)}>roll</Btn>
        <Btn variant="inline" onClick={() => onTest(s.key_name, setTestStatus)}>test</Btn>
      </div>
    </div>
  );
}

// ── Wrangler Tab ─────────────────────────────────────────────

function WranglerTab({ runCommandRunnerRef, onDeployStart, onDeployComplete }) {
  const [deployOpen, setDeployOpen] = useState(false);
  const REPO = "/Users/samprimeaux/Downloads/march1st-inneranimalmedia";
  const CONFIG = `${REPO}/wrangler.production.toml`;

  const fire = (cmd) => runCmd(runCommandRunnerRef, cmd);

  const quickCmds = [
    { label: "whoami",       cmd: `wrangler whoami --config ${CONFIG}` },
    { label: "list secrets", cmd: `wrangler secret list --config ${CONFIG}` },
    { label: "deployments",  cmd: `wrangler deployments list --config ${CONFIG}` },
    { label: "tail logs",    cmd: `wrangler tail --config ${CONFIG}` },
    { label: "bindings",     cmd: `cat ${CONFIG} | grep -A2 "\\[\\[" | head -60` },
    { label: "git status",   cmd: `cd ${REPO} && git status && git log --oneline -5` },
    { label: "git branch",   cmd: `cd ${REPO} && git branch -a` },
  ];

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
      {/* Context strip */}
      <div style={{ background: "var(--bg-success, #0d2b1a)", border: "1px solid var(--border-success, #4caf8630)", borderRadius: 6,
        padding: "8px 10px", marginBottom: 16, fontSize: 10, fontFamily: "monospace",
        color: "var(--color-success, #4caf86)", lineHeight: 1.6 }}>
        <div>config: <span style={{ color: "var(--text-primary)" }}>wrangler.production.toml</span></div>
        <div>worker: <span style={{ color: "var(--text-primary)" }}>inneranimalmedia</span></div>
        <div>db: <span style={{ color: "var(--text-primary)" }}>inneranimalmedia-business (cf87b717)</span></div>
      </div>

      <SectionLabel>Quick Commands</SectionLabel>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 16 }}>
        {quickCmds.map(({ label, cmd }) => (
          <button key={label} type="button" onClick={() => fire(cmd)}
            style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)",
              color: "var(--text-secondary)", padding: "4px 8px", borderRadius: 4,
              cursor: "pointer", fontFamily: "monospace", fontSize: 10 }}>
            {label}
          </button>
        ))}
      </div>

      <SectionLabel>Deploy</SectionLabel>
      <div style={{ marginBottom: 16 }}>
        <Btn variant="danger" style={{ width: "100%", textAlign: "center" }}
          onClick={() => setDeployOpen(true)}>
          Deploy to Production
        </Btn>
      </div>

      <SectionLabel>Rollback</SectionLabel>
      <Btn onClick={() => fire(`wrangler rollback --config ${CONFIG}`)}>
        List + Rollback Options
      </Btn>

      {/* Deploy confirm */}
      <Modal open={deployOpen} onClose={() => setDeployOpen(false)} title="Confirm Deploy">
        <div style={{ fontSize: 11, color: "var(--text-secondary)", background: "var(--bg-canvas)",
          padding: 10, borderRadius: 4, border: "1px solid var(--border)", marginBottom: 12, lineHeight: 1.6 }}>
          <div>Directory: <code style={{ color: "var(--color-warning, #f0a040)" }}>march1st-inneranimalmedia</code></div>
          <div>Config: <code style={{ color: "var(--color-warning, #f0a040)" }}>wrangler.production.toml</code></div>
          <div>Command: <code style={{ color: "var(--color-warning, #f0a040)" }}>npm run deploy</code></div>
        </div>
        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
          <Btn
            variant="danger"
            onClick={async () => {
              setDeployOpen(false);
              const pillId = onDeployStart?.("inneranimalmedia");
              const t0 = Date.now();
              let success = false;
              let versionId = "";
              try {
                const result = await runCommandRunnerRef?.current?.runCommandInTerminal?.(`cd ${REPO} && npm run deploy`);
                const out = `${result?.output || ""}\n${result?.error || ""}`;
                const vm = out.match(/Current Version ID:\s*([a-f0-9-]+)/i) || out.match(/Version ID:\s*([a-f0-9-]+)/i);
                versionId = vm ? vm[1] : "";
                success = !!(result?.ok && /Uploaded|Deployed|Current Version ID/i.test(out));
                if (result?.error || !result?.ok) success = false;
              } catch (_) {
                success = false;
              }
              if (pillId != null) onDeployComplete?.(pillId, success, versionId || undefined, Date.now() - t0);
            }}
          >
            Yes, Deploy
          </Btn>
          <Btn onClick={() => setDeployOpen(false)}>Cancel</Btn>
        </div>
      </Modal>
    </div>
  );
}

// ── Workers Tab ──────────────────────────────────────────────

function WorkersTab({ runCommandRunnerRef }) {
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/workers", { credentials: "same-origin" })
      .then(r => r.json())
      .then(d => setWorkers(d.workers || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const priorityColor = { critical: "var(--color-error, #cf6679)", high: "var(--color-warning, #f0a040)", medium: "var(--color-success, #4caf86)", low: "var(--text-secondary)" };

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
      <SectionLabel>Active Workers ({workers.length})</SectionLabel>
      {loading ? (
        <div style={{ color: "var(--text-secondary)", fontSize: 11, padding: 12, textAlign: "center" }}>Loading...</div>
      ) : (
        workers.map(w => (
          <div key={w.script_name || w.worker_name}
            style={{ padding: 8, borderRadius: 6, background: "var(--bg-elevated)",
              border: "1px solid var(--border)", marginBottom: 4,
              display: "flex", alignItems: "center", gap: 8 }}>
            <StatusDot status="ok" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 11, color: "var(--text-primary)",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {w.script_name || w.worker_name}
              </div>
              <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>
                {w.worker_type || "worker"} · {timeAgo(w.last_deployment)}
              </div>
            </div>
            <span style={{ fontSize: 9, color: priorityColor[w.priority] || "var(--text-secondary)",
              textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {w.priority || ""}
            </span>
            <Btn variant="inline" onClick={() => runCmd(runCommandRunnerRef,
              `wrangler tail ${w.script_name || w.worker_name} --config /Users/samprimeaux/Downloads/march1st-inneranimalmedia/wrangler.production.toml`)}>
              tail
            </Btn>
          </div>
        ))
      )}
    </div>
  );
}

// ── D1 Tab ───────────────────────────────────────────────────

function D1Tab() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState([]);

  const suggestions = [
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
    "SELECT key, value FROM project_memory WHERE project_id='inneranimalmedia' ORDER BY updated_at DESC LIMIT 10",
    "SELECT * FROM env_audit_log ORDER BY ts DESC LIMIT 20",
    "SELECT * FROM env_secrets ORDER BY provider, key_name",
    "SELECT * FROM spend_ledger ORDER BY occurred_at DESC LIMIT 20",
    "SELECT worker_name, deployment_status, priority FROM worker_registry ORDER BY priority",
    "SELECT id, title, status FROM roadmap_steps ORDER BY id",
  ];

  const run = async (sql) => {
    const q = sql || query.trim();
    if (!q) return;
    setRunning(true); setError(null); setResults(null);
    try {
      const r = await fetch("/api/d1/query", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql: q }),
      });
      const d = await r.json();
      if (d.error) { setError(d.error); }
      else { setResults(d.results || d); setHistory(h => [q, ...h.slice(0, 9)]); }
    } catch (e) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", padding: 16 }}>
      <SectionLabel>D1 Query Runner — inneranimalmedia-business</SectionLabel>

      {/* Suggestions */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
        {suggestions.slice(0,4).map((s, i) => (
          <button key={i} type="button" onClick={() => setQuery(s)}
            style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)",
              color: "var(--text-secondary)", padding: "3px 7px", borderRadius: 4,
              cursor: "pointer", fontFamily: "monospace", fontSize: 9,
              whiteSpace: "nowrap", overflow: "hidden", maxWidth: 160, textOverflow: "ellipsis" }}>
            {s.slice(0, 28)}...
          </button>
        ))}
      </div>

      {/* Query input */}
      <textarea value={query} onChange={e => setQuery(e.target.value)}
        onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") run(); }}
        placeholder="SELECT * FROM ... — Cmd+Enter to run"
        style={{ background: "var(--bg-canvas)", border: "1px solid var(--border)",
          color: "var(--text-primary)", padding: 8, borderRadius: 4, fontFamily: "monospace",
          fontSize: 11, resize: "vertical", minHeight: 80, outline: "none",
          marginBottom: 8, width: "100%", boxSizing: "border-box" }} />
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        <Btn variant="primary" disabled={running || !query.trim()} onClick={() => run()}>
          {running ? "Running..." : "Run Query"}
        </Btn>
        <Btn onClick={() => { setQuery(""); setResults(null); setError(null); }}>Clear</Btn>
      </div>

      {/* Error */}
      {error && (
        <div style={{ background: "var(--bg-danger-muted, #2b0d0d)", border: "1px solid var(--border-danger, #cf667940)", borderRadius: 4,
          padding: 8, fontSize: 11, color: "var(--color-error, #cf6679)", marginBottom: 8, fontFamily: "monospace" }}>
          {error}
        </div>
      )}

      {/* Results */}
      {results && Array.isArray(results) && results.length > 0 && (
        <div style={{ flex: 1, overflow: "auto" }}>
          <div style={{ fontSize: 10, color: "var(--text-secondary)", marginBottom: 4 }}>
            {results.length} row{results.length !== 1 ? "s" : ""}
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10, fontFamily: "monospace" }}>
            <thead>
              <tr>{Object.keys(results[0]).map(k => (
                <th key={k} style={{ textAlign: "left", padding: "4px 6px",
                  borderBottom: "1px solid var(--border)", color: "var(--text-secondary)",
                  whiteSpace: "nowrap", fontSize: 9, textTransform: "uppercase" }}>{k}</th>
              ))}</tr>
            </thead>
            <tbody>
              {results.map((row, i) => (
                <tr key={i}>
                  {Object.values(row).map((v, j) => (
                    <td key={j} style={{ padding: "4px 6px", borderBottom: "1px solid var(--border)",
                      color: "var(--text-primary)", maxWidth: 200, overflow: "hidden",
                      textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {v === null ? <span style={{ color: "var(--text-secondary)" }}>null</span> : String(v)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {results && Array.isArray(results) && results.length === 0 && (
        <div style={{ color: "var(--text-secondary)", fontSize: 11, padding: 12, textAlign: "center" }}>
          Query returned 0 rows
        </div>
      )}
    </div>
  );
}

// ── Integrations Tab ─────────────────────────────────────────

function IntegrationsTab({ connectedIntegrations }) {
  const integrations = [
    { key: "google",     label: "Google Drive",   authUrl: "/api/oauth/google/start"  },
    { key: "github",     label: "GitHub",         authUrl: "/api/oauth/github/start"  },
    { key: "supabase",   label: "Supabase / Hyperdrive", authUrl: null               },
    { key: "mcp",        label: "MCP Connections", authUrl: null                      },
  ];

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
      <SectionLabel>Connection Status</SectionLabel>
      {integrations.map(({ key, label, authUrl }) => {
        const connected = connectedIntegrations?.[key];
        return (
          <div key={key} style={{ display: "flex", alignItems: "center", gap: 10, padding: 10,
            borderRadius: 6, background: "var(--bg-elevated)", border: "1px solid var(--border)",
            marginBottom: 6 }}>
            <StatusDot status={connected ? "ok" : "fail"} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>{label}</div>
              <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>
                {connected ? "Connected" : "Not connected"}
              </div>
            </div>
            {!connected && authUrl && (
              <Btn variant="primary" size="sm"
                onClick={() => window.open(authUrl, "_blank", "width=600,height=700")}>
                Connect
              </Btn>
            )}
            {key === "mcp" && (
              <Btn size="sm" onClick={() => window.location.href = "/dashboard/mcp"}>
                Manage
              </Btn>
            )}
          </div>
        );
      })}

      <div style={{ marginTop: 16 }}>
        <SectionLabel>Supabase / Hyperdrive Setup</SectionLabel>
        <div style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.6,
          background: "var(--bg-canvas)", padding: 10, borderRadius: 4, border: "1px solid var(--border)" }}>
          Hyperdrive binding pending. Add to wrangler.production.toml once Supabase instance is ready.
          Then add SUPABASE_URL and SUPABASE_KEY via the Environment tab.
        </div>
      </div>
    </div>
  );
}

// ── Spend Tab ────────────────────────────────────────────────

function SpendTab() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("daily"); // daily | provider | model

  useEffect(() => {
    fetch("/api/env/spend?limit=100", { credentials: "same-origin" })
      .then(r => r.json())
      .then(d => setRows(d.rows || d.results || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Aggregate by provider from whatever we have
  const byProvider = rows.reduce((acc, r) => {
    const p = r.provider || "unknown";
    acc[p] = (acc[p] || 0) + parseFloat(r.amount_usd || 0);
    return acc;
  }, {});

  const total = Object.values(byProvider).reduce((a, b) => a + b, 0);

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
      <SectionLabel>AI Spend — spend_ledger</SectionLabel>

      {loading ? (
        <div style={{ color: "var(--text-secondary)", fontSize: 11, textAlign: "center", padding: 20 }}>Loading...</div>
      ) : rows.length === 0 ? (
        <div style={{ color: "var(--text-secondary)", fontSize: 11, textAlign: "center", padding: 20 }}>
          No spend data yet
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>
              ${total.toFixed(4)}
            </div>
            <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>total tracked spend</div>
          </div>

          {Object.entries(byProvider).sort((a, b) => b[1] - a[1]).map(([provider, amt]) => (
            <div key={provider} style={{ marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                <span style={{ fontSize: 11, color: "var(--text-primary)", textTransform: "capitalize" }}>{provider}</span>
                <span style={{ fontSize: 11, fontFamily: "monospace", color: PROVIDER_COLORS[provider] || "var(--text-secondary)" }}>
                  ${amt.toFixed(4)}
                </span>
              </div>
              <div style={{ height: 4, borderRadius: 2, background: "var(--bg-elevated)", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${(amt / total) * 100}%`,
                  background: PROVIDER_COLORS[provider] || "var(--accent)", borderRadius: 2, transition: "width 400ms" }} />
              </div>
            </div>
          ))}
        </>
      )}

      <div style={{ marginTop: 16 }}>
        <Btn onClick={() => window.location.href = "/dashboard/finance"}>
          Full Finance Dashboard →
        </Btn>
      </div>
    </div>
  );
}

// ── Providers Tab ────────────────────────────────────────────

function ProvidersTab() {
  const [secrets, setSecrets] = useState([]);

  useEffect(() => {
    fetch("/api/env/secrets", { credentials: "same-origin" })
      .then(r => r.json())
      .then(d => setSecrets(d.secrets || []))
      .catch(() => {});
  }, []);

  const byProvider = secrets.reduce((acc, s) => {
    const p = s.provider || "other";
    if (!acc[p]) acc[p] = { total: 0, ok: 0, untested: 0 };
    acc[p].total++;
    if (s.test_status === "ok") acc[p].ok++;
    else if (!s.test_status || s.test_status === "untested") acc[p].untested++;
    return acc;
  }, {});

  const providerDefs = [
    { key: "anthropic", label: "Anthropic",   models: ["claude-opus-4-6", "claude-sonnet-4-6"] },
    { key: "openai",    label: "OpenAI",       models: ["gpt-4o", "gpt-4o-mini"] },
    { key: "google",    label: "Google",       models: ["gemini-2.0-flash", "gemini-1.5-pro"] },
    { key: "cloudflare",label: "Workers AI",   models: ["@cf/meta/llama-3.3-70b-instruct-fp8-fast"] },
  ];

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
      {providerDefs.map(({ key, label, models }) => {
        const stats = byProvider[key];
        return (
          <div key={key} style={{ padding: 10, borderRadius: 6, background: "var(--bg-elevated)",
            border: "1px solid var(--border)", marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <StatusDot status={stats?.ok > 0 ? "ok" : stats ? "untested" : "fail"} />
              <div style={{ flex: 1, fontWeight: 600, fontSize: 12, color: "var(--text-primary)" }}>{label}</div>
              <span style={{ fontSize: 10, color: PROVIDER_COLORS[key] }}>
                {stats ? `${stats.ok}/${stats.total} keys ok` : "no keys"}
              </span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {models.map(m => (
                <span key={m} style={{ fontSize: 9, padding: "2px 5px", borderRadius: 3,
                  background: "var(--bg-canvas)", border: "1px solid var(--border)",
                  color: "var(--text-secondary)", fontFamily: "monospace" }}>{m}</span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Guardrails Tab ───────────────────────────────────────────

function GuardrailsTab() {
  const rules = [
    { name: "No auto-deploy",        desc: "Agent must ask Sam for confirmation before any wrangler deploy", enforced: true },
    { name: "No secret deletion",    desc: "Agent cannot delete secrets — only Sam via Settings UI", enforced: true },
    { name: "No naked wrangler",     desc: "All wrangler commands must include --config wrangler.production.toml", enforced: true },
    { name: "Exposed key detection", desc: "If a secret pattern appears in chat → warning banner + Roll button", enforced: true },
    { name: "Remote-only R2 ops",    desc: "All R2 reads/writes use --remote flag. No local file paths.", enforced: true },
    { name: "Verify before claim",   desc: "Agent must show raw output proof before reporting success", enforced: true },
    { name: "No wasted loops",       desc: "If a command fails twice — stop, report exact error, don't retry", enforced: true },
    { name: "Workspace lock",        desc: "Before any wrangler command: show current dir + git branch + confirm", enforced: true },
    { name: "D1 verify post-deploy", desc: "SELECT from deployments after every deploy to confirm version ID", enforced: true },
  ];

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
      <SectionLabel>Enforcement Rules</SectionLabel>
      {rules.map(r => (
        <div key={r.name} style={{ padding: "8px 10px", borderRadius: 5,
          background: "var(--bg-elevated)", borderLeft: "3px solid var(--color-success, #4caf86)",
          marginBottom: 6 }}>
          <div style={{ fontWeight: 600, fontSize: 11, color: "var(--text-primary)", marginBottom: 2 }}>{r.name}</div>
          <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>{r.desc}</div>
        </div>
      ))}
    </div>
  );
}

// ── Commands Tab (existing, preserved) ───────────────────────

function CommandsTab({ availableCommands }) {
  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
      <h3 style={{ margin: "0 0 16px 0", fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>Commands</h3>
      <div style={{ marginBottom: 24 }}>
        {availableCommands.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>No commands loaded. Type /help in chat.</div>
        ) : (
          availableCommands.map((cmd) => (
            <div key={cmd.command_name || cmd.trigger || cmd.description}
              style={{ padding: 12, border: "1px solid var(--border)", borderRadius: 6,
                marginBottom: 8, background: "var(--bg-canvas)" }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)" }}>
                /{cmd.command_name || cmd.trigger || "command"}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>
                {cmd.description || "No description."}
              </div>
            </div>
          ))
        )}
      </div>
      <h3 style={{ margin: "0 0 12px 0", fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>Keyboard Shortcuts</h3>
      <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.8 }}>
        <div>Cmd+K — Open settings</div>
        <div>Cmd+/ — Focus chat input</div>
        <div>Esc — Close panels</div>
      </div>
    </div>
  );
}

function GeneralTab() {
  return (
    <div style={{ padding: 16, overflowY: "auto", flex: 1 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>
        Workspace Settings
      </div>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 20 }}>
        Sam Primeaux Workspace · inneranimalmedia
      </div>

      <SettingsRow
        label="Active Theme"
        description="Controls all CSS variables across the dashboard"
        control={
          <a href="/dashboard/user-settings" style={{ fontSize: 11, color: "var(--accent)", textDecoration: "none" }}>
            Manage in User Settings →
          </a>
        }
      />

      <SettingsRow
        label="Default Agent"
        description="Agent used for new conversations"
        control={
          <span style={{ fontSize: 11, color: "var(--text-secondary)", fontFamily: "monospace" }}>
            level AI · Auto
          </span>
        }
      />

      <SettingsRow
        label="Default Model"
        description="Model routing for this workspace"
        control={
          <span style={{ fontSize: 11, color: "var(--text-secondary)", fontFamily: "monospace" }}>
            Auto (claude-sonnet)
          </span>
        }
      />

      <SettingsRow
        label="Auto-clear sessions"
        description="Start fresh conversation after 24h inactivity"
        control={<ToggleSwitch defaultOn />}
      />

      <div style={{
        marginTop: 20, padding: 10, background: "var(--bg-canvas)",
        border: "1px solid var(--border)", borderRadius: 4, fontFamily: "monospace",
        fontSize: 10, color: "var(--text-muted)",
      }}>
        workspace: tenant_sam_primeaux · worker: inneranimalmedia ·
        d1: cf87b717
      </div>
    </div>
  );
}

function AgentsTab() {
  return (
    <div style={{ padding: 16, overflowY: "auto", flex: 1 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>
        Agent Configuration
      </div>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 20 }}>
        Configure agents available in this workspace
      </div>

      <div style={{
        background: "var(--bg-canvas)", border: "1px solid var(--border)",
        borderRadius: 6, padding: 12, marginBottom: 8,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>Agent Sam</div>
          <span style={{
            fontSize: 10, padding: "2px 8px",
            background: "var(--bg-elevated)", border: "1px solid var(--accent)",
            color: "var(--accent)", borderRadius: 10,
          }}>Active</span>
        </div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8 }}>
          level AI · Auto routing · Inner Animal Media context
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {["Tools: 30", "Commands: 77", "MCP: 25 services"].map((tag) => (
            <span
              key={tag}
              style={{
                fontSize: 10, padding: "2px 6px",
                background: "var(--bg-elevated)", color: "var(--text-muted)",
                borderRadius: 4, border: "1px solid var(--border)",
              }}
            >{tag}</span>
          ))}
        </div>
      </div>

      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 12 }}>
        Additional agent profiles coming next sprint.
        Configure model permissions and tool access per agent.
      </div>
    </div>
  );
}

// ── Root component ───────────────────────────────────────────

export default function SettingsPanel({
  availableCommands,
  runCommandRunnerRef,
  connectedIntegrations,
  onOpenInBrowser,
  settingsGithubSlot,
  onDeployStart,
  onDeployComplete,
}) {
  const [tab, setTab] = useState("environment");

  const tabContent = {
    general: <GeneralTab />,
    agents: <AgentsTab />,
    extensions: <IntegrationsTab connectedIntegrations={connectedIntegrations} />,
    commands: <CommandsTab availableCommands={availableCommands || []} />,
    wrangler: (
      <WranglerTab
        runCommandRunnerRef={runCommandRunnerRef}
        onDeployStart={onDeployStart}
        onDeployComplete={onDeployComplete}
      />
    ),
    workers: <WorkersTab runCommandRunnerRef={runCommandRunnerRef} />,
    d1: <D1Tab />,
    environment: <EnvironmentTab runCommandRunnerRef={runCommandRunnerRef} />,
    providers: <ProvidersTab />,
    guardrails: <GuardrailsTab />,
    github: settingsGithubSlot || (
      <div style={{ flex: 1, padding: 16, color: "var(--text-muted)", fontSize: 12 }}>
        GitHub browser unavailable.
      </div>
    ),
    spend: <SpendTab />,
  };

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {tabContent[tab]}
      </div>

      <div
        style={{
          width: "min(160px, 35%)",
          flexShrink: 0,
          background: "var(--bg-canvas)",
          borderLeft: "1px solid var(--border)",
          overflowY: "auto",
          padding: "8px 0",
        }}
      >
        {NAV_GROUPS.map((group, groupIndex) => (
          <div key={group.label} style={{ marginBottom: 4 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--text-secondary)",
                padding: "10px 10px 4px",
                marginTop: groupIndex === 0 ? 0 : 4,
                borderTop: groupIndex === 0 ? "none" : "1px solid var(--border)",
              }}
            >
              <span style={{ display: "flex", alignItems: "center", opacity: 0.7 }}>
                {group.icon}
              </span>
              <span>{group.label}</span>
            </div>
            {group.items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  background: tab === item.id ? "var(--bg-elevated)" : "none",
                  border: "none",
                  borderRight: tab === item.id ? "2px solid var(--accent)" : "2px solid transparent",
                  color: tab === item.id ? "var(--text-primary)" : "var(--text-secondary)",
                  padding: "6px 16px 6px 10px",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  fontSize: 13,
                  transition: "all 120ms",
                }}
                onMouseEnter={(e) => {
                  if (tab !== item.id) {
                    e.currentTarget.style.background = "var(--bg-elevated)";
                    e.currentTarget.style.color = "var(--text-primary)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (tab !== item.id) {
                    e.currentTarget.style.background = "none";
                    e.currentTarget.style.color = "var(--text-secondary)";
                  }
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        ))}
      </div>

      <style>{`
        @keyframes spPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}

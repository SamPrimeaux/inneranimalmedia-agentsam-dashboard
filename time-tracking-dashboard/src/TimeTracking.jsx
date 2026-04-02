import { useState, useEffect, useRef, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";

const AGENT_ROSTER = [
  { id: "cursor", name: "Cursor Agent", role: "Primary Dev", model: "composer-1.5", provider: "cursor", calls: 58, tokens: 98878300, costUsd: 26.70, efficiency: 94, lastActive: "2026-03-03T03:41:55", color: "#4ade80", status: "idle" },
  { id: "claude_sonnet", name: "Claude Sonnet", role: "Code + Reasoning", model: "claude-sonnet-4-20250514", provider: "anthropic", calls: 38, tokens: 445771, costUsd: 1.67, efficiency: 88, lastActive: "2026-02-28T13:14:37", color: "#f97316", status: "idle" },
  { id: "gpt4o_mini", name: "GPT-4o Mini", role: "Fast Inference", model: "gpt-4o-mini-2024-07-18", provider: "openai", calls: 17, tokens: 168974, costUsd: 0.03, efficiency: 79, lastActive: "2026-02-25T17:37:04", color: "#60a5fa", status: "idle" },
  { id: "claude_opus", name: "Claude Opus", role: "Complex Tasks", model: "claude-opus-4-6", provider: "anthropic", calls: 13, tokens: 235000, costUsd: 1.67, efficiency: 92, lastActive: "2026-02-09T08:28:05", color: "#a78bfa", status: "idle" },
  { id: "workers_ai", name: "Workers AI", role: "Edge Inference", model: "llama-3.1-8b", provider: "cloudflare", calls: 2, tokens: 1550, costUsd: 0.0, efficiency: 71, lastActive: "2026-02-26T17:49:53", color: "#f59e0b", status: "idle" },
];

const RECENT_ACTIVITY = [
  { id: 1, agent: "Cursor Agent", type: "deploy", label: "cli_post_deploy to inneranimalmedia", time: "2026-03-03T03:41:55", status: "success" },
  { id: 2, agent: "Cursor Agent", type: "deploy", label: "wrangler_deploy_cursor to inneranimalmedia", time: "2026-03-03T00:24:42", status: "success" },
  { id: 3, agent: "Cursor Agent", type: "task", label: "Fixed /api/overview/stats financial_health shape", time: "2026-03-01T23:00:37", status: "completed" },
  { id: 4, agent: "Cursor Agent", type: "task", label: "Wired 20 /dashboard/* routes to R2 pages", time: "2026-03-01T22:53:59", status: "completed" },
  { id: 5, agent: "Cursor Agent", type: "task", label: "Built promo code system", time: "2026-03-01T18:43:53", status: "completed" },
  { id: 6, agent: "Cursor Agent", type: "task", label: "Fixed false receipt bug", time: "2026-03-01T18:43:53", status: "completed" },
  { id: 7, agent: "Cursor Agent", type: "task", label: "Fixed cart mobile layout", time: "2026-03-01T18:43:53", status: "completed" },
];

function elapsed(from) {
  if (!from) return "--:--:--";
  const diffMs = Date.now() - new Date(from).getTime();
  const h = Math.floor(diffMs / 3600000);
  const m = Math.floor((diffMs % 3600000) / 60000);
  const s = Math.floor((diffMs % 60000) / 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function relativeTime(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3600000);
  const m = Math.floor(diff / 60000);
  if (h > 24) return `${Math.floor(h / 24)}d ago`;
  if (h >= 1) return `${h}h ago`;
  return `${m}m ago`;
}

function fmtTokens(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n;
}

function StatCard({ label, value, sub, accent }) {
  return (
    <div style={styles.statCard}>
      <div style={{ fontSize: 11, color: "var(--tt-text-label)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: accent || "var(--tt-text-primary)", lineHeight: 1.1, fontFamily: "'DM Mono', monospace" }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 12, color: "#4ade80", marginTop: 4 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function AgentRow({ agent, index }) {
  const efficiency = agent.efficiency;
  const barWidth = `${efficiency}%`;
  return (
    <div style={{ ...styles.agentRow, animationDelay: `${index * 60}ms` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flex: "0 0 200px" }}>
        <div style={{ ...styles.agentAvatar, background: `${agent.color}22`, border: `1px solid ${agent.color}44` }}>
          <span style={{ color: agent.color, fontSize: 11, fontWeight: 700, fontFamily: "'DM Mono', monospace" }}>
            {agent.name.split(" ").map(w => w[0]).join("").slice(0, 2)}
          </span>
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--tt-text-primary)" }}>{agent.name}</div>
          <div style={{ fontSize: 11, color: "var(--tt-text-label)" }}>{agent.role}</div>
        </div>
      </div>
      <div style={{ flex: "0 0 120px" }}>
        <div style={{ fontSize: 11, color: "var(--tt-text-label)", marginBottom: 2 }}>{agent.model}</div>
        <div style={{ fontSize: 11, color: "var(--tt-text-muted)", textTransform: "uppercase" }}>{agent.provider}</div>
      </div>
      <div style={{ flex: "0 0 60px", textAlign: "center" }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--tt-text-primary)", fontFamily: "'DM Mono', monospace" }}>{agent.calls}</div>
        <div style={{ fontSize: 11, color: "var(--tt-text-secondary)" }}>calls</div>
      </div>
      <div style={{ flex: "0 0 80px", textAlign: "center" }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--tt-text-primary)", fontFamily: "'DM Mono', monospace" }}>{fmtTokens(agent.tokens)}</div>
        <div style={{ fontSize: 11, color: "var(--tt-text-secondary)" }}>tokens</div>
      </div>
      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ flex: 1, height: 4, background: "#1e293b", borderRadius: 2, overflow: "hidden" }}>
          <div style={{ width: barWidth, height: "100%", background: `linear-gradient(90deg, ${agent.color}88, ${agent.color})`, borderRadius: 2, transition: "width 1s ease" }} />
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, color: efficiency >= 88 ? "#4ade80" : efficiency >= 75 ? "#fbbf24" : "#f87171", fontFamily: "'DM Mono', monospace", minWidth: 32 }}>
          {efficiency}%
        </div>
      </div>
      <div style={{ flex: "0 0 80px", textAlign: "right" }}>
        <div style={{ fontSize: 12, color: "var(--tt-text-secondary)" }}>${agent.costUsd.toFixed(2)}</div>
        <div style={{ fontSize: 11, color: "var(--tt-text-muted)" }}>{relativeTime(agent.lastActive)}</div>
      </div>
    </div>
  );
}

function ActivityItem({ item }) {
  const typeColor = item.type === "deploy" ? "#4ade80" : "#60a5fa";
  const typeLabel = item.type === "deploy" ? "DEPLOY" : "TASK";
  return (
    <div style={styles.activityItem}>
      <div style={{ width: 6, height: 6, borderRadius: "50%", background: typeColor, marginTop: 5, flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: typeColor, fontFamily: "'DM Mono', monospace" }}>{typeLabel}</span>
          <span style={{ fontSize: 11, color: "var(--tt-text-secondary)" }}>{item.agent}</span>
        </div>
        <div style={{ fontSize: 12, color: "var(--tt-text-primary)" }}>{item.label}</div>
      </div>
      <div style={{ fontSize: 11, color: "var(--tt-text-muted)", flexShrink: 0 }}>{relativeTime(item.time)}</div>
    </div>
  );
}

function ManualLogForm({ onAdd }) {
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [project, setProject] = useState("");
  const [hours, setHours] = useState("");
  const [note, setNote] = useState("");

  function handleAdd() {
    if (!project || !hours) return;
    onAdd({ date, project, hours: parseFloat(hours), note });
    setProject(""); setHours(""); setNote("");
  }

  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}>Manual Time Entry</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 80px", gap: 10, marginBottom: 10 }}>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} style={styles.input} />
        <input placeholder="Project (e.g. IAM Dashboard)" value={project} onChange={e => setProject(e.target.value)} style={styles.input} />
        <input type="number" placeholder="hrs" value={hours} onChange={e => setHours(e.target.value)} style={styles.input} min="0" step="0.25" />
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <input placeholder="Note (optional)" value={note} onChange={e => setNote(e.target.value)} style={{ ...styles.input, flex: 1 }} />
        <button onClick={handleAdd} style={styles.btn}>Add Entry</button>
      </div>
    </div>
  );
}

function CustomBarTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "var(--tt-bg-card)", border: "1px solid var(--tt-border)", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "var(--tt-text-primary)" }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{label}</div>
      <div>Deploys: <span style={{ color: "#4ade80" }}>{payload[0]?.value}</span></div>
    </div>
  );
}

const styles = {
  root: {
    minHeight: "100vh",
    background: "transparent",
    color: "var(--tt-text-primary)",
    fontFamily: "'DM Sans', 'Inter', system-ui, sans-serif",
    padding: "0 0 40px",
  },
  statsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(5, 1fr)",
    gap: 16,
    padding: "24px 32px 0",
  },
  statCard: {
    background: "var(--tt-bg-card)",
    border: "1px solid var(--tt-border)",
    borderRadius: 12,
    padding: "20px 24px",
    position: "relative",
    overflow: "hidden",
    isolation: "isolate",
  },
  mainGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 380px",
    gap: 20,
    padding: "20px 32px 0",
  },
  card: {
    background: "var(--tt-bg-card)",
    border: "1px solid var(--tt-border)",
    borderRadius: 12,
    padding: "20px 24px",
    isolation: "isolate",
  },
  cardHeader: {
    fontSize: 11,
    fontWeight: 700,
    color: "var(--tt-text-label)",
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    marginBottom: 16,
  },
  agentRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 0",
    borderBottom: "1px solid var(--tt-border)",
    animation: "fadeIn 0.4s ease both",
    isolation: "isolate",
  },
  agentAvatar: {
    width: 36,
    height: 36,
    borderRadius: 8,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  activityItem: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    padding: "10px 0",
    borderBottom: "1px solid var(--tt-border)",
  },
  input: {
    background: "var(--tt-bg-base)",
    border: "1px solid var(--tt-border)",
    borderRadius: 8,
    padding: "9px 12px",
    color: "var(--tt-text-primary)",
    fontSize: 13,
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
  },
  btn: {
    background: "linear-gradient(135deg, #1a4a2e, #166534)",
    border: "1px solid #166534",
    borderRadius: 8,
    color: "#4ade80",
    fontWeight: 700,
    fontSize: 13,
    padding: "9px 20px",
    cursor: "pointer",
    whiteSpace: "nowrap",
    letterSpacing: "0.02em",
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: "var(--tt-text-label)",
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    marginBottom: 12,
  },
};

export default function TimeTracking() {
  const [sessionStart, setSessionStart] = useState(null);
  const [isActive, setIsActive] = useState(false);
  const [todaySeconds, setTodaySeconds] = useState(0);
  const [weekSeconds, setWeekSeconds] = useState(0);
  const [dailySeconds, setDailySeconds] = useState([0, 0, 0, 0, 0, 0, 0]);
  const [entries, setEntries] = useState([]);
  const [deployTrend, setDeployTrend] = useState([]);
  const [deploysThisWeek, setDeploysThisWeek] = useState(0);
  const [ticker, setTicker] = useState("--:--:--");
  const [activeTab, setActiveTab] = useState("week");
  const intervalRef = useRef(null);

  useEffect(() => {
    fetch("/api/dashboard/time-track?action=heartbeat", { credentials: "include" })
      .then(r => r.json())
      .then(data => {
        if (data.session_start) setSessionStart(data.session_start);
        setIsActive(data.is_active ?? false);
        setTodaySeconds(data.today_seconds ?? 0);
        setWeekSeconds(data.week_seconds ?? 0);
        setDailySeconds(data.daily_seconds ?? [0, 0, 0, 0, 0, 0, 0]);
        if (data.entries) setEntries(data.entries);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/overview/activity-strip", { credentials: "include" })
      .then(r => r.json())
      .then(data => {
        if (data?.weekly_activity?.deploy_trend) setDeployTrend(data.weekly_activity.deploy_trend);
        if (data?.weekly_activity?.deploys !== undefined) setDeploysThisWeek(data.weekly_activity.deploys);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    intervalRef.current = setInterval(() => setTicker(elapsed(sessionStart)), 1000);
    return () => clearInterval(intervalRef.current);
  }, [sessionStart]);

  const startTimer = useCallback(() => {
    fetch("/api/dashboard/time-track/start", { method: "POST", credentials: "include" })
      .then(r => r.json())
      .then(() => setIsActive(true))
      .catch(() => setIsActive(true));
  }, []);

  const stopTimer = useCallback(() => {
    fetch("/api/dashboard/time-track/end", { method: "POST", credentials: "include" })
      .then(r => r.json())
      .then(() => setIsActive(false))
      .catch(() => setIsActive(false));
  }, []);

  function addManualEntry(entry) {
    setEntries(prev => [entry, ...prev]);
    fetch("/api/dashboard/time-track/manual", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(entry) }).catch(() => {});
  }

  const todayHoursLive = (todaySeconds / 3600).toFixed(1);
  // TODO: replace with agent_telemetry API fetch
  const totalAgentCalls = AGENT_ROSTER.reduce((a, b) => a + b.calls, 0);
  const totalCost = AGENT_ROSTER.reduce((a, b) => a + b.costUsd, 0);
  const deploysToday = deployTrend.length ? (deployTrend[deployTrend.length - 1] ?? 0) : 0;
  const weeklyDeployData = deployTrend.length ? deployTrend.map((d, i) => ({ day: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i] || "Day", deploys: d, hours: null })) : [
    { day: "Mon", deploys: 0, hours: 0 }, { day: "Tue", deploys: 0, hours: 0 }, { day: "Wed", deploys: 0, hours: 0 },
    { day: "Thu", deploys: 0, hours: 0 }, { day: "Fri", deploys: 0, hours: 0 }, { day: "Sat", deploys: 0, hours: 0 },
    { day: "Sun", deploys: 0, hours: null },
  ];
  const maxDaySecs = Math.max(...dailySeconds, 1);
  const currentDayIndex = (() => {
    const d = new Date().getDay();
    return d === 0 ? 6 : d - 1;
  })();
  const sparkBars = dailySeconds.map((secs, i) => {
    const h = Math.max(2, (secs / maxDaySecs) * 24);
    const isCurrent = i === currentDayIndex;
    return { h, fill: isCurrent ? "#f97316" : "#1e3a5f" };
  });

  return (
    <div style={styles.root}>
      <style>{`
        :root {
          --tt-text-primary:   #ffffff;
          --tt-text-secondary: #cbd5e1;
          --tt-text-muted:     #94a3b8;
          --tt-text-label:     #64748b;
          --tt-bg-card:        rgba(10, 20, 40, 0.92);
          --tt-bg-base:        #07101f;
          --tt-border:         rgba(255,255,255,0.08);
        }
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500;700&display=swap');
        @keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(0.85); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        * { box-sizing: border-box; }
        input:focus { border-color: #1d4ed8 !important; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 2px; }
        @media (max-width: 900px) {
          .tt-stats-row { grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); }
        }
      `}</style>

      <div style={styles.statsRow} className="tt-stats-row">
        <div style={styles.statCard}>
          <div style={{ fontSize: 11, color: "var(--tt-text-label)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Hours Today</div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
            <span style={{ fontSize: 20, fontWeight: 700, fontFamily: "'DM Mono', monospace", color: isActive ? "#4ade80" : "var(--tt-text-primary)" }}>{ticker}</span>
            <button
              onClick={isActive ? stopTimer : startTimer}
              style={{
                ...styles.btn,
                background: isActive ? "linear-gradient(135deg, #2d1010, #7f1d1d)" : "linear-gradient(135deg, #1a4a2e, #166534)",
                border: isActive ? "1px solid #7f1d1d" : "1px solid #166534",
                color: isActive ? "#f87171" : "#4ade80",
                padding: "6px 12px",
                fontSize: 12,
              }}
            >
              {isActive ? "Stop" : "Start"}
            </button>
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#4ade80", lineHeight: 1.1, fontFamily: "'DM Mono', monospace" }}>
            {(todaySeconds / 3600).toFixed(1)}h
          </div>
          <div style={{ fontSize: 12, color: "var(--tt-text-secondary)", marginTop: 4 }}>
            {sessionStart ? `Started ${new Date(sessionStart).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "No session today"}
          </div>
        </div>

        <div style={{ ...styles.statCard, isolation: "isolate" }}>
          <div style={{ fontSize: 11, color: "var(--tt-text-label)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Hours This Week</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#f97316", lineHeight: 1.1, fontFamily: "'DM Mono', monospace" }}>{(weekSeconds / 3600).toFixed(1)}h</div>
          <div style={{ fontSize: 12, color: "var(--tt-text-secondary)", marginTop: 4 }}>This week</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 24, marginTop: 8 }}>
            {sparkBars.map((b, i) => (
              <div key={i} style={{ flex: 1, height: b.h, minHeight: 2, background: b.fill, borderRadius: 2 }} title={`${(dailySeconds[i] || 0) / 3600}h`} />
            ))}
          </div>
        </div>

        <StatCard label="Deploys This Week" value={deploysThisWeek !== undefined ? String(deploysThisWeek) : "0"} sub={`${deploysToday} today`} accent="#60a5fa" />
        <StatCard label="Agent API Calls" value={totalAgentCalls} sub="Across 5 providers" accent="#f97316" />
        <StatCard label="AI Cost (Total)" value={`$${totalCost.toFixed(2)}`} sub="Lifetime tracked" accent="#a78bfa" />
      </div>

      <div style={styles.mainGrid}>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={styles.card}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={styles.cardHeader}>Deploy Activity - This Week</div>
              <div style={{ display: "flex", gap: 8 }}>
                {["week", "month"].map(t => (
                  <button
                    key={t}
                    onClick={() => setActiveTab(t)}
                    style={{
                      padding: "4px 12px", borderRadius: 6, border: "1px solid", borderColor: activeTab === t ? "#1d4ed8" : "var(--tt-border)",
                      background: activeTab === t ? "#1d4ed822" : "transparent", color: activeTab === t ? "#60a5fa" : "var(--tt-text-muted)", fontSize: 12, cursor: "pointer",
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={weeklyDeployData} barSize={22}>
                <XAxis dataKey="day" tick={{ fill: "var(--tt-text-muted)", fontSize: 11, fontFamily: "'DM Mono', monospace" }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip content={<CustomBarTooltip />} cursor={{ fill: "#ffffff08" }} />
                <Bar dataKey="deploys" radius={[4, 4, 0, 0]}>
                  {weeklyDeployData.map((entry, i) => (
                    <Cell key={i} fill={i === weeklyDeployData.length - 1 ? "#4ade80" : (entry.deploys > 0 ? "#1d4ed8" : "#0f1e35")} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div style={styles.card}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <div style={styles.cardHeader}>Agent Workforce</div>
              <div style={{ fontSize: 11, color: "var(--tt-text-muted)" }}>{AGENT_ROSTER.length} agents - {totalAgentCalls} total calls</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 0 10px", borderBottom: "1px solid var(--tt-border)" }}>
              <div style={{ flex: "0 0 200px", fontSize: 11, color: "var(--tt-text-secondary)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Agent</div>
              <div style={{ flex: "0 0 120px", fontSize: 11, color: "var(--tt-text-secondary)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Model</div>
              <div style={{ flex: "0 0 60px", textAlign: "center", fontSize: 11, color: "var(--tt-text-secondary)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Calls</div>
              <div style={{ flex: "0 0 80px", textAlign: "center", fontSize: 11, color: "var(--tt-text-secondary)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Tokens</div>
              <div style={{ flex: 1, fontSize: 11, color: "var(--tt-text-secondary)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Efficiency</div>
              <div style={{ flex: "0 0 80px", textAlign: "right", fontSize: 11, color: "var(--tt-text-secondary)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Cost</div>
            </div>
            {AGENT_ROSTER.map((agent, i) => (
              <AgentRow key={agent.id} agent={agent} index={i} />
            ))}
          </div>

          <ManualLogForm onAdd={addManualEntry} />

          {entries.length > 0 && (
            <div style={styles.card}>
              <div style={styles.cardHeader}>Logged Entries</div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--tt-border)" }}>
                    {["Date", "Project", "Hours", "Note"].map(h => (
                      <th key={h} style={{ textAlign: "left", fontSize: 11, color: "var(--tt-text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", padding: "0 0 8px" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid var(--tt-border)" }}>
                      <td style={{ padding: "10px 0", fontSize: 12, color: "var(--tt-text-secondary)", fontFamily: "'DM Mono', monospace" }}>{e.date}</td>
                      <td style={{ padding: "10px 8px", fontSize: 13, color: "var(--tt-text-primary)" }}>{e.project}</td>
                      <td style={{ padding: "10px 0", fontSize: 13, fontWeight: 600, color: "#4ade80", fontFamily: "'DM Mono', monospace" }}>{e.hours}h</td>
                      <td style={{ padding: "10px 0", fontSize: 12, color: "var(--tt-text-label)" }}>{e.note || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={styles.card}>
            <div style={styles.cardHeader}>Daily Targets</div>
            {[
              { label: "Hours logged", current: parseFloat(todayHoursLive), target: 8 },
              { label: "Deploys", current: deploysToday, target: 3 },
              { label: "Tasks closed", current: 7, target: 5 },
            ].map(goal => {
              const pct = Math.min((goal.current / goal.target) * 100, 100);
              const met = goal.current >= goal.target;
              return (
                <div key={goal.label} style={{ marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 13, color: "var(--tt-text-secondary)" }}>{goal.label}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: met ? "#4ade80" : "var(--tt-text-primary)", fontFamily: "'DM Mono', monospace" }}>{goal.current}/{goal.target}</span>
                  </div>
                  <div style={{ height: 4, background: "#0f1e35", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: met ? "linear-gradient(90deg, #166534, #4ade80)" : "linear-gradient(90deg, #1d4ed8, #60a5fa)", borderRadius: 2, transition: "width 1s ease" }} />
                  </div>
                </div>
              );
            })}
          </div>

          <div style={styles.card}>
            <div style={styles.cardHeader}>Active Projects</div>
            {[
              { key: "iam-dashboard", name: "IAM Dashboard", status: "active", priority: 95, type: "feature" },
              { key: "learn-page-build", name: "Learn Page", status: "active", priority: 95, type: "new-page" },
              { key: "contact-page", name: "Contact Page", status: "active", priority: 90, type: "feature" },
              { key: "dashboard-finance", name: "Finance Dashboard Fix", status: "blocked", priority: 85, type: "bugfix" },
              { key: "kanban-emoji-purge", name: "Kanban Emoji Purge", status: "active", priority: 80, type: "bugfix" },
            ].map((proj, i) => (
              <div key={proj.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: i < 4 ? "1px solid var(--tt-border)" : "none" }}>
                <div>
                  <div style={{ fontSize: 13, color: "var(--tt-text-primary)", marginBottom: 2 }}>{proj.name}</div>
                  <div style={{ fontSize: 11, color: "var(--tt-text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{proj.type}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: proj.priority >= 90 ? "#f87171" : "#fbbf24", fontFamily: "'DM Mono', monospace" }}>P{proj.priority}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: proj.status === "active" ? "#0f2a1a" : "#2d1010", color: proj.status === "active" ? "#4ade80" : "#f87171", border: `1px solid ${proj.status === "active" ? "#166534" : "#7f1d1d"}`, textTransform: "uppercase", letterSpacing: "0.08em" }}>{proj.status}</div>
                </div>
              </div>
            ))}
          </div>

          <div style={styles.card}>
            <div style={styles.cardHeader}>Recent Activity</div>
            <div style={{ maxHeight: 340, overflowY: "auto" }}>
              {RECENT_ACTIVITY.map(item => (
                <ActivityItem key={item.id} item={item} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

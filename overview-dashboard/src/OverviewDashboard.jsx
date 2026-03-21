import { useState, useEffect } from "react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, ReferenceLine
} from "recharts";

// --- REAL DATA (fallbacks / static) ---
const RULES = [
  { id:"car",      label:"Car Note",                  cents:45000, cat:"auto_loan",  vendor:"Auto",       cadence:"monthly" },
  { id:"att",      label:"AT&T Wireless",             cents:15426, cat:"bills",      vendor:"ATT",        cadence:"monthly" },
  { id:"cur1",     label:"Cursor Pro+ · icloud",      cents:6000,  cat:"ai_tools",   vendor:"Cursor",     cadence:"monthly" },
  { id:"cur2",     label:"Cursor Pro+ · inneranimal", cents:6000,  cat:"ai_tools",   vendor:"Cursor",     cadence:"monthly" },
  { id:"cur3",     label:"Cursor Pro · meauxbility",  cents:2000,  cat:"ai_tools",   vendor:"Cursor",     cadence:"monthly" },
  { id:"cl1",      label:"Claude Pro · icloud",       cents:2180,  cat:"ai_tools",   vendor:"Anthropic",  cadence:"monthly" },
  { id:"cl2",      label:"Claude Pro · meauxbility",  cents:2180,  cat:"ai_tools",   vendor:"Anthropic",  cadence:"monthly" },
  { id:"cl3",      label:"Claude Pro · inneranimal",  cents:2180,  cat:"ai_tools",   vendor:"Anthropic",  cadence:"monthly" },
  { id:"gpt",      label:"ChatGPT Pro",               cents:2180,  cat:"ai_tools",   vendor:"OpenAI",     cadence:"monthly" },
  { id:"oai",      label:"OpenAI API Credit",         cents:4000,  cat:"ai_tools",   vendor:"OpenAI",     cadence:"manual"  },
  { id:"cfp",      label:"Cloudflare Pro · IAM",      cents:2500,  cat:"infra",      vendor:"Cloudflare", cadence:"monthly" },
  { id:"cfi",      label:"Cloudflare Images/Stream",  cents:500,   cat:"infra",      vendor:"Cloudflare", cadence:"monthly" },
  { id:"cfw",      label:"Cloudflare Workers",        cents:500,   cat:"infra",      vendor:"Cloudflare", cadence:"monthly" },
  { id:"rsnd",     label:"Resend Email",              cents:2000,  cat:"infra",      vendor:"Resend",     cadence:"monthly" },
  { id:"goog",     label:"Google One Storage",        cents:2209,  cat:"subs",       vendor:"Google",     cadence:"monthly" },
  { id:"apl1",     label:"Apple Subscription 1",      cents:999,   cat:"subs",       vendor:"Apple",      cadence:"monthly" },
  { id:"apl2",     label:"Apple Subscription 2",      cents:1198,  cat:"subs",       vendor:"Apple",      cadence:"monthly" },
  { id:"adbe",     label:"Adobe CC",                  cents:1326,  cat:"subs",       vendor:"Adobe",      cadence:"monthly" },
];

const GOALS = [
  { id:"g1", name:"Car Payoff",             target:10800, current:7250, due:"2026-11-03", kind:"currency", desc:"$450/mo · ~8 payments left" },
  { id:"g2", name:"Cursor Spend Reduction", target:100,   current:140,  due:"2026-06-01", kind:"currency", desc:"$1,500 → $100/mo target"    },
  { id:"g3", name:"Meauxbility.org Launch", target:100,   current:62,   due:"2026-05-01", kind:"percent",  desc:"YouTube streaming launch"   },
  { id:"g4", name:"IAM.com Launch",         target:100,   current:55,   due:"2026-05-01", kind:"percent",  desc:"Full SaaS dashboard live"   },
];

const monthly    = RULES.filter(r => r.cadence === "monthly");
const burn       = monthly.reduce((s,r) => s + r.cents, 0) / 100;
const aiMo       = RULES.filter(r => r.cat === "ai_tools" && r.cadence === "monthly").reduce((s,r)=>s+r.cents,0)/100;
const infraMo    = RULES.filter(r => r.cat === "infra"    && r.cadence === "monthly").reduce((s,r)=>s+r.cents,0)/100;
const billsMo    = RULES.filter(r => r.cat === "bills"    ).reduce((s,r)=>s+r.cents,0)/100;
const autoMo     = RULES.filter(r => r.cat === "auto_loan").reduce((s,r)=>s+r.cents,0)/100;
const carPaid = 7250, carTotal = 10800, carLeft = 3550, carPct = Math.round(carPaid/carTotal*100);

const catBreak = Object.entries(
  monthly.reduce((a,r)=>{ a[r.cat]=(a[r.cat]||0)+r.cents/100; return a; },{})
).map(([name,value])=>({name, value:+value.toFixed(2)}));

const burnTrend = [
  {mo:"SEP",burn:810,ai:220},{mo:"OCT",burn:920,ai:290},{mo:"NOV",burn:1050,ai:340},
  {mo:"DEC",burn:1180,ai:380},{mo:"JAN",burn:1340,ai:420},{mo:"FEB",burn:Math.round(burn),ai:Math.round(aiMo)},
];

const carProj = Array.from({length:9},(_,i)=>({
  mo:["MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV"][i],
  bal:Math.max(0,carLeft-i*450),
}));

const f$ = n => new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n);
const CAT_COLOR = {
  ai_tools:"#3b82f6", infra:"#06b6d4", bills:"#ef4444",
  auto_loan:"#eab308", subs:"#8b5cf6", gas:"#10b981",
  transfer:"#64748b", personal:"#6b7280",
};
const PROVIDER_COLOR = {
  cursor:"#3b82f6", anthropic:"#f97316", openai:"#10b981",
  cloudflare:"#f59e0b", google:"#60a5fa", other:"#64748b",
};
const SEV_COLOR = { critical: "#ef4444", warning: "#f59e0b" };

const FONT_FAMILY = "var(--font-family), 'Inter', -apple-system, BlinkMacSystemFont, sans-serif";

function relTime(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(String(dateStr).replace(" ","T")+"Z");
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return `${Math.round(diff)}s ago`;
  if (diff < 3600) return `${Math.round(diff/60)}m ago`;
  if (diff < 86400) return `${Math.round(diff/3600)}h ago`;
  return `${Math.round(diff/86400)}d ago`;
}

function trunc(str, len = 40) {
  const s = String(str || "").trim();
  return s.length <= len ? s : s.slice(0, len) + "…";
}

// 7-bar sparkline (array of numbers)
function Sparkline({ data, accent = "#60a5fa", height = 24 }) {
  const arr = Array.isArray(data) ? data : [];
  const max = Math.max(1, ...arr);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height }}>
      {arr.map((v, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            minWidth: 4,
            height: max ? `${Math.max(2, (v / max) * 100)}%` : "2px",
            background: accent,
            borderRadius: 1,
          }}
        />
      ))}
    </div>
  );
}

const Tip = ({active,payload,label}) => !active||!payload?.length ? null : (
  <div style={{background:"var(--bg-card)",border:"1px solid var(--border-subtle)",padding:"8px 12px",fontFamily:FONT_FAMILY,fontSize:10,borderRadius:2}}>
    <div style={{color:"var(--text-muted)",fontWeight:500,marginBottom:3}}>{label}</div>
    {payload.map((p,i)=><div key={i} style={{color:p.color}}>{p.name}: {typeof p.value==="number"?f$(p.value):p.value}</div>)}
  </div>
);

const PBar = ({pct, color="#3b82f6", h=5}) => (
  <div style={{background:"rgba(255,255,255,0.06)",height:h,position:"relative",overflow:"hidden",borderRadius:1}}>
    <div style={{position:"absolute",left:0,top:0,height:"100%",width:`${Math.min(pct,100)}%`,background:color,transition:"width 0.8s ease"}}/>
    {[25,50,75].map(t=>(
      <div key={t} style={{position:"absolute",left:`${t}%`,top:0,height:"100%",width:1,background:"rgba(0,0,0,0.4)"}}/>
    ))}
  </div>
);

const Card = ({children, style={}, className=""}) => (
  <div className={`card-context ${className}`.trim()} style={{background:"var(--bg-card)",border:"1px solid var(--border-subtle)",borderRadius:8,padding:16,...style}}>
    {children}
  </div>
);

const Label = ({children, style={}}) => (
  <div style={{fontSize:"clamp(10px, 1vw, 12px)",letterSpacing:"0.08em",color:"var(--text-secondary)",fontWeight:500,fontFamily:FONT_FAMILY,textTransform:"uppercase",marginBottom:5,...style}}>
    {children}
  </div>
);

const SH = ({label, tag, right, onCanvas}) => (
  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
    <div style={{width:4,height:4,background:"var(--accent, #3b82f6)",transform:"rotate(45deg)",flexShrink:0}}/>
    <span style={{fontSize:10,letterSpacing:"0.1em",color:onCanvas?"var(--text-primary, #1e293b)":"var(--text-muted)",fontWeight:500,fontFamily:FONT_FAMILY,textTransform:"uppercase",whiteSpace:"nowrap"}}>{label}</span>
    {tag&&<span style={{fontSize:9,background:"rgba(59,130,246,0.12)",color:"var(--accent, #3b82f6)",border:"1px solid rgba(59,130,246,0.25)",padding:"2px 6px",fontFamily:FONT_FAMILY,borderRadius:2}}>{tag}</span>}
    <div style={{flex:1,height:1,background:"rgba(255,255,255,0.06)"}}/>
    {right&&<span style={{fontSize:9,color:onCanvas?"var(--text-secondary, #64748b)":"var(--text-muted)",fontWeight:500,fontFamily:FONT_FAMILY,whiteSpace:"nowrap"}}>{right}</span>}
  </div>
);

const KV = ({label, value, color, sub}) => (
  <div>
    <div style={{fontSize:9,letterSpacing:"0.1em",color:"var(--text-muted)",fontWeight:500,marginBottom:2,fontFamily:FONT_FAMILY}}>{label}</div>
    <div style={{fontSize:13,color:color||"var(--text-primary)",fontWeight:700,fontFamily:FONT_FAMILY,lineHeight:1}}>{value}</div>
    {sub&&<div style={{fontSize:9,color:"var(--text-muted)",fontWeight:500,marginTop:2,fontFamily:FONT_FAMILY}}>{sub}</div>}
  </div>
);

// KPI card (single metric)
function KpiCard({ label, value, sub, accent }) {
  return (
    <div className="card-context" style={{
      minHeight: 90,
      padding: 16,
      background: "var(--bg-card)",
      border: "1px solid var(--border-subtle)",
      borderRadius: 8,
      position: "relative",
      overflow: "hidden",
      wordBreak: "break-word",
    }}>
      {accent && <div style={{position:"absolute",top:0,left:0,width:3,height:"100%",background:accent,borderRadius:"2px 0 0 2px"}}/>}
      <div style={{fontSize:"clamp(10px, 1vw, 12px)",letterSpacing:"0.08em",color:"var(--text-secondary)",fontWeight:500,fontFamily:FONT_FAMILY,textTransform:"uppercase",marginBottom:4}}>{label}</div>
      <div style={{fontSize:"clamp(18px, 2.2vw, 28px)",fontWeight:700,color:"var(--text-primary)",lineHeight:1.2,fontFamily:FONT_FAMILY}}>{value}</div>
      {sub != null && sub !== "" && <div style={{fontSize:10,color:"var(--text-muted)",fontWeight:500,marginTop:4,fontFamily:FONT_FAMILY}}>{sub}</div>}
    </div>
  );
}

export default function Dashboard() {
  const [now, setNow] = useState(() => new Date());
  const [activityStrip, setActivityStrip] = useState(null);
  const [activityStripLoading, setActivityStripLoading] = useState(true);
  const [activityStripError, setActivityStripError] = useState(null);
  const [timeTrack, setTimeTrack] = useState(null);
  const [deployments, setDeployments] = useState(null);
  const [deploymentsLoading, setDeploymentsLoading] = useState(false);
  const [deploymentsError, setDeploymentsError] = useState(null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const fetchHeartbeat = () => {
      const base = typeof window !== "undefined" && window.location?.origin ? window.location.origin : "";
      fetch(`${base}/api/dashboard/time-track?action=heartbeat`, { credentials: "include" })
        .then((r) => r.ok ? r.json() : Promise.reject(new Error("Unauthorized")))
        .then((data) => {
          if (!cancelled) setTimeTrack(data);
        })
        .catch(() => {
          if (!cancelled) setTimeTrack(null);
        });
    };
    fetchHeartbeat();
    const interval = setInterval(fetchHeartbeat, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setActivityStripLoading(true);
    setActivityStripError(null);
    const base = typeof window !== "undefined" && window.location?.origin ? window.location.origin : "";
    fetch(`${base}/api/overview/activity-strip`, { credentials: "include" })
      .then((res) => {
        if (!res.ok) throw new Error(res.status === 401 ? "Unauthorized" : `HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setActivityStrip(data);
      })
      .catch((err) => {
        if (!cancelled) setActivityStripError(err?.message || "Failed to load activity");
      })
      .finally(() => {
        if (!cancelled) setActivityStripLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setDeploymentsLoading(true);
    setDeploymentsError(null);
    const base = typeof window !== "undefined" && window.location?.origin ? window.location.origin : "";
    fetch(`${base}/api/overview/deployments`, { credentials: "include" })
      .then((res) => {
        if (!res.ok) throw new Error(res.status === 401 ? "Unauthorized" : `HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setDeployments(data);
      })
      .catch((err) => {
        if (!cancelled) setDeploymentsError(err?.message || "Failed to load deployments");
      })
      .finally(() => {
        if (!cancelled) setDeploymentsLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const timeStr = now.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const dateStr = now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }).toUpperCase();

  const wa = activityStrip?.weekly_activity;
  const ra = activityStrip?.recent_activity;
  const ww = activityStrip?.worked_this_week;
  const proj = activityStrip?.projects;

  const deploysToday = wa?.deploy_trend?.[6] ?? 0;
  const tasksDone = wa?.tasks_completed ?? 0;
  const workerRequests = 0; // placeholder

  return (
    <div className="overview-dashboard-root" style={{ minHeight: "100%", background: "transparent", fontFamily: FONT_FAMILY, color: "inherit" }}>
      <style>{`
        .overview-dashboard-root * { box-sizing: border-box; }
        .overview-dashboard-root {
          --bg-card: var(--bg-secondary);
          --border-subtle: var(--color-border);
        }
        .overview-dashboard-root .card-context {
          --text-primary: var(--color-text);
          --text-secondary: var(--text-muted);
          --text-muted: var(--text-muted);
        }
        .overview-dashboard-root summary,
        .overview-dashboard-root .details-inner {
          --text-primary: var(--color-text);
          --text-secondary: var(--text-muted);
          --text-muted: var(--text-muted);
        }
        .overview-dashboard-root .rh:hover { background: rgba(255,255,255,0.04) !important; transition: background 0.12s; }
        .overview-dashboard-root .section-header {
          color: var(--overview-section-label, #1e293b);
          font-size: 10px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          margin-bottom: 10px;
          font-family: var(--font-family), 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        }
        .overview-dashboard-root details { margin-bottom: 12px; }
        .overview-dashboard-root details[open] summary { border-radius: 8px 8px 0 0; }
        .overview-dashboard-root summary {
          list-style: none;
          padding: 10px 14px;
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          border-radius: 8px;
          cursor: pointer;
          font-size: 13px;
          font-weight: 600;
          color: #f1f5f9;
        }
        .overview-dashboard-root summary::-webkit-details-marker { display: none; }
        .overview-dashboard-root summary::after { content: " ▼"; font-size: 10px; opacity: 0.7; }
        .overview-dashboard-root details[open] summary::after { content: " ▲"; }
        .overview-dashboard-root .details-inner {
          padding: 16px;
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          border-top: none;
          border-radius: 0 0 8px 8px;
        }
        @media (max-width: 767px) {
          .overview-dashboard-root .kpi-grid-7 { grid-template-columns: repeat(2, 1fr) !important; }
          .overview-dashboard-root .activity-grid-4 { grid-template-columns: 1fr !important; }
          .overview-dashboard-root .deployments-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* Header: Overview + LIVE badge | clock — dark bar, shell nav colors */}
      <div style={{
        borderBottom: "1px solid var(--border-subtle)",
        padding: "0 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        height: 48,
        background: "var(--bg-card)",
        color: "var(--text-nav, #f1f5f9)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: "inherit" }}>Overview</h1>
          <span style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 10,
            letterSpacing: "0.08em",
            color: "var(--text-nav-muted, #94a3b8)",
            fontFamily: FONT_FAMILY,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--text-accent, #4ade80)", boxShadow: "0 0 6px rgba(74, 222, 128, 0.8)" }} />
            LIVE — {dateStr}
          </span>
        </div>
        <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: "0.05em", color: "var(--text-nav-muted, #94a3b8)", fontFamily: FONT_FAMILY, fontVariantNumeric: "tabular-nums" }}>
          {timeStr}
        </span>
      </div>

      <div style={{ padding: 16, maxWidth: 1400, margin: "0 auto", width: "100%" }}>
        {/* Row 1 — 7 KPI cards */}
        <section style={{ marginBottom: 20 }}>
          <div
            className="kpi-grid-7"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: 12,
            }}
          >
            <KpiCard label="Monthly Burn" value={f$(burn)} sub={`${monthly.length} commitments`} accent="#ef4444" />
            <KpiCard label="AI Tooling" value={f$(aiMo)} sub={`+${f$(aiMo - 100)} over target`} accent="#3b82f6" />
            <KpiCard label="Car Remaining" value={f$(carLeft)} sub={`${carPct}% paid · ~${Math.ceil(carLeft/450)} pmts`} accent="#eab308" />
            <KpiCard label="Infra/Bills" value={f$(infraMo + billsMo + autoMo)} sub="CF · AT&T · Car" accent="#06b6d4" />
            <KpiCard label="Deploys Today" value={deploysToday} sub="This day" accent="#60a5fa" />
            <KpiCard label="Tasks Done" value={tasksDone} sub="This week" accent="#4ade80" />
            <KpiCard label="Worker Requests" value={workerRequests === 0 ? "—" : workerRequests} sub="Placeholder" accent="#a78bfa" />
          </div>
        </section>

        {/* Row 2 — 4 Activity Strip cards */}
        <section style={{ marginBottom: 24 }}>
          <div
            className="activity-grid-4"
            style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}
          >
            <Card>
              <Label>Weekly Activity</Label>
              <div style={{ fontSize: "clamp(18px, 2.2vw, 28px)", fontWeight: 700, color: "#60a5fa", marginBottom: 4 }}>
                {activityStripLoading ? "…" : (wa?.deploys ?? 0)}
              </div>
              <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 500, marginBottom: 8 }}>
                {activityStripLoading ? "Loading…" : `${wa?.tasks_completed ?? 0} tasks closed — ${wa?.agent_calls ?? 0} agent calls`}
              </div>
              <Sparkline data={wa?.deploy_trend} accent="#60a5fa" />
            </Card>
            <Card>
              <Label>Recent Activity</Label>
              <div style={{ fontSize: "clamp(18px, 2.2vw, 28px)", fontWeight: 700, color: "#4ade80", marginBottom: 4 }}>
                {activityStripLoading ? "…" : `${ra?.total_24hr ?? 0} events`}
              </div>
              <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {activityStripLoading ? "Loading…" : (ra?.events?.[0]?.label ? trunc(ra.events[0].label, 40) : "No recent events")}
              </div>
            </Card>
            <Card>
              <Label>Hours This Week</Label>
              <div style={{ fontSize: "clamp(18px, 2.2vw, 28px)", fontWeight: 700, color: "#f97316", marginBottom: 4 }}>
                {timeTrack != null
                  ? `${(Number(timeTrack.week_seconds ?? 0) / 3600).toFixed(1)}h`
                  : activityStripLoading ? "…" : (ww?.hours_this_week != null ? `${Number(ww.hours_this_week).toFixed(1)}h` : "0h")}
              </div>
              <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 500, marginBottom: 8 }}>
                Today: {timeTrack != null
                  ? `${(Number(timeTrack.today_seconds ?? 0) / 3600).toFixed(1)}h`
                  : activityStripLoading ? "…" : (ww?.hours_today != null ? `${Number(ww.hours_today).toFixed(1)}h` : "0h")}
              </div>
              <Sparkline
                data={timeTrack?.daily_seconds ?? ww?.daily ?? []}
                accent="#f97316"
              />
            </Card>
            <Card>
              <Label>Projects</Label>
              <div style={{ fontSize: "clamp(18px, 2.2vw, 28px)", fontWeight: 700, color: "#a78bfa", marginBottom: 4 }}>
                {activityStripLoading ? "…" : (proj?.active ?? 0)}
              </div>
              <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 500, marginBottom: 8 }}>
                {proj?.in_dev ?? 0} in dev — {proj?.production ?? 0} in production
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {(proj?.top ?? []).slice(0, 2).map((p, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 11, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 140 }} title={p.name}>
                      {trunc(p.name, 28)}
                    </span>
                    <span style={{ fontSize: 8, background: "rgba(167,139,250,0.2)", color: "#a78bfa", padding: "1px 4px", borderRadius: 2, flexShrink: 0 }}>{p.status || "active"}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </section>

        {/* Deployments: Worker deploys + CI/CD runs */}
        <section style={{ marginBottom: 24 }}>
          <div className="section-header" style={{ color: "var(--text-primary, #1e293b)" }}>Deployments</div>
          <div className="deployments-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Card>
              <Label>Worker deploys</Label>
              {deploymentsLoading ? (
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Loading…</div>
              ) : deploymentsError ? (
                <div style={{ fontSize: 11, color: "var(--severity-critical, #ef4444)" }}>{deploymentsError}</div>
              ) : !deployments?.deployments?.length ? (
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>No deploys yet</div>
              ) : (
                <div style={{ overflow: "auto", maxHeight: 220 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                        <th style={{ textAlign: "left", padding: "6px 8px", color: "var(--text-muted)", fontWeight: 600 }}>Worker</th>
                        <th style={{ textAlign: "left", padding: "6px 8px", color: "var(--text-muted)", fontWeight: 600 }}>Env</th>
                        <th style={{ textAlign: "left", padding: "6px 8px", color: "var(--text-muted)", fontWeight: 600 }}>Status</th>
                        <th style={{ textAlign: "right", padding: "6px 8px", color: "var(--text-muted)", fontWeight: 600 }}>Deployed</th>
                        <th style={{ textAlign: "left", padding: "6px 8px", color: "var(--text-muted)", fontWeight: 600 }}>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(deployments.deployments || []).map((r, i) => (
                        <tr key={i} className="rh" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                          <td style={{ padding: "6px 8px", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 120 }}>{r.worker_name}</td>
                          <td style={{ padding: "6px 8px", color: "var(--text-muted)" }}>{r.environment}</td>
                          <td style={{ padding: "6px 8px" }}>
                            <span style={{ fontSize: 9, padding: "1px 4px", borderRadius: 2, background: r.status === "success" ? "rgba(74,222,128,0.2)" : r.status === "failed" ? "rgba(239,68,68,0.2)" : "rgba(96,165,250,0.2)", color: r.status === "success" ? "#4ade80" : r.status === "failed" ? "#ef4444" : "#60a5fa" }}>{r.status}</span>
                          </td>
                          <td style={{ padding: "6px 8px", color: "var(--text-muted)", textAlign: "right", whiteSpace: "nowrap" }}>{relTime(r.deployed_at)}</td>
                          <td style={{ padding: "6px 8px", color: "var(--text-muted)", maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis" }} title={r.deployment_notes || ""}>{(r.deployment_notes ? String(r.deployment_notes).slice(0, 25) + (String(r.deployment_notes).length > 25 ? "…" : "") : "—")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
            <Card>
              <Label>CI/CD runs</Label>
              {deploymentsLoading ? (
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Loading…</div>
              ) : deploymentsError ? (
                <div style={{ fontSize: 11, color: "var(--severity-critical, #ef4444)" }}>{deploymentsError}</div>
              ) : !deployments?.cicd_runs?.length ? (
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>No CI/CD runs</div>
              ) : (
                <div style={{ overflow: "auto", maxHeight: 220 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                        <th style={{ textAlign: "left", padding: "6px 8px", color: "var(--text-muted)", fontWeight: 600 }}>Workflow</th>
                        <th style={{ textAlign: "left", padding: "6px 8px", color: "var(--text-muted)", fontWeight: 600 }}>Branch</th>
                        <th style={{ textAlign: "left", padding: "6px 8px", color: "var(--text-muted)", fontWeight: 600 }}>Status</th>
                        <th style={{ textAlign: "right", padding: "6px 8px", color: "var(--text-muted)", fontWeight: 600 }}>Started</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(deployments.cicd_runs || []).map((r, i) => (
                        <tr key={i} className="rh" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                          <td style={{ padding: "6px 8px", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 100 }}>{r.workflow_name}</td>
                          <td style={{ padding: "6px 8px", color: "var(--text-muted)" }}>{r.branch}</td>
                          <td style={{ padding: "6px 8px" }}>
                            <span style={{ fontSize: 9, padding: "1px 4px", borderRadius: 2, background: (r.conclusion || r.status) === "success" ? "rgba(74,222,128,0.2)" : (r.conclusion || r.status) === "failure" || (r.conclusion || r.status) === "failed" ? "rgba(239,68,68,0.2)" : "rgba(96,165,250,0.2)", color: (r.conclusion || r.status) === "success" ? "#4ade80" : (r.conclusion || r.status) === "failure" || (r.conclusion || r.status) === "failed" ? "#ef4444" : "#60a5fa" }}>{r.conclusion || r.status}</span>
                          </td>
                          <td style={{ padding: "6px 8px", color: "var(--text-muted)", textAlign: "right", whiteSpace: "nowrap" }}>{relTime(r.started_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        </section>

        {/* Financial Pulse: header + chart always visible; recurring rules in details */}
        <section style={{ marginBottom: 24 }}>
          <div className="section-header" style={{ color: "var(--text-primary, #1e293b)" }}>Financial Pulse — {f$(burn)}/mo</div>
          <Card style={{ marginBottom: 8 }}>
            <SH label="Spend by Category" />
            <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              <div style={{ width: 140, height: 140, flexShrink: 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={catBreak} cx="50%" cy="50%" innerRadius={38} outerRadius={60} paddingAngle={2} dataKey="value">
                      {catBreak.map((e,i)=><Cell key={i} fill={CAT_COLOR[e.name]||"#334155"} strokeWidth={0}/>)}
                    </Pie>
                    <Tooltip content={<Tip/>} formatter={v=>f$(v)}/>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                {[...catBreak].sort((a,b)=>b.value-a.value).map(c=>(
                  <div key={c.name}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "var(--text-muted)", marginBottom: 3 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ width: 5, height: 5, background: CAT_COLOR[c.name]||"#334155", borderRadius: 1 }} />
                        <span>{c.name.replace("_"," ").toUpperCase()}</span>
                      </div>
                      <span style={{ color: "var(--text-secondary)" }}>{f$(c.value)}</span>
                    </div>
                    <PBar pct={Math.round(c.value/burn*100)} color={CAT_COLOR[c.name]||"#334155"} h={3}/>
                  </div>
                ))}
              </div>
            </div>
          </Card>
          <details>
            <summary>Recurring rules (detail)</summary>
            <div className="details-inner">
              <SH label="Recurring Rules" right={f$(burn)+"/mo"} />
              <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--border-subtle)", borderRadius: 4 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", padding: "7px 14px", borderBottom: "1px solid var(--border-subtle)" }}>
                  {["COMMITMENT","CAT","AMOUNT"].map(h=><div key={h} style={{ fontSize: 8, letterSpacing: "0.14em", color: "var(--text-muted)" }}>{h}</div>)}
                </div>
                {[...RULES].sort((a,b)=>b.cents-a.cents).map(r=>(
                  <div key={r.id} className="rh" style={{ display: "grid", gridTemplateColumns: "1fr auto auto", padding: "9px 14px", borderBottom: "1px solid rgba(255,255,255,0.03)", alignItems: "center", gap: 8 }}>
                    <div>
                      <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>{r.label}</div>
                      <div style={{ fontSize: 8, color: "var(--text-muted)", marginTop: 1 }}>{r.vendor} · {r.cadence}</div>
                    </div>
                    <span style={{ fontSize: 8, background: `${CAT_COLOR[r.cat]||"#334155"}22`, color: CAT_COLOR[r.cat]||"var(--text-muted)", border: `1px solid ${CAT_COLOR[r.cat]||"#334155"}44`, padding: "2px 5px", borderRadius: 2, whiteSpace: "nowrap" }}>{r.cat.replace("_"," ").toUpperCase()}</span>
                    <div style={{ fontSize: 12, color: "var(--text-primary)", fontWeight: 600, textAlign: "right" }}>{f$(r.cents/100)}</div>
                  </div>
                ))}
                <div style={{ padding: "10px 14px", borderTop: "1px solid var(--border-subtle)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.12em" }}>TOTAL MONTHLY</span>
                  <span style={{ fontSize: 16, color: "var(--accent, #3b82f6)", fontWeight: 700 }}>{f$(burn)}</span>
                </div>
              </div>
            </div>
          </details>
        </section>

        {/* AI Spend: header + stat cards + vendor bars always visible; reduction roadmap in details */}
        <section style={{ marginBottom: 24 }}>
          <div className="section-header" style={{ color: "var(--text-primary, #1e293b)" }}>AI Spend — {f$(aiMo)}/mo</div>
          <Card style={{ marginBottom: 8 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8, marginBottom: 12 }}>
              {[
                { label: "AI Subs / Mo", value: f$(aiMo), sub: "Subscriptions only", color: "#3b82f6" },
                { label: "Monthly Target", value: "$100", sub: "Cursor reduction goal", color: "#10b981" },
                { label: "Over Budget", value: f$(aiMo - 100), sub: "Above $100 target", color: "#ef4444" },
                { label: "AI Seats", value: "7 seats", sub: "3 Claude · 3 Cursor · 1 GPT", color: "#06b6d4" },
              ].map(({ label, value, sub, color }) => (
                <div key={label} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--border-subtle)", borderRadius: 4, padding: 14, position: "relative" }}>
                  <div style={{ position: "absolute", top: 0, left: 0, width: 3, height: "100%", background: color, borderRadius: "2px 0 0 2px" }} />
                  <Label>{label}</Label>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", marginBottom: 2 }}>{value}</div>
                  <div style={{ fontSize: 8, color: "var(--text-muted)" }}>{sub}</div>
                </div>
              ))}
            </div>
            <SH label="By Vendor" />
            {["Anthropic","OpenAI","Cursor"].map(vendor=>{
              const rs = RULES.filter(r=>r.vendor===vendor&&r.cat==="ai_tools"&&r.cadence==="monthly");
              const total = rs.reduce((s,r)=>s+r.cents,0)/100;
              const pct = Math.round(total/aiMo*100);
              const c = vendor==="Anthropic"?"#f97316":vendor==="OpenAI"?"#10b981":"#3b82f6";
              return (
                <div key={vendor} style={{ marginBottom: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-secondary)", marginBottom: 4 }}>
                    <span>{vendor}</span>
                    <span style={{ color: c }}>{f$(total)} <span style={{ color: "var(--text-muted)" }}>· {pct}%</span></span>
                  </div>
                  <PBar pct={pct} color={c} h={4}/>
                  <div style={{ marginTop: 6 }}>
                    {rs.map(r=>(
                      <div key={r.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 8, color: "var(--text-muted)", padding: "2px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, marginRight: 8 }}>{r.label}</span>
                        <span style={{ flexShrink: 0 }}>{f$(r.cents/100)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </Card>
          <details>
            <summary>Reduction roadmap (detail)</summary>
            <div className="details-inner">
              <SH label="Reduction Roadmap" tag="$1,500 → $100" />
              {[
                ["Current Cursor Subs", "$140/mo · 3 accounts", "#ef4444"],
                ["Est. API Overages", "$50–200/mo variable", "#eab308"],
                ["Model Routing", "Haiku/Flash for simple tasks", "#3b82f6"],
                ["Worker Consolidation", "150+ → 1-worker-1-domain", "#8b5cf6"],
                ["Target", "$100/mo all AI combined", "#10b981"],
              ].map(([l,v,c])=>(
                <div key={l} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", gap: 12 }}>
                  <span style={{ fontSize: 10, color: "var(--text-muted)", flex: 1 }}>{l}</span>
                  <span style={{ fontSize: 10, color: c, flexShrink: 0, textAlign: "right" }}>{v}</span>
                </div>
              ))}
            </div>
          </details>
        </section>

        {/* Goals: header + progress bars + car drawdown chart always visible; goal detail rows in details */}
        <section style={{ marginBottom: 24 }}>
          <div className="section-header" style={{ color: "var(--text-primary, #1e293b)" }}>Goals — {GOALS.length} active</div>
          <Card style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 14 }}>
              {GOALS.map(g=>{
                const pct = Math.min(100, Math.round(g.current/g.target*100));
                const over = g.current > g.target;
                const c = over ? "#ef4444" : pct >= 75 ? "#10b981" : pct >= 40 ? "#3b82f6" : "var(--text-muted)";
                return (
                  <div key={g.id} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--border-subtle)", borderRadius: 4, padding: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12, gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 10, color: "var(--text-secondary)", fontWeight: 600, marginBottom: 2 }}>{g.name}</div>
                        <div style={{ fontSize: 8, color: "var(--text-muted)" }}>{g.desc}</div>
                      </div>
                      <div style={{ fontSize: 28, color: c, fontWeight: 700, lineHeight: 1, flexShrink: 0 }}>{pct}%</div>
                    </div>
                    <PBar pct={pct} color={c} h={7}/>
                  </div>
                );
              })}
            </div>
            <SH label="Car Balance Drawdown" tag="NOV 2026" />
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={carProj} margin={{ top: 4, right: 0, left: -22, bottom: 0 }}>
                <XAxis dataKey="mo" tick={{ fill: "var(--text-secondary)", fontSize: 9, fontFamily: FONT_FAMILY }} axisLine={false} tickLine={false}/>
                <YAxis tick={{ fill: "var(--text-secondary)", fontSize: 9, fontFamily: FONT_FAMILY }} axisLine={false} tickLine={false} tickFormatter={v=>`$${v}`}/>
                <Tooltip content={<Tip/>}/>
                <ReferenceLine y={0} stroke="#10b981" strokeDasharray="3 3"/>
                <Line type="monotone" dataKey="bal" stroke="#eab308" strokeWidth={2} dot={{ fill: "#eab308", r: 3, strokeWidth: 0 }} name="Balance"/>
              </LineChart>
            </ResponsiveContainer>
          </Card>
          <details>
            <summary>Goal details (current, target, due)</summary>
            <div className="details-inner">
              {GOALS.map(g=>{
                const pct = Math.min(100, Math.round(g.current/g.target*100));
                const over = g.current > g.target;
                const c = over ? "#ef4444" : pct >= 75 ? "#10b981" : pct >= 40 ? "#3b82f6" : "var(--text-muted)";
                return (
                  <div key={g.id} style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 10, color: "var(--text-secondary)", fontWeight: 600, marginBottom: 6 }}>{g.name}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                      <KV label="CURRENT" value={g.kind==="currency"?f$(g.current):`${g.current}%`} color="var(--text-secondary)" />
                      <KV label="TARGET" value={g.kind==="currency"?f$(g.target):`${g.target}%`} color="var(--text-secondary)" />
                      <KV label="DUE" value={new Date(g.due).toLocaleDateString("en-US",{ month: "short", year: "numeric" }).toUpperCase()} color={c} />
                    </div>
                  </div>
                );
              })}
            </div>
          </details>
        </section>

        {/* Activity Feed — always visible; section header on canvas uses theme text color */}
        <section style={{ marginTop: 24 }}>
          <SH label="Activity Feed" tag={ra?.events?.length ? `${ra.events.length} events` : "24h"} onCanvas />
          {activityStripError && (
            <div style={{ padding: 16, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, color: "var(--error, #ef4444)", fontSize: 13 }}>
              {activityStripError}
            </div>
          )}
          {activityStripLoading && !activityStripError && (
            <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", fontSize: 14 }}>Loading activity…</div>
          )}
          {!activityStripLoading && !activityStripError && (!ra?.events || ra.events.length === 0) && (
            <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", fontSize: 14 }}>No recent activity</div>
          )}
          {!activityStripLoading && ra?.events?.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {ra.events.map((ev, i) => (
                <div
                  key={i}
                  className="rh"
                  style={{
                    background: "rgba(255,255,255,0.02)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: 4,
                    padding: "10px 14px",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <span style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", flexShrink: 0 }}>{ev.type}</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis" }} title={ev.label}>{trunc(ev.label, 50)}</span>
                  {ev.agent && <span style={{ fontSize: 9, color: "var(--text-muted)" }}>{ev.agent}</span>}
                  <span style={{ fontSize: 10, color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>{relTime(ev.ts)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

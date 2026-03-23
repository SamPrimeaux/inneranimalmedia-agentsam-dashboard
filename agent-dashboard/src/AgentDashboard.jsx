import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import FloatingPreviewPanel from "./FloatingPreviewPanel";
import AnimatedStatusText from "./AnimatedStatusText";
import ExecutionPlanCard from "./ExecutionPlanCard";
import QueueIndicator from "./QueueIndicator";

const SpeechRecognitionAPI =
  typeof window !== "undefined"
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : null;

/** True if string looks like a shell one-liner (for slash-picker instant /run). */
function looksLikeShellCommandText(text) {
  const t = String(text || "").trim();
  if (!t) return false;
  return /^(wrangler|npm|npx|pnpm|yarn|git|node|bash|sh\s|cd|curl|tee|cat|ls|echo|mkdir|rm|cp|mv|chmod|export|source|\.\/|#!)/i.test(
    t
  );
}

const WELCOME_COMMANDS = [
  {
    label: "Daily Briefing",
    subtitle: "Where things stand today",
    prompt:
      "Pull my roadmap_steps where plan_id='plan_iam_dashboard_v1' and status IN ('in_progress','not_started') ordered by order_index. Summarize what's in progress and recommend the single highest-value task to focus on right now.",
  },
  {
    label: "Recipes",
    subtitle: "Pre-built prompt chains",
    prompt:
      "List all rows from agent_recipe_prompts. Show name, description, category. Suggest the most relevant one for active development today.",
  },
  {
    label: "Commands",
    subtitle: "77 saved commands",
    prompt:
      "List all rows from agent_commands grouped by category. Show name and description. Highlight any I haven't run recently.",
  },
  {
    label: "Memory",
    subtitle: "What Agent Sam knows",
    prompt:
      "Query agent_memory_index and show all current memory entries. Identify any gaps or outdated information.",
  },
  {
    label: "Workspaces",
    subtitle: "21 active workspaces",
    prompt:
      "List all rows from the workspaces table. Group by status if column exists. Flag any client workspaces needing attention.",
  },
  {
    label: "Tools",
    subtitle: "30 agent tools available",
    prompt:
      "List all rows from agent_tools. Show name and description. Highlight tools I haven't used that could accelerate current build work.",
  },
];

const LOADING_SAYINGS = [
  "Checking the D1 connection...",
  "Asking the models nicely...",
  "Counting tokens so you don't have to...",
  "Warming up the hamster wheel...",
  "Polishing the response...",
  "Almost there...",
  "Consulting the rubber duck...",
  "Running it through the filter...",
];

const COMPANY_ICON =
  "https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/ac515729-af6b-4ea5-8b10-e581a4d02100/thumbnail";

const MODEL_LABELS = {
  "claude-haiku-4-5-20251001": "Haiku 4.5",
  "claude-sonnet-4-6": "Sonnet 4.6",
  "claude-opus-4-6": "Opus 4.6",
  "gemini-2.5-flash": "Gemini 2.5",
  "gpt-4o": "GPT-4o",
};

function langToExt(lang) {
  const l = String(lang || "")
    .toLowerCase()
    .trim();
  if (["javascript", "js", "jsx"].includes(l)) return "js";
  if (["typescript", "ts", "tsx"].includes(l)) return "ts";
  if (l === "sql") return "sql";
  if (l === "html") return "html";
  if (l === "css") return "css";
  if (l === "json") return "json";
  if (["bash", "sh"].includes(l)) return "sh";
  if (["python", "py"].includes(l)) return "py";
  return "txt";
}

function extractLargestCodeBlock(text) {
  const fenceRe = /```(\w*)\n([\s\S]*?)```/g;
  let largest = null;
  let match;
  while ((match = fenceRe.exec(text)) !== null) {
    const lang = match[1] || "plaintext";
    const code = match[2];
    if (!largest || code.length > largest.code.length) {
      largest = { lang, code };
    }
  }
  return largest;
}

function parseFencedParts(text) {
  const s = String(text ?? "");
  const re = /```(\w*)\n([\s\S]*?)```/g;
  const parts = [];
  let lastIndex = 0;
  let m;
  while ((m = re.exec(s)) !== null) {
    if (m.index > lastIndex) {
      parts.push({ type: "text", text: s.slice(lastIndex, m.index) });
    }
    parts.push({ type: "code", lang: m[1] || "plaintext", code: m[2] });
    lastIndex = re.lastIndex;
  }
  if (lastIndex < s.length) {
    parts.push({ type: "text", text: s.slice(lastIndex) });
  }
  if (parts.length === 0) {
    parts.push({ type: "text", text: s });
  }
  return parts;
}

/** Split plain text into alternating text and image URL segments for inline chat rendering. */
function splitTextWithImageUrls(text) {
  const s = String(text ?? "");
  const segments = [];
  const re = /(https?:\/\/[^\s]+\.(?:png|jpg|jpeg|webp|gif))/gi;
  let lastIndex = 0;
  let m;
  while ((m = re.exec(s)) !== null) {
    if (m.index > lastIndex) {
      segments.push({ type: "text", text: s.slice(lastIndex, m.index) });
    }
    segments.push({ type: "image", url: m[1] });
    lastIndex = re.lastIndex;
  }
  if (lastIndex < s.length) {
    segments.push({ type: "text", text: s.slice(lastIndex) });
  }
  if (segments.length === 0) {
    segments.push({ type: "text", text: s });
  }
  return segments;
}

const AGENT_STATES = {
  IDLE: "IDLE",
  THINKING: "THINKING",
  PLANNING: "PLANNING",
  EXECUTING: "EXECUTING",
  TOOL_CALL: "TOOL_CALL",
  CODE_GEN: "CODE_GEN",
  WAITING_APPROVAL: "WAITING_APPROVAL",
  QUEUED: "QUEUED",
};

const STATE_CONFIG = {
  IDLE: { label: "", messages: [], color: "transparent" },
  THINKING: {
    label: "[THINK]",
    messages: ["Analyzing request...", "Processing context...", "Formulating approach..."],
    color: "var(--mode-color)",
  },
  PLANNING: {
    label: "[PLAN]",
    messages: ["Creating execution plan...", "Breaking down steps...", "Estimating complexity..."],
    color: "var(--mode-plan)",
  },
  EXECUTING: {
    label: "[EXEC]",
    messages: ["Running step {current} of {total}...", "Executing action...", "Applying changes..."],
    color: "var(--mode-agent)",
  },
  TOOL_CALL: {
    label: "[TOOL]",
    messages: ["Calling {tool}...", "Fetching data...", "Processing result..."],
    color: "var(--state-tool)",
  },
  CODE_GEN: {
    label: "[CODE]",
    messages: ["Generating code...", "Writing {file}...", "Building solution..."],
    color: "var(--state-code)",
  },
  WAITING_APPROVAL: {
    label: "[WAIT]",
    messages: ["Awaiting your approval...", "Plan ready for review..."],
    color: "var(--mode-plan)",
  },
  QUEUED: {
    label: "[QUEUE]",
    messages: ["Request queued (position {position})...", "Waiting for current task..."],
    color: "var(--state-queued)",
  },
};

const MODE_ICONS = {
  ask: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  agent: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18.178 8C19.72 8.667 21 10.2 21 12s-1.28 3.333-2.822 4m-12.356 0C4.28 15.333 3 13.8 3 12s1.28-3.333 2.822-4m0 0C7.636 7.333 9.818 7 12 7s4.364.333 6.178 1m-12.356 0C7.636 8.667 9.818 9 12 9s4.364-.333 6.178-1" />
    </svg>
  ),
  plan: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M8 7h8M8 12h8M8 17h5" />
    </svg>
  ),
  debug: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="8" y="6" width="8" height="12" rx="2" />
      <path d="M4 7h4M4 12h4M4 17h4M16 7h4M16 12h4M16 17h4" />
      <path d="M9 3v3M15 3v3" />
    </svg>
  ),
};

function DiffProposalCard({ filename, content, onOpenInEditor, onAccept, onReject }) {
  const [expanded, setExpanded] = useState(false);
  const name = filename || "file";
  const lines = (content || "").split("\n");
  const lineCount = lines.length;
  const previewLines = lines.slice(0, 20);
  return (
    <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden", margin: "6px 0", maxWidth: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderBottom: "1px solid var(--border)", background: "var(--bg-canvas)" }}>
        <span style={{ fontSize: 11, fontFamily: "monospace", color: "var(--text-primary)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
        <span style={{ fontSize: 10, color: "var(--mode-ask)", fontFamily: "monospace" }}>{lineCount} lines</span>
        <button type="button" onClick={() => setExpanded((v) => !v)} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 10, fontFamily: "monospace" }}>
          {expanded ? "^ collapse" : "v preview"}
        </button>
      </div>
      {expanded && (
        <div style={{ maxHeight: 200, overflowY: "auto", padding: "8px 12px", fontFamily: "monospace", fontSize: 11, lineHeight: 1.6, background: "var(--bg-canvas)", color: "var(--text-primary)" }}>
          {previewLines.map((line, i) => (
            <div key={i} style={{ color: line.startsWith("+") ? "var(--mode-ask)" : line.startsWith("-") ? "var(--color-danger)" : "var(--text-secondary)" }}>{line}</div>
          ))}
          {lineCount > 20 && <div style={{ color: "var(--text-muted)", marginTop: 4 }}>... {lineCount - 20} more lines</div>}
        </div>
      )}
      <div style={{ display: "flex", gap: 6, padding: "8px 12px", borderTop: expanded ? "1px solid var(--border)" : "none", flexWrap: "wrap" }}>
        <button type="button" onClick={onOpenInEditor} style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-secondary)", padding: "4px 10px", borderRadius: 4, cursor: "pointer", fontFamily: "monospace", fontSize: 11 }}>
          Open in Editor
        </button>
        <button type="button" onClick={onAccept} style={{ background: "var(--mode-ask)", border: "1px solid var(--border)", color: "var(--color-on-mode)", padding: "4px 10px", borderRadius: 4, cursor: "pointer", fontFamily: "monospace", fontSize: 11, fontWeight: 600 }}>
          Accept
        </button>
        <button type="button" onClick={onReject} style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-muted)", padding: "4px 10px", borderRadius: 4, cursor: "pointer", fontFamily: "monospace", fontSize: 11 }}>
          Reject
        </button>
      </div>
    </div>
  );
}

function TerminalOutputCard({ message, onOpenTerminal }) {
  const [expanded, setExpanded] = useState(true);
  const isRunning = message.status === "running";
  const isError = message.status === "error";
  const borderColor = isError
    ? "var(--danger, var(--color-danger))"
    : isRunning
      ? "var(--accent)"
      : "var(--border)";
  const cardClass = [
    "terminal-output-card",
    isRunning && "terminal-output-card--running",
    isError && "terminal-output-card--error",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={cardClass}
      style={{
        background: "var(--bg-canvas)",
        border: isRunning ? undefined : `1px solid ${borderColor}`,
        borderRadius: 6,
        margin: "6px 0",
        overflow: "hidden",
        maxWidth: "100%",
      }}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded((v) => !v);
          }
        }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 12px",
          background: "var(--bg-elevated)",
          borderBottom: expanded ? "1px solid var(--border)" : "none",
          cursor: "pointer",
        }}
      >
        <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "monospace" }}>
          Terminal
        </span>
        <span
          style={{
            flex: 1,
            fontSize: 11,
            fontFamily: "monospace",
            color: "var(--text-primary)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          $ {message.command}
        </span>
        {isRunning && (
          <span className="terminal-output-card__dots" aria-hidden="true">
            <span className="terminal-output-card__dot" />
            <span className="terminal-output-card__dot" />
            <span className="terminal-output-card__dot" />
          </span>
        )}
        {!isRunning && (
          <span style={{ fontSize: 10, color: isError ? "var(--danger, var(--color-danger))" : "var(--success, var(--color-success))" }}>
            {isError ? "error" : "done"}
          </span>
        )}
        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
          {expanded ? "^" : "v"}
        </span>
      </div>
      {expanded && (
        <div
          style={{
            maxHeight: 220,
            overflowY: "auto",
            padding: "8px 12px",
            fontFamily: "monospace",
            fontSize: 11,
            lineHeight: 1.6,
            background: "var(--bg-canvas)",
            color: "var(--text-primary)",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
          }}
        >
          {message.output || (isRunning ? "" : "(no output)")}
        </div>
      )}
      {!isRunning && (
        <div
          style={{
            display: "flex",
            gap: 6,
            padding: "6px 12px",
            borderTop: expanded ? "1px solid var(--border)" : "none",
          }}
        >
          <button
            type="button"
            onClick={() => {
              if (onOpenTerminal) onOpenTerminal();
            }}
            style={{
              fontSize: 10,
              padding: "3px 8px",
              borderRadius: 4,
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              color: "var(--text-muted)",
              cursor: "pointer",
            }}
          >
            View in Terminal
          </button>
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(message.output || "")}
            style={{
              fontSize: 10,
              padding: "3px 8px",
              borderRadius: 4,
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              color: "var(--text-muted)",
              cursor: "pointer",
            }}
          >
            Copy
          </button>
        </div>
      )}
    </div>
  );
}

const GIT_ACTION_TYPES = ["git_status", "git_commit", "git_push", "git_pull"];

function normalizeTerminalCommand(raw) {
  if (!raw || typeof raw !== "string") return "";
  return raw
    .replace(/^\$\s*/, "")
    .replace(/^\//, "")
    .trim();
}

/** Classify a shell command string as a git action, or null. */
function classifyGitTerminalCommand(rawCommand) {
  const c = normalizeTerminalCommand(rawCommand);
  if (!/^git\s+/i.test(c)) return null;
  const rest = c.replace(/^git\s+/i, "").trim();
  if (/^status(\s|$)/i.test(rest)) return "git_status";
  if (/^commit(\s|$)/i.test(rest)) return "git_commit";
  if (/^push(\s|$)/i.test(rest)) return "git_push";
  if (/^pull(\s|$)/i.test(rest)) return "git_pull";
  return null;
}

function resolveGitActionType(msg) {
  if (!msg) return null;
  if (GIT_ACTION_TYPES.includes(msg.type)) return msg.type;
  if (msg.type === "terminal_output") return classifyGitTerminalCommand(msg.command);
  return null;
}

/** One-line summary from git stdout/stderr for card header (terminal_execute / local terminal). */
function parseGitOutputSummary(gitType, output, command) {
  const text = (output || "").trim();
  const firstLine = text.split(/\r?\n/).find((l) => l.trim()) || "";
  if (!text) return command ? normalizeTerminalCommand(command).slice(0, 80) : "";

  if (gitType === "git_status") {
    const onBranch = text.match(/^On branch (\S+)/m);
    if (onBranch) return `On branch ${onBranch[1]}`;
    const porcelain = text.match(/^## ([^\s]+(?:\s+[^\n]+)?)/m);
    if (porcelain) return porcelain[1].trim();
    return firstLine.slice(0, 120);
  }
  if (gitType === "git_commit") {
    const branchLine = text.match(/^\s*\[([^\]\n]+)\]/m);
    if (branchLine) return branchLine[1].trim().slice(0, 120);
    const nFiles = text.match(/(\d+)\s+files?\s+changed/i);
    if (nFiles) return `${nFiles[1]} files changed`;
    return firstLine.slice(0, 120);
  }
  if (gitType === "git_push") {
    if (/everything up-to-date/i.test(text)) return "Everything up-to-date";
    const branch = text.match(/^\s*To\s+[^\n]+\s*\n\s*([^\n]+)/m);
    if (branch) return branch[1].trim().slice(0, 120);
    return firstLine.slice(0, 120);
  }
  if (gitType === "git_pull") {
    if (/already up to date/i.test(text)) return "Already up to date";
    const ff = text.match(/Fast-forward/i);
    if (ff) return "Fast-forward";
    const merge = text.match(/Merge made/i);
    if (merge) return "Merge completed";
    return firstLine.slice(0, 120);
  }
  return firstLine.slice(0, 120);
}

const GIT_ACTION_CARD_LABEL = {
  git_status: "Git · status",
  git_commit: "Git · commit",
  git_push: "Git · push",
  git_pull: "Git · pull",
};

function GitActionCard({ message, gitType, onOpenTerminal }) {
  const [expanded, setExpanded] = useState(true);
  const isRunning = message.status === "running";
  const isError = message.status === "error";
  const borderColor = isError
    ? "var(--danger, var(--color-danger))"
    : isRunning
      ? "var(--accent)"
      : "var(--border)";
  const summary = parseGitOutputSummary(gitType, message.output, message.command);
  const headerLabel = GIT_ACTION_CARD_LABEL[gitType] || "Git";

  return (
    <div
      style={{
        background: "var(--bg-canvas)",
        border: `1px solid ${borderColor}`,
        borderRadius: 6,
        margin: "6px 0",
        overflow: "hidden",
        maxWidth: "100%",
      }}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded((v) => !v);
          }
        }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 12px",
          background: "var(--bg-elevated)",
          borderBottom: expanded ? "1px solid var(--border)" : "none",
          cursor: "pointer",
        }}
      >
        <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "monospace" }}>{headerLabel}</span>
        <span
          style={{
            flex: 1,
            fontSize: 11,
            fontFamily: "monospace",
            color: "var(--text-primary)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={summary || undefined}
        >
          $ {message.command}
          {summary && !isRunning ? (
            <span style={{ color: "var(--text-muted)", fontWeight: 400 }}> · {summary}</span>
          ) : null}
        </span>
        {isRunning && (
          <span style={{ fontSize: 10, color: "var(--accent)", animation: "spPulse 1s infinite" }}>
            running...
          </span>
        )}
        {!isRunning && (
          <span style={{ fontSize: 10, color: isError ? "var(--danger, var(--color-danger))" : "var(--success, var(--color-success))" }}>
            {isError ? "error" : "done"}
          </span>
        )}
        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{expanded ? "^" : "v"}</span>
      </div>
      {expanded && (
        <div
          style={{
            maxHeight: 220,
            overflowY: "auto",
            padding: "8px 12px",
            fontFamily: "monospace",
            fontSize: 11,
            lineHeight: 1.6,
            background: "var(--bg-canvas)",
            color: "var(--text-primary)",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
          }}
        >
          {message.output || (isRunning ? "..." : "(no output)")}
        </div>
      )}
      {!isRunning && (
        <div
          style={{
            display: "flex",
            gap: 6,
            padding: "8px 12px",
            borderTop: expanded ? "1px solid var(--border)" : "none",
          }}
        >
          <button
            type="button"
            onClick={() => {
              if (onOpenTerminal) onOpenTerminal();
            }}
            style={{
              fontSize: 10,
              padding: "3px 8px",
              borderRadius: 4,
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              color: "var(--text-muted)",
              cursor: "pointer",
            }}
          >
            View in Terminal
          </button>
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(message.output || "")}
            style={{
              fontSize: 10,
              padding: "3px 8px",
              borderRadius: 4,
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              color: "var(--text-muted)",
              cursor: "pointer",
            }}
          >
            Copy
          </button>
        </div>
      )}
    </div>
  );
}

function DeployStatusPill({ message }) {
  const isDeploying = message.status === "deploying";
  const isSuccess = message.status === "success";
  const color = isDeploying ? "var(--accent)" : isSuccess ? "var(--success, var(--color-success))" : "var(--danger, var(--color-danger))";
  const statusMark = isDeploying ? "..." : isSuccess ? "ok" : "fail";
  const label = isDeploying
    ? `Deploying ${message.worker || "worker"}...`
    : isSuccess
      ? `Deployed ${message.worker || "worker"}${message.version_id ? ` · ${message.version_id.slice(0, 8)}` : ""}`
      : `Deploy failed · ${message.worker || "worker"}`;

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "4px 12px",
        background: "var(--bg-elevated)",
        border: "1px solid var(--border)",
        borderRadius: 20,
        fontSize: 11,
        margin: "4px 0",
      }}
    >
      <span
        style={{
          color,
          fontFamily: "monospace",
          fontSize: 10,
          animation: isDeploying ? "spPulse 1s infinite" : "none",
        }}
      >
        {statusMark}
      </span>
      <span style={{ color: "var(--text-secondary)" }}>{label}</span>
      {message.duration_ms != null && (
        <span style={{ color: "var(--text-muted)", fontSize: 10 }}>
          {(message.duration_ms / 1000).toFixed(1)}s
        </span>
      )}
    </div>
  );
}

function ViewerPanelStripIcon({ tab, size }) {
  const dim = size ?? (tab === "files" || tab === "settings" ? 18 : 16);
  const a = { width: dim, height: dim, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2 };
  if (tab === "terminal") return <svg {...a}><polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" /></svg>;
  if (tab === "browser") return <svg {...a}><circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>;
  if (tab === "files") return <svg {...a}><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M13 2v7h7" /></svg>;
  if (tab === "code") return <svg {...a}><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></svg>;
  if (tab === "view") return <svg {...a}><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><line x1="3" y1="9" x2="21" y2="9" /></svg>;
  if (tab === "git") return <svg {...a}><line x1="6" y1="3" x2="6" y2="15" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M18 9a9 9 0 0 1-9 9" /></svg>;
  if (tab === "draw") return <svg {...a}><path d="M12 19l7-7 3 3-7 7-3-3z" /><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" /><path d="M2 2l7.586 7.586" /><circle cx="11" cy="11" r="2" /></svg>;
  if (tab === "settings") return <svg {...a}><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg>;
  return null;
}

const VIEWER_STRIP_TAB_ORDER = ["terminal", "browser", "draw", "files", "code", "view", "git", "settings"];

const VIEWER_STRIP_TITLES = {
  terminal: "Terminal",
  browser: "Browser",
  draw: "Draw",
  files: "Files",
  code: "Code",
  view: "View",
  git: "Git",
  settings: "Settings",
};

function AssistantFencedContent({
  content,
  setCodeContent,
  setCodeFilename,
  setActiveTab,
  setPreviewOpen,
  setLightboxImage,
  openImageInDrawPanel,
}) {
  const parts = useMemo(() => parseFencedParts(content || ""), [content]);
  return (
    <>
      {parts.map((part, i) =>
        part.type === "text" ? (
          <div key={i}>
            {splitTextWithImageUrls(part.text).map((seg, j) =>
              seg.type === "text" ? (
                <div
                  key={`${i}-${j}-t`}
                  style={{
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    fontSize: "13px",
                    lineHeight: 1.65,
                    color: "var(--color-text)",
                  }}
                >
                  {seg.text}
                </div>
              ) : (
                <div
                  key={`${i}-${j}-img`}
                  style={{
                    marginTop: "var(--spacing-sm)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-md)",
                    overflow: "hidden",
                    background: "var(--bg-elevated)",
                  }}
                >
                  <div
                    style={{ cursor: "zoom-in", position: "relative" }}
                    onClick={() => setLightboxImage(seg.url)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setLightboxImage(seg.url);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    aria-label="Open image fullscreen"
                  >
                    <img
                      src={seg.url}
                      alt="Generated image"
                      style={{
                        width: "100%",
                        maxHeight: "280px",
                        objectFit: "contain",
                        display: "block",
                        background: "var(--bg-canvas)",
                      }}
                    />
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: "var(--spacing-xs)",
                      padding: "6px 10px",
                      borderTop: "1px solid var(--color-border)",
                      background: "var(--bg-elevated)",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setLightboxImage(seg.url)}
                      style={{
                        fontSize: "11px",
                        padding: "3px 10px",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--color-border)",
                        background: "transparent",
                        color: "var(--color-muted)",
                        cursor: "pointer",
                      }}
                    >
                      Fullscreen
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const a = document.createElement("a");
                        a.href = seg.url;
                        a.download = seg.url.split("/").pop() || "image.png";
                        a.target = "_blank";
                        a.rel = "noopener noreferrer";
                        a.click();
                      }}
                      style={{
                        fontSize: "11px",
                        padding: "3px 10px",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--color-border)",
                        background: "transparent",
                        color: "var(--color-muted)",
                        cursor: "pointer",
                      }}
                    >
                      Download
                    </button>
                    <button
                      type="button"
                      onClick={() => openImageInDrawPanel(seg.url)}
                      style={{
                        fontSize: "11px",
                        padding: "3px 10px",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--color-border)",
                        background: "transparent",
                        color: "var(--color-muted)",
                        cursor: "pointer",
                      }}
                    >
                      Open in Draw
                    </button>
                  </div>
                </div>
              )
            )}
          </div>
        ) : (
          <div key={i} style={{ marginBottom: "8px" }}>
            <pre
              style={{
                fontSize: 13,
                fontFamily: "monospace",
                overflowX: "auto",
                overflowY: "auto",
                maxWidth: "100%",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                background: "var(--bg-elevated)",
                padding: 12,
                borderRadius: 6,
                margin: 0,
                color: "var(--color-text)",
              }}
            >
              <code style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{part.code}</code>
            </pre>
            <div
              style={{
                display: "flex",
                gap: "var(--spacing-xs)",
                marginTop: "4px",
                alignItems: "center",
              }}
            >
              <span style={{ fontSize: "11px", color: "var(--color-muted)" }}>
                {(part.lang || "plaintext")} · {part.code.split("\n").length} lines
              </span>
              <button
                type="button"
                onClick={() => {
                  setCodeContent(part.code);
                  setCodeFilename((prev) => prev || `agent-output.${langToExt(part.lang)}`);
                  setActiveTab("code");
                  setPreviewOpen(true);
                }}
                style={{
                  fontSize: "11px",
                  padding: "2px 8px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--color-border)",
                  background: "transparent",
                  color: "var(--color-muted)",
                  cursor: "pointer",
                }}
              >
                Open in editor
              </button>
            </div>
          </div>
        )
      )}
    </>
  );
}

export default function AgentDashboard() {
  // ── Core chat state ───────────────────────────────────────────────────────
  const [messages, setMessages] = useState([
    {
      id: "m1",
      role: "assistant",
      content: "Hi, I'm agent_sam. Ask me anything — pick a model above to control cost.",
      provider: "system",
      created_at: Date.now(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [agentActivity, setAgentActivity] = useState(null);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [sessionName, setSessionName] = useState("New Conversation");
  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState("");
  const [showChatMenu, setShowChatMenu] = useState(false);
  const [isStarred, setIsStarred] = useState(false);
  const [showProjectSelector, setShowProjectSelector] = useState(false);
  const [projects, setProjects] = useState([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const sessionNameInputRef = useRef(null);
  const chatMenuRef = useRef(null);
  const [loadingSaying] = useState(
    () => LOADING_SAYINGS[Math.floor(Math.random() * LOADING_SAYINGS.length)]
  );

  // ── Agent / model pickers ─────────────────────────────────────────────────
  const [agents, setAgents] = useState([]);
  const [models, setModels] = useState([]);
  const [activeAgent, setActiveAgent] = useState(null);
  const [activeModel, setActiveModel] = useState(null);
  const [selectedModel, setSelectedModel] = useState(null);
  const [lastUsedModel, setLastUsedModel] = useState(null);
  const [agentPickerOpen, setAgentPickerOpen] = useState(false);
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const agentPickerRef = useRef(null);
  const modelPickerRef = useRef(null);
  const sendMessageRef = useRef(null);

  // ── Attachments ───────────────────────────────────────────────────────────
  const [attachedImages, setAttachedImages] = useState([]);
  const [attachedFiles, setAttachedFiles] = useState([]);
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const canUseVision = activeModel?.supports_vision === 1;

  // ── Connector popup (+ button) ────────────────────────────────────────────
  const [connectorPopupOpen, setConnectorPopupOpen] = useState(false);
  const connectorPopupRef = useRef(null);

  // ── Knowledge search (RAG) panel ─────────────────────────────────────────

  const [mode, setMode] = useState("ask");
  const [useStreaming, setUseStreaming] = useState(false);
  const [modePopupOpen, setModePopupOpen] = useState(false);
  const modeDropdownRef = useRef(null);
  const modelDropdownRef = useRef(null);
  const [showModeDropdown, setShowModeDropdown] = useState(false);
  const [showModelDropdown, setShowModelDropdown] = useState(false);

  const [modelPopupOpen, setModelPopupOpen] = useState(false);
  const modelPopupRef = useRef(null);

  // ── Cost / token gauge ────────────────────────────────────────────────────
  const [telemetry, setTelemetry] = useState({ total_tokens: 0, total_cost: 0 });
  const [costPopoverOpen, setCostPopoverOpen] = useState(false);
  const costPopoverRef = useRef(null);

  const [inputBarContextPct, setInputBarContextPct] = useState(0);

  // ── Agent state (SSE type=state) ───────────────────────────────────────────
  const [agentState, setAgentState] = useState(AGENT_STATES.IDLE);
  const [agentStateContext, setAgentStateContext] = useState({});

  // ── Execution plan for approval (Step 10) ───────────────────────────────────
  const [executionPlan, setExecutionPlan] = useState(null);
  const [pendingToolApproval, setPendingToolApproval] = useState(null);

  // ── Queue status (Step 11) ─────────────────────────────────────────────────
  const [queueStatus, setQueueStatus] = useState(null);
  const [queueDismissed, setQueueDismissed] = useState(false);

  // ── Monaco diff from chat (Option B: Open in Monaco) ───────────────────────
  const [monacoDiffFromChat, setMonacoDiffFromChat] = useState(null);
  const [currentFileContext, setCurrentFileContext] = useState(null);

  // ── Speech recognition (talk-to-type) ─────────────────────────────────────
  const recognitionRef = useRef(null);
  const [isListening, setIsListening] = useState(false);

  // ── Recording ─────────────────────────────────────────────────────────────
  const [isRecording, setIsRecording] = useState(false);

  // ── Panel / split resize ──────────────────────────────────────────────────
  const [previewOpen, setPreviewOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("terminal");
  const [availableCommands, setAvailableCommands] = useState([]);
  const [slashHighlightIndex, setSlashHighlightIndex] = useState(0);
  const [slashPickerSuppressed, setSlashPickerSuppressed] = useState(false);
  const [panelWidthPct, setPanelWidthPct] = useState(() => {
    try {
      const v = localStorage.getItem("iam_panel_width");
      if (v != null) {
        const n = Number(v);
        if (n >= 20 && n <= 80) return n;
      }
    } catch (_) {}
    return 50;
  });
  const panelResizeRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [splitPos, setSplitPos] = useState(58);
  const dragRef = useRef(null);

  // ── Mobile ────────────────────────────────────────────────────────────────
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.innerWidth < 768
  );
  const [mobileIconsOpen, setMobileIconsOpen] = useState(false);
  const mobileIconsStripRef = useRef(null);

  // ── File context (for agent) ──────────────────────────────────────────────
  const [codeContent, setCodeContent] = useState("");
  const [codeFilename, setCodeFilename] = useState("");
  const [previewHtml, setPreviewHtml] = useState("");
  const [browserUrl, setBrowserUrl] = useState("");
  const [lightboxImage, setLightboxImage] = useState(null);
  const [pendingDrawImage, setPendingDrawImage] = useState(null);
  const pendingDrawImageRef = useRef(null);
  const streamAutoPreviewImgRef = useRef(false);
  const [connectedIntegrations, setConnectedIntegrations] = useState({});
  const [proposedFileChange, setProposedFileChange] = useState(null);
  const [openFileKeyForPanel, setOpenFileKeyForPanel] = useState(null);
  const [fileCreatedNotification, setFileCreatedNotification] = useState(null);

  // ── Integrations status ───────────────────────────────────────────────────
  const [integrationsStatus, setIntegrationsStatus] = useState({});

  const [recentFiles, setRecentFiles] = useState([]);

  const defaultBucketForMonacoRef = useRef(null);

  // ── Refs ──────────────────────────────────────────────────────────────────
  const messagesEndRef = useRef(null);
  const abortControllerRef = useRef(null);
  const textareaRef = useRef(null);
  const runCommandRunnerRef = useRef(null);

  // ── Default R2 bucket for Open in Monaco (no hardcoded bucket) ─────────────
  useEffect(() => {
    if (defaultBucketForMonacoRef.current) return;
    fetch("/api/r2/buckets", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((data) => {
        const names = data.bound_bucket_names || (data.buckets || []).map((b) => b.bucket_name || b.name);
        if (names && names.length > 0) defaultBucketForMonacoRef.current = names[0];
      })
      .catch(() => {});
  }, []);

  // ── Persist panel width ───────────────────────────────────────────────────
  useEffect(() => {
    try {
      localStorage.setItem("iam_panel_width", String(panelWidthPct));
    } catch (_) {}
  }, [panelWidthPct]);

  // ── Mobile resize listener ────────────────────────────────────────────────
  useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);

  // ── URL params ────────────────────────────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlSession = params.get("session");
    if (urlSession) setCurrentSessionId(urlSession);
  }, []);

  // ── Boot data ─────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/agent/boot", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((data) => {
        if (data.agents?.length) {
          setAgents(data.agents);
          setActiveAgent(data.agents[0]);
        }
        if (data.models?.length) {
          setModels(data.models);
          const defaultId = data.default_model_id;
          const defaultModel = defaultId
            ? data.models.find((m) => m.id === defaultId || m.model_key === defaultId)
            : null;
          setSelectedModel({ id: "auto", display_name: "Auto" });
          setActiveModel(defaultModel ?? data.models[0]);
        }
        if (data.integrations) setConnectedIntegrations(data.integrations);
        if (data.integrations_status) setIntegrationsStatus(data.integrations_status);
      })
      .catch(() => {});
  }, []);

  // ── OAuth popup success: refresh integrations after Google/GitHub connect ───
  useEffect(() => {
    const onMessage = (event) => {
      if (event.source !== window.opener && event.source !== window) return;
      if (event.data?.type !== "oauth_success") return;
      const originOk = !event.origin || event.origin === window.location.origin;
      if (!originOk) return;
      fetch("/api/agent/boot", { credentials: "same-origin" })
        .then((r) => r.json())
        .then((data) => {
          if (data.integrations) setConnectedIntegrations(data.integrations);
          if (data.integrations_status) setIntegrationsStatus(data.integrations_status);
        })
        .catch(() => {});
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // ── Draw iframe (pages/draw) -> chat: structured prompts for Agent Sam ──
  useEffect(() => {
    const postLoadImageToDrawFrame = (url, attempt) => {
      const n = attempt === undefined ? 0 : attempt;
      const frame = document.querySelector('iframe[title="Draw"]');
      if (frame?.contentWindow && url) {
        try {
          frame.contentWindow.postMessage(
            { type: "load_image_background", url },
            window.location.origin
          );
        } catch (_) {}
        pendingDrawImageRef.current = null;
        setPendingDrawImage(null);
        return;
      }
      if (n < 40 && url) {
        setTimeout(() => postLoadImageToDrawFrame(url, n + 1), 50);
      }
    };
    const onIamDrawMessage = (event) => {
      if (event.origin !== window.location.origin) return;
      if (!event.data) return;
      if (event.data.type === "draw_ready") {
        const url = pendingDrawImageRef.current;
        if (url) postLoadImageToDrawFrame(url, 0);
        return;
      }
      if (event.data.type !== "iam_draw_request") return;
      const kind = event.data.kind;
      const prompts = {
        from_chat:
          "[Draw] From Chat: generate from the current conversation and render on the draw canvas.",
        uml: "[Draw] Generate a UML diagram for the current conversation context and render it in the draw canvas.",
        mockup: "[Draw] Generate a UI mockup for the current conversation context and render it in the draw canvas.",
        wireframe:
          "[Draw] Generate a wireframe for the current conversation context and render it in the draw canvas.",
      };
      const promptText = prompts[kind];
      if (!promptText) return;
      setPreviewOpen(true);
      setActiveTab("draw");
      const fn = sendMessageRef.current;
      if (typeof fn === "function") void fn(promptText);
    };
    window.addEventListener("message", onIamDrawMessage);
    const handleShellNav = (e) => {
      const url = e?.detail?.url;
      if (!url) return;
      setBrowserUrl(url);
      setActiveTab("browser");
      setPreviewOpen(true);
    };
    window.addEventListener("iam_shell_nav", handleShellNav);
    return () => {
      window.removeEventListener("message", onIamDrawMessage);
      window.removeEventListener("iam_shell_nav", handleShellNav);
    };
  }, []);

  // ── Load session messages ─────────────────────────────────────────────────
  useEffect(() => {
    if (!currentSessionId) return;
    const welcomeMsg = {
      id: "m1",
      role: "assistant",
      content: "Hi, I'm agent_sam. Ask me anything — pick a model above to control cost.",
      provider: "system",
      created_at: Date.now(),
    };
    setMessages([welcomeMsg]);
    fetch(`/api/agent/sessions/${currentSessionId}/messages`, { credentials: "same-origin" })
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : data.messages ?? [];
        if (list.length > 0) {
          setMessages((prev) => {
            const fetched = list.map((m) => ({
              id: m.id,
              role: m.role,
              content: m.content || "",
              provider: m.provider || null,
              created_at: m.created_at ? m.created_at * 1000 : Date.now(),
            }));
            const prevUsers = prev.filter((x) => x.role === "user");
            const userIdxs = fetched
              .map((x, i) => (x.role === "user" ? i : -1))
              .filter((i) => i >= 0);
            for (let k = 0; k < userIdxs.length; k++) {
              const pm = prevUsers[k];
              const fi = userIdxs[k];
              if (!pm) break;
              const hasPrevAttach =
                (pm.attachedImageUrls && pm.attachedImageUrls.length > 0) ||
                (pm.attachedImagePreviews && pm.attachedImagePreviews.length > 0);
              const hasFetchedAttach =
                (fetched[fi].attachedImageUrls && fetched[fi].attachedImageUrls.length > 0) ||
                (fetched[fi].attachedImagePreviews && fetched[fi].attachedImagePreviews.length > 0);
              if (hasPrevAttach && !hasFetchedAttach) {
                fetched[fi] = {
                  ...fetched[fi],
                  ...(pm.attachedImageUrls?.length ? { attachedImageUrls: pm.attachedImageUrls } : {}),
                  ...(pm.attachedImagePreviews?.length ? { attachedImagePreviews: pm.attachedImagePreviews } : {}),
                };
              }
            }
            return fetched;
          });
        }
      })
      .catch(() => {});
  }, [currentSessionId]);

  // Fetch session name when currentSessionId is set (for header display and edit)
  useEffect(() => {
    if (!currentSessionId) {
      setSessionName("New Conversation");
      return;
    }
    fetch(`/api/agent/sessions/${currentSessionId}`, { credentials: "same-origin" })
      .then((r) => r.json())
      .then((data) => {
        if (data) {
          if (data.name) setSessionName(data.name);
          setIsStarred(data.is_starred === 1);
        }
      })
      .catch(() => { setSessionName("New Conversation"); setIsStarred(false); });
  }, [currentSessionId]);

  const refreshQueue = useCallback(() => {
    if (!currentSessionId) return;
    fetch(`/api/agent/queue/status?session_id=${encodeURIComponent(currentSessionId)}`, { credentials: "same-origin" })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) return;
        setQueueStatus({ current: d.current ?? null, queue_count: d.queue_count ?? 0, queue: d.queue ?? [] });
        if ((d.queue_count ?? 0) === 0) setQueueDismissed(false);
      })
      .catch(() => {});
  }, [currentSessionId]);

  useEffect(() => {
    if (!currentSessionId) return;
    refreshQueue();
    const interval = setInterval(refreshQueue, 2000);
    return () => clearInterval(interval);
  }, [currentSessionId, refreshQueue]);

  const deleteQueueItem = useCallback(async (queueId) => {
    try {
      await fetch(`/api/agent/queue/${queueId}`, { method: "DELETE", credentials: "same-origin" });
      refreshQueue();
    } catch (e) {
      console.error("Failed to delete queue item:", e);
    }
  }, [refreshQueue]);

  const saveSessionName = useCallback(() => {
    if (!currentSessionId || !editNameValue.trim()) {
      setIsEditingName(false);
      return;
    }
    const name = editNameValue.trim().slice(0, 200);
    fetch(`/api/agent/sessions/${currentSessionId}`, {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data && (data.success || data.id || !data.error)) {
          setSessionName(name);
          if (data.id) setCurrentSessionId(data.id);
        }
      })
      .catch(() => {})
      .finally(() => {
        setIsEditingName(false);
        setEditNameValue("");
      });
  }, [currentSessionId, editNameValue]);

  const toggleStar = useCallback(async () => {
    if (!currentSessionId) return;
    try {
      const response = await fetch(`/api/agent/sessions/${currentSessionId}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ starred: !isStarred }),
      });
      if (response.ok) {
        setIsStarred((prev) => !prev);
        setShowChatMenu(false);
      }
    } catch (e) {
      console.error("Failed to toggle star:", e);
    }
  }, [currentSessionId, isStarred]);

  const openProjectSelector = useCallback(async () => {
    setShowChatMenu(false);
    try {
      const response = await fetch("/api/projects", { credentials: "same-origin" });
      const data = await response.json();
      setProjects(data.projects || []);
      setShowProjectSelector(true);
    } catch (e) {
      console.error("Failed to load projects:", e);
    }
  }, []);

  const linkToProject = useCallback(async (projectId) => {
    if (!currentSessionId) return;
    try {
      const response = await fetch(`/api/agent/sessions/${currentSessionId}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId }),
      });
      if (response.ok) setShowProjectSelector(false);
    } catch (e) {
      console.error("Failed to link project:", e);
    }
  }, [currentSessionId]);

  const deleteConversation = useCallback(async () => {
    if (!currentSessionId) return;
    try {
      const response = await fetch(`/api/agent/sessions/${currentSessionId}`, { method: "DELETE", credentials: "same-origin" });
      if (response.ok) {
        setCurrentSessionId(null);
        setMessages([
          {
            id: "m1",
            role: "assistant",
            content: "Hi, I'm agent_sam. Ask me anything — pick a model above to control cost.",
            provider: "system",
            created_at: Date.now(),
          },
        ]);
        setSessionName("New Conversation");
        setIsStarred(false);
        setShowDeleteConfirm(false);
        setShowChatMenu(false);
      }
    } catch (e) {
      console.error("Failed to delete conversation:", e);
    }
  }, [currentSessionId]);

  // ── Scroll to bottom ──────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Close pickers on outside click ───────────────────────────────────────
  useEffect(() => {
    if (!connectorPopupOpen && !costPopoverOpen && !modelPickerOpen && !agentPickerOpen && !showModeDropdown && !showModelDropdown && !showChatMenu) return;
    const onDocClick = (e) => {
      if (connectorPopupRef.current && !connectorPopupRef.current.contains(e.target))
        setConnectorPopupOpen(false);
      if (costPopoverRef.current && !costPopoverRef.current.contains(e.target))
        setCostPopoverOpen(false);
      if (modelPickerRef.current && !modelPickerRef.current.contains(e.target))
        setModelPickerOpen(false);
      if (agentPickerRef.current && !agentPickerRef.current.contains(e.target))
        setAgentPickerOpen(false);
      if (modeDropdownRef.current && !modeDropdownRef.current.contains(e.target))
        setShowModeDropdown(false);
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target))
        setShowModelDropdown(false);
      if (chatMenuRef.current && !chatMenuRef.current.contains(e.target))
        setShowChatMenu(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [connectorPopupOpen, costPopoverOpen, modelPickerOpen, agentPickerOpen, showModeDropdown, showModelDropdown, showChatMenu]);

  useEffect(() => {
    if (!mobileIconsOpen) return;
    const onDoc = (e) => {
      if (mobileIconsStripRef.current && !mobileIconsStripRef.current.contains(e.target)) {
        setMobileIconsOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [mobileIconsOpen]);

  // ── Keyboard shortcuts ───────────────────────────────────────────────────
  useEffect(() => {
    function handleKeyboardShortcut(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setPreviewOpen(true);
        setActiveTab("settings");
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault();
        textareaRef.current?.focus();
      }
      if (e.key === "Escape") {
        if (lightboxImage) {
          setLightboxImage(null);
          return;
        }
        setPreviewOpen(false);
        setMobileIconsOpen(false);
        setConnectorPopupOpen(false);
        setShowModeDropdown(false);
        setShowModelDropdown(false);
      }
    }
    window.addEventListener("keydown", handleKeyboardShortcut);
    return () => window.removeEventListener("keydown", handleKeyboardShortcut);
  }, [lightboxImage]);

  // ── Load commands (for Settings tab) ──────────────────────────────────────
  useEffect(() => {
    fetch("/api/commands", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((data) => {
        const list = data.commands || [];
        setAvailableCommands(Array.isArray(list) ? list : []);
      })
      .catch(() => setAvailableCommands([]));
  }, []);

  const slashFilterToken = useMemo(() => {
    const line = (input.split("\n")[0] || "").trimEnd();
    if (!line.startsWith("/")) return "";
    return line.slice(1).split(/\s+/)[0].toLowerCase();
  }, [input]);

  const filteredSlashCommands = useMemo(() => {
    if (!slashFilterToken) return availableCommands;
    return availableCommands.filter((cmd) => {
      const slug = String(cmd.slug || "").toLowerCase();
      const name = String(cmd.name || "").toLowerCase();
      return slug.includes(slashFilterToken) || name.includes(slashFilterToken);
    });
  }, [availableCommands, slashFilterToken]);

  useEffect(() => {
    const line = (input.split("\n")[0] || "").trimEnd();
    if (!line.startsWith("/")) setSlashPickerSuppressed(false);
  }, [input]);

  useEffect(() => {
    setSlashHighlightIndex(0);
  }, [slashFilterToken]);

  // ── Split-pane drag (mouse + touch) ──────────────────────────────────────
  const onDragStart = useCallback(() => setDragging(true), []);
  useEffect(() => {
    if (!dragging) return;
    const prevSelect = document.body.style.userSelect;
    const prevCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    const onMove = (e) => {
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const container = dragRef.current?.parentElement;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const pct = ((clientX - rect.left) / rect.width) * 100;
      setSplitPos(Math.min(Math.max(pct, 25), 80));
    };
    const onUp = () => {
      setDragging(false);
      document.body.style.userSelect = prevSelect;
      document.body.style.cursor = prevCursor;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
      document.body.style.userSelect = prevSelect;
      document.body.style.cursor = prevCursor;
    };
  }, [dragging]);

  // ── Floating panel resize (mouse) ─────────────────────────────────────────
  const handlePanelResize = useCallback(
    (e) => {
      e.preventDefault();
      if (e.button !== 0) return;
      const startX = e.clientX;
      const startPct = panelWidthPct;
      const onMove = (e2) => {
        e2.preventDefault();
        const w = window.innerWidth;
        const deltaPct = ((startX - e2.clientX) / w) * 100;
        setPanelWidthPct(Math.max(25, Math.min(75, startPct + deltaPct)));
      };
      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        document.body.style.userSelect = "";
        document.body.style.cursor = "";
      };
      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [panelWidthPct]
  );

  // ── Floating panel resize (touch) ─────────────────────────────────────────
  const handlePanelResizeTouch = useCallback(
    (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      const startX = touch.clientX;
      const startPct = panelWidthPct;
      const onMove = (e2) => {
        e2.preventDefault();
        const t = e2.touches[0];
        const deltaPct = ((startX - t.clientX) / window.innerWidth) * 100;
        setPanelWidthPct(Math.max(25, Math.min(75, startPct + deltaPct)));
      };
      const onUp = () => {
        window.removeEventListener("touchmove", onMove);
        window.removeEventListener("touchend", onUp);
      };
      window.addEventListener("touchmove", onMove, { passive: false });
      window.addEventListener("touchend", onUp);
    },
    [panelWidthPct]
  );

  // ── quickStart helper ─────────────────────────────────────────────────────
  const quickStart = useCallback((text) => {
    setInput(text);
    setTimeout(() => {
      document.querySelector(".agent-input-bar-wrap textarea")?.focus();
    }, 50);
  }, []);

  useEffect(() => {
    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) return;
    const rec = new SpeechRecognitionAPI();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";

    rec.onresult = (event) => {
      let finalTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript + " ";
        }
      }
      if (finalTranscript) {
        setInput((prev) => prev + finalTranscript);
      }
    };

    rec.onerror = (event) => {
      console.error("Speech recognition error:", event.error);
      setIsListening(false);
    };

    rec.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = rec;

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (_) {}
      }
    };
  }, []);

  const toggleMic = () => {
    if (!recognitionRef.current) {
      const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognitionAPI) {
        alert("Voice input is not supported in this browser. Try Chrome or Edge.");
        return;
      }
    }
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current?.start();
        setIsListening(true);
      } catch (err) {
        console.error("Speech recognition start failed:", err);
        setIsListening(false);
      }
    }
  };

  // ── Send message ──────────────────────────────────────────────────────────
  const sendMessage = async (textOverride) => {
    if (isLoading || agentState !== AGENT_STATES.IDLE) return;
    const raw = typeof textOverride === "string" ? textOverride : input;
    const trimmedInput = raw.trim();
    const hasAttachments = attachedImages.length > 0 || attachedFiles.length > 0;
    if (!trimmedInput && !hasAttachments) return;
    const text =
      trimmedInput ||
      (attachedImages.length ? "(image attached)" : "(files attached)");

    if (trimmedInput.startsWith("/")) {
      const commandParts = trimmedInput.slice(1).split(/\s+/);
      const commandName = commandParts[0] || "";
      const paramsStr = commandParts.slice(1).join(" ").trim();
      const ts = Date.now();
      const userMsgId = `m${ts}`;
      const termCardId = `tc_${ts}`;
      setMessages((prev) => [
        ...prev,
        { id: userMsgId, role: "user", content: text, provider: null, created_at: ts },
        {
          id: termCardId,
          role: "tool",
          type: "terminal_output",
          command: trimmedInput,
          output: "",
          status: "running",
          created_at: ts,
        },
      ]);
      setInput("");
      setAgentActivity({
        label: `Running: ${trimmedInput.slice(0, 40)}${trimmedInput.length > 40 ? "..." : ""}`,
        type: "terminal",
      });
      try {
        const response = await fetch("/api/agent/commands/execute", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            command_name: commandName,
            parameters: paramsStr ? { raw: paramsStr } : {},
            session_id: currentSessionId,
          }),
        });
        const data = await response.json().catch(() => ({}));
        const success = !!(data && data.success);
        const r = data?.result;
        let outText = success
          ? r?.output || r?.result || (r != null ? JSON.stringify(r, null, 2) : "(command completed)")
          : data.error || "Unknown error";
        if (success) {
          if (outText == null || String(outText).trim() === "" || String(outText) === "null") {
            outText = "(command completed)";
          } else {
            outText = String(outText);
          }
        }
        setMessages((prev) =>
          prev.map((m) =>
            m.id === termCardId ? { ...m, output: outText, status: success ? "success" : "error" } : m
          )
        );
      } catch (e) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === termCardId
              ? { ...m, output: e.message || "Request failed", status: "error" }
              : m
          )
        );
      } finally {
        setAgentActivity(null);
      }
      return;
    }

    const imagesToSend = attachedImages.length ? [...attachedImages] : undefined;
    const filesToSend = attachedFiles.length
      ? attachedFiles.map((f) => ({ name: f.name, content: f.content, encoding: f.encoding || "utf8", size: f.size }))
      : undefined;
    const userMsg = {
      id: `m${Date.now()}`,
      role: "user",
      content: text,
      provider: null,
      created_at: Date.now(),
      attachedImagePreviews: attachedImages.length ? attachedImages.map((img) => img.dataUrl).filter(Boolean) : undefined,
      attachedImageUrls: attachedImages.length
        ? attachedImages.map((img) => img.url || img.dataUrl).filter(Boolean)
        : undefined,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setAttachedImages([]);
    setAttachedFiles([]);
    setIsLoading(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const conversationMessages = messages
      .filter((m) => {
        if (m.role === "system") return false;
        if (m.role === "user" || m.role === "assistant") return true;
        if (m.role === "tool" && m.type === "terminal_output") return true;
        return false;
      })
      .slice(-20)
      .map((m) => {
        if (m.role === "tool" && m.type === "terminal_output") {
          const cmd = m.command != null ? String(m.command) : "";
          const out = m.output != null ? String(m.output) : "";
          const safeContent = out.trim()
            ? (cmd ? `[${cmd}]\n${out}` : out).trim()
            : cmd
              ? `(command completed) ${cmd}`
              : "(command completed)";
          return { role: "user", content: safeContent };
        }
        const role = m.role === "assistant" ? "assistant" : "user";
        const raw = m.content;
        const safeContent =
          raw != null && String(raw).trim() !== "" ? String(raw) : "(empty)";
        return { role, content: safeContent };
      });

    setAgentState(AGENT_STATES.THINKING);
    setPendingToolApproval(null);

    try {
      const response = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        signal: controller.signal,
        body: JSON.stringify({
          model_id: selectedModel?.id === "auto" ? "auto" : activeModel?.id,
          agent_id: activeAgent?.id,
          session_id: currentSessionId,
          messages: [...conversationMessages, { role: "user", content: text }],
          images: imagesToSend,
          attached_files: filesToSend,
          stream: useStreaming,
          mode,
          fileContext: currentFileContext,
        }),
      });

      const contentType = response.headers.get("Content-Type") || "";
      const isStream = contentType.includes("text/event-stream") && response.ok;

      if (isStream && response.body) {
        const assistantId = `m${Date.now()}`;
        setMessages((prev) => [
          ...prev,
          {
            id: assistantId,
            role: "assistant",
            content: "",
            provider: activeModel?.provider ?? "system",
            created_at: Date.now(),
          },
        ]);
        let buffer = "";
        const decoder = new TextDecoder();
        const reader = response.body.getReader();
        let fullContent = "";
        streamAutoPreviewImgRef.current = false;
        let inputTok = 0;
        let outputTok = 0;
        let costUsd = 0;
        let convId = currentSessionId;
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";
            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const raw = line.slice(6).trim();
              if (raw === "[DONE]") continue;
              try {
                const data = JSON.parse(raw);
                if (data.type === "state" && data.state != null) {
                  setAgentState(data.state);
                  if (data.tool != null || data.file != null || data.current != null || data.total != null || data.position != null) {
                    setAgentStateContext({
                      tool: data.tool,
                      file: data.file,
                      current: data.current,
                      total: data.total,
                      position: data.position,
                    });
                  }
                  if (data.state === "WAITING_APPROVAL" && data.plan_id != null) {
                    setExecutionPlan({
                      plan_id: data.plan_id,
                      summary: data.summary ?? "",
                      steps: Array.isArray(data.steps) ? data.steps : [],
                    });
                  }
                } else if (data.type === "code" && data.code != null) {
                  const codeStr = typeof data.code === "string" ? data.code : JSON.stringify(data.code, null, 2);
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantId
                        ? {
                            ...m,
                            generatedCode: codeStr,
                            filename: data.filename ?? "snippet",
                            language: data.language ?? "text",
                          }
                        : m
                    )
                  );
                } else if (data.type === "text" && data.text) {
                  fullContent += data.text;
                  const openMatch = fullContent.match(/OPEN_IN_PREVIEW:\s*(https?:\/\/[^\s\n]+)/);
                  if (openMatch) setBrowserUrl(openMatch[1]);
                  const displayContent = fullContent.replace(/\n?OPEN_IN_PREVIEW:\s*https?:\/\/[^\s\n]+/g, "").trim();
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantId ? { ...m, content: displayContent } : m
                    )
                  );
                  const imgMatch = fullContent.match(/https?:\/\/[^\s]+\.(?:png|jpg|jpeg|webp|gif)/i);
                  if (imgMatch && !streamAutoPreviewImgRef.current) {
                    const u = imgMatch[0];
                    const hint =
                      /\b(generated|here is|created)\b/i.test(fullContent) ||
                      /imgx|\/generated\//i.test(u) ||
                      /imagedelivery\.net|cf[-_]images/i.test(u);
                    if (hint) {
                      streamAutoPreviewImgRef.current = true;
                      handleOpenInBrowser(u);
                    }
                  }
                } else if (data.type === "tool_approval_request" && data.tool) {
                  setPendingToolApproval(data.tool);
                } else if (data.type === "done") {
                  inputTok = data.input_tokens ?? 0;
                  outputTok = data.output_tokens ?? 0;
                  costUsd = data.cost_usd ?? 0;
                  if (data.conversation_id) convId = data.conversation_id;
                  if (data.model_used) setLastUsedModel(data.model_used);
                } else if (data.type === "error") {
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantId
                        ? { ...m, content: (m.content || "") + "\n\nError: " + (data.error || "Unknown") }
                        : m
                    )
                  );
                }
              } catch (_) { /* ignore parse errors */ }
            }
          }
          const finalForFence = fullContent
            .replace(/\n?OPEN_IN_PREVIEW:\s*https?:\/\/[^\s\n]+/g, "")
            .trim();
          const largestFence = extractLargestCodeBlock(finalForFence);
          if (largestFence && largestFence.code.split("\n").length >= 15) {
            setCodeContent(largestFence.code);
            setCodeFilename((prev) => prev || `agent-output.${langToExt(largestFence.lang)}`);
          }
        } finally {
          reader.releaseLock();
        }
        setTelemetry((prev) => ({
          total_tokens: prev.total_tokens + inputTok + outputTok,
          total_cost: prev.total_cost + (costUsd || 0),
        }));
        const totalTokens = (telemetry.total_tokens || 0) + inputTok + outputTok;
        setInputBarContextPct(Math.min(100, Math.round((totalTokens / 200000) * 100)));
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, tokens: inputTok + outputTok }
              : m
          )
        );
        if (convId && convId !== currentSessionId) {
          setCurrentSessionId(convId);
          window.history.replaceState(null, "", `?session=${convId}`);
        }
        return;
      }

      const data = await response.json();
      if (!response.ok) {
        setMessages((prev) => [
          ...prev,
          {
            id: `m${Date.now()}`,
            role: "assistant",
            content: data.error || "Request failed",
            provider: "error",
            created_at: Date.now(),
          },
        ]);
        return;
      }
      if (data.tool_approval_request === true && data.tool) {
        setPendingToolApproval(data.tool);
        if (data.text != null && data.text !== "") {
          setMessages((prev) => [
            ...prev,
            {
              id: `m${Date.now()}`,
              role: "assistant",
              content: data.text,
              provider: activeModel?.provider ?? "system",
              created_at: Date.now(),
            },
          ]);
        }
        if (data.conversation_id) {
          setCurrentSessionId(data.conversation_id);
          window.history.replaceState(null, "", `?session=${data.conversation_id}`);
        }
        return;
      }
      const content =
        (typeof data.content === "string" ? data.content : null) ??
        data.content?.[0]?.text ??
        data.choices?.[0]?.message?.content ??
        (typeof data.message === "string" ? data.message : "No response");
      const stripForFence = String(content)
        .replace(/\n?OPEN_IN_PREVIEW:\s*https?:\/\/[^\s\n]+/g, "")
        .trim();
      const largestNonStreamFence = extractLargestCodeBlock(stripForFence);
      if (largestNonStreamFence && largestNonStreamFence.code.split("\n").length >= 15) {
        setCodeContent(largestNonStreamFence.code);
        setCodeFilename((prev) => prev || `agent-output.${langToExt(largestNonStreamFence.lang)}`);
      }
      const inputTok = data.usage?.input_tokens ?? data.usage?.prompt_tokens ?? 0;
      const outputTok = data.usage?.output_tokens ?? data.usage?.completion_tokens ?? 0;
      setTelemetry((prev) => ({
        total_tokens: prev.total_tokens + inputTok + outputTok,
        total_cost: prev.total_cost,
      }));
      const totalTokens = (telemetry.total_tokens || 0) + inputTok + outputTok;
      setInputBarContextPct(Math.min(100, Math.round((totalTokens / 200000) * 100)));
      setMessages((prev) => [
        ...prev,
        {
          id: `m${Date.now()}`,
          role: "assistant",
          content,
          provider: activeModel?.provider ?? "system",
          created_at: Date.now(),
          tokens: inputTok + outputTok,
        },
      ]);
      if (data.conversation_id) {
        setCurrentSessionId(data.conversation_id);
        window.history.replaceState(null, "", `?session=${data.conversation_id}`);
      }
    } catch (err) {
      if (err.name === "AbortError") return;
      setMessages((prev) => [
        ...prev,
        {
          id: `m${Date.now()}`,
          role: "assistant",
          content: `Error: ${err.message}`,
          provider: "error",
          created_at: Date.now(),
        },
      ]);
    } finally {
      abortControllerRef.current = null;
      setIsLoading(false);
      setAgentState(AGENT_STATES.IDLE);
      setAgentStateContext({});
    }
  };

  sendMessageRef.current = sendMessage;

  const applySlashCommandSelection = (cmd) => {
    const slugRaw = String(cmd.slug || cmd.name || "").trim();
    const slugKey = (slugRaw.startsWith("/") ? slugRaw.slice(1) : slugRaw).toLowerCase();
    const ct = String(cmd.command_text || "").trim();
    const instantSlugs = new Set(["deploy", "deploy-full", "tail", "db-health"]);
    const instant =
      ct &&
      (instantSlugs.has(slugKey) ||
        slugKey.startsWith("bash-") ||
        slugKey.startsWith("wrangler-") ||
        looksLikeShellCommandText(ct));
    const hasRequiredParams = /<[^>]+>/.test(ct);
    setSlashPickerSuppressed(false);
    setSlashHighlightIndex(0);
    setInput("");
    const buildSendLine = () => {
      if (ct) {
        if (ct.startsWith("/")) return ct;
        return `/${slugKey} ${ct}`.trim();
      }
      return slugRaw.startsWith("/") ? slugRaw : `/${slugKey}`;
    };
    if (instant) {
      void sendMessage(`/run ${ct}`);
    } else if (!hasRequiredParams) {
      void sendMessage(buildSendLine());
    } else {
      setInput(ct || (slugRaw.startsWith("/") ? slugRaw : `/${slugRaw}`));
    }
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const stopGeneration = () => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
  };

  const handlePlanApprove = useCallback(
    async (planId) => {
      try {
        const r = await fetch("/api/agent/plan/approve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ plan_id: planId }),
        });
        const d = await r.json().catch(() => ({}));
        if (r.ok && d.status === "approved") {
          setExecutionPlan(null);
          setAgentState(AGENT_STATES.EXECUTING);
        }
      } catch (_) {}
    },
    []
  );

  const handlePlanReject = useCallback(
    async (planId) => {
      try {
        await fetch("/api/agent/plan/reject", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ plan_id: planId }),
        });
        setExecutionPlan(null);
        setAgentState(AGENT_STATES.IDLE);
      } catch (_) {}
    },
    []
  );

  const approveTool = useCallback(
    async (tool) => {
      if (!tool?.name) return;
      try {
        const r = await fetch("/api/agent/chat/execute-approved-tool", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            tool_name: tool.name,
            tool_input: tool.parameters || {},
          }),
        });
        const d = await r.json().catch(() => ({}));
        setPendingToolApproval(null);
        const msgContent = r.ok && d.success
          ? "Tool executed: " + tool.name + (d.result != null ? "\nResult: " + (typeof d.result === "string" ? d.result : JSON.stringify(d.result).slice(0, 500)) : "")
          : "Tool " + tool.name + " failed: " + (d.error || (r.ok ? "Unknown" : "Request failed"));
        setMessages((prev) => [
          ...prev,
          {
            id: `sys${Date.now()}`,
            role: "assistant",
            content: msgContent,
            provider: "system",
            created_at: Date.now(),
          },
        ]);
        if (r.ok && d.success && tool.name === "r2_write") {
          const key = tool.parameters?.key ?? tool.parameters?.path;
          const bucket = "iam-platform";
          if (key) {
            setOpenFileKeyForPanel({ bucket, key });
            setFileCreatedNotification({ bucket, key });
            setPreviewOpen(true);
            setActiveTab("code");
          }
        }
      } catch (_) {
        setPendingToolApproval(null);
        setMessages((prev) => [
          ...prev,
          {
            id: `sys${Date.now()}`,
            role: "assistant",
            content: "Tool " + (tool?.name || "request") + " failed: network or parse error",
            provider: "system",
            created_at: Date.now(),
          },
        ]);
      }
    },
    []
  );

  const openInMonaco = useCallback(
    async (message) => {
      const filename = message.filename ?? "snippet";
      const language = message.language ?? "text";
      const generatedCode = message.generatedCode ?? "";
      const bucket = message.bucket || defaultBucketForMonacoRef.current;
      let originalContent = "";
      if (bucket) {
        try {
          const r = await fetch(
            `/api/r2/buckets/${encodeURIComponent(bucket)}/object/${encodeURIComponent(filename)}`,
            { credentials: "same-origin" }
          );
          if (r.ok) originalContent = await r.text();
        } catch (_) {}
      }
      setMonacoDiffFromChat({
        original: originalContent,
        modified: generatedCode,
        filename,
        language,
        bucket: bucket || undefined,
      });
      setPreviewOpen(true);
      setActiveTab("code");
    },
    []
  );

  // ── Screenshot from Browser panel → attach to message ─────────────────────
  const [screenshotAttachFeedback, setScreenshotAttachFeedback] = useState("");
  const handleBrowserScreenshotUrl = useCallback((url) => {
    if (!url || typeof url !== "string") return;
    fetch(url, { credentials: "same-origin" })
      .then((r) => r.blob())
      .then((blob) => {
        const reader = new FileReader();
        reader.onload = () => {
          setAttachedImages((prev) =>
            [...prev, { name: `screenshot-${Date.now()}.png`, dataUrl: reader.result, url }].slice(-3)
          );
          setScreenshotAttachFeedback("Screenshot attached to message");
          setTimeout(() => setScreenshotAttachFeedback(""), 2500);
          textareaRef.current?.focus();
        };
        reader.readAsDataURL(blob);
      })
      .catch(() => setScreenshotAttachFeedback("Could not attach screenshot"));
  }, []);

  const handleDeployStart = useCallback((worker) => {
    const pillId = `dp_${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: pillId,
        role: "tool",
        type: "deploy_status",
        worker: worker || "inneranimalmedia",
        status: "deploying",
        created_at: Date.now(),
      },
    ]);
    return pillId;
  }, []);

  const handleDeployComplete = useCallback((pillId, success, versionId, durationMs) => {
    if (pillId == null) return;
    setMessages((prev) =>
      prev.map((m) =>
        m.id === pillId
          ? {
              ...m,
              status: success ? "success" : "failed",
              version_id: versionId,
              duration_ms: durationMs,
            }
          : m
      )
    );
  }, []);

  const handleOpenInBrowser = useCallback((url) => {
    if (!url || typeof url !== "string") return;
    const u = url.trim();
    const normalized = u.startsWith("http") || u.startsWith("/") ? u : `https://${u}`;
    setBrowserUrl(normalized);
    setActiveTab("browser");
    setPreviewOpen(true);
  }, [setBrowserUrl, setActiveTab, setPreviewOpen]);

  const openImageInDrawPanel = useCallback((url) => {
    if (!url || typeof url !== "string") return;
    const u = url.trim();
    pendingDrawImageRef.current = u;
    setPendingDrawImage(u);
    setActiveTab("draw");
    setPreviewOpen(true);
  }, [setActiveTab, setPreviewOpen]);

  // ── File attach (text vs binary) ───────────────────────────────────────────
  const IMAGE_SIZE_LIMIT = 10 * 1024 * 1024;
  const FILE_SIZE_LIMIT = 10 * 1024 * 1024;
  const TEXT_EXTENSIONS = new Set(["txt", "md", "json", "js", "mjs", "cjs", "ts", "tsx", "jsx", "html", "htm", "css", "scss", "xml", "yml", "yaml", "csv", "log", "env", "sh", "bash", "sql", "graphql", "mdx", "svg"]);
  const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "ico"]);
  const isImageFile = (file) => {
    if (file.type && file.type.startsWith("image/")) return true;
    const ext = (file.name || "").split(".").pop()?.toLowerCase();
    return ext ? IMAGE_EXTENSIONS.has(ext) : false;
  };
  const isTextFile = (file) => {
    if (file.type && file.type.startsWith("text/")) return true;
    const ext = (file.name || "").split(".").pop()?.toLowerCase();
    return ext ? TEXT_EXTENSIONS.has(ext) : false;
  };
  const arrayBufferToBase64 = (buffer) => {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  };

  const onImageSelect = (e) => {
    const files = Array.from(e.target.files || [])
      .filter((f) => f.type.startsWith("image/") && f.size <= IMAGE_SIZE_LIMIT)
      .slice(0, 3);
    if (!files.length) { e.target.value = ""; return; }
    let done = 0;
    const next = [];
    files.forEach((f) => {
      const reader = new FileReader();
      reader.onload = () => {
        next.push({ name: f.name, dataUrl: reader.result });
        done++;
        if (done === files.length)
          setAttachedImages((prev) => [...prev, ...next].slice(-3));
      };
      reader.readAsDataURL(f);
    });
    e.target.value = "";
  };

  const onFileSelect = (e) => {
    const files = Array.from(e.target.files || []).filter((f) => f.size <= FILE_SIZE_LIMIT);
    if (!files.length) { e.target.value = ""; return; }
    let done = 0;
    const next = [];
    files.forEach((f) => {
      if (isTextFile(f)) {
        const reader = new FileReader();
        reader.onload = () => {
          next.push({ name: f.name, content: reader.result, encoding: "utf8" });
          done++;
          if (done === files.length) setAttachedFiles((prev) => [...prev, ...next].slice(-5));
        };
        reader.readAsText(f, "UTF-8");
      } else {
        const reader = new FileReader();
        reader.onload = () => {
          next.push({ name: f.name, content: arrayBufferToBase64(reader.result), encoding: "base64", size: f.size });
          done++;
          if (done === files.length) setAttachedFiles((prev) => [...prev, ...next].slice(-5));
        };
        reader.readAsArrayBuffer(f);
      }
    });
    e.target.value = "";
  };

  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const onDropFiles = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    let rawFiles = Array.from(e.dataTransfer?.files || []);
    if (rawFiles.length === 0 && e.dataTransfer?.items?.length) {
      rawFiles = [];
      for (let i = 0; i < e.dataTransfer.items.length; i++) {
        const item = e.dataTransfer.items[i];
        if (item.kind === "file") {
          const file = item.getAsFile();
          if (file) rawFiles.push(file);
        }
      }
    }
    const imageFiles = rawFiles.filter((f) => isImageFile(f) && f.size <= IMAGE_SIZE_LIMIT);
    const codeFiles = rawFiles.filter((f) => !isImageFile(f) && f.size <= FILE_SIZE_LIMIT);
    if (!imageFiles.length && !codeFiles.length) return;
    if (imageFiles.length) {
      let done = 0;
      const next = [];
      imageFiles.slice(0, 3).forEach((f) => {
        const reader = new FileReader();
        reader.onload = () => {
          next.push({ name: f.name, dataUrl: reader.result });
          done++;
          if (done === imageFiles.slice(0, 3).length)
            setAttachedImages((prev) => [...prev, ...next].slice(-3));
        };
        reader.readAsDataURL(f);
      });
    }
    if (codeFiles.length) {
      let done = 0;
      const next = [];
      codeFiles.forEach((f) => {
        if (isTextFile(f)) {
          const reader = new FileReader();
          reader.onload = () => {
            next.push({ name: f.name, content: reader.result, encoding: "utf8" });
            done++;
            if (done === codeFiles.length) setAttachedFiles((prev) => [...prev, ...next].slice(-5));
          };
          reader.readAsText(f, "UTF-8");
        } else {
          const reader = new FileReader();
          reader.onload = () => {
            next.push({ name: f.name, content: arrayBufferToBase64(reader.result), encoding: "base64", size: f.size });
            done++;
            if (done === codeFiles.length) setAttachedFiles((prev) => [...prev, ...next].slice(-5));
          };
          reader.readAsArrayBuffer(f);
        }
      });
    }
  };
  const onDragOverFiles = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer?.types?.includes("Files")) e.dataTransfer.dropEffect = "copy";
  };
  const onDragEnterFiles = (e) => {
    if (e.dataTransfer?.types?.includes("Files")) setIsDraggingOver(true);
  };
  const onDragLeaveFiles = (e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) setIsDraggingOver(false);
  };

  const handleFileContextChange = useCallback((context) => {
    setCurrentFileContext(context);
    console.log("File context stored:", context?.filename);
  }, []);

  // ── Gauges (real-time from conversation history) ───────────────────────────
  const totalChars = messages
    .filter(m => m.provider !== "system")
    .reduce(
      (sum, m) => sum + (typeof m.content === "string" ? m.content.length : JSON.stringify(m.content || "").length),
      0
    );
  const estimatedTokens = Math.ceil(totalChars / 4);
  const contextMax = activeModel?.context_max_tokens || 200000;
  const contextLimitK = Math.round(contextMax / 1000);
  const contextUsedK = Math.round(estimatedTokens / 1000);
  const rawPct = (estimatedTokens / contextMax) * 100;
  const contextPct = rawPct < 1 && rawPct > 0 ? '<1' : Math.min(100, Math.round(rawPct));
  const contextPctNum = typeof contextPct === 'string' ? 0.5 : contextPct;
  const contextPctLabel = typeof contextPct === 'string' ? contextPct : Math.round(contextPct);
  const chatPaneIsWide = !previewOpen || (100 - panelWidthPct) > 60;
  const placeholderText =
    messages.length === 0
      ? "How can I help?"
      : isLoading || agentState !== AGENT_STATES.IDLE
        ? "Add a follow up..."
        : "Reply";
  // ── Provider bubble color ─────────────────────────────────────────────────
  const providerBorderColor = (provider) => {
    if (!provider || provider === "system") return "var(--color-border)";
    if (provider === "anthropic") return "#D97757";
    if (provider === "openai") return "#10a37f";
    if (provider === "google") return "#4285F4";
    if (provider === "cloudflare_workers_ai") return "#00E5CC";
    if (provider === "error") return "var(--color-danger, #ef4444)";
    return "var(--color-border)";
  };

  // ── Active theme slug for Monaco ──────────────────────────────────────────
  const activeThemeSlug =
    typeof window !== "undefined"
      ? document.documentElement.getAttribute("data-theme") ||
        localStorage.getItem("dashboard-theme") ||
        ""
      : "";

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  const queueCurrent = queueStatus?.current ?? null;
  const queueCount = queueStatus?.queue_count ?? 0;
  const showQueueIndicator = !queueDismissed && (queueCurrent || queueCount > 0);

  const slashFirstLine = (input.split("\n")[0] || "").trimEnd();
  const showSlashPicker =
    agentState === AGENT_STATES.IDLE &&
    slashFirstLine.startsWith("/") &&
    availableCommands.length > 0 &&
    !slashPickerSuppressed;
  const slashSafeIndex =
    filteredSlashCommands.length > 0
      ? Math.min(Math.max(0, slashHighlightIndex), filteredSlashCommands.length - 1)
      : 0;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "var(--bg-elevated)",
        color: "var(--color-text)",
        fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
        fontSize: "13px",
        overflow: "hidden",
        margin: 0,
        padding: 0,
        border: "none",
      }}
    >
      {showQueueIndicator && (
        <QueueIndicator
          current={queueCurrent}
          queueCount={queueCount}
          queue={queueStatus?.queue ?? []}
          onClear={() => setQueueDismissed(true)}
          onDeleteItem={deleteQueueItem}
        />
      )}
      <div
        style={{
          display: "flex",
          flex: "1 1 0%",
          height: "100%",
          overflow: "hidden",
          minHeight: 0,
          flexDirection: "row",
        }}
      >
        {/* ── Chat pane ──────────────────────────────────────────────────── */}
        <div
          className="iam-chat-pane"
          style={{
            flex: previewOpen && !isMobile ? `0 0 ${100 - panelWidthPct}%` : "1 1 0%",
            minWidth: 0,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            transition: dragging ? "none" : "flex 0.15s",
            background: "var(--bg-elevated)",
            margin: 0,
            padding: 0,
            border: "none",
          }}
        >
          {/* Chat title with actions */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "8px 12px",
              background: "var(--bg-canvas)",
              borderBottom: "1px solid var(--color-border)",
            }}
          >
            <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: "6px" }}>
              {isEditingName ? (
                <input
                  ref={sessionNameInputRef}
                  type="text"
                  value={editNameValue}
                  onChange={(e) => setEditNameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveSessionName();
                    if (e.key === "Escape") {
                      setIsEditingName(false);
                      setEditNameValue("");
                    }
                  }}
                  onBlur={saveSessionName}
                  placeholder="Chat name"
                  style={{
                    flex: 1,
                    minWidth: 0,
                    maxWidth: "280px",
                    padding: "4px 8px",
                    fontSize: "12px",
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "4px",
                    color: "var(--color-text)",
                    outline: "none",
                  }}
                  autoFocus
                />
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setEditNameValue(sessionName);
                    setIsEditingName(true);
                    setTimeout(() => sessionNameInputRef.current?.focus(), 0);
                  }}
                  title="Click to rename"
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--color-text)",
                    cursor: "pointer",
                    padding: "4px 6px",
                    borderRadius: "4px",
                    fontSize: "14px",
                    fontWeight: 500,
                    maxWidth: "100%",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    textAlign: "left",
                  }}
                >
                  {sessionName || "What are you doing today?"}
                </button>
              )}
              {/* Session action menu */}
              <div ref={chatMenuRef} style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={() => setShowChatMenu((v) => !v)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    padding: "4px 6px",
                    borderRadius: 4,
                    fontSize: 14,
                    lineHeight: 1,
                  }}
                  title="Session options"
                >
                  {"\u2022\u2022\u2022"}
                </button>
                {showChatMenu && (
                  <div
                    style={{
                      position: "absolute",
                      top: "100%",
                      right: 0,
                      zIndex: 200,
                      background: "var(--bg-elevated)",
                      border: "1px solid var(--border)",
                      borderRadius: 6,
                      padding: 4,
                      minWidth: 160,
                      boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                    }}
                  >
                    {[
                      {
                        label: "Rename",
                        action: () => {
                          setShowChatMenu(false);
                          setEditNameValue(sessionName);
                          setIsEditingName(true);
                          setTimeout(() => sessionNameInputRef.current?.focus(), 0);
                        },
                      },
                      {
                        label: isStarred ? "Unstar conversation" : "Star conversation",
                        action: () => {
                          toggleStar();
                          setShowChatMenu(false);
                        },
                      },
                      {
                        label: "Add to project",
                        action: () => {
                          openProjectSelector();
                          setShowChatMenu(false);
                        },
                      },
                      {
                        label: "Delete",
                        action: () => {
                          setShowDeleteConfirm(true);
                          setShowChatMenu(false);
                        },
                      },
                    ].map((item) => (
                      <button
                        key={item.label}
                        type="button"
                        onClick={item.action}
                        style={{
                          display: "block",
                          width: "100%",
                          textAlign: "left",
                          background: "none",
                          border: "none",
                          color: "var(--text-secondary)",
                          padding: "6px 10px",
                          borderRadius: 4,
                          cursor: "pointer",
                          fontFamily: "inherit",
                          fontSize: 12,
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "var(--bg-canvas)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "none";
                        }}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {showProjectSelector && (
                <div
                  style={{
                    position: "fixed",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: "rgba(0,0,0,0.5)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    zIndex: 10000,
                  }}
                  onClick={() => setShowProjectSelector(false)}
                >
                  <div
                    style={{
                      background: "var(--bg-elevated)",
                      border: "1px solid var(--color-border)",
                      borderRadius: "8px",
                      padding: "20px",
                      maxWidth: "400px",
                      width: "90%",
                      maxHeight: "60vh",
                      overflow: "auto",
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <h3 style={{ margin: "0 0 16px 0", color: "var(--color-text)" }}>Add to Project</h3>
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      {projects.map((project) => (
                        <button
                          key={project.id}
                          type="button"
                          onClick={() => linkToProject(project.id)}
                          style={{
                            padding: "12px",
                            background: "var(--bg-canvas)",
                            border: "1px solid var(--color-border)",
                            borderRadius: "6px",
                            cursor: "pointer",
                            textAlign: "left",
                            color: "var(--color-text)",
                            fontFamily: "inherit",
                          }}
                        >
                          <div style={{ fontWeight: 600 }}>{project.name}</div>
                          {project.description && (
                            <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>
                              {project.description}
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowProjectSelector(false)}
                      style={{
                        marginTop: "16px",
                        padding: "8px 16px",
                        background: "var(--color-border)",
                        border: "none",
                        borderRadius: "6px",
                        cursor: "pointer",
                        width: "100%",
                        color: "var(--color-text)",
                        fontFamily: "inherit",
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

          {showDeleteConfirm && (
                <div
                  style={{
                    position: "fixed",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: "rgba(0,0,0,0.5)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    zIndex: 10000,
                  }}
                  onClick={() => setShowDeleteConfirm(false)}
                >
                  <div
                    style={{
                      background: "var(--bg-elevated)",
                      border: "1px solid var(--color-border)",
                      borderRadius: "8px",
                      padding: "20px",
                      maxWidth: "400px",
                      width: "90%",
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <h3 style={{ margin: "0 0 12px 0", color: "var(--color-text)" }}>Delete Conversation?</h3>
                    <p style={{ color: "var(--text-muted)", margin: "0 0 20px 0" }}>
                      This will permanently delete this conversation and all messages. This cannot be undone.
                    </p>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button
                        type="button"
                        onClick={deleteConversation}
                        style={{
                          flex: 1,
                          padding: "10px",
                          background: "var(--color-danger)",
                          color: "var(--bg-elevated)",
                          border: "none",
                          borderRadius: "6px",
                          cursor: "pointer",
                          fontWeight: 600,
                          fontFamily: "inherit",
                        }}
                      >
                        Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowDeleteConfirm(false)}
                        style={{
                          flex: 1,
                          padding: "10px",
                          background: "var(--color-border)",
                          border: "none",
                          borderRadius: "6px",
                          cursor: "pointer",
                          color: "var(--color-text)",
                          fontFamily: "inherit",
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}

          {/* Messages (drop zone so dropping on scroll area also attaches) */}
          <div
            className="messages-container"
            onDrop={onDropFiles}
            onDragOver={onDragOverFiles}
            onDragEnter={onDragEnterFiles}
            onDragLeave={onDragLeaveFiles}
            style={{
              flex: 1,
              overflowY: "auto",
              overflowX: "hidden",
              padding: "0 16px 16px 16px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              minHeight: 0,
              minWidth: 0,
              scrollBehavior: "smooth",
              wordBreak: "break-word",
            }}
          >
            {messages.length <= 1 && messages[0]?.role === "assistant" ? (
              /* Welcome cards */
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  flex: 1,
                  gap: "24px",
                  maxWidth: "480px",
                  width: "100%",
                }}
              >
                <img
                  src={COMPANY_ICON}
                  alt="Inner Animal Media"
                  style={{ width: "56px", height: "56px", borderRadius: "12px", objectFit: "contain", opacity: 0.85 }}
                />
                <div style={{ fontSize: "18px", fontWeight: "600", color: "var(--color-primary)", letterSpacing: "-0.01em" }}>
                  level AI
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, 1fr)",
                    gap: "10px",
                    width: "100%",
                  }}
                >
                  {WELCOME_COMMANDS.map((c) => (
                    <button
                      key={c.label}
                      type="button"
                      onClick={() => quickStart(c.prompt)}
                      style={{
                        padding: "14px 16px",
                        background: "var(--bg-canvas)",
                        border: "1px solid var(--color-border)",
                        borderRadius: "10px",
                        color: "var(--color-text)",
                        fontSize: "12px",
                        textAlign: "left",
                        cursor: "pointer",
                        fontFamily: "inherit",
                        transition: "border-color 0.15s",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--color-primary)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--color-border)"; }}
                    >
                      <div style={{ fontWeight: "600", marginBottom: "3px", color: "var(--color-text)" }}>{c.label}</div>
                      <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{c.subtitle}</div>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {messages.map((msg) => {
                  const gitActionType = resolveGitActionType(msg);
                  const userImageSrcs =
                    msg.role === "user"
                      ? msg.attachedImageUrls?.length
                        ? msg.attachedImageUrls
                        : msg.attachedImagePreviews || []
                      : [];
                  return (
                  <div
                    key={msg.id}
                    style={{
                      display: "flex",
                      gap: "10px",
                      flexDirection: msg.role === "user" ? "row-reverse" : "row",
                      width: "100%",
                      maxWidth: "720px",
                      alignSelf: "center",
                      marginBottom: "12px",
                    }}
                  >
                    <div
                      style={{
                        width: "28px",
                        height: "28px",
                        borderRadius: "50%",
                        background: msg.role === "user" ? "var(--color-primary)" : "var(--bg-canvas)",
                        border: `1px solid ${providerBorderColor(msg.provider)}`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "10px",
                        color: msg.role === "user" ? "var(--bg-canvas)" : "var(--text-muted)",
                        flexShrink: 0,
                        fontWeight: "700",
                      }}
                    >
                      {msg.role === "user" ? "S" : "AI"}
                    </div>
                    <div
                      style={{
                        maxWidth: "72%",
                        minWidth: 0,
                        background: msg.role === "user" ? "var(--bg-canvas)" : "var(--bg-elevated)",
                        border: `1px solid ${providerBorderColor(msg.provider)}`,
                        borderRadius: msg.role === "user" ? "12px 4px 12px 12px" : "4px 12px 12px 12px",
                        padding: "10px 14px",
                        overflowX: "hidden",
                      }}
                    >
                      {gitActionType ? (
                        <GitActionCard
                          message={msg}
                          gitType={gitActionType}
                          onOpenTerminal={() => {
                            setActiveTab("terminal");
                            setPreviewOpen(true);
                          }}
                        />
                      ) : msg.type === "terminal_output" ? (
                        <TerminalOutputCard
                          message={msg}
                          onOpenTerminal={() => {
                            setActiveTab("terminal");
                            setPreviewOpen(true);
                          }}
                        />
                      ) : null}
                      {msg.type === "deploy_status" && <DeployStatusPill message={msg} />}
                      {userImageSrcs.length > 0 && (
                        <div
                          style={{
                            display: "flex",
                            gap: "8px",
                            flexWrap: "wrap",
                            marginBottom: "10px",
                            padding: "8px",
                            background: "var(--bg-elevated)",
                            border: "1px solid var(--color-border)",
                            borderRadius: "8px",
                          }}
                        >
                          {userImageSrcs.map((src, i) => (
                            <img
                              key={i}
                              src={src}
                              alt=""
                              style={{
                                maxWidth: "120px",
                                maxHeight: "120px",
                                objectFit: "cover",
                                borderRadius: "6px",
                                border: "1px solid var(--color-border)",
                              }}
                            />
                          ))}
                        </div>
                      )}
                      {msg.type !== "terminal_output" &&
                        msg.type !== "deploy_status" &&
                        !gitActionType && (
                        <div
                          style={{
                            fontSize: "13px",
                            color: "var(--color-text)",
                            lineHeight: "1.65",
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                          }}
                        >
                          {msg.role === "assistant" ? (
                            <AssistantFencedContent
                              content={msg.content}
                              setCodeContent={setCodeContent}
                              setCodeFilename={setCodeFilename}
                              setActiveTab={setActiveTab}
                              setPreviewOpen={setPreviewOpen}
                              setLightboxImage={setLightboxImage}
                              openImageInDrawPanel={openImageInDrawPanel}
                            />
                          ) : (
                            msg.content
                          )}
                        </div>
                      )}
                      {msg.generatedCode && (msg.language === "bash" || msg.language === "sh" || msg.language === "shell") && (
                        <div
                          className="message-code-block"
                          style={{
                            background: "var(--bg-canvas)",
                            borderRadius: 8,
                            padding: 16,
                            marginTop: 12,
                            maxWidth: "100%",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              marginBottom: 8,
                              fontSize: 12,
                              color: "var(--text-muted)",
                            }}
                          >
                            <span>{msg.filename ?? "snippet"}</span>
                            <span
                              style={{
                                padding: "2px 8px",
                                background: "var(--mode-code)",
                                borderRadius: 4,
                                color: "var(--color-on-mode)",
                              }}
                            >
                              {msg.language ?? "text"}
                            </span>
                          </div>
                          <pre
                            style={{
                              fontSize: 13,
                              fontFamily: "monospace",
                              overflowX: "auto",
                              overflowY: "auto",
                              maxWidth: "100%",
                              maxHeight: 300,
                              whiteSpace: "pre-wrap",
                              wordBreak: "break-word",
                              background: "var(--bg-elevated)",
                              padding: 12,
                              borderRadius: 6,
                              margin: 0,
                              color: "var(--color-text)",
                            }}
                          >
                            <code style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                              {msg.generatedCode.split("\n").slice(0, 15).join("\n")}
                              {msg.generatedCode.split("\n").length > 15 && (
                                <div
                                  style={{
                                    color: "var(--text-muted)",
                                    fontStyle: "italic",
                                    marginTop: 8,
                                  }}
                                >
                                  ... {msg.generatedCode.split("\n").length - 15} more lines
                                </div>
                              )}
                            </code>
                          </pre>
                          <div
                            style={{
                              display: "flex",
                              gap: "var(--spacing-xs)",
                              marginTop: "4px",
                              alignItems: "center",
                            }}
                          >
                            <span style={{ fontSize: "11px", color: "var(--color-muted)" }}>
                              {(msg.language || "shell")} · {msg.generatedCode.split("\n").length} lines
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setCodeContent(msg.generatedCode);
                                setCodeFilename((prev) =>
                                  prev || `agent-output.${langToExt(msg.language)}`
                                );
                                setActiveTab("code");
                                setPreviewOpen(true);
                              }}
                              style={{
                                fontSize: "11px",
                                padding: "2px 8px",
                                borderRadius: "var(--radius-sm)",
                                border: "1px solid var(--color-border)",
                                background: "transparent",
                                color: "var(--color-muted)",
                                cursor: "pointer",
                              }}
                            >
                              Open in editor
                            </button>
                          </div>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              marginTop: 8,
                              flexWrap: "wrap",
                              gap: 8,
                            }}
                          >
                            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                              {msg.generatedCode.split("\n").length} lines total
                            </span>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              {!(msg.commandDenied || msg.commandRun) && (
                                <>
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      const cmd = (msg.generatedCode || "").trim();
                                      if (!cmd) return;
                                      const termCardId = `tc_${Date.now()}`;
                                      setMessages((prev) => [
                                        ...prev,
                                        {
                                          id: termCardId,
                                          role: "tool",
                                          type: "terminal_output",
                                          command: cmd,
                                          output: "",
                                          status: "running",
                                          created_at: Date.now(),
                                        },
                                      ]);
                                      setAgentActivity({
                                        label: `Running: ${cmd.slice(0, 40)}${cmd.length > 40 ? "..." : ""}`,
                                        type: "terminal",
                                      });
                                      try {
                                        const res = await fetch("/api/agent/terminal/run", {
                                          method: "POST",
                                          headers: { "Content-Type": "application/json" },
                                          credentials: "same-origin",
                                          body: JSON.stringify({ command: cmd, session_id: currentSessionId }),
                                        });
                                        const data = await res.json().catch(() => ({}));
                                        const errText = data.error || (!res.ok ? "Request failed" : null);
                                        const outText = data.output || errText || "(no output)";
                                        setMessages((prev) =>
                                          prev.map((m) => {
                                            if (m.id === termCardId) {
                                              return {
                                                ...m,
                                                output: outText,
                                                status: errText ? "error" : "success",
                                              };
                                            }
                                            if (m.id === msg.id) {
                                              return { ...m, commandRun: true, terminalOutput: data.output ?? data.error };
                                            }
                                            return m;
                                          })
                                        );
                                      } catch (_) {
                                        setMessages((prev) =>
                                          prev.map((m) => {
                                            if (m.id === termCardId) {
                                              return { ...m, output: "Request failed", status: "error" };
                                            }
                                            if (m.id === msg.id) {
                                              return { ...m, commandRun: true, terminalOutput: "Request failed" };
                                            }
                                            return m;
                                          })
                                        );
                                      } finally {
                                        setAgentActivity(null);
                                      }
                                    }}
                                    style={{
                                      padding: "6px 12px",
                                      background: "var(--color-primary)",
                                      color: "var(--color-on-primary)",
                                      border: "none",
                                      borderRadius: 6,
                                      cursor: "pointer",
                                      fontSize: 12,
                                      fontWeight: 500,
                                    }}
                                  >
                                    Run
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setMessages((prev) =>
                                        prev.map((m) => (m.id === msg.id ? { ...m, commandDenied: true } : m))
                                      )
                                    }
                                    style={{
                                      padding: "6px 12px",
                                      background: "var(--bg-elevated)",
                                      color: "var(--text-secondary)",
                                      border: "1px solid var(--border)",
                                      borderRadius: 6,
                                      cursor: "pointer",
                                      fontSize: 12,
                                      fontWeight: 500,
                                    }}
                                  >
                                    Deny
                                  </button>
                                </>
                              )}
                              {msg.commandDenied && (
                                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Denied</span>
                              )}
                              {msg.commandRun && (
                                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Sent to terminal</span>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                      {msg.generatedCode && !(msg.language === "bash" || msg.language === "sh" || msg.language === "shell") && (
                        <div style={{ marginTop: 12 }}>
                          <DiffProposalCard
                            filename={msg.filename}
                            content={msg.generatedCode}
                            onOpenInEditor={() => openInMonaco(msg)}
                            onAccept={() => {
                              setProposedFileChange({
                                filename: msg.filename ?? "snippet",
                                content: msg.generatedCode,
                                bucket: msg.bucket || defaultBucketForMonacoRef.current,
                              });
                              setPreviewOpen(true);
                              setActiveTab("code");
                            }}
                            onReject={() =>
                              setMessages((prev) =>
                                prev.map((m) =>
                                  m.id === msg.id ? { ...m, generatedCode: undefined, filename: undefined, language: undefined } : m
                                )
                              )
                            }
                          />
                        </div>
                      )}
                      {(msg.tokens != null && msg.tokens !== 0) && (
                        <div style={{ marginTop: "5px", fontSize: "10px", color: "var(--text-muted)" }}>
                          {msg.tokens} tokens
                        </div>
                      )}
                    </div>
                  </div>
                  );
                })}

                {isLoading && (
                  <div
                    style={{
                      display: "flex",
                      gap: "10px",
                      alignItems: "center",
                      width: "100%",
                      maxWidth: "720px",
                      alignSelf: "center",
                      marginBottom: "12px",
                    }}
                  >
                    <div
                      style={{
                        width: "28px",
                        height: "28px",
                        borderRadius: "50%",
                        background: "var(--bg-canvas)",
                        border: "1px solid var(--color-border)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "10px",
                        color: "var(--text-muted)",
                        flexShrink: 0,
                      }}
                    >
                      AI
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{loadingSaying}</div>
                      <div style={{ display: "flex", gap: "4px" }}>
                        {[0, 1, 2].map((i) => (
                          <div
                            key={i}
                            style={{
                              width: "6px",
                              height: "6px",
                              borderRadius: "50%",
                              background: "var(--color-primary)",
                              animation: `agentPulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
            {(isLoading || agentState !== AGENT_STATES.IDLE) && (
              <div
                style={{
                  padding: "6px 12px 12px",
                  minHeight: "24px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-start",
                  width: "100%",
                  maxWidth: "720px",
                  alignSelf: "center",
                }}
              >
                <AnimatedStatusText
                  state={agentState}
                  config={STATE_CONFIG[agentState]}
                  context={agentStateContext}
                />
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* ── Execution plan card (Step 10) ───────────────────────────────── */}
          {agentState === AGENT_STATES.WAITING_APPROVAL && executionPlan && (
            <div style={{ flexShrink: 0, padding: "0 16px 12px" }}>
              <ExecutionPlanCard
                plan_id={executionPlan.plan_id}
                summary={executionPlan.summary}
                steps={executionPlan.steps}
                onApprove={handlePlanApprove}
                onReject={handlePlanReject}
              />
            </div>
          )}

          {/* ── Tool approval card (Ask mode: action tool requires permission) ── */}
          {pendingToolApproval && (
            <div style={{ flexShrink: 0, padding: "0 16px 12px" }}>
              <div
                style={{
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "8px",
                  padding: "16px",
                  margin: "12px 0",
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: "8px" }}>
                  Agent wants to execute: {pendingToolApproval.name}
                </div>
                <div style={{ color: "var(--text-muted)", fontSize: "14px", marginBottom: "12px" }}>
                  {pendingToolApproval.preview}
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    type="button"
                    onClick={() => approveTool(pendingToolApproval)}
                    style={{
                      background: "var(--mode-color)",
                      color: "var(--color-on-mode)",
                      padding: "8px 16px",
                      borderRadius: "6px",
                      border: "none",
                      cursor: "pointer",
                      fontWeight: 500,
                    }}
                  >
                    Approve & Execute
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingToolApproval(null)}
                    style={{
                      background: "var(--color-border)",
                      color: "var(--color-text)",
                      padding: "8px 16px",
                      borderRadius: "6px",
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── File created notification (r2_write success) ─────────────────── */}
          {fileCreatedNotification && (
            <div style={{ flexShrink: 0, padding: "0 16px 8px" }}>
              <div
                style={{
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "8px",
                  padding: "10px 14px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "12px",
                }}
              >
                <span style={{ fontSize: "14px", color: "var(--color-text)" }}>
                  File created: {fileCreatedNotification.key}
                </span>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    type="button"
                    onClick={() => {
                      setOpenFileKeyForPanel({ bucket: fileCreatedNotification.bucket, key: fileCreatedNotification.key });
                      setPreviewOpen(true);
                      setActiveTab("code");
                    }}
                    style={{
                      background: "var(--mode-color)",
                      color: "var(--color-on-mode)",
                      padding: "6px 12px",
                      borderRadius: "6px",
                      border: "none",
                      cursor: "pointer",
                      fontSize: "13px",
                      fontWeight: 500,
                    }}
                  >
                    Open in editor
                  </button>
                  <button
                    type="button"
                    onClick={() => setFileCreatedNotification(null)}
                    style={{
                      background: "var(--color-border)",
                      color: "var(--color-text)",
                      padding: "6px 12px",
                      borderRadius: "6px",
                      border: "none",
                      cursor: "pointer",
                      fontSize: "13px",
                    }}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Input bar (--mode-color scope) ───────────────────────────────── */}
          <div style={{ "--mode-color": `var(--mode-${mode})`, flexShrink: 0 }}>
            {/* ── Input bar (Cursor-style: one container) ─────────────────── */}
            <div
              style={{
                flexShrink: 0,
                padding: "12px 16px",
                paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))",
                background: "var(--bg-nav)",
                borderTop: "1px solid var(--color-border)",
              }}
              onDrop={onDropFiles}
              onDragOver={onDragOverFiles}
              onDragEnter={onDragEnterFiles}
              onDragLeave={onDragLeaveFiles}
            >
              <div
                className="agent-input-container agent-input-bar-wrap"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: window.innerWidth < 768 ? 2 : 10,
                  padding: "10px 14px",
                  background: "var(--bg-elevated)",
                  border: isDraggingOver ? "2px dashed var(--color-primary)" : "1px solid var(--color-border)",
                  borderRadius: 10,
                  minHeight: 48,
                  width: "100%",
                  maxWidth: "min(900px, 100%)",
                  margin: "0 auto",
                  position: "relative",
                  boxSizing: "border-box",
                }}
              >
                {showSlashPicker && (
                  <div
                    role="listbox"
                    aria-label="Slash commands"
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      bottom: "calc(100% + 8px)",
                      maxHeight: "calc(8 * 44px)",
                      overflowY: "auto",
                      background: "var(--bg-elevated)",
                      border: "1px solid var(--color-border)",
                      borderRadius: "8px",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                      zIndex: 1002,
                    }}
                  >
                    {filteredSlashCommands.length === 0 ? (
                      <div style={{ padding: "10px 12px", fontSize: 12, color: "var(--text-muted)" }}>
                        No matching commands
                      </div>
                    ) : (
                      filteredSlashCommands.map((cmd, idx) => {
                        const slugLabel = String(cmd.slug || cmd.name || "command").trim() || "command";
                        const cleanName = String(cmd.name || cmd.slug || "command")
                          .replace(/^\//, "")
                          .trim() || "command";
                        const desc = String(cmd.description || "").trim();
                        const categoryBadge = String(cmd.category || "general").trim() || "general";
                        const selected = idx === slashSafeIndex;
                        return (
                          <div
                            key={`${slugLabel}-${cmd.name || ""}-${idx}`}
                            role="option"
                            aria-selected={selected}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => applySlashCommandSelection(cmd)}
                            onMouseEnter={() => setSlashHighlightIndex(idx)}
                            style={{
                              position: "relative",
                              padding: "8px 44px 8px 12px",
                              cursor: "pointer",
                              fontSize: 12,
                              borderBottom: "1px solid var(--color-border)",
                              background: selected ? "var(--bg-canvas)" : "transparent",
                              color: "var(--color-text)",
                            }}
                          >
                            <div
                              style={{
                                position: "absolute",
                                top: 6,
                                right: 8,
                                fontSize: 9,
                                fontWeight: 600,
                                letterSpacing: "0.04em",
                                textTransform: "uppercase",
                                color: "var(--text-muted)",
                                maxWidth: 72,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {categoryBadge}
                            </div>
                            <div style={{ fontWeight: 600, fontSize: 12, lineHeight: 1.35 }}>
                              {cleanName}
                            </div>
                            {desc ? (
                              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2, lineHeight: 1.35 }}>
                                {desc}
                              </div>
                            ) : null}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
                {isDraggingOver && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      borderRadius: 10,
                      background: "var(--bg-elevated)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 13,
                      color: "var(--color-primary)",
                      pointerEvents: "none",
                    }}
                  >
                    Drop to attach
                  </div>
                )}
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                <div style={{ position: "relative", flexShrink: 0 }} ref={connectorPopupRef}>
                  <button
                    type="button"
                    onClick={() => setConnectorPopupOpen(!connectorPopupOpen)}
                    className="add-files-btn"
                    aria-label="Attach"
                    aria-expanded={connectorPopupOpen}
                    aria-haspopup="true"
                    title="Attach"
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      background: "transparent",
                      border: "1px solid var(--color-border)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 18,
                      color: "var(--color-text)",
                      flexShrink: 0,
                    }}
                  >
                    +
                  </button>
                  {isMobile && connectorPopupOpen && (
                    <div
                      onClick={() => setConnectorPopupOpen(false)}
                      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 10000 }}
                      aria-hidden="true"
                    />
                  )}
                  {connectorPopupOpen && (
                    <div
                      role="menu"
                      style={
                        isMobile
                          ? {
                              position: "fixed",
                              bottom: 0,
                              left: 0,
                              right: 0,
                              borderRadius: "16px 16px 0 0",
                              background: "var(--bg-elevated)",
                              border: "1px solid var(--color-border)",
                              zIndex: 10001,
                              maxHeight: "75vh",
                              overflowY: "auto",
                              padding: "0 0 16px 0",
                              boxShadow: "0 -4px 20px rgba(0,0,0,0.2)",
                            }
                          : {
                              position: "absolute",
                              bottom: "100%",
                              left: 0,
                              marginBottom: 8,
                              background: "var(--bg-elevated)",
                              border: "1px solid var(--color-border)",
                              borderRadius: 10,
                              minWidth: 220,
                              maxWidth: 320,
                              maxHeight: "85vh",
                              overflowY: "auto",
                              padding: "8px 0",
                              zIndex: 9999,
                              boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
                            }
                      }
                    >
                      {isMobile && (
                        <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--color-border)", margin: "10px auto 12px" }} />
                      )}
                      {[
                        { label: "Upload File", icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>, action: () => { fileInputRef.current?.click(); setConnectorPopupOpen(false); } },
                        { label: "Upload Image", icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>, action: () => { imageInputRef.current?.click(); setConnectorPopupOpen(false); } },
                        { label: "Google Drive", icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L2 19h20L12 2z"/></svg>, action: () => { window.open("/api/oauth/google/start?connect=drive&return_to=/dashboard/agent", "oauth_google", "width=500,height=600"); setConnectorPopupOpen(false); } },
                        { label: "GitHub", icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/></svg>, action: () => { window.open("/api/oauth/github/start?return_to=/dashboard/agent", "oauth_github", "width=500,height=600"); setConnectorPopupOpen(false); } },
                        { label: "Cloudflare", icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2z"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>, action: () => { setInput("@cloudflare list my workers and D1 databases"); setTimeout(() => textareaRef.current?.focus(), 50); setConnectorPopupOpen(false); } },
                        { label: "Take Screenshot", icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>, action: () => { setPreviewOpen(true); setActiveTab("browser"); setConnectorPopupOpen(false); } },
                        { label: "Search knowledge base", icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>, action: () => { setConnectorPopupOpen(false); setActiveTab("files"); setPreviewOpen(true); } },
                      ].map((item) => (
                        <button
                          key={item.label}
                          type="button"
                          role="menuitem"
                          onClick={item.action}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "10px",
                            width: "100%",
                            padding: "10px 16px",
                            border: "none",
                            background: "none",
                            color: "var(--color-text)",
                            fontSize: "13px",
                            textAlign: "left",
                            cursor: "pointer",
                            fontFamily: "inherit",
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-canvas)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
                        >
                          <span style={{ color: "var(--text-muted)", display: "flex" }}>{item.icon}</span>
                          {item.label}
                        </button>
                      ))}
                    {(!chatPaneIsWide || isMobile) && (
                      <>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", marginTop: 16, marginBottom: 8, padding: "0 16px" }}>
                          Mode
                        </div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: "0 16px" }}>
                          {["ask", "agent", "plan", "debug"].map((m) => (
                            <button
                              key={m}
                              type="button"
                              onClick={() => { setMode(m); setConnectorPopupOpen(false); }}
                              style={{
                                padding: "8px 12px",
                                background: mode === m ? "var(--mode-color)" : "var(--bg-elevated)",
                                color: mode === m ? "var(--color-on-mode)" : "var(--color-text)",
                                border: "1px solid var(--color-border)",
                                borderRadius: 6,
                                fontSize: 13,
                                cursor: "pointer",
                              }}
                            >
                              {m.charAt(0).toUpperCase() + m.slice(1)}
                            </button>
                          ))}
                        </div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", marginTop: 16, marginBottom: 8, padding: "0 16px" }}>
                          Model
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "0 16px 16px 16px" }}>
                          {(models || []).slice(0, 10).map((model) => (
                            <button
                              key={model.id}
                              type="button"
                              onClick={() => {
                                setActiveModel(model);
                                setSelectedModel(model);
                                setConnectorPopupOpen(false);
                              }}
                              style={{
                                padding: "10px 12px",
                                background: activeModel?.id === model.id ? "var(--color-primary)" : "transparent",
                                color: activeModel?.id === model.id ? "var(--color-on-mode)" : "var(--color-text)",
                                border: "none",
                                borderRadius: 6,
                                fontSize: 13,
                                textAlign: "left",
                                cursor: "pointer",
                              }}
                            >
                              {model.display_name}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                    </div>
                  )}
                </div>

                {!isMobile && chatPaneIsWide && (
                <div style={{ position: "relative", flexShrink: 0 }} ref={modeDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setShowModeDropdown(!showModeDropdown)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "6px 12px",
                      border: "1px solid var(--color-border)",
                      borderRadius: 6,
                      background: "transparent",
                      cursor: "pointer",
                      fontSize: 13,
                      color: "var(--color-text)",
                    }}
                  >
                    <span style={{ display: "flex", color: "var(--mode-color)" }}>
                      {MODE_ICONS[mode]}
                    </span>
                    <span style={{ textTransform: "capitalize" }}>{mode}</span>
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                      <path d="M5 7L1 3h8z" />
                    </svg>
                  </button>
                  {showModeDropdown && (
                    <div
                      style={{
                        position: "absolute",
                        bottom: "100%",
                        left: 0,
                        marginBottom: 8,
                        background: "var(--bg-elevated)",
                        border: "1px solid var(--color-border)",
                        borderRadius: 8,
                        minWidth: 160,
                        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                        zIndex: 1000,
                      }}
                    >
                      {["ask", "agent", "plan", "debug"].map((m) => (
                        <div
                          key={m}
                          role="button"
                          tabIndex={0}
                          onClick={() => { setMode(m); setShowModeDropdown(false); }}
                          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { setMode(m); setShowModeDropdown(false); } }}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            padding: "10px 14px",
                            cursor: "pointer",
                            background: mode === m ? "var(--bg-canvas)" : "transparent",
                            fontSize: 13,
                            borderLeft: mode === m ? `3px solid var(--mode-${m})` : "3px solid transparent",
                            color: "var(--color-text)",
                          }}
                        >
                          <span style={{ display: "flex", color: `var(--mode-${m})` }}>{MODE_ICONS[m]}</span>
                          <span style={{ textTransform: "capitalize" }}>{m}</span>
                        </div>
                      ))}
                      <div style={{ borderTop: "1px solid var(--color-border)", marginTop: 4, paddingTop: 8 }}>
                        <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", cursor: "pointer", fontSize: 13, color: "var(--color-text)" }}>
                          <input type="checkbox" checked={useStreaming} onChange={(e) => setUseStreaming(e.target.checked)} style={{ accentColor: "var(--mode-color)" }} />
                          <span>Stream</span>
                        </label>
                        <div style={{ fontSize: 11, color: "var(--text-muted)", padding: "0 14px 8px" }}>Off = tools + approval for all providers</div>
                      </div>
                    </div>
                  )}
                </div>
                )}

                {!isMobile && chatPaneIsWide && (
                <div style={{ position: "relative", flexShrink: 0 }} ref={modelDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setShowModelDropdown(!showModelDropdown)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "6px 12px",
                      border: "1px solid var(--color-border)",
                      borderRadius: 6,
                      background: "transparent",
                      cursor: "pointer",
                      fontSize: 13,
                      color: "var(--color-text)",
                    }}
                  >
                    <span>{selectedModel?.id === "auto" ? "Auto" : (selectedModel ? (MODEL_LABELS[selectedModel.model_key] ?? selectedModel.display_name) : (activeModel ? (MODEL_LABELS[activeModel.model_key] ?? activeModel.display_name) : "Auto"))}</span>
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                      <path d="M5 7L1 3h8z" />
                    </svg>
                  </button>
                  {showModelDropdown && (
                    <div
                      style={{
                        position: "absolute",
                        bottom: "100%",
                        left: 0,
                        marginBottom: 8,
                        background: "var(--bg-elevated)",
                        border: "1px solid var(--color-border)",
                        borderRadius: 8,
                        minWidth: 200,
                        maxHeight: 300,
                        overflowY: "auto",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                        zIndex: 1000,
                      }}
                    >
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          setSelectedModel({ id: "auto", display_name: "Auto" });
                          setActiveModel(models[0] ?? null);
                          setShowModelDropdown(false);
                        }}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { setSelectedModel({ id: "auto", display_name: "Auto" }); setActiveModel(models[0] ?? null); setShowModelDropdown(false); } }}
                        style={{
                          padding: "10px 14px",
                          cursor: "pointer",
                          background: selectedModel?.id === "auto" ? "var(--bg-canvas)" : "transparent",
                          fontSize: 13,
                          color: "var(--color-text)",
                        }}
                      >
                        Auto
                      </div>
                      {models.map((m) => (
                        <div
                          key={m.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            setSelectedModel(m);
                            setActiveModel(m);
                            setShowModelDropdown(false);
                          }}
                          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { setSelectedModel(m); setActiveModel(m); setShowModelDropdown(false); } }}
                          style={{
                            padding: "10px 14px",
                            cursor: "pointer",
                            background: selectedModel?.id === m.id ? "var(--bg-canvas)" : "transparent",
                            fontSize: 13,
                            color: "var(--color-text)",
                          }}
                        >
                          {MODEL_LABELS[m.model_key] ?? m.display_name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                )}

                {/* Microphone button - voice input (Web Speech API) */}
                <button
                  type="button"
                  title={isListening ? "Stop recording" : "Voice input"}
                  onClick={toggleMic}
                  style={{
                    position: "relative",
                    background: isListening ? "var(--mode-color)" : "transparent",
                    border: "none",
                    color: isListening ? "var(--color-on-mode)" : "var(--text-muted)",
                    cursor: "pointer",
                    padding: "6px",
                    borderRadius: "4px",
                    display: "flex",
                    alignItems: "center",
                    transition: "all 200ms",
                  }}
                  onMouseEnter={(e) => {
                    if (!isListening) e.currentTarget.style.color = "var(--color-text)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isListening) e.currentTarget.style.color = "var(--text-muted)";
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                    <line x1="12" x2="12" y1="19" y2="22"/>
                  </svg>
                  {isListening && (
                    <span
                      className="agent-mic-pulse"
                      style={{
                        position: "absolute",
                        top: "-2px",
                        right: "-2px",
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        background: "var(--color-danger, var(--error, #ef4444))",
                        animation: "agent-mic-pulse 1.5s ease-in-out infinite",
                      }}
                    />
                  )}
                </button>
                </div>

                {screenshotAttachFeedback && (
                  <span style={{ fontSize: 11, color: "var(--color-primary)", flexShrink: 0 }}>{screenshotAttachFeedback}</span>
                )}
                {attachedImages.length > 0 && (
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", flexShrink: 0 }}>
                    {attachedImages.map((img, i) => (
                      <span key={i} style={{ display: "flex", alignItems: "center", gap: 4, background: "var(--bg-canvas)", padding: "2px 6px", borderRadius: 6, border: "1px solid var(--color-border)" }}>
                        {img.dataUrl && <img src={img.dataUrl} alt="" style={{ width: 24, height: 24, objectFit: "cover", borderRadius: 4 }} />}
                        <span style={{ fontSize: 10, color: "var(--text-muted)", maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{img.name}</span>
                        <button type="button" onClick={() => setAttachedImages((prev) => prev.filter((_, j) => j !== i))} style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 12, padding: 0, lineHeight: 1 }} aria-label="Remove">&#215;</button>
                      </span>
                    ))}
                  </div>
                )}
                {attachedFiles.length > 0 && (
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", flexShrink: 0 }}>
                    {attachedFiles.map((f, i) => (
                      <span key={i} style={{ display: "flex", alignItems: "center", gap: 4, background: "var(--bg-canvas)", padding: "2px 6px", borderRadius: 6, border: "1px solid var(--color-border)" }}>
                        <span style={{ fontSize: 10, color: "var(--text-muted)", maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                        <span style={{ fontSize: 9, color: "var(--text-muted)" }}>{f.encoding === "base64" ? `(binary, ${f.size != null ? Math.round(f.size / 1024) + " KB" : "?"})` : "(text)"}</span>
                        <button type="button" onClick={() => setAttachedFiles((prev) => prev.filter((_, j) => j !== i))} style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 12, padding: 0, lineHeight: 1 }} aria-label="Remove">&#215;</button>
                      </span>
                    ))}
                  </div>
                )}

                <textarea
                  ref={textareaRef}
                  placeholder={placeholderText}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onPaste={(e) => {
                    const items = e.clipboardData?.items;
                    if (!items?.length) return;
                    for (let i = 0; i < items.length; i++) {
                      const item = items[i];
                      if (item.kind === "file" && item.type.startsWith("image/")) {
                        const file = item.getAsFile();
                        if (!file || file.size > IMAGE_SIZE_LIMIT) continue;
                        e.preventDefault();
                        const reader = new FileReader();
                        reader.onload = () => {
                          setAttachedImages((prev) => [...prev, { name: file.name || `pasted-${Date.now()}.png`, dataUrl: reader.result }].slice(-3));
                        };
                        reader.readAsDataURL(file);
                        break;
                      }
                    }
                  }}
                  onKeyDown={(e) => {
                    if (showSlashPicker) {
                      if (e.key === "Escape") {
                        e.preventDefault();
                        setSlashPickerSuppressed(true);
                        return;
                      }
                      if (filteredSlashCommands.length > 0) {
                        if (e.key === "ArrowDown") {
                          e.preventDefault();
                          setSlashHighlightIndex((i) =>
                            Math.min(filteredSlashCommands.length - 1, i + 1)
                          );
                          return;
                        }
                        if (e.key === "ArrowUp") {
                          e.preventDefault();
                          setSlashHighlightIndex((i) => Math.max(0, i - 1));
                          return;
                        }
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          const cmd = filteredSlashCommands[slashSafeIndex];
                          if (cmd) applySlashCommandSelection(cmd);
                          return;
                        }
                      }
                    }
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                  onInput={(e) => {
                    e.target.style.height = "auto";
                    e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
                  }}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    width: "100%",
                    maxWidth: "100%",
                    wordWrap: "break-word",
                    whiteSpace: "pre-wrap",
                    overflowX: "hidden",
                    border: "none",
                    background: "transparent",
                    resize: "none",
                    outline: "none",
                    fontSize: 14,
                    lineHeight: 1.4,
                    minHeight: 28,
                    maxHeight: 120,
                    overflowY: "auto",
                    color: "var(--color-text)",
                    fontFamily: "inherit",
                  }}
                />

                <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                <button
                  type="button"
                  ref={costPopoverRef}
                  title={`Context (est.) ${contextUsedK}k / ${contextLimitK}k`}
                  onClick={() => setCostPopoverOpen((prev) => !prev)}
                  aria-label="Estimated context usage"
                  style={{
                    position: "relative",
                    width: 20,
                    height: 20,
                    flexShrink: 0,
                    padding: 0,
                    border: "none",
                    background: "none",
                    cursor: "pointer",
                    display: "block",
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 36 36" style={{ display: "block" }}>
                    <circle cx="18" cy="18" r="15.915" fill="none" stroke="var(--color-border)" strokeWidth="2" />
                    <circle
                      cx="18"
                      cy="18"
                      r="15.915"
                      fill="none"
                      stroke="var(--mode-color)"
                      strokeWidth="2"
                      strokeDasharray={`${contextPctNum}, 100`}
                      transform="rotate(-90 18 18)"
                      style={{ transition: "stroke-dasharray 0.3s ease" }}
                    />
                  </svg>
                  {costPopoverOpen && (
                    <div
                      style={{
                        position: "absolute",
                        bottom: "100%",
                        right: 0,
                        marginBottom: 8,
                        background: "var(--bg-elevated)",
                        border: "1px solid var(--color-border)",
                        borderRadius: 8,
                        padding: "12px 14px",
                        minWidth: 180,
                        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                        zIndex: 1001,
                      }}
                    >
                      <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 8, color: "var(--color-text)" }}>Context</div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                        Est. tokens: {estimatedTokens.toLocaleString()} / 200k (from conversation)
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                        Context: {contextUsedK}k / {contextLimitK}k ({contextPctLabel}%)
                      </div>
                    </div>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (agentState !== AGENT_STATES.IDLE && !input.trim()) {
                      stopGeneration();
                    } else {
                      sendMessage();
                    }
                  }}
                  disabled={(!input.trim() && !attachedImages.length && !attachedFiles.length) || agentState !== AGENT_STATES.IDLE}
                  aria-label={agentState !== AGENT_STATES.IDLE && !input.trim() ? "Stop" : "Send"}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    background: (agentState !== AGENT_STATES.IDLE && !input.trim()) ? "var(--color-border)" : "var(--mode-color)",
                    border: "none",
                    cursor: (!input.trim() && !attachedImages.length && !attachedFiles.length && agentState === AGENT_STATES.IDLE) ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--color-on-mode)",
                    opacity: !input.trim() && !attachedImages.length && !attachedFiles.length && agentState === AGENT_STATES.IDLE ? 0.5 : 1,
                    flexShrink: 0,
                    transition: "all 200ms ease",
                  }}
                >
                  {agentState !== AGENT_STATES.IDLE && !input.trim() ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                      <rect x="6" y="6" width="12" height="12" rx="2"/>
                    </svg>
                  ) : (
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M22 2L11 13" />
                      <path d="M22 2l-7 20-4-9-9-4 20-7z" />
                    </svg>
                  )}
                </button>
                </div>

                <input type="file" ref={fileInputRef} multiple accept="*/*" onChange={onFileSelect} style={{ display: "none" }} />
                <input type="file" ref={imageInputRef} accept="image/*" multiple onChange={onImageSelect} style={{ display: "none" }} />
              </div>
            </div>
          </div>

          {/* Status bar */}
          <div
            className="agent-status-bar"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "4px 8px",
              padding: "3px 12px",
              background: "var(--bg-nav)",
              borderTop: "1px solid var(--color-border)",
              fontSize: "11px",
              color: "rgba(255, 255, 255, 0.8)",
              flexShrink: 0,
            }}
          >
            {agentActivity ? (
              <>
                <span style={{ color: "var(--accent)", animation: "spPulse 1s infinite" }} aria-hidden>
                  *
                </span>
                <span style={{ color: "var(--text-secondary)", fontSize: 11, marginLeft: 4 }}>
                  {agentActivity.label}
                </span>
              </>
            ) : (
              <span>Agent Sam</span>
            )}
            <span>
              {selectedModel?.id === "auto"
                ? (lastUsedModel ? `Auto (${MODEL_LABELS[lastUsedModel] ?? lastUsedModel})` : "Auto")
                : (activeModel?.display_name ?? "Auto")
              } · level AI
            </span>
          </div>

          {recentFiles.length > 0 && (
            <div style={{ flexShrink: 0 }} aria-hidden="true" />
          )}
        </div>

        {/* ── Panel resize divider (desktop, tool panel open) ─────────────── */}
        {previewOpen && !isMobile && (
          <div
            ref={dragRef}
            onMouseDown={handlePanelResize}
            onTouchStart={handlePanelResizeTouch}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-primary)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = dragging ? "var(--color-primary)" : "transparent"; }}
            className="iam-panel-resize"
            style={{
              width: "2px",
              minWidth: "2px",
              background: dragging ? "var(--color-primary)" : "transparent",
              cursor: "col-resize",
              flexShrink: 0,
              display: "flex",
              alignItems: "stretch",
              justifyContent: "center",
              userSelect: dragging ? "none" : "auto",
              padding: 0,
              transition: "background 0.15s",
            }}
            title="Drag to resize"
          >
            <div
              style={{
                width: "2px",
                minHeight: "100%",
                background: dragging ? "var(--color-primary)" : "var(--color-border)",
                borderRadius: "1px",
                flexShrink: 0,
              }}
            />
          </div>
        )}

        {/* ── Mobile: side drawer from right + backdrop + collapsed strip ─ */}
        {isMobile && (
          <>
            {previewOpen && (
              <div
                onClick={() => setPreviewOpen(false)}
                style={{
                  position: "fixed",
                  inset: 0,
                  background: "rgba(0,0,0,0.5)",
                  zIndex: 998,
                }}
              />
            )}
            <div
              style={{
                position: "fixed",
                top: 0,
                right: 0,
                width: "85vw",
                maxWidth: 420,
                height: "100%",
                zIndex: 999,
                background: "var(--bg-elevated)",
                borderLeft: "1px solid var(--border)",
                display: "flex",
                flexDirection: "row",
                overflow: "hidden",
                transform: previewOpen ? "translateX(0)" : "translateX(100%)",
                transition: "transform 250ms cubic-bezier(0.4, 0, 0.2, 1)",
                boxShadow: previewOpen ? "-4px 0 24px rgba(0,0,0,0.3)" : "none",
              }}
            >
              <div
                className="iam-viewer-icon-strip"
                style={{
                  width: 44,
                  flexShrink: 0,
                  background: "var(--bg-canvas)",
                  borderRight: "1px solid var(--border)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  paddingTop: 34,
                  paddingBottom: 110,
                  gap: 4,
                  overflowY: "auto",
                  scrollbarWidth: "none",
                }}
              >
                {VIEWER_STRIP_TAB_ORDER.map((tab) => {
                  const isActive = previewOpen && activeTab === tab;
                  return (
                    <button
                      key={tab}
                      type="button"
                      title={VIEWER_STRIP_TITLES[tab]}
                      onClick={() => {
                        if (previewOpen && activeTab === tab) {
                          setPreviewOpen(false);
                        } else {
                          setPreviewOpen(true);
                          setActiveTab(tab);
                        }
                      }}
                      style={{
                        width: 36,
                        height: 36,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: isActive ? "var(--bg-elevated)" : "transparent",
                        border: "none",
                        borderRight: isActive ? "2px solid var(--accent)" : "2px solid transparent",
                        borderRadius: "4px 0 0 4px",
                        color: isActive ? "var(--accent)" : "var(--text-muted)",
                        cursor: "pointer",
                      }}
                    >
                      <ViewerPanelStripIcon tab={tab} size={16} />
                    </button>
                  );
                })}
              </div>
              <div
                style={{
                  flex: 1,
                  minWidth: 0,
                  maxWidth: "100%",
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <FloatingPreviewPanel
                  open={previewOpen}
                  onClose={() => setPreviewOpen(false)}
                  activeTab={activeTab}
                  onTabChange={setActiveTab}
                  previewHtml={previewHtml}
                  onPreviewHtmlChange={setPreviewHtml}
                  browserUrl={browserUrl}
                  onBrowserUrlChange={setBrowserUrl}
                  onBrowserScreenshotUrl={handleBrowserScreenshotUrl}
                  codeContent={codeContent}
                  onCodeContentChange={setCodeContent}
                  codeFilename={codeFilename}
                  onCodeFilenameChange={setCodeFilename}
                  onFileContextChange={handleFileContextChange}
                  isDarkTheme={true}
                  activeThemeSlug={activeThemeSlug}
                  proposedFileChange={proposedFileChange}
                  onProposedChangeResolved={() => setProposedFileChange(null)}
                  monacoDiffFromChat={monacoDiffFromChat}
                  onMonacoDiffResolved={() => setMonacoDiffFromChat(null)}
                  openFileKey={openFileKeyForPanel}
                  onOpenFileKeyDone={() => setOpenFileKeyForPanel(null)}
                  connectedIntegrations={connectedIntegrations}
                  runCommandRunnerRef={runCommandRunnerRef}
                  availableCommands={availableCommands}
                  onOpenInBrowser={handleOpenInBrowser}
                  onDeployStart={handleDeployStart}
                  onDeployComplete={handleDeployComplete}
                />
              </div>
            </div>
            {!previewOpen && (
              <div
                ref={mobileIconsStripRef}
                className="iam-mobile-icon-toggle"
                style={{
                  position: "fixed",
                  top: "calc(52px + env(safe-area-inset-top, 0px))",
                  right: 0,
                  zIndex: 50,
                }}
              >
                <button
                  type="button"
                  onClick={() => setMobileIconsOpen((v) => !v)}
                  style={{
                    width: 32,
                    height: 32,
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border)",
                    borderRight: "none",
                    borderRadius: "6px 0 0 6px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                  }}
                  aria-expanded={mobileIconsOpen}
                  aria-label="Open tools menu"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
                    <circle cx="4" cy="4" r="1.5" />
                    <circle cx="12" cy="4" r="1.5" />
                    <circle cx="4" cy="12" r="1.5" />
                    <circle cx="12" cy="12" r="1.5" />
                  </svg>
                </button>
                {mobileIconsOpen && (
                  <div
                    style={{
                      position: "absolute",
                      top: 32,
                      right: 0,
                      background: "var(--bg-elevated)",
                      border: "1px solid var(--border)",
                      borderRight: "none",
                      borderRadius: "6px 0 0 6px",
                      padding: "4px 0",
                      display: "flex",
                      flexDirection: "column",
                      gap: 2,
                      boxShadow: "-2px 4px 12px rgba(0,0,0,0.3)",
                    }}
                  >
                    {VIEWER_STRIP_TAB_ORDER.map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        title={VIEWER_STRIP_TITLES[tab]}
                        onClick={() => {
                          setActiveTab(tab);
                          setPreviewOpen(true);
                          setMobileIconsOpen(false);
                        }}
                        style={{
                          width: 36,
                          height: 36,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          background: "transparent",
                          border: "none",
                          color: "var(--text-muted)",
                          cursor: "pointer",
                        }}
                      >
                        <ViewerPanelStripIcon tab={tab} size={14} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ── Desktop: vertical icon strip (left edge of viewer) + tool panel ─ */}
        {!isMobile && (
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              flex: previewOpen && !isMobile ? `0 0 ${panelWidthPct}%` : "0 0 48px",
              minWidth: 0,
              minHeight: 0,
              alignSelf: "stretch",
              overflow: "hidden",
              transition: dragging ? "none" : "flex 0.15s ease",
            }}
          >
            <div
              className="iam-viewer-icon-strip"
              style={{
                width: 48,
                flexShrink: 0,
                position: "relative",
                alignSelf: "stretch",
                minHeight: 0,
                background: "transparent",
                borderLeft: "none",
                borderRight: previewOpen ? "1px solid var(--border)" : "none",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                alignItems: "flex-end",
                gap: 4,
                overflowY: "auto",
                overflowX: "hidden",
                scrollbarWidth: "none",
              }}
            >
              {VIEWER_STRIP_TAB_ORDER.map((tab) => {
                const isActive = previewOpen && activeTab === tab;
                return (
                  <button
                    key={tab}
                    type="button"
                    title={VIEWER_STRIP_TITLES[tab]}
                    onClick={() => {
                      if (previewOpen && activeTab === tab) {
                        setPreviewOpen(false);
                      } else {
                        setPreviewOpen(true);
                        setActiveTab(tab);
                      }
                    }}
                    style={{
                      width: 36,
                      height: 36,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: isActive ? "var(--bg-canvas)" : "transparent",
                      border: "none",
                      borderLeft: "none",
                      borderRight: isActive ? "2px solid var(--accent)" : "2px solid transparent",
                      borderRadius: isActive ? "4px 0 0 4px" : 4,
                      color: isActive ? "var(--accent)" : "var(--text-muted)",
                      cursor: "pointer",
                      fontFamily: "monospace",
                      fontSize: 13,
                      transition: "all 150ms",
                    }}
                    onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.color = "var(--text-primary)"; }}
                    onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.color = "var(--text-muted)"; }}
                  >
                    <ViewerPanelStripIcon tab={tab} />
                  </button>
                );
              })}
            </div>
            {previewOpen && (
              <div
                style={{
                  flex: 1,
                  minWidth: 0,
                  maxWidth: "100%",
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <FloatingPreviewPanel
                  open={previewOpen}
                  onClose={() => setPreviewOpen(false)}
                  activeTab={activeTab}
                  onTabChange={setActiveTab}
                  previewHtml={previewHtml}
                  onPreviewHtmlChange={setPreviewHtml}
                  browserUrl={browserUrl}
                  onBrowserUrlChange={setBrowserUrl}
                  onBrowserScreenshotUrl={handleBrowserScreenshotUrl}
                  codeContent={codeContent}
                  onCodeContentChange={setCodeContent}
                  codeFilename={codeFilename}
                  onCodeFilenameChange={setCodeFilename}
                  onFileContextChange={handleFileContextChange}
                  isDarkTheme={true}
                  activeThemeSlug={activeThemeSlug}
                  proposedFileChange={proposedFileChange}
                  onProposedChangeResolved={() => setProposedFileChange(null)}
                  monacoDiffFromChat={monacoDiffFromChat}
                  onMonacoDiffResolved={() => setMonacoDiffFromChat(null)}
                  openFileKey={openFileKeyForPanel}
                  onOpenFileKeyDone={() => setOpenFileKeyForPanel(null)}
                  connectedIntegrations={connectedIntegrations}
                  runCommandRunnerRef={runCommandRunnerRef}
                  availableCommands={availableCommands}
                  onOpenInBrowser={handleOpenInBrowser}
                  onDeployStart={handleDeployStart}
                  onDeployComplete={handleDeployComplete}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {lightboxImage && (
        <div
          role="presentation"
          onClick={() => setLightboxImage(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(0,0,0,0.92)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            cursor: "zoom-out",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "relative",
              maxWidth: "95vw",
              maxHeight: "90vh",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "var(--spacing-sm)",
            }}
          >
            <img
              src={lightboxImage}
              alt="Preview"
              style={{
                maxWidth: "95vw",
                maxHeight: "80vh",
                objectFit: "contain",
                borderRadius: "var(--radius-md)",
                boxShadow: "0 8px 64px rgba(0,0,0,0.8)",
              }}
            />
            <div style={{ display: "flex", gap: "var(--spacing-sm)" }}>
              <button
                type="button"
                onClick={() => {
                  const a = document.createElement("a");
                  a.href = lightboxImage;
                  a.download = lightboxImage.split("/").pop() || "image.png";
                  a.target = "_blank";
                  a.rel = "noopener noreferrer";
                  a.click();
                }}
                style={{
                  padding: "6px 18px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--color-border)",
                  background: "var(--bg-elevated)",
                  color: "var(--color-text)",
                  cursor: "pointer",
                  fontSize: "13px",
                }}
              >
                Download
              </button>
              <button
                type="button"
                onClick={() => {
                  openImageInDrawPanel(lightboxImage);
                  setLightboxImage(null);
                }}
                style={{
                  padding: "6px 18px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--color-border)",
                  background: "var(--bg-elevated)",
                  color: "var(--color-text)",
                  cursor: "pointer",
                  fontSize: "13px",
                }}
              >
                Open in Draw
              </button>
              <button
                type="button"
                onClick={() => setLightboxImage(null)}
                style={{
                  padding: "6px 18px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--color-border)",
                  background: "transparent",
                  color: "var(--color-muted)",
                  cursor: "pointer",
                  fontSize: "13px",
                }}
              >
                Close
              </button>
            </div>
            <span style={{ fontSize: "11px", color: "rgba(255, 255, 255, 0.3)" }}>
              Click outside or press Esc to close
            </span>
          </div>
        </div>
      )}

      <style>{`
        @keyframes agentPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.85); }
        }
        @keyframes spPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
        @keyframes termCardBorderPulse {
          0%, 100% { border-color: var(--accent); }
          50% { border-color: var(--color-border); }
        }
        @keyframes termDotPulse {
          0%, 80%, 100% { opacity: 0.28; transform: scale(0.88); }
          40% { opacity: 1; transform: scale(1); }
        }
        .terminal-output-card--running {
          border: 1px solid var(--accent);
          animation: termCardBorderPulse 1.4s ease-in-out infinite;
        }
        .terminal-output-card__dots {
          display: inline-flex;
          gap: 4px;
          align-items: center;
          flex-shrink: 0;
        }
        .terminal-output-card__dot {
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: var(--accent);
          animation: termDotPulse 1.2s ease-in-out infinite;
        }
        .terminal-output-card__dot:nth-child(2) { animation-delay: 0.2s; }
        .terminal-output-card__dot:nth-child(3) { animation-delay: 0.4s; }
        .iam-viewer-icon-strip {
          min-height: 0;
        }
        .iam-viewer-icon-strip::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
}

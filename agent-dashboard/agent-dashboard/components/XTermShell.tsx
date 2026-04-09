import React, {
  useEffect, useRef, useState, useImperativeHandle,
  forwardRef, useCallback,
} from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { X, ChevronDown, ChevronUp, TriangleAlert, CircleCheck,
         Zap, Terminal as TerminalIcon, Bot, Send, Loader2,
         Wifi, WifiOff, RefreshCw } from 'lucide-react';
import '@xterm/xterm/css/xterm.css';

// ─── Types ───────────────────────────────────────────────────────────────────
const DEFAULT_PRODUCT = 'Agent Sam';
export type ShellTab = 'terminal' | 'output' | 'problems';

export interface XTermShellHandle {
  writeToTerminal: (text: string) => void;
  runCommand: (cmd: string) => void;
  setActiveTab: (t: ShellTab) => void;
}

interface XTermShellProps {
  onClose: () => void;
  problems?: { file: string; line: number; msg: string; severity: 'error' | 'warning' }[];
  outputLines?: string[];
  onOutputLine?: (line: string) => void;
  iamOrigin?: string;
  workspaceCdCommand?: string;
  agentDashboardUrl?: string;
  showIamWelcomeBar?: boolean;
  workspaceLabel?: string;
  workspaceId?: string;
  productLabel?: string;
}

const MIN_HEIGHT = 140;
const MAX_HEIGHT_RATIO = 0.82;
const DEFAULT_HEIGHT = 320;
const DEFAULT_IAM_ORIGIN =
  typeof window !== 'undefined' ? window.location.origin : 'https://inneranimalmedia.com';

// ─── ANSI Art ────────────────────────────────────────────────────────────────
// Cyan, Yellow, Dark, Reset helpers
const C  = '\x1b[38;5;51m';   // bright cyan
const Y  = '\x1b[38;5;226m';  // bright yellow
const O  = '\x1b[38;5;208m';  // orange (fire)
const G  = '\x1b[38;5;82m';   // green
const DK = '\x1b[38;5;238m';  // dark gray
const MD = '\x1b[38;5;244m';  // mid gray
const R  = '\x1b[0m';         // reset
const B  = '\x1b[1m';         // bold
const DM = '\x1b[2m';         // dim

function buildGameBanner(workspaceLabel: string, productLabel: string, workspaceId?: string): string {
  const ws = (workspaceLabel || 'Workspace').replace(/\s+/g, ' ').trim();
  const wsLine = ws.length > 38 ? `${ws.slice(0, 35)}…` : ws;
  const id = workspaceId?.trim() ?? '';

  // Gorilla pixel art (left col) + logo (right col), side by side
  const logo = [
    `${B}${Y}  ██╗ █████╗ ███╗   ███╗${R}`,
    `${B}${Y}  ██║██╔══██╗████╗ ████║${R}`,
    `${B}${Y}  ██║███████║██╔████╔██║${R}`,
    `${B}${Y}  ██║██╔══██║██║╚██╔╝██║${R}`,
    `${B}${Y}  ██║██║  ██║██║ ╚═╝ ██║${R}`,
    `${B}${Y}  ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝${R}`,
    ``,
    `${B}${C} ███╗   ███╗███████╗██████╗ ██╗ █████╗ ${R}`,
    `${B}${C} ████╗ ████║██╔════╝██╔══██╗██║██╔══██╗${R}`,
    `${B}${C} ██╔████╔██║█████╗  ██║  ██║██║███████║${R}`,
    `${B}${C} ██║╚██╔╝██║██╔══╝  ██║  ██║██║██╔══██║${R}`,
    `${B}${C} ██║ ╚═╝ ██║███████╗██████╔╝██║██║  ██║${R}`,
    `${B}${C} ╚═╝     ╚═╝╚══════╝╚═════╝ ╚═╝╚═╝  ╚═╝${R}`,
  ];

  // Gorilla art
  const gorilla = [
    `${DK}      ▄████▄      ${R}`,
    `${DK}    ██${MD}▓▓▓▓▓▓${DK}██    ${R}`,
    `${DK}   ██${MD}▓${Y}●${MD}  ${Y}●${MD}▓${DK}██   ${R}`,
    `${DK}   ██${MD}▓  ▄▄  ▓${DK}██   ${R}`,
    `${DK}   ██${MD}▓  ██  ▓${DK}██   ${R}`,
    `${DK}   ██${MD}▓▓${O}████${MD}▓▓${DK}██   ${R}`,
    `${DK}  ████${MD}▓▓▓▓▓▓${DK}████  ${R}`,
    `${DK} ██  ████████  ██ ${R}`,
    `${O}  ▲▲${DK}            ${O}▲▲  ${R}`,
    `${DM}  ─────────────── ${R}`,
  ];

  // Menu items
  const menu = [
    `${Y}${B}  1.${R} ${MD}Start workspace${R}`,
    `${Y}${B}  2.${R} ${MD}Open agent${R}`,
    `${Y}${B}  3.${R} ${MD}Activate tools${R}`,
    `${Y}${B}  4.${R} ${MD}Switch theme${R}`,
    `${Y}${B}  5.${R} ${MD}Run diagnostics${R}`,
  ];

  const divider = `${DK}  ──────────────────────────────────────────────────────${R}`;
  const header  = `${DK}  ╔══════════════════════════════════════════════════════╗${R}`;
  const footer  = `${DK}  ╚══════════════════════════════════════════════════════╝${R}`;

  const lines: string[] = [
    ``,
    header,
    ...logo,
    divider,
    ...gorilla.map((g, i) => `  ${g}${menu[i] ?? ''}`),
    ``,
    `${DM}  Workspace : ${wsLine}${R}`,
    id ? `${DM}  ID        : ${id}${R}` : '',
    `${DM}  Type ${Y}?${DM} for AI help · ${Y}Ctrl+A${DM} to toggle AI panel · ${Y}1-5${DM} for quick actions${R}`,
    footer,
    ``,
  ].filter(l => l !== undefined) as string[];

  return lines.join('\r\n');
}

// ─── AI Assist Panel ──────────────────────────────────────────────────────────
interface AIMessage { role: 'user' | 'assistant'; content: string }

interface AIPanelProps {
  visible: boolean;
  onClose: () => void;
  onRunCommand: (cmd: string) => void;
  terminalBuffer: string;
}

function AIPanel({ visible, onClose, onRunCommand, terminalBuffer }: AIPanelProps) {
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (visible) setTimeout(() => inputRef.current?.focus(), 120);
  }, [visible]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const send = useCallback(async (text?: string) => {
    const q = (text ?? input).trim();
    if (!q || loading) return;
    setInput('');
    const userMsg: AIMessage = { role: 'user', content: q };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      const context = terminalBuffer.slice(-3000);
      const res = await fetch('/api/agent/chat', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: q,
          mode: 'ask',
        }),
      });

      if (!res.ok) throw new Error(`${res.status}`);
      const ct = res.headers.get('content-type') ?? '';

      let reply = '';
      if (ct.includes('text/event-stream')) {
        const reader = res.body!.getReader();
        const dec = new TextDecoder();
        let partialMsg: AIMessage = { role: 'assistant', content: '' };
        setMessages(prev => [...prev, partialMsg]);

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = dec.decode(value);
          for (const line of chunk.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            try {
              const d = JSON.parse(line.slice(6));
              if (d.type === 'text' && d.text) {
                reply += d.text;
                setMessages(prev => {
                  const copy = [...prev];
                  copy[copy.length - 1] = { role: 'assistant', content: reply };
                  return copy;
                });
              }
            } catch (_) {}
          }
        }
      } else {
        const data = await res.json();
        reply = data.response ?? data.content ?? data.message ?? JSON.stringify(data);
        setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
      }
    } catch (e: unknown) {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: `[ERR] ${e instanceof Error ? e.message : String(e)}` },
      ]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, terminalBuffer]);

  // Extract bash commands from AI response for one-click run
  function extractCommands(text: string): string[] {
    const matches = [...text.matchAll(/```(?:bash|sh|zsh|shell)?\n([\s\S]*?)```/g)];
    return matches.map(m => m[1].trim()).filter(Boolean);
  }

  function renderMessage(msg: AIMessage, i: number) {
    const isUser = msg.role === 'user';
    const commands = !isUser ? extractCommands(msg.content) : [];

    // Simple markdown-ish rendering
    const rendered = msg.content
      .replace(/```(?:bash|sh|zsh|shell)?\n([\s\S]*?)```/g, '___CMD___$1___END___')
      .split('\n');

    return (
      <div key={i} className={`mb-4 ${isUser ? 'ml-4' : 'mr-2'}`}>
        <div className={`text-[9px] font-mono tracking-widest uppercase mb-1 ${
          isUser ? 'text-right text-[var(--solar-yellow)]/60' : 'text-[var(--solar-cyan)]/60'
        }`}>
          {isUser ? 'YOU' : '// AI ASSIST'}
        </div>
        <div className={`text-[11px] leading-relaxed font-mono rounded px-3 py-2 border ${
          isUser
            ? 'bg-[var(--solar-yellow)]/5 border-[var(--solar-yellow)]/20 text-[var(--text-main)] text-right'
            : 'bg-[var(--solar-cyan)]/5 border-[var(--solar-cyan)]/15 text-[var(--text-main)]'
        }`}>
          {rendered.map((line, li) => {
            if (line.startsWith('___CMD___')) {
              const code = line.replace('___CMD___', '').replace('___END___', '');
              return (
                <div key={li} className="my-2 rounded bg-black/40 border border-[var(--solar-cyan)]/20 overflow-hidden">
                  <div className="flex items-center justify-between px-2 py-1 border-b border-[var(--solar-cyan)]/10">
                    <span className="text-[9px] text-[var(--solar-cyan)]/50 tracking-widest">SHELL</span>
                    <button
                      onClick={() => onRunCommand(code)}
                      className="text-[9px] px-2 py-0.5 rounded bg-[var(--solar-cyan)]/10 hover:bg-[var(--solar-cyan)]/20 text-[var(--solar-cyan)] border border-[var(--solar-cyan)]/30 transition-colors font-mono tracking-wider"
                    >
                      ▶ RUN
                    </button>
                  </div>
                  <pre className="px-3 py-2 text-[10px] text-[var(--solar-green)] whitespace-pre-wrap break-all">{code}</pre>
                </div>
              );
            }
            return <span key={li}>{line}{li < rendered.length - 1 ? '\n' : ''}</span>;
          })}
        </div>
        {commands.length > 0 && !isUser && (
          <div className="flex flex-wrap gap-1 mt-1">
            {commands.map((cmd, ci) => (
              <button
                key={ci}
                onClick={() => onRunCommand(cmd)}
                className="text-[9px] px-2 py-0.5 rounded bg-[var(--solar-green)]/10 border border-[var(--solar-green)]/30 text-[var(--solar-green)] hover:bg-[var(--solar-green)]/20 transition-colors font-mono"
              >
                ▶ {cmd.length > 30 ? cmd.slice(0, 27) + '…' : cmd}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  const QUICK_PROMPTS = [
    'Explain this error',
    'How do I fix this?',
    'Show me the fix command',
    'What does this output mean?',
  ];

  return (
    <div
      className={`absolute top-0 right-0 bottom-0 flex flex-col border-l border-[var(--solar-cyan)]/20 bg-[var(--terminal-chrome)] transition-all duration-300 ease-out z-10 ${
        visible ? 'w-[340px] opacity-100' : 'w-0 opacity-0 pointer-events-none overflow-hidden'
      }`}
      style={{ backdropFilter: 'blur(8px)' }}
    >
      {/* AI Panel Header */}
      <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b border-[var(--solar-cyan)]/15">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Bot size={14} className="text-[var(--solar-cyan)]" />
            <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-[var(--solar-green)] shadow-[0_0_4px_var(--solar-green)]" />
          </div>
          <span className="text-[10px] font-mono font-bold tracking-widest text-[var(--solar-cyan)] uppercase">AI Assist</span>
          <span className="text-[9px] text-[var(--text-muted)]/50 font-mono">// terminal context</span>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--solar-red)] transition-colors">
          <X size={12} />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto p-3 space-y-1 custom-scrollbar">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 py-8">
            <div className="w-10 h-10 rounded-full border border-[var(--solar-cyan)]/20 flex items-center justify-center">
              <Bot size={18} className="text-[var(--solar-cyan)]/50" />
            </div>
            <p className="text-[10px] text-[var(--text-muted)]/50 font-mono text-center">
              Ask anything about your terminal.<br/>I have context from your session.
            </p>
            <div className="w-full space-y-1.5 mt-2">
              {QUICK_PROMPTS.map(p => (
                <button
                  key={p}
                  onClick={() => send(p)}
                  className="w-full text-left text-[10px] font-mono px-3 py-2 rounded border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--solar-cyan)] hover:border-[var(--solar-cyan)]/30 hover:bg-[var(--solar-cyan)]/5 transition-all"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => renderMessage(m, i))}
        {loading && (
          <div className="flex items-center gap-2 text-[var(--solar-cyan)]/60 text-[10px] font-mono ml-2">
            <Loader2 size={10} className="animate-spin" />
            <span>Thinking…</span>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-[var(--solar-cyan)]/15 p-2">
        <div className="flex items-center gap-1.5 bg-black/30 rounded border border-[var(--solar-cyan)]/20 px-2 py-1.5 focus-within:border-[var(--solar-cyan)]/50 transition-colors">
          <span className="text-[var(--solar-cyan)]/40 font-mono text-[10px] shrink-0">›</span>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }}}
            placeholder="Ask about this terminal…"
            className="flex-1 bg-transparent text-[11px] font-mono text-[var(--text-main)] placeholder:text-[var(--text-muted)]/30 outline-none"
          />
          <button
            onClick={() => send()}
            disabled={!input.trim() || loading}
            className="shrink-0 p-1 rounded text-[var(--solar-cyan)] hover:bg-[var(--solar-cyan)]/10 disabled:opacity-30 transition-colors"
          >
            <Send size={11} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export const XTermShell = forwardRef<XTermShellHandle, XTermShellProps>(
  (
    {
      onClose,
      problems = [],
      outputLines = [],
      iamOrigin,
      workspaceCdCommand,
      agentDashboardUrl: agentDashboardUrlProp,
      showIamWelcomeBar = true,
      workspaceLabel = '',
      workspaceId,
      productLabel = DEFAULT_PRODUCT,
    },
    ref,
  ) => {
    const [resolvedOrigin, setResolvedOrigin] = useState(iamOrigin ?? window.location.origin);
    const [resolvedCdCmd, setResolvedCdCmd] = useState(workspaceCdCommand);

    const agentDashboardUrl =
      agentDashboardUrlProp ?? `${resolvedOrigin.replace(/\/$/, '')}/dashboard/agent`;

    const terminalRef    = useRef<HTMLDivElement>(null);
    const xtermRef       = useRef<Terminal | null>(null);
    const fitAddonRef    = useRef<FitAddon | null>(null);
    const socketRef      = useRef<WebSocket | null>(null);
    const ptySessionIdRef = useRef<string | null>(null);
    /** Rolling buffer of last 8k chars of terminal output — fed to AI panel */
    const bufferRef      = useRef<string>('');

    const [height, setHeight]         = useState(DEFAULT_HEIGHT);
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [activeTab, setActiveTab]   = useState<ShellTab>('terminal');
    const [status, setStatus]         = useState<'connecting' | 'online' | 'offline'>('connecting');
    const [aiOpen, setAiOpen]         = useState(false);
    const [restarting, setRestarting] = useState(false);
    const [tunnelHealth, setTunnelHealth] = useState<{ healthy: boolean; connections: number } | null>(null);
    const [sessionId, setSessionId]   = useState<string | null>(null);
    const [uptime, setUptime]         = useState(0);

    useEffect(() => {
      void fetch('/api/agentsam/config', { credentials: 'same-origin' })
        .then(r => (r.ok ? r.json() : Promise.reject()))
        .then((data: { workspace_cd_command?: string; iam_origin?: string }) => {
          if (workspaceCdCommand === undefined && data.workspace_cd_command) {
            setResolvedCdCmd(data.workspace_cd_command);
          }
          if (iamOrigin === undefined && data.iam_origin) {
            setResolvedOrigin(data.iam_origin);
          }
        })
        .catch(() => {});
    }, []);

    // ── Uptime counter (game-HUD feel) ──────────────────────────────────────
    useEffect(() => {
      if (status !== 'online') { setUptime(0); return; }
      const t = setInterval(() => setUptime(s => s + 1), 1000);
      return () => clearInterval(t);
    }, [status]);

    const fmtUptime = (s: number) => {
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      const sec = s % 60;
      return h > 0
        ? `${h}h${String(m).padStart(2,'0')}m`
        : `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
    };

    // ── Buffer helper ────────────────────────────────────────────────────────
    const appendBuffer = useCallback((text: string) => {
      bufferRef.current = (bufferRef.current + text).slice(-8000);
    }, []);

    // ── Tunnel status fetch ──────────────────────────────────────────────────
    const fetchTunnelStatus = useCallback(() => {
      void fetch('/api/tunnel/status', { credentials: 'same-origin' })
        .then(r => r.json())
        .then(j => {
          setTunnelHealth({ healthy: j?.healthy === true, connections: j?.connections ?? 0 });
          if (xtermRef.current) {
            const conns = j?.connections ?? 0;
            const ok = j?.healthy === true;
            xtermRef.current.writeln(
              `\r\n${ok ? '\x1b[38;5;82m' : '\x1b[38;5;208m'}  ◈ Cloudflare Tunnel${R} — ${ok ? `healthy · ${conns} connection${conns !== 1 ? 's' : ''}` : 'unreachable'}\r\n`,
            );
          }
        })
        .catch(() => setTunnelHealth(null));
    }, []);

    // ── Tunnel restart ───────────────────────────────────────────────────────
    const handleTunnelRestart = useCallback(async () => {
      setRestarting(true);
      xtermRef.current?.writeln('\r\n\x1b[38;5;208m  ◌ Requesting tunnel restart…\x1b[0m');
      try {
        const res = await fetch('/api/tunnel/restart', { method: 'POST', credentials: 'same-origin' });
        const data = await res.json() as { ok?: boolean; error?: string };
        if (data.ok) {
          xtermRef.current?.writeln('\x1b[38;5;82m  ✓ Restart requested — re-checking in 4s…\x1b[0m');
          setTimeout(fetchTunnelStatus, 4000);
        } else {
          xtermRef.current?.writeln(`\x1b[38;5;196m  ✗ ${data.error ?? 'Failed'}\x1b[0m`);
        }
      } catch (e: unknown) {
        xtermRef.current?.writeln(`\x1b[38;5;196m  ✗ Network error: ${e instanceof Error ? e.message : String(e)}\x1b[0m`);
      } finally {
        setRestarting(false);
      }
    }, [fetchTunnelStatus]);

    // ── Quick actions ────────────────────────────────────────────────────────
    const welcomeWorkspace = useCallback(() => {
      setIsCollapsed(false); setActiveTab('terminal');
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(`${resolvedCdCmd}\r`);
      } else {
        xtermRef.current?.writeln('\r\n\x1b[1;31m  Terminal offline — cannot run workspace cd.\x1b[0m\r\n');
      }
    }, [resolvedCdCmd]);

    const welcomeOpenAgent = useCallback(() => {
      window.open(agentDashboardUrl, '_blank', 'noopener,noreferrer');
    }, [agentDashboardUrl]);

    const welcomeTools = useCallback(() => {
      setIsCollapsed(false); setActiveTab('terminal');
      if (!xtermRef.current) return;
      const t = xtermRef.current;
      t.writeln('');
      t.writeln('\x1b[38;5;51m  ══ MCP & Terminal Stack ══════════════════════════════════\x1b[0m');
      t.writeln('\x1b[38;5;240m  MCP Server : https://mcp.inneranimalmedia.com/mcp\x1b[0m');
      t.writeln('\x1b[38;5;240m  PTY Repo   : github.com/SamPrimeaux/iam-pty\x1b[0m');
      t.writeln('\x1b[38;5;240m  PTY Local  : pm2 restart iam-pty  (port 3099)\x1b[0m');
      t.writeln('\x1b[38;5;240m  Tunnel     : terminal.inneranimalmedia.com → cloudflared → :3099\x1b[0m');
      t.writeln('\x1b[38;5;240m  Worker     : TERMINAL_WS_URL · TERMINAL_SECRET · PTY_AUTH_TOKEN\x1b[0m');
      t.writeln('\x1b[38;5;51m  ════════════════════════════════════════════════════════════\x1b[0m');
      t.writeln('');
    }, []);

    const welcomeTheme = useCallback(() => {
      setIsCollapsed(false); setActiveTab('terminal');
      xtermRef.current?.writeln('\x1b[38;5;240m  Theme: Settings → theme controls (CSS vars update this terminal).\x1b[0m');
    }, []);

    const welcomeDiagnostics = useCallback(() => {
      setIsCollapsed(false); setActiveTab('terminal');
      const ws = socketRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        xtermRef.current?.writeln('\r\n\x1b[1;31m  Terminal offline — cannot run diagnostics.\x1b[0m\r\n');
        return;
      }
      const cmds = [
        `echo "═══════ ${productLabel} diagnostics ═══════"`,
        'node --version 2>/dev/null || echo "node: not found"',
        'npm --version 2>/dev/null || echo "npm: not found"',
        'npx wrangler --version 2>/dev/null || echo "wrangler: not found"',
        'pm2 status 2>/dev/null || echo "pm2: not found"',
        'echo "═══════════════════════════════════"',
      ];
      cmds.forEach((c, i) => window.setTimeout(() => ws.send(`${c}\r`), i * 240));
    }, [productLabel]);

    // ─── WebSocket connect ──────────────────────────────────────────────────
    useEffect(() => {
      let isMounted = true;

      const connect = async () => {
        try {
          ptySessionIdRef.current = null;
          setSessionId(null);

          const [socketPack, resumeJson, cfgJson] = await Promise.all([
            fetch('/api/agent/terminal/socket-url', { credentials: 'same-origin', headers: { Accept: 'application/json' } })
              .then(async r => ({ r, j: await r.json().catch(() => ({})) as Record<string,unknown> })),
            fetch('/api/terminal/session/resume', { credentials: 'same-origin', headers: { Accept: 'application/json' } })
              .then(r => r.json().catch(() => ({ resumable: false }))),
            fetch('/api/agent/terminal/config-status', { credentials: 'same-origin', headers: { Accept: 'application/json' } })
              .then(r => r.json().catch(() => ({}))),
          ]);

          if (!isMounted) return;

          if (!socketPack.r.ok || !(socketPack.j as {url?: string}).url) {
            if (isMounted) setStatus('offline');
            if (xtermRef.current) {
              const err = (socketPack.j as {error?: string}).error ?? `socket-url ${socketPack.r.status}`;
              xtermRef.current.writeln(`\r\n\x1b[1;31m  ✗ Terminal URL failed: ${err}\x1b[0m`);
              xtermRef.current.writeln('\x1b[38;5;240m  Fix: pm2 restart iam-pty → check :3099 → cloudflared tunnel active → TERMINAL_WS_URL set\x1b[0m');
            }
            return;
          }

          const { url } = socketPack.j as { url: string };
          const ws = new WebSocket(url);
          socketRef.current = ws;

          ws.onopen = () => {
            if (!isMounted) return;
            setStatus('online');

            if (xtermRef.current) {
              xtermRef.current.clear();
              const banner = buildGameBanner(workspaceLabel, productLabel, workspaceId);
              xtermRef.current.writeln(banner);

              const cfgOk = (cfgJson as {terminal_configured?: boolean}).terminal_configured === true;
              xtermRef.current.writeln(`  ${cfgOk ? '\x1b[38;5;82m◈' : '\x1b[38;5;196m◈'}\x1b[0m Worker config: ${cfgOk ? 'TERMINAL_WS_URL + TERMINAL_SECRET \x1b[38;5;82mOK\x1b[0m' : '\x1b[38;5;196mMISSING\x1b[0m'}`);

              if ((resumeJson as {resumable?: boolean}).resumable === true) {
                const sid = (resumeJson as {session_id?: string}).session_id ?? '';
                const turl = (resumeJson as {tunnel_url?: string}).tunnel_url ?? '';
                xtermRef.current.writeln(`  \x1b[38;5;240m◈ Resume: session ${sid.slice(0, 8)}… (${turl.slice(0, 40)}…)\x1b[0m`);
              }

              fetch('/api/agent/memory/list', { method: 'GET', credentials: 'same-origin' })
                .then(r => r.json())
                .then((data: unknown) => {
                  const items = Array.isArray(data) ? data as { key?: string; value?: string }[] : [];
                  const greeting = items.find(m => m.key === 'STARTUP_GREETING')?.value;
                  if (greeting && xtermRef.current) {
                    xtermRef.current.writeln(`\r\n\x1b[1;36m  › ${greeting}\x1b[0m`);
                  }
                  fetchTunnelStatus();
                })
                .catch(() => fetchTunnelStatus());
            }
          };

          ws.onmessage = (event) => {
            try {
              const msg = JSON.parse(event.data as string) as { type?: string; session_id?: string; data?: string };
              if (msg.type === 'session_id') {
                const sid = msg.session_id?.trim() ?? '';
                if (sid) { ptySessionIdRef.current = sid; setSessionId(sid); }
                return;
              }
              if (msg.type === 'output') {
                const text = msg.data ?? '';
                appendBuffer(text);
                xtermRef.current?.write(text);
                return;
              }
            } catch (_) {}
            if (typeof event.data === 'string' && event.data.startsWith('{"type":"session_id"')) return;
            appendBuffer(event.data as string);
            xtermRef.current?.write(event.data as string);
          };

          ws.onclose = () => {
            if (!isMounted) return;
            setStatus('offline');
            setSessionId(null);
            ptySessionIdRef.current = null;
            xtermRef.current?.writeln('\r\n\x1b[1;31m  ✗ Connection closed.\x1b[0m\r\n\x1b[38;5;240m  Type Ctrl+A to open AI assist, or click Retry to reconnect.\x1b[0m');
          };

          ws.onerror = () => { if (isMounted) setStatus('offline'); };
        } catch (_) {
          if (isMounted) setStatus('offline');
        }
      };

      if (!isCollapsed && activeTab === 'terminal') connect();

      return () => {
        isMounted = false;
        socketRef.current?.close();
        socketRef.current = null;
      };
    }, [isCollapsed, activeTab, workspaceLabel, productLabel, workspaceId, fetchTunnelStatus, appendBuffer]);

    // ── Theme reactivity ─────────────────────────────────────────────────────
    useEffect(() => {
      const observer = new MutationObserver(() => {
        if (!xtermRef.current) return;
        const s = getComputedStyle(document.documentElement);
        const bg  = s.getPropertyValue('--terminal-surface').trim() || '#060e14';
        const fg  = s.getPropertyValue('--text-main').trim()        || '#839496';
        const cur = s.getPropertyValue('--solar-cyan').trim()       || '#2dd4bf';
        const sel = s.getPropertyValue('--bg-panel').trim()         || '#0a2d38';
        xtermRef.current.options.theme = { ...xtermRef.current.options.theme, background: bg, foreground: fg, cursor: cur, selectionBackground: sel };
      });
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
      return () => observer.disconnect();
    }, []);

    // ── Expose handle ─────────────────────────────────────────────────────────
    useImperativeHandle(ref, () => ({
      writeToTerminal: (text: string) => {
        if (!xtermRef.current) return;
        setIsCollapsed(false); setActiveTab('terminal');
        xtermRef.current.writeln(`\r\n\x1b[2m${text}\x1b[0m`);
      },
      runCommand: (cmd: string) => {
        if (!xtermRef.current) return;
        setIsCollapsed(false); setActiveTab('terminal');
        if (socketRef.current?.readyState === WebSocket.OPEN) {
          socketRef.current.send(cmd + '\r');
          return;
        }
        const sid = ptySessionIdRef.current;
        xtermRef.current.writeln(`\r\n\x1b[33m  WS offline — POST /api/agent/terminal/run…\x1b[0m`);
        void fetch('/api/agent/terminal/run', {
          method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ command: cmd, session_id: sid }),
        })
          .then(async r => {
            const j = await r.json().catch(() => ({})) as { error?: string; output?: string; command?: string; execution_id?: string };
            if (!xtermRef.current) return;
            if (!r.ok) {
              xtermRef.current.writeln(`\r\n\x1b[1;31m  terminal/run ${r.status}: ${j.error ?? 'error'}\x1b[0m`);
              return;
            }
            xtermRef.current.writeln(`\r\n\x1b[36m  $ ${j.command ?? cmd}\x1b[0m`);
            const out = j.output ?? '';
            appendBuffer(out);
            xtermRef.current.writeln(out.trim() !== '' ? out : '  (no output)');
            // Fire-and-forget terminal/complete when execution_id is returned
            if (j.execution_id) {
              void fetch('/api/agent/terminal/complete', {
                method: 'POST', credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ execution_id: j.execution_id, status: 'completed', output_text: out, exit_code: 0 }),
              }).catch(() => {});
            }
          })
          .catch(() => xtermRef.current?.writeln('\r\n\x1b[1;31m  terminal/run: network error\x1b[0m'));
      },
      setActiveTab: (t: ShellTab) => { setActiveTab(t); setIsCollapsed(false); },
    }));

    // ── Terminal init ─────────────────────────────────────────────────────────
    useEffect(() => {
      if (!terminalRef.current || isCollapsed || activeTab !== 'terminal') return;
      const s   = getComputedStyle(document.documentElement);
      const bg  = s.getPropertyValue('--terminal-surface').trim() || '#060e14';
      const fg  = s.getPropertyValue('--text-main').trim()        || '#839496';
      const cur = s.getPropertyValue('--solar-cyan').trim()       || '#2dd4bf';
      const sel = s.getPropertyValue('--bg-panel').trim()         || '#0a2d38';

      const term = new Terminal({
        theme: {
          background: bg, foreground: fg, cursor: cur, selectionBackground: sel,
          black: '#002b36', brightBlack: '#657b83',
          red: '#dc322f',   brightRed: '#cb4b16',
          green: '#859900', brightGreen: '#586e75',
          yellow: '#b58900',brightYellow: '#657b83',
          blue: '#268bd2',  brightBlue: '#839496',
          magenta: '#d33682', brightMagenta: '#6c71c4',
          cyan: '#2aa198',  brightCyan: '#93a1a1',
          white: '#eee8d5', brightWhite: '#fdf6e3',
        },
        fontFamily: '"JetBrains Mono", "Fira Code", "SF Mono", Menlo, Monaco, "Courier New", monospace',
        fontSize: 12, lineHeight: 1.45, cursorBlink: true, cursorStyle: 'block',
        allowTransparency: true, scrollback: 5000,
      });

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.open(terminalRef.current);
      setTimeout(() => fitAddon.fit(), 150);

      // Intercept `?` → open AI panel instead of sending to PTY
      term.onData(data => {
        // Intercept `/agentsam ` command (starts with /a...) or `?` or `Ctrl+A`
        if (data === '?') { setAiOpen(true); return; }
        if (data === '\x01') { setAiOpen(v => !v); return; }
        
        // Simple buffer for command interception
        const cmdBuffer = bufferRef.current.split('\r').pop() || '';
        if (cmdBuffer.endsWith('/agentsam') && (data === ' ' || data === '\r')) {
           setAiOpen(true);
           // We don't return here because we might want the /agentsam to appear in the PTY too 
           // depending on if it's a real tool. For now, let's just trigger the assistant.
        }

        if (socketRef.current?.readyState === WebSocket.OPEN) {
          socketRef.current.send(data);
        }
      });

      xtermRef.current  = term;
      fitAddonRef.current = fitAddon;

      const onResize = () => requestAnimationFrame(() => fitAddonRef.current?.fit());
      window.addEventListener('resize', onResize);
      const ro = new ResizeObserver(() => requestAnimationFrame(() => fitAddonRef.current?.fit()));
      if (terminalRef.current) ro.observe(terminalRef.current);
      return () => { window.removeEventListener('resize', onResize); ro.disconnect(); term.dispose(); };
    }, [isCollapsed, activeTab]);

    // ── Drag resize ───────────────────────────────────────────────────────────
    const handleDragStart = (e: React.MouseEvent) => {
      e.preventDefault();
      const startY = e.clientY, startH = height;
      const maxH = window.innerHeight * MAX_HEIGHT_RATIO;
      const onMove = (me: MouseEvent) => {
        const next = Math.max(MIN_HEIGHT, Math.min(startH + (startY - me.clientY), maxH));
        setHeight(next);
        requestAnimationFrame(() => fitAddonRef.current?.fit());
      };
      const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    };

    // ── Quick action run helper (AI panel → terminal) ─────────────────────────
    const runFromAI = useCallback((cmd: string) => {
      setIsCollapsed(false); setActiveTab('terminal');
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(cmd + '\r');
      } else {
        // Use the exposed ref method via callback
        xtermRef.current?.writeln(`\r\n\x1b[33m  Running via HTTP: ${cmd}\x1b[0m`);
        void fetch('/api/agent/terminal/run', {
          method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: cmd, session_id: ptySessionIdRef.current }),
        }).then(async r => {
          const j = await r.json().catch(() => ({})) as { output?: string; command?: string; execution_id?: string; error?: string };
          if (!xtermRef.current) return;
          const out = j.output ?? '';
          appendBuffer(out);
          xtermRef.current.writeln(`\x1b[36m  $ ${j.command ?? cmd}\x1b[0m`);
          xtermRef.current.writeln(out.trim() || '  (no output)');
          if (j.execution_id) {
            void fetch('/api/agent/terminal/complete', {
              method: 'POST', credentials: 'same-origin',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ execution_id: j.execution_id, status: 'completed', output_text: out, exit_code: 0 }),
            }).catch(() => {});
          }
        });
      }
    }, [appendBuffer]);

    // ── Derived UI ────────────────────────────────────────────────────────────
    const errorCount   = problems.filter(p => p.severity === 'error').length;
    const warningCount = problems.filter(p => p.severity === 'warning').length;

    const QUICK_ACTIONS = [
      { n: '1', label: 'Workspace', fn: welcomeWorkspace },
      { n: '2', label: 'Agent',     fn: welcomeOpenAgent },
      { n: '3', label: 'Tools',     fn: welcomeTools     },
      { n: '4', label: 'Theme',     fn: welcomeTheme     },
      { n: '5', label: 'Diag',      fn: welcomeDiagnostics },
    ] as const;

    return (
      <>
        {/* Scanline overlay (CSS trick — pointer-events:none so it doesn't block clicks) */}
        <style>{`
          .iam-scanlines::after {
            content: '';
            position: absolute; inset: 0;
            background: repeating-linear-gradient(
              to bottom,
              transparent, transparent 2px,
              rgba(0,0,0,0.06) 2px, rgba(0,0,0,0.06) 4px
            );
            pointer-events: none;
            z-index: 1;
          }
          .xterm-shell-viewport .xterm-viewport { overflow-y: hidden !important; }
          @keyframes iam-pulse-cyan {
            0%, 100% { box-shadow: 0 0 4px var(--solar-cyan); }
            50% { box-shadow: 0 0 12px var(--solar-cyan); }
          }
          .iam-online-dot { animation: iam-pulse-cyan 2s ease-in-out infinite; }
        `}</style>

        <div
          className={`iam-scanlines relative flex flex-col border-t shadow-[0_-4px_20px_rgba(0,0,0,0.3)] transition-all duration-300 ease-out shrink-0 ${
            isCollapsed ? 'h-[36px]' : ''
          }`}
          style={{
            height: isCollapsed ? '36px' : `${height}px`,
            background: 'var(--terminal-chrome)',
            borderColor: 'var(--solar-cyan, #2aa198)',
            borderTopWidth: '1px',
            zIndex: 40,
          }}
        >
          {/* Resize handle */}
          {!isCollapsed && (
            <div className="h-1 w-full shrink-0 cursor-ns-resize group flex items-center justify-center" onMouseDown={handleDragStart}>
              <div className="h-px w-16 rounded-full bg-[var(--border-subtle)] group-hover:bg-[var(--solar-cyan)] group-hover:w-24 transition-all duration-200" />
            </div>
          )}

          {/* ── Toolbar ── */}
          <div
            className="h-9 min-h-9 shrink-0 flex items-center justify-between px-2 pl-3 border-b border-[var(--border-subtle)] select-none"
            style={{ background: 'var(--terminal-chrome)' }}
          >
            {/* Left: tabs + status */}
            <div className="flex items-center gap-3 min-w-0">
              {/* Tab bar */}
              <div className="flex items-stretch gap-0">
                {(['terminal', 'output', 'problems'] as ShellTab[]).map(tab => {
                  const badge = tab === 'problems' && (errorCount + warningCount) > 0
                    ? errorCount > 0 ? errorCount : warningCount
                    : null;
                  return (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setActiveTab(tab)}
                      className={`relative px-3 py-2 text-[10px] font-bold tracking-[0.14em] uppercase transition-colors flex items-center gap-1.5 ${
                        activeTab === tab
                          ? 'text-[var(--solar-cyan)]'
                          : 'text-[var(--terminal-tab-muted)] hover:text-[var(--text-main)]'
                      }`}
                    >
                      {tab === 'terminal' && <TerminalIcon size={9} />}
                      {tab}{' '}
                      {badge !== null && (
                        <span className="px-1 py-0.5 rounded text-[8px] bg-[var(--solar-red)]/20 text-[var(--solar-red)] border border-[var(--solar-red)]/30">
                          {badge}
                        </span>
                      )}
                      {activeTab === tab && (
                        <span className="absolute bottom-0 left-1 right-1 h-0.5 rounded-sm bg-[var(--solar-cyan)] shadow-[0_0_6px_var(--solar-cyan)]" />
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="hidden sm:flex items-center h-5 w-px bg-[var(--border-subtle)] shrink-0" />

              {/* WS status indicator */}
              <div className="hidden sm:flex items-center gap-1.5 shrink-0">
                {status === 'connecting' && (
                  <span className="text-[10px] font-mono text-[var(--solar-yellow)] flex items-center gap-1.5">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--solar-yellow)] opacity-40" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--solar-yellow)]" />
                    </span>
                    Connecting
                  </span>
                )}
                {status === 'online' && (
                  <span className="text-[10px] font-mono text-[var(--solar-green)] flex items-center gap-1.5">
                    <span className="iam-online-dot h-2 w-2 rounded-full bg-[var(--solar-green)] inline-block" />
                    Online · {fmtUptime(uptime)}
                    {sessionId && <span className="text-[var(--text-muted)]/40"> · {sessionId.slice(0,6)}…</span>}
                  </span>
                )}
                {status === 'offline' && (
                  <span className="text-[10px] font-mono text-[var(--solar-red)] flex items-center gap-1.5">
                    <WifiOff size={10} />
                    Offline
                  </span>
                )}
              </div>

              {/* Tunnel health pill */}
              {tunnelHealth && (
                <>
                  <div className="hidden sm:flex items-center h-5 w-px bg-[var(--border-subtle)] shrink-0" />
                  <div className="hidden sm:flex items-center gap-1.5 shrink-0">
                    {tunnelHealth.healthy
                      ? <Wifi size={9} className="text-[var(--solar-green)]" />
                      : <WifiOff size={9} className="text-[var(--solar-red)]" />}
                    <span className={`text-[9px] font-mono ${tunnelHealth.healthy ? 'text-[var(--solar-green)]' : 'text-[var(--solar-red)]'}`}>
                      {tunnelHealth.healthy ? `Tunnel ×${tunnelHealth.connections}` : 'Tunnel ✗'}
                    </span>
                    <button
                      onClick={handleTunnelRestart}
                      disabled={restarting}
                      title="Restart Cloudflare Tunnel"
                      className="p-0.5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--solar-yellow)] transition-colors disabled:opacity-40"
                    >
                      <RefreshCw size={9} className={restarting ? 'animate-spin' : ''} />
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Right: AI button + collapse + close */}
            <div className="flex items-center gap-0.5 shrink-0">
              <button
                type="button"
                onClick={() => setAiOpen(v => !v)}
                title="Toggle AI Assist (Ctrl+A or type ?)"
                className={`p-1.5 rounded flex items-center gap-1 text-[9px] font-mono font-bold tracking-wider transition-colors border ${
                  aiOpen
                    ? 'bg-[var(--solar-cyan)]/10 border-[var(--solar-cyan)]/30 text-[var(--solar-cyan)]'
                    : 'border-transparent text-[var(--text-muted)] hover:text-[var(--solar-cyan)] hover:border-[var(--solar-cyan)]/20'
                }`}
              >
                <Bot size={12} />
                <span className="hidden sm:inline">AI</span>
              </button>
              <button
                type="button"
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors"
                title={isCollapsed ? 'Expand' : 'Minimize'}
              >
                {isCollapsed ? <ChevronUp size={15} strokeWidth={2} /> : <ChevronDown size={15} strokeWidth={2} />}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--solar-red)] transition-colors"
                title="Close"
              >
                <X size={15} strokeWidth={2} />
              </button>
            </div>
          </div>

          {/* ── Content area ── */}
          {!isCollapsed && (
            <div className="flex-1 min-h-0 flex overflow-hidden relative">
              {/* Main panel */}
              <div className={`flex flex-col flex-1 min-h-0 min-w-0 transition-all duration-300 ${aiOpen ? 'mr-[340px]' : ''}`}>
                {/* Quick actions row */}
                {activeTab === 'terminal' && showIamWelcomeBar && (
                  <div
                    className="shrink-0 flex flex-wrap items-center gap-1 px-2 py-1.5 border-b border-[var(--border-subtle)] bg-[var(--terminal-surface)]"
                    role="toolbar"
                    aria-label={`${productLabel} quick actions`}
                  >
                    <span className="text-[9px] font-bold tracking-widest text-[var(--terminal-tab-muted)] uppercase mr-1 shrink-0">
                      {productLabel}
                    </span>
                    {QUICK_ACTIONS.map(({ n, label, fn }) => (
                      <button
                        key={n}
                        type="button"
                        onClick={fn}
                        className="px-2 py-0.5 rounded text-[10px] font-mono border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--solar-cyan)] hover:border-[var(--solar-cyan)]/40 hover:bg-[var(--solar-cyan)]/5 transition-all"
                      >
                        <span className="text-[var(--solar-yellow)]">{n}.</span> {label}
                      </button>
                    ))}
                    {/* Inline AI trigger chip */}
                    <button
                      type="button"
                      onClick={() => setAiOpen(true)}
                      className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-mono border border-[var(--solar-cyan)]/20 text-[var(--solar-cyan)]/60 hover:text-[var(--solar-cyan)] hover:border-[var(--solar-cyan)]/50 hover:bg-[var(--solar-cyan)]/5 transition-all"
                    >
                      <Zap size={9} /> type <kbd className="font-bold">?</kbd> or <kbd className="font-bold">Ctrl+A</kbd>
                    </button>
                  </div>
                )}

                {/* Terminal viewport */}
                {activeTab === 'terminal' && (
                  <div
                    ref={terminalRef}
                    className="xterm-shell-viewport flex-1 min-h-0 w-full bg-[var(--terminal-surface)]"
                  />
                )}

                {/* Output tab */}
                {activeTab === 'output' && (
                  <div className="h-full overflow-y-auto custom-scrollbar px-4 py-3 font-mono text-[11px] leading-relaxed text-[var(--text-main)] bg-[var(--terminal-surface)]">
                    {outputLines.length === 0
                      ? <p className="text-[var(--text-muted)]/40 text-xs italic mt-4">No output yet.</p>
                      : outputLines.map((line, i) => (
                          <div key={i} className="mb-1 border-l-2 border-transparent pl-2 hover:border-[var(--solar-cyan)]/30">
                            {line}
                          </div>
                        ))
                    }
                  </div>
                )}

                {/* Problems tab */}
                {activeTab === 'problems' && (
                  <div className="h-full overflow-y-auto custom-scrollbar p-4 space-y-2 bg-[var(--terminal-surface)]">
                    {problems.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full text-[var(--text-muted)] opacity-40 gap-2">
                        <CircleCheck size={28} />
                        <p className="text-xs font-mono">No problems detected</p>
                      </div>
                    ) : (
                      problems.map((p, i) => (
                        <div
                          key={i}
                          className={`flex items-start gap-2 p-2 rounded bg-[var(--bg-panel)] border-l-2 ${
                            p.severity === 'error' ? 'border-[var(--solar-red)]' : 'border-[var(--solar-yellow)]'
                          }`}
                        >
                          <TriangleAlert size={13} className={p.severity === 'error' ? 'text-[var(--solar-red)]' : 'text-[var(--solar-yellow)]'} />
                          <div className="min-w-0">
                            <div className="text-[11px] font-medium text-[var(--text-main)] font-mono">{p.msg}</div>
                            <div className="text-[10px] text-[var(--text-muted)] font-mono">{p.file}:{p.line}</div>
                          </div>
                          {/* One-click: ask AI about this problem */}
                          <button
                            onClick={() => { setAiOpen(true); }}
                            className="ml-auto shrink-0 text-[9px] px-1.5 py-0.5 rounded border border-[var(--solar-cyan)]/20 text-[var(--solar-cyan)]/50 hover:text-[var(--solar-cyan)] hover:border-[var(--solar-cyan)]/40 font-mono transition-colors"
                            title="Ask AI about this error"
                          >
                            <Bot size={9} />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* AI Assist Panel — slides in over the right */}
              <AIPanel
                visible={aiOpen}
                onClose={() => setAiOpen(false)}
                onRunCommand={runFromAI}
                terminalBuffer={bufferRef.current}
              />
            </div>
          )}
        </div>
      </>
    );
  },
);

XTermShell.displayName = 'XTermShell';

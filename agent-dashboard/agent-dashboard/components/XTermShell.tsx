import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { X, ChevronDown, ChevronUp, TriangleAlert, CircleCheck } from 'lucide-react';
import '@xterm/xterm/css/xterm.css';

/**
 * IAM Branding Assets
 */
const IAM_LOGO = `
\x1b[1;36m   ___                       ___        _   _       \x1b[0m
\x1b[1;36m  |_ _|_ _ _ _  ___ _ _     / __| __ _ | |_| |      \x1b[0m
\x1b[1;36m   | || ' \\ ' \\/ -_) '_|   | (__ / _\` ||  _| |__    \x1b[0m
\x1b[1;36m  |___|_||_|_|_|\\___|_|     \\___|\\__,_| \\__|_|____| \x1b[0m
\x1b[1;2m            S T U D I O   S A N D B O X            \x1b[0m
`;

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
  /** Reserved for mirroring PTY stream into Output tab */
  onOutputLine?: (line: string) => void;
  /** Base site URL (builds agent dashboard link for welcome actions). */
  iamOrigin?: string;
  /** Command sent to the host PTY for “Start workspace” (same intent as iam-welcome.sh option 1). */
  workspaceCdCommand?: string;
  /** Optional override for “Open agent” URL. */
  agentDashboardUrl?: string;
  /** Show IAM welcome chip row (mirrors scripts/iam-welcome.sh menu in the GUI). */
  showIamWelcomeBar?: boolean;
}

const MIN_HEIGHT = 140;
const MAX_HEIGHT_RATIO = 0.75;
const DEFAULT_HEIGHT = 280;

const DEFAULT_IAM_ORIGIN =
  typeof window !== 'undefined' ? window.location.origin : 'https://inneranimalmedia.com';

export const XTermShell = forwardRef<XTermShellHandle, XTermShellProps>(
  (
    {
      onClose,
      problems = [],
      outputLines = [],
      iamOrigin = DEFAULT_IAM_ORIGIN,
      workspaceCdCommand = 'cd ~/Downloads/march1st-inneranimalmedia',
      agentDashboardUrl: agentDashboardUrlProp,
      showIamWelcomeBar = true,
    },
    ref,
  ) => {
    const agentDashboardUrl =
      agentDashboardUrlProp ?? `${iamOrigin.replace(/\/$/, '')}/dashboard/agent`;
    const terminalRef = useRef<HTMLDivElement>(null);
    const xtermRef = useRef<Terminal | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);
    const socketRef = useRef<WebSocket | null>(null);
    const [height, setHeight] = useState(DEFAULT_HEIGHT);
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [activeTab, setActiveTab] = useState<ShellTab>('terminal');
    const [status, setStatus] = useState<'connecting' | 'online' | 'offline'>('connecting');

    const welcomeWorkspace = useCallback(() => {
      setIsCollapsed(false);
      setActiveTab('terminal');
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(`${workspaceCdCommand}\r`);
      } else if (xtermRef.current) {
        xtermRef.current.writeln('\r\n\x1b[1;31mTerminal offline — cannot run workspace cd.\x1b[0m\r\n');
      }
    }, [workspaceCdCommand]);

    const welcomeOpenAgent = useCallback(() => {
      window.open(agentDashboardUrl, '_blank', 'noopener,noreferrer');
    }, [agentDashboardUrl]);

    const welcomeTools = useCallback(() => {
      setIsCollapsed(false);
      setActiveTab('terminal');
      if (!xtermRef.current) return;
      xtermRef.current.writeln('');
      xtermRef.current.writeln(
        '\x1b[38;5;240m  Tools: MCP — mcp.inneranimalmedia.com  |  Host PTY — pm2 restart iam-pty if the tunnel drops.\x1b[0m',
      );
      xtermRef.current.writeln('');
    }, []);

    const welcomeTheme = useCallback(() => {
      setIsCollapsed(false);
      setActiveTab('terminal');
      if (!xtermRef.current) return;
      xtermRef.current.writeln(
        '\x1b[38;5;240m  Theme: use the dashboard Settings / theme controls in the UI.\x1b[0m',
      );
    }, []);

    const welcomeDiagnostics = useCallback(() => {
      setIsCollapsed(false);
      setActiveTab('terminal');
      if (!xtermRef.current) return;
      const ws = socketRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        xtermRef.current.writeln('\r\n\x1b[1;31mTerminal offline — cannot run host diagnostics.\x1b[0m\r\n');
        return;
      }
      const cmds = [
        'echo "=== IAM diagnostics (host shell) ==="',
        'node --version 2>/dev/null || echo "node: not found"',
        'npm --version 2>/dev/null || echo "npm: not found"',
        'npx wrangler --version 2>/dev/null || echo "wrangler: not found"',
      ];
      cmds.forEach((c, i) => {
        window.setTimeout(() => ws.send(`${c}\r`), i * 220);
      });
    }, []);

    // ── WebSocket Connectivity ────────────────────────────────────────────────
    useEffect(() => {
      let isMounted = true;

      const connect = async () => {
        try {
          const resp = await fetch('/api/agent/terminal/socket-url');
          const { url } = await resp.json();
          if (!isMounted || !url) return;

          // IAM Terminal Stubs
          ['/api/agent/terminal/run', '/api/agent/terminal/complete', '/api/terminal/session/resume', '/api/terminal/session/register', '/api/terminal/assist', '/api/tunnel/restart', '/api/tunnel/status'].forEach(u => {
            console.log('TODO: wire', u);
          });

          const ws = new WebSocket(url);
          socketRef.current = ws;

          ws.onopen = () => {
            if (isMounted) setStatus('online');
            
            // Initial UI setup on first open
            if (xtermRef.current) {
              xtermRef.current.clear();
              xtermRef.current.writeln(IAM_LOGO);
              xtermRef.current.writeln(
                '\x1b[2m  Host splash menu: copy scripts/iam-welcome.sh from the repo to ~/iam-welcome.sh, or use the IAM actions row above.\x1b[0m',
              );

              fetch('/api/agent/memory/list', { method: 'GET' })
                .then((r) => r.json())
                .then((data) => {
                  const greeting = Array.isArray(data)
                    ? data.find((m: { key?: string }) => m.key === 'STARTUP_GREETING')?.value
                    : null;
                  if (greeting && xtermRef.current) {
                    xtermRef.current.writeln(`\r\n\x1b[1;36m>\x1b[0m ${greeting}\r\n`);
                  } else if (xtermRef.current) {
                    xtermRef.current.writeln('\r\n\x1b[2m  MeauxCAD Terminal — connected to PTY\x1b[0m\r\n');
                  }
                })
                .catch(() => {
                  if (xtermRef.current) {
                    xtermRef.current.writeln('\r\n\x1b[2m  MeauxCAD Terminal — PTY session active\x1b[0m\r\n');
                  }
                });
            }
          };

          ws.onmessage = (event) => {
            try {
              const msg = JSON.parse(event.data);
              if (msg.type === 'session_id') return; // consume handshake silently
              if (msg.type === 'output') { 
                if (xtermRef.current) xtermRef.current.write(msg.data); 
                return; 
              }
            } catch (_) {}
            // Handshake consuming/filtering for older JSON protocols
            if (event.data && typeof event.data === 'string' && event.data.startsWith('{"type":"session_id"')) return;
            
            if (xtermRef.current) xtermRef.current.write(event.data);
          };

          ws.onclose = () => {
            if (isMounted) setStatus('offline');
            if (xtermRef.current) xtermRef.current.writeln('\r\n\x1b[1;31mConnection closed.\x1b[0m');
          };

          ws.onerror = () => {
            if (isMounted) setStatus('offline');
          };
        } catch (e) {
          if (isMounted) setStatus('offline');
        }
      };

      if (!isCollapsed && activeTab === 'terminal') {
        connect();
      }

      return () => {
        isMounted = false;
        if (socketRef.current) {
          socketRef.current.close();
          socketRef.current = null;
        }
      };
    }, [isCollapsed, activeTab]);

    // ── Theme Reactivity ───────────────────────────────────────────────────
    useEffect(() => {
      const observer = new MutationObserver(() => {
        if (!xtermRef.current) return;
        const styles = getComputedStyle(document.documentElement);
        const bg = styles.getPropertyValue('--terminal-surface').trim() || styles.getPropertyValue('--scene-bg').trim() || '#060e14';
        const fg = styles.getPropertyValue('--text-main').trim() || '#839496';
        const cyan = styles.getPropertyValue('--solar-cyan').trim() || '#2dd4bf';
        const sel = styles.getPropertyValue('--bg-panel').trim() || '#0a2d38';

        xtermRef.current.options.theme = {
          ...xtermRef.current.options.theme,
          background: bg,
          foreground: fg,
          cursor: cyan,
          selectionBackground: sel,
        };
      });

      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      return () => observer.disconnect();
    }, []);

    // ── Expose methods via ref ───────────────────────────────────────────
    useImperativeHandle(ref, () => ({
      writeToTerminal: (text: string) => {
        if (!xtermRef.current) return;
        setIsCollapsed(false);
        setActiveTab('terminal');
        xtermRef.current.writeln(`\r\n\x1b[2m${text}\x1b[0m`);
      },
      runCommand: (cmd: string) => {
        if (!xtermRef.current) return;
        setIsCollapsed(false);
        setActiveTab('terminal');
        if (socketRef.current?.readyState === WebSocket.OPEN) {
          socketRef.current.send(cmd + '\r');
        } else {
          xtermRef.current.writeln(`\r\n\x1b[1;31mError: Terminal offline. Cannot run "${cmd}"\x1b[0m`);
        }
      },
      setActiveTab: (t: ShellTab) => {
        setActiveTab(t);
        setIsCollapsed(false);
      }
    }));

    // ── Drag handle ─────────────────────────────────────────────────────────
    const handleDragStart = (e: React.MouseEvent) => {
      e.preventDefault();
      const startY = e.clientY;
      const startHeight = height;
      const maxH = window.innerHeight * MAX_HEIGHT_RATIO;
      const onMove = (me: MouseEvent) => {
        const delta = startY - me.clientY;
        const next = Math.max(MIN_HEIGHT, Math.min(startHeight + delta, maxH));
        setHeight(next);
        setTimeout(() => fitAddonRef.current?.fit(), 30);
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    };

    // ── Terminal Init ─────────────────────────────────────────────────────
    useEffect(() => {
      if (!terminalRef.current || isCollapsed || activeTab !== 'terminal') return;

      const styles = getComputedStyle(document.documentElement);
      const bg = styles.getPropertyValue('--terminal-surface').trim() || styles.getPropertyValue('--scene-bg').trim() || '#060e14';
      const fg = styles.getPropertyValue('--text-main').trim() || '#839496';
      const cyan = styles.getPropertyValue('--solar-cyan').trim() || '#2dd4bf';
      const sel = styles.getPropertyValue('--bg-panel').trim() || '#0a2d38';

      const term = new Terminal({
        theme: {
          background: bg,
          foreground: fg,
          cursor: cyan,
          selectionBackground: sel,
          black: '#002b36', brightBlack: '#657b83',
          red: '#dc322f', brightRed: '#cb4b16',
          green: '#859900', brightGreen: '#586e75',
          yellow: '#b58900', brightYellow: '#657b83',
          blue: '#268bd2', brightBlue: '#839496',
          magenta: '#d33682', brightMagenta: '#6c71c4',
          cyan: '#2aa198', brightCyan: '#93a1a1',
          white: '#eee8d5', brightWhite: '#fdf6e3',
        },
        fontFamily: '"JetBrains Mono", "Fira Code", "SF Mono", Menlo, Monaco, "Courier New", monospace',
        fontSize: 12,
        lineHeight: 1.45,
        cursorBlink: true,
        cursorStyle: 'block',
        allowTransparency: true,
        scrollback: 5000,
      });

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.open(terminalRef.current);
      setTimeout(() => fitAddon.fit(), 50);

      term.onData((data) => {
        if (socketRef.current?.readyState === WebSocket.OPEN) {
          socketRef.current.send(data);
        }
      });

      xtermRef.current = term;
      fitAddonRef.current = fitAddon;

      const onResize = () => setTimeout(() => fitAddonRef.current?.fit(), 50);
      window.addEventListener('resize', onResize);
      return () => {
        window.removeEventListener('resize', onResize);
        term.dispose();
      };
    }, [isCollapsed, activeTab]);

    return (
      <div
        className={`fixed bottom-0 left-0 right-0 z-50 flex flex-col border-t border-[var(--border-subtle)] shadow-[0_-8px_32px_rgba(0,0,0,0.45)] transition-transform duration-300 ease-out ${
          isCollapsed ? 'translate-y-[calc(100%-36px)]' : 'translate-y-0'
        }`}
        style={{
          height: isCollapsed ? '36px' : `${height}px`,
          background: 'var(--terminal-chrome)',
        }}
      >
        {/* Resize handle — own row so it does not cover tab clicks */}
        {!isCollapsed && (
          <div
            className="h-1 w-full shrink-0 cursor-ns-resize group flex items-center justify-center"
            onMouseDown={handleDragStart}
            title="Drag to resize"
          >
            <div className="h-px w-12 rounded-full bg-[var(--border-subtle)] group-hover:bg-[var(--solar-cyan)] group-hover:w-20 transition-all" />
          </div>
        )}

        {/* Toolbar — VS Code–style tabs + status */}
        <div
          className="h-9 min-h-9 shrink-0 flex items-center justify-between px-2 pl-3 border-b border-[var(--border-subtle)] select-none"
          style={{ background: 'var(--terminal-chrome)' }}
        >
          <div className="flex items-center gap-5 min-w-0">
            <div className="flex items-stretch gap-0 border-b-2 border-transparent -mb-[1px]">
              {(['terminal', 'output', 'problems'] as ShellTab[]).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`relative px-3.5 py-2 text-[10px] font-bold tracking-[0.12em] uppercase transition-colors ${
                    activeTab === tab
                      ? 'text-[var(--solar-cyan)]'
                      : 'text-[var(--terminal-tab-muted)] hover:text-[var(--text-main)]'
                  }`}
                >
                  {tab}
                  {activeTab === tab && (
                    <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-sm bg-[var(--solar-cyan)] shadow-[0_0_8px_var(--solar-cyan)]" />
                  )}
                </button>
              ))}
            </div>
            <div className="hidden sm:flex items-center h-5 w-px bg-[var(--border-subtle)] shrink-0" aria-hidden />
            {status === 'connecting' && (
              <span className="text-[10px] font-mono text-[var(--solar-yellow)] flex items-center gap-2 shrink-0">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--solar-yellow)] opacity-40" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--solar-yellow)]" />
                </span>
                Connecting
              </span>
            )}
            {status === 'online' && (
              <span className="text-[10px] font-mono text-[var(--solar-green)] flex items-center gap-2 shrink-0">
                <span className="h-2 w-2 rounded-full bg-[var(--solar-green)] shadow-[0_0_6px_var(--solar-green)]" />
                Online
              </span>
            )}
            {status === 'offline' && (
              <span className="text-[10px] font-mono text-[var(--solar-red)] flex items-center gap-1.5 shrink-0">
                <TriangleAlert size={12} strokeWidth={2} />
                Offline
              </span>
            )}
          </div>

          <div className="flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors"
              title={isCollapsed ? 'Expand panel' : 'Minimize panel'}
            >
              {isCollapsed ? <ChevronUp size={15} strokeWidth={2} /> : <ChevronDown size={15} strokeWidth={2} />}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--solar-red)] transition-colors"
              title="Close panel"
            >
              <X size={15} strokeWidth={2} />
            </button>
          </div>
        </div>

        {/* Content */}
        {!isCollapsed && (
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {activeTab === 'terminal' && (
              <div className="flex flex-col flex-1 min-h-0">
                {showIamWelcomeBar && (
                  <div
                    className="shrink-0 flex flex-wrap items-center gap-1.5 px-2 py-1.5 border-b border-[var(--border-subtle)] bg-[var(--terminal-surface)]"
                    role="toolbar"
                    aria-label="IAM welcome actions"
                  >
                    <span className="text-[9px] font-bold tracking-widest text-[var(--terminal-tab-muted)] uppercase mr-1">
                      IAM
                    </span>
                    {(
                      [
                        ['1', 'Workspace', welcomeWorkspace],
                        ['2', 'Agent', welcomeOpenAgent],
                        ['3', 'Tools', welcomeTools],
                        ['4', 'Theme', welcomeTheme],
                        ['5', 'Diag', welcomeDiagnostics],
                      ] as const
                    ).map(([n, label, onClick]) => (
                      <button
                        key={n}
                        type="button"
                        onClick={onClick}
                        className="px-2 py-0.5 rounded text-[10px] font-mono border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--solar-cyan)] hover:border-[var(--solar-cyan)]/40 transition-colors"
                        title={`Same as iam-welcome.sh option ${n}`}
                      >
                        <span className="text-[var(--solar-yellow)]">{n}.</span> {label}
                      </button>
                    ))}
                  </div>
                )}
                <div
                  ref={terminalRef}
                  className="xterm-shell-viewport flex-1 min-h-0 w-full bg-[var(--terminal-surface)]"
                />
              </div>
            )}
            {activeTab === 'output' && (
              <div className="h-full overflow-y-auto custom-scrollbar px-4 py-3 font-mono text-[11px] leading-relaxed text-[var(--text-main)] bg-[var(--terminal-surface)] border-t border-[var(--border-subtle)]">
                {outputLines.map((line, i) => (
                  <div key={i} className="mb-1 border-l-2 border-transparent pl-2 hover:border-[var(--solar-cyan)]/30">
                    {line}
                  </div>
                ))}
              </div>
            )}
            {activeTab === 'problems' && (
              <div className="h-full overflow-y-auto custom-scrollbar p-4 space-y-2 bg-[var(--terminal-surface)] border-t border-[var(--border-subtle)]">
                {problems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-[var(--text-muted)] opacity-50">
                    <CircleCheck size={32} className="mb-2" />
                    <p className="text-xs">No problems found</p>
                  </div>
                ) : (
                  problems.map((p, i) => (
                    <div key={i} className="flex items-start gap-2 p-2 rounded bg-[var(--bg-panel)] border-l-2 border-[var(--solar-red)]">
                      <TriangleAlert size={14} className="text-[var(--solar-red)] mt-0.5" />
                      <div>
                        <div className="text-[11px] font-medium text-[var(--text-main)]">{p.msg}</div>
                        <div className="text-[10px] text-[var(--text-muted)]">{p.file}:{p.line}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }
);

XTermShell.displayName = 'XTermShell';

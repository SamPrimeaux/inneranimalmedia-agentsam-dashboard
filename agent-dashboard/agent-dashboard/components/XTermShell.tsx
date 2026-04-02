import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { X, ExternalLink, ChevronDown, ChevronUp, Radio, Wifi, Plus, TriangleAlert, CircleCheck } from 'lucide-react';
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
}

const MIN_HEIGHT = 140;
const MAX_HEIGHT_RATIO = 0.75;
const DEFAULT_HEIGHT = 280;

export const XTermShell = forwardRef<XTermShellHandle, XTermShellProps>(
  ({ onClose, problems = [], outputLines = [] }, ref) => {
    const terminalRef = useRef<HTMLDivElement>(null);
    const xtermRef = useRef<Terminal | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);
    const socketRef = useRef<WebSocket | null>(null);
    const [height, setHeight] = useState(DEFAULT_HEIGHT);
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [activeTab, setActiveTab] = useState<ShellTab>('terminal');
    const [status, setStatus] = useState<'connecting' | 'online' | 'offline'>('connecting');

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
              
              // Key: Fetch startup greeting if possible
              fetch('/api/agent/memory/list', { method: 'GET' })
                 .then(r => r.json())
                 .then(data => {
                    const greeting = Array.isArray(data) ? data.find(m => m.key === 'STARTUP_GREETING')?.value : null;
                    if (greeting && xtermRef.current) {
                       xtermRef.current.writeln(`\r\n\x1b[1;36m>\x1b[0m ${greeting}\r\n`);
                    } else {
                       xtermRef.current.writeln('\r\n\x1b[2m  MeauxCAD Terminal — Connected to PTY sandbox\x1b[0m\r\n');
                    }
                    if (xtermRef.current) xtermRef.current.write('\x1b[1;32m$\x1b[0m ');
                 })
                 .catch(() => {
                    if (xtermRef.current) {
                       xtermRef.current.writeln('\r\n\x1b[2m  MeauxCAD Terminal — v1.2-sandbox active\x1b[0m\r\n');
                       xtermRef.current.write('\x1b[1;32m$\x1b[0m ');
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
        const bg = styles.getPropertyValue('--scene-bg').trim() || '#060e14';
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
      const bg = styles.getPropertyValue('--scene-bg').trim() || '#060e14';
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
        fontFamily: '"JetBrains Mono", "Fira Code", Menlo, Monaco, "Courier New", monospace',
        fontSize: 13,
        lineHeight: 1.4,
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
        className={`fixed bottom-0 left-0 right-0 z-50 bg-[var(--bg-panel)] border-t border-[var(--border-main)] transition-transform duration-300 ease-in-out ${isCollapsed ? 'translate-y-[calc(100%-32px)]' : 'translate-y-0'}`}
        style={{ height: isCollapsed ? '32px' : `${height}px` }}
      >
        {/* Resize Handle */}
        {!isCollapsed && (
          <div 
            className="absolute top-0 left-0 right-0 h-1 cursor-ns-resize hover:bg-[var(--solar-cyan)] transition-colors z-50"
            onMouseDown={handleDragStart}
          />
        )}

        {/* Toolbar */}
        <div className="h-8 flex items-center justify-between px-3 bg-[var(--bg-panel)]/50 backdrop-blur-sm select-none">
          <div className="flex items-center gap-4">
            <div className="flex bg-[var(--bg-app)]/50 rounded p-0.5 overflow-hidden">
               {(['terminal', 'output', 'problems'] as ShellTab[]).map(tab => (
                 <button
                   key={tab}
                   onClick={() => setActiveTab(tab)}
                   className={`px-3 py-1 text-[11px] font-medium transition-colors rounded-sm ${activeTab === tab ? 'bg-[var(--bg-panel)] text-[var(--solar-cyan)]' : 'text-[var(--text-dim)] hover:text-[var(--text-main)]'}`}
                 >
                   {tab.toUpperCase()}
                 </button>
               ))}
            </div>
            {status === 'connecting' && <span className="text-[10px] text-[var(--solar-yellow)] flex items-center gap-1.5"><Radio size={10} className="animate-pulse" /> Connecting...</span>}
            {status === 'online' && <span className="text-[10px] text-[var(--solar-green)] flex items-center gap-1.5"><Wifi size={10} /> Online</span>}
            {status === 'offline' && <span className="text-[10px] text-[var(--solar-red)] flex items-center gap-1.5"><TriangleAlert size={10} /> Offline</span>}
          </div>

          <div className="flex items-center gap-2">
            <button 
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="p-1 hover:bg-[var(--bg-app)] rounded transition-colors"
              title={isCollapsed ? "Expand" : "Collapse"}
            >
              {isCollapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            <button 
              onClick={onClose}
              className="p-1 hover:bg-[var(--bg-app)] rounded transition-colors text-[var(--solar-red)]"
              title="Close Terminal"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Content */}
        {!isCollapsed && (
          <div className="flex-1 h-[calc(100%-32px)]">
            {activeTab === 'terminal' && (
              <div ref={terminalRef} className="h-full w-full p-2" />
            )}
            {activeTab === 'output' && (
              <div className="h-full overflow-y-auto p-4 font-mono text-xs text-[var(--text-main)] bg-[var(--bg-app)]">
                {outputLines.map((line, i) => <div key={i} className="mb-1">{line}</div>)}
              </div>
            )}
            {activeTab === 'problems' && (
              <div className="h-full overflow-y-auto p-4 space-y-2 bg-[var(--bg-app)]">
                {problems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-[var(--text-dim)] opacity-50">
                    <CircleCheck size={32} className="mb-2" />
                    <p className="text-xs">No problems found</p>
                  </div>
                ) : (
                  problems.map((p, i) => (
                    <div key={i} className="flex items-start gap-2 p-2 rounded bg-[var(--bg-panel)] border-l-2 border-[var(--solar-red)]">
                      <TriangleAlert size={14} className="text-[var(--solar-red)] mt-0.5" />
                      <div>
                        <div className="text-[11px] font-medium text-[var(--text-main)]">{p.msg}</div>
                        <div className="text-[10px] text-[var(--text-dim)]">{p.file}:{p.line}</div>
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

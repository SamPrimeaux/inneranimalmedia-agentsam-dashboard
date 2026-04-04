import React from 'react';
import { GitBranch, XCircle, AlertTriangle, Bell, Check } from 'lucide-react';
import { SHELL_VERSION } from '../src/shellVersion';

interface StatusBarProps {
    branch?: string;
    /** One line: workspace name + context (from ideWorkspace + formatWorkspaceStatusLine) */
    workspace?: string;
    errorCount?: number;
    warningCount?: number;
    line?: number;
    col?: number;
    /** When false, cursor position shows as -- (non-editor surfaces). */
    showCursor?: boolean;
    activeTab?: string;
    version?: string;
    spendCount?: string;
}

export const StatusBar: React.FC<StatusBarProps> = ({
    branch = 'main',
    workspace = 'No workspace',
    errorCount = 0,
    warningCount = 0,
    line = 1,
    col = 1,
    showCursor = false,
    activeTab = 'JavaScript',
    version = SHELL_VERSION,
    spendCount = '$0.00'
}) => {
    const cursorText = showCursor ? `Ln ${line}, Col ${col}` : 'Ln --, Col --';
    const versionDisplay =
        version && String(version).trim() !== ''
            ? String(version).startsWith('v')
                ? version
                : `v${version}`
            : '';
    const [chatModeLabel, setChatModeLabel] = React.useState<string>('');

    React.useEffect(() => {
        const onMode = (ev: Event) => {
            const d = (ev as CustomEvent<{ label?: string }>).detail;
            if (d?.label != null) setChatModeLabel(String(d.label));
        };
        window.addEventListener('iam-chat-mode', onMode as EventListener);
        return () => window.removeEventListener('iam-chat-mode', onMode as EventListener);
    }, []);
    
    // IAM Stubs: log future status endpoints
    React.useEffect(() => {
        ['/api/health', '/api/tunnel/status', '/api/agent/terminal/config-status', '/api/spend/summary'].forEach(url => {
            console.log('TODO: wire', url);
        });
    }, []);

    return (
        <div className="shrink-0 z-[100] relative w-full bg-[var(--bg-app)] border-t border-[var(--border-subtle)]/30 pb-[env(safe-area-inset-bottom,0px)]">
            <div className="h-6 flex items-center justify-between text-[11px] font-mono text-[var(--text-main)]/90 w-full">
            {/* Left Box */}
            <div className="flex items-center gap-1 sm:gap-3 h-full px-1 min-w-0">
                <div className="flex items-center gap-1 hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)] cursor-pointer px-2 transition-colors h-full bg-[var(--solar-cyan)]/15">
                    <span className="font-bold -mt-[1px] tracking-wide">IAM</span>
                </div>
                <div className="flex items-center gap-1 hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)] cursor-pointer px-2 h-full transition-colors shrink-0" title="Git branch (set in Settings when wired)">
                    <GitBranch size={12} className="opacity-70" />
                    <span>{branch}</span>
                </div>
                <div className="hidden md:flex items-center hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)] cursor-pointer px-2 h-full transition-colors opacity-90 min-w-0 max-w-[min(420px,45vw)]" title="Active workspace">
                    <span className="truncate">{workspace}</span>
                </div>
                <div className="flex items-center gap-2 hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)] cursor-pointer px-2 h-full transition-colors shrink-0">
                    <div className="flex items-center gap-1"><XCircle size={12} className="text-[var(--solar-red)]" /> {errorCount}</div>
                    <div className="flex items-center gap-1"><AlertTriangle size={12} className="text-[var(--solar-yellow)]" /> {warningCount}</div>
                </div>
            </div>

            {/* Right Box - Truncates intelligently */}
            <div className="flex items-center gap-1 sm:gap-2 h-full overflow-hidden shrink-0">
                <div className="hidden sm:flex items-center hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)] cursor-pointer px-2 h-full transition-colors" title={showCursor ? 'Cursor' : 'Open a file in the editor to track cursor'}>
                    {cursorText}
                </div>
                <div className="hidden sm:flex items-center hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)] cursor-pointer px-2 h-full transition-colors">
                    Space: 4
                </div>
                <div className="hidden md:flex items-center hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)] cursor-pointer px-2 h-full transition-colors">
                    UTF-8
                </div>
                <div className="hidden lg:flex items-center hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)] cursor-pointer px-2 h-full transition-colors">
                    LF
                </div>
                <div className="flex items-center hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)] cursor-pointer px-2 h-full transition-colors text-[var(--text-main)] font-semibold flex-shrink-0">
                    {activeTab}
                </div>
                <div className="flex items-center hover:text-[var(--solar-yellow)] hover:bg-[var(--bg-hover)] cursor-pointer px-2 h-full transition-colors font-bold text-[10px] tracking-tight">
                    {spendCount}
                </div>
                {chatModeLabel && (
                    <div
                        className="hidden min-[1000px]:flex items-center px-2 h-full text-[var(--text-muted)] font-semibold border-x border-[var(--border-subtle)]/20 max-w-[120px] truncate"
                        title={chatModeLabel}
                    >
                        {chatModeLabel}
                    </div>
                )}
                {versionDisplay && (
                    <div className="hidden min-[1100px]:flex items-center px-2 h-full bg-[var(--solar-green)]/15 text-[var(--solar-green)] font-bold border-x border-[var(--border-subtle)]/20">
                        {versionDisplay}
                    </div>
                )}
                <div className="hidden items-center gap-1 hover:text-[var(--text-main)] cursor-pointer px-1 transition-colors">

                    <div className="flex gap-1 items-center px-1 rounded-sm bg-[var(--bg-hover)]">
                        <Check size={12} className="text-[var(--solar-green)]" /> Prettier
                    </div>
                </div>
                <div className="flex items-center justify-center hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)] cursor-pointer px-3 h-full transition-colors">
                    <Bell size={13} className="opacity-70" />
                </div>
            </div>
            </div>
        </div>
    );
};

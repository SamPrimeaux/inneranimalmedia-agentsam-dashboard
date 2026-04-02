import React, { useState, useEffect } from 'react';
import { FolderOpen, Github, TerminalSquare, Box, ChevronRight, LayoutTemplate, X, Clock, Star, HardDrive, Search } from 'lucide-react';

interface WelcomeLauncherProps {
    onOpenFolder: () => void;
    /** Select a pinned / recent workspace — updates status bar; use Open Folder for real FS. */
    onWorkspacePick?: (ws: { name: string; path: string }) => void;
}

const ALL_WORKSPACES = [
  { name: 'inneranimalmedia---meaux-games---meauxcad', path: '/Volumes/Expansion', icon: <Star size={14} />, color: 'text-[var(--solar-yellow)]', tag: 'Active' },
  { name: 'samprimeaux', path: '/Users', icon: <HardDrive size={14} />, color: 'text-[var(--solar-magenta)]', tag: null },
  { name: 'cursor-efficiency-setup', path: '~/Downloads', icon: <LayoutTemplate size={14} />, color: 'text-[var(--solar-cyan)]', tag: null },
  { name: 'Downloads', path: '~', icon: <FolderOpen size={14} />, color: 'text-[var(--solar-blue)]', tag: null },
  { name: 'meaux-dashboard', path: '/Volumes/Expansion', icon: <Box size={14} />, color: 'text-[var(--solar-green)]', tag: null },
  { name: 'inneranimal-api', path: '/Volumes/Expansion', icon: <Star size={14} />, color: 'text-[var(--solar-orange)]', tag: null },
  { name: 'iam-cms', path: '/Volumes/Expansion', icon: <LayoutTemplate size={14} />, color: 'text-[var(--solar-violet)]', tag: null },
];

const PINNED_WORKSPACES = ALL_WORKSPACES.slice(0, 3);

export const WelcomeLauncher: React.FC<WelcomeLauncherProps> = ({ onOpenFolder, onWorkspacePick }) => {
    const [showPopup, setShowPopup] = useState(false);
    const [search, setSearch] = useState('');

    const filtered = ALL_WORKSPACES.filter(w =>
        w.name.toLowerCase().includes(search.toLowerCase()) ||
        w.path.toLowerCase().includes(search.toLowerCase())
    );

    useEffect(() => {
        // IAM Overview & Session Stubs
        const stubs = [
            '/api/overview/stats',
            '/api/overview/recent-activity',
            '/api/overview/deployments',
            '/api/agent/sessions',
            '/api/agentsam/skills'
        ];
        stubs.forEach(url => console.log('TODO: wire', url));
    }, []);


    return (
        <div className="w-full h-full flex items-center justify-center bg-[var(--bg-app)] text-[var(--text-main)] font-sans overflow-y-auto relative">
            <div className="flex flex-col items-center max-w-lg w-full p-8 animate-in fade-in slide-in-from-bottom-6 duration-500">
                {/* Logo & Title */}
                <div className="flex flex-col items-center mb-8 gap-3">
                    <img
                        src="https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/ac515729-af6b-4ea5-8b10-e581a4d02100/thumbnail"
                        alt="InnerAnimalMedia"
                        className="w-14 h-14 object-contain drop-shadow-xl"
                    />
                    <h1 className="text-2xl font-bold tracking-tight text-[var(--text-heading)]">InnerAnimalMedia</h1>
                </div>

                {/* Primary CTA */}
                <button
                    onClick={onOpenFolder}
                    className="w-full bg-[var(--solar-cyan)] hover:brightness-110 text-[#00212b] font-semibold py-3 px-4 rounded-lg flex items-center justify-center gap-2 mb-3 transition shadow-[0_0_20px_rgba(45,212,191,0.2)]"
                >
                    <FolderOpen size={18} />
                    Open Folder
                </button>

                {/* Secondary CTAs */}
                <div className="flex gap-3 w-full mb-10">
                    <button className="flex-1 bg-[var(--bg-panel)] hover:brightness-110 border border-[var(--border-subtle)] py-2.5 rounded-lg flex items-center justify-center gap-2 text-[13px] text-[var(--text-muted)] hover:text-[var(--text-main)] transition">
                        <TerminalSquare size={15} />
                        Agent Manager
                    </button>
                    <button className="flex-1 bg-[var(--bg-panel)] hover:brightness-110 border border-[var(--border-subtle)] py-2.5 rounded-lg flex items-center justify-center gap-2 text-[13px] text-[var(--text-muted)] hover:text-[var(--text-main)] transition">
                        <Github size={15} />
                        Clone Repository
                    </button>
                </div>

                {/* Workspaces Section */}
                <div className="w-full">
                    <span className="text-[11px] uppercase tracking-widest font-semibold text-[var(--text-muted)] mb-3 block">Workspaces</span>

                    <div className="w-full flex flex-col gap-2">
                        {PINNED_WORKSPACES.map((ws) => (
                            <div
                                key={ws.name}
                                role="button"
                                tabIndex={0}
                                onClick={() => onWorkspacePick?.({ name: ws.name, path: ws.path })}
                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onWorkspacePick?.({ name: ws.name, path: ws.path }); } }}
                                className="w-full border border-[var(--border-subtle)] hover:border-[var(--solar-cyan)]/50 hover:bg-[var(--bg-hover)] transition-all bg-[var(--bg-panel)] rounded-lg p-3 cursor-pointer group flex items-center justify-between"
                            >
                                <div className="flex items-center gap-2.5">
                                    <span className={ws.color}>{ws.icon}</span>
                                    <div className="flex flex-col">
                                        <span className="font-medium text-[13px] text-[var(--text-main)] flex items-center gap-2">
                                            {ws.name}
                                            {ws.tag && (
                                                <span className="text-[9px] uppercase tracking-widest font-bold px-1.5 py-0.5 bg-[var(--solar-cyan)]/15 text-[var(--solar-cyan)] rounded">
                                                    {ws.tag}
                                                </span>
                                            )}
                                        </span>
                                        <span className="text-[11px] text-[var(--text-muted)]">{ws.path}</span>
                                    </div>
                                </div>
                                <ChevronRight size={14} className="text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                        ))}
                    </div>

                    {/* Show More — opens popup */}
                    <button
                        onClick={() => setShowPopup(true)}
                        className="w-full text-center text-[11px] text-[var(--text-muted)] hover:text-[var(--solar-cyan)] mt-4 py-2 border border-dashed border-[var(--border-subtle)] hover:border-[var(--solar-cyan)]/50 rounded-lg tracking-wider transition-colors"
                    >
                        Show all {ALL_WORKSPACES.length} workspaces...
                    </button>
                </div>
            </div>

            {/* ── WORKSPACE POPUP MODAL ── */}
            {showPopup && (
                <div
                    className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-6 animate-in fade-in duration-200"
                    onClick={() => setShowPopup(false)}
                >
                    <div
                        className="w-full max-w-md bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 fade-in duration-200"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Modal Header */}
                        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-subtle)]">
                            <div className="flex items-center gap-2">
                                <Clock size={15} className="text-[var(--text-muted)]" />
                                <span className="text-[13px] font-semibold text-[var(--text-heading)]">All Workspaces</span>
                            </div>
                            <button
                                onClick={() => setShowPopup(false)}
                                className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors"
                            >
                                <X size={15} />
                            </button>
                        </div>

                        {/* Search */}
                        <div className="px-4 py-3 border-b border-[var(--border-subtle)]">
                            <div className="flex items-center gap-2 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded-lg px-3 py-2">
                                <Search size={13} className="text-[var(--text-muted)]" />
                                <input
                                    type="text"
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    placeholder="Filter workspaces..."
                                    autoFocus
                                    className="flex-1 bg-transparent text-[13px] focus:outline-none text-[var(--text-main)] placeholder:text-[var(--text-muted)]"
                                />
                            </div>
                        </div>

                        {/* Workspace List */}
                        <div className="max-h-80 overflow-y-auto p-2">
                            {filtered.length === 0 ? (
                                <p className="text-center text-[12px] text-[var(--text-muted)] py-8">No workspaces found</p>
                            ) : (
                                filtered.map((ws) => (
                                    <button
                                        key={ws.name}
                                        onClick={() => {
                                            onWorkspacePick?.({ name: ws.name, path: ws.path });
                                            setShowPopup(false);
                                        }}
                                        className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-[var(--bg-hover)] group transition-colors text-left"
                                    >
                                        <span className={`${ws.color} shrink-0`}>{ws.icon}</span>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[13px] font-medium text-[var(--text-main)] truncate">{ws.name}</span>
                                                {ws.tag && (
                                                    <span className="text-[9px] uppercase tracking-widest font-bold px-1.5 py-0.5 bg-[var(--solar-cyan)]/15 text-[var(--solar-cyan)] rounded shrink-0">
                                                        {ws.tag}
                                                    </span>
                                                )}
                                            </div>
                                            <span className="text-[11px] text-[var(--text-muted)] block">{ws.path}</span>
                                        </div>
                                        <ChevronRight size={13} className="text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                                    </button>
                                ))
                            )}
                        </div>

                        {/* Footer */}
                        <div className="px-4 py-3 border-t border-[var(--border-subtle)]">
                            <button
                                onClick={onOpenFolder}
                                className="w-full py-2 rounded-lg bg-[var(--solar-cyan)]/10 hover:bg-[var(--solar-cyan)]/20 border border-[var(--solar-cyan)]/30 text-[var(--solar-cyan)] text-[12px] font-semibold flex items-center justify-center gap-2 transition-colors"
                            >
                                <FolderOpen size={14} />
                                Browse File System
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

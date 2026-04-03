import React, { useState, useEffect, useCallback } from 'react';
import { Github, Folder, ExternalLink, Loader2, RefreshCw, Lock, ChevronRight, ChevronDown, File as FileIcon } from 'lucide-react';
import type { ActiveFile } from '../types';

type GhItem = {
    name: string;
    path: string;
    type: 'file' | 'dir';
    sha?: string;
    size?: number;
};

export const GitHubExplorer: React.FC<{
    onOpenInEditor?: (file: ActiveFile) => void;
}> = ({ onOpenInEditor }) => {
    const [isAuthenticated, setIsAuthenticated] = useState(true);
    const [repos, setRepos] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [expandedRepo, setExpandedRepo] = useState<string | null>(null);
    const [pathByRepo, setPathByRepo] = useState<Record<string, string>>({});
    const [itemsByRepoPath, setItemsByRepoPath] = useState<Record<string, GhItem[]>>({});
    const [loadingPath, setLoadingPath] = useState<string | null>(null);

    const fetchRepos = async () => {
        setIsLoading(true);
        try {
            const res = await fetch('/api/integrations/github/repos', { credentials: 'same-origin' });
            if (!res.ok) throw new Error('Unauthenticated');
            const data = await res.json();
            setRepos(Array.isArray(data) ? data : data.repos || []);
            setIsAuthenticated(true);
        } catch (err) {
            setIsAuthenticated(false);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchRepos();
    }, []);

    const cacheKey = (fullName: string, path: string) => `${fullName}::${path}`;

    const loadContents = useCallback(async (fullName: string, path: string) => {
        const [owner, repo] = fullName.split('/');
        if (!owner || !repo) return;
        const ck = cacheKey(fullName, path);
        setLoadingPath(ck);
        try {
            const qs = new URLSearchParams();
            if (path) qs.set('path', path);
            const res = await fetch(
                `/api/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents?${qs}`,
                { credentials: 'same-origin' },
            );
            const data = await res.json();
            if (!res.ok) {
                setItemsByRepoPath((prev) => ({ ...prev, [ck]: [] }));
                return;
            }
            const list = Array.isArray(data) ? data : [];
            const mapped: GhItem[] = list.map((it: any) => ({
                name: it.name,
                path: it.path,
                type: it.type === 'dir' ? 'dir' : 'file',
                sha: it.sha,
                size: it.size,
            }));
            mapped.sort((a, b) => {
                if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
                return a.name.localeCompare(b.name);
            });
            setItemsByRepoPath((prev) => ({ ...prev, [ck]: mapped }));
        } catch {
            setItemsByRepoPath((prev) => ({ ...prev, [ck]: [] }));
        } finally {
            setLoadingPath(null);
        }
    }, []);

    const toggleRepo = (fullName: string) => {
        if (expandedRepo === fullName) {
            setExpandedRepo(null);
            return;
        }
        setExpandedRepo(fullName);
        setPathByRepo((p) => ({ ...p, [fullName]: '' }));
        void loadContents(fullName, '');
    };

    const enterDir = (fullName: string, path: string) => {
        setPathByRepo((p) => ({ ...p, [fullName]: path }));
        void loadContents(fullName, path);
    };

    const openFile = async (fullName: string, filePath: string) => {
        if (!onOpenInEditor) return;
        const [owner, repo] = fullName.split('/');
        if (!owner || !repo) return;
        try {
            const qs = new URLSearchParams({ path: filePath });
            const res = await fetch(
                `/api/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents?${qs}`,
                { credentials: 'same-origin' },
            );
            const data = await res.json();
            if (!res.ok || data.type !== 'file' || typeof data.content !== 'string') return;
            const raw = String(data.content).replace(/\n/g, '');
            const binary = atob(raw);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            const text = new TextDecoder().decode(bytes);
            const baseName = filePath.split('/').pop() || filePath;
            onOpenInEditor({
                name: data.name || baseName,
                content: text,
                originalContent: text,
                githubPath: filePath,
                githubRepo: fullName,
                githubSha: typeof data.sha === 'string' ? data.sha : undefined,
            });
        } catch (e) {
            console.error(e);
        }
    };

    const handleConnect = () => {
        window.location.href = '/api/oauth/github/start';
    };

    if (!isAuthenticated) {
        return (
            <div className="w-full h-full bg-[var(--bg-panel)] flex flex-col items-center justify-center p-6 text-center">
                <div className="p-10 bg-[var(--text-main)]/5 rounded-full mb-6 border border-dashed border-[var(--text-main)]/20 relative">
                  <Github size={48} className="text-[var(--text-main)] opacity-80" />
                  <div className="absolute top-0 right-0 bg-[var(--bg-panel)] p-1 rounded-full border border-[var(--border-subtle)]">
                    <Lock size={12} className="text-[var(--text-muted)]" />
                  </div>
                </div>
                <h3 className="text-[14px] font-bold mb-2 uppercase tracking-widest text-[var(--text-heading)]">GitHub Integration</h3>
                <p className="text-[11px] font-mono text-[var(--text-muted)] mb-8 max-w-[200px]">
                  Connect your GitHub account to browse repositories and trigger workflows directly from MeauxCAD.
                </p>
                <button 
                  onClick={handleConnect}
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-[var(--text-main)] text-[var(--bg-panel)] hover:brightness-110 rounded text-[11px] font-bold transition-all w-full max-w-[220px]"
                >
                  <ExternalLink size={14} /> Connect GitHub
                </button>
            </div>
        );
    }

    return (
        <div className="w-full h-full bg-[var(--bg-panel)] flex flex-col text-[var(--text-main)] overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                    <Github size={14} />
                    <span className="text-[11px] font-bold tracking-widest uppercase">Repositories</span>
                </div>
                <button 
                    onClick={fetchRepos}
                    disabled={isLoading}
                    className="p-1 hover:bg-[var(--bg-hover)] rounded disabled:opacity-50" 
                    title="Refresh Repositories"
                >
                    <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
                </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-2">
                {repos.length === 0 && !isLoading && (
                    <div className="p-4 text-center">
                        <p className="text-[10px] text-[var(--text-muted)] italic">No repositories found.</p>
                    </div>
                )}
                <div className="flex flex-col gap-1">
                    {repos.map((repo) => {
                        const fullName = repo.full_name as string;
                        const open = expandedRepo === fullName;
                        const cwd = pathByRepo[fullName] ?? '';
                        const ck = cacheKey(fullName, cwd);
                        const items = itemsByRepoPath[ck] || [];
                        const loading = loadingPath === ck;
                        return (
                            <div key={repo.id} className="rounded-lg border border-[var(--border-subtle)]/40 overflow-hidden">
                                <button
                                    type="button"
                                    onClick={() => toggleRepo(fullName)}
                                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[var(--bg-hover)] text-left text-[12px]"
                                >
                                    {open ? <ChevronDown size={14} className="text-[var(--text-muted)] shrink-0" /> : <ChevronRight size={14} className="text-[var(--text-muted)] shrink-0" />}
                                    <Folder size={14} className="text-[var(--text-muted)] group-hover:text-[var(--solar-cyan)] shrink-0" />
                                    <div className="flex flex-col min-w-0 flex-1">
                                        <span className="font-bold truncate">{repo.name}</span>
                                        <span className="text-[9px] text-[var(--text-muted)] truncate">{fullName}</span>
                                    </div>
                                </button>
                                {open && (
                                    <div className="px-2 pb-2 pl-2 border-t border-[var(--border-subtle)]/30">
                                        {cwd && (
                                            <button
                                                type="button"
                                                className="text-[10px] font-mono text-[var(--solar-cyan)] mb-1 hover:underline"
                                                onClick={() => {
                                                    const parts = cwd.split('/');
                                                    parts.pop();
                                                    enterDir(fullName, parts.join('/'));
                                                }}
                                            >
                                                .. up
                                            </button>
                                        )}
                                        {cwd && (
                                            <div className="text-[9px] font-mono text-[var(--text-muted)] truncate mb-1">{cwd}</div>
                                        )}
                                        {loading && (
                                            <div className="flex items-center gap-2 py-2 text-[10px] text-[var(--text-muted)]">
                                                <Loader2 size={12} className="animate-spin" /> Loading…
                                            </div>
                                        )}
                                        {!loading && items.map((it) => (
                                            <button
                                                key={it.path}
                                                type="button"
                                                onClick={() => {
                                                    if (it.type === 'dir') enterDir(fullName, it.path);
                                                    else void openFile(fullName, it.path);
                                                }}
                                                className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-[var(--bg-hover)] rounded text-left text-[11px]"
                                            >
                                                {it.type === 'dir' ? (
                                                    <Folder size={12} className="text-[var(--solar-cyan)] shrink-0" />
                                                ) : (
                                                    <FileIcon size={12} className="text-[var(--text-muted)] shrink-0" />
                                                )}
                                                <span className="truncate">{it.name}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

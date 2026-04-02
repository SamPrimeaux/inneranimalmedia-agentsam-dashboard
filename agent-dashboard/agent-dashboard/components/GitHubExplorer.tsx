import React, { useState, useEffect } from 'react';
import { Github, Folder, ExternalLink, Loader2, RefreshCw, Lock } from 'lucide-react';

export const GitHubExplorer: React.FC = () => {
    const [isAuthenticated, setIsAuthenticated] = useState(true);
    const [repos, setRepos] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    const fetchRepos = async () => {
        setIsLoading(true);
        try {
            const res = await fetch('/api/integrations/github/repos');
            if (!res.ok) throw new Error('Unauthenticated');
            const data = await res.json();
            setRepos(Array.isArray(data) ? data : (data.repos || []));
            setIsAuthenticated(true);
        } catch (err) {
            setIsAuthenticated(false);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchRepos();
        
        // IAM GitHub Stubs
        const stubs = [
            '/api/integrations/github/list',
            '/api/integrations/github/files',
            '/api/integrations/github/file',
            '/api/oauth/github/callback'
        ];
        stubs.forEach(url => console.log('TODO: wire', url));
    }, []);


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
                    {repos.map(repo => (
                        <div 
                            key={repo.id}
                            className="flex items-center gap-2 px-3 py-2 hover:bg-[var(--bg-hover)] cursor-pointer rounded-lg group transition-all"
                        >
                            <Folder size={14} className="text-[var(--text-muted)] group-hover:text-[var(--solar-cyan)]" />
                            <div className="flex flex-col min-w-0">
                                <span className="text-[12px] font-bold truncate">{repo.name}</span>
                                <span className="text-[9px] text-[var(--text-muted)] truncate">{repo.full_name}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

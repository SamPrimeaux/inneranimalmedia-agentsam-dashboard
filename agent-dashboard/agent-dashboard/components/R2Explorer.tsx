import React, { useState, useEffect } from 'react';
import { Database, File, Loader2, RefreshCw, ChevronRight, HardDrive } from 'lucide-react';

export const R2Explorer: React.FC = () => {
    const [objects, setObjects] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    const fetchObjects = async () => {
        setIsLoading(true);
        try {
            const res = await fetch('/api/r2/list');
            const data = await res.json();
            setObjects(data.objects || []);
        } catch (err) {
            console.error("R2 List failed:", err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchObjects();
        
        // IAM R2 Stubs
        const stubs = [
            '/api/r2/search',
            '/api/r2/stats',
            '/api/r2/url',
            '/api/r2/upload',
            '/api/r2/delete',
            '/api/r2/sync',
            '/api/r2/buckets',
            '/api/r2/buckets/bulk-action'
        ];
        stubs.forEach(url => console.log('TODO: wire', url));
    }, []);


    return (
        <div className="w-full h-full bg-[var(--bg-panel)] flex flex-col text-[var(--text-main)] overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                    <Database size={14} className="text-[var(--solar-orange)]" />
                    <span className="text-[11px] font-bold tracking-widest uppercase">R2 Storage</span>
                </div>
                <button 
                    onClick={fetchObjects} 
                    disabled={isLoading}
                    className="p-1 hover:bg-[var(--bg-hover)] rounded disabled:opacity-50" 
                    title="Refresh R2"
                >
                    <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
                </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-2">
                {isLoading && (
                    <div className="flex flex-col items-center justify-center p-8 opacity-50">
                        <Loader2 size={24} className="animate-spin mb-2" />
                        <span className="text-[10px] font-mono">Querying S3/R2...</span>
                    </div>
                )}
                {!isLoading && objects.length === 0 && (
                    <div className="p-4 text-center">
                        <p className="text-[10px] text-[var(--text-muted)] italic">No objects found in bucket.</p>
                    </div>
                )}
                <div className="flex flex-col gap-0.5">
                    {objects.map(obj => (
                        <div 
                            key={obj.key}
                            className="flex items-center gap-2 px-2 py-1.5 hover:bg-[var(--bg-hover)] cursor-pointer rounded transition-all group"
                        >
                            <File size={13} className="text-[var(--text-muted)] group-hover:text-[var(--solar-orange)]" />
                            <div className="flex flex-col min-w-0">
                                <span className="text-[11px] font-medium truncate">{obj.key}</span>
                                <span className="text-[8px] text-[var(--text-muted)]">{(obj.size / 1024).toFixed(1)} KB</span>
                            </div>
                            <ChevronRight size={10} className="ml-auto opacity-0 group-hover:opacity-40" />
                        </div>
                    ))}
                </div>
            </div>
            
            <div className="p-3 border-t border-[var(--border-subtle)] bg-[var(--bg-app)] shrink-0 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <HardDrive size={12} className="text-[var(--text-muted)]" />
                    <span className="text-[9px] font-bold uppercase tracking-widest opacity-60">Connected Bucket</span>
                </div>
                <span className="text-[9px] font-mono bg-orange-500/10 text-orange-500 px-1 rounded">DEFAULT</span>
            </div>
        </div>
    );
};

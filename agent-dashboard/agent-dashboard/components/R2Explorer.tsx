import React, { useState, useEffect, useCallback } from 'react';
import { Database, File, Loader2, RefreshCw, ChevronRight, HardDrive, Trash2, Link2, Upload, ArrowRightLeft, FileCode2 } from 'lucide-react';
import type { ActiveFile } from '../types';

/** Map bucket list label (from /api/r2/buckets) to /api/r2/file binding allowlist name */
function bucketLabelToBinding(label: string): string {
    const b = label.trim().toLowerCase();
    if (b === 'agent-sam' || b === 'tools') return 'DASHBOARD';
    if (b === 'agent-sam-sandbox-cicd' || b === 'inneranimalmedia-assets') return 'ASSETS';
    if (b === 'iam-platform') return 'R2';
    if (b === 'iam-docs') return 'DOCS_BUCKET';
    if (b === 'autorag') return 'AUTORAG_BUCKET';
    return 'DASHBOARD';
}

type R2ObjectRow = {
    key: string;
    size?: number;
    last_modified?: string | null;
    lastModified?: string | null;
};

export const R2Explorer: React.FC<{
    onOpenInEditor?: (file: ActiveFile) => void;
}> = ({ onOpenInEditor }) => {
    const [buckets, setBuckets] = useState<string[]>([]);
    const [bucket, setBucket] = useState<string>('');
    const [prefix, setPrefix] = useState('');
    const [searchQ, setSearchQ] = useState('');
    const [objects, setObjects] = useState<R2ObjectRow[]>([]);
    const [searchObjects, setSearchObjects] = useState<R2ObjectRow[]>([]);
    const [stats, setStats] = useState<{ object_count: number; total_bytes: number } | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [syncSource, setSyncSource] = useState('');
    const [syncDest, setSyncDest] = useState('');
    const [syncPrefix, setSyncPrefix] = useState('');
    const [syncMsg, setSyncMsg] = useState<string | null>(null);
    const [searchActive, setSearchActive] = useState(false);

    const loadBuckets = useCallback(async () => {
        try {
            const res = await fetch('/api/r2/buckets', { credentials: 'same-origin' });
            const data = await res.json();
            const list = Array.isArray(data.buckets) ? data.buckets : [];
            setBuckets(list);
        } catch (err) {
            console.error('R2 buckets failed:', err);
            setBuckets([]);
        }
    }, []);

    const fetchObjects = useCallback(async () => {
        if (!bucket) return;
        setSearchActive(false);
        setIsLoading(true);
        try {
            const qs = new URLSearchParams({ bucket, prefix });
            const res = await fetch(`/api/r2/list?${qs}`, { credentials: 'same-origin' });
            const data = await res.json();
            setObjects(Array.isArray(data.objects) ? data.objects : []);
        } catch (err) {
            console.error('R2 list failed:', err);
            setObjects([]);
        } finally {
            setIsLoading(false);
        }
    }, [bucket, prefix]);

    const fetchStats = useCallback(async () => {
        if (!bucket) {
            setStats(null);
            return;
        }
        try {
            const res = await fetch(`/api/r2/stats?bucket=${encodeURIComponent(bucket)}`, { credentials: 'same-origin' });
            const data = await res.json();
            if (res.ok && typeof data.object_count === 'number') {
                setStats({ object_count: data.object_count, total_bytes: data.total_bytes ?? 0 });
            } else {
                setStats(null);
            }
        } catch {
            setStats(null);
        }
    }, [bucket]);

    const runSearch = useCallback(async () => {
        if (!bucket) return;
        const q = searchQ.trim();
        const p = prefix.trim();
        if (q.length > 0 && q.length < 2 && p.length === 0) {
            setSearchObjects([]);
            return;
        }
        if (q.length === 0 && p.length === 0) {
            setSearchObjects([]);
            return;
        }
        setIsLoading(true);
        try {
            const qs = new URLSearchParams({ bucket });
            if (p) qs.set('prefix', p);
            if (q.length >= 2) qs.set('q', q);
            const res = await fetch(`/api/r2/search?${qs}`, { credentials: 'same-origin' });
            const data = await res.json();
            const rows = Array.isArray(data.objects) ? data.objects : Array.isArray(data) ? data : [];
            setSearchObjects(rows);
            setSearchActive(true);
        } catch (err) {
            console.error('R2 search failed:', err);
            setSearchObjects([]);
        } finally {
            setIsLoading(false);
        }
    }, [bucket, searchQ, prefix]);

    useEffect(() => {
        loadBuckets();
    }, [loadBuckets]);

    useEffect(() => {
        if (buckets.length && !bucket) setBucket(buckets[0]);
    }, [buckets, bucket]);

    useEffect(() => {
        if (bucket) {
            fetchObjects();
            fetchStats();
        }
    }, [bucket, prefix, fetchObjects, fetchStats]);

    const formatBytes = (n: number) => {
        if (!Number.isFinite(n) || n < 0) return '0 B';
        if (n < 1024) return `${n} B`;
        if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
        return `${(n / 1048576).toFixed(2)} MB`;
    };

    const copyObjectUrl = async (key: string) => {
        try {
            const qs = new URLSearchParams({ bucket, key });
            const res = await fetch(`/api/r2/url?${qs}`, { credentials: 'same-origin' });
            const data = await res.json();
            const u = data.presigned_s3_url || data.url || data.public_url;
            if (u) await navigator.clipboard.writeText(u);
        } catch (e) {
            console.error(e);
        }
    };

    const deleteObject = async (key: string) => {
        if (!confirm(`Delete ${key}?`)) return;
        try {
            const res = await fetch('/api/r2/delete', {
                method: 'DELETE',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bucket, key }),
            });
            if (res.ok) {
                await fetchObjects();
                await fetchStats();
            }
        } catch (e) {
            console.error(e);
        }
    };

    const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !bucket) return;
        const key = prefix ? `${prefix.replace(/\/$/, '')}/${file.name}` : file.name;
        const fd = new FormData();
        fd.set('bucket', bucket);
        fd.set('key', key);
        fd.set('file', file);
        setIsLoading(true);
        try {
            const res = await fetch('/api/r2/upload', { method: 'POST', credentials: 'same-origin', body: fd });
            if (res.ok) {
                await fetchObjects();
                await fetchStats();
            }
        } catch (err) {
            console.error('Upload failed:', err);
        } finally {
            setIsLoading(false);
            e.target.value = '';
        }
    };

    const runSync = async () => {
        if (!syncSource || !syncDest) {
            setSyncMsg('Set source and dest buckets');
            return;
        }
        setSyncMsg(null);
        setIsLoading(true);
        try {
            const res = await fetch('/api/r2/sync', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    source_bucket: syncSource,
                    dest_bucket: syncDest,
                    prefix: syncPrefix,
                }),
            });
            const data = await res.json();
            if (res.ok && data.ok) {
                setSyncMsg(`Copied ${data.copied} objects (${formatBytes(data.bytes || 0)})`);
                if (bucket === syncDest || bucket === syncSource) {
                    await fetchObjects();
                    await fetchStats();
                }
            } else {
                setSyncMsg(data.error || res.statusText || 'Sync failed');
            }
        } catch (e) {
            setSyncMsg(String(e));
        } finally {
            setIsLoading(false);
        }
    };

    const displayRows = searchActive ? searchObjects : objects;

    const openInEditor = async (key: string) => {
        if (!onOpenInEditor || !bucket) return;
        const binding = bucketLabelToBinding(bucket);
        setIsLoading(true);
        try {
            const qs = new URLSearchParams({ bucket: binding, key });
            const res = await fetch(`/api/r2/file?${qs}`, { credentials: 'same-origin' });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || typeof data.content !== 'string') return;
            const base = key.split('/').pop() || key;
            onOpenInEditor({
                name: base,
                content: data.content,
                originalContent: data.content,
                r2Key: key,
                r2Bucket: binding,
            });
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="w-full h-full bg-[var(--bg-panel)] flex flex-col text-[var(--text-main)] overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex flex-col gap-2 shrink-0">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Database size={14} className="text-[var(--solar-orange)]" />
                        <span className="text-[11px] font-bold tracking-widest uppercase">R2 Storage</span>
                    </div>
                    <button
                        type="button"
                        onClick={() => {
                            loadBuckets();
                            fetchObjects();
                            fetchStats();
                        }}
                        disabled={isLoading}
                        className="p-1 hover:bg-[var(--bg-hover)] rounded disabled:opacity-50"
                        title="Refresh"
                    >
                        <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
                    </button>
                </div>
                <div className="flex flex-wrap gap-2 items-center text-[10px]">
                    <label className="flex items-center gap-1">
                        <span className="text-[var(--text-muted)] uppercase">Bucket</span>
                        <select
                            value={bucket}
                            onChange={(e) => setBucket(e.target.value)}
                            className="bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded px-1 py-0.5 max-w-[180px]"
                        >
                            {buckets.length === 0 && <option value="">—</option>}
                            {buckets.map((b) => (
                                <option key={b} value={b}>
                                    {b}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="flex items-center gap-1 flex-1 min-w-[120px]">
                        <span className="text-[var(--text-muted)] uppercase">Prefix</span>
                        <input
                            value={prefix}
                            onChange={(e) => setPrefix(e.target.value)}
                            placeholder="path/"
                            className="flex-1 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded px-1 py-0.5 font-mono"
                        />
                    </label>
                </div>
                <div className="flex flex-wrap gap-2 items-center text-[10px]">
                    <label className="flex items-center gap-1 flex-1 min-w-[140px]">
                        <span className="text-[var(--text-muted)] uppercase">Search</span>
                        <input
                            value={searchQ}
                            onChange={(e) => setSearchQ(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && runSearch()}
                            placeholder="min 2 chars (key substring)"
                            className="flex-1 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded px-1 py-0.5 font-mono"
                        />
                    </label>
                    <button
                        type="button"
                        onClick={runSearch}
                        disabled={isLoading || !bucket}
                        className="px-2 py-0.5 rounded bg-[var(--bg-hover)] border border-[var(--border-subtle)] uppercase"
                    >
                        Find
                    </button>
                    <label className="flex items-center gap-1 cursor-pointer px-2 py-0.5 rounded bg-[var(--bg-hover)] border border-[var(--border-subtle)] uppercase">
                        <Upload size={10} />
                        Upload
                        <input type="file" className="hidden" onChange={onUpload} disabled={!bucket || isLoading} />
                    </label>
                </div>
                {stats && (
                    <div className="text-[9px] font-mono text-[var(--text-muted)]">
                        Objects: {stats.object_count} · Size: {formatBytes(stats.total_bytes)}
                    </div>
                )}
            </div>

            <div className="flex-1 overflow-y-auto p-2">
                {isLoading && (
                    <div className="flex flex-col items-center justify-center p-8 opacity-50">
                        <Loader2 size={24} className="animate-spin mb-2" />
                        <span className="text-[10px] font-mono">Loading R2…</span>
                    </div>
                )}
                {!isLoading && displayRows.length === 0 && (
                    <div className="p-4 text-center">
                        <p className="text-[10px] text-[var(--text-muted)] italic">No objects in this view.</p>
                    </div>
                )}
                <div className="flex flex-col gap-0.5">
                    {!isLoading &&
                        displayRows.map((obj) => (
                            <div
                                key={obj.key}
                                role={onOpenInEditor ? 'button' : undefined}
                                tabIndex={onOpenInEditor ? 0 : undefined}
                                onClick={() => {
                                    if (onOpenInEditor) void openInEditor(obj.key);
                                }}
                                onKeyDown={(e) => {
                                    if (!onOpenInEditor) return;
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        void openInEditor(obj.key);
                                    }
                                }}
                                className={`flex items-center gap-2 px-2 py-1.5 hover:bg-[var(--bg-hover)] rounded transition-all group ${
                                    onOpenInEditor ? 'cursor-pointer' : ''
                                }`}
                            >
                                <File size={13} className="text-[var(--text-muted)] group-hover:text-[var(--solar-orange)] shrink-0" />
                                <div className="flex flex-col min-w-0 flex-1">
                                    <span className="text-[11px] font-medium truncate font-mono">{obj.key}</span>
                                    <span className="text-[8px] text-[var(--text-muted)]">
                                        {formatBytes(Number(obj.size) || 0)}
                                    </span>
                                </div>
                                <button
                                    type="button"
                                    title="Copy URL"
                                    className="p-1 opacity-60 hover:opacity-100"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        copyObjectUrl(obj.key);
                                    }}
                                >
                                    <Link2 size={12} />
                                </button>
                                {onOpenInEditor && (
                                    <button
                                        type="button"
                                        title="Open in editor"
                                        className="p-1 opacity-70 hover:opacity-100 text-[var(--solar-cyan)]"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            void openInEditor(obj.key);
                                        }}
                                    >
                                        <FileCode2 size={12} />
                                    </button>
                                )}
                                <button
                                    type="button"
                                    title="Delete"
                                    className="p-1 opacity-60 hover:opacity-100 text-[var(--text-muted)]"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        deleteObject(obj.key);
                                    }}
                                >
                                    <Trash2 size={12} />
                                </button>
                                <ChevronRight size={10} className="opacity-0 group-hover:opacity-40 shrink-0" />
                            </div>
                        ))}
                </div>
            </div>

            <div className="p-3 border-t border-[var(--border-subtle)] bg-[var(--bg-app)] shrink-0 flex flex-col gap-2">
                <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
                    <ArrowRightLeft size={12} />
                    Cross-bucket sync
                </div>
                <div className="flex flex-wrap gap-2 text-[10px] items-center">
                    <input
                        value={syncSource}
                        onChange={(e) => setSyncSource(e.target.value)}
                        placeholder="source bucket"
                        className="flex-1 min-w-[100px] bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded px-1 py-0.5 font-mono"
                    />
                    <span className="text-[var(--text-muted)]">to</span>
                    <input
                        value={syncDest}
                        onChange={(e) => setSyncDest(e.target.value)}
                        placeholder="dest bucket"
                        className="flex-1 min-w-[100px] bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded px-1 py-0.5 font-mono"
                    />
                    <input
                        value={syncPrefix}
                        onChange={(e) => setSyncPrefix(e.target.value)}
                        placeholder="prefix"
                        className="w-24 bg-[var(--bg-panel)] border border-[var(--border-subtle)] rounded px-1 py-0.5 font-mono"
                    />
                    <button
                        type="button"
                        onClick={runSync}
                        disabled={isLoading}
                        className="px-2 py-0.5 rounded bg-[var(--bg-hover)] border border-[var(--border-subtle)] uppercase"
                    >
                        Run
                    </button>
                </div>
                {syncMsg && <p className="text-[9px] font-mono text-[var(--text-muted)]">{syncMsg}</p>}
                <div className="flex items-center gap-2">
                    <HardDrive size={12} className="text-[var(--text-muted)]" />
                    <span className="text-[9px] font-mono text-[var(--text-muted)] truncate">{bucket || '—'}</span>
                </div>
            </div>
        </div>
    );
};

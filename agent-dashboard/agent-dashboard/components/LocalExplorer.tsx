import React, { useState, useEffect, useCallback } from 'react';
import { FolderOpen, File as FileIcon, ChevronRight, ChevronDown, Folder, HardDrive, Cloud, Github, Box, FileCode2, Loader2 } from 'lucide-react';
import type { ActiveFile } from '../types';

function bucketLabelToBinding(label: string): string {
    const b = label.trim().toLowerCase();
    if (b === 'agent-sam' || b === 'tools') return 'DASHBOARD';
    if (b === 'agent-sam-sandbox-cicd' || b === 'inneranimalmedia-assets') return 'ASSETS';
    if (b === 'iam-platform') return 'R2';
    if (b === 'iam-docs') return 'DOCS_BUCKET';
    if (b === 'autorag') return 'AUTORAG_BUCKET';
    return 'DASHBOARD';
}

interface FileNode {
    name: string;
    kind: 'file' | 'directory';
    handle: any; // FileSystemHandle
    children?: FileNode[];
    isOpen?: boolean;
}

export const LocalExplorer: React.FC<{
    onFileSelect: (fileData: { name: string; content: string; handle: any }) => void;
    /** Fires when user connects a native folder — drives status bar + persisted workspace. */
    onWorkspaceRootChange?: (info: { folderName: string }) => void;
    /** Open R2 object in Monaco (same as R2 panel). */
    onOpenInEditor?: (file: ActiveFile) => void;
}> = ({ onFileSelect, onWorkspaceRootChange, onOpenInEditor }) => {
    const [rootDir, setRootDir] = useState<FileNode | null>(null);
    const [expandedSections, setExpandedSections] = useState({
        local: true,
        r2: true,
        github: false,
        drive: false
    });

    const [r2Buckets, setR2Buckets] = useState<string[]>([]);
    const [r2ExpandedBucket, setR2ExpandedBucket] = useState<string | null>(null);
    const [r2ObjectsByBucket, setR2ObjectsByBucket] = useState<Record<string, { key: string; size?: number }[]>>({});
    const [r2Loading, setR2Loading] = useState(false);

    const loadR2Buckets = useCallback(async () => {
        try {
            const res = await fetch('/api/r2/buckets', { credentials: 'same-origin' });
            const data = await res.json();
            setR2Buckets(Array.isArray(data.buckets) ? data.buckets : []);
        } catch {
            setR2Buckets([]);
        }
    }, []);

    useEffect(() => {
        loadR2Buckets();
    }, [loadR2Buckets]);

    const loadR2List = async (bucket: string) => {
        setR2Loading(true);
        try {
            const qs = new URLSearchParams({ bucket, prefix: '' });
            const res = await fetch(`/api/r2/list?${qs}`, { credentials: 'same-origin' });
            const data = await res.json();
            const rows = Array.isArray(data.objects) ? data.objects : [];
            setR2ObjectsByBucket((prev) => ({ ...prev, [bucket]: rows }));
        } catch {
            setR2ObjectsByBucket((prev) => ({ ...prev, [bucket]: [] }));
        } finally {
            setR2Loading(false);
        }
    };

    const openR2Key = async (bucket: string, key: string) => {
        if (!onOpenInEditor) return;
        const binding = bucketLabelToBinding(bucket);
        setR2Loading(true);
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
            setR2Loading(false);
        }
    };

    const toggleSection = (section: keyof typeof expandedSections) => {
        setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
    };

    const handleOpenFolder = async () => {
        try {
            // @ts-ignore - TS doesn't fully document the newer FileSystem Access API
            const dirHandle = await window.showDirectoryPicker();
            
            // Build root node
            const root: FileNode = {
                name: dirHandle.name,
                kind: 'directory',
                handle: dirHandle,
                isOpen: true,
                children: await getEntries(dirHandle)
            };
            setRootDir(root);
            onWorkspaceRootChange?.({ folderName: root.name });
        } catch (err) {
            console.error('Failed to open directory:', err);
        }
    };

    const getEntries = async (dirHandle: any): Promise<FileNode[]> => {
        const entries: FileNode[] = [];
        for await (const entry of dirHandle.values()) {
            // Skip massive node_modules to avoid freezing
            if (entry.name === 'node_modules' || entry.name === '.git') continue;
            entries.push({
                name: entry.name,
                kind: entry.kind,
                handle: entry,
                isOpen: false
            });
        }
        return entries.sort((a, b) => {
            if (a.kind === b.kind) return a.name.localeCompare(b.name);
            return a.kind === 'directory' ? -1 : 1;
        });
    };

    const toggleDir = async (node: FileNode, pathKey: string) => {
        if (node.kind === 'file') {
            const file = await node.handle.getFile();
            const content = await file.text();
            onFileSelect({ name: node.name, content, handle: node.handle });
            return;
        }

        // Toggle directory open/close
        const clonedRoot = { ...rootDir! };
        const target = findNode(clonedRoot, node);
        if (target) {
            target.isOpen = !target.isOpen;
            if (target.isOpen && !target.children) {
                target.children = await getEntries(target.handle);
            }
            setRootDir(clonedRoot);
        }
    };

    const findNode = (current: FileNode, target: FileNode): FileNode | null => {
        if (current === target) return current;
        if (current.children) {
            for (let child of current.children) {
                const found = findNode(child, target);
                if (found) return found;
            }
        }
        return null;
    };

    const renderTree = (node: FileNode, depth: number = 0) => {
        return (
            <div key={node.name} className="flex flex-col">
                <div 
                    onClick={() => toggleDir(node, String(depth))}
                    style={{ paddingLeft: `${depth * 10}px` }}
                    className="flex items-center gap-1.5 px-2 py-1 hover:bg-[var(--bg-hover)] cursor-pointer text-[13px] text-[var(--text-main)] group whitespace-nowrap overflow-hidden text-ellipsis"
                >
                    {node.kind === 'directory' ? (
                        <>
                            {node.isOpen ? <ChevronDown size={14} className="text-[var(--text-muted)] opacity-50"/> : <ChevronRight size={14} className="text-[var(--text-muted)] opacity-50"/>}
                            <Folder size={14} className="text-[var(--solar-blue)]" />
                        </>
                    ) : (
                        <>
                            <div className="w-3.5" />
                            <FileIcon size={14} className="text-[var(--text-muted)]" />
                        </>
                    )}
                    <span className="truncate">{node.name}</span>
                </div>
                {node.isOpen && node.children && (
                    <div className="flex flex-col border-l border-[var(--border-subtle)] ml-3">
                        {node.children.map(child => renderTree(child, depth + 1))}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="flex flex-col h-full bg-[var(--bg-panel)] overflow-hidden text-[var(--text-main)] overflow-y-auto align-top">
            <div className="flex items-center justify-between px-4 py-3 shrink-0">
                <span className="text-[11px] font-semibold tracking-widest uppercase text-[var(--text-muted)]">Explorer</span>
            </div>

            {/* Section 1: Local Workspace */}
            <div className="flex flex-col border-b border-[var(--border-subtle)]/50 pb-1 pt-1">
                <div 
                    onClick={() => toggleSection('local')}
                    className="flex items-center gap-2 px-4 py-2 hover:bg-[var(--bg-hover)] cursor-pointer group"
                >
                    {expandedSections.local ? <ChevronDown size={14} className="text-[var(--text-muted)] group-hover:text-white" /> : <ChevronRight size={14} className="text-[var(--text-muted)] group-hover:text-white" />}
                    <HardDrive size={14} className="text-[var(--solar-cyan)] group-hover:text-white" />
                    <span className="text-[11px] font-bold tracking-wide uppercase text-[var(--text-muted)] group-hover:text-white transition-colors">Local Workspace</span>
                </div>
                {expandedSections.local && (
                    <div className="px-2 pb-2">
                        {!rootDir ? (
                            <div className="py-2 flex flex-col items-center justify-center">
                                <button onClick={handleOpenFolder} className="text-[11px] text-[var(--solar-blue)] hover:text-white hover:underline transition-all font-mono tracking-wide py-1 px-3 border border-[var(--solar-blue)]/30 rounded">Connect Native Folder</button>
                            </div>
                        ) : (
                            <div className="font-mono mt-1">{renderTree(rootDir)}</div>
                        )}
                    </div>
                )}
            </div>

            {/* Section 2: Cloudflare R2 */}
            <div className="flex flex-col border-b border-[var(--border-subtle)]/50 pb-1">
                <div 
                    onClick={() => toggleSection('r2')}
                    className="flex items-center gap-2 px-4 py-2 hover:bg-[var(--bg-hover)] cursor-pointer group"
                >
                    {expandedSections.r2 ? <ChevronDown size={14} className="text-[var(--text-muted)] group-hover:text-white" /> : <ChevronRight size={14} className="text-[var(--text-muted)] group-hover:text-white" />}
                    <Cloud size={14} className="text-[#f38020] group-hover:text-white" />
                    <span className="text-[11px] font-bold tracking-wide uppercase text-[var(--text-muted)] group-hover:text-white transition-colors">Cloudflare R2</span>
                </div>
                {expandedSections.r2 && (
                    <div className="px-4 py-2 text-[11px] text-[var(--text-muted)] flex flex-col gap-1 font-mono">
                        {r2Buckets.length === 0 && !r2Loading && (
                            <span className="text-[10px] italic">No buckets listed.</span>
                        )}
                        {r2Buckets.map((b) => {
                            const open = r2ExpandedBucket === b;
                            const objs = r2ObjectsByBucket[b] || [];
                            return (
                                <div key={b} className="border border-[var(--border-subtle)]/40 rounded overflow-hidden">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (open) {
                                                setR2ExpandedBucket(null);
                                            } else {
                                                setR2ExpandedBucket(b);
                                                void loadR2List(b);
                                            }
                                        }}
                                        className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-[var(--bg-hover)] text-left text-[12px]"
                                    >
                                        {open ? <ChevronDown size={14} className="shrink-0 opacity-60" /> : <ChevronRight size={14} className="shrink-0 opacity-60" />}
                                        <Box size={13} className="text-[var(--solar-blue)] shrink-0" />
                                        <span className="truncate">{b}</span>
                                    </button>
                                    {open && (
                                        <div className="px-2 pb-2">
                                            {r2Loading && r2ExpandedBucket === b && (
                                                <div className="flex items-center gap-1 py-1 text-[10px]">
                                                    <Loader2 size={10} className="animate-spin" /> Loading…
                                                </div>
                                            )}
                                            {objs.map((o) => (
                                                <div
                                                    key={o.key}
                                                    className="flex items-center gap-1 pl-2 py-0.5 hover:bg-[var(--bg-hover)] rounded group"
                                                >
                                                    <FileIcon size={12} className="text-[var(--text-muted)] shrink-0" />
                                                    <span className="truncate flex-1 text-[10px]">{o.key}</span>
                                                    {onOpenInEditor && (
                                                        <button
                                                            type="button"
                                                            title="Open"
                                                            className="p-0.5 opacity-0 group-hover:opacity-100 text-[var(--solar-cyan)]"
                                                            onClick={() => openR2Key(b, o.key)}
                                                        >
                                                            <FileCode2 size={11} />
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Section 3: GitHub Repositories */}
            <div className="flex flex-col border-b border-[var(--border-subtle)]/50 pb-1">
                <div 
                    onClick={() => toggleSection('github')}
                    className="flex items-center gap-2 px-4 py-2 hover:bg-[var(--bg-hover)] cursor-pointer group"
                >
                    {expandedSections.github ? <ChevronDown size={14} className="text-[var(--text-muted)] group-hover:text-white" /> : <ChevronRight size={14} className="text-[var(--text-muted)] group-hover:text-white" />}
                    <Github size={14} className="text-[var(--solar-magenta)] group-hover:text-white" />
                    <span className="text-[11px] font-bold tracking-wide uppercase text-[var(--text-muted)] group-hover:text-white transition-colors">GitHub Sync</span>
                </div>
                {expandedSections.github && (
                    <div className="px-8 py-3 text-[11px] text-[var(--text-muted)] font-mono">
                        No active repository linked.
                    </div>
                )}
            </div>

            {/* Section 4: Google Drive */}
            <div className="flex flex-col border-b border-[var(--border-subtle)]/50 pb-1 mb-8">
                <div 
                    onClick={() => toggleSection('drive')}
                    className="flex items-center gap-2 px-4 py-2 hover:bg-[var(--bg-hover)] cursor-pointer group"
                >
                    {expandedSections.drive ? <ChevronDown size={14} className="text-[var(--text-muted)] group-hover:text-white" /> : <ChevronRight size={14} className="text-[var(--text-muted)] group-hover:text-white" />}
                    <FolderOpen size={14} className="text-[var(--solar-green)] group-hover:text-white" />
                    <span className="text-[11px] font-bold tracking-wide uppercase text-[var(--text-muted)] group-hover:text-white transition-colors">Google Drive</span>
                </div>
                {expandedSections.drive && (
                    <div className="px-10 py-3 text-[11px] text-[var(--text-muted)] flex flex-col font-mono">
                        <span className="mb-2">OAuth Missing.</span>
                        <a href="#" className="text-[var(--solar-blue)] hover:text-white hover:underline">Authenticate Workspace</a>
                    </div>
                )}
            </div>
        </div>
    );
};
